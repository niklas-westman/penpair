import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { exportFileArchive } from "../src/file-archive.js";
import type { PenpotToolClient } from "../src/client.js";
import * as clientModule from "../src/client.js";
import * as endpointModule from "../src/endpoint.js";
import { runCli } from "../src/cli-main.js";

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
function client(file: object): PenpotToolClient {
  return {
    async callTool(_name, args) {
      const result = await new AsyncFunction("penpot", args.code)({
        currentFile: file,
      });
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
}
afterEach(() => vi.restoreAllMocks());
describe("bounded hosted-file archive export", () => {
  const file = () => ({
    id: "f",
    revn: 7,
    export: async (_format: string, mode: string) => {
      expect(mode).toBe("all");
      return new Uint8Array([
        1,
        2,
        3,
        4,
      ]);
    },
  });
  it("records received bytes and provenance without claiming restore proof", async () => {
    const result = await exportFileArchive(client(file()));
    expect(result).toMatchObject({
      status: "exported",
      fileId: "f",
      revn: 7,
      restoreVerified: false,
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    if (result.status === "exported") {
      expect([
        ...result.bytes,
      ]).toEqual([
        1,
        2,
        3,
        4,
      ]);
    }
  });
  it("reports an unsupported API and a rejected export with manual fallback", async () => {
    expect(
      await exportFileArchive(
        client({
          id: "f",
          revn: 7,
        }),
      ),
    ).toMatchObject({
      status: "unsupported",
    });
    expect(
      await exportFileArchive(
        client({
          ...file(),
          export: async () => {
            throw new Error("No matching clause");
          },
        }),
      ),
    ).toMatchObject({
      status: "failed",
      message: expect.stringContaining("manual export"),
    });
  });
  it("refuses oversized archives and content changes during export", async () => {
    expect(
      await exportFileArchive(client(file()), {
        maxBytes: 2,
      }),
    ).toMatchObject({
      status: "too-large",
    });
    const changing = file();
    changing.export = async () => {
      changing.revn++;
      return new Uint8Array([
        1,
      ]);
    };
    expect(await exportFileArchive(client(changing))).toMatchObject({
      status: "changed",
    });
  });
  it("never replaces an existing archive through the command", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "penpair-archive-"));
    const out = path.join(root, "prior.penpot");
    await writeFile(out, "prior backup");
    await writeFile(
      path.join(root, "penpair.config.json"),
      JSON.stringify({
        instance: "demo",
        profile: {
          type: "external",
          origin: "https://example.test",
        },
        file: {
          id: "f",
        },
      }),
    );
    vi.spyOn(process, "cwd").mockReturnValue(root);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(endpointModule, "resolveEndpoint").mockResolvedValue({
      url: "https://example.test/mcp",
      description: {
        source: "env",
        origin: "https://example.test",
        pathname: "/mcp",
      },
    });
    vi.spyOn(clientModule, "connect").mockResolvedValue(client(file()));
    expect(
      await runCli([
        "backup",
        "file",
        out,
      ]),
    ).toBe(1);
    expect(await readFile(out, "utf8")).toBe("prior backup");
  });
});
