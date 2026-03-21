#!/usr/bin/env node
/**
 * Persists Cucumber JSON run results to data/runs/ for dashboard metrics, trends, and flaky detection.
 * Called automatically on test completion or run manually: node scripts/persistRunResults.js
 */

const fs = require('fs');
const path = require('path');

const REPORTS_JSON_DIR = path.join(process.cwd(), 'reports', 'json');
const DATA_DIR = path.join(process.cwd(), 'dashboard', 'data');
const RUNS_FILE = path.join(DATA_DIR, 'runs.json');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function parseCucumberJson(features) {
  const scenarios = [];
  let totalPassed = 0;
  let totalFailed = 0;
  let totalSkipped = 0;
  const byFeature = {};

  for (const feature of features) {
    const featureName = feature.name || feature.id || 'Unknown';
    if (!byFeature[featureName]) {
      byFeature[featureName] = { passed: 0, failed: 0, skipped: 0, scenarios: [] };
    }

    if (!feature.elements) continue;

    for (const el of feature.elements) {
      if (el.keyword && el.keyword.toLowerCase().includes('background')) continue;

      const scenarioName = el.name || el.id || 'Unknown';
      let passed = true;
      let skipped = false;

      if (el.steps) {
        for (const step of el.steps) {
          const status = step.result?.status;
          if (status === 'failed' || status === 'skipped') {
            passed = false;
            if (status === 'skipped') skipped = true;
          }
        }
      }

      const status = passed ? (skipped ? 'skipped' : 'passed') : 'failed';
      if (status === 'passed') {
        totalPassed++;
        byFeature[featureName].passed++;
      } else if (status === 'failed') {
        totalFailed++;
        byFeature[featureName].failed++;
      } else {
        totalSkipped++;
        byFeature[featureName].skipped++;
      }

      scenarios.push({
        id: `${featureName}::${scenarioName}`,
        feature: featureName,
        name: scenarioName,
        status,
      });
      byFeature[featureName].scenarios.push({ name: scenarioName, status });
    }
  }

  return {
    total: scenarios.length,
    passed: totalPassed,
    failed: totalFailed,
    skipped: totalSkipped,
    scenarios,
    byFeature: Object.entries(byFeature).map(([name, data]) => ({
      name,
      passed: data.passed,
      failed: data.failed,
      skipped: data.skipped,
      total: data.scenarios.length,
    })),
  };
}

function persistRun() {
  ensureDir(DATA_DIR);

  if (!fs.existsSync(REPORTS_JSON_DIR)) {
    console.log('⚠️ No reports/json folder - run tests first');
    return null;
  }

  const files = fs.readdirSync(REPORTS_JSON_DIR).filter((f) => f.endsWith('.json'));
  if (files.length === 0) {
    console.log('⚠️ No Cucumber JSON files found in reports/json');
    return null;
  }

  const features = [];
  for (const file of files) {
    try {
      const content = JSON.parse(fs.readFileSync(path.join(REPORTS_JSON_DIR, file), 'utf8'));
      if (Array.isArray(content)) {
        features.push(...content);
      } else if (content.elements || content.id) {
        features.push(content);
      }
    } catch (e) {
      console.warn(`Skipped ${file}: ${e.message}`);
    }
  }

  const summary = parseCucumberJson(features);
  const run = {
    id: `run-${Date.now()}`,
    timestamp: new Date().toISOString(),
    date: new Date().toISOString().slice(0, 10),
    env: process.env.ENV || 'qa',
    ...summary,
  };

  let runs = [];
  if (fs.existsSync(RUNS_FILE)) {
    try {
      runs = JSON.parse(fs.readFileSync(RUNS_FILE, 'utf8'));
    } catch (_) {}
  }

  runs.push(run);
  // Keep last 100 runs for trends/flaky
  if (runs.length > 100) {
    runs = runs.slice(-100);
  }
  fs.writeFileSync(RUNS_FILE, JSON.stringify(runs, null, 2));
  console.log(`✅ Persisted run: ${run.passed} passed, ${run.failed} failed (${run.total} total)`);
  return run;
}

if (require.main === module) {
  persistRun();
} else {
  module.exports = { persistRun, parseCucumberJson };
}
