import { snippet, type Snippet } from "../../../packages/core/src/snippet.js";

export function createFrameInspection(frameName: string): Snippet {
  if (!frameName.trim()) {
    throw new Error("Frame name is required");
  }

  return snippet(
    "example-frame-inspection",
    `
const matchingFrames = penpot.currentPage.children.filter((shape) => {
  return shape.type === "board" && shape.name === CFG.frameName;
});

if (matchingFrames.length !== 1) {
  return { ok: false, message: "Expected one uniquely named frame" };
}

const frame = matchingFrames[0];
return { ok: true, frameId: frame.id, frameName: frame.name };
`,
    {
      frameName,
    },
    "read",
  );
}
