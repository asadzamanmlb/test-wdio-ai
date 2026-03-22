#!/usr/bin/env node
/**
 * Sync feature files → testcase JSON (and optionally Xray).
 * When you edit a .feature file directly (add/remove steps), run this to:
 * 1. Update testcase/<suite>/<KEY>.json with the new gherkin
 * 2. Optionally push to Xray (--xray)
 *
 * Usage:
 *   node scripts/syncFeatureToTestcase.js [--xray] [feature-path]
 *   npm run sync:feature              # Sync all features in features/
 *   npm run sync:feature -- --xray    # Sync + push to Xray
 *   node scripts/syncFeatureToTestcase.js features/webtv/smoke-verify-archive-game-playback-defau.feature
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FEATURES_DIR = path.join(ROOT, 'features');
const TESTCASE_DIR = path.join(ROOT, 'testcase');

const FEATURE_DIR_TO_TESTCASE = {
  webtv: 'webTv',
  optools: 'optools',
  'core-app': 'core-app',
};

const KEY_TAG_RE = /@(WSTE-\d+|WQO-\d+|WQ-\d+)/gi;
const STEP_RE = /^\s*(Given|When|Then|And|But)\s+(.+)$/i;
const SCENARIO_RE = /^\s*Scenario(?:\s+Outline)?\s*:?\s*(.*)$/i;

function extractScenariosFromFeature(content, filePath) {
  const scenarios = [];
  const lines = content.split(/\n/);
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

      for (const key of keys) {
        if (steps.length) {
          scenarios.push({ key, gherkin: steps.join('\n'), scenarioTitle: scenarioMatch[1]?.trim() || '' });
        }
      }
      continue;
    }
    i++;
  }
  return scenarios;
}

function getTestcaseSuiteForKey(key) {
  const k = String(key).toUpperCase();
  if (k.startsWith('WSTE')) return 'webTv';
  if (k.startsWith('WQO')) return 'optools';
  if (k.startsWith('WQ-')) return 'core-app';
  return null;
}

function syncFeatureFile(featurePath, options = {}) {
  const { dryRun = false, log = console.log } = options;
  const content = fs.readFileSync(featurePath, 'utf8');
  const relativePath = path.relative(ROOT, featurePath);
  const parts = relativePath.replace(/\\/g, '/').split('/');
  const featureDir = parts[1] || ''; // e.g. webtv, optools, core-app
  const testcaseSuite = FEATURE_DIR_TO_TESTCASE[featureDir] || getTestcaseSuiteForKey(parts[0]);

  const scenarios = extractScenariosFromFeature(content, featurePath);
  const updated = [];

  for (const { key, gherkin } of scenarios) {
    const suite = testcaseSuite || getTestcaseSuiteForKey(key);
    if (!suite) {
      log(`  ⚠ Skip ${key}: cannot determine testcase suite`);
      continue;
    }
    const tcPath = path.join(TESTCASE_DIR, suite, `${key}.json`);
    if (!fs.existsSync(tcPath)) {
      log(`  ⚠ Skip ${key}: no testcase at ${tcPath}`);
      continue;
    }

    let tc;
    try {
      tc = JSON.parse(fs.readFileSync(tcPath, 'utf8'));
    } catch (e) {
      log(`  ⚠ Skip ${key}: invalid JSON: ${e.message}`);
      continue;
    }

    const oldGherkin = (tc.gherkin || '').trim();
    const newGherkin = gherkin.trim();
    if (oldGherkin === newGherkin) {
      log(`  - ${key} (unchanged)`);
      continue;
    }

    tc.gherkin = newGherkin;
    tc.steps = gherkinToSteps(newGherkin);
    if (!dryRun) {
      fs.writeFileSync(tcPath, JSON.stringify(tc, null, 2));
    }
    updated.push({ key, suite, tcPath, tc });
    log(`  ✓ ${key} updated`);
  }

  return updated;
}

function gherkinToSteps(gherkin) {
  const steps = [];
  const STEP_RE2 = /^\s*(Given|When|Then|And|But)\s+(.+)$/im;
  for (const line of (gherkin || '').split(/\n/)) {
    const m = line.match(STEP_RE2);
    if (m) {
      steps.push({
        id: steps.length ? `step-${steps.length}` : 'step-0',
        action: `${m[1]} ${m[2].trim()}`,
        data: '',
        result: '',
      });
    }
  }
  return steps;
}

function syncAllFeatures(options = {}) {
  const { dryRun = false, log = console.log } = options;
  const dirs = Object.keys(FEATURE_DIR_TO_TESTCASE);
  let totalUpdated = 0;

  for (const dir of dirs) {
    const featureSubDir = path.join(FEATURES_DIR, dir);
    if (!fs.existsSync(featureSubDir)) continue;

    const files = fs.readdirSync(featureSubDir).filter((f) => f.endsWith('.feature'));
    for (const file of files) {
      const fp = path.join(featureSubDir, file);
      const updated = syncFeatureFile(fp, { dryRun, log });
      totalUpdated += updated.length;
    }
  }

  return totalUpdated;
}

function main() {
  const args = process.argv.slice(2);
  const hasXray = args.includes('--xray');
  const dryRun = args.includes('--dry-run');
  const rest = args.filter((a) => !a.startsWith('--'));

  console.log('🔄 Syncing feature files → testcase JSON\n');

  let total = 0;
  if (rest.length) {
    for (const p of rest) {
      const fp = path.isAbsolute(p) ? p : path.join(ROOT, p);
      if (!fs.existsSync(fp)) {
        console.error(`  ✗ File not found: ${fp}`);
        continue;
      }
      total += syncFeatureFile(fp, { dryRun }).length;
    }
  } else {
    total = syncAllFeatures({ dryRun });
  }

  console.log(`\n✅ ${total} testcase(s) updated`);

  if (hasXray && total > 0 && !dryRun) {
    console.log('\n📤 Push to Xray:');
    console.log('   Run: node xray/importFeatureToXray.js <feature-path>');
    console.log('   Or: In Jira Xray → Import Cucumber → upload the .feature file');
  }

  process.exit(0);
}

main();
