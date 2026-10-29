import { beforeEach, describe, expect, it, vi } from "vitest";
import { planImplementationCases } from "../src/case-plan.js";
import { runNativeReflectionCases } from "../src/native-runner.js";
import { validateReleaseComparison } from "../src/release-binding.js";
import { config, results, mapping, fixture } from "./helpers/reflection-fixture.js";

const { loadCanonical } = vi.hoisted(() => ({
  loadCanonical: vi.fn(),
}));
vi.mock("@penpair/core", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  loadReleaseComparison: loadCanonical,
}));

const makePlan = () => planImplementationCases(config, results, mapping);
const binding = {
  reference: {
    record: {
      path: "design/release.json",
      sha256: "c".repeat(64),
    },
    bundle: {
      path: "design/bundle.json",
      sha256: "d".repeat(64),
    },
  },
  designHash: "a".repeat(64),
  caseIds: [
    "empty",
  ],
  caseThresholds: {
    empty: 0.05,
  },
};

beforeEach(() => {
  const selected = makePlan().cases[0]!;
  loadCanonical.mockReset().mockResolvedValue({
    reference: binding.reference,
    designHash: binding.designHash,
    fileId: "file",
    caseIds: binding.caseIds,
    caseThresholds: binding.caseThresholds,
    cases: [
      {
        id: selected.id,
        fileId: "file",
        pageId: "page",
        frameId: "frame",
        sha256: selected.baseline.sha256,
        scale: selected.baseline.scale,
        route: selected.route,
        intent: structuredClone(selected.intent),
        threshold: selected.threshold,
      },
    ],
  });
});

describe("canonical release comparison binding", () => {
  it("loads frozen canonical evidence rather than trusting context readiness labels", async () => {
    await validateReleaseComparison("/project", makePlan(), binding);
    expect(loadCanonical).toHaveBeenCalledWith("/project", binding.reference);
  });

  it.each([
    "image",
    "scale",
    "file",
    "page",
    "frame",
    "route",
    "intent",
    "threshold",
  ])("rejects substituted %s with the same case ID", async (field) => {
    const plan = makePlan();
    const selected = plan.cases[0]!;
    if (field === "image") {
      selected.baseline.sha256 = "e".repeat(64);
    }
    if (field === "scale") {
      selected.baseline.scale = 2;
    }
    if (field === "file") {
      selected.baseline.source!.fileId = "other";
    }
    if (field === "page") {
      selected.baseline.source!.pageId = "other";
    }
    if (field === "frame") {
      selected.baseline.source!.frameId = "other";
    }
    if (field === "route") {
      selected.route = "/other";
    }
    if (field === "intent") {
      selected.intent.fixture = "other";
    }
    if (field === "threshold") {
      selected.threshold = 0.9;
    }
    await expect(validateReleaseComparison("/project", plan, binding)).rejects.toThrow(
      /release|Release/,
    );
  });

  it("rejects a canonical release from a different configured file pin", async () => {
    await expect(
      validateReleaseComparison("/project", makePlan(), binding, "different-file"),
    ).rejects.toThrow(/canonical finalized/);
  });

  it("fails public native execution before loading project code when release provenance differs", async () => {
    const plan = makePlan();
    plan.cases[0]!.baseline.source!.pageId = "substituted-page";
    await expect(
      runNativeReflectionCases(await fixture(), plan, {
        configFile: "must-not-run.mjs",
        engineVersion: "0.7.0",
        release: binding,
      }),
    ).rejects.toThrow(/exact approved source/);
  });
});
