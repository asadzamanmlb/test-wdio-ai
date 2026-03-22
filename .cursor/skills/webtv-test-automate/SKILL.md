---
name: webtv-test-automate
description: WebTV test automation - create feature files, step definitions, page objects from manual scenarios. Uses webTv-temp for reference, runs tests, and iterates with self-heal until pass. Use when automating WebTV (WSTE-*) tests, fixing duplicate step definitions, Media Center archive playback selectors, or asked about WebTV QA automation.
---

# WebTV Test Automation

## Purpose

Automate manual WebTV test scenarios by creating feature files, step definitions, page objects, running tests, and iterating with self-heal + webTv-temp examples until the test passes.

## Reference Sources

**1. Platform step-definitions** — Check FIRST for existing implementations:
- `features/step-definitions/login.steps.js` — login, logout, mlb.com/tv navigation
  - `an entitled user is logged into mlb.com/tv` — same as `the user is already logged into mlb.com/tv`
  - `they attempt to go to mlb.com/tv`, `the user is successfully logged in`, etc.
- `features/step-definitions/*.steps.js` — other shared steps
- **Rule:** Do NOT create stubs for steps that already exist in login.steps.js or other platform files. Remove stub and let the shared step handle it.

**2. webTv-temp** — when platform has no match:
- `webTv-temp/features/web/smoke/*.feature` — feature structure, scenarios
- `webTv-temp/features/step-definitions/` — step implementations
- `webTv-temp/pageobjects/` — selectors, page structure

## Flow (WebTV QA Engineer Loop)

1. **Create** — Feature file, step defs, page objects from `testcase/webTv/{key}.json`
2. **Run** — Execute the test via wdio
3. **On failure** — Use self-heal (RAG + DOM), webTv-temp examples, fix selectors/step defs
4. **Retry** — Loop until pass or max attempts (~10)
5. **Real-time capture** — Hooks persist DOM on failure for agent analysis

## Key Paths

| Item | Path |
|------|------|
| Features | `features/webtv/*.feature` |
| Step defs | `features/step-definitions/*.steps.js` |
| Page objects | `features/pageobjects/*.object.js` |
| Test cases | `testcase/webTv/*.json` |
| Reference | `webTv-temp/` |

## Automation Script

```bash
node ai/webtvQaEngineer.js WSTE-44
```

Or via npm:
```bash
npm run webtv:automate -- WSTE-44
```

## When Implementing Steps

1. **Check platform first:** Search `features/step-definitions/login.steps.js` and other `*.steps.js` for matching step text (e.g. "logged into mlb.com/tv", "user is logged in")
2. **If found:** Remove the stub from the scenario's step def file; the shared step will match
3. **If not found:** Search webTv-temp for similar step text (e.g. "navigate to Media Center", "select date", "VOD playback")
4. Copy/adjust selectors from webTv-temp page objects
5. Use CommonJS (`require`), not ES modules
6. Follow `config/env.js` for baseUrl; use `qaTestUsers` from `testUsers.js` for login
7. No `browser.pause()` — use explicit waits (`waitUntil`, `waitForDisplayed`, etc.)
8. **Element highlighting** — ON by default. Every `click()`, `setValue()`, `addValue()`, `clearValue()` highlights the element (4px red outline, box-shadow) before interaction. Disable with `HIGHLIGHT_ELEMENTS=0`. Optional: `HIGHLIGHT_DURATION_MS=2000` for longer visibility (default 1000ms).

## Self-Heal Integration

On selector/element failures, hooks capture DOM and call `heal()`. RAG stores fixes. The agent's Planner uses RAG + `analyzeDom(domHtml)` when DOM is persisted. Generator applies fixes to page objects/step defs.

## Error Types Handled

| Error | Handler |
|-------|---------|
| **SyntaxError: Unexpected end of input** | Remove incomplete/duplicate step blocks; truncate at last `});` |
| **Invalid regular expression flags** (e.g. `\\/` over-escaped) | Fix `\\\\/` → `\/` in step defs |
| **Cucumber Expression** (parentheses, slashes) | Convert string pattern to regex with escaped chars |
| **Not implemented** | 1) Check `login.steps.js` etc. for existing step; 2) Copy similar step from webTv-temp |
| **Element/selector not found** | Planner + Generator (RAG + DOM) |
| **And/Or not defined** | Use `const And = Then;` in step defs |

### Cucumber Expression Fix

Step text like `the user can view up to end of the current season (EX:2026/11/02)` breaks Cucumber string expressions (parentheses are special). Use regex instead:

```javascript
Then(/^the user can view up to end of the current season \(EX:2026\/11\/02\)$/, async function () { ... });
```

The agent and `automateScenario` auto-detect and use regex for steps with `()`, `{}`, `[]`, `/`.

## WebTV QA Engineer — Implemented & Future

**Implemented in `ai/webtvQaEngineer.js`:**
- **Platform-first for "Not implemented":** When "Not implemented" occurs, `tryFillFromWebTvTemp` first calls `tryRemoveStubForPlatformStep` — searches `features/step-definitions/*.js` for matching step; if found, removes the stub so the shared step (e.g. from login.steps.js) handles it.
- **Known shared steps** (in login.steps.js): `an entitled user is logged into mlb.com/tv`, `the user is already logged into mlb.com/tv`, `they attempt to go to mlb.com/tv`, `the user is successfully logged in`

**Future: automateScenario** — When generating stubs, skip steps that already exist in login.steps.js (e.g. grep for the step pattern before creating a stub).

## Duplicate Step Definitions

When the same step text is defined in multiple step-definition files, Cucumber uses one definition (load order: alphabetical by filename). A stub that throws `Not implemented` can override the working implementation.

**Fix:** Define each step in ONE file only. If another scenario needs the same step:
- Remove the duplicate definition from the other file
- Add a comment: `// "step text" defined in other-file.steps.js`
- Both scenarios will use the single definition

**Example:** `smoke-archive-game-playback-hide-spoiler.steps.js` and `smoke-verify-archive-game-playback-defau.steps.js` both had `Then("playback starts at the beginning of the stream")`. The stub in smoke-archive was overriding the implementation in smoke-verify. Removing the duplicate fixed the failing test.

## Media Center / Archive Playback

When automating "select archived game for playback" or similar:

1. **Date selection** — Use past in-season dates (e.g. 2024/2025), not future dates. Archive games may not exist for upcoming seasons.
2. **Game tiles** — Use multiple fallbacks: `a[href*="/tv/g"]`, `a[href*="/watch/"]`, `[data-testid*="game-card"]`, `[class*="ScheduleGame"] a`
3. **Wait for tiles** — Game tiles load asynchronously. Use `browser.waitUntil` (e.g. 15s) before failing with "no game tiles found"
4. **Feed modal vs cookie modal** — `[role="dialog"]` matches Privacy/Cookie consent. Exclude it: `[role="dialog"]:not([aria-label*="Privacy"]):not([aria-label*="Cookie"])` or use specific selectors like `[data-testid*="feed"]`
