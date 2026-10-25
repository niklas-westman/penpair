import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const engine = vi.hoisted(() => ({
  planRelease: vi.fn(),
  assembleRelease: vi.fn(),
  verifyRelease: vi.fn(),
  finalizeRelease: vi.fn(),
  checkRelease: vi.fn(),
  releaseContext: vi.fn(),
  releaseDesignHash: vi.fn(),
  readDesignRelease: vi.fn(),
  writeDesignRelease: vi.fn(),
}));

vi.mock("../src/design-releases/index.js", () => engine);

import { runDesignReleaseCommand } from "../src/design-commands/release-command.js";
import type { DesignCommandContext } from "../src/design-commands/context.js";

const roots: string[] = [];

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) =>
      rm(root, {
        recursive: true,
        force: true,
      }),
    ),
  );
});

async function fixture(): Promise<DesignCommandContext> {
  const root = await mkdtemp(path.join(os.tmpdir(), "penpair-release-command-"));
  roots.push(root);
  await writeFile(
    path.join(root, "input.json"),
    JSON.stringify({
      kind: "fixture-plan",
    }),
  );
  return {
    root,
    output: {
      log: vi.fn(),
      error: vi.fn(),
      result: vi.fn(),
    },
    redact: (value) => value,
    withPenpot: vi.fn().mockRejectedValue(new Error("Unexpected network access")),
  };
}

it("plans offline without writing unless an output is explicitly requested", async () => {
  const context = await fixture();
  const planned = {
    status: "planned",
    id: "example",
  };
  engine.planRelease.mockResolvedValue(planned);
  expect(
    await runDesignReleaseCommand(
      [
        "plan",
        "--from",
        "input.json",
      ],
      context,
    ),
  ).toBe(0);
  expect(engine.writeDesignRelease).not.toHaveBeenCalled();
  expect(context.withPenpot).not.toHaveBeenCalled();
  expect(
    await runDesignReleaseCommand(
      [
        "plan",
        "--from",
        "input.json",
        "--out",
        "draft.json",
      ],
      context,
    ),
  ).toBe(0);
  expect(engine.writeDesignRelease).toHaveBeenCalledWith(context.root, "draft.json", planned, {
    redact: context.redact,
  });
});

it("rejects unsupported flags and incomplete finalization authorization before engine or network work", async () => {
  const context = await fixture();
  for (const args of [
    [
      "plan",
      "--from",
      "input.json",
      "--apply",
    ],
    [
      "check",
      "--from",
      "input.json",
      "--by",
      "Owner",
    ],
    [
      "assemble",
      "--from",
      "input.json",
      "--resume",
      "run",
    ],
    [
      "finalize",
      "--from",
      "input.json",
      "--apply",
    ],
    [
      "finalize",
      "--from",
      "input.json",
      "--note",
      "Words",
      "--by",
      "Owner",
    ],
  ]) {
    await expect(runDesignReleaseCommand(args, context)).rejects.toThrow();
  }
  expect(engine.readDesignRelease).not.toHaveBeenCalled();
  expect(context.withPenpot).not.toHaveBeenCalled();
});

it("finalization preview reports the exact hash and never records owner words", async () => {
  const context = await fixture();
  const release = {
    status: "verified",
    id: "example",
  };
  engine.readDesignRelease.mockResolvedValue(release);
  engine.releaseDesignHash.mockReturnValue("a".repeat(64));
  engine.checkRelease.mockResolvedValue({
    valid: true,
    reasons: [],
  });
  expect(
    await runDesignReleaseCommand(
      [
        "finalize",
        "--from",
        "input.json",
      ],
      context,
    ),
  ).toBe(0);
  expect(context.output.result).toHaveBeenCalledWith(
    expect.objectContaining({
      recorded: false,
      artifactHash: "a".repeat(64),
    }),
  );
  expect(engine.finalizeRelease).not.toHaveBeenCalled();
  expect(context.withPenpot).not.toHaveBeenCalled();
});

it("requires explicit draft context and bounds output to the project", async () => {
  const context = await fixture();
  engine.readDesignRelease.mockResolvedValue({
    status: "planned",
  });
  engine.releaseContext.mockResolvedValue({
    ready: false,
    implementation: "not-assessed",
  });
  await expect(
    runDesignReleaseCommand(
      [
        "context",
        "--from",
        "input.json",
      ],
      context,
    ),
  ).rejects.toThrow(/--draft/);
  expect(
    await runDesignReleaseCommand(
      [
        "context",
        "--from",
        "input.json",
        "--draft",
        "--out",
        "context.json",
      ],
      context,
    ),
  ).toBe(3);
  expect(JSON.parse(await readFile(path.join(context.root, "context.json"), "utf8"))).toEqual({
    ready: false,
    implementation: "not-assessed",
  });
  await expect(
    runDesignReleaseCommand(
      [
        "context",
        "--from",
        "input.json",
        "--draft",
        "--out",
        "../escape.json",
      ],
      context,
    ),
  ).rejects.toThrow(/relative path/);
  expect(context.withPenpot).not.toHaveBeenCalled();
});

it("validates explicit native-copy receipts before opening a connection", async () => {
  const context = await fixture();
  engine.readDesignRelease.mockResolvedValue({
    status: "awaiting-copy",
  });
  await writeFile(
    path.join(context.root, "bad.json"),
    JSON.stringify([
      {
        sourceId: "screen",
        targetFrameId: "copied",
        guessedName: "Screen",
      },
    ]),
  );
  await expect(
    runDesignReleaseCommand(
      [
        "verify",
        "--from",
        "input.json",
        "--receipts",
        "bad.json",
      ],
      context,
    ),
  ).rejects.toThrow(/only sourceId/);
  expect(context.withPenpot).not.toHaveBeenCalled();
});
