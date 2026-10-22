import { validateDesignInspection } from "./design-spec.js";
import type { InspectionDocument } from "./inspection.js";
import { observationHash } from "./journal.js";
export interface AuditRules {
  contrast?: boolean;
  library?: boolean;
  touchTargets?: boolean;
  names?: boolean;
  blankText?: boolean;
  interactiveIds?: string[];
  allowBlank?: string[];
  nameSegments?: number;
  suppressions?: Array<{
    rule: string;
    nodeId: string;
    reason: string;
  }>;
}
export interface AuditFinding {
  rule: string;
  nodeId: string;
  severity: "warning" | "info";
  state: "finding" | "unknown";
  detail: string;
  evidence?: unknown;
  suppression?: string;
}
export function validateAuditRules(raw: unknown): AuditRules {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("audit must be an object");
  }
  const v = raw as AuditRules;
  const keys = [
    "contrast",
    "library",
    "touchTargets",
    "names",
    "blankText",
    "interactiveIds",
    "allowBlank",
    "nameSegments",
    "suppressions",
  ];
  if (Object.keys(v).some((k) => !keys.includes(k))) {
    throw new Error("Unknown audit setting");
  }
  for (const key of [
    "contrast",
    "library",
    "touchTargets",
    "names",
    "blankText",
  ] as const) {
    if (v[key] !== undefined && typeof v[key] !== "boolean") {
      throw new Error("Audit rule toggles must be booleans");
    }
  }
  for (const entries of [
    v.interactiveIds,
    v.allowBlank,
  ]) {
    if (
      entries !== undefined &&
      (!Array.isArray(entries) ||
        entries.length > 1000 ||
        entries.some((s) => typeof s !== "string" || !s || s.length > 200))
    ) {
      throw new Error("Audit ID lists must have at most 1000 explicit IDs");
    }
  }
  if (
    v.nameSegments !== undefined &&
    (!Number.isInteger(v.nameSegments) || v.nameSegments < 1 || v.nameSegments > 10)
  ) {
    throw new Error("Audit nameSegments must be 1–10");
  }
  if (
    v.suppressions !== undefined &&
    (!Array.isArray(v.suppressions) ||
      v.suppressions.length > 1000 ||
      v.suppressions.some(
        (s) =>
          !s ||
          ![
            "contrast",
            "library",
            "touch-target",
            "names",
            "blank-text",
          ].includes(s.rule) ||
          typeof s.nodeId !== "string" ||
          !s.nodeId ||
          typeof s.reason !== "string" ||
          !s.reason.trim() ||
          s.reason.length > 1000,
      ))
  ) {
    throw new Error("Audit suppressions require exact rule/node ID and reason");
  }
  return structuredClone(v);
}
/** Opaque sRGB subset only. Alpha/multiple paints/images require a richer compositing model. */
export function opaqueRgb(raw: unknown): number[] | undefined {
  if (typeof raw !== "string") {
    return;
  }
  const match = /^#([a-f0-9]{6})(ff)?$/i.exec(raw);
  if (!match) {
    return;
  }
  return [
    0,
    2,
    4,
  ].map((i) => parseInt(match[1]!.slice(i, i + 2), 16) / 255);
}
export function contrastRatio(a: number[], b: number[]): number {
  const luminance = (rgb: number[]) =>
    rgb
      .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
      .reduce(
        (n, c, i) =>
          n +
          c *
            [
              0.2126,
              0.7152,
              0.0722,
            ][i]!,
        0,
      );
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
function resolvedColors(
  tokens: InspectionDocument | undefined,
  shapes: InspectionDocument,
): Map<string, number[]> {
  const result = new Map<string, number[]>();
  if (
    !tokens ||
    tokens.schemaVersion !== 1 ||
    tokens.kind !== "token-inspection" ||
    tokens.complete !== true ||
    tokens.redacted === true ||
    tokens.fileId !== shapes.fileId ||
    tokens.revision !== shapes.revision ||
    !Array.isArray(tokens.sets)
  ) {
    return result;
  }
  for (const set of [
    ...tokens.sets,
  ].sort((a, b) => Number(a.order) - Number(b.order))) {
    if (set.active !== true || !Array.isArray(set.tokens)) {
      continue;
    }
    for (const token of set.tokens as Array<Record<string, unknown>>) {
      if (typeof token.name !== "string") {
        continue;
      }
      result.delete(token.name);
      if (
        token.type === "color" &&
        (!Array.isArray(token.unknowns) ||
          !token.unknowns.some((k) => k === "resolvedValue" || k === "type"))
      ) {
        const rgb = opaqueRgb(token.resolvedValue);
        if (rgb) {
          result.set(token.name, rgb);
        }
      }
    }
  }
  return result;
}
export function auditDesignRules(
  raw: InspectionDocument,
  rawRules: AuditRules,
  tokenInspection?: InspectionDocument,
  limit = 1000,
) {
  const source = validateDesignInspection(raw);
  const rules = validateAuditRules(rawRules);
  if (!Number.isInteger(limit) || limit < 1 || limit > 10000) {
    throw new Error("Audit finding limit must be 1–10000");
  }
  const findings: AuditFinding[] = [];
  let totalFindings = 0;
  let suppressed = 0;
  let contrastMeasured = 0;
  let contrastUnknown = 0;
  let copies = 0;
  let knownComponents = 0;
  let unknownComponents = 0;
  const rows = new Map(
    source.nodes.map((n) => [
      String(n.id),
      n,
    ]),
  );
  const colors = resolvedColors(tokenInspection, source);
  const add = (finding: AuditFinding) => {
    totalFindings++;
    const suppression = rules.suppressions?.find(
      (s) => s.rule === finding.rule && s.nodeId === finding.nodeId,
    );
    if (suppression) {
      suppressed++;
    }
    if (findings.length < limit) {
      findings.push({
        ...finding,
        ...(suppression
          ? {
              suppression: suppression.reason,
            }
          : {}),
      });
    }
  };
  const paint = (
    node: Record<string, unknown>,
  ): {
    rgb?: number[];
    absent?: boolean;
    reason?: string;
  } => {
    const style = node.style as Record<string, unknown> | null;
    const bindings = node.tokens as Record<string, unknown> | null;
    if (
      !style ||
      (style.opacity !== 1 && style.opacity !== undefined) ||
      (style.blendMode !== "normal" && style.blendMode !== undefined)
    ) {
      return {
        reason: "Unknown/transparent/blended node style",
      };
    }
    const fills = style.fills;
    if (!Array.isArray(fills)) {
      return {
        reason: "Fill observation unavailable",
      };
    }
    if (!fills.length) {
      return {
        absent: true,
      };
    }
    if (fills.length !== 1 || !fills[0] || typeof fills[0] !== "object") {
      return {
        reason: "Multiple or unsupported paints",
      };
    }
    const fill = fills[0] as Record<string, unknown>;
    if (
      (fill.fillOpacity !== undefined && fill.fillOpacity !== 1) ||
      fill.fillColorGradient ||
      fill.fillImage ||
      (fill.fillType && fill.fillType !== "solid")
    ) {
      return {
        reason: "Gradient/image/alpha paint",
      };
    }
    const name = bindings?.fill;
    if (typeof name !== "string" || !colors.has(name)) {
      return {
        reason: "No independently resolved opaque bound color",
      };
    }
    const actual = opaqueRgb(fill.fillColor);
    if (!actual || observationHash(actual) !== observationHash(colors.get(name))) {
      return {
        reason: "Observed paint differs from resolved bound color",
      };
    }
    return {
      rgb: colors.get(name),
    };
  };
  const backgroundCache = new Map<string, ReturnType<typeof paint>>();
  const backgroundFor = (parent: unknown): ReturnType<typeof paint> => {
    const visited: string[] = [];
    let result: ReturnType<typeof paint> = {
      reason: "No opaque ancestor background",
    };
    while (typeof parent === "string") {
      if (backgroundCache.has(parent)) {
        result = backgroundCache.get(parent)!;
        break;
      }
      const ancestor = rows.get(parent)!;
      result = paint(ancestor);
      visited.push(parent);
      if (!result.absent) {
        break;
      }
      parent = ancestor.parentId;
    }
    if (result.absent) {
      result = {
        reason: "No opaque ancestor background",
      };
    }
    for (const id of visited) {
      backgroundCache.set(id, result);
    }
    return result;
  };
  const rootId = source.nodes.find((n) => n.parentId === null)?.id;
  const largest: Array<{
    id: string;
    area: number;
  }> = [];
  const considered = source.nodes.filter(
    (n) =>
      n.parentId !== null &&
      (
        n.geometry as
          | {
              hidden?: unknown;
            }
          | undefined
      )?.hidden !== true,
  );
  for (const node of considered) {
    const id = String(node.id);
    const geometry = node.geometry as Record<string, unknown> | undefined;
    if (rules.names) {
      if (
        [
          "Board",
          "Rectangle",
          "Group",
        ].includes(String(node.name))
      ) {
        add({
          rule: "names",
          nodeId: id,
          severity: "info",
          state: "finding",
          detail: "Default layer name",
        });
      }
      if (
        node.type === "board" &&
        node.parentId === rootId &&
        (String(node.name).split("/").length !== (rules.nameSegments ?? 3) ||
          String(node.name)
            .split("/")
            .some((s) => !s.trim()))
      ) {
        add({
          rule: "names",
          nodeId: id,
          severity: "info",
          state: "finding",
          detail: "Frame name differs from declared slash-separated page/state/device convention",
        });
      }
    }
    if (rules.blankText && node.type === "text" && !rules.allowBlank?.includes(id)) {
      const text = (
        node.text as {
          characters?: unknown;
        } | null
      )?.characters;
      if (typeof text !== "string") {
        add({
          rule: "blank-text",
          nodeId: id,
          severity: "info",
          state: "unknown",
          detail: "Text not observed",
        });
      } else if (!text.trim() || /^(?:lorem ipsum|placeholder|todo)(?:\b|$)/i.test(text.trim())) {
        add({
          rule: "blank-text",
          nodeId: id,
          severity: "info",
          state: "finding",
          detail: "Blank or placeholder text",
        });
      }
    }
    if (rules.library) {
      const component = node.component as Record<string, unknown> | null;
      if (typeof component?.isComponentCopyInstance !== "boolean") {
        unknownComponents++;
      } else {
        knownComponents++;
        if (component.isComponentCopyInstance) {
          copies++;
        } else if (
          [
            "board",
            "group",
          ].includes(String(node.type)) &&
          typeof geometry?.width === "number" &&
          typeof geometry?.height === "number"
        ) {
          largest.push({
            id,
            area: geometry.width * geometry.height,
          });
        }
      }
    }
    if (rules.contrast && node.type === "text") {
      let foreground = paint(node);
      const background = backgroundFor(node.parentId);
      const unknowns = node.unknowns as string[] | undefined;
      if (unknowns?.includes("text.mixedRangeStyles")) {
        foreground = {
          reason: "Mixed text range styles",
        };
      }
      if (!foreground.rgb || !background.rgb) {
        contrastUnknown++;
        add({
          rule: "contrast",
          nodeId: id,
          severity: "info",
          state: "unknown",
          detail: foreground.reason ?? background.reason ?? "Opaque bound colors unavailable",
        });
      } else {
        contrastMeasured++;
        const typography = (
          node.text as {
            typography?: Record<string, unknown>;
          } | null
        )?.typography;
        const size = Number(typography?.fontSize);
        const weight = Number(typography?.fontWeight);
        const threshold =
          Number.isFinite(size) && (size >= 24 || (size >= 56 / 3 && weight >= 700)) ? 3 : 4.5;
        const ratio = contrastRatio(foreground.rgb, background.rgb);
        if (ratio < threshold) {
          add({
            rule: "contrast",
            nodeId: id,
            severity: "warning",
            state: "finding",
            detail: "Observed opaque text/background contrast below the review threshold",
            evidence: {
              ratio,
              threshold,
              assumption:
                "Design units treated as CSS px; exceptions and implementation rendering unassessed",
            },
          });
        }
      }
    }
  }
  if (rules.touchTargets) {
    for (const id of rules.interactiveIds ?? []) {
      const node = rows.get(id);
      const g = node?.geometry as Record<string, unknown> | undefined;
      if (
        !node ||
        typeof g?.width !== "number" ||
        typeof g.height !== "number" ||
        !Number.isFinite(g.width) ||
        !Number.isFinite(g.height) ||
        g.width < 0 ||
        g.height < 0
      ) {
        add({
          rule: "touch-target",
          nodeId: id,
          severity: "info",
          state: "unknown",
          detail: "Explicit interactive target dimensions unavailable",
        });
      } else if (g.width < 44 || g.height < 44) {
        add({
          rule: "touch-target",
          nodeId: id,
          severity: g.width < 24 || g.height < 24 ? "warning" : "info",
          state: "finding",
          detail:
            g.width < 24 || g.height < 24
              ? "Below 24-unit size signal"
              : "Below 44-unit preference",
          evidence: {
            width: g.width,
            height: g.height,
            assessment:
              "size-signal-only; spacing, exceptions, input semantics and CSS scale unassessed",
          },
        });
      }
    }
  }
  largest.sort((a, b) => b.area - a.area || a.id.localeCompare(b.id));
  return {
    schemaVersion: 1,
    kind: "design-audit",
    source: {
      fileId: source.fileId,
      pageId: source.pageId,
      revision: source.revision,
      hash: observationHash(source.nodes),
    },
    advisory: true,
    accessibilityCompliance: "not-assessed",
    complete: totalFindings <= limit,
    totalFindings,
    suppressed,
    findings,
    contrast: {
      measured: contrastMeasured,
      unknown: contrastUnknown,
    },
    library: rules.library
      ? {
          instances: copies,
          knownNodes: knownComponents,
          unknownNodes: unknownComponents,
          shareOfKnown: knownComponents ? copies / knownComponents : null,
          largestPrimitiveGroups: largest.slice(0, 10),
        }
      : null,
    assumptions: [
      "Complete captured subtree only; hidden ancestors and overlapping/composited paints need independent review.",
      "Interactive IDs are explicit declarations, not inferred clickability or WCAG compliance.",
      "Unavailable resolved colors and mixed styles remain unknown; rules never mutate or block by default.",
    ],
  };
}
