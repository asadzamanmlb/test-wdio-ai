---
name: no-browser-pause-wdio
description: Enforces use of explicit waits instead of browser.pause() in WebdriverIO and Cucumber tests. Use when writing or editing step definitions, test automation, WebdriverIO, or Cucumber feature files.
---

# No browser.pause() in WebdriverIO Tests

Do **not** use `browser.pause()` in step definitions or test code.

## Instead use

| Case | Use |
|------|-----|
| Wait for element visible | `element.waitForDisplayed({ timeout: 10000 })` |
| Wait for element clickable | `element.waitForClickable({ timeout: 10000 })` |
| Wait for element to exist | `element.waitForExist({ timeout: 10000 })` |
| Wait for custom condition | `browser.waitUntil(async () => ..., { timeout: 10000, timeoutMsg: '...' })` |

## Example replacements

```javascript
// ❌ Avoid
await browser.pause(2000);
await btn.click();

// ✅ Prefer
await btn.waitForClickable({ timeout: 10000 });
await btn.click();
```

```javascript
// ❌ Avoid
await browser.pause(3000);
const visible = await el.isDisplayed();

// ✅ Prefer
await el.waitForDisplayed({ timeout: 10000 });
```
