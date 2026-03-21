// selective-skipped-removal.js
// Removes skipped scenario summary cards but preserves skipped steps within scenarios
import fs from 'fs-extra';
import { JSDOM } from 'jsdom';

const selectiveSkippedRemoval = async (htmlFilePath) => {
  try {
    console.log('🎯 Starting selective skipped content removal...');
    console.log('📋 Will remove summary cards but preserve skipped steps within scenarios');
    
    const htmlContent = await fs.readFile(htmlFilePath, 'utf-8');
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
        if (node) { 
          console.log(`🗑️ Removing summary: ${node.textContent.trim().substring(0, 30)}...`);
          node.remove(); 
        }
      } else if (resultType === dom.window.XPathResult.ORDERED_NODE_SNAPSHOT_TYPE) {
        for (let i = 0; i < xpathResult.snapshotLength; i++) {
          const node = xpathResult.snapshotItem(i);
          if (node) { 
            console.log(`🗑️ Removing summary: ${node.textContent.trim().substring(0, 30)}...`);
            node.remove(); 
          }
        }
      }
    };

    console.log('🧹 Removing summary cards only...');
    
    // Remove the yellow box (skipped scenarios summary card)
    removeByXPath('//div[@class="card yellow-box"]', "multiple");
    removeByXPath('//*[contains(@class, "yellow-box")]', "multiple");
    
    // Remove empty feature-title divs that might be left behind
    removeByXPath('//div[@class="feature-title" and not(text())]', "multiple");
    
    // Remove summary labels and counts (but not individual step labels)
    removeByXPath('//span[@class="label label-warning" and contains(@title, "Scenarios Skipped")]', "multiple");
    removeByXPath('//span[@class="label label-warning" and contains(@title, "Steps Skipped")]', "multiple");
    
    // Remove any summary sections that mention skipped scenarios
    removeByXPath('//div[contains(text(), "Scenarios Skipped")]', "multiple");
    removeByXPath('//div[contains(text(), "Skipped Scenarios")]', "multiple");
    
    // DO NOT remove individual skipped step labels within scenarios
    // DO NOT remove skipped step rows within scenarios
    // DO NOT remove panels that contain skipped steps

    // Write the cleaned HTML
    await fs.outputFile(htmlFilePath, dom.serialize());
    console.log('✅ Selective skipped content removal completed!');
    console.log('📝 Skipped steps within scenarios are preserved');
    
  } catch (error) {
    console.error(`❌ Error in selective removal: ${error.message}`);
  }
};

// Get the HTML file path from command line arguments or use default
const htmlFilePath = process.argv[2] || './reports/timeline-html/index.html';

if (!fs.existsSync(htmlFilePath)) {
  console.error(`❌ HTML file not found: ${htmlFilePath}`);
  process.exit(1);
}

selectiveSkippedRemoval(htmlFilePath);
