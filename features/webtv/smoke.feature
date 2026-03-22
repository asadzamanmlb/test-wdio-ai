# WSTE-44: Smoke | Homepage - Verify VOD Playback
# Synced from testcase/webTv/

@webtv

Feature: Smoke

  @WSTE-44
  Scenario: Smoke | Homepage - Verify VOD Playback
    Given a user is logged into mlb.com/tv (any user)
    When the user navigates down to select a VOD video
    Then the user is able to play the VOD Video successfully