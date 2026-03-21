/**
 * WebdriverIO Cucumber hooks - triggers self-healing on element-not-found failures,
 * captures screenshots on any step failure for dashboard display.
 */
const fs = require('fs');
const path = require('path');
const { heal } = require('../../selfheal/selfHeal');

const SCREENSHOTS_DIR = path.join(process.cwd(), 'reports', 'screenshots');
const FAILURE_MANIFEST = path.join(process.cwd(), 'reports', 'failure-screenshots.json');

function extractSelectorFromError(errorMsg) {
  if (!errorMsg || typeof errorMsg !== 'string') return null;
  const m = errorMsg.match(/element\s*\(["']([^"']+)["']\)/i) ||
    errorMsg.match(/selector\s*["']([^"']+)["']/i) ||
    errorMsg.match(/["']([^"']+(?:xpath|css)[^"']*)["']/i);
  return m ? m[1] : null;
}

function extractTextFromStep(stepText) {
  if (!stepText) return null;
  const quoted = stepText.match(/"([^"]+)"/);
  if (quoted) return quoted[1];
  const words = stepText.split(/\s+/).filter(Boolean);
  return words.slice(-2).join(' ') || words[words.length - 1] || null;
}

function appendToFailureManifest(scenarioId, screenshotPath) {
  try {
    let manifest = {};
    if (fs.existsSync(FAILURE_MANIFEST)) {
      manifest = JSON.parse(fs.readFileSync(FAILURE_MANIFEST, 'utf8'));
    }
    manifest[scenarioId] = screenshotPath;
    fs.mkdirSync(path.dirname(FAILURE_MANIFEST), { recursive: true });
    fs.writeFileSync(FAILURE_MANIFEST, JSON.stringify(manifest, null, 2));
  } catch (e) {
    console.warn('Could not write failure manifest:', e.message);
  }
}

module.exports = {
  afterStep: async function (step, scenario, result, context) {
    if (result?.passed || !result?.error) return;

    const err = result.error;
    const msg = typeof err === 'string' ? err : (err?.message || err?.stack || String(err || ''));
    const isElementNotFound =
      /element.*not (found|displayed|exist|clickable)/i.test(msg) ||
      /could not be located/i.test(msg) ||
      /no such element/i.test(msg);

    if (isElementNotFound) {
      const oldSelector = extractSelectorFromError(msg);
      const text = extractTextFromStep(step.text);
      let domHtml = null;
      try {
        if (typeof browser !== 'undefined' && browser.getPageSource) {
          domHtml = await browser.getPageSource();
        }
      } catch (_) {}
      if (oldSelector || text || domHtml) {
        await heal(oldSelector || 'unknown', text || '', {
          step: step.text,
          scenario: scenario.name,
          domHtml: domHtml || undefined,
        });
      }
    }

    try {
      let featureName = context?.feature?.name || context?.gherkinDocument?.feature?.name;
      if (!featureName && scenario?.uri) {
        try {
          const fullPath = path.isAbsolute(scenario.uri) ? scenario.uri : path.join(process.cwd(), scenario.uri);
          if (fs.existsSync(fullPath)) {
            const content = fs.readFileSync(fullPath, 'utf8');
            const m = content.match(/^\s*Feature:\s*(.+)$/m);
            if (m) featureName = m[1].trim();
          }
        } catch (_) {}
        if (!featureName) {
          const parts = scenario.uri.replace(/\\/g, '/').split('/');
          featureName = (parts[parts.length - 1] || '').replace(/\.feature$/i, '') || 'Feature';
        }
      }
      featureName = featureName || 'Feature';
      const scenarioId = `${featureName}::${scenario.name}`;
      const slug = scenario.name.replace(/[^a-zA-Z0-9-]/g, '-').slice(0, 50);
      const fname = `${slug}-${Date.now()}.png`;
      fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
      const fullPath = path.join(SCREENSHOTS_DIR, fname);
      await browser.saveScreenshot(fullPath);
      appendToFailureManifest(scenarioId, fname);
    } catch (e) {
      console.warn('Could not capture failure screenshot:', e.message);
    }
  },
};
