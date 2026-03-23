/**
 * QA Dashboard server - charts, trends, flaky detection
 * Run: node dashboard-server.js  (or npm run dashboard)
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const path = require('path');
const fs = require('fs');
const { spawn, spawnSync } = require('child_process');
const kill = require('tree-kill');

const app = express();
const RUNS_FILE = path.join(__dirname, 'dashboard', 'data', 'runs.json');
const EXECUTE_RESULTS_FILE = path.join(__dirname, 'dashboard', 'data', 'execute-results.json');
const SCREENSHOTS_DIR = path.join(__dirname, 'reports', 'screenshots');
const VIDEOS_DIR = path.join(__dirname, 'reports', 'videos');
const SAUCE_SCENARIO_URLS_FILE = path.join(__dirname, 'reports', 'sauce-scenario-urls.jsonl');
const { findVideoForScenarioName } = require('./scripts/testRunVideo');

function clearSauceScenarioUrlsFile() {
  try {
    if (fs.existsSync(SAUCE_SCENARIO_URLS_FILE)) fs.unlinkSync(SAUCE_SCENARIO_URLS_FILE);
  } catch (_) {}
}

/** @returns {Map<string, string>} key: `${suite}:${KEY}` → job URL (suite lowercased for lookup) */
function loadSauceScenarioUrlMap() {
  const map = new Map();
  if (!fs.existsSync(SAUCE_SCENARIO_URLS_FILE)) return map;
  try {
    for (const line of fs.readFileSync(SAUCE_SCENARIO_URLS_FILE, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t) continue;
      try {
        const o = JSON.parse(t);
        if (o.key && o.url) {
          const keyU = String(o.key).toUpperCase();
          const suiteL = String(o.suite || '').toLowerCase();
          map.set(`${suiteL}:${keyU}`, o.url);
          map.set(`:${keyU}`, o.url);
        }
      } catch (_) {}
    }
  } catch (_) {}
  return map;
}

/** Resolve Sauce job URL for a testcase key; works if jsonl omitted suite or casing differs. */
function resolveSauceScenarioUrl(sauceMap, suite, key) {
  if (!sauceMap || !key) return null;
  const ku = String(key).toUpperCase();
  const sl = String(suite || '').toLowerCase();
  return (
    sauceMap.get(`${sl}:${ku}`) ||
    sauceMap.get(`:${ku}`) ||
    null
  );
}

function isSauceConfigured() {
  const u = process.env.SAUCE_USERNAME || process.env.SAUCE_USER;
  const k = process.env.SAUCE_ACCESS_KEY || process.env.SAUCE_KEY;
  return !!(u && k);
}

function resolveWdioConfig(useSauce) {
  return path.join(__dirname, useSauce ? 'wdio.sauce.conf.js' : 'wdio.conf.js');
}
const DIST_DIR = path.join(__dirname, 'dashboard', 'dist');
const TESTCASE_DIR = path.join(__dirname, 'testcase');
const FEATURES_DIR = (() => {
  const fromScript = path.resolve(__dirname, 'features');
  const fromCwd = path.resolve(process.cwd(), 'features');
  if (fs.existsSync(fromScript)) return fromScript;
  if (fs.existsSync(fromCwd)) return fromCwd;
  return fromScript;
})();
const SYNC_CONFIG = path.join(TESTCASE_DIR, 'sync-config.json');

let pendingSyncData = {};

let fixState = {
  running: false,
  stopped: false,
  suite: null,
  key: null,
  attempt: 0,
  lastResult: null,
  env: 'beta',
  activeChild: null,
  useSauce: false,
};

let automateRunState = {
  running: false,
  stopped: false,
  suite: null,
  key: null,
  attempt: 0,
  lastResult: null,
  created: null,
  error: null,
};

app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  next();
});

