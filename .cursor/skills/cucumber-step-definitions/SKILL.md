---
name: cucumber-step-definitions
description: Write Cucumber step definitions for unified QA platform. Use when creating or editing step definitions, mapping Xray test cases to Gherkin, working with features/step-definitions, or wiring WebTV steps to Media Center / EPG video-enabled game helpers.
---

# Cucumber Step Definitions

## Structure

- **Features**: `features/<product>/*.feature` (e.g. `features/webtv/login.feature`)
- **Steps**: `features/step-definitions/*.steps.js`
- **Page objects**: `features/pageobjects/*.object.js`

## Xray alignment

Sync features with Xray by including test key in scenarios:

```gherkin
  Scenario: Smoke | Log In (WSTE-35)
```

Step definitions should mirror Gherkin phrasing. For dynamic values use Cucumber expressions: `{string}`, `{int}`.

## Imports and config

```javascript
const { Given, When, Then } = require('@wdio/cucumber-framework');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { baseUrl } = require('../../config/env');
const pageObj = require('../pageobjects/foo.object');
const { qaTestUsers } = require('../../testUsers');
```

## Test users

Use `qaTestUsers` from `testUsers.js` for persona-based steps:

```javascript
const email = process.env.TEST_EMAIL || qaTestUsers['Yearly User'];
const password = process.env.TEST_PASSWORD || qaTestUsers.Password;
// Or parameterize: qaTestUsers[userType] when step passes user type
```

## Regex for special characters

Cucumber string expressions treat these as special: `( ) { } [ ] / .`
Use regex instead of string when step text contains them. **Symptom:** Step shows "is not defined" even though a step def exists — the string pattern failed to match due to special chars.

```javascript
// Parentheses (e.g. "EX:2026/11/02") — string fails
Then(/^the user can view up to end of the current season \(EX:2026\/11\/02\)$/, async function () { ... });

// Parentheses in assertion text (e.g. "this includes innings and final score")
And(/^all available data is hidden from the user \(this includes innings and final score\)$/, async function () { ... });

// Dots, slashes (e.g. mlb.com/tv)
Given(/^they attempt to go to mlb\.com\/tv$/, async function () { ... });
```

Escape parens in regex: `\(` and `\)`. The WebTV automate flow and agent auto-convert such steps to regex.

## Step handler signatures

Cucumber passes captured groups as arguments. Accept them:

```javascript
When('the user hovers over the {string} button from the top nav', async function (buttonLabel) {
  // buttonLabel = "ACCOUNT"
});
```

## Reusing steps (platform-first)

When a step throws "Not implemented" but a **semantic equivalent** exists elsewhere (e.g. "an entitled user is logged in" vs "an entitled user is logged into mlb.com/tv"):

1. Add an alias in the platform file pointing to the same handler: `Given('an entitled user is logged in', ensureLoggedIntoMlbTv)`
2. Remove the stub from the scenario's step def file
3. Add a comment: `// "an entitled user is logged in" defined in login.steps.js`

Do NOT implement the same logic twice. Prefer aliases over duplicate implementations.

## WebTV: opening a video-enabled game from the schedule

Do **not** reimplement schedule + EPG logic inside step bodies. Call shared helpers:

- `openGamePlaybackWithScheduleFallbacks()` in `features/helpers/mediaCenterOpenGame.js` — EPG v3 search for **`videoFeeds`**, then tile by **`gamePk`**, modal **Video** + **`callLetters`**, then legacy fallback.
- **`webtv-test-automate`** skill — section **“EPG search — video-enabled games”** (API params, selection rules, `epgSearchVideoGame.js`).
