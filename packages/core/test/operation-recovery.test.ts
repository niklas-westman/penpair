import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runOperation, type Operation } from "../src/operation.js";
import { snippet } from "../src/snippet.js";
import { archiveApply } from "../src/snippets/archive.js";
import type { PenpotToolClient } from "../src/client.js";

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
it("resumes a registered-style operation from independent observations after a lost acknowledgment", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "penpair-operation-"));
  const penpot = {
    currentPage: {
      id: "page",
      root: {
        id: "root",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        children: [],
      },
    },
    currentFile: {
      id: "file",
      revn: 1,
    },
    value: 0,
    writes: 0,
  };
  let lost = false;
  const client: PenpotToolClient = {
    async callTool(_name, args) {
      const code = String(args.code);
      const result = await new AsyncFunction("penpot", code)(penpot);
      if (code.includes("penpot.writes++") && !lost) {
        lost = true;
        throw new Error("acknowledgment lost");
      }
      return {
        text: JSON.stringify({
          result,
          log: "",
        }),
        isError: false,
      };
    },
    async close() {},
  };
  const operation: Operation<Record<string, never>> = {
    name: "set-value",
    page: () => undefined,
    inspect: () => snippet("inspect", "return {ok:true, value:penpot.value};"),
    apply: () => snippet("apply", "penpot.value=1; penpot.writes++; return {ok:true};"),
    readback: () => snippet("readback", "return {ok:true, value:penpot.value};"),
    verify: ({ readback }) =>
      readback.value === 1
        ? []
        : [
            "wrong value",
          ],
  };
  const options = {
    apply: true,
    settleMs: 0,
    journal: {
      root,
      runId: "test-run",
    },
  };
  await expect(runOperation(client, operation, {}, options)).rejects.toMatchObject({
    outcome: "uncertain",
  });
  expect(
    await runOperation(
      client,
      operation,
      {},
      {
        ...options,
        journal: {
          ...options.journal,
          resume: true,
        },
      },
    ),
  ).toMatchObject({
    verified: true,
    outcome: "verified",
  });
  expect(penpot.writes).toBe(1);
});

describe("a readback that already holds before the write", () => {
  const setup = async (startValue: number) => {
    const root = await mkdtemp(path.join(os.tmpdir(), "penpair-satisfied-"));
    const penpot = {
      currentPage: {
        id: "page",
        root: {
          id: "root",
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          children: [],
        },
      },
      currentFile: {
        id: "file",
        revn: 1,
      },
      value: startValue,
      writes: 0,
    };
    const baselines: unknown[] = [];
    const client: PenpotToolClient = {
      async callTool(_name, args) {
        const result = await new AsyncFunction("penpot", String(args.code))(penpot);
        return {
          text: JSON.stringify({
            result,
            log: "",
          }),
          isError: false,
        };
      },
      async close() {},
    };
    const operation: Operation<Record<string, never>> = {
      name: "set-value",
      page: () => undefined,
      inspect: () => snippet("inspect", "return {ok:true, value:penpot.value};"),
      apply: () => snippet("apply", "penpot.value=1; penpot.writes++; return {ok:true};"),
      readback: (_params, baseline) => {
        baselines.push(baseline);
        return snippet("readback", "return {ok:true, value:penpot.value};");
      },
      verify: ({ readback }) =>
        readback.value === 1
          ? []
          : [
              "wrong value",
            ],
    };
    return {
      client,
      operation,
      penpot,
      baselines,
      options: {
        apply: true,
        settleMs: 0,
        journal: {
          root,
        },
      },
    };
  };

  it("is reported as already-satisfied, not as a verified write", async () => {
    const { client, operation, penpot, options } = await setup(1);
    const steps: string[] = [];
    const report = await runOperation(
      client,
      operation,
      {},
      {
        ...options,
        onStep: (message) => void steps.push(message),
      },
    );
    expect(penpot.writes).toBe(0);
    expect(report).toMatchObject({
      outcome: "already-satisfied",
      skipped: "readback-already-satisfied",
      verified: true,
    });
    expect(steps.join("\n")).toContain("nothing was written");
  });

  it("still writes and reports verified when the readback does not hold yet", async () => {
    const { client, operation, penpot, options } = await setup(0);
    expect(await runOperation(client, operation, {}, options)).toMatchObject({
      outcome: "verified",
      verified: true,
    });
    expect(penpot.writes).toBe(1);
  });

  it("gives the readback the inspection taken before the write", async () => {
    const { client, operation, baselines, options } = await setup(0);
    await runOperation(client, operation, {}, options);
    // The undefined call is the plan signature; each observation passes the pre-write baseline.
    const observed = baselines.filter((baseline) => baseline !== undefined);
    expect(observed.length).toBeGreaterThan(1);
    for (const baseline of observed) {
      expect(baseline).toMatchObject({
        ok: true,
        value: 0,
      });
    }
  });
});

