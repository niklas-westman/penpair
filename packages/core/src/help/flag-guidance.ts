/** Human guidance supplements the parser's authoritative names and value types. */
export const flagGuidance: Record<string, string> = {
  reload:
    "Can discard unsaved editor work. Verify saving finished in Penpot before use; an editor revision is not a save receipt. Penpair cannot confirm saved state.",
  progress:
    "human|json|off; default human on stderr. --json controls the separate final stdout result.",
  json: "Print one final CommandResult schemaVersion 1 on stdout. Check exitCode, outcome and completeness.",
  page: "Exact page name; confirm the pinned file and observed page identity before writes.",
  frames:
    "1–200 unique ID[=filename-stem] entries separated by commas. Batch export continues after a failed frame.",
  name: "Exact shape name; duplicates are rejected. Prefer an observed shape ID when ambiguous.",
  cache:
    "Opt-in ad-hoc fingerprint reuse. A cache hit is reported as cached, never fresh pixel proof.",
  scale: "PNG render scale, greater than 0 and at most 8; default 1.",
  format:
    "Baseline png|webp; new references default to lossless WebP, existing formats stay until explicit migration.",
  "migrate-format":
    "Baseline format migration requires --apply --update; inspect the proposal first.",
  apply:
    "Perform the reviewed write once. Omit for inspection. A verified write is not owner approval.",
  write:
    "Explicitly write the artifact or record described by this action; review its syntax and approval requirements.",
  update:
    "Replace changed baseline references only with explicit authorization and the command's approval evidence.",
  resume:
    "Resume the unchanged journal or queue only after independent inspection of uncertain state.",
  stages:
    "1–50 independently journaled stages; CFG.stage and CFG.stages are available to the script.",
  layout: "auto|native|geometry; default auto. Preserve target identity and bounded evidence.",
  "layout-scope":
    "Use inspected roots for scoped writes; page explicitly requests a whole-page layout sample.",
  "layout-root":
    "Repeat for independently observed layout root IDs; prefer the smallest meaningful subtree.",
  "timeout-ms":
    "Overall deadline 1–1800000 ms; doctor/wake use 1000–30000 ms. No implicit retry of uncertain writes.",
  root: "Explicit absolute project directory; required for the stdio MCP server.",
  "allow-writes":
    "Opt in to the stdio server's write tools; project guards and review still apply.",
  all: "List the complete help catalog, or collect complete inspection chunks where that command supports it.",
  "help-id": "Stable dot-separated help ID, for example export.batch. No connection is made.",
  search: "Search help IDs, syntax and instructions offline.",
};
