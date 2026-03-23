/**
 * Shared wdio-video-reporter options (local + grid WDIO configs).
 * Uses @ffmpeg-installer/ffmpeg (bundled) — no system ffmpeg required.
 *
 * Env:
 * - WDIO_RECORD_VIDEO=1             — **enable** reporter (default: **off** for speed)
 * - WDIO_SAVE_ALL_VIDEOS=1         — MP4 for passing scenarios too (dashboard sets both when Recording is on)
 * - WDIO_VIDEO_SLOWDOWN=1..100     — frame timing (default 3)
 * - WDIO_VIDEO_RENDER_TIMEOUT_MS   — ffmpeg encode budget (default 120000)
 */
const path = require('path');

const videoReporterEnabled = /^1|true|yes$/i.test(
  process.env.WDIO_RECORD_VIDEO || process.env.RECORD_TEST_VIDEO || ''
);
const saveAllVideos = /^1|true|yes$/i.test(process.env.WDIO_SAVE_ALL_VIDEOS || '');

/** @returns {unknown[]} Reporter tuple(s) for WDIO `reporters` array */
function getWdioVideoReporterEntries() {
  if (!videoReporterEnabled) return [];
  // WDIO resolves community reporter as `wdio-${name}-reporter` → use `video` for package `wdio-video-reporter`
  return [
    [
      'video',
      {
        outputDir: path.join(__dirname, '..', 'reports', 'videos'),
        saveAllVideos,
        videoSlowdownMultiplier: Math.min(100, Math.max(1, Number(process.env.WDIO_VIDEO_SLOWDOWN) || 3)),
        videoFormat: 'mp4',
        videoRenderTimeout: Math.max(5000, Number(process.env.WDIO_VIDEO_RENDER_TIMEOUT_MS) || 120000),
        rawPath: '.video-reporter-frames',
      },
    ],
  ];
}

function clearVideosDir() {
  const fs = require('fs');
  const videosDir = path.join(__dirname, '..', 'reports', 'videos');
  try {
    if (fs.existsSync(videosDir)) {
      fs.rmSync(videosDir, { recursive: true, force: true });
    }
  } catch (_) {}
}

module.exports = {
  getWdioVideoReporterEntries,
  clearVideosDir,
  videoReporterEnabled,
  saveAllVideos,
};
