/**
 * Player Page Object - from webTv-temp patterns
 * Player control buttons for pause, play, forward, rewind - common video player selectors.
 */
module.exports = {
  videoPlayer: () => $('video'),
  scrubberBar: () => $('[class*="progress"], [class*="scrubber"], [class*="SeekBar"], [role="slider"][aria-valuenow], [data-testid*="progress"], [data-testid*="seek"]'),
  durationDisplay: () => $('//*[contains(@class,"duration") or contains(@class,"time") or contains(@class,"Duration")] | //*[contains(text(),":") and contains(text(),"0")]'),
  inningsScores: () => $('[class*="inning"], [class*="score"], [class*="line-score"], [data-testid*="inning"], [data-testid*="score"], [class*="LineScore"]'),

  // Player control buttons - try clicking these to test UI (fallback: video.pause/play/currentTime)
  pauseButton: () =>
    $('button[aria-label*="Pause" i], button[aria-label*="pause" i], [data-testid*="pause" i], .vjs-play-control, [class*="pause" i][role="button"], button[title*="Pause" i]'),
  playButton: () =>
    $('button[aria-label*="Play" i], button[aria-label*="play" i], [data-testid*="play" i], .vjs-play-control, [class*="play" i][role="button"], button[title*="Play" i]'),
  forward60Button: () =>
    $('button[aria-label*="60" i], button[aria-label*="forward" i], button[aria-label*="skip" i], [aria-label*="60 seconds" i], [aria-label*="Forward 60" i], .vjs-forward-30, [class*="forward" i], [class*="skip" i]'),
  rewindButton: () =>
    $('button[aria-label*="Rewind" i], button[aria-label*="Back" i], button[aria-label*="back" i], [aria-label*="10 seconds" i], [aria-label*="Rewind" i], .vjs-replay-5, [class*="rewind" i], [class*="replay" i]'),
};
