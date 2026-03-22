---
name: xray-sync
description: Sync test cases from Jira Xray to the unified QA platform. Use when syncing from Xray, adding new test folders, converting Manual tests to Cucumber, or working with testcase/ or xray/.
---

# Xray Sync Workflow

## Config

`testcase/sync-config.json` maps folder names to Xray issue keys:

```json
{
  "webTv": "WSTE-796",
  "optools": "WQO-1147"
}
```

## Commands

| Command | Purpose |
|--------|---------|
| `npm run sync:xray` | Sync all folders, export + convert Manual→Gherkin |
| `npm run sync:feature` | Sync feature files → testcase JSON (when you edit .feature directly) |
| `node xray/importFeatureToXray.js <feature-path>` | Push feature to Xray (after sync:feature) |
| `node xray/exportTestsToJson.js <ISSUE-KEY> <folder>` | Export single folder |
| `node scripts/convertOptoolsToGherkin.js <folder>` | Convert Manual steps to Cucumber for folder |

## Feature → JSON → Xray (when you edit feature files)

1. Edit the .feature file (add/remove steps)
2. Run `npm run sync:feature` — updates testcase/<suite>/<KEY>.json with new gherkin/steps
3. Run `node xray/importFeatureToXray.js features/webtv/<file>.feature` — pushes to Xray  
   Or use Jira Xray → Import Cucumber → upload the .feature file

## Adding a new folder

1. Add entry to `testcase/sync-config.json`: `"newProduct": "WXX-123"`
2. Run `npm run sync:xray`
3. Creates `testcase/newProduct/*.json` and `features/newProduct/*.feature` if applicable

## Output format

- **WebTV (WSTE)**: Already Gherkin in Xray → stored as-is in `testcase/webTv/<KEY>.json`
- **Optools (WQO)**: Manual steps → converted via `convertOptoolsToGherkin.js` → Gherkin in JSON

Each file: `id`, `key`, `summary`, `description`, `gherkin` (Given/When/Then).
