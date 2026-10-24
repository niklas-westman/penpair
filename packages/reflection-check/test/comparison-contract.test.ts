import { writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { ArtifactProvenance } from "@penpair/core";
import { hashImageBytes } from "../src/image-evidence.js";
import { losslessWebp, lossyWebp } from "./helpers/image-fixture.js";
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
    "png",
    "webp",
  ])("accepts a %s baseline with an independent lossless WebP screenshot", async (format) => {
    const root = await createProjectFixture();
    const results = structuredClone(baselineResults);
    if (format === "webp") {
      const result = results[0]!;
      result.file = "empty.webp";
      for (const provenance of [
        result.approved!,
        result.captured!,
      ]) {
        provenance.file = "empty.webp";
        provenance.sha256 = hashImageBytes(losslessWebp);
      }
      await writeFile(path.join(root, "design/empty.webp"), losslessWebp);
    }
    const plan = planImplementationCases(baselineConfig, results, implementationMapping);
    await writeFile(path.join(root, "implementation.webp"), losslessWebp);

    const report = await runImplementationCases(root, plan, {
      runCase: async () => ({
        ...providerEvidence,
        baselineHash: plan.cases[0]!.baseline.sha256,
        screenshot: "implementation.webp",
      }),
    });

    expect(report).toMatchObject({
      complete: true,
      cases: [
        {
          complete: true,
          screenshotHash: hashImageBytes(losslessWebp),
        },
      ],
    });
  });

  it("rejects a lossy screenshot even when named PNG", async () => {
    const root = await createProjectFixture();
    const plan = planImplementationCases(baselineConfig, baselineResults, implementationMapping);
    await writeFile(path.join(root, "implementation.png"), lossyWebp);

    expect(
      await runImplementationCases(root, plan, {
        runCase: async () => providerEvidence,
      }),
    ).toMatchObject({
      complete: false,
      cases: [
        {
          reason: "Provider evidence must reference PNG or static lossless WebP bytes",
        },
      ],
    });
  });

  it("rejects incorrectly scaled lossless WebP screenshots", async () => {
    const root = await createProjectFixture();
    const plan = planImplementationCases(baselineConfig, baselineResults, implementationMapping);
    const oversized = Buffer.from(losslessWebp);
    oversized.writeUInt32LE(1, 21);
    await writeFile(path.join(root, "implementation.webp"), oversized);

    expect(
      await runImplementationCases(root, plan, {
        runCase: async () => ({
          ...providerEvidence,
          screenshot: "implementation.webp",
        }),
      }),
    ).toMatchObject({
      complete: false,
      cases: [
        {
          reason: "Provider image scale/viewport differs from the design case",
        },
      ],
    });
  });

  it("detects mutation of approved WebP bytes during capture", async () => {
    const root = await createProjectFixture();
    const plan = planImplementationCases(baselineConfig, baselineResults, implementationMapping);
    const baseline = plan.cases[0]!.baseline;
    baseline.path = "design/empty.webp";
    baseline.sha256 = hashImageBytes(losslessWebp);
    await writeFile(path.join(root, baseline.path), losslessWebp);
    const mutated = Buffer.from(losslessWebp);
    mutated[mutated.length - 2] = mutated[mutated.length - 2]! ^ 1;

    expect(
      await runImplementationCases(root, plan, {
        async runCase() {
          await writeFile(path.join(root, baseline.path), mutated);
          return {
            ...providerEvidence,
            baselineHash: baseline.sha256,
          };
        },
      }),
    ).toMatchObject({
      complete: false,
      cases: [
        {
          reason: "Baseline changed during provider execution",
        },
      ],
    });
  });

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
          reason: "Provider image scale/viewport differs from the design case",
        },
      ],
    });
  });
});
