import { describe, expect, it } from "vitest";
import { coreKit, checkKits, kit } from "@penpair/core";
import { marwesKit } from "../src/build-kit.js";
import { kitFixture } from "../../core/test/helpers/kit-fixture.js";
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const load = async (penpot: unknown) =>
  new AsyncFunction("penpot", kit() + marwesKit.source + "\nreturn {pp,mw};")(penpot);
describe("adapter-owned recipe source", () => {
  it("compiles after the neutral core and declares exactly its listed recipes without API effects", async () => {
    expect(
      checkKits([
        coreKit,
        marwesKit,
      ]),
    ).toMatchObject({
      valid: true,
    });
    const { pp } = await load(
      new Proxy(
        {},
        {
          get() {
            throw new Error("No top-level API effect");
          },
        },
      ),
    );
    expect(pp.recipes()).toEqual([
      ...coreKit.recipes,
      ...marwesKit.recipes,
    ]);
  });
  it("requires project-derived constants and permits a project's token vocabulary", async () => {
    const f = kitFixture();
    const { pp, mw } = await load(f.penpot);
    expect(() => mw.card(null, {})).toThrow(/radius token/);
    expect(f.shapes).toHaveLength(1);
    const card = mw.card(null, {
      name: "Project card",
      radius: "radius",
      gap: "space",
      pad: [
        "space",
        0,
        0,
        0,
      ],
      surface: "surface",
      border: "ink",
    });
    await pp.flush();
    expect(card.tokens).toMatchObject({
      fill: "surface",
      strokeColor: "ink",
      paddingTop: "space",
      borderRadiusTopLeft: "radius",
    });
  });
  it("validates non-happy inputs and keeps an empty progress fill empty", async () => {
    const f = kitFixture();
    const { pp, mw } = await load(f.penpot);
    expect(() =>
      mw.segmented(null, {
        labels: [
          "One",
          "One",
        ],
        selected: "One",
      }),
    ).toThrow(/distinct/);
    expect(() =>
      mw.progress(null, {
        radius: "radius",
        value: 101,
        width: 100,
        label: "Progress",
      }),
    ).toThrow(/0-100/);
    f.sets[0]!.tokens.push({
      name: "height",
      type: "sizing",
      value: "8",
      resolvedValue: 8,
    });
    const progress = mw.progress(null, {
      radius: "radius",
      value: 0,
      width: 100,
      label: "Progress",
      height: "height",
      gap: "space",
      track: "surface",
      text: {
        typo: "body",
        color: "ink",
      },
    });
    await pp.flush();
    const track = progress.children.find((shape: { name: string }) => shape.name === "Track");
    expect(track.children).toEqual([]);
    expect(track.tokens.height).toBe("height");
  });
});
