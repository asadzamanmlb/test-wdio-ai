/**
 * WebTV environment config. Use ENV=qa or ENV=beta when running tests.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const env = (process.env.ENV || 'qa').toLowerCase();
const urls = {
  qa: process.env.WEBTV_QA || 'https://qa-gcp.mlb.com/tv',
  beta: process.env.WEBTV_BETA || 'https://beta-gcp.mlb.com/tv',
};

module.exports = {
  env,
  baseUrl: urls[env] || urls.qa,
  urls,
};
