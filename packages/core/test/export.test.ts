import { describe, expect, it } from "vitest";
import type { PenpotToolClient } from "../src/client.js";
import { exportShapePng } from "../src/export.js";

const png = (text: string) => Buffer.from(text).toString("base64");
const reply = (result: unknown) => ({
  text: JSON.stringify({
    result,
    log: "",
  }),
  isError: false,
});

function exporting(sequence: (string | Error)[]): PenpotToolClient & {
  calls: number;
} {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    async callTool(_name, args) {
      if (String(args.code).includes("const geometry = [], stack")) {
        return reply({
          ok: true,
          fileId: "file",
          pageId: "page",
          native: true,
          geometry: [
            [
              "id",
              0,
              0,
              10,
              10,
              null,
              0,
            ],
          ],
          truncated: false,
        });
      }
      const next = sequence[Math.min(calls++, sequence.length - 1)]!;
      if (next instanceof Error) {
        return {
          text: `Tool execution failed: ${next.message}`,
          isError: true,
        };
      }
      return reply({
        ok: true,
        base64: png(next),
        length: next.length,
        capture: {
          fileId: "file",
          pageId: "page",
          frameId: "id",
          revision: 1,
          scale: 1,
          penpotApiVersion: "test",
          renderEnvironment: null,
          activeThemes: [],
        },
      });
    },
    async close() {},
  };
}
const fast = {
  sleep: async () => undefined,
};

describe("exporting a shape", () => {
  it("waits until two exports in a row are identical, so a stale first render is not trusted", async () => {
    const client = exporting([
      "stale",
      "fresh",
      "fresh",
    ]);
    const result = await exportShapePng(client, "id", fast);
    expect(result).toMatchObject({
      stable: true,
      exports: 3,
    });
    expect(result.png.toString()).toBe("fresh");
  });

  it("retries a first failure that then works", async () => {
    const client = exporting([
      new Error("render not ready"),
      "ok",
      "ok",
    ]);
    const result = await exportShapePng(client, "id", fast);
    expect(result.png.toString()).toBe("ok");
    expect(result.stable).toBe(true);
  });

  it("says when it never settled", async () => {
    const client = exporting([
      "a",
      "b",
      "c",
      "d",
      "e",
    ]);
    const result = await exportShapePng(client, "id", {
      ...fast,
      maxExports: 3,
    });
    expect(result).toMatchObject({
      stable: false,
      exports: 3,
    });
  });

  it("refuses identity changes across otherwise identical rendered bytes", async () => {
    const client = exporting([
      "same",
      "same",
    ]);
    const call = client.callTool.bind(client);
    let count = 0;
    client.callTool = async (name, args) => {
      const response = await call(name, args);
      const envelope = JSON.parse(response.text);
      if (envelope.result.capture) {
        envelope.result.capture.fileId = ++count === 1 ? "first" : "second";
      }
      return {
        ...response,
        text: JSON.stringify(envelope),
      };
    };
    await expect(exportShapePng(client, "id", fast)).rejects.toThrow(/identity/);
  });

  it("refuses malformed byte evidence", async () => {
    const client = exporting([
      "same",
    ]);
    const call = client.callTool.bind(client);
    client.callTool = async (name, args) => {
      const response = await call(name, args);
      const envelope = JSON.parse(response.text);
      envelope.result.length = 999;
      return {
        ...response,
        text: JSON.stringify(envelope),
      };
    };
    await expect(
      exportShapePng(client, "id", {
        ...fast,
        attempts: 1,
      }),
    ).rejects.toThrow(/length/);
  });

  it("can skip the stability check", async () => {
    const result = await exportShapePng(
      exporting([
        "only",
      ]),
      "id",
      {
        ...fast,
        stable: false,
      },
    );
    expect(result).toMatchObject({
      stable: false,
      exports: 1,
    });
  });
});
