const path = require('path');
const { getCjsonMetadata, getHostPlatformLabel, getHostOsVersion } = require('./config/cjsonRunMetadata');
const { pageTitle: cucumberReportPageTitle, reportName: cucumberReportName } = require('./config/cucumberHtmlReportBranding');
const { baseUrl } = require('./config/env');
const { afterStep, afterScenario } = require('./features/support/hooks');
const { persistRun } = require('./scripts/persistRunResults');
const { registerHighlightOverwrites } = require('./features/support/highlight-commands');
const { HIGHLIGHT_ENABLED } = require('./features/support/highlight');
const {
  getWdioVideoReporterEntries,
  clearVideosDir,
  videoReporterEnabled,
} = require('./config/wdio.video.reporter');
const { getChromeAutomationOptions } = require('./config/chromeAutomationOptions');

const browserName = (process.env.BROWSER || 'chrome').toLowerCase();
const isHeadless = /^1|true|yes$/i.test(process.env.HEADLESS || '');

/** Parallel browser workers (spec files run across workers). Safari stays 1. Env: WDIO_MAX_INSTANCES=1–16 (default 1). */
function getWdioMaxInstances() {
  if (browserName === 'safari') return 1;
  const raw = process.env.WDIO_MAX_INSTANCES;
  if (raw === undefined || raw === '') return 1;
  const n = parseInt(String(raw), 10);
  if (Number.isNaN(n) || n < 1) return 1;
  return Math.min(n, 16);
}

const wdioMaxInstances = getWdioMaxInstances();

function getCapabilities() {
  const base = {
    maxInstances: wdioMaxInstances,
    'wdio:enforceWebDriverClassic': true,
    /** Fills Cucumber JSON metadata (otherwise local Chrome → "Version not known" for OS). */
    'cjson:metadata': getCjsonMetadata(),
  };
  if (browserName === 'firefox') {
    const firefoxArgs = ['--no-remote'];
    if (isHeadless) firefoxArgs.push('-headless');
    return [{ ...base, browserName: 'firefox', 'moz:firefoxOptions': { args: firefoxArgs } }];
  }
  if (browserName === 'safari') {
    // Safari does not support headless; always runs with visible window
    return [{ ...base, browserName: 'safari' }];
  }
  if (browserName === 'edge' || browserName === 'msedge') {
    const edgeArgs = ['--no-sandbox', '--disable-dev-shm-usage'];
    if (isHeadless) {
      edgeArgs.push('--headless=new', '--window-size=1920,1080', '--disable-gpu');
    }
    if (HIGHLIGHT_ENABLED && !isHeadless) {
      edgeArgs.push('--window-size=1920,1080');
    }
    return [{ ...base, browserName: 'MicrosoftEdge', 'ms:edgeOptions': { args: edgeArgs } }];
  }
  const extra = [];
  if (isHeadless) {
    extra.push('--headless=new', '--window-size=1920,1080', '--disable-gpu');
  }
  if (HIGHLIGHT_ENABLED && !isHeadless) {
    extra.push('--window-size=1920,1080');
  }
  const chromeAuto = getChromeAutomationOptions(extra);
  return [
    {
      ...base,
      browserName: 'chrome',
      'goog:chromeOptions': { args: chromeAuto.args, prefs: chromeAuto.prefs },
    },
  ];
}

