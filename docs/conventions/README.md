# Code conventions

Start with the row matching the change. Copy the relevant pattern, then use the
nearest production module's domain vocabulary. The examples compile and run in
`pnpm conventions:check`; production code never imports them.

The [completion report](completion-2026-10-22.md) records the initial rollout,
resolved problems, verification and limits.

| Work | Read | Checked example |
| --- | --- | --- |
| Choose a package, folder or module boundary | [Structure](structure.md) | [Comparison adapter](../../packages/reflection-check/src/index.ts) |
| Write a helper, contract or test | [TypeScript](typescript.md) | [Frame label](templates/frame-label.ts), [tests](templates/conventions.test.ts) |
| Add an adapter command | [TypeScript](typescript.md), [structure](structure.md) | [Offline command](templates/adapter-command.ts) |
| Generate code for the Penpot sandbox | [Plugin code](plugin-code.md) | [Read-only snippet](templates/frame-inspection.ts) |
| Change release or workspace scripts | [Structure](structure.md), [releasing](../releasing.md) | Existing sibling in `scripts/` |

```sh
pnpm format             # Format supported source/configuration files
pnpm lint:fix           # Apply safe lint fixes
pnpm check:style        # Check formatting, focused lint rules and code directory names
pnpm conventions:check # Typecheck and execute these examples
pnpm check              # Style, build, typecheck, examples, tests and version consistency
pnpm smoke:package      # Verify the packaged installation shapes
```

`biome.json` is the formatting authority: two spaces, LF, a 100-column target,
double quotes, semicolons, expanded object/array layouts and parenthesized arrow
parameters. Braces and one variable per declaration keep control flow readable.
Use the editor's Biome extension with the repository's pinned version if desired;
`.editorconfig` supplies the basic whitespace settings in other editors.

Biome checks filenames; `check-code-paths.mjs` checks directories containing code
under `packages/`, `scripts/`, `examples/` and this folder, including new untracked
files. Both run in CI through `pnpm check`. Human/agent review still checks whether
names describe intent and whether responsibilities should be split. A formatter
cannot judge those decisions.

Vertical spacing is also an author/review responsibility: Biome keeps intentional
blank lines, but does not add separation between declarations or logical steps.
Follow [TypeScript spacing guidance](typescript.md) even when `check:style` passes.

The [repository skill](../../.agents/skills/penpair-code-conventions/SKILL.md)
applies this workflow to implementation and refactoring work. It develops Penpair
itself; the separately shipped `packages/core/skills/` teach consumers how to use
Penpair with their designs.

## Coverage and exceptions

- Generated `dist/`, dependencies, ignored local artifacts and data fixtures are
  outside formatting. Keep captured evidence unchanged.
- `docs/trials/` and `docs/upstream/` preserve external evidence.
- Raw plugin bodies in `examples/hello-card/`, `examples/theme-preview/` and
  `examples/trials/` may contain a top-level `return`, which Biome's module parser
  rejects. Their existing sandbox tests compile them as async function bodies.
  Follow [plugin code](plugin-code.md) when editing them.
- JavaScript inside template strings is string data to Biome. Format that source
  deliberately and test the generated snippet. Do not run blind whitespace
  rewriting over strings, serialized snapshots or embedded protocols.

Add new file-type examples when an actual feature needs a pattern. Keep them
minimal and executable; do not introduce a framework or dependency just for a
template.
