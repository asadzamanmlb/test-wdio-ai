/**
 * Highlight elements before interaction so users can verify the correct element is found.
 * ON by default. Disable with: HIGHLIGHT_ELEMENTS=0
 */
const HIGHLIGHT_ENABLED = process.env.HIGHLIGHT_ELEMENTS !== '0' && process.env.HIGHLIGHT_ELEMENTS !== 'false';
const HIGHLIGHT_DURATION_MS = parseInt(process.env.HIGHLIGHT_DURATION_MS || '1000', 10);

function applyHighlight(el) {
  if (el && el.style) {
    el.style.setProperty('outline', '4px solid red');
    el.style.setProperty('outline-offset', '2px');
    el.style.setProperty('box-shadow', '0 0 12px 2px rgba(255,0,0,0.8)');
  }
}

function removeHighlight(el) {
  if (el && el.style) {
    el.style.removeProperty('outline');
    el.style.removeProperty('outline-offset');
    el.style.removeProperty('box-shadow');
  }
}

/**
 * Add red outline to element, wait briefly, then run the interaction.
 * @param {WebdriverIO.Element} element - The element to highlight
 * @param {Function} interact - Async function that performs the interaction (e.g. () => element.click())
 * @returns {Promise} Result of the interaction
 */
async function highlightBeforeInteract(element, interact) {
  if (!HIGHLIGHT_ENABLED || !element) {
    return typeof interact === 'function' ? interact() : interact;
  }
  try {
    await browser.execute(applyHighlight, element);
  } catch (e) {
    try {
      await element.execute(applyHighlight);
    } catch (_) {}
    console.warn('[highlight] Fallback or failed:', e.message);
  }
  await new Promise((r) => setTimeout(r, HIGHLIGHT_DURATION_MS));
  const result = typeof interact === 'function' ? await interact() : await element.click();
  try {
    await browser.execute(removeHighlight, element);
  } catch (_) {
    try { await element.execute(removeHighlight); } catch (__) {}
  }
  return result;
}

/**
 * Highlight element only (no interaction). Use before your own .click(), .setValue(), etc.
 * @param {WebdriverIO.Element} element
 */
async function highlightElement(element) {
  if (!HIGHLIGHT_ENABLED || !element) return;
  try {
    await browser.execute(applyHighlight, element);
  } catch (_) {
    try { await element.execute(applyHighlight); } catch (__) {}
  }
  await new Promise((r) => setTimeout(r, HIGHLIGHT_DURATION_MS));
}

module.exports = {
  highlightBeforeInteract,
  highlightElement,
  HIGHLIGHT_ENABLED,
};
