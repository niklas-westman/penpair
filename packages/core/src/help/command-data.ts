export const commandData = [
  {
    command: "journey-map",
    group: "Design agreements and release pages",
    summary: "journey-map check|render|publish|import|accept|approve|context --from FILE",
    usages: [
      "penpair journey-map check|render|publish|import|accept|approve|context --from FILE",
    ],
  },
  {
    command: "integration-map",
    group: "Design agreements and release pages",
    summary: "integration-map check|render|publish|import|accept|approve|context --from FILE",
    usages: [
      "penpair integration-map check|render|publish|import|accept|approve|context --from FILE",
    ],
  },
  {
    command: "design-release",
    group: "Design agreements and release pages",
    summary: "design-release plan|adopt|assemble|verify|finalize|check|status|context --from FILE",
    usages: [
      "penpair design-release plan|adopt|assemble|verify|finalize|check|status|context --from FILE",
      "penpair design-release copy --source-page PAGE --frame ID --release VERSION [--debug-port PORT --apply]",
    ],
  },
  {
    command: "setup",
    group: "Start here (guided, plain language; safe to run again)",
    summary: "asks where your Penpot is (web is the default), sets everything up and checks it",
    usages: [
      "penpair setup",
      "penpair setup --web [--external <address>]",
    ],
  },
  {
    command: "connect",
    group: "Start here (guided, plain language; safe to run again)",
    summary: "pin the connected design file ID in project configuration",
    usages: [
      "penpair connect --pin-file",
    ],
  },
  {
    command: "config",
    group: "Connect / diagnose",
    summary: "validate configuration offline",
    usages: [
      "penpair config check [--json]",
      "penpair config schema",
    ],
  },
  {
    command: "doctor",
    group: "Connect / diagnose",
    summary: "origin, transport, fresh editor read and file pin (1000\u201330000 ms)",
    usages: [
      "penpair doctor [--json] [--timeout-ms 5000]",
      "penpair doctor --debug-port 9222",
    ],
  },
  {
    command: "wake",
    group: "Connect / diagnose",
    summary:
      "activate the pinned browser tab, then verify the editor; --reload also reloads that one tab and waits for the plugin; no write is replayed",
    usages: [
      "penpair wake --debug-port 9222 [--reload] [--json]",
    ],
  },
  {
    command: "status",
    group: "Connect / diagnose",
    summary: "observed project health and optional companion readiness",
    usages: [
      "penpair status [--adapters]",
    ],
  },
  {
    command: "open",
    group: "Connect / diagnose",
    summary: "open the pinned public file URL, or print it",
    usages: [
      "penpair open [--print]",
    ],
  },
  {
    command: "probe",
    group: "Connect / diagnose",
    summary: "observed APIs and limits",
    usages: [
      "penpair probe [--integrity]",
      "penpair probe --deep --write [--kit]",
    ],
  },
  {
    command: "onboard",
    group: "Connect / diagnose",
    summary: "personal-key colleague setup checklist",
    usages: [
      "penpair onboard [--json]",
    ],
  },
  {
    command: "kit",
    group: "Build",
    summary: "compile helpers offline",
    usages: [
      "penpair kit check [--include @kit]",
    ],
  },
  {
    command: "recipes",
    group: "Build",
    summary: "list available recipes without building",
    usages: [
      "penpair recipes [--include @kit]",
    ],
  },
  {
    command: "run-file",
    group: "Build",
    summary:
      "run-file <script.js> --include @kit --inspect inspect.js --readback readback.js --page PAGE [--apply]",
    usages: [
      "penpair run-file <script.js> --include @kit --inspect inspect.js --readback readback.js --page PAGE [--apply]",
    ],
  },
  {
    command: "run",
    group: "Build",
    summary: "configured snippet; inspect first",
    usages: [
      "penpair run <name> [--param key=value] [--apply]",
    ],
  },
  {
    command: "snippets",
    group: "Build",
    summary: "list or validate configured trusted scripts",
    usages: [
      "penpair snippets / snippets check",
    ],
  },
  {
    command: "tokens",
    group: "Build",
    summary: "inspect token edits; --apply writes once",
    usages: [
      "penpair tokens add-set|set|remove|promote",
      "penpair tokens dump",
      "penpair tokens diff before.json after.json --theme NAME",
    ],
  },
  {
    command: "archive",
    group: "Build",
    summary: "archive --page PAGE --name Archive --keep PREFIX [--apply]",
    usages: [
      "penpair archive --page PAGE --name Archive --keep PREFIX [--apply]",
    ],
  },
  {
    command: "repair",
    group: "Build",
    summary: "remove shapes without an id that an interrupted build left on the page root",
    usages: [
      "penpair repair --page PAGE --empty-shapes [--apply]",
    ],
  },
  {
    command: "pages",
    group: "Inspect / spec",
    summary: "file identity, revision and pages",
    usages: [
      "penpair pages",
    ],
  },
  {
    command: "tree",
    group: "Inspect / spec",
    summary: "bounded preview",
    usages: [
      "penpair tree --page PAGE [--depth 3] [--prefix TEXT]",
    ],
  },
  {
    command: "inspect",
    group: "Inspect / spec",
    summary: "inspect ID --page PAGE --all --out design/inspection.json",
    usages: [
      "penpair inspect ID --page PAGE --all --out design/inspection.json",
    ],
  },
  {
    command: "spec",
    group: "Inspect / spec",
    summary: "spec --from design/inspection.json --out design/spec.md",
    usages: [
      "penpair spec --from design/inspection.json --out design/spec.md",
      "penpair spec check --from design/inspection.json --out design/spec.md",
      "penpair spec --page PAGE --frame ID [--map mapping.json]",
    ],
  },
  {
    command: "audit",
    group: "Inspect / spec",
    summary: "advisory findings and unknowns",
    usages: [
      "penpair audit --page PAGE --prefix PREFIX [--rules]",
    ],
  },
  {
    command: "snapshot",
    group: "Snapshot / diff",
    summary: "snapshot [--write] [--out design/snapshots/current]",
    usages: [
      "penpair snapshot [--write] [--out design/snapshots/current]",
      "penpair snapshot diff design/snapshots/before --from design/snapshots/current",
    ],
  },
  {
    command: "runs",
    group: "Snapshot / diff",
    summary: "private recovery evidence, offline",
    usages: [
      "penpair runs [RUN_ID]",
    ],
  },
  {
    command: "queue",
    group: "Snapshot / diff",
    summary: "ordered run-file jobs, one writer, retries, status",
    usages: [
      "penpair queue run jobs.json [--resume QUEUE_ID] [--stop-on-failure]",
      "penpair queue status [QUEUE_ID]",
    ],
  },
  {
    command: "locks",
    group: "Snapshot / diff",
    summary:
      "local writer locks and who holds them; clear removes only those whose process is gone",
    usages: [
      "penpair locks [clear]",
    ],
  },
  {
    command: "export",
    group: "Capture / approve",
    summary: "several frames, one failure does not stop the rest; --cache skips unchanged ones",
    usages: [
      "penpair export ID out.png [--page PAGE] [--scale 1]",
      "penpair export --name EXACT_NAME --page PAGE out.png",
      "penpair export --frames ID[=NAME],... --page PAGE [--out design/exports] [--cache]",
    ],
  },
  {
    command: "shots",
    group: "Capture / approve",
    summary: "shots --page PAGE [--prefix PREFIX] [--out design/shots]",
    usages: [
      "penpair shots --page PAGE [--prefix PREFIX] [--out design/shots]",
    ],
  },
  {
    command: "approve",
    group: "Capture / approve",
    summary: "preview exact-artifact evidence",
    usages: [
      "penpair approve --page PAGE --frame ID [--case CASE_ID]",
      'penpair approve --page PAGE --frame ID --write --note "OWNER WORDS" --by OWNER',
    ],
  },
  {
    command: "baselines",
    group: "Capture / approve",
    summary: "capture configured references; approval requires exact owner evidence",
    usages: [
      "penpair baselines [--apply] [--update]",
      "penpair baselines coverage [--json]",
    ],
  },
  {
    command: "backup",
    group: "Capture / approve",
    summary: "bounded full-file archive; restore proof remains separate",
    usages: [
      "penpair backup file new.penpot",
      "penpair backup",
      "penpair backup verify <dir>",
    ],
  },
  {
    command: "skills",
    group: "Skills (the rules an AI agent follows, shipped with penpair)",
    summary: "list them",
    usages: [
      "penpair skills",
      "penpair skills install [--to <folder>] [--only <name>] [--force] [--agents AGENTS.md] [--dry-run]",
      "penpair skills check [--agent codex|claude|copilot] [--only <name>] [--agents <file>] [--json]",
    ],
  },
  {
    command: "init",
    group: "Local instance",
    summary: "set up the config, the compose file and the secrets",
    usages: [
      "penpair init [--instance <name>] [--port 9001] [--gitignore]",
      "penpair init --external URL",
    ],
  },
  {
    command: "up",
    group: "Local instance",
    summary: "start, stop (data stays) and look at the containers",
    usages: [
      "penpair up | down | status",
    ],
  },
  {
    command: "restore",
    group: "Local instance",
    summary: "replace the instance's data with a backup (safety backup first)",
    usages: [
      "penpair restore <dir> --yes",
    ],
  },
  {
    command: "mcp",
    group: "Discovery",
    summary: "Serve the pinned project through typed stdio tools",
    usages: [
      "penpair mcp --root /absolute/project",
    ],
  },
  {
    command: "help",
    group: "Discovery",
    summary: "Discover commands and workflow topics without connecting",
    usages: [
      "penpair help [TOPIC ...] [--all | --search TEXT]",
    ],
  },
  {
    command: "down",
    group: "Local instance",
    summary: "Stop the local instance; data stays",
    usages: [
      "penpair down",
    ],
  },
  {
    command: "formats",
    group: "Discovery",
    summary: "Inspect persisted artifact schemas",
    usages: [
      "penpair formats schema NAME | import-tokens FILE | export-tokens FILE | migrate-config FILE [--out NEW_FILE]",
    ],
  },
];
