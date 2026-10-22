# Adoption feedback baseline

Source: owner-supplied `feedback-0.2.0-2026-10-22.md`, consumer trial dated 2026-10-22. Installed Penpair 0.1.3 → 0.2.0; hosted plugin API 2.18.4. Repository baseline: `57f9782`, pnpm 10.12.1, TypeScript 5.6.3, Vitest 3.2.4. The consumer used Codex; its exact model/build and browser version were not recorded here and remain unknown.

Portable reproductions execute real plugin bodies against minimal objects, with no copied consumer runners, logs, endpoints or private journals:

- `packages/core/test/feedback-repro.test.ts`: idle native wait failure despite stable geometry; deferred revision during inspection (lease save and external edit both refuse); delayed page navigation. Initially expected failures identify the fixes still required.
- `packages/marwes-ui/test/migration.test.ts`: identical values with legacy metadata/hash still produce an unexplained stale snapshot.

Confirmed: native failure blocks fallback, metadata staleness lacks an explanation, a single page-switch delay is insufficient in the synthetic delayed editor. Unproven: the hosted lease/save race and the root cause of the consumer's multi-page failure. Synthetic reproduction is not live causal evidence.

Copy `feedback-scratch.template.json` only after an owner confirms a disposable file. Fill public IDs from inspection; `null` values are deliberately not executable. Keep the personal MCP key outside this manifest. Before any write, inspect, pin a snapshot, apply once, independently read back and look at two exports. Repeat and change one heading; compare IDs, bindings and preservation fields.
