import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { attestRelease, attestationPath } from "../src/design-releases/attest.js";
import type { BackendObjects } from "../src/design-releases/backend-compare.js";
import type { BackendPage, PenpotBackendClient } from "../src/penpot-backend.js";

const pageRoot = "00000000-0000-0000-0000-000000000000";
const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) =>
      rm(directory, {
        recursive: true,
        force: true,
      }),
    ),
  );
});

function uuid(label: string): string {
  const hex = Buffer.from(label).toString("hex").padEnd(32, "0").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Top-level boards, each with one rectangle child. */
function page(
  boards: {
    key: string;
    name: string;
    x: number;
  }[],
): BackendObjects {
  const objects: BackendObjects = {
    [pageRoot]: {
      id: pageRoot,
      type: "frame",
      name: "Root Frame",
      shapes: boards.map((board) => uuid(board.key)),
    },
  };
  for (const board of boards) {
    const id = uuid(board.key);
    const child = uuid(`${board.key}-child`);
    objects[id] = {
      id,
      type: "frame",
      name: board.name,
      parentId: pageRoot,
      frameId: pageRoot,
      x: board.x,
      y: 0,
      shapes: [
        child,
      ],
    };
    objects[child] = {
      id: child,
      type: "rect",
      name: "Child",
      parentId: id,
      frameId: id,
      x: board.x + 4,
      y: 4,
      fills: [
        {
          fillColor: "#ffffff",
        },
      ],
    };
  }
  return objects;
}

const pages = [
  {
    id: "page-source",
    name: "Source",
  },
  {
    id: "page-other",
    name: "Other",
  },
  {
    id: "page-release",
    name: "release/1.0.0",
  },
];

function setup(): {
  answers: Record<string, BackendObjects>;
  backend: PenpotBackendClient;
  reads: string[];
} {
  const answers: Record<string, BackendObjects> = {
    "page-source": page([
      {
        key: "s1",
        name: "One",
        x: 0,
      },
      {
        key: "s2",
        name: "Two",
        x: 500,
      },
    ]),
    "page-other": page([]),
    "page-release": page([
      {
        key: "r1",
        name: "One",
        x: 0,
      },
      {
        key: "r2",
        name: "Two",
        x: 500,
      },
    ]),
  };
  const reads: string[] = [];
  return {
    answers,
    reads,
    backend: {
      async getPage(_fileId, pageId): Promise<BackendPage> {
        reads.push(pageId);
        return {
          id: pageId,
          name: pageId,
          objects: answers[pageId]!,
        };
      },
    },
  };
}

async function project(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "penpair-attest-"));
  directories.push(root);
  return root;
}

const request = {
  fileId: "file-1",
  origin: "https://design.example",
  releaseVersion: "1.0.0",
  pages,
};
const words = {
  note: "Looks right to me",
  by: "Niklas",
};

describe("attesting a release from stored data", () => {
  it("verifies without writing and without rendering", async () => {
    const root = await project();
    const { backend } = setup();
    const report = await attestRelease(root, request, {
      backend,
    });
    expect(report).toMatchObject({
      status: "verified",
      frames: 2,
      nodes: 4,
      problems: [],
    });
    await expect(readFile(path.join(root, attestationPath("1.0.0")))).rejects.toThrow();
  });

  it("records the owner's words, then answers calmly when nothing changed", async () => {
    const root = await project();
    const { backend } = setup();
    const first = await attestRelease(root, request, {
      backend,
      write: words,
      now: () => new Date("2026-11-05T10:00:00Z"),
    });
    expect(first.status).toBe("attested");
    const record = JSON.parse(await readFile(path.join(root, first.record), "utf8"));
    expect(record).toMatchObject({
      kind: "release-attestation",
      evidence: "backend",
      approval: words,
      totals: {
        frames: 2,
      },
    });
    expect(record.frames[0]).toMatchObject({
      name: "One",
      sourcePage: "Source",
    });
    const second = await attestRelease(root, request, {
      backend,
      write: {
        note: "Different words",
        by: "Someone",
      },
    });
    expect(second.status).toBe("already-attested");
    const unchanged = JSON.parse(await readFile(path.join(root, first.record), "utf8"));
    expect(unchanged.approval).toEqual(words);
  });

  it("fails and records nothing when a release board differs from its source", async () => {
    const root = await project();
    const { answers, backend } = setup();
    answers["page-release"]![uuid("r1-child")]!.fills = [
      {
        fillColor: "#000000",
      },
    ];
    const report = await attestRelease(root, request, {
      backend,
      write: words,
    });
    expect(report.status).toBe("failed");
    expect(report.problems.join("\n")).toMatch(/fill/i);
    await expect(readFile(path.join(root, attestationPath("1.0.0")))).rejects.toThrow();
  });

  it("names a release board that has no source", async () => {
    const root = await project();
    const { answers, backend } = setup();
    answers["page-release"]![uuid("r2")]!.name = "Renamed";
    const report = await attestRelease(root, request, {
      backend,
    });
    expect(report.status).toBe("failed");
    expect(report.problems.join("\n")).toContain("Renamed: no source board");
  });

  it("asks for a source page when two sources match one release board", async () => {
    const root = await project();
    const { answers, backend } = setup();
    answers["page-other"] = page([
      {
        key: "o1",
        name: "One",
        x: 0,
      },
    ]);
    const ambiguous = await attestRelease(root, request, {
      backend,
    });
    expect(ambiguous.status).toBe("failed");
    expect(ambiguous.problems.join("\n")).toContain("--source-page");
    const named = await attestRelease(
      root,
      {
        ...request,
        sourcePages: [
          "Source",
        ],
      },
      {
        backend,
      },
    );
    expect(named.status).toBe("verified");
  });

  it("reports a change since the attestation and needs --replace to record again", async () => {
    const root = await project();
    const { answers, backend } = setup();
    await attestRelease(root, request, {
      backend,
      write: words,
    });
    for (const key of [
      "s1",
      "r1",
    ]) {
      const child = answers[key === "s1" ? "page-source" : "page-release"]![uuid(`${key}-child`)]!;
      child.fills = [
        {
          fillColor: "#112233",
        },
      ];
    }
    const refused = await attestRelease(root, request, {
      backend,
      write: words,
    });
    expect(refused).toMatchObject({
      status: "changed-since-attestation",
      changed: [
        "One",
      ],
    });
    const replaced = await attestRelease(root, request, {
      backend,
      write: {
        ...words,
        replace: true,
      },
    });
    expect(replaced.status).toBe("attested");
  });

  it("refuses a file without the release page", async () => {
    await expect(
      attestRelease(
        await project(),
        {
          ...request,
          releaseVersion: "9.9.9",
        },
        {
          backend: setup().backend,
        },
      ),
    ).rejects.toThrow(/no page named release\/9\.9\.9/);
  });
});
