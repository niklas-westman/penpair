import type { BrowserCaptureMetadata, ImplementationCase } from "./types.js";

function hasValidGeometry(
  capture: BrowserCaptureMetadata,
  implementationCase: ImplementationCase,
): boolean {
  const rootBox = capture.rootBox;
  const clip = capture.clip;

  if (!rootBox || !clip) {
    return false;
  }

  if (
    ![
      rootBox.x,
      rootBox.y,
      rootBox.width,
      rootBox.height,
      clip.x,
      clip.y,
      clip.width,
      clip.height,
    ].every(Number.isFinite)
  ) {
    return false;
  }

  return (
    rootBox.x >= 0 &&
    rootBox.y >= 0 &&
    rootBox.width > 0 &&
    rootBox.height > 0 &&
    clip.x === Math.floor(rootBox.x) &&
    clip.y === Math.floor(rootBox.y) &&
    clip.width === Math.ceil(rootBox.x + rootBox.width) - clip.x &&
    clip.height === Math.ceil(rootBox.y + rootBox.height) - clip.y &&
    clip.width === implementationCase.intent.viewport.width &&
    clip.height === implementationCase.intent.viewport.height
  );
}

function hasStableUnobstructedLayout(capture: BrowserCaptureMetadata): boolean {
  const pointer = capture.pointer;
  const scroll = capture.scroll;
  const occlusion = capture.occlusion;

  return (
    pointer?.outsideRoot === true &&
    pointer.hoveredControls === 0 &&
    Number.isFinite(pointer.x) &&
    Number.isFinite(pointer.y) &&
    Boolean(scroll) &&
    [
      scroll.x,
      scroll.y,
    ].every(Number.isFinite) &&
    Number.isInteger(capture.layoutSamples) &&
    capture.layoutSamples >= 3 &&
    (!occlusion ||
      (Number.isInteger(occlusion.samples) && occlusion.samples >= 1 && occlusion.blocked === 0))
  );
}

function hasLoadedFonts(capture: BrowserCaptureMetadata, expectedFonts: string[]): boolean {
  return (
    Array.isArray(capture.fonts) &&
    capture.fonts.every((font) =>
      Boolean(font.family && font.weight && font.style && font.status === "loaded"),
    ) &&
    expectedFonts.every((expectedFont) =>
      capture.fonts.some((font) => font.family === expectedFont),
    )
  );
}

export function validateCaptureMetadata(
  capture: BrowserCaptureMetadata,
  implementationCase: ImplementationCase,
): void {
  if (
    capture.schemaVersion !== 1 ||
    !capture.root ||
    capture.rounding !== "outward-css-pixels" ||
    capture.deviceScaleFactor !== implementationCase.baseline.scale ||
    !capture.browser?.name ||
    !capture.browser.version ||
    !hasValidGeometry(capture, implementationCase) ||
    !hasStableUnobstructedLayout(capture) ||
    !hasLoadedFonts(capture, implementationCase.intent.fonts ?? [])
  ) {
    throw new Error("Invalid browser capture geometry, font or pointer evidence");
  }
}
