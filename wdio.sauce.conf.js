/**
 * WebdriverIO config for Sauce Labs using @wdio/sauce-service (recommended setup).
 *
 * Prerequisites:
 *   SAUCE_USERNAME, SAUCE_ACCESS_KEY (shell or .env)
 *
 * Region (WebdriverIO short form — matches Sauce service docs):
 *   config.region = 'us' | 'eu'
 *   Set via SAUCE_WDIO_REGION=us|eu (default: us).
 *   Legacy: SAUCE_REGION=eu-central-1 also maps to eu.
 *
 * Sauce Connect (tunnel):
 *   Matches common internal pattern: services: [['sauce', { sauceConnect: true, ... }]]
 *   Public sites (qa-gcp.mlb.com) do not need a tunnel — default is OFF.
 *   Enable: SAUCE_CONNECT=1 (or true/yes)
 *
 * Optional:
 *   DEVICE or SAUCE_DEVICE_LABEL — optional prefix: "{DEVICE} — {scenario name}" in Sauce job title
 *   SAUCE_JOB_NAME — fixed job title (disables per-scenario naming via capabilities; prefer unset for scenarios)
 *   SAUCE_CAPTURE_PERFORMANCE=1 — sauce:options.capturePerformance
 *   SAUCE_EXTENDED_DEBUGGING=0 — disable extendedDebugging (default on for Sauce)
 *
 * Run: npm run test:sauce:qa
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

/** Step defs / helpers use this to apply beta-gcp infrastructure login + longer waits (not set for local wdio.conf.js). */
process.env.WDIO_RUNNING_ON_SAUCE = '1';

const path = require('path');
const { getCjsonMetadata } = require('./config/cjsonRunMetadata');
const { pageTitle: cucumberReportPageTitle, reportName: cucumberReportName } = require('./config/cucumberHtmlReportBranding');
const { baseUrl } = require('./config/env');
const { afterStep, afterScenario } = require('./features/support/hooks');
const { persistRun } = require('./scripts/persistRunResults');
const { registerHighlightOverwrites } = require('./features/support/highlight-commands');
const {
  getWdioVideoReporterEntries,
  clearVideosDir,
  videoReporterEnabled,
} = require('./config/wdio.video.reporter');
const { getChromeAutomationOptions } = require('./config/chromeAutomationOptions');

const SAUCE_USER = process.env.SAUCE_USERNAME || process.env.SAUCE_USER;
const SAUCE_KEY = process.env.SAUCE_ACCESS_KEY || process.env.SAUCE_KEY;

/** WebdriverIO Sauce service region: 'us' | 'eu' */
function getSauceWdioRegion() {
  const r = (process.env.SAUCE_WDIO_REGION || process.env.SAUCE_REGION || 'us').toLowerCase();
  if (r === 'eu' || r === 'eu-central-1') return 'eu';
  return 'us';
}

const sauceWdioRegion = getSauceWdioRegion();

function getSauceAppBase() {
  return sauceWdioRegion === 'eu' ? 'https://app.eu-central-1.saucelabs.com' : 'https://app.saucelabs.com';
}

function getSauceJobUrl(sessionId) {
  if (!sessionId) return null;
  return `${getSauceAppBase()}/tests/${sessionId}`;
}

const platformName = process.env.SAUCE_PLATFORM || 'Windows 11';
const browserName = (process.env.SAUCE_BROWSER || 'chrome').toLowerCase();
const browserVersion = process.env.SAUCE_BROWSER_VERSION || 'latest';
const build =
  process.env.SAUCE_BUILD ||
  process.env.CI_BUILD_NUMBER ||
  `local-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}`;

/**
 * Parallel Sauce VMs (same as local WDIO_MAX_INSTANCES pattern).
 * - Dashboard "Parallel" sets **WDIO_MAX_INSTANCES** when running multiple scenarios.
 * - CLI / .env can set **SAUCE_MAX_INSTANCES** (1–8, default 1) when WDIO_MAX_INSTANCES is unset.
 */
function getSauceMaxInstances() {
  const cap = 8;
  const wdioRaw = process.env.WDIO_MAX_INSTANCES;
  if (wdioRaw !== undefined && wdioRaw !== '') {
    const w = parseInt(String(wdioRaw), 10);
    if (!Number.isNaN(w) && w >= 1) {
      return Math.min(cap, w);
    }
  }
  const s = parseInt(process.env.SAUCE_MAX_INSTANCES || '1', 10);
  return Math.min(cap, Math.max(1, Number.isNaN(s) ? 1 : s));
}

const maxInstances = getSauceMaxInstances();

/** Same pattern as typical Sauce + Cucumber repos: optional Sauce Connect tunnel */
const sauceConnect = /^1|true|yes$/i.test(process.env.SAUCE_CONNECT || '');

