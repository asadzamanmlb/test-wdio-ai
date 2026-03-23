# Cucumber HTML report — how durations are calculated

## What you see as “1 min 36 sec” (or `00:01:36.000`)

1. **WebdriverIO** measures each **step** and **hook** with `end.getTime() - start.getTime()` → **milliseconds**.
2. **`wdio-cucumberjs-json-reporter`** writes Cucumber-style JSON: `duration = _duration * 1_000_000` (values are **nanoseconds** in the file).
3. **`multiple-cucumber-html-reporter`** is configured with **`durationInMS: false`**, so it treats those numbers as **nanoseconds** and divides by **1e6** to get milliseconds before formatting.
4. **`scripts/prettifyCucumberReportDurations.js`** rewrites Luxon strings like `00:01:36.000` into **`1 min 36 sec`** in the HTML.

So the scenario duration in the report is the **sum** of every **included** step/hook `result.duration` in the JSON (after the ns → ms conversion). It is **not** the MP4 length, and it is **not** “retry count × time” unless a retry actually ran.

## `cucumberOpts.retry: 1` vs “it didn’t retry”

**Retry only runs when the scenario fails** (after a failing step). If all steps pass on the **first** attempt, Cucumber does **not** run the scenario a second time — so you see **one** execution and **one** duration block.

A **second** run (duplicate login, etc.) only happens when something **failed** and Cucumber retries the whole scenario.

## Why the report might differ slightly from the Spec reporter line

- **Spec reporter** “8 passing (**1m 35.7s**)” is **total wall time** for that worker/spec (including framework overhead, teardown, reporters waiting to sync, etc.).
- **HTML report** scenario time is the **sum of recorded step/hook durations** in the Cucumber JSON. It usually **does not** include time after the last hook/step stops being measured (e.g. some post-session work).
- **Video attach polling** in `afterScenario` runs inside WDIO’s lifecycle; if that time is attributed to an **After** hook step, it **is** included in the sum. If not, the report can be **shorter** than your stopwatch for the full process.

## Configuration reference

| Setting | Role |
|--------|------|
| `wdio.conf.js` → `durationInMS: false` | JSON durations are **nanoseconds** (correct for this reporter + WDIO). **`true`** would mis-scale and show absurd times. |
| `cucumberOpts.retry` | **Failure-only** scenario retries. |

## OS column (“Version not known”)

`multiple-cucumber-html-reporter` only applies `report.generate({ metadata })` when a JSON file has **no** `metadata`. WDIO’s JSON **always** includes metadata, so the HTML report kept the reporter’s **“Version not known”** for local Chrome.

Before each HTML build, **`scripts/patchCucumberJsonHostMetadata.js`** overwrites `metadata.platform` / `device` in `reports/json/*.json` using **`config/cjsonRunMetadata.js`** (product version from `sw_vers` / OS release / etc.). Darwin is stored as **`osx`** (not `macOS`) so **multiple-cucumber-html-reporter** shows the correct **desktop + Apple** icons. That patch runs from **`wdio.conf.js` `onComplete`**, **`wdio.grid.conf.js`**, and **`npm run report:cucumber`**.
