import { mkdtemp, readFile, stat, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { listJournals, readJournal, runJournaledSteps, type JournalStep } from "../src/journal.js";

const folder = (): Promise<string> => mkdtemp(path.join(os.tmpdir(), "penpair-journal-"));
function batch(
  state: {
    values: number[];
    writes: number[];
  },
  fail: number | undefined,
  beforeWrite?: (index: number) => Promise<void>,
): JournalStep<number>[] {
  return state.values.map((_value, index) => ({
    key: `batch-${index}`,
    label: `put ${index}`,
    signature: `put-index-${index}-v1`,
    inspect: async () => state.values[index]!,
    apply: async () => {
      await beforeWrite?.(index);
      state.values[index] = 1;
      state.writes[index] = state.writes[index]! + 1;
      if (index === fail) {
        throw new Error("response lost after mutation");
      }
      return {
        done: true,
      };
    },
    verify: (current) => current === 1,
    reconcile: (before, current) =>
      current === 1 ? "complete" : current === before ? "pending" : "conflict",
  }));
}
const target = async () => ({
  fileId: "pinned-file",
  revision: 1,
});

describe("durable operation phases and explicit recovery", () => {
  it.each([
    0,
    1,
    2,
  ])("does not replay completed/ack-lost batch %i", async (fail) => {
    const root = await folder();
    const state = {
      values: [
        0,
        0,
        0,
      ],
      writes: [
        0,
        0,
        0,
      ],
    };
    const options = {
      root,
      runId: "test-run",
      operation: "test-batches",
      input: {
        desired: [
          1,
          1,
          1,
        ],
      },
      target,
    };
    await expect(
      runJournaledSteps(
        batch(state, fail, async (index) => {
          expect((await readJournal(root, "test-run")).steps[index]?.state).toBe("started");
        }),
        options,
      ),
    ).rejects.toMatchObject({
      runId: "test-run",
      outcome: "uncertain",
    });
    const interrupted = await readJournal(root, "test-run");
    expect(interrupted.steps[fail]?.state).toBe("uncertain");
    expect(interrupted.steps.slice(fail + 1).every((step) => step.state === "pending")).toBe(true);
    const finished = await runJournaledSteps(batch(state, undefined), {
      ...options,
      resume: true,
    });
    expect(finished.state).toBe("verified");
    expect(state.values).toEqual([
      1,
      1,
      1,
    ]);
    expect(state.writes).toEqual([
      1,
      1,
      1,
    ]);
    expect((await stat(path.join(root, ".penpair/runs/test-run.json"))).mode & 0o777).toBe(0o600);
    expect(await readFile(path.join(root, ".gitignore"), "utf8")).toContain(".penpair/");
  });
  it("refuses unexplained changes, changed inputs and changed code before resuming", async () => {
    const root = await folder();
    const state = {
      values: [
        0,
      ],
      writes: [
        0,
      ],
    };
    const options = {
      root,
      runId: "test-run",
      operation: "test",
      input: {
        desired: 1,
      },
      target,
    };
    await expect(runJournaledSteps(batch(state, 0), options)).rejects.toThrow(/uncertain/);
    await expect(
      runJournaledSteps(batch(state, undefined), {
        ...options,
        resume: true,
        input: {
          desired: 2,
        },
      }),
    ).rejects.toThrow(/inputs/);
    const changed = batch(state, undefined);
    changed[0]!.signature = "different code";
    await expect(
      runJournaledSteps(changed, {
        ...options,
        resume: true,
      }),
    ).rejects.toThrow(/implementation/);
    state.values[0] = 999;
    await expect(
      runJournaledSteps(batch(state, undefined), {
        ...options,
        resume: true,
      }),
    ).rejects.toMatchObject({
      outcome: "conflict",
    });
    expect(state.writes).toEqual([
      1,
    ]);
  });
  it("never resumes a run against another file", async () => {
    const root = await folder();
    const state = {
      values: [
        0,
      ],
      writes: [
        0,
      ],
    };
    const options = {
      root,
      runId: "test-run",
      operation: "test",
      input: {},
      target,
    };
    await expect(runJournaledSteps(batch(state, 0), options)).rejects.toThrow(/uncertain/);
    await expect(
      runJournaledSteps(batch(state, undefined), {
        ...options,
        resume: true,
        target: async () => ({
          fileId: "another",
          revision: 1,
        }),
      }),
    ).rejects.toThrow(/target/);
    expect(state.writes).toEqual([
      1,
    ]);
  });
  it("redacts persisted recovery data and refuses automatic use of altered evidence", async () => {
    const root = await folder();
    const state = {
      values: [
        0,
      ],
      writes: [
        0,
      ],
    };
    const options = {
      root,
      runId: "test-run",
      operation: "test",
      input: {},
      payload: {
        endpoint: "https://example.test/mcp?userToken=PRIVATE",
      },
      target,
    };
    const record = await runJournaledSteps(batch(state, undefined), options);
    expect(record.redacted).toBe(true);
    expect(await readFile(path.join(root, ".penpair/runs/test-run.json"), "utf8")).not.toContain(
      "PRIVATE",
    );
    await expect(
      runJournaledSteps(batch(state, undefined), {
        ...options,
        resume: true,
      }),
    ).rejects.toThrow(/redaction/);
  });
  it("lists only run metadata and rejects traversal/symlinked storage", async () => {
    const root = await folder();
    expect(await listJournals(root)).toEqual([]);
    await expect(readJournal(root, "../outside")).rejects.toThrow(/Run ID/);
    const outside = await folder();
    await symlink(outside, path.join(root, ".penpair"));
    await expect(
      runJournaledSteps([], {
        root,
        operation: "test",
        input: {},
        target,
      }),
    ).rejects.toThrow(/real directories/);
  });
  it("does not bypass a required unsupported checkpoint", async () => {
    const root = await folder();
    const state = {
      values: [
        0,
      ],
      writes: [
        0,
      ],
    };
    await expect(
      runJournaledSteps(batch(state, undefined), {
        root,
        operation: "test",
        input: {},
        target,
        requireCheckpoint: true,
        checkpoint: async () => ({
          supported: false,
        }),
      }),
    ).rejects.toMatchObject({
      outcome: "failed",
    });
    expect(state.writes).toEqual([
      0,
    ]);
  });
});

it("persists redacted lease/revision traces without weakening external-edit refusal", async () => {
  const root = await folder();
  let revision = 1;
  let inspections = 0;
  let writes = 0;
  await expect(
    runJournaledSteps(
      [
        {
          key: "step",
          label: "step",
          signature: "v1",
          inspect: async () => {
            if (++inspections === 2) {
              revision++;
            }
            return 0;
          },
          apply: async () => {
            writes++;
          },
          verify: () => true,
          reconcile: () => "pending",
        },
      ],
      {
        root,
        runId: "trace-test",
        operation: "trace",
        input: {},
        trace: true,
        target: async () => ({
          fileId: "file",
          revision,
        }),
        coordinate: async () => ({
          check: async () => undefined,
          release: async () => undefined,
        }),
      },
    ),
  ).rejects.toMatchObject({
    outcome: "conflict",
  });
  const record = await readJournal(root, "trace-test");
  expect(writes).toBe(0);
  expect(record.trace?.map((event) => event.event)).toEqual(
    expect.arrayContaining([
      "lease-acquire-start",
      "lease-acquired",
      "lease-check",
      "inspection-start",
      "inspection-end",
      "revision-observed",
      "lease-released",
    ]),
  );
  expect(
    record.trace?.every((event) =>
      Object.keys(event).every((key) =>
        [
          "event",
          "at",
          "elapsedMs",
          "step",
          "target",
        ].includes(key),
      ),
    ),
  ).toBe(true);
});
