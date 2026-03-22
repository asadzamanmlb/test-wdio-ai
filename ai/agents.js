/**
 * Multi-Agent System for Test Self-Healing
 * Planner → Generator → Fixer
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { heal, analyzeDom } = require('../selfheal/selfHeal');
const { searchWithEmbeddings, save } = require('../rag/vectorDB');

const PROJECT_ROOT = path.join(__dirname, '..');
const PAGE_OBJECTS_DIR = path.join(PROJECT_ROOT, 'features', 'pageobjects');
const STEP_DEFS_DIR = path.join(PROJECT_ROOT, 'features', 'step-definitions');

/** Extract failing selector from error message */
function extractSelectorFromError(errorMsg) {
  if (!errorMsg || typeof errorMsg !== 'string') return null;
  const m =
    errorMsg.match(/element\s*\(["']([^"']+)["']\)/i) ||
    errorMsg.match(/selector\s*["']([^"']+)["']/i) ||
    errorMsg.match(/["']([^"']+(?:xpath|css|=\s*)[^"']*)["']/i) ||
    errorMsg.match(/\$\("([^"]+)"\)/i) ||
    errorMsg.match(/\$\('([^']+)'\)/i) ||
    errorMsg.match(/locator\s*["']([^"']+)["']/i);
  return m ? m[1] : null;
}

/** Extract search text from step (e.g. "Login" from step text) */
function extractTextFromStep(stepText) {
  if (!stepText) return null;
  const quoted = stepText.match(/"([^"]+)"/);
  if (quoted) return quoted[1];
  const words = stepText.split(/\s+/).filter(Boolean);
  return words.slice(-2).join(' ') || words[words.length - 1] || null;
}