function loadExecuteResults() {
  if (!fs.existsSync(EXECUTE_RESULTS_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(EXECUTE_RESULTS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveExecuteResult(suite, key, result) {
  try {
    const data = loadExecuteResults();
    const id = `${suite}:${key}`;
    data[id] = { ...result, timestamp: new Date().toISOString() };
    fs.mkdirSync(path.dirname(EXECUTE_RESULTS_FILE), { recursive: true });
    fs.writeFileSync(EXECUTE_RESULTS_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.warn('Could not save execute result:', e.message);
  }
}

function loadRuns() {
  if (!fs.existsSync(RUNS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(RUNS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveRuns(runs) {
  try {
    fs.mkdirSync(path.dirname(RUNS_FILE), { recursive: true });
    fs.writeFileSync(RUNS_FILE, JSON.stringify(runs, null, 2));
  } catch (e) {
    throw new Error(`Could not save runs: ${e.message}`);
  }
}

/** Check if scenario belongs to project (by key: WSTE->webTv, WQO->optools, WQ->core-app) */
function scenarioBelongsToProject(scenario, project) {
  if (!project || project === 'all') return true;
  const name = scenario?.name || scenario?.id || '';
  const keyMatch = name.match(/\((WSTE-\d+|WQO-\d+|WQ-\d+)\)/i);
  const key = (scenario?.key || keyMatch?.[1] || '').toUpperCase();
  if (!key) return true;
  if (key.startsWith('WSTE')) return project === 'webTv';
  if (key.startsWith('WQO')) return project === 'optools';
  if (key.startsWith('WQ-')) return project === 'core-app';
  return true;
}

function filterScenariosByProject(scenarios, project) {
  if (!project || project === 'all') return scenarios || [];
  return (scenarios || []).filter((s) => scenarioBelongsToProject(s, project));
}

function getFlakyScenarios(runs, lastN = 20, project = null) {
  const recent = runs.slice(-lastN);
  const byScenario = {};

  for (const run of recent) {
    if (!run.scenarios) continue;
    const scenarios = filterScenariosByProject(run.scenarios, project);
    for (const s of scenarios) {
      const id = s.id;
      if (!byScenario[id]) byScenario[id] = { id, feature: s.feature, name: s.name, outcomes: [] };
      byScenario[id].outcomes.push(s.status);
    }
  }

  return Object.values(byScenario)
    .filter((s) => s.outcomes.length >= 3)
    .filter((s) => {
      const hasPass = s.outcomes.some((o) => o === 'passed');
      const hasFail = s.outcomes.some((o) => o === 'failed');
      return hasPass && hasFail;
    })
    .map((s) => ({
      id: s.id,
      feature: s.feature,
      name: s.name,
      totalRuns: s.outcomes.length,
      passed: s.outcomes.filter((o) => o === 'passed').length,
      failed: s.outcomes.filter((o) => o === 'failed').length,
      flakyScore: Math.round(
        (Math.min(
          s.outcomes.filter((o) => o === 'passed').length,
          s.outcomes.filter((o) => o === 'failed').length
        ) /
          s.outcomes.length) *
          100
      ),
    }))
    .sort((a, b) => b.flakyScore - a.flakyScore);
}

function findFeatureFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) findFeatureFiles(full, acc);
    else if (e.name.endsWith('.feature')) acc.push(full);
  }
  return acc;
}

/** Extract automated test keys from feature files (WSTE-xx, WQO-xxx) */
function getAutomatedKeysFromFeatures() {
  const keys = new Set();
  const keyRegex = /\b(WSTE-\d+|WQO-\d+|WQ-\d+)\b/gi;
  const files = findFeatureFiles(FEATURES_DIR);
  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      const matches = content.match(keyRegex) || [];
      matches.forEach((m) => keys.add(m.toUpperCase()));
    } catch (_) {}
  }
  return keys;
}

/** Automation coverage: discover all suites dynamically, automated vs manual per project */
function getAutomationCoverage() {
  const automatedKeys = getAutomatedKeysFromFeatures();
  if (!fs.existsSync(TESTCASE_DIR)) return { suites: [], totalAutomated: 0, totalManual: 0, total: 0 };

  const entries = fs.readdirSync(TESTCASE_DIR, { withFileTypes: true });
  const suites = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => {
      const dir = path.join(TESTCASE_DIR, e.name);
      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'testcases.json');
      const total = files.length;
      let automated = 0;
      for (const file of files) {
        const key = file.replace('.json', '');
        if (automatedKeys.has(key)) automated++;
      }
      const displayName = e.name.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()).trim();
      return {
        name: e.name,
        displayName,
        total,
        automated,
        manual: total - automated,
      };
    })
    .filter((s) => s.total > 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    suites,
    totalAutomated: suites.reduce((sum, s) => sum + s.automated, 0),
    totalManual: suites.reduce((sum, s) => sum + s.manual, 0),
    total: suites.reduce((sum, s) => sum + s.total, 0),
  };
}

function getTrends(runs, limit = 30, project = null) {
  return runs
    .slice(-limit)
    .map((r) => {
      const scenarios = filterScenariosByProject(r.scenarios || [], project);
      const metrics = computeMetricsFromScenarios(scenarios);
      return {
        date: r.timestamp,
        label: new Date(r.timestamp).toLocaleDateString(),
        passed: metrics.passed,
        failed: metrics.failed,
        total: metrics.total,
        passRate: metrics.passRate,
      };
    })
    .filter((t) => t.total > 0);
}

function computeMetricsFromScenarios(scenarios) {
  const filtered = scenarios || [];
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  const byFeature = {};
  for (const s of filtered) {
    const f = s.feature || 'Unknown';
    if (!byFeature[f]) byFeature[f] = { passed: 0, failed: 0, skipped: 0 };
    if (s.status === 'passed') {
      passed++;
      byFeature[f].passed++;
    } else if (s.status === 'failed') {
      failed++;
      byFeature[f].failed++;
    } else {
      skipped++;
      byFeature[f].skipped++;
    }
  }
  const total = filtered.length;
  return {
    passed,
    failed,
    skipped,
    total,
    passRate: total > 0 ? Math.round((passed / total) * 100) : 0,
    byFeature: Object.entries(byFeature).map(([name, data]) => ({
      name,
      ...data,
      total: data.passed + data.failed + data.skipped,
    })),
    failedScenarios: filtered
      .filter((s) => s.status === 'failed')
      .map((s) => {
        const keyMatch = (s.name || s.id || '').match(/\((WSTE-\d+|WQO-\d+|WQ-\d+)\)/i);
        return {
          id: s.id,
          feature: s.feature,
          name: s.name,
          key: (s.key || keyMatch?.[1] || '').toUpperCase() || null,
          failStep: s.failStep || null,
          failReason: s.failReason || null,
          screenshot: getScreenshotUrl(s),
          video: getVideoUrl(s),
        };
      }),
  };
}

app.get('/api/metrics', (req, res) => {
  const project = req.query.project || 'all';
  const runs = loadRuns();
  const latest = runs[runs.length - 1];
  if (!latest) {
    return res.json({
      hasData: false,
      message: 'Run tests to see metrics',
      passed: 0,
      failed: 0,
      total: 0,
      passRate: 0,
      byFeature: [],
      failedScenarios: [],
    });
  }
  const scenarios = filterScenariosByProject(latest.scenarios || [], project);
  const metrics = computeMetricsFromScenarios(scenarios);
  res.json({
    hasData: metrics.total > 0,
    runId: latest.id,
    timestamp: latest.timestamp,
    ...metrics,
  });
});

/** Fallback: find screenshot by matching scenario name when manifest key differs */
function findScreenshotByScenarioName(manifest, scenarioName) {
  if (!manifest || typeof manifest !== 'object') return null;
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const needle = norm(scenarioName);
  for (const [key, val] of Object.entries(manifest)) {
    const keyScenario = key.includes('::') ? key.split('::').slice(1).join('::') : key;
    const keyNorm = norm(keyScenario);
    if (keyNorm === needle || keyNorm.includes(needle) || needle.includes(keyNorm)) return val;
  }
  return null;
}

/** Fallback: scan screenshots dir for file matching scenario name; if multiple and no match, use newest */
function findScreenshotInDir(scenarioName) {
  if (!fs.existsSync(SCREENSHOTS_DIR)) return null;
  let files = fs.readdirSync(SCREENSHOTS_DIR).filter((f) => f.endsWith('.png'));
  if (files.length === 0) return null;
  const baseName = (scenarioName || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
  const slug = baseName.replace(/[^a-zA-Z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 50).toLowerCase();
  const match = files.find(
    (f) =>
      f.toLowerCase().replace(/-+/g, '-').includes(slug) ||
      slug.includes(f.replace(/-\d+\.png$/i, '').toLowerCase().replace(/-+/g, '-'))
  );
  if (match) return match;
  if (files.length === 1) return files[0];
  files = files
    .map((f) => ({ name: f, mtime: fs.statSync(path.join(SCREENSHOTS_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return files[0]?.name || null;
}

/** Resolve screenshot filename - use file if it exists, else try to find a matching one in dir */
function resolveScreenshotFilename(requestedFilename, scenarioName) {
  const safe = (requestedFilename || '').replace(/[^a-zA-Z0-9_.-]/g, '');
  if (safe) {
    const filepath = path.join(SCREENSHOTS_DIR, safe);
    if (fs.existsSync(filepath)) return safe;
  }
  if (!fs.existsSync(SCREENSHOTS_DIR)) return null;
  const files = fs.readdirSync(SCREENSHOTS_DIR).filter((f) => f.endsWith('.png'));
  if (files.length === 0) return null;
  const baseName = (scenarioName || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
  const slug = baseName
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 50)
    .toLowerCase();
  const match = files.find(
    (f) =>
      f.toLowerCase().replace(/-+/g, '-').includes(slug) ||
      slug.includes(f.replace(/-\d+\.png$/i, '').toLowerCase().replace(/-+/g, '-'))
  );
  if (match) return match;
  return files.length === 1 ? files[0] : null;
}

function getScreenshotUrl(s, baseUrl = '/api/screenshots/') {
  if (!s) return null;
  const resolved =
    resolveScreenshotFilename(s.screenshot, s.name) ||
    (s.name ? resolveScreenshotFilename(null, s.name) : null);
  return resolved ? `${baseUrl}${resolved}` : null;
}

/** Resolve wdio-video-reporter MP4 URL for a scenario (runs.json or metrics). */
function getVideoUrl(s, baseUrl = '/api/videos/') {
  if (!s) return null;
  const raw = s.video;
  if (raw && String(raw).startsWith('/api/videos/')) return String(raw);
  let basename = raw ? path.basename(String(raw)).replace(/[^a-zA-Z0-9_.-]/g, '') : '';
  if (basename) {
    const fp = path.join(VIDEOS_DIR, basename);
    if (fs.existsSync(fp)) return `${baseUrl}${basename}`;
  }
  const found = s.name && findVideoForScenarioName(s.name, VIDEOS_DIR);
  return found ? `${baseUrl}${found}` : null;
}

function applyRecordVideoEnv(spawnEnv, recordVideo) {
  if (!recordVideo) return spawnEnv;
  return {
    ...spawnEnv,
    WDIO_RECORD_VIDEO: '1',
    WDIO_SAVE_ALL_VIDEOS: '1',
  };
}

/** Element outline before clicks/typing (features/support/highlight.js). Only explicit true enables. */
function applyHighlightEnv(spawnEnv, highlightElements) {
  const next = { ...spawnEnv };
  next.HIGHLIGHT_ELEMENTS = highlightElements === true ? '1' : '0';
  return next;
}

app.get('/api/screenshots/:filename', (req, res) => {
  const filename = req.params.filename.replace(/[^a-zA-Z0-9_.-]/g, '');
  if (!filename) return res.status(400).send('Invalid filename');
  const filepath = path.join(SCREENSHOTS_DIR, filename);
  if (!fs.existsSync(filepath)) return res.status(404).send('Screenshot not found');
  res.sendFile(filepath, { headers: { 'Content-Type': 'image/png' } });
});

app.get('/api/videos/:filename', (req, res) => {
  const filename = path.basename(req.params.filename || '').replace(/[^a-zA-Z0-9_.-]/g, '');
  if (!filename || !filename.endsWith('.mp4')) return res.status(400).send('Invalid filename');
  const filepath = path.join(VIDEOS_DIR, filename);
  if (!fs.existsSync(filepath)) return res.status(404).send('Video not found');
  res.sendFile(filepath, { headers: { 'Content-Type': 'video/mp4' } });
});

app.get('/api/runs', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  const project = req.query.project || 'all';
  const runs = loadRuns()
    .slice(-limit)
    .reverse()
    .map((r) => {
      const scenarios = filterScenariosByProject(r.scenarios || [], project);
      const metrics = computeMetricsFromScenarios(scenarios);
      return {
        id: r.id,
        timestamp: r.timestamp,
        date: r.date,
        env: r.env,
        passed: metrics.passed,
        failed: metrics.failed,
        total: metrics.total,
        passRate: metrics.passRate,
        failedScenarios: metrics.failedScenarios,
      };
    })
    .filter((r) => r.total > 0);
  res.json({ runs });
});

app.get('/api/runs/:id', (req, res) => {
  const runs = loadRuns();
  const run = runs.find((r) => r.id === req.params.id);
  if (!run) return res.status(404).json({ error: 'Run not found' });
  res.json(run);
});

app.get('/api/trends', (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 30;
  const project = req.query.project || 'all';
  const runs = loadRuns();
  res.json({ trends: getTrends(runs, limit, project) });
});

app.get('/api/automation', (req, res) => {
  const project = req.query.project || 'all';
  const data = getAutomationCoverage();
  if (project && project !== 'all') {
    const filtered = data.suites.filter((s) => s.name === project);
    const total = filtered.reduce((sum, s) => sum + s.total, 0);
    const totalAutomated = filtered.reduce((sum, s) => sum + s.automated, 0);
    const totalManual = filtered.reduce((sum, s) => sum + s.manual, 0);
    return res.json({ suites: filtered, totalAutomated, totalManual, total });
  }
  res.json(data);
});

function getScenariosForSuite(suiteName) {
  const dir = path.join(TESTCASE_DIR, suiteName);
  if (!fs.existsSync(dir)) return [];
  const automatedKeys = getAutomatedKeysFromFeatures();
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'testcases.json');
  return files
    .map((file) => {
      const key = file.replace('.json', '');
      try {
        const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
        return {
          key,
          summary: data.summary || data.key || key,
          automated: automatedKeys.has(key),
        };
      } catch {
        return { key, summary: key, automated: automatedKeys.has(key) };
      }
    })
    .sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
}

app.get('/api/projects', (req, res) => {
  if (!fs.existsSync(TESTCASE_DIR)) return res.json({ projects: [] });
  const entries = fs.readdirSync(TESTCASE_DIR, { withFileTypes: true });
  const projects = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => ({
      id: e.name,
      name: e.name.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim(),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  res.json({ projects });
});

/** List all suites (folders in testcase/). ?project= filters to one suite. */
app.get('/api/suites', (req, res) => {
  if (!fs.existsSync(TESTCASE_DIR)) return res.json({ suites: [] });
  const project = req.query.project || 'all';
  const entries = fs.readdirSync(TESTCASE_DIR, { withFileTypes: true });
  let suites = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => {
      const scenarios = getScenariosForSuite(e.name);
      return {
        name: e.name,
        displayName: e.name.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()).trim(),
        scenarios,
      };
    })
    .filter((s) => s.scenarios.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
  if (project && project !== 'all') {
    suites = suites.filter((s) => s.name === project);
  }
  res.json({ suites });
});

app.get('/api/execute-results', (req, res) => {
  res.json(loadExecuteResults());
});

app.get('/api/sauce/status', (req, res) => {
  res.json({ configured: isSauceConfigured() });
});

/** Run automated tests in a suite. If keys[] provided, run only those; otherwise run all automated.
 * Multiple scenarios run in one WDIO invocation so HTML report includes all results. */
app.post('/api/execute-suite', async (req, res) => {
  if (executeInProgress || fixState.running) {
    return res.status(429).json({ error: 'Another test is already running' });
  }
  const {
    suite,
    env,
    headless,
    browser,
    keys,
    recordVideo,
    parallel,
    parallelWorkers: parallelWorkersRaw,
    highlightElements,
    useSauce,
  } = req.body || {};
  if (!suite) {
    return res.status(400).json({ error: 'suite required' });
  }
  let scenarios = getScenariosForSuite(suite).filter((s) => s.automated);
  if (keys && Array.isArray(keys) && keys.length > 0) {
    const keySet = new Set(keys.map((k) => String(k).trim()).filter(Boolean));
    scenarios = scenarios.filter((s) => s.key && keySet.has(s.key));
  }
  scenarios = scenarios.filter((s) => getFeaturePathForKey(suite, s.key));
  if (scenarios.length === 0) {
    return res.json({ success: true, passed: 0, failed: 0, total: 0, results: [], message: keys?.length ? 'No matching automated scenarios for selected keys' : 'No automated scenarios in suite' });
  }
  const sauceOn = !!useSauce;
  if (sauceOn && !isSauceConfigured()) {
    return res.status(400).json({
      success: false,
      error: 'Sauce Labs: set SAUCE_USERNAME and SAUCE_ACCESS_KEY in .env (see README).',
    });
  }
  executeInProgress = true;
  const envVal = env || 'beta';
  const pwParsed = parseInt(parallelWorkersRaw, 10);
  let parallelWorkers = 1;
  if (scenarios.length > 1 && parallel) {
    if (!Number.isNaN(pwParsed) && pwParsed >= 2) {
      parallelWorkers = Math.min(16, pwParsed);
    } else {
      parallelWorkers = 4;
    }
  }
  const opts = {
    headless: !!headless,
    browser: browser || 'chrome',
    recordVideo: sauceOn ? false : !!recordVideo,
    parallelWorkers,
    highlightElements: highlightElements === true,
    useSauce: sauceOn,
    trackForExecuteStop: true,
  };
  let results = [];
  let passed = 0;
  let failed = 0;
  try {
    if (scenarios.length === 1) {
      const s = scenarios[0];
      const result = await runSingleTest(suite, s.key, envVal, opts);
      const success = result.status === 'passed';
      passed = success ? 1 : 0;
      failed = success ? 0 : 1;
      saveExecuteResult(suite, s.key, {
        success,
        status: result.status,
        failStep: result.failStep,
        failReason: result.failReason,
        screenshot: result.screenshot,
        video: result.video || null,
        sauceUrl: result.sauceUrl || null,
      });
      results = [
        {
          key: s.key,
          status: result.status,
          failStep: result.failStep,
          failReason: result.failReason,
          video: result.video || null,
          sauceUrl: result.sauceUrl || null,
        },
      ];
    } else {
      const batchResult = await runMultipleTests(suite, scenarios.map((s) => s.key), envVal, opts);
      results = batchResult.results || [];
      passed = (batchResult.passed || 0);
      failed = (batchResult.failed || 0);
      for (const r of results) {
        saveExecuteResult(suite, r.key, {
          success: r.status === 'passed',
          status: r.status,
          failStep: r.failStep,
          failReason: r.failReason,
          screenshot: r.screenshot || null,
          video: r.video || null,
          sauceUrl: r.sauceUrl || null,
        });
      }
    }
    res.json({ success: failed === 0, passed, failed, total: results.length, results });
  } catch (e) {
    res.status(500).json({ success: false, passed, failed, total: results.length, results, error: e.message });
  } finally {
    executeInProgress = false;
  }
});

/** Permanently delete failed scenarios from a run */
app.post('/api/runs/:runId/delete-scenarios', (req, res) => {
  const { runId } = req.params;
  const { scenarioIds } = req.body || {};
  if (!runId || !Array.isArray(scenarioIds) || scenarioIds.length === 0) {
    return res.status(400).json({ error: 'runId and scenarioIds array required' });
  }
  const runs = loadRuns();
  const idx = runs.findIndex((r) => r.id === runId);
  if (idx < 0) return res.status(404).json({ error: 'Run not found' });
  const run = runs[idx];
  const idsToRemove = new Set(scenarioIds);
  run.scenarios = (run.scenarios || []).filter((s) => !idsToRemove.has(s.id));
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  for (const s of run.scenarios) {
    if (s.status === 'passed') passed++;
    else if (s.status === 'failed') failed++;
    else skipped++;
  }
  run.passed = passed;
  run.failed = failed;
  run.skipped = skipped;
  run.total = run.scenarios.length;
  run.passRate = run.total > 0 ? Math.round((passed / run.total) * 100) : 0;
  const byFeature = {};
  for (const s of run.scenarios) {
    const f = s.feature || 'Unknown';
    if (!byFeature[f]) byFeature[f] = { passed: 0, failed: 0, skipped: 0 };
    if (s.status === 'passed') byFeature[f].passed++;
    else if (s.status === 'failed') byFeature[f].failed++;
    else byFeature[f].skipped++;
  }
  run.byFeature = Object.entries(byFeature).map(([name, data]) => ({
    name,
    ...data,
    total: data.passed + data.failed + data.skipped,
  }));
  saveRuns(runs);
  res.json({ success: true, deleted: scenarioIds.length });
});

/** List scenarios for a specific suite (legacy; use /api/suites for all) */
app.get('/api/scenarios/:suite', (req, res) => {
  const scenarios = getScenariosForSuite(req.params.suite);
  res.json({ scenarios });
});

app.get('/api/sync-config', (req, res) => {
  if (!fs.existsSync(SYNC_CONFIG)) return res.json({ suites: [], jiraBaseUrl: 'https://baseball.atlassian.net' });
  try {
    const config = JSON.parse(fs.readFileSync(SYNC_CONFIG, 'utf8'));
    const jiraBaseUrl = config.jiraBaseUrl || 'https://baseball.atlassian.net';
    const suites = Object.keys(config).filter((k) => k !== 'jiraBaseUrl');
    res.json({ suites, jiraBaseUrl });
  } catch {
    res.json({ suites: [], jiraBaseUrl: 'https://baseball.atlassian.net' });
  }
});

app.get('/api/flaky', (req, res) => {
  const lastN = parseInt(req.query.lastN, 10) || 20;
  const project = req.query.project || 'all';
  const runs = loadRuns();
  res.json({ flaky: getFlakyScenarios(runs, lastN, project) });
});

/** Normalize gherkin for comparison: ignore whitespace/line-ending differences */
function normalizeGherkin(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

/** Returns true only if there is meaningful content difference (ignoring formatting).
 * Do not flag as update when Xray returns empty gherkin but we have local content - that would overwrite with nothing. */
function gherkinHasMeaningfulChange(oldStr, newStr) {
  const a = normalizeGherkin(oldStr);
  const b = normalizeGherkin(newStr);
  if (!a && !b) return false;  // both empty: no change
  if (a && !b) return false;   // we have content, Xray empty: don't flag (would overwrite with nothing)
  if (!a && b) return true;     // we're empty, Xray has content: that's an update
  return a !== b;               // both have content: compare
}

/** Simple word-level diff: returns [{ text, status: 'same'|'changed' }] */
function wordDiff(oldStr, newStr) {
  const oldW = (oldStr || '').split(/(\s+|\n)/);
  const newW = (newStr || '').split(/(\s+|\n)/);
  const result = [];
  let i = 0;
  let j = 0;
  while (i < oldW.length || j < newW.length) {
    if (i < oldW.length && j < newW.length && oldW[i] === newW[j]) {
      result.push({ text: oldW[i], status: 'same' });
      i++;
      j++;
    } else if (j < newW.length) {
      result.push({ text: newW[j], status: 'changed' });
      j++;
    } else {
      i++;
    }
  }
  return result;
}

/** Check sync status: which scenarios are new or have updates in Xray (read-only, no pending data) */
app.get('/api/sync/:suite/status', async (req, res) => {
  const suite = req.params.suite;
  if (!suite) return res.status(400).json({ error: 'Suite required' });
  if (!fs.existsSync(SYNC_CONFIG)) return res.json({ new: [], updated: [] });
  const config = JSON.parse(fs.readFileSync(SYNC_CONFIG, 'utf8'));
  const issueKey = config[suite];
  if (!issueKey) return res.json({ new: [], updated: [] });

  try {
    const { exportTests } = require('./xray/exportTestsToJson');
    const newTests = await exportTests(issueKey, suite, { silent: true, write: false });
    const dir = path.join(TESTCASE_DIR, suite);
    const newKeys = [];
    const updatedKeys = [];
    for (const nt of newTests) {
      const key = nt.key || nt.issueId;
      const oldPath = path.join(dir, `${key}.json`);
      let jsonDiffers = false;
      let featureDiffers = false;
      if (!fs.existsSync(oldPath)) {
        newKeys.push({ key, summary: nt.summary || key });
      } else {
        try {
          const oldData = JSON.parse(fs.readFileSync(oldPath, 'utf8'));
          const jsonGherkin = oldData.gherkin || '';
          const xrayGherkin = nt.gherkin || '';
          jsonDiffers = gherkinHasMeaningfulChange(jsonGherkin, xrayGherkin);
        } catch (_) {
          jsonDiffers = true;
        }
        const featureRelPath = getFeaturePathForKey(suite, key);
        if (featureRelPath) {
          const featureGherkin = extractGherkinFromFeatureForKey(path.join(__dirname, featureRelPath), key);
          if (featureGherkin != null) {
            featureDiffers = gherkinHasMeaningfulChange(featureGherkin, nt.gherkin || '');
          }
        }
        if (jsonDiffers || featureDiffers) {
          updatedKeys.push({ key, summary: nt.summary || key });
        }
      }
    }
    res.json({ new: newKeys, updated: updatedKeys });
  } catch (e) {
    res.status(500).json({ new: [], updated: [], error: e.message });
  }
});

app.post('/api/sync/:suite/preview', async (req, res) => {
  const suite = req.params.suite;
  if (!suite) return res.status(400).json({ error: 'Suite required' });
  if (!fs.existsSync(SYNC_CONFIG)) return res.status(400).json({ error: 'sync-config.json not found' });
  const config = JSON.parse(fs.readFileSync(SYNC_CONFIG, 'utf8'));
  const issueKey = config[suite];
  if (!issueKey) return res.status(400).json({ error: `No issue key for suite "${suite}" in sync-config` });

  try {
    const { exportTests } = require('./xray/exportTestsToJson');
    const newTests = await exportTests(issueKey, suite, { silent: true, write: false });
    const dir = path.join(TESTCASE_DIR, suite);
    const changes = [];
    for (const nt of newTests) {
      const key = nt.key || nt.issueId;
      let jsonGherkin = '';
      const oldPath = path.join(dir, `${key}.json`);
      if (fs.existsSync(oldPath)) {
        try {
          const oldData = JSON.parse(fs.readFileSync(oldPath, 'utf8'));
          jsonGherkin = oldData.gherkin || '';
        } catch (_) {}
      }
      const xrayGherkin = nt.gherkin || '';
      const featureRelPath = getFeaturePathForKey(suite, key);
      let featureGherkin = null;
      if (featureRelPath) {
        featureGherkin = extractGherkinFromFeatureForKey(path.join(__dirname, featureRelPath), key);
      }
      const oldGherkin = featureGherkin ?? jsonGherkin;
      const diff = wordDiff(oldGherkin, xrayGherkin);
      const jsonDiffers = gherkinHasMeaningfulChange(jsonGherkin, xrayGherkin);
      const featureDiffers = featureGherkin != null && gherkinHasMeaningfulChange(featureGherkin, xrayGherkin);
      const hasChanges = jsonDiffers || featureDiffers;
      changes.push({
        key,
        summary: nt.summary,
        oldGherkin,
        newGherkin: xrayGherkin,
        diff,
        hasChanges,
      });
    }
    pendingSyncData[suite] = newTests;
    res.json({ success: true, changes });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/sync/:suite/apply', async (req, res) => {
  const suite = req.params.suite;
  let pending = pendingSyncData[suite];
  if (!pending) {
    try {
      if (!fs.existsSync(SYNC_CONFIG)) return res.status(400).json({ error: 'sync-config.json not found' });
      const config = JSON.parse(fs.readFileSync(SYNC_CONFIG, 'utf8'));
      const issueKey = config[suite];
      if (!issueKey) return res.status(400).json({ error: `No issue key for suite "${suite}" in sync-config` });
      const { exportTests } = require('./xray/exportTestsToJson');
      pending = await exportTests(issueKey, suite, { silent: true, write: false });
    } catch (e) {
      return res.status(400).json({ error: 'No pending sync. Click Sync first, or re-fetch failed: ' + e.message });
    }
  }

  try {
    const dir = path.join(TESTCASE_DIR, suite);
    fs.mkdirSync(dir, { recursive: true });
    for (const tc of pending) {
      const key = tc.key || tc.issueId;
      const filename = `${key}.json`;
      fs.writeFileSync(path.join(dir, filename), JSON.stringify(tc, null, 2));
      const featureRelPath = getFeaturePathForKey(suite, key);
      if (featureRelPath && tc.gherkin) {
        const featureFullPath = path.join(__dirname, featureRelPath);
        updateScenarioStepsInFeature(featureFullPath, key, tc.gherkin);
      }
    }
    fs.writeFileSync(
      path.join(dir, 'testcases.json'),
      JSON.stringify(pending, null, 2)
    );
    delete pendingSyncData[suite];
    res.json({ success: true, message: 'Updated testcase JSON and feature files from Xray.' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/** Sync single scenario: preview */
app.post('/api/sync/:suite/:key/preview', async (req, res) => {
  const { suite, key } = req.params;
  if (!suite || !key) return res.status(400).json({ error: 'suite and key required' });
  if (!fs.existsSync(SYNC_CONFIG)) return res.status(400).json({ error: 'sync-config.json not found' });
  const config = JSON.parse(fs.readFileSync(SYNC_CONFIG, 'utf8'));
  const issueKey = config[suite];
  if (!issueKey) return res.status(400).json({ error: `No issue key for suite "${suite}" in sync-config` });

  try {
    const { exportSingleTest } = require('./xray/exportTestsToJson');
    const newTest = await exportSingleTest(issueKey, suite, key, { silent: true, write: false });
    const dir = path.join(TESTCASE_DIR, suite);
    let jsonGherkin = '';
    const oldPath = path.join(dir, `${key}.json`);
    if (fs.existsSync(oldPath)) {
      try {
        const oldData = JSON.parse(fs.readFileSync(oldPath, 'utf8'));
        jsonGherkin = oldData.gherkin || '';
      } catch (_) {}
    }
    const xrayGherkin = newTest.gherkin || '';
    const featureRelPath = getFeaturePathForKey(suite, key);
    let featureGherkin = null;
    if (featureRelPath) {
      featureGherkin = extractGherkinFromFeatureForKey(path.join(__dirname, featureRelPath), key);
    }
    const oldGherkin = featureGherkin ?? jsonGherkin;
    const diff = wordDiff(oldGherkin, xrayGherkin);
    const jsonDiffers = gherkinHasMeaningfulChange(jsonGherkin, xrayGherkin);
    const featureDiffers = featureGherkin != null && gherkinHasMeaningfulChange(featureGherkin, xrayGherkin);
    const hasChanges = jsonDiffers || featureDiffers;
    const pendingKey = `${suite}:${key}`;
    pendingSyncData[pendingKey] = [newTest];
    res.json({
      success: true,
      changes: [{ key, summary: newTest.summary, oldGherkin, newGherkin: xrayGherkin, diff, hasChanges }],
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/** Update scenario steps in feature file with new gherkin from Xray. */
function updateScenarioStepsInFeature(featureFullPath, key, newGherkin) {
  if (!fs.existsSync(featureFullPath) || !newGherkin) return false;
  const content = fs.readFileSync(featureFullPath, 'utf8');
  const lines = content.split('\n');
  const keyUpper = (key || '').toUpperCase();
  const KEY_TAG_RE = /@(WSTE-\d+|WQO-\d+|WQ-\d+)/gi;
  const STEP_RE = /^\s*(Given|When|Then|And|But)\s+(.+)$/i;
  const SCENARIO_RE = /^\s*Scenario(?:\s+Outline)?\s*:?\s*(.*)$/i;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const scenarioMatch = line.match(SCENARIO_RE);
    if (scenarioMatch) {
      const tagLines = [line];
      let j = i - 1;
      while (j >= 0 && /^\s*@[\w-]+/.test(lines[j])) {
        tagLines.unshift(lines[j]);
        j--;
      }
      const allTagText = tagLines.join(' ');
      const keys = [...new Set([...allTagText.matchAll(KEY_TAG_RE)].map((m) => m[1].toUpperCase()))];
      if (!keys.includes(keyUpper)) {
        i++;
        continue;
      }
      const scenarioStart = i + 1;
      let stepEnd = i + 1;
      while (stepEnd < lines.length) {
        const stepLine = lines[stepEnd];
        if (!stepLine.trim()) { stepEnd++; continue; }
        if (/^\s*(Scenario|Feature|Background|Examples|#)/i.test(stepLine)) break;
        const stepMatch = stepLine.match(STEP_RE);
        if (stepMatch || (stepLine.trim().startsWith('|') && stepLine.trim().endsWith('|'))) {
          stepEnd++;
        } else break;
      }
      const newSteps = newGherkin.trim().split('\n').map((l) => '    ' + l.trim());
      const before = lines.slice(0, scenarioStart).join('\n');
      const afterLines = lines.slice(stepEnd);
      const after = afterLines.length ? '\n' + afterLines.join('\n') : '';
      fs.writeFileSync(featureFullPath, before + '\n' + newSteps.join('\n') + after);
      return true;
    }
    i++;
  }
  return false;
}

/** Extract gherkin for a scenario from feature file (for Update Xray preview). */
function extractGherkinFromFeatureForKey(featureFullPath, key) {
  if (!fs.existsSync(featureFullPath)) return null;
  const content = fs.readFileSync(featureFullPath, 'utf8');
  const lines = content.split(/\n/);
  const keyUpper = (key || '').toUpperCase();
  const KEY_TAG_RE = /@(WSTE-\d+|WQO-\d+|WQ-\d+)/gi;
  const STEP_RE = /^\s*(Given|When|Then|And|But)\s+(.+)$/i;
  const SCENARIO_RE = /^\s*Scenario(?:\s+Outline)?\s*:?\s*(.*)$/i;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const scenarioMatch = line.match(SCENARIO_RE);
    if (scenarioMatch) {
      const tagLines = [line];
      let j = i - 1;
      while (j >= 0 && /^\s*@[\w-]+/.test(lines[j])) {
        tagLines.unshift(lines[j]);
        j--;
      }
      const allTagText = tagLines.join(' ');
      const keys = [...new Set([...allTagText.matchAll(KEY_TAG_RE)].map((m) => m[1].toUpperCase()))];
      if (!keys.includes(keyUpper)) {
        i++;
        continue;
      }
      const steps = [];
      i++;
      while (i < lines.length) {
        const stepLine = lines[i];
        if (!stepLine.trim()) {
          i++;
          continue;
        }
        if (/^\s*(Scenario|Feature|Background|Examples|#)/i.test(stepLine)) break;
        const stepMatch = stepLine.match(STEP_RE);
        if (stepMatch) {
          steps.push(`${stepMatch[1]} ${stepMatch[2].trim()}`);
        } else if (stepLine.trim().startsWith('|') && stepLine.trim().endsWith('|')) {
          steps.push(stepLine.trim());
        }
        i++;
      }
      return steps.length ? steps.join('\n') : null;
    }
    i++;
  }
  return null;
}

/** Debug: returns paths used for feature lookup (for troubleshooting "No feature file found"). */
app.get('/api/debug/feature-paths/:suite/:key', (req, res) => {
  const { suite, key } = req.params;
  const featureRelPath = getFeaturePathForKey(suite, key);
  const featureFullPath = featureRelPath ? path.resolve(__dirname, featureRelPath) : null;
  res.json({
    suite,
    key,
    __dirname,
    processCwd: process.cwd(),
    FEATURES_DIR,
    featureRelPath,
    featureFullPath,
    exists: featureFullPath ? fs.existsSync(featureFullPath) : false,
  });
});

/** Update Xray preview: compare feature file vs JSON vs Xray. Shows 3-way state for decision. */
app.post('/api/update-xray-preview/:suite/:key', async (req, res) => {
  const { suite, key } = req.params;
  console.log('[Update Xray] PREVIEW req.params:', { suite, key, suiteType: typeof suite, keyType: typeof key });
  if (!suite || !key) return res.status(400).json({ error: 'suite and key required' });

  const featureRelPath = getFeaturePathForKey(suite, key);
  if (!featureRelPath) {
    const debug = { __dirname, cwd: process.cwd(), FEATURES_DIR, featuresExists: fs.existsSync(FEATURES_DIR) };
    console.warn(`[Update Xray] No feature file for ${key} in ${suite}`, debug);
    return res.json({
      success: false,
      error: `No feature file found for ${key} in ${suite}. Check features/webtv/, features/optools/, or features/core-app/ for a .feature file containing @${key}`,
      debug,
    });
  }
  const featureFullPath = path.resolve(__dirname, featureRelPath);
  const featureGherkin = extractGherkinFromFeatureForKey(featureFullPath, key);
  if (featureGherkin == null) {
    return res.json({ success: false, error: `Scenario @${key} not found or has no steps in feature file` });
  }

  const tcPath = path.join(TESTCASE_DIR, suite, `${key}.json`);
  let tcGherkin = '';
  if (fs.existsSync(tcPath)) {
    try {
      const tc = JSON.parse(fs.readFileSync(tcPath, 'utf8'));
      tcGherkin = tc.gherkin || '';
    } catch (_) {}
  }

  let xrayGherkin = '';
  try {
    if (fs.existsSync(SYNC_CONFIG)) {
      const config = JSON.parse(fs.readFileSync(SYNC_CONFIG, 'utf8'));
      const issueKey = config[suite] || config[suite?.toLowerCase()];
      if (issueKey && !issueKey.startsWith('http')) {
        const { exportSingleTest } = require('./xray/exportTestsToJson');
        const xrayTest = await exportSingleTest(issueKey, suite, key, { silent: true, write: false });
        xrayGherkin = xrayTest.gherkin || '';
      }
    }
  } catch (_) {}

  const featureVsTc = gherkinHasMeaningfulChange(featureGherkin, tcGherkin);
  const featureVsXray = xrayGherkin && gherkinHasMeaningfulChange(featureGherkin, xrayGherkin);
  const hasChanges = featureVsTc || featureVsXray;
  const diff = wordDiff(tcGherkin, featureGherkin);

  res.json({
    success: true,
    key,
    summary: (() => {
      try {
        const tc = JSON.parse(fs.readFileSync(tcPath, 'utf8'));
        return tc.summary;
      } catch (_) {
        return key;
      }
    })(),
    oldGherkin: tcGherkin,
    newGherkin: featureGherkin,
    xrayGherkin: xrayGherkin || undefined,
    diff,
    hasChanges,
    featurePath: featureRelPath,
  });
});

/** Update Xray: sync feature → testcase JSON, then import to Xray. */
app.post('/api/update-xray/:suite/:key', async (req, res) => {
  const { suite, key } = req.params;
  console.log('[Update Xray] UPDATE req.params:', { suite, key, suiteType: typeof suite, keyType: typeof key });
  if (!suite || !key) return res.status(400).json({ error: 'suite and key required' });

  const featureRelPath = getFeaturePathForKey(suite, key);
  if (!featureRelPath) console.log('[Update Xray] getFeaturePathForKey returned null for', { suite, key });
  if (!featureRelPath) {
    return res.status(404).json({ success: false, error: `No feature file found for ${key} in ${suite}. Check features/webtv/, features/optools/, or features/core-app/` });
  }
  const featureFullPath = path.resolve(__dirname, featureRelPath);

  try {
    const child = spawn('node', [path.join(__dirname, 'scripts', 'syncFeatureToTestcase.js'), featureRelPath], {
      cwd: __dirname,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    await new Promise((resolve, reject) => {
      child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`Sync exited ${code}`))));
      child.on('error', reject);
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: `Sync failed: ${e.message}` });
  }

  let stepDefUpdated = false;
  try {
    const { syncFeatureToStepDefinitions } = require('./scripts/syncFeatureToStepDefinitions');
    const sdResult = syncFeatureToStepDefinitions(featureRelPath, { log: () => {} });
    stepDefUpdated = sdResult.updated;
  } catch (e) {
    console.warn('[Update Xray] Step def sync skipped:', e.message);
  }

  let xrayUpdated = false;
  let xrayError = null;
  try {
    const child = spawn('node', [path.join(__dirname, 'xray', 'importFeatureToXray.js'), featureRelPath], {
      cwd: __dirname,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    let stdout = '';
    child.stderr?.on('data', (d) => { stderr += d.toString(); });
    child.stdout?.on('data', (d) => { stdout += d.toString(); });
    await new Promise((resolve, reject) => {
      child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(stderr || stdout || `Import exited ${code}`))));
      child.on('error', reject);
    });
    xrayUpdated = true;
  } catch (e) {
    xrayError = e.message;
  }

  const parts = ['Updated testcase JSON'];
  if (stepDefUpdated) parts.push('step definitions');
  if (xrayUpdated) parts.push('and Xray');
  else parts.push('— Xray import failed (ensure XRAY_CLIENT_ID and XRAY_CLIENT_SECRET in .env)');
  const message = parts.join(' ');
  res.json({
    success: true,
    message,
    xrayUpdated,
    stepDefUpdated,
    xrayError: xrayError || undefined,
  });
});

/** Sync single scenario: apply */
app.post('/api/sync/:suite/:key/apply', async (req, res) => {
  const { suite, key } = req.params;
  const pendingKey = `${suite}:${key}`;
  let pending = pendingSyncData[pendingKey];
  if (!pending) {
    try {
      if (!fs.existsSync(SYNC_CONFIG)) return res.status(400).json({ error: 'sync-config.json not found' });
      const config = JSON.parse(fs.readFileSync(SYNC_CONFIG, 'utf8'));
      const issueKey = config[suite];
      if (!issueKey) return res.status(400).json({ error: `No issue key for suite "${suite}" in sync-config` });
      const { exportSingleTest } = require('./xray/exportTestsToJson');
      const newTest = await exportSingleTest(issueKey, suite, key, { silent: true, write: false });
      pending = [newTest];
    } catch (e) {
      return res.status(400).json({ error: `No pending sync for ${key}. Click Sync first, or re-fetch failed: ${e.message}` });
    }
  }

  try {
    const dir = path.join(TESTCASE_DIR, suite);
    fs.mkdirSync(dir, { recursive: true });
    const tc = pending[0];
    const filename = `${tc.key || tc.issueId}.json`;
    fs.writeFileSync(path.join(dir, filename), JSON.stringify(tc, null, 2));
    const featureRelPath = getFeaturePathForKey(suite, key);
    if (featureRelPath && tc.gherkin) {
      const featureFullPath = path.join(__dirname, featureRelPath);
      updateScenarioStepsInFeature(featureFullPath, key, tc.gherkin);
    }
    const testcasesPath = path.join(dir, 'testcases.json');
    let allCases = [];
    if (fs.existsSync(testcasesPath)) {
      try {
        allCases = JSON.parse(fs.readFileSync(testcasesPath, 'utf8'));
      } catch (_) {}
    }
    const idx = allCases.findIndex((c) => (c.key || c.issueId) === key);
    if (idx >= 0) allCases[idx] = tc;
    else allCases.push(tc);
    fs.writeFileSync(testcasesPath, JSON.stringify(allCases, null, 2));
    delete pendingSyncData[pendingKey];
    try {
      const { convertFolder } = require('./scripts/convertOptoolsToGherkin');
      convertFolder(suite, { silent: true });
    } catch (_) {}
    res.json({ success: true, message: 'Updated successfully' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/** Automate a manual test: create feature file + step definitions from testcase JSON. Uses webTv-temp, operator-tool-temp, or core-app-temp for reference. ?run=1 also starts the WebTV QA Engineer agent (run until pass or max attempts). */
app.post('/api/automate/:suite/:key', (req, res) => {
  const { suite, key } = req.params;
  const runAgent = req.query.run === '1' || req.query.run === 'true';
  const headless = req.query.headless !== '0'; // default true for automate
  const browser = req.query.browser || 'chrome';
  if (!suite || !key) return res.status(400).json({ error: 'suite and key required' });
  if (runAgent && (fixState.running || automateRunState.running)) {
    return res.status(429).json({ error: 'Another test or automate run is already in progress' });
  }
  try {
    const { automate } = require('./scripts/automateScenario');
    const result = automate(suite, key);
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }
    if (runAgent) {
      automateRunState.running = true;
      automateRunState.stopped = false;
      automateRunState.suite = suite;
      automateRunState.key = key;
      automateRunState.attempt = 0;
      automateRunState.lastResult = null;
      automateRunState.created = result.created;
      automateRunState.error = null;
      runAutomateAndRunLoop(suite, key, process.env.ENV || 'beta', { headless, browser }).catch((e) => {
        automateRunState.error = e.message;
        automateRunState.running = false;
      });
      res.json({ success: true, ...result, agentStarted: true, message: 'Files created. WebTV QA Engineer running - check status via /api/automate/status' });
    } else {
      res.json({ success: true, ...result });
    }
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

async function runAutomateAndRunLoop(suite, key, envVal, options = {}) {
  const { headless: autoHeadless = true, browser: autoBrowser = 'chrome' } = options;
  const { runWebTvQaEngineer } = require('./ai/webtvQaEngineer');
  let attempt = 0;
  const runFn = async (s, k, env) => {
    attempt++;
    automateRunState.attempt = attempt;
    return runSingleTest(s, k, env, { headless: autoHeadless, browser: autoBrowser });
  };
  const result = await runWebTvQaEngineer(key, {
    suite,
    maxAttempts: 10,
    env: envVal,
    runSingleTest: runFn,
  });
  automateRunState.running = false;
  automateRunState.lastResult = result;
  automateRunState.attempt = result.attempts?.length || 0;
  if (result.result) {
    saveExecuteResult(suite, key, {
      success: result.result.status === 'passed',
      status: result.result.status,
      failStep: result.result.failStep,
      failReason: result.result.failReason,
      screenshot: result.result.screenshot,
      video: result.result.video || null,
    });
  }
}

app.get('/api/automate/status', (req, res) => {
  res.json({
    running: automateRunState.running,
    stopped: automateRunState.stopped,
    suite: automateRunState.suite,
    key: automateRunState.key,
    attempt: automateRunState.attempt,
    lastResult: automateRunState.lastResult,
    created: automateRunState.created,
    error: automateRunState.error,
  });
});

/** Find feature file path containing @key tag. suite maps to features subdir (webTv->webtv, optools->optools). */
function getFeaturePathForKey(suite, key) {
  if (!key || key === 'undefined') return null;
  const suiteToDir = { webTv: 'webtv', webtv: 'webtv', optools: 'optools', coreApp: 'core-app', 'core-app': 'core-app' };
  // Infer suite from key when missing (WSTE->webtv, WQO->optools, WQ->core-app)
  const inferredSub = /^WSTE-/i.test(key) ? 'webtv' : /^WQO-/i.test(key) ? 'optools' : /^WQ-/i.test(key) ? 'core-app' : null;
  const subs = suite ? [suiteToDir[suite] || suite.toLowerCase(), suite] : [];
  const subList = [...new Set([...subs, inferredSub, 'webtv', 'optools', 'core-app'])].filter(Boolean);
  const featuresDirs = [FEATURES_DIR, path.resolve(process.cwd(), 'features')].filter((d) => fs.existsSync(d));
  for (const featuresDir of featuresDirs) {
    for (const sub of subList) {
      const dir = path.join(featuresDir, sub);
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.feature'));
      const tag = `@${key}`;
      const tagUpper = tag.toUpperCase();
      for (const file of files) {
        const fullPath = path.join(dir, file);
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          if (content.includes(tag) || content.toUpperCase().includes(tagUpper)) {
            return path.join('features', sub, file);
          }
        } catch (_) {}
      }
    }
  }
  return null;
}

/** Cucumber scenario title for a test key (from latest JSON report for that feature). */
function findScenarioNameForKey(suite, key) {
  if (!suite || !key) return null;
  const featurePath = getFeaturePathForKey(suite, key);
  if (!featurePath) return null;
  const projectRoot = path.resolve(__dirname);
  const reportsDir = path.join(projectRoot, 'reports', 'json');
  const baseName = path.basename(featurePath, '.feature');
  let reportFile = path.join(reportsDir, `${baseName}.json`);
  if (!fs.existsSync(reportFile) && fs.existsSync(reportsDir)) {
    const jsonFiles = fs.readdirSync(reportsDir).filter((f) => f.endsWith('.json'));
    const tag = `@${key}`;
    for (const f of jsonFiles) {
      try {
        const content = fs.readFileSync(path.join(reportsDir, f), 'utf8');
        if (content.includes(tag) || content.toUpperCase().includes(tag.toUpperCase())) {
          reportFile = path.join(reportsDir, f);
          break;
        }
      } catch (_) {}
    }
  }
  if (!fs.existsSync(reportFile)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
    const features = Array.isArray(data) ? data : [data];
    const tagU = `@${String(key).trim()}`.toUpperCase();
    for (const feat of features) {
      for (const el of feat.elements || []) {
        if (el.keyword?.toLowerCase().includes('background')) continue;
        const tags = (el.tags || []).map((t) => (t.name || '').trim().toUpperCase());
        if (tags.includes(tagU)) return el.name || null;
      }
    }
  } catch (_) {}
  return null;
}

/** Build tag expression for multiple keys: (@key1 or @key2 or ...). */
function getTagExpressionForKeys(keys) {
  if (!keys || keys.length === 0) return '';
  return keys.map((k) => `@${k}`).join(' or ');
}

/** Build tag expression to run only the requested key, excluding other keys in same file. */
function getTagExpressionForKey(suite, key) {
  const relPath = getFeaturePathForKey(suite, key);
  if (!relPath) return `@${key}`;
  const fullPath = path.join(__dirname, relPath);
  if (!fs.existsSync(fullPath)) return `@${key}`;
  const content = fs.readFileSync(fullPath, 'utf8');
  const keyRegex = /@(WSTE-\d+|WQO-\d+|WQ-\d+)/gi;
  const keys = [...content.matchAll(keyRegex)].map((m) => m[1].toUpperCase());
  const others = keys.filter((k) => k !== key.toUpperCase());
  if (others.length === 0) return `@${key}`;
  return `@${key} and not (${others.map((o) => `@${o}`).join(' or ')})`;
}

function pipeToConsole(prefix, data) {
  const str = typeof data === 'string' ? data : data.toString();
  if (!str.trim()) return;
  str.split('\n').forEach((line) => {
    if (line.trim()) console.log(`[wdio]${prefix ? ` ${prefix}` : ''} ${line}`);
  });
}

/** Run multiple tests in one WDIO invocation. Produces combined HTML report. Returns { passed, failed, results }. */
function runMultipleTests(suite, keys, envVal, options = {}) {
  return new Promise((resolve) => {
    const {
      headless = false,
      browser = 'chrome',
      recordVideo = false,
      parallelWorkers = 1,
      highlightElements = false,
      useSauce = false,
      trackForExecuteStop = false,
    } = options;
    if (useSauce) clearSauceScenarioUrlsFile();
    const recordActive = useSauce ? false : recordVideo;
    const projectRoot = path.resolve(__dirname);
    const specPaths = [];
    const seen = new Set();
    for (const key of keys) {
      const fp = getFeaturePathForKey(suite, key);
      if (fp) {
        const full = path.join(projectRoot, fp);
        if (!seen.has(full)) {
          seen.add(full);
          specPaths.push(full);
        }
      }
    }
    if (specPaths.length === 0) {
      return resolve({
        passed: 0,
        failed: keys.length,
        results: keys.map((k) => ({
          key: k,
          status: 'failed',
          failStep: null,
          failReason: 'No feature file',
          screenshot: null,
          video: null,
          sauceUrl: null,
        })),
      });
    }
    const tagExpr = getTagExpressionForKeys(keys);
    const args = ['run', resolveWdioConfig(useSauce)];
    for (const sp of specPaths) args.push('--spec', sp);
    args.push(`--cucumberOpts.tags=${tagExpr}`);
    let spawnEnv = { ...process.env, ENV: envVal || 'beta' };
    if (headless) spawnEnv.HEADLESS = '1';
    if (browser) spawnEnv.BROWSER = String(browser).toLowerCase();
    if (useSauce) {
      spawnEnv.DASHBOARD_SUITE = String(suite);
      spawnEnv.SAUCE_BROWSER = String(browser || 'chrome').toLowerCase();
    }
    spawnEnv = applyRecordVideoEnv(spawnEnv, recordActive);
    spawnEnv = applyHighlightEnv(spawnEnv, highlightElements);
    const browserLc = String(browser || 'chrome').toLowerCase();
    const instances =
      browserLc === 'safari' || keys.length <= 1
        ? 1
        : Math.min(16, Math.max(1, parseInt(String(parallelWorkers), 10) || 1));
    spawnEnv.WDIO_MAX_INSTANCES = String(instances);
    const child = spawn('npx', ['wdio', ...args], {
      cwd: projectRoot,
      env: spawnEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    fixState.activeChild = child;
    if (trackForExecuteStop) executeWdioChild = child;
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d) => { stdout += d.toString(); pipeToConsole('', d.toString()); });
    child.stderr?.on('data', (d) => { stderr += d.toString(); pipeToConsole('stderr', d.toString()); });
    child.on('close', (code, signal) => {
      fixState.activeChild = null;
      if (executeWdioChild === child) executeWdioChild = null;
      if (signal === 'SIGTERM' || signal === 'SIGKILL') {
        const sauceMapStop = useSauce ? loadSauceScenarioUrlMap() : null;
        return resolve({
          passed: 0,
          failed: keys.length,
          results: keys.map((k) => ({
            key: k,
            status: 'failed',
            failStep: null,
            failReason: 'Stopped by user',
            screenshot: null,
            video: null,
            sauceUrl: useSauce && sauceMapStop ? resolveSauceScenarioUrl(sauceMapStop, suite, k) : null,
          })),
        });
      }
      if (instances > 1) {
        console.log(`[wdio] parallel workers used: ${instances} (WDIO_MAX_INSTANCES)`);
      }
      const keySet = new Set(keys.map((k) => String(k).toUpperCase()));
      const results = [];
      let passed = 0;
      let failed = 0;
      const sauceMap = useSauce ? loadSauceScenarioUrlMap() : null;
      try {
        const reportsDir = path.join(__dirname, 'reports', 'json');
        const manifestPath = path.join(__dirname, 'reports', 'failure-screenshots.json');
        if (fs.existsSync(reportsDir)) {
          const jsonFiles = fs.readdirSync(reportsDir).filter((f) => f.endsWith('.json'));
          for (const f of jsonFiles) {
            try {
              const data = JSON.parse(fs.readFileSync(path.join(reportsDir, f), 'utf8'));
              const features = Array.isArray(data) ? data : [data];
              for (const feat of features) {
                if (!feat?.elements) continue;
                for (const el of feat.elements) {
                  if (el.keyword?.toLowerCase().includes('background')) continue;
                  const tags = (el.tags || []).map((t) => (t.name || '').replace(/^@/, '').trim().toUpperCase()).filter(Boolean);
                  const matchedTag = tags.find((t) => keySet.has(t));
                  const key = matchedTag ? keys.find((k) => String(k).toUpperCase() === matchedTag) : null;
                  if (!key) continue;
                  let status = 'passed';
                  let failReason = null;
                  let failStep = null;
                  let screenshot = null;
                  const scenarioId = `${feat.name || ''}::${el.name || ''}`;
                  if (el.steps) {
                    for (const step of el.steps) {
                      if (step.result?.status === 'failed') {
                        status = 'failed';
                        failReason = step.result.error_message || step.result.message || 'Unknown error';
                        failStep = [step.keyword, step.name].filter(Boolean).join(' ').trim() || null;
                        if (fs.existsSync(manifestPath)) {
                          try {
                            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
                            screenshot = manifest[scenarioId] || findScreenshotByScenarioName(manifest, el.name || '') || findScreenshotInDir(el.name || '');
                          } catch (_) {}
                        }
                        if (!screenshot) screenshot = findScreenshotInDir(el.name || '');
                        break;
                      }
                    }
                  }
                  if (status === 'passed') passed++;
                  else failed++;
                  const screenshotUrl = screenshot ? `/api/screenshots/${path.basename(screenshot)}` : null;
                  const scenarioTitle = el.name || '';
                  const vfile =
                    recordActive && scenarioTitle ? findVideoForScenarioName(scenarioTitle, VIDEOS_DIR) : null;
                  const videoUrl = vfile ? `/api/videos/${vfile}` : null;
                  const sauceUrl =
                    useSauce && sauceMap ? resolveSauceScenarioUrl(sauceMap, suite, key) : null;
                  results.push({
                    key,
                    status,
                    failStep,
                    failReason,
                    screenshot: screenshotUrl,
                    video: videoUrl,
                    sauceUrl,
                  });
                }
              }
            } catch (_) {}
          }
        }
        for (const k of keys) {
          if (!results.some((r) => r.key === k)) {
            const su =
              useSauce && sauceMap ? resolveSauceScenarioUrl(sauceMap, suite, k) : null;
            results.push({
              key: k,
              status: 'failed',
              failStep: null,
              failReason: 'No result in report',
              screenshot: null,
              video: null,
              sauceUrl: su,
            });
            failed++;
          }
        }
      } catch (e) {
        for (const k of keys) {
          const su =
            useSauce && sauceMap ? resolveSauceScenarioUrl(sauceMap, suite, k) : null;
          results.push({
            key: k,
            status: 'failed',
            failStep: null,
            failReason: e.message,
            screenshot: null,
            video: null,
            sauceUrl: su,
          });
        }
        failed = keys.length;
        passed = 0;
      }
      resolve({ passed, failed, results });
    });
    child.on('error', (err) => {
      fixState.activeChild = null;
      if (executeWdioChild === child) executeWdioChild = null;
      resolve({
        passed: 0,
        failed: keys.length,
        results: keys.map((k) => ({
          key: k,
          status: 'failed',
          failStep: null,
          failReason: err.message,
          screenshot: null,
          video: null,
          sauceUrl: null,
        })),
      });
    });
  });
}

/** Extract actual error from wdio/cucumber output when Cucumber JSON report is missing. */
function extractFailReasonFromOutput(stdout, stderr) {
  const out = [stderr, stdout].filter(Boolean).join('\n');
  if (!out) return null;
  // Prefer the real step error over the wdio summary. Search for common patterns.
  const patterns = [
    /Error:\s*([^\n]+)/,
    /(Not implemented[^\n]*)/i,
    /(AssertionError[^\n]*)/i,
    /(element[^\n]*(?:not found|not displayed|not exist)[^\n]*)/i,
    /(no such element[^\n]*)/i,
    /(timeout[^\n]*(?:wait|exceeded)[^\n]*)/i,
  ];
  for (const re of patterns) {
    const m = out.match(re);
    if (m && m[1]) return (m[1] || m[0]).trim().slice(0, 500);
  }
  return out.slice(-600).trim() || null;
}

/** Run a single test and return result (for Fix loop). Does not block executeInProgress. */
function runSingleTest(suite, key, envVal, options = {}) {
  return new Promise((resolve) => {
    const {
      headless = false,
      browser = 'chrome',
      recordVideo = false,
      highlightElements = false,
      useSauce = false,
      trackForExecuteStop = false,
    } = options;
    const featurePath = getFeaturePathForKey(suite, key);
    if (!featurePath) {
      return resolve({
        status: 'failed',
        failReason: `No feature file for ${key}`,
        failStep: null,
        screenshot: null,
        video: null,
        sauceUrl: null,
      });
    }
    if (useSauce) clearSauceScenarioUrlsFile();
    const recordActive = useSauce ? false : recordVideo;
    const tagExpr = getTagExpressionForKey(suite, key);
    const projectRoot = path.resolve(__dirname);
    const specPath = path.join(projectRoot, featurePath);
    const args = [
      'run',
      resolveWdioConfig(useSauce),
      '--spec',
      specPath,
      `--cucumberOpts.tags=${tagExpr}`,
    ];
    let spawnEnv = { ...process.env, ENV: envVal || 'beta' };
    if (headless) spawnEnv.HEADLESS = '1';
    if (browser) spawnEnv.BROWSER = String(browser).toLowerCase();
    if (useSauce) {
      spawnEnv.DASHBOARD_SUITE = String(suite);
      spawnEnv.SAUCE_BROWSER = String(browser || 'chrome').toLowerCase();
    }
    spawnEnv = applyRecordVideoEnv(spawnEnv, recordActive);
    spawnEnv = applyHighlightEnv(spawnEnv, highlightElements);
    spawnEnv.WDIO_MAX_INSTANCES = '1';
    const child = spawn('npx', ['wdio', ...args], {
      cwd: projectRoot,
      env: spawnEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    fixState.activeChild = child;
    if (trackForExecuteStop) executeWdioChild = child;
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d) => {
      const s = d.toString();
      stdout += s;
      pipeToConsole('', s);
    });
    child.stderr?.on('data', (d) => {
      const s = d.toString();
      stderr += s;
      pipeToConsole('stderr', s);
    });

    child.on('close', (code, signal) => {
      fixState.activeChild = null;
      if (executeWdioChild === child) executeWdioChild = null;
      if (signal === 'SIGTERM' || signal === 'SIGKILL') {
        return resolve({
          status: 'failed',
          failReason: 'Stopped by user',
          failStep: null,
          screenshot: null,
          video: null,
          sauceUrl: null,
        });
      }
      const sauceMap = useSauce ? loadSauceScenarioUrlMap() : null;
      let status = 'passed';
      let failReason = null;
      let failStep = null;
      let screenshot = null;
      let featureName = null;
      let scenarioName = null;
      try {
        const reportsDir = path.join(__dirname, 'reports', 'json');
        const manifestPath = path.join(__dirname, 'reports', 'failure-screenshots.json');
        const baseName = path.basename(featurePath, '.feature');
        let reportFile = path.join(reportsDir, `${baseName}.json`);
        if (!fs.existsSync(reportFile) && fs.existsSync(reportsDir)) {
          const jsonFiles = fs.readdirSync(reportsDir).filter((f) => f.endsWith('.json'));
          const tag = `@${key}`;
          for (const f of jsonFiles) {
            try {
              const content = fs.readFileSync(path.join(reportsDir, f), 'utf8');
              if (content.includes(tag) || content.toUpperCase().includes(tag.toUpperCase())) {
                reportFile = path.join(reportsDir, f);
                break;
              }
            } catch (_) {}
          }
        }
        if (fs.existsSync(reportFile)) {
          const data = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
          const features = Array.isArray(data) ? data : [data];
          const lastFeat = features[features.length - 1];
          if (lastFeat?.elements) {
            for (const el of lastFeat.elements) {
              if (el.keyword?.toLowerCase().includes('background')) continue;
              const scenarioId = `${lastFeat.name || ''}::${el.name || ''}`;
              let failed = false;
              if (el.steps) {
                for (const step of el.steps) {
                  if (step.result?.status === 'failed') {
                    failed = true;
                    failReason = step.result.error_message || step.result.message || 'Unknown error';
                    failStep = [step.keyword, step.name].filter(Boolean).join(' ').trim() || null;
                    featureName = lastFeat.name || null;
                    scenarioName = el.name || null;
                    break;
                  }
                }
              }
          status = failed ? 'failed' : 'passed';
          if (failed) {
            const sn = el.name || '';
            if (fs.existsSync(manifestPath)) {
              try {
                const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
                screenshot =
                  manifest[scenarioId] ||
                  findScreenshotByScenarioName(manifest, sn) ||
                  findScreenshotInDir(sn);
              } catch (_) {}
            }
            if (!screenshot) screenshot = findScreenshotInDir(sn);
            if (!screenshot && fs.existsSync(SCREENSHOTS_DIR)) {
              const files = fs.readdirSync(SCREENSHOTS_DIR).filter((f) => f.endsWith('.png'));
              if (files.length === 1) screenshot = files[0];
              else if (files.length > 1) {
                const sorted = files
                  .map((f) => ({ name: f, mtime: fs.statSync(path.join(SCREENSHOTS_DIR, f)).mtimeMs }))
                  .sort((a, b) => b.mtime - a.mtime);
                screenshot = sorted[0]?.name;
              }
            }
          }
          break;
            }
          }
        }
        if (code !== 0 && status === 'passed') status = 'failed';
        if (status === 'failed' && !failReason) {
          failReason = extractFailReasonFromOutput(stdout, stderr) || stderr || stdout?.slice(-500) || 'Test failed';
        }
      } catch (e) {
        status = 'failed';
        failReason = e.message;
      }
      const screenshotUrl = screenshot ? `/api/screenshots/${screenshot}` : null;
      let videoUrl = null;
      if (recordActive) {
        const sn = scenarioName || findScenarioNameForKey(suite, key);
        if (sn) {
          const v = findVideoForScenarioName(sn, VIDEOS_DIR);
          if (v) videoUrl = `/api/videos/${v}`;
        }
      }
      const sauceUrl =
        useSauce && sauceMap ? resolveSauceScenarioUrl(sauceMap, suite, key) : null;
      resolve({
        status,
        failReason,
        failStep,
        screenshot: screenshotUrl,
        featureName,
        scenarioName,
        video: videoUrl,
        sauceUrl,
      });
    });

    child.on('error', (err) => {
      fixState.activeChild = null;
      if (executeWdioChild === child) executeWdioChild = null;
      resolve({
        status: 'failed',
        failReason: err.message,
        failStep: null,
        screenshot: null,
        video: null,
        sauceUrl: null,
      });
    });
  });
}

/** Fix loop: run test, on fail capture (hooks do self-heal), retry until pass or stopped. */
async function runFixLoop(suite, key, envVal) {
  fixState.running = true;
  fixState.stopped = false;
  fixState.suite = suite;
  fixState.key = key;
  fixState.env = envVal || 'beta';
  fixState.attempt = 0;
  fixState.lastResult = null;

  while (!fixState.stopped) {
    fixState.attempt++;
    const sauceFix = !!fixState.useSauce;
    fixState.lastResult = await runSingleTest(suite, key, fixState.env, {
      headless: !!fixState.headless,
      browser: fixState.browser || 'chrome',
      highlightElements: fixState.highlightElements === true,
      useSauce: sauceFix,
    });
    saveExecuteResult(suite, key, {
      success: fixState.lastResult.status === 'passed',
      status: fixState.lastResult.status,
      failStep: fixState.lastResult.failStep,
      failReason: fixState.lastResult.failReason,
      screenshot: fixState.lastResult.screenshot,
      video: fixState.lastResult.video || null,
      sauceUrl: fixState.lastResult.sauceUrl || null,
    });
    if (fixState.lastResult.status === 'passed') {
      fixState.running = false;
      fixState.stopped = true;
      return;
    }
    if (fixState.stopped) break;
    const failReason = fixState.lastResult.failReason || '';
    const failStep = fixState.lastResult.failStep || '';

    const {
      isNotImplementedError,
      tryFixNotImplementedError,
      isNavigationError,
      tryFixNavigationError,
    } = require('./ai/webtvQaEngineer');
    if (isNotImplementedError(failReason)) {
      try {
        const fixResult = tryFixNotImplementedError(failStep);
        if (fixResult.applied) {
          console.log(`[Fix] Not implemented → removed stub (${fixResult.source}): ${path.basename(fixResult.file)}`);
          await new Promise((r) => setTimeout(r, 3000));
          continue;
        }
      } catch (e) {
        console.warn('[Fix] Not-implemented fix error:', e.message);
      }
    }
    if (isNavigationError(failReason)) {
      try {
        const fixResult = tryFixNavigationError(failStep);
        if (fixResult.applied) {
          console.log(`[Fix] Navigation → increased timeout (${fixResult.source}): ${path.basename(fixResult.file)}`);
          await new Promise((r) => setTimeout(r, 3000));
          continue;
        }
      } catch (e) {
        console.warn('[Fix] Navigation fix error:', e.message);
      }
    }

    const { plan, generate, isElementError } = require('./ai/agents');
    const isElErr = isElementError && isElementError(failReason);
    if (isElErr) {
      try {
        const fixPlan = await plan({
          failReason,
          failStep,
          stepText: failStep,
          scenario: key,
        });
        const genResult = generate(fixPlan);
        if (genResult.applied) {
          console.log(`[Fix] Agents applied: ${genResult.oldSelector} → ${genResult.newSelector} in ${genResult.file}`);
        }
      } catch (e) {
        console.warn('[Fix] Agents error:', e.message);
      }
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  fixState.running = false;
}

let executeInProgress = false;
/** Set when /api/execute or /api/execute-suite spawns WDIO (not Fix/Automate). Used to tree-kill browser. */
let executeWdioChild = null;

app.get('/api/execute/status', (req, res) => {
  res.json({ running: executeInProgress });
});

app.post('/api/execute/stop', (req, res) => {
  if (!executeInProgress) {
    return res.status(400).json({ success: false, error: 'No dashboard test run in progress' });
  }
  if (!executeWdioChild || !executeWdioChild.pid) {
    return res.status(503).json({
      success: false,
      error: 'WDIO process not tracked (run may have just finished)',
    });
  }
  const pid = executeWdioChild.pid;
  try {
    kill(pid, 'SIGTERM');
    setTimeout(() => {
      try {
        if (executeWdioChild && executeWdioChild.pid === pid) {
          kill(pid, 'SIGKILL');
        }
      } catch (_) {}
    }, 8000);
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
  res.json({
    success: true,
    message: 'Stop signal sent to WDIO (local browser closed via process tree; Sauce session ends when WDIO stops)',
  });
});

app.post('/api/execute', async (req, res) => {
  if (executeInProgress || fixState.running) {
    return res.status(429).json({ error: 'Another test is already running' });
  }
  const { suite, key, headless, browser, recordVideo, highlightElements, useSauce } = req.body || {};
  if (!suite || !key) {
    return res.status(400).json({ error: 'suite and key required', success: false });
  }

  const featurePath = getFeaturePathForKey(suite, key);
  if (!featurePath) {
    return res.status(404).json({
      error: `No feature file found for ${key} in ${suite}`,
      success: false,
    });
  }

  const sauceOn = !!useSauce;
  if (sauceOn && !isSauceConfigured()) {
    return res.status(400).json({
      success: false,
      error: 'Sauce Labs: set SAUCE_USERNAME and SAUCE_ACCESS_KEY in .env (see README).',
    });
  }

  executeInProgress = true;
  const envVal = req.body.env || 'beta';
  try {
    const result = await runSingleTest(suite, key, envVal, {
      headless: !!headless,
      browser: browser || 'chrome',
      recordVideo: sauceOn ? false : !!recordVideo,
      highlightElements: highlightElements === true,
      useSauce: sauceOn,
      trackForExecuteStop: true,
    });
    const out = {
      success: result.status === 'passed',
      status: result.status,
      failStep: result.failStep,
      failReason: result.failReason,
      screenshot: result.screenshot,
      video: result.video || null,
      sauceUrl: result.sauceUrl || null,
    };
    saveExecuteResult(suite, key, out);
    res.json(out);
  } catch (e) {
    res.status(500).json({
      success: false,
      status: 'failed',
      failReason: e.message,
      screenshot: null,
      video: null,
      sauceUrl: null,
    });
  } finally {
    executeInProgress = false;
  }
});

app.get('/api/fix/status', (req, res) => {
  res.json({
    running: fixState.running,
    stopped: fixState.stopped,
    suite: fixState.suite,
    key: fixState.key,
    attempt: fixState.attempt,
    lastResult: fixState.lastResult,
    env: fixState.env,
    useSauce: !!fixState.useSauce,
  });
});

app.post('/api/fix/start', (req, res) => {
  if (fixState.running) {
    return res.status(429).json({ error: 'Fix already running' });
  }
  if (executeInProgress) {
    return res.status(429).json({ error: 'Execute in progress' });
  }
  const { suite, key, env, headless, browser, useSauce } = req.body || {};
  if (!suite || !key) {
    return res.status(400).json({ error: 'suite and key required' });
  }
  const featurePath = getFeaturePathForKey(suite, key);
  if (!featurePath) {
    return res.status(404).json({ error: `No feature file for ${key} in ${suite}` });
  }
  const sauceOn = !!useSauce;
  if (sauceOn && !isSauceConfigured()) {
    return res.status(400).json({
      error: 'Sauce Labs: set SAUCE_USERNAME and SAUCE_ACCESS_KEY in .env (see README).',
    });
  }
  fixState.stopped = false;
  fixState.headless = !!headless;
  fixState.browser = browser || 'chrome';
  fixState.highlightElements = req.body?.highlightElements === true;
  fixState.useSauce = sauceOn;
  runFixLoop(suite, key, env || 'beta').catch(() => {});
  res.json({ success: true, message: 'Fix loop started' });
});

app.post('/api/fix/stop', (req, res) => {
  fixState.stopped = true;
  if (fixState.activeChild && fixState.activeChild.pid) {
    try {
      kill(fixState.activeChild.pid, 'SIGTERM');
    } catch (_) {
      try { kill(fixState.activeChild.pid, 'SIGKILL'); } catch (_) {}
    }
  }
  res.json({ success: true, message: 'Stopping fix loop' });
});

let syncInProgress = false;
app.post('/api/sync', (req, res) => {
  if (syncInProgress) {
    return res.status(429).json({ error: 'Sync already in progress' });
  }
  syncInProgress = true;
  const scriptPath = path.join(__dirname, 'scripts', 'syncXrayTests.js');
  const child = spawn('node', [scriptPath], {
    cwd: __dirname,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout?.on('data', (d) => { stdout += d.toString(); });
  child.stderr?.on('data', (d) => { stderr += d.toString(); });
  child.on('close', (code) => {
    syncInProgress = false;
    if (code === 0) {
      res.json({ success: true, message: 'Sync complete', output: stdout });
    } else {
      res.status(500).json({ success: false, error: stderr || stdout || 'Sync failed' });
    }
  });
  child.on('error', (err) => {
    syncInProgress = false;
    res.status(500).json({ success: false, error: err.message });
  });
});

/** Wipe RAG vector DB (.rag-memory.json only), failure manifests/screenshots, and failed scenarios from run history. Domain seed `rag/domain-knowledge.json` is not deleted. */
app.post('/api/rag/refresh', (req, res) => {
  try {
    const { clearDb } = require('./rag/vectorDB');
    const result = clearDb({ failureManifests: true });
    const runs = loadRuns();
    let removedFromRuns = 0;
    let modified = false;
    for (const run of runs) {
      if (!run.scenarios) continue;
      const before = run.scenarios.length;
      run.scenarios = run.scenarios.filter((s) => s.status !== 'failed');
      const after = run.scenarios.length;
      removedFromRuns += before - after;
      if (before !== after) {
        modified = true;
        const metrics = computeMetricsFromScenarios(run.scenarios);
        run.passed = metrics.passed;
        run.failed = metrics.failed;
        run.skipped = metrics.skipped;
        run.total = metrics.total;
        run.passRate = metrics.passRate;
        run.byFeature = metrics.byFeature;
        run.failedScenarios = metrics.failedScenarios;
      }
    }
    if (modified) {
      saveRuns(runs);
      console.log('[RAG Refresh] Removed', removedFromRuns, 'failed scenarios from runs');
    }
    res.json({
      success: true,
      message: 'RAG memory, failure data, and failed scenarios from runs wiped',
      ...result,
      removedFromRuns,
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/restart', (req, res) => {
  res.json({ success: true, message: 'Building dashboard, then restarting server...' });
  const projectRoot = path.resolve(__dirname);
  const build = spawnSync('npm', ['run', 'dashboard:build'], {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: true,
  });
  if (build.status !== 0) {
    console.warn('[Restart] Dashboard build failed, restarting anyway.');
  }
  setTimeout(() => process.exit(0), 500);
});

app.get('/metrics', (req, res) => {
  const runs = loadRuns();
  const latest = runs[runs.length - 1];
  if (!latest) {
    return res.json([{ test: 'Login', confidence: 92 }, { test: 'Signup', confidence: 60 }]);
  }
  const byFeature = (latest.byFeature || []).map((f) => ({
    test: f.name,
    confidence: f.total > 0 ? Math.round((f.passed / f.total) * 100) : 0,
  }));
  res.json(byFeature.length ? byFeature : [{ test: 'Latest run', confidence: latest.total > 0 ? Math.round((latest.passed / latest.total) * 100) : 0 }]);
});

// Cucumber HTML report (reports/cucumber-html/index.html)
const CUCUMBER_REPORT_DIR = path.join(__dirname, 'reports', 'cucumber-html');
app.get('/api/report/status', (req, res) => {
  const indexPath = path.join(CUCUMBER_REPORT_DIR, 'index.html');
  const pdfPath = path.join(CUCUMBER_REPORT_DIR, 'cucumber-report.pdf');
  res.json({ exists: fs.existsSync(indexPath), pdfExists: fs.existsSync(pdfPath) });
});
app.use('/report', express.static(CUCUMBER_REPORT_DIR, { index: 'index.html' }));

// Serve static assets (must be after API routes)
app.use(express.static(DIST_DIR));

app.get('*', (req, res) => {
  const indexHtml = path.join(DIST_DIR, 'index.html');
  if (fs.existsSync(indexHtml)) {
    res.sendFile(indexHtml);
  } else {
    res.status(200).send(`
      <!DOCTYPE html>
      <html><head><title>QA Dashboard</title></head>
      <body style="font-family:system-ui;background:#0f0f12;color:#e8e8ed;padding:2rem;">
        <h1>QA Dashboard API</h1>
        <p>Endpoints: <a href="/api/metrics">/api/metrics</a> | <a href="/api/automation">/api/automation</a> | <a href="/api/trends">/api/trends</a> | <a href="/api/flaky">/api/flaky</a> | <a href="/api/runs">/api/runs</a></p>
        <p>Build the React app with <code>npm run dashboard:build</code> to see the full dashboard.</p>
      </body></html>
    `);
  }
});

app.listen(4000, () => console.log('Dashboard API running at http://localhost:4000'));
