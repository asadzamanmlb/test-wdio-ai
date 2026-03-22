/**
 * Media Center Page Object - from webTv-temp patterns
 * Locators for live-stream-games page, date container, calendar
 */
module.exports = {
  // Media Center container and schedule
  'Media Center Container': () => $('[id="media-center-app"], [class*="media-center"], [class*="MediaCenter"], main'),
  'Schedule Section': () => $('//div[contains(@class, "Schedule") or contains(@class, "schedule")]'),
  'MLB Stream Schedule': () => $('//*[contains(text(), "MLB Stream Schedule") or contains(text(), "Stream Schedule") or contains(., "Stream Schedule")]'),

  // Date selection: calendar dropdown and arrow navigation
  'Date Container': () => $('button[aria-label*="date"], button[aria-label*="Date"], [data-testid*="date-display"], [data-testid*="dateDisplay"], [class*="date-picker"], [class*="DatePicker"], [class*="date-select"], [class*="DateSelect"]'),
  'Calendar Dropdown': () => $('button[aria-label*="date"], button[aria-label*="Date"], [data-testid*="date"], [class*="date-picker"], [class*="DatePicker"]'),
  'Date Left Arrow': () => $('//a[contains(.,"Previous Day") or contains(.,"previous day")] | //button[contains(@aria-label,"revious") or contains(@aria-label,"eft")] | //*[contains(@class,"arrow-left") or contains(@class,"chevron-left")]'),
  'Date Right Arrow': () => $('//a[contains(.,"Next Day") or contains(.,"next day")] | //button[contains(@aria-label,"ext") or contains(@aria-label,"ight")] | //*[contains(@class,"arrow-right") or contains(@class,"chevron-right")]'),

  // Game tiles (archive games on Media Center)
  // Prioritize game-specific links (exclude header nav like MLB Network)
  // Scope to main/schedule when possible; fallbacks for MLB.TV web + core-app (gameTileGrid)
  'Game Tiles': () => $$(
    'main a[href*="/tv/g"], main [class*="ScheduleGame"] a, main [class*="ScheduleGame"], ' +
    'a[href*="/tv/g"], [class*="ScheduleGame"] a, [data-testid="gameTileGrid"] button, [data-testid*="game-card"] a, [data-testid*="gameCard"] a, ' +
    'a[href*="/g"][href*="20"]:not([data-testid="header-subnav-item"]), a[href*="/watch/"][href*="/20"]:not([data-testid="header-subnav-item"])'
  ),
  'First Game Tile': () => $('main a[href*="/tv/g"], main [class*="ScheduleGame"] a, a[href*="/tv/g"], [data-testid="gameTileGrid"] button, [class*="ScheduleGame"] a'),
  'No Games Message': () => $('[data-testid="gamesPageNoGames"], [class*="no-games"], [class*="noGames"], [class*="empty-state"]'),

  // Feed Select modal (after clicking a game tile) - exclude cookie/privacy dialogs
  'Feed Select Modal': () => $('[data-testid*="feed"], [class*="FeedSelect"], [class*="feed-select"], [role="dialog"]:not([aria-label*="Privacy"]):not([aria-label*="Cookie"])'),
  'Full Game Feed Button': () => $('//button[contains(., "Full Game") or contains(., "Video") or contains(., "Home") or contains(., "Away")] | //*[contains(text(), "Full Game") or contains(text(), "Video")]//ancestor::button | //a[contains(., "Full Game") or contains(., "Watch")]'),
  'Watch Button': () => $('//button[contains(., "Watch")] | //a[contains(., "Watch")] | //*[contains(@class, "Watch") or contains(@data-testid, "watch")]'),
  'Condensed Feed Button': () => $('//button[contains(., "Condensed")] | //*[contains(text(), "Condensed")]//ancestor::button | //a[contains(., "Condensed")]'),

  // Schedule table: VIDEO callsign only (MLB.TV column - TV icon). Excludes MLB Audio (headphone).
  // Use when selecting a feed from the schedule table to ensure video, not audio.
  'MLB.TV Column Header': () => $('//th[contains(., "MLB.TV") or contains(., "MLB TV")]'),
  // Video callsign link in MLB.TV column for a row. Column order: Time, Game, MLB.TV (3), MLB Audio (4).
  'Video Callsign in Row': (rowText) =>
    $(
      `(//table[.//th[contains(., "MLB.TV")]]//tr[contains(., "${rowText || ''}")]//td)[3]//a | ` +
        `//tr[contains(., "${rowText || ''}")]//td[3]//a[contains(@href,"/tv/g") or contains(@href,"/watch/")] | ` +
        `//tr[contains(., "${rowText || ''}")]//td[not(contains(., "MLB Audio")) and not(.//*[contains(@class,"headphone") or contains(@aria-label,"audio")])]//a[contains(@href,"/tv/g") or contains(@href,"/watch/")]`
    ),
  // First video callsign on page from MLB.TV column (excludes MLB Audio column links)
  'First Video Callsign': () =>
    $(
      '//a[contains(@href,"/tv/g") or contains(@href,"/watch/")][contains(., ":")]' +
        '[ancestor::td[not(contains(., "MLB Audio"))] or ancestor::*[contains(@class,"mlb-tv") or contains(@aria-label,"MLB.TV")]]' +
        '[not(ancestor::*[contains(@class,"mlb-audio") or contains(@class,"headphone") or contains(@aria-label,"audio")])]'
    ),
};
