import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

// The same policy as the .eslintrc.js removed in b5bdbf9, in the flat
// format ESLint 9+ requires.
export default tseslint.config(
    { ignores: ['dist/'] },
    js.configs.recommended,
    tseslint.configs.recommended,
    {
        languageOptions: {
            globals: globals.node,
        },
        rules: {
            'no-trailing-spaces': 'error',
            '@typescript-eslint/no-unused-vars': [
                'error',
                { argsIgnorePattern: '^_' },
            ],
        },
    },
)
