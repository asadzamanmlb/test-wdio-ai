/**
 * WebdriverIO Cucumber hooks - triggers self-healing on element-related failures
 * and other errors that may benefit from DOM analysis and selector suggestions.
 * Captures screenshots on any step failure for dashboard display.
 */
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { heal } = require('../../selfheal/selfHeal');
const { findVideoForScenarioName } = require('../../scripts/testRunVideo');

/** Read env at attach time (not only at module load). */
function isVideoRecordingEnabled() {
  return /^1|true|yes$/i.test(
    process.env.WDIO_RECORD_VIDEO || process.env.RECORD_TEST_VIDEO || ''
  );
}

/** Cached attach() from wdio-cucumberjs-json-reporter (embeddings in Cucumber JSON → HTML report). */
let cucumberJsonAttach = null;
function getCucumberJsonAttach() {
  if (cucumberJsonAttach !== null) return cucumberJsonAttach;
  try {
    const R = require('wdio-cucumberjs-json-reporter');
    const Cls = R.CucumberJsJsonReporter || R.default || R;
    cucumberJsonAttach =
      Cls && typeof Cls.attach === 'function' ? Cls.attach.bind(Cls) : false;
  } catch (_) {
    cucumberJsonAttach = false;
  }
  return cucumberJsonAttach;
}

/**
 * Embeds failure reason + optional PNG into the current Cucumber step (shows in multiple-cucumber-html-reporter).
 */
