import path from "node:path";

/** One frame of a Penpot page that becomes an approved reference image. */
export interface BaselineFrame {
  /** The exact name of a top-level frame on the page. */
  frame: string;
  /** Names the image file (`<id>.png`) and the check that uses it. Lowercase letters, digits, hyphens and underscores. */
  id: string;
  /** The route in the implementation this frame is the design of. Frames without one are exported but not given a check. */
  route?: string;
}

/** What `penpair baselines` exports: the frames of one page, as images in a folder of the project. */
export interface BaselinesConfig {
  page: string;
  /** Folder for the images, relative to the project. */
  root: string;
  frames: BaselineFrame[];
  /** Allowed share of differing pixels in the generated checks (default 0.05). */
  threshold?: number;
}

const idPattern = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export function validateBaselines(value: unknown, fail: (message: string) => never): BaselinesConfig {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return fail("baselines must be an object");
  const v = value as Record<string, unknown>;
  if (typeof v.page !== "string" || v.page.length === 0) fail("baselines.page must be the name of a page");
  if (typeof v.root !== "string" || v.root.length === 0 || path.isAbsolute(v.root) || v.root.split(/[\\/]/).includes("..")) fail("baselines.root must be a relative folder that stays inside the project");
  if (!Array.isArray(v.frames) || v.frames.length === 0) fail("baselines.frames must list at least one frame");
  const seen = new Set<string>();
  for (const entry of v.frames as unknown[]) {
    const f = entry as Record<string, unknown>;
    if (typeof f !== "object" || f === null) fail("every entry in baselines.frames must be an object");
    if (typeof f.frame !== "string" || f.frame.length === 0) fail("every baselines.frames entry needs a frame name");
    if (typeof f.id !== "string" || !idPattern.test(f.id)) fail(`baselines.frames id ${JSON.stringify(f.id)} must be lowercase letters, digits, hyphens or underscores`);
    if (seen.has(f.id as string)) fail(`baselines.frames id ${JSON.stringify(f.id)} is used twice`);
    seen.add(f.id as string);
    if (f.route !== undefined && (typeof f.route !== "string" || f.route.length === 0)) fail("baselines.frames route must be a non-empty string");
  }
  if (v.threshold !== undefined && (typeof v.threshold !== "number" || v.threshold < 0 || v.threshold > 1)) fail("baselines.threshold must be a number from 0 to 1");
  return v as unknown as BaselinesConfig;
}
