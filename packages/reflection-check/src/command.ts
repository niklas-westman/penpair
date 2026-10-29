import { readFile } from "node:fs/promises";
import path from "node:path";
import { createJiti } from "jiti";
import {
  validateBaselineReference,
  validateBaselineSources,
  type ArtifactProvenance,
  parseCommandArgs,
  readDesignJson,
  resolveProjectInput,
  type AdapterContext,
  type BaselineResult,
} from "@penpair/core";
import { planImplementationCases } from "./case-plan.js";
import { runImplementationCases } from "./run-cases.js";
import { runNativeReflectionCases } from "./native-runner.js";
import { validateReleaseComparison } from "./release-binding.js";
import { assertReleaseComparisonBinding, type ReleaseComparisonBinding } from "./native-types.js";
import type { ImplementationMapping, ImplementationProvider } from "./types.js";

export async function runReflectionCommand(
  context: AdapterContext,
  commandArguments: string[],
): Promise<number> {
  const [subcommand, ...subcommandArguments] = commandArguments;
  const { values, positionals } = parseCommandArgs({
    args: subcommandArguments,
    allowPositionals: true,
    options: {
      map: {
        type: "string",
      },
      provider: {
        type: "string",
      },
      "engine-config": {
        type: "string",
      },
      "engine-version": {
        type: "string",
      },
      "release-context": {
        type: "string",
      },
      json: {
        type: "boolean",
      },
    },
  });

  if (
    ![
      "plan",
      "check",
    ].includes(subcommand ?? "") ||
    positionals.length ||
    !values.map ||
    (subcommand === "plan" &&
      (values.provider ||
        values["engine-config"] ||
        values["engine-version"] ||
        values["release-context"])) ||
    (subcommand === "check" &&
      (Boolean(values.provider) === Boolean(values["engine-config"]) ||
        Boolean(values["engine-config"]) !== Boolean(values["engine-version"])))
  ) {
    throw new Error(
      "Usage: reflection plan --map FILE | reflection check --map FILE (--provider FILE | --engine-config FILE --engine-version VERSION) [--release-context FILE]",
    );
  }

  const baselinesConfig = context.config.baselines;
  if (!baselinesConfig) {
    throw new Error("Configure baselines first");
  }

  const manifest = (await readDesignJson(
    context.root,
    path.join(baselinesConfig.root, "penpair-baselines.json"),
  )) as {
    schemaVersion?: number;
    frames?: BaselineResult[];
    fileId?: string;
    page?: string;
    pages?: unknown;
  };

  if (
    (manifest.schemaVersion !== 2 && manifest.schemaVersion !== 3) ||
    !Array.isArray(manifest.frames) ||
    !context.config.file ||
    manifest.fileId !== context.config.file.id
  ) {
    throw new Error(
      "A schema-2 or schema-3 baseline manifest matching the configured file pin is required",
    );
  }

  validateBaselineSources(manifest);
  if (
    manifest.schemaVersion === 2 &&
    manifest.page !== undefined &&
    manifest.page !== baselinesConfig.page
  ) {
    throw new Error("Baseline manifest page differs from configured source");
  }

  const verifiedReferences = new Map<string, ArtifactProvenance>();
  for (const frame of baselinesConfig.frames) {
    const result = manifest.frames.find((entry) => entry.id === frame.id);
    if (result) {
      const reference = await validateBaselineReference(
        context.root,
        baselinesConfig,
        frame,
        result,
      );
      if (reference) {
        verifiedReferences.set(frame.id, reference);
      }
    }
  }

  const plan = planImplementationCases(
    baselinesConfig,
    manifest.frames,
    (await readDesignJson(context.root, values.map, 1024 * 1024)) as ImplementationMapping,
    verifiedReferences,
  );

  let report: unknown = plan;
  let exitCode = plan.complete ? 0 : 3;

  if (subcommand === "check") {
    let release: ReleaseComparisonBinding | undefined;
    if (values["release-context"]) {
      const saved = (await readDesignJson(context.root, values["release-context"])) as {
        designHash: string;
        caseIds: string[];
        caseThresholds: Record<string, number>;
        releaseReference: ReleaseComparisonBinding["reference"];
        finalized?: boolean;
        ready?: boolean;
        truncated?: boolean;
      };
      if (
        saved.finalized !== true ||
        saved.ready !== true ||
        saved.truncated ||
        !Array.isArray(saved.caseIds)
      ) {
        throw new Error("An untruncated ready finalized release context is required");
      }
      release = {
        reference: saved.releaseReference,
        designHash: saved.designHash,
        caseIds: saved.caseIds,
        caseThresholds: saved.caseThresholds,
      };
      assertReleaseComparisonBinding(release, plan);
    }

    let result;
    if (values["engine-config"]) {
      result = await runNativeReflectionCases(context.root, plan, {
        configFile: values["engine-config"],
        engineVersion: values["engine-version"]!,
        fileId: context.config.file?.id,
        release,
        signal: context.signal,
        onProgress: (message) => {
          const redacted = context.redact?.(message) ?? message;
          const safe = redacted.replace(/(?:https?|wss?):\/\/[^\s<>"']+/g, "[redacted-url]");
          if (context.progress) {
            context.progress(safe.trimEnd());
          } else {
            process.stderr.write(safe);
          }
        },
      });
    } else {
      if (release) {
        await validateReleaseComparison(context.root, plan, release, context.config.file?.id);
      }
      const providerFile = await resolveProjectInput(context.root, values.provider!);
      const provider = (await createJiti(providerFile, {
        moduleCache: false,
        tryNative: false,
      }).evalModule(await readFile(providerFile, "utf8"), {
        filename: providerFile,
        async: true,
        forceTranspile: true,
      })) as ImplementationProvider;

      if (typeof provider.runCase !== "function") {
        throw new Error("Trusted project provider must export async runCase(test)");
      }

      result = await runImplementationCases(context.root, plan, provider);
      if (release) {
        await validateReleaseComparison(context.root, plan, release, context.config.file?.id);
        result.release = release;
      }
    }
    report = result;
    exitCode = !result.complete
      ? 3
      : result.cases.some((caseReport) => caseReport.withinThreshold === false)
        ? 2
        : 0;
  }

  context.output?.result(report);
  (context.output?.log ?? console.log)(JSON.stringify(report, null, 2));

  return exitCode;
}
