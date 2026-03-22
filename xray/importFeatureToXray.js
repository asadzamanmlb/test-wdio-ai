#!/usr/bin/env node
/**
 * Import a .feature file to Xray (updates existing tests by key).
 * Use after syncFeatureToTestcase.js to push feature changes to Xray.
 *
 * Requires: XRAY_CLIENT_ID, XRAY_CLIENT_SECRET in .env
 *
 * Usage:
 *   node xray/importFeatureToXray.js <feature-path>
 *   node xray/importFeatureToXray.js features/webtv/smoke-verify-archive-game-playback-defau.feature
 *
 * Xray Cloud matches tests by @KEY tag in the scenario and updates the gherkin.
 */

const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const ROOT = path.join(__dirname, '..');
const { authenticate } = require('./exportTestsToJson');

async function importFeature(featurePath) {
  const resolved = path.isAbsolute(featurePath) ? featurePath : path.join(ROOT, featurePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`File not found: ${resolved}`);
  }

  const syncConfigPath = path.join(ROOT, 'testcase', 'sync-config.json');
  if (!fs.existsSync(syncConfigPath)) {
    throw new Error('testcase/sync-config.json not found');
  }
  const config = JSON.parse(fs.readFileSync(syncConfigPath, 'utf8'));

  const relativePath = path.relative(path.join(ROOT, 'features'), resolved).replace(/\\/g, '/');
  const parts = relativePath.split('/');
  const suite = parts[0] === 'webtv' ? 'webTv' : parts[0] || 'webTv';
  const issueKey = config[suite];
  if (!issueKey) {
    throw new Error(`No Xray issue key for suite "${suite}" in sync-config.json`);
  }
  const projectKey = issueKey.replace(/-\d+$/, '');

  const token = await authenticate();

  const filename = path.basename(resolved);
  const fileBuffer = fs.readFileSync(resolved);

  if (typeof FormData === 'undefined' || typeof Blob === 'undefined') {
    throw new Error('FormData/Blob required (Node 18+). Or use Xray UI: Import Cucumber → upload .feature file');
  }
  const formData = new FormData();
  formData.append('file', new Blob([fileBuffer], { type: 'text/plain' }), filename);
  formData.append('projectKey', projectKey);
  formData.append('source', suite);

  const res = await fetch('https://xray.cloud.getxray.app/api/v2/import/feature', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Xray import failed (${res.status}): ${text}`);
  }

  const json = await res.json();
  return json;
}

async function main() {
  const featurePath = process.argv[2];
  if (!featurePath) {
    console.error('Usage: node xray/importFeatureToXray.js <feature-path>');
    console.error('Example: node xray/importFeatureToXray.js features/webtv/smoke-verify-archive-game-playback-defau.feature');
    process.exit(1);
  }

  try {
    console.log('🔐 Authenticating...');
    const result = await importFeature(featurePath);
    console.log('✅ Imported to Xray:', JSON.stringify(result, null, 2));
  } catch (e) {
    console.error('✗', e.message);
    if (e.message.includes('404') || e.message.includes('endpoint')) {
      console.error('\nNote: Xray Cloud feature import endpoint may vary. Check https://docs.getxray.app/display/XRAYCLOUD/Importing+Cucumber+Tests+-+REST');
      console.error('Alternative: In Jira → Xray → Import → Cucumber → upload the .feature file');
    }
    process.exit(1);
  }
}

main();
