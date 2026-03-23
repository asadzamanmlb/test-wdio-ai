/**
 * Overwrites element commands to highlight before every interaction.
 * Loaded via wdio before() hook. Works with HIGHLIGHT_ELEMENTS (default: off; set to 1 to enable).
 */
const {
  highlightBeforeInteract,
  HIGHLIGHT_ENABLED,
  flashAssertionHighlight,
  HIGHLIGHT_ASSERTIONS_ENABLED,
} = require('./highlight');

function registerHighlightOverwrites(browser) {
  if (!HIGHLIGHT_ENABLED) return;

  const overwrites = [
    ['click', (orig) => orig()],
    ['doubleClick', (orig) => orig()],
    ['setValue', (orig, value) => orig(value)],
    ['addValue', (orig, value) => orig(value)],
    ['clearValue', (orig) => orig()],
  ];

  overwrites.forEach(([cmd, fn]) => {
    browser.overwriteCommand(
      cmd,
      async function (origFn, ...args) {
        return highlightBeforeInteract(this, () => fn(origFn, ...args));
      },
      true
    );
  });

  /** After a successful wait, flash **blue** outline on that element (vs red before click/type). */
  if (HIGHLIGHT_ASSERTIONS_ENABLED) {
    browser.overwriteCommand(
      'waitForDisplayed',
      async function (origWaitForDisplayed, options) {
        await origWaitForDisplayed.call(this, options);
        await flashAssertionHighlight(this, { scroll: true }).catch(() => {});
      },
      true
    );
    browser.overwriteCommand(
      'waitForClickable',
      async function (origWaitForClickable, options) {
        await origWaitForClickable.call(this, options);
        await flashAssertionHighlight(this, { scroll: true }).catch(() => {});
      },
      true
    );
  }
}

module.exports = { registerHighlightOverwrites };
