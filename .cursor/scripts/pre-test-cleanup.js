// pre-test-cleanup.js
// Cleans up reports folder before test runs to prevent contamination
import fs from 'fs-extra';
import path from 'path';

const preTestCleanup = async () => {
  try {
    console.log('🧹 Starting pre-test cleanup...');
    
    const jsonDir = './reports/json/';
    const htmlDir = './reports/timeline-html/';
    const allureDir = './allure-results/';
    
    let cleanedCount = 0;
    
    // Clean JSON files
    if (fs.existsSync(jsonDir)) {
      const jsonFiles = await fs.readdir(jsonDir);
      for (const file of jsonFiles) {
        if (file.endsWith('.json')) {
          await fs.remove(path.join(jsonDir, file));
          cleanedCount++;
        }
      }
      console.log(`🗑️ Removed ${cleanedCount} JSON files`);
    }
    
    // Clean HTML files (except index.html if it exists)
    if (fs.existsSync(htmlDir)) {
      const htmlFiles = await fs.readdir(htmlDir);
      for (const file of htmlFiles) {
        if (file.endsWith('.html') && file !== 'index.html') {
          await fs.remove(path.join(htmlDir, file));
        }
      }
      console.log('🗑️ Cleaned HTML files');
    }
    
    // Clean PDF files
    if (fs.existsSync(htmlDir)) {
      const pdfFiles = await fs.readdir(htmlDir);
      for (const file of pdfFiles) {
        if (file.endsWith('.pdf')) {
          await fs.remove(path.join(htmlDir, file));
        }
      }
      console.log('🗑️ Cleaned PDF files');
    }
    
    // Clean Allure results (disabled)
    // if (fs.existsSync(allureDir)) {
    //   await fs.emptyDir(allureDir);
    //   console.log('🗑️ Cleaned Allure results');
    // }
    
    // Clean temp directories
    const tempDirs = [
      './reports/timeline-html/temp/',
      './reports/timeline-html/backup/',
      './temp/',
      './logs/'
    ];
    
    for (const tempDir of tempDirs) {
      if (fs.existsSync(tempDir)) {
        await fs.emptyDir(tempDir);
        console.log(`🗑️ Cleaned ${tempDir}`);
      }
    }
    
    console.log('✅ Pre-test cleanup completed!');
    console.log('📝 Reports folder is now clean and ready for new test run');
    
  } catch (error) {
    console.error(`❌ Error during pre-test cleanup: ${error.message}`);
  }
};

preTestCleanup();
