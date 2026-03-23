# Element highlight during WebdriverIO runs

## Interaction (red) — default

Before **click**, **doubleClick**, **setValue**, **addValue**, **clearValue**, the matching element gets a **red** outline briefly, then the command runs.

- **On by default.** Disable: `HIGHLIGHT_ELEMENTS=0`
- **Duration:** `HIGHLIGHT_DURATION_MS` (default `1000`)

## Assertion / verify (blue)

So you can tell **which element was just waited on or asserted**:

1. **Automatic:** After a successful **`waitForDisplayed`** or **`waitForClickable`**, that element is flashed with a **blue** outline (then outline is removed).
2. **Hide Spoilers line-score step:** Before reading text for spoiler checks, the **line score strip** (or fallback innings/score region) is flashed blue.
3. **Manual:** In step defs or helpers:

```javascript
const { assertWithHighlight, flashAssertionHighlight } = require('../support/highlight');

await assertWithHighlight(await $('#my-node'), async () => {
  expect(await $('#my-node').getText()).toContain('ok');
});

await flashAssertionHighlight(await $('.panel'), { durationMs: 1500, scroll: true });
```

### Env vars (assertion flash)

| Variable | Effect |
|----------|--------|
| `HIGHLIGHT_ASSERTIONS=0` | Turn off **blue** assertion flashes only (red interaction highlight still follows `HIGHLIGHT_ELEMENTS`) |
| `HIGHLIGHT_ASSERTION_MS` | How long the blue outline stays (default: same as `HIGHLIGHT_DURATION_MS`) |
| `HIGHLIGHT_ASSERTION_COLOR` | Outline color, default `#0066ff` |

**Note:** Extra flashes add a short delay (intentional, for visibility). Disable in CI with `HIGHLIGHT_ELEMENTS=0` or `HIGHLIGHT_ASSERTIONS=0` if you need maximum speed.
