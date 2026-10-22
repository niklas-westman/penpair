# TypeScript and naming

Use `pnpm format` and `pnpm check:style`; do not hand-align code against Biome.
Separate top-level declarations and distinct steps inside a function with blank
lines. Use braces for every branch and loop, and declare one variable at a time.
Prefer early exits that leave the main path easy to follow.

## Names carry intent

- Files and folders: `capture-validation.ts`, `page-session/`. Keep conventional
  `index.ts`, `*.test.ts`, `*.config.ts` and tool-required filenames.
- Values and functions: `captureMetadata`, `baselineImage`, `implementationCase`,
  `validateCaptureMetadata`. Use a verb for an action and a noun for a value.
- Types: `ImplementationCase`, `BrowserCaptureMetadata`. Prefer interfaces for
  object contracts and unions for finite alternatives.
- Booleans: `fontsReady`, `hasCurrentApproval`, `isComplete`.
- Units and encodings: `timeoutMs`, `maxSnippetBytes`, `screenshotHash`,
  `imageWidth`. Make conversions visible where they happen.
- Avoid one-letter domain names (`c`, `m`, `r`, `b`) and unexplained abbreviations
  (`cfg`, `sub`, `rest`) when the full name makes the next line understandable.
  Familiar small mathematical coordinates (`x`, `y`) remain appropriate.
- Preserve public field names, CLI flags and external API spelling. Improve a
  local binding without renaming a persisted schema or an upstream property.

Use `const` unless reassignment is needed. Export named functions and types;
adapter definitions retain the default export required by their loader. Give
exported functions explicit return types. Use `unknown` with validation at input
boundaries rather than `any` or a cast that pretends an external value was checked.

## Functions and errors

A function should name one operation at one level of detail. Extract a named
predicate when a condition combines independently meaningful rules; retain the
short-circuit checks that protect access to malformed input. Extract filesystem
work from pure validation when each can be tested independently.

Throw errors with actionable domain context. Catch them where a caller can choose
recovery, report a failed case or return a command exit code. Preserve existing
error classifications, redaction and cancellation behavior during a refactor.
Comment on non-obvious reasons; use names to explain routine steps.

## Tests

Use the package's Vitest runner and its existing `test/` layout. Test observable
contracts: accepted evidence, rejected malformed/stale evidence, partial progress,
and filesystem boundaries. Keep fixtures local and deterministic. For a refactor,
keep a public-entrypoint integration test and add regression cases for the rules
being extracted. Avoid tests that only search for an implementation's wording.

Production TypeScript uses ESM imports with `.js` for local modules. Match the
existing NodeNext configuration. Documentation templates import actual core types
so API changes invalidate stale examples during `pnpm check`.
