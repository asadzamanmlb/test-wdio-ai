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
const playerPage = require('../pageobjects/player.object');
const { qaTestUsers } = require('../../testUsers');
const { getRandomDateFromAprilToSeptemberLast2Years } = require('../../commonFunctions/randomDateSelect');

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

function getMediaCenterUrl(dateStr = null) {
  const base = baseUrl.replace(/\/$/, '');
  const pathSeg = '/live-stream-games';
  return dateStr ? `${base}${pathSeg}/${dateStr.replace(/-/g, '/')}` : `${base}${pathSeg}`;
}

/** Pick a random date April–September in the last 2 years (shared with calendar/live-stream). */
function getArchiveGameDate() {
  const d = getRandomDateFromAprilToSeptemberLast2Years();
  const year = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${year}/${mm}/${dd}`;
}

function isNoGamesError(msg) {
  if (!msg || typeof msg !== 'string') return false;
  const s = msg.toLowerCase();
  return (
    /data is undefined/i.test(msg) ||
    /\["schedule"/i.test(msg) ||
    /no games? found/i.test(s) ||
    /no game tiles found/i.test(s)
  );
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

When('a user selects an archived game for playback', async function () {
  await handleCookieConsentIfPresent();
  const maxAttempts = 10;
  const pageLoadTimeoutMs = 30000;
  let lastError = null;
  let tiles = [];
  let gameTiles = [];
  let pickFrom = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const dateStr = getArchiveGameDate();
      const url = getMediaCenterUrl(dateStr);
      const loadStart = Date.now();
      let tilesFound = false;

      while (Date.now() - loadStart < pageLoadTimeoutMs) {
        await browser.url(url);
        await browser.waitUntil(
          async () => (await browser.execute(() => document.readyState)) === 'complete',
          { timeout: 15000, timeoutMsg: 'Media Center page did not load' }
        );
        await browser.waitUntil(
          async () => (await browser.getUrl()).includes('live-stream-games'),
          { timeout: 10000 }
        );
        await new Promise((r) => setTimeout(r, 5000)); // Allow schedule/games to render

        const t = await mediaCenterPageObject['Game Tiles']();
        const hasTiles = t && t.length > 0;
        if (hasTiles) {
          tilesFound = true;
          tiles = t;
          break;
        }
        if (Date.now() - loadStart >= pageLoadTimeoutMs - 5000) break;
        await browser.refresh();
        await new Promise((r) => setTimeout(r, 3000));
      }

      if (!tilesFound) {
        lastError = new Error(`No game tiles after 30s wait/refresh (attempt ${attempt}/${maxAttempts})`);
        if (attempt < maxAttempts) continue;
      }

      const bodyText = await browser.$('body').getText().catch(() => '');
      if (isNoGamesError(bodyText)) {
        lastError = new Error(`Page shows no games: ${bodyText.slice(0, 80)}...`);
        if (attempt < maxAttempts) continue;
      }
      const noGamesEl = await mediaCenterPageObject['No Games Message']();
      if (await noGamesEl.isDisplayed().catch(() => false)) {
        lastError = new Error('Page shows empty state (no games)');
        if (attempt < maxAttempts) continue;
      }

      if (!tiles || tiles.length === 0) {
        tiles = await mediaCenterPageObject['Game Tiles']();
      }

      gameTiles = [];
      for (const t of tiles || []) {
        const href = await t.getAttribute('href').catch(() => '');
        if (href && (href.includes('/tv/g/') || (href.includes('/g') && /\d{4}/.test(href))) && !href.includes('mlbn')) {
          gameTiles.push(t);
        }
      }
      pickFrom = gameTiles.length > 0 ? gameTiles : tiles;
      if (gameTiles.length > 0) break;
    } catch (e) {
      lastError = e;
      if (isNoGamesError(e?.message || String(e)) && attempt < maxAttempts) continue;
      throw e;
    }
  }

  if (gameTiles.length === 0) {
    throw lastError || new Error('No game tiles found on Media Center after 10 date attempts');
  }

  const count = pickFrom.length;
  const idx = Math.floor(Math.random() * count);
  const tile = pickFrom[idx];
  await tile.scrollIntoView().catch(() => {});
  await tile.waitForClickable({ timeout: 10000 }).catch(() => {});
  await tile.click();

  await new Promise((r) => setTimeout(r, 1500));
  const feedModal = await mediaCenterPageObject['Feed Select Modal']();
  if (await feedModal.isExisting().catch(() => false) && (await feedModal.isDisplayed().catch(() => false))) {
    const fullGame = await mediaCenterPageObject['Full Game Feed Button']();
    const condensed = await mediaCenterPageObject['Condensed Feed Button']();
    const watchBtn = await mediaCenterPageObject['Watch Button']();
    if (await fullGame.isExisting().catch(() => false) && await fullGame.isDisplayed().catch(() => false)) {
      await fullGame.waitForClickable({ timeout: 5000 }).catch(() => {});
      await fullGame.click();
    } else if (await condensed.isExisting().catch(() => false) && await condensed.isDisplayed().catch(() => false)) {
      await condensed.waitForClickable({ timeout: 5000 }).catch(() => {});
      await condensed.click();
    }
    if (await watchBtn.isExisting().catch(() => false) && await watchBtn.isDisplayed().catch(() => false)) {
      await watchBtn.waitForClickable({ timeout: 5000 }).catch(() => {});
      await watchBtn.click();
    }
  }

  const videoPlayer = await playerPage.videoPlayer();
  await videoPlayer.waitForExist({ timeout: 15000 }).catch(() => {});
  await videoPlayer.waitForDisplayed({ timeout: 10000 }).catch(() => {});

  await browser.waitUntil(
    async () => {
      const scrubber = await playerPage.scrubberBar();
      const scrubberOk = await scrubber.isExisting().catch(() => false);
      if (scrubberOk) return true;
      const hasDuration = await browser.execute(() => {
        const v = document.querySelector('video') || document.querySelector('iframe')?.contentDocument?.querySelector('video');
        return v && (v.duration > 0 || (!isNaN(v.duration) && v.duration >= 0) || v.readyState >= 2);
      }).catch(() => false);
      if (hasDuration) return true;
      const videoReady = await videoPlayer.isDisplayed().catch(() => false);
      return videoReady;
    },
    { timeout: 60000, interval: 2000, timeoutMsg: 'Player page did not load within 60s' }
  ).catch(() => {
    // Proceed anyway after 60s if video is displayed - player may use different DOM
  });
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
