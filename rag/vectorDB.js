/**
 * RAG Vector DB - stores and retrieves selector fixes for self-healing.
 * Uses OpenAI embeddings when OPENAI_API_KEY is set, else TF-IDF (natural) for lexical search.
 */
const fs = require('fs');
const path = require('path');

const MEMORY_PATH = path.join(process.cwd(), '.rag-memory.json');
/** Static product/domain entries merged into search (not cleared by RAG refresh). */
const DOMAIN_KNOWLEDGE_PATH = path.join(__dirname, 'domain-knowledge.json');

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

function loadDomainKnowledge() {
  try {
    if (!fs.existsSync(DOMAIN_KNOWLEDGE_PATH)) return [];
    const raw = JSON.parse(fs.readFileSync(DOMAIN_KNOWLEDGE_PATH, 'utf8'));
    return Array.isArray(raw) ? raw : [];
  } catch (_) {
    return [];
  }
}

/** TF-IDF matrices for an arbitrary doc list (memory + domain seed). */
function buildTfIdfFor(docs) {
  const localDocTfs = [];
  const localDocTokens = [];
  const df = {};
  docs.forEach((doc) => {
    const combined = [
      doc.text,
      doc.fix?.selector || '',
      doc.fix?.guidance || '',
      doc.step || '',
      doc.scenario || '',
    ]
      .join(' ');
    const tokens = tokenize(combined);
    localDocTokens.push(tokens);
    const tf = {};
    tokens.forEach((t) => {
      tf[t] = (tf[t] || 0) + 1;
      df[t] = (df[t] || 0) + 1;
    });
    localDocTfs.push(tf);
  });
  return { docTfs: localDocTfs, docTokens: localDocTokens, df, n: docs.length };
}

function buildTfIdf() {
  const r = buildTfIdfFor(db);
  docTfs = r.docTfs;
  docTokens = r.docTokens;
  return r;
}

function getSearchCorpus() {
  loadDb();
  return [...loadDomainKnowledge(), ...db];
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
  const corpus = getSearchCorpus();
  if (corpus.length === 0) return [];

  const { docTfs, df, n } = buildTfIdfFor(corpus);
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
      text: corpus[s.i].text,
      fix: corpus[s.i].fix,
      step: corpus[s.i].step,
      scenario: corpus[s.i].scenario,
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

    const corpus = getSearchCorpus();
    if (corpus.length === 0) return [];

    const texts = corpus.map((d) =>
      [d.text, d.fix?.selector, d.fix?.guidance, d.step, d.scenario].filter(Boolean).join(' ')
    );
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
        text: corpus[s.i].text,
        fix: corpus[s.i].fix,
        step: corpus[s.i].step,
        scenario: corpus[s.i].scenario,
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

/**
 * Clear RAG memory and optionally failure manifests/screenshots.
 * @param {object} opts - { failureManifests?: boolean } - if true, also wipes failure-screenshots.json, failure-dom.json, screenshots
 */
function clearDb(opts = {}) {
  db = [];
  docTfs = [];
  docTokens = [];
  if (fs.existsSync(MEMORY_PATH)) {
    fs.unlinkSync(MEMORY_PATH);
  }
  if (opts.failureManifests) {
    const reportsDir = path.join(process.cwd(), 'reports');
    const manifestPath = path.join(reportsDir, 'failure-screenshots.json');
    const domPath = path.join(reportsDir, 'failure-dom.json');
    const screenshotsDir = path.join(reportsDir, 'screenshots');
    try {
      if (fs.existsSync(manifestPath)) fs.unlinkSync(manifestPath);
      if (fs.existsSync(domPath)) fs.unlinkSync(domPath);
      if (fs.existsSync(screenshotsDir)) {
        const files = fs.readdirSync(screenshotsDir).filter((f) => f.endsWith('.png'));
        for (const f of files) fs.unlinkSync(path.join(screenshotsDir, f));
      }
    } catch (e) {
      /* ignore */
    }
  }
  return { cleared: true };
}

module.exports = { save, search, searchWithEmbeddings, loadDb, clearDb, loadDomainKnowledge };
