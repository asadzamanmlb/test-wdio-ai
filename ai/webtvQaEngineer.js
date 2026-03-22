#!/usr/bin/env node
/**
 * WebTV QA Engineer Agent
 * Orchestrates: automate → run → fix loop.
 * - Creates feature, step defs from testcase JSON (uses webTv-temp as reference)
 * - Runs test via wdio
 * - On selector failure: Planner + Generator (RAG + DOM) → retry
 * - On "Not implemented": attempts to copy similar step from webTv-temp
 * Acts as an autonomous QA engineer loop until pass or max attempts.
 */
const fs = require('fs');
const path = require('path');
const { automate } = require('../scripts/automateScenario');
const { plan, generate, runTestDirect, isElementError } = require('./agents');

const ROOT = path.join(__dirname, '..');
const WEBTV_TEMP = path.join(ROOT, 'webTv-temp');
const FAILURE_DOM = path.join(ROOT, 'reports', 'failure-dom.json');

/** Extract step text for matching (strip keyword, normalize) */
function normalizeStepText(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/^(Given|When|Then|And|Or)\s+/i, '')
    .trim()
    .toLowerCase();
}

/** Find similar step implementation in webTv-temp */
function findSimilarStepInWebTvTemp(stepText) {
  const normalized = normalizeStepText(stepText);
  const words = normalized.split(/\s+/).filter((w) => w.length > 2);
  if (words.length === 0) return null;

  const stepDefDir = path.join(WEBTV_TEMP, 'features', 'step-definitions');
  if (!fs.existsSync(stepDefDir)) return null;
  const dir2 = path.join(WEBTV_TEMP, 'step-definitions');
  const dirs = [stepDefDir];
  if (fs.existsSync(dir2)) dirs.push(dir2);

  let best = { score: 0, file: null, pattern: null, body: null };
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js') || f.endsWith('.ts'));
    for (const f of files) {
      const content = fs.readFileSync(path.join(dir, f), 'utf8');
      for (const re of [
        /(Given|When|Then|And)\s*\(\s*[`'"]([^`'"]+)[`'"]\s*,\s*async\s*function[^)]*\)\s*\{([\s\S]*?)\n\s*\}\)/g,
        /(Given|When|Then|And)\s*\(\s*\/\^?([^/]+)\$?\/\s*,\s*async\s*function[^)]*\)\s*\{([\s\S]*?)\n\s*\}\)/g,
      ]) {
        for (const m of content.matchAll(re)) {
          const pattern = (m[2] || '').replace(/\\\//g, '/').replace(/\^|\$|\\(.)/g, '$1').trim();
          const patternNorm = pattern.toLowerCase();
          let score = 0;
          for (const w of words) {
            if (patternNorm.includes(w) || normalized.includes(w)) score++;
          }
          if (score > best.score && score >= Math.min(2, words.length)) {
            best = { score, file: path.join(dir, f), pattern, body: (m[3] || '').trim() };
          }
        }
      }
    }
  }
  return best.file ? best : null;
}

/** Check if step already exists in platform step-definitions (e.g. login.steps.js) */
function findStepInPlatform(stepText) {
  const stepContent = stepText.replace(/^(Given|When|Then|And)\s+/i, '').trim().toLowerCase();
  const keyWords = stepContent.split(/\s+/).filter((w) => w.length > 2);
  if (keyWords.length < 2) return null;
  const platformDir = path.join(ROOT, 'features', 'step-definitions');
  if (!fs.existsSync(platformDir)) return null;
  for (const f of fs.readdirSync(platformDir).filter((x) => x.endsWith('.js'))) {
    const content = fs.readFileSync(path.join(platformDir, f), 'utf8');
    const contentNorm = content.toLowerCase().replace(/\\[\/\.\(\)]/g, ' ');
    const matchCount = keyWords.filter((w) => contentNorm.includes(w)).length;
    if (matchCount >= Math.min(3, keyWords.length)) return path.join(platformDir, f);
  }
  return null;
}

