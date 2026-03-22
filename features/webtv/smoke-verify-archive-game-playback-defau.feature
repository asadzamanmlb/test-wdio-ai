# WSTE-39: Smoke | Verify Archive Game Playback - Default
# Auto-generated - add step implementations as needed

@webtv

Feature: Smoke

  @WSTE-39
  Scenario: Smoke | Verify Archive Game Playback - Default
    Given an entitled user is logged into mlb.com/tv
    When a user selects an archived game for playback
    Then playback starts at the beginning of the stream
    And the duration of the game display right side of the scrubber bar
    And all available data is visible to the user (this includes innings and final scores)
