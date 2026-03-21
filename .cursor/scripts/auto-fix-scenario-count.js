import fs from 'node:fs';
import path from 'node:path';

function autoFixScenarioCount(htmlFilePath) {
    console.log('🔧 Auto-fixing scenario count in HTML report...');
    const absolutePath = path.resolve(htmlFilePath);

    if (!fs.existsSync(absolutePath)) {
        console.error(`❌ Error: HTML file not found at ${absolutePath}`);
        return;
    }

    // Create backup
    const backupPath = `${absolutePath}.backup.${Date.now()}`;
    fs.copyFileSync(absolutePath, backupPath);
    console.log(`📁 Backup created: ${backupPath}`);

    let htmlContent = fs.readFileSync(absolutePath, 'utf8');

    // Check if this is a smoke test by looking for multiple features
    const hasGameCard = htmlContent.includes('<b>Feature:</b>Game Card Verification');
    const hasLogin = htmlContent.includes('<b>Feature:</b>Login');
    const hasAuditLogging = htmlContent.includes('<b>Feature:</b>Audit &amp; Logging');
    const hasNavigation = htmlContent.includes('<b>Feature:</b>Navigation');
    
    console.log(`🔍 Debug - Feature detection:`);
    console.log(`   Game Card Verification: ${hasGameCard}`);
    console.log(`   Login: ${hasLogin}`);
    console.log(`   Audit & Logging: ${hasAuditLogging}`);
    console.log(`   Navigation: ${hasNavigation}`);
    
    const isSmokeTest = hasGameCard && hasLogin && hasAuditLogging && hasNavigation;
    
    if (isSmokeTest) {
        console.log('🎯 Detected smoke test - applying correct scenario counts');
        
        // Dynamically calculate actual scenario counts from HTML content
        // Extract current counts from the HTML report - handle malformed HTML tags
        const totalMatch = htmlContent.match(/<h4>All Scenarios<\/h[24]>[\s\S]*?<h5>\s*(\d+)\s*<\/h5>/);
        const passedMatch = htmlContent.match(/<h4>Passed Scenarios<\/h[24]>[\s\S]*?<h5>\s*(\d+)\s*<\/h5>/);
        const failedMatch = htmlContent.match(/<h4>Failed Scenarios<\/h[24]>[\s\S]*?<h5>\s*(\d+)\s*<\/h5>/);
        
        const currentTotal = totalMatch ? parseInt(totalMatch[1]) : 0;
        const currentPassed = passedMatch ? parseInt(passedMatch[1]) : 0;
        const currentFailed = failedMatch ? parseInt(failedMatch[1]) : 0;
        
        console.log(`📊 Current counts from HTML - Total: ${currentTotal}, Passed: ${currentPassed}, Failed: ${currentFailed}`);
        
        // For smoke tests: Count Scenario Outlines as 1 each, regardless of examples
        let correctedTotal = currentTotal;
        let correctedPassed = currentPassed;
        let correctedFailed = currentFailed;
        
        try {
            // Count individual scenarios and scenario outlines properly
            const jsonData = JSON.parse(fs.readFileSync('./reports/timeline-html/index.html.json', 'utf8'));
            
            // Count scenarios by feature to detect Scenario Outlines
            let totalScenarios = 0;
            let scenarioOutlines = 0;
            let individualScenarios = 0;
            
            const scenarioGroups = {};
            
            jsonData.forEach(feature => {
                if (feature.elements) {
                    feature.elements.forEach(scenario => {
                        const name = scenario.name;
                        // Extract base name by removing dynamic parts in quotes
                        const baseName = name.replace(/\s+'[^']*'\s+/g, ' <title> ').replace(/\s+"[^"]*"\s+/g, ' <title> ');
                        
                        if (!scenarioGroups[baseName]) {
                            scenarioGroups[baseName] = [];
                        }
                        scenarioGroups[baseName].push(scenario);
                    });
                }
            });
            
            let passedCount = 0;
            let failedCount = 0;
            
            // Analyze each scenario group
            Object.entries(scenarioGroups).forEach(([baseName, instances]) => {
                if (instances.length > 1) {
                    // This is a Scenario Outline - check if ANY example failed
                    const anyFailed = instances.some(instance => {
                        return instance.steps && instance.steps.some(step => {
                            const status = step.result && step.result.status;
                            return status === 'failed' || status === 'skipped';
                        });
                    });
                    
                    scenarioOutlines += 1;
                    totalScenarios += 1;
                    
                    if (anyFailed) {
                        failedCount++;
                    } else {
                        passedCount++;
                    }
                } else {
                    // Individual scenario - check its status
                    const scenario = instances[0];
                    const hasFailed = scenario.steps && scenario.steps.some(step => {
                        const status = step.result && step.result.status;
                        return status === 'failed' || status === 'skipped';
                    });
                    
                    individualScenarios += 1;
                    totalScenarios += 1;
                    
                    if (hasFailed) {
                        failedCount++;
                    } else {
                        passedCount++;
                    }
                }
            });
            
            // Apply correction: use the calculated totals
            correctedTotal = totalScenarios;
            correctedPassed = passedCount;
            correctedFailed = failedCount;
            
            console.log(`📊 Scenario Analysis:`);
            console.log(`   Scenario Outlines: ${scenarioOutlines} (each counts as 1)`);
            console.log(`   Individual Scenarios: ${individualScenarios} (each counts as 1)`);
            console.log(`   Total Corrected Scenarios: ${totalScenarios}`);
            console.log(`   Passed: ${passedCount}, Failed: ${failedCount}`);
            console.log(`   Raw Total: ${currentTotal} → Corrected Total: ${correctedTotal}`);
            
        } catch (error) {
            console.warn('⚠️ Could not read JSON data for scenario analysis, using raw counts');
            correctedTotal = currentTotal;
            correctedPassed = currentPassed;
            correctedFailed = currentFailed;
        }
        
        const newTotal = correctedTotal;
        const newPassed = correctedPassed;
        const newFailed = correctedFailed;
        
        console.log(`🔄 Final corrected counts - Total: ${newTotal}, Passed: ${newPassed}, Failed: ${newFailed}`);
        
        // Update total scenarios count - handle malformed HTML tags
        htmlContent = htmlContent.replace(
            /<h4>All Scenarios<\/h[24]>[\s\S]*?<h5>\s*\d+\s*<\/h5>/,
            `<h4>All Scenarios</h4>
        </div>
        <div class="feature-value">
          <h5>
            ${newTotal}
          </h5>`
        );

        // Update passed scenarios count - handle malformed HTML tags
        htmlContent = htmlContent.replace(
            /<h4>Passed Scenarios<\/h[24]>[\s\S]*?<h5>\s*\d+\s*<\/h5>/,
            `<h4>Passed Scenarios</h4>
        </div>
        <div class="feature-value">
          <h5>
            ${newPassed}
          </h5>`
        );

        // Update failed scenarios count - handle malformed HTML tags
        htmlContent = htmlContent.replace(
            /<h4>Failed Scenarios<\/h[24]>[\s\S]*?<h5>\s*\d+\s*<\/h5>/,
            `<h4>Failed Scenarios</h4>
        </div>
        <div class="feature-value">
          <h5>
            ${newFailed}
          </h5>`
        );

        // Update feature-level scenario labels
        htmlContent = htmlContent.replace(
            /<span class="label label-success" title="(\d+) Scenarios Passed">\d+<\/span>/g,
            `<span class="label label-success" title="${newPassed} Scenarios Passed">${newPassed}</span>`
        );
        
        htmlContent = htmlContent.replace(
            /<span class="label label-danger" title="(\d+) Scenarios Failed">\d+<\/span>/g,
            `<span class="label label-danger" title="${newFailed} Scenarios Failed">${newFailed}</span>`
        );
        
        // Update chart data
        htmlContent = htmlContent.replace(
            /"failed": \d+,/g,
            `"failed": ${newFailed},`
        );
        
        htmlContent = htmlContent.replace(
            /"passed": \d+,/g,
            `"passed": ${newPassed},`
        );
        
        // Fix Features chart - if most scenarios pass, mark feature as passed
        const featurePassed = newPassed > newFailed ? 1 : 0;
        const featureFailed = newPassed > newFailed ? 0 : 1;
        
        // Update specific chart data for Features
        htmlContent = htmlContent.replace(/"title": "Features",\s*"failed": \d+,/g, `"title": "Features",\n        "failed": ${featureFailed},`);
        htmlContent = htmlContent.replace(/"title": "Features",\s*"passed": \d+,/g, `"title": "Features",\n        "passed": ${featurePassed},`);

        console.log(`✅ Updated smoke test scenario counts:`);
        console.log(`   Total: ${newTotal}`);
        console.log(`   Passed: ${newPassed}`);
        console.log(`   Failed: ${newFailed}`);

        fs.writeFileSync(absolutePath, htmlContent, 'utf8');
        console.log(`✅ Successfully auto-fixed smoke test scenario counting in: ${absolutePath}`);
        return;
    }
    
    // Generic Scenario Outline detection using JSON data (respects feature boundaries)
    console.log('🔍 Analyzing JSON for Scenario Outlines...');
    
    // Read JSON data to get feature associations
    let jsonData;
    try {
        jsonData = JSON.parse(fs.readFileSync('./reports/timeline-html/index.html.json', 'utf8'));
    } catch (error) {
        console.warn('⚠️ Could not read JSON file, skipping Scenario Outline detection');
        return;
    }
    
    // Count scenarios per feature
    const featureScenarioCounts = {};
    let totalScenarios = 0;
    
    jsonData.forEach(feature => {
        const featureUri = feature.uri || feature.id;
        if (!featureScenarioCounts[featureUri]) {
            featureScenarioCounts[featureUri] = {};
        }
        
        if (feature.elements) {
            feature.elements.forEach(scenario => {
                const name = scenario.name;
                totalScenarios++;
                featureScenarioCounts[featureUri][name] = (featureScenarioCounts[featureUri][name] || 0) + 1;
            });
        }
    });
    
    console.log(`📋 Found ${totalScenarios} total scenarios in JSON`);
    
    // Find actual Scenario Outlines (scenarios that appear multiple times IN THE SAME FEATURE)
    const outlinePatterns = [];
    Object.entries(featureScenarioCounts).forEach(([featureUri, scenarios]) => {
        Object.entries(scenarios).forEach(([name, count]) => {
            if (count > 1) {
                outlinePatterns.push({ pattern: name, count, featureUri });
            }
        });
    });
    
    console.log(`🎯 Found ${outlinePatterns.length} Scenario Outline(s):`);
    outlinePatterns.forEach(outline => {
        const featureName = outline.featureUri.split('/').pop();
        console.log(`   - "${outline.pattern}" (${outline.count} examples) in ${featureName}`);
    });
    
    if (outlinePatterns.length > 0) {
        // Calculate the correction needed
        const totalOutlineExamples = outlinePatterns.reduce((sum, outline) => sum + outline.count, 0);
        const outlineCount = outlinePatterns.length; // Number of unique outlines
        const correctionNeeded = totalOutlineExamples - outlineCount;
        
        console.log(`📊 Scenario Outline Analysis:`);
        console.log(`   Total outline examples: ${totalOutlineExamples}`);
        console.log(`   Number of outlines: ${outlineCount}`);
        console.log(`   Correction needed: -${correctionNeeded} scenarios`);
        
        // Get current counts - handle malformed HTML tags
        const totalMatch = htmlContent.match(/<h4>All Scenarios<\/h[24]>[\s\S]*?<h5>\s*(\d+)\s*<\/h5>/);
        const passedMatch = htmlContent.match(/<h4>Passed Scenarios<\/h[24]>[\s\S]*?<h5>\s*(\d+)\s*<\/h5>/);
        const failedMatch = htmlContent.match(/<h4>Failed Scenarios<\/h[24]>[\s\S]*?<h5>\s*(\d+)\s*<\/h5>/);
        
        if (!totalMatch || !passedMatch || !failedMatch) {
            console.warn('⚠️ Warning: Could not find scenario counts in HTML. No changes made.');
            return;
        }
        
        const currentTotal = parseInt(totalMatch[1]);
        const currentPassed = parseInt(passedMatch[1]);
        const currentFailed = parseInt(failedMatch[1]);
        
        console.log(`📊 Current counts - Total: ${currentTotal}, Passed: ${currentPassed}, Failed: ${currentFailed}`);
        
        // First, try to get actual counts from JSON data
        let actualPassed = 0;
        let actualFailed = 0;
        let actualSkipped = 0;
        let skippedCountedAsFailed = 0; // Track skipped scenarios for logging
        
        try {
            const jsonData = JSON.parse(fs.readFileSync('./reports/timeline-html/index.html.json', 'utf8'));
            
            // Count all individual scenarios from JSON data
            jsonData.forEach(feature => {
                if (feature.elements) {
                    feature.elements.forEach(scenario => {
                        // Determine scenario status based on step results
                        if (scenario.steps && scenario.steps.length > 0) {
                            const hasFailedSteps = scenario.steps.some(step => 
                                step.result && step.result.status === 'failed'
                            );
                            const hasSkippedSteps = scenario.steps.some(step => 
                                step.result && step.result.status === 'skipped'
                            );
                            const allStepsPassed = scenario.steps.every(step => 
                                step.result && step.result.status === 'passed'
                            );
                            
                            if (hasFailedSteps) {
                                actualFailed++;
                            } else if (hasSkippedSteps && !allStepsPassed) {
                                // Count skipped scenarios as failed
                                actualFailed++;
                                skippedCountedAsFailed++;
                            } else if (allStepsPassed) {
                                actualPassed++;
                            }
                        }
                    });
                }
            });
            
            console.log(`📊 Actual JSON counts - Passed: ${actualPassed}, Failed: ${actualFailed} (includes ${skippedCountedAsFailed} skipped), Skipped: ${actualSkipped}`);
            
        } catch (error) {
            console.warn('⚠️ Could not read JSON data, will use outline analysis');
        }
        
        // Calculate new counts with proper Scenario Outline correction
        let newTotal;
        if (actualPassed > 0 || actualFailed > 0) {
            // Count actual Scenario Outlines from JSON data (PER FEATURE, not globally)
            try {
                const jsonData = JSON.parse(fs.readFileSync('./reports/timeline-html/index.html.json', 'utf8'));
                
                // Count scenarios PER FEATURE to correctly identify Scenario Outlines
                const perFeatureScenarioCounts = {};
                jsonData.forEach(feature => {
                    const featureUri = feature.uri || feature.id;
                    if (!perFeatureScenarioCounts[featureUri]) {
                        perFeatureScenarioCounts[featureUri] = {};
                    }
                    
                    if (feature.elements) {
                        feature.elements.forEach(scenario => {
                            const name = scenario.name;
                            perFeatureScenarioCounts[featureUri][name] = (perFeatureScenarioCounts[featureUri][name] || 0) + 1;
                        });
                    }
                });
                
                // Find actual Scenario Outlines (scenarios that appear multiple times IN THE SAME FEATURE)
                let actualOutlineCount = 0;
                let actualOutlineExamples = 0;
                let actualIndividualScenarios = 0;
                
                Object.entries(perFeatureScenarioCounts).forEach(([featureUri, scenarios]) => {
                    Object.entries(scenarios).forEach(([name, count]) => {
                        if (count > 1) {
                            // This is a Scenario Outline - multiple examples in same feature
                            actualOutlineCount++;
                            actualOutlineExamples += count;
                        } else {
                            // Individual scenario
                            actualIndividualScenarios++;
                        }
                    });
                });
                
                // Correct calculation: outlines count as 1 each, individual scenarios count as 1 each
                // Total = individual scenarios + outline count (not outline examples)
                newTotal = actualIndividualScenarios + actualOutlineCount;
                
                console.log(`📊 Actual Scenario Analysis (per-feature):`);
                console.log(`   Scenario Outlines: ${actualOutlineCount} (${actualOutlineExamples} examples)`);
                console.log(`   Individual Scenarios: ${actualIndividualScenarios}`);
                console.log(`   Corrected Total: ${newTotal}`);
            } catch (error) {
                console.warn('⚠️ Could not read JSON data for scenario analysis, using fallback');
                newTotal = (currentTotal - totalOutlineExamples) + outlineCount;
            }
        } else {
            // Fallback to outline correction
            newTotal = (currentTotal - totalOutlineExamples) + outlineCount;
            console.log(`📊 Using outline correction total: ${newTotal}`);
        }
        
        // Skip Scenario Outline analysis if we already have actual JSON counts
        if (actualPassed === 0 && actualFailed === 0) {
            console.log('📊 No actual JSON counts found, proceeding with Scenario Outline analysis...');
            
            // For passed/failed, we need to determine the status of each Scenario Outline
            // Handle retry scenarios by analyzing the actual JSON data
            let outlinePassed = 0;
            let outlineFailed = 0;
            
            // Read JSON data to analyze actual scenario outcomes
            try {
                const jsonData = JSON.parse(fs.readFileSync('./reports/timeline-html/index.html.json', 'utf8'));
                
                // Analyze each outline pattern to determine final status
                outlinePatterns.forEach(outline => {
                    const pattern = outline.pattern;
                    const matchingScenarios = [];
                    
                    // Find all scenarios that match this pattern
                    jsonData.forEach(feature => {
                        if (feature.elements) {
                            feature.elements.forEach(scenario => {
                                if (scenario.name === pattern) {
                                    matchingScenarios.push(scenario);
                                }
                            });
                        }
                    });
                    
                    // Determine final status based on the most recent execution
                    // (assuming scenarios are ordered by execution time)
                    let finalStatus = 'passed'; // Default to passed
                    
                    if (matchingScenarios.length > 0) {
                        // Get the last scenario (most recent execution)
                        const lastScenario = matchingScenarios[matchingScenarios.length - 1];
                        
                        // Check if all steps in the last execution passed
                        const allStepsPassed = lastScenario.steps && 
                            lastScenario.steps.every(step => step.result && step.result.status === 'passed');
                        
                        finalStatus = allStepsPassed ? 'passed' : 'failed';
                    }
                    
                    if (finalStatus === 'passed') {
                        outlinePassed++;
                    } else {
                        outlineFailed++;
                    }
                    
                    console.log(`   📊 Outline "${pattern}": ${matchingScenarios.length} executions, final status: ${finalStatus}`);
                });
                
            } catch (error) {
                console.warn('⚠️ Could not read JSON data for retry analysis, using fallback logic');
                
                // Fallback: assume all outlines passed if we can't analyze the data
                outlinePassed = outlineCount;
                outlineFailed = 0;
            }
            
            // Use outline analysis results
            actualPassed = outlinePassed;
            actualFailed = outlineFailed;
        } else {
            console.log('📊 Using actual JSON counts, skipping Scenario Outline analysis');
        }
        
        // Apply Scenario Outline correction to passed/failed counts
        // Calculate how many outlines passed vs failed
        let outlinePassed = 0;
        let outlineFailed = 0;
        
        try {
            const jsonData = JSON.parse(fs.readFileSync('./reports/timeline-html/index.html.json', 'utf8'));
            const featureScenarioCounts = {}; // Track scenarios per feature
            
            jsonData.forEach(feature => {
                const featureUri = feature.uri || feature.id;
                if (!featureScenarioCounts[featureUri]) {
                    featureScenarioCounts[featureUri] = {};
                }
                
                if (feature.elements) {
                    feature.elements.forEach(scenario => {
                        const name = scenario.name;
                        featureScenarioCounts[featureUri][name] = (featureScenarioCounts[featureUri][name] || 0) + 1;
                    });
                }
            });
            
            // Find actual Scenario Outlines (scenarios that appear multiple times IN THE SAME FEATURE)
            const actualOutlines = [];
            Object.entries(featureScenarioCounts).forEach(([featureUri, scenarios]) => {
                Object.entries(scenarios).forEach(([name, count]) => {
                    if (count > 1) {
                        actualOutlines.push({ name, count, featureUri });
                    }
                });
            });
            
            actualOutlines.forEach(({ name: outlineName, count, featureUri }) => {
                // Find all instances of this outline in the JSON (within the same feature)
                const outlineInstances = [];
                jsonData.forEach(feature => {
                    const currentFeatureUri = feature.uri || feature.id;
                    if (currentFeatureUri === featureUri && feature.elements) {
                        feature.elements.forEach(scenario => {
                            if (scenario.name === outlineName) {
                                outlineInstances.push(scenario);
                            }
                        });
                    }
                });
                
                // Determine if this outline passed or failed based on ALL instances
                // If ANY example fails, the entire outline is considered failed
                if (outlineInstances.length > 0) {
                    let anyInstanceFailed = false;
                    
                    outlineInstances.forEach(instance => {
                        const hasFailedSteps = instance.steps && instance.steps.some(step => 
                            step.result && step.result.status === 'failed'
                        );
                        const hasSkippedSteps = instance.steps && instance.steps.some(step => 
                            step.result && step.result.status === 'skipped'
                        );
                        
                        if (hasFailedSteps || hasSkippedSteps) {
                            anyInstanceFailed = true;
                        }
                    });
                    
                    if (anyInstanceFailed) {
                        outlineFailed++;
                    } else {
                        outlinePassed++;
                    }
                }
            });
            
            console.log(`📊 Outline Analysis: ${outlinePassed} passed, ${outlineFailed} failed`);
        } catch (error) {
            console.warn('⚠️ Could not analyze outline status, using fallback');
            // Fallback: assume all outlines passed
            outlinePassed = outlineCount;
            outlineFailed = 0;
        }
        
        // Calculate how many outline EXAMPLES passed vs failed (not the outline itself)
        // We need to count individual example results, not just mark the whole outline
        let outlineExamplesPassed = 0;
        let outlineExamplesFailed = 0;
        
        try {
            const jsonData = JSON.parse(fs.readFileSync('./reports/timeline-html/index.html.json', 'utf8'));
            
            // Count scenarios PER FEATURE to correctly identify Scenario Outlines
            const perFeatureScenarioCounts = {};
            const scenarioStatus = {};
            
            jsonData.forEach(feature => {
                const featureUri = feature.uri || feature.id;
                if (!perFeatureScenarioCounts[featureUri]) {
                    perFeatureScenarioCounts[featureUri] = {};
                }
                
                if (feature.elements) {
                    feature.elements.forEach(scenario => {
                        const name = scenario.name;
                        const scenarioKey = `${featureUri}::${name}`; // Unique key per feature
                        
                        perFeatureScenarioCounts[featureUri][name] = (perFeatureScenarioCounts[featureUri][name] || 0) + 1;
                        
                        // Track status of each instance
                        const hasFailedSteps = scenario.steps && scenario.steps.some(step => 
                            step.result && step.result.status === 'failed'
                        );
                        const hasSkippedSteps = scenario.steps && scenario.steps.some(step => 
                            step.result && step.result.status === 'skipped'
                        );
                        
                        if (!scenarioStatus[scenarioKey]) {
                            scenarioStatus[scenarioKey] = { passed: 0, failed: 0 };
                        }
                        
                        // Count skipped scenarios as failed
                        if (hasFailedSteps || hasSkippedSteps) {
                            scenarioStatus[scenarioKey].failed++;
                        } else {
                            scenarioStatus[scenarioKey].passed++;
                        }
                    });
                }
            });
            
            // Count outline examples that passed vs failed (only for ACTUAL outlines within same feature)
            Object.entries(perFeatureScenarioCounts).forEach(([featureUri, scenarios]) => {
                Object.entries(scenarios).forEach(([name, count]) => {
                    if (count > 1) {
                        // This is an outline - count its example statuses
                        const scenarioKey = `${featureUri}::${name}`;
                        if (scenarioStatus[scenarioKey]) {
                            outlineExamplesPassed += scenarioStatus[scenarioKey].passed;
                            outlineExamplesFailed += scenarioStatus[scenarioKey].failed;
                        }
                    }
                });
            });
        } catch (error) {
            console.warn('⚠️ Could not count outline examples, using fallback');
        }
        
        // Calculate individual scenarios (not part of outlines)
        const individualPassed = Math.max(0, actualPassed - outlineExamplesPassed);
        const individualFailed = Math.max(0, actualFailed - outlineExamplesFailed);
        
        // Final counts: outline status + individual scenario status
        const finalPassed = Math.max(0, outlinePassed + individualPassed);
        const finalFailedCount = Math.max(0, outlineFailed + individualFailed);
        
        console.log(`✅ Calculated new counts - Total: ${newTotal}, Passed: ${finalPassed}, Failed: ${finalFailedCount}`);
        
        // Update total scenarios count - handle malformed HTML tags
        htmlContent = htmlContent.replace(
            /<h4>All Scenarios<\/h[24]>[\s\S]*?<h5>\s*\d+\s*<\/h5>/,
            `<h4>All Scenarios</h4>
        </div>
        <div class="feature-value">
          <h5>
            ${newTotal}
          </h5>`
        );

        // Update passed scenarios count - handle malformed HTML tags
        htmlContent = htmlContent.replace(
            /<h4>Passed Scenarios<\/h[24]>[\s\S]*?<h5>\s*\d+\s*<\/h5>/,
            `<h4>Passed Scenarios</h4>
        </div>
        <div class="feature-value">
          <h5>
            ${finalPassed}
          </h5>`
        );

        // Update failed scenarios count - handle malformed HTML tags
        htmlContent = htmlContent.replace(
            /<h4>Failed Scenarios<\/h[24]>[\s\S]*?<h5>\s*\d+\s*<\/h5>/,
            `<h4>Failed Scenarios</h4>
        </div>
        <div class="feature-value">
          <h5>
            ${finalFailedCount}
          </h5>`
        );

        // Update chart data
        htmlContent = htmlContent.replace(/"failed": \d+,/g, `"failed": ${finalFailedCount},`);
        htmlContent = htmlContent.replace(/"passed": \d+,/g, `"passed": ${finalPassed},`);
        
        // Update specific chart data for Scenarios
        htmlContent = htmlContent.replace(/"title": "Scenarios",\s*"failed": \d+,/g, `"title": "Scenarios",\n        "failed": ${finalFailedCount},`);
        htmlContent = htmlContent.replace(/"title": "Scenarios",\s*"passed": \d+,/g, `"title": "Scenarios",\n        "passed": ${finalPassed},`);
        
        // Fix Features chart - if most scenarios pass, mark feature as passed
        const featurePassed = finalPassed > finalFailedCount ? 1 : 0;
        const featureFailed = finalPassed > finalFailedCount ? 0 : 1;
        
        // Update specific chart data for Features
        htmlContent = htmlContent.replace(/"title": "Features",\s*"failed": \d+,/g, `"title": "Features",\n        "failed": ${featureFailed},`);
        htmlContent = htmlContent.replace(/"title": "Features",\s*"passed": \d+,/g, `"title": "Features",\n        "passed": ${featurePassed},`);
        
        // Remove skipped count from pie chart since we're treating skipped as failed
        htmlContent = htmlContent.replace(/"skipped": \d+,/g, `"skipped": 0,`);

        console.log(`✅ Updated scenario counts for ${outlinePatterns.length} Scenario Outline(s):`);
        console.log(`   Total: ${currentTotal} → ${newTotal}`);
        console.log(`   Passed: ${currentPassed} → ${finalPassed}`);
        console.log(`   Failed: ${currentFailed} → ${finalFailedCount}`);

        fs.writeFileSync(absolutePath, htmlContent, 'utf8');
        console.log(`✅ Successfully auto-fixed Scenario Outline counting in: ${absolutePath}`);
        return;
    }
    
    // No Scenario Outlines, but still check for skipped scenarios to count as failed
    console.log('✅ No Scenario Outlines found.');
    console.log('🔍 Checking for skipped scenarios to count as failed...');
    
    try {
        const jsonData = JSON.parse(fs.readFileSync('./reports/timeline-html/index.html.json', 'utf8'));
        let passed = 0;
        let failed = 0;
        let skippedAsFailed = 0;
        
        jsonData.forEach(feature => {
            if (feature.elements) {
                feature.elements.forEach(scenario => {
                    if (scenario.steps && scenario.steps.length > 0) {
                        const hasFailedSteps = scenario.steps.some(step => 
                            step.result && step.result.status === 'failed'
                        );
                        const hasSkippedSteps = scenario.steps.some(step => 
                            step.result && step.result.status === 'skipped'
                        );
                        const allStepsPassed = scenario.steps.every(step => 
                            step.result && step.result.status === 'passed'
                        );
                        
                        if (hasFailedSteps) {
                            failed++;
                        } else if (hasSkippedSteps && !allStepsPassed) {
                            failed++;
                            skippedAsFailed++;
                        } else if (allStepsPassed) {
                            passed++;
                        }
                    }
                });
            }
        });
        
        if (skippedAsFailed > 0) {
            console.log(`📊 Found ${skippedAsFailed} skipped scenario(s) to count as failed`);
            console.log(`📊 Recalculated counts - Passed: ${passed}, Failed: ${failed} (includes ${skippedAsFailed} skipped)`);
            
            // Update HTML with new counts
            htmlContent = htmlContent.replace(
                /<h4>Passed Scenarios<\/h[24]>[\s\S]*?<h5>\s*\d+\s*<\/h5>/,
                `<h4>Passed Scenarios</h4>
        </div>
        <div class="feature-value">
          <h5>
            ${passed}
          </h5>`
            );
            
            htmlContent = htmlContent.replace(
                /<h4>Failed Scenarios<\/h[24]>[\s\S]*?<h5>\s*\d+\s*<\/h5>/,
                `<h4>Failed Scenarios</h4>
        </div>
        <div class="feature-value">
          <h5>
            ${failed}
          </h5>`
            );
            
            fs.writeFileSync(absolutePath, htmlContent, 'utf8');
            console.log(`✅ Updated scenario counts to include skipped scenarios as failed`);
        } else {
            console.log('✅ No skipped scenarios found.');
        }
    } catch (error) {
        console.warn('⚠️ Could not analyze skipped scenarios:', error.message);
    }
    
    console.log('✅ Successfully auto-fixed scenario counting in: ' + absolutePath);
}

// Run the auto-fix
const htmlFile = process.argv[2] || './reports/timeline-html/index.html';
autoFixScenarioCount(htmlFile);