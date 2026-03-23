/**
 * Assertions: with Hide Spoilers ON, line score / game cards must not show inning + score numerics.
 * See docs/webtv-domain-context.md (screenshot: horizontal game cards, Bot 5, 0-1, etc.).
 */
const playerPage = require('../pageobjects/player.object');
const {
  flashAssertionHighlight,
  HIGHLIGHT_ASSERTIONS_ENABLED,
  HIGHLIGHT_ASSERTION_MS,
} = require('../support/highlight');

/** Inning position with a number (e.g. Top 1, Bot 5) — should not appear when spoilers hidden. */
const INNING_WITH_NUMBER_RE = /\b(?:Top|Bot|Bottom|Mid)\s+\d{1,2}\b/i;
/**
 * Compact score pair like 0-0, 0-1 on game cards (not timecodes with colons).
 * Applied only to text from line-score-like nodes to reduce false positives.
 */
const CARD_SCORE_PAIR_RE = /(?:^|\s)\d{1,2}\s*[-–]\s*\d{1,2}(?:\s|$)/;

/**
 * Advance archive playback so line score / inning UI can render, then surface player chrome.
 */
async function advancePlaybackForLineScoreUi() {
  const video = await playerPage.videoPlayer();
  await video.waitForExist({ timeout: 20000 });

  await browser.waitUntil(
    async () => {
      const ok = await browser.execute(() => {
        const v = document.querySelector('video');
        if (!v) return false;
        v.play?.().catch(() => {});
        const d = v.duration;
        if (d && isFinite(d) && d > 30) {
          const jump = Math.min(90, Math.max(30, d * 0.05));
          const target = Math.min(v.currentTime + jump, d - 15);
          if (target > v.currentTime) v.currentTime = target;
        } else if (v.currentTime < 8) {
          v.currentTime = Math.min(v.currentTime + 45, 120);
        }
        return v.currentTime >= 3;
      });
      return ok === true;
    },
    { timeout: 20000, interval: 500, timeoutMsg: 'Video did not become seekable for line score check' }
  );

  await video.click().catch(() => {});
  await video.moveTo?.().catch(() => {});

  await browser.waitUntil(
    async () => {
      const line = await playerPage.lineScoreStrip();
      if (await line.isExisting().catch(() => false) && (await line.isDisplayed().catch(() => false))) {
        return true;
      }
      const generic = await playerPage.inningsScores();
      return (await generic.isExisting().catch(() => false)) && (await generic.isDisplayed().catch(() => false));
    },
    { timeout: 12000, interval: 400 }
  ).catch(() => {});
}

/**
 * Collect visible text from line-score / game-card regions (excludes scrubber/slider).
 * @returns {Promise<{ combined: string, snippets: string[] }>}
 */
async function collectLineScoreVisibleText() {
  const result = await browser.execute(() => {
    const scrubberSel = '[class*="scrubber" i], [class*="progress" i], [class*="seek" i], [role="slider"], [class*="duration" i]';
    /** Media Center calendar / date UI matches broad "scoreboard"-like classes — exclude from spoiler text. */
    const excludeSel =
      '[class*="calendar" i], [class*="date-picker" i], [class*="DatePicker" i], [class*="DateSelect" i], ' +
      '[class*="month-grid" i], [class*="day-picker" i], [class*="schedule-date" i], [aria-label*="calendar" i]';
    /** Omit generic `*scoreboard*` — Media Center calendar often lives under similarly named wrappers. */
    const rootsSel = [
      '[class*="LineScore" i]',
      '[class*="line-score" i]',
      '[class*="lineScore" i]',
      '[data-testid*="line-score" i]',
      '[data-testid*="LineScore" i]',
      '[data-testid*="lineScore" i]',
      '[class*="game-card" i]',
      '[class*="GameCard" i]',
      '[class*="inning-strip" i]',
    ].join(',');

    const snippets = [];
    const seen = new Set();

    try {
      document.querySelectorAll(rootsSel).forEach((el) => {
        if (!el || el.closest(scrubberSel)) return;
        if (el.closest(excludeSel)) return;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) return;
        const t = (el.innerText || '').trim();
        if (!t || t.length > 4000) return;
        const key = t.slice(0, 200);
        if (seen.has(key)) return;
        seen.add(key);
        snippets.push(t);
      });
    } catch (_) {}

    return { snippets, combined: snippets.join('\n---\n') };
  });

  return {
    combined: result?.combined || '',
    snippets: Array.isArray(result?.snippets) ? result.snippets : [],
  };
}

