import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { assessReleaseImplementation } from "../src/design-releases/implementation-status.js";
import type { DesignRelease, ReleaseArtifactRef } from "../src/design-releases/types.js";

const roots: string[] = [];
const hash = "a".repeat(64);
const sha = (bytes: string | Buffer): string => createHash("sha256").update(bytes).digest("hex");

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) =>
      rm(root, {
        recursive: true,
        force: true,
      }),
    ),
  );
});

async function fixture(): Promise<{
  root: string;
  release: DesignRelease;
  report: Record<string, unknown>;
  save(value: unknown, name?: string): Promise<ReleaseArtifactRef>;
}> {
  const root = await mkdtemp(path.join(tmpdir(), "release-implementation-"));
  roots.push(root);
  const screenshot = Buffer.from("screenshot evidence");
  await writeFile(path.join(root, "capture.png"), screenshot);
  const artifact = {
    path: "approval.json",
    sha256: hash,
  };
  const intent = {
    viewport: {
      width: 100,
      height: 100,
    },
    theme: "light",
    state: "empty",
    fixture: "default",
  };
  const release: DesignRelease = {
    schemaVersion: 2,
    kind: "design-release",
    id: "release-101",
    title: "Release",
    productVersion: "1.0.1",
    fileId: "file",
    status: "final",
    sources: [],
    contracts: [],
    target: {
      name: "release/1.0.1",
      ownerKey: "owner",
    },
    receipts: [],
    maps: [],
    reviews: [],
    implementation: {
      status: "not-assessed",
      evidence: [],
    },
    createdAt: "2026-10-29T00:00:00Z",
    members: [
      {
        id: "login",
        disposition: "retained",
        source: {
          id: "login",
          label: "Login",
          pageId: "old-page",
          frameId: "login-frame",
          inspection: artifact,
          contentHash: hash,
        },
        route: "/login",
        case: intent,
        comparisonThreshold: 0.05,
        approval: {
          record: artifact,
          recordId: "owner-approval",
          image: {
            path: "approved.webp",
            sha256: hash,
          },
        },
      },
    ],
  };
  const report = {
    schemaVersion: 1,
    kind: "implementation-case-evidence",
    complete: true,
    pending: [],
    release: {
      designHash: hash,
      caseIds: [
        "login",
      ],
    },
    cases: [
      {
        id: "login",
        complete: true,
        withinThreshold: true,
        threshold: 0.05,
        screenshotHash: sha(screenshot),
        evidence: {
          id: "login",
          route: "/login",
          observed: intent,
          fonts: [],
          fontsReady: true,
          baselineHash: hash,
          diffPixelRatio: 0,
          screenshot: "capture.png",
        },
      },
    ],
  };
  return {
    root,
    release,
    report,
    async save(value, name = "report.json") {
      const encoded = JSON.stringify(value);
      await writeFile(path.join(root, name), encoded);
      return {
        path: name,
        sha256: sha(encoded),
      };
    },
  };
}

it("assesses exact complete evidence without promoting owner acceptance", async () => {
  const { root, release, report, save } = await fixture();
  expect(await assessReleaseImplementation(root, release, hash, await save(report))).toMatchObject({
    complete: true,
    comparison: "passed",
    ownerAcceptance: "not-recorded",
  });
});

it.each([
  "baselineHash",
  "route",
  "observed",
  "diffPixelRatio",
  "threshold",
])("rejects relabelled %s or inconsistent policy", async (field) => {
  const { root, release, report, save } = await fixture();
  const cases = report.cases as Array<{
    threshold: number;
    evidence: Record<string, unknown>;
  }>;
  if (field === "threshold") {
    cases[0]!.threshold = 1;
  } else {
    cases[0]!.evidence[field] = field === "diffPixelRatio" ? 0.5 : "wrong";
  }
  expect(await assessReleaseImplementation(root, release, hash, await save(report))).toMatchObject({
    complete: false,
    comparison: "incomplete",
  });
});

it("does not let later passing evidence overwrite earlier drift", async () => {
  const { root, release, report, save } = await fixture();
  const drift = structuredClone(report);
  const cases = drift.cases as Array<{
    withinThreshold: boolean;
    evidence: Record<string, unknown>;
  }>;
  cases[0]!.withinThreshold = false;
  cases[0]!.evidence.diffPixelRatio = 0.1;
  release.implementation.evidence = [
    await save(drift, "drift.json"),
    await save(report, "pass.json"),
  ];
  expect(await assessReleaseImplementation(root, release, hash)).toMatchObject({
    complete: true,
    comparison: "drift",
  });
  expect(
    await assessReleaseImplementation(root, release, hash, await save(report, "selected.json")),
  ).toMatchObject({
    complete: true,
    comparison: "passed",
  });
});

it("rejects missing cases and screenshot mutation despite matching release labels", async () => {
  const { root, release, report, save } = await fixture();
  const reference = await save(report);
  await writeFile(path.join(root, "capture.png"), "newer capture");
  expect(await assessReleaseImplementation(root, release, hash, reference)).toMatchObject({
    complete: false,
  });
  report.pending = [
    {
      id: "email",
    },
  ];
  expect(await assessReleaseImplementation(root, release, hash, await save(report))).toMatchObject({
    complete: false,
  });
});
