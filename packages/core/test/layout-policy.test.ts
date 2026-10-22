import { afterEach, expect, it, vi } from "vitest";
import { kit } from "../src/kit.js";
import { waitForStableLayout } from "../src/layout.js";
import { runCommand } from "../src/cli-main.js";
import type { PenpotToolClient } from "../src/client.js";
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
afterEach(() => vi.useRealTimers());
function fixture(native: "success" | "fail" | "hang" | "absent") {
  const root = {
    id: "root",
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    children: [] as unknown[],
  };
  const penpot = {
    currentFile: {
      id: "file",
    },
    currentPage: {
      id: "page",
      root,
    },
    ...(native !== "absent"
      ? {
          waitForLayoutUpdate: async () => {
            if (native === "fail") {
              throw new Error("idle timeout");
            }
            if (native === "hang") {
              await new Promise(() => undefined);
            }
          },
        }
      : {}),
  };
  let calls = 0;
  const client: PenpotToolClient = {
    async callTool(_name, args) {
      calls++;
      return {
        text: JSON.stringify({
          result: await new AsyncFunction("penpot", String(args.code))(penpot),
          log: "",
        }),
        isError: false,
      };
    },
    async close() {},
  };
  return {
    root,
    penpot,
    client,
    calls: () => calls,
  };
}
it.each([
  "fail",
  "hang",
  "absent",
] as const)("host and kit share auto fallback for %s native waits", async (native) => {
  vi.useFakeTimers();
  const f = fixture(native);
  const pp = await new AsyncFunction("penpot", kit() + "\nreturn pp;")(f.penpot);
  const host = waitForStableLayout(f.client);
  const sandbox = pp.settle();
  await vi.runAllTimersAsync();
  for (const result of await Promise.all([
    host,
    sandbox,
  ])) {
    expect(result).toMatchObject({
      stable: true,
      method: "geometry",
      samples: 3,
      strategy: "auto",
      fallbackReason: expect.any(String),
      nativeOutcome: native === "absent" ? "unsupported" : "failed",
    });
  }
  expect(f.calls()).toBe(3);
});
it("caps auto native at 500 ms and one quarter of the total budget", async () => {
  vi.useFakeTimers();
  const f = fixture("hang");
  const pending = waitForStableLayout(f.client, {
    timeoutMs: 400,
    intervalMs: 10,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  });
  await vi.advanceTimersByTimeAsync(99);
  expect(f.calls()).toBe(1);
  await vi.runAllTimersAsync();
  expect(await pending).toMatchObject({
    stable: true,
    elapsedMs: 120,
  });
});
it("geometry skips native; native failures cannot fall back", async () => {
  const f = fixture("fail");
  expect(
    await waitForStableLayout(f.client, {
      strategy: "geometry",
      sleep: async () => undefined,
    }),
  ).toMatchObject({
    stable: true,
    samples: 3,
    nativeOutcome: "skipped",
  });
  expect(
    await waitForStableLayout(f.client, {
      strategy: "native",
    }),
  ).toMatchObject({
    stable: false,
    method: "native",
    nativeOutcome: "failed",
  });
});
it("refuses cycles, duplicates, malformed hierarchy and node overflow", async () => {
  for (const mode of [
    "cycle",
    "duplicate",
    "malformed",
    "overflow",
  ]) {
    const f = fixture("absent");
    f.root.children =
      mode === "cycle"
        ? [
            f.root,
          ]
        : mode === "duplicate"
          ? [
              {
                ...f.root,
              },
            ]
          : mode === "malformed"
            ? [
                null,
              ]
            : Array.from(
                {
                  length: 10000,
                },
                (_, i) => ({
                  ...f.root,
                  id: `child-${i}`,
                  children: [],
                }),
              );
    await expect(waitForStableLayout(f.client)).rejects.toThrow(/geometry|budget/);
  }
});
it("lost transport never becomes fallback evidence", async () => {
  const f = fixture("fail");
  f.client.callTool = async () => {
    throw new Error("disconnected");
  };
  await expect(waitForStableLayout(f.client)).rejects.toThrow();
  expect(f.calls()).toBe(0);
});
it.each([
  "run-file",
  "export",
  "shots",
])("rejects invalid %s layout before connection", async (command) => {
  const args =
    command === "export"
      ? [
          command,
          "id",
          "out.png",
        ]
      : command === "shots"
        ? [
            command,
            "--page",
            "P",
          ]
        : [
            command,
            "build.js",
          ];
  const result = await runCommand([
    ...args,
    "--layout",
    "off",
  ]);
  expect(result.exitCode).toBe(1);
  expect(JSON.stringify(result)).toContain("auto, native or geometry");
});

it.each([
  {
    native: undefined,
  },
  {
    truncated: undefined,
  },
  {
    nativeOutcome: "invented",
  },
  {
    geometry: [
      [
        "root",
        0,
        0,
        10,
        10,
        null,
        0,
      ],
      [
        "child",
        0,
        0,
        1,
        1,
        null,
        0,
      ],
    ],
  },
  {
    geometry: [
      [
        "root",
        0,
        0,
        10,
        10,
        null,
        0,
      ],
      [
        "child",
        0,
        0,
        1,
        1,
        "root",
        2,
      ],
    ],
  },
])("malformed observation cannot become a successful fallback: %j", async (alteration) => {
  const client: PenpotToolClient = {
    async callTool() {
      return {
        text: JSON.stringify({
          result: {
            ok: true,
            fileId: "file",
            pageId: "page",
            native: false,
            nativeOutcome: "unsupported",
            truncated: false,
            geometry: [
              [
                "root",
                0,
                0,
                10,
                10,
                null,
                0,
              ],
            ],
            ...alteration,
          },
          log: "",
        }),
        isError: false,
      };
    },
    async close() {},
  };
  await expect(
    waitForStableLayout(client, {
      sleep: async () => undefined,
    }),
  ).rejects.toThrow(/Malformed|hierarchy/);
});

it("cancellation after a delivered layout read stops without another observation", async () => {
  const { withCommandSignal, CommandInterruptedError } = await import("../src/command-result.js");
  const controller = new AbortController();
  const f = fixture("fail");
  const call = f.client.callTool.bind(f.client);
  f.client.callTool = async (...args) => {
    const result = await call(...args);
    controller.abort(new CommandInterruptedError("cancelled"));
    return result;
  };
  await expect(
    withCommandSignal(controller.signal, () => waitForStableLayout(f.client)),
  ).rejects.toMatchObject({
    code: "cancelled",
  });
  expect(f.calls()).toBe(1);
});
