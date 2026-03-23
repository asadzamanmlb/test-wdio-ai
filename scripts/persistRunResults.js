#!/usr/bin/env node
/**
 * Persists Cucumber JSON run results to data/runs/ for dashboard metrics, trends, and flaky detection.
 * Called automatically on test completion or run manually: node scripts/persistRunResults.js
 */

const fs = require('fs');
const path = require('path');
const { findVideoForScenarioName } = require('./testRunVideo');

const REPORTS_JSON_DIR = path.join(process.cwd(), 'reports', 'json');
const SCREENSHOTS_DIR = path.join(process.cwd(), 'reports', 'screenshots');
const VIDEOS_DIR = path.join(process.cwd(), 'reports', 'videos');
const FAILURE_MANIFEST = path.join(process.cwd(), 'reports', 'failure-screenshots.json');
const DATA_DIR = path.join(process.cwd(), 'dashboard', 'data');
const RUNS_FILE = path.join(DATA_DIR, 'runs.json');
const EXECUTE_RESULTS_FILE = path.join(DATA_DIR, 'execute-results.json');

function keyToSuite(key) {
  if (!key || typeof key !== 'string') return null;
  const k = key.toUpperCase();
  if (k.startsWith('WSTE')) return 'webTv';
  if (k.startsWith('WQO')) return 'optools';
  if (k.startsWith('WQ-')) return 'core-app';
  return null;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadFailureManifest() {
  if (!fs.existsSync(FAILURE_MANIFEST)) return {};
  try {
    return JSON.parse(fs.readFileSync(FAILURE_MANIFEST, 'utf8'));
  } catch {
    return {};
  }
}

/** Fallback: find screenshot by matching scenario name (handles hooks/persistRun scenarioId drift) */
function findScreenshotByScenarioName(manifest, scenarioName) {
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const needle = norm(scenarioName);
  for (const [key, val] of Object.entries(manifest)) {
    const keyScenario = key.includes('::') ? key.split('::').slice(1).join('::') : key;
    const keyNorm = norm(keyScenario);
    if (keyNorm === needle || keyNorm.includes(needle) || needle.includes(keyNorm)) {
      return val;
    }
  }
  return null;
}

/** Fallback: scan screenshots dir for file matching scenario name when manifest lookup fails */
function findScreenshotInDir(scenarioName) {
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
  if (files.length === 1) return files[0];
  return null;
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

      let failReason = null;
      let failStep = null;
      let screenshotPath = null;
      const scenarioId = `${featureName}::${scenarioName}`;
      if (status === 'failed' && el.steps) {
        const failedStep = el.steps.find((s) => s.result?.status === 'failed');
        if (failedStep) {
          if (failedStep.result?.error_message) failReason = failedStep.result.error_message;
          failStep = [failedStep.keyword, failedStep.name].filter(Boolean).join(' ').trim() || null;
        }
        const manifest = loadFailureManifest();
        screenshotPath =
          manifest[scenarioId] ||
          manifest[`Feature::${scenarioName}`] ||
          findScreenshotByScenarioName(manifest, scenarioName) ||
          findScreenshotInDir(scenarioName);
      }

      // Extract test key from tags (@WSTE-44, @WQO-123, @WQ-456) for execute-results sync
      let key = null;
      if (el.tags && Array.isArray(el.tags)) {
        const tag = el.tags.find((t) => /^@(WSTE-\d+|WQO-\d+|WQ-\d+)$/i.test((t.name || '').trim()));
        if (tag) key = (tag.name || '').trim().replace(/^@/i, '');
      }
      if (!key) {
        const m = scenarioName.match(/\((WSTE-\d+|WQO-\d+|WQ-\d+)\)/i);
        if (m) key = m[1];
      }

      const videoBasename = findVideoForScenarioName(scenarioName, VIDEOS_DIR);

      scenarios.push({
        id: scenarioId,
        feature: featureName,
        name: scenarioName,
        status,
        failReason: status === 'failed' ? failReason : null,
        failStep: status === 'failed' ? failStep : null,
        screenshot: status === 'failed' ? screenshotPath : null,
        video: videoBasename || undefined,
        key: key || undefined,
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
    env: process.env.ENV || 'beta',
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

  // Sync execute-results so dashboard scenario list reflects latest run
  syncExecuteResults(run);
  return run;
}

/** Update execute-results.json for scenarios in this run so dashboard shows correct pass/fail */
function syncExecuteResults(run) {
  if (!run?.scenarios?.length) return;
  let data = {};
  if (fs.existsSync(EXECUTE_RESULTS_FILE)) {
    try {
      data = JSON.parse(fs.readFileSync(EXECUTE_RESULTS_FILE, 'utf8'));
    } catch (_) {}
  }
  let updated = 0;
  for (const s of run.scenarios) {
    const key = s.key;
    if (!key) continue;
    const suite = keyToSuite(key);
    if (!suite) continue;
    const id = `${suite}:${key}`;
    data[id] = {
      success: s.status === 'passed',
      status: s.status,
      failStep: s.failStep || null,
      failReason: s.failReason || null,
      screenshot: s.screenshot || null,
      video: s.video ? `/api/videos/${path.basename(String(s.video))}` : null,
      timestamp: run.timestamp || new Date().toISOString(),
    };
    updated++;
  }
  if (updated > 0) {
    fs.mkdirSync(path.dirname(EXECUTE_RESULTS_FILE), { recursive: true });
    fs.writeFileSync(EXECUTE_RESULTS_FILE, JSON.stringify(data, null, 2));
    console.log(`   Updated execute-results for ${updated} scenario(s)`);
  }
}

if (require.main === module) {
  persistRun();
} else {
  module.exports = { persistRun, parseCucumberJson };
}
