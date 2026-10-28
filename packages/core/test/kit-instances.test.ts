import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkKits, coreKit, instanceKit, kit, loadKits } from "../src/kit.js";
import { instanceKitSource } from "../src/kit-instances.js";
import { kitFixture } from "./helpers/kit-fixture.js";

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const load = async (penpot: unknown) =>
  new AsyncFunction("penpot", `${kit()}\n${instanceKitSource}\nreturn pp;`)(penpot);

type Fixture = ReturnType<typeof kitFixture>;
type Shape = InstanceType<Fixture["Shape"]> & Record<string, unknown>;

/** A component whose instances are a board with the given text children and an icon-like path, resizable like Penpot's. */
function world(
  texts: string[] = [
    "Label",
  ],
) {
  const f = kitFixture();
  (f.Shape.prototype as unknown as Record<string, unknown>).insertChild = function (
    this: Shape,
    index: number,
    child: Shape,
  ) {
    if (child.parent) {
      child.parent.children = child.parent.children.filter((item) => item !== child);
    }
    child.parent = this;
    this.children.splice(index, 0, child);
  };
  const names = new Map<
    string,
    {
      path: string;
      name: string;
    }
  >();
  const register = (
    path: string,
    name: string,
    build: (shape: Shape) => void,
    size = [
      130,
      40,
    ],
  ) => {
    const component = {
      path,
      name,
      instance: () => {
        const instance = new f.Shape("board") as Shape;
        instance.width = size[0]!;
        instance.height = size[1]!;
        build(instance);
        names.set(instance.id, {
          path,
          name,
        });
        (
          instance as unknown as {
            component: () => unknown;
          }
        ).component = () => ({
          id: `${path}/${name}`,
          path,
          name,
        });
        return instance;
      },
    };
    f.library.components.push(component);
    return component;
  };
  const withTexts = (values: string[]) => (instance: Shape) => {
    for (const value of values) {
      const text = new f.Shape("text") as Shape;
      text.type = "text";
      text.characters = value;
      instance.appendChild(text);
    }
  };
  return {
    f,
    register,
    withTexts,
    names,
  };
}

