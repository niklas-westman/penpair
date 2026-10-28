import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { runCommand } from "../src/cli-main.js";
import type { CommandResult } from "../src/command-result.js";
import {
  hashSpec,
  jobArguments,
  listQueues,
  parseQueueSpec,
  readQueue,
  runQueue,
  type QueueSpec,
} from "../src/queue.js";

const job = (id: string, extra: object = {}) => ({
  id,
  file: `${id}.js`,
  inspect: "inspect.js",
  readback: "readback.js",
  ...extra,
});
const spec = (
  extra: object = {},
  jobs = [
    job("a"),
    job("b"),
    job("c"),
  ],
) =>
  parseQueueSpec(
    JSON.stringify({
      version: 1,
      backoffMs: 0,
      jobs,
      ...extra,
    }),
  );
const result = (
  outcome: CommandResult["outcome"],
  extra: {
    runId?: string;
    error?: {
      code: string;
      message: string;
    };
  } = {},
): CommandResult =>
  ({
    outcome,
    exitCode: outcome === "success" || outcome === "already-satisfied" ? 0 : 1,
    runId: extra.runId ?? null,
    errors: extra.error
      ? [
          {
            ...extra.error,
            remedy: "",
          },
        ]
      : [],
    data: null,
  }) as unknown as CommandResult;

async function run(
  queue: QueueSpec,
  answers: (argv: string[]) => CommandResult,
  record?: Parameters<typeof runQueue>[0]["record"],
) {
  const root = await mkdtemp(path.join(os.tmpdir(), "penpair-queue-"));
  const calls: string[][] = [];
  const lines: string[] = [];
  const finished = await runQueue({
    root,
    spec: queue,
    specHash: hashSpec(queue),
    queueId: "q-test",
    record,
    exec: async (argv) => {
      calls.push(argv);
      return answers(argv);
    },
    sleep: async () => undefined,
    log: (line) => void lines.push(line),
  });
  return {
    root,
    calls,
    lines,
    finished,
  };
}

describe("queue file", () => {
  it("applies defaults and refuses unknown keys, duplicate ids and unusable values", () => {
    expect(spec()).toMatchObject({
      retries: 2,
      stopOnFailure: false,
    });
    expect(() =>
      parseQueueSpec(
        JSON.stringify({
          version: 1,
          jobs: [
            job("a"),
            job("a"),
          ],
        }),
      ),
    ).toThrow(/distinct/);
    expect(() =>
      parseQueueSpec(
        JSON.stringify({
          version: 1,
          jobs: [
            job("a", {
              frame: "x",
            }),
          ],
        }),
      ),
    ).toThrow(/unknown key "frame"/);
    expect(() =>
      parseQueueSpec(
        JSON.stringify({
          version: 1,
          retries: 9,
          jobs: [
            job("a"),
          ],
        }),
      ),
    ).toThrow(/retries/);
    expect(() =>
      parseQueueSpec(
        JSON.stringify({
          version: 1,
          jobs: [
            job("a", {
              params: {
                x: {
                  y: 1,
                },
              },
            }),
          ],
        }),
      ),
    ).toThrow(/param/);
    expect(() =>
      parseQueueSpec(
        JSON.stringify({
          version: 2,
          jobs: [
            job("a"),
          ],
        }),
      ),
    ).toThrow(/version/);
    expect(() => parseQueueSpec("{")).toThrow(/not valid JSON/);
  });
  it("turns a job into a journaled run-file command", () => {
    const parsed = spec({}, [
      job("a", {
        page: "P",
        params: {
          value: 7,
        },
        include: [
          "kit.js",
        ],
        stages: 5,
        layoutRoots: [
          "r1",
        ],
        layoutScope: "page",
      }),
    ]).jobs[0]!;
    expect(jobArguments(parsed)).toEqual([
      "run-file",
      "a.js",
      "--inspect",
      "inspect.js",
      "--readback",
      "readback.js",
      "--page",
      "P",
      "--param",
      "value=7",
      "--include",
      "kit.js",
      "--stages",
      "5",
      "--layout-root",
      "r1",
      "--layout-scope",
      "page",
      "--apply",
    ]);
    expect(jobArguments(parsed, "run-9").slice(-2)).toEqual([
      "--resume",
      "run-9",
    ]);
  });
});

