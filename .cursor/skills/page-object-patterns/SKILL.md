---
name: page-object-patterns
description: Page object patterns for MLB WebTV and Okta flows. Use when creating page objects, adding locators, or working with features/pageobjects.
---

# Page Object Patterns

## Location

`features/pageobjects/<name>.object.js` — CommonJS module.

## Structure

```javascript
module.exports = {
  elementName: () => $('selector'),
};
```

Use **functions** that return `$()` so elements are resolved at call time (avoids stale refs).

## MLB.com selectors

| Element | Preferred |
|--------|-----------|
| Account/profile | `[data-testid="header-profile-button"]`, `[aria-label="Account"]` |
| Log in link | `[data-testid="headerLink-Log In"]` |
| Cookie consent | `button#onetrust-accept-btn-handler`, `[data-testid="consent-banner"] button` |

Prefer `data-testid` and `aria-label` over class names.

## Okta selectors

| Field | Selector |
|-------|----------|
| Email | `//input[@name="identifier"]` |
| Password | `//input[@name="credentials.passcode"]`, `//input[@name="passcode"]` |
| Continue/Submit | `//input[@data-type="save"]` |
| Verify with Password | `//*[contains(text(),'Verify') and contains(text(),'Password')]` |

## Okta iframe (MLB QA)

MLB login at `qa-gcp.mlb.com/login` may embed Okta in an iframe. If email input is not found in main document:

1. Switch to iframe: `await browser.switchFrame($('iframe[src*="okta"], iframe[id*="okta"]'))`
2. Find email input within iframe (same selectors as above)
3. After login, switch back: `await browser.switchFrame(null)`

Use fallback selectors when structure varies: `input[name="username"]`, `#username`, `input[type="email"]`, `input[autocomplete="username"]`, `input[placeholder*="email" i]`.

## BETA pre-auth (bot form)

`#username`, `#password`, `#login-button`

## Cross-page elements

Shared locators (e.g. header, account dropdown) go in `commonPage.object.js`.
