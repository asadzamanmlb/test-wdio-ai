#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { glob } = require('glob');

// Performance tracking
const startTime = Date.now();
let fileCache = new Map();

// Command line options
const args = process.argv.slice(2);
const options = {
  help: args.includes('--help')
};

if (options.help) {
  console.log(`
Cursor Rules Checker - Unused Imports Detection

Usage: node scripts/check-cursor-rules.cjs [options]

Options:
  --help           Show this help message

Examples:
  node scripts/check-cursor-rules.cjs                    # Check unused imports
  `);
  process.exit(0);
}

// File caching for performance
function readFileCached(filePath) {
  if (fileCache.has(filePath)) {
    return fileCache.get(filePath);
  }
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    fileCache.set(filePath, content);
    return content;
  } catch (error) {
    console.warn(`Warning: Could not read file ${filePath}: ${error.message}`);
    return '';
  }
}

// Check for unused imports
async function checkUnusedImports() {
  console.log('🔍 Checking for unused imports...');
  
  const jsFiles = await glob('**/*.js', { 
    ignore: ['node_modules/**', 'allure-results/**', 'reports/**', 'temp/**', 'logs/**'] 
  });
  
  let hasUnusedImports = false;
  
  for (const file of jsFiles) {
    const content = readFileCached(file);
    const unusedImports = findUnusedImports(content, file);
    
    if (unusedImports.length > 0) {
      hasUnusedImports = true;
      console.log(`❌ Unused imports in ${file}:`);
      unusedImports.forEach(importInfo => {
        console.log(`  - ${importInfo.name} (line ${importInfo.line})`);
      });
    }
  }
  
  if (!hasUnusedImports) {
    console.log('✅ No unused imports found');
  }
  
  return !hasUnusedImports;
}

// Check for unused variables
async function checkUnusedVariables() {
  console.log('🔍 Checking for unused variables...');
  
  const jsFiles = await glob('**/*.js', { 
    ignore: ['node_modules/**', 'allure-results/**', 'reports/**', 'temp/**', 'logs/**'] 
  });
  
  let hasUnusedVariables = false;
  
  for (const file of jsFiles) {
    const content = readFileCached(file);
    const unusedVariables = findUnusedVariables(content, file);
    
    if (unusedVariables.length > 0) {
      hasUnusedVariables = true;
      console.log(`❌ Unused variables in ${file}:`);
      unusedVariables.forEach(variableInfo => {
        console.log(`  - ${variableInfo.name} (line ${variableInfo.line})`);
      });
    }
  }
  
  if (!hasUnusedVariables) {
    console.log('✅ No unused variables found');
  }
  
  return !hasUnusedVariables;
}

