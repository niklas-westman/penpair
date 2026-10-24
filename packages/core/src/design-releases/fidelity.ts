import type { InspectionCapture } from "../inspection.js";
import { observationHash } from "../journal.js";
import { inspectImageEvidence } from "../image-evidence.js";
import { hashBytes } from "./artifact-paths.js";

const requiredFields = [
  "geometry",
  "text",
  "layout",
  "component",
  "tokens",
  "style",
  "metadata",
];

interface NativeTree {
  root: Record<string, unknown>;
  ordered: Array<{
    path: string;
    node: Record<string, unknown>;
  }>;
  paths: Map<string, string>;
}

function object(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
  return value as Record<string, unknown>;
}

export function nativeTree(inspection: InspectionCapture): NativeTree {
  if (
    inspection.kind !== "shape-inspection" ||
    !inspection.complete ||
    inspection.reasons.length ||
    !Array.isArray(inspection.nodes) ||
    !inspection.nodes.length ||
    inspection.nodes.length > 20000
  ) {
    throw new Error("Native fidelity requires a complete bounded shape inspection");
  }
  const nodes = new Map<string, Record<string, unknown>>();
  for (const node of inspection.nodes) {
    if (
      typeof node.id !== "string" ||
      !node.id ||
      nodes.has(node.id) ||
      !Array.isArray(node.childIds) ||
      !Array.isArray(node.unknowns) ||
      node.unknowns.length
    ) {
      throw new Error("Unknown fields or duplicate identities block native fidelity");
    }
    for (const key of requiredFields) {
      if (!Object.hasOwn(node, key)) {
        throw new Error(`Native inspection is missing required field ${key}`);
      }
    }
    const geometry = object(node.geometry, "Native geometry is unavailable");
    for (const axis of [
      "x",
      "y",
      "width",
      "height",
      "rotation",
    ]) {
      if (typeof geometry[axis] !== "number" || !Number.isFinite(geometry[axis])) {
        throw new Error("Native geometry contains an unobservable or nonfinite field");
      }
    }
    if (
      Number(geometry.width) < 0 ||
      Number(geometry.height) < 0 ||
      typeof geometry.hidden !== "boolean" ||
      typeof geometry.blocked !== "boolean" ||
      [
        "flipX",
        "flipY",
        "proportionLock",
      ].some((key) => typeof geometry[key] !== "boolean")
    ) {
      throw new Error("Native geometry flags/dimensions are unobservable");
    }
    if (
      ![
        "board",
        "rect",
        "rectangle",
        "ellipse",
        "text",
        "path",
        "group",
      ].includes(String(node.type))
    ) {
      throw new Error("Native shape content is unsupported or unobservable");
    }
    if (node.type === "path" && (typeof node.content !== "string" || !node.content)) {
      throw new Error("Native path content fidelity is unobservable in this inspection");
    }
    const layout = object(node.layout, "Native layout is unavailable");
    if (!Object.hasOwn(layout, "showInViewMode") || !Object.hasOwn(layout, "boardSizing")) {
      throw new Error("Native board behavior observations are missing");
    }
    if (node.type === "board") {
      if (typeof layout.showInViewMode !== "boolean") {
        throw new Error("Native board viewer visibility is unobservable");
      }
      const sizing = object(layout.boardSizing, "Native board sizing is unobservable");
      for (const key of [
        "horizontalSizing",
        "verticalSizing",
      ]) {
        if (
          !Object.hasOwn(sizing, key) ||
          ![
            null,
            "auto",
            "fix",
          ].includes(sizing[key] as null | string)
        ) {
          throw new Error("Native board sizing is unsupported or unobservable");
        }
      }
    }
    const constraints = object(layout.constraints, "Native constraints observations are missing");
    const horizontal = [
      "center",
      "left",
      "right",
      "leftright",
      "scale",
      ...(node.type === "board"
        ? [
            null,
          ]
        : []),
    ];
    const vertical = [
      "center",
      "top",
      "bottom",
      "scale",
      "topbottom",
      ...(node.type === "board"
        ? [
            null,
          ]
        : []),
    ];
    if (
      !Object.hasOwn(constraints, "constraintsHorizontal") ||
      !Object.hasOwn(constraints, "constraintsVertical") ||
      !horizontal.includes(constraints.constraintsHorizontal as string | null) ||
      !vertical.includes(constraints.constraintsVertical as string | null) ||
      typeof constraints.fixedWhenScrolling !== "boolean"
    ) {
      throw new Error("Native constraints are unobservable or unsupported");
    }
    const style = object(node.style, "Native style is unavailable");
    if (!Object.hasOwn(style, "blur") || !Object.hasOwn(style, "backgroundBlur")) {
      throw new Error("Native blur observations are missing");
    }
    if (node.type === "text") {
      const text = object(node.text, "Native text is unavailable");
      const typography = object(text.typography, "Native typography is unavailable");
      if (
        !Object.hasOwn(typography, "textTransform") ||
        !Object.hasOwn(typography, "textDecoration")
      ) {
        throw new Error("Native text transform/decoration observations are missing");
      }
    }
    const component = object(node.component, "Component observations are unavailable");
    if (
      component.isComponentInstance === true ||
      component.isComponentCopyInstance === true ||
      component.isComponentMainInstance === true ||
      component.isComponentRoot === true
    ) {
      throw new Error(
        "Component override fidelity is unobservable in this inspection; native release verification is blocked",
      );
    }
    if (node.type === "group" && !Object.hasOwn(node, "maskedGroup")) {
      throw new Error("Mask fidelity is unobservable for this group");
    }
    nodes.set(node.id, node);
  }
  const roots = inspection.nodes.filter((node) => node.parentId === null);
  if (roots.length !== 1 || roots[0]?.type !== "board") {
    throw new Error("A release screen must be one native board root");
  }
  const root = roots[0];
  const ordered: NativeTree["ordered"] = [];
  const paths = new Map<string, string>();
  const visit = (
    node: Record<string, unknown>,
    currentPath: string,
    parentId: string | null,
  ): void => {
    const id = String(node.id);
    if (paths.has(id) || node.parentId !== parentId || paths.size >= 20000) {
      throw new Error("Native hierarchy is cyclic, ambiguous or inconsistent");
    }
    paths.set(id, currentPath);
    ordered.push({
      path: currentPath,
      node,
    });
    const children = node.childIds as unknown[];
    if (node.childrenTotal !== children.length) {
      throw new Error("Native hierarchy children are incomplete");
    }
    children.forEach((childId, index) => {
      if (typeof childId !== "string" || !nodes.has(childId)) {
        throw new Error("Native hierarchy has an unknown child");
      }
      const child = nodes.get(childId)!;
      if (child.index !== index) {
        throw new Error("Native child order is inconsistent");
      }
      visit(child, `${currentPath}/${index}`, id);
    });
  };
  visit(root, "root", null);
  if (paths.size !== nodes.size) {
    throw new Error("Native inspection includes detached shapes");
  }
  return {
    root,
    ordered,
    paths,
  };
}

