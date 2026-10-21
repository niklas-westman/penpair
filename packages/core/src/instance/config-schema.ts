const viewportSchema = { type: "object", required: ["width", "height"], additionalProperties: false, properties: { width: { type: "integer", minimum: 1, maximum: 16384 }, height: { type: "integer", minimum: 1, maximum: 16384 } } } as const;
const caseFields = { viewport: viewportSchema, theme: { type: "string", minLength: 1, maxLength: 200 }, state: { type: "string", minLength: 1, maxLength: 200 }, fixture: { type: "string", minLength: 1, maxLength: 200 } } as const;
const baselineCaseSchema = { type: "object", required: ["viewport", "theme", "state", "fixture"], additionalProperties: false, properties: { ...caseFields, fonts: { type: "array", maxItems: 100, uniqueItems: true, items: { type: "string", minLength: 1 } }, activeThemeIds: { type: "array", maxItems: 100, uniqueItems: true, items: { type: "string", minLength: 1 } } } } as const;
const requiredCaseSchema = { type: "object", required: ["route", "viewport", "theme", "state", "fixture"], additionalProperties: false, properties: { route: { type: "string", minLength: 1 }, ...caseFields } } as const;

/** Editor hints for the core settings. Adapter-owned properties remain open; `config check` also checks semantic constraints. */
export const projectConfigSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "penpair project configuration",
  type: "object",
  required: ["instance"],
  properties: {
    schemaVersion: { const: 1 },
    audit: { type: "object", additionalProperties: false, properties: {
      contrast: { type: "boolean" }, library: { type: "boolean" }, touchTargets: { type: "boolean" }, names: { type: "boolean" }, blankText: { type: "boolean" },
      interactiveIds: { type: "array", maxItems: 1000, items: { type: "string" } }, allowBlank: { type: "array", maxItems: 1000, items: { type: "string" } }, nameSegments: { type: "integer", minimum: 1, maximum: 10 },
      suppressions: { type: "array", maxItems: 1000, items: { type: "object", required: ["rule", "nodeId", "reason"], properties: { rule: { enum: ["contrast", "library", "touch-target", "names", "blank-text"] }, nodeId: { type: "string" }, reason: { type: "string", minLength: 1 } } } },
    } },
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
        coverage: { type: "object", required: ["required"], properties: { required: { type: "array", minItems: 1, maxItems: 1000, items: requiredCaseSchema }, unsupported: { type: "array", maxItems: 1000, items: { ...requiredCaseSchema, required: [...requiredCaseSchema.required, "reason"], properties: { ...requiredCaseSchema.properties, reason: { type: "string", minLength: 1 } } } } } },
        threshold: { type: "number", minimum: 0, maximum: 1 },
        frames: {
          type: "array", minItems: 1, maxItems: 1000,
          items: {
            type: "object", required: ["frame", "id"], dependentRequired: { case: ["route"] },
            properties: {
              frame: { type: "string", minLength: 1 },
              id: { type: "string", pattern: "^[a-z0-9][a-z0-9_-]{0,63}$" },
              route: { type: "string", minLength: 1 },
              case: baselineCaseSchema,
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
