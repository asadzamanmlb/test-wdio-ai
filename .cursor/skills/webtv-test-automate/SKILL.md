---
name: webtv-test-automate
description: WebTV test automation - create feature files, step definitions, page objects from manual scenarios. Uses webTv-temp for reference, runs tests, and iterates with self-heal until pass. Use when automating WebTV (WSTE-*) tests, fixing duplicate step definitions, Media Center archive playback selectors, EPG search for video-enabled games, or asked about WebTV QA automation.
---

# WebTV Test Automation

## Summary (Single Automate Click = Full Workflow)

When you click **Automate** for WSTE-* (e.g. WSTE-40), the webtvQaEngineer agent follows this 6-step flow. See `.cursor/rules/webtvQaEngineer.mdc` for the consolidated rule.

1. **Feature file first** — Create or update from testcase JSON; skip if scenario exists
2. **Step definitions** — Reuse existing steps from platform; add new ones, use webTv-temp as reference
3. **Page objects** — Reuse existing; add new for selectors; no inline locators
4. **Reusable functions** — Steps call functions; no inline page objects in step bodies
5. **Run and fix** — One step at a time; capture DOM on failure; use RAG/self-heal
6. **Loop until pass** — Retry until test passes or max attempts

## Purpose

Automate manual WebTV test scenarios by creating feature files, step definitions, page objects, running tests, and iterating with self-heal + webTv-temp examples until the test passes.

## Reference Sources

**1. Platform step-definitions** — Check FIRST for existing implementations:
- `features/step-definitions/login.steps.js` — login, logout, mlb.com/tv navigation
  - `an entitled user is logged into mlb.com/tv` — same as `the user is already logged into mlb.com/tv`
  - `an entitled user is logged in` — alias for above (add in login.steps.js if feature uses this phrasing)
  - `they attempt to go to mlb.com/tv`, `the user is successfully logged in`, etc.
- `features/step-definitions/*.steps.js` — other shared steps
- **Rule:** Do NOT create stubs for steps that already exist in login.steps.js or other platform files. Remove stub and let the shared step handle it.
- **Semantic aliases:** If feature step text is a semantic equivalent (e.g. "logged in" vs "logged into mlb.com/tv"), add an alias in the platform file pointing to the same handler. Remove any stub from the scenario's step def file.

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

## Related Skills

- **fix-tests-add-skills** — Add or update skills when fixing tests so fixes can be reused for other scenarios.
- **self-healing-selectors** — Real-time DOM capture, analyzeDom, RAG, auto-update selectors on element failures.
- **mlb-login-selectors** — When WSTE-35 login fails on email input: fallbacks, Okta iframe, MLB QA flow.
- **page-object-patterns** — Okta iframe, fallback selectors.
- **wdio-waits-and-flows** — MLB QA login waits, iframe handling.

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
2. **If exact match found:** Remove the stub from the scenario's step def file; the shared step will match
3. **If semantic equivalent found:** Add an alias in the platform file (e.g. `Given('an entitled user is logged in', ensureLoggedIntoMlbTv)` in login.steps.js). Remove the stub from the scenario's step def file.
4. **If not found:** Search webTv-temp for similar step text (e.g. "navigate to Media Center", "select date", "VOD playback")
5. Copy/adjust selectors from webTv-temp page objects
6. Use CommonJS (`require`), not ES modules
7. Follow `config/env.js` for baseUrl; use `qaTestUsers` from `testUsers.js` for login
8. No `browser.pause()` — use explicit waits (`waitUntil`, `waitForDisplayed`, etc.)
9. **Element highlighting** — OFF by default. Enable with `HIGHLIGHT_ELEMENTS=1`. Every `click()`, `setValue()`, `addValue()`, `clearValue()` highlights the element (4px red outline, box-shadow) before interaction when enabled. Optional: `HIGHLIGHT_DURATION_MS=2000` for longer visibility (default 1000ms).

## Self-Heal Integration

On selector/element failures, hooks capture DOM and call `heal()`. RAG stores fixes. The agent's Planner uses RAG + `analyzeDom(domHtml)` when DOM is persisted. Generator applies fixes to page objects/step defs.

## Error Types Handled

