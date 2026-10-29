import { describe, expect, it } from "vitest";
import { planImplementationCases, runNativeReflectionCases } from "../src/index.js";
import { config, results, mapping } from "./helpers/reflection-fixture.js";
import { nativeFixture } from "./helpers/native-engine-fixture.js";

const plan = () => planImplementationCases(config, results, mapping);
const options = {
  configFile: "engine-config.mjs",
  engineVersion: "0.7.0",
};

describe("public native Reflection batch bridge", () => {
  it("runs the pinned public CLI and validates raw report, original bytes and measured artifacts", async () => {
    const root = await nativeFixture();
    const progress: string[] = [];
    const release = {
      designHash: "a".repeat(64),
      caseThresholds: {
        empty: 0.05,
      },
      caseIds: [
        "empty",
      ],
    };
    const report = await runNativeReflectionCases(root, plan(), {
      ...options,
      onProgress: (message) => {
        progress.push(message);
      },
    });
    expect(report).toMatchObject({
      complete: true,
      visualApproval: false,
      verdict: "owner-review-required",
      cases: [
        {
          id: "empty",
          complete: true,
          withinThreshold: true,
          screenshotHash: expect.any(String),
          evidence: {
            provider: {
              name: "reflection-native-measured",
            },
            capture: {
              layoutSamples: 3,
            },
          },
        },
      ],
    });
    expect(progress.some((line) => line.includes("implementation-report.json"))).toBe(true);
  });

  it("keeps complete measured drift separate from tool error and acceptance", async () => {
    const report = await runNativeReflectionCases(await nativeFixture("drift"), plan(), options);
    expect(report).toMatchObject({
      complete: true,
      cases: [
        {
          withinThreshold: false,
        },
      ],
      visualApproval: false,
    });
  });

  it.each([
    "route-failure",
    "missing-evidence",
    "wrong-reference",
    "bad-artifact",
    "omitted",
    "duplicate",
    "mutate-original",
    "tool-error",
  ])("rejects %s rather than manufacturing complete evidence", async (mode) => {
    const report = await runNativeReflectionCases(await nativeFixture(mode), plan(), options);
    expect(report.complete).toBe(false);
    expect(report.cases[0]).toMatchObject({
      complete: false,
      reason: expect.any(String),
    });
  });

  it("retains valid case evidence when a different route fails", async () => {
    const selected = plan();
    selected.cases.push({
      ...structuredClone(selected.cases[0]!),
      id: "second",
    });
    const report = await runNativeReflectionCases(
      await nativeFixture("partial-route-failure"),
      selected,
      options,
    );
    expect(report.complete).toBe(false);
    expect(report.cases[0]).toMatchObject({
      id: "empty",
      complete: false,
    });
    expect(report.cases[1], JSON.stringify(report)).toMatchObject({
      id: "second",
      complete: true,
      withinThreshold: true,
    });
  });

  it("preserves cancellation as incomplete evidence", async () => {
    const controller = new AbortController();
    controller.abort();
    const report = await runNativeReflectionCases(await nativeFixture(), plan(), {
      ...options,
      signal: controller.signal,
    });
    expect(report.complete).toBe(false);
    expect(report.cases[0]?.reason).toMatch(/abort/i);
  });

  it("rejects unpinned engines and partial release bindings before capture", async () => {
    const root = await nativeFixture();
    await expect(
      runNativeReflectionCases(root, plan(), {
        ...options,
        engineVersion: "^0.7.0",
      }),
    ).rejects.toThrow(/exact/);
    await expect(
      runNativeReflectionCases(root, plan(), {
        ...options,
        engineVersion: "0.8.0",
      }),
    ).rejects.toThrow(/found 0.7.0/);
    await expect(
      runNativeReflectionCases(root, plan(), {
        ...options,
        release: {
          reference: {
            record: {
              path: "release.json",
              sha256: "a".repeat(64),
            },
            bundle: {
              path: "bundle.json",
              sha256: "b".repeat(64),
            },
          },
          designHash: "a".repeat(64),
          caseIds: [
            "empty",
            "missing-login",
          ],
        },
      }),
    ).rejects.toThrow(/exact complete/);
  });
});
