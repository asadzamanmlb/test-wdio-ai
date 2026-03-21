/**
 * Common Page Object - cookie consent, account dropdown
 */
module.exports = {
  accountDropdown: () => $("//*[@aria-label='Account']"),
  headerProfileButton: () => $('[data-testid="header-profile-button"]'),
  cookieConsentBanner: () => $('[data-testid="consent-banner"]'),
  cookieAcceptButton: () => $('button#onetrust-accept-btn-handler'),
  onetrustAcceptBtn: () => $('button#onetrust-accept-btn-handler'),
  onetrustBanner: () => $('.onetrust-pc-dark-filter, [id*="onetrust"], [class*="onetrust"]'),
};
