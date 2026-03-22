#!/usr/bin/env node
/**
 * Sync all test cases from Xray and convert to Cucumber.
 * Reads testcase/sync-config.json for folder -> issueKey mapping.
 *
 * Usage: node scripts/syncXrayTests.js
 */

const fs = require('fs');
const path = require('path');

const { exportTests } = require('../xray/exportTestsToJson');
const { convertFolder } = require('./convertOptoolsToGherkin');

const CONFIG_PATH = path.join(__dirname, '..', 'testcase', 'sync-config.json');

async function main() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(`Config not found: ${CONFIG_PATH}`);
    console.error('Create testcase/sync-config.json with: { "folderName": "ISSUE-KEY", ... }');
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const entries = Object.entries(config).filter(([k]) => k !== 'jiraBaseUrl');

  console.log('🔄 Syncing test cases from Xray...\n');

  for (const [folder, issueKey] of entries) {
    console.log(`\n--- ${folder} (${issueKey}) ---`);
    try {
      await exportTests(issueKey, folder);
    } catch (e) {
      console.error(`  ✗ Export failed: ${e.message}`);
      continue;
    }
  }

  console.log('\n🔄 Converting Manual tests to Cucumber/Gherkin...\n');

  for (const [folder] of entries) {
    const converted = convertFolder(folder);
    if (converted > 0) {
      console.log(`  ${folder}/: ${converted} converted\n`);
    }
  }

  console.log('✅ Sync complete');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
