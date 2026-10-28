import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it, vi } from "vitest";
import { settleLayout } from "../src/layout-settling.js";
import { layoutSettlingSource } from "../src/generated/layout-settling-source.js";
import { checkKits, coreKit, instanceKit } from "../src/kit.js";
import {
  checkKits as checkBuiltKits,
  coreKit as builtCoreKit,
  instanceKit as builtInstanceKit,
} from "@penpair/core";
// @ts-expect-error Repository tooling is deliberately plain JavaScript.
import { createLayoutSourceModule } from "../../../scripts/lib/layout-source.mjs";
// @ts-expect-error Repository tooling is deliberately plain JavaScript.
import { updateLayoutSource } from "../../../scripts/generate-layout-source.mjs";

afterEach(() => vi.restoreAllMocks());

it("generates deterministic source and checks stale/missing artifacts without rewriting them", async () => {
  const source = await readFile(new URL("../src/layout-settling.ts", import.meta.url), "utf8");
  const generated = createLayoutSourceModule(source);
  expect(createLayoutSourceModule(source)).toBe(generated);
  expect(generated).toBe(
    await readFile(new URL("../src/generated/layout-settling-source.ts", import.meta.url), "utf8"),
  );
  expect(generated).not.toContain(fileURLToPath(new URL("../", import.meta.url)));

  const directory = await mkdtemp(path.join(os.tmpdir(), "penpair-layout-source-"));
  const sourcePath = path.join(directory, "policy.ts");
  const outputPath = path.join(directory, "generated.ts");
  await writeFile(sourcePath, source);
  await expect(
    updateLayoutSource({
      sourcePath,
      outputPath,
      check: true,
    }),
  ).rejects.toThrow(/missing or stale/);
  await updateLayoutSource({
    sourcePath,
    outputPath,
  });
  await expect(
    updateLayoutSource({
      sourcePath,
      outputPath,
      check: true,
    }),
  ).resolves.toBeUndefined();

  await writeFile(sourcePath, source.replace("100000", "99999"));
  await expect(
    updateLayoutSource({
      sourcePath,
      outputPath,
      check: true,
    }),
  ).rejects.toThrow(/sandbox:generate/);
  expect(await readFile(outputPath, "utf8")).toBe(generated);
});

it("rejects runtime module dependencies instead of silently dropping them from the sandbox", () => {
  expect(() => createLayoutSourceModule("export const settleLayout = () => 1;")).toThrow(
    /exactly one/,
  );
  expect(() =>
    createLayoutSourceModule(
      "const hidden = 1; export async function settleLayout() { return hidden; }",
    ),
  ).toThrow(/module-level dependencies/);
});

it("has identical kit bytes and hashes in source tests and built consumer imports", () => {
  expect(coreKit.source).toBe(builtCoreKit.source);
  expect(instanceKit.source).toBe(builtInstanceKit.source);
  const sourceReport = checkKits([
    coreKit,
    instanceKit,
  ]);
  expect(sourceReport.valid).toBe(true);
  expect(sourceReport).toEqual(
    checkBuiltKits([
      builtCoreKit,
      builtInstanceKit,
    ]),
  );
});

it.each([
  "native",
  "geometry",
  "fallback",
  "partial",
  "timeout",
  "malformed",
  "target-change",
  "cancelled",
] as const)("preserves host policy behavior in generated JavaScript: %s", async (scenario) => {
  const generatedPolicy = new Function(
    `${layoutSettlingSource}\nreturn settleLayout;`,
  )() as typeof settleLayout;
  let clock = 0;
  vi.spyOn(Date, "now").mockImplementation(() => clock);

  const runPolicy = async (policy: typeof settleLayout) => {
    clock = 0;
    let calls = 0;
    try {
      return await policy(
        async () => {
          calls++;
          if (scenario === "cancelled") {
            throw new Error("Cancelled observation");
          }
          if (scenario === "timeout") {
            clock += 1001;
          }
          return {
            ok: true,
            fileId: scenario === "target-change" && calls > 1 ? "other-file" : "file",
            pageId: "page",
            native: scenario === "native",
            nativeOutcome:
              scenario === "native" ? "completed" : scenario === "fallback" ? "failed" : "skipped",
            nativeError: scenario === "fallback" ? "Native wait failed" : undefined,
            rootIds: [
              "root",
            ],
            truncated: scenario === "partial",
            geometry: [
              [
                "root",
                0,
                0,
                scenario === "malformed" ? NaN : 10,
                10,
                null,
                0,
              ],
            ],
          };
        },
        {
          timeoutMs: 1000,
          intervalMs: 10,
          strategy: scenario === "geometry" ? "geometry" : "auto",
          sleep: async (milliseconds) => {
            clock += milliseconds;
          },
        },
      );
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
      };
    }
  };

  const hostResult = await runPolicy(settleLayout);
  expect(await runPolicy(generatedPolicy)).toEqual(hostResult);
  if (
    [
      "malformed",
      "target-change",
      "cancelled",
    ].includes(scenario)
  ) {
    expect(hostResult).toHaveProperty("error");
  } else {
    expect(hostResult).toMatchObject({
      stable: scenario !== "timeout",
      ...(scenario === "partial"
        ? {
            method: "partial",
            truncated: true,
          }
        : {}),
      ...(scenario === "fallback"
        ? {
            fallbackReason: "Native wait failed",
          }
        : {}),
    });
  }
});
