#!/usr/bin/env node
/**
 * Verify Sauce Labs credentials and API reachability (no browser session).
 *
 * Uses env: SAUCE_USERNAME, SAUCE_ACCESS_KEY (or SAUCE_USER / SAUCE_KEY).
 * Optional: SAUCE_REGION=us-west-1 | eu-central-1 (must match your account data center)
 *
 *   npm run sauce:auth
 *   node scripts/sauceAuthCheck.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const user = process.env.SAUCE_USERNAME || process.env.SAUCE_USER;
const key = process.env.SAUCE_ACCESS_KEY || process.env.SAUCE_KEY;
const region = process.env.SAUCE_REGION || 'us-west-1';

const API_HOST = {
  'us-west-1': 'https://api.us-west-1.saucelabs.com',
  'eu-central-1': 'https://api.eu-central-1.saucelabs.com',
}[region] || 'https://api.us-west-1.saucelabs.com';

async function main() {
  if (!user || !key) {
    console.error('❌ Missing SAUCE_USERNAME and/or SAUCE_ACCESS_KEY (export in shell or add to .env)\n');
    process.exit(1);
  }

  const auth = Buffer.from(`${user}:${key}`, 'utf8').toString('base64');
  const headers = {
    Authorization: `Basic ${auth}`,
    Accept: 'application/json',
  };

  // Lightweight endpoint: VM concurrency for the user (documented in Sauce Accounts API)
  const url = `${API_HOST}/rest/v1.2/users/${encodeURIComponent(user)}/concurrency`;

  console.log(`Checking Sauce API: ${url}\n`);

  try {
    const res = await fetch(url, { method: 'GET', headers });
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = text.slice(0, 500);
    }

    if (res.ok) {
      console.log('✅ Sauce Labs authentication succeeded.\n');
      if (body && typeof body === 'object') {
        console.log('Concurrency / account snippet:', JSON.stringify(body, null, 2));
      }
      process.exit(0);
    }

    if (res.status === 401 || res.status === 403) {
      console.error(`❌ Authentication failed (${res.status}): invalid username or access key.\n`);
      console.error(typeof body === 'string' ? body : JSON.stringify(body, null, 2));
      process.exit(1);
    }

    if (res.status === 404) {
      console.error(`❌ Got 404 for user "${user}". Try SAUCE_REGION=eu-central-1 if your account is in the EU data center.\n`);
      console.error(typeof body === 'string' ? body : JSON.stringify(body, null, 2));
      process.exit(1);
    }

    console.error(`❌ Unexpected response ${res.status}\n`);
    console.error(typeof body === 'string' ? body : JSON.stringify(body, null, 2));
    process.exit(1);
  } catch (e) {
    console.error('❌ Network error — could not reach Sauce Labs API:\n', e.message);
    process.exit(1);
  }
}

main();