describe("running a queue", () => {
  it("runs the jobs in order, one at a time, and saves each state", async () => {
    const { calls, finished, root, lines } = await run(spec(), () =>
      result("success", {
        runId: "r",
      }),
    );
    expect(calls.map((argv) => argv[1])).toEqual([
      "a.js",
      "b.js",
      "c.js",
    ]);
    expect(finished.state).toBe("done");
    expect(finished.jobs.map((entry) => entry.state)).toEqual([
      "ok",
      "ok",
      "ok",
    ]);
    expect((await readQueue(root, "q-test")).state).toBe("done");
    expect((await listQueues(root))[0]).toMatchObject({
      queueId: "q-test",
      jobs: 3,
    });
    expect(lines[0]).toContain('job 1 of 3 "a": running');
  });

  it("counts a write that was not needed as done, and says so", async () => {
    const { finished } = await run(
      spec({}, [
        job("a"),
      ]),
      () => result("already-satisfied"),
    );
    expect(finished.jobs[0]!.state).toBe("already-satisfied");
    expect(finished.state).toBe("done");
  });

  it("resumes an uncertain run from its journal instead of starting it again", async () => {
    let first = true;
    const { calls, finished } = await run(
      spec({}, [
        job("a"),
      ]),
      () => {
        if (first) {
          first = false;
          return result("uncertain", {
            runId: "run-1",
          });
        }
        return result("success", {
          runId: "run-1",
        });
      },
    );
    expect(calls[1]!.slice(-2)).toEqual([
      "--resume",
      "run-1",
    ]);
    expect(finished.jobs[0]).toMatchObject({
      state: "ok",
      attempts: 2,
    });
  });

  it("wakes the editor after a lost connection, then retries the job", async () => {
    let first = true;
    const { calls, finished } = await run(
      spec(
        {
          wake: {
            debugPort: 9222,
          },
        },
        [
          job("a"),
        ],
      ),
      (argv) => {
        if (argv[0] === "wake") {
          return result("success");
        }
        if (first) {
          first = false;
          return result("failed", {
            error: {
              code: "tool-failed",
              message: "No Penpot instance connected for user token",
            },
          });
        }
        return result("success", {
          runId: "run-2",
        });
      },
    );
    expect(calls.map((argv) => argv[0])).toEqual([
      "run-file",
      "wake",
      "run-file",
    ]);
    expect(calls[1]).toEqual([
      "wake",
      "--debug-port",
      "9222",
    ]);
    expect(finished.jobs[0]!.state).toBe("ok");
  });

  it("does not retry a failed verification and goes on to the next job", async () => {
    const { calls, finished } = await run(spec(), (argv) =>
      argv[1] === "b.js"
        ? result("failed", {
            runId: "run-b",
            error: {
              code: "tool-failed",
              message: "readback failed",
            },
          })
        : result("success"),
    );
    expect(calls.filter((argv) => argv[1] === "b.js")).toHaveLength(1);
    expect(finished.jobs.map((entry) => entry.state)).toEqual([
      "ok",
      "failed",
      "ok",
    ]);
    expect(finished.jobs[1]!.message).toBe("readback failed");
    expect(finished.state).toBe("failed");
  });

  it("stops after the first failure when asked", async () => {
    const { calls, finished } = await run(
      spec({
        stopOnFailure: true,
      }),
      (argv) => (argv[1] === "a.js" ? result("failed") : result("success")),
    );
    expect(calls).toHaveLength(1);
    expect(finished.jobs.map((entry) => entry.state)).toEqual([
      "failed",
      "queued",
      "queued",
    ]);
  });

  it("gives up after the retries and reports the job as uncertain", async () => {
    const { calls, finished } = await run(
      spec(
        {
          retries: 1,
        },
        [
          job("a"),
        ],
      ),
      () =>
        result("uncertain", {
          runId: "run-3",
        }),
    );
    expect(calls).toHaveLength(2);
    expect(finished.jobs[0]).toMatchObject({
      state: "uncertain",
      runId: "run-3",
    });
  });

  it("continues a saved queue without running finished jobs again", async () => {
    const queue = spec();
    const first = await run(queue, (argv) =>
      argv[1] === "b.js" ? result("failed") : result("success"),
    );
    const second = await run(queue, () => result("success"), first.finished);
    expect(second.calls.map((argv) => argv[1])).toEqual([
      "b.js",
    ]);
    expect(second.finished.state).toBe("done");
  });
});

describe("locks command", () => {
  it("lists and clears locks offline", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "penpair-locks-cli-"));
    expect(
      (
        await runCommand(
          [
            "locks",
          ],
          {
            root,
          },
        )
      ).exitCode,
    ).toBe(0);
    expect(
      (
        await runCommand(
          [
            "locks",
            "clear",
          ],
          {
            root,
          },
        )
      ).data,
    ).toMatchObject({
      cleared: [],
      kept: [],
    });
    expect(
      (
        await runCommand(
          [
            "locks",
            "wipe",
          ],
          {
            root,
          },
        )
      ).errors[0]!.message,
    ).toMatch(/usage: penpair locks/);
  });
});

describe("queue command", () => {
  it("lists queues offline and refuses a malformed queue file before running anything", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "penpair-queue-cli-"));
    await writeFile(
      path.join(root, "bad.json"),
      JSON.stringify({
        version: 1,
        jobs: [],
      }),
    );
    const listed = await runCommand(
      [
        "queue",
        "status",
      ],
      {
        root,
      },
    );
    expect(listed).toMatchObject({
      exitCode: 0,
      command: "queue",
    });
    expect(JSON.parse(JSON.stringify(listed.data))).toEqual([]);
    const refused = await runCommand(
      [
        "queue",
        "run",
        "bad.json",
      ],
      {
        root,
      },
    );
    expect(refused.exitCode).not.toBe(0);
    expect(refused.errors[0]!.message).toMatch(/jobs must be a list/);
    expect(
      (
        await runCommand(
          [
            "queue",
            "run",
          ],
          {
            root,
          },
        )
      ).errors[0]!.message,
    ).toMatch(/usage: penpair queue/);
  });
});
