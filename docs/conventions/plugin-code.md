# Penpot plugin source

Node-side TypeScript and the Penpot editor sandbox are different environments.
The sandbox has `penpot` and explicit injected values such as `CFG`; it cannot
import Node filesystem modules or reach local project paths. Keep Node I/O outside
the generated source. Use the neutral kit/snippet APIs and actual upstream names.

Raw plugin files are async function bodies and may return at the top level.
`*.ts` generators are ordinary Node modules and are formatted by Biome; their
template string contents need deliberate formatting. Prefer readable multiline
source with descriptive names and braces. Preserve string values and parameter
serialization when editing whitespace.

The [frame inspection example](templates/frame-inspection.ts) shows a small
read-only generator. Its tests compile the generated body and execute it against
a sandbox stub. This catches syntax and behavior errors that formatting the
outer TypeScript module cannot catch.

For writes, follow [the write protocol](../../packages/core/skills/penpair-design/references/write-protocol.md):
inspect, pin a snapshot, perform one idempotent write, independently read back,
then export and look. Preserve file/page guards, bounded layout settling and the
under-90-KB transport limit. A syntax test does not prove live Penpot behavior.
Tests may stub read-only sandbox objects; live acceptance remains separate.


## Generated layout policy

`packages/core/src/layout-settling.ts` is the maintained implementation for both
host layout policy and the sandbox. `pnpm sandbox:generate` extracts its function
through TypeScript's AST and uses pinned esbuild to emit ES2022 with compact
whitespace, preserved identifiers and no syntax optimizations. The generated
`packages/core/src/generated/layout-settling-source.ts` exports a string; it is
tracked and compiled into the package. The generator formats the TypeScript
wrapper with the repository's pinned Biome, so `pnpm format` does not invalidate
the freshness check. Do not edit it manually or serialize the
host function with `Function.toString()` again.

After a policy edit, run:

```sh
pnpm sandbox:generate
pnpm format
pnpm sandbox:check
pnpm check
pnpm smoke:package
```

Core build/prepack checks refuse missing or stale generated text without changing
tracked files. No compiler or generator runs when a consumer loads the package.
Generation has no timestamps or absolute paths. Runtime imports and additional
module-level values in the policy source refuse generation: keep the policy
self-contained. Type-only declarations are allowed.

Source tests compare policy behavior with generated JavaScript and compare kit
bytes/hashes with built imports. Package smoke checks the installed kit's
bytes/hashes, budgets and explicit-root flush behavior. The limits remain 32 KiB
per kit, 48 KiB combined and 90 KB for the complete wrapped snippet.
