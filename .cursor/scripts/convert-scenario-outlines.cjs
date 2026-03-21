#!/usr/bin/env node

const fs = require('fs');
const { glob } = require('glob');

async function convertScenarioOutlines() {
  console.log('🔄 Converting Scenario Outlines with single examples...\n');
  
  const featureFiles = await glob('core-app/features/**/*.feature', {
    ignore: ['node_modules/**', 'allure-results/**', 'reports/**', 'temp/**', 'logs/**']
  });
  
  let convertedCount = 0;
  
  for (const file of featureFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    
    let modified = false;
    let newLines = [];
    let i = 0;
    
    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();
      
      // Check if this is a Scenario Outline
      if (trimmed.startsWith('Scenario Outline:')) {
        const scenarioStartLine = i;
        const indent = line.match(/^(\s*)/)[1];
        
        // Find the Examples section
        let examplesStartLine = -1;
        let exampleHeaders = [];
        let exampleRows = [];
        
        for (let j = i + 1; j < lines.length; j++) {
          const searchLine = lines[j].trim();
          
          // Stop if we hit another scenario or end of file
          if (searchLine.startsWith('Scenario:') || searchLine.startsWith('Scenario Outline:')) {
            break;
          }
          
          if (searchLine.startsWith('Examples:')) {
            examplesStartLine = j;
            
            // Parse the examples table
            for (let k = j + 1; k < lines.length; k++) {
              const tableLine = lines[k].trim();
              
              if (!tableLine.startsWith('|')) {
                break;
              }
              
              const row = tableLine.split('|').map(cell => cell.trim()).filter(cell => cell);
              
              if (exampleHeaders.length === 0) {
                exampleHeaders = row;
              } else if (row.length > 0) {
                exampleRows.push(row);
              }
            }
            break;
          }
        }
        
        // If there's only 1 example row, convert to regular Scenario
        if (exampleRows.length === 1) {
          const values = exampleRows[0];
          const valueMap = {};
          
          // Create a map of placeholder to value
          for (let idx = 0; idx < exampleHeaders.length; idx++) {
            valueMap[exampleHeaders[idx]] = values[idx];
          }
          
          // Convert scenario title
          let scenarioTitle = line.replace('Scenario Outline:', 'Scenario:');
          
          // Replace placeholders in title
          for (const [key, value] of Object.entries(valueMap)) {
            const placeholder = `"<${key}>"`;
            const quotedValue = `"${value}"`;
            scenarioTitle = scenarioTitle.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), value);
          }
          
          newLines.push(scenarioTitle);
          i++;
          
          // Process scenario steps
          while (i < lines.length) {
            const stepLine = lines[i];
            const stepTrimmed = stepLine.trim();
            
            // Stop when we hit Examples section
            if (stepTrimmed.startsWith('Examples:')) {
              // Skip the entire examples section
              i++;
              while (i < lines.length && (lines[i].trim().startsWith('|') || lines[i].trim() === '')) {
                i++;
              }
              break;
            }
            
            // Stop if we hit another scenario
            if (stepTrimmed.startsWith('Scenario:') || stepTrimmed.startsWith('Scenario Outline:')) {
              break;
            }
            
            // Replace placeholders in steps
            let newStepLine = stepLine;
            for (const [key, value] of Object.entries(valueMap)) {
              const placeholder = `<${key}>`;
              newStepLine = newStepLine.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), `"${value}"`);
            }
            
            newLines.push(newStepLine);
            i++;
          }
          
          modified = true;
          continue;
        }
      }
      
      newLines.push(line);
      i++;
    }
    
    // Write the modified content back to the file
    if (modified) {
      fs.writeFileSync(file, newLines.join('\n'), 'utf8');
      console.log(`✅ Converted: ${file}`);
      convertedCount++;
    }
  }
  
  console.log(`\n🎉 Conversion complete! ${convertedCount} files converted.`);
}

convertScenarioOutlines().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});

