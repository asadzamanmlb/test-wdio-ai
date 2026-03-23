/**
 * Media Center step definitions - WSTE-718 (based on webTv-temp patterns)
 */
const { Given, When, Then } = require('@wdio/cucumber-framework');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { baseUrl } = require('../../config/env');
const loginPage = require('../pageobjects/loginPage.object');
const commonPage = require('../pageobjects/commonPage.object');
const mediaCenterPageObject = require('../pageobjects/mediaCenter.object');
const { qaTestUsers } = require('../../testUsers');
const { openGamePlaybackFromMediaCenter, getMediaCenterUrl } = require('../helpers/mediaCenterOpenGame');

const email = process.env.TEST_EMAIL || qaTestUsers['Yearly User'];
const password = process.env.TEST_PASSWORD || qaTestUsers.Password;

async function handleBetaPreAuthIfPresent() {
  const usernameEl = await loginPage.betaUsername();
  const exists = await usernameEl.isExisting().catch(() => false);
  if (!exists || !(await usernameEl.isDisplayed().catch(() => false))) return;

  const betaUser = process.env.BETA_USERNAME || qaTestUsers['Yearly User'];
  const betaPass = process.env.BETA_PASSWORD || qaTestUsers.Password;

  await usernameEl.waitForDisplayed({ timeout: 5000 }).catch(() => {});
  await usernameEl.setValue(betaUser);
  await (await loginPage.betaPassword()).setValue(betaPass);
  await (await loginPage.betaLoginButton()).click();
  await browser.waitUntil(
    async () => !(await loginPage.betaUsername().isDisplayed().catch(() => false)),
    { timeout: 5000 }
  );
}

async function handleCookieConsentIfPresent() {
  const acceptSelectors = [
    'button#onetrust-accept-btn-handler',
    '[data-testid="consent-banner"] button',
    'button[class*="accept"], button[class*="Accept"]',
    '.onetrust-close-btn-handler',
    '[aria-label*="accept" i], [aria-label*="agree" i]',
  ];
  for (let attempt = 0; attempt < 2; attempt++) {
    for (const sel of acceptSelectors) {
      try {
        const btn = await $(sel);
        if (await btn.isExisting() && (await btn.isDisplayed())) {
          await btn.waitForClickable({ timeout: 2000 }).catch(() => {});
          await btn.click();
          await browser.waitUntil(
            async () => !(await $(sel).isDisplayed().catch(() => true)),
            { timeout: 3000 }
          ).catch(() => {});
          return;
        }
      } catch (_) {}
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}

When(/^the user selects the video callsign for (?:the )?(?:game )?"([^"]+)" \(from MLB\.TV column, not MLB Audio\)$/, async function (gameMatch) {
  await handleCookieConsentIfPresent();
  const el = await mediaCenterPageObject['Video Callsign in Row'](gameMatch);
  if (!(await el.isExisting().catch(() => false))) {
    throw new Error(`No video callsign found for "${gameMatch}" in MLB.TV column. Ensure you are on the schedule table and select from the TV icon column, not MLB Audio (headphone).`);
  }
  await el.scrollIntoView().catch(() => {});
  await el.waitForClickable({ timeout: 10000 }).catch(() => {});
  await el.click();
});

/** Shared logic: select an archived game for playback (Media Center path). Used by WSTE-39 and WSTE-40. */
async function selectArchivedGameForPlayback() {
  await openGamePlaybackFromMediaCenter({ preferTodayLiveFirst: false });
}

When('a user selects an archived game for playback', async function () {
  await selectArchivedGameForPlayback();
});

When('the user selects an archived game for playback from Hero, games tile or Media Center', async function () {
  await selectArchivedGameForPlayback();
});

