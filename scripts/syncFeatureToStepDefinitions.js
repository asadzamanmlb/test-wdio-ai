#!/usr/bin/env node
/**
 * Sync feature file → step definitions.
 * When you add or change steps in a .feature file, run this to add/update
 * the corresponding step definitions in features/step-definitions/.
 *
 * Called by Update Xray flow, or run manually:
 *   node scripts/syncFeatureToStepDefinitions.js <feature-path>
 *   node scripts/syncFeatureToStepDefinitions.js features/webtv/smoke-verify-archive-game-playback-defau.feature
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FEATURES_DIR = path.join(ROOT, 'features');
const STEP_DEFS_DIR = path.join(FEATURES_DIR, 'step-definitions');

const KEY_TAG_RE = /@(WSTE-\d+|WQO-\d+|WQ-\d+)/gi;
const STEP_RE = /^\s*(Given|When|Then|And|But)\s+(.+)$/i;
const SCENARIO_RE = /^\s*Scenario(?:\s+Outline)?\s*:?\s*(.*)$/i;

function extractScenariosFromFeature(content) {
  const scenarios = [];
  const lines = content.split('\n');
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
          scenarios.push({ key, gherkin: steps.join('\n') });
        }
      }
      continue;
    }
    i++;
  }
  return scenarios;
}

function getProjectFromKey(key) {
  const k = String(key || '').toUpperCase();
  if (k.startsWith('WSTE')) return 'webTv';
  if (k.startsWith('WQO')) return 'optools';
  if (k.startsWith('WQ-')) return 'core-app';
  return 'webTv';
}

function syncFeatureToStepDefinitions(featurePath, options = {}) {
  const { dryRun = false, log = () => {} } = options;
  const resolved = path.isAbsolute(featurePath) ? featurePath : path.join(ROOT, featurePath);
  if (!fs.existsSync(resolved)) {
    return { success: false, error: `Feature file not found: ${resolved}` };
  }

  const content = fs.readFileSync(resolved, 'utf8');
  const scenarios = extractScenariosFromFeature(content);
  if (!scenarios.length) {
    return { success: true, updated: false, message: 'No scenarios with steps found' };
  }

  const basename = path.basename(resolved, '.feature');
  const stepDefFileName = `${basename}.steps.js`;
  const stepDefPath = path.join(STEP_DEFS_DIR, stepDefFileName);

  const { generateStepDefStubs, appendStepsToFile } = require('./automateScenario');

  let updated = false;
  const allGherkin = [...new Set(scenarios.map((s) => s.gherkin))].join('\n\n');
  const firstKey = scenarios[0]?.key;
  const project = getProjectFromKey(firstKey);

  if (!fs.existsSync(stepDefPath)) {
    if (!dryRun) {
      fs.mkdirSync(STEP_DEFS_DIR, { recursive: true });
      const stubs = generateStepDefStubs(allGherkin, firstKey, project, null);
      fs.writeFileSync(stepDefPath, stubs);
    }
    updated = true;
    log(`Created features/step-definitions/${stepDefFileName}`);
  } else {
    if (!dryRun) {
      const before = fs.readFileSync(stepDefPath, 'utf8');
      appendStepsToFile(stepDefPath, allGherkin, firstKey, { stepDefsDir: STEP_DEFS_DIR });
      const after = fs.readFileSync(stepDefPath, 'utf8');
      updated = before !== after;
    } else {
      updated = true;
    }
    if (updated) log(`Updated features/step-definitions/${stepDefFileName}`);
  }

  return {
    success: true,
    updated,
    stepDefPath: `features/step-definitions/${stepDefFileName}`,
  };
}

if (require.main === module) {
  const featurePath = process.argv[2];
  if (!featurePath) {
    console.error('Usage: node scripts/syncFeatureToStepDefinitions.js <feature-path>');
    process.exit(1);
  }
  const result = syncFeatureToStepDefinitions(featurePath, { log: console.log });
  if (!result.success) {
    console.error(result.error);
    process.exit(1);
  }
  process.exit(0);
}

module.exports = { syncFeatureToStepDefinitions };
