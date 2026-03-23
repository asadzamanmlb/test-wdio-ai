# WSTE-40: Smoke | Archive Game Playback - Hide Spoilers ON
# One game only: open schedule (today → random in-season → last year Apr 15) → Hide Spoilers in same player → assertions.

@webtv

Feature: Archive Game Playback - Hide Spoilers ON

  @WSTE-40
  Scenario: Smoke | Archive Game Playback - Hide Spoilers ON
    Given an entitled user is logged in
    When the user opens a playable game from the live stream schedule using today, random in-season dates, and last year April 15 as fallback
    And the users "HideSpoilers" setting are set to ON
    Then playback starts at the beginning of the stream
    And all available data is hidden from the user (this includes innings and final score)
    # Deferred: progressive inning-by-inning reveal needs long playback / multiple seeks — time-consuming; re-enable when implementing.
    # And the data is revealed inning by inning as playback progresses