Given(/^the user is logged in and on mlb\.com\/live-stream-games$/, async function () {
  await browser.url(baseUrl);
  await browser.waitUntil(
    async () => (await browser.getUrl()).includes('mlb.com') || (await browser.getUrl()).includes('okta'),
    { timeout: 10000 }
  );
  if (baseUrl.includes('beta-gcp')) await handleBetaPreAuthIfPresent();
  await handleCookieConsentIfPresent();

  const accountDropdown = await commonPage.accountDropdown();
  if (await accountDropdown.isExisting() && (await accountDropdown.isDisplayed())) {
    await browser.url(getMediaCenterUrl());
    await browser.waitUntil(
      async () => (await browser.getUrl()).includes('live-stream-games'),
      { timeout: 10000 }
    );
    return;
  }

  await handleCookieConsentIfPresent();
  const emailInput = await loginPage.emailInput();
  await emailInput.waitForDisplayed({ timeout: 15000 });
  await emailInput.setValue(email);

  const continueBtn = await loginPage.continueButton();
  await continueBtn.waitForClickable({ timeout: 10000 });
  await continueBtn.click();
  await browser.waitUntil(
    async () => {
      const verify = await loginPage.verifyWithPasswordButton();
      const pass = await loginPage.passwordInput();
      return (await verify.isDisplayed().catch(() => false)) || (await pass.isDisplayed().catch(() => false));
    },
    { timeout: 10000 }
  );

  const verifyPassword = await loginPage.verifyWithPasswordButton();
  if (await verifyPassword.isExisting()) await verifyPassword.click();
  await (await loginPage.passwordInput()).waitForDisplayed({ timeout: 5000 });
  await (await loginPage.passwordInput()).setValue(password);

  const loginBtn = await loginPage.loginButton();
  await loginBtn.click();

  await browser.waitUntil(
    async () => {
      const acct = await commonPage.accountDropdown();
      return (await acct.isExisting()) && (await acct.isDisplayed());
    },
    { timeout: 30000, timeoutMsg: 'Login did not succeed' }
  );

  await browser.url(getMediaCenterUrl());
  await browser.waitUntil(
    async () => (await browser.getUrl()).includes('live-stream-games'),
    { timeout: 10000 }
  );
});

When('the user navigates the calendar through URL or date container', async function () {
  await handleCookieConsentIfPresent();
  const dateContainer = await mediaCenterPageObject['Date Container']();
  const exists = await dateContainer.isExisting().catch(() => false);
  if (exists && (await dateContainer.isDisplayed().catch(() => false))) {
    await dateContainer.scrollIntoView().catch(() => {});
  }
});

Then(/^the user can view up to end of the current season \(EX:(\d{4}\/\d{2}\/\d{2})\)$/, async function (exampleDate) {
  const [, , mm, dd] = exampleDate.match(/(\d{4})\/(\d{2})\/(\d{2})/) || [];
  const year = new Date().getFullYear();
  const date = mm && dd ? `${year}/${mm}/${dd}` : `${year}/11/02`;
  await browser.url(getMediaCenterUrl(date));
  await browser.waitUntil(
    async () => (await browser.execute(() => document.readyState)) === 'complete',
    { timeout: 15000, timeoutMsg: 'Media Center page did not load' }
  );
  const url = await browser.getUrl();
  const hasDate = /\d{4}[\/-]\d{2}[\/-]\d{2}/.test(url);
  if (!hasDate) {
    throw new Error(`Expected date in URL for end-of-season view. Got: ${url}`);
  }
});

Then(/^as far back as the prior 2 season \(EX:(\d{4}\/\d{2}\/\d{2})\)$/, async function (exampleDate) {
  const [, , mm, dd] = exampleDate.match(/(\d{4})\/(\d{2})\/(\d{2})/) || [];
  const year = new Date().getFullYear() - 2;
  const date = mm && dd ? `${year}/${mm}/${dd}` : `${year}/02/20`;
  await browser.url(getMediaCenterUrl(date));
  await browser.waitUntil(
    async () => (await browser.execute(() => document.readyState)) === 'complete',
    { timeout: 15000, timeoutMsg: 'Media Center page did not load' }
  );
  const url = await browser.getUrl();
  const hasDate = /\d{4}[\/-]\d{2}[\/-]\d{2}/.test(url);
  if (!hasDate) {
    throw new Error(`Expected date in URL for prior-season view. Got: ${url}`);
  }
});
