import type { ParseArgsConfig } from "node:util";

export const commandOptions = {
  include: {
    type: "string",
    multiple: true,
  },
  rules: {
    type: "boolean",
  },
  "token-source": {
    type: "string",
  },
  adapters: {
    type: "boolean",
  },
  print: {
    type: "boolean",
  },
  reload: {
    type: "boolean",
  },
  "empty-shapes": {
    type: "boolean",
  },
  frames: {
    type: "string",
  },
  cache: {
    type: "boolean",
  },
  note: {
    type: "string",
  },
  by: {
    type: "string",
  },
  case: {
    type: "string",
  },
  format: {
    type: "string",
  },
  "migrate-format": {
    type: "boolean",
  },
  "capture-policy": {
    type: "string",
  },
  "force-reason": {
    type: "string",
  },
  from: {
    type: "string",
  },
  map: {
    type: "string",
  },
  frame: {
    type: "string",
  },
  inspect: {
    type: "string",
  },
  readback: {
    type: "string",
  },
  "timeout-ms": {
    type: "string",
  },
  "debug-port": {
    type: "string",
  },
  layout: {
    type: "string",
  },
  "layout-scope": {
    type: "string",
  },
  stages: {
    type: "string",
  },
  "layout-root": {
    type: "string",
    multiple: true,
  },
  "layout-max-nodes": {
    type: "string",
  },
  page: {
    type: "string",
  },
  out: {
    type: "string",
  },
  fields: {
    type: "string",
  },
  cursor: {
    type: "string",
  },
  all: {
    type: "boolean",
  },
  "max-nodes": {
    type: "string",
  },
  "response-bytes": {
    type: "string",
  },
  "time-budget-ms": {
    type: "string",
  },
  "document-bytes": {
    type: "string",
  },
  "max-calls": {
    type: "string",
  },
  "max-total-bytes": {
    type: "string",
  },
  "capture-timeout-ms": {
    type: "string",
  },
  depth: {
    type: "string",
  },
  limit: {
    type: "string",
  },
  prefix: {
    type: "string",
  },
  steps: {
    type: "string",
  },
  ignore: {
    type: "string",
  },
  theme: {
    type: "string",
  },
  type: {
    type: "string",
  },
  value: {
    type: "string",
  },
  description: {
    type: "string",
  },
  scale: {
    type: "string",
  },
  name: {
    type: "string",
  },
  keep: {
    type: "string",
  },
  parts: {
    type: "string",
  },
  x: {
    type: "string",
  },
  apply: {
    type: "boolean",
  },
  instance: {
    type: "string",
  },
  external: {
    type: "string",
  },
  port: {
    type: "string",
  },
  gitignore: {
    type: "boolean",
  },
  yes: {
    type: "boolean",
  },
  "any-instance": {
    type: "boolean",
  },
  "any-file": {
    type: "boolean",
  },
  "pin-file": {
    type: "boolean",
  },
  standalone: {
    type: "boolean",
  },
  "builtins-only": {
    type: "boolean",
  },
  agents: {
    type: "string",
  },
  agent: {
    type: "string",
  },
  "dry-run": {
    type: "boolean",
  },
  web: {
    type: "boolean",
  },
  docker: {
    type: "boolean",
  },
  replace: {
    type: "boolean",
  },
  update: {
    type: "boolean",
  },
  json: {
    type: "boolean",
  },
  deep: {
    type: "boolean",
  },
  integrity: {
    type: "boolean",
  },
  kit: {
    type: "boolean",
  },
  resume: {
    type: "string",
  },
  checkpoint: {
    type: "boolean",
  },
  "force-lock": {
    type: "boolean",
  },
  trace: {
    type: "boolean",
  },
  force: {
    type: "boolean",
  },
  to: {
    type: "string",
  },
  only: {
    type: "string",
    multiple: true,
  },
  write: {
    type: "boolean",
  },
  param: {
    type: "string",
    multiple: true,
  },
  version: {
    type: "boolean",
  },
  progress: {
    type: "string",
  },
  help: {
    type: "boolean",
  },
} as const satisfies NonNullable<ParseArgsConfig["options"]>;

