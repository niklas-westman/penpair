import { describe, expect, it, vi } from "vitest";
import { runLiveSmoke } from "../src/live-smoke.js";

describe("scratch-only live smoke harness", () => {
  const options = { scratchFileId: "scratch", expectedVersion: "2.18.4", confirmedScratch: true, settleMs: 0 };
  it("refuses an unconfirmed target before any connection call", async () => {
    const callTool = vi.fn();
    await expect(runLiveSmoke({ callTool, close: async () => undefined }, { ...options, confirmedScratch: false })).rejects.toThrow(/confirmed scratch/);
    expect(callTool).not.toHaveBeenCalled();
  });
  it.each([{ version: "2.18.5", fileId: "scratch" }, { version: "2.18.4", fileId: "another" }])("stops target/version drift before writing %#", async (actual) => {
    const callTool = vi.fn().mockResolvedValue({ text: JSON.stringify({ result: actual, log: "" }), isError: false });
    await expect(runLiveSmoke({ callTool, close: async () => undefined }, options)).rejects.toThrow(/No probe was applied/);
    expect(callTool).toHaveBeenCalledOnce();
  });
  it("runs the deep probe and independently checks cleanup after preflight", async () => {
    const observations = ["create board", "flex layout and children", "text content", "token set, token and binding", "component and swap", "clone", "export png"].map((step) => ({ step, ok: true, ms: 1, detail: "observed" }));
    const callTool = vi.fn().mockResolvedValueOnce({ text: JSON.stringify({ result: { version: "2.18.4", fileId: "scratch" }, log: "" }), isError: false })
      .mockResolvedValueOnce({ text: JSON.stringify({ result: { ok: true, steps: observations, cleanup: ["removed"] }, log: "" }), isError: false })
      .mockResolvedValueOnce({ text: JSON.stringify({ result: { ok: true, left: [] }, log: "" }), isError: false });
    expect((await runLiveSmoke({ callTool, close: async () => undefined }, options)).ok).toBe(true);
    expect(callTool).toHaveBeenCalledTimes(3);
    for (const [, args] of callTool.mock.calls) expect(args.code).toContain('__penpairExpectedFile = {"id":"scratch"}');
  });
});
