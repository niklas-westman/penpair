import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { PenpotToolClient } from "../src/client.js";
import type { DesignCommandContext } from "../src/design-commands/context.js";
import { runDesignReleaseCommand } from "../src/design-commands/release-command.js";
import { copyReleaseBoards } from "../src/design-releases/copy.js";
import { findPastedBoards } from "../src/design-releases/copy-find.js";
import * as clipboard from "../src/native-editor-clipboard.js";

vi.mock("../src/design-releases/copy.js", () => ({
  copyReleaseBoards: vi.fn(),
}));

vi.mock("../src/design-releases/copy-find.js", () => ({
  findPastedBoards: vi.fn(),
}));

const client = {} as PenpotToolClient;
const result = (status: "preview" | "copied" | "incomplete" | "misplaced" | "uncertain") =>
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

it.each([
  "human",
  "json",
  "off",
])("streams copy progress in %s mode without turning it into warnings", async (mode) => {
  const stderr = vi.spyOn(console, "error").mockImplementation(() => undefined);
  context.redact = (text) => text.replaceAll("PRIVATE", "[redacted]");
  vi.mocked(copyReleaseBoards).mockImplementation(async (_client, _root, _request, options) => {
    options?.onProgress?.({
      schemaVersion: 1,
      kind: "progress",
      command: "design-release copy",
      phase: "prepare",
      status: "waiting",
      frame: "Board\nPRIVATE",
      index: 1,
      total: 2,
      elapsedMs: 5000,
      runId: "copy-run",
    });
    options?.onStep?.("journal PRIVATE step");
    return result("preview");
  });
  expect(
    await runDesignReleaseCommand(
      [
        ...args,
        "--progress",
        mode,
      ],
      context,
    ),
  ).toBe(0);
  expect(context.output.error).not.toHaveBeenCalled();
  expect(context.output.log).toHaveBeenCalledOnce();
  if (mode === "off") {
    expect(stderr).not.toHaveBeenCalled();
  } else {
    expect(stderr).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(stderr.mock.calls)).not.toContain("PRIVATE");
    if (mode === "json") {
      expect(JSON.parse(String(stderr.mock.calls[0]?.[0]))).toMatchObject({
        runId: "copy-run",
        frame: "Board\n[redacted]",
        index: 1,
        total: 2,
      });
      expect(JSON.parse(String(stderr.mock.calls[1]?.[0])).phase).toBe("journal");
    } else {
      expect(String(stderr.mock.calls[0]?.[0])).toContain('"Board\\n[redacted]"');
    }
  }
});

