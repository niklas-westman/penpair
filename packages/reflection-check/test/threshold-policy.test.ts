import { describe, expect, it } from "vitest";
import { validateBaselines, type BaselinesConfig } from "@penpair/core";
import { planImplementationCases, runImplementationCases } from "../src/index.js";
import { config, results, evidence, fixture } from "./helpers/reflection-fixture.js";

function mixedPolicy(): {
  baselines: BaselinesConfig;
  mapping: {
    schemaVersion: 1;
    cases: {
      id: string;
      setup: string;
    }[];
  };
} {
  const baselines: BaselinesConfig = {
    ...structuredClone(config),
    threshold: 0.02,
    frames: [
      {
        ...config.frames[0]!,
        id: "exact",
        threshold: 0,
      },
      {
        ...config.frames[0]!,
        id: "reviewed",
        threshold: 0.04,
      },
      {
        ...config.frames[0]!,
        id: "global",
      },
    ],
  };
  return {
    baselines,
    mapping: {
      schemaVersion: 1,
      cases: baselines.frames.map((frame) => ({
        id: frame.id,
        setup: "dark-empty",
      })),
    },
  };
}

describe("per-frame comparison policy", () => {
  it("preserves mixed explicit policies and global fallback without loosening exact comparison", async () => {
    const root = await fixture();
    const { baselines, mapping } = mixedPolicy();
    const plan = planImplementationCases(
      baselines,
      baselines.frames.map((frame) => ({
        ...structuredClone(results[0]!),
        id: frame.id,
      })),
      mapping,
    );
    expect(plan.cases.map((entry) => entry.threshold)).toEqual([
      0,
      0.04,
      0.02,
    ]);
    const report = await runImplementationCases(root, plan, {
      runCase: async (entry) => ({
        ...evidence,
        id: entry.id,
        diffPixelRatio: 0.03,
      }),
    });
    expect(report.cases.map((entry) => entry.withinThreshold)).toEqual([
      false,
      true,
      false,
    ]);
    expect(report.cases.map((entry) => entry.threshold)).toEqual([
      0,
      0.04,
      0.02,
    ]);
    expect(baselines.frames[0]!.threshold).toBe(0);
  });

  it("uses the existing default only when neither frame nor global policy is specified", () => {
    const plan = planImplementationCases(config, results, {
      schemaVersion: 1,
      cases: [
        {
          id: "empty",
          setup: "dark-empty",
        },
      ],
    });
    expect(plan.cases[0]!.threshold).toBe(0.05);
  });

  it.each([
    -0.1,
    1.1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    "0.1",
    null,
  ])("rejects invalid frame policy %s in configuration and direct planning", (threshold) => {
    const { baselines, mapping } = mixedPolicy();
    const invalid = structuredClone(baselines);
    Object.assign(invalid.frames[0]!, {
      threshold,
    });
    expect(() =>
      validateBaselines(invalid, (message) => {
        throw new Error(message);
      }),
    ).toThrow(/threshold/);
    expect(() =>
      planImplementationCases(
        invalid,
        invalid.frames.map((frame) => ({
          ...results[0]!,
          id: frame.id,
        })),
        mapping,
      ),
    ).toThrow(/threshold/);
  });

  it.each([
    0,
    1,
  ])("accepts explicit finite boundary policy %s", (threshold) => {
    const { baselines } = mixedPolicy();
    baselines.frames[0]!.threshold = threshold;
    expect(
      validateBaselines(baselines, (message) => {
        throw new Error(message);
      }).frames[0]!.threshold,
    ).toBe(threshold);
  });
});
