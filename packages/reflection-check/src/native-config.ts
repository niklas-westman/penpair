import path from "node:path";
import { observationHash } from "@penpair/core";
import type { NativeReflectionRequest } from "./native-types.js";

export interface NativeConfiguration {
  inputs: Array<{
    role: string;
    path: string;
    canonical?: "json";
  }>;
  contracts: {
    browser: {
      baseUrl: string;
      evidenceHooks: {
        observe: unknown;
        expectedFonts: unknown;
      };
      visualSmoke: Array<Record<string, unknown>>;
      routes: Array<Record<string, unknown>>;
    };
  };
}

export function validateNativeConfiguration(
  value: unknown,
  request: NativeReflectionRequest,
): NativeConfiguration {
  const config = value as NativeConfiguration;
  const browser = config?.contracts?.browser;

  if (
    !Array.isArray(config?.inputs) ||
    config.inputs.length === 0 ||
    !browser ||
    typeof browser.baseUrl !== "string" ||
    !Array.isArray(browser.visualSmoke) ||
    !Array.isArray(browser.routes) ||
    typeof browser.evidenceHooks?.observe !== "function" ||
    typeof browser.evidenceHooks?.expectedFonts !== "function" ||
    browser.visualSmoke.length !== request.cases.length ||
    new Set(browser.visualSmoke.map((entry) => entry.id)).size !== request.cases.length ||
    (
      value as {
        lifecycle?: {
          beforeRun?: unknown[];
        };
      }
    ).lifecycle?.beforeRun?.length
  ) {
    throw new Error(
      "Native config requires declared inputs, measured evidence hooks, exact cases and no beforeRun mutations",
    );
  }

  for (const implementationCase of request.cases) {
    const visual = browser.visualSmoke.find((entry) => entry.id === implementationCase.id);
    const threshold = visual?.threshold as
      | {
          maxDiffPixelRatio?: number;
        }
      | undefined;
    const capture = visual?.capture as
      | {
          selector?: string;
          measured?: boolean;
        }
      | undefined;

    if (
      !visual ||
      visual.ref !== implementationCase.reference ||
      visual.baselineRoot !== request.baselineRoot ||
      visual.baseline !== path.basename(implementationCase.baseline.path) ||
      visual.externallyManaged !== true ||
      capture?.measured !== true ||
      !capture.selector ||
      threshold?.maxDiffPixelRatio !== implementationCase.threshold ||
      !browser.routes.some((route) => route.id === visual.route)
    ) {
      throw new Error(
        `Native config must bind managed reference, measured capture and explicit threshold for ${implementationCase.id}`,
      );
    }
  }

  for (const input of config.inputs) {
    if (
      !input ||
      typeof input.role !== "string" ||
      !input.role ||
      typeof input.path !== "string" ||
      !input.path ||
      (input.canonical !== undefined && input.canonical !== "json")
    ) {
      throw new Error("Native config has an invalid declared input");
    }
  }

  return config;
}

export function nativeCaseReference(value: unknown): string {
  return `penpair-case:${observationHash(value)}`;
}
