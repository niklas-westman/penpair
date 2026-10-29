import { describe, expect, it } from "vitest";
import { maxSnippetBytes } from "../src/client.js";
import { assembleReleaseSnippet, releaseCoverTags } from "../src/design-releases/snippets.js";
import { compiles } from "../src/snippet.js";
import type { DesignRelease } from "../src/design-releases/types.js";

const hash = "a".repeat(64);
const member = (id: string, disposition: string) => ({
  id,
  disposition,
  source: {
    id,
    label: id,
    pageId: "p",
    frameId: id,
    inspection: {
      path: "i.json",
      sha256: hash,
    },
    contentHash: hash,
  },
});
const release = {
  schemaVersion: 2,
  kind: "design-release",
  id: "release-103",
  title: "Cover release",
  productVersion: "0.0.3",
  fileId: "file",
  status: "planned",
  sources: [],
  contracts: [
    {
      path: "j.json",
      sha256: hash,
      kind: "journey-map",
      id: "j",
    },
    {
      path: "i.json",
      sha256: hash,
      kind: "integration-map",
      id: "i",
    },
  ],
  target: {
    name: "release/0.0.3",
    ownerKey: "owner",
  },
  members: [
    member("a", "changed"),
    member("b", "retained"),
    member("c", "retained"),
  ],
} as unknown as DesignRelease;

describe("release cover", () => {
  it("derives one tag per layer from the release contents", () => {
    expect(releaseCoverTags(release).map((tag) => tag.label)).toEqual([
      "Journey map",
      "Integration map",
      "1 changed screen",
      "2 retained screens",
    ]);
  });

  it("keeps the assembly snippet valid and under the size limit with the bundled art", () => {
    const code = assembleReleaseSnippet(release).code;
    expect(compiles(code)).toBeUndefined();
    expect(Buffer.byteLength(code, "utf8")).toBeLessThan(maxSnippetBytes);
    expect(code).toContain("Release cover illustration");
  });
});
