# WSTE-718: Media Center | Verify calendar date range 
# Synced from testcase/webTv/

@webtv

Feature: Media Center

  @WSTE-718
  Scenario: Media Center | Verify calendar date range
    Given the user is logged in and on mlb.com/live-stream-games
    When the user navigates the calendar through URL or date container
    Then the user can view up to end of the current season (EX:2026/11/02)
    And as far back as the prior 2 season (EX:2024/02/20)