import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { createJiti } from "jiti";
import {
  defineAdapter,
  observationHash,
  parseCommandArgs,
  readDesignJson,
  resolveProjectInput,
  validateBaselineCase,
  type AdapterContext,
  type ArtifactProvenance,
  type BaselineCase,
  type BaselineResult,
  type BaselinesConfig,
} from "@penpair/core";

export interface ImplementationMapping {
  schemaVersion: 1;
  cases: Array<{
    id: string;
    setup: string;
  }>;
}
export interface ImplementationCase {
  id: string;
  route: string;
  intent: BaselineCase;
  setup: string;
  baseline: {
    path: string;
    sha256: string;
    scale: number;
  };
  threshold: number;
}
export interface CasePlan {
  schemaVersion: 1;
  kind: "implementation-case-plan";
  cases: ImplementationCase[];
  pending: Array<{
    id: string;
    reason: string;
  }>;
  complete: boolean;
  visualApproval: false;
}
export interface BrowserCaptureMetadata {
  schemaVersion: 1;
  root: string;
  rootBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  clip: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  rounding: "outward-css-pixels";
  deviceScaleFactor: number;
  browser: {
    name: string;
    version: string;
  };
  fonts: Array<{
    family: string;
    weight: string;
    style: string;
    status: "loaded";
  }>;
  pointer: {
    x: number;
    y: number;
    outsideRoot: boolean;
    hoveredControls: number;
  };
  occlusion?: {
    samples: number;
    blocked: number;
  };
  scroll: {
    x: number;
    y: number;
  };
  layoutSamples: number;
}
export interface ProviderEvidence {
  schemaVersion: 1;
  id: string;
  route: string;
  setup: string;
  observed: Pick<BaselineCase, "viewport" | "theme" | "state" | "fixture">;
  fonts: string[];
  fontsReady: boolean;
  baselineHash: string;
  capture?: BrowserCaptureMetadata;
  screenshot: string;
  diffPixelRatio: number;
  provider: {
    name: string;
    version: string;
  };
}
export interface ImplementationProvider {
  runCase(test: ImplementationCase): Promise<ProviderEvidence>;
}
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
export function planImplementationCases(
  config: BaselinesConfig,
  results: BaselineResult[],
  mapping: ImplementationMapping,
): CasePlan {
  if (
    !mapping ||
    mapping.schemaVersion !== 1 ||
    !Array.isArray(mapping.cases) ||
    mapping.cases.length > 1000
  ) {
    throw new Error("Unsupported implementation mapping");
  }
  const names = new Set<string>();
  for (const entry of mapping.cases) {
    if (
      !entry ||
      typeof entry.id !== "string" ||
      !entry.id ||
      names.has(entry.id) ||
      typeof entry.setup !== "string" ||
      !/^[a-zA-Z][\w.-]{0,100}$/.test(entry.setup)
    ) {
      throw new Error("Duplicate/invalid explicit setup mapping");
    } else {
      names.add(entry.id);
    }
  }
  const cases: ImplementationCase[] = [];
  const pending: CasePlan["pending"] = [];
  for (const wanted of config.frames) {
    if (!wanted.route) {
      continue;
    }
    const result = results.find((r) => r.id === wanted.id);
    const setup = mapping.cases.find((c) => c.id === wanted.id)?.setup;
    const approved =
      result?.approved && !("legacy" in result.approved) ? result.approved : undefined;
    if (
      approved?.approval?.kind === "forced-reference" ||
      !wanted.case ||
      !result ||
      !approved?.case ||
      !setup ||
      ![
        "same",
        "new",
        "changed",
      ].includes(result.status) ||
      !result.captured ||
      approved.sha256 !== result.captured.sha256 ||
      observationHash(approved.case) !== observationHash(wanted.case) ||
      approved.frameId !== result.frameId ||
      approved.fileId !== result.captured.fileId ||
      approved.pageId !== result.captured.pageId ||
      approved.revision !== result.captured.revision ||
      approved.file !== result.file
    ) {
      pending.push({
        id: wanted.id,
        reason:
          "Requires current exact approved case provenance and an explicit implementation setup; legacy cases keep the existing generated Reflection path",
      });
      continue;
    }
    validateBaselineCase(wanted.case, (message) => {
      throw new Error(message);
    });
    cases.push({
      id: wanted.id,
      route: wanted.route,
      intent: structuredClone(wanted.case),
      setup,
      baseline: {
        path: path.join(config.root, result.file),
        sha256: approved.sha256,
        scale: approved.scale,
      },
      threshold: config.threshold ?? 0.05,
    });
  }
  for (const entry of mapping.cases) {
    if (!config.frames.some((f) => f.id === entry.id)) {
      pending.push({
        id: entry.id,
        reason: "Mapping refers to no configured baseline",
      });
    }
  }
  return {
    schemaVersion: 1,
    kind: "implementation-case-plan",
    cases,
    pending,
    complete: pending.length === 0 && cases.length > 0,
    visualApproval: false,
  };
}
async function png(
  root: string,
  file: string,
): Promise<{
  bytes: Buffer;
  width: number;
  height: number;
}> {
  const input = await resolveProjectInput(root, file);
  if ((await stat(input)).size > 64 * 1024 * 1024) {
    throw new Error("Image exceeds 64 MiB");
  }
  const bytes = await readFile(input);
  if (
    bytes.length < 24 ||
    bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
    bytes.subarray(12, 16).toString() !== "IHDR"
  ) {
    throw new Error("Provider evidence must reference PNG bytes");
  }
  return {
    bytes,
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}
export async function runImplementationCases(
  root: string,
  plan: CasePlan,
  provider: ImplementationProvider,
) {
  const reports: Array<{
    id: string;
    complete: boolean;
    withinThreshold?: boolean;
    evidence?: ProviderEvidence;
    screenshotHash?: string;
    reason?: string;
  }> = [];
  for (const c of plan.cases) {
    try {
      if (!(Number.isFinite(c.baseline.scale) && c.baseline.scale > 0)) {
        throw new Error("Missing capture scale");
      }
      const before = await png(root, c.baseline.path);
      if (sha(before.bytes) !== c.baseline.sha256) {
        throw new Error("Approved baseline bytes changed");
      }
      const evidence = await provider.runCase(structuredClone(c));
      const desired = {
        viewport: c.intent.viewport,
        theme: c.intent.theme,
        state: c.intent.state,
        fixture: c.intent.fixture,
      };
      if (
        !evidence ||
        evidence.schemaVersion !== 1 ||
        evidence.id !== c.id ||
        evidence.route !== c.route ||
        evidence.setup !== c.setup ||
        observationHash(evidence.observed) !== observationHash(desired) ||
        evidence.baselineHash !== c.baseline.sha256 ||
        evidence.fontsReady !== true ||
        !Array.isArray(evidence.fonts) ||
        (c.intent.fonts ?? []).some((font) => !evidence.fonts.includes(font)) ||
        !evidence.provider?.name ||
        !evidence.provider.version ||
        !Number.isFinite(evidence.diffPixelRatio) ||
        evidence.diffPixelRatio < 0 ||
        evidence.diffPixelRatio > 1
      ) {
        throw new Error(
          "Provider did not independently observe the exact requested state, fixture, viewport, fonts and baseline",
        );
      }
      if (
        evidence.provider.name === "penpair-browser-starter-rgba-exact" &&
        (!evidence.capture || !evidence.capture.occlusion)
      ) {
        throw new Error("Browser starter requires complete capture metadata");
      }
      if (evidence.capture) {
        const m = evidence.capture;
        const box = m.rootBox;
        const clip = m.clip;
        if (
          m.schemaVersion !== 1 ||
          !m.root ||
          m.rounding !== "outward-css-pixels" ||
          m.deviceScaleFactor !== c.baseline.scale ||
          !m.browser?.name ||
          !m.browser.version ||
          !box ||
          !clip ||
          ![
            box.x,
            box.y,
            box.width,
            box.height,
            clip.x,
            clip.y,
            clip.width,
            clip.height,
          ].every(Number.isFinite) ||
          box.x < 0 ||
          box.y < 0 ||
          box.width <= 0 ||
          box.height <= 0 ||
          clip.x !== Math.floor(box.x) ||
          clip.y !== Math.floor(box.y) ||
          clip.width !== Math.ceil(box.x + box.width) - clip.x ||
          clip.height !== Math.ceil(box.y + box.height) - clip.y ||
          clip.width !== c.intent.viewport.width ||
          clip.height !== c.intent.viewport.height ||
          m.pointer?.outsideRoot !== true ||
          m.pointer.hoveredControls !== 0 ||
          !Number.isFinite(m.pointer.x) ||
          !Number.isFinite(m.pointer.y) ||
          !m.scroll ||
          ![
            m.scroll.x,
            m.scroll.y,
          ].every(Number.isFinite) ||
          !Number.isInteger(m.layoutSamples) ||
          m.layoutSamples < 3 ||
          (m.occlusion &&
            (!Number.isInteger(m.occlusion.samples) ||
              m.occlusion.samples < 1 ||
              m.occlusion.blocked !== 0)) ||
          !Array.isArray(m.fonts) ||
          m.fonts.some(
            (font) => !font.family || !font.weight || !font.style || font.status !== "loaded",
          ) ||
          (c.intent.fonts ?? []).some((font) => !m.fonts.some((face) => face.family === font))
        ) {
          throw new Error("Invalid browser capture geometry, font or pointer evidence");
        }
      }
      const shot = await png(root, evidence.screenshot);
      if (
        (await resolveProjectInput(root, evidence.screenshot)) ===
        (await resolveProjectInput(root, c.baseline.path))
      ) {
        throw new Error("Screenshot must be independently captured, not the baseline path");
      }
      if (
        shot.width !== Math.round(c.intent.viewport.width * c.baseline.scale) ||
        shot.height !== Math.round(c.intent.viewport.height * c.baseline.scale) ||
        before.width !== shot.width ||
        before.height !== shot.height
      ) {
        throw new Error("Provider PNG scale/viewport differs from the design case");
      }
      if (sha((await png(root, c.baseline.path)).bytes) !== c.baseline.sha256) {
        throw new Error("Baseline changed during provider execution");
      }
      reports.push({
        id: c.id,
        complete: true,
        withinThreshold: evidence.diffPixelRatio <= c.threshold,
        evidence,
        screenshotHash: sha(shot.bytes),
      });
    } catch (error) {
      reports.push({
        id: c.id,
        complete: false,
        reason: String((error as Error).message),
      });
    }
  }
  return {
    schemaVersion: 1,
    kind: "implementation-case-evidence",
    complete: plan.complete && reports.length > 0 && reports.every((r) => r.complete),
    cases: reports,
    pending: plan.pending,
    visualApproval: false,
    verdict: "owner-review-required",
    accessibility: "not-assessed",
  };
}
async function command(context: AdapterContext, args: string[]): Promise<number> {
  const [sub, ...rest] = args;
  const { values, positionals } = parseCommandArgs({
    args: rest,
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
    ].includes(sub ?? "") ||
    positionals.length ||
    !values.map ||
    (sub === "plan" && values.provider) ||
    (sub === "check" && !values.provider)
  ) {
    throw new Error(
      "Usage: reflection plan --map FILE | reflection check --map FILE --provider FILE",
    );
  }
  const config = context.config.baselines;
  if (!config) {
    throw new Error("Configure baselines first");
  }
  const manifest = (await readDesignJson(
    context.root,
    path.join(config.root, "penpair-baselines.json"),
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
    config,
    manifest.frames,
    (await readDesignJson(context.root, values.map, 1024 * 1024)) as ImplementationMapping,
  );
  let report: unknown = plan;
  let code = plan.complete ? 0 : 3;
  if (sub === "check") {
    const file = await resolveProjectInput(context.root, values.provider!);
    const provider = (await createJiti(file, {
      moduleCache: false,
      tryNative: false,
    }).evalModule(await readFile(file, "utf8"), {
      filename: file,
      async: true,
      forceTranspile: true,
    })) as ImplementationProvider;
    if (typeof provider.runCase !== "function") {
      throw new Error("Trusted project provider must export async runCase(test)");
    }
    const result = await runImplementationCases(context.root, plan, provider);
    report = result;
    code = !result.complete ? 3 : result.cases.some((c) => c.withinThreshold === false) ? 2 : 0;
  }
  context.output?.result(report);
  (context.output?.log ?? console.log)(JSON.stringify(report, null, 2));
  return code;
}
export default defineAdapter({
  name: "@penpair/reflection-check",
  commands: [
    {
      name: "reflection",
      summary: "Plan explicit implementation cases and collect provider evidence",
      usage: [
        "penpair reflection plan --map FILE",
        "penpair reflection check --map FILE --provider FILE",
      ],
      run: command,
    },
  ],
});
