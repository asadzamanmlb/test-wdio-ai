/**
 * Player Page Object - from webTv-temp patterns
 */
module.exports = {
  videoPlayer: () => $('video'),
  scrubberBar: () => $('[class*="progress"], [class*="scrubber"], [class*="SeekBar"], [role="slider"][aria-valuenow], [data-testid*="progress"], [data-testid*="seek"]'),
  durationDisplay: () => $('//*[contains(@class,"duration") or contains(@class,"time") or contains(@class,"Duration")] | //*[contains(text(),":") and contains(text(),"0")]'),
  inningsScores: () => $('[class*="inning"], [class*="score"], [class*="line-score"], [data-testid*="inning"], [data-testid*="score"], [class*="LineScore"]'),
};
