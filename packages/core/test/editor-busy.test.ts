import { describe, expect, it } from "vitest";
import { isEditorBusy, whileEditorBusy } from "../src/design-releases/editor-busy.js";

const noSleep = async () => undefined;

describe("reading while the editor is busy", () => {
  it("recognises the request timeout of a busy editor and nothing else", () => {
    expect(isEditorBusy(new Error("MCP error -32001: Request timed out"))).toBe(true);
    expect(isEditorBusy(new Error("Source board content changed"))).toBe(false);
    expect(isEditorBusy("timed out")).toBe(false);
  });

  it("asks again after a timeout and returns the answer", async () => {
    let calls = 0;
    const answer = await whileEditorBusy(async () => {
      if (calls++ < 3) {
        throw new Error("Request timed out");
      }
      return "ok";
    }, noSleep);
    expect(answer).toBe("ok");
    expect(calls).toBe(4);
  });

  it("does not hide any other error", async () => {
    let calls = 0;
    await expect(
      whileEditorBusy(async () => {
        calls++;
        throw new Error("Pinned copy page identity changed");
      }, noSleep),
    ).rejects.toThrow("Pinned copy page identity changed");
    expect(calls).toBe(1);
  });

  it("gives up after a bounded number of attempts", async () => {
    let calls = 0;
    await expect(
      whileEditorBusy(async () => {
        calls++;
        throw new Error("Request timed out");
      }, noSleep),
    ).rejects.toThrow("timed out");
    expect(calls).toBe(40);
  });
});