| Error | Handler |
|-------|---------|
| **Agent says "Unfixable" but test fails on "Not implemented"** | failReason was the wdio summary (last 500 chars) instead of the real error. Fix: extract actual error from stdout (search for `Error:`, `Not implemented`, `element not found`, etc.) when Cucumber JSON report is missing or empty. Also try multiple report filenames (scan `reports/json/*.json` for file containing scenario tag). See `extractFailReasonFromOutput` in dashboard-server.js, agents.js runTestDirect. |
| **SyntaxError: Unexpected end of input** | Remove incomplete/duplicate step blocks; truncate at last `});` |
| **Invalid regular expression flags** (e.g. `\\/` over-escaped) | Fix `\\\\/` → `\/` in step defs |
| **Cucumber Expression** (parentheses, slashes) | Convert string pattern to regex with escaped chars |
| **Step "is not defined"** but step def exists | Step text has `()`, `{}`, `[]`, `/` — use regex: `And(/^all available data is hidden from the user \(this includes innings and final score\)$/, ...)` |
| **Not implemented** | 1) Check `login.steps.js` etc. for exact or semantic match; 2) If semantic equivalent exists (e.g. "logged in" vs "logged into mlb.com/tv"), add alias in platform file and remove stub; 3) If no match, copy similar step from webTv-temp |
| **Element/selector not found** | Planner + Generator (RAG + DOM) |
| **And/Or not defined** | Use `const And = Then;` in step defs |

### Cucumber Expression Fix

Step text like `the user can view up to end of the current season (EX:2026/11/02)` breaks Cucumber string expressions (parentheses are special). Use regex instead:

```javascript
Then(/^the user can view up to end of the current season \(EX:2026\/11\/02\)$/, async function () { ... });
```

The agent and `automateScenario` auto-detect and use regex for steps with `()`, `{}`, `[]`, `/`.

## WebTV QA Engineer — Implemented & Future

**Implemented in `ai/webtvQaEngineer.js` and dashboard Fix:**
- **Platform-first for "Not implemented":** When "Not implemented" occurs, `tryFillFromWebTvTemp` first calls `tryRemoveStubForPlatformStep` — searches `features/step-definitions/*.js` for matching step; if found, removes the stub so the shared step (e.g. from login.steps.js) handles it.
- **Dashboard Fix button** (`dashboard-server.js` runFixLoop): Now calls `tryFixNotImplementedError` when failReason is "Not implemented" — removes duplicate stubs or fills from webTv-temp, then retries. Same logic as webtvQaEngineer.
- **Known shared steps** (in login.steps.js): `an entitled user is logged into mlb.com/tv`, `an entitled user is logged in` (alias), `the user is already logged into mlb.com/tv`, `they attempt to go to mlb.com/tv`, `the user is successfully logged in`

**Polish at conversion time** — Xray → testcase JSON (exportTestsToJson) and testcase → feature (automateScenario) use `polishGherkin()`: normalize line endings, trim, remove excess blanks. Step def stubs use regex for steps with `()`, `[]`, `{}`, `/` via `needsRegexPattern()`. Polished feature files and step defs from the start.

## Duplicate Step Definitions

When the same step text is defined in multiple step-definition files, Cucumber uses one definition (load order: alphabetical by filename). A stub that throws `Not implemented` can override the working implementation.

**Fix:** Define each step in ONE file only. If another scenario needs the same step:
- Remove the duplicate definition from the other file
- Add a comment: `// "step text" defined in other-file.steps.js`
- Both scenarios will use the single definition

**Examples:**
- `smoke-archive-game-playback-hide-spoiler.steps.js` and `smoke-verify-archive-game-playback-defau.steps.js` both had `Then("playback starts at the beginning of the stream")` — stub overrode implementation. Remove stub → fix.
- `smoke-log-in.steps.js` and `login.steps.js` both had WSTE-35 steps (`the user is NOT logged in`, `they attempt to go to mlb.com/tv`, etc.) — stubs in smoke-log-in overrode login.steps.js, causing "8 skipped". Replace smoke-log-in stubs with comments → fix.

## Media Center / Archive Playback

When automating "select archived game for playback" or similar:

1. **Date selection** — Use past in-season dates (e.g. 2024/2025), not future dates. Archive games may not exist for upcoming seasons.
2. **Game tiles** — Use multiple fallbacks: `a[href*="/tv/g"]`, `a[href*="/watch/"]`, `[data-testid*="game-card"]`, `[class*="ScheduleGame"] a`
3. **Wait for tiles** — Game tiles load asynchronously. Use `browser.waitUntil` (e.g. 15s) before failing with "no game tiles found"
4. **Feed modal vs cookie modal** — `[role="dialog"]` matches Privacy/Cookie consent. Exclude it: `[role="dialog"]:not([aria-label*="Privacy"]):not([aria-label*="Cookie"])` or use specific selectors like `[data-testid*="feed"]`

