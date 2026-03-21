const { baseUrl } = require('./config/env');
const { afterStep } = require('./features/support/hooks');
const { persistRun } = require('./scripts/persistRunResults');

exports.config = {
  runner: 'local',
  specs: ['./features/**/*.feature'],
  exclude: [],
  maxInstances: 1,
  capabilities: [{
    maxInstances: 1,
    browserName: 'chrome',
    'goog:chromeOptions': {
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
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
  afterStep,
  onComplete: function () {
    try {
      persistRun();
    } catch (e) {
      console.warn('Could not persist run results:', e.message);
    }
  },
};
