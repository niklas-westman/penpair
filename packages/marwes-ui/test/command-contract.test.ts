import { mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadThemeInput } from "../src/theme-input.js";
import { afterEach, expect, it, vi } from "vitest";
import { runCli, runCommand } from "@penpair/core";
import { marwesCommand } from "../src/commands.js";
import { fixture } from "./helpers.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
it("uses the core envelope for real adapter snapshot/check/status commands", async () => {
  const f = await fixture();
  vi.spyOn(process, "cwd").mockReturnValue(f.root);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  const output = vi.spyOn(console, "log").mockImplementation(() => undefined);
  const options = {
    adapters: [
      {
        name: "test",
        commands: [
          marwesCommand,
        ],
      },
    ],
  };
  expect(
    await runCommand(
      [
        "marwes",
        "tokens",
        "snapshot",
      ],
      options,
    ),
  ).toMatchObject({
    schemaVersion: 1,
    outcome: "drift",
    exitCode: 2,
  });
  expect(
    await runCli(
      [
        "marwes",
        "tokens",
        "snapshot",
        "--write",
        "--json",
      ],
      options,
    ),
  ).toBe(0);
  expect(output).toHaveBeenCalledTimes(1);
  expect(JSON.parse(String(output.mock.calls[0]![0]))).toMatchObject({
    outcome: "success",
    data: {
      current: true,
      written: true,
    },
  });
  expect(
    await runCommand(
      [
        "marwes",
        "tokens",
        "check",
      ],
      options,
    ),
  ).toMatchObject({
    outcome: "success",
    data: {
      current: true,
    },
  });
  vi.stubEnv("PENPAIR_MCP_URL", "not-a-url");
  expect(
    await runCommand(
      [
        "marwes",
        "tokens",
        "status",
      ],
      options,
    ),
  ).toMatchObject({
    outcome: "incomplete",
    exitCode: 3,
    completeness: {
      complete: false,
    },
    data: {
      penpotInSync: null,
    },
  });
  expect(
    await runCommand(
      [
        "marwes",
        "tokens",
        "check",
        "--apply",
      ],
      options,
    ),
  ).toMatchObject({
    outcome: "failed",
  });
});

it("refuses a theme entry point symlinked outside the project before executing it", async () => {
  const f = await fixture();
  const outside = await mkdtemp(path.join(os.tmpdir(), "penpair-theme-outside-"));
  const marker = path.join(outside, "executed");
  const source = path.join(outside, "theme.ts");
  await writeFile(
    source,
    `import {writeFile} from 'node:fs/promises'; await writeFile(${JSON.stringify(marker)},'executed'); export const theme = {};`,
  );
  await symlink(source, path.join(f.root, "linked-theme.ts"));
  await expect(
    loadThemeInput(f.root, {
      module: "linked-theme.ts",
      export: "theme",
    }),
  ).rejects.toThrow(/outside/);
  await expect(readFile(marker)).rejects.toMatchObject({
    code: "ENOENT",
  });
});
