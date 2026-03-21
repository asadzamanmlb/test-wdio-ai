# Cursor Rules Scripts

This directory contains scripts to help maintain code quality and adherence to cursor rules.

## Available Scripts

### 🔍 `check-cursor-rules.cjs`
Checks the codebase for cursor rules violations, focusing on unused imports and unused variables.

**Usage:**
```bash
npm run cursor-rules-check
# or
node scripts/check-cursor-rules.cjs
```

**Features:**
- ✅ Detects unused imports across all JavaScript files
- ✅ Detects unused variables across all JavaScript files
- ⚡ Fast execution with caching
- 📊 Performance metrics and detailed reporting
- 🎯 Supports multiple file types (.js, .mjs, .cjs, .ts, .tsx)

## Workflow

### Manual Workflow
1. **Check for issues**: `npm run cursor-rules-check`
2. **Review and fix issues manually** based on the check output
3. **Verify fixes**: `npm run cursor-rules-check`
4. **Review changes** and run tests
5. **Commit** if everything looks good

### CI/CD Integration
The cursor rules check is automatically run in GitHub Actions on:
- Pull requests to `main` branch
- Pushes to `main` branch
- Manual workflow dispatch

## Supported Fix Types

### ✅ Currently Supported
- **Unused Imports**: Removes imports that are not used in the code
  - Named imports: `import { unused } from 'module'`
  - Default imports: `import unused from 'module'`
  - Mixed imports: `import used, { unused } from 'module'`
- **Unused Variables**: Removes variables that are declared but never used
  - Variable declarations: `const unused = value`
  - Destructuring: `const { unused } = object`
  - Function parameters: `function(param) { }`

### 🚧 Future Enhancements
- Dead code removal
- Import sorting and formatting
- Consistent quote style enforcement
- Trailing comma consistency

## Configuration

The scripts automatically scan these file types:
- `.js` - JavaScript files
- `.mjs` - ES Module JavaScript files
- `.cjs` - CommonJS files
- `.ts` - TypeScript files
- `.tsx` - TypeScript React files

### Excluded Directories
- `node_modules/`
- `.git/`
- `dist/`
- `build/`
- `coverage/`
- Hidden directories (starting with `.`)

## Error Handling

The scripts include comprehensive error handling:
- **File not found**: Graceful handling of missing files
- **Parse errors**: Detailed error reporting for syntax issues
- **Permission errors**: Clear messages for file access issues
- **Backup recommendations**: Suggests reviewing changes before committing

## Examples

### No Issues Found
```bash
$ npm run cursor-rules-check

🚀 Starting Cursor Rules Check...
🔍 Checking for unused imports...
✅ No unused imports found
🔍 Checking for unused variables...
✅ No unused variables found
⚡ Performance: 45ms total, 126 files cached
🎉 All cursor rules passed!
```

## Contributing

When adding new fix types or improving existing ones:

1. **Add tests** for new functionality
2. **Update documentation** in this README
3. **Follow the existing code patterns**
4. **Ensure backward compatibility**
5. **Test thoroughly** before committing

## Troubleshooting

### Common Issues

**Script fails with permission error:**
```bash
chmod +x scripts/check-cursor-rules.cjs
```

**False positives for unused imports:**
- Check if the import is used in JSX or template strings
- Verify the import is not used in dynamic imports or eval statements
- Report false positives as issues for script improvement

**Script doesn't detect some unused imports:**
- Ensure the file extension is supported
- Check if the file is in an excluded directory
- Verify the import syntax is standard

### Getting Help

If you encounter issues:
1. Check this README for common solutions
2. Run with verbose logging (if available)
3. Create an issue with the specific error message
4. Include the file content that's causing issues (if possible)
