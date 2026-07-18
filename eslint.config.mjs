// ESLint flat-config for the desktop TypeScript sources. Intentionally a
// small, recommended set: catches typos the compiler misses (the
// "listationsOrCurrent" bug from a prior session) without flagging the
// dozens of existing `any` annotations in legacy code. Tighten over time.
import tseslint from "@typescript-eslint/eslint-plugin"
import tsparser from "@typescript-eslint/parser"

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/out/**",
      "**/dist/**",
      "packages/desktop/scripts/**",
      "**/*.test.ts",
      "upstream/**",
    ],
  },
  {
    files: ["packages/desktop/src/**/*.ts", "packages/desktop/src/**/*.tsx"],
    languageOptions: {
      parser: tsparser,
      parserOptions: { ecmaVersion: 2022, sourceType: "module" },
    },
    plugins: { "@typescript-eslint": tseslint },
    rules: {
      "no-undef": "off", // TypeScript handles declarations; ESLint trips on DOM globals
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-undef-types": "off",
    },
  },
]
