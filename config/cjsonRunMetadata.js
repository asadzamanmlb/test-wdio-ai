/**
 * Host OS / device hints for wdio-cucumberjs-json-reporter (`cjson:metadata`).
 * Without this, local desktop Chrome has no platformVersion in capabilities → "Version not known" in HTML reports.
 *
 * @param {{ deviceHint?: string }} [opts]
 */
const os = require('os');
const fs = require('fs');
const { execSync } = require('child_process');

/**
 * Platform name for Cucumber JSON / HTML metadata.
 * multiple-cucumber-html-reporter only maps icons for `osx`, `windows`, `linux`, `ubuntu` — not `macOS`.
 */
function getHostPlatformLabel() {
  switch (process.platform) {
    case 'darwin':
      return 'osx';
    case 'win32':
      return 'windows';
    case 'linux':
      return 'linux';
    default:
      return process.platform;
  }
}

function getHostOsVersion() {
  if (process.platform === 'darwin') {
    try {
      const v = execSync('sw_vers -productVersion', { encoding: 'utf8', timeout: 3000 }).trim();
      if (v) return v;
    } catch (_) {}
    return os.release();
  }
  if (process.platform === 'win32') {
    try {
      const v = execSync(
        'powershell -NoProfile -Command "(Get-CimInstance Win32_OperatingSystem).Version"',
        { encoding: 'utf8', timeout: 8000, windowsHide: true }
      ).trim();
      if (v) return v;
    } catch (_) {}
    try {
      const v = execSync('cmd /c ver', { encoding: 'utf8', timeout: 5000, windowsHide: true }).trim();
      if (v) return v.replace(/^.*\s/, '').replace(/[\r\n]+$/, '');
    } catch (_) {}
    return os.release();
  }
  if (process.platform === 'linux') {
    try {
      const release = fs.readFileSync('/etc/os-release', 'utf8');
      const pretty = release.match(/^PRETTY_NAME="([^"]+)"/m);
      if (pretty) return pretty[1];
      const v = release.match(/^VERSION="([^"]+)"/m);
      if (v) return v[1];
    } catch (_) {}
  }
  return os.release();
}

function getCjsonMetadata(opts = {}) {
  const device =
    opts.deviceHint ||
    (process.env.CI ? `CI (${process.env.CI || 'true'})` : 'Local host');

  return {
    platform: {
      name: getHostPlatformLabel(),
      version: getHostOsVersion(),
    },
    device,
  };
}

module.exports = {
  getCjsonMetadata,
  getHostPlatformLabel,
  getHostOsVersion,
};
