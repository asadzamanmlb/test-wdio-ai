
const { runAgents } = require('./ai/agents');
const { runTests } = require('./wdio/testRunner');

(async () => {
  console.log("🚀 Unified QA Platform Started");

  await runAgents();

  await runTests();

  console.log("✅ QA cycle complete");
})();
