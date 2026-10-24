import path from "node:path";

/** Declared design intent. It does not switch themes or establish browser behavior. */
export interface BaselineCase {
  viewport: {
    width: number;
    height: number;
  };
  theme: string;
  state: string;
  fixture: string;
  fonts?: string[];
  /** Optional exact active native theme IDs expected during capture. */
  activeThemeIds?: string[];
}
export interface CoverageRequirement
  extends Pick<BaselineCase, "viewport" | "theme" | "state" | "fixture"> {
  route: string;
}
export interface CoverageConfig {
  required: CoverageRequirement[];
  unsupported?: (CoverageRequirement & {
    reason: string;
  })[];
}

/** One frame of a Penpot page that becomes an approved reference image. */
export interface BaselineFrame {
  /** Exact top-level frame name, or an expected name when frameId is supplied. */
  frame?: string;
  /** Stable board UUID, resolved at any depth on the configured page. */
  frameId?: string;
  /** Names the image file (`<id>.png`) and the check that uses it. Lowercase letters, digits, hyphens and underscores. */
  id: string;
  /** The route in the implementation this frame is the design of. Frames without one are exported but not given a check. */
  route?: string;
  case?: BaselineCase;
}

/** What `penpair baselines` exports: the frames of one page, as images in a folder of the project. */
export interface BaselinesConfig {
  page: string;
  /** Folder for the images, relative to the project. */
  root: string;
  frames: BaselineFrame[];
  /** Allowed share of differing pixels in the generated checks (default 0.05). */
  threshold?: number;
  coverage?: CoverageConfig;
}

const frameIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const idPattern = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export function validateBaselines(
  value: unknown,
  fail: (message: string) => never,
): BaselinesConfig {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail("baselines must be an object");
  }
  const v = value as Record<string, unknown>;
  if (typeof v.page !== "string" || v.page.length === 0) {
    fail("baselines.page must be the name of a page");
  }
  if (
    typeof v.root !== "string" ||
    v.root.length === 0 ||
    path.isAbsolute(v.root) ||
    v.root.split(/[\\/]/).includes("..")
  ) {
    fail("baselines.root must be a relative folder that stays inside the project");
  }
  if (!Array.isArray(v.frames) || v.frames.length === 0 || v.frames.length > 1000) {
    fail("baselines.frames must list at least one frame, at most 1000");
  }
  const seen = new Set<string>();
  const seenFrameIds = new Set<string>();
  for (const entry of v.frames as unknown[]) {
    const f = entry as Record<string, unknown>;
    if (typeof f !== "object" || f === null) {
      fail("every entry in baselines.frames must be an object");
    }
    if (f.frame === undefined && f.frameId === undefined) {
      fail("every baselines.frames entry needs frame or frameId");
    }
    if (f.frame !== undefined && (typeof f.frame !== "string" || f.frame.length === 0)) {
      fail("baselines.frames frame must be a non-empty name");
    }
    if (f.frameId !== undefined) {
      if (typeof f.frameId !== "string" || !frameIdPattern.test(f.frameId)) {
        fail("baselines.frames frameId must be a UUID");
      }
      const frameId = (f.frameId as string).toLowerCase();
      if (seenFrameIds.has(frameId)) {
        fail(`baselines.frames frameId ${JSON.stringify(f.frameId)} is used twice`);
      }
      seenFrameIds.add(frameId);
    }
    if (typeof f.id !== "string" || !idPattern.test(f.id)) {
      fail(
        `baselines.frames id ${JSON.stringify(f.id)} must be lowercase letters, digits, hyphens or underscores`,
      );
    }
    if (seen.has(f.id as string)) {
      fail(`baselines.frames id ${JSON.stringify(f.id)} is used twice`);
    }
    seen.add(f.id as string);
    if (f.case !== undefined) {
      validateBaselineCase(f.case, fail);
      if (typeof f.route !== "string" || !f.route) {
        fail("baseline case metadata requires an implementation route");
      }
    }
    if (f.route !== undefined && (typeof f.route !== "string" || f.route.length === 0)) {
      fail("baselines.frames route must be a non-empty string");
    }
  }
  if (v.coverage !== undefined) {
    const coverage = v.coverage as CoverageConfig;
    if (
      !coverage ||
      typeof coverage !== "object" ||
      Array.isArray(coverage) ||
      !Array.isArray(coverage.required) ||
      !coverage.required.length ||
      coverage.required.length > 1000 ||
      (coverage.unsupported !== undefined &&
        (!Array.isArray(coverage.unsupported) || coverage.unsupported.length > 1000))
    ) {
      fail("baselines.coverage needs 1–1000 required cases and bounded unsupported cases");
    }
    const required = new Set<string>();
    const key = (value: CoverageRequirement) =>
      JSON.stringify([
        value.route,
        value.viewport.width,
        value.viewport.height,
        value.theme,
        value.state,
        value.fixture,
      ]);
    for (const value of coverage.required) {
      validateBaselineCase(value, fail, [
        "route",
      ]);
      if (typeof value.route !== "string" || !value.route) {
        fail("coverage cases need a route");
      }
      if (required.has(key(value))) {
        fail("Duplicate required coverage case");
      }
      required.add(key(value));
    }
    const unsupported = new Set<string>();
    for (const value of coverage.unsupported ?? []) {
      validateBaselineCase(value, fail, [
        "route",
        "reason",
      ]);
      if (
        typeof value.route !== "string" ||
        !value.route ||
        typeof value.reason !== "string" ||
        !value.reason.trim()
      ) {
        fail("unsupported cases need route and reason");
      }
      if (!required.has(key(value)) || unsupported.has(key(value))) {
        fail("unsupported cases must uniquely reference required cases");
      }
      unsupported.add(key(value));
    }
  }
  if (
    v.threshold !== undefined &&
    (typeof v.threshold !== "number" ||
      !Number.isFinite(v.threshold) ||
      v.threshold < 0 ||
      v.threshold > 1)
  ) {
    fail("baselines.threshold must be a number from 0 to 1");
  }
  return v as unknown as BaselinesConfig;
}

