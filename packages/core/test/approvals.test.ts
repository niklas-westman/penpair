import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { describe, expect, it } from "vitest";
import {
  approvalFingerprint,
  artifactSha,
  matchingApproval,
  readApprovals,
  recordApproval,
} from "../src/approvals.js";
import type { BaselineCase } from "../src/baselines-config.js";
import type { ExportResult } from "../src/export.js";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY1cAAAAASUVORK5CYII=",
  "base64",
);
const exported: ExportResult = {
  capture: {
    fileId: "file",
    pageId: "page",
    frameId: "frame",
    revision: 1,
    scale: 1,
    activeThemes: [],
    penpotApiVersion: "test",
    renderEnvironment: "test",
    designSize: {
      width: 1,
      height: 1,
    },
  },
  png,
  stable: true,
  exports: 2,
};

const intent: BaselineCase = {
  viewport: {
    width: 1,
    height: 1,
  },
  theme: "light",
  state: "default",
  fixture: "fixture",
};

describe("owner words against exact artifact evidence", () => {
  it.each([
    1,
    1.5,
  ])("accepts subpixel geometry noise with exact evidence at scale %s", async (scale) => {
    const root = await mkdtemp(path.join(os.tmpdir(), "penpair-approval-"));
    const capturedPng = Buffer.from(png);
    capturedPng.writeUInt32BE(Math.round(scale), 16);
    capturedPng.writeUInt32BE(Math.round(scale), 20);
    const observed: ExportResult = {
      ...exported,
      png: capturedPng,
      capture: {
        ...exported.capture,
        scale,
        designSize: {
          width: 0.9999999999999,
          height: 1.0000000000001,
        },
      },
    };
    const record = await recordApproval(
      root,
      observed,
      {
        note: "I approve this exact frame (fixture)",
        by: "Fixture owner",
      },
      intent,
    );

    expect(record.capture).toEqual(observed.capture);
    expect(record.fingerprint).toBe(
      approvalFingerprint(observed.capture, artifactSha(capturedPng), intent),
    );
    expect(record.fingerprint).not.toBe(
      approvalFingerprint(
        {
          ...observed.capture,
          designSize: intent.viewport,
        },
        artifactSha(capturedPng),
        intent,
      ),
    );
    expect((await readApprovals(root)).records[0].capture).toEqual(observed.capture);
    expect(
      await matchingApproval(root, observed.capture, artifactSha(capturedPng), intent),
    ).toEqual(record);
    expect(
      await matchingApproval(
        root,
        {
          ...observed.capture,
          designSize: intent.viewport,
        },
        artifactSha(capturedPng),
        intent,
      ),
    ).toBeUndefined();
  });

  it.each([
    {
      width: 2,
      height: 1,
    },
    {
      width: 1,
      height: 2,
    },
  ])("rejects a real geometry mismatch: %j", async (designSize) => {
    const root = await mkdtemp(path.join(os.tmpdir(), "penpair-approval-"));

    await expect(
      recordApproval(
        root,
        {
          ...exported,
          capture: {
            ...exported.capture,
            designSize,
          },
        },
        {
          note: "yes (fixture)",
          by: "Fixture owner",
        },
        intent,
      ),
    ).rejects.toThrow(/case assertions/);
    expect((await readApprovals(root)).records).toEqual([]);
  });

  it.each([
    {
      scale: 1,
      widthDelta: 1,
      heightDelta: 0,
    },
    {
      scale: 1,
      widthDelta: 0,
      heightDelta: 1,
    },
    {
      scale: 1.5,
      widthDelta: 1,
      heightDelta: 0,
    },
    {
      scale: 1.5,
      widthDelta: 0,
      heightDelta: 1,
    },
  ])("rejects mismatched PNG pixels: %j", async ({ scale, widthDelta, heightDelta }) => {
    const root = await mkdtemp(path.join(os.tmpdir(), "penpair-approval-"));
    const observed: ExportResult = {
      ...exported,
      capture: {
        ...exported.capture,
        scale,
        designSize: {
          width: 1.0000000000001,
          height: 0.9999999999999,
        },
      },
    };
    const mismatchedPng = Buffer.from(png);
    mismatchedPng.writeUInt32BE(Math.round(scale) + widthDelta, 16);
    mismatchedPng.writeUInt32BE(Math.round(scale) + heightDelta, 20);

    await expect(
      recordApproval(
        root,
        {
          ...observed,
          png: mismatchedPng,
        },
        {
          note: "yes (fixture)",
          by: "Fixture owner",
        },
        intent,
      ),
    ).rejects.toThrow(/case assertions/);
    expect((await readApprovals(root)).records).toEqual([]);
  });

  it("records append-only supplied words, matches exact identity/hash and detects tampering", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "penpair-approval-"));
    const record = await recordApproval(root, exported, {
      note: "I approve this exact frame (fixture)",
      by: "Fixture owner",
    });
    expect((await readApprovals(root)).records).toHaveLength(1);
    expect(await matchingApproval(root, exported.capture, artifactSha(png))).toEqual(record);
    expect(
      await matchingApproval(
        root,
        {
          ...exported.capture,
          revision: 2,
        },
        artifactSha(png),
      ),
    ).toBeUndefined();
    const manifest = JSON.parse(await readFile(path.join(root, "design/approvals.json"), "utf8"));
    manifest.records[0].note = "changed";
    await writeFile(path.join(root, "design/approvals.json"), JSON.stringify(manifest));
    await expect(readApprovals(root)).rejects.toThrow(/hash mismatch/);
  });
  it("preserves existing evidence on empty words, unstable exports, redaction and concurrent lock", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "penpair-approval-"));
    await expect(
      recordApproval(root, exported, {
        note: " ",
        by: "owner",
      }),
    ).rejects.toThrow(/exact nonempty/);
    await expect(
      recordApproval(
        root,
        {
          ...exported,
          stable: false,
        },
        {
          note: "yes",
          by: "owner",
        },
      ),
    ).rejects.toThrow(/stable/);
    await expect(
      recordApproval(
        root,
        exported,
        {
          note: "private",
          by: "owner",
        },
        undefined,
        (s) => s.replace("private", "[redacted]"),
      ),
    ).rejects.toThrow(/redaction/);
    await recordApproval(root, exported, {
      note: "yes (fixture)",
      by: "owner",
    });
    const before = await readFile(path.join(root, "design/approvals.json"), "utf8");
    await writeFile(path.join(root, "design/approvals.json.lock"), "active");
    await expect(
      recordApproval(root, exported, {
        note: "another (fixture)",
        by: "owner",
      }),
    ).rejects.toThrow();
    expect(await readFile(path.join(root, "design/approvals.json"), "utf8")).toBe(before);
  });
});
