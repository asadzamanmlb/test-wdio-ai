---
name: self-healing-selectors
description: Self-healing for element/selector failures - real-time DOM capture, analyzeDom, RAG, and auto-update selectors. Use when fixing element-not-found, selector timeouts, or updating page objects from failure DOM.
---

# Self-Healing Selectors

## Purpose

On element/selector failures during WebdriverIO Cucumber tests, the system captures **real-time DOM** and suggests alternative selectors. The Dashboard Fix button and agents can auto-apply fixes.

## Automatic Capture (hooks.js)

When a step fails with an element-related error, `features/support/hooks.js` `afterStep`:

1. **Captures screenshot** → `reports/screenshots/` + `reports/failure-screenshots.json`
2. **Captures DOM** → `browser.getPageSource()` (real-time HTML at failure)
3. **Calls `heal()`** → analyzes DOM, RAG lookup, writes suggestions
4. **Persists DOM** → `reports/failure-dom.json` (for Planner/Generator)

Triggered by: `no such element`, `unable to locate`, `timeout`, `stale element`, `element click intercepted`, `did not appear`, etc.

## Flow

```
Step fails → afterStep → heal(oldSelector, text, { domHtml }) 
    → analyzeDom(domHtml) + RAG search 
    → .selfheal-report.json
    → failure-dom.json
```

## Outputs

| File | Content |
|------|---------|
| `.selfheal-report.json` | Suggested selectors per failure: `oldSelector`, `suggestedSelectors`, `step`, `scenario` |
| `reports/failure-dom.json` | `{ scenarioId: { domHtml, timestamp } }` — DOM at failure |
| `reports/screenshots/*.png` | Visual capture at failure |

## Auto-Update (Dashboard Fix + agents.js)

When you click **Fix** on the dashboard for an element failure:

1. `isElementError(failReason)` → true
2. `plan({ failReason, failStep, domHtml })` → RAG + `analyzeDom(domHtml)` → suggested selectors
3. `generate(plan)` → finds files with `oldSelector`, replaces with `suggestedSelectors[0]`
4. Retries test

Files updated: `features/pageobjects/*.object.js`, `features/step-definitions/*.steps.js`

## Manual / Agent Usage

When fixing selector failures:

1. **Check `.selfheal-report.json`** — last entry has `suggestedSelectors`
2. **Check `reports/failure-dom.json`** — `domHtml` for the scenario
3. **Use `analyzeDom(domHtml, oldSelector, text)`** — get suggestions from DOM (Cheerio)
4. **Update page object or step def** — replace old selector with a suggested one
5. **Selector priority** — id > data-testid > aria-label > name > text > xpath

## When oldSelector Is Unknown

If the error doesn't contain a selector (e.g. custom `timeoutMsg: 'Login page / email input did not appear'`):

- `heal('unknown', text)` still runs if the error matches element patterns
- `analyzeDom` uses `text` (from step) to find matching elements — e.g. step "enters valid Email" → text="Email" → find inputs with placeholder/aria-label containing "email"
- Add pattern in hooks: `/(did not appear|input did not appear)/i` so custom timeout messages trigger heal

## RAG (rag/vectorDB.js)

- Stores fixes: `save(query, { selector, suggestedSelectors, step, scenario })`
- Search: `searchWithEmbeddings(query, k)` → prior fixes for similar failures
- Memory: `.rag-memory.json`

## Related

- **ai/agents.js** — `plan()`, `generate()`, `isElementError()`
- **selfheal/selfHeal.js** — `heal()`, `analyzeDom()`
- **webtv-test-automate** — "On selector/element failures, hooks capture DOM and call heal()"
