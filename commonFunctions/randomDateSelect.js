/**
 * Returns a random date between April and September in the last 2 years.
 * Used by Media Center archive playback, calendar, and live-stream date selection.
 * From: core-app-temp/commonFunctions/randomDateSelect.js
 */
function getRandomDateFromAprilToSeptemberLast2Years() {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth(); // 0-based month (0-11)
  const currentDay = today.getDate();

  let endYear, endMonth, endDay;

  if (currentMonth > 8) {
    endYear = currentYear;
    endMonth = 8; // September (0-based)
    endDay = 30;
  } else if (currentMonth >= 3 && currentMonth <= 8) {
    endYear = currentYear;
    endMonth = currentMonth;
    endDay = currentDay;
  } else {
    endYear = currentYear - 1;
    endMonth = 8; // September (0-based)
    endDay = 30;
  }

  const startYear = endYear - 1;
  const possibleMonths = [];

  for (let year = startYear; year <= endYear; year++) {
    let startMonthForYear = 3; // April (0-based)
    let endMonthForYear = 8; // September (0-based)
    if (year === endYear) {
      endMonthForYear = Math.min(endMonth, 8);
    }
    for (let month = startMonthForYear; month <= endMonthForYear; month++) {
      possibleMonths.push({ year, month });
    }
  }

  const randomMonthIndex = Math.floor(Math.random() * possibleMonths.length);
  const { year: randomYear, month: randomMonth } = possibleMonths[randomMonthIndex];

  let maxDay = 30;
  if (randomMonth === 3 || randomMonth === 5 || randomMonth === 8) {
    maxDay = 30;
  } else if (randomMonth === 4 || randomMonth === 6 || randomMonth === 7) {
    maxDay = 31;
  }
  if (randomYear === endYear && randomMonth === endMonth) {
    maxDay = endDay;
  }

  const randomDay = Math.floor(Math.random() * maxDay) + 1;
  return new Date(randomYear, randomMonth, randomDay);
}

module.exports = { getRandomDateFromAprilToSeptemberLast2Years };
