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

module.exports = {
  env,
  baseUrl: urls[env] || urls.beta,
  urls,
};
