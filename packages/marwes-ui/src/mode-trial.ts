import { createHash, randomUUID } from "node:crypto";
import {
  atomicWriteFile,
  commandSleep,
  resolveProjectOutput,
  exportShapePng,
  guardFile,
  guardRevision,
  observationHash,
  readJournal,
  readJournalTarget,
  runJournaledSteps,
  runSnippet,
  snippet,
  waitForStableLayout,
  withCleanupDeadline,
  writeCoordinator,
  type JournalOptions,
  type PenpotToolClient,
} from "@penpair/core";
import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { canonical, type TokenSnapshot } from "./tokens.js";
import { compareResolved, expectedResolved } from "./resolved-values.js";

interface Selection {
  sets: {
    id: string;
    active: boolean;
  }[];
  themes: {
    id: string;
    active: boolean;
  }[];
}
interface ModeSource {
  sets: {
    id: string;
    name: string;
    tokens: {
      name: string;
      type: string;
      value: unknown;
      description: string;
    }[];
  }[];
  themes: {
    id: string;
    group: string;
    name: string;
    sets: string[];
  }[];
}
interface ModeState {
  fileId: string;
  revision: number;
  pageId: string;
  pageName: string;
  source: ModeSource;
  sourceHash: string;
  penpotApiVersion: string | null;
  selection: Selection;
  supported: boolean;
  resolved: {
    name: string;
    type: string;
    set: string;
    value: unknown;
    unknown?: string;
  }[];
}
export interface ModeComparison {
  group: string;
  name: string;
  context: "isolated-theme";
  activeSets: string[];
  expectedSets: string[];
  orderMatches: boolean;
  values: {
    name: string;
    type: string;
    expected: unknown;
    actual: unknown;
    equal?: boolean;
    unknown?: string;
  }[];
  complete: boolean;
  matches: boolean;
  sourceHash: string;
  resolutionSamples?: number;
  image?: {
    file: string;
    sha256: string;
    capture: unknown;
  };
}
export interface ModeTrialReport {
  schemaVersion: 1;
  kind: "mode-trial";
  redacted?: boolean;
  fileId: string;
  snapshotHash: string;
  sourceHash: string;
  capturedAt: string;
  penpotApiVersion: string | null;
  phase: "inspected" | "measured";
  modes: ModeComparison[];
  plannedThemes: {
    group: string;
    name: string;
    sets: string[];
  }[];
  original: Selection;
  plannedStates: {
    group: string;
    name: string;
    activeSets: string[];
  }[];
  artifacts?: {
    manifest: string;
    generation: string;
  };
  restoration: {
    verified: boolean;
    error?: string;
  };
  complete: boolean;
  verified: boolean;
  uncertain: boolean;
  error?: string;
  journal?: {
    runId: string;
    state: string;
  };
}
export interface ModeTrialOptions {
  root: string;
  apply?: boolean;
  resume?: string;
  forceLock?: boolean;
  redact?(text: string): string;
  layout?: false;
  sleep?(milliseconds: number): Promise<void>;
  frame?: {
    id: string;
    page: string;
    out: string;
  };
  onStep?(message: string): void;
  checkpoint?: JournalOptions["checkpoint"];
  requireCheckpoint?: boolean;
}

