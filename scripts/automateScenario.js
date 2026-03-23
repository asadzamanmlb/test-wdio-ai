#!/usr/bin/env node
/**
 * Automate a manual test scenario: create feature file, step definitions, page objects.
 * Uses reference implementations from: webTv-temp, operator-tool-temp, or core-app-temp
 * based on project (WSTE->webTv, WQO->optools, WQ->core-app).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TESTCASE_DIR = path.join(ROOT, 'testcase');
const FEATURES_DIR = path.join(ROOT, 'features');
const TEMP_MAP = {
  webTv: path.join(ROOT, 'webTv-temp'),
  optools: path.join(ROOT, 'operator-tool-temp'),
  coreApp: path.join(ROOT, 'core-app-temp'),
};

const SUITE_TO_PROJECT = {
  webTv: 'webTv',
  webtv: 'webTv',
  optools: 'optools',
  coreApp: 'coreApp',
  coreapp: 'coreApp',
};

const PROJECT_TO_FEATURE_DIR = {
  webTv: 'webtv',
  optools: 'optools',
  coreApp: 'core-app',
};

const KEYWORD_RE = /^\s*\*?(Given|When|Then|And|Or)\s*\*?\s*/i;

/** Cucumber string expressions treat (, ), /, {, } as special. Use regex for these. */
function needsRegexPattern(text) {
  if (!text || typeof text !== 'string') return false;
  return /[(){}\[\]]/.test(text) || /\([^)]*\)/.test(text) || text.includes('/');
}

function toRegexEscaped(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\//g, '\\/')
    .replace(/[.*+?^${}()|[\]]/g, '\\$&');
}
const WIKI_LINK_RE = /\[([^|\[\]]+)\|[^\]]+\]/g;
const CONFLUENCE_TABLE_RE = /\|\|\[([^|\]]+)\|[^\]]+\]\|\|/g;

