import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { afterEach, expect, it, vi } from "vitest";
import { runCommand } from "../src/cli-main.js";
import { coreHelpTopics, type HelpTopic } from "../src/help/catalog.js";
import { reservedCommands } from "../src/adapters.js";
import { allowedCommandFlags } from "../src/command-options.js";

afterEach(() => vi.restoreAllMocks());

it("covers reserved commands, executable flags, unique IDs and valid related topics", () => {
  const topics = coreHelpTopics(false);
  const ids = topics.map((topic) => topic.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const command of reservedCommands) {
    expect(ids).toContain(command);
  }
  for (const topic of topics) {
    for (const related of topic.related) {
      expect(ids).toContain(related);
    }
    const [command, action] = topic.id.split(".");
    if (command === "export" && !action) {
      expect(topic.flags.map((flag) => flag.name)).toEqual(allowedCommandFlags(command));
    }
  }
});

it("resolves nested help and JSON before config, connection and adapter execution", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "penpair-help-"));
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  try {
    await writeFile(path.join(root, "penpair.config.json"), "{broken json");
    for (const args of [
      [],
      [
        "export",
        "--help",
      ],
      [
        "help",
        "export",
        "batch",
      ],
      [
        "--help",
        "--help-id",
        "export.batch",
      ],
      [
        "mcp",
        "--help",
      ],
      [
        "setup",
        "--help",
      ],
      [
        "journey-map",
        "publish",
        "--help",
      ],
    ]) {
      const result = await runCommand(args, {
        root,
      });
      expect(result.exitCode, args.join(" ")).toBe(0);
      expect(
        (
          result.data as {
            topics: HelpTopic[];
          }
        ).topics.length,
      ).toBeGreaterThan(0);
    }
    const search = await runCommand(
      [
        "help",
        "--search",
        "progress",
      ],
      {
        root,
      },
    );
    expect(
      (
        search.data as {
          topics: HelpTopic[];
        }
      ).topics.map((topic) => topic.id),
    ).toContain("diagnostics.progress");
    const invalid = await runCommand(
      [
        "help",
        "export",
        "no-such-topic",
      ],
      {
        root,
      },
    );
    expect(invalid.exitCode).toBe(1);
    expect(invalid.errors[0]?.message).toContain("penpair help --all");
  } finally {
    await rm(root, {
      recursive: true,
      force: true,
    });
  }
});

it("reads a static installed adapter manifest without executing its entrypoint", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "penpair-help-adapter-"));
  const folder = path.join(root, "node_modules", "fixture-adapter");
  try {
    await mkdir(folder, {
      recursive: true,
    });
    await writeFile(
      path.join(root, "penpair.config.json"),
      JSON.stringify({
        adapters: [
          "fixture-adapter",
        ],
      }),
    );
    await writeFile(
      path.join(folder, "package.json"),
      JSON.stringify({
        name: "fixture-adapter",
        type: "module",
        exports: {
          ".": "./index.js",
          "./package.json": "./package.json",
        },
        penpair: {
          help: "./help.json",
        },
      }),
    );
    await writeFile(path.join(folder, "index.js"), "throw new Error('must not execute');");
    await writeFile(
      path.join(folder, "help.json"),
      JSON.stringify({
        schemaVersion: 1,
        topics: [
          {
            id: "fixture",
            summary: "Static fixture",
            usages: [
              "penpair fixture",
            ],
            flags: [],
            instructions: [
              "Read only",
            ],
            related: [
              "export",
            ],
          },
        ],
      }),
    );
    const result = await runCommand(
      [
        "fixture",
        "--help",
      ],
      {
        root,
      },
    );
    expect(result.exitCode).toBe(0);
    expect(
      (
        result.data as {
          topics: HelpTopic[];
        }
      ).topics[0]?.id,
    ).toBe("fixture");
    await writeFile(
      path.join(folder, "package.json"),
      JSON.stringify({
        name: "fixture-adapter",
        penpair: {},
      }),
    );
    const unavailable = await runCommand(
      [
        "help",
      ],
      {
        root,
      },
    );
    expect(
      (
        unavailable.data as {
          notices: string[];
        }
      ).notices.join(" "),
    ).toContain("coverage is unknown");
    expect(await readFile(path.join(folder, "index.js"), "utf8")).toContain("must not execute");
  } finally {
    await rm(root, {
      recursive: true,
      force: true,
    });
  }
});
