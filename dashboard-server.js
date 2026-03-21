/**
 * QA Dashboard server - charts, trends, flaky detection
 * Run: node dashboard-server.js  (or npm run dashboard)
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const app = express();
const RUNS_FILE = path.join(__dirname, 'dashboard', 'data', 'runs.json');
const EXECUTE_RESULTS_FILE = path.join(__dirname, 'dashboard', 'data', 'execute-results.json');
const DISMISSED_FAILURES_FILE = path.join(__dirname, 'dashboard', 'data', 'dismissed-failures.json');
const SCREENSHOTS_DIR = path.join(__dirname, 'reports', 'screenshots');
const DIST_DIR = path.join(__dirname, 'dashboard', 'dist');
const TESTCASE_DIR = path.join(__dirname, 'testcase');
const FEATURES_DIR = path.join(__dirname, 'features');
const SYNC_CONFIG = path.join(TESTCASE_DIR, 'sync-config.json');

let pendingSyncData = {};

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

function getFlakyScenarios(runs, lastN = 20) {
  const recent = runs.slice(-lastN);
  const byScenario = {};

  for (const run of recent) {
    if (!run.scenarios) continue;
    for (const s of run.scenarios) {
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
  const keyRegex = /\b(WSTE-\d+|WQO-\d+)\b/gi;
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

function getTrends(runs, limit = 30) {
  return runs
    .slice(-limit)
    .map((r) => ({
      date: r.timestamp,
      label: new Date(r.timestamp).toLocaleDateString(),
      passed: r.passed || 0,
      failed: r.failed || 0,
      total: r.total || 0,
      passRate: r.total > 0 ? Math.round(((r.passed || 0) / r.total) * 100) : 0,
    }));
}

app.get('/api/metrics', (req, res) => {
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
  const failedScenarios = (latest.scenarios || [])
    .filter((s) => s.status === 'failed')
    .map((s) => ({
      id: s.id,
      feature: s.feature,
      name: s.name,
      failReason: s.failReason || null,
      screenshot: s.screenshot ? `/api/screenshots/${s.screenshot}` : null,
    }));
  res.json({
    hasData: true,
    runId: latest.id,
    timestamp: latest.timestamp,
    passed: latest.passed || 0,
    failed: latest.failed || 0,
    skipped: latest.skipped || 0,
    total: latest.total || 0,
    passRate: latest.total > 0 ? Math.round((latest.passed / latest.total) * 100) : 0,
    byFeature: latest.byFeature || [],
    failedScenarios,
  });
});

app.get('/api/screenshots/:filename', (req, res) => {
  const filename = req.params.filename.replace(/[^a-zA-Z0-9_.-]/g, '');
  if (!filename) return res.status(400).send('Invalid filename');
  const filepath = path.join(SCREENSHOTS_DIR, filename);
  if (!fs.existsSync(filepath)) return res.status(404).send('Screenshot not found');
  res.sendFile(filepath, { headers: { 'Content-Type': 'image/png' } });
});

app.get('/api/runs', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  const runs = loadRuns()
    .slice(-limit)
    .reverse()
    .map((r) => {
      const failedScenarios = (r.scenarios || [])
        .filter((s) => s.status === 'failed')
        .map((s) => ({
          id: s.id,
          feature: s.feature,
          name: s.name,
          failReason: s.failReason || null,
          screenshot: s.screenshot ? `/api/screenshots/${s.screenshot}` : null,
        }));
      return {
        id: r.id,
        timestamp: r.timestamp,
        date: r.date,
        env: r.env,
        passed: r.passed,
        failed: r.failed,
        total: r.total,
        passRate: r.total > 0 ? Math.round((r.passed / r.total) * 100) : 0,
        failedScenarios,
      };
    });
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
  const runs = loadRuns();
  res.json({ trends: getTrends(runs, limit) });
});

app.get('/api/automation', (req, res) => {
  res.json(getAutomationCoverage());
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

/** List all suites (folders in testcase/) with their scenarios. Automatically discovers new folders. */
app.get('/api/suites', (req, res) => {
  if (!fs.existsSync(TESTCASE_DIR)) return res.json({ suites: [] });
  const entries = fs.readdirSync(TESTCASE_DIR, { withFileTypes: true });
  const suites = entries
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
  res.json({ suites });
});

