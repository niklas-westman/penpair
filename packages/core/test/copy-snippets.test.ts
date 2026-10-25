import { describe, expect, it, vi } from "vitest";
import {
  nativeCopyArrange,
  nativeCopyCreatePage,
  nativeCopyInspect,
  nativeCopyObserve,
  nativeCopySelect,
} from "../src/design-releases/copy-snippets.js";
import { compiles, type Snippet } from "../src/snippet.js";

interface Shape {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  children: Shape[];
  data: Record<string, string>;
  getSharedPluginData(namespace: string, key: string): string;
  setSharedPluginData(namespace: string, key: string, value: string): void;
}
interface Page {
  id: string;
  name: string;
  root: Shape;
}

function shape(id: string, children: Shape[] = [], type = "board"): Shape {
  const data: Record<string, string> = {};
  return {
    id,
    name: id,
    type,
    x: 0,
    y: 0,
    width: 100,
    height: 80,
    children,
    data,
    getSharedPluginData(namespace, key) {
      return data[`${namespace}:${key}`] ?? "";
    },
    setSharedPluginData(namespace, key, value) {
      data[`${namespace}:${key}`] = value;
    },
  };
}

function page(id: string, name: string, children: Shape[] = []): Page {
  return {
    id,
    name,
    root: shape(`${id}-root`, children, "root"),
  };
}

function fixture() {
  const nested = shape("nested", [
    shape("child", [], "rect"),
  ]);
  const section = shape("section", [
    nested,
  ]);
  const source = page("source", "Candidate", [
    section,
    shape("second"),
  ]);
  const destination = page("destination", "release/1.2.3", [
    shape("existing"),
  ]);
  const editor = {
    currentFile: {
      id: "file",
      revn: 4,
      pages: [
        source,
        destination,
      ],
    },
    currentPage: source,
    selection: [
      section,
    ],
    createPage: vi.fn(() => {
      const created = page("created", "Untitled");
      editor.currentFile.pages.push(created);
      return created;
    }),
    openPage: vi.fn(async (target: Page) => {
      editor.currentPage = target;
    }),
  };
  return {
    editor,
    source,
    destination,
    nested,
    section,
  };
}

async function execute(generated: Snippet, editor: ReturnType<typeof fixture>["editor"]) {
  expect(compiles(generated.code)).toBeUndefined();
  expect(Buffer.byteLength(generated.code)).toBeLessThan(90_000);
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  return new AsyncFunction("penpot", generated.code)(editor);
}

const inspect = (
  frames = [
    "nested",
  ],
) => nativeCopyInspect("file", "Candidate", frames, "1.2.3");

describe("native copy inspection", () => {
  it("finds nested source boards without changing selection, page or data", async () => {
    const { editor, source, destination } = fixture();
    const before = JSON.stringify(editor);
    const result = await execute(inspect(), editor);
    expect(result).toMatchObject({
      ok: true,
      sourcePageId: source.id,
      destinationPageId: destination.id,
      destinationRootIds: [
        "existing",
      ],
      destinationBounds: {
        bottom: 80,
      },
      sourceFrames: [
        {
          id: "nested",
          nodeCount: 2,
          width: 100,
          height: 80,
        },
      ],
      createdPageOwner: null,
      destinationFinal: false,
    });
    expect(JSON.stringify(editor)).toBe(before);
    expect(editor.openPage).not.toHaveBeenCalled();
    expect(editor.createPage).not.toHaveBeenCalled();
    expect(inspect().effect).toBe("read");
  });

  it("supports exact source page IDs", async () => {
    const { editor } = fixture();
    expect(
      await execute(
        nativeCopyInspect(
          "file",
          "source",
          [
            "nested",
          ],
          "1.2.3",
        ),
        editor,
      ),
    ).toMatchObject({
      ok: true,
      sourcePageName: "Candidate",
    });
  });

  it.each([
    [
      "section",
      "nested",
    ],
    [
      "nested",
      "nested",
    ],
    [
      "missing",
    ],
    [
      "child",
    ],
  ])("rejects invalid board selection %j", async (frames) => {
    const { editor } = fixture();
    expect(await execute(inspect(frames), editor)).toMatchObject({
      ok: false,
    });
  });

  it("refuses ambiguous source and destination pages", async () => {
    const { editor } = fixture();
    editor.currentFile.pages.push(page("other-source", "Candidate"));
    expect(await execute(inspect(), editor)).toMatchObject({
      ok: false,
      message: expect.stringMatching(/ambiguous/),
    });
    editor.currentFile.pages.pop();
    editor.currentFile.pages.push(page("other-destination", "release/1.2.3"));
    expect(await execute(inspect(), editor)).toMatchObject({
      ok: false,
      message: expect.stringMatching(/ambiguous/),
    });
  });

  it("refuses copying onto the source page", async () => {
    const { editor, source } = fixture();
    source.name = "release/1.2.3";
    editor.currentFile.pages = [
      source,
    ];
    expect(
      await execute(
        nativeCopyInspect(
          "file",
          source.id,
          [
            "nested",
          ],
          "1.2.3",
        ),
        editor,
      ),
    ).toMatchObject({
      ok: false,
      message: expect.stringMatching(/different pages/),
    });
  });

  it.each([
    "not-json",
    "null",
    "[]",
    JSON.stringify({
      status: "released",
    }),
  ])("refuses malformed or finalized destination ownership %s", async (marker) => {
    const { editor, destination } = fixture();
    destination.root.setSharedPluginData("penpair", "design-release", marker);
    expect(await execute(inspect(), editor)).toMatchObject({
      ok: false,
    });
  });

  it("accepts an owned mutable draft while preserving its marker", async () => {
    const { editor, destination } = fixture();
    const marker = JSON.stringify({
      schemaVersion: 1,
      owner: "penpair",
      productVersion: "1.2.3",
      releaseId: "release-id",
      ownerKey: "owner",
      status: "draft",
    });
    destination.root.setSharedPluginData("penpair", "design-release", marker);
    expect(await execute(inspect(), editor)).toMatchObject({
      ok: true,
    });
    expect(destination.root.getSharedPluginData("penpair", "design-release")).toBe(marker);
  });

  it("bounds traversal and detects duplicate or cyclic identities", async () => {
    const { editor, source, section } = fixture();
    section.children.push(section);
    expect(await execute(inspect(), editor)).toMatchObject({
      ok: false,
      message: expect.stringMatching(/duplicate/),
    });
    source.root.children = Array.from(
      {
        length: 20_001,
      },
      (_, index) => shape(String(index)),
    );
    expect(await execute(inspect(), editor)).toMatchObject({
      ok: false,
      message: expect.stringMatching(/budget/),
    });
  });
});