const readBody = `
const f=penpot.currentFile,c=penpot.library.local.tokens;
if(!Array.isArray(c.sets)||!Array.isArray(c.themes))throw new Error("Token API unavailable");
if(c.sets.reduce((n,s)=>n+s.tokens.length,0)>5000)throw new Error("Mode trial exceeds 5000 tokens");
const source={sets:c.sets.map(s=>({id:s.id,name:s.name,tokens:s.tokens.map(t=>({name:t.name,type:t.type,value:t.value,description:t.description||""}))})),themes:c.themes.map(t=>({id:t.id,group:t.group,name:t.name,sets:(t.activeSets||[]).map(s=>typeof s==="string"?s:s.name)}))};
if(JSON.stringify(source).length>500000)throw new Error("Mode source exceeds bounded size");
const selection={sets:c.sets.map(s=>({id:s.id,active:!!s.active})),themes:c.themes.map(t=>({id:t.id,active:!!t.active}))};
let supported=c.sets.every(set=>typeof set.toggleActive==="function")&&c.themes.every(theme=>typeof theme.toggleActive==="function");const resolved=[];
for(const set of c.sets)for(const token of set.tokens){if(!("resolvedValue" in token))supported=false;if(!set.active)continue;let value=null,unknown;try{const raw=token.resolvedValue;if(raw===undefined)unknown="API resolvedValue is unavailable";else value=JSON.parse(JSON.stringify(raw));}catch{unknown="Unreadable resolvedValue";}resolved.push({name:token.name,type:token.type,set:set.name,value,...unknown?{unknown}:{}});}
if(JSON.stringify(resolved).length>500000)throw new Error("Resolved output exceeds bounded size");
return {ok:true,readOnly:true,fileId:f.id,revision:f.revn,pageId:penpot.currentPage.id,pageName:penpot.currentPage.name,source,selection,supported,resolved,penpotApiVersion:typeof penpot.version==="string"?penpot.version:null};`;
async function readMode(client: PenpotToolClient, timeoutMs = 10000): Promise<ModeState> {
  const result = await runSnippet(client, snippet("modes-read", readBody, {}, "read"), {
    effect: "read",
    retries: 0,
    timeoutMs,
  });
  if (
    result.ok !== true ||
    typeof result.fileId !== "string" ||
    !Number.isInteger(result.revision) ||
    !result.source ||
    !result.selection ||
    !Array.isArray(result.resolved)
  ) {
    throw new Error("Incomplete mode observation");
  }
  const state = result as unknown as ModeState;
  const ids = [
    ...state.source.sets,
    ...state.source.themes,
  ].map((item) => item.id);
  if (ids.some((id) => typeof id !== "string" || !id) || new Set(ids).size !== ids.length) {
    throw new Error("Stable token-set and theme IDs are required for mode trials");
  }
  if (
    new Set(state.source.sets.map((set) => set.name)).size !== state.source.sets.length ||
    new Set(
      state.source.themes.map((theme) =>
        canonical([
          theme.group,
          theme.name,
        ]),
      ),
    ).size !== state.source.themes.length
  ) {
    throw new Error("Ambiguous mode identity");
  }
  state.sourceHash = observationHash(state.source);
  return state;
}
function desiredSelection(state: ModeState, group: string, name: string): Selection {
  const theme = state.source.themes.find((theme) => theme.group === group && theme.name === name);
  if (!theme) {
    throw new Error(`Missing mode ${group}/${name}`);
  }
  return {
    sets: state.source.sets.map((set) => ({
      id: set.id,
      active: theme.sets.includes(set.name),
    })),
    themes: state.source.themes.map((item) => ({
      id: item.id,
      active: item.id === theme.id,
    })),
  };
}
function changeSelection(state: ModeState, desired: Selection) {
  return snippet(
    "modes-select",
    `
const observed=await(async()=>{${readBody}})();
if(JSON.stringify(observed.source)!==CFG.source||JSON.stringify(observed.selection)!==CFG.before)throw new Error("Mode source or selection changed before mutation");
const c=penpot.library.local.tokens;
// Direct set changes disable themes; establish flags in a documented order.
for(const theme of c.themes)if(theme.active)theme.toggleActive();
for(const set of c.sets)if(set.active)set.toggleActive();
for(const theme of c.themes)if(CFG.desired.themes.some(t=>t.id===theme.id&&t.active))theme.toggleActive();
for(const set of c.sets){const wanted=CFG.desired.sets.find(s=>s.id===set.id);if(!wanted)throw new Error("Set identity changed");if(!!set.active!==wanted.active)set.toggleActive();}
return {ok:true};`,
    {
      source: JSON.stringify(state.source),
      before: JSON.stringify(state.selection),
      desired,
    },
    "write",
  );
}
function compareMode(
  snapshot: TokenSnapshot,
  state: ModeState,
  theme: TokenSnapshot["themes"][number],
): ModeComparison {
  const activeSets = state.source.sets
    .filter((set) => state.selection.sets.find((item) => item.id === set.id)?.active)
    .map((set) => set.name);
  const expectedSets = snapshot.sets
    .filter((set) => theme.sets.includes(set.name))
    .map((set) => set.name);
  const actual = new Map(
    state.resolved.map((token) => [
      token.name,
      token,
    ]),
  );
  const values = expectedResolved(snapshot, theme).map((token) => {
    const observed = actual.get(token.name);
    const comparison = observed?.unknown
      ? {
          unknown: observed.unknown,
        }
      : !observed
        ? {
            unknown: "No active resolved token",
          }
        : observed.type !== token.type
          ? {
              equal: false,
            }
          : compareResolved(token, observed.value);
    return {
      name: token.name,
      type: token.type,
      expected: token.value ?? null,
      actual: observed?.value ?? null,
      ...comparison,
    };
  });
  const orderMatches = canonical(activeSets) === canonical(expectedSets);
  return {
    group: theme.group,
    name: theme.name,
    context: "isolated-theme",
    activeSets,
    expectedSets,
    orderMatches,
    values,
    complete: values.length > 0 && values.every((value) => !value.unknown),
    matches: orderMatches && values.length > 0 && values.every((value) => value.equal === true),
    sourceHash: state.sourceHash,
  };
}