app.get('/api/execute-results', (req, res) => {
  res.json(loadExecuteResults());
});

function loadDismissedFailures() {
  if (!fs.existsSync(DISMISSED_FAILURES_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(DISMISSED_FAILURES_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveDismissedFailures(data) {
  try {
    fs.mkdirSync(path.dirname(DISMISSED_FAILURES_FILE), { recursive: true });
    fs.writeFileSync(DISMISSED_FAILURES_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.warn('Could not save dismissed failures:', e.message);
  }
}

app.get('/api/dismissed-failures', (req, res) => {
  res.json(loadDismissedFailures());
});

app.post('/api/dismissed-failures', (req, res) => {
  const { runId, scenarioIds, clearAll } = req.body || {};
  const data = loadDismissedFailures();
  if (clearAll && runId) {
    data[runId] = []; // Clear dismissals for this run (show all again)
  } else if (runId && Array.isArray(scenarioIds) && scenarioIds.length > 0) {
    const set = new Set(data[runId] || []);
    scenarioIds.forEach((id) => set.add(id));
    data[runId] = Array.from(set);
  }
  saveDismissedFailures(data);
  res.json({ success: true, dismissed: data });
});

/** List scenarios for a specific suite (legacy; use /api/suites for all) */
app.get('/api/scenarios/:suite', (req, res) => {
  const scenarios = getScenariosForSuite(req.params.suite);
  res.json({ scenarios });
});

app.get('/api/sync-config', (req, res) => {
  if (!fs.existsSync(SYNC_CONFIG)) return res.json({ suites: [] });
  try {
    const config = JSON.parse(fs.readFileSync(SYNC_CONFIG, 'utf8'));
    res.json({ suites: Object.keys(config) });
  } catch {
    res.json({ suites: [] });
  }
});

app.get('/api/flaky', (req, res) => {
  const lastN = parseInt(req.query.lastN, 10) || 20;
  const runs = loadRuns();
  res.json({ flaky: getFlakyScenarios(runs, lastN) });
});

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
      let oldGherkin = '';
      const oldPath = path.join(dir, `${key}.json`);
      if (fs.existsSync(oldPath)) {
        try {
          const oldData = JSON.parse(fs.readFileSync(oldPath, 'utf8'));
          oldGherkin = oldData.gherkin || '';
        } catch (_) {}
      }
      const newGherkin = nt.gherkin || '';
      const diff = wordDiff(oldGherkin, newGherkin);
      const hasChanges = diff.some((d) => d.status === 'changed');
      changes.push({
        key,
        summary: nt.summary,
        oldGherkin,
        newGherkin,
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

app.post('/api/sync/:suite/apply', (req, res) => {
  const suite = req.params.suite;
  const pending = pendingSyncData[suite];
  if (!pending) return res.status(400).json({ error: 'No pending sync for this suite. Click Sync first.' });

  try {
    const dir = path.join(TESTCASE_DIR, suite);
    fs.mkdirSync(dir, { recursive: true });
    for (const tc of pending) {
      const filename = `${tc.key || tc.issueId}.json`;
      fs.writeFileSync(path.join(dir, filename), JSON.stringify(tc, null, 2));
    }
    fs.writeFileSync(
      path.join(dir, 'testcases.json'),
      JSON.stringify(pending, null, 2)
    );
    delete pendingSyncData[suite];
    res.json({ success: true, message: 'Updated successfully' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/** Find feature file path containing @key tag. suite maps to features subdir (webTv->webtv, optools->optools). */
function getFeaturePathForKey(suite, key) {
  const suiteToDir = { webTv: 'webtv', optools: 'optools' };
  const subdir = suiteToDir[suite] || suite.toLowerCase();
  const dir = path.join(FEATURES_DIR, subdir);
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.feature'));
  const tag = `@${key}`;
  for (const file of files) {
    const content = fs.readFileSync(path.join(dir, file), 'utf8');
    if (content.includes(tag)) return path.join('features', subdir, file);
  }
  return null;
}

/** Build tag expression to run only the requested key, excluding other keys in same file. */
function getTagExpressionForKey(suite, key) {
  const relPath = getFeaturePathForKey(suite, key);
  if (!relPath) return `@${key}`;
  const fullPath = path.join(__dirname, relPath);
  if (!fs.existsSync(fullPath)) return `@${key}`;
  const content = fs.readFileSync(fullPath, 'utf8');
  const keyRegex = /@(WSTE-\d+|WQO-\d+)/gi;
  const keys = [...content.matchAll(keyRegex)].map((m) => m[1].toUpperCase());
  const others = keys.filter((k) => k !== key.toUpperCase());
  if (others.length === 0) return `@${key}`;
  return `@${key} and not (${others.map((o) => `@${o}`).join(' or ')})`;
}

let executeInProgress = false;
app.post('/api/execute', (req, res) => {
  if (executeInProgress) {
    return res.status(429).json({ error: 'Another test is already running' });
  }
  const { suite, key } = req.body || {};
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

  executeInProgress = true;
  const envVal = req.body.env || 'qa';
  const tagExpr = getTagExpressionForKey(suite, key);
  const args = [
    'run',
    path.join(__dirname, 'wdio.conf.js'),
    '--spec',
    featurePath,
    `--cucumberOpts.tags=${tagExpr}`,
  ];
  const child = spawn('npx', ['wdio', ...args], {
    cwd: __dirname,
    env: { ...process.env, ENV: envVal },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout?.on('data', (d) => { stdout += d.toString(); });
  child.stderr?.on('data', (d) => { stderr += d.toString(); });

  child.on('close', (code) => {
    executeInProgress = false;
    let status = 'passed';
    let failReason = null;
    let screenshot = null;

    try {
      const reportsDir = path.join(__dirname, 'reports', 'json');
      const manifestPath = path.join(__dirname, 'reports', 'failure-screenshots.json');
      if (fs.existsSync(reportsDir)) {
        const baseName = path.basename(featurePath, '.feature');
        const reportFile = path.join(reportsDir, `${baseName}.json`);
        if (fs.existsSync(reportFile)) {
          const data = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
          const features = Array.isArray(data) ? data : [data];
          const lastFeat = features[features.length - 1];
          let lastScenario = null;
          if (lastFeat?.elements) {
            for (const el of lastFeat.elements) {
              if (el.keyword?.toLowerCase().includes('background')) continue;
              lastScenario = { feat: lastFeat, el };
              break;
            }
          }
        if (lastScenario) {
          const { feat, el } = lastScenario;
          const scenarioId = `${feat.name || ''}::${el.name || ''}`;
          let failed = false;
          if (el.steps) {
            for (const step of el.steps) {
              if (step.result?.status === 'failed') {
                failed = true;
                failReason = step.result.error_message || step.result.message || 'Unknown error';
                break;
              }
            }
          }
          status = failed ? 'failed' : 'passed';
          if (failed && fs.existsSync(manifestPath)) {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            screenshot = manifest[scenarioId] || null;
          }
        }
        }
      }
    if (code !== 0 && status === 'passed') status = 'failed';
    if (status === 'failed' && !failReason) failReason = stderr || stdout?.slice(-500) || 'Test failed';
    } catch (e) {
      status = 'failed';
      failReason = e.message;
    }

    const result = {
      success: status === 'passed',
      status,
      failReason: status === 'failed' ? failReason : null,
      screenshot: status === 'failed' && screenshot ? `/api/screenshots/${screenshot}` : null,
    };
    saveExecuteResult(suite, key, result);
    res.json(result);
  });

  child.on('error', (err) => {
    executeInProgress = false;
    res.status(500).json({
      success: false,
      status: 'failed',
      failReason: err.message,
      screenshot: null,
    });
  });
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
