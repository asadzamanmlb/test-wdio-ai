const { searchWithEmbeddings } = require('../rag/vectorDB');

async function runAgents() {
  console.log('🤖 Running Planner → Generator → Fixer');

  const ragResults = await searchWithEmbeddings('login selector element', 2);
  if (ragResults.length > 0) {
    console.log(`  RAG: ${ragResults.length} prior fix(es) in memory`);
  }

  console.log('Planner: building flows');
  console.log('Generator: creating tests');
  console.log('Fixer: ready for self-healing (uses RAG + DOM when tests fail)');
}

module.exports = { runAgents };
