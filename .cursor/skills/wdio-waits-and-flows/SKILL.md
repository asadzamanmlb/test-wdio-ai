---
name: wdio-waits-and-flows
description: WebdriverIO wait strategies and handling Okta, cookie consent, redirects. Use when fixing flaky steps, handling dynamic content, or debugging WebdriverIO tests.
---

# WebdriverIO Waits and Flows

## Do not use browser.pause()

Use explicit waits. See `no-browser-pause-wdio` skill.

## Explicit waits

```javascript
await el.waitForDisplayed({ timeout: 10000 });
await el.waitForClickable({ timeout: 10000 });
await el.waitForExist({ timeout: 10000 });
```

## Custom condition

```javascript
await browser.waitUntil(
  async () => {
    const el = await $('selector');
    return (await el.isExisting()) && (await el.isDisplayed());
  },
  { timeout: 15000, timeoutMsg: 'Element never appeared' }
);
```

## Okta flow order

1. Email → Continue
2. If "Verify with Password" appears → click it
3. Password → Log In

Handle "Verify with Password" in the Continue step or immediately before password.

## Cookie consent

Try multiple selectors; fail gracefully if none found:

```javascript
const selectors = ['button#onetrust-accept-btn-handler', '[data-testid="consent-banner"] button'];
for (const sel of selectors) {
  const btn = await $(sel);
  if (await btn.isExisting().catch(() => false) && await btn.isDisplayed()) {
    await btn.waitForClickable({ timeout: 2000 }).catch(() => {});
    await btn.click();
    break;
  }
}
```

## BETA pre-auth

Check for `#username`; if present, fill and submit before main flow.

## Redirect races

When a step asserts page content but the page redirects in N seconds, consider both outcomes: message present OR redirect completed (`url.includes('mlb.com') && !url.includes('/logout')`).
