import { writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { ArtifactProvenance } from "@penpair/core";
import {
  type ImplementationProvider,
  planImplementationCases,
  runImplementationCases,
} from "../src/index.js";
import {
  config as baselineConfig,
  results as baselineResults,
  mapping as implementationMapping,
  evidence as providerEvidence,
  fixture as createProjectFixture,
  png as pngBytes,
} from "./helpers/reflection-fixture.js";

describe("comparison contracts across module boundaries", () => {
  it.each([
    "sha256",
    "fileId",
    "pageId",
    "frameId",
    "revision",
    "file",
  ] as const)("keeps stale approved %s pending", (field) => {
    const staleResults = structuredClone(baselineResults);
    const approved = structuredClone(staleResults[0]!.approved) as ArtifactProvenance;
    staleResults[0]!.approved = approved;
    Object.assign(approved, {
      [field]: field === "revision" ? 2 : "stale",
    });

    expect(
      planImplementationCases(baselineConfig, staleResults, implementationMapping),
    ).toMatchObject({
      complete: false,
      cases: [],
      pending: [
        {
          id: "empty",
        },
      ],
      visualApproval: false,
    });
  });

  it("rejects duplicate mappings and keeps missing baseline identities explicit", () => {
    expect(() =>
      planImplementationCases(baselineConfig, baselineResults, {
        ...implementationMapping,
        cases: [
          ...implementationMapping.cases,
          ...implementationMapping.cases,
        ],
      }),
    ).toThrow("Duplicate/invalid");

    expect(
      planImplementationCases(baselineConfig, baselineResults, {
        ...implementationMapping,
        cases: [
          ...implementationMapping.cases,
          {
            id: "removed",
            setup: "removed",
          },
        ],
      }),
    ).toMatchObject({
      complete: false,
      pending: [
        {
          id: "removed",
          reason: "Mapping refers to no configured baseline",
        },
      ],
    });
  });

  it("detects baseline mutation by a provider before accepting comparison evidence", async () => {
    const root = await createProjectFixture();
    const plan = planImplementationCases(baselineConfig, baselineResults, implementationMapping);
    const changedImage = Buffer.from(pngBytes);
    changedImage[changedImage.length - 1] = changedImage[changedImage.length - 1]! ^ 1;

    const report = await runImplementationCases(root, plan, {
      async runCase() {
        await writeFile(path.join(root, "design/empty.png"), changedImage);
        return providerEvidence;
      },
    });

    expect(report).toMatchObject({
      complete: false,
      cases: [
        {
          reason: "Baseline changed during provider execution",
        },
      ],
      visualApproval: false,
    });
  });

  it("continues later cases after failed evidence and isolates provider mutations of the requested case", async () => {
    const root = await createProjectFixture();
    const plan = planImplementationCases(baselineConfig, baselineResults, implementationMapping);
    const originalCase = structuredClone(plan.cases[0]!);
    plan.cases.push(structuredClone(originalCase));
    const runCase = vi
      .fn<ImplementationProvider["runCase"]>()
      .mockRejectedValueOnce(new Error("Capture unavailable"))
      .mockImplementationOnce(async (requestedCase) => {
        requestedCase.intent.theme = "provider-mutated";
        return providerEvidence;
      });

    const report = await runImplementationCases(root, plan, {
      runCase,
    });

    expect(runCase).toHaveBeenCalledTimes(2);
    expect(report).toMatchObject({
      complete: false,
      cases: [
        {
          complete: false,
          reason: "Capture unavailable",
        },
        {
          complete: true,
          withinThreshold: true,
        },
      ],
      verdict: "owner-review-required",
      accessibility: "not-assessed",
    });
    expect(plan.cases).toEqual([
      originalCase,
      originalCase,
    ]);
  });

  it("rejects an incorrectly scaled independent screenshot", async () => {
    const root = await createProjectFixture();
    const plan = planImplementationCases(baselineConfig, baselineResults, implementationMapping);
    const oversizedImage = Buffer.from(pngBytes);
    oversizedImage.writeUInt32BE(2, 16);
    await writeFile(path.join(root, "implementation.png"), oversizedImage);

    const report = await runImplementationCases(root, plan, {
      runCase: async () => providerEvidence,
    });

    expect(report).toMatchObject({
      complete: false,
      cases: [
        {
          reason: "Provider PNG scale/viewport differs from the design case",
        },
      ],
    });
  });
});
