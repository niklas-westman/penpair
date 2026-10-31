import { parseCommandArgs, CommandArgumentError } from "../cli-arguments.js";
import { commandOutput } from "../command-result.js";
import { coreHelpTopics, type HelpTopic } from "./catalog.js";
import { adapterHelp } from "./adapter-help.js";

export function isHelpRequest(argv: string[]): boolean {
  return (
    argv.filter((arg) => arg !== "--json").length === 0 ||
    argv.find((arg) => !arg.startsWith("-")) === "help" ||
    argv.some(
      (arg) =>
        arg === "--help" || arg === "-h" || arg === "--help-id" || arg.startsWith("--help-id="),
    )
  );
}

function renderTopic(topic: HelpTopic): string {
  return [
    `${topic.id}: ${topic.summary}`,
    topic.availability,
    ...topic.usages.map((usage) => `  ${usage}`),
    ...topic.flags.map(
      (flag) =>
        `  --${flag.name}${flag.type === "string" ? " VALUE" : ""}${flag.multiple ? " (repeatable)" : ""}${flag.description ? `: ${flag.description}` : ""}`,
    ),
    ...topic.instructions,
    `Related: ${topic.related.map((id) => `penpair help ${id}`).join("; ")}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function runHelp(
  argv: string[],
  root: string,
  local: boolean,
  configured?: string[],
): Promise<number> {
  // Only help grammar is accepted. No project command is parsed or executed here.
  const parsed = parseCommandArgs({
    args: argv.filter((arg) => arg !== "-h"),
    allowPositionals: true,
    options: {
      help: {
        type: "boolean",
      },
      "help-id": {
        type: "string",
      },
      all: {
        type: "boolean",
      },
      search: {
        type: "string",
      },
      json: {
        type: "boolean",
      },
    },
  });
  const extension = await adapterHelp(root, configured);
  const core = coreHelpTopics(local);
  const ids = new Set(core.map((topic) => topic.id));
  const topics = [
    ...core,
  ];
  for (const topic of extension.topics) {
    if (ids.has(topic.id)) {
      extension.notices.push(`Duplicate help ID ${JSON.stringify(topic.id)} ignored.`);
    } else {
      topics.push(topic);
      ids.add(topic.id);
    }
  }
  const positionals =
    parsed.positionals[0] === "help" ? parsed.positionals.slice(1) : parsed.positionals;
  const id = parsed.values["help-id"] ?? positionals.join(".");
  if (parsed.values.search && (id || parsed.values.all)) {
    throw new CommandArgumentError(
      "Use --search separately from a help ID or --all; see penpair help --all.",
    );
  }
  let selected = topics;
  if (id) {
    selected = topics.filter((topic) => topic.id === id || topic.id.startsWith(`${id}.`));
    if (!selected.length) {
      throw new CommandArgumentError(
        `Unknown help ID ${JSON.stringify(id)}. Use penpair help --all or penpair help --search TEXT.`,
      );
    }
  } else if (parsed.values.search) {
    const query = parsed.values.search.toLowerCase();
    selected = topics.filter((topic) => JSON.stringify(topic).toLowerCase().includes(query));
  }
  const data = {
    schemaVersion: 1,
    topic: id || null,
    topics: selected,
    notices: extension.notices,
  };
  commandOutput.result(data);
  {
    if (
      extension.topics.length ||
      extension.notices.some((notice) => notice.startsWith("Adapter "))
    ) {
      commandOutput.log(
        "Configured executable extensions (static metadata only; no code imported):",
      );
    }
    if (id) {
      commandOutput.log(selected.map(renderTopic).join("\n\n"));
    } else {
      commandOutput.log(
        "Penpair help — offline command and workflow discovery\nUse penpair help TOPIC, penpair help --all, penpair help --search TEXT, or penpair --help --help-id export.batch.\n",
      );
      if (!parsed.values.all && !parsed.values.search) {
        commandOutput.log(
          "New here? Set a project up in this order:\n  penpair init --external https://design.penpot.app --gitignore   write penpair.config.json\n  penpair connect                                                 store your MCP address privately\n  penpair doctor                                                  check the connection\n  penpair pages                                                   list the pages of the pinned file\n  penpair skills install --agents AGENTS.md                       give the assistant its rules\nSteps and prerequisites: https://github.com/niklas-westman/penpair/blob/main/docs/installation.md\nEverything below is the full command list.\n",
        );
      }
      for (const group of new Set(selected.map((topic) => topic.group))) {
        commandOutput.log(
          `${group}:\n${selected
            .filter((topic) => topic.group === group)
            .map((topic) =>
              parsed.values.all
                ? renderTopic(topic)
                : `  ${topic.id}: ${topic.summary}${topic.availability ? ` (${topic.availability})` : ""}\n${topic.usages.map((usage) => `    ${usage}`).join("\n")}`,
            )
            .join("\n")}`,
        );
      }
      commandOutput.log(
        "Layout: --layout auto|native|geometry; deadlines: --timeout-ms 5000\nCompare: installed adapter topics appear when their static manifest is available.",
      );
    }
    for (const notice of extension.notices) {
      commandOutput.log(notice);
    }
  }
  return 0;
}
