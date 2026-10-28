import { describe, expect, it } from "vitest";
import { checkKits, coreKit, kit } from "../src/kit.js";
import { compiles } from "../src/snippet.js";
import { kitFixture } from "./helpers/kit-fixture.js";
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const load = async (penpot: unknown) => new AsyncFunction("penpot", kit() + "\nreturn pp;")(penpot);
describe("neutral plugin build kit", () => {
  it("compiles below its source budget and inclusion defines recipes without reading or changing the document", async () => {
    expect(compiles(kit())).toBeUndefined();
    expect(
      checkKits([
        coreKit,
      ]),
    ).toMatchObject({
      valid: true,
      bytes: expect.any(Number),
    });
    expect(Buffer.byteLength(kit())).toBeLessThan(32768);
    const pp = await load(
      new Proxy(
        {},
        {
          get() {
            throw new Error("No top-level API access");
          },
        },
      ),
    );
    expect(pp.recipes()).toEqual(coreKit.recipes);
  });
  it("uses only active sets in actual precedence order and refuses missing/ambiguous tokens", async () => {
    const f = kitFixture();
    const pp = await load(f.penpot);
    const first = f.sets[0]!;
    f.sets.push({
      ...first,
      id: "overlay",
      name: "Overlay",
      tokens: [
        {
          name: "ink",
          type: "color",
          value: "#123456",
          resolvedValue: "#123456",
        },
      ],
    });
    expect(pp.tok("ink").value).toBe("#123456");
    f.sets[1]!.active = false;
    expect(pp.tok("ink").value).toBe("#000000");
    f.sets[0]!.tokens.push({
      name: "ink",
      type: "color",
      value: "#000000",
      resolvedValue: "#000000",
    });
    expect(() => pp.tok("ink")).toThrow(/Ambiguous/);
  });
  it("applies every pending value/font before token bindings and awaits asynchronous bind recording", async () => {
    const f = kitFixture();
    const pp = await load(f.penpot);
    const box = pp.box(null, {
      name: "Card",
      gap: "space",
      pad: [
        "space",
        0,
        "space",
        0,
      ],
      bg: "surface",
      stroke: "ink",
      radius: "radius",
      w: 240,
    });
    const text = pp.text(box, "Hello", {
      typo: "body",
      color: "ink",
      wrap: true,
    });
    expect(box.tokens).toEqual({});
    expect(text.tokens).toEqual({});
    const report = await pp.flush();
    expect(report.layout.stable).toBe(true);
    expect(box.tokens).toMatchObject({
      rowGap: "space",
      columnGap: "space",
      paddingTop: "space",
      fill: "surface",
      strokeColor: "ink",
      borderRadiusTopLeft: "radius",
    });
    expect(text.tokens).toMatchObject({
      typography: "body",
      fill: "ink",
    });
    const firstBind = f.events.findIndex((event) => event.includes(":bind:"));
    expect(
      f.events.findLastIndex(
        (event) =>
          event.includes(":flex:") || event.includes(":font-face") || event.includes(":strokes"),
      ),
    ).toBeLessThan(firstBind);
  });
  it("preserves existing spacing and bindings when only a color style changes", async () => {
    const f = kitFixture();
    const pp = await load(f.penpot);
    const board = pp.box(null, {
      gap: "space",
      pad: [
        "space",
        0,
        0,
        0,
      ],
    });
    await pp.flush();
    pp.style(board, {
      bg: "surface",
    });
    await pp.flush();
    expect(board.flex.rowGap).toBe(4);
    expect(board.flex.topPadding).toBe(4);
    expect(board.tokens).toMatchObject({
      rowGap: "space",
      paddingTop: "space",
      fill: "surface",
    });
  });
  it("refuses non-token spacing, blank text, missing fonts and token-context changes", async () => {
    const f = kitFixture();
    const pp = await load(f.penpot);
    expect(() =>
      pp.box(null, {
        gap: 8,
      }),
    ).toThrow(/token name/);
    expect(() =>
      pp.text(null, "", {
        typo: "body",
        color: "ink",
      }),
    ).toThrow(/nonempty/);
    expect(() =>
      pp.text(null, "Hello", {
        typo: "body",
        color: "ink",
        font: "Missing",
      }),
    ).toThrow(/Font unavailable/);
    expect(f.shapes).toHaveLength(1);
    pp.box(null, {
      gap: "space",
    });
    f.sets[0]!.active = false;
    await expect(pp.flush()).rejects.toThrow(/context changed/);
    expect(f.events.some((event) => event.includes(":bind:"))).toBe(false);
  });
  it("keeps non-square glyph proportions inside a square wrapper", async () => {
    const f = kitFixture();
    const pp = await load(f.penpot);
    const wrapper = pp.icon(null, "chevron", "ink", 24);
    expect([
      wrapper.width,
      wrapper.height,
    ]).toEqual([
      24,
      24,
    ]);
    expect([
      wrapper.children[0].width,
      wrapper.children[0].height,
    ]).toEqual([
      6,
      12,
    ]);
    await pp.flush();
    expect(wrapper.children[0].tokens.strokeColor).toBe("ink");
  });
  it("refuses ambiguous components and named text targets, and changes only requested text content", async () => {
    const f = kitFixture();
    const pp = await load(f.penpot);
    const prototype = new f.Shape("board");
    const sourceText = new f.Shape("text");
    sourceText.name = "Label";
    prototype.appendChild(sourceText);
    let instances = 0;
    const component = {
      path: "Controls",
      name: "Button",
      mainInstance: () => prototype,
      instance: () => {
        instances++;
        const instance = new f.Shape("board");
        const label = new f.Shape("text");
        label.name = "Label";
        instance.appendChild(label);
        return instance;
      },
    };
    f.library.components.push(component, component);
    expect(() =>
      pp.inst(null, "Controls", "Button", {
        Label: "Save",
      }),
    ).toThrow(/ambiguous/);
    expect(instances).toBe(0);
    f.library.components.pop();
    const extra = new f.Shape("text");
    extra.name = "Label";
    prototype.appendChild(extra);
    expect(() =>
      pp.inst(null, "Controls", "Button", {
        Label: "Save",
      }),
    ).toThrow(/ambiguous/);
    expect(instances).toBe(0);
    extra.remove();
    const instance = pp.inst(f.root, "Controls", "Button", {
      Label: "Save",
    });
    expect(instance.children[0].characters).toBe("Save");
    expect(f.events.some((event) => event.endsWith(":remove") && !event.startsWith(extra.id))).toBe(
      false,
    );
  });
  it("reports unstable/malformed/native-failed geometry instead of completing flush", async () => {
    const f = kitFixture();
    const pp = await load(f.penpot);
    f.penpot.waitForLayoutUpdate = undefined as never;
    let width = 0;
    Object.defineProperty(f.root, "width", {
      get: () => ++width,
    });
    expect(
      await pp.settle(f.root, {
        timeoutMs: 10,
        intervalMs: 1,
      }),
    ).toMatchObject({
      stable: false,
    });
    const broken = kitFixture();
    const brokenKit = await load(broken.penpot);
    broken.root.width = NaN;
    expect(await brokenKit.settle()).toMatchObject({
      stable: false,
    });
    await expect(brokenKit.flush()).rejects.toThrow(/geometry/);
  });
  it("refuses a flush budget above the maximum and says what the maximum is", async () => {
    const f = kitFixture();
    const pp = await load(f.penpot);
    await expect(
      pp.flush({
        timeoutMs: 45000,
      }),
    ).rejects.toThrow(/from 1 to 30000 \(got 45000\).*staged flushes/);
    await expect(
      pp.settle(f.root, {
        timeoutMs: 45000,
      }),
    ).resolves.toMatchObject({
      stable: false,
      reason: expect.stringMatching(/timeoutMs must be from 1 to 30000 \(got 45000\)/),
    });
  });
  it("reports what was pending when a flush runs out of time", async () => {
    const f = kitFixture();
    const pp = await load(f.penpot);
    const board = pp.box(null, {
      name: "Heavy",
      bg: "surface",
      stroke: "ink",
      radius: "radius",
      w: 240,
    });
    const slow = board.applyToken.bind(board);
    board.applyToken = async (
      token: {
        name: string;
      },
      properties: string[],
    ) => {
      await new Promise((resolve) => setTimeout(resolve, 60));
      return slow(token, properties);
    };
    const failure = await pp
      .flush({
        timeoutMs: 40,
      })
      .then(
        () => undefined,
        (error: Error) => error,
      );
    expect(failure?.message).toMatch(
      /^Flush deadline exceeded \[phase binds; 1 binds applied, \d+ binds/,
    );
    expect(failure?.message).toMatch(/slowest bind \d+ ms on "Heavy"/);
    expect(failure?.message).toMatch(/ms per phase \{.*"binds":\d+.*\} of a 40 ms budget/);
  });
  it("names the shape that makes the layout geometry malformed", async () => {
    const f = kitFixture();
    const pp = await load(f.penpot);
    f.root.children.push({
      id: "",
      name: null,
      type: undefined,
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      children: [],
    } as never);
    const result = await pp.settle(f.root);
    expect(result.stable).toBe(false);
    expect(result.reason).toMatch(/a shape with no id \(name null.*at index \d+ under/);
  });
  it("lists the project's radius tokens when a raw radius is given", async () => {
    const f = kitFixture();
    const pp = await load(f.penpot);
    expect(() =>
      pp.box(null, {
        radius: 28,
      }),
    ).toThrow(/radius needs a token name; borderRadius tokens: radius/);
    expect(() =>
      pp.box(null, {
        bg: 3,
      }),
    ).toThrow(/^bg needs a token name$/);
  });
});

describe("explicit flush roots", () => {
  it.each([
    undefined,
    null,
    false,
    0,
    -0,
    0n,
    NaN,
    "",
  ])(
    "refuses an explicit empty root (%s) before applying queued work and recovers",
    async (root) => {
      const fixture = kitFixture();
      const helpers = await load(fixture.penpot);
      const card = helpers.box(null, {
        name: "Card",
        w: 120,
        bg: "surface",
      });
      const before = [
        ...fixture.events,
      ];
      const received = typeof root === "string" ? JSON.stringify(root) : String(root);

      await expect(
        helpers.flush({
          root,
        }),
      ).rejects.toThrow(`Flush root must exist (got ${received})`);
      expect(fixture.events).toEqual(before);
      expect(card.tokens).toEqual({});

      const report = await helpers.flush({
        root: card,
      });
      expect(report.layout).toMatchObject({
        stable: true,
        rootIds: [
          card.id,
        ],
      });
      expect(card.tokens).toMatchObject({
        fill: "surface",
      });
    },
  );

  it("keeps page scope for omitted roots and supports explicit arrays", async () => {
    const fixture = kitFixture();
    const helpers = await load(fixture.penpot);
    expect((await helpers.flush()).layout.rootIds).toEqual([
      fixture.root.id,
    ]);
    expect(
      (
        await helpers.flush({
          timeoutMs: 1000,
        })
      ).layout.rootIds,
    ).toEqual([
      fixture.root.id,
    ]);
    const first = helpers.box(null, {
      name: "First",
      w: 100,
    });
    const second = helpers.box(null, {
      name: "Second",
      w: 100,
    });
    expect(
      (
        await helpers.flush({
          root: [
            first,
            second,
          ],
        })
      ).layout.rootIds,
    ).toEqual([
      first.id,
      second.id,
    ]);
    await expect(
      helpers.flush({
        root: [],
      }),
    ).rejects.toThrow(/layout target does not exist/);
    await expect(
      helpers.flush({
        root: [
          undefined,
        ],
      }),
    ).rejects.toThrow(/layout target does not exist/);
    expect(
      (
        await helpers.flush({
          root: first,
        })
      ).layout.stable,
    ).toBe(true);
    expect((await helpers.settle(undefined)).rootIds).toEqual([
      fixture.root.id,
    ]);
  });
});