describe("native copy page and selection writes", () => {
  it("creates and owns a new release page exactly once", async () => {
    const { editor, source } = fixture();
    editor.currentFile.pages = [
      source,
    ];
    const generated = nativeCopyCreatePage("file", "1.2.3", "run");
    expect(await execute(generated, editor)).toMatchObject({
      ok: true,
      created: true,
      pageId: "created",
    });
    expect(editor.currentPage.name).toBe("release/1.2.3");
    expect(
      JSON.parse(editor.currentPage.root.getSharedPluginData("penpair", "native-release-copy")),
    ).toMatchObject({
      owner: "penpair",
      ownerKey: "run",
      fileId: "file",
      productVersion: "1.2.3",
      created: true,
    });
    expect(await execute(generated, editor)).toMatchObject({
      ok: true,
      created: false,
      pageId: "created",
    });
    expect(editor.createPage).toHaveBeenCalledOnce();
  });

  it("opens an existing page without claiming or deleting its contents", async () => {
    const { editor, destination } = fixture();
    expect(await execute(nativeCopyCreatePage("file", "1.2.3", "run"), editor)).toMatchObject({
      ok: true,
      created: false,
    });
    expect(destination.root.children.map((child) => child.id)).toEqual([
      "existing",
    ]);
    expect(destination.root.data).toEqual({});
    expect(editor.createPage).not.toHaveBeenCalled();
  });

  it("resumes an owned orphan before naming without creating another page", async () => {
    const { editor, destination } = fixture();
    destination.name = "Untitled";
    destination.root.setSharedPluginData(
      "penpair",
      "native-release-copy",
      JSON.stringify({
        schemaVersion: 1,
        owner: "penpair",
        kind: "native-release-copy",
        fileId: "file",
        productVersion: "1.2.3",
        ownerKey: "run",
        created: true,
      }),
    );
    expect(
      await execute(
        nativeCopyInspect(
          "file",
          "Candidate",
          [
            "nested",
          ],
          "1.2.3",
          "run",
        ),
        editor,
      ),
    ).toMatchObject({
      ok: true,
      destinationPageId: "destination",
      createdPageOwner: "run",
    });
    expect(destination.name).toBe("Untitled");
    expect(await execute(nativeCopyCreatePage("file", "1.2.3", "run"), editor)).toMatchObject({
      ok: true,
      created: false,
      pageId: "destination",
    });
    expect(destination.name).toBe("release/1.2.3");
    expect(editor.createPage).not.toHaveBeenCalled();
  });

  it("does not adopt another run's orphan page", async () => {
    const { editor, destination } = fixture();
    destination.name = "Untitled";
    destination.root.setSharedPluginData(
      "penpair",
      "native-release-copy",
      JSON.stringify({
        schemaVersion: 1,
        owner: "penpair",
        kind: "native-release-copy",
        fileId: "file",
        productVersion: "1.2.3",
        ownerKey: "other-run",
        created: true,
      }),
    );
    expect(
      await execute(
        nativeCopyInspect(
          "file",
          "Candidate",
          [
            "nested",
          ],
          "1.2.3",
          "run",
        ),
        editor,
      ),
    ).toMatchObject({
      ok: true,
      destinationPageId: null,
    });
    expect(destination.name).toBe("Untitled");
  });

  it("refuses duplicate owned orphan pages or a conflicting release name", async () => {
    const { editor, destination } = fixture();
    const marker = JSON.stringify({
      schemaVersion: 1,
      owner: "penpair",
      kind: "native-release-copy",
      fileId: "file",
      productVersion: "1.2.3",
      ownerKey: "run",
      created: true,
    });
    const orphan = page("orphan", "Untitled");
    orphan.root.setSharedPluginData("penpair", "native-release-copy", marker);
    editor.currentFile.pages.push(orphan);
    expect(await execute(nativeCopyCreatePage("file", "1.2.3", "run"), editor)).toMatchObject({
      ok: false,
      message: expect.stringMatching(/conflicts/),
    });
    destination.name = "Another orphan";
    destination.root.setSharedPluginData("penpair", "native-release-copy", marker);
    expect(await execute(nativeCopyCreatePage("file", "1.2.3", "run"), editor)).toMatchObject({
      ok: false,
      message: expect.stringMatching(/ambiguous/),
    });
    expect(editor.createPage).not.toHaveBeenCalled();
  });

  it("selects a batch in requested order and can clear selection", async () => {
    const { editor } = fixture();
    expect(
      await execute(
        nativeCopySelect("file", "source", [
          "second",
          "nested",
        ]),
        editor,
      ),
    ).toMatchObject({
      ok: true,
      selectionIds: [
        "second",
        "nested",
      ],
    });
    expect(await execute(nativeCopySelect("file", "source", []), editor)).toMatchObject({
      ok: true,
      selectionIds: [],
    });
  });

  it("refuses selection changes on a foreign file or page", async () => {
    const { editor } = fixture();
    const before = editor.selection;
    expect(
      await execute(
        nativeCopySelect("other", "source", [
          "nested",
        ]),
        editor,
      ),
    ).toMatchObject({
      ok: false,
    });
    expect(
      await execute(
        nativeCopySelect("file", "destination", [
          "nested",
        ]),
        editor,
      ),
    ).toMatchObject({
      ok: false,
    });
    expect(editor.selection).toBe(before);
  });
});

