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
