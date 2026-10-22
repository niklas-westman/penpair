import { realpath } from "node:fs/promises";
import path from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { runCommand, type CliOptions } from "./cli-main.js";
import { loadConfig } from "./instance/config.js";
import { resolveProjectOutput } from "./project-input.js";
import { collectCommand, type CommandResult } from "./command-result.js";
import { version } from "./version.js";

export interface McpOptions {
  root: string;
  allowWrites?: boolean;
  cli?: CliOptions;
  timeoutMs?: number;
  maxOutputBytes?: number;
}
const string = {
  type: "string",
  minLength: 1,
  maxLength: 1000,
};
const integer = (max: number) => ({
  type: "integer",
  minimum: 0,
  maximum: max,
});
interface Definition {
  name: string;
  description: string;
  properties: Record<string, object>;
  required: string[];
  command: (a: Record<string, unknown>) => string[];
  write?: boolean;
  localWrite?: boolean;
}
const definitions: Definition[] = [
  {
    name: "pages",
    description: "List pages in the pinned project file",
    properties: {},
    required: [],
    command: () => [
      "pages",
    ],
  },
  {
    name: "tree",
    description: "Bounded tree preview; omitted nodes are explicit",
    properties: {
      page: string,
      depth: integer(100),
    },
    required: [
      "page",
    ],
    command: (a) => [
      "tree",
      "--page",
      String(a.page),
      "--depth",
      String(a.depth ?? 5),
    ],
  },
  {
    name: "audit",
    description: "Inspect layout/token findings with documented heuristic limits",
    properties: {
      page: string,
    },
    required: [
      "page",
    ],
    command: (a) => [
      "audit",
      "--page",
      String(a.page),
    ],
  },
  {
    name: "inspect",
    description: "One bounded structured inspection chunk; use returned cursor for continuation",
    properties: {
      page: string,
      id: string,
      cursor: string,
    },
    required: [
      "page",
      "id",
    ],
    command: (a) => [
      "inspect",
      String(a.id),
      "--page",
      String(a.page),
      ...(a.cursor
        ? [
            "--cursor",
            String(a.cursor),
          ]
        : []),
    ],
  },
  {
    name: "tokens_dump",
    description: "Bounded token capture; completeness is explicit",
    properties: {},
    required: [],
    command: () => [
      "tokens",
      "dump",
      "--max-total-bytes",
      "131072",
    ],
  },
  {
    name: "run_status",
    description: "Inspect an explicit local recovery journal",
    properties: {
      id: string,
    },
    required: [
      "id",
    ],
    command: (a) => [
      "runs",
      String(a.id),
    ],
  },
  {
    name: "baselines_status",
    description: "Offline coverage/evidence status; no capture or approval",
    properties: {},
    required: [],
    command: () => [
      "baselines",
      "coverage",
    ],
  },
  {
    name: "project_status",
    description: "Project health with explicit unknowns; no adapter imports",
    properties: {},
    required: [],
    command: () => [
      "status",
    ],
  },
  {
    name: "doctor",
    description: "Project connection/file identity diagnostics",
    properties: {},
    required: [],
    command: () => [
      "doctor",
    ],
  },
  {
    name: "design_spec",
    description: "Derived handoff for an exact frame ID; unknown semantics remain explicit",
    properties: {
      page: string,
      id: string,
    },
    required: [
      "page",
      "id",
    ],
    command: (a) => [
      "spec",
      "--page",
      String(a.page),
      "--frame",
      String(a.id),
    ],
  },
  {
    name: "export",
    description: "Capture stable PNG to a relative path inside the project; creates a local file",
    properties: {
      page: string,
      id: string,
      out: string,
    },
    required: [
      "page",
      "id",
      "out",
    ],
    command: (a) => [
      "export",
      String(a.id),
      String(a.out),
      "--page",
      String(a.page),
    ],
    localWrite: true,
  },
  {
    name: "run_registered",
    description:
      "Execute a trusted registered operation: inspect by default, explicit apply and recovery for writes. Not a sandbox.",
    properties: {
      name: string,
      params: {
        type: "object",
        additionalProperties: {
          type: "string",
          maxLength: 4000,
        },
        maxProperties: 100,
      },
      apply: {
        type: "boolean",
        default: false,
      },
      resume: string,
      checkpoint: {
        type: "boolean",
        default: false,
      },
    },
    required: [
      "name",
    ],
    write: true,
    command: (a) => [
      "run",
      String(a.name),
      ...Object.entries((a.params as Record<string, string>) ?? {}).flatMap(([k, v]) => [
        "--param",
        `${k}=${v}`,
      ]),
      ...(a.apply
        ? [
            "--apply",
          ]
        : []),
      ...(a.resume
        ? [
            "--resume",
            String(a.resume),
          ]
        : []),
      ...(a.checkpoint
        ? [
            "--checkpoint",
          ]
        : []),
    ],
  },
];
function validate(def: Definition, raw: unknown): Record<string, unknown> {
  if (raw === undefined) {
    raw = {};
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Tool arguments must be an object");
  }
  const a = raw as Record<string, unknown>;
  for (const key of def.required) {
    if (!(key in a)) {
      throw new Error(`Missing ${key}`);
    }
  }
  for (const [key, value] of Object.entries(a)) {
    const schema = def.properties[key] as
      | {
          type: string;
          maximum?: number;
          maxLength?: number;
        }
      | undefined;
    if (!schema) {
      throw new Error(`Unexpected tool argument ${key}`);
    }
    if (
      schema.type === "string" &&
      (typeof value !== "string" ||
        !value ||
        value.startsWith("-") ||
        value.length > (schema.maxLength ?? 1000) ||
        /[\x00-\x1f]/.test(value))
    ) {
      throw new Error(`Invalid ${key}`);
    }
    if (schema.type === "boolean" && typeof value !== "boolean") {
      throw new Error(`Invalid ${key}`);
    }
    if (
      schema.type === "integer" &&
      (!Number.isInteger(value) || Number(value) < 0 || Number(value) > schema.maximum!)
    ) {
      throw new Error(`Invalid ${key}`);
    }
    if (
      key === "params" &&
      (!value ||
        typeof value !== "object" ||
        Array.isArray(value) ||
        Object.keys(value).length > 100 ||
        Object.entries(value).some(
          ([k, v]) => !/^[a-zA-Z][\w-]{0,100}$/.test(k) || typeof v !== "string" || v.length > 4000,
        ))
    ) {
      throw new Error("Invalid registered parameters");
    }
  }
  if ((a.resume || a.checkpoint) && !a.apply) {
    throw new Error("Explicit resume requires apply");
  }
  return a;
}
/** Long-lived server with an immutable explicit root and no process.chdir or raw-code tool. */
export async function createMcpServer(options: McpOptions): Promise<Server> {
  if (!path.isAbsolute(options.root)) {
    throw new Error("MCP project root must be absolute");
  }
  const root = await realpath(options.root);
  const config = await loadConfig(root);
  if (!config.file?.id) {
    throw new Error("MCP server requires a configured owner-confirmed file pin");
  }
  const pinned = {
    instance: config.instance,
    fileId: config.file.id,
    profile: JSON.stringify("profile" in config ? config.profile : null),
  };
  const timeout = options.timeoutMs ?? 60000;
  const limit = options.maxOutputBytes ?? 256 * 1024;
  if (
    !Number.isInteger(timeout) ||
    timeout < 1 ||
    timeout > 300000 ||
    !Number.isInteger(limit) ||
    limit < 1024 ||
    limit > 1024 * 1024
  ) {
    throw new Error("Invalid MCP budgets");
  }
  const available = definitions.filter((d) => !d.write || options.allowWrites);
  const server = new Server(
    {
      name: "penpair",
      version,
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );
  const tools: Tool[] = available.map((d) => ({
    name: d.name,
    description: d.description,
    inputSchema: {
      type: "object",
      properties: d.properties,
      required: d.required,
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: !d.write && !d.localWrite,
      destructiveHint: Boolean(d.write || d.localWrite),
      idempotentHint: !d.write && !d.localWrite,
      openWorldHint: true,
    },
  }));
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools,
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const controller = new AbortController();
    const abort = () => controller.abort(extra.signal.reason);
    extra.signal.addEventListener("abort", abort, {
      once: true,
    });
    if (extra.signal.aborted) {
      abort();
    }
    const timer = setTimeout(
      () =>
        controller.abort(
          Object.assign(new Error("MCP command deadline exceeded"), {
            code: "deadline",
          }),
        ),
      timeout,
    );
    let result: CommandResult;
    try {
      const def = available.find((d) => d.name === request.params.name);
      if (!def) {
        throw new Error("Unknown or disabled tool");
      }
      const args = validate(def, request.params.arguments);
      const current = await loadConfig(root);
      if (
        current.instance !== pinned.instance ||
        current.file?.id !== pinned.fileId ||
        JSON.stringify("profile" in current ? current.profile : null) !== pinned.profile
      ) {
        throw new Error(
          "Pinned project target changed; restart and explicitly review server configuration",
        );
      }
      if (def.localWrite) {
        args.out = await resolveProjectOutput(root, String(args.out));
      }
      result = await runCommand(def.command(args), {
        ...options.cli,
        root,
        projectEndpointOnly: true,
        pinnedConfig: config,
        strictFileGuard: true,
        signal: controller.signal,
      });
    } catch (error) {
      result = await collectCommand(request.params.name, async () => {
        throw error;
      });
    } finally {
      clearTimeout(timer);
      extra.signal.removeEventListener("abort", abort);
    }
    if (Buffer.byteLength(JSON.stringify(result), "utf8") > limit) {
      result = {
        ...result,
        outcome: result.outcome === "uncertain" ? "uncertain" : "incomplete",
        exitCode: result.outcome === "uncertain" ? 4 : 3,
        data: null,
        messages: [],
        warnings: [],
        errors: [],
        completeness: {
          complete: false,
          reason:
            "MCP response byte budget exceeded; use a narrower inspection or the CLI artifact path",
        },
      };
    }
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result),
        },
      ],
      structuredContent: result as unknown as Record<string, unknown>,
      isError: result.exitCode !== 0,
    };
  });
  return server;
}
export async function serveMcp(options: McpOptions): Promise<Server> {
  const server = await createMcpServer(options);
  await server.connect(new StdioServerTransport());
  return server;
}
