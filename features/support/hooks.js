/**
 * WebdriverIO Cucumber hooks - triggers self-healing on element-related failures
 * and other errors that may benefit from DOM analysis and selector suggestions.
 * Captures screenshots on any step failure for dashboard display.
 */
const fs = require('fs');
const path = require('path');
const { heal } = require('../../selfheal/selfHeal');

const SCREENSHOTS_DIR = path.join(process.cwd(), 'reports', 'screenshots');
const FAILURE_MANIFEST = path.join(process.cwd(), 'reports', 'failure-screenshots.json');
const FAILURE_DOM_MANIFEST = path.join(process.cwd(), 'reports', 'failure-dom.json');

/** Patterns for element-related and other errors that trigger self-heal. */
const ELEMENT_OR_ERROR_PATTERNS = [
  // Element not found / missing
  /element.*not (found|displayed|exist|clickable|visible|interactable|attached|enabled)/i,
  /could not be located/i,
  /no such element/i,
  /unable to locate element/i,
  /element could not be located/i,
  // Stale / detached
  /stale element reference/i,
  /element is not attached/i,
  /element.*not attached to the document/i,
  /node is detached/i,
  /element is stale/i,
  // Obscured / blocked / not clickable
  /element.*obscured/i,
  /element click intercepted/i,
  /element.*not in viewport/i,
  /element.*not visible/i,
  // Timeout (often element-related)
  /timeout.*(waiting|wait) for/i,
  /wait.*timed out/i,
  /TimeoutError/i,
  /element.*timed out/i,
  // Invalid selector
  /invalid selector/i,
  /invalid.*xpath|invalid.*css/i,
  // Selector / locator syntax
  /selector\s*["']([^"']+)["']/i,
  /element\s*\(["']([^"']+)["']\)/i,
  // Other common WebDriver/Selenium
  /session not created/i,
  /element.*disabled/i,
  /element.*is not enabled/i,
  /element.*not in the document/i,
  /Unable to find element/i,
  /element not found/i,
];

function isElementOrSelectableError(msg) {
  if (!msg || typeof msg !== 'string') return false;
  return ELEMENT_OR_ERROR_PATTERNS.some((p) => p.test(msg));
}

function extractSelectorFromError(errorMsg) {
  if (!errorMsg || typeof errorMsg !== 'string') return null;
  const m =
    errorMsg.match(/element\s*\(["']([^"']+)["']\)/i) ||
    errorMsg.match(/selector\s*["']([^"']+)["']/i) ||
    errorMsg.match(/["']([^"']+(?:xpath|css|=\s*)[^"']*)["']/i) ||
    errorMsg.match(/\$\("([^"]+)"\)/i) ||
    errorMsg.match(/\$\('([^']+)'\)/i) ||
    errorMsg.match(/locator\s*["']([^"']+)["']/i) ||
    errorMsg.match(/["']([^"']+\.(?:css|xpath))["']/i);
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

function hasScreenshotForScenario(scenarioId) {
  try {
    if (!fs.existsSync(FAILURE_MANIFEST)) return false;
    const manifest = JSON.parse(fs.readFileSync(FAILURE_MANIFEST, 'utf8'));
    return !!(manifest[scenarioId] && fs.existsSync(path.join(SCREENSHOTS_DIR, manifest[scenarioId])));
  } catch (_) {
    return false;
  }
}

async function captureFailureScreenshot(scenario, context) {
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
        const parts = (scenario.uri || '').replace(/\\/g, '/').split('/');
        featureName = (parts[parts.length - 1] || '').replace(/\.feature$/i, '') || 'Feature';
      }
    }
    featureName = featureName || 'Feature';
    const scenarioId = `${featureName}::${scenario.name}`;
    if (hasScreenshotForScenario(scenarioId)) return;
    const slug = (scenario.name || '').replace(/[^a-zA-Z0-9-]/g, '-').slice(0, 50);
    const fname = `${slug}-${Date.now()}.png`;
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
    const fullPath = path.join(SCREENSHOTS_DIR, fname);
    let saved = false;
    for (const delay of [0, 500, 1500]) {
      if (delay) await new Promise((r) => setTimeout(r, delay));
      try {
        await browser.saveScreenshot(fullPath);
        saved = true;
        break;
      } catch (err) {
        if (delay === 1500) {
          try {
            const base64 = await browser.takeScreenshot();
            if (base64) {
              fs.writeFileSync(fullPath, Buffer.from(base64, 'base64'));
              saved = true;
            }
          } catch (_) {}
        }
      }
    }
    if (saved) appendToFailureManifest(scenarioId, fname);
    else console.warn('Could not capture failure screenshot after retries (browser session may be degraded)');
  } catch (e) {
    console.warn('Could not capture failure screenshot:', e.message);
  }
}

function persistFailureDom(scenarioId, domHtml) {
  try {
    if (!domHtml || typeof domHtml !== 'string') return;
    const maxLen = 150000;
    const truncated = domHtml.length > maxLen ? domHtml.slice(0, maxLen) + '...[truncated]' : domHtml;
    let manifest = {};
    if (fs.existsSync(FAILURE_DOM_MANIFEST)) {
      manifest = JSON.parse(fs.readFileSync(FAILURE_DOM_MANIFEST, 'utf8'));
    }
    manifest[scenarioId] = { domHtml: truncated, timestamp: new Date().toISOString() };
    fs.mkdirSync(path.dirname(FAILURE_DOM_MANIFEST), { recursive: true });
    fs.writeFileSync(FAILURE_DOM_MANIFEST, JSON.stringify(manifest, null, 2));
  } catch (e) {
    console.warn('Could not persist failure DOM:', e.message);
  }
}

module.exports = {
  afterStep: async function (step, scenario, result, context) {
    if (result?.passed || !result?.error) return;

    const err = result.error;
    const msg = typeof err === 'string' ? err : (err?.message || err?.stack || String(err || ''));

    // Capture screenshot FIRST, before any other browser commands that might fail (e.g. getPageSource).
    // Bidi/scrollIntoView errors can leave the session degraded; screenshot ASAP for dashboard.
    await captureFailureScreenshot(scenario, context);

    if (isElementOrSelectableError(msg)) {
      const oldSelector = extractSelectorFromError(msg);
      const text = extractTextFromStep(step.text);
      let domHtml = null;
      try {
        if (typeof browser !== 'undefined' && browser.getPageSource) {
          domHtml = await browser.getPageSource();
        }
      } catch (_) {}
      await heal(oldSelector || 'unknown', text || '', {
        step: step.text,
        scenario: scenario.name,
        domHtml: domHtml || undefined,
      });
      if (domHtml) {
        try {
          let featureName = context?.feature?.name || context?.gherkinDocument?.feature?.name;
          if (!featureName && scenario?.uri) {
            const fullPath = path.isAbsolute(scenario.uri) ? scenario.uri : path.join(process.cwd(), scenario.uri);
            if (fs.existsSync(fullPath)) {
              const content = fs.readFileSync(fullPath, 'utf8');
              const m = content.match(/^\s*Feature:\s*(.+)$/m);
              if (m) featureName = m[1].trim();
            }
          }
          featureName = featureName || 'Feature';
          persistFailureDom(`${featureName}::${scenario.name}`, domHtml);
        } catch (_) {}
      }
    }
  },
  afterScenario: async function (world, result, context) {
    if (result?.passed) return;
    const pickle = world?.pickle;
    if (!pickle?.name) return;
    const scenarioLike = {
      name: pickle.name,
      uri: pickle.uri || world?.source?.uri,
    };
    await captureFailureScreenshot(scenarioLike, context);
  },
};
