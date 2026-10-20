import { describe, expect, it } from "vitest";
import type { PenpotToolClient } from "../src/client.js";
import { compiles } from "../src/snippet.js";
import { capabilityCode, probe } from "../src/probe.js";

const endpoint = { url: "http://localhost:9001/mcp/stream?userToken=SECRET", description: { source: "env" as const, origin: "http://localhost:9001", pathname: "/mcp/stream" } };

// A pretend Penpot: accepts requests below 100 KB and answers the capability snippet.
function connectFake(): Promise<PenpotToolClient> {
  return Promise.resolve({
    async callTool(_name, args) {
      const code = String(args.code);
      if (code.length > 100 * 1024) throw new Error(`Streamable HTTP error: 413 at ${endpoint.url}`);
      if (code.includes("penpot.currentFile")) return { text: JSON.stringify({ result: { file: "demo", revn: 7, apis: { tokens: "object" } }, log: "" }), isError: false };
      const repeat = /"y"\.repeat\((\d+)\)/.exec(code);
      if (repeat) return { text: JSON.stringify({ result: "y".repeat(Number(repeat[1])), log: "" }), isError: false };
      return { text: JSON.stringify({ result: "ok", log: "" }), isError: false };
    },
    async close() {},
  });
}

describe("probe", () => {
  it("sends plugin code that is valid", () => {
    expect(compiles(capabilityCode)).toBeUndefined();
  });

  it("reports capabilities, the request limit and the response limit, without the key", async () => {
    const report = await probe(endpoint, connectFake, { requestSizesKb: [60, 110], responseSizesKb: [100] });
    expect(report.capabilities).toMatchObject({ file: "demo", revn: 7 });
    expect(report.requestLimit["60 KB"]).toBe("accepted");
    expect(report.requestLimit["110 KB"]).toMatch(/^refused/);
    expect(report.responseLimit["100 KB"]).toBe("returned");
    expect(JSON.stringify(report)).not.toContain("SECRET");
  });
});