/** Polish gherkin from Xray/JSON for Cucumber compatibility. */
function polishGherkin(gherkin) {
  if (!gherkin || typeof gherkin !== 'string') return '';
  return gherkin
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function cleanText(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(WIKI_LINK_RE, '$1')
    .replace(CONFLUENCE_TABLE_RE, '| $1 |')
    .replace(/\*\*/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractGherkinLines(str) {
  if (!str) return [];
  const lines = [];
  for (const part of str.split(/\n+/)) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const match = trimmed.match(KEYWORD_RE);
    if (match) {
      const keyword = match[1];
      const rest = cleanText(trimmed.slice(match[0].length));
      if (rest) lines.push({ keyword, text: rest });
    } else if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      lines.push({ keyword: null, text: trimmed, isTable: true });
    } else {
      const prev = lines[lines.length - 1];
      if (prev && !prev.isTable) prev.text += '\n' + cleanText(trimmed);
      else lines.push({ keyword: 'And', text: cleanText(trimmed) });
    }
  }
  return lines;
}

function stepsToGherkin(steps) {
  const lines = [];
  for (const step of steps || []) {
    const fromAction = extractGherkinLines(step.action);
    const fromResult = extractGherkinLines(step.result);
    const fromData = step.data ? extractGherkinLines(step.data) : [];
    for (const { keyword, text, isTable } of [...fromAction, ...fromData, ...fromResult]) {
      if (isTable) lines.push(text);
      else if (keyword && text) lines.push(`${keyword} ${text}`);
    }
  }
  return lines.length ? lines.join('\n') : null;
}

function getProjectFromKey(key) {
  if (!key) return 'webTv';
  const k = String(key).toUpperCase();
  if (k.startsWith('WSTE')) return 'webTv';
  if (k.startsWith('WQO')) return 'optools';
  if (k.startsWith('WQ-')) return 'coreApp';
  return 'webTv';
}

function getProjectFromSuite(suite) {
  return SUITE_TO_PROJECT[suite] || getProjectFromKey(suite);
}

/** Find similar feature/step files in temp folder for reference */
function findSimilarInTemp(project, gherkinLines) {
  const tempDir = TEMP_MAP[project];
  if (!tempDir || !fs.existsSync(tempDir)) return null;

  const keywords = gherkinLines
    .map((l) => (typeof l === 'string' ? l : l.text || '').toLowerCase())
    .join(' ')
    .split(/\s+/)
    .filter((w) => w.length > 3);

  let best = { score: 0, path: null };
  const featureDir = path.join(tempDir, 'features');
  const walkDirs = [tempDir];
  if (fs.existsSync(path.join(tempDir, 'features'))) walkDirs.push(path.join(tempDir, 'features'));

  for (const dir of walkDirs) {
    if (!fs.existsSync(dir)) continue;
    const walk = (d) => {
      const entries = fs.readdirSync(d, { withFileTypes: true });
      for (const e of entries) {
        const fp = path.join(d, e.name);
        if (e.isDirectory() && !e.name.startsWith('.')) walk(fp);
        else if (e.name.endsWith('.feature')) {
          const content = fs.readFileSync(fp, 'utf8');
          let score = 0;
          for (const kw of keywords) {
            if (content.toLowerCase().includes(kw)) score++;
          }
          if (score > best.score) best = { score, path: path.relative(ROOT, fp) };
        }
      }
    };
    try {
      walk(dir);
    } catch (_) {}
  }
  return best.path;
}

/** Generate feature file content */
function generateFeature(key, summary, gherkin, project) {
  const tag = project === 'webTv' ? '@webtv' : project === 'optools' ? '@optools' : '@core-app';
  const scenarioTitle = summary || key;
  const lines = [
    `# ${key}: ${scenarioTitle}`,
    `# Auto-generated - add step implementations as needed`,
    '',
    tag,
    '',
    `Feature: ${(summary || '').split('|')[0].trim() || 'Auto-generated'}`,
    '',
    `  @${key}`,
    `  Scenario: ${scenarioTitle}`,
  ];
  for (const line of (gherkin || '').split('\n').filter(Boolean)) {
    lines.push(`    ${line.trim()}`);
  }
  return lines.join('\n') + '\n';
}

/** Generate step definition stubs */
function generateStepDefStubs(gherkin, key, project, referencePath) {
  const lines = (gherkin || '').split('\n').filter(Boolean);
  const steps = [];
  for (const line of lines) {
    const trimmed = line.trim();
    const m = trimmed.match(/^(Given|When|Then|And|Or)\s+(.+)$/i);
    if (m) {
      const [, kw, text] = m;
      steps.push({ keyword: kw, text: trimmed });
    }
  }

  const refComment = referencePath ? `\n * Reference: ${referencePath}\n` : '';
  const stubs = steps.map((s) => {
    const stepText = s.text.replace(/^(Given|When|Then|And|Or)\s+/i, '').trim();
    const kw = s.keyword && /^(and|or)$/i.test(s.keyword) ? 'Then' : (s.keyword || 'Then');
    if (needsRegexPattern(stepText)) {
      const regexBody = toRegexEscaped(stepText);
      return `  ${kw}(/^${regexBody}$/, async function () {\n    // TODO: implement - see temp folder for reference\n    throw new Error('Not implemented');\n  });`;
    }
    const escaped = stepText.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `  ${kw}("${escaped}", async function () {\n    // TODO: implement - see temp folder for reference\n    throw new Error('Not implemented');\n  });`;
  });

  return `/**\n * Step definitions for ${key}\n * ${refComment} */\nconst { Given, When, Then } = require('@wdio/cucumber-framework');\n/** And/Or map to Then for Cucumber step matching */\nconst And = Then;\nconst Or = Then;\n\n${stubs.join('\n\n')}\n`;
}

/** Main automate function */
function automate(suite, key, options = {}) {
  const { dryRun = false } = options;

  const tcPath = path.join(TESTCASE_DIR, suite, `${key}.json`);
  if (!fs.existsSync(tcPath)) {
    return { success: false, error: `Test case ${key} not found in ${suite}` };
  }

  const tc = JSON.parse(fs.readFileSync(tcPath, 'utf8'));
  const project = getProjectFromKey(key);
  const featureDir = PROJECT_TO_FEATURE_DIR[project] || suite.toLowerCase();
  const featureSubDir = path.join(FEATURES_DIR, featureDir);

  let gherkin = tc.gherkin || '';
  if (!gherkin && tc.steps?.length) {
    gherkin = stepsToGherkin(tc.steps);
  }
  if (!gherkin) {
    return { success: false, error: 'No gherkin or steps to convert' };
  }
  gherkin = polishGherkin(gherkin);

  const gherkinLines = gherkin.split('\n').filter(Boolean);
  const referencePath = findSimilarInTemp(project, gherkinLines);

  const slug = (tc.summary || key)
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 40) || 'scenario';

  let featurePath = null;
  let featureFileName = null;
  let scenarioAlreadyInFeature = false;
  if (fs.existsSync(featureSubDir)) {
    const files = fs.readdirSync(featureSubDir).filter((f) => f.endsWith('.feature'));
    for (const f of files) {
      const content = fs.readFileSync(path.join(featureSubDir, f), 'utf8');
      if (content.includes(`@${key}`)) {
        featurePath = path.join(featureSubDir, f);
        featureFileName = f;
        scenarioAlreadyInFeature = true;
        break;
      }
    }
  }
  if (!featurePath) {
    featureFileName = `${slug}.feature`;
    featurePath = path.join(featureSubDir, featureFileName);
  }

  const featureContent = scenarioAlreadyInFeature ? null : generateFeature(key, tc.summary, gherkin, project);
  const stepDefContent = generateStepDefStubs(gherkin, key, project, referencePath);

  const stepDefFileName = `${slug}.steps.js`;
  const stepDefPath = path.join(FEATURES_DIR, 'step-definitions', stepDefFileName);

  const created = [];
  const updated = [];

  if (!dryRun) {
    fs.mkdirSync(featureSubDir, { recursive: true });

    if (!scenarioAlreadyInFeature && featureContent) {
      fs.writeFileSync(featurePath, featureContent);
      created.push(`features/${featureDir}/${featureFileName}`);
    }

    if (!fs.existsSync(stepDefPath)) {
      fs.writeFileSync(stepDefPath, stepDefContent);
      created.push(`features/step-definitions/${stepDefFileName}`);
    } else {
      appendStepsToFile(stepDefPath, gherkin, key);
      updated.push(`features/step-definitions/${stepDefFileName}`);
    }
  }

  return {
    success: true,
    project,
    referencePath,
    created: dryRun ? [`features/${featureDir}/${featureFileName}`, `features/step-definitions/${stepDefFileName}`] : created,
    updated,
    featurePath: `features/${featureDir}/${featureFileName}`,
    stepDefPath: `features/step-definitions/${stepDefFileName}`,
  };
}

