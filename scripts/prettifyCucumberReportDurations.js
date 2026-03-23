#!/usr/bin/env node
/**
 * Post-process multiple-cucumber-html-reporter output: replace Luxon-style
 * durations (hh:mm:ss.SSS) with human text: "30 sec", "2 min 30 sec", "1 hr 5 min", etc.
 * Skips <script> blocks so minified JS is untouched.
 */
const fs = require('fs');
const path = require('path');

// Luxon uses 2-digit hours for sane durations; bad ms/ns config can produce huge hour counts — allow \d+ for hours.
// Minutes/seconds must be 00–59 so we do not match clock times or unrelated numbers.
const HMS_MS = /\b(\d+):([0-5]\d):([0-5]\d)\.(\d{3})\b/g;

function msFromParts(h, m, s, ms) {
  return (parseInt(h, 10) * 3600 + parseInt(m, 10) * 60 + parseInt(s, 10)) * 1000 + parseInt(ms, 10);
}

/** @param {number} totalMs */
function humanDuration(totalMs) {
  let roundedSec = Math.round(totalMs / 1000);
  const hours = Math.floor(roundedSec / 3600);
  roundedSec %= 3600;
  const minutes = Math.floor(roundedSec / 60);
  const seconds = roundedSec % 60;
  const parts = [];
  if (hours > 0) parts.push(`${hours} hr`);
  if (minutes > 0) parts.push(`${minutes} min`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds} sec`);
  return parts.join(' ');
}

/**
 * @param {string} fragment HTML outside of script tags
 */
function prettifyFragment(fragment) {
  let out = fragment.replace(HMS_MS, (_, h, m, s, ms) => humanDuration(msFromParts(h, m, s, ms)));
  out = out.replace(/<span class="duration">0s<\/span>/g, '<span class="duration">0 sec</span>');
  return out;
}

/**
 * @param {string} html full page HTML
 */
function prettifyHtml(html) {
  const chunks = html.split(/(<script\b[^>]*>[\s\S]*?<\/script>)/gi);
  return chunks
    .map((chunk) => (/^<script\b/i.test(chunk) ? chunk : prettifyFragment(chunk)))
    .join('');
}

function walkHtmlFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walkHtmlFiles(full, acc);
    else if (ent.name.endsWith('.html')) acc.push(full);
  }
  return acc;
}

/**
 * @param {string} [reportDir] absolute or cwd-relative; default reports/cucumber-html
 * @returns {{ files: number, updated: number }}
 */
function prettifyCucumberReportDurations(reportDir) {
  const root = path.resolve(process.cwd(), reportDir || path.join('reports', 'cucumber-html'));
  const files = walkHtmlFiles(root);
  let updated = 0;
  for (const file of files) {
    const raw = fs.readFileSync(file, 'utf8');
    const next = prettifyHtml(raw);
    if (next !== raw) {
      fs.writeFileSync(file, next, 'utf8');
      updated++;
    }
  }
  return { files: files.length, updated };
}

if (require.main === module) {
  const dir = process.argv[2];
  const { files, updated } = prettifyCucumberReportDurations(dir);
  console.log(`✅ Duration labels: ${updated}/${files} HTML file(s) updated${dir ? ` (${dir})` : ''}`);
}

module.exports = {
  prettifyCucumberReportDurations,
  prettifyHtml,
  humanDuration,
  msFromParts,
};
