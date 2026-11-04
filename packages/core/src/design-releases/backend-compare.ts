import { createHash } from "node:crypto";
import type { BackendShape } from "../penpot-backend.js";

/** Pages as the backend returns them: every shape of the page by id. */
export type BackendObjects = Record<string, BackendShape>;

export interface BackendComparison {
  /** Source shape id to copied shape id, for every node of the subtree. */
  nodeMap: Record<string, string>;
  nodes: number;
  problems: string[];
  /** The attributes that differ without an explanation, so a caller can tell what changed. */
  differingAttributes: string[];
  /**
   * Source shapes whose size or position differs and is explained by an automatic layout: Penpot recomputes those while
   * pasting, so a source whose stored sizes are stale is copied with the recomputed ones. Not problems.
   */
  layoutDriven: string[];
}

/** Attributes that move when Penpot recomputes an automatic layout: sizes and positions, nothing about the design itself. */
const layoutAttributes: ReadonlySet<string> = new Set([
  "width",
  "height",
  "x",
  "y",
  "selrect",
  "points",
  "positionData",
]);

interface Offset {
  x: number;
  y: number;
}

// A copy lands at another position, so absolute positions are compared as a shift; everything else must be equal.
const positionTolerance = 0.02;
const valueTolerance = 0.001;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const identityAttributes = new Set([
  "id",
  "parentId",
  "frameId",
  "shapes",
]);
// Our own bookkeeping, written by the arrange step on the copy, is not design content.
const penpairPluginDataNamespace = "penpair";
const problemLimit = 20;
// `selrect` and `points` hold absolute corners; a text's `positionData` has absolute x and y but corner offsets inside each run.
const cornerShiftKeys: ReadonlySet<string> = new Set([
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
]);
const originShiftKeys: ReadonlySet<string> = new Set([
  "x",
  "y",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isEmpty(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    (Array.isArray(value) && value.length === 0) ||
    (isRecord(value) && Object.keys(value).length === 0)
  );
}

function childIds(shape: BackendShape): string[] {
  return Array.isArray(shape.shapes) ? shape.shapes : [];
}

/** Pre-order list of every node below a root, in the order the backend stores children. */
function orderedIds(objects: BackendObjects, rootId: string): string[] {
  const ordered: string[] = [];
  const visit = (id: string): void => {
    const shape = objects[id];
    if (!shape) {
      throw new Error(`The backend page has no shape ${id}`);
    }
    ordered.push(id);
    for (const child of childIds(shape)) {
      visit(child);
    }
  };
  visit(rootId);
  return ordered;
}

/** A stable description of a subtree's topology, used to pair a source board with its copy without any plugin read. */
export function subtreeSignature(objects: BackendObjects, rootId: string): string {
  const entries = orderedIds(objects, rootId).map((id) => [
    objects[id]!.type,
    objects[id]!.name,
    childIds(objects[id]!).length,
  ]);
  return createHash("sha256").update(JSON.stringify(entries)).digest("hex");
}

function offsetOf(source: BackendShape, target: BackendShape): Offset {
  const x = Number(target.x) - Number(source.x);
  const y = Number(target.y) - Number(source.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error("A board position was not observed");
  }
  return {
    x,
    y,
  };
}

function near(left: number, right: number, tolerance: number): boolean {
  return Math.abs(left - right) <= tolerance;
}

/** Shifts the absolute coordinates of an SVG path string; relative commands are position-independent. */
function shiftedPath(content: string, offset: Offset): string {
  const tokens = content.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];
  const output: string[] = [];
  let command = "";
  let argumentIndex = 0;
  const argumentCount: Record<string, number> = {
    m: 2,
    l: 2,
    t: 2,
    c: 6,
    s: 4,
    q: 4,
    h: 1,
    v: 1,
    a: 7,
    z: 0,
  };
  for (const token of tokens) {
    if (/[a-zA-Z]/.test(token)) {
      command = token;
      argumentIndex = 0;
      output.push(token);
      continue;
    }
    const value = Number(token);
    const lower = command.toLowerCase();
    let shifted = value;
    if (command === command.toUpperCase()) {
      if (lower === "h") {
        shifted = value + offset.x;
      } else if (lower === "v") {
        shifted = value + offset.y;
      } else if (lower === "a") {
        const position = argumentIndex % 7;
        shifted = position === 5 ? value + offset.x : position === 6 ? value + offset.y : value;
      } else if (lower !== "z") {
        shifted = argumentIndex % 2 === 0 ? value + offset.x : value + offset.y;
      }
    }
    output.push(String(shifted));
    argumentIndex = (argumentIndex + 1) % (argumentCount[lower] || 1);
  }
  return output.join(" ");
}

