/**
 * Sauce Labs job deep link (session id from WebDriver).
 * Region must match wdio.sauce.conf.js / SAUCE_WDIO_REGION.
 */
function getSauceWdioRegion() {
  const r = (process.env.SAUCE_WDIO_REGION || process.env.SAUCE_REGION || 'us').toLowerCase();
  if (r === 'eu' || r === 'eu-central-1') return 'eu';
  return 'us';
}

function getSauceAppBase() {
  return getSauceWdioRegion() === 'eu'
    ? 'https://app.eu-central-1.saucelabs.com'
    : 'https://app.saucelabs.com';
}

function getSauceJobUrl(sessionId) {
  if (!sessionId) return null;
  return `${getSauceAppBase()}/tests/${sessionId}`;
}

/** @param {{ tags?: { name?: string }[] }} [pickle] */
function extractXrayKeyFromPickle(pickle) {
  const tags = pickle?.tags || [];
  for (const t of tags) {
    const name = String(t?.name ?? t ?? '')
      .replace(/^@/, '')
      .trim();
    if (/^WSTE-\d+$/i.test(name)) return name.toUpperCase();
    if (/^WQO-\d+$/i.test(name)) return name.toUpperCase();
    if (/^WQ-\d+$/i.test(name)) return name.toUpperCase();
  }
  const scenarioName = String(pickle?.name || '');
  const paren = scenarioName.match(/\((WSTE-\d+|WQO-\d+|WQ-\d+)\)/i);
  if (paren) return paren[1].toUpperCase();
  const bare = scenarioName.match(/\b(WSTE-\d+|WQO-\d+|WQ-\d+)\b/i);
  if (bare) return bare[1].toUpperCase();
  return null;
}

/** Maps Xray key → testcase suite folder id (for DASHBOARD_SUITE when unset). */
function inferSuiteFromXrayKey(key) {
  const u = String(key || '').toUpperCase();
  if (u.startsWith('WSTE')) return 'webtv';
  if (u.startsWith('WQO')) return 'optools';
  if (u.startsWith('WQ-')) return 'core-app';
  return '';
}

/**
 * Whether we should log a Sauce job URL after a scenario.
 * Do not rely on `capabilities['sauce:options']` alone — Sauce often omits it on the *returned* session.
 */
function shouldLogSauceScenarioUrl() {
  if (/^1|true|yes$/i.test(process.env.WDIO_RUNNING_ON_SAUCE || '')) return true;
  try {
    if (typeof browser === 'undefined') return false;
    const c = browser.capabilities || {};
    if (c['sauce:options']) return true;
    const host =
      browser.options?.hostname ||
      browser.options?.connection?.hostname ||
      browser.config?.hostname ||
      '';
    if (String(host).toLowerCase().includes('saucelabs')) return true;
  } catch (_) {
    /* ignore */
  }
  return false;
}

function getBrowserSessionIdForSauceUrl() {
  try {
    if (typeof browser === 'undefined') return null;
    const sid = browser.sessionId;
    if (sid) return String(sid);
  } catch (_) {
    /* ignore */
  }
  return null;
}

module.exports = {
  getSauceJobUrl,
  getSauceAppBase,
  getSauceWdioRegion,
  extractXrayKeyFromPickle,
  inferSuiteFromXrayKey,
  shouldLogSauceScenarioUrl,
  getBrowserSessionIdForSauceUrl,
};
