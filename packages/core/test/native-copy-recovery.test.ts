import { access, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PenpotToolClient } from "../src/client.js";
import type { InspectionCapture } from "../src/inspection.js";
import { copyReleaseBoards } from "../src/design-releases/copy.js";
import { readJournal, listJournals, JournalRunError } from "../src/journal.js";
import * as atomic from "../src/atomic-output.js";
import * as evidence from "../src/design-releases/copy-evidence.js";
import * as live from "../src/design-releases/live.js";
import * as sessions from "../src/page-session.js";

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
interface Shape {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  children: Shape[];
  getSharedPluginData(namespace: string, key: string): string;
  setSharedPluginData(namespace: string, key: string, value: string): void;
}
interface Page {
  id: string;
  name: string;
  root: Shape;
  getShapeById(id: string): Shape | null;
}
const roots: string[] = [];
beforeEach(() => vi.restoreAllMocks());
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    roots.splice(0).map((root) =>
      rm(root, {
        recursive: true,
        force: true,
      }),
    ),
  );
});

function shape(id: string, name: string, width = 100): Shape {
  const metadata = new Map<string, string>();
  return {
    id,
    name,
    type: "board",
    x: 0,
    y: 0,
    width,
    height: 80,
    children: [],
    getSharedPluginData(namespace, key) {
      return metadata.get(`${namespace}/${key}`) ?? "";
    },
    setSharedPluginData(namespace, key, value) {
      metadata.set(`${namespace}/${key}`, value);
    },
  };
}
function page(id: string, name: string, children: Shape[]): Page {
  const root = shape(`${id}-root`, "Root");
  root.children = children;
  const find = (entry: Shape, target: string): Shape | null =>
    entry.id === target
      ? entry
      : (entry.children.map((child) => find(child, target)).find(Boolean) ?? null);
  return {
    id,
    name,
    root,
    getShapeById(target) {
      return find(root, target);
    },
  };
}