describe("same-execution archive preconditions", () => {
  it("refuses a newly added candidate before making any archive", async () => {
    const params = {
      page: "P",
      archiveName: "Archive",
      keepPrefixes: [],
      partPrefixes: [],
      x: 9000,
      expectedPlan: [],
      expectedArchiveId: null,
    };
    const penpot = {
      currentPage: {
        name: "P",
        root: {
          children: [
            {
              id: "new",
              name: "New",
              type: "board",
              x: 0,
              y: 0,
              width: 10,
              height: 10,
            },
          ],
        },
      },
      createBoard: () => {
        throw new Error("unexpected mutation");
      },
    };
    expect(await new AsyncFunction("penpot", archiveApply(params).code)(penpot)).toMatchObject({
      ok: false,
      message: expect.stringContaining("source changed"),
    });
  });
});

describe("staged runs", () => {
  const setup = async (done: number[] = []) => {
    const root = await mkdtemp(path.join(os.tmpdir(), "penpair-stages-"));
    const penpot = {
      currentPage: {
        id: "page",
        root: {
          id: "root",
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          children: [],
        },
      },
      currentFile: {
        id: "file",
        revn: 1,
      },
      done: [
        ...done,
      ],
      writes: [] as number[],
    };
    const lose = {
      stage: 0,
    };
    const client: PenpotToolClient = {
      async callTool(_name, args) {
        const code = String(args.code);
        const result = await new AsyncFunction("penpot", code)(penpot);
        if (code.includes("penpot.writes.push") && lose.stage === penpot.writes.at(-1)) {
          lose.stage = 0;
          throw new Error("acknowledgment lost");
        }
        return {
          text: JSON.stringify({
            result,
            log: "",
          }),
          isError: false,
        };
      },
      async close() {},
    };
    type Staged = {
      stage?: number;
    };
    const operation: Operation<Staged> = {
      name: "build",
      page: () => undefined,
      inspect: (p) =>
        snippet(
          "inspect",
          "return {ok:true, done:[...penpot.done]};",
          {
            stage: p.stage,
          },
          "read",
        ),
      apply: (p) =>
        snippet(
          "apply",
          "penpot.done.push(CFG.stage); penpot.writes.push(CFG.stage); return {ok:true};",
          {
            stage: p.stage,
          },
          "write",
        ),
      readback: (p) =>
        snippet(
          "readback",
          "return {ok:true, done:[...penpot.done], has: penpot.done.includes(CFG.stage)};",
          {
            stage: p.stage,
          },
          "read",
        ),
      verify: ({ readback }) =>
        readback.has === true
          ? []
          : [
              "stage missing",
            ],
    };
    return {
      client,
      operation,
      penpot,
      lose,
      options: {
        apply: true,
        settleMs: 0,
        stages: 3,
        journal: {
          root,
          runId: "staged-run",
        },
      },
    };
  };

  it("calls the script once per stage in order and records each stage", async () => {
    const { client, operation, penpot, options } = await setup();
    const report = await runOperation(client, operation, {}, options);
    expect(penpot.writes).toEqual([
      1,
      2,
      3,
    ]);
    expect(report).toMatchObject({
      outcome: "verified",
      verified: true,
      stages: [
        {
          stage: 1,
          state: "completed",
        },
        {
          stage: 2,
          state: "completed",
        },
        {
          stage: 3,
          state: "completed",
        },
      ],
    });
  });

  it("does not skip a stage because its readback already passes", async () => {
    const { client, operation, penpot, options } = await setup([
      2,
    ]);
    const report = await runOperation(client, operation, {}, options);
    expect(penpot.writes).toEqual([
      1,
      2,
      3,
    ]);
    expect(report.outcome).toBe("verified");
    expect(report.skipped).toBeUndefined();
  });

  it("resumes from the failed stage and does not rerun the recorded ones", async () => {
    const { client, operation, penpot, lose, options } = await setup();
    lose.stage = 2;
    await expect(runOperation(client, operation, {}, options)).rejects.toMatchObject({
      outcome: "uncertain",
    });
    const report = await runOperation(
      client,
      operation,
      {},
      {
        ...options,
        journal: {
          ...options.journal,
          resume: true,
        },
      },
    );
    expect(penpot.writes).toEqual([
      1,
      2,
      3,
    ]);
    expect(report.verified).toBe(true);
  });

  it("refuses a staged write without a journal", async () => {
    const { client, operation, options } = await setup();
    await expect(
      runOperation(
        client,
        operation,
        {},
        {
          apply: true,
          stages: 3,
          settleMs: 0,
        },
      ),
    ).rejects.toThrow("needs a journal");
    expect(options.stages).toBe(3);
  });
});