it("rejects invalid progress modes before acquiring any connection", async () => {
  await expect(
    runDesignReleaseCommand(
      [
        ...args,
        "--progress",
        "tail",
      ],
      context,
    ),
  ).rejects.toThrow("--progress");
  expect(context.withPenpot).not.toHaveBeenCalled();
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

const applied = [
  ...args,
  "--apply",
  "--debug-port",
  "9222",
];
const token = "pat-secret-token-value";

it("hands the backend to the copy and keeps the token out of everything it prints", async () => {
  vi.stubEnv("PENPAIR_PAT_TOKEN", token);
  vi.mocked(copyReleaseBoards).mockResolvedValue(result("copied"));
  expect(await runDesignReleaseCommand(applied, context)).toBe(0);
  const options = vi.mocked(copyReleaseBoards).mock.calls[0]![3]!;
  expect(options.backend).toBeDefined();
  expect(options.redact!(`failed with Token ${token} in the header`)).not.toContain(token);
  expect(options).not.toHaveProperty("verifyPixels");
  vi.unstubAllEnvs();
});

it("passes the chosen pixel mode on, and ignores the token when the plugin route is asked for", async () => {
  vi.stubEnv("PENPAIR_PAT_TOKEN", token);
  vi.mocked(copyReleaseBoards).mockResolvedValue(result("copied"));
  await runDesignReleaseCommand(
    [
      ...applied,
      "--verify-pixels",
      "sample",
    ],
    context,
  );
  expect(vi.mocked(copyReleaseBoards).mock.calls[0]![3]).toMatchObject({
    verifyPixels: "sample",
  });
  await runDesignReleaseCommand(
    [
      ...applied,
      "--evidence",
      "plugin",
    ],
    context,
  );
  expect(vi.mocked(copyReleaseBoards).mock.calls[1]![3]).not.toHaveProperty("backend");
  vi.unstubAllEnvs();
});

it("does not read the token for a preview, and works without one", async () => {
  vi.stubEnv("PENPAIR_PAT_TOKEN", token);
  await runDesignReleaseCommand(args, context);
  expect(vi.mocked(copyReleaseBoards).mock.calls[0]![3]).not.toHaveProperty("backend");
  vi.stubEnv("PENPAIR_PAT_TOKEN", "");
  vi.mocked(copyReleaseBoards).mockResolvedValue(result("copied"));
  await runDesignReleaseCommand(applied, context);
  expect(vi.mocked(copyReleaseBoards).mock.calls[1]![3]).not.toHaveProperty("backend");
  vi.unstubAllEnvs();
});

it("refuses --evidence backend without a token, and values it does not know", async () => {
  vi.stubEnv("PENPAIR_PAT_TOKEN", "");
  await expect(
    runDesignReleaseCommand(
      [
        ...applied,
        "--evidence",
        "backend",
      ],
      context,
    ),
  ).rejects.toThrow(/PENPAIR_PAT_TOKEN/);
  await expect(
    runDesignReleaseCommand(
      [
        ...applied,
        "--evidence",
        "nope",
      ],
      context,
    ),
  ).rejects.toThrow(/--evidence takes/);
  await expect(
    runDesignReleaseCommand(
      [
        ...applied,
        "--verify-pixels",
        "nope",
      ],
      context,
    ),
  ).rejects.toThrow(/--verify-pixels takes/);
  await expect(
    runDesignReleaseCommand(
      [
        ...applied,
        "--pixel-renderer",
        "nope",
      ],
      context,
    ),
  ).rejects.toThrow(/--pixel-renderer takes exporter or editor/);
  expect(copyReleaseBoards).not.toHaveBeenCalled();
  vi.unstubAllEnvs();
});

it.each([
  "misplaced",
  "uncertain",
  "incomplete",
] as const)("exits non-zero for a %s copy, never as if it had worked", async (status) => {
  vi.mocked(copyReleaseBoards).mockResolvedValue(result(status));
  expect(await runDesignReleaseCommand(args, context)).toBe(3);
});

it("finds pasted boards with one run id, read-only, and exits non-zero when some sit inside other boards", async () => {
  vi.mocked(findPastedBoards).mockResolvedValue({
    misplaced: [
      {},
    ],
  } as unknown as Awaited<ReturnType<typeof findPastedBoards>>);
  const connect = vi.spyOn(clipboard, "connectNativeClipboard");
  expect(
    await runDesignReleaseCommand(
      [
        "copy",
        "--find-pasted",
        "run-1",
      ],
      context,
    ),
  ).toBe(3);
  expect(findPastedBoards).toHaveBeenCalledWith(client, "/project", "run-1");
  expect(connect).not.toHaveBeenCalled();
  vi.mocked(findPastedBoards).mockResolvedValue({
    misplaced: [],
  } as unknown as Awaited<ReturnType<typeof findPastedBoards>>);
  expect(
    await runDesignReleaseCommand(
      [
        "copy",
        "--find-pasted",
        "run-1",
      ],
      context,
    ),
  ).toBe(0);
});

it.each([
  [
    "a run id that is a path",
    [
      "copy",
      "--find-pasted",
      "../x",
    ],
  ],
  [
    "--apply",
    [
      "copy",
      "--find-pasted",
      "run-1",
      "--apply",
    ],
  ],
  [
    "a debug port",
    [
      "copy",
      "--find-pasted",
      "run-1",
      "--debug-port",
      "9222",
    ],
  ],
  [
    "--abandon",
    [
      "copy",
      "--find-pasted",
      "run-1",
      "--abandon",
      "run-2",
    ],
  ],
])("refuses --find-pasted with %s", async (_label, given) => {
  await expect(runDesignReleaseCommand(given, context)).rejects.toThrow(/find-pasted/);
  expect(findPastedBoards).not.toHaveBeenCalled();
});
