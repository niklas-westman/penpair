import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { artifactSha, recordApproval } from "../src/approvals.js";
import { matchingBaselineReference, validateBaselineReference } from "../src/baseline-reference.js";
import type { ArtifactProvenance, BaselineResult } from "../src/baselines.js";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY1cAAAAASUVORK5CYII=",
  "base64",
);
const capture = {
  fileId: "file",
  pageId: "old-id",
  frameId: "frame",
  revision: 1,
  scale: 1,
  penpotApiVersion: "test",
  renderEnvironment: "test",
  activeThemes: [],
  activeThemeIds: [],
  designSize: {
    width: 1,
    height: 1,
  },
};
const frame = {
  id: "login",
  page: "old",
  route: "/login",
};
const config = {
  page: "new",
  root: "baselines",
  frames: [
    frame,
  ],
};

async function fixture(ownerWords: boolean): Promise<{
  root: string;
  result: BaselineResult;
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), "approval-continuity-"));
  await mkdir(path.join(root, "baselines"));
  await writeFile(path.join(root, "baselines/login.png"), png);
  const record = ownerWords
    ? await recordApproval(
        root,
        {
          png,
          capture,
          stable: true,
          exports: 2,
        },
        {
          by: "Owner",
          note: "Approved this exact Login design",
        },
      )
    : undefined;
  const approved: ArtifactProvenance = {
    ...capture,
    sha256: artifactSha(png),
    file: "login.png",
    capturedAt: "2026-10-28T00:00:00Z",
    toolVersion: "0.8.1",
    ...(record
      ? {
          approval: {
            kind: "owner-words" as const,
            id: record.id,
            recordHash: record.hash,
          },
        }
      : {}),
  };
  return {
    root,
    result: {
      id: "login",
      frame: "Login",
      frameId: "frame",
      file: "login.png",
      status: "same",
      written: false,
      sha256: approved.sha256,
      approved,
      captured: {
        ...approved,
        revision: 2,
      },
      source: {
        page: "old",
        pageId: "old-id",
        fileId: "file",
        frameId: "frame",
        route: "/login",
      },
    },
  };
}

describe("verified historical approval continuity", () => {
  it("accepts unchanged sources at later revisions only after original owner evidence is read", async () => {
    const { root, result } = await fixture(true);
    expect(matchingBaselineReference(config, frame, result)).toBeUndefined();
    expect(await validateBaselineReference(root, config, frame, result)).toBe(result.approved);
    expect(result.approved).toMatchObject({
      revision: 1,
    });
  });

  it("rejects unapproved references, route retargeting and unknown environments", async () => {
    const unapproved = await fixture(false);
    expect(
      await validateBaselineReference(unapproved.root, config, frame, unapproved.result),
    ).toBeUndefined();
    const { root, result } = await fixture(true);
    expect(
      await validateBaselineReference(
        root,
        config,
        {
          ...frame,
          route: "/other",
        },
        result,
      ),
    ).toBeUndefined();
    result.captured!.renderEnvironment = null;
    expect(await validateBaselineReference(root, config, frame, result)).toBeUndefined();
  });

  it("rejects a forged owner link and altered approved bytes", async () => {
    const { root, result } = await fixture(true);
    if (
      result.approved &&
      "approval" in result.approved &&
      result.approved.approval?.kind === "owner-words"
    ) {
      result.approved.approval.recordHash = "0".repeat(64);
    }
    expect(await validateBaselineReference(root, config, frame, result)).toBeUndefined();
    await writeFile(path.join(root, "baselines/login.png"), "changed");
    await expect(validateBaselineReference(root, config, frame, result)).rejects.toThrow(
      /bytes changed/,
    );
  });
});
