/**
 * Content Page Object - from webTv-temp patterns
 * Carousels and content tiles on /tv homepage
 */
module.exports = {
  'Carousel Headings': () => $$('//div[contains(@class, "carousel") or contains(@class, "Carousel")]//h2 | //div[contains(@class, "carousel") or contains(@class, "Carousel")]//h3'),
  'Content Headings': () => $$('h2, h3'),
};
