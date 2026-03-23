# WebTV domain context (for automation & Cursor)

This file is indexed by Cursor like normal repo docs. The same concepts are **seeded into project RAG** in `rag/domain-knowledge.json` (merged into search with `.rag-memory.json`; not wiped by **RAG refresh**).

## Hide Spoilers (`HideSpoilers`)

**What it is:** A logged-in **MLB.TV / mlb.com/tv** user preference that controls whether **spoiler-sensitive game information** is shown (final score, inning, balls/strikes, bases, pitcher/batter on tiles, Hero, and related archive/live UI).

| State | Typical product behavior |
|--------|---------------------------|
| **ON** | Hides spoiler data on game tiles and during playback contexts that depend on this flag; archive scenarios often expect data **revealed inning-by-inning** as the user watches. |
| **OFF** | Scores, inning markers, and scrubber-related spoiler data behave as usual (see your scenario’s expected results). |

**Not the same as:** A “filter” inside Media Center only — the flag is tied to the **user session**; for automation you often set it via the **player** path below.

### Gherkin in this repo

**WSTE-40 (single game — no second navigation):** open schedule once, toggle Hide Spoilers **in that same player**, then assert.

```gherkin
Given an entitled user is logged in
When the user opens a playable game from the live stream schedule using today, random in-season dates, and last year April 15 as fallback
And the users "HideSpoilers" setting are set to ON
```

Schedule fallbacks: **today’s** `/live-stream-games`, then **8 random** April–September dates (last 2 years), then **`{lastYear}/04/15`**. Implementation: `openGamePlaybackWithScheduleFallbacks()` in `features/helpers/mediaCenterOpenGame.js`.

**EPG-first (video feeds):** Before random tiles, the flow calls **MLB EPG v3 search** (`features/helpers/epgSearchVideoGame.js`) with `date=YYYY-MM-DD`, `exp=MLB`, `language=en`, `timeZone=America/New_York` (same shape as [`mastapi.../api/epg/v3/search`](https://mastapi.mobile.mlbinfra.com/api/epg/v3/search)). It picks a game with **non-empty `videoFeeds`**, **`entitledVideo`**, and a playable **`mediaState`** (`MEDIA_ARCHIVE` / `MEDIA_ON`), reads **`gamePk`** and **`callLetters`**, opens that day’s Media Center URL, clicks the **tile for `gamePk`**, then in the feed modal prefers a **Video** tab (if present) and clicks the **callsign** matching `callLetters`, with **Full Game / Watch** as fallback. Override base URL with **`MLB_EPG_SEARCH_URL`** if needed.

Hide Spoilers step uses **`skipOpenGame: true`** — it must run **after** the When step above. Use a matching step for **OFF** when needed.

### Canonical UI flow to turn Hide Spoilers ON or OFF (for automation)

This is the **intended manual/automation path** on WebTV web — **always capture real selectors** from your environment; do not invent CSS.

1. **Log in** as an entitled user (reuse existing login steps / page objects).
2. Go to where **live games / live stream** content appears (Hero, games row, schedule, etc.).
3. **Select a live game** and **start playback** so the **video player** is running.
4. In the **player**, open **Settings** (typically a **gear** or “Settings” control in the player UI / overflow).
5. Use the **Hide spoilers** (or similarly labeled) **toggle** to turn it **ON** or **OFF** per the scenario.

After you confirm this path in QA/BETA:

- Add locators to **`features/pageobjects/*.object.js`** (live tile, start/watch, player settings entry, toggle).
- Use **`waitForDisplayed` / `waitForClickable`** between steps; avoid `browser.pause()`.
- Implement **`ensureHideSpoilersOn()`** / **`ensureHideSpoilersOff()`** that checks `aria-checked` or visible state before toggling.
- On failure, use **`reports/failure-dom.json`** and screenshots to refine selectors (see self-heal / WDIO hooks in this repo).

A separate **global account → Settings** path may also exist; use whichever matches how your team sets the flag for **live + archive** tests, but the **live game → player → Settings → toggle** flow above is the primary documented path for this platform.

### Line score / game cards when Hide Spoilers is **ON** (verification)

During **archive** (and similar) playback, MLB.TV often shows a **horizontal strip of game status cards** next to or above the player. With **Hide Spoilers ON**, that UI must **not** show spoiler **numeric** game state:

| Should **not** appear (examples) | Notes |
|----------------------------------|--------|
| **Inning + number** | e.g. `Top 1`, `Bot 5`, `Bottom 5` — reveals how far the game has progressed. |
| **Run scores on cards** | e.g. `0-0`, `0-1` next to teams — reveals the score. |
| **Final score** | Any definitive final margin while spoilers are on. |

**May still appear:** team abbreviations / logos, neutral copy like **“Viewing”**, placeholders, or non-numeric affordances — product varies by build.

**Manual / automation flow for** `And all available data is hidden from the user (this includes innings and final score)`:

1. Ensure **Hide Spoilers ON** and **archive playback** is active (after your scenario’s Given/When steps).
2. **Keep playback moving**: play the stream and **seek forward** (e.g. tens of seconds) so the line score region renders/updates — hidden state must remain while time advances.
3. Inspect **only** line-score-like containers (not the scrubber clock `1:23:45`).
4. Confirm no **Top/Bot + inning digit** patterns and no **card score pairs** like `0-1` in that region.

**Code in this repo:** `features/helpers/hideSpoilersLineScoreAssertions.js` (`assertSpoilerLineScoreDataHidden`), `player.object.js` → `lineScoreStrip` / `inningsScores`. Tune selectors and regexes from **DevTools** or **`reports/failure-dom.json`** if your build differs.

**Contrast — “revealed inning by inning”:** With Hide Spoilers ON, later steps may expect **progressive** disclosure (more inning/score data becomes visible only as the viewer reaches those points in the VOD). That is a **separate** assertion from “everything hidden” at a given moment.

### Extending context

- Add more objects to **`rag/domain-knowledge.json`** (rich `text` + `fix.guidance` for `kind: "domain"`).
- Keep this doc aligned so Cursor and RAG stay consistent.