export function allowedCommandFlags(command: string, rest: string[] = []): string[] {
  const inspectionFlags = [
    "cursor",
    "all",
    "out",
    "max-nodes",
    "response-bytes",
    "time-budget-ms",
    "document-bytes",
    "max-calls",
    "max-total-bytes",
    "capture-timeout-ms",
  ];
  const layoutFlags = [
    "layout",
    "layout-root",
    "layout-max-nodes",
  ];
  const flags: Record<string, string[]> = {
    formats: [
      "out",
    ],
    snapshot: [
      "write",
      "out",
      "from",
    ],
    approve: [
      "page",
      "frame",
      "note",
      "by",
      "case",
      "write",
      "format",
      "capture-policy",
    ],
    spec: [
      "from",
      "map",
      "out",
      "page",
      "frame",
    ],
    pages: [],
    tree: [
      "page",
      "depth",
      "prefix",
      "limit",
    ],
    audit: [
      "page",
      "prefix",
      "steps",
      "ignore",
      "rules",
      "from",
      "token-source",
    ],
    inspect: [
      "page",
      "depth",
      "fields",
      ...inspectionFlags,
    ],
    tokens:
      rest[0] === "dump"
        ? inspectionFlags
        : rest[0] === "diff"
          ? [
              "theme",
            ]
          : [
              ...layoutFlags,
              "type",
              "value",
              "description",
              "apply",
              "resume",
              "checkpoint",
              "force-lock",
              "trace",
            ],
    export: [
      "page",
      "scale",
      "name",
      "frames",
      "out",
      "cache",
      ...layoutFlags,
    ],
    shots: [
      "page",
      "prefix",
      "out",
      "scale",
      ...layoutFlags,
    ],
    repair: [
      "page",
      "empty-shapes",
      "apply",
      "resume",
      "checkpoint",
      "force-lock",
      "trace",
    ],
    archive: [
      ...layoutFlags,
      "page",
      "name",
      "keep",
      "parts",
      "x",
      "apply",
      "resume",
      "checkpoint",
      "force-lock",
      "trace",
    ],
    kit: [
      "include",
    ],
    recipes: [
      "include",
    ],
    "run-file": [
      ...layoutFlags,
      "layout-scope",
      "stages",
      "include",
      "inspect",
      "readback",
      "page",
      "param",
      "apply",
      "resume",
      "checkpoint",
      "force-lock",
      "trace",
    ],
    run: [
      ...layoutFlags,
      "builtins-only",
      "param",
      "apply",
      "resume",
      "checkpoint",
      "force-lock",
      "trace",
    ],
    baselines: [
      "apply",
      "update",
      "force-reason",
      "format",
      "migrate-format",
      "capture-policy",
    ],
    probe: [
      "deep",
      "write",
      "integrity",
      "kit",
    ],
    skills: [
      "agent",
      "to",
      "only",
      "force",
      "agents",
      "dry-run",
    ],
    snippets: [
      "builtins-only",
    ],
    init: [
      "instance",
      "port",
      "gitignore",
      "external",
    ],
    setup: [
      "agents",
      "web",
      "docker",
      "external",
      "instance",
      "port",
    ],
    connect: [
      "replace",
      "pin-file",
      "any-file",
    ],
    doctor: [
      "timeout-ms",
      "debug-port",
    ],
    wake: [
      "debug-port",
      "timeout-ms",
      "reload",
    ],
    up: [],
    down: [],
    open: [
      "print",
    ],
    status: [
      "adapters",
    ],
    backup: [],
    restore: [
      "yes",
    ],
  };
  const network = [
    "snapshot",
    "approve",
    "spec",
    "inspect",
    "pages",
    "tree",
    "audit",
    "tokens",
    "export",
    "shots",
    "archive",
    "repair",
    "run",
    "run-file",
    "baselines",
    "probe",
    "backup",
    "doctor",
  ];
  return [
    "help",
    "version",
    "json",
    ...([
      "export",
      "shots",
      "baselines",
    ].includes(command)
      ? [
          "progress",
        ]
      : []),
    ...(flags[command ?? ""] ?? []),
    ...(network.includes(command ?? "")
      ? [
          "any-instance",
          "any-file",
          "standalone",
        ]
      : []),
  ];
}
