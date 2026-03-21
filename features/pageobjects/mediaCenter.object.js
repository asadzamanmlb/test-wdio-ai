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
};