describe("native copy observation and arrangement", () => {
  it("observes root identity and selection without changing them", async () => {
    const { editor, destination } = fixture();
    editor.currentPage = destination;
    editor.selection = [];
    expect(await execute(nativeCopyObserve("file", "destination"), editor)).toMatchObject({
      ok: true,
      rootIds: [
        "existing",
      ],
      selectionIds: [],
      rootFrames: [
        {
          id: "existing",
          type: "board",
          nodeCount: 1,
          copyRunId: null,
        },
      ],
    });
    expect(nativeCopyObserve("file", "destination").effect).toBe("read");
  });

  it("arranges only identified new roots without resizing or changing existing contents", async () => {
    const { editor, destination } = fixture();
    const added = shape("added");
    destination.root.children.push(added);
    editor.currentPage = destination;
    const original = JSON.stringify(destination.root.children[0]);
    const generated = nativeCopyArrange(
      "file",
      "destination",
      [
        {
          id: "added",
          x: 120,
          y: 1000,
        },
      ],
      "run",
    );
    expect(await execute(generated, editor)).toMatchObject({
      ok: true,
      placements: [
        {
          id: "added",
          x: 120,
          y: 1000,
        },
      ],
    });
    expect(await execute(generated, editor)).toMatchObject({
      ok: true,
    });
    expect(added.width).toBe(100);
    expect(added.height).toBe(80);
    expect(JSON.stringify(destination.root.children[0])).toBe(original);
    expect(added.getSharedPluginData("penpair", "native-copy")).toBe('{"runId":"run"}');
  });

  it("validates the whole arrangement before changing any board", async () => {
    const { editor, destination } = fixture();
    editor.currentPage = destination;
    const before = JSON.stringify(destination);
    expect(
      await execute(
        nativeCopyArrange(
          "file",
          "destination",
          [
            {
              id: "existing",
              x: 50,
              y: 50,
            },
            {
              id: "missing",
              x: 100,
              y: 100,
            },
          ],
          "run",
        ),
        editor,
      ),
    ).toMatchObject({
      ok: false,
    });
    expect(JSON.stringify(destination)).toBe(before);
  });

  it("retains prior transfer provenance when arranging an explicitly identified copy", async () => {
    const { editor, destination } = fixture();
    editor.currentPage = destination;
    destination.root.children[0]!.setSharedPluginData(
      "penpair",
      "native-copy",
      '{"runId":"other"}',
    );
    const generated = nativeCopyArrange(
      "file",
      "destination",
      [
        {
          id: "existing",
          x: 20,
          y: 20,
        },
      ],
      "run",
    );
    expect(await execute(generated, editor)).toMatchObject({
      ok: true,
    });
    expect(
      JSON.parse(destination.root.children[0]!.getSharedPluginData("penpair", "native-copy")),
    ).toEqual({
      runId: "run",
      previousRunId: "other",
    });
    expect(await execute(generated, editor)).toMatchObject({
      ok: true,
    });
    expect(
      JSON.parse(destination.root.children[0]!.getSharedPluginData("penpair", "native-copy")),
    ).toEqual({
      runId: "run",
      previousRunId: "other",
    });
  });
});
