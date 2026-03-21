/**
 * RAG Vector DB - stores and retrieves selector fixes for self-healing.
 * Uses OpenAI embeddings when OPENAI_API_KEY is set, else TF-IDF (natural) for lexical search.
 */
const fs = require('fs');
const path = require('path');

const MEMORY_PATH = path.join(process.cwd(), '.rag-memory.json');

let db = [];
let docTfs = [];
let docTokens = [];

function loadDb() {
  if (fs.existsSync(MEMORY_PATH)) {
    try {
      db = JSON.parse(fs.readFileSync(MEMORY_PATH, 'utf8'));
    } catch (_) {
      db = [];
    }
  }
  return db;
}

function saveDb() {
  fs.writeFileSync(MEMORY_PATH, JSON.stringify(db, null, 2));
}

function tokenize(text) {
  if (!text || typeof text !== 'string') return [];
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

function buildTfIdf() {
  docTfs = [];
  docTokens = [];
  const df = {};
  db.forEach((doc) => {
    const combined = [doc.text, doc.fix?.selector || '', doc.step || '', doc.scenario || ''].join(' ');
    const tokens = tokenize(combined);
    docTokens.push(tokens);
    const tf = {};
    tokens.forEach((t) => {
      tf[t] = (tf[t] || 0) + 1;
      df[t] = (df[t] || 0) + 1;
    });
    docTfs.push(tf);
  });
  return { docTfs, docTokens, df, n: db.length };
}

/**
 * Save a fix to RAG memory (selector failure → suggested fix).
 * @param {string} text - Error context / failing selector / step text
 * @param {object} fix - Suggested fix: { selector, suggestedSelectors, step, scenario }
 */
function save(text, fix) {
  loadDb();
  const doc = {
    id: String(Date.now()),
    text: String(text || ''),
    fix: fix || {},
    step: fix?.step || '',
    scenario: fix?.scenario || '',
    timestamp: new Date().toISOString(),
  };
  db.push(doc);
  saveDb();
  buildTfIdf();
}

/**
 * Search RAG memory for similar past fixes (TF-IDF).
 * @param {string} query - Current failure context (selector, step text, error)
 * @param {number} topK - Max number of results
 * @returns {Array} Sorted by relevance: [{ text, fix, score }, ...]
 */
function search(query, topK = 5) {
  loadDb();
  if (db.length === 0) return [];

  const { docTfs, df, n } = buildTfIdf();
  const qTokens = tokenize(String(query || ''));
  const qTf = {};
  qTokens.forEach((t) => { qTf[t] = (qTf[t] || 0) + 1; });

  const scores = docTfs.map((tf, i) => {
    let score = 0;
    for (const t of Object.keys(qTf)) {
      const idf = df[t] ? Math.log((n + 1) / (df[t] + 1)) + 1 : 1;
      score += (qTf[t] * (tf[t] || 0)) * idf * idf;
    }
    return { i, score };
  });

  return scores
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .filter((s) => s.score > 0)
    .map((s) => ({
      text: db[s.i].text,
      fix: db[s.i].fix,
      step: db[s.i].step,
      scenario: db[s.i].scenario,
      score: Math.round(s.score * 100) / 100,
    }));
}

/**
 * Try OpenAI embeddings for semantic search (when OPENAI_API_KEY set).
 * Falls back to TF-IDF if no key or on error.
 */
async function searchWithEmbeddings(query, topK = 5) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return search(query, topK);

  try {
    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({ apiKey });

    const docs = loadDb();
    if (docs.length === 0) return [];

    const texts = docs.map((d) => [d.text, d.fix?.selector, d.step].filter(Boolean).join(' '));
    const [queryEmb, ...docEmbs] = await Promise.all([
      openai.embeddings.create({ model: 'text-embedding-3-small', input: query }),
      ...texts.map((t) =>
        openai.embeddings.create({ model: 'text-embedding-3-small', input: t.slice(0, 8000) })
      ),
    ]);

    const q = queryEmb.data[0].embedding;
    const results = docEmbs
      .map((r, i) => ({
        i,
        score: cosineSimilarity(q, r.data[0].embedding),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .filter((s) => s.score > 0.3)
      .map((s) => ({
        text: db[s.i].text,
        fix: db[s.i].fix,
        step: db[s.i].step,
        scenario: db[s.i].scenario,
        score: Math.round(s.score * 100) / 100,
      }));

    return results;
  } catch (_) {
    return search(query, topK);
  }
}

function cosineSimilarity(a, b) {
  if (a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const norm = Math.sqrt(na) * Math.sqrt(nb);
  return norm === 0 ? 0 : dot / norm;
}

module.exports = { save, search, searchWithEmbeddings, loadDb };
