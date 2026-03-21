#!/usr/bin/env node
/**
 * Wraps dashboard-server.js with auto-restart on exit.
 * When the Restart button triggers process.exit(0), this script restarts the server.
 * Kills any process on port 4000 before starting (handles EADDRINUSE).
 */
const { spawn, execSync } = require('child_process');
const path = require('path');

function killPort4000() {
  try {
    if (process.platform === 'win32') {
      const out = execSync('netstat -ano | findstr :4000', { encoding: 'utf8' }).trim();
      const match = out.match(/\s+(\d+)\s*$/m);
      if (match) execSync(`taskkill /F /PID ${match[1]}`, { stdio: 'ignore' });
    } else {
      execSync('lsof -ti:4000 | xargs kill -9 2>/dev/null || true', { stdio: 'ignore' });
    }
  } catch (_) {}
}

function run() {
  killPort4000();
  setTimeout(() => {
  const serverPath = path.join(__dirname, '..', 'dashboard-server.js');
  const child = spawn(process.execPath, [serverPath], {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..'),
    env: process.env,
  });
  child.on('exit', (code) => {
    if (code === 0) {
      console.log('\n[Restart] Server exited (restart requested). Restarting in 2s...\n');
      setTimeout(run, 2000);
    } else {
      process.exit(code);
    }
  });
  }, 500);
}

run();
