/**
 * Overwrites element commands to highlight before every interaction.
 * Loaded via wdio before() hook. Works with HIGHLIGHT_ELEMENTS (default: on).
 */
const { highlightBeforeInteract, HIGHLIGHT_ENABLED } = require('./highlight');

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
}

module.exports = { registerHighlightOverwrites };
