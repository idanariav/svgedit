import neostandard from 'neostandard'

// One style for .js and .ts (R3). neostandard is the maintained successor of `standard`
// (ESLint 9 flat config); `ts: true` lints .ts and .d.ts with typescript-eslint.
export default [
  // a standalone entry is a global ignore (ESLint does not read .gitignore the way `standard` did)
  { ignores: ['**/dist/**', '**/coverage/**', '.nyc_output/**', '**/node_modules/**', 'test-results/**', 'playwright-report/**'] },
  ...neostandard({
    ts: true,
    env: ['browser'],
    globals: ['assert', 'expect', 'describe', 'it', 'test', 'vi', 'beforeAll', 'afterAll', 'beforeEach', 'afterEach']
  }),
  // `standard` never reported stale `eslint-disable` comments; keep that until they are cleaned up
  { linterOptions: { reportUnusedDisableDirectives: 'off' } },
  // `standard` made `no-var` an error; neostandard only warns
  { rules: { 'no-var': 'error' } },
  // R3: converted modules are typed for real, no `any` to silence the compiler (use `unknown` and narrow)
  { files: ['**/*.ts'], ignores: ['**/*.d.ts'], rules: { '@typescript-eslint/no-explicit-any': 'error' } },
  // The editor's JSDoc used `*` (any) where the DOM could not be typed; its conversion keeps those as `any` until each is narrowed.
  { files: ['src/editor/**/*.ts'], rules: { '@typescript-eslint/no-explicit-any': 'off' } }
]
