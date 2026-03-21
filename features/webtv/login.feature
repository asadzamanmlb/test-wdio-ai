# WSTE-35: Smoke | Log In | WSTE-36: Smoke | Verify Log Out behavior
# Synced with Xray test cases from testcase/webTv/

@webtv @login @WSTE-35 @WSTE-36

Feature: Smoke | Log In

  Scenario: Smoke | Log In (WSTE-35)
    Given the user is NOT logged in
    And they attempt to go to mlb.com/tv
    When the user enters a valid "Email"
    And the user clicks "Continue"
    And the user enters a valid "Password"
    And the user clicks the "Log In" button
    Then the user is successfully logged in
    And the user is redirected back to the Welcome Center

  Scenario: Smoke | Verify Log Out behavior (WSTE-36)
    Given the user is already logged into mlb.com/tv
    When the user hovers over the "ACCOUNT" button from the top nav
    And the user clicks the "Log Out" option
    Then the logout screen should display
    And the following message should appear "You have been logged out of MLB.com.You will be automatically redirected in 5 seconds"
    And the user should be redirected to the "MLB.com | The Official Site of Major League Baseball" page
