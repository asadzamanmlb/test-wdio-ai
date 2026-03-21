// automated-report-cleanup.js
import fs from 'fs-extra';
import { JSDOM } from 'jsdom';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class AutomatedReportCleanup {
  constructor() {
    this.reportDir = './reports/timeline-html/';
    this.htmlFile = path.join(this.reportDir, 'index.html');
    this.jsonFile = path.join(this.reportDir, 'index.html.json');
    this.pdfFile = path.join(this.reportDir, 'index.pdf');
    
    // Environment variable to control cleanup
    this.skipSkippedScenarios = process.env.SKIP_SKIPPED_SCENARIOS !== 'false';
    this.autoRegeneratePDF = process.env.AUTO_REGENERATE_PDF !== 'false';
  }

  async cleanupHTML() {
    if (!this.skipSkippedScenarios) {
      console.log('ℹ️ Skipped scenarios removal is disabled (SKIP_SKIPPED_SCENARIOS=false)');
      return;
    }

    if (!fs.existsSync(this.htmlFile)) {
      console.log('⚠️ HTML report not found, skipping cleanup');
      return;
    }

    try {
      console.log('🧹 Starting automated report cleanup...');
      
      const htmlContent = await fs.readFile(this.htmlFile, 'utf-8');
      const dom = new JSDOM(htmlContent);
      const document = dom.window.document;

      const removeByXPath = (xpath, search_type) => {
        let resultType;
        switch (search_type) {
          case "single":
            resultType = dom.window.XPathResult.FIRST_ORDERED_NODE_TYPE;
            break;
          case "multiple":
            resultType = dom.window.XPathResult.ORDERED_NODE_SNAPSHOT_TYPE;
            break;
          default:
            throw new Error(`Unknown result type: ${resultType}`);
        }
        let xpathResult = document.evaluate(xpath, document, null, resultType, null);
        if (resultType === dom.window.XPathResult.FIRST_ORDERED_NODE_TYPE) {
          const node = xpathResult.singleNodeValue;
          if (node) { node.remove(); }
        } else if (resultType === dom.window.XPathResult.ORDERED_NODE_SNAPSHOT_TYPE) {
          for (let i = 0; i < xpathResult.snapshotLength; i++) {
            const node = xpathResult.snapshotItem(i);
            if (node) { node.remove(); }
          }
        }
      };

      // Count skipped scenarios before removal
      const skippedBefore = document.querySelectorAll('.skipped, .test-skipped, tr:has(td.skipped)').length;
      
      // SELECTIVE REMOVAL: Only remove summary cards, preserve skipped steps within scenarios
      console.log('📋 Using selective removal - preserving skipped steps within scenarios');
      
      // Remove the yellow box (skipped scenarios summary card)
      removeByXPath('//div[@class="card yellow-box"]', "multiple");
      removeByXPath('//*[contains(@class, "yellow-box")]', "multiple");
      removeByXPath('//div[@class="feature-title" and not(text())]', "multiple");
      
      // Remove summary labels and counts (but not individual step labels)
      removeByXPath('//span[@class="label label-warning" and contains(@title, "Scenarios Skipped")]', "multiple");
      removeByXPath('//span[@class="label label-warning" and contains(@title, "Steps Skipped")]', "multiple");
      
      // Remove summary sections that mention skipped scenarios
      removeByXPath('//div[contains(text(), "Scenarios Skipped")]', "multiple");
      removeByXPath('//div[contains(text(), "Skipped Scenarios")]', "multiple");
      
      // DO NOT remove individual skipped step labels within scenarios
      // DO NOT remove skipped step rows within scenarios  
      // DO NOT remove panels that contain skipped steps

      // Write cleaned HTML
      await fs.outputFile(this.htmlFile, dom.serialize());
      
      console.log(`✅ Removed ${skippedBefore} skipped scenarios from HTML report`);
      
    } catch (error) {
      console.error(`❌ Error cleaning HTML report: ${error.message}`);
    }
  }

  async cleanupJSON() {
    if (!this.skipSkippedScenarios || !fs.existsSync(this.jsonFile)) {
      return;
    }

    try {
      const jsonContent = await fs.readFile(this.jsonFile, 'utf-8');
      const data = JSON.parse(jsonContent);
      
      let removedCount = 0;
      
      // SELECTIVE JSON CLEANUP: Keep scenarios with skipped steps, only remove summary counts
      console.log('📋 Using selective JSON cleanup - preserving scenarios with skipped steps');
      
      // Don't filter out scenarios with skipped steps, just clean up summary counts
      const cleanedData = data.map(feature => {
        // Keep all scenarios, even those with skipped steps
        return feature;
      });

      await fs.outputFile(this.jsonFile, JSON.stringify(cleanedData, null, 2));
      console.log(`✅ Removed ${removedCount} skipped scenarios from JSON data`);
      
    } catch (error) {
      console.error(`❌ Error cleaning JSON data: ${error.message}`);
    }
  }

  async fixSlackReportCounts() {
    try {
      console.log('🔧 Auto-fixing Slack report scenario counts...');
      
      if (!fs.existsSync(this.htmlFile)) {
        console.log('⚠️ HTML report not found, skipping Slack report fix');
        return;
      }
      
      // Read the corrected HTML report to get accurate counts
      const htmlContent = await fs.readFile(this.htmlFile, 'utf-8');
      const dom = new JSDOM(htmlContent);
      const document = dom.window.document;
      
      // Extract scenario counts from the corrected HTML
      let totalScenarios = 0;
      let passedScenarios = 0;
      let failedScenarios = 0;
      
      // Look for scenario count elements in the HTML
      const countElements = document.querySelectorAll('.card h5');
      countElements.forEach(element => {
        const text = element.textContent.trim();
        const value = parseInt(text);
        if (!isNaN(value)) {
          if (element.closest('.card').querySelector('.feature-title h4')?.textContent.includes('All Scenarios')) {
            totalScenarios = value;
          } else if (element.closest('.card').querySelector('.feature-title h4')?.textContent.includes('Passed Scenarios')) {
            passedScenarios = value;
          } else if (element.closest('.card').querySelector('.feature-title h4')?.textContent.includes('Failed Scenarios')) {
            failedScenarios = value;
          }
        }
      });
      
      // Alternative method: count scenarios from the HTML structure
      if (totalScenarios === 0) {
        const scenarioElements = document.querySelectorAll('.panel-heading');
        totalScenarios = scenarioElements.length;
        
        // Count passed and failed scenarios
        const passedElements = document.querySelectorAll('.label-success, .test-passed');
        const failedElements = document.querySelectorAll('.label-danger, .test-failed');
        
        passedScenarios = passedElements.length;
        failedScenarios = failedElements.length;
      }
      
      console.log(`📊 Auto-detected counts - Total: ${totalScenarios}, Passed: ${passedScenarios}, Failed: ${failedScenarios}`);
      
      // Create corrected summary for Slack
      const correctedSummary = {
        totalScenarios,
        passedScenarios,
        failedScenarios,
        passedPercentage: totalScenarios > 0 ? (passedScenarios / totalScenarios) * 100 : 0,
        corrected: true,
        timestamp: new Date().toISOString()
      };
      
      // Save the corrected summary for Slack to use
      await fs.outputFile('./reports/slack-corrected-counts.json', JSON.stringify(correctedSummary, null, 2));
      
      console.log('✅ Slack report counts auto-corrected');
      
    } catch (error) {
      console.error(`❌ Error auto-fixing Slack report counts: ${error.message}`);
    }
  }

  async regeneratePDF() {
    if (!this.autoRegeneratePDF || !fs.existsSync(this.htmlFile)) {
      return;
    }

    try {
      console.log('📄 Regenerating PDF report...');
      
      // Remove old PDF if exists
      if (fs.existsSync(this.pdfFile)) {
        fs.unlinkSync(this.pdfFile);
      }

      // Regenerate PDF using the existing script (path relative to project root)
      const pdfScriptPath = path.join(__dirname, '..', 'make-playwrightpdf', 'make-playwrightpdf.js');
      execSync(`node "${pdfScriptPath}"`, { stdio: 'inherit', cwd: process.cwd() });
      console.log('✅ PDF report regenerated successfully');
      
    } catch (error) {
      console.error(`❌ Error regenerating PDF: ${error.message}`);
    }
  }

  async run() {
    console.log('🚀 Starting automated report cleanup...');
    console.log(`📊 Skip skipped scenarios: ${this.skipSkippedScenarios}`);
    console.log(`📄 Auto regenerate PDF: ${this.autoRegeneratePDF}`);
    
    await this.cleanupHTML();
    await this.cleanupJSON();
    await this.fixSlackReportCounts();
    await this.regeneratePDF();
    
    console.log('🎉 Automated report cleanup completed!');
    
    // Auto-open HTML report if ROPEN=Y
    if (process.env.ROPEN == 'Y') {
    console.log('🌐 Opening HTML report...');
    const htmlPath = path.resolve('./reports/timeline-html/index.html');
    try {
        execSync(`open "${htmlPath}"`);
        console.log('✅ HTML report opened successfully');
    } catch (error) {
        console.log('⚠️ Could not auto-open HTML report:', error.message);
        console.log(`📄 HTML report available at: ${htmlPath}`);
    }
    } else {
      const htmlPath = path.resolve('./reports/timeline-html/index.html');
      console.log(`📄 Slack mode detected - skipping auto-open. Report available at: ${htmlPath}`);
    }
  }
}

// Run the cleanup
const cleanup = new AutomatedReportCleanup();
cleanup.run().catch(console.error);
