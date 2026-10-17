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
  // R1 (c): a command in model-commands.ts edits the model and lets the renderer show it; it never writes to the live DOM
  {
    files: ['packages/svgcanvas/core/model-commands.ts'],
    rules: {
      'no-restricted-syntax': ['error', {
        selector: 'CallExpression[callee.property.name=/^(append|prepend|remove|before|after|insertBefore|appendChild|removeChild|replaceChild|replaceChildren|replaceWith|insertAdjacentElement|insertAdjacentHTML|setAttribute|setAttributeNS|removeAttribute|removeAttributeNS|toggleAttribute)$/]',
        message: 'model-commands.ts edits the document model (snapshotHistory.edit with a function of model/edit.ts); the renderer writes the DOM.'
      }]
    }
  }
]