/** Remove stub so platform's shared step handles it */
function tryRemoveStubForPlatformStep(stepDefPath, stepText) {
  const platformFile = findStepInPlatform(stepText);
  if (!platformFile) return { applied: false };
  const stepContent = stepText.replace(/^(Given|When|Then|And)\s+/i, '').trim();
  const keyWords = stepContent.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  let content = fs.readFileSync(stepDefPath, 'utf8');
  const stubRe = /(Given|When|Then|And)\s*\(\s*(["'`])([^"'`]+)\2\s*,\s*async\s*function\s*\(\)\s*\{\s*(\/\/[^\n]*\n\s*)?throw\s+new\s+Error\s*\(\s*['`]Not implemented['`]\s*\)\s*;?\s*\}\s*\)\s*;?\s*\n?|(Given|When|Then|And)\s*\(\s*\/\^?([^/]+)\$?\/\s*,\s*async\s*function\s*\(\)\s*\{\s*(\/\/[^\n]*\n\s*)?throw\s+new\s+Error\s*\(\s*['`]Not implemented['`]\s*\)\s*;?\s*\}\s*\)\s*;?\s*\n?/g;
  const before = content;
  content = content.replace(stubRe, (full, kw1, q, strPattern, _x, kw2, regexPattern) => {
    const pattern = (strPattern || regexPattern || '').toLowerCase().replace(/\\[\/\.\(\)]/g, ' ');
    const matchCount = keyWords.filter((w) => pattern.includes(w) || stepContent.toLowerCase().includes(w)).length;
    if (matchCount >= Math.min(2, keyWords.length)) return `// → defined in ${path.basename(platformFile)}\n`;
    return full;
  });
  if (content !== before) {
    fs.writeFileSync(stepDefPath, content);
    return { applied: true, file: platformFile };
  }
  return { applied: false };
}

/** Try to replace a "Not implemented" stub with implementation from webTv-temp */
function tryFillFromWebTvTemp(stepDefPath, stepText) {
  const platformResult = tryRemoveStubForPlatformStep(stepDefPath, stepText);
  if (platformResult.applied) return { applied: true, file: platformResult.file, source: 'platform' };

  const similar = findSimilarStepInWebTvTemp(stepText);
  if (!similar) return { applied: false, reason: 'No similar step in webTv-temp' };

  const stepContent = stepText.replace(/^(Given|When|Then|And)\s+/i, '').trim();
  const keyWords = stepContent.toLowerCase().split(/\s+/).filter((w) => w.length > 2);

  const refBody = similar.body;
  if (!refBody) return { applied: false, reason: 'Could not extract body from reference' };
  const adaptedBody = refBody
    .replace(/import\s*\{[^}]+\}\s*from\s*["'][^"']+["']\s*;?\s*/g, '')
    .replace(/\b\$\(/g, 'browser.$(')
    .replace(/\b\$\$/g, 'browser.$$')
    .replace(/\bexpect\s*\(/g, 'await expect(');

  let content = fs.readFileSync(stepDefPath, 'utf8');
  const stubBlockRe = /(Given|When|Then|And)\s*\(\s*["'`]([^"'`]+)["'`]\s*,\s*async\s*function\s*\(\)\s*\{\s*(\/\/[^\n]*\n\s*throw\s+new\s+Error\s*\(\s*['`]Not implemented['`]\s*\)\s*;?\s*)\}\s*\)/g;
  let match;
  let replaced = false;
  content = content.replace(stubBlockRe, (full, kw, pattern, stubInner) => {
    const patternNorm = pattern.toLowerCase();
    const matchCount = keyWords.filter((w) => patternNorm.includes(w) || stepContent.toLowerCase().includes(w)).length;
    if (matchCount >= Math.min(2, keyWords.length) && !replaced) {
      replaced = true;
      return `${kw}("${pattern}", async function () {\n    // Adapted from webTv-temp\n${adaptedBody.split('\n').map((l) => '    ' + l).join('\n')}\n  })`;
    }
    return full;
  });
  if (!replaced) return { applied: false, reason: 'No matching stub found for this step' };
  fs.writeFileSync(stepDefPath, content);
  return { applied: true, file: similar.file };
}

/** Check if failure is "Not implemented" */
function isNotImplementedError(msg) {
  return msg && typeof msg === 'string' && /not implemented|Not implemented/i.test(msg);
}

/** Check if failure is "X is not defined" (e.g. And, Or) */
function isReferenceError(msg) {
  return msg && typeof msg === 'string' && /ReferenceError:|is not defined/i.test(msg) && /\b(And|Or)\b/.test(msg);
}

/** Add And/Or aliases if missing in step def file */
function tryFixReferenceError(stepDefPath) {
  if (!fs.existsSync(stepDefPath)) return { applied: false };
  let content = fs.readFileSync(stepDefPath, 'utf8');
  if (/const (And|Or)\s*=\s*Then/.test(content)) return { applied: false };
  const insert = "const And = Then;\nconst Or = Then;\n\n";
  const requireLine = content.match(/const\s*\{[^}]+\}\s*=\s*require\([^)]+\);\s*\n/);
  if (requireLine) {
    const idx = content.indexOf(requireLine[0]) + requireLine[0].length;
    content = content.slice(0, idx) + insert + content.slice(idx);
    fs.writeFileSync(stepDefPath, content);
    return { applied: true };
  }
  return { applied: false };
}

/** Check if failure is invalid regex / SyntaxError (e.g. Invalid regular expression flags, \\/ over-escaped) */
function isInvalidRegexError(msg) {
  return (
    msg &&
    typeof msg === 'string' &&
    (/Invalid regular expression flags/i.test(msg) ||
      (/SyntaxError/i.test(msg) && /regular expression|regex/i.test(msg)))
  );
}

/** Check if failure is SyntaxError: Unexpected end of input (unclosed brace, incomplete step def) */
function isUnexpectedEndOfInputError(msg) {
  return msg && typeof msg === 'string' && /SyntaxError:\s*Unexpected end of input/i.test(msg);
}

/** Remove orphaned/incomplete step def blocks that cause "Unexpected end of input" */
function tryFixUnexpectedEndOfInput(stepDefPath) {
  if (!fs.existsSync(stepDefPath)) return { applied: false };
  let content = fs.readFileSync(stepDefPath, 'utf8');
  const original = content;
  const lastGood = content.lastIndexOf('});');
  if (lastGood === -1) return { applied: false };
  const afterLastGood = content.slice(lastGood + 3).replace(/\s/g, '');
  if (afterLastGood.length > 0 && /^(Given|When|Then|And)\(/.test(afterLastGood)) {
    content = content.slice(0, lastGood + 3).trimEnd() + '\n';
    fs.writeFileSync(stepDefPath, content);
    return { applied: true };
  }
  return { applied: false };
}

/** Fix over-escaped \\/ to \/ in regex patterns in step def file */
function tryFixInvalidRegexInStepDefs(stepDefPath) {
  if (!fs.existsSync(stepDefPath)) return { applied: false };
  let content = fs.readFileSync(stepDefPath, 'utf8');
  const original = content;
  content = content.replace(/\\\\\//g, '\\/');
  if (content !== original) {
    fs.writeFileSync(stepDefPath, content);
    return { applied: true };
  }
  return { applied: false };
}

/** Check if failure is Cucumber Expression parse error (parentheses, special chars in step pattern) */
function isCucumberExpressionError(msg) {
  return (
    msg &&
    typeof msg === 'string' &&
    (/Cucumber Expression has a problem/i.test(msg) ||
      /invalid cucumber expression/i.test(msg) ||
      /syntax error.*expression/i.test(msg))
  );
}

/** Convert string patterns with special chars to regex. Returns true if any change was made. */
function tryFixCucumberExpressionErrors(stepDefPath) {
  if (!fs.existsSync(stepDefPath)) return { applied: false };

  let content = fs.readFileSync(stepDefPath, 'utf8');
  const original = content;

  const stringStepRe = /(Given|When|Then|And)\s*\(\s*["'`]([^"'`]+)["'`]\s*,\s*async\s*function\s*\(\)\s*\{/g;
  const escapeForRegex = (s) =>
    s.replace(/\\/g, '\\\\').replace(/\//g, '\\/').replace(/[.*+?^${}()|[\]]/g, '\\$&');
  content = content.replace(stringStepRe, (full, kw, pattern) => {
    if (!/[(){}\[\]]|\//.test(pattern)) return full;
    const escaped = escapeForRegex(pattern);
    return `${kw}(/^${escaped}$/, async function () {`;
  });

  if (content !== original) {
    fs.writeFileSync(stepDefPath, content);
    return { applied: true };
  }
  return { applied: false };
}

/**
 * Full WebTV QA Engineer loop.
 * 1. Automate (create feature, step defs)
 * 2. Run test
 * 3. On failure: selector → fix (plan+generate); Not implemented → try fill from webTv-temp
 * 4. Retry until pass or max attempts
 */
async function runWebTvQaEngineer(key, options = {}) {
  const { maxAttempts = 10, env = 'qa', runSingleTest, suite = 'webTv' } = options;
  const runFn = runSingleTest || runTestDirect;

  console.log(`\n🔄 WebTV QA Engineer: ${key}\n`);
  console.log('  1. Creating feature + step definitions from testcase...');

  const autoResult = automate(suite, key);
  if (!autoResult.success) {
    console.error('  ❌ Automate failed:', autoResult.error);
    return { success: false, error: autoResult.error, attempts: [] };
  }
  console.log('  ✓ Feature:', autoResult.featurePath);
  console.log('  ✓ Step defs:', autoResult.stepDefPath);
  if (autoResult.referencePath) console.log('  ✓ Reference:', autoResult.referencePath);

  let lastResult = null;
  const attempts = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`\n  2. Run attempt ${attempt}/${maxAttempts}...`);
    const result = await runFn(suite, key, env);
    lastResult = result;
    attempts.push({
      attempt,
      status: result.status,
      failStep: result.failStep,
      failReason: result.failReason?.slice(0, 120),
    });

    if (result.status === 'passed') {
      console.log('\n  ✅ Test passed!\n');
      return { success: true, attempts, result };
    }

    const failReason = result.failReason || '';

    if (isReferenceError(failReason)) {
      const stepDefPath = path.join(ROOT, autoResult.stepDefPath);
      if (fs.existsSync(stepDefPath)) {
        const fixResult = tryFixReferenceError(stepDefPath);
        if (fixResult.applied) {
          console.log('  🔧 Fixed ReferenceError (added And/Or = Then)');
          continue;
        }
      }
    }

    if (isUnexpectedEndOfInputError(failReason)) {
      const stepDefsDir = path.join(ROOT, 'features', 'step-definitions');
      if (fs.existsSync(stepDefsDir)) {
        let anyFixed = false;
        for (const f of fs.readdirSync(stepDefsDir).filter((x) => x.endsWith('.js'))) {
          const fixResult = tryFixUnexpectedEndOfInput(path.join(stepDefsDir, f));
          if (fixResult.applied) anyFixed = true;
        }
        if (anyFixed) {
          console.log('  🔧 Fixed Unexpected end of input (removed incomplete step blocks)');
          continue;
        }
      }
    }

    if (isInvalidRegexError(failReason)) {
      const stepDefsDir = path.join(ROOT, 'features', 'step-definitions');
      if (fs.existsSync(stepDefsDir)) {
        let anyFixed = false;
        for (const f of fs.readdirSync(stepDefsDir).filter((x) => x.endsWith('.js'))) {
          const fixResult = tryFixInvalidRegexInStepDefs(path.join(stepDefsDir, f));
          if (fixResult.applied) anyFixed = true;
        }
        if (anyFixed) {
          console.log('  🔧 Fixed invalid regex (\\\\/ → \/) in step defs');
          continue;
        }
      }
    }

    if (isCucumberExpressionError(failReason)) {
      const stepDefPath = path.join(ROOT, autoResult.stepDefPath);
      if (fs.existsSync(stepDefPath)) {
        const fixResult = tryFixCucumberExpressionErrors(stepDefPath);
        if (fixResult.applied) {
          console.log('  🔧 Fixed Cucumber Expression (converted special chars to regex)');
          continue;
        }
      }
      console.log('  ⚠️ Cucumber Expression error; could not auto-fix.');
      return { success: false, attempts, result, reason: 'Cucumber Expression parse error' };
    }

    if (isNotImplementedError(failReason)) {
      const stepDefPath = path.join(ROOT, autoResult.stepDefPath);
      if (fs.existsSync(stepDefPath)) {
        const fillResult = tryFillFromWebTvTemp(stepDefPath, result.failStep || '');
        if (fillResult.applied) {
          console.log(`  🔧 Filled step from webTv-temp: ${path.basename(fillResult.file)}`);
          continue;
        }
      }
      console.log('  ⚠️ Step not implemented; no similar step in webTv-temp. Manual implementation needed.');
      return { success: false, attempts, result, reason: 'Step not implemented' };
    }

    if (isElementError(failReason)) {
      let domHtml = null;
      const scenarioId =
        result.featureName && result.scenarioName ? `${result.featureName}::${result.scenarioName}` : null;
      if (scenarioId && fs.existsSync(FAILURE_DOM)) {
        try {
          const domMan = JSON.parse(fs.readFileSync(FAILURE_DOM, 'utf8'));
          const entry = domMan[scenarioId] || Object.values(domMan)[0];
          if (entry?.domHtml) domHtml = entry.domHtml;
        } catch (_) {}
      }
      const ctx = {
        failReason,
        failStep: result.failStep,
        stepText: result.failStep,
        scenario: key,
        domHtml,
      };
      const fixPlan = await plan(ctx);
      const genResult = generate(fixPlan);
      if (genResult.applied) {
        console.log(`  🔧 Selector fix applied: ${fixPlan.oldSelector} → ${genResult.newSelector} in ${genResult.file}`);
        continue;
      }
    }

    console.log('  ❌ Failure not auto-fixable:', failReason.slice(0, 150));
    return { success: false, attempts, result: lastResult, reason: 'Unfixable' };
  }

  return { success: false, attempts, result: lastResult, reason: `Max attempts (${maxAttempts}) exceeded` };
}

if (require.main === module) {
  const key = process.argv[2] || 'WSTE-718';
  const env = process.env.ENV || 'qa';
  runWebTvQaEngineer(key, { maxAttempts: 10, env })
    .then((r) => {
      process.exit(r.success ? 0 : 1);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}

module.exports = {
  runWebTvQaEngineer,
  findSimilarStepInWebTvTemp,
  tryFillFromWebTvTemp,
  isCucumberExpressionError,
  tryFixCucumberExpressionErrors,
};
