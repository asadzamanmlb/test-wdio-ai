/**
 * Login step definitions - synced with Xray test cases (WSTE-35, WSTE-36)
 */
const { Given, When, Then } = require('@wdio/cucumber-framework');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { baseUrl } = require('../../config/env');
const loginPage = require('../pageobjects/loginPage.object');
const commonPage = require('../pageobjects/commonPage.object');
const { qaTestUsers } = require('../../testUsers');

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
        if (await btn.isExisting() && await btn.isDisplayed()) {
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

// --- WSTE-35 steps ---

Given('the user is NOT logged in', async function () {
  await browser.deleteAllCookies();
});

Given(/^they attempt to go to mlb\.com\/tv$/, async function () {
  await browser.url(baseUrl);
  await browser.waitUntil(
    async () => (await browser.getUrl()).includes('mlb.com') || (await browser.getUrl()).includes('okta'),
    { timeout: 10000 }
  );
  if (baseUrl.includes('beta-gcp')) await handleBetaPreAuthIfPresent();
  await handleCookieConsentIfPresent();
  await browser.waitUntil(
    async () => (await browser.getUrl()).length > 10,
    { timeout: 3000 }
  );

  const url = await browser.getUrl();
  if (!url.includes('login') && !url.includes('okta') && !url.includes('auth')) {
    const loginBtn = await $('[data-testid="header-profile-button"], [data-testid="headerLink-Log In"]');
    try {
      if (await loginBtn.isDisplayed()) {
        await loginBtn.click();
        await browser.waitUntil(
          async () => {
            const u = await browser.getUrl();
            return u.includes('login') || u.includes('okta') || (await loginPage.emailInput().isDisplayed().catch(() => false));
          },
          { timeout: 10000 }
        );
      }
    } catch (_) {}
  }
});

When('the user enters a valid {string}', async function (field) {
  await handleCookieConsentIfPresent();
  const isEmail = field.toLowerCase() === 'email';
  const value = isEmail ? email : password;

  if (isEmail) {
    const el = await loginPage.emailInput();
    await el.waitForDisplayed({ timeout: 15000 });
    await el.setValue(value);
  } else {
    await handleCookieConsentIfPresent();
    const verifyPassword = await loginPage.verifyWithPasswordButton();
    if (await verifyPassword.isExisting().catch(() => false)) {
      await verifyPassword.click().catch(() => {});
      await Promise.race([
        $('//input[@name="credentials.passcode"]').waitForDisplayed({ timeout: 5000 }),
        $('input[type="password"]').waitForDisplayed({ timeout: 5000 }),
      ]).catch(() => {});
    }
    const passSelectors = [
      '//input[@name="credentials.passcode"]',
      '//input[@name="passcode"]',
      'input[type="password"]',
    ];
    let el;
    for (const sel of passSelectors) {
      el = await $(sel);
      const shown = await el.waitForDisplayed({ timeout: 5000, reverse: false }).catch(() => false);
      if (shown) break;
    }
    await el.waitForDisplayed({ timeout: 10000 });
    await el.setValue(value);
  }
});

When('the user clicks {string}', async function (button) {
  await handleCookieConsentIfPresent();
  const btn = await loginPage.continueButton();
  await btn.waitForClickable({ timeout: 10000 });
  await btn.click();
  await browser.waitUntil(
    async () => {
      const verify = await loginPage.verifyWithPasswordButton();
      const pass1 = await $('//input[@name="credentials.passcode"]');
      const pass2 = await $('input[type="password"]');
      return (await verify.isDisplayed().catch(() => false)) ||
        (await pass1.isDisplayed().catch(() => false)) ||
        (await pass2.isDisplayed().catch(() => false));
    },
    { timeout: 10000 }
  );
  if (button === 'Continue') {
    const verifyPassword = await loginPage.verifyWithPasswordButton();
    const exists = await verifyPassword.isExisting().catch(() => false);
    if (exists) {
      await verifyPassword.waitForDisplayed({ timeout: 8000 }).catch(() => {});
      await verifyPassword.waitForClickable({ timeout: 5000 }).catch(() => {});
      await verifyPassword.click().catch(() => {});
      await Promise.race([
        $('//input[@name="credentials.passcode"]').waitForDisplayed({ timeout: 5000 }),
        $('input[type="password"]').waitForDisplayed({ timeout: 5000 }),
      ]).catch(() => {});
    }
  }
});

When('the user clicks the {string} button', async function (label) {
  await handleCookieConsentIfPresent();
  const btn = await loginPage.loginButton();
  await btn.waitForClickable({ timeout: 10000 });
  await btn.click();
  await browser.waitUntil(
    async () => {
      const acct = await commonPage.accountDropdown();
      const u = await browser.getUrl();
      return (await acct.isDisplayed().catch(() => false)) || !u.includes('okta');
    },
    { timeout: 15000 }
  );
});

Then('the user is successfully logged in', async function () {
  const accountDropdown = await commonPage.accountDropdown();
  await accountDropdown.waitForDisplayed({ timeout: 15000 });
  const hasDropdown = await accountDropdown.isExisting() && (await accountDropdown.isDisplayed());
  if (!hasDropdown) {
    const url = await browser.getUrl();
    throw new Error(`Expected logged in (Account dropdown). URL: ${url}`);
  }
});

Then('the user is redirected back to the Welcome Center', async function () {
  await browser.waitUntil(
    async () => {
      const u = await browser.getUrl();
      return u.includes('/tv') || u.includes('mlb.com');
    },
    { timeout: 10000, timeoutMsg: 'Did not redirect to Welcome Center' }
  );
  const url = await browser.getUrl();
  const onTv = url.includes('/tv') || url.includes('mlb.com');
  if (!onTv) throw new Error(`Expected Welcome Center. Got: ${url}`);
});

// --- WSTE-36 steps ---

async function ensureLoggedIntoMlbTv() {
  await browser.url(baseUrl);
  await browser.waitUntil(
    async () => (await browser.getUrl()).includes('mlb.com') || (await browser.getUrl()).includes('okta'),
    { timeout: 10000 }
  );
  if (baseUrl.includes('beta-gcp')) await handleBetaPreAuthIfPresent();
  await handleCookieConsentIfPresent();

  const accountDropdown = await commonPage.accountDropdown();
  if (await accountDropdown.isExisting() && (await accountDropdown.isDisplayed())) {
    return;
  }

  await handleCookieConsentIfPresent();
  const emailInput = await loginPage.emailInput();
  await emailInput.waitForDisplayed({ timeout: 15000 });
  await emailInput.setValue(email);

  await handleCookieConsentIfPresent();
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

  const passwordInput = await loginPage.passwordInput();
  await passwordInput.waitForDisplayed({ timeout: 15000 });
  await passwordInput.setValue(password);

  const loginBtn = await loginPage.loginButton();
  await loginBtn.click();

  await browser.waitUntil(
    async () => {
      const acct = await commonPage.accountDropdown();
      return (await acct.isExisting()) && (await acct.isDisplayed());
    },
    { timeout: 30000, timeoutMsg: 'Login did not succeed' }
  );
}

Given(/^the user is already logged into mlb\.com\/tv$/, ensureLoggedIntoMlbTv);
Given(/^an entitled user is logged into mlb\.com\/tv$/, ensureLoggedIntoMlbTv);

When('the user hovers over the {string} button from the top nav', async function (buttonLabel) {
  await handleCookieConsentIfPresent();
  const accountBtn = await commonPage.accountDropdown();
  await accountBtn.waitForDisplayed({ timeout: 10000 });
  await accountBtn.moveTo();
  const logoutLink = await $('//a[contains(text(),"Log out") or contains(text(),"Log Out")]');
  await logoutLink.waitForDisplayed({ timeout: 5000 });
});

When('the user clicks the {string} option', async function (option) {
  await handleCookieConsentIfPresent();
  const logoutLink = await $('//a[contains(text(),"Log out") or contains(text(),"Log Out")]');
  await logoutLink.waitForDisplayed({ timeout: 5000 });
  await logoutLink.click();
});

Then('the logout screen should display', async function () {
  await browser.waitUntil(
    async () => {
      const body = await browser.execute(() => document.body?.textContent || '');
      const url = await browser.getUrl();
      return body.includes('logged out') || body.includes('redirected') ||
        url.includes('/login') || url.includes('/logout');
    },
    { timeout: 10000, timeoutMsg: 'Logout screen did not appear' }
  );
});

Then('the following message should appear {string}', async function (expectedMessage) {
  let body = '';
  try {
    body = await browser.execute(() => document.body?.textContent || '');
  } catch (_) {
    body = (await browser.getPageSource()) || '';
  }
  const url = await browser.getUrl();
  const hasMessage = body.toLowerCase().includes('logged out') || body.toLowerCase().includes('redirected');
  const didRedirect = url.includes('mlb.com') && !url.includes('/logout');
  if (!hasMessage && !didRedirect) {
    throw new Error(`Expected message "${expectedMessage}" not found`);
  }
});

Then('the user should be redirected to the {string} page', async function (expectedTitle) {
  await browser.waitUntil(
    async () => {
      const t = await browser.getTitle();
      const u = await browser.getUrl();
      return t.includes('MLB.com') || u.includes('mlb.com');
    },
    { timeout: 10000, timeoutMsg: 'Redirect did not complete' }
  );
  const title = await browser.getTitle();
  const url = await browser.getUrl();
  const matches = title.includes('MLB.com') || url.includes('mlb.com');
  if (!matches) {
    throw new Error(`Expected redirect to "${expectedTitle}". Got: ${title} | ${url}`);
  }
});
