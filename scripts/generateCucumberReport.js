#!/usr/bin/env node
/**
 * Generate Cucumber HTML report from reports/json/*.json, then PDF from HTML.
 * Run after tests, or use: npm run report:cucumber
 * With --open: opens the HTML report in the default browser
 */
const path = require('path');
const fs = require('fs');
const { getCjsonMetadata, getHostPlatformLabel, getHostOsVersion } = require('../config/cjsonRunMetadata');
const { pageTitle: cucumberReportPageTitle, reportName: cucumberReportName } = require('../config/cucumberHtmlReportBranding');

const jsonDir = path.join(process.cwd(), 'reports', 'json');
const reportPath = path.join(process.cwd(), 'reports', 'cucumber-html');
const openInBrowser = process.argv.includes('--open');

if (!fs.existsSync(jsonDir) || !fs.readdirSync(jsonDir).some((f) => f.endsWith('.json'))) {
  console.warn('⚠️ No Cucumber JSON files in reports/json. Run tests first.');
  process.exit(1);
}

(async () => {
  try {
    const { patchCucumberJsonHostMetadata } = require('./patchCucumberJsonHostMetadata');
    patchCucumberJsonHostMetadata(jsonDir);
    const report = require('multiple-cucumber-html-reporter');
    report.generate({
      jsonDir,
      reportPath,
      pageTitle: cucumberReportPageTitle,
      reportName: cucumberReportName,
      openReportInBrowser: openInBrowser,
      displayDuration: true,
      durationInMS: false,
      displayReportTime: true,
      disableLog: true,
      pageFooter: '<div></div>',
      customStyle: path.join(__dirname, '..', 'config', 'cucumber-report-hide-device.css'),
      metadata: {
        browser: { name: process.env.BROWSER || 'chrome', version: 'latest' },
        platform: {
          name: getHostPlatformLabel(),
          version: getHostOsVersion(),
        },
        device: getCjsonMetadata().device,
      },
      customData: {
        title: 'Run Info',
        data: [
          { label: 'Environment', value: process.env.ENV || 'beta' },
          { label: 'Headless', value: process.env.HEADLESS === '1' ? 'Yes' : 'No' },
        ],
      },
    });
    try {
      const { prettifyCucumberReportDurations } = require('./prettifyCucumberReportDurations');
      const pr = prettifyCucumberReportDurations(reportPath);
      if (pr.updated > 0) {
        console.log(`✅ Report durations: sec/min labels (${pr.updated} file(s))`);
      }
    } catch (durErr) {
      console.warn('Could not prettify report durations:', durErr.message);
    }
    const indexPath = path.join(reportPath, 'index.html');
    console.log(`✅ Cucumber report: ${path.relative(process.cwd(), indexPath)}`);

    const { generateCucumberPdf } = require('./cucumberReportPdf');
    const pdfPath = await generateCucumberPdf(reportPath);
    if (pdfPath) console.log(`✅ Cucumber PDF: ${path.relative(process.cwd(), pdfPath)}`);

    if (openInBrowser) {
      const { execSync } = require('child_process');
      try {
        if (process.platform === 'darwin') execSync(`open "${indexPath}"`);
        else if (process.platform === 'win32') execSync(`start "" "${indexPath}"`);
        else execSync(`xdg-open "${indexPath}"`);
      } catch (_) {}
    }
  } catch (e) {
    console.error('Failed to generate report:', e.message);
    process.exit(1);
  }
})();
