/**
 * Open MLB.TV Media Center game tile → feed modal → video player.
 * Shared by archive playback steps and Hide Spoilers (single game open — no second navigation).
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { baseUrl } = require('../../config/env');
const mediaCenterPageObject = require('../pageobjects/mediaCenter.object');
const playerPage = require('../pageobjects/player.object');
const { getRandomDateFromAprilToSeptemberLast2Years } = require('../../commonFunctions/randomDateSelect');
const {
  fetchEpgSearch,
  pickRandomVideoEnabledGame,
  getTodayApiDate,
  pathToApiDate,
} = require('./epgSearchVideoGame');

function getMediaCenterUrl(dateStr = null) {
  const base = baseUrl.replace(/\/$/, '');
  const pathSeg = '/live-stream-games';
  return dateStr ? `${base}${pathSeg}/${dateStr.replace(/-/g, '/')}` : `${base}${pathSeg}`;
}

function getArchiveGameDate() {
  const d = getRandomDateFromAprilToSeptemberLast2Years();
  const year = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${year}/${mm}/${dd}`;
}

/** Last calendar year, April 15 — stable fallback when today + random dates have no tiles. */
function getHardcodedFallbackScheduleDate() {
  const y = new Date().getFullYear() - 1;
  return `${y}/04/15`;
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

/**
 * Load one schedule URL and collect playable game tiles (with wait/refresh).
 * @returns {Promise<{ pickFrom: WebdriverIO.Element[], gameTiles: WebdriverIO.Element[] } | null>}
 */
async function tryCollectPlayableTilesFromScheduleUrl(url, pageLoadTimeoutMs = 30000) {
  const loadStart = Date.now();
  let tiles = [];
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
    await new Promise((r) => setTimeout(r, 5000));

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

  if (!tilesFound || !tiles.length) {
    return null;
  }

  const bodyText = await browser.$('body').getText().catch(() => '');
  if (isNoGamesError(bodyText)) {
    return null;
  }
  const noGamesEl = await mediaCenterPageObject['No Games Message']();
  if (await noGamesEl.isDisplayed().catch(() => false)) {
    return null;
  }

  const gameTiles = [];
  for (const tile of tiles || []) {
    const href = await tile.getAttribute('href').catch(() => '');
    if (href && (href.includes('/tv/g/') || (href.includes('/g') && /\d{4}/.test(href))) && !href.includes('mlbn')) {
      gameTiles.push(tile);
    }
  }
  if (gameTiles.length === 0) {
    return null;
  }
  return { pickFrom: gameTiles, gameTiles };
}

/** Prefer “Video” tab in feed modal when tabs exist (vs Audio / other). */
async function trySelectVideoTypeTabInFeedModal() {
  const clicked = await browser.execute(() => {
    const dialog =
      document.querySelector('[role="dialog"]') ||
      document.querySelector('[class*="FeedSelect" i]') ||
      document.querySelector('[data-testid*="feed" i]');
    if (!dialog) return false;
    const nodes = dialog.querySelectorAll('[role="tab"], button, a[role="button"], a');
    for (const node of nodes) {
      const t = (node.textContent || '').replace(/\s+/g, ' ').trim();
      if (/^video$/i.test(t) || /^video\s/i.test(t)) {
        node.click();
        return true;
      }
    }
    return false;
  });
  if (clicked) await new Promise((r) => setTimeout(r, 400));
  return clicked;
}

/** Click the TV feed row/button that shows this station callsign (EPG `callLetters`). */
async function tryClickCallsignInFeedModal(callLetters) {
  if (!callLetters || typeof callLetters !== 'string') return false;
  return browser.execute((letters) => {
    const L = letters.trim();
    if (!L) return false;
    const dialog =
      document.querySelector('[role="dialog"]') ||
      document.querySelector('[class*="FeedSelect" i]') ||
      document.querySelector('[data-testid*="feed" i]');
    if (!dialog) return false;
    const candidates = dialog.querySelectorAll(
      'button, a, [role="button"], [role="radio"], [role="option"], tr, li, div[tabindex="0"]'
    );
    for (const el of candidates) {
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (text.includes(L)) {
        el.click();
        return true;
      }
    }
    return false;
  }, callLetters);
}

async function findGameTileByGamePk(gamePk) {
  const pk = String(gamePk);
  const narrow = [
    `a[href*="/tv/g/${pk}"]`,
    `a[href*="/tv/g/${pk}/"]`,
    `main a[href*="/tv/g/${pk}"]`,
  ];
  for (const sel of narrow) {
    const els = await $$(sel);
    for (const el of els) {
      if (await el.isDisplayed().catch(() => false)) return el;
    }
    if (els.length) return els[0];
  }
  const links = await $$('main a[href*="/tv/g"], a[href*="/tv/g"]');
  for (const el of links) {
    const href = await el.getAttribute('href').catch(() => '');
    if (href && (href.includes(`/tv/g/${pk}`) || (href.includes(pk) && href.includes('/tv/')))) {
      if (await el.isDisplayed().catch(() => false)) return el;
    }
  }
  return null;
}

/**
 * Open a specific game from EPG (gamePk + video callLetters): tile → Video tab → callsign → Watch/Full Game fallback.
 * @param {WebdriverIO.Element} tile
 * @param {{ callLetters: string }} pick
 */
async function startPlaybackFromEpgPick(tile, pick) {
  await tile.scrollIntoView().catch(() => {});
  await tile.waitForClickable({ timeout: 10000 }).catch(() => {});
  await tile.click();

  await new Promise((r) => setTimeout(r, 1500));
  const feedModal = await mediaCenterPageObject['Feed Select Modal']();
  const modalShown =
    (await feedModal.isExisting().catch(() => false)) &&
    (await feedModal.isDisplayed().catch(() => false));

  if (modalShown) {
    await trySelectVideoTypeTabInFeedModal();
    await tryClickCallsignInFeedModal(pick.callLetters);

    const fullGame = await mediaCenterPageObject['Full Game Feed Button']();
    const condensed = await mediaCenterPageObject['Condensed Feed Button']();
    const watchBtn = await mediaCenterPageObject['Watch Button']();
    if (await fullGame.isExisting().catch(() => false) && (await fullGame.isDisplayed().catch(() => false))) {
      await fullGame.waitForClickable({ timeout: 5000 }).catch(() => {});
      await fullGame.click();
    } else if (await condensed.isExisting().catch(() => false) && (await condensed.isDisplayed().catch(() => false))) {
      await condensed.waitForClickable({ timeout: 5000 }).catch(() => {});
      await condensed.click();
    }
    if (await watchBtn.isExisting().catch(() => false) && (await watchBtn.isDisplayed().catch(() => false))) {
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
      const hasDuration = await browser
        .execute(() => {
          const v =
            document.querySelector('video') || document.querySelector('iframe')?.contentDocument?.querySelector('video');
          return v && (v.duration > 0 || (!isNaN(v.duration) && v.duration >= 0) || v.readyState >= 2);
        })
        .catch(() => false);
      if (hasDuration) return true;
      const videoReady = await videoPlayer.isDisplayed().catch(() => false);
      return videoReady;
    },
    { timeout: 60000, interval: 2000, timeoutMsg: 'Player page did not load within 60s' }
  ).catch(() => {});
}

/** Click a random tile, feed modal, wait for video (stay on this game). */
async function startPlaybackFromPick(pickFrom) {
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
    if (await fullGame.isExisting().catch(() => false) && (await fullGame.isDisplayed().catch(() => false))) {
      await fullGame.waitForClickable({ timeout: 5000 }).catch(() => {});
      await fullGame.click();
    } else if (await condensed.isExisting().catch(() => false) && (await condensed.isDisplayed().catch(() => false))) {
      await condensed.waitForClickable({ timeout: 5000 }).catch(() => {});
      await condensed.click();
    }
    if (await watchBtn.isExisting().catch(() => false) && (await watchBtn.isDisplayed().catch(() => false))) {
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
  ).catch(() => {});
}

/**
 * WSTE-40 flow: try **today’s** schedule, then **random in-season** dates, then **last year April 15**.
 * Opens **one** game only — use before Hide Spoilers toggle in the same player session.
 */
async function openGamePlaybackWithScheduleFallbacks() {
  await handleCookieConsentIfPresent();

  /** 1) EPG v3 search: games with non-empty videoFeeds → gamePk + callLetters → open that tile (Video + callsign). */
  const apiDatesRaw = [getTodayApiDate()];
  for (let i = 0; i < 8; i++) {
    const p = getArchiveGameDate();
    const api = pathToApiDate(p);
    if (api) apiDatesRaw.push(api);
  }
  const fbApi = pathToApiDate(getHardcodedFallbackScheduleDate());
  if (fbApi) apiDatesRaw.push(fbApi);
  const apiDates = [...new Set(apiDatesRaw)];

  let epgLastError = null;
  for (const apiDate of apiDates) {
    try {
      const results = await fetchEpgSearch(apiDate);
      const pick = pickRandomVideoEnabledGame(results);
      if (!pick) {
        epgLastError = new Error(`EPG: no video-enabled game for ${apiDate}`);
        continue;
      }
      const scheduleUrl = getMediaCenterUrl(pick.schedulePath);
      const res = await tryCollectPlayableTilesFromScheduleUrl(scheduleUrl);
      if (!res || !res.gameTiles.length) {
        epgLastError = new Error(`No tiles on Media Center for EPG date ${pick.schedulePath}`);
        continue;
      }
      const tile = await findGameTileByGamePk(pick.gamePk);
      if (!tile) {
        epgLastError = new Error(`Media Center: no tile for gamePk ${pick.gamePk} on ${pick.schedulePath}`);
        continue;
      }
      await startPlaybackFromEpgPick(tile, pick);
      return;
    } catch (e) {
      epgLastError = e;
      if (isNoGamesError(e?.message || String(e))) continue;
      /* Network / EPG errors: try next date */
      continue;
    }
  }

  /** 2) Legacy: schedule URLs only (random tile) if EPG path did not succeed. */
  const urls = [getMediaCenterUrl()];
  for (let i = 0; i < 8; i++) {
    urls.push(getMediaCenterUrl(getArchiveGameDate()));
  }
  urls.push(getMediaCenterUrl(getHardcodedFallbackScheduleDate()));

  let lastError = epgLastError;
  for (let i = 0; i < urls.length; i++) {
    try {
      const res = await tryCollectPlayableTilesFromScheduleUrl(urls[i]);
      if (res && res.gameTiles.length > 0) {
        await startPlaybackFromPick(res.pickFrom);
        return;
      }
      lastError = new Error(`No playable tiles for schedule URL index ${i + 1}/${urls.length}`);
    } catch (e) {
      lastError = e;
      if (isNoGamesError(e?.message || String(e))) continue;
      throw e;
    }
  }

  throw lastError || new Error(
    'No playable game from live stream: EPG + tried today, random in-season dates, and fallback ' +
      getHardcodedFallbackScheduleDate()
  );
}

/**
 * @param {{ preferTodayLiveFirst?: boolean }} opts
 */
async function openGamePlaybackFromMediaCenter(opts = {}) {
  const { preferTodayLiveFirst = false } = opts;
  await handleCookieConsentIfPresent();
  const maxAttempts = 10;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const useToday = preferTodayLiveFirst && attempt === 1;
      const dateStr = useToday ? null : getArchiveGameDate();
      const url = useToday ? getMediaCenterUrl() : getMediaCenterUrl(dateStr);

      const res = await tryCollectPlayableTilesFromScheduleUrl(url);
      if (res && res.gameTiles.length > 0) {
        await startPlaybackFromPick(res.pickFrom);
        return;
      }
      lastError = new Error(`No playable tiles (attempt ${attempt}/${maxAttempts})`);
    } catch (e) {
      lastError = e;
      if (isNoGamesError(e?.message || String(e)) && attempt < maxAttempts) continue;
      throw e;
    }
  }

  throw lastError || new Error('No game tiles found on Media Center after 10 date attempts');
}

module.exports = {
  openGamePlaybackFromMediaCenter,
  openGamePlaybackWithScheduleFallbacks,
  getMediaCenterUrl,
  handleCookieConsentIfPresent,
  findGameTileByGamePk,
  startPlaybackFromEpgPick,
};
