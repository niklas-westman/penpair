import { describe, expect, it } from "vitest";
import type { PenpotToolClient } from "../src/client.js";
import { exportShapePng } from "../src/export.js";

const png = (text: string) => Buffer.from(text).toString("base64");
const reply = (result: unknown) => ({ text: JSON.stringify({ result, log: "" }), isError: false });

function exporting(sequence: (string | Error)[]): PenpotToolClient & { calls: number } {
  let calls = 0;
  return {
    get calls() { return calls; },
    async callTool() {
      const next = sequence[Math.min(calls++, sequence.length - 1)]!;
      if (next instanceof Error) return { text: `Tool execution failed: ${next.message}`, isError: true };
      return reply({ ok: true, base64: png(next), length: next.length });
    },
    async close() {},
  };
}
const fast = { sleep: async () => undefined };

describe("exporting a shape", () => {
  it("waits until two exports in a row are identical, so a stale first render is not trusted", async () => {
    const client = exporting(["stale", "fresh", "fresh"]);
    const result = await exportShapePng(client, "id", fast);
    expect(result).toMatchObject({ stable: true, exports: 3 });
    expect(result.png.toString()).toBe("fresh");
  });

  it("retries a first failure that then works", async () => {
    const client = exporting([new Error("render not ready"), "ok", "ok"]);
    const result = await exportShapePng(client, "id", fast);
    expect(result.png.toString()).toBe("ok");
    expect(result.stable).toBe(true);
  });

  it("says when it never settled", async () => {
    const client = exporting(["a", "b", "c", "d", "e"]);
    const result = await exportShapePng(client, "id", { ...fast, maxExports: 3 });
    expect(result).toMatchObject({ stable: false, exports: 3 });
  });

  it("can skip the stability check", async () => {
    const result = await exportShapePng(exporting(["only"]), "id", { ...fast, stable: false });
    expect(result).toMatchObject({ stable: false, exports: 1 });
  });
});