describe("instance kit", () => {
  it("is a valid kit after the core kit and refuses to come first", async () => {
    expect(
      checkKits([
        coreKit,
        instanceKit,
      ]),
    ).toMatchObject({
      valid: true,
    });
    expect(
      checkKits([
        instanceKit,
        coreKit,
      ]).problems.join(),
    ).toMatch(/requires earlier include @kit/);
    const root = await mkdtemp(path.join(os.tmpdir(), "penpair-kits-"));
    expect(
      (
        await loadKits(root, [
          "@kit",
          "@instances",
        ])
      ).map((entry) => entry.include),
    ).toEqual([
      "@kit",
      "@instances",
    ]);
  });

  it("names the component with its path", async () => {
    const { f, register, withTexts } = world();
    register(
      "Controls",
      "Primary",
      withTexts([
        "Go",
      ]),
    );
    const pp = await load(f.penpot);
    const instance = pp.inst(f.root, "Controls", "Primary");
    expect(pp.componentName(instance)).toMatchObject({
      path: "Controls",
      name: "Primary",
      full: "Controls / Primary",
    });
    expect(() => pp.componentName(new f.Shape("board"))).toThrow(/component instance is required/);
  });

  it("swaps at the same index, carrying texts in reading order and the original size", async () => {
    const { f, register, withTexts } = world();
    register(
      "Controls",
      "Primary",
      withTexts([
        "Try again",
        "Hint",
      ]),
      [
        91,
        16,
      ],
    );
    register(
      "Controls",
      "Secondary",
      withTexts([
        "Default",
        "Other",
      ]),
      [
        130,
        40,
      ],
    );
    const pp = await load(f.penpot);
    const before = new f.Shape("board") as Shape;
    const parent = new f.Shape("board") as Shape;
    f.root.appendChild(parent);
    parent.appendChild(before);
    const old = pp.inst(parent, "Controls", "Primary");
    old.children[0].characters = "Send";
    old.children[1].characters = "Later";
    old.resize(130, 40);
    const after = new f.Shape("board") as Shape;
    parent.appendChild(after);
    const fresh = pp.swap(old, "Controls / Secondary");
    expect(parent.children).toEqual([
      before,
      fresh,
      after,
    ]);
    expect(fresh.children.map((child: Shape) => child.characters)).toEqual([
      "Send",
      "Later",
    ]);
    expect([
      fresh.width,
      fresh.height,
    ]).toEqual([
      130,
      40,
    ]);
    expect(parent.children).not.toContain(old);
  });

  it("keeps fill sizing and can leave size and text alone", async () => {
    const { f, register, withTexts } = world();
    register(
      "C",
      "A",
      withTexts([
        "a",
      ]),
    );
    register(
      "C",
      "B",
      withTexts([
        "b",
      ]),
      [
        50,
        20,
      ],
    );
    const pp = await load(f.penpot);
    const old = pp.inst(f.root, "C", "A");
    old.layoutChild.horizontalSizing = "fill";
    const fresh = pp.swap(old, "C / B");
    expect(fresh.layoutChild.horizontalSizing).toBe("fill");
    expect(fresh.children[0].characters).toBe("a");
    const plain = pp.inst(f.root, "C", "A");
    const other = pp.swap(plain, "C / B", {
      keepText: false,
      keepSize: false,
    });
    expect(other.children[0].characters).toBe("b");
    expect([
      other.width,
      other.height,
    ]).toEqual([
      50,
      20,
    ]);
  });

  it("keeps the original when the texts do not line up or the component is missing", async () => {
    const { f, register, withTexts } = world();
    register(
      "C",
      "A",
      withTexts([
        "a",
        "b",
      ]),
    );
    register(
      "C",
      "B",
      withTexts([
        "x",
      ]),
    );
    const pp = await load(f.penpot);
    const old = pp.inst(f.root, "C", "A");
    expect(() => pp.swap(old, "C / B")).toThrow(/Text count differs.*original was kept/);
    expect(f.root.children).toContain(old);
    expect(f.root.children.filter((child) => child.type === "board")).toHaveLength(1);
    expect(() => pp.swap(old, "C / Missing")).toThrow(/missing or ambiguous/);
    const carried = pp.swap(old, "C / B", {
      allowTextMismatch: true,
    });
    expect(carried.children[0].characters).toBe("a");
  });

  it("scales the nested shapes a plain resize leaves behind", async () => {
    const { f, register } = world();
    register(
      "Icons",
      "CheckCircle",
      (instance) => {
        const glyph = new f.Shape("path") as Shape;
        glyph.width = 33;
        glyph.height = 33;
        glyph.x = 0;
        glyph.y = 0;
        instance.appendChild(glyph);
      },
      [
        40,
        40,
      ],
    );
    const pp = await load(f.penpot);
    const icon = pp.inst(f.root, "Icons", "CheckCircle");
    const report = pp.iconSize(icon, 20);
    expect([
      icon.width,
      icon.height,
    ]).toEqual([
      20,
      20,
    ]);
    expect(icon.children[0].width).toBeCloseTo(16.5);
    expect(report).toMatchObject({
      scale: 0.5,
      scaled: 1,
      overflow: false,
    });
    expect(() => pp.iconSize(icon, 0)).toThrow(/positive/);
  });

  it("recolours a library icon by binding the token on its inner paths", async () => {
    const { f, register } = world();
    register(
      "Icons",
      "Check",
      (instance) => {
        const glyph = new f.Shape("path") as Shape;
        glyph.strokes = [
          {
            strokeColor: "#000000",
          },
        ];
        instance.appendChild(glyph);
      },
      [
        24,
        24,
      ],
    );
    register(
      "Icons",
      "Empty",
      () => undefined,
      [
        24,
        24,
      ],
    );
    const pp = await load(f.penpot);
    const icon = pp.libraryIcon(f.root, "Icons", "Check", "ink", 20);
    expect(icon.width).toBe(20);
    await pp.flush();
    expect(icon.children[0].tokens.strokeColor).toBe("ink");
    expect(() => pp.libraryIcon(f.root, "Icons", "Empty", "ink")).toThrow(
      /no stroked or filled inner shape/,
    );
  });
});
