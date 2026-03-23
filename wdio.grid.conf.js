/**
 * WDIO config for Selenium Grid - parallel runs.
 * Start grid: npm run grid:up
 * Run tests:  npm run test:grid
 */
const path = require('path');
const { baseUrl } = require('./config/env');
const { afterStep } = require('./features/support/hooks');
const { persistRun } = require('./scripts/persistRunResults');
const {
  getWdioVideoReporterEntries,
  clearVideosDir,
  videoReporterEnabled,
} = require('./config/wdio.video.reporter');

const GRID_HOST = process.env.SELENIUM_HOST || 'localhost';
const GRID_PORT = process.env.SELENIUM_PORT || 4444;

exports.config = {
  runner: 'local',
  specs: ['./features/**/*.feature'],
  exclude: [],
  maxInstances: 4,
  capabilities: [
    { browserName: 'chrome', 'goog:chromeOptions': { args: ['--no-sandbox', '--disable-dev-shm-usage'] } },
    { browserName: 'chrome', 'goog:chromeOptions': { args: ['--no-sandbox', '--disable-dev-shm-usage'] } },
    { browserName: 'chrome', 'goog:chromeOptions': { args: ['--no-sandbox', '--disable-dev-shm-usage'] } },
    { browserName: 'chrome', 'goog:chromeOptions': { args: ['--no-sandbox', '--disable-dev-shm-usage'] } },
  ],
  hostname: GRID_HOST,
  port: parseInt(GRID_PORT, 10),
  path: '/',
  logLevel: 'info',
  bail: 0,
  baseUrl,
  waitforTimeout: 10000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,
  framework: 'cucumber',
  reporters: [
    'spec',
    ['cucumberjs-json', { jsonFolder: './reports/json/', reportFilePerRetry: false }],
    ...getWdioVideoReporterEntries(),
  ],
  onPrepare: function () {
    try {
      if (videoReporterEnabled) clearVideosDir();
    } catch (_) {}
  },
  cucumberOpts: {
    timeout: 60000,
    require: ['./features/step-definitions/*.js'],
  },
  afterStep,
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
          openReportInBrowser: false,
          displayDuration: true,
          durationInMS: false,
          displayReportTime: true,
          disableLog: true,
          pageFooter: '<div></div>',
          customStyle: path.join(__dirname, 'config', 'cucumber-report-hide-device.css'),
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
