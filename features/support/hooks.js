/**
 * WebdriverIO Cucumber hooks - triggers self-healing on element-not-found failures
 */
const { heal } = require('../../selfheal/selfHeal');

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

module.exports = {
  afterStep: async function (step, scenario, result, context) {
    if (result?.passed || !result?.error) return;

    const err = result.error;
    const msg = typeof err === 'string' ? err : (err?.message || err?.stack || String(err || ''));
    const isElementNotFound =
      /element.*not (found|displayed|exist|clickable)/i.test(msg) ||
      /could not be located/i.test(msg) ||
      /no such element/i.test(msg);

    if (!isElementNotFound) return;

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
  },
};
