import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PenpotToolClient } from "../src/client.js";
import * as exports from "../src/export.js";
import * as pageSession from "../src/page-session.js";
import type { BackendFrameEvidence } from "../src/design-releases/backend-evidence.js";
import { comparePairPixels, sampledPairs } from "../src/design-releases/pixel-sample.js";

const directories: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    directories.splice(0).map((directory) =>
      rm(directory, {
        recursive: true,
        force: true,
      }),
    ),
  );
});

async function png(width: number, height: number, changedPixels = 0, delta = 0): Promise<Buffer> {
  const data = Buffer.alloc(width * height * 4, 255);
  for (let index = 0; index < changedPixels; index++) {
    data[index * 4] = 255 - delta;
  }
  return sharp(data, {
    raw: {
      width,
      height,
      channels: 4,
    },
  })
    .png()
    .toBuffer();
}

const pairs = Array.from(
  {
    length: 6,
  },
  (_unused, index) => ({
    sourceFrameId: `s${index}`,
    targetFrameId: `t${index}`,
  }),
);
const sources = pairs.map((pair, index) => ({
  frameId: pair.sourceFrameId,
  nodes: index === 3 ? 900 : 100,
})) as BackendFrameEvidence[];

describe("choosing the boards to compare by pixels", () => {
  it("compares nothing, a sample, or everything", () => {
    expect(sampledPairs("none", pairs, sources)).toEqual([]);
    expect(sampledPairs("all", pairs, sources)).toHaveLength(6);
    expect(sampledPairs("sample", pairs, sources).map((pair) => pair.sourceFrameId)).toEqual([
      "s0",
      "s5",
      "s3",
    ]);
  });

  it("compares every board when there are only a few", () => {
    expect(sampledPairs("sample", pairs.slice(0, 3), sources)).toHaveLength(3);
  });
});

describe("comparing sampled pairs", () => {
  async function run(
    render: (pageId: string, settled: boolean) => Promise<Buffer>,
    nativeVerified: boolean,
  ) {
    const root = await mkdtemp(path.join(os.tmpdir(), "penpair-pixel-sample-"));
    directories.push(root);
    vi.spyOn(pageSession, "selectPage").mockResolvedValue(undefined as never);
    let currentPage = "";
    vi.mocked(pageSession.selectPage).mockImplementation((async (
      _client: unknown,
      target: {
        id: string;
      },
    ) => {
      currentPage = target.id;
    }) as never);
    const rendered = (settled: boolean) =>
      render(currentPage, settled).then((bytes) => ({
        png: bytes,
        stable: settled,
        exports: settled ? 2 : 1,
        capture: {},
      }));
    vi.spyOn(exports, "exportShapesPngStable").mockImplementation(
      (async (
        _client: unknown,
        ids: string[],
        options: {
          singleRound?: boolean;
        },
      ) =>
        new Map(
          await Promise.all(
            ids.map(async (id) => [
              id,
              await rendered(!options.singleRound),
            ]),
          ),
        )) as never,
    );
    vi.spyOn(exports, "exportShapePng").mockImplementation((async (
      _client: unknown,
      _id: string,
      options: {
        stable?: boolean;
      },
    ) => rendered(options.stable === true)) as never);
    return comparePairPixels(
      {} as PenpotToolClient,
      root,
      {
        source: "source-page",
        target: "target-page",
      },
      pairs.slice(0, 2),
      ".penpair/native-copy/run/pixels",
      nativeVerified,
      undefined,
      async () => undefined,
    );
  }

  it("accepts identical renders without a second round", async () => {
    const result = await run(async () => png(40, 40), true);
    expect(result.problems).toEqual([]);
    expect(result.settled).toEqual([]);
    expect(result.findings.map((finding) => finding.acceptedAs)).toEqual([
      "identical",
      "identical",
    ]);
  });

  it("renders a differing pair again, and reports it when it still differs", async () => {
    const result = await run(
      async (pageId) => (pageId === "source-page" ? png(100, 100) : png(100, 100, 200, 60)),
      true,
    );
    expect(result.settled).toEqual([
      "s0",
      "s1",
    ]);
    expect(result.problems).toEqual([
      "Exported pixels differ for s0",
      "Exported pixels differ for s1",
    ]);
  });

  it("accepts a few localised pixels only when the stored data was identical", async () => {
    const differing = async (pageId: string) =>
      pageId === "source-page" ? png(100, 100) : png(100, 100, 4, 39);
    const verified = await run(differing, true);
    expect(verified.problems).toEqual([]);
    expect(verified.findings[0]!.acceptedAs).toBe("localized-with-identical-data");
    const unverified = await run(differing, false);
    expect(unverified.problems).toHaveLength(2);
  });

  it("asks again when the editor is busy while rendering", async () => {
    let calls = 0;
    const result = await run(async () => {
      if (calls++ < 3) {
        throw new Error("MCP error -32001: Request timed out");
      }
      return png(40, 40);
    }, true);
    expect(result.problems).toEqual([]);
    expect(result.findings.map((finding) => finding.acceptedAs)).toEqual([
      "identical",
      "identical",
    ]);
  });

  it("settles a pair whose first render was stale", async () => {
    let calls = 0;
    const result = await run(async (pageId) => {
      calls++;
      return pageId === "source-page" || calls > 4 ? png(60, 60) : png(60, 60, 500, 90);
    }, true);
    expect(result.settled).toHaveLength(2);
    expect(result.problems).toEqual([]);
  });
});
