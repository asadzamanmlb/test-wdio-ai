# QA Platform Agents

## WebTV QA Engineer (webtvQaEngineer)

**Trigger:** Click **Automate** for a manual WebTV scenario (e.g. WSTE-40) in the dashboard, or run `npm run webtv:automate -- WSTE-40`.

**What it does:** End-to-end automation of a manual test — creates feature file, step definitions, page objects, runs tests, fixes failures one step at a time with DOM capture and self-heal, loops until pass.

**Canonical workflow (6 steps):**
1. Feature file first — create/update from testcase JSON
2. Step definitions — reuse existing, add new from webTv-temp
3. Page objects — reuse existing, no inline locators
4. Reusable functions — steps call functions, clean architecture
5. Run and fix — one step at a time, real-time DOM capture
6. Loop until pass — retry until done

**Cursor rules & skills:** When automating, apply `.cursor/rules/webtvQaEngineer.mdc` and skills: `webtv-test-automate`, `cucumber-step-definitions`, `page-object-patterns`, `no-browser-pause-wdio`, `wdio-waits-and-flows`, `self-healing-selectors`.

**Key files:**
- `scripts/automateScenario.js` — creates feature + step stubs
- `ai/webtvQaEngineer.js` — run → fix loop
- `features/webtv/*.feature`, `features/step-definitions/*.steps.js`, `features/pageobjects/*.object.js`
