import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          { name: '@ant-design/icons', message: 'Use <Icon> from components/Icon (Tabler, stroke 1.5).' },
          {
            name: 'antd',
            importNames: ['DatePicker', 'TimePicker', 'message', 'notification'],
            message: 'These draw icons Ant cannot swap globally. Use components/ui/DatePicker, or useToast() from components/ui/Toast.',
          },
        ],
        patterns: [{ group: ['@ant-design/icons/*'], message: 'Use <Icon> from components/Icon (Tabler, stroke 1.5).' }],
      }],
    },
  },
  {
    // The wrappers that set Ant's icons themselves may import the components; they still can't import Ant's icons.
    files: ['src/components/ui/DatePicker.tsx', 'src/components/ui/Toast.tsx', 'src/components/ui/Pagination.tsx', 'src/theme/**'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [{ name: '@ant-design/icons', message: 'Use <Icon> from components/Icon (Tabler, stroke 1.5).' }],
        patterns: [{ group: ['@ant-design/icons/*'], message: 'Use <Icon> from components/Icon (Tabler, stroke 1.5).' }],
      }],
    },
  },
])
