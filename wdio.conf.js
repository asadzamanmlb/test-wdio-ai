const { baseUrl } = require('./config/env');
const { afterStep, afterScenario } = require('./features/support/hooks');
const { persistRun } = require('./scripts/persistRunResults');
const { registerHighlightOverwrites } = require('./features/support/highlight-commands');
const { HIGHLIGHT_ENABLED } = require('./features/support/highlight');

const chromeArgs = ['--no-sandbox', '--disable-dev-shm-usage'];
if (HIGHLIGHT_ENABLED) {
  chromeArgs.push('--window-size=1920,1080');
}

exports.config = {
  runner: 'local',
  specs: ['./features/**/*.feature'],
  exclude: [],
  maxInstances: 1,
  capabilities: [{
    maxInstances: 1,
    browserName: 'chrome',
    'wdio:enforceWebDriverClassic': true, // Avoid Bidi "Cannot find context" / scrollIntoView errors that block screenshots
    'goog:chromeOptions': {
      args: chromeArgs,
    },
  }],
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
  ],
  cucumberOpts: {
    timeout: 60000,
    require: ['./features/step-definitions/*.js'],
  },
  onPrepare: function () {
    const fs = require('fs');
    const path = require('path');
    const manifest = path.join(process.cwd(), 'reports', 'failure-screenshots.json');
    const domManifest = path.join(process.cwd(), 'reports', 'failure-dom.json');
    const screenshotsDir = path.join(process.cwd(), 'reports', 'screenshots');
    try {
      if (fs.existsSync(manifest)) fs.unlinkSync(manifest);
      if (fs.existsSync(domManifest)) fs.unlinkSync(domManifest);
      if (fs.existsSync(screenshotsDir)) {
        const files = fs.readdirSync(screenshotsDir).filter((f) => f.endsWith('.png'));
        for (const f of files) fs.unlinkSync(path.join(screenshotsDir, f));
      }
    } catch (_) {}
  },
  before: function () {
    registerHighlightOverwrites(browser);
  },
  afterStep,
  afterScenario,
  onComplete: function () {
    try {
      persistRun();
    } catch (e) {
      console.warn('Could not persist run results:', e.message);
    }
  },
};