exports.config = {
  runner: 'local',
  specs: ['./features/**/*.feature'],
  exclude: [],
  maxInstances: wdioMaxInstances,
  capabilities: getCapabilities(),
  logLevel: 'info',
  bail: 0,
  baseUrl,
  waitforTimeout: 10000,
  connectionRetryTimeout: 180000,
  connectionRetryCount: 5,
  framework: 'cucumber',
  reporters: [
    'spec',
    ['cucumberjs-json', { jsonFolder: './reports/json/', reportFilePerRetry: false }],
    ...getWdioVideoReporterEntries(),
  ],
  cucumberOpts: {
    timeout: 60000,
    /**
     * On step failure only: re-run the whole scenario from `Given` (second attempt looks like duplicate login, etc.).
     * If the scenario passes on the first try, there is no second run — duration in the report is a single pass.
     */
    retry: 1,
    require: [path.join(__dirname, 'features', 'step-definitions', '*.js')],
  },
  onPrepare: function () {
    const fs = require('fs');
    const path = require('path');
    const { execSync } = require('child_process');
    const manifest = path.join(process.cwd(), 'reports', 'failure-screenshots.json');
    const domManifest = path.join(process.cwd(), 'reports', 'failure-dom.json');
    const screenshotsDir = path.join(process.cwd(), 'reports', 'screenshots');
    const reportsJsonDir = path.join(process.cwd(), 'reports', 'json');
    try {
      if (videoReporterEnabled) clearVideosDir();
      if (fs.existsSync(manifest)) fs.unlinkSync(manifest);
      if (fs.existsSync(domManifest)) fs.unlinkSync(domManifest);
      if (fs.existsSync(screenshotsDir)) {
        const files = fs.readdirSync(screenshotsDir).filter((f) => f.endsWith('.png'));
        for (const f of files) fs.unlinkSync(path.join(screenshotsDir, f));
      }
      // Clear old JSON reports so persistRun only uses this run's results
      if (fs.existsSync(reportsJsonDir)) {
        const jsonFiles = fs.readdirSync(reportsJsonDir).filter((f) => f.endsWith('.json'));
        for (const f of jsonFiles) fs.unlinkSync(path.join(reportsJsonDir, f));
      }
      const sauceUrls = path.join(process.cwd(), 'reports', 'sauce-scenario-urls.jsonl');
      if (fs.existsSync(sauceUrls)) fs.unlinkSync(sauceUrls);
      // Safari: kill stale safaridriver from previous runs to avoid "already paired" / "no such window"
      if ((process.env.BROWSER || '').toLowerCase() === 'safari') {
        try {
          execSync('killall safaridriver 2>/dev/null || true', { stdio: 'ignore' });
        } catch (_) {}
      }
    } catch (_) {}
  },
  before: function () {
    registerHighlightOverwrites(browser);
    // Safari: warmup to stabilize session before first real navigation; reduces "no such window"
    if ((process.env.BROWSER || '').toLowerCase() === 'safari') {
      return new Promise((resolve) => {
        setTimeout(async () => {
          try {
            await browser.url('about:blank');
            await new Promise((r) => setTimeout(r, 800));
            await browser.maximizeWindow();
          } catch (_) {}
          resolve();
        }, 1500);
      });
    }
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
        const { patchCucumberJsonHostMetadata } = require('./scripts/patchCucumberJsonHostMetadata');
        patchCucumberJsonHostMetadata(jsonDir);
        report.generate({
          jsonDir,
          reportPath,
          pageTitle: cucumberReportPageTitle,
          reportName: cucumberReportName,
          openReportInBrowser: false,
          displayDuration: true,
          // Cucumber JSON uses nanoseconds; reporter divides by 1e6 when this is false.
          // true = treat raw as ms → bogus multi-day "25781:40:00.000" style durations.
          durationInMS: false,
          displayReportTime: true,
          disableLog: true,
          pageFooter: '<div></div>',
          customStyle: path.join(__dirname, 'config', 'cucumber-report-hide-device.css'),
          metadata: {
            browser: { name: process.env.BROWSER || 'chrome', version: 'latest' },
            platform: {
              name: getHostPlatformLabel(),
              version: getHostOsVersion(),
            },
            device: getCjsonMetadata().device,
          },
          customData: {
            title: 'Run Info',
            data: [
              { label: 'Environment', value: process.env.ENV || 'beta' },
              { label: 'Headless', value: process.env.HEADLESS === '1' ? 'Yes' : 'No' },
              { label: 'Max parallel workers', value: String(wdioMaxInstances) },
              {
                label: 'Scenario duration',
                value: 'Sum of WDIO step/hook times in JSON (retry only on failure — see docs/cucumber-report-durations.md)',
              },
            ],
          },
        });
        try {
          const { prettifyCucumberReportDurations } = require('./scripts/prettifyCucumberReportDurations');
          const pr = prettifyCucumberReportDurations(reportPath);
          if (pr.updated > 0) {
            console.log(`✅ Report durations shown as sec/min (updated ${pr.updated} HTML file(s))`);
          }
        } catch (durErr) {
          console.warn('Could not prettify report durations:', durErr.message);
        }
        console.log('✅ Cucumber HTML report: reports/cucumber-html/index.html');
        try {
          const videosDir = path.join(process.cwd(), 'reports', 'videos');
          if (fs.existsSync(videosDir)) {
            const mp4s = fs.readdirSync(videosDir).filter((f) => f.endsWith('.mp4'));
            if (mp4s.length) {
              console.log(`✅ Test videos (${mp4s.length}): reports/videos/`);
            }
          }
        } catch (_) {}
        try {
          const { generateCucumberPdf } = require('./scripts/cucumberReportPdf');
          const pdfPath = await generateCucumberPdf(reportPath);
          if (pdfPath) console.log('✅ Cucumber PDF report: reports/cucumber-html/cucumber-report.pdf');
        } catch (pdfErr) {
          console.warn('Could not generate Cucumber PDF:', pdfErr.message);
        }
      }
    } catch (e) {
      console.warn('Could not generate Cucumber HTML report:', e.message);
    }
  },
};
