#!/usr/bin/env node
/**
 * Fetch Xray test cases from a Jira issue (Test Execution, Test Plan, Test Set, or Test).
 * Uses Xray Cloud API with Client ID + Client Secret (API Key).
 *
 * Usage: node xray/fetchTests.js [ISSUE_KEY]
 * Example: node xray/fetchTests.js WSTE-796
 *
 * Set env vars: XRAY_CLIENT_ID, XRAY_CLIENT_SECRET
 * Or use .env file (see .env.example)
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const XRAY_AUTH_URL = 'https://xray.cloud.getxray.app/api/v1/authenticate';
const XRAY_GRAPHQL_URL = 'https://xray.cloud.getxray.app/api/v2/graphql';
const XRAY_API_BASE = 'https://xray.cloud.getxray.app/api/v2';

async function authenticate() {
  const clientId = process.env.XRAY_CLIENT_ID;
  const clientSecret = process.env.XRAY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      'Missing XRAY_CLIENT_ID or XRAY_CLIENT_SECRET. Set in .env or environment.'
    );
  }

  const res = await fetch(XRAY_AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Xray auth failed (${res.status}): ${text}`);
  }

  const token = await res.text();
  return token.replace(/^"|"$/g, '');
}

async function exportTests(token, keys) {
  const url = `${XRAY_API_BASE}/export/test?keys=${encodeURIComponent(keys)}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Xray export failed (${res.status}): ${text}`);
  }

  return res.text();
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

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GraphQL failed (${res.status}): ${text}`);
  }

  const json = await res.json();
  if (json.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

async function getTestExecutionWithTests(token, issueKey) {
  const query = `
    query GetTestExecution($jql: String!) {
      getTestExecutions(jql: $jql, limit: 1, start: 0) {
        total
        results {
          issueId
          jira(fields: ["summary", "status", "description"])
          testEnvironments
          tests(limit: 100) {
            total
            results {
              issueId
              jira(fields: ["summary", "status", "key"])
              testType { name }
            }
          }
          testRuns(limit: 100) {
            total
            results {
              id
              test { issueId jira(fields: ["key", "summary"]) }
              status { name }
              comment
            }
          }
        }
      }
    }
  `;
  const data = await graphqlQuery(token, query, {
    jql: `key = ${issueKey}`,
  });
  return data?.getTestExecutions;
}

async function main() {
  const issueKey = process.argv[2] || process.env.XRAY_ISSUE_KEY || 'WSTE-796';

  console.log(`\n🔐 Authenticating with Xray Cloud...`);
  const token = await authenticate();
  console.log('✅ Authenticated\n');

  console.log(`📋 Fetching test cases for ${issueKey}...`);

  try {
    const execData = await getTestExecutionWithTests(token, issueKey);
    if (execData?.results?.length > 0) {
      const te = execData.results[0];
      console.log('\n--- Test Execution ---');
      console.log(JSON.stringify(te.jira, null, 2));
      if (te.tests?.results?.length) {
        console.log(`\n--- Tests (${te.tests.total}) ---`);
        te.tests.results.forEach((t, i) => {
          console.log(`  ${i + 1}. ${t.jira?.key || t.issueId}: ${t.jira?.summary || 'N/A'} [${t.testType?.name || ''}]`);
        });
      }
      if (te.testRuns?.results?.length) {
        console.log(`\n--- Test Runs (${te.testRuns.total}) ---`);
        te.testRuns.results.forEach((r, i) => {
          const key = r.test?.jira?.key || r.test?.issueId;
          const status = r.status?.name || '?';
          console.log(`  ${i + 1}. ${key}: ${status}${r.comment ? ` — ${r.comment}` : ''}`);
        });
      }
      if (!te.tests?.results?.length && !te.testRuns?.results?.length) {
        console.log('  (No tests or test runs found in this execution)');
      }
    } else {
      console.log('  No Test Execution found. Trying Cucumber export...');
      try {
        const cucumber = await exportTests(token, issueKey);
        console.log('\n--- Cucumber Export ---\n' + cucumber);
      } catch (e2) {
        console.error('Could not fetch tests:', e2.message);
      }
    }
  } catch (e) {
    console.error('Error:', e.message);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
