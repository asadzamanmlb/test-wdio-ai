/**
 * Step definitions for WSTE-40: Archive Game Playback - Hide Spoilers ON
 * Hide Spoilers: Media Center game → player → Settings → toggle (see docs/webtv-domain-context.md).
 */
const { When, Then } = require('@wdio/cucumber-framework');
const And = Then;
const { ensureHideSpoilersOn, ensureHideSpoilersOff } = require('../helpers/hideSpoilersSettings');
const { assertSpoilerLineScoreDataHidden } = require('../helpers/hideSpoilersLineScoreAssertions');
const { openGamePlaybackWithScheduleFallbacks } = require('../helpers/mediaCenterOpenGame');

// "an entitled user is logged in" → login.steps.js (ensureLoggedIntoMlbTv)
// "playback starts at the beginning of the stream" → smoke-verify-archive-game-playback-defau.steps.js
// Open one game first (today → random dates → last year Apr 15); Hide Spoilers toggles in that same session (no second game).

When(
  'the user opens a playable game from the live stream schedule using today, random in-season dates, and last year April 15 as fallback',
  async function () {
    await openGamePlaybackWithScheduleFallbacks();
  }
);

And(/^the users "HideSpoilers" setting are set to (ON|OFF)$/, async function (state) {
  if (String(state).toUpperCase() === 'ON') {
    await ensureHideSpoilersOn({ skipOpenGame: true });
  } else {
    await ensureHideSpoilersOff({ skipOpenGame: true });
  }
});

// Parentheses in step text require regex in Cucumber
And(/^all available data is hidden from the user \(this includes innings and final score\)$/, async function () {
  await assertSpoilerLineScoreDataHidden();
});

And(/^the data is revealed inning by inning as playback progresses$/, async function () {
  throw new Error('Not implemented');
});