// Find unused imports in a file
function findUnusedImports(content, filePath) {
  const lines = content.split('\n');
  const imports = [];
  const unusedImports = [];
  let inBlockComment = false;
  
  // Extract import statements
  lines.forEach((line, index) => {
    const trimmedLine = line.trim();
    
    // Handle block comments
    if (trimmedLine.includes('/*')) {
      inBlockComment = true;
    }
    if (trimmedLine.includes('*/')) {
      inBlockComment = false;
      return; // Skip this line as it ends a block comment
    }
    
    // Skip commented lines and lines inside block comments
    if (inBlockComment || 
        trimmedLine.startsWith('//') || 
        trimmedLine.startsWith('/*') || 
        trimmedLine.startsWith('*')) {
      return;
    }
    
    // Handle different import patterns
    const importPatterns = [
      // import { name1, name2 } from 'module'
      /import\s*\{\s*([^}]+)\s*\}\s*from\s*['"`]([^'"`]+)['"`]/,
      // import name from 'module'
      /import\s+(\w+)\s+from\s*['"`]([^'"`]+)['"`]/,
      // import * as name from 'module'
      /import\s*\*\s*as\s+(\w+)\s+from\s*['"`]([^'"`]+)['"`]/,
      // const { name1, name2 } = require('module')
      /const\s*\{\s*([^}]+)\s*\}\s*=\s*require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/,
      // const name = require('module')
      /const\s+(\w+)\s*=\s*require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/
    ];
    
    for (const pattern of importPatterns) {
      const match = trimmedLine.match(pattern);
      if (match) {
        const importNames = match[1].split(',').map(name => {
          const trimmedName = name.trim();
          // Handle aliased imports (e.g., "sync as globSync" -> "globSync")
          const aliasMatch = trimmedName.match(/(.+)\s+as\s+(\w+)/);
          return aliasMatch ? aliasMatch[2] : trimmedName;
        });
        const moduleName = match[2];
        
        importNames.forEach(name => {
          if (name && !name.includes('*')) {
            imports.push({
              name: name,
              line: index + 1,
              module: moduleName,
              fullLine: line
            });
          }
        });
        break;
      }
    }
  });
  
  // Check if each import is used
  imports.forEach(importInfo => {
    const isUsed = isImportUsed(content, importInfo.name, importInfo.line);
    if (!isUsed) {
      unusedImports.push(importInfo);
    }
  });
  
  return unusedImports;
}

// Check if an import is used in the file content
function isImportUsed(content, importName, importLine) {
  const lines = content.split('\n');
  
  // Remove the import line itself from checking
  const contentWithoutImport = lines
    .filter((_, index) => index + 1 !== importLine)
    .join('\n');
  
  // Escape special regex characters in import name
  const escapedImportName = importName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // Check for various usage patterns
  const usagePatterns = [
    new RegExp(`\\b${escapedImportName}\\b`, 'g'),  // Direct usage
    new RegExp(`${escapedImportName}\\.`, 'g'),     // Method/property access
    new RegExp(`${escapedImportName}\\(`, 'g'),     // Function call
    new RegExp(`${escapedImportName}\\[`, 'g'),     // Array/object access
    new RegExp(`new\\s+${escapedImportName}`, 'g'), // Constructor
    new RegExp(`extends\\s+${escapedImportName}`, 'g'), // Class extension
    new RegExp(`await\\s+${escapedImportName}\\(`, 'g'), // Async function call
    new RegExp(`=\\s*${escapedImportName}\\(`, 'g'), // Assignment with function call
  ];
  
  return usagePatterns.some(pattern => pattern.test(contentWithoutImport));
}

// Find unused variables in a file
function findUnusedVariables(content, filePath) {
  const lines = content.split('\n');
  const variables = [];
  const unusedVariables = [];
  let inBlockComment = false;
  
  // Extract variable declarations
  lines.forEach((line, index) => {
    const trimmedLine = line.trim();
    
    // Handle block comments (but ignore /* and */ inside strings)
    // Remove strings from the line to avoid false positives
    const lineWithoutStrings = trimmedLine.replace(/["'`].*?["'`]/g, '');
    
    if (lineWithoutStrings.includes('/*')) {
      inBlockComment = true;
    }
    if (lineWithoutStrings.includes('*/')) {
      inBlockComment = false;
      return; // Skip this line as it ends a block comment
    }
    
    // Skip commented lines and lines inside block comments
    if (inBlockComment || 
        trimmedLine.startsWith('//') || 
        trimmedLine.startsWith('/*') || 
        trimmedLine.startsWith('*')) {
      return;
    }
    
    // Handle different variable declaration patterns
    const variablePatterns = [
      // const variableName = value (but not exports)
      /(?!export\s)const\s+(\w+)\s*=/,
      // let variableName = value
      /let\s+(\w+)\s*=/,
      // var variableName = value
      /var\s+(\w+)\s*=/,
      // const { variableName } = object
      /const\s*\{\s*(\w+)\s*[,\}]/,
      // let { variableName } = object
      /let\s*\{\s*(\w+)\s*[,\}]/,
      // var { variableName } = object
      /var\s*\{\s*(\w+)\s*[,\}]/,
      // const [variableName] = array (but not numbers)
      /const\s*\[\s*(\w+)\s*[,\]]/,
      // let [variableName] = array (but not numbers)
      /let\s*\[\s*(\w+)\s*[,\]]/,
      // var [variableName] = array (but not numbers)
      /var\s*\[\s*(\w+)\s*[,\]]/,
      // Function parameters
      /function\s+\w+\s*\(\s*(\w+)\s*[,\)]/,
    ];
    
    for (const pattern of variablePatterns) {
      const match = trimmedLine.match(pattern);
      if (match) {
        const variableName = match[1];
        
        // Skip variables that start with underscore (intentionally unused)
        if (variableName.startsWith('_')) {
          continue;
        }
        
        // Skip numbers (array destructuring with numbers)
        if (/^\d+$/.test(variableName)) {
          continue;
        }
        
        // Skip export statements
        if (trimmedLine.startsWith('export') || trimmedLine.includes('export const')) {
          continue;
        }
        
        // Skip common framework variables
        const frameworkVariables = ['$', 'browser', 'driver', 'expect', 'assert'];
        if (frameworkVariables.includes(variableName)) {
          continue;
        }
        
        // Skip variables that are clearly not variable names (numbers, special chars, boolean literals)
        if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(variableName) || 
            ['true', 'false', 'null', 'undefined'].includes(variableName)) {
          continue;
        }
        
        variables.push({
          name: variableName,
          line: index + 1,
          fullLine: line
        });
        break;
      }
    }
  });
  
  // Handle destructuring patterns - properly track and detect usage
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmedLine = line.trim();
    
    // Skip commented lines
    if (trimmedLine.startsWith('//') || 
        trimmedLine.startsWith('/*') || 
        trimmedLine.startsWith('*')) {
      i++;
      continue;
    }
    
    // Multi-line object destructuring: const { \n  a, \n  b \n } = obj
    const multiLineObjectStart = trimmedLine.match(/(?:const|let|var)\s*\{/);
    if (multiLineObjectStart) {
      // Find the closing brace and collect all lines
      let braceCount = 0;
      let destructuringLines = [];
      let j = i;
      
      while (j < lines.length) {
        const currentLine = lines[j];
        
        // Count braces
        for (const char of currentLine) {
          if (char === '{') braceCount++;
          if (char === '}') braceCount--;
        }
        
        destructuringLines.push(currentLine);
        
        if (braceCount === 0) {
          break;
        }
        j++;
      }
      
      // Extract variable names from all destructuring lines
      const fullDestructuringText = destructuringLines.join(' ');
      const variableMatches = fullDestructuringText.match(/\{\s*([^}]+)\s*\}/);
      if (variableMatches) {
        const destructuredContent = variableMatches[1];
        const variableNames = destructuredContent
          .split(',')
          .map(name => name.trim())
          .map(name => name.replace(/:\s*\w+/, '')) // Remove aliases like {a: b}
          .map(name => name.replace(/\s*=\s*.*/, '')) // Remove default values like {a = 1}
          .filter(name => /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name)) // Only valid variable names
          .filter(name => !name.startsWith('_')) // Skip intentionally unused
          .filter(name => !/^\d+$/.test(name)) // Skip numbers
          .filter(name => !['true', 'false', 'null', 'undefined', 'if', 'while', 'catch', 'constructor'].includes(name)); // Skip keywords
        
        // Add each destructured variable to the tracking array
        for (const variableName of variableNames) {
          variables.push({
            name: variableName,
            line: i + 1,
            fullLine: line
          });
        }
      }
      
      // Skip to the end of the destructuring block
      i = j + 1;
    } else {
      i++;
    }
  }
  
  // Check if each variable is used
  variables.forEach(variableInfo => {
    const isUsed = isVariableUsed(content, variableInfo.name, variableInfo.line);
    if (!isUsed) {
      unusedVariables.push(variableInfo);
    }
  });
  
  return unusedVariables;
}

// Check if a variable is used in the file content
function isVariableUsed(content, variableName, variableLine) {
  const lines = content.split('\n');
  
  // Remove the variable declaration line itself from checking
  const contentWithoutDeclaration = lines
    .filter((_, index) => index + 1 !== variableLine)
    .join('\n');
  
  // Escape special regex characters in variable name
  const escapedVariableName = variableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // Check for various usage patterns
  const usagePatterns = [
    new RegExp(`\\b${escapedVariableName}\\b`, 'g'),  // Direct usage
    new RegExp(`${escapedVariableName}\\.`, 'g'),     // Method/property access
    new RegExp(`${escapedVariableName}\\(`, 'g'),     // Function call
    new RegExp(`${escapedVariableName}\\[`, 'g'),     // Array/object access
    new RegExp(`\\$\\{${escapedVariableName}\\}`, 'g'), // Template literal
    new RegExp(`new\\s+${escapedVariableName}`, 'g'), // Constructor
    new RegExp(`extends\\s+${escapedVariableName}`, 'g'), // Class extension
    new RegExp(`await\\s+${escapedVariableName}\\(`, 'g'), // Async function call
    new RegExp(`=\\s*${escapedVariableName}\\(`, 'g'), // Assignment with function call
    new RegExp(`for\\s*\\([^)]*${escapedVariableName}[^)]*\\)`, 'g'), // For loop variable
    new RegExp(`\\.some\\s*\\([^)]*${escapedVariableName}[^)]*\\)`, 'g'), // Array.some callback
    new RegExp(`\\.map\\s*\\([^)]*${escapedVariableName}[^)]*\\)`, 'g'), // Array.map callback
    new RegExp(`\\.filter\\s*\\([^)]*${escapedVariableName}[^)]*\\)`, 'g'), // Array.filter callback
    new RegExp(`\\.forEach\\s*\\([^)]*${escapedVariableName}[^)]*\\)`, 'g'), // Array.forEach callback
    new RegExp(`\\.reduce\\s*\\([^)]*${escapedVariableName}[^)]*\\)`, 'g'), // Array.reduce callback
    new RegExp(`\\s+${escapedVariableName}\\s*=>`, 'g'), // Arrow function parameter
    new RegExp(`\\([^)]*${escapedVariableName}[^)]*\\)`, 'g'), // Function parameter
    new RegExp(`\\{\\s*[^}]*\\}\\s*=\\s*${escapedVariableName}\\b`, 'g'), // Object destructuring assignment
    new RegExp(`\\[\\s*[^\\]]*\\]\\s*=\\s*${escapedVariableName}\\b`, 'g'), // Array destructuring assignment
    new RegExp(`\\{\\s*[^}]*\\}\\s*=\\s*${escapedVariableName};`, 'g'), // Object destructuring assignment with semicolon
    new RegExp(`\\[\\s*[^\\]]*\\]\\s*=\\s*${escapedVariableName};`, 'g') // Array destructuring assignment with semicolon
  ];
  
  // Remove destructuring patterns that would cause false positives
  // Only remove destructuring DECLARATIONS (const { a, b } = process.env), not assignments (const { a } = variable)
  let contentWithoutDestructuring = contentWithoutDeclaration;
  
  // Remove object destructuring DECLARATIONS: const { a, b } = process.env
  contentWithoutDestructuring = contentWithoutDestructuring
    .replace(/^\s*(?:const|let|var)\s*\{[^}]*\}\s*=\s*process\.env[^;]*;?/gm, '') // Single line
    .replace(/^\s*(?:const|let|var)\s*\{[\s\S]*?\}\s*=\s*process\.env[^;]*;?/gm, ''); // Multi line
  
  // Remove array destructuring DECLARATIONS: const [a, b] = process.env
  contentWithoutDestructuring = contentWithoutDestructuring
    .replace(/^\s*(?:const|let|var)\s*\[[^\]]*\]\s*=\s*process\.env[^;]*;?/gm, '') // Single line
    .replace(/^\s*(?:const|let|var)\s*\[[\s\S]*?\]\s*=\s*process\.env[^;]*;?/gm, ''); // Multi line
  
  return usagePatterns.some(pattern => pattern.test(contentWithoutDestructuring));
}

// Check for unused functions
async function checkUnusedFunctions() {
  console.log('🔍 Checking for unused functions...');
  
  const files = await glob('**/*.js', {
    ignore: ['node_modules/**', '**/*.min.js', 'dist/**', 'build/**'],
    absolute: true
  });
  
  const unusedFunctions = [];
  
  for (const file of files) {
    const content = readFileCached(file);
    const functions = findFunctions(content);
    
    for (const func of functions) {
      const isUsed = await isFunctionUsedAcrossFiles(func.name, file, files);
      if (!isUsed) {
        unusedFunctions.push({
          file,
          name: func.name,
          line: func.line
        });
      }
    }
  }
  
  if (unusedFunctions.length === 0) {
    console.log('✅ No unused functions found\n');
    return true;
  }
  
  console.log('❌ Unused functions found:');
  for (const func of unusedFunctions) {
    const relativePath = path.relative(process.cwd(), func.file);
    console.log(`  - ${func.name} in ${relativePath} (line ${func.line})`);
  }
  console.log('');
  
  return false;
}

// Find all function declarations in a file
function findFunctions(content) {
  const functions = [];
  const lines = content.split('\n');
  
  // Function declaration patterns
  const patterns = [
    // Traditional function: function name() {}
    /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/g,
    // Const/let/var with function: const name = function() {}
    /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?function\s*\(/g,
    // Arrow function: const name = () => {}
    /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/g,
    // Arrow function without parens: const name = x => {}
    /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\w+\s*=>/g
  ];
  
  lines.forEach((line, index) => {
    for (const pattern of patterns) {
      const matches = line.matchAll(pattern);
      for (const match of matches) {
        if (match[1]) {
          functions.push({
            name: match[1],
            line: index + 1
          });
        }
      }
    }
  });
  
  return functions;
}

// Check if a function is used across files
async function isFunctionUsedAcrossFiles(functionName, declaringFile, allFiles) {
  const declaringContent = readFileCached(declaringFile);
  
  // Check if used in the same file (excluding the declaration line)
  const declarationPattern = new RegExp(
    `(?:export\\s+)?(?:const|let|var|async\\s+function|function)\\s+${functionName}\\b`
  );
  const declarationMatch = declaringContent.match(declarationPattern);
  
  let contentWithoutDeclaration = declaringContent;
  if (declarationMatch) {
    contentWithoutDeclaration = declaringContent.replace(declarationPattern, '');
  }
  
  // Check for function usage in the same file
  const usagePattern = new RegExp(`\\b${functionName}\\s*\\(`);
  if (usagePattern.test(contentWithoutDeclaration)) {
    return true;
  }
  
  // Check if exported and used in other files
  const isExported = /export\s+(?:default\s+)?(?:async\s+)?(?:function\s+|const\s+|let\s+|var\s+)?/.test(
    declaringContent.match(new RegExp(`export[^;]*\\b${functionName}\\b`, 'm'))?.[0] || ''
  );
  
  if (!isExported) {
    return false; // Not exported, so can't be used elsewhere
  }
  
  // Check other files for imports and usage
  for (const file of allFiles) {
    if (file === declaringFile) continue;
    
    const content = readFileCached(file);
    
    // Check for import
    const importPatterns = [
      new RegExp(`import\\s+(?:\\w+\\s*,\\s*)?{[^}]*\\b${functionName}\\b[^}]*}`, 'm'),
      new RegExp(`import\\s+${functionName}\\b`, 'm'),
      new RegExp(`require\\([^)]*\\)[\\s\\S]*\\b${functionName}\\b`, 'm')
    ];
    
    const isImported = importPatterns.some(pattern => pattern.test(content));
    if (isImported) {
      // Check if used after import
      if (usagePattern.test(content)) {
        return true;
      }
    }
  }
  
  return false;
}

// Check for unused class methods and getters
async function checkUnusedClassMethods() {
  console.log('🔍 Checking for unused class methods...');
  
  const files = await glob('**/*.js', {
    ignore: ['node_modules/**', '**/*.min.js', 'dist/**', 'build/**'],
    absolute: true
  });
  
  const unusedMethods = [];
  
  for (const file of files) {
    const content = readFileCached(file);
    
    // Only check files that contain class definitions
    if (!content.includes('class ')) continue;
    
    const methods = findClassMethods(content);
    
    for (const method of methods) {
      const isUsed = await isClassMethodUsedAcrossFiles(method.name, file, files);
      if (!isUsed) {
        unusedMethods.push({
          file,
          name: method.name,
          line: method.line,
          type: method.type
        });
      }
    }
  }
  
  if (unusedMethods.length === 0) {
    console.log('✅ No unused class methods found\n');
    return true;
  }
  
  console.log('❌ Unused class methods found:');
  for (const method of unusedMethods) {
    const relativePath = path.relative(process.cwd(), method.file);
    console.log(`  - ${method.type} ${method.name} in ${relativePath} (line ${method.line})`);
  }
  console.log('');
  
  return false;
}

// Check for duplicate Cucumber steps
async function checkDuplicateSteps() {
  console.log('🔍 Checking for duplicate steps...');

  const stepFiles = await glob('**/step-definitions/**/*.js', {
    ignore: ['node_modules/**', '**/*.min.js', 'dist/**', 'build/**'],
    absolute: true
  });

  const allStepDefinitions = [];
  
  // Extract all step definitions with their file information
  for (const file of stepFiles) {
    const content = readFileCached(file);
    const steps = findStepDefinitions(content, file);
    allStepDefinitions.push(...steps);
  }

  // Group steps by their text to find duplicates
  const stepGroups = {};
  for (const step of allStepDefinitions) {
    const key = `${step.type}:${step.text}`;
    if (!stepGroups[key]) {
      stepGroups[key] = [];
    }
    stepGroups[key].push(step);
  }

  // Also group by text only to catch same text with different types
  const textGroups = {};
  for (const step of allStepDefinitions) {
    if (!textGroups[step.text]) {
      textGroups[step.text] = [];
    }
    textGroups[step.text].push(step);
  }

  const duplicateSteps = [];
  
  // Helper function to extract project folder (features, xray)
  const getProjectFolder = (filePath) => {
    const normalized = path.normalize(filePath);
    const parts = normalized.split(path.sep);
    
    // Look for known project folders
    const projectFolders = ['features', 'xray'];
    for (const folder of projectFolders) {
      if (parts.includes(folder)) {
        return folder;
      }
    }
    return null;
  };
  
  // Check for exact duplicates (same type and text)
  for (const [key, steps] of Object.entries(stepGroups)) {
    if (steps.length > 1) {
      // Check if duplicates are across different project folders
      const projectFolders = [...new Set(steps.map(step => getProjectFolder(step.file)))];
      
      // If all duplicates are in different project folders (features, xray), skip
      // This allows intentional duplicates for project independence
      if (projectFolders.length > 1 && projectFolders.every(folder => folder !== null)) {
        continue; // Skip this duplicate, it's across different projects
      }
      
      duplicateSteps.push({
        text: steps[0].text,
        type: steps[0].type,
        locations: steps.map(step => ({
          file: step.file,
          line: step.line
        })),
        isExactDuplicate: true
      });
    }
  }
  
  // Check for text duplicates (same text, different types)
  for (const [text, steps] of Object.entries(textGroups)) {
    if (steps.length > 1) {
      // Group by file to avoid flagging legitimate different types in different files
      const fileGroups = {};
      for (const step of steps) {
        if (!fileGroups[step.file]) {
          fileGroups[step.file] = [];
        }
        fileGroups[step.file].push(step);
      }
      
      // Only flag if same file has multiple types for same text
      for (const [file, fileSteps] of Object.entries(fileGroups)) {
        if (fileSteps.length > 1) {
          const types = [...new Set(fileSteps.map(step => step.type))];
          if (types.length > 1) {
            duplicateSteps.push({
              text: text,
              type: types.join('/'),
              locations: fileSteps.map(step => ({
                file: step.file,
                line: step.line
              })),
              isExactDuplicate: false
            });
          }
        }
      }
    }
  }

  if (duplicateSteps.length === 0) {
    console.log('✅ No duplicate steps found\n');
    return true;
  }

  console.log('❌ Duplicate steps found:');
  for (const duplicate of duplicateSteps) {
    if (duplicate.isExactDuplicate) {
      console.log(`  - ${duplicate.type} "${duplicate.text}" (exact duplicate)`);
    } else {
      console.log(`  - ${duplicate.type} "${duplicate.text}" (same text, different types)`);
    }
    for (const location of duplicate.locations) {
      const relativePath = path.relative(process.cwd(), location.file);
      console.log(`    - ${relativePath} (line ${location.line})`);
    }
  }
  console.log('');

  return false;
}

// Check gitignore compliance
async function checkGitignoreCompliance() {
  console.log('🔍 Checking gitignore compliance...');
  
  try {
    const { execSync } = require('child_process');
    
    // Read .gitignore file
    const gitignorePath = path.join(process.cwd(), '.gitignore');
    if (!fs.existsSync(gitignorePath)) {
      console.log('⚠️  No .gitignore file found');
      return true;
    }
    
    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
    const gitignorePatterns = gitignoreContent
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));
    
    if (gitignorePatterns.length === 0) {
      console.log('⚠️  .gitignore file is empty');
      return true;
    }
    
    // Get list of tracked files
    let trackedFiles = [];
    try {
      const trackedOutput = execSync('git ls-files', { encoding: 'utf8' });
      trackedFiles = trackedOutput.split('\n').filter(file => file.trim());
    } catch (error) {
      console.log('⚠️  Could not get tracked files from git');
      return true;
    }
    
    // Get list of ignored files
    let ignoredFiles = [];
    try {
      const ignoredOutput = execSync('git status --ignored --porcelain', { encoding: 'utf8' });
      ignoredFiles = ignoredOutput
        .split('\n')
        .filter(line => line.startsWith('!!'))
        .map(line => line.substring(3).trim())
        .filter(file => file);
    } catch (error) {
      console.log('⚠️  Could not get ignored files from git');
      return true;
    }
    
    // Check for violations - files that should be ignored but are tracked
    const violations = [];
    
    for (const pattern of gitignorePatterns) {
      // Skip patterns that are too broad or might cause false positives
      if (pattern === '*' || pattern === '.*' || pattern.includes('**')) {
        continue;
      }
      
      // Check if any tracked files match this gitignore pattern
      for (const trackedFile of trackedFiles) {
        if (matchesGitignorePattern(trackedFile, pattern)) {
          violations.push({
            file: trackedFile,
            pattern: pattern,
            reason: 'Tracked file matches gitignore pattern'
          });
        }
      }
    }
    
    // Check for common violations with more precise matching
    const commonViolations = [
      { pattern: 'node_modules', description: 'node_modules directory', isDirectory: true },
      { pattern: 'logs', description: 'logs directory', isDirectory: true },
      { pattern: 'temp', description: 'temp directory', isDirectory: true },
      { pattern: 'reports', description: 'reports directory', isDirectory: true },
      { pattern: 'allure-results', description: 'allure-results directory', isDirectory: true },
      { pattern: 'okta-token.json', description: 'okta-token.json file', isDirectory: false },
      { pattern: '.DS_Store', description: '.DS_Store files', isDirectory: false }
    ];
    
    for (const violation of commonViolations) {
      let matchingFiles = [];
      
      if (violation.isDirectory) {
        // For directories, check if file is inside the directory
        matchingFiles = trackedFiles.filter(file => 
          file.startsWith(violation.pattern + '/') || 
          file.includes('/' + violation.pattern + '/')
        );
      } else {
        // For files, check exact matches or files in directories with that name
        matchingFiles = trackedFiles.filter(file => 
          file.endsWith('/' + violation.pattern) || 
          file === violation.pattern ||
          file.endsWith(violation.pattern)
        );
      }
      
      if (matchingFiles.length > 0) {
        violations.push({
          file: matchingFiles[0],
          pattern: violation.pattern,
          reason: `Tracked file contains ${violation.description}`
        });
      }
    }
    
    if (violations.length === 0) {
      console.log('✅ Gitignore compliance verified - no violations found');
      console.log(`   - ${gitignorePatterns.length} gitignore patterns checked`);
      console.log(`   - ${trackedFiles.length} tracked files verified`);
      console.log(`   - ${ignoredFiles.length} files properly ignored`);
      return true;
    }
    
    console.log('❌ Gitignore compliance violations found:');
    for (const violation of violations) {
      console.log(`  - ${violation.file} (matches pattern: ${violation.pattern})`);
      console.log(`    Reason: ${violation.reason}`);
    }
    console.log('');
    
    return false;
    
  } catch (error) {
    console.log(`⚠️  Error checking gitignore compliance: ${error.message}`);
    return true; // Don't fail the build for gitignore check errors
  }
}

// Helper function to check if a file matches a gitignore pattern
function matchesGitignorePattern(filePath, pattern) {
  // More precise pattern matching for common gitignore patterns
  // This is a basic implementation - git's actual pattern matching is more complex
  
  // Handle directory patterns (ending with /)
  if (pattern.endsWith('/')) {
    const dirPattern = pattern.slice(0, -1);
    return filePath.startsWith(dirPattern + '/') || 
           filePath.includes('/' + dirPattern + '/') ||
           filePath === dirPattern;
  }
  
  // Handle wildcard patterns (*.ext)
  if (pattern.includes('*')) {
    const regexPattern = pattern
      .replace(/\*/g, '.*')  // Convert * to .*
      .replace(/\./g, '\\.'); // Escape dots
    const regex = new RegExp('^' + regexPattern + '$');
    return regex.test(filePath);
  }
  
  // Handle exact file matches (containing .)
  if (pattern.includes('.') && !pattern.includes('*')) {
    return filePath.endsWith('/' + pattern) || 
           filePath === pattern ||
           filePath.endsWith(pattern);
  }
  
  // Handle directory name matches (more precise)
  return filePath.startsWith(pattern + '/') || 
         filePath.includes('/' + pattern + '/') ||
         filePath === pattern;
}

// Check for unused Cucumber steps
async function checkUnusedSteps() {
  console.log('🔍 Checking for unused steps...');

  const stepFiles = await glob('**/step-definitions/**/*.js', {
    ignore: ['node_modules/**', '**/*.min.js', 'dist/**', 'build/**'],
    absolute: true
  });

  const featureFiles = await glob('**/*.feature', {
    ignore: ['node_modules/**', '**/*.min.js', 'dist/**', 'build/**'],
    absolute: true
  });

  const unusedSteps = [];

  // Extract all step definitions
  const allStepDefinitions = [];
  for (const file of stepFiles) {
    const content = readFileCached(file);
    const steps = findStepDefinitions(content, file);
    allStepDefinitions.push(...steps);
  }

  // Extract all step usages from feature files
  const allStepUsages = [];
  for (const file of featureFiles) {
    const content = readFileCached(file);
    const usages = findStepUsages(content);
    allStepUsages.push(...usages);
  }

  // Check which steps are unused
  for (const stepDef of allStepDefinitions) {
    const isUsed = isStepUsed(stepDef, allStepUsages);
    if (!isUsed) {
      unusedSteps.push(stepDef);
    }
  }

  if (unusedSteps.length === 0) {
    console.log('✅ No unused steps found\n');
    return true;
  }

  console.log('❌ Unused steps found:');
  for (const step of unusedSteps) {
    const relativePath = path.relative(process.cwd(), step.file);
    console.log(`  - "${step.text}" in ${relativePath} (line ${step.line})`);
  }
  console.log('');

  return false;
}

// Find step definitions in JavaScript files
function findStepDefinitions(content, filePath) {
  const steps = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) continue;
    
    // Match step definition patterns
    const stepPatterns = [
      // Given('step text', function)
      { pattern: /(?:export\s+)?Given\s*\(\s*['"`]([^'"`]+)['"`]\s*,/, isRegex: false },
      // When('step text', function)
      { pattern: /(?:export\s+)?When\s*\(\s*['"`]([^'"`]+)['"`]\s*,/, isRegex: false },
      // Then('step text', function)
      { pattern: /(?:export\s+)?Then\s*\(\s*['"`]([^'"`]+)['"`]\s*,/, isRegex: false },
      // Given(/regex/, function)
      { pattern: /(?:export\s+)?Given\s*\(\s*\/([^\/]+)\/\s*,/, isRegex: true },
      // When(/regex/, function)
      { pattern: /(?:export\s+)?When\s*\(\s*\/([^\/]+)\/\s*,/, isRegex: true },
      // Then(/regex/, function)
      { pattern: /(?:export\s+)?Then\s*\(\s*\/([^\/]+)\/\s*,/, isRegex: true }
    ];
    
    for (const stepPattern of stepPatterns) {
      const match = trimmed.match(stepPattern.pattern);
      if (match) {
        const stepText = match[1];
        const stepType = trimmed.includes('Given') ? 'Given' : 
                        trimmed.includes('When') ? 'When' : 'Then';
        
        steps.push({
          text: stepText,
          type: stepType,
          line: i + 1,
          file: filePath,
          fullLine: line,
          isRegex: stepPattern.isRegex
        });
        break;
      }
    }
  }
  
  return steps;
}

// Find step usages in feature files
function findStepUsages(content) {
  const usages = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Match step usage patterns
    const usagePatterns = [
      /^\s*(Given|When|Then|And|But)\s+(.+)$/
    ];

    for (const pattern of usagePatterns) {
      const match = trimmed.match(pattern);
      if (match) {
        const stepType = match[1];
        const stepText = match[2].trim();

        usages.push({
          text: stepText,
          type: stepType,
          line: i + 1,
          fullLine: line
        });
        break;
      }
    }
  }
  
  return usages;
}

// Check if a step definition is used in any feature file
function isStepUsed(stepDef, allStepUsages) {
  const stepText = stepDef.text;
  const stepType = stepDef.type;
  
  // For regex steps, we need to check if any usage matches the pattern
  if (stepDef.isRegex) {
    try {
      // For regex patterns, we need to be more careful about matching
      // First try the original pattern
      let regex = new RegExp(stepText);
      let found = allStepUsages.some(usage => {
        // Allow flexible step type matching: When/Then/Given can match each other
        // Also allow And/But to match any step type
        const typeMatches = usage.type === stepType || 
                           usage.type === 'And' || 
                           usage.type === 'But' ||
                           stepType === 'And' ||
                           stepType === 'But' ||
                           (stepType === 'When' && (usage.type === 'Then' || usage.type === 'Given')) ||
                           (stepType === 'Then' && (usage.type === 'When' || usage.type === 'Given')) ||
                           (stepType === 'Given' && (usage.type === 'When' || usage.type === 'Then'));
        const textMatches = regex.test(usage.text);
        
        return textMatches && typeMatches;
      });
      
      if (found) return true;
      
      // If that doesn't work, try without anchors
      let cleanPattern = stepText;
      if (cleanPattern.startsWith('^')) {
        cleanPattern = cleanPattern.substring(1);
      }
      if (cleanPattern.endsWith('$')) {
        cleanPattern = cleanPattern.substring(0, cleanPattern.length - 1);
      }
      
      regex = new RegExp(cleanPattern);
      found = allStepUsages.some(usage => {
        // Allow flexible step type matching
        // Also allow And/But to match any step type
        const typeMatches = usage.type === stepType || 
                           usage.type === 'And' || 
                           usage.type === 'But' ||
                           stepType === 'And' ||
                           stepType === 'But' ||
                           (stepType === 'When' && (usage.type === 'Then' || usage.type === 'Given')) ||
                           (stepType === 'Then' && (usage.type === 'When' || usage.type === 'Given')) ||
                           (stepType === 'Given' && (usage.type === 'When' || usage.type === 'Then'));
        return regex.test(usage.text) && typeMatches;
      });
      
      if (found) return true;
      
      // If still not found, try with more flexible pattern matching
      // Convert restrictive character classes to more flexible ones
      let flexiblePattern = stepText
        .replace(/\[a-zA-Z0-9\]\*/g, '[^"]*')  // [a-zA-Z0-9]* -> [^"]* (any non-quote chars)
        .replace(/\[a-zA-Z0-9\]\+/g, '[^"]+')   // [a-zA-Z0-9]+ -> [^"]+ (one or more non-quote chars)
        .replace(/\[a-zA-Z0-9\]/g, '[^"]')      // [a-zA-Z0-9] -> [^"] (single non-quote char)
        .replace(/\[A-Z_\]\*/g, '[^"]*')       // [A-Z_]* -> [^"]* (for ClientType patterns)
        .replace(/\[A-Z_\]\+/g, '[^"]+')       // [A-Z_]+ -> [^"]+ (for ClientType patterns)
        .replace(/\[A-Z_\]/g, '[^"]')         // [A-Z_] -> [^"] (for ClientType patterns)
        .replace(/\(Game\|Media\|User\)/g, '[^"]*')  // (Game|Media|User) -> [^"]* (flexible type matching)
        .replace(/\(Game PK\|Email\)/g, '[^"]*')     // (Game PK|Email) -> [^"]* (flexible column matching)
        .replace(/\(MLB\|LEGACY\)/g, '[^"]*');      // (MLB|LEGACY) -> [^"]* (flexible experience matching)
      
      if (flexiblePattern !== stepText) {
        try {
          regex = new RegExp(flexiblePattern);
          return allStepUsages.some(usage => {
            const typeMatches = usage.type === stepType || 
                               usage.type === 'And' || 
                               usage.type === 'But' ||
                               stepType === 'And' ||
                               stepType === 'But' ||
                               (stepType === 'When' && (usage.type === 'Then' || usage.type === 'Given')) ||
                               (stepType === 'Then' && (usage.type === 'When' || usage.type === 'Given')) ||
                               (stepType === 'Given' && (usage.type === 'When' || usage.type === 'Then'));
            return regex.test(usage.text) && typeMatches;
          });
        } catch (error) {
          // If flexible regex is also invalid, continue to other checks
        }
      }
      
      return false;
    } catch (error) {
      // If regex is invalid, treat as unused
      return false;
    }
  }
  
  // For string steps, check exact matches and parameter patterns
  return allStepUsages.some(usage => {
    // Allow flexible step type matching: When/Then/Given can match each other
    // Also allow And/But to match any step type
    const typeMatches = usage.type === stepType || 
                       usage.type === 'And' || 
                       usage.type === 'But' ||
                       stepType === 'And' ||
                       stepType === 'But' ||
                       (stepType === 'When' && (usage.type === 'Then' || usage.type === 'Given')) ||
                       (stepType === 'Then' && (usage.type === 'When' || usage.type === 'Given')) ||
                       (stepType === 'Given' && (usage.type === 'When' || usage.type === 'Then'));
    
    // Check exact match first
    if (usage.text === stepText) {
      return typeMatches;
    }
    
    // Check if this is a parameterized step (contains {string}, {int}, etc.)
    if (stepText.includes('{') && stepText.includes('}')) {
      // Count parameters in step definition
      const paramCount = (stepText.match(/\{[^}]+\}/g) || []).length;
      
      // Handle parameter count mismatches first - try to match with flexible parameter patterns
      if (paramCount > 1) {
        // Try to match with just the first parameter
        const firstParamPattern = stepText.replace(/\{[^}]+\}.*/, '([^\\s]+)');
        
        try {
          const firstParamRegex = new RegExp('^' + firstParamPattern + '$');
          if (firstParamRegex.test(usage.text)) {
            return typeMatches;
          }
        } catch (error) {
          // If regex is invalid, continue to other checks
        }
        
        // Also try to match the base pattern (everything before the first parameter)
        const basePattern = stepText.replace(/\{[^}]+\}.*/, '');
        if (usage.text.startsWith(basePattern)) {
          return typeMatches;
        }
      }
      
      // Convert parameterized step to regex pattern
      let pattern = stepText
        .replace(/\{string\}/g, '(\'[^\']*\'|\"([^\"\\\\]|\\\\.)*\")')  // {string} matches 'anything' or "anything" (handles escaped quotes)
        .replace(/\{int\}/g, '\\d+')        // {int} matches digits
        .replace(/\{float\}/g, '\\d+\\.\\d+') // {float} matches decimal numbers
        .replace(/\{word\}/g, '\\w+')       // {word} matches word characters
        .replace(/\{browser\}/g, '\\w+')    // {browser} matches word characters
        .replace(/\{.*\}/g, '(\'[^\']*\'|\"([^\"\\\\]|\\\\.)*\")');       // Any other parameter matches quoted strings (handles escaped quotes)
      
      try {
        const regex = new RegExp('^' + pattern + '$');
        const matches = regex.test(usage.text);
        
        return matches && typeMatches;
      } catch (error) {
        // If regex is invalid, fall back to exact match
        return false;
      }
    }
    
    return false;
  });
}

// Find all class methods (including getters, setters, and regular methods)
function findClassMethods(content) {
  const methods = [];
  const lines = content.split('\n');
  let inClass = false;
  let braceCount = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Track when we're inside a class
    if (trimmed.match(/^class\s+\w+/)) {
      inClass = true;
      continue;
    }
    
    // Track braces to know when we exit the class
    if (inClass) {
      for (const char of line) {
        if (char === '{') braceCount++;
        if (char === '}') braceCount--;
      }
      
      if (braceCount === 0 && trimmed === '}') {
        inClass = false;
        continue;
      }
    }
    
    // Skip if we're not in a class
    if (!inClass) continue;
    
    // Skip constructor
    if (trimmed.startsWith('constructor(')) continue;
    
    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) continue;
    
    // Skip keywords and control structures
    const keywords = ['if', 'else', 'for', 'while', 'do', 'switch', 'case', 'return', 'break', 'continue', 'throw', 'try', 'catch', 'finally', 'super', 'this'];
    const startsWithKeyword = keywords.some(keyword => trimmed.startsWith(keyword + ' ') || trimmed.startsWith(keyword + '('));
    if (startsWithKeyword) continue;
    
    // Match getter methods: get methodName()
    const getterMatch = trimmed.match(/^get\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/);
    if (getterMatch) {
      methods.push({
        name: getterMatch[1],
        line: i + 1,
        type: 'getter'
      });
      continue;
    }
    
    // Match setter methods: set methodName()
    const setterMatch = trimmed.match(/^set\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/);
    if (setterMatch) {
      methods.push({
        name: setterMatch[1],
        line: i + 1,
        type: 'setter'
      });
      continue;
    }
    
    // Match async methods: async methodName()
    const asyncMatch = trimmed.match(/^async\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/);
    if (asyncMatch) {
      methods.push({
        name: asyncMatch[1],
        line: i + 1,
        type: 'method'
      });
      continue;
    }
    
    // Match regular methods: methodName() or methodName(params)
    // Must start with a valid identifier (not a keyword)
    const methodMatch = trimmed.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*\)\s*{?/);
    if (methodMatch && !trimmed.startsWith('function ') && !trimmed.includes('=')) {
      const methodName = methodMatch[1];
      // Final keyword check
      if (!keywords.includes(methodName)) {
        methods.push({
          name: methodName,
          line: i + 1,
          type: 'method'
        });
      }
    }
  }
  
  return methods;
}

// Check if a class method is used across files
async function isClassMethodUsedAcrossFiles(methodName, declaringFile, allFiles) {
  const declaringContent = readFileCached(declaringFile);
  
  // Patterns to check for method usage
  const usagePatterns = [
    new RegExp(`\\.${methodName}\\s*\\(`),  // .methodName()
    new RegExp(`\\.${methodName}\\b(?!\\s*\\()`),  // .methodName (getter/setter access without parens)
    new RegExp(`this\\.${methodName}\\s*\\(`),  // this.methodName()
    new RegExp(`this\\.${methodName}\\b(?!\\s*\\()`)  // this.methodName (getter/setter)
  ];
  
  // First, check usage within the same file (excluding the declaration)
  const lines = declaringContent.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Skip the declaration line itself
    if (line.match(new RegExp(`^\\s*(?:get|set|async)?\\s+${methodName}\\s*\\(`))) {
      continue;
    }
    
    // Check if method is used
    if (usagePatterns.some(pattern => pattern.test(line))) {
      return true;
    }
  }
  
  // Check other files for usage
  for (const file of allFiles) {
    if (file === declaringFile) continue;
    
    const content = readFileCached(file);
    
    // Check if the class is imported/required
    const fileName = path.basename(declaringFile, '.js');
    const importPatterns = [
      new RegExp(`import\\s+.*${fileName}`, 'i'),
      new RegExp(`require\\([^)]*${fileName}`, 'i')
    ];
    
    const isImported = importPatterns.some(pattern => pattern.test(content));
    
    if (isImported || content.includes(fileName)) {
      // Check for method usage
      if (usagePatterns.some(pattern => pattern.test(content))) {
        return true;
      }
    }
  }
  
  return false;
}

// Check for JavaScript-only rule in features, xray, scripts folders
async function checkJavaScriptOnly() {
  console.log('🔍 Checking for JavaScript-only rule...');

  const targetDirectories = ['features', 'xray', 'scripts'];
  const allowedExtensions = ['.js', '.mjs', '.cjs', '.ts', '.tsx', '.json'];
  const ignoredExtensions = ['.feature', '.md', '.css', '.html', '.woff', '.woff2', '.ttf', '.eot', '.svg', '.png', '.jpg', '.jpeg', '.gif', '.ico'];
  const ignoredDirectories = ['reports', 'node_modules', 'dist', 'build', 'coverage', '.git'];
  
  const nonJavaScriptFiles = [];
  
  for (const dir of targetDirectories) {
    if (!fs.existsSync(dir)) {
      console.log(`⚠️  Directory ${dir} not found, skipping...`);
      continue;
    }
    
    // Get all files in the directory recursively
    const files = await glob(`${dir}/**/*`, { 
      ignore: ['node_modules/**', '**/*.min.js', 'dist/**', 'build/**'],
      absolute: true 
    });
    
    for (const file of files) {
      const ext = path.extname(file);
      const relativePath = path.relative(process.cwd(), file);
      
      // Skip directories and ignored extensions
      if (fs.statSync(file).isDirectory() || ignoredExtensions.includes(ext)) {
        continue;
      }
      
      // Skip files in ignored directories
      const isInIgnoredDirectory = ignoredDirectories.some(ignoredDir => 
        relativePath.includes(`/${ignoredDir}/`) || relativePath.startsWith(`${ignoredDir}/`)
      );
      if (isInIgnoredDirectory) {
        continue;
      }
      
      // Check if file has a non-JavaScript extension
      if (ext && !allowedExtensions.includes(ext)) {
        nonJavaScriptFiles.push({
          file: relativePath,
          extension: ext,
          directory: dir
        });
      }
    }
  }

  if (nonJavaScriptFiles.length === 0) {
    console.log('✅ JavaScript-only rule passed - only JavaScript files found in features, xray, scripts');
    return true;
  }

  console.log('❌ JavaScript-only rule violations found:');
  for (const violation of nonJavaScriptFiles) {
    console.log(`  - ${violation.file} (${violation.extension} extension in ${violation.directory})`);
  }
  console.log('');
  console.log('💡 All files in features, xray, scripts directories must use JavaScript extensions:');
  console.log('   ✅ Allowed: .js, .mjs, .cjs, .ts, .tsx, .json');
  console.log('   ❌ Not allowed: .py, .groovy, .rb, .java, .c, .cpp, .cs, .php, .go, .rs, .swift, .kt, .scala, etc.');
  console.log('   ⏭️  Ignored: .feature files (Cucumber feature files)');
  console.log('');

  return false;
}

// Check for inline locators
async function checkInlineLocators() {
  console.log('🔍 Checking for inline locators...');
  
  // Target directories (not page objects)
  const targetPatterns = [
    'features/step-definitions/*.js',
    'features/**/commonFunctions/*.js'
  ];
  
  const files = [];
  for (const pattern of targetPatterns) {
    const matches = await glob(pattern, { 
      ignore: ['node_modules/**', 'allure-results/**', 'reports/**', 'temp/**', 'logs/**'] 
    });
    files.push(...matches);
  }
  
  let hasInlineLocators = false;
  const violations = [];
  
  for (const file of files) {
    const content = readFileCached(file);
    const lines = content.split('\n');
    
    lines.forEach((line, index) => {
      const lineNumber = index + 1;
      const trimmedLine = line.trim();
      
      // Skip comments and imports
      if (trimmedLine.startsWith('//') || 
          trimmedLine.startsWith('*') || 
          trimmedLine.startsWith('import ') ||
          trimmedLine.startsWith('const ') && trimmedLine.includes('= require(') ||
          trimmedLine.startsWith('export ')) {
        return;
      }
      
      // Pattern 1: $('selector') or $$('selector')
      // Matches: $('...') or $$('...') with CSS or XPath
      const dollarSelectorPattern = /\$\$?\s*\(\s*['"](.*?)['"]\s*\)/g;
      const dollarMatches = [...trimmedLine.matchAll(dollarSelectorPattern)];
      
      for (const match of dollarMatches) {
        const selector = match[1];
        
        // Allow relative selectors (starting with > or ~)
        if (selector.startsWith('>') || selector.startsWith('~')) {
          continue;
        }
        
        // Allow empty or very short strings (likely not selectors)
        if (!selector || selector.length < 2) {
          continue;
        }
        
        // Check if it looks like a selector (CSS or XPath)
        const looksLikeSelector = 
          selector.includes('#') ||           // ID selector
          selector.includes('.') ||           // Class selector
          selector.includes('[') ||           // Attribute selector
          selector.startsWith('//') ||        // XPath
          selector.includes('data-testid') || // data-testid
          selector.match(/^[a-z]+$/i) ||      // Tag name
          selector.includes('>') ||           // Child combinator
          selector.includes(' ') && !selector.includes('://'); // Descendant (but not URL)
        
        if (looksLikeSelector) {
          violations.push({
            file,
            line: lineNumber,
            content: trimmedLine,
            selector: selector
          });
          hasInlineLocators = true;
        }
      }
      
      // Pattern 2: await element.$('selector')
      const elementChildPattern = /await\s+\w+\.\$\s*\(\s*['"]([^'"]{2,})['"]\s*\)/g;
      const childMatches = [...trimmedLine.matchAll(elementChildPattern)];
      
      for (const match of childMatches) {
        const selector = match[1];
        
        // Allow relative selectors
        if (selector.startsWith('>') || selector.startsWith('~')) {
          continue;
        }
        
        violations.push({
          file,
          line: lineNumber,
          content: trimmedLine,
          selector: selector
        });
        hasInlineLocators = true;
      }
    });
  }
  
  if (!hasInlineLocators) {
    console.log('✅ No inline locators found');
    return true;
  }
  
  // Group violations by file
  const violationsByFile = violations.reduce((acc, v) => {
    if (!acc[v.file]) acc[v.file] = [];
    acc[v.file].push(v);
    return acc;
  }, {});
  
  console.log('❌ Inline locators found:\n');
  for (const [file, fileViolations] of Object.entries(violationsByFile)) {
    console.log(`${file}:`);
    fileViolations.forEach(v => {
      console.log(`  Line ${v.line}: ${v.content.substring(0, 80)}${v.content.length > 80 ? '...' : ''}`);
      console.log(`             Selector: "${v.selector}"`);
    });
    console.log('');
  }
  
  console.log('💡 Fix: Move these selectors to page object files');
  console.log('   Example: features/pageobjects/[page].object.js\n');
  
  return false;
}

// Check file naming conventions
async function checkFileNamingConventions() {
  console.log('🔍 Checking file naming conventions...');
  
  const violations = [];
  
  // Check page object files - should be camelCase.js
  const pageObjectFiles = await glob('features/pageobjects/**/*.js', {
    ignore: ['node_modules/**', 'allure-results/**', 'reports/**', 'temp/**', 'logs/**']
  });
  
  for (const file of pageObjectFiles) {
    const fileName = path.basename(file);
    
    // Remove all extensions and dots, just get the base name
    const nameWithoutExt = fileName
      .replace(/\.(object|page)\.js$/, '')  // Remove .object.js or .page.js
      .replace(/\.js$/, '')                  // Remove .js
      .replace(/\./g, '');                   // Remove any remaining dots
    
    // Check camelCase (starts with lowercase, no hyphens/underscores)
    if (!isCamelCase(nameWithoutExt)) {
      violations.push({
        file,
        issue: 'Should use camelCase',
        expected: toCamelCase(nameWithoutExt) + '.js',
        severity: 'warning'
      });
    }
  }
  
  // Check common function files - should be camelCase.js
  const commonFunctionFiles = await glob('features/**/commonFunctions/**/*.js', {
    ignore: ['node_modules/**', 'allure-results/**', 'reports/**', 'temp/**', 'logs/**']
  });
  
  for (const file of commonFunctionFiles) {
    const fileName = path.basename(file);
    const nameWithoutExt = fileName.replace('.js', '');
    
    if (!isCamelCase(nameWithoutExt)) {
      violations.push({
        file,
        issue: 'Should use camelCase',
        expected: toCamelCase(nameWithoutExt) + '.js',
        severity: 'warning'
      });
    }
  }
  
  // Check step definition files - should be camelCase.steps.js
  const stepDefFiles = await glob('features/step-definitions/**/*.js', {
    ignore: ['node_modules/**', 'allure-results/**', 'reports/**', 'temp/**', 'logs/**']
  });
  
  for (const file of stepDefFiles) {
    const fileName = path.basename(file);
    
    // Should end with .steps.js
    if (!fileName.endsWith('.steps.js') && !fileName.endsWith('-steps.js')) {
      violations.push({
        file,
        issue: 'Missing .steps.js suffix',
        expected: fileName.replace('.js', '.steps.js'),
        severity: 'warning'
      });
      continue;
    }
    
    // Check camelCase (starts with lowercase)
    const nameWithoutSuffix = fileName.replace('.steps.js', '').replace('-steps.js', '');
    if (!isCamelCase(nameWithoutSuffix)) {
      violations.push({
        file,
        issue: 'Should use camelCase',
        expected: toCamelCase(nameWithoutSuffix) + '.steps.js',
        severity: 'warning'
      });
    }
  }
  
  // Check feature files - should be camelCase.feature or PascalCase.feature
  const featureFiles = await glob('features/**/*.feature', {
    ignore: ['node_modules/**', 'allure-results/**', 'reports/**', 'temp/**', 'logs/**']
  });
  
  for (const file of featureFiles) {
    const fileName = path.basename(file);
    const nameWithoutExt = fileName.replace('.feature', '');
    
    if (!isCamelCase(nameWithoutExt)) {
      violations.push({
        file,
        issue: 'Should use camelCase',
        expected: toCamelCase(nameWithoutExt) + '.feature',
        severity: 'warning'
      });
    }
  }
  
  if (violations.length === 0) {
    console.log('✅ All files follow naming conventions');
    console.log(`   - ${pageObjectFiles.length} page object files (camelCase)`);
    console.log(`   - ${commonFunctionFiles.length} common function files (camelCase)`);
    console.log(`   - ${stepDefFiles.length} step definition files (camelCase)`);
    console.log(`   - ${featureFiles.length} feature files (camelCase)`);
    return true;
  }
  
  console.log('❌ File naming convention violations found:\n');
  
  for (const violation of violations) {
    console.log(`${violation.file}:`);
    console.log(`  Issue: ${violation.issue}`);
    console.log(`  Suggested: ${violation.expected}`);
    console.log('');
  }
  
  console.log('💡 Fix: Rename files to follow conventions');
  console.log('   Page objects: camelCase.js');
  console.log('   Common functions: camelCase.js');
  console.log('   Step definitions: camelCase.steps.js');
  console.log('   Feature files: camelCase.feature\n');
  
  return false;
}

// Helper: Check if string is camelCase or PascalCase
function isCamelCase(str) {
  // Allow both camelCase (starts with lowercase) and PascalCase (starts with uppercase)
  // This accommodates acronyms like MVPD, API, etc. at the start of file names
  // Should not contain hyphens or underscores
  // Allow numbers but not at the very start
  return /^[a-zA-Z][a-zA-Z0-9]*$/.test(str);
}

// Helper: Check if string is kebab-case
function isKebabCase(str) {
  // Should be lowercase with hyphens only
  return /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(str);
}

// Helper: Convert to camelCase (preserves PascalCase with acronyms)
function toCamelCase(str) {
  // Handle kebab-case or snake_case - convert to camelCase
  if (str.includes('-') || str.includes('_')) {
    return str
      .replace(/[-_](.)/g, (_, char) => char.toUpperCase())
      .replace(/^(.)/, (_, char) => char.toLowerCase());
  }
  
  // If already PascalCase (especially with acronyms like MVPD), preserve it
  // Example: MVPDAuth should stay MVPDAuth, not become mVPDAuth
  if (/^[A-Z]{2,}/.test(str)) {
    // Has multiple uppercase letters at start (likely an acronym)
    return str; // Keep as PascalCase
  }
  
  // Regular PascalCase - convert first letter to lowercase
  if (/^[A-Z]/.test(str)) {
    return str.charAt(0).toLowerCase() + str.slice(1);
  }
  
  // Already camelCase or other format
  return str;
}

// Helper: Convert to kebab-case
function toKebabCase(str) {
  return str
    .replace(/([A-Z])/g, '-$1')
    .replace(/[-_\s]+/g, '-')
    .toLowerCase()
    .replace(/^-/, '');
}

// Main execution
// Check Gherkin standardization
async function checkGherkinStandardization() {
  console.log('🔍 Checking Gherkin standardization...');
  
  const violations = [];
  
  // Get all feature files from features/
  const featureFiles = await glob('features/**/*.feature', {
    ignore: ['node_modules/**', 'allure-results/**', 'reports/**', 'temp/**', 'logs/**']
  });
  
  for (const file of featureFiles) {
    const content = readFileCached(file);
    const lines = content.split('\n');
    
    let inScenarioOutline = false;
    let scenarioOutlineStartLine = 0;
    let scenarioOutlineName = '';
    let inExamples = false;
    let exampleRows = [];
    let exampleHeaders = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;
      const trimmedLine = line.trim();
      
      // Check for Scenario Outline
      if (trimmedLine.startsWith('Scenario Outline:')) {
        inScenarioOutline = true;
        scenarioOutlineStartLine = lineNumber;
        scenarioOutlineName = trimmedLine.replace('Scenario Outline:', '').trim();
        inExamples = false;
        exampleRows = [];
        exampleHeaders = [];
      }
      
      // Check for Examples section
      if (trimmedLine.startsWith('Examples:') && inScenarioOutline) {
        inExamples = true;
        continue;
      }
      
      // Collect example rows
      if (inExamples && trimmedLine.startsWith('|')) {
        const row = trimmedLine.split('|').map(cell => cell.trim()).filter(cell => cell);
        if (exampleHeaders.length === 0) {
          exampleHeaders = row;
        } else {
          exampleRows.push(row);
        }
      }
      
      // End of scenario or new scenario
      if ((trimmedLine.startsWith('Scenario:') || trimmedLine.startsWith('Scenario Outline:') || i === lines.length - 1) && inScenarioOutline && exampleRows.length > 0) {
        // Check if only 1 example row
        if (exampleRows.length === 1) {
          violations.push({
            file,
            line: scenarioOutlineStartLine,
            issue: 'Scenario Outline with only 1 example should be converted to regular Scenario',
            suggestion: 'Convert to Scenario and inline the values directly into steps',
            severity: 'warning'
          });
        }
        
        // Reset for next scenario
        if (trimmedLine.startsWith('Scenario:')) {
          inScenarioOutline = false;
        }
      }
      
      // Check THEN steps for proper phrasing
      if (trimmedLine.match(/^Then /i)) {
        const thenStep = trimmedLine;
        
        // Check if it uses proper assertion phrasing
        const hasProperPhrasing = 
          /should (see|be|have|get|display|show|contain|match)/i.test(thenStep) ||
          /I verify/i.test(thenStep) ||
          /I expect/i.test(thenStep) ||
          /(user|page|video|element|button|message).* should/i.test(thenStep);
        
        // Check for improper phrasing (direct observation without "should")
        const hasImproperPhrasing = 
          /^Then I (see|am|have) /i.test(thenStep) ||
          /^Then (the |a |an )?\w+ (is|are|displays?|shows?|appears?|contains?) /i.test(thenStep);
        
        if (hasImproperPhrasing && !hasProperPhrasing) {
          let suggestion = thenStep;
          
          // Suggest corrections
          if (/^Then I see /i.test(thenStep)) {
            suggestion = thenStep.replace(/^Then I see /i, 'Then I should see ');
          } else if (/^Then I am /i.test(thenStep)) {
            suggestion = thenStep.replace(/^Then I am /i, 'Then I should be ');
          } else if (/^Then I have /i.test(thenStep)) {
            suggestion = thenStep.replace(/^Then I have /i, 'Then I should have ');
          } else if (/^Then (the |a |an )?(\w+) is /i.test(thenStep)) {
            suggestion = thenStep.replace(/^Then (the |a |an )?(\w+) is /i, 'Then $1$2 should be ');
          } else if (/^Then (the |a |an )?(\w+) are /i.test(thenStep)) {
            suggestion = thenStep.replace(/^Then (the |a |an )?(\w+) are /i, 'Then $1$2 should be ');
          } else if (/^Then (the |a |an )?(\w+) displays? /i.test(thenStep)) {
            suggestion = thenStep.replace(/^Then (the |a |an )?(\w+) displays? /i, 'Then $1$2 should display ');
          }
          
          violations.push({
            file,
            line: lineNumber,
            issue: 'THEN step should use assertion phrasing',
            current: thenStep,
            suggestion: suggestion,
            severity: 'warning'
          });
        }
      }
    }
  }
  
  if (violations.length > 0) {
    console.log('❌ Gherkin standardization violations found:\n');
    
    violations.forEach(violation => {
      console.log(`${violation.file}:${violation.line}`);
      console.log(`  Issue: ${violation.issue}`);
      if (violation.current) {
        console.log(`  Current: ${violation.current}`);
      }
      console.log(`  Suggested: ${violation.suggestion}`);
      console.log('');
    });
    
    console.log('💡 Fix: Update feature files to follow Gherkin conventions');
    console.log('   - Use "I should see/be/verify" in THEN steps');
    console.log('   - Convert single-example Scenario Outlines to regular Scenarios');
    console.log('   - Keep Scenario Outlines only for multiple data sets');
    
    return false;
  }
  
  console.log('✅ All feature files follow Gherkin conventions');
  console.log(`   - ${featureFiles.length} feature files checked`);
  
  return true;
}

// Check branch naming conventions
async function checkBranchNaming() {
  console.log('🔍 Checking branch naming conventions...');
  
  try {
    // Get current branch name
    const { execSync } = require('child_process');
    const branchName = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
    
    // Skip check for main, master, develop branches
    const protectedBranches = ['main', 'master', 'develop', 'development'];
    if (protectedBranches.includes(branchName)) {
      console.log(`ℹ️  Skipping branch naming check for protected branch: ${branchName}`);
      return true;
    }
    
    // Skip if in detached HEAD state
    if (!branchName) {
      console.log('ℹ️  Skipping branch naming check (detached HEAD state)');
      return true;
    }
    
    // Required pattern: <type>/<PROJECT-123>
    // Types: feature, bugfix, hotfix, chore, docs
    // Project key: 2-10 uppercase letters
    // Issue number: digits
    const pattern = /^(feature|bugfix|hotfix|chore|docs)\/[A-Z]{2,10}-[0-9]+$/;
    
    if (pattern.test(branchName)) {
      console.log(`✅ Branch name is valid: ${branchName}`);
      
      // Extract and display components
      const [type, ticketId] = branchName.split('/');
      console.log(`   Type: ${type}`);
      console.log(`   Jira Ticket: ${ticketId}`);
      
      return true;
    }
    
    // Branch name doesn't match pattern
    console.log(`❌ Branch name does not match required format: ${branchName}\n`);
    console.log('Required Format:');
    console.log('   <type>/<PROJECT-123>\n');
    console.log('Valid Types:');
    console.log('   - feature  (new features)');
    console.log('   - bugfix   (bug fixes)');
    console.log('   - hotfix   (urgent fixes)');
    console.log('   - chore    (maintenance)');
    console.log('   - docs     (documentation)\n');
    console.log('Examples:');
    console.log('   ✅ feature/TVTEST-602');
    console.log('   ✅ bugfix/WDIO-123');
    console.log('   ✅ hotfix/PROD-456\n');
    console.log('Common Issues:');
    
    // Provide specific feedback
    if (!branchName.includes('/')) {
      console.log('   ❌ Missing type prefix (e.g., feature/, bugfix/)');
    } else {
      const [type, ticketPart] = branchName.split('/');
      
      if (!['feature', 'bugfix', 'hotfix', 'chore', 'docs'].includes(type.toLowerCase())) {
        console.log(`   ❌ Invalid type: "${type}" (must be: feature, bugfix, hotfix, chore, or docs)`);
      }
      
      if (type !== type.toLowerCase()) {
        console.log(`   ❌ Type must be lowercase: "${type}" → "${type.toLowerCase()}"`);
      }
      
      if (ticketPart && !ticketPart.match(/^[A-Z]{2,10}-[0-9]+$/)) {
        if (!ticketPart.includes('-')) {
          console.log('   ❌ Missing hyphen and project key (e.g., TVTEST-602)');
        } else {
          const [projectKey, issueNum] = ticketPart.split('-');
          if (projectKey !== projectKey.toUpperCase()) {
            console.log(`   ❌ Project key must be UPPERCASE: "${projectKey}" → "${projectKey.toUpperCase()}"`);
          }
          if (!projectKey.match(/^[A-Z]{2,10}$/)) {
            console.log(`   ❌ Invalid project key: "${projectKey}" (must be 2-10 uppercase letters)`);
          }
          if (!issueNum || !issueNum.match(/^[0-9]+$/)) {
            console.log(`   ❌ Invalid issue number: "${issueNum}" (must be digits only)`);
          }
        }
      }
    }
    
    console.log('\n💡 To fix, create a new branch with correct format:');
    console.log('   git checkout -b feature/TVTEST-602\n');
    console.log('📖 For more information, see: Rules/branchNaming.mdc');
    
    return false;
    
  } catch (error) {
    console.log('⚠️  Could not check branch name:', error.message);
    console.log('   (This check requires git to be available)');
    return true; // Don't fail the check if git is unavailable
  }
}

async function main() {
  console.log('🚀 Starting Cursor Rules Check...\n');
  
  try {
    const importsResult = await checkUnusedImports();
    console.log(''); // Line break after imports check
    
    const variablesResult = await checkUnusedVariables();
    console.log(''); // Line break after variables check
    
    const functionsResult = await checkUnusedFunctions();
    console.log(''); // Line break after functions check
    
    const classMethodsResult = await checkUnusedClassMethods();
    console.log(''); // Line break after class methods check
    
    const duplicateStepsResult = await checkDuplicateSteps();
    console.log(''); // Line break after duplicate steps check
    
    const stepsResult = await checkUnusedSteps();
    console.log(''); // Line break after steps check
    
    const gitignoreResult = await checkGitignoreCompliance();
    console.log(''); // Line break after gitignore check
    
    const javascriptOnlyResult = await checkJavaScriptOnly();
    console.log(''); // Line break after javascript-only check
    
    const inlineLocatorsResult = await checkInlineLocators();
    console.log(''); // Line break after inline locators check
    
    const fileNamingResult = await checkFileNamingConventions();
    console.log(''); // Line break after file naming check
    
    const gherkinResult = await checkGherkinStandardization();
    console.log(''); // Line break after gherkin check
    
    const branchNamingResult = await checkBranchNaming();
    
    // Performance metrics
    const totalTime = Date.now() - startTime;
    const cacheHits = fileCache.size;
    
    console.log(`⚡ Performance: ${totalTime}ms total, ${cacheHits} files cached`);
    
    if (importsResult && variablesResult && functionsResult && classMethodsResult && duplicateStepsResult && stepsResult && gitignoreResult && javascriptOnlyResult && inlineLocatorsResult && fileNamingResult && gherkinResult && branchNamingResult) {
      console.log('🎉 All cursor rules passed!');
      process.exit(0);
    } else {
      console.log('💥 Cursor rules violations detected. Please fix the issues above.');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Error during cursor rules check:', error);
    process.exit(1);
  }
}

// Run the checker
main();
