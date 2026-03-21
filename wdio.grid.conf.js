/**
 * WDIO config for Selenium Grid - parallel runs.
 * Start grid: npm run grid:up
 * Run tests:  npm run test:grid
 */
const { baseUrl } = require('./config/env');
const { afterStep } = require('./features/support/hooks');
const { persistRun } = require('./scripts/persistRunResults');

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
  ],
  cucumberOpts: {
    timeout: 60000,
    require: ['./features/step-definitions/*.js'],
  },
  afterStep,
  onComplete: function () {
    try {
      persistRun();
    } catch (e) {
      console.warn('Could not persist run results:', e.message);
    }
  },
};
