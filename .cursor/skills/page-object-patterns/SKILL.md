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

## BETA pre-auth (bot form)

`#username`, `#password`, `#login-button`

## Cross-page elements

Shared locators (e.g. header, account dropdown) go in `commonPage.object.js`.