function appendScenarioToFeature(featurePath, key, summary, gherkin) {
  let content = fs.readFileSync(featurePath, 'utf8');
  if (content.includes(`@${key}`)) return content;
  const scenarioBlock = [
    '',
    `  @${key}`,
    `  Scenario: ${summary || key}`,
    ...gherkin.split('\n').map((l) => `    ${l.trim()}`),
  ].join('\n');
  return content.trimEnd() + '\n' + scenarioBlock + '\n';
}

function appendStepsToFile(stepDefPath, gherkin, key, options = {}) {
  const stepDefsDir = options.stepDefsDir || path.dirname(stepDefPath);
  let content = fs.readFileSync(stepDefPath, 'utf8');
  let allStepDefContent = content;
  if (fs.existsSync(stepDefsDir)) {
    for (const f of fs.readdirSync(stepDefsDir)) {
      if (f.endsWith('.js') && path.join(stepDefsDir, f) !== path.resolve(stepDefPath)) {
        try {
          allStepDefContent += '\n' + fs.readFileSync(path.join(stepDefsDir, f), 'utf8');
        } catch (_) {}
      }
    }
  }
  const lines = (gherkin || '').split('\n').filter(Boolean);
  const stepTexts = [];
  for (const line of lines) {
    const m = line.trim().match(/^(Given|When|Then|And|Or)\s+(.+)$/i);
    if (m) stepTexts.push(m[2].trim());
  }
  const fullStubs = generateStepDefStubs(gherkin, key, null, null);
  const stubs = [];
  const re = /\n\s*(Given|When|Then)\([^)]+\)[^{]*\{[\s\S]*?\}\);/g;
  let m;
  while ((m = re.exec(fullStubs))) stubs.push(m[0].trim());
  if (!stubs.length) {
    const parts = fullStubs.split(/\n\n+/);
    for (const p of parts) {
      if (/^\s*(Given|When|Then)\(/.test(p)) stubs.push(p.trim());
    }
  }
  const contentNoComments = content.replace(/\/\/[^\n]*/g, '');
  const allNoComments = allStepDefContent.replace(/\/\/[^\n]*/g, '');
  for (let j = 0; j < stubs.length; j++) {
    const stub = stubs[j];
    const stepText = stepTexts[j];
    const stepForMatch = (stepText || '').replace(/[(){}\[\]\/\\]/g, ' ').replace(/\s+/g, ' ').trim();
    const distinctivePhrase = stepText && stepText.length > 25 ? stepText.slice(-35) : stepText;
    const alreadyDefined =
      content.includes(stub.slice(0, 50)) ||
      (stepText &&
        (contentNoComments.includes(`"${stepText}"`) ||
          contentNoComments.includes(`'${stepText}'`) ||
          allNoComments.includes(`"${stepText}"`) ||
          allNoComments.includes(`'${stepText}'`) ||
          (distinctivePhrase && allNoComments.includes(distinctivePhrase)) ||
          (stepForMatch && stepForMatch.length > 15 && allNoComments.includes(stepForMatch))));
    if (!alreadyDefined) {
      content = content.trimEnd() + '\n\n' + stub + '\n';
    }
  }
  fs.writeFileSync(stepDefPath, content);
}

if (require.main === module) {
  const [suite, key] = process.argv.slice(2);
  const dryRun = process.argv.includes('--dry-run');
  const result = automate(suite || 'webTv', key || 'WSTE-718', { dryRun });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.success ? 0 : 1);
}

module.exports = {
  automate,
  getProjectFromKey,
  generateStepDefStubs,
  appendStepsToFile,
  extractGherkinLines,
  polishGherkin,
};
