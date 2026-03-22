/**
 * Step definitions for WSTE-40
 * 
 * Reference: webTv-temp/features/web/smoke/archivePlaybackWithRandomInSeasonGame.feature
 */
const { Given, When, Then } = require('@wdio/cucumber-framework');
const And = Then;

// "an entitled user is logged into mlb.com/tv" defined in login.steps.js

And("the users \"HideSpoilers\" setting are set to ON", async function () {
    // TODO: implement - see temp folder for reference
    throw new Error('Not implemented');
  });

  When("the user selects an archived game for playback from Hero, games tile or Media Center", async function () {
    // TODO: implement - see temp folder for reference
    throw new Error('Not implemented');
  });

  // "playback starts at the beginning of the stream" defined in smoke-verify-archive-game-playback-defau.steps.js

  And("all available data is hidden from the user (this includes innings and final score)", async function () {
    // TODO: implement - see temp folder for reference
    throw new Error('Not implemented');
  });

  And("the data is revealed inning by inning as playback progresses", async function () {
    // TODO: implement - see temp folder for reference
    throw new Error('Not implemented');
  });
