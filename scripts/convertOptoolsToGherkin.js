#!/usr/bin/env node
/**
 * Convert Manual test cases to Cucumber/Gherkin format.
 * Reads testcase/<folder>/*.json, adds gherkin field, updates testType.
 */

const fs = require('fs');
const path = require('path');

function getTestcaseDir(folder) {
  return path.join(__dirname, '..', 'testcase', folder);
}

const KEYWORD_RE = /^\s*\*?(Given|When|Then|And|Or)\s*\*?\s*/i;
const WIKI_LINK_RE = /\[([^|\[\]]+)\|[^\]]+\]/g;
const CONFLUENCE_TABLE_ROW_RE = /\|\|\[([^|\]]+)\|[^\]]+\]\|\|/g;

function cleanText(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(WIKI_LINK_RE, '$1')
    .replace(CONFLUENCE_TABLE_ROW_RE, '| $1 |')
    .replace(/\*\*/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractGherkinLines(str) {
  if (!str) return [];
  const lines = [];
  for (const part of str.split(/\n+/)) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const match = trimmed.match(KEYWORD_RE);
    if (match) {
      const keyword = match[1];
      const rest = cleanText(trimmed.slice(match[0].length));
      if (rest) lines.push({ keyword, text: rest });
    } else if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      lines.push({ keyword: null, text: trimmed, isTable: true });
    } else {
      const prev = lines[lines.length - 1];
      if (prev && !prev.isTable) prev.text += '\n' + cleanText(trimmed);
      else lines.push({ keyword: 'And', text: cleanText(trimmed) });
    }
  }
  return lines;
}

function stepsToGherkin(steps, summary) {
  const lines = [];
  for (const step of steps || []) {
    const fromAction = extractGherkinLines(step.action);
    const fromResult = extractGherkinLines(step.result);
    const fromData = step.data ? extractGherkinLines(step.data) : [];
    for (const { keyword, text, isTable } of [...fromAction, ...fromData, ...fromResult]) {
      if (isTable) lines.push(text);
      else if (keyword && text) lines.push(`${keyword} ${text}`);
    }
  }
  if (lines.length === 0) return null;
  return lines.join('\n');
}

function convertFile(filepath) {
  const content = fs.readFileSync(filepath, 'utf8');
  const tc = JSON.parse(content);
  if (tc.testType === 'Cucumber' && tc.gherkin) return false;

  const gherkin = stepsToGherkin(tc.steps, tc.summary);
  if (!gherkin) return false;

  tc.gherkin = gherkin;
  tc.testType = 'Cucumber';
  tc.scenarioType = 'scenario';
  tc.originalTestType = tc.originalTestType || 'Manual';

  fs.writeFileSync(filepath, JSON.stringify(tc, null, 2));
  return true;
}

function convertFolder(folder, options = {}) {
  const { silent = false } = options;
  const log = (...args) => !silent && console.log(...args);
  const dir = getTestcaseDir(folder);

  if (!fs.existsSync(dir)) {
    log(`  (skip ${folder}: folder not found)`);
    return 0;
  }

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'testcases.json');
  let converted = 0;
  for (const file of files) {
    if (convertFile(path.join(dir, file))) {
      log(`  ✓ ${file}`);
      converted++;
    }
  }
  if (converted > 0) {
    const indexPath = path.join(dir, 'testcases.json');
    if (fs.existsSync(indexPath)) {
      const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
      for (const tc of index) {
        const fp = path.join(dir, `${tc.key}.json`);
        if (fs.existsSync(fp)) {
          const updated = JSON.parse(fs.readFileSync(fp, 'utf8'));
          Object.assign(tc, { gherkin: updated.gherkin, testType: updated.testType, scenarioType: updated.scenarioType });
        }
      }
      fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
    }
  }
  return converted;
}

function main() {
  const folder = process.argv[2] || 'optools';
  const converted = convertFolder(folder);
  console.log(`\n✅ Converted ${converted} test cases to Cucumber/Gherkin in ${folder}/`);
}

if (require.main === module) {
  main();
}

module.exports = { convertFolder };
