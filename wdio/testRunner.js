const { execSync } = require('child_process');

async function runTests() {
  try {
    execSync('npx wdio run wdio.conf.js', {
      stdio: 'inherit',
      cwd: process.cwd(),
    });
  } catch (e) {
    console.log('Tests failed. Self-healing suggestions (if any) are in .selfheal-report.json');
    throw e;
  }
}

module.exports = { runTests };