function referenceValue(
  value: unknown,
  paths: Map<string, string>,
  remap: Record<string, string>,
): unknown {
  if (typeof value === "string") {
    const original = remap[value] ?? value;
    return paths.get(original) ?? original;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => referenceValue(entry, paths, remap));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        referenceValue(entry, paths, remap),
      ]),
    );
  }
  return value;
}

export function semanticInspection(
  inspection: InspectionCapture,
  remap: Record<string, string> = {},
): unknown {
  const tree = nativeTree(inspection);
  const rootGeometry = object(tree.root.geometry, "Root geometry is unavailable");
  const paths = new Map(
    [
      ...tree.paths.entries(),
    ].map(([id, value]) => [
      remap[id] ?? id,
      value,
    ]),
  );
  return tree.ordered.map(({ path, node }) => {
    const geometry = object(node.geometry, "Geometry is unavailable");
    const relativeGeometry = {
      ...geometry,
    };
    for (const axis of [
      "x",
      "y",
    ]) {
      if (typeof geometry[axis] !== "number" || typeof rootGeometry[axis] !== "number") {
        throw new Error("Native geometry must be finite and observable");
      }
      relativeGeometry[axis] =
        Math.round(((geometry[axis] as number) - (rootGeometry[axis] as number)) * 1e6) / 1e6;
    }
    const metadata = object(node.metadata, "Interaction observations unavailable");
    if (!Object.hasOwn(metadata, "interactions")) {
      throw new Error("Native interactions are unobservable");
    }
    return {
      path,
      type: node.type,
      children: (node.childIds as unknown[]).length,
      geometry: relativeGeometry,
      text: node.text,
      layout: node.layout,
      tokens: node.tokens,
      style: node.style,
      maskedGroup: node.maskedGroup ?? null,
      pathContent: node.type === "path" ? node.content : null,
      component: referenceValue(node.component, paths, remap),
      interactions: referenceValue(metadata.interactions, paths, remap),
    };
  });
}