function numbersOfPath(content: string): number[] {
  return (content.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? []).map(Number);
}

function commandsOfPath(content: string): string {
  return (content.match(/[a-zA-Z]/g) ?? []).join("");
}

interface DeferredDifference {
  message: string;
  attribute: string;
}

interface Context {
  differing: Set<string>;
  /** Size and position differences wait until the whole shape is compared, then count as layout-driven or as problems. */
  deferred: DeferredDifference[];
  nodeMap: Record<string, string>;
  offset: Offset;
  problems: string[];
  path: string;
}

function report(context: Context, message: string, attribute = "structure"): void {
  if (layoutAttributes.has(attribute) || attribute === "content") {
    context.deferred.push({
      message,
      attribute,
    });
    return;
  }
  context.differing.add(attribute);
  if (context.problems.length < problemLimit) {
    context.problems.push(`${context.path}: ${message}`);
  }
}

/** Equal values, allowing float noise and ids that the copy maps onto its own. */
function sameValue(
  source: unknown,
  target: unknown,
  context: Context,
  shiftKeys?: ReadonlySet<string>,
): boolean {
  if (isEmpty(source) && isEmpty(target)) {
    return true;
  }
  if (typeof source === "number" && typeof target === "number") {
    return near(source, target, valueTolerance);
  }
  if (typeof source === "string" && typeof target === "string") {
    return source === target || (uuidPattern.test(source) && context.nodeMap[source] === target);
  }
  if (Array.isArray(source) && Array.isArray(target)) {
    return (
      source.length === target.length &&
      source.every((item, index) => sameValue(item, target[index], context, shiftKeys))
    );
  }
  if (isRecord(source) && isRecord(target)) {
    const keys = new Set([
      ...Object.keys(source),
      ...Object.keys(target),
    ]);
    return [
      ...keys,
    ].every((key) => {
      if (shiftKeys?.has(key) && key.startsWith("x")) {
        return (
          typeof source[key] === "number" &&
          typeof target[key] === "number" &&
          near(target[key] - source[key], context.offset.x, positionTolerance)
        );
      }
      if (shiftKeys?.has(key) && key.startsWith("y")) {
        return (
          typeof source[key] === "number" &&
          typeof target[key] === "number" &&
          near(target[key] - source[key], context.offset.y, positionTolerance)
        );
      }
      return sameValue(source[key], target[key], context, shiftKeys);
    });
  }
  return source === target;
}

function comparePath(source: string, target: string, context: Context): boolean {
  if (commandsOfPath(source) !== commandsOfPath(target)) {
    return false;
  }
  const expected = numbersOfPath(shiftedPath(source, context.offset));
  const actual = numbersOfPath(target);
  return (
    expected.length === actual.length &&
    expected.every((value, index) => near(value, actual[index]!, positionTolerance))
  );
}

function withoutOwnBookkeeping(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }
  const { [penpairPluginDataNamespace]: _own, ...rest } = value;
  return rest;
}

function compareAttribute(
  key: string,
  source: BackendShape,
  target: BackendShape,
  context: Context,
): void {
  const before = source[key];
  const after = target[key];
  if (key === "x" || key === "y") {
    // A path has no x or y of its own; both sides say so.
    if (isEmpty(before) && isEmpty(after)) {
      return;
    }
    const shift = key === "x" ? context.offset.x : context.offset.y;
    if (
      typeof before !== "number" ||
      typeof after !== "number" ||
      !near(after - before, shift, positionTolerance)
    ) {
      report(context, `${key} is not the copy's shift of the original`, key);
    }
    return;
  }
  if (key === "selrect" || key === "points" || key === "positionData") {
    if (
      !sameValue(before, after, context, key === "positionData" ? originShiftKeys : cornerShiftKeys)
    ) {
      report(context, `${key} differs beyond the board's shift`, key);
    }
    return;
  }
  if (key === "content" && typeof before === "string" && typeof after === "string") {
    if (!comparePath(before, after, context)) {
      report(context, "path content differs beyond the board's shift", "content");
    }
    return;
  }
  if (key === "pluginData") {
    if (!sameValue(withoutOwnBookkeeping(before), withoutOwnBookkeeping(after), context)) {
      report(context, "plugin data differs", "pluginData");
    }
    return;
  }
  if (!sameValue(before, after, context)) {
    report(context, `${key} differs`, key);
  }
}

