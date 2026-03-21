module.exports = [
  {
    ignores: ['node_modules', 'fixedTest.js'],
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        browser: 'readonly',
        $: 'readonly',
        $$: 'readonly',
        require: 'readonly',
        module: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
      },
    },
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.object.name='browser'][callee.property.name='pause']",
          message:
            'browser.pause() is not allowed. Use explicit waits instead: waitForDisplayed, waitForClickable, waitUntil, or waitForExist.',
        },
      ],
    },
  },
];
