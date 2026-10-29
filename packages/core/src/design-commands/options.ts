import type { ParseArgsConfig } from "node:util";

export const mapActions = {
  check: [
    "live",
    "projection",
    "reviews",
  ],
  render: [
    "out",
  ],
  publish: [
    "page-id",
    "board-id",
    "projection",
    "apply",
    "resume",
  ],
  import: [
    "page-id",
    "board-id",
    "projection",
    "out",
  ],
  accept: [
    "projection",
    "proposal",
    "write",
  ],
  approve: [
    "projection",
    "reviews",
    "write",
    "by",
    "note",
  ],
  context: [
    "reviews",
    "out",
    "draft",
  ],
} as const;

export const mapBooleanOptions = new Set([
  "live",
  "apply",
  "write",
  "draft",
  "json",
  "help",
]);

export const releaseOptions = {
  from: {
    type: "string",
  },
  out: {
    type: "string",
  },
  receipts: {
    type: "string",
  },
  apply: {
    type: "boolean",
  },
  live: {
    type: "boolean",
  },
  draft: {
    type: "boolean",
  },
  resume: {
    type: "string",
  },
  by: {
    type: "string",
  },
  note: {
    type: "string",
  },
  json: {
    type: "boolean",
  },
  help: {
    type: "boolean",
  },
} as const satisfies NonNullable<ParseArgsConfig["options"]>;
export const releaseActions: Record<string, string[]> = {
  plan: [],
  assemble: [
    "apply",
    "resume",
  ],
  verify: [
    "receipts",
  ],
  finalize: [
    "apply",
    "resume",
    "by",
    "note",
  ],
  check: [
    "live",
  ],
  context: [
    "draft",
  ],
};
export const copyOptions = {
  progress: {
    type: "string",
  },
  "source-page": {
    type: "string",
  },
  frame: {
    type: "string",
    multiple: true,
  },
  release: {
    type: "string",
  },
  "debug-port": {
    type: "string",
  },
  apply: {
    type: "boolean",
  },
  resume: {
    type: "string",
  },
  json: {
    type: "boolean",
  },
  help: {
    type: "boolean",
  },
} as const satisfies NonNullable<ParseArgsConfig["options"]>;
