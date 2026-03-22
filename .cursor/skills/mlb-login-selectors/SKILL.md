---
name: mlb-login-selectors
description: MLB WebTV login page selectors and troubleshooting. Use when fixing WSTE-35 login failures, email input not found, or Okta/MLB login flow issues.
---

# MLB Login Selectors

## Context

MLB QA at `qa-gcp.mlb.com/login` may use Okta, custom MLB auth, or embedded iframes. Selectors can vary by environment.

## Email input fallbacks (loginPage.object.js)

Use in order:
1. `//input[@name="identifier"]` — Okta
2. `input[name="identifier"]`, `input[name="username"]`, `#username`
3. `input[type="email"]`, `input[autocomplete="username"]`
4. `input[placeholder*="email" i]`, `input[placeholder*="Email" i]`
5. `input[type="text"]` — last resort (first text input)

## Okta iframe

If email not found in main document:
- Switch: `await browser.switchFrame($('iframe[src*="okta"], iframe[id*="okta"], iframe'))`
- Search within iframe for same selectors
- Switch back: `await browser.switchFrame(null)`

## Flow fixes

1. **they attempt to go to mlb.com/tv** — Wait up to 15–20s for redirect to /login; try clicking Log In link if still on /tv.
2. **When the user enters a valid Email** — Wait for URL to include login/okta/auth; try all fallbacks including iframe.
3. Ensure `.env` has valid `TEST_EMAIL` and `TEST_PASSWORD` (or `qaTestUsers` from testUsers.js).

## When selectors fail

- MLB may have changed login UI; capture failure DOM/screenshot for inspection.
- Check if page uses client-side routing (SPA) — form may render after delay; increase timeout.
