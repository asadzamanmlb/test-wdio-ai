/**
 * QA Dashboard server - charts, trends, flaky detection
 * Run: node dashboard-server.js  (or npm run dashboard)
 */
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const RUNS_FILE = path.join(__dirname, 'dashboard', 'data', 'runs.json');
const DIST_DIR = path.join(__dirname, 'dashboard', 'dist');
const TESTCASE_DIR = path.join(__dirname, 'testcase');
const FEATURES_DIR = path.join(__dirname, 'features');

app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  next();
});

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

/** Count test cases in testcase/<folder>/*.json (excl testcases.json) */
function countTestCasesByFolder() {
  const result = {};
  for (const folder of ['optools', 'webTv']) {
    const dir = path.join(TESTCASE_DIR, folder);
    if (!fs.existsSync(dir)) {
      result[folder] = { total: 0, automated: 0, manual: 0 };
      continue;
    }
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'testcases.json');
    const total = files.length;
    result[folder] = { total, automated: 0, manual: total };
  }
  return result;
}

/** Automation coverage: optools and webTv automated vs manual */
function getAutomationCoverage() {
  const automatedKeys = getAutomatedKeysFromFeatures();
  const byFolder = countTestCasesByFolder();

  for (const folder of ['optools', 'webTv']) {
    const dir = path.join(TESTCASE_DIR, folder);
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'testcases.json');
    let automated = 0;
    for (const file of files) {
      const key = file.replace('.json', '');
      if (automatedKeys.has(key)) automated++;
    }
    byFolder[folder].automated = automated;
    byFolder[folder].manual = byFolder[folder].total - automated;
  }

  return {
    optools: byFolder.optools,
    webTv: byFolder.webTv,
    totalAutomated: byFolder.optools.automated + byFolder.webTv.automated,
    totalManual: byFolder.optools.manual + byFolder.webTv.manual,
    total: byFolder.optools.total + byFolder.webTv.total,
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
    });
  }
  res.json({
    hasData: true,
    timestamp: latest.timestamp,
    passed: latest.passed || 0,
    failed: latest.failed || 0,
    skipped: latest.skipped || 0,
    total: latest.total || 0,
    passRate: latest.total > 0 ? Math.round((latest.passed / latest.total) * 100) : 0,
    byFeature: latest.byFeature || [],
  });
});

app.get('/api/runs', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  const runs = loadRuns()
    .slice(-limit)
    .reverse()
    .map((r) => ({
      id: r.id,
      timestamp: r.timestamp,
      date: r.date,
      env: r.env,
      passed: r.passed,
      failed: r.failed,
      total: r.total,
      passRate: r.total > 0 ? Math.round((r.passed / r.total) * 100) : 0,
    }));
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

app.get('/api/flaky', (req, res) => {
  const lastN = parseInt(req.query.lastN, 10) || 20;
  const runs = loadRuns();
  res.json({ flaky: getFlakyScenarios(runs, lastN) });
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
