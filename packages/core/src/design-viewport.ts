import type { BaselineCase } from "./baselines-config.js";

const designSizeTolerancePx = 0.01;

/** Penpot transforms can introduce subpixel noise; exported image dimensions remain exact. */
export function matchesDesignViewport(
  designSize: BaselineCase["viewport"] | undefined,
  viewport: BaselineCase["viewport"],
): boolean {
  return Boolean(
    designSize &&
      Number.isFinite(designSize.width) &&
      Number.isFinite(designSize.height) &&
      Math.abs(designSize.width - viewport.width) < designSizeTolerancePx &&
      Math.abs(designSize.height - viewport.height) < designSizeTolerancePx,
  );
}
