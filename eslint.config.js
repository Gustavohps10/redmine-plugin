import parser from '@typescript-eslint/parser'
import prettier from 'eslint-plugin-prettier'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
import unusedImports from 'eslint-plugin-unused-imports'

export default [
  { ignores: ['**/node_modules/**', '**/dist/**', '**/.yarn/**', '**/coverage/**'] },
  {
    files: ['**/*.ts'],
    languageOptions: { parser, parserOptions: { ecmaVersion: 'latest', sourceType: 'module' } },
    plugins: { prettier, 'simple-import-sort': simpleImportSort, 'unused-imports': unusedImports },
    rules: {
      'prettier/prettier': ['error', { semi: false, singleQuote: true, trailingComma: 'all', endOfLine: 'auto' }],
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      'unused-imports/no-unused-imports': 'error',
    },
  },
]