export function inspectionContentHash(inspection: InspectionCapture): string {
  return observationHash(semanticInspection(inspection));
}

export function deriveNodeMap(
  source: InspectionCapture,
  target: InspectionCapture,
): Record<string, string> {
  const before = nativeTree(source);
  const after = nativeTree(target);
  if (before.ordered.length !== after.ordered.length) {
    throw new Error("Native copy changed hierarchy node count");
  }
  const entries = before.ordered.map((entry, index) => {
    const copied = after.ordered[index]!;
    if (
      entry.path !== copied.path ||
      entry.node.type !== copied.node.type ||
      entry.node.id === copied.node.id
    ) {
      throw new Error("Native copy topology/type or independent shape identity differs");
    }
    return [
      String(entry.node.id),
      String(copied.node.id),
    ];
  });
  return Object.fromEntries(entries);
}

export function compareNativeCopy(
  source: InspectionCapture,
  target: InspectionCapture,
  fullNodeMap: Record<string, string>,
): {
  sourceHash: string;
  targetHash: string;
} {
  deriveNodeMap(source, target);
  const inverse = Object.fromEntries(
    Object.entries(fullNodeMap).map(([from, to]) => [
      to,
      from,
    ]),
  );
  const sourceHash = inspectionContentHash(source);
  const targetHash = observationHash(semanticInspection(target, inverse));
  if (sourceHash !== targetHash) {
    throw new Error(
      "Native copy changed text, hierarchy, layout, geometry, tokens, images, components or interaction references",
    );
  }
  return {
    sourceHash,
    targetHash,
  };
}

export async function decodedPixels(png: Buffer): Promise<{
  hash: string;
  width: number;
  height: number;
}> {
  if (png.length > 64 * 1024 * 1024) {
    throw new Error("Release render exceeds 64-MiB input budget");
  }
  const header = inspectImageEvidence(png);
  if (header.format !== "png" || header.width * header.height > 64_000_000) {
    throw new Error("Release fidelity requires bounded PNG evidence");
  }
  const { default: sharp } = await import("sharp");
  const image = sharp(png, {
    failOn: "error",
    limitInputPixels: 64_000_000,
  });
  const metadata = await image.metadata();
  if (metadata.depth !== "uchar" || metadata.bitsPerSample === 16 || (metadata.pages ?? 1) !== 1) {
    throw new Error("Release fidelity requires a static 8-bit render");
  }
  const { data, info } = await image.ensureAlpha().raw().toBuffer({
    resolveWithObject: true,
  });
  if (info.width !== header.width || info.height !== header.height || info.channels !== 4) {
    throw new Error("Decoded render dimensions changed");
  }
  return {
    hash: hashBytes(data),
    width: info.width,
    height: info.height,
  };
}
