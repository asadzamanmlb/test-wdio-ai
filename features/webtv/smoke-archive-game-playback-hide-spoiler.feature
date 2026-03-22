# WSTE-40: Smoke | Archive Game Playback - Hide Spoilers ON
# Auto-generated - add step implementations as needed

@webtv

Feature: Smoke

  @WSTE-40
  Scenario: Smoke | Archive Game Playback - Hide Spoilers ON
    Given an entitled user is logged into mlb.com/tv
    And the users "HideSpoilers" setting are set to ON
    When the user selects an archived game for playback from Hero, games tile or Media Center
    Then playback starts at the beginning of the stream
    And all available data is hidden from the user (this includes innings and final score)
    And the data is revealed inning by inning as playback progresses
