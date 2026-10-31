import { writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { type ArtifactProvenance, type AdapterContext, loadConfig } from "@penpair/core";
import adapter, { planImplementationCases, runImplementationCases } from "../src/index.js";
import { config, results, mapping, evidence, fixture } from "./helpers/reflection-fixture.js";

describe("explicit implementation-case bridge", () => {
  it("keeps missing setup and changed approval metadata pending", () => {
    expect(
      planImplementationCases(config, results, {
        ...mapping,
        cases: [],
      }),
    ).toMatchObject({
      complete: false,
      cases: [],
      pending: [
        {
          id: "empty",
        },
      ],
    });
    const changed = structuredClone(config);
    changed.frames[0]!.case!.theme = "light";
    expect(planImplementationCases(changed, results, mapping).complete).toBe(false);
  });
  it("reports a mapped baseline that has no implementation route instead of dropping it", () => {
    const routeless = structuredClone(config);
    delete routeless.frames[0]!.route;
    delete routeless.frames[0]!.case;
    const plan = planImplementationCases(routeless, results, mapping);
    expect(plan.cases).toEqual([]);
    expect(plan.pending).toEqual([
      {
        id: "empty",
        reason:
          "Mapping names a configured baseline that has no implementation route, so it is exported but cannot be checked",
      },
    ]);
    expect(plan.complete).toBe(false);
  });
  it("leaves an unmapped route-less baseline out of scope without reporting it", () => {
    const routeless = structuredClone(config);
    delete routeless.frames[0]!.route;
    delete routeless.frames[0]!.case;
    expect(
      planImplementationCases(routeless, results, {
        ...mapping,
        cases: [],
      }),
    ).toMatchObject({
      cases: [],
      pending: [],
      complete: false,
    });
  });
  it("keeps forced references out of approved comparison plans", () => {
    const waived = structuredClone(results);
    (waived[0]!.approved as ArtifactProvenance).approval = {
      kind: "forced-reference",
      reason: "experiment",
    };
    expect(planImplementationCases(config, waived, mapping)).toMatchObject({
      complete: false,
      cases: [],
    });
  });
  it("validates independent byte evidence and exact observed setup without creating a visual approval", async () => {
    const root = await fixture();
    const plan = planImplementationCases(config, results, mapping);
    expect(
      await runImplementationCases(root, plan, {
        runCase: async () => evidence,
      }),
    ).toMatchObject({
      complete: true,
      cases: [
        {
          withinThreshold: true,
        },
      ],
      visualApproval: false,
      verdict: "owner-review-required",
    });
    expect(
      await runImplementationCases(root, plan, {
        runCase: async () => ({
          ...evidence,
          observed: {
            ...evidence.observed,
            theme: "light",
          },
        }),
      }),
    ).toMatchObject({
      complete: false,
    });
    expect(
      await runImplementationCases(root, plan, {
        runCase: async () => ({
          ...evidence,
          fonts: [],
        }),
      }),
    ).toMatchObject({
      complete: false,
    });
    expect(
      await runImplementationCases(root, plan, {
        runCase: async () => ({
          ...evidence,
          screenshot: "design/empty.png",
        }),
      }),
    ).toMatchObject({
      complete: false,
    });
    await writeFile(path.join(root, "design/empty.png"), Buffer.from("changed"));
    expect(
      await runImplementationCases(root, plan, {
        runCase: async () => evidence,
      }),
    ).toMatchObject({
      complete: false,
    });
  });
  it("runs the actual adapter command with a trusted stub provider and the existing baseline manifest", async () => {
    const root = await fixture();
    await writeFile(
      path.join(root, "penpair.config.json"),
      JSON.stringify({
        instance: "trial",
        file: {
          id: "file",
        },
        profile: {
          type: "external",
          origin: "https://design.penpot.app",
        },
        baselines: config,
      }),
    );
    await writeFile(
      path.join(root, "design/penpair-baselines.json"),
      JSON.stringify({
        schemaVersion: 2,
        fileId: "file",
        frames: results,
      }),
    );
    await writeFile(path.join(root, "mapping.json"), JSON.stringify(mapping));
    await writeFile(
      path.join(root, "provider.mjs"),
      `export async function runCase() { return ${JSON.stringify(evidence)}; }`,
    );
    let result: unknown;
    const context: AdapterContext = {
      root,
      config: await loadConfig(root),
      rawConfig: {},
      log() {},
      output: {
        log() {},
        error() {},
        result(report) {
          result = report;
        },
      },
      withPenpot() {
        throw new Error("No Penpot connection for browser comparison");
      },
    };
    expect(
      await adapter.commands[0]!.run(context, [
        "check",
        "--map",
        "mapping.json",
        "--provider",
        "provider.mjs",
      ]),
    ).toBe(0);
    expect(result).toMatchObject({
      complete: true,
      visualApproval: false,
    });
  });
});
