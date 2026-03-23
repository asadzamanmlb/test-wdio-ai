/**
 * Match wdio-video-reporter MP4 filenames to Cucumber scenario names.
 * Filenames look like: Smoke--Archive-Game-Playback-Hide-Spoilers-ON-0-0--CHROME--date.mp4
 */
const fs = require('fs');
const path = require('path');

function normalizeScenarioVariants(scenarioName) {
  let s = (scenarioName || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
  if (!s) return [];
  const variants = new Set();
  variants.add(
    s
      .replace(/\s*\|\s*/g, '--')
      .replace(/\s+/g, '-')
      .replace(/[^a-zA-Z0-9-]/g, '')
      .toLowerCase()
  );
  variants.add(
    s
      .replace(/\s+/g, '-')
      .replace(/[^a-zA-Z0-9-]/g, '')
      .toLowerCase()
  );
  variants.add(
    s
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase()
  );
  return [...variants].filter((v) => v.length >= 4);
}

/**
 * @param {string} scenarioName - Cucumber scenario name
 * @param {string} videosDir - absolute path to reports/videos
 * @returns {string | null} basename of .mp4 or null
 */
function findVideoForScenarioName(scenarioName, videosDir) {
  const dir = videosDir || path.join(process.cwd(), 'reports', 'videos');
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.mp4') && !f.startsWith('.') && f.indexOf('.video-reporter') === -1);
  if (files.length === 0) return null;

  const variants = normalizeScenarioVariants(scenarioName);
  const scored = files.map((f) => {
    const fn = f.toLowerCase();
    let score = 0;
    for (const v of variants) {
      const slice = v.slice(0, Math.min(50, v.length));
      if (slice.length >= 8 && fn.includes(slice)) score += slice.length;
      for (const w of v.split('-').filter((x) => x.length > 3)) {
        if (fn.includes(w)) score += 3;
      }
    }
    const mtime = fs.statSync(path.join(dir, f)).mtimeMs;
    return { f, score, mtime };
  });
  scored.sort((a, b) => b.score - a.score || b.mtime - a.mtime);
  if (scored[0].score > 0) return scored[0].f;
  if (files.length === 1) return files[0];
  return null;
}

module.exports = { findVideoForScenarioName, normalizeScenarioVariants };
