import { describe, expect, it } from "vitest";
import type { PenpotToolClient } from "../src/client.js";
import { archiveOperation, runOperation } from "../src/operation.js";

const params = { page: "P", archiveName: "Archive", keepPrefixes: [], partPrefixes: [], x: 9000 };
const reply = (result: unknown) => ({ text: JSON.stringify({ result, log: "" }), isError: false });

// A pretend editor: answers by the snippet's name found in its source, and can start on the wrong page.
function editor(script: Record<string, unknown[]>, startsOnWrongPage = false): PenpotToolClient & { log: string[] } {
  const log: string[] = [];
  let wrong = startsOnWrongPage;
  const counters: Record<string, number> = {};
  return {
    log,
    async callTool(_name, args) {
      const code = String(args.code);
      const name = ["switch-page", "archive-inspect", "archive-apply", "archive-readback"].find((n) => script[n] && matches(code, n)) ?? "unknown";
      log.push(name);
      if (name === "switch-page") { wrong = false; return reply({ ok: true, switched: true }); }
      if (wrong && name !== "unknown") return reply({ ok: false, wrongPage: true, message: "wrong page" });
      const results = script[name] as unknown[];
      const i = counters[name] ?? 0;
      counters[name] = i + 1;
      return reply(results[Math.min(i, results.length - 1)]);
    },
    async close() {},
  };
}
const matches = (code: string, name: string): boolean => {
  if (name === "switch-page") return code.includes("penpot.openPage");
  if (name === "archive-inspect") return code.includes("readOnly: true, archiveExists");
  if (name === "archive-apply") return code.includes("archive.appendChild");
  return code.includes("const loose = top.filter");
};

const script = {
  "switch-page": [{}],
  "archive-inspect": [{ ok: true, willMove: 3, stays: 5 }],
  "archive-apply": [{ ok: true, moved: 3 }],
  "archive-readback": [{ ok: true, archive: { children: 3 }, loose: [] }],
};

describe("running an operation", () => {
  it("only inspects unless told to apply", async () => {
    const client = editor(script);
    const report = await runOperation(client, archiveOperation, params, { sleep: async () => undefined });
    expect(report.phase).toBe("inspected");
    expect(client.log).toEqual(["archive-inspect"]);
  });

  it("writes once, waits, reads back and confirms", async () => {
    const waited: number[] = [];
    const client = editor(script);
    const report = await runOperation(client, archiveOperation, params, { apply: true, settleMs: 7_000, sleep: async (ms) => void waited.push(ms) });
    expect(client.log).toEqual(["archive-inspect", "archive-apply", "archive-readback"]);
    expect(waited).toContain(7_000);
    expect(report).toMatchObject({ phase: "applied", verified: true, problems: [] });
  });

  it("reports what the readback found wrong", async () => {
    const client = editor({ ...script, "archive-readback": [{ ok: true, archive: { children: 1 }, loose: ["Old / a", "Old / b"] }] });
    const report = await runOperation(client, archiveOperation, params, { apply: true, sleep: async () => undefined });
    expect(report.verified).toBe(false);
    expect(report.problems.join(" ")).toMatch(/holds 1 frames/);
    expect(report.problems.join(" ")).toMatch(/2 frames are still loose/);
  });

  it("opens the right page when the editor shows another, then carries on", async () => {
    const client = editor(script, true);
    const report = await runOperation(client, archiveOperation, params, { apply: true, sleep: async () => undefined });
    expect(client.log[0]).toBe("archive-inspect");
    expect(client.log).toContain("switch-page");
    expect(report.verified).toBe(true);
  });

  it("treats nothing to move as already done", async () => {
    const client = editor({ ...script, "archive-inspect": [{ ok: true, willMove: 0, stays: 9 }], "archive-apply": [{ ok: true, moved: 0 }], "archive-readback": [{ ok: true, archive: { children: 12 }, loose: [] }] });
    const report = await runOperation(client, archiveOperation, params, { apply: true, sleep: async () => undefined });
    expect(report.verified).toBe(true);
  });
});
