/**
 * Player Page Object - from webTv-temp patterns
 * Player control buttons for pause, play, forward, rewind - common video player selectors.
 */
module.exports = {
  videoPlayer: () => $('video'),
  scrubberBar: () => $('[class*="progress"], [class*="scrubber"], [class*="SeekBar"], [role="slider"][aria-valuenow], [data-testid*="progress"], [data-testid*="seek"]'),
  durationDisplay: () => $('//*[contains(@class,"duration") or contains(@class,"time") or contains(@class,"Duration")] | //*[contains(text(),":") and contains(text(),"0")]'),
  inningsScores: () => $('[class*="inning"], [class*="score"], [class*="line-score"], [data-testid*="inning"], [data-testid*="score"], [class*="LineScore"]'),
  /** Horizontal line score / game cards above or beside player (Hide Spoilers checks). */
  lineScoreStrip: () =>
    $(
      '[class*="LineScore" i], [class*="line-score" i], [data-testid*="line-score" i], ' +
        '[data-testid*="LineScore" i], [class*="inning-strip" i]'
    ),

  // Player control buttons - try clicking these to test UI (fallback: video.pause/play/currentTime)
  pauseButton: () =>
    $('button[aria-label*="Pause" i], button[aria-label*="pause" i], [data-testid*="pause" i], .vjs-play-control, [class*="pause" i][role="button"], button[title*="Pause" i]'),
  playButton: () =>
    $('button[aria-label*="Play" i], button[aria-label*="play" i], [data-testid*="play" i], .vjs-play-control, [class*="play" i][role="button"], button[title*="Play" i]'),
  forward60Button: () =>
    $('button[aria-label*="60" i], button[aria-label*="forward" i], button[aria-label*="skip" i], [aria-label*="60 seconds" i], [aria-label*="Forward 60" i], .vjs-forward-30, [class*="forward" i], [class*="skip" i]'),
  rewindButton: () =>
    $('button[aria-label*="Rewind" i], button[aria-label*="Back" i], button[aria-label*="back" i], [aria-label*="10 seconds" i], [aria-label*="Rewind" i], .vjs-replay-5, [class*="rewind" i], [class*="replay" i]'),

  /** MLB.TV web control strip above scrubber (native click on <video> is often intercepted — use this to wake UI). */
  playerMediaControlsBar: () =>
    $('.mlbtv-media-controls, [class*="MediaControls" i], .vjs-control-bar, [class*="control-bar" i][class*="player" i]'),

  /**
   * Settings / gear — MLB.TV web: `button.mlbtv-menu-right__item.user-settings` (aria-label e.g. "Settings menu (closed)").
   * Prefer player chrome only; fall back to video.js bar.
   */
  playerSettingsButton: () =>
    $(
      'button.mlbtv-menu-right__item.user-settings, ' +
        'button.user-settings[aria-label*="Settings menu" i], ' +
        'button[aria-label*="Settings menu" i], ' +
        '.mlbtv-media-controls button.mlbtv-menu-right__item.user-settings, ' +
        '.mlbtv-media-controls button.user-settings, ' +
        '.mlbtv-media-controls button[aria-label*="Settings menu" i], ' +
        '.mlbtv-media-controls button[aria-label*="Settings" i], ' +
        '.mlbtv-media-controls [data-testid*="player-settings" i], ' +
        '.mlbtv-media-controls [data-testid*="settings-menu" i], ' +
        '.mlbtv-media-controls button[title*="Settings" i], ' +
        '.vjs-control-bar button[aria-label*="Settings" i], ' +
        '.vjs-control-bar button[title*="Settings" i], ' +
        '.vjs-control-bar .vjs-menu-button-popup .vjs-icon-settings, ' +
        '.vjs-control-bar [class*="settings" i][role="button"], ' +
        '.vjs-menu-button-popup .vjs-icon-settings'
    ),
  /** Overflow / more — scoped to player chrome only */
  playerMoreButton: () =>
    $(
      '.mlbtv-media-controls button[aria-label*="More" i], ' +
        '.mlbtv-media-controls button[aria-label*="Menu" i], ' +
        '.vjs-control-bar button[aria-label*="More" i], ' +
        '.vjs-control-bar button[aria-label*="Menu" i]'
    ),
  /** Panel / menu that may contain Hide spoilers */
  playerSettingsPanel: () =>
    $('[role="menu"], [role="dialog"], [class*="settings-panel" i], [class*="SettingsMenu" i], .vjs-menu-content'),
};
