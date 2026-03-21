// clean-json-reports.js
// Removes core-app JSON files from reports folder
import fs from 'fs-extra';
import path from 'path';

const cleanJsonReports = async () => {
  try {
    console.log('🧹 Cleaning JSON reports folder...');
    
    const jsonDir = './reports/json/';
    const files = await fs.readdir(jsonDir);
    
    let removedCount = 0;
    
    for (const file of files) {
      if (file.endsWith('.json')) {
        const filePath = path.join(jsonDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        
        try {
          const data = JSON.parse(content);
          
          // Check if this is a core-app test by looking at the URI
          if (data && Array.isArray(data)) {
            const isCoreApp = data.some(feature => 
              feature.uri && feature.uri.includes('/core-app/')
            );
            
            if (isCoreApp) {
              console.log(`🗑️ Removing core-app JSON: ${file}`);
              await fs.remove(filePath);
              removedCount++;
            }
          }
        } catch (error) {
          console.log(`⚠️ Could not parse ${file}, skipping...`);
        }
      }
    }
    
    console.log(`✅ Removed ${removedCount} core-app JSON files`);
    console.log('📝 Only operator-tool JSON files remain');
    
  } catch (error) {
    console.error(`❌ Error cleaning JSON reports: ${error.message}`);
  }
};

cleanJsonReports();