function getSauceCapabilities() {
  const sauceOpts = {
    build,
    screenResolution: process.env.SAUCE_SCREEN_RESOLUTION || '1920x1080',
    extendedDebugging: !/^0|false|no$/i.test(process.env.SAUCE_EXTENDED_DEBUGGING || 'true'),
    ...(process.env.SAUCE_TUNNEL_NAME ? { tunnelName: process.env.SAUCE_TUNNEL_NAME } : {}),
    ...(process.env.SAUCE_TUNNEL_OWNER ? { tunnelOwner: process.env.SAUCE_TUNNEL_OWNER } : {}),
    ...(/^1|true|yes$/i.test(process.env.SAUCE_CAPTURE_PERFORMANCE || '')
      ? { capturePerformance: true }
      : {}),
  };
  /** Do not set a default `name` here: @wdio/sauce-service copies it on job completion and would
   * overwrite the live job title, undoing per-scenario updates. Use SAUCE_JOB_NAME for a fixed title. */
  if (process.env.SAUCE_JOB_NAME) {
    sauceOpts.name = process.env.SAUCE_JOB_NAME;
  }

  const base = {
    maxInstances,
    platformName,
    browserVersion,
    'wdio:enforceWebDriverClassic': true,
    'cjson:metadata': getCjsonMetadata({
      deviceHint: `Sauce Labs (${sauceWdioRegion}) / ${platformName} / ${browserName}`,
    }),
    'sauce:options': sauceOpts,
  };

  if (browserName === 'firefox') {
    return [{ ...base, browserName: 'firefox', 'moz:firefoxOptions': {} }];
  }
  if (browserName === 'edge' || browserName === 'microsoftedge') {
    return [{ ...base, browserName: 'MicrosoftEdge', 'ms:edgeOptions': {} }];
  }
  /** Safari runs only on macOS VMs on Sauce — not Windows. Dashboard sets SAUCE_BROWSER=safari. */
  if (browserName === 'safari') {
    const envPlat = (process.env.SAUCE_PLATFORM || '').trim();
    const safariPlatform = /macos/i.test(envPlat) ? envPlat : 'macOS 13';
    const safariSauceOpts = {
      ...sauceOpts,
      extendedDebugging: false,
    };
    return [
      {
        ...base,
        platformName: safariPlatform,
        browserName: 'safari',
        'sauce:options': safariSauceOpts,
      },
    ];
  }
  const chromeAuto = getChromeAutomationOptions();
  return [
    {
      ...base,
      browserName: 'chrome',
      'goog:chromeOptions': {
        args: chromeAuto.args,
        prefs: chromeAuto.prefs,
      },
    },
  ];
}

if (!SAUCE_USER || !SAUCE_KEY) {
  console.error('\n❌ Sauce Labs: set SAUCE_USERNAME and SAUCE_ACCESS_KEY in .env (see .env.example).\n');
  process.exit(1);
}