export async function runModeTrial(
  client: PenpotToolClient,
  snapshot: TokenSnapshot,
  options: ModeTrialOptions,
): Promise<ModeTrialReport> {
  const target = await readJournalTarget(client);
  client = guardFile(client, {
    id: target.fileId,
  });
  const initial = await readMode(client);
  if (!initial.supported) {
    throw new Error("resolvedValue API unavailable; no theme was changed");
  }
  if (snapshot.themes.length < 1 || snapshot.themes.length > 20) {
    throw new Error("Mode trials require 1–20 declared themes");
  }
  let original = initial;
  const runId = options.resume ?? randomUUID();
  if (options.resume) {
    const record = await readJournal(options.root, runId);
    const payload = record.payload as
      | {
          original?: ModeState;
        }
      | undefined;
    if (
      record.operation !== "tokens-modes" ||
      !payload?.original ||
      record.target.fileId !== target.fileId
    ) {
      throw new Error("No matching original mode state in this journal");
    }
    original = payload.original;
  }
  if (original.sourceHash !== initial.sourceHash) {
    throw new Error("Token declarations changed since the trial began");
  }
  if (
    options.frame &&
    (initial.pageId !== original.pageId || initial.pageName !== options.frame.page)
  ) {
    throw new Error("Open the requested frame page before inspecting a mode trial");
  }
  if (options.frame) {
    const frame = await runSnippet(
      client,
      snippet(
        "modes-frame",
        "if(penpot.currentPage.id!==CFG.pageId)throw new Error('Frame page changed');const shape=penpot.currentPage.getShapeById(CFG.id);if(!shape||typeof shape.export!=='function')throw new Error('Requested exportable frame is unavailable');return {ok:true,frameId:shape.id};",
        {
          id: options.frame.id,
          pageId: initial.pageId,
        },
        "read",
      ),
      {
        effect: "read",
        retries: 0,
      },
    );
    if (frame.ok !== true || frame.frameId !== options.frame.id) {
      throw new Error("Frame identity was not observed");
    }
  }
  const selections = snapshot.themes.map((theme) =>
    desiredSelection(original, theme.group, theme.name),
  );
  const base: ModeTrialReport = {
    schemaVersion: 1,
    kind: "mode-trial",
    fileId: target.fileId,
    snapshotHash: snapshot.hash,
    sourceHash: original.sourceHash,
    capturedAt: new Date().toISOString(),
    penpotApiVersion: initial.penpotApiVersion,
    phase: "inspected",
    modes: [],
    plannedThemes: snapshot.themes,
    original: original.selection,
    plannedStates: snapshot.themes.map((theme, index) => ({
      group: theme.group,
      name: theme.name,
      activeSets: original.source.sets
        .filter((set) => selections[index]!.sets.find((item) => item.id === set.id)?.active)
        .map((set) => set.name),
    })),
    restoration: {
      verified: false,
    },
    complete: true,
    verified: false,
    uncertain: false,
  };
  if (!options.apply) {
    return base;
  }
  let report = base;
  const settle = async () => {
    if (options.layout !== false) {
      const result = await waitForStableLayout(client, {
        timeoutMs: 10000,
      });
      if (!result.stable) {
        throw new Error("Layout did not settle for mode evidence");
      }
    }
  };
  const inspect = async () => {
    await settle();
    return readMode(client);
  };
  const stableMode = async () => {
    let previous = await inspect();
    const deadline = Date.now() + 5000;
    for (let samples = 2; samples <= 20 && Date.now() < deadline; samples++) {
      await (options.sleep ?? commandSleep)(100);
      const current = await readMode(client, Math.max(1, deadline - Date.now()));
      if (Date.now() > deadline) {
        throw new Error("Resolved observation exceeded its deadline");
      }
      if (
        current.sourceHash !== previous.sourceHash ||
        canonical(current.selection) !== canonical(previous.selection)
      ) {
        throw new Error("Source or selection changed while observing resolution");
      }
      if (canonical(current.resolved) === canonical(previous.resolved)) {
        return {
          state: current,
          samples,
        };
      }
      previous = current;
    }
    throw new Error("Resolved values did not stabilize within the observation budget");
  };
  const sourceOkay = (state: ModeState) => state.sourceHash === original.sourceHash;
  const originalOkay = (state: ModeState) =>
    sourceOkay(state) && canonical(state.selection) === canonical(original.selection);
  const select = async (state: ModeState, desired: Selection) => {
    if (!sourceOkay(state)) {
      throw new Error("Token declarations changed during trial");
    }
    if (canonical(state.selection) === canonical(desired)) {
      return;
    }
    const current = await readJournalTarget(client);
    await runSnippet(guardRevision(client, current), changeSelection(state, desired), {
      effect: "write",
      timeoutMs: 10000,
    });
  };
  const pendingImages: {
    name: string;
    bytes: Buffer;
  }[] = [];
  try {
    const record = await runJournaledSteps(
      [
        {
          key: "trial",
          label: "measure isolated modes and restore full selection",
          initial,
          signature: [
            readBody,
            changeSelection.toString(),
            compareMode.toString(),
            compareResolved.toString(),
            expectedResolved.toString(),
            runModeTrial.toString(),
          ].join("\n"),
          inspect,
          apply: async () => {
            report = {
              ...base,
              phase: "measured",
              journal: {
                runId,
                state: "running",
              },
            };
            try {
              for (let index = 0; index < snapshot.themes.length; index++) {
                options.onStep?.(
                  `measure ${snapshot.themes[index]!.group}/${snapshot.themes[index]!.name}`,
                );
                await select(await inspect(), selections[index]!);
                const evidence = await stableMode();
                const observed = evidence.state;
                if (
                  !sourceOkay(observed) ||
                  canonical(observed.selection) !== canonical(selections[index])
                ) {
                  throw new Error(
                    "Theme activation did not establish the isolated requested selection",
                  );
                }
                const mode = compareMode(snapshot, observed, snapshot.themes[index]!);
                mode.resolutionSamples = evidence.samples;
                report.modes.push(mode);
                if (options.frame) {
                  const image = await exportShapePng(client, options.frame.id, {
                    maxExports: 4,
                    attempts: 1,
                    sleep: options.sleep,
                  });
                  const after = await readMode(client);
                  if (
                    !image.stable ||
                    !sourceOkay(after) ||
                    after.pageId !== original.pageId ||
                    canonical(after.selection) !== canonical(selections[index]) ||
                    canonical(after.resolved) !== canonical(observed.resolved)
                  ) {
                    throw new Error("Mode changed during export");
                  }
                  const name = `${index + 1}.png`;
                  pendingImages.push({
                    name,
                    bytes: image.png,
                  });
                  mode.image = {
                    file: name,
                    sha256: createHash("sha256").update(image.png).digest("hex"),
                    capture: image.capture,
                  };
                }
              }
            } catch (error) {
              report.error = error instanceof Error ? error.message : String(error);
              report.uncertain =
                (
                  error as {
                    code?: string;
                  }
                ).code === "write-uncertain";
            } finally {
              try {
                await withCleanupDeadline(async () => {
                  const current = await readMode(client);
                  await select(current, original.selection);
                  const restored = await inspect();
                  report.restoration = {
                    verified: originalOkay(restored),
                  };
                  if (!report.restoration.verified) {
                    report.restoration.error =
                      "Independent readback differs from the original complete selection";
                  }
                }, 10000);
              } catch (error) {
                report.restoration = {
                  verified: false,
                  error: error instanceof Error ? error.message : String(error),
                };
              }
            }
            report.complete =
              !report.error &&
              report.modes.length === snapshot.themes.length &&
              report.modes.every((mode) => mode.complete) &&
              report.restoration.verified;
            report.verified = report.complete && report.modes.every((mode) => mode.matches);
            return report;
          },
          verify: (current, _before, result) =>
            originalOkay(current) &&
            (result as ModeTrialReport | undefined)?.restoration.verified === true,
          reconcile: (_before, current, result) =>
            !sourceOkay(current)
              ? "conflict"
              : originalOkay(current) &&
                  (result as ModeTrialReport | undefined)?.restoration.verified === true
                ? "complete"
                : [
                      original.selection,
                      ...selections,
                    ].some((selection) => canonical(selection) === canonical(current.selection))
                  ? "pending"
                  : "conflict",
        },
      ],
      {
        root: options.root,
        runId,
        resume: Boolean(options.resume),
        operation: "tokens-modes",
        input: {
          snapshot: observationHash(snapshot),
          frame: options.frame ?? null,
          layout: options.layout ?? {},
        },
        payload: {
          original,
        },
        target: () => readJournalTarget(client),
        redact: options.redact,
        coordinate: writeCoordinator(client, {
          root: options.root,
          operation: "tokens-modes",
          forceLock: options.forceLock,
          warn: options.onStep,
        }),
        checkpoint: options.checkpoint,
        requireCheckpoint: options.requireCheckpoint,
        onStep: options.onStep,
      },
    );
    report = record.steps[0]!.result as ModeTrialReport;
    if (!report) {
      throw new Error("Mode journal lacks measured results");
    }
    report.journal = {
      runId,
      state: record.state,
    };
    if (record.redacted) {
      report.redacted = true;
      report.complete = false;
      report.verified = false;
      report.error = "Journal required credential redaction; evidence is incomplete";
    }
  } catch (error) {
    try {
      const record = await readJournal(options.root, runId);
      report = (record.steps[0]?.result as ModeTrialReport | undefined) ?? report;
      report.journal = {
        runId,
        state: record.state,
      };
      if (record.redacted) {
        report.redacted = true;
      }
    } catch {
      /* Preserve the actual failure. */
    }
    report.complete = false;
    report.verified = false;
    report.error ??= error instanceof Error ? error.message : String(error);
    report.uncertain ||=
      (
        error as {
          outcome?: string;
        }
      ).outcome === "uncertain";
  }
  if (options.frame && report.complete && pendingImages.length !== snapshot.themes.length) {
    report.complete = false;
    report.verified = false;
    report.error =
      "Recovered measurement lacks image bytes; start a fresh trial to publish exports";
  }
  if (options.frame && report.complete && pendingImages.length === snapshot.themes.length) {
    await publishModes(options.root, options.frame.out, report, pendingImages, options.redact);
  }
  return report;
}
async function publishModes(
  root: string,
  out: string,
  report: ModeTrialReport,
  images: {
    name: string;
    bytes: Buffer;
  }[],
  redact?: (value: string) => string,
): Promise<void> {
  const destination = await resolveProjectOutput(root, out);
  const generation = randomUUID();
  const stage = path.join(destination, "." + generation);
  const final = path.join(destination, generation);
  report.artifacts = {
    manifest: path.join(destination, "manifest.json"),
    generation,
  };
  const serialized = JSON.stringify(report, null, 2) + "\n";
  if (redact && redact(serialized) !== serialized) {
    throw new Error("Mode evidence requires credential redaction; previous output preserved");
  }
  await mkdir(stage, {
    recursive: true,
  });
  try {
    for (const image of images) {
      await atomicWriteFile(path.join(stage, image.name), image.bytes);
    }
    await atomicWriteFile(path.join(stage, "manifest.json"), serialized);
    await rename(stage, final);
    await atomicWriteFile(
      path.join(destination, "manifest.json"),
      JSON.stringify(
        {
          schemaVersion: 1,
          generation,
          manifest: `${generation}/manifest.json`,
          sha256: createHash("sha256").update(serialized).digest("hex"),
        },
        null,
        2,
      ) + "\n",
      {
        replace: true,
      },
    );
  } finally {
    await rm(stage, {
      recursive: true,
      force: true,
    });
  }
}
