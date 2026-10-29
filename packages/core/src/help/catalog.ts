import { commandOptions, allowedCommandFlags } from "../command-options.js";
import { reservedCommands } from "../adapters.js";
import {
  mapActions,
  mapBooleanOptions,
  releaseActions,
  releaseOptions,
  copyOptions,
} from "../design-commands/options.js";
import { commandData } from "./command-data.js";
import { workflowTopics } from "./topics.js";
import { flagGuidance } from "./flag-guidance.js";

export interface HelpTopic {
  id: string;
  group: string;
  summary: string;
  usages: string[];
  flags: {
    name: string;
    type: string;
    multiple?: boolean;
    description?: string;
  }[];
  instructions: string[];
  related: string[];
  availability?: string;
}

const subcommands: Record<string, string[]> = {
  formats: [
    "schema",
    "import-tokens",
    "export-tokens",
    "migrate-config",
  ],
  config: [
    "check",
    "schema",
  ],
  kit: [
    "check",
  ],
  snippets: [
    "check",
  ],
  skills: [
    "install",
    "check",
  ],
  snapshot: [
    "diff",
  ],
  spec: [
    "check",
  ],
  queue: [
    "run",
    "status",
  ],
  locks: [
    "clear",
  ],
  baselines: [
    "coverage",
  ],
  backup: [
    "file",
    "verify",
  ],
  tokens: [
    "add-set",
    "set",
    "remove",
    "promote",
    "dump",
    "diff",
  ],
  "journey-map": Object.keys(mapActions),
  "integration-map": Object.keys(mapActions),
  "design-release": [
    ...Object.keys(releaseActions),
    "copy",
  ],
};

function flagsFor(command: string, rest: string[]): HelpTopic["flags"] {
  const action = rest[0] ?? "";
  if (command === "help") {
    return [
      "help",
      "json",
      "all",
      "search",
      "help-id",
    ].map((name) => ({
      name,
      type: [
        "search",
        "help-id",
      ].includes(name)
        ? "string"
        : "boolean",
    }));
  }
  if (command === "mcp") {
    return [
      {
        name: "root",
        type: "string",
      },
      {
        name: "allow-writes",
        type: "boolean",
      },
    ];
  }
  if (command === "queue") {
    return [
      {
        name: "json",
        type: "boolean",
      },
      ...(!action || action === "run"
        ? [
            {
              name: "resume",
              type: "string",
            },
            {
              name: "stop-on-failure",
              type: "boolean",
            },
          ]
        : []),
    ];
  }
  if (
    [
      "config",
      "runs",
      "onboard",
      "locks",
    ].includes(command)
  ) {
    return [
      {
        name: "json",
        type: "boolean",
      },
    ];
  }
  if (command === "journey-map" || command === "integration-map") {
    const actions = mapActions as Record<string, readonly string[]>;
    const names = action ? (actions[action] ?? []) : Object.values(actions).flat();
    return [
      ...new Set([
        "from",
        "help",
        "json",
        ...names,
      ]),
    ].map((name) => ({
      name,
      type: mapBooleanOptions.has(name) ? "boolean" : "string",
    }));
  }
  if (command === "design-release") {
    const options = action === "copy" ? copyOptions : releaseOptions;
    return Object.entries(options)
      .filter(
        ([name]) =>
          action === "copy" ||
          !action ||
          [
            "from",
            "out",
            "help",
            "json",
            ...(releaseActions[action] ?? []),
          ].includes(name),
      )
      .map(([name, definition]) => ({
        name,
        ...definition,
      }));
  }
  return allowedCommandFlags(command, rest).map((name) => ({
    name,
    ...(commandOptions[name as keyof typeof commandOptions] ?? {
      type: "string",
    }),
  }));
}

/** Core catalog shares argument definitions with execution; adapter topics are static data. */
export function coreHelpTopics(local: boolean): HelpTopic[] {
  const topics: HelpTopic[] = [];
  for (const command of reservedCommands) {
    const data = commandData.find((entry) => entry.command === command);
    const topic: HelpTopic = {
      id: command,
      group: data?.group ?? "Discovery",
      summary: data?.summary ?? command,
      usages: data?.usages ?? [
        `penpair ${command} --help`,
      ],
      flags: flagsFor(command, []),
      instructions: [
        `Use this command to ${data?.summary ?? command}. Choose the smallest scope before expanding.`,
        "Preconditions: validate the project configuration before execution; live operations require the intended file/page identity and a connected editor. Offline help requires neither.",
        "Results: --json returns the unchanged CommandResult schemaVersion 1. Require exitCode 0 and completeness.complete; inspection, capture and staging do not imply owner approval.",
        "Recovery: preserve the run ID and previous artifacts, inspect runs/queue status and current state after uncertainty, then resume only unchanged reviewed inputs.",
      ],
      related:
        command === "export"
          ? [
              "export.batch",
              "export.cache",
              "diagnostics.progress",
              "workflows.capture-evidence",
            ]
          : [
                "shots",
                "baselines",
              ].includes(command)
            ? [
                "workflows.capture-evidence",
                "diagnostics.progress",
                "export",
              ]
            : [
                "workflows.iterative-build",
              ],
      ...([
        "up",
        "down",
        "restore",
      ].includes(command) && !local
        ? {
            availability: "Requires the local-instance command package.",
          }
        : {}),
    };
    topics.push(topic);
    for (const action of subcommands[command] ?? []) {
      const usages = topic.usages
        .filter((usage) => usage.includes(action))
        .map((usage) =>
          usage.replace(new RegExp(`(penpair ${command} )(?:[a-z-]+\\|)+[a-z-]+`), `$1${action}`),
        );
      topics.push({
        ...topic,
        id: `${command}.${action}`,
        flags: flagsFor(command, [
          action,
        ]),
        usages: usages.length
          ? usages
          : [
              `penpair ${command} ${action}`,
            ],
        related: [
          command,
        ],
        summary: `${command} ${action}: ${topic.summary}`,
      });
    }
  }
  for (const topic of workflowTopics) {
    topics.push({
      ...topic,
      group: "Workflow guidance",
      usages: [],
      flags: [],
      related:
        topic.id === "diagnostics.progress"
          ? [
              "export",
              "shots",
              "baselines",
            ]
          : [
              "diagnostics.progress",
              "workflows.iterative-build",
            ],
    });
  }
  return topics.map((topic) => ({
    ...topic,
    flags: topic.flags.map((flag) => ({
      ...flag,
      ...(flagGuidance[flag.name]
        ? {
            description: flagGuidance[flag.name],
          }
        : {}),
    })),
  }));
}
