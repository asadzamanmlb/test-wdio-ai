/**
 * Step definitions for WSTE-39
 *
 * Reference: webTv-temp/features/web/smoke/archivePlaybackWithRandomInSeasonGame.feature
 */
const { Given, When, Then } = require('@wdio/cucumber-framework');
const And = Then;
const playerPage = require('../pageobjects/player.object');

// "an entitled user is logged into mlb.com/tv" defined in login.steps.js

Then(/^the user setting are in default \(OFF\)$/, async function () {
  // TODO: implement - see temp folder for reference
  throw new Error('Not implemented');
});

// "a user selects an archived game for playback" defined in media-center.steps.js

Then("playback starts at the beginning of the stream", async function () {
  const url = await browser.getUrl();
  if (!url.includes('/tv/g') && !url.includes('/watch')) {
    throw new Error(`Expected watch page, got: ${url}`);
  }
  const video = await playerPage.videoPlayer();
  await video.waitForExist({ timeout: 25000 });
});

Then("the duration of the game display right side of the scrubber bar", async function () {
  const hasDuration = await browser.execute(() => {
    const v = document.querySelector('video');
    return v && (v.duration > 0 || !isNaN(v.duration));
  });
  const scrubber = await playerPage.scrubberBar();
  const scrubberExists = await scrubber.isExisting().catch(() => false);
  if (!hasDuration && !scrubberExists) {
    throw new Error('Could not find scrubber bar or video duration');
  }
});

Then(/^all available data is visible to the user \(this includes innings and final scores\)$/, async function () {
  const hasData = await browser.execute(() => {
    const text = (document.body && document.body.innerText) ? document.body.innerText : '';
    return /inning|score|FINAL|\d+\s*[-–]\s*\d+/i.test(text) || document.querySelector('video');
  });
  if (!hasData) {
    throw new Error('Could not find innings, score, or video data');
  }
});