/**
 * Whether a shape's size or position is decided by an automatic layout: it, or a board above it, lays out its children,
 * or it is text that sizes itself to its content. A difference anywhere else is not something a layout explains.
 */
function layoutExplains(objects: BackendObjects, shape: BackendShape): boolean {
  if (shape.type === "text" && /^auto/.test(String(shape.growType ?? ""))) {
    return true;
  }
  for (
    let current: BackendShape | undefined = shape, steps = 0;
    current && steps < 200;
    current = typeof current.parentId === "string" ? objects[current.parentId] : undefined, steps++
  ) {
    if (current.layout) {
      return true;
    }
  }
  return false;
}

/**
 * Compares a source subtree with its copy using only the backend's stored data: same topology, same names and types,
 * and every other attribute equal, positions as one shift and ids through the node map. This includes the component
 * references and override bookkeeping that the plugin cannot observe.
 */
export function compareBackendSubtrees(
  sourceObjects: BackendObjects,
  originalRootId: string,
  targetObjects: BackendObjects,
  targetRootId: string,
): BackendComparison {
  const problems: string[] = [];
  const differing = new Set<string>();
  const layoutDriven: string[] = [];
  const nodeMap: Record<string, string> = {};
  const sourceIds = orderedIds(sourceObjects, originalRootId);
  const targetIds = orderedIds(targetObjects, targetRootId);
  if (sourceIds.length !== targetIds.length) {
    return {
      nodeMap,
      nodes: sourceIds.length,
      problems: [
        `The copy has ${targetIds.length} shapes where the original has ${sourceIds.length}`,
      ],
      differingAttributes: [
        "structure",
      ],
      layoutDriven: [],
    };
  }
  for (const [index, sourceId] of sourceIds.entries()) {
    nodeMap[sourceId] = targetIds[index]!;
  }
  const offset = offsetOf(sourceObjects[originalRootId]!, targetObjects[targetRootId]!);
  for (const sourceId of sourceIds) {
    const source = sourceObjects[sourceId]!;
    const target = targetObjects[nodeMap[sourceId]!]!;
    const context: Context = {
      differing: new Set<string>(),
      deferred: [],
      nodeMap,
      offset,
      problems,
      path: `${String(source.name)} (${source.type})`,
    };
    if (source.type !== target.type || source.name !== target.name) {
      report(context, "type or name differs");
      continue;
    }
    const mappedFrame = nodeMap[String(source.frameId)];
    if (
      childIds(source).length !== childIds(target).length ||
      (sourceId !== originalRootId && target.parentId !== nodeMap[String(source.parentId)]) ||
      (mappedFrame !== undefined && target.frameId !== mappedFrame)
    ) {
      report(context, "the copy is arranged differently");
    }
    const keys = new Set([
      ...Object.keys(source),
      ...Object.keys(target),
    ]);
    for (const key of keys) {
      if (!identityAttributes.has(key)) {
        compareAttribute(key, source, target, context);
      }
    }
    // Sizes and positions are judged now that the whole shape is compared. A path moves with its frame when a layout is
    // recomputed (its selrect or points move too); a drawing that changes on its own is a design change.
    const moved = context.deferred.some(
      (item) => item.attribute === "selrect" || item.attribute === "points",
    );
    const explained = context.deferred.length > 0 && layoutExplains(sourceObjects, source);
    let drivenByLayout = false;
    for (const item of context.deferred) {
      if (explained && (item.attribute !== "content" || moved)) {
        drivenByLayout = true;
        continue;
      }
      context.differing.add(item.attribute);
      if (problems.length < problemLimit) {
        problems.push(`${context.path}: ${item.message}`);
      }
    }
    if (drivenByLayout) {
      layoutDriven.push(sourceId);
    }
    for (const attribute of context.differing) {
      differing.add(attribute);
    }
  }
  return {
    nodeMap,
    nodes: sourceIds.length,
    problems,
    differingAttributes: [
      ...differing,
    ],
    layoutDriven,
  };
}