function attachStepFailureToCucumberReport({ stepText, error, screenshotFullPath }) {
  const attach = getCucumberJsonAttach();
  if (!attach) return;
  const err = error;
  const msg = typeof err === 'string' ? err : (err?.message || String(err || 'Unknown error'));
  const stack = typeof err === 'object' && err?.stack ? String(err.stack) : '';
  const reason = [
    '--- Test failure ---',
    `Step: ${stepText || '(unknown)'}`,
    '',
    msg,
    stack && stack.trim() !== msg.trim() ? `\n${stack}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  try {
    attach(reason, 'text/plain');
  } catch (e) {
    console.warn('Cucumber report attach (text) failed:', e.message);
  }
  if (screenshotFullPath && fs.existsSync(screenshotFullPath)) {
    try {
      const b64 = fs.readFileSync(screenshotFullPath).toString('base64');
      attach(b64, 'image/png');
    } catch (e) {
      console.warn('Cucumber report attach (screenshot) failed:', e.message);
    }
  }
}

const VIDEO_ATTACH_DELAY_MS = Math.min(
  15000,
  Math.max(500, Number(process.env.WDIO_VIDEO_ATTACH_DELAY_MS) || 1500)
);

/** Max time to wait for wdio-video-reporter to finish writing the MP4 (encoding often completes after session teardown starts). */
const VIDEO_ATTACH_MAX_WAIT_MS = Math.min(
  180000,
  Math.max(8000, Number(process.env.WDIO_VIDEO_ATTACH_MAX_WAIT_MS) || 90000)
);

/**
 * Poll until an MP4 for this scenario exists and file size is stable (ffmpeg finished).
 * @returns {Promise<string | null>} basename or null
 */
async function waitForScenarioVideoMp4(scenarioName, videosDir) {
  const deadline = Date.now() + VIDEO_ATTACH_MAX_WAIT_MS;
  let lastSize = -1;
  let stableTicks = 0;
  while (Date.now() < deadline) {
    const mp4 = findVideoForScenarioName(scenarioName, videosDir);
    if (mp4) {
      try {
        const fp = path.join(videosDir, mp4);
        const st = fs.statSync(fp);
        if (st.size < 2048) {
          await new Promise((r) => setTimeout(r, 700));
          continue;
        }
        if (st.size === lastSize) {
          stableTicks += 1;
          if (stableTicks >= 2) return mp4;
        } else {
          stableTicks = 0;
          lastSize = st.size;
        }
      } catch (_) {
        /* still writing */
      }
    }
    await new Promise((r) => setTimeout(r, 700));
  }
  return findVideoForScenarioName(scenarioName, videosDir);
}

function escapeHtmlAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/**
 * Embeds video on the current Cucumber step (last step of the scenario).
 * In multiple-cucumber-html-reporter this appears under a collapsed "+ Show Info" on that step — expand the scenario row, then open "+ Show Info".
 */
async function attachScenarioVideoToCucumberReport(scenarioName) {
  const attach = getCucumberJsonAttach();
  if (!attach || !scenarioName) return;
  const videosDir = path.join(process.cwd(), 'reports', 'videos');
  await new Promise((r) => setTimeout(r, VIDEO_ATTACH_DELAY_MS));
  const mp4 = await waitForScenarioVideoMp4(scenarioName, videosDir);
  if (!mp4) {
    console.warn(
      `[Cucumber report] No MP4 for scenario "${scenarioName}" after ${VIDEO_ATTACH_MAX_WAIT_MS}ms (dir: ${videosDir}). Set WDIO_VIDEO_ATTACH_MAX_WAIT_MS if needed.`
    );
    return;
  }
  const relFromFeatureHtml = path.posix.join('..', '..', 'videos', encodeURIComponent(mp4));
  const absPath = path.join(videosDir, mp4);
  const fileUrl = pathToFileURL(absPath).href;
  try {
    attach(
      [
        'Screen recording (MP4)',
        'In the HTML report: expand the scenario, find the last step, click "+ Show Info" to see the player.',
        `Relative (from reports/cucumber-html/features/): ${path.posix.join('..', '..', 'videos', mp4)}`,
        `File URL (local browser): ${fileUrl}`,
        `Path: ${absPath}`,
      ].join('\n'),
      'text/plain'
    );
  } catch (e) {
    console.warn('Cucumber report attach (video note) failed:', e.message);
  }
  try {
    const relEsc = escapeHtmlAttr(relFromFeatureHtml);
    const fileEsc = escapeHtmlAttr(fileUrl);
    const html = `<div class="wdio-scenario-video"><p><strong>Screen recording</strong> — use <strong>+ Show Info</strong> above if this panel is collapsed.</p><video controls width="640" preload="metadata"><source src="${relEsc}" type="video/mp4"/><source src="${fileEsc}" type="video/mp4"/></video><p><a href="${fileEsc}">Open video (file)</a> · <a href="${relEsc}" download>Download link</a></p></div>`;
    attach(Buffer.from(html, 'utf8').toString('base64'), 'text/html');
  } catch (e) {
    console.warn('Cucumber report attach (video html) failed:', e.message);
  }
}

/**
 * Embeds Sauce Labs job URL on the scenario’s last step (same pattern as video).
 * Shows under "+ Show Info" in multiple-cucumber-html-reporter.
 */
function attachSauceJobToCucumberReport(jobUrl) {
  const attach = getCucumberJsonAttach();
  if (!attach || !jobUrl) return;
  try {
    attach(
      [
        'Sauce Labs job',
        'Open this session in Sauce for video recording, network, commands, and logs.',
        jobUrl,
      ].join('\n'),
      'text/plain'
    );
  } catch (e) {
    console.warn('Cucumber report attach (Sauce text) failed:', e.message);
  }
  try {
    const esc = escapeHtmlAttr(jobUrl);
    const html = `<div class="wdio-sauce-job"><p><strong>Sauce Labs</strong> — <a href="${esc}" target="_blank" rel="noopener noreferrer">Open job in Sauce (new tab)</a></p><p style="word-break:break-all;font-size:12px;color:#666">${esc}</p></div>`;
    attach(Buffer.from(html, 'utf8').toString('base64'), 'text/html');
  } catch (e) {
    console.warn('Cucumber report attach (Sauce html) failed:', e.message);
  }
}

const SCREENSHOTS_DIR = path.join(process.cwd(), 'reports', 'screenshots');
const FAILURE_MANIFEST = path.join(process.cwd(), 'reports', 'failure-screenshots.json');
const FAILURE_DOM_MANIFEST = path.join(process.cwd(), 'reports', 'failure-dom.json');

/** Per worker: scenario ids that already got failure embeddings in afterStep (skip duplicate in afterScenario). */
const failureEmbedDone = new Set();

/** Patterns for element-related and other errors that trigger self-heal. */
const ELEMENT_OR_ERROR_PATTERNS = [
  // Element not found / missing
  /element.*not (found|displayed|exist|clickable|visible|interactable|attached|enabled)/i,
  /could not be located/i,
  /no such element/i,
  /unable to locate element/i,
  /element could not be located/i,
  // Stale / detached
  /stale element reference/i,
  /element is not attached/i,
  /element.*not attached to the document/i,
  /node is detached/i,
  /element is stale/i,
  // Obscured / blocked / not clickable
  /element.*obscured/i,
  /element click intercepted/i,
  /element.*not in viewport/i,
  /element.*not visible/i,
  // Timeout (often element-related)
  /timeout.*(waiting|wait) for/i,
  /wait.*timed out/i,
  /TimeoutError/i,
  /element.*timed out/i,
  // Invalid selector
  /invalid selector/i,
  /invalid.*xpath|invalid.*css/i,
  // Selector / locator syntax
  /selector\s*["']([^"']+)["']/i,
  /element\s*\(["']([^"']+)["']\)/i,
  // Other common WebDriver/Selenium
  /session not created/i,
  /element.*disabled/i,
  /element.*is not enabled/i,
  /element.*not in the document/i,
  /Unable to find element/i,
  /element not found/i,
  // Custom timeout messages (e.g. waitUntil timeoutMsg)
  /did not appear/i,
  /never (appeared|found|loaded)/i,
  // Navigation / flow timeouts (triggers heal + Fix path)
  /did not navigate/i,
  /expected video page/i,
  /navigate to video page/i,
];

function isElementOrSelectableError(msg) {
  if (!msg || typeof msg !== 'string') return false;
  return ELEMENT_OR_ERROR_PATTERNS.some((p) => p.test(msg));
}

function extractSelectorFromError(errorMsg) {
  if (!errorMsg || typeof errorMsg !== 'string') return null;
  const m =
    errorMsg.match(/element\s*\(["']([^"']+)["']\)/i) ||
    errorMsg.match(/selector\s*["']([^"']+)["']/i) ||
    errorMsg.match(/["']([^"']+(?:xpath|css|=\s*)[^"']*)["']/i) ||
    errorMsg.match(/\$\("([^"]+)"\)/i) ||
    errorMsg.match(/\$\('([^']+)'\)/i) ||
    errorMsg.match(/locator\s*["']([^"']+)["']/i) ||
    errorMsg.match(/["']([^"']+\.(?:css|xpath))["']/i);
  return m ? m[1] : null;
}

/** Extract contextual element hint from timeout/custom messages (e.g. "email input did not appear" → "email input") */
function extractElementHintFromError(errorMsg) {
  if (!errorMsg || typeof errorMsg !== 'string') return null;
  const m = errorMsg.match(/(?:input|element|button|link)\s+([^\.\s]+)\s+(?:did not appear|never appeared|not found)/i) ||
    errorMsg.match(/([a-z]+\s+input|[a-z]+\s+button)\s+did not appear/i);
  return m ? m[1].trim() : null;
}

function extractTextFromStep(stepText) {
  if (!stepText) return null;
  const quoted = stepText.match(/"([^"]+)"/);
  if (quoted) return quoted[1];
  const words = stepText.split(/\s+/).filter(Boolean);
  return words.slice(-2).join(' ') || words[words.length - 1] || null;
}

function appendToFailureManifest(scenarioId, screenshotPath) {
  try {
    let manifest = {};
    if (fs.existsSync(FAILURE_MANIFEST)) {
      manifest = JSON.parse(fs.readFileSync(FAILURE_MANIFEST, 'utf8'));
    }
    manifest[scenarioId] = screenshotPath;
    fs.mkdirSync(path.dirname(FAILURE_MANIFEST), { recursive: true });
    fs.writeFileSync(FAILURE_MANIFEST, JSON.stringify(manifest, null, 2));
  } catch (e) {
    console.warn('Could not write failure manifest:', e.message);
  }
}

function hasScreenshotForScenario(scenarioId) {
  try {
    if (!fs.existsSync(FAILURE_MANIFEST)) return false;
    const manifest = JSON.parse(fs.readFileSync(FAILURE_MANIFEST, 'utf8'));
    return !!(manifest[scenarioId] && fs.existsSync(path.join(SCREENSHOTS_DIR, manifest[scenarioId])));
  } catch (_) {
    return false;
  }
}

/** Stable id for manifest + deduping Cucumber embeddings (feature name + scenario name). */
function buildScenarioId(scenario, context) {
  let featureName = context?.feature?.name || context?.gherkinDocument?.feature?.name;
  if (!featureName && scenario?.uri) {
    try {
      const fullPath = path.isAbsolute(scenario.uri) ? scenario.uri : path.join(process.cwd(), scenario.uri);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf8');
        const m = content.match(/^\s*Feature:\s*(.+)$/m);
        if (m) featureName = m[1].trim();
      }
    } catch (_) {}
    if (!featureName) {
      const parts = (scenario.uri || '').replace(/\\/g, '/').split('/');
      featureName = (parts[parts.length - 1] || '').replace(/\.feature$/i, '') || 'Feature';
    }
  }
  featureName = featureName || 'Feature';
  return `${featureName}::${scenario?.name || ''}`;
}

/** @returns {{ fname: string, fullPath: string } | null} */
function getExistingFailureScreenshotForScenario(scenarioId) {
  try {
    if (!fs.existsSync(FAILURE_MANIFEST)) return null;
    const manifest = JSON.parse(fs.readFileSync(FAILURE_MANIFEST, 'utf8'));
    const fname = manifest[scenarioId];
    if (!fname) return null;
    const fullPath = path.join(SCREENSHOTS_DIR, fname);
    return fs.existsSync(fullPath) ? { fname, fullPath } : null;
  } catch (_) {
    return null;
  }
}

/** @returns {Promise<{ fname: string, fullPath: string } | null>} */
async function captureFailureScreenshot(scenario, context) {
  try {
    const scenarioId = buildScenarioId(scenario, context);
    if (hasScreenshotForScenario(scenarioId)) {
      return getExistingFailureScreenshotForScenario(scenarioId);
    }
    const slug = (scenario.name || '').replace(/[^a-zA-Z0-9-]/g, '-').slice(0, 50);
    const fname = `${slug}-${Date.now()}.png`;
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
    const fullPath = path.join(SCREENSHOTS_DIR, fname);
    let saved = false;
    for (const delay of [0, 500, 1500]) {
      if (delay) await new Promise((r) => setTimeout(r, delay));
      try {
        await browser.saveScreenshot(fullPath);
        saved = true;
        break;
      } catch (err) {
        if (delay === 1500) {
          try {
            const base64 = await browser.takeScreenshot();
            if (base64) {
              fs.writeFileSync(fullPath, Buffer.from(base64, 'base64'));
              saved = true;
            }
          } catch (_) {}
        }
      }
    }
    if (saved) {
      appendToFailureManifest(scenarioId, fname);
      return { fname, fullPath };
    }
    console.warn('Could not capture failure screenshot after retries (browser session may be degraded)');
    return null;
  } catch (e) {
    console.warn('Could not capture failure screenshot:', e.message);
    return null;
  }
}

function persistFailureDom(scenarioId, domHtml) {
  try {
    if (!domHtml || typeof domHtml !== 'string') return;
    const maxLen = 150000;
    const truncated = domHtml.length > maxLen ? domHtml.slice(0, maxLen) + '...[truncated]' : domHtml;
    let manifest = {};
    if (fs.existsSync(FAILURE_DOM_MANIFEST)) {
      manifest = JSON.parse(fs.readFileSync(FAILURE_DOM_MANIFEST, 'utf8'));
    }
    manifest[scenarioId] = { domHtml: truncated, timestamp: new Date().toISOString() };
    fs.mkdirSync(path.dirname(FAILURE_DOM_MANIFEST), { recursive: true });
    fs.writeFileSync(FAILURE_DOM_MANIFEST, JSON.stringify(manifest, null, 2));
  } catch (e) {
    console.warn('Could not persist failure DOM:', e.message);
  }
}

module.exports = {
  afterStep: async function (step, scenario, result, context) {
    if (result?.passed || !result?.error) return;

    const err = result.error;
    const msg = typeof err === 'string' ? err : (err?.message || err?.stack || String(err || ''));

    // Capture screenshot FIRST, before any other browser commands that might fail (e.g. getPageSource).
    // Bidi/scrollIntoView errors can leave the session degraded; screenshot ASAP for dashboard.
    const shot = await captureFailureScreenshot(scenario, context);
    attachStepFailureToCucumberReport({
      stepText: step?.text,
      error: err,
      screenshotFullPath: shot?.fullPath,
    });
    failureEmbedDone.add(buildScenarioId(scenario, context));

    if (isElementOrSelectableError(msg)) {
      const oldSelector = extractSelectorFromError(msg);
      const text = extractTextFromStep(step.text) || extractElementHintFromError(msg);
      let domHtml = null;
      try {
        if (typeof browser !== 'undefined' && browser.getPageSource) {
          domHtml = await browser.getPageSource();
        }
      } catch (_) {}
      await heal(oldSelector || 'unknown', text || '', {
        step: step.text,
        scenario: scenario.name,
        domHtml: domHtml || undefined,
      });
      if (domHtml) {
        try {
          persistFailureDom(buildScenarioId(scenario, context), domHtml);
        } catch (_) {}
      }
    }
  },
  afterScenario: async function (world, result, context) {
    const pickle = world?.pickle;
    if (!pickle?.name) return;

    const scenarioLike = {
      name: pickle.name,
      uri: pickle.uri || world?.source?.uri,
    };

    if (!result?.passed) {
      const sid = buildScenarioId(scenarioLike, context);
      const shot = await captureFailureScreenshot(scenarioLike, context);
      if (!failureEmbedDone.has(sid)) {
        attachStepFailureToCucumberReport({
          stepText: 'Scenario or hook failure (no failing step attachment)',
          error: result?.error,
          screenshotFullPath: shot?.fullPath,
        });
        failureEmbedDone.add(sid);
      }
    }

    if (isVideoRecordingEnabled()) {
      await attachScenarioVideoToCucumberReport(pickle.name);
    }

    // Sauce Labs: dashboard jsonl + Cucumber HTML embed (same idea as video on last step).
    // Runs for pass or fail — same sessionId. Do not require sauce:options on returned caps.
    try {
      const {
        getSauceJobUrl,
        extractXrayKeyFromPickle,
        inferSuiteFromXrayKey,
        shouldLogSauceScenarioUrl,
        getBrowserSessionIdForSauceUrl,
      } = require('../../config/sauceJobUrl');
      const sessionId = getBrowserSessionIdForSauceUrl();
      if (sessionId && shouldLogSauceScenarioUrl()) {
        const url = getSauceJobUrl(sessionId);
        if (url) {
          attachSauceJobToCucumberReport(url);
          const xrayKey = extractXrayKeyFromPickle(pickle);
          if (xrayKey) {
            const fromEnv = (process.env.DASHBOARD_SUITE || '').trim();
            const inferred = inferSuiteFromXrayKey(xrayKey);
            const suite = (fromEnv || inferred).toLowerCase();
            const line = `${JSON.stringify({ suite, key: xrayKey, url })}\n`;
            const fp = path.join(process.cwd(), 'reports', 'sauce-scenario-urls.jsonl');
            fs.mkdirSync(path.dirname(fp), { recursive: true });
            fs.appendFileSync(fp, line, 'utf8');
          }
        }
      }
    } catch (e) {
      console.warn('Sauce scenario URL log failed:', e.message);
    }
  },
};
