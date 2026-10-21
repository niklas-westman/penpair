/** Editor hints for the core settings. Adapter-owned properties remain open; `config check` also checks semantic constraints. */
export const projectConfigSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "penpair project configuration",
  type: "object",
  required: ["instance"],
  properties: {
    backup: { type: "object", required: ["noteFile", "remindAfterDays"], properties: { noteFile: { type: "string", minLength: 1, pattern: "^(?![/\\\\])(?!.*(?:^|[/\\\\])\\.\\.(?:[/\\\\]|$)).+$" }, remindAfterDays: { type: "integer", minimum: 1 } } },
    file: { type: "object", required: ["id"], properties: { id: { type: "string", minLength: 1, pattern: "\\S" }, name: { type: "string" } } },
    instance: { type: "string", pattern: "^[a-z][a-z0-9-]{0,30}$" },
    snippets: { type: "array", items: { type: "string", minLength: 1, pattern: "^(?![/\\\\])(?![A-Za-z]:[/\\\\])(?!.*(?:^|[/\\\\])\\.\\.(?:[/\\\\]|$)).+$" } },
    adapters: { type: "array", items: { type: "string", minLength: 1 } },
    baselines: {
      type: "object", required: ["page", "root", "frames"],
      properties: {
        page: { type: "string", minLength: 1 },
        root: { type: "string", minLength: 1, pattern: "^(?![/\\\\])(?![A-Za-z]:[/\\\\])(?!.*(?:^|[/\\\\])\\.\\.(?:[/\\\\]|$)).+$" },
        threshold: { type: "number", minimum: 0, maximum: 1 },
        frames: {
          type: "array", minItems: 1,
          items: {
            type: "object", required: ["frame", "id"],
            properties: {
              frame: { type: "string", minLength: 1 },
              id: { type: "string", pattern: "^[a-z0-9][a-z0-9_-]{0,63}$" },
              route: { type: "string", minLength: 1 },
            },
          },
        },
      },
    },
  },
  oneOf: [
    {
      required: ["profile"],
      properties: {
        profile: {
          type: "object", required: ["type", "origin"],
          properties: { type: { const: "external" }, origin: { type: "string", pattern: "^https?://[^/?#]+$" } },
        },
      },
    },
    {
      required: ["penpotVersion", "ports", "directory"],
      not: { required: ["profile"] },
      properties: {
        penpotVersion: { type: "string", pattern: "^\\d+\\.\\d+(\\.\\d+)?$" },
        ports: {
          type: "object", required: ["frontend", "mail"],
          properties: {
            frontend: { type: "integer", minimum: 1024, maximum: 65535 },
            mail: { type: "integer", minimum: 1024, maximum: 65535 },
          },
        },
        directory: { type: "string", minLength: 1, pattern: "^(?!/).+$" },
        composeProject: { type: "string", pattern: "^[a-z0-9][a-z0-9_-]*$" },
      },
    },
  ],
} as const;
