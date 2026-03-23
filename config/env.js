/**
 * WebTV environment config. Default: **beta** (headed). Override: ENV=qa or ENV=beta.
 * Headless: set HEADLESS=1 (see wdio.conf.js).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const env = (process.env.ENV || 'beta').toLowerCase();
const urls = {
  qa: process.env.WEBTV_QA || 'https://qa-gcp.mlb.com/tv',
  beta: process.env.WEBTV_BETA || 'https://beta-gcp.mlb.com/tv',
};

const baseUrl = urls[env] || urls.beta;

/** True when tests are driven by wdio.sauce.conf.js (set at load time there). */
function isWdioSauceRun() {
  return /^1|true|yes$/i.test(process.env.WDIO_RUNNING_ON_SAUCE || '');
}

/**
 * Whether to run beta infrastructure pre-auth (#username / #password on beta-gcp).
 * - ENV=beta (any WEBTV_BETA host)
 * - URL still contains beta-gcp (legacy check)
 * - Sauce runs: beta gate often appears for remote VMs; no-op if the form is absent
 */
function shouldAttemptBetaInfrastructureLogin() {
  if (env === 'beta') return true;
  if (String(baseUrl).toLowerCase().includes('beta-gcp')) return true;
  if (isWdioSauceRun()) return true;
  return false;
}

/** MAST / other beta-only backends */
function isBetaWebTvTarget() {
  return env === 'beta' || String(baseUrl).toLowerCase().includes('beta-gcp');
}

module.exports = {
  env,
  baseUrl,
  urls,
  isWdioSauceRun,
  shouldAttemptBetaInfrastructureLogin,
  isBetaWebTvTarget,
};