async function fixture(existingDestination = false, realPageSessions = false) {
  const root = await mkdtemp(path.join(os.tmpdir(), "penpair-native-copy-recovery-"));
  roots.push(root);
  const source = page("source-page", "Candidates", [
    shape("source-a", "Screen A"),
    shape("source-b", "Screen B", 120),
  ]);
  const existing = shape("existing", "Preserve me");
  existing.x = 50;
  existing.y = 50;
  const destination = page("destination", "release/1.2.0", [
    existing,
  ]);
  const pages = existingDestination
    ? [
        source,
        destination,
      ]
    : [
        source,
      ];
  const state = {
    currentFile: {
      id: "file",
      revn: 1,
      pages,
    },
    currentPage: source,
    selection: [] as Shape[],
    createPage() {
      const created = page(`created-${pages.length}`, `Page ${pages.length}`, []);
      pages.push(created);
      state.currentFile.revn++;
      return created;
    },
    async openPage(target: Page | string) {
      const next =
        typeof target === "string" ? pages.find((candidate) => candidate.id === target) : target;
      if (!next) {
        throw new Error("Missing page");
      }
      state.currentPage = next;
      state.selection = [];
    },
  };
  let copies: Shape[] = [];
  const clipboard = {
    copy: vi.fn(async () => {
      copies = [
        ...state.selection,
      ];
    }),
    paste: vi.fn(async () => {
      const pasted = copies.map((original) =>
        shape(`pasted-${original.id}`, original.name, original.width),
      );
      state.currentPage.root.children.push(...pasted);
      state.selection = pasted;
      state.currentFile.revn++;
    }),
    close: vi.fn(async () => undefined),
  };
  const writes: string[] = [];
  const faults = {
    loseArrangeAcknowledgment: false,
  };
  const client: PenpotToolClient = {
    async callTool(_name, args) {
      const code = String(args.code);
      if (code.includes("penpot.createPage()")) {
        writes.push("create-page");
      }
      if (code.includes('shape.setSharedPluginData("penpair", "native-copy"')) {
        writes.push("arrange");
      }
      const result = await new AsyncFunction("penpot", code)(state);
      if (
        faults.loseArrangeAcknowledgment &&
        code.includes('shape.setSharedPluginData("penpair", "native-copy"')
      ) {
        faults.loseArrangeAcknowledgment = false;
        throw new Error("arrangement acknowledgment lost");
      }
      return {
        text: JSON.stringify({
          result,
          log: "",
        }),
        isError: false,
      };
    },
    async close() {},
  };
  if (!realPageSessions) {
    vi.spyOn(sessions, "selectPage").mockImplementation(async (_client, target) => {
      const next =
        "id" in target
          ? pages.find((candidate) => candidate.id === target.id)
          : pages.find((candidate) => candidate.name === target.name);
      if (!next) {
        throw new Error("Unknown page");
      }
      if (next.id !== state.currentPage.id) {
        state.selection = [];
      }
      state.currentPage = next;
      return {
        fileId: "file",
        pageId: next.id,
      };
    });
  }
  const inspection = (pageId: string, frameId: string): InspectionCapture => {
    const selectedPage = pages.find((candidate) => candidate.id === pageId);
    const board = selectedPage?.getShapeById(frameId);
    if (!board) {
      throw new Error("Missing board evidence");
    }
    return {
      schemaVersion: 1,
      kind: "shape-inspection",
      complete: true,
      reasons: [],
      fileId: "file",
      pageId,
      revision: state.currentFile.revn,
      nodes: [
        {
          id: board.id,
          name: board.name,
          type: board.type,
          parentId: null,
          index: 0,
          childIds: [],
          childrenTotal: 0,
          unknowns: [],
          geometry: {
            x: board.x,
            y: board.y,
            width: board.width,
            height: board.height,
            rotation: 0,
          },
        },
      ],
    } as unknown as InspectionCapture;
  };
  vi.spyOn(live, "captureReleaseScreen").mockImplementation(
    async (_client, _fileId, pageId, frameId) => {
      if (realPageSessions) {
        await sessions.selectPage(_client, {
          id: pageId,
        });
      }
      return inspection(pageId, frameId);
    },
  );
  vi.spyOn(evidence, "captureCopyEvidence").mockImplementation(
    async (_client, _root, _fileId, pageId, frameIds, prefix) => {
      if (realPageSessions) {
        await sessions.selectPage(_client, {
          id: pageId,
        });
      }
      return frameIds.map((frameId, index) => {
        const captured = inspection(pageId, frameId);
        const node = captured.nodes[0]!;
        return {
          frameId,
          name: String(node.name),
          inspection: captured,
          inspectionRef: {
            path: `${prefix}/frame-${index}.json`,
            sha256: "fixture",
          },
          render: {
            path: `${prefix}/frame-${index}.png`,
            sha256: "fixture",
          },
          pixels: {
            hash: `pixels-${node.name}`,
            width: Number((node.geometry as Record<string, unknown>).width),
            height: 80,
          },
        };
      });
    },
  );
  vi.spyOn(evidence, "compareCopyEvidence").mockReturnValue({
    nativeVerified: true,
    pixelsMatch: true,
    nodeMap: {},
    problems: [],
  });
  const request = {
    fileId: "file",
    sourcePage: "Candidates",
    frameIds: [
      "source-a",
      "source-b",
    ],
    releaseVersion: "1.2.0",
  };
  const options = {
    apply: true,
    runId: "copy-run",
    clipboard: async () => clipboard,
    sleep: async () => undefined,
  };
  return {
    root,
    state,
    source,
    destination,
    existing,
    clipboard,
    client,
    request,
    options,
    writes,
    faults,
  };
}

