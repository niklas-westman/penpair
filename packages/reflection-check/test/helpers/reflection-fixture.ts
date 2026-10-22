import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import type { ArtifactProvenance, BaselineResult, BaselinesConfig } from "@penpair/core";
import type { ProviderEvidence } from "../../src/index.js";

export const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY1cAAAAASUVORK5CYII=",
  "base64",
);
export const hash = createHash("sha256").update(png).digest("hex");
export const intent = {
  viewport: {
    width: 1,
    height: 1,
  },
  theme: "dark",
  state: "empty",
  fixture: "no-items",
  fonts: [
    "Test Sans",
  ],
};
export const config: BaselinesConfig = {
  page: "Dashboard",
  root: "design",
  frames: [
    {
      id: "empty",
      frame: "Empty",
      route: "/dashboard",
      case: intent,
    },
  ],
};
export const provenance: ArtifactProvenance = {
  fileId: "file",
  pageId: "page",
  frameId: "frame",
  revision: 1,
  scale: 1,
  activeThemes: [],
  penpotApiVersion: "test",
  renderEnvironment: "test",
  sha256: hash,
  file: "empty.png",
  capturedAt: "2026-10-21T00:00:00Z",
  toolVersion: "0.1.3",
  case: intent,
};
export const results: BaselineResult[] = [
  {
    id: "empty",
    frame: "Empty",
    frameId: "frame",
    file: "empty.png",
    status: "same",
    written: false,
    approved: provenance,
    captured: provenance,
    imageWidth: 1,
    imageHeight: 1,
  },
];
export const mapping = {
  schemaVersion: 1 as const,
  cases: [
    {
      id: "empty",
      setup: "dark-empty",
    },
  ],
};
export const evidence: ProviderEvidence = {
  schemaVersion: 1,
  id: "empty",
  route: "/dashboard",
  setup: "dark-empty",
  observed: {
    viewport: intent.viewport,
    theme: intent.theme,
    state: intent.state,
    fixture: intent.fixture,
  },
  fonts: intent.fonts,
  fontsReady: true,
  baselineHash: hash,
  screenshot: "implementation.png",
  diffPixelRatio: 0,
  provider: {
    name: "offline-stub",
    version: "1",
  },
};
export async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "penpair-reflection-"));
  await mkdir(path.join(root, "design"));
  await writeFile(path.join(root, "design/empty.png"), png);
  await writeFile(path.join(root, "implementation.png"), png);
  return root;
}
