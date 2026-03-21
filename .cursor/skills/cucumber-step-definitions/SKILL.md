---
name: cucumber-step-definitions
description: Write Cucumber step definitions for unified QA platform. Use when creating or editing step definitions, mapping Xray test cases to Gherkin, or working with features/step-definitions.
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

If Gherkin contains dots or slashes (e.g. `mlb.com/tv`), use regex to avoid Cucumber parsing:

```javascript
Given(/^they attempt to go to mlb\.com\/tv$/, async function () { ... });
```

## Step handler signatures

Cucumber passes captured groups as arguments. Accept them:

```javascript
When('the user hovers over the {string} button from the top nav', async function (buttonLabel) {
  // buttonLabel = "ACCOUNT"
});
```