describe("native copy orchestration with real operation journals", () => {
  it("keeps real page-session guards aligned after creating and opening a new destination", async () => {
    const trial = await fixture(false, true);
    const result = await copyReleaseBoards(trial.client, trial.root, trial.request, trial.options);
    expect(result.status).toBe("copied");
    expect(trial.clipboard.copy).toHaveBeenCalledWith("source-page", trial.request.frameIds);
    const destination = trial.state.currentFile.pages.find(
      (candidate) => candidate.name === "release/1.2.0",
    )!;
    expect(trial.clipboard.paste).toHaveBeenCalledWith(destination.id);
    expect((await readJournal(trial.root, "copy-run")).state).toBe("verified");
  });

  it("resumes failed preparation without a paste fence and dispatches its first paste only once", async () => {
    const trial = await fixture(false, true);
    const connectClipboard = vi
      .fn()
      .mockRejectedValueOnce(new Error("Browser was unavailable before copy"))
      .mockResolvedValue(trial.clipboard);
    const options = {
      ...trial.options,
      clipboard: connectClipboard,
    };
    await expect(
      copyReleaseBoards(trial.client, trial.root, trial.request, options),
    ).rejects.toThrow(/uncertain|Browser/i);
    expect(
      (await readJournal(trial.root, "copy-run")).steps.find((step) => step.key === "paste")?.state,
    ).toBe("uncertain");
    expect(trial.clipboard.copy).not.toHaveBeenCalled();
    expect(trial.clipboard.paste).not.toHaveBeenCalled();
    const result = await copyReleaseBoards(trial.client, trial.root, trial.request, {
      ...options,
      resume: true,
    });
    expect(result.status).toBe("copied");
    expect(connectClipboard).toHaveBeenCalledTimes(2);
    expect(trial.clipboard.copy).toHaveBeenCalledOnce();
    expect(trial.clipboard.paste).toHaveBeenCalledOnce();
  });

  it("previews without changing selection, pages, clipboard or local journals", async () => {
    const trial = await fixture();
    const before = trial.state.currentPage.id;
    const result = await copyReleaseBoards(trial.client, trial.root, trial.request);
    expect(result.status).toBe("preview");
    expect(trial.state.currentPage.id).toBe(before);
    expect(trial.state.currentFile.pages).toHaveLength(1);
    expect(trial.state.selection).toEqual([]);
    expect(trial.clipboard.copy).not.toHaveBeenCalled();
    expect(trial.clipboard.paste).not.toHaveBeenCalled();
    expect(await listJournals(trial.root)).toEqual([]);
  });

  it.each([
    false,
    true,
  ])(
    "copies one batch and preserves source and existing content (destination exists=%s)",
    async (existing) => {
      const trial = await fixture(existing);
      const existingBefore = {
        x: trial.existing.x,
        y: trial.existing.y,
        name: trial.existing.name,
      };
      const sourceBefore = JSON.stringify(trial.source.root.children);
      const result = await copyReleaseBoards(
        trial.client,
        trial.root,
        trial.request,
        trial.options,
      );
      expect(result.status).toBe("copied");
      expect(trial.clipboard.copy).toHaveBeenCalledOnce();
      expect(trial.clipboard.paste).toHaveBeenCalledOnce();
      expect(trial.clipboard.copy).toHaveBeenCalledWith("source-page", trial.request.frameIds);
      const destination = trial.state.currentFile.pages.find(
        (candidate) => candidate.name === "release/1.2.0",
      )!;
      expect(
        destination.root.children.filter((board) => board.id.startsWith("pasted-")),
      ).toHaveLength(2);
      expect(JSON.stringify(trial.source.root.children)).toBe(sourceBefore);
      expect({
        x: trial.existing.x,
        y: trial.existing.y,
        name: trial.existing.name,
      }).toEqual(existingBefore);
      expect((await readJournal(trial.root, "copy-run")).state).toBe("verified");
    },
  );

  it("never repeats an attempted paste with no visible result, including a new run", async () => {
    const trial = await fixture();
    trial.clipboard.paste.mockImplementation(async () => {
      throw new Error("paste acknowledgment lost");
    });
    await expect(
      copyReleaseBoards(trial.client, trial.root, trial.request, trial.options),
    ).rejects.toThrow(/uncertain|paste/i);
    await expect(
      copyReleaseBoards(trial.client, trial.root, trial.request, {
        ...trial.options,
        resume: true,
      }),
    ).rejects.toThrow(/conflict|reconcil|paste/i);
    await expect(
      copyReleaseBoards(trial.client, trial.root, trial.request, {
        ...trial.options,
        runId: "new-run",
      }),
    ).rejects.toThrow(/copy-run|reconcil/i);
    expect(trial.clipboard.paste).toHaveBeenCalledOnce();
    expect(trial.clipboard.copy).toHaveBeenCalledOnce();
  });

  it("reconciles copied boards after a lost paste acknowledgment without dispatching paste again", async () => {
    const trial = await fixture();
    const paste = trial.clipboard.paste.getMockImplementation()!;
    trial.clipboard.paste.mockImplementation(async () => {
      await paste();
      throw new Error("lost paste acknowledgment");
    });
    await expect(
      copyReleaseBoards(trial.client, trial.root, trial.request, trial.options),
    ).rejects.toThrow(/uncertain|lost/i);
    const result = await copyReleaseBoards(trial.client, trial.root, trial.request, {
      ...trial.options,
      resume: true,
    });
    expect(result.status).toBe("copied");
    expect(trial.clipboard.paste).toHaveBeenCalledOnce();
    expect(trial.clipboard.copy).toHaveBeenCalledOnce();
  });

  it("refuses changed source content before completing the transfer", async () => {
    const trial = await fixture();
    const paste = trial.clipboard.paste.getMockImplementation()!;
    trial.clipboard.paste.mockImplementation(async () => {
      await paste();
      trial.source.root.children[0]!.name = "Changed externally";
    });
    await expect(
      copyReleaseBoards(trial.client, trial.root, trial.request, trial.options),
    ).rejects.toThrow(/source|Original|changed/i);
    expect((await readJournal(trial.root, "copy-run")).state).not.toBe("verified");
    expect(trial.clipboard.paste).toHaveBeenCalledOnce();
  });

  it.each([
    "native",
    "pixels",
  ])("keeps completed copies incomplete when final %s proof fails", async (failure) => {
    const trial = await fixture();
    vi.mocked(evidence.compareCopyEvidence).mockReturnValue({
      nativeVerified: failure !== "native",
      pixelsMatch: failure !== "pixels",
      nodeMap: {},
      problems: [
        `${failure} proof did not match`,
      ],
    });
    const result = await copyReleaseBoards(trial.client, trial.root, trial.request, trial.options);
    expect(result.status).toBe("incomplete");
    expect((await readJournal(trial.root, "copy-run")).state).toBe("failed");
    expect(result.problems).toContain(`${failure} proof did not match`);
    expect(trial.clipboard.paste).toHaveBeenCalledOnce();
    const destination = trial.state.currentFile.pages.find(
      (candidate) => candidate.name === "release/1.2.0",
    )!;
    expect(destination.root.children).toHaveLength(2);
  });

  it.each([
    "write",
    "redaction",
  ])(
    "propagates receipt %s failures instead of returning an incomplete result with a phantom receipt",
    async (failure) => {
      const trial = await fixture();
      vi.mocked(evidence.compareCopyEvidence).mockReturnValue({
        nativeVerified: false,
        pixelsMatch: true,
        nodeMap: {},
        problems: [
          "Native fidelity remains unproven",
        ],
      });
      const originalWrite = atomic.atomicWriteFile;
      if (failure === "write") {
        vi.spyOn(atomic, "atomicWriteFile").mockImplementation(
          async (destination, data, options) => {
            if (path.basename(destination) === "receipt.json") {
              throw Object.assign(new Error("Receipt persistence permission denied"), {
                code: "EACCES",
              });
            }
            return originalWrite(destination, data, options);
          },
        );
      }
      const work = copyReleaseBoards(trial.client, trial.root, trial.request, {
        ...trial.options,
        ...(failure === "redaction"
          ? {
              redact: (value: string) =>
                value.includes('"receiptPath":')
                  ? value.replace('"receiptPath":', '"redactedReceiptPath":')
                  : value,
            }
          : {}),
      });
      await expect(work).rejects.toBeInstanceOf(JournalRunError);
      await expect(work).rejects.toThrow(failure === "write" ? /permission denied/i : /redaction/i);
      expect((await readJournal(trial.root, "copy-run")).state).not.toBe("verified");
      await expect(
        access(path.join(trial.root, ".penpair", "native-copy", "copy-run", "receipt.json")),
      ).rejects.toMatchObject({
        code: "ENOENT",
      });
      expect(trial.clipboard.paste).toHaveBeenCalledOnce();
      expect(
        trial.state.currentFile.pages.find((candidate) => candidate.name === "release/1.2.0")!.root
          .children,
      ).toHaveLength(2);
    },
  );

  it("refuses an unrelated or oversized root delta rather than arranging it", async () => {
    const trial = await fixture();
    trial.clipboard.paste.mockImplementation(async () => {
      trial.state.currentPage.root.children.push(
        shape("unrelated", "Other content"),
        shape("extra", "More content"),
        shape("third", "Third"),
      );
      trial.state.currentFile.revn++;
    });
    await expect(
      copyReleaseBoards(trial.client, trial.root, trial.request, trial.options),
    ).rejects.toThrow(/paste|conflict|verification/i);
    expect(trial.writes).not.toContain("arrange");
    expect(trial.clipboard.paste).toHaveBeenCalledOnce();
  });

  it("refuses an equal-sized unrelated batch rather than identifying copies by count alone", async () => {
    const trial = await fixture();
    trial.clipboard.paste.mockImplementation(async () => {
      const unrelated = [
        shape("unrelated-a", "Unrelated A"),
        shape("unrelated-b", "Unrelated B", 120),
      ];
      trial.state.currentPage.root.children.push(...unrelated);
      trial.state.selection = unrelated;
      trial.state.currentFile.revn++;
    });
    await expect(
      copyReleaseBoards(trial.client, trial.root, trial.request, trial.options),
    ).rejects.toThrow(/match|copy|conflict|candidate|verification/i);
    expect(trial.writes).not.toContain("arrange");
    expect(trial.clipboard.paste).toHaveBeenCalledOnce();
  });

  it("reconciles a late native paste after an earlier zero-result resume without pasting again", async () => {
    const trial = await fixture();
    trial.clipboard.paste.mockImplementation(async () => {
      throw new Error("paste completion unknown");
    });
    await expect(
      copyReleaseBoards(trial.client, trial.root, trial.request, trial.options),
    ).rejects.toThrow();
    await expect(
      copyReleaseBoards(trial.client, trial.root, trial.request, {
        ...trial.options,
        resume: true,
      }),
    ).rejects.toThrow();
    const destination = trial.state.currentFile.pages.find(
      (candidate) => candidate.name === "release/1.2.0",
    )!;
    const lateBoards = [
      shape("late-a", "Screen A"),
      shape("late-b", "Screen B", 120),
    ];
    destination.root.children.push(...lateBoards);
    trial.state.selection = lateBoards;
    trial.state.currentFile.revn++;
    const result = await copyReleaseBoards(trial.client, trial.root, trial.request, {
      ...trial.options,
      resume: true,
    });
    expect(result.status).toBe("copied");
    expect(trial.clipboard.paste).toHaveBeenCalledOnce();
    expect(trial.clipboard.copy).toHaveBeenCalledOnce();
  });

  it("stops safely when uncertain paste candidates have lost their identifying selection", async () => {
    const trial = await fixture();
    const paste = trial.clipboard.paste.getMockImplementation()!;
    trial.clipboard.paste.mockImplementation(async () => {
      await paste();
      throw new Error("paste acknowledgment lost");
    });
    await expect(
      copyReleaseBoards(trial.client, trial.root, trial.request, trial.options),
    ).rejects.toThrow();
    trial.state.selection = [];
    await expect(
      copyReleaseBoards(trial.client, trial.root, trial.request, {
        ...trial.options,
        resume: true,
      }),
    ).rejects.toThrow(/selection|conflict|inspect/i);
    expect(trial.clipboard.paste).toHaveBeenCalledOnce();
    expect(trial.clipboard.copy).toHaveBeenCalledOnce();
    expect(trial.writes).not.toContain("arrange");
  });

  it("refuses a same-name replacement of a newly created release page before paste", async () => {
    const trial = await fixture();
    const copy = trial.clipboard.copy.getMockImplementation()!;
    trial.clipboard.copy.mockImplementation(async () => {
      await copy();
      const created = trial.state.currentFile.pages.find(
        (candidate) => candidate.name === "release/1.2.0",
      )!;
      created.name = "Renamed externally";
      trial.state.currentFile.pages.push(page("replacement", "release/1.2.0", []));
      trial.state.currentFile.revn++;
    });
    await expect(
      copyReleaseBoards(trial.client, trial.root, trial.request, trial.options),
    ).rejects.toThrow(/different page|destination|identity|replaced/i);
    expect(trial.clipboard.paste).not.toHaveBeenCalled();
    expect(trial.writes).not.toContain("arrange");
  });

  it("requires the verified transfer's explicit resume instead of duplicating it in a fresh run", async () => {
    const trial = await fixture(true);
    await copyReleaseBoards(trial.client, trial.root, trial.request, trial.options);
    await expect(
      copyReleaseBoards(trial.client, trial.root, trial.request, {
        ...trial.options,
        runId: "fresh-duplicate",
      }),
    ).rejects.toThrow(/copy-run|resume|already/i);
    expect(trial.clipboard.paste).toHaveBeenCalledOnce();
    expect(trial.clipboard.copy).toHaveBeenCalledOnce();
  });

  it("does not paste twice when two processes pass preflight before either journal exists", async () => {
    const trial = await fixture(true);
    const capture = vi.mocked(evidence.captureCopyEvidence).getMockImplementation()!;
    let arrivals = 0;
    let release!: () => void;
    const plannedTogether = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.mocked(evidence.captureCopyEvidence).mockImplementation(async (...args) => {
      const result = await capture(...args);
      if (args[5].endsWith("/source")) {
        arrivals++;
        if (arrivals === 2) {
          release();
        }
        await plannedTogether;
      }
      return result;
    });
    const secondClient = {
      ...trial.client,
    };
    const results = await Promise.allSettled([
      copyReleaseBoards(trial.client, trial.root, trial.request, {
        ...trial.options,
        runId: "first-concurrent",
      }),
      copyReleaseBoards(secondClient, trial.root, trial.request, {
        ...trial.options,
        runId: "second-concurrent",
      }),
    ]);
    expect(arrivals).toBe(2);
    expect(results.some((result) => result.status === "rejected")).toBe(true);
    expect(trial.clipboard.paste.mock.calls.length).toBeLessThanOrEqual(1);
    expect(
      trial.destination.root.children.filter((board) => board.id.startsWith("pasted-")),
    ).toHaveLength(trial.clipboard.paste.mock.calls.length * 2);
    expect(
      (await listJournals(trial.root)).filter((journal) => journal.state === "verified").length,
    ).toBeLessThanOrEqual(1);
  });

  it("reconciles a completed arrangement after acknowledgment loss without redoing native paste", async () => {
    const trial = await fixture();
    trial.faults.loseArrangeAcknowledgment = true;
    await expect(
      copyReleaseBoards(trial.client, trial.root, trial.request, trial.options),
    ).rejects.toThrow(/uncertain|arrangement|lost/i);
    const result = await copyReleaseBoards(trial.client, trial.root, trial.request, {
      ...trial.options,
      resume: true,
    });
    expect(result.status).toBe("copied");
    expect(trial.clipboard.paste).toHaveBeenCalledOnce();
    expect(trial.clipboard.copy).toHaveBeenCalledOnce();
    expect(trial.writes.filter((write) => write === "arrange")).toHaveLength(1);
  });
});