/** Avoid false positives: "Top 9" from calendar (year row + months + day grid). */
function snippetLooksLikeCalendarOrDateNav(s) {
  const x = (s || '').slice(0, 4000);
  const yearHits = (x.match(/\b20\d{2}\b/g) || []).length;
  if (yearHits >= 4) return true;
  if (
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/i.test(x) &&
    (/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/i.test(x) || /Sun\s+Mon\s+Tue\s+Wed/i.test(x))
  ) {
    return true;
  }
  return false;
}

function findSpoilerViolations(combined, snippets) {
  const violations = [];
  const gameSnippets = (snippets || []).filter((s) => !snippetLooksLikeCalendarOrDateNav(s));
  const gameCombined = gameSnippets.join('\n---\n');

  if (gameCombined.trim() && INNING_WITH_NUMBER_RE.test(gameCombined)) {
    const m = gameCombined.match(INNING_WITH_NUMBER_RE);
    violations.push(`Inning + number visible (e.g. "${m ? m[0] : ''}") — not allowed with Hide Spoilers ON`);
  }

  for (const s of gameSnippets) {
    if (CARD_SCORE_PAIR_RE.test(s) && !/^\d{1,2}:\d{2}/.test(s.trim())) {
      const m = s.match(CARD_SCORE_PAIR_RE);
      violations.push(`Score-like pair visible in line score area: "${m ? m[0].trim() : s.slice(0, 40)}"`);
      break;
    }
  }

  return violations;
}

/**
 * After Hide Spoilers ON + archive playback: play/seek and assert no inning/score numerics in line score strip.
 */
async function assertSpoilerLineScoreDataHidden() {
  await advancePlaybackForLineScoreUi();

  if (HIGHLIGHT_ASSERTIONS_ENABLED) {
    const line = await playerPage.lineScoreStrip();
    if ((await line.isExisting().catch(() => false)) && (await line.isDisplayed().catch(() => false))) {
      await flashAssertionHighlight(line, {
        durationMs: Math.min(2200, Math.max(HIGHLIGHT_ASSERTION_MS, 800)),
        scroll: true,
      });
    } else {
      const generic = await playerPage.inningsScores();
      if ((await generic.isExisting().catch(() => false)) && (await generic.isDisplayed().catch(() => false))) {
        await flashAssertionHighlight(generic, {
          durationMs: Math.min(2200, Math.max(HIGHLIGHT_ASSERTION_MS, 800)),
          scroll: true,
        });
      }
    }
  }

  const { combined, snippets } = await collectLineScoreVisibleText();

  if (!combined.trim()) {
    return;
  }

  const violations = findSpoilerViolations(combined, snippets);
  if (violations.length > 0) {
    throw new Error(
      `Hide Spoilers ON but spoiler numerics detected in line score / game cards: ${violations.join(' | ')}. ` +
        `Refine selectors in player.object.js (lineScoreStrip) or patterns in hideSpoilersLineScoreAssertions.js using failure-dom. ` +
        `Snippet: ${combined.slice(0, 280).replace(/\s+/g, ' ')}`
    );
  }
}

module.exports = {
  assertSpoilerLineScoreDataHidden,
  advancePlaybackForLineScoreUi,
  collectLineScoreVisibleText,
};