### Reuse for Variant Step Text

When a scenario has a step that is a semantic variant of an existing step (e.g. "the user selects an archived game for playback from Hero, games tile or Media Center" vs "a user selects an archived game for playback"):

1. Extract the implementation into a shared async function in the file that has the original step
2. Have both step patterns call that function
3. Remove any stub from the scenario-specific step def file; add comment: `// "step text" defined in media-center.steps.js`

**Example (WSTE-40 fix):** Both `a user selects an archived game for playback` and `the user selects an archived game for playback from Hero, games tile or Media Center` call `selectArchivedGameForPlayback()` in `media-center.steps.js`. Media Center is one valid source (Hero/games tile are others; same flow applies).

## EPG search — video-enabled games (schedule / Media Center)

Use the **MLB EPG v3 search** API to find games that have **TV video feeds** before clicking schedule tiles. This avoids opening games with **empty `videoFeeds`** (audio-only or no stream in UI).

### API

- **Default URL:** `https://mastapi.mobile.mlbinfra.com/api/epg/v3/search`
- **Query params:** `date=YYYY-MM-DD`, `exp=MLB`, `language=en`, `timeZone=America/New_York`
- **Override:** set env `MLB_EPG_SEARCH_URL` to a full search endpoint (same query string shape).

### Code in this repo

| File | Role |
|------|------|
| `features/helpers/epgSearchVideoGame.js` | `fetchEpgSearch(date)`, `pickRandomVideoEnabledGame(results)`, `listVideoEnabledGames(results)`, `getTodayApiDate()`, `pathToApiDate(schedulePath)` |
| `features/helpers/mediaCenterOpenGame.js` | `openGamePlaybackWithScheduleFallbacks()` — **EPG first**, then legacy random tile |

### What counts as “video enabled”

From each EPG `results[]` item:

- `entitledVideo === true` and not `blackedOutVideo`
- `videoFeeds` is a **non-empty** array
- Each candidate feed: `entitled !== false`, has `contentId` or `mediaId`, `callLetters` non-empty
- `mediaState` is absent, `MEDIA_ARCHIVE`, or `MEDIA_ON` (skip other states)

The pick includes **`gamePk`**, **`callLetters`** (station / callsign for the TV feed), and **`schedulePath`** derived from `gameData.gameDate` (`YYYY/MM/DD` for Media Center URLs).

### UI flow after EPG pick

1. Open `/live-stream-games/{schedulePath}` on the configured `baseUrl` (beta/qa).
2. Find the **game tile** whose `href` contains that **`gamePk`** (`findGameTileByGamePk`).
3. Open the feed modal → if a **Video** tab exists, select it → click the control whose text includes **`callLetters`**.
4. Fallback: **Full Game** / **Condensed** / **Watch** buttons (same as non-EPG flow).
5. Wait for the video player like `startPlaybackFromPick`.

### Date order (same as schedule fallbacks)

1. **Today** (calendar date in `America/New_York`)
2. **8 random** April–September dates (last 2 years), deduped
3. **Last calendar year, April 15**

If **no** EPG pick + tile works for any date, **`openGamePlaybackWithScheduleFallbacks`** falls back to **legacy** behavior: random playable-looking `/tv/g/` tiles **without** EPG verification — document that gap if a scenario must **always** be video-API-backed.

### Docs

- `docs/webtv-domain-context.md` — short EPG-first summary for Hide Spoilers / WSTE-40 style scenarios.

## Hide Spoilers / Settings (WebTV)

For scenarios that require "Hide Spoilers" ON or OFF (e.g. WSTE-40):

- **Location:** Settings menu → General tab (from test case: "Users can access the Hide Spoiler feature in the Games player by navigating to the Settings menu under the General tab")
- **Step text:** `the users "HideSpoilers" setting are set to ON`
- **Implementation:** Navigate to Settings → General → toggle Hide Spoilers. No reference in webTv-temp; add page object selectors for Settings, General, and Hide Spoilers toggle when implementing.
