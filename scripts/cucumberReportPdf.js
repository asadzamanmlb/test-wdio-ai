/**
 * Generate PDF from Cucumber HTML report (reports/cucumber-html/index.html).
 * Uses Puppeteer when available; no-op if puppeteer is not installed.
 */
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const PDF_NAME = 'cucumber-report.pdf';

/**
 * @param {string} reportHtmlDir - e.g. path to reports/cucumber-html
 * @returns {Promise<string|null>} path to PDF or null if skipped/failed
 */
async function generateCucumberPdf(reportHtmlDir) {
  const indexPath = path.resolve(reportHtmlDir, 'index.html');
  if (!fs.existsSync(indexPath)) return null;

  let puppeteer;
  try {
    puppeteer = require('puppeteer');
  } catch (_) {
    console.warn('⚠️ PDF report skipped: install puppeteer (npm install puppeteer --save-dev)');
    return null;
  }

  const pdfPath = path.join(reportHtmlDir, PDF_NAME);
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage();
    const fileUrl = pathToFileURL(indexPath).href;
    await page.goto(fileUrl, { waitUntil: 'load', timeout: 120000 });
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '12px', right: '12px', bottom: '12px', left: '12px' },
    });
    return pdfPath;
  } catch (e) {
    console.warn('Could not generate Cucumber PDF report:', e.message);
    return null;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

module.exports = { generateCucumberPdf, PDF_NAME };
