import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { describe, expect, it } from "vitest";
import { artifactSha, matchingApproval, readApprovals, recordApproval } from "../src/approvals.js";
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
describe("owner words against exact artifact evidence", () => {
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
