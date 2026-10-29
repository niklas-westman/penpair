import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PenpotToolClient } from "../src/client.js";
import { validateBaselineSources } from "../src/baseline-reference.js";
import { recordApproval } from "../src/approvals.js";
import { exportBaselines, type BaselineResult } from "../src/baselines.js";

const state = vi.hoisted(() => ({
  pages: [] as string[],
  revision: 7,
  drift: false,
  selectionDrift: false,
  selectedPageId: "",
  idPageName: "renamed-old",
}));
const image = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY1cAAAAASUVORK5CYII=",
  "base64",
);
const oldFrame = "11111111-1111-4111-8111-111111111111";
const oldPageId = "33333333-3333-4333-8333-333333333333";
const newFrame = "22222222-2222-4222-8222-222222222222";

vi.mock("../src/page-session.js", () => ({
  withPageSession: async (_client: unknown, work: () => Promise<unknown>) => work(),
  selectPage: async (
    _client: unknown,
    target: {
      id: string;
    },
  ) => {
    state.selectedPageId = target.id;
    return {
      fileId: "file",
      pageId: target.id,
    };
  },
}));
vi.mock("../src/operation.js", () => ({
  runOnPage: async (_client: unknown, _snippet: unknown, requestedPage: string | undefined) => {
    const page = requestedPage ?? state.idPageName;
    const pageId = requestedPage ? `${page}-id` : state.selectedPageId;
    state.pages.push(page);
    if (state.selectionDrift && state.pages.length === 2) {
      state.revision++;
    }
    return {
      ok: true,
      fileId: "file",
      pageId,
      page,
      file: "Product",
      revn: state.revision,
      frames: [
        {
          id: page === "old" || page === state.idPageName ? oldFrame : newFrame,
          name: "Screen",
          width: 1,
          height: 1,
        },
      ],
    };
  },
}));
vi.mock("../src/export.js", () => ({
  exportShapePng: async (
    _client: unknown,
    frameId: string,
    options: {
      page?: string;
    },
  ) => {
    const capture = {
      fileId: "file",
      pageId: options.page ? `${options.page}-id` : state.selectedPageId,
      frameId,
      revision: state.revision,
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
    if (state.drift) {
      state.revision++;
    }
    return {
      png: image,
      stable: true,
      capture,
      exports: 2,
    };
  },
}));

const client = {
  callTool: async () => {
    throw new Error("Unexpected direct tool call");
  },
  close: async () => undefined,
} as PenpotToolClient;
const config = {
  page: "new",
  root: "baselines",
  format: "png" as const,
  frames: [
    {
      id: "retained",
      page: "old",
      frameId: oldFrame,
    },
    {
      id: "changed",
      frameId: newFrame,
    },
  ],
};

describe("multi-page baseline generations", () => {
  beforeEach(() => {
    state.pages = [];
    state.revision = 7;
    state.drift = false;
    state.selectionDrift = false;
    state.selectedPageId = "";
    state.idPageName = "renamed-old";
  });

  it("captures each effective page and publishes one truthful mixed-page manifest", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "baseline-pages-"));
    const report = await exportBaselines(client, root, config, {
      apply: true,
    });
    expect(report.complete).toBe(true);
    expect(state.pages).toEqual([
      "old",
      "new",
      "old",
      "new",
    ]);
    const manifest = JSON.parse(
      await readFile(path.join(root, "baselines/penpair-baselines.json"), "utf8"),
    );
    expect(manifest.schemaVersion).toBe(3);
    expect(manifest.pageId).toBeUndefined();
    expect(manifest.pages).toEqual([
      {
        page: "old",
        pageId: "old-id",
      },
      {
        page: "new",
        pageId: "new-id",
      },
    ]);
    expect(
      manifest.frames.map(
        (frame: {
          source: {
            page: string;
          };
        }) => frame.source.page,
      ),
    ).toEqual([
      "old",
      "new",
    ]);
  });

  it("resolves immutable page IDs after a page rename without interpreting IDs as names", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "baseline-page-id-"));
    const selected = {
      ...config,
      frames: [
        {
          id: "retained",
          pageId: oldPageId,
          frameId: oldFrame,
        },
      ],
    };
    const first = await exportBaselines(client, root, selected, {
      apply: true,
    });
    expect(first.results[0]?.source).toMatchObject({
      page: "renamed-old",
      pageId: oldPageId,
    });
    state.idPageName = "renamed-again";
    const next = await exportBaselines(client, root, selected, {
      apply: true,
    });
    expect(next.results[0]).toMatchObject({
      status: "same",
      source: {
        page: "renamed-again",
        pageId: oldPageId,
      },
    });
  });

  it("rejects conflicting expected page names and IDs", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "baseline-page-conflict-"));
    await expect(
      exportBaselines(
        client,
        root,
        {
          ...config,
          frames: [
            {
              id: "retained",
              page: "wrong-name",
              pageId: oldPageId,
              frameId: oldFrame,
            },
          ],
        },
        {
          apply: true,
        },
      ),
    ).rejects.toThrow(/page ID and expected page name/);
  });

  it("retains an original owner approval across an unrelated file revision", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "baseline-owner-"));
    const record = await recordApproval(
      root,
      {
        png: image,
        stable: true,
        exports: 2,
        capture: {
          fileId: "file",
          pageId: "old-id",
          frameId: oldFrame,
          revision: 7,
          scale: 1,
          penpotApiVersion: "test",
          renderEnvironment: "test",
          activeThemes: [],
          activeThemeIds: [],
          designSize: {
            width: 1,
            height: 1,
          },
        },
      },
      {
        by: "Owner",
        note: "Approve the exact retained screen",
      },
    );
    const selected = {
      ...config,
      frames: [
        config.frames[0]!,
      ],
    };
    const first = await exportBaselines(client, root, selected, {
      apply: true,
    });
    expect(first.results[0]?.approved).toMatchObject({
      revision: 7,
      approval: {
        id: record.id,
      },
    });
    await expect(
      exportBaselines(
        client,
        root,
        {
          ...selected,
          frames: [
            {
              ...selected.frames[0]!,
              route: "/retargeted",
            },
          ],
        },
        {
          apply: true,
          update: true,
        },
      ),
    ).rejects.toThrow(/fresh owner words/);
    state.revision = 8;
    const next = await exportBaselines(client, root, selected, {
      apply: true,
    });
    expect(next.results[0]).toMatchObject({
      status: "same",
      captured: {
        revision: 8,
      },
      approved: {
        revision: 7,
        approval: {
          id: record.id,
        },
      },
    });
  });

  it("rejects a revision change while switching initial page inventories", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "baseline-page-switch-"));
    state.selectionDrift = true;
    await expect(
      exportBaselines(client, root, config, {
        apply: true,
      }),
    ).rejects.toThrow(/between pages/);
    await expect(
      readFile(path.join(root, "baselines/penpair-baselines.json")),
    ).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("rejects malformed mixed-page manifests rather than falling back to a single page", () => {
    expect(() =>
      validateBaselineSources({
        schemaVersion: 3,
        fileId: "file",
        frames: [],
      }),
    ).toThrow(/inventory/);
    expect(() =>
      validateBaselineSources({
        schemaVersion: 3,
        fileId: "file",
        pages: [
          {
            page: "old",
            pageId: "old-id",
          },
        ],
        frames: [
          {
            id: "login",
          } as never,
        ],
      }),
    ).toThrow(/source/);
  });

  it("preserves the previous published generation when either page drifts", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "baseline-drift-"));
    await exportBaselines(client, root, config, {
      apply: true,
    });
    const file = path.join(root, "baselines/penpair-baselines.json");
    const previous = await readFile(file, "utf8");
    state.drift = true;
    await expect(
      exportBaselines(client, root, config, {
        apply: true,
      }),
    ).rejects.toThrow(/changed/);
    expect(await readFile(file, "utf8")).toBe(previous);
  });
});
