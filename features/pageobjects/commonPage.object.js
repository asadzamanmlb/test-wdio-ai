/**
 * Common Page Object - cookie consent, account dropdown, video tiles (from webTv-temp)
 */
module.exports = {
  accountDropdown: () => $("//*[@aria-label='Account']"),
  videoTiles: () => $$('a[href*="/video/"], a[href*="/watch/"], [class*="episode"], [class*="Episode"], [class*="video-tile"], [class*="VideoTile"]'),
  allLinks: () => $$('a[href]'),
  headerProfileButton: () => $('[data-testid="header-profile-button"]'),
  cookieConsentBanner: () => $('[data-testid="consent-banner"]'),
  cookieAcceptButton: () => $('button#onetrust-accept-btn-handler'),
  onetrustAcceptBtn: () => $('button#onetrust-accept-btn-handler'),
  onetrustBanner: () => $('.onetrust-pc-dark-filter, [id*="onetrust"], [class*="onetrust"]'),
};
