import { readFile } from "node:fs/promises";
import path from "node:path";
import { createJiti } from "jiti";
import {
  parseCommandArgs,
  readDesignJson,
  resolveProjectInput,
  type AdapterContext,
  type BaselineResult,
} from "@penpair/core";
import { planImplementationCases } from "./case-plan.js";
import { runImplementationCases } from "./run-cases.js";
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
    (subcommand === "plan" && values.provider) ||
    (subcommand === "check" && !values.provider)
  ) {
    throw new Error(
      "Usage: reflection plan --map FILE | reflection check --map FILE --provider FILE",
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
  };

  if (
    manifest.schemaVersion !== 2 ||
    !Array.isArray(manifest.frames) ||
    !context.config.file ||
    manifest.fileId !== context.config.file.id
  ) {
    throw new Error("A schema-2 baseline manifest matching the configured file pin is required");
  }

  const plan = planImplementationCases(
    baselinesConfig,
    manifest.frames,
    (await readDesignJson(context.root, values.map, 1024 * 1024)) as ImplementationMapping,
  );

  let report: unknown = plan;
  let exitCode = plan.complete ? 0 : 3;

  if (subcommand === "check") {
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

    const result = await runImplementationCases(context.root, plan, provider);
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
