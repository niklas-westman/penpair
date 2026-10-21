# Reviewed build flow

Discover available `kit check`, `recipes` and `run-file` options from the installed command. Core `@kit` defines `pp`; configured adapter kits follow their declared dependencies. Use project-owned theme/extras declarations for repeatable token additions before composing a page. The current active catalog order controls lookup; a token name without the expected type or active set is unresolved.

Plugin-body read files/includes begin with `// penpair: read`. A write body declares `// penpair: write` and `// penpair: idempotent` and supplies separate inspect/readback files. These are trusted code declarations, not purity enforcement or a sandbox. Keep the final delivered snippet under 90 KB.

Model layout with the fewest useful auto-layout containers. Bind semantic spacing, color, radius and typography tokens where the library supplies them. Keep raw measured constants explicit when the library lacks a token. Choose exact fonts before text measurement and set concrete values before bindings. `await pp.flush()` records queued bindings and settles bounded layout; independently inspect the real objects afterward.

Own newly created roots by a unique marker and retain IDs. Repeated completion preserves IDs; renamed, duplicated or differently owned markers need a decision. Kit queues are in-memory, and a partial write is not a transaction. Read `penpair runs RUN_ID` and reconcile the original operation before explicit `--apply --resume RUN_ID` with unchanged inputs. Cleanup targets only independently confirmed owned IDs.

For the first script in an API version, read the sibling design skill's `references/penpot-plugin-gotchas.md` when that skill is installed. Otherwise inspect the installed probe and compatibility guidance before relying on an unobserved API. The editor must stay visible. Native settling helps layout; independent stable exports still establish render evidence. A successful build does not itself supply owner approval.
