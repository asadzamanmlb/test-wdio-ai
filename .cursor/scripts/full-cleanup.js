// full-cleanup.js
// Comprehensive cleanup of all reports and test artifacts
import fs from 'fs-extra';
import path from 'path';

const fullCleanup = async () => {
  try {
    console.log('🧹 Starting full cleanup of all test artifacts...');
    
    const cleanupTargets = [
      './reports/',
      // './allure-results/', // Allure disabled
      './logs/',
      './temp/',
      './node_modules/.cache/',
      './terminal.txt',
      './okta-token.json'
    ];
    
    let cleanedCount = 0;
    
    for (const target of cleanupTargets) {
      if (fs.existsSync(target)) {
        if (fs.statSync(target).isDirectory()) {
          await fs.emptyDir(target);
          console.log(`🗑️ Cleaned directory: ${target}`);
        } else {
          await fs.remove(target);
          console.log(`🗑️ Removed file: ${target}`);
        }
        cleanedCount++;
      }
    }
    
    // Clean up any remaining JSON files in reports/json
    const jsonDir = './reports/json/';
    if (fs.existsSync(jsonDir)) {
      const jsonFiles = await fs.readdir(jsonDir);
      for (const file of jsonFiles) {
        if (file.endsWith('.json')) {
          await fs.remove(path.join(jsonDir, file));
        }
      }
      console.log('🗑️ Cleaned all JSON files');
    }
    
    // Clean up any remaining HTML files in reports/timeline-html
    const htmlDir = './reports/timeline-html/';
    if (fs.existsSync(htmlDir)) {
      const htmlFiles = await fs.readdir(htmlDir);
      for (const file of htmlFiles) {
        if (file.endsWith('.html') || file.endsWith('.pdf')) {
          await fs.remove(path.join(htmlDir, file));
        }
      }
      console.log('🗑️ Cleaned all HTML and PDF files');
    }
    
    console.log(`✅ Full cleanup completed! Cleaned ${cleanedCount} targets`);
    console.log('📝 All test artifacts have been removed');
    console.log('🚀 Ready for a fresh test run');
    
  } catch (error) {
    console.error(`❌ Error during full cleanup: ${error.message}`);
  }
};

fullCleanup();
