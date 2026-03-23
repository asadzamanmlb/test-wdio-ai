# Test run video recording (WebdriverIO)

This repo uses **[wdio-video-reporter](https://webdriver.io/docs/wdio-video-reporter/)** to build an **MP4** from screenshots taken **after WebDriver commands** (clicks, navigation, etc.). **FFmpeg** is provided via **`@ffmpeg-installer/ffmpeg`** (dependency of the reporter) — you do **not** need a separate system FFmpeg install for typical runs.

**By default the reporter is off** (faster runs). Enable with **`WDIO_RECORD_VIDEO=1`** or the dashboard **Record → On** toggle (sets that env plus **`WDIO_SAVE_ALL_VIDEOS=1`** so passing scenarios get MP4s for the UI).

## Output location

- **Videos:** `reports/videos/*.mp4` (per Cucumber scenario name)
- **Raw frames:** `reports/videos/.video-reporter-frames/<scenario>/` (PNG sequence; can be large)

The whole `reports/` tree is gitignored.

## QA Dashboard

In the dashboard header, **Record → On** applies to **Execute**, **Run selected**, and **Run all** for that session. When a run finishes, each scenario row can expand **Screen recording** (same idea as failure details + screenshot). Videos are served from **`GET /api/videos/:filename`**.

## Environment variables

| Variable | Effect |
|----------|--------|
| `WDIO_RECORD_VIDEO=1` | Turn **on** the video reporter (**default: off** if unset) |
| `WDIO_SAVE_ALL_VIDEOS=1` | Write MP4 for **passing** scenarios too (dashboard sets this when Record is on) |
| `RECORD_TEST_VIDEO=1` | Alias for `WDIO_RECORD_VIDEO` (optional) |
| `WDIO_VIDEO_SLOWDOWN=1`–`100` | Slows/spreads frames in the output video (default `3`) |
| `WDIO_VIDEO_RENDER_TIMEOUT_MS` | Max time for FFmpeg to render one video (default `120000`) |

## npm scripts

```bash
# Normal WebTV run — no video reporter (default)
npm run test:webtv

# Enable recording + save MP4 for all scenarios (pass and fail)
npm run test:webtv:video

# Example: one feature with recording
npm run test:webtv:video -- --spec ./features/webtv/smoke.feature
```

After a CLI run, **`node scripts/persistRunResults.js`** (or WDIO `onComplete`) syncs **`video`** URLs into **`dashboard/data/execute-results.json`** when MP4s match scenario names.

## Performance / limitations

- Extra **screenshots** after many commands **slow** the run.
- Native **alert** dialogs may not appear in screenshots (same class of limitation as the upstream reporter docs).
- This is **not** a continuous OS screen capture (like OBS); it is **frame-based** from the browser viewport.

---

## How this relates to **Cypress** video recording (concept)

| Topic | **Cypress** | **This repo (WDIO + wdio-video-reporter)** |
|--------|-------------|---------------------------------------------|
| **Idea** | Record a **video file per spec** so you can replay what happened. | Same goal: one **MP4** per test/scenario (Cucumber scenario here). |
| **Mechanism** | Cypress historically built videos from **frames** captured during the run and encoded with **FFmpeg** (viewport in the controlled browser). | **`browser.saveScreenshot`** (or equivalent) **after commands** → PNG sequence → **FFmpeg** → MP4. |
| **Config** | `video: true` / `videoCompression` in **`cypress.config`**. | Reporter options in **`config/wdio.video.reporter.js`** + **`wdio.conf.js`**. The reporter is registered as **`'video'`** so WebdriverIO resolves the npm package **`wdio-video-reporter`** (`wdio-${name}-reporter`). |
| **Cloud** | `cypress run --record` uploads to **Cypress Cloud** (dashboard, parallelization) — **separate** from local `video: true`. | No Cypress Cloud; videos stay under **`reports/videos/`** unless you upload them in your own CI. |
| **Runner** | Tests run in Cypress’s **Electron/Chromium** harness with tight coupling to the app under test. | Tests drive **any** WebDriver browser (Chrome, Firefox, …) via **Selenium/WebDriver**. |

So: **both** ecosystems usually mean “**discrete frames → FFmpeg → video**,” not a raw OS-level screen recorder. Cypress packages that as a first-class **`video`** toggle; here it is a **WDIO reporter** with the same rough **frame + encode** pattern.
