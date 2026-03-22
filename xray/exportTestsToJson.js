#!/usr/bin/env node
/**
 * Export Xray test cases to JSON files under testcase/<folder>/
 */

const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const XRAY_AUTH_URL = 'https://xray.cloud.getxray.app/api/v1/authenticate';
const XRAY_GRAPHQL_URL = 'https://xray.cloud.getxray.app/api/v2/graphql';

async function authenticate() {
  const clientId = process.env.XRAY_CLIENT_ID;
  const clientSecret = process.env.XRAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Missing XRAY_CLIENT_ID or XRAY_CLIENT_SECRET');
  }
  const res = await fetch(XRAY_AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
  });
  if (!res.ok) throw new Error(`Auth failed: ${await res.text()}`);
  const token = await res.text();
  return token.replace(/^"|"$/g, '');
}

async function graphqlQuery(token, query, variables = {}) {
  const res = await fetch(XRAY_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`GraphQL failed: ${await res.text()}`);
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

async function getTestExecutionTests(token, issueKey) {
  const data = await graphqlQuery(token, `
    query GetTestExecution($jql: String!) {
      getTestExecutions(jql: $jql, limit: 1, start: 0) {
        results {
          jira(fields: ["summary"])
          tests(limit: 100) {
            results {
              issueId
              jira(fields: ["key", "summary"])
              testType { name }
            }
          }
        }
      }
    }
  `, { jql: `key = ${issueKey}` });
  return data?.getTestExecutions?.results?.[0]?.tests?.results || [];
}

async function getExpandedTests(token, issueIds) {
  if (issueIds.length === 0) return [];
  const data = await graphqlQuery(token, `
    query GetExpandedTests($issueIds: [String!]!) {
      getExpandedTests(issueIds: $issueIds, limit: 100, start: 0) {
        results {
          issueId
          gherkin
          unstructured
          scenarioType
          testType { name }
          jira(fields: ["key", "summary", "description", "status"])
          steps {
            id
            action
            data
            result
          }
        }
      }
    }
  `, { issueIds });
  return data?.getExpandedTests?.results || [];
}

const EXPANDED_TEST_FIELDS = `
  issueId
  gherkin
  unstructured
  scenarioType
  testType { name }
  jira(fields: ["key", "summary", "description", "status"])
  steps {
    id
    action
    data
    result
  }
`;

/** Fetch expanded tests by JQL with pagination (e.g. project = 'WQ') */
async function getExpandedTestsByJql(token, jql, options = {}) {
  const { limit = 100, log = () => {} } = options;
  const all = [];
  let start = 0;
  let total = 0;
  do {
    const data = await graphqlQuery(token, `
      query GetExpandedTestsByJql($jql: String!, $limit: Int!, $start: Int) {
        getExpandedTests(jql: $jql, limit: $limit, start: $start) {
          total
          start
          limit
          results {
            ${EXPANDED_TEST_FIELDS}
          }
        }
      }
    `, { jql, limit: Math.min(limit, 100), start });
    const res = data?.getExpandedTests;
    if (!res) return [];
    all.push(...(res.results || []));
    total = res.total ?? 0;
    start += (res.results?.length || 0);
    if (res.results?.length) log(`  Fetched ${all.length} / ${total} tests...`);
    if (start >= total || !res.results?.length) break;
  } while (true);
  return all;
}

/** Fetch expanded tests from a Test Repository folder (path e.g. /core-app) */
async function getExpandedTestsByFolder(token, projectId, folderPath, options = {}) {
  const { includeDescendants = true, limit = 100, log = () => {} } = options;
  const all = [];
  let start = 0;
  let total = 0;
  const folder = { path: folderPath, includeDescendants };
  do {
    const data = await graphqlQuery(token, `
      query GetExpandedTestsByFolder($projectId: String!, $folder: FolderSearchInput!, $limit: Int!, $start: Int) {
        getExpandedTests(projectId: $projectId, folder: $folder, limit: $limit, start: $start) {
          total
          start
          limit
          results {
            ${EXPANDED_TEST_FIELDS}
          }
        }
      }
    `, { projectId, folder, limit: Math.min(limit, 100), start });
    const res = data?.getExpandedTests;
    if (!res) return [];
    all.push(...(res.results || []));
    total = res.total ?? 0;
    start += (res.results?.length || 0);
    if (res.results?.length) log(`  Fetched ${all.length} / ${total} tests...`);
    if (start >= total || !res.results?.length) break;
  } while (true);
  return all;
}

function toTestCaseJson(test) {
  return {
    id: test.jira?.key || test.issueId,
    issueId: test.issueId,
    key: test.jira?.key,
    summary: test.jira?.summary,
    description: test.jira?.description || null,
    status: test.jira?.status?.name || null,
    testType: test.testType?.name || null,
    scenarioType: test.scenarioType || null,
    gherkin: test.gherkin || null,
    unstructured: test.unstructured || null,
    steps: (test.steps || []).map(s => ({
      id: s.id,
      action: s.action || '',
      data: s.data || '',
      result: s.result || '',
    })),
  };
}

async function exportTests(issueKey, folder, options = {}) {
  const { silent = false, write = true } = options;
  const log = (...args) => !silent && console.log(...args);
  const outDir = path.join(__dirname, '..', 'testcase', folder);

  log('🔐 Authenticating...');
  const token = await authenticate();
  log('✅ Authenticated\n');

  log(`📋 Fetching tests from ${issueKey}...`);
  const tests = await getTestExecutionTests(token, issueKey);
  if (!tests.length) {
    throw new Error(`No tests found for ${issueKey}`);
  }

  const issueIds = tests.map(t => t.issueId);
  log(`📥 Fetching expanded details for ${issueIds.length} tests...`);
  const expanded = await getExpandedTests(token, issueIds);

  const allTestCases = expanded.map((test) => toTestCaseJson(test));

  if (write) {
    fs.mkdirSync(outDir, { recursive: true });
    for (const tc of allTestCases) {
      const filename = `${tc.key || tc.issueId}.json`;
      fs.writeFileSync(path.join(outDir, filename), JSON.stringify(tc, null, 2));
      log(`  ✓ ${tc.key}`);
    }
    fs.writeFileSync(
      path.join(outDir, 'testcases.json'),
      JSON.stringify(allTestCases, null, 2)
    );
    log(`\n✅ Exported ${allTestCases.length} test cases to testcase/${folder}/`);
  }

  return allTestCases;
}

/** Export tests from a project (by JQL) or from a Test Repository folder.
 * - projectKey: Jira project key (e.g. WQ)
 * - folderPath: optional folder path (e.g. /core-app). If provided, fetches from that folder; else uses JQL project = '<projectKey>'
 * - outFolder: local folder name under testcase/ (e.g. core-app)
 */
async function exportTestsFromProjectOrFolder(projectKey, outFolder, folderPath = null, options = {}) {
  const { silent = false, write = true } = options;
  const log = (...args) => !silent && console.log(...args);
  const outDir = path.join(__dirname, '..', 'testcase', outFolder);

  log('🔐 Authenticating...');
  const token = await authenticate();
  log('✅ Authenticated\n');

  let expanded;
  if (folderPath) {
    log(`📋 Fetching tests from folder "${folderPath}" in project ${projectKey}...`);
    expanded = await getExpandedTestsByFolder(token, projectKey, folderPath, { log });
  } else {
    const jql = `project = '${projectKey}' AND issuetype = Test`;
    log(`📋 Fetching tests with JQL: ${jql}...`);
    expanded = await getExpandedTestsByJql(token, jql, { log });
  }

  if (!expanded?.length) {
    throw new Error(`No tests found for project ${projectKey}${folderPath ? ` folder ${folderPath}` : ''}`);
  }

  const allTestCases = expanded.map((test) => toTestCaseJson(test));

  if (write) {
    fs.mkdirSync(outDir, { recursive: true });
    for (const tc of allTestCases) {
      const filename = `${tc.key || tc.issueId}.json`;
      fs.writeFileSync(path.join(outDir, filename), JSON.stringify(tc, null, 2));
      log(`  ✓ ${tc.key}`);
    }
    fs.writeFileSync(
      path.join(outDir, 'testcases.json'),
      JSON.stringify(allTestCases, null, 2)
    );
    log(`\n✅ Exported ${allTestCases.length} test cases to testcase/${outFolder}/`);
  }

  return allTestCases;
}

/** Export a single test by key from an execution. testKey e.g. WSTE-44 */
async function exportSingleTest(executionKey, folder, testKey, options = {}) {
  const { silent = false, write = true } = options;
  const log = (...args) => !silent && console.log(...args);
  const outDir = path.join(__dirname, '..', 'testcase', folder);

  log('🔐 Authenticating...');
  const token = await authenticate();
  log('✅ Authenticated\n');

  log(`📋 Fetching tests from ${executionKey}...`);
  const tests = await getTestExecutionTests(token, executionKey);
  const match = tests.find((t) => (t.jira?.key || '').toUpperCase() === (testKey || '').toUpperCase());
  if (!match) {
    throw new Error(`Test ${testKey} not found in execution ${executionKey}`);
  }

  log(`📥 Fetching expanded details for ${testKey}...`);
  const expanded = await getExpandedTests(token, [match.issueId]);
  const tc = toTestCaseJson(expanded[0] || match);

  if (write) {
    fs.mkdirSync(outDir, { recursive: true });
    const filename = `${tc.key || tc.issueId}.json`;
    fs.writeFileSync(path.join(outDir, filename), JSON.stringify(tc, null, 2));
    log(`  ✓ ${tc.key}`);
  }

  return tc;
}

async function main() {
  const cmd = process.argv[2];
  // node exportTestsToJson.js project WQ core-app [folderPath]
  // node exportTestsToJson.js project WQ core-app /core-app
  if (cmd === 'project') {
    const projectKey = process.argv[3] || 'WQ';
    const outFolder = process.argv[4] || 'core-app';
    const folderPath = process.argv[5] || null; // e.g. /core-app to fetch from that folder only
    await exportTestsFromProjectOrFolder(projectKey, outFolder, folderPath);
    return;
  }
  // Legacy: node exportTestsToJson.js WSTE-796 webTv (test execution)
  const issueKey = process.argv[2] || process.env.XRAY_ISSUE_KEY || 'WSTE-796';
  const folder = process.argv[3] || 'webTv';
  await exportTests(issueKey, folder);
}

if (require.main === module) {
  main().catch(e => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { authenticate, exportTests, exportSingleTest, exportTestsFromProjectOrFolder };