exports.config = {
  runner: 'local',
  specs: ['./features/**/*.feature'],
  exclude: [],
  maxInstances,
  user: SAUCE_USER,
  key: SAUCE_KEY,
  /** Required by @wdio/sauce-service — 'us' or 'eu' (not the ondemand hostname). */
  region: sauceWdioRegion,
  services: [
    [
      'sauce',
      {
        sauceConnect,
        sauceConnectOpts: {
          // See https://docs.saucelabs.com/dev/cli/sauce-connect-5/run/ (omit leading --)
        },
      },
    ],
  ],
  capabilities: getSauceCapabilities(),
  logLevel: 'info',
  bail: 0,
  baseUrl,
  waitforTimeout: 15000,
  connectionRetryTimeout: 300000,
  connectionRetryCount: 3,
  framework: 'cucumber',
  reporters: [
    'spec',
    ['cucumberjs-json', { jsonFolder: './reports/json/', reportFilePerRetry: false }],
    ...getWdioVideoReporterEntries(),
  ],
  cucumberOpts: {
    timeout: 120000,
    retry: 1,
    require: [path.join(__dirname, 'features', 'step-definitions', '*.js')],
  },
  /**
   * Sauce dashboard job title must be set with `sauce:job-name=...` (executeScript).
   * Changing browser.capabilities does not stick: the Sauce service's final updateJob() reapplies
   * the original capabilities `name` if present — so we omit a default name in getSauceCapabilities().
   */
  beforeScenario: async function (world) {
    try {
      const scenarioName = world?.pickle?.name || 'Unknown scenario';
      console.log(`Running scenario: ${scenarioName}`);
      const device = process.env.DEVICE || process.env.SAUCE_DEVICE_LABEL;
      const jobTitle = device ? `${device} — ${scenarioName}` : scenarioName;
      const safeTitle = String(jobTitle)
        .replace(/[\r\n]/g, ' ')
        .replace(/=/g, ' ')
        .trim()
        .slice(0, 255);
      await browser.executeScript(`sauce:job-name=${safeTitle}`, []);
    } catch (e) {
      console.warn('beforeScenario (Sauce job name) failed:', e.message);
    }
  },
  onPrepare: function () {
    const fs = require('fs');
    const manifest = path.join(process.cwd(), 'reports', 'failure-screenshots.json');
    const domManifest = path.join(process.cwd(), 'reports', 'failure-dom.json');
    const screenshotsDir = path.join(process.cwd(), 'reports', 'screenshots');
    const reportsJsonDir = path.join(process.cwd(), 'reports', 'json');
    const sauceJobsFile = path.join(process.cwd(), 'reports', 'sauce-jobs.txt');
    try {
      if (videoReporterEnabled) clearVideosDir();
      try {
        if (fs.existsSync(sauceJobsFile)) fs.unlinkSync(sauceJobsFile);
      } catch (_) {}
      const sauceScenarioUrls = path.join(process.cwd(), 'reports', 'sauce-scenario-urls.jsonl');
      try {
        if (fs.existsSync(sauceScenarioUrls)) fs.unlinkSync(sauceScenarioUrls);
      } catch (_) {}
      if (fs.existsSync(manifest)) fs.unlinkSync(manifest);
      if (fs.existsSync(domManifest)) fs.unlinkSync(domManifest);
      if (fs.existsSync(screenshotsDir)) {
        const files = fs.readdirSync(screenshotsDir).filter((f) => f.endsWith('.png'));
        for (const f of files) fs.unlinkSync(path.join(screenshotsDir, f));
      }
      if (fs.existsSync(reportsJsonDir)) {
        const jsonFiles = fs.readdirSync(reportsJsonDir).filter((f) => f.endsWith('.json'));
        for (const f of jsonFiles) fs.unlinkSync(path.join(reportsJsonDir, f));
      }
    } catch (_) {}
    console.log(
      `\n☁️  Sauce Labs (@wdio/sauce-service) | region=${sauceWdioRegion} | Sauce Connect=${sauceConnect ? 'on' : 'off'} | maxInstances=${maxInstances} | ${platformName} | ${browserName} ${browserVersion}\n`
    );
  },
  before: function () {
    registerHighlightOverwrites(browser);
  },
  after: async function () {
    const fs = require('fs');
    try {
      const sid = browser.sessionId;
      const jobUrl = getSauceJobUrl(sid);
      if (!jobUrl) return;
      const line = `${jobUrl}\n`;
      console.log(`\n${'─'.repeat(64)}\n🔗 Sauce Labs job: ${jobUrl}\n${'─'.repeat(64)}\n`);
      try {
        const p = path.join(process.cwd(), 'reports', 'sauce-jobs.txt');
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.appendFileSync(p, line, 'utf8');
      } catch (_) {}
    } catch (_) {}
  },
  afterStep,
  afterScenario,
  onComplete: async function () {
    try {
      persistRun();
    } catch (e) {
      console.warn('Could not persist run results:', e.message);
    }
    try {
      const report = require('multiple-cucumber-html-reporter');
      const fs = require('fs');
      const jsonDir = path.join(process.cwd(), 'reports', 'json');
      const reportPath = path.join(process.cwd(), 'reports', 'cucumber-html');
      if (fs.existsSync(jsonDir) && fs.readdirSync(jsonDir).some((f) => f.endsWith('.json'))) {
        report.generate({
          jsonDir,
          reportPath,
          pageTitle: cucumberReportPageTitle,
          reportName: cucumberReportName,
          openReportInBrowser: false,
          displayDuration: true,
          durationInMS: false,
          displayReportTime: true,
          disableLog: true,
          pageFooter: '<div></div>',
          customStyle: path.join(__dirname, 'config', 'cucumber-report-hide-device.css'),
          customData: {
            title: 'Run Info',
            data: [
              { label: 'Environment', value: process.env.ENV || 'qa' },
              { label: 'Sauce Labs', value: `region=${sauceWdioRegion} | ${platformName}` },
            ],
          },
        });
        console.log('✅ Cucumber HTML report: reports/cucumber-html/index.html');
      }
    } catch (e) {
      console.warn('Could not generate Cucumber HTML report:', e.message);
    }
    try {
      const fs = require('fs');
      const sauceJobsFile = path.join(process.cwd(), 'reports', 'sauce-jobs.txt');
      if (fs.existsSync(sauceJobsFile)) {
        const urls = fs.readFileSync(sauceJobsFile, 'utf8').trim().split(/\n+/).filter(Boolean);
        if (urls.length) {
          console.log(`\n${'═'.repeat(64)}\n☁️  Sauce Labs — open job(s) in browser:\n`);
          urls.forEach((u) => console.log(`   ${u}`));
          console.log(`${'═'.repeat(64)}\n`);
        }
      }
    } catch (_) {}
  },
};
