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
it("refuses cycles, duplicates and malformed hierarchy", async () => {
  for (const mode of [
    "cycle",
    "duplicate",
    "malformed",
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
          : [
              null,
            ];
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

function largeFixture() {
  const f = fixture("absent");
  const children = Array.from(
    {
      length: 11000,
    },
    (_, index) => ({
      ...f.root,
      id: `child-${index}`,
      children: [],
    }),
  );
  f.root.children = children;
  Object.assign(f.penpot.currentPage, {
    getShapeById: (id: string) =>
      id === "root" ? f.root : children.find((shape) => shape.id === id),
  });
  return f;
}

it("scopes multiple explicit roots on a large page and refuses missing or overlapping roots", async () => {
  const f = largeFixture();
  expect(
    await waitForStableLayout(f.client, {
      shapeIds: [
        "child-1",
        "child-2",
      ],
      sleep: async () => undefined,
    }),
  ).toMatchObject({
    stable: true,
    method: "geometry",
    rootIds: [
      "child-1",
      "child-2",
    ],
    nodeCount: 2,
    maxNodes: 10000,
    truncated: false,
  });
  await expect(
    waitForStableLayout(f.client, {
      shapeIds: [
        "missing",
      ],
    }),
  ).rejects.toThrow(/target does not exist/);
  await expect(
    waitForStableLayout(f.client, {
      shapeIds: [
        "root",
        "child-1",
      ],
      maxNodes: 20000,
    }),
  ).rejects.toThrow(/duplicate/);
});

it("reports a bounded partial sample, or a complete sample with an increased budget, in both host and kit", async () => {
  const f = largeFixture();
  const pp = await new AsyncFunction("penpot", kit() + "\nreturn pp;")(f.penpot);
  for (const maxNodes of [
    1,
    10000,
    20000,
  ]) {
    const expected = {
      stable: true,
      method: maxNodes < 11001 ? "partial" : "geometry",
      rootIds: [
        "root",
      ],
      nodeCount: Math.min(maxNodes, 11001),
      maxNodes,
      truncated: maxNodes < 11001,
    };
    expect(
      await waitForStableLayout(f.client, {
        maxNodes,
        sleep: async () => undefined,
      }),
    ).toMatchObject(expected);
    expect(
      await pp.settle(f.root, {
        maxNodes,
        intervalMs: 1,
        timeoutMs: 500,
      }),
    ).toMatchObject(expected);
  }
});

it("keeps the depth-first sample bounded for deep trees as well as wide pages", async () => {
  const f = fixture("absent");
  let parent = f.root;
  for (let index = 0; index < 20; index++) {
    const child = {
      ...f.root,
      id: `nested-${index}`,
      children: [],
    };
    parent.children = [
      child,
    ];
    parent = child;
  }
  expect(
    await waitForStableLayout(f.client, {
      maxNodes: 5,
      sleep: async () => undefined,
    }),
  ).toMatchObject({
    stable: true,
    method: "partial",
    nodeCount: 5,
    truncated: true,
  });
});

it.each([
  "0",
  "100001",
  "1.2",
  "NaN",
])("rejects invalid layout node budget %s before connection", async (budget) => {
  const result = await runCommand([
    "run-file",
    "build.js",
    "--layout-max-nodes",
    budget,
  ]);
  expect(result.exitCode).toBe(1);
  expect(JSON.stringify(result)).toContain("integer from 1 to 100000");
});

it("uses concurrent board-native waits for multiple roots without a global API", async () => {
  vi.useFakeTimers();
  const f = fixture("absent");
  const firstWait = vi.fn(async () => new Promise((resolve) => setTimeout(resolve, 50)));
  const secondWait = vi.fn(async () => new Promise((resolve) => setTimeout(resolve, 70)));
  const roots = [
    {
      ...f.root,
      id: "first-board",
      waitForLayoutUpdate: firstWait,
    },
    {
      ...f.root,
      id: "second-board",
      waitForLayoutUpdate: secondWait,
    },
  ];
  Object.assign(f.penpot.currentPage, {
    getShapeById: (id: string) => roots.find((shape) => shape.id === id),
  });
  const pp = await new AsyncFunction("penpot", kit() + "\nreturn pp;")(f.penpot);
  const pending = [
    waitForStableLayout(f.client, {
      shapeIds: roots.map((shape) => shape.id),
      strategy: "native",
      timeoutMs: 400,
    }),
    pp.settle(roots, {
      strategy: "native",
      timeoutMs: 400,
    }),
  ];
  await vi.runAllTimersAsync();
  for (const result of await Promise.all(pending)) {
    expect(result).toMatchObject({
      stable: true,
      method: "native",
      nativeOutcome: "completed",
      samples: 1,
      nodeCount: 2,
      rootIds: [
        "first-board",
        "second-board",
      ],
      elapsedMs: 70,
    });
  }
  expect(firstWait).toHaveBeenCalledTimes(2);
  expect(secondWait).toHaveBeenCalledTimes(2);
});

it("caps concurrent board-native waits with one shared deadline", async () => {
  vi.useFakeTimers();
  const f = fixture("absent");
  const roots = [
    {
      ...f.root,
      id: "first-board",
      waitForLayoutUpdate: async () => new Promise((resolve) => setTimeout(resolve, 50)),
    },
    {
      ...f.root,
      id: "second-board",
      waitForLayoutUpdate: async () => new Promise(() => undefined),
    },
  ];
  Object.assign(f.penpot.currentPage, {
    getShapeById: (id: string) => roots.find((shape) => shape.id === id),
  });
  const pp = await new AsyncFunction("penpot", kit() + "\nreturn pp;")(f.penpot);
  const pending = pp.settle(roots, {
    strategy: "native",
    timeoutMs: 400,
  });
  await vi.runAllTimersAsync();
  expect(await pending).toMatchObject({
    stable: false,
    method: "native",
    nativeOutcome: "failed",
    elapsedMs: 400,
  });
});

it("refuses vanished explicit roots before invoking any native wait", async () => {
  const f = fixture("absent");
  const wait = vi.fn(async () => undefined);
  const present = {
    ...f.root,
    id: "present-board",
    waitForLayoutUpdate: wait,
  };
  const missing = {
    ...f.root,
    id: "missing-board",
    waitForLayoutUpdate: wait,
  };
  Object.assign(f.penpot.currentPage, {
    getShapeById: (id: string) => (id === present.id ? present : null),
  });
  const pp = await new AsyncFunction("penpot", kit() + "\nreturn pp;")(f.penpot);
  expect(
    await pp.settle(
      [
        present,
        missing,
      ],
      {
        strategy: "native",
      },
    ),
  ).toMatchObject({
    stable: false,
    reason: "Layout target no longer exists",
  });
  expect(wait).not.toHaveBeenCalled();
});

it("names the maximum when a layout budget is refused", async () => {
  const f = fixture("success");
  await expect(
    waitForStableLayout(f.client, {
      timeoutMs: 45000,
    }),
  ).rejects.toThrow(
    /Invalid layout settling budgets: timeoutMs must be from 1 to 30000 \(got 45000\)/,
  );
  await expect(
    waitForStableLayout(f.client, {
      timeoutMs: 30000,
      intervalMs: 10,
    }),
  ).rejects.toThrow(/more than 1000 samples/);
  expect(f.calls()).toBe(0);
});
