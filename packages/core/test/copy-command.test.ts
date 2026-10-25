import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { PenpotToolClient } from "../src/client.js";
import type { DesignCommandContext } from "../src/design-commands/context.js";
import { runDesignReleaseCommand } from "../src/design-commands/release-command.js";
import { copyReleaseBoards } from "../src/design-releases/copy.js";
import * as clipboard from "../src/native-editor-clipboard.js";

vi.mock("../src/design-releases/copy.js", () => ({
  copyReleaseBoards: vi.fn(),
}));

const client = {} as PenpotToolClient;
const result = (status: "preview" | "copied" | "incomplete") =>
  ({
    status,
  }) as Awaited<ReturnType<typeof copyReleaseBoards>>;
const args = [
  "copy",
  "--source-page",
  "Candidate",
  "--frame",
  "frame-a",
  "--frame",
  "frame-b",
  "--release",
  "1.2.0",
];
let context: DesignCommandContext;

beforeEach(() => {
  context = {
    root: "/project",
    output: {
      log: vi.fn(),
      result: vi.fn(),
      error: vi.fn(),
    },
    redact: (value) => value,
    copyTarget: {
      fileId: "file-id",
      origin: "https://example.test",
      allowLoopbackAlias: false,
    },
    withPenpot: vi.fn(async (work) => work(client)),
  };
  vi.mocked(copyReleaseBoards).mockResolvedValue(result("preview"));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

it("previews actual boards through the existing guarded connection without browser acquisition", async () => {
  const connect = vi.spyOn(clipboard, "connectNativeClipboard");
  expect(await runDesignReleaseCommand(args, context)).toBe(0);
  expect(copyReleaseBoards).toHaveBeenCalledWith(
    client,
    "/project",
    {
      fileId: "file-id",
      sourcePage: "Candidate",
      frameIds: [
        "frame-a",
        "frame-b",
      ],
      releaseVersion: "1.2.0",
    },
    expect.objectContaining({
      apply: false,
      resume: false,
    }),
  );
  expect(vi.mocked(copyReleaseBoards).mock.calls[0]![3]).not.toHaveProperty("clipboard");
  expect(connect).not.toHaveBeenCalled();
  expect(context.output.result).toHaveBeenCalledWith(result("preview"));
});

it("provides clipboard acquisition only for explicit apply and forwards the original recovery run", async () => {
  const driver = {
    copy: vi.fn(),
    paste: vi.fn(),
    close: vi.fn(),
  };
  const connect = vi.spyOn(clipboard, "connectNativeClipboard").mockResolvedValue(driver);
  vi.mocked(copyReleaseBoards).mockResolvedValue(result("copied"));
  expect(
    await runDesignReleaseCommand(
      [
        ...args,
        "--apply",
        "--debug-port",
        "9222",
        "--resume",
        "original-run",
      ],
      context,
    ),
  ).toBe(0);
  expect(connect).not.toHaveBeenCalled();
  const options = vi.mocked(copyReleaseBoards).mock.calls[0]![3]!;
  expect(options).toMatchObject({
    apply: true,
    resume: true,
    runId: "original-run",
  });
  expect(await options.clipboard!()).toBe(driver);
  expect(connect).toHaveBeenCalledWith(
    expect.objectContaining({
      origin: "https://example.test",
      fileId: "file-id",
      allowLoopbackAlias: false,
      port: 9222,
      timeoutMs: 30000,
    }),
  );
});

it("preserves incomplete evidence as exit 3 rather than claiming verified release approval", async () => {
  vi.mocked(copyReleaseBoards).mockResolvedValue(result("incomplete"));
  expect(await runDesignReleaseCommand(args, context)).toBe(3);
});

it("explains the copy command without requiring a release JSON file or connection", async () => {
  expect(
    await runDesignReleaseCommand(
      [
        "copy",
        "--help",
      ],
      context,
    ),
  ).toBe(0);
  expect(context.withPenpot).not.toHaveBeenCalled();
  expect(copyReleaseBoards).not.toHaveBeenCalled();
});

it.each([
  [
    "copy",
  ],
  [
    ...args,
    "--from",
    "release.json",
  ],
  [
    ...args,
    "--frame",
    "frame-a",
  ],
  [
    ...args,
    "--apply",
  ],
  [
    ...args,
    "--debug-port",
    "0",
  ],
  [
    ...args,
    "--debug-port",
    "65536",
  ],
  [
    ...args,
    "--debug-port",
    "1.5",
  ],
  [
    ...args,
    "--resume",
    "original-run",
  ],
  [
    ...args,
    "--apply",
    "--debug-port",
    "9222",
    "--resume",
    "../escape",
  ],
  [
    "copy",
    "--source-page",
    "Candidate",
    "--frame",
    "frame-a",
    "--release",
    "../other",
  ],
])("refuses invalid direct-copy arguments before connecting: %j", async (invalid) => {
  await expect(runDesignReleaseCommand(invalid, context)).rejects.toThrow();
  expect(context.withPenpot).not.toHaveBeenCalled();
  expect(copyReleaseBoards).not.toHaveBeenCalled();
});

it("requires the explicit project file pin before connecting", async () => {
  context.copyTarget = undefined;
  await expect(runDesignReleaseCommand(args, context)).rejects.toThrow(/file pin/);
  expect(context.withPenpot).not.toHaveBeenCalled();
});
