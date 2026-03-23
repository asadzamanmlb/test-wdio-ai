/**
 * MLB EPG v3 search — pick a game with videoFeeds (entitled video) for Media Center automation.
 * API: https://mastapi.mobile.mlbinfra.com/api/epg/v3/search?date=YYYY-MM-DD&exp=MLB&language=en&timeZone=America%2FNew_York
 */
const EPG_SEARCH_URL =
  process.env.MLB_EPG_SEARCH_URL || 'https://mastapi.mobile.mlbinfra.com/api/epg/v3/search';

const FETCH_TIMEOUT_MS = 20000;

/**
 * @param {string} dateYyyyMmDd e.g. 2026-03-22
 * @returns {Promise<object[]>} EPG `results` array
 */
async function fetchEpgSearch(dateYyyyMmDd) {
  const params = new URLSearchParams({
    date: dateYyyyMmDd,
    exp: 'MLB',
    language: 'en',
    timeZone: 'America/New_York',
  });
  const url = `${EPG_SEARCH_URL}?${params.toString()}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`EPG search HTTP ${res.status} for ${dateYyyyMmDd}`);
  }
  const data = await res.json();
  return Array.isArray(data.results) ? data.results : [];
}

/**
 * True if feed is a normal playable TV feed (archive or live).
 * @param {{ mediaState?: string }} feed
 */
function isPlayableVideoFeedState(feed) {
  const state = feed?.mediaState || '';
  if (!state) return true;
  return state === 'MEDIA_ARCHIVE' || state === 'MEDIA_ON';
}

/**
 * Build list of { gamePk, callLetters, schedulePath, awayAbbr, homeAbbr } from EPG results.
 * @param {object[]} results
 * @returns {Array<{ gamePk: string, callLetters: string, schedulePath: string, awayAbbr: string, homeAbbr: string }>}
 */
function listVideoEnabledGames(results) {
  const eligible = [];
  if (!Array.isArray(results)) return eligible;

  for (const game of results) {
    if (!game || game.entitledVideo !== true || game.blackedOutVideo === true) continue;
    const feeds = game.videoFeeds;
    if (!Array.isArray(feeds) || feeds.length === 0) continue;

    const gd = game.gameData || {};
    const gamePk = String(game.gamePk ?? gd.gamePk ?? '');
    const gameDate = gd.gameDate;
    if (!gamePk || !gameDate || typeof gameDate !== 'string') continue;

    const ymd = gameDate.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) continue;
    const schedulePath = ymd.replace(/-/g, '/');

    for (const feed of feeds) {
      if (!feed || feed.entitled === false) continue;
      if (!(feed.contentId || feed.mediaId)) continue;
      if (!isPlayableVideoFeedState(feed)) continue;
      const callLetters = (feed.callLetters || '').trim();
      if (!callLetters) continue;

      eligible.push({
        gamePk,
        callLetters,
        schedulePath,
        awayAbbr: gd.away?.teamAbbrv || '',
        homeAbbr: gd.home?.teamAbbrv || '',
      });
    }
  }
  return eligible;
}

/**
 * @param {object[]} results
 * @returns {{ gamePk: string, callLetters: string, schedulePath: string, awayAbbr: string, homeAbbr: string } | null}
 */
function pickRandomVideoEnabledGame(results) {
  const list = listVideoEnabledGames(results);
  if (!list.length) return null;
  return list[Math.floor(Math.random() * list.length)];
}

/** America/New_York calendar date YYYY-MM-DD */
function getTodayApiDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function pathToApiDate(schedulePath) {
  const parts = String(schedulePath).split('/');
  if (parts.length !== 3) return null;
  const [y, m, d] = parts;
  return `${y}-${m}-${d}`;
}

module.exports = {
  fetchEpgSearch,
  listVideoEnabledGames,
  pickRandomVideoEnabledGame,
  getTodayApiDate,
  pathToApiDate,
  EPG_SEARCH_URL,
};
