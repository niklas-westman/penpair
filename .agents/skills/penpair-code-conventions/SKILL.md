---
name: penpair-code-conventions
description: Implement or refactor Penpair repository code with Biome formatting, kebab-case paths, descriptive names and focused modules. Use when creating source files, extracting responsibilities or reviewing readability in this repository.
---

# Penpair code conventions

Read [the conventions index](../../../docs/conventions/README.md), then the relevant
file-type guidance and checked template. Follow the nearest package's patterns.
This skill develops Penpair; its consumer-facing design skills live separately in
`packages/core/skills/`.

1. Identify the owning package and its public entrypoint. Keep neutral engine code
   in core and tool/library knowledge in its adapter. Preserve the one-way
   dependency into core.
2. Choose kebab-case files and folders. Name variables for their domain meaning
   (`implementationCase`, `captureMetadata`, `timeoutMs`) rather than abbreviations.
   Preserve external API names, public exports, CLI flags and persisted fields.
3. Extract a responsibility as soon as it has independent inputs/outputs,
   invariants or useful tests. Separate command parsing/loading, pure planning,
   validation and filesystem work when those boundaries exist. Keep orchestration
   readable from top to bottom and `index.ts` focused on public wiring. Keep
   tightly coupled steps together; do not create tiny forwarders just to reduce
   line counts. See [structure](../../../docs/conventions/structure.md).
4. Use [TypeScript guidance](../../../docs/conventions/typescript.md): explicit
   exported return types, one declaration per variable, braces, blank lines between
   distinct steps and early exits. Prefer names over explanatory comments.
5. For sandbox source, read [plugin code](../../../docs/conventions/plugin-code.md).
   Biome cannot format JavaScript inside strings or raw async function bodies.
   Compile/test the generated snippet; preserve guards, serialization and limits.
6. Run `pnpm format`, then `pnpm check`. Add a behavior regression test when moving
   validation or orchestration. Run `pnpm smoke:package` for package boundary or
   packaging changes. Keep checked templates in sync when contracts change.
7. Review the resulting diff for meaningful names, cohesive modules, stable public
   imports and unchanged evidence/approval rules. Update `PLAN.md` checkboxes and
   its change log only for work that is built and verified. Report what changed,
   what was validated and any remaining limits.