/** Is this an element/selector-related error we can fix? */
function isElementError(msg) {
  if (!msg) return false;
  const patterns = [
    /element.*not (found|displayed|exist|clickable|visible)/i,
    /no such element/i,
    /unable to locate element/i,
    /stale element reference/i,
    /timeout.*wait/i,
    /element.*obscured/i,
    /element click intercepted/i,
    /selector\s*["']/i,
    /element\s*\(["']/i,
  ];
  return patterns.some((p) => p.test(msg));
}

// ============ PLANNER ============
/**
 * Analyzes a test failure and produces a fix plan.
 * Uses RAG (past fixes) + DOM analysis when available.
 * @param {Object} ctx - { failReason, failStep, stepText, scenario, domHtml?, suite, key }
 * @returns {Promise<Object>} Plan: { oldSelector, suggestedSelectors, affectedFiles, reasoning }
 */
async function plan(ctx) {
  const { failReason, failStep, stepText, scenario, domHtml } = ctx;
  const oldSelector = extractSelectorFromError(failReason) || 'unknown';
  const text = extractTextFromStep(stepText);

  let domSelectors = [];
  if (domHtml) {
    domSelectors = analyzeDom(domHtml, oldSelector, text);
  }

  const query = [oldSelector, text, stepText].filter(Boolean).join(' ');
  let ragSelectors = [];
  try {
    const ragResults = await searchWithEmbeddings(query, 3);
    ragResults.forEach((r) => {
      const sel = r.fix?.suggestedSelectors?.[0] || r.fix?.selector;
      if (sel) ragSelectors.push(sel);
    });
  } catch (_) {}

  const textFallback = text ? `*=${String(text).trim()}` : null;
  const suggestedSelectors = [...new Set([...ragSelectors, ...domSelectors, textFallback].filter(Boolean))];

  const affectedFiles = await findFilesContainingSelector(oldSelector);

  return {
    oldSelector,
    suggestedSelectors,
    affectedFiles,
    reasoning: suggestedSelectors.length
      ? `RAG: ${ragSelectors.length} prior fix(es) | DOM: ${domSelectors.length} suggestion(s)`
      : 'No prior fixes found; DOM suggested fallbacks',
  };
}

/** Find files (page objects, step defs) that contain the selector string */
function findFilesContainingSelector(selector) {
  const files = [];
  if (!selector || selector === 'unknown') return files;

  const searchDirs = [PAGE_OBJECTS_DIR, STEP_DEFS_DIR];

  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isFile() || !e.name.endsWith('.js')) continue;
      const filepath = path.join(dir, e.name);
      try {
        const content = fs.readFileSync(filepath, 'utf8');
        const hasSelector =
          content.includes(selector) ||
          content.includes(selector.replace(/"/g, "'")) ||
          content.includes(selector.replace(/'/g, '"'));
        if (hasSelector) {
          files.push(path.relative(PROJECT_ROOT, filepath));
        }
      } catch (_) {}
    }
  }
  return files;
}

// ============ GENERATOR ============
/**
 * Applies the plan: updates selectors in page objects / step definitions.
 * @param {Object} plan - From Planner
 * @returns {Object} { applied: boolean, file?: string, error?: string }
 */
function generate(plan) {
  const { oldSelector, suggestedSelectors, affectedFiles } = plan;
  if (!suggestedSelectors?.length || oldSelector === 'unknown') {
    return { applied: false, error: 'No suggested selector to apply' };
  }
  const newSelector = suggestedSelectors[0];

  const defaultFiles = [];
  if (fs.existsSync(PAGE_OBJECTS_DIR)) {
    fs.readdirSync(PAGE_OBJECTS_DIR).filter((f) => f.endsWith('.js')).forEach((f) => defaultFiles.push(path.join('features', 'pageobjects', f)));
  }
  if (fs.existsSync(STEP_DEFS_DIR)) {
    fs.readdirSync(STEP_DEFS_DIR).filter((f) => f.endsWith('.js')).forEach((f) => defaultFiles.push(path.join('features', 'step-definitions', f)));
  }
  const filesToUpdate = affectedFiles.length ? affectedFiles : defaultFiles;

  for (const relPath of filesToUpdate) {
    const filepath = path.join(PROJECT_ROOT, relPath);
    let content = fs.readFileSync(filepath, 'utf8');
    const original = content;

    const replacements = [
      [oldSelector, newSelector],
      [oldSelector.replace(/"/g, "'"), newSelector.replace(/"/g, "'")],
      [oldSelector.replace(/'/g, '"'), newSelector.replace(/'/g, '"')],
    ];

    for (const [old, newS] of replacements) {
      if (content.includes(old)) {
        content = content.split(old).join(newS);
        break;
      }
    }

    if (content !== original) {
      fs.writeFileSync(filepath, content);
      return { applied: true, file: relPath, oldSelector, newSelector };
    }
  }

  return { applied: false, error: `Could not find "${oldSelector}" in page objects or step defs` };
}

// ============ FIXER ============
/**
 * Orchestrator: run test → on failure, Planner → Generator → retry.
 * @param {string} suite - e.g. webTv
 * @param {string} key - e.g. WSTE-44
 * @param {Object} options - { maxAttempts: 5, env: 'qa' }
 * @returns {Promise<Object>} Final result + attempts log
 */
async function fix(suite, key, options = {}) {
  const { maxAttempts = 5, env = 'qa', runSingleTest } = options;
  const run = runSingleTest || runTestDirect;

  const attempts = [];
  let lastResult = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await run(suite, key, env);
    lastResult = result;
    attempts.push({ attempt, status: result.status, failStep: result.failStep, failReason: result.failReason?.slice(0, 100) });

    if (result.status === 'passed') {
      return { success: true, attempts, result };
    }

    if (!isElementError(result.failReason)) {
      return { success: false, attempts, result, reason: 'Non-selector error; agents cannot fix' };
    }

    let domHtml = null;
    const scenarioId = result.featureName && result.scenarioName
      ? `${result.featureName}::${result.scenarioName}`
      : null;
    if (scenarioId) {
      const domManifest = path.join(PROJECT_ROOT, 'reports', 'failure-dom.json');
      if (fs.existsSync(domManifest)) {
        try {
          const domMan = JSON.parse(fs.readFileSync(domManifest, 'utf8'));
          const entry = domMan[scenarioId] || Object.values(domMan)[0];
          if (entry?.domHtml) domHtml = entry.domHtml;
        } catch (_) {}
      }
    }

    const ctx = {
      failReason: result.failReason,
      failStep: result.failStep,
      stepText: result.failStep,
      scenario: key,
      domHtml,
    };

    const fixPlan = await plan(ctx);
    const genResult = generate(fixPlan);

    if (!genResult.applied) {
      try {
        save(ctx.failReason, {
          selector: fixPlan.oldSelector,
          suggestedSelectors: fixPlan.suggestedSelectors,
          step: ctx.failStep,
          scenario: ctx.scenario,
        });
      } catch (_) {}
      return { success: false, attempts, result, plan: fixPlan, reason: genResult.error };
    }

    console.log(`  🔧 Generator applied: ${fixPlan.oldSelector} → ${genResult.newSelector} in ${genResult.file}`);
  }

  return { success: false, attempts, result: lastResult, reason: `Max attempts (${maxAttempts}) exceeded` };
}

/** Run wdio for a single scenario (used when not using dashboard) */
async function runTestDirect(suite, key, env = 'qa') {
  const featurePath = getFeaturePath(suite, key);
  if (!featurePath) return { status: 'failed', failReason: `No feature for ${key}`, failStep: null, screenshot: null };

  const tagExpr = `@${key}`;
  return new Promise((resolve) => {
    const child = spawn('npx', [
      'wdio', 'run', path.join(PROJECT_ROOT, 'wdio.conf.js'),
      '--spec', featurePath,
      `--cucumberOpts.tags=${tagExpr}`,
    ], { cwd: PROJECT_ROOT, env: { ...process.env, ENV: env }, stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d) => { stdout += d.toString(); });
    child.stderr?.on('data', (d) => { stderr += d.toString(); });

    child.on('close', (code) => {
      const reportFile = path.join(PROJECT_ROOT, 'reports', 'json', path.basename(featurePath, '.feature') + '.json');
      let status = 'passed';
      let failReason = null;
      let failStep = null;
      let featureName = null;
      let scenarioName = null;

      if (fs.existsSync(reportFile)) {
        try {
          const data = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
          const features = Array.isArray(data) ? data : [data];
          const lastFeat = features[features.length - 1];
          featureName = lastFeat?.name || 'Feature';
          for (const el of lastFeat?.elements || []) {
            if (el.keyword?.toLowerCase().includes('background')) continue;
            for (const step of el.steps || []) {
              if (step.result?.status === 'failed') {
                status = 'failed';
                failReason = step.result.error_message || step.result.message;
                failStep = [step.keyword, step.name].filter(Boolean).join(' ').trim();
                scenarioName = el.name || '';
                break;
              }
            }
            if (status === 'failed') break;
          }
        } catch (_) {}
      }
      if (code !== 0 && status === 'passed') { status = 'failed'; failReason = stderr || stdout?.slice(-300); }
      resolve({ status, failReason, failStep, screenshot: null, featureName, scenarioName });
    });
  });
}

function getFeaturePath(suite, key) {
  const subdir = suite === 'webTv' ? 'webtv' : suite === 'optools' ? 'optools' : suite.toLowerCase();
  const dir = path.join(PROJECT_ROOT, 'features', subdir);
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.feature'));
  const tag = `@${key}`;
  for (const file of files) {
    const content = fs.readFileSync(path.join(dir, file), 'utf8');
    if (content.includes(tag)) return path.join('features', subdir, file);
  }
  return null;
}

// ============ RUN AGENTS ============
async function runAgents(options = {}) {
  const { suite = 'webTv', key = 'WSTE-44', mode = 'demo' } = options;

  console.log('🤖 Running Planner → Generator → Fixer\n');

  const ragResults = await searchWithEmbeddings('login selector element', 2);
  if (ragResults.length > 0) {
    console.log(`  RAG: ${ragResults.length} prior fix(es) in memory\n`);
  }

  if (mode === 'fix') {
    const fixResult = await fix(suite, key, {
      maxAttempts: 3,
      env: process.env.ENV || 'qa',
      runSingleTest: runTestDirect,
    });
    console.log(fixResult.success ? '\n✅ Fix succeeded' : '\n❌ Fix did not succeed');
    return fixResult;
  }

  console.log('  Planner: building flows (analyzes failures, RAG + DOM)');
  console.log('  Generator: applies selector fixes to page objects / step defs');
  console.log('  Fixer: orchestrates run → plan → generate → retry');
  console.log('\n  Usage: runAgents({ suite: "webTv", key: "WSTE-44", mode: "fix" })');
}

if (require.main === module) {
  const [cmd, suite, key] = process.argv.slice(2);
  const mode = cmd === 'fix' ? 'fix' : 'demo';
  runAgents({
    suite: suite || 'webTv',
    key: key || 'WSTE-44',
    mode,
  })
    .then((r) => mode === 'fix' && r && process.exit(r.success ? 0 : 1))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}

module.exports = {
  plan,
  generate,
  fix,
  runAgents,
  runTestDirect,
  extractSelectorFromError,
  findFilesContainingSelector,
  isElementError,
};
