/**
 * Highlight elements before interaction so users can verify the correct element is found.
 * ON by default. Disable with: HIGHLIGHT_ELEMENTS=0
 *
 * Assertion / verify flashes (blue outline): enabled when interaction highlights are on,
 * unless HIGHLIGHT_ASSERTIONS=0. Override color: HIGHLIGHT_ASSERTION_COLOR=#0066ff
 */
const HIGHLIGHT_ENABLED = process.env.HIGHLIGHT_ELEMENTS !== '0' && process.env.HIGHLIGHT_ELEMENTS !== 'false';
const HIGHLIGHT_DURATION_MS = parseInt(process.env.HIGHLIGHT_DURATION_MS || '1000', 10);
const HIGHLIGHT_ASSERTION_MS = parseInt(process.env.HIGHLIGHT_ASSERTION_MS || String(HIGHLIGHT_DURATION_MS), 10);
const ASSERTION_OUTLINE_COLOR = process.env.HIGHLIGHT_ASSERTION_COLOR || '#0066ff';
const HIGHLIGHT_ASSERTIONS_ENABLED =
  HIGHLIGHT_ENABLED && process.env.HIGHLIGHT_ASSERTIONS !== '0' && process.env.HIGHLIGHT_ASSERTIONS !== 'false';

function applyHighlight(el) {
  if (el && el.style) {
    el.style.setProperty('outline', '4px solid red');
    el.style.setProperty('outline-offset', '2px');
    el.style.setProperty('box-shadow', '0 0 12px 2px rgba(255,0,0,0.8)');
  }
}

/** Rough hex #rrggbb → rgba(...,0.75) for glow */
function hexToRgbaShadow(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return 'rgba(0,102,255,0.75)';
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},0.75)`;
}

function removeHighlight(el) {
  if (el && el.style) {
    el.style.removeProperty('outline');
    el.style.removeProperty('outline-offset');
    el.style.removeProperty('box-shadow');
  }
}

/** Blue outline in the browser (colors passed explicitly — execute() does not keep Node closures). */
async function applyAssertionOutline(element) {
  const glow = hexToRgbaShadow(ASSERTION_OUTLINE_COLOR);
  await browser.execute(
    (el, outline, shadowGlow) => {
      if (el && el.style) {
        el.style.setProperty('outline', `4px solid ${outline}`);
        el.style.setProperty('outline-offset', '2px');
        el.style.setProperty('box-shadow', `0 0 14px 3px ${shadowGlow}`);
      }
    },
    element,
    ASSERTION_OUTLINE_COLOR,
    glow
  );
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

/**
 * Flash an element with the **assertion** color (default blue), then remove outline.
 * Use after a successful wait or around custom checks so you see **which** node was verified.
 * @param {WebdriverIO.Element} element
 * @param {{ durationMs?: number, scroll?: boolean }} [opts]
 */
async function flashAssertionHighlight(element, opts = {}) {
  if (!HIGHLIGHT_ASSERTIONS_ENABLED || !element) return;
  const durationMs = opts.durationMs ?? HIGHLIGHT_ASSERTION_MS;
  const scroll = opts.scroll !== false;
  try {
    if (scroll) await element.scrollIntoView().catch(() => {});
    await applyAssertionOutline(element);
  } catch (_) {}
  await new Promise((r) => setTimeout(r, durationMs));
  try {
    await browser.execute(removeHighlight, element);
  } catch (_) {
    try { await element.execute(removeHighlight); } catch (__) {}
  }
}

/**
 * Run an async assertion with the element flashed first (visible for HIGHLIGHT_ASSERTION_MS).
 * @param {WebdriverIO.Element | null} element
 * @param {() => Promise<unknown>} fn
 */
async function assertWithHighlight(element, fn) {
  if (!element || !HIGHLIGHT_ASSERTIONS_ENABLED) {
    return fn();
  }
  try {
    await element.scrollIntoView().catch(() => {});
    await applyAssertionOutline(element);
  } catch (_) {}
  await new Promise((r) => setTimeout(r, HIGHLIGHT_ASSERTION_MS));
  try {
    return await fn();
  } finally {
    try {
      await browser.execute(removeHighlight, element);
    } catch (_) {
      try { await element.execute(removeHighlight); } catch (__) {}
    }
  }
}

module.exports = {
  highlightBeforeInteract,
  highlightElement,
  flashAssertionHighlight,
  assertWithHighlight,
  HIGHLIGHT_ENABLED,
  HIGHLIGHT_ASSERTIONS_ENABLED,
  HIGHLIGHT_ASSERTION_MS,
  ASSERTION_OUTLINE_COLOR,
};
