import { mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { describe, expect, it } from "vitest";
// @ts-expect-error Repository publishing helper is deliberately plain JavaScript.
import { publishTrustedPackage } from "../../../scripts/lib/trusted-package.mjs";
describe("trusted publish artifact path with fake commands only", () => {
  it("retains the package guard, packs workspace dependencies and publishes only that artifact with provenance", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "penpair-release-fixture-"));
    const calls: Array<{
      cmd: string;
      args: string[];
      env: unknown;
    }> = [];
    const result = await publishTrustedPackage({
      root,
      packDirectory: root,
      package: {
        name: "@example/one",
        folder: "one",
        directory: root,
      },
      run: async (cmd: string, args: string[], _cwd: string, env: unknown) => {
        calls.push({
          cmd,
          args,
          env,
        });
        if (cmd === "pnpm") {
          await writeFile(path.join(root, "one/example-one-1.0.0.tgz"), "offline fake tarball");
        }
        return 0;
      },
    });
    expect(calls[0]!.args[0]).toBe(path.join(root, "scripts/guard-publish.mjs"));
    expect(calls[0]!.env).toEqual({
      PENPAIR_RELEASE: "1",
    });
    expect(calls[1]!.args[0]).toBe("pack");
    expect(calls[2]).toMatchObject({
      cmd: "npm",
      args: [
        "publish",
        result.tarball,
        "--access",
        "public",
        "--provenance",
      ],
    });
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
  });
  it("does not pack or publish after guard refusal", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "penpair-release-fixture-"));
    let calls = 0;
    await expect(
      publishTrustedPackage({
        root,
        packDirectory: root,
        package: {
          name: "one",
          folder: "one",
          directory: root,
        },
        run: async () => {
          calls++;
          return 1;
        },
      }),
    ).rejects.toThrow(/guard refused/);
    expect(calls).toBe(1);
  });
});
