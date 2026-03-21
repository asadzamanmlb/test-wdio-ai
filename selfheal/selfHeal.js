const fs = require('fs');
const path = require('path');
const { load } = require('cheerio');
const { save: ragSave, searchWithEmbeddings } = require('../rag/vectorDB');

const REPORT_PATH = path.join(process.cwd(), '.selfheal-report.json');

function escapeCss(s) {
  return s.replace(/"/g, '\\"');
}

function generateSelectorsFromElement($el, tagName, text) {
  const selectors = [];
  const t = (text || '').trim();
  if (!t) return selectors;

  const id = $el.attr('id');
  if (id && !id.includes(' ') && !id.match(/^\d/)) {
    selectors.push({ selector: `#${id}`, type: 'id', priority: 1 });
  }

  const testId = $el.attr('data-testid');
  if (testId) {
    selectors.push({ selector: `[data-testid="${escapeCss(testId)}"]`, type: 'data-testid', priority: 2 });
  }

  const ariaLabel = $el.attr('aria-label');
  if (ariaLabel && ariaLabel.toLowerCase().includes(t.toLowerCase())) {
    selectors.push({ selector: `[aria-label="${escapeCss(ariaLabel)}"]`, type: 'aria-label', priority: 3 });
  }

  const name = $el.attr('name');
  if (name && tagName === 'input') {
    selectors.push({ selector: `input[name="${escapeCss(name)}"]`, type: 'name', priority: 4 });
  }

  if (tagName === 'button' || tagName === 'input' && $el.attr('type') === 'submit') {
    selectors.push({ selector: `button=${t}`, type: 'text', priority: 5 });
  }
  if (tagName === 'a') {
    selectors.push({ selector: `*=${t}`, type: 'text', priority: 6 });
  }
  selectors.push({ selector: `*=${t}`, type: 'text-partial', priority: 7 });

  const exactText = $el.text().trim();
  if (exactText && exactText.length < 100) {
    const xq = exactText.replace(/"/g, "'");
    const tq = (t || '').replace(/"/g, "'");
    if (tagName === 'button') {
      selectors.push({ selector: `//button[contains(text(),"${xq}")]`, type: 'xpath', priority: 8 });
    }
    if (tagName === 'a') {
      selectors.push({ selector: `//a[contains(text(),"${tq}") or contains(text(),"${xq}")]`, type: 'xpath', priority: 8 });
    }
  }

  return selectors;
}

function analyzeDom(html, oldSelector, text) {
  const suggestions = [];
  if (!html || typeof html !== 'string') return suggestions;

  try {
    const $ = load(html, { xmlMode: false, decodeEntities: true });
    const searchTerms = [text].filter(Boolean).map((t) => t.toLowerCase().trim());
    if (searchTerms.length === 0 && !oldSelector) return suggestions;

    const selectorsToTry = [];
    const seen = new Set();

    $('button, a, input[type="submit"], [role="button"], [data-testid], [aria-label]').each((_, el) => {
      const $el = $(el);
      const tagName = (el.tagName || '').toLowerCase();
      const elText = $el.text().trim();
      const ariaLabel = $el.attr('aria-label') || '';
      const testId = $el.attr('data-testid') || '';

      const textMatch = searchTerms.length > 0 && searchTerms.some(
        (term) =>
          elText.toLowerCase().includes(term) ||
          ariaLabel.toLowerCase().includes(term) ||
          testId.toLowerCase().includes(term)
      );
    const textToUse = searchTerms[0] || elText.slice(0, 50) || ariaLabel;
      if (textMatch) {
        const gens = generateSelectorsFromElement($el, tagName, textToUse);
        gens.forEach((g) => {
          const key = g.selector;
          if (!seen.has(key)) {
            seen.add(key);
            selectorsToTry.push(g);
          }
        });
      }
    });

    selectorsToTry.sort((a, b) => a.priority - b.priority);
    return selectorsToTry.slice(0, 10).map((s) => s.selector);
  } catch (e) {
    return [];
  }
}

async function heal(oldSelector, text, options = {}) {
  let domSelectors = [];
  if (options.domHtml) {
    domSelectors = analyzeDom(options.domHtml, oldSelector, text);
  }

  const query = [oldSelector, text, options.step].filter(Boolean).join(' ');
  let ragSelectors = [];
  try {
    const ragResults = await searchWithEmbeddings(query, 3);
    ragResults.forEach((r) => {
      const sel = r.fix?.suggestedSelectors?.[0] || r.fix?.selector;
      if (sel) ragSelectors.push(sel);
    });
  } catch (_) {}

  const textFallback = !text ? null : `*=${String(text).trim()}`;
  const suggestedSelectors = [...new Set([...ragSelectors, ...domSelectors, textFallback].filter(Boolean))];

  const fix = {
    selector: oldSelector,
    suggestedSelectors,
    step: options.step,
    scenario: options.scenario,
  };
  try {
    ragSave(query, fix);
  } catch (_) {}

  const entry = {
    timestamp: new Date().toISOString(),
    oldSelector: oldSelector || 'unknown',
    suggestedSelectors,
    domAnalyzed: !!options.domHtml,
    ragUsed: ragSelectors.length > 0,
    text: text || '',
    step: options.step || '',
    scenario: options.scenario || '',
  };

  let report = [];
  if (fs.existsSync(REPORT_PATH)) {
    try {
      report = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'));
    } catch (_) {}
  }
  report.push(entry);
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

  const top = suggestedSelectors[0];
  const msg = top
    ? `🔧 Self-heal: "${oldSelector}" → try \`${top}\`${domSelectors.length ? ' (from DOM)' : ''}. See .selfheal-report.json`
    : `🔧 Self-heal: "${oldSelector}" failed. See .selfheal-report.json`;
  console.log(msg);
}

module.exports = { heal, analyzeDom };
