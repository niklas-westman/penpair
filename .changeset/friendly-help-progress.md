---
"@penpair/core": minor
"@penpair/web": minor
"@penpair/docker": minor
"penpair": minor
"@penpair/marwes-ui": minor
"@penpair/reflection-check": minor
---

Add hierarchical offline CLI help with stable topic IDs, search and structured
JSON discovery. First-party adapters ship static help manifests, read without
executing adapter code. Help remains usable with missing or malformed config.

Stream export, shots, baseline and release-copy capture phases on stderr using
`--progress human|json|off` (default human). `--json` still prints one final
CommandResult on stdout; progress no longer becomes result warnings. Library
callers may receive structured `onProgress` events while retaining `onStep`.

Before unfamiliar work, read `penpair help TOPIC`; start a design iteration with
one representative frame before a full capture. Wrappers should inherit stderr,
parse the entire final stdout JSON and check exit/completeness. Avoid `tail -N`
and buffered subprocess stderr; use `tee` with `pipefail` when recording logs.

Release copy announces source preparation and run ID before journaled writes,
including per-frame progress. Preparation alone does not establish a journal or
a resumable paste. Release/map skills describe manual transfer, cheap probes,
frame batches and exact-byte WebP evidence. `wake --reload` warns about unsaved
work before dispatch and retains the warning in JSON; saved state is not verified.

Native map import can reuse byte-identical proposal outputs on a rerun while
preserving changed existing evidence and writer locks. Changed proposals require
a new output path; stale temporary filenames do not block a new import.
