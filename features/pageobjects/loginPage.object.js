/**
 * Login Page Object - from webTv-temp patterns
 * Okta login: identifier, credentials.passcode, data-type='save'
 * BETA pre-auth: #username, #password, #login-button
 */
module.exports = {
  // Okta login fields
  emailInput: () => $('//input[@name="identifier"]'),
  passwordInput: () => $('//input[@name="credentials.passcode"]'),
  continueButton: () => $('//input[@data-type="save"]'),
  loginButton: () => $('//input[@data-type="save"]'),
  verifyWithPasswordButton: () => $("//*[contains(text(),'Verify') and contains(text(),'Password')]"),
  loginHeaderLink: () => $('[data-testid="headerLink-Log In"]'),

  // BETA pre-auth (bot/cookie form)
  betaUsername: () => $('#username'),
  betaPassword: () => $('#password'),
  betaLoginButton: () => $('#login-button'),

  // Logged-in state
  accountDropdown: () => $("//*[@aria-label='Account']"),
};