export function validateBaselineCase(
  value: unknown,
  fail: (message: string) => never,
  extraKeys: string[] = [],
): BaselineCase {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fail("baseline case must be an object");
  }
  const entry = value as BaselineCase;
  const allowed = new Set([
    "viewport",
    "theme",
    "state",
    "fixture",
    ...(extraKeys.length
      ? []
      : [
          "fonts",
          "activeThemeIds",
        ]),
    ...extraKeys,
  ]);
  if (Object.keys(entry).some((key) => !allowed.has(key))) {
    fail("Unknown baseline case field; capture constraints belong on frame cases");
  }
  if (
    entry.viewport &&
    Object.keys(entry.viewport).some(
      (key) =>
        ![
          "width",
          "height",
        ].includes(key),
    )
  ) {
    fail("Viewport accepts width and height only");
  }
  for (const key of [
    "theme",
    "state",
    "fixture",
  ] as const) {
    if (
      typeof entry[key] !== "string" ||
      !entry[key].trim() ||
      entry[key].length > 200 ||
      /[\x00-\x1f]/.test(entry[key])
    ) {
      fail(`baseline case ${key} needs a short explicit label`);
    }
  }
  for (const key of [
    "width",
    "height",
  ] as const) {
    if (
      !entry.viewport ||
      !Number.isInteger(entry.viewport[key]) ||
      entry.viewport[key] < 1 ||
      entry.viewport[key] > 16384
    ) {
      fail("baseline case viewport dimensions must be integers from 1 to 16384");
    }
  }
  for (const key of [
    "fonts",
    "activeThemeIds",
  ] as const) {
    if (
      entry[key] !== undefined &&
      (!Array.isArray(entry[key]) ||
        entry[key]!.length > 100 ||
        entry[key]!.some((value) => typeof value !== "string" || !value.trim()) ||
        new Set(entry[key]).size !== entry[key]!.length)
    ) {
      fail(`baseline case ${key} must contain at most 100 unique nonempty strings`);
    }
  }
  return entry;
}
