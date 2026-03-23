/**
 * Beta-gcp infrastructure login (#username / #password / #login-button).
 * Shared across WebTV step defs (webTv-temp pattern). On Sauce, uses longer waits.
 */
const loginPage = require('../pageobjects/loginPage.object');
const { qaTestUsers } = require('../../testUsers');
const { isWdioSauceRun } = require('../../config/env');

async function handleBetaPreAuthIfPresent() {
  const onSauce = isWdioSauceRun();
  const waitDisplayed = onSauce ? 15000 : 8000;
  const waitDismiss = onSauce ? 30000 : 12000;

  const usernameEl = await loginPage.betaUsername();
  const exists = await usernameEl.isExisting().catch(() => false);
  if (!exists || !(await usernameEl.isDisplayed().catch(() => false))) return;

  const betaUser = process.env.BETA_USERNAME || qaTestUsers['Yearly User'];
  const betaPass = process.env.BETA_PASSWORD || qaTestUsers.Password;

  await usernameEl.waitForDisplayed({ timeout: waitDisplayed }).catch(() => {});
  await usernameEl.setValue(betaUser);
  await (await loginPage.betaPassword()).setValue(betaPass);
  await (await loginPage.betaLoginButton()).waitForClickable({ timeout: waitDisplayed }).catch(() => {});
  await (await loginPage.betaLoginButton()).click();
  await browser.waitUntil(
    async () => !(await loginPage.betaUsername().isDisplayed().catch(() => false)),
    {
      timeout: waitDismiss,
      timeoutMsg: 'Beta infrastructure login (#username) did not dismiss — check BETA_USERNAME / BETA_PASSWORD and network',
    }
  );
}

module.exports = {
  handleBetaPreAuthIfPresent,
};
