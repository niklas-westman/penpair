import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { measurePixelDifference } from "../src/design-releases/fidelity.js";

const solid = (value: number, overrides: Record<number, number> = {}): Promise<Buffer> => {
  const width = 10;
  const height = 10;
  const raw = Buffer.alloc(width * height * 4, value);
  for (const [offset, replacement] of Object.entries(overrides)) {
    raw[Number(offset)] = replacement;
  }
  return sharp(raw, {
    raw: {
      width,
      height,
      channels: 4,
    },
  })
    .png()
    .toBuffer();
};

describe("measurePixelDifference", () => {
  it("reports zero for identical renders", async () => {
    const image = await solid(200);
    expect(await measurePixelDifference(image, image)).toEqual({
      differingPixels: 0,
      totalPixels: 100,
      maxChannelDelta: 0,
    });
  });

  it("counts differing pixels and the largest channel step", async () => {
    const result = await measurePixelDifference(
      await solid(200),
      await solid(200, {
        0: 190,
        4: 203,
        8: 200,
      }),
    );
    expect(result).toEqual({
      differingPixels: 2,
      totalPixels: 100,
      maxChannelDelta: 10,
    });
  });

  it("refuses renders of different sizes", async () => {
    const small = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 4,
        background: "#fff",
      },
    })
      .png()
      .toBuffer();
    await expect(measurePixelDifference(small, await solid(200))).rejects.toThrow(/dimensions/);
  });
});

describe("relativePathContent", () => {
  it("ignores the board position and float32 noise but not a changed shape", async () => {
    const { relativePathContent } = await import("../src/design-releases/fidelity.js");
    const original = relativePathContent("M2257,437L2261,441L2265,437", 2251, 400);
    const moved = relativePathContent(
      "M246.00009155273438,1043L250.00009155273438,1047L254.00009155273438,1043",
      240,
      1006,
    );
    expect(moved.commands).toBe(original.commands);
    moved.numbers.forEach((value, index) => {
      expect(Math.abs(value - original.numbers[index]!)).toBeLessThan(0.001);
    });
    const changed = relativePathContent("M2257,437L2261,445L2265,437", 2251, 400);
    expect(changed.numbers).not.toEqual(original.numbers);
  });

  it("refuses content it cannot compare", async () => {
    const { relativePathContent } = await import("../src/design-releases/fidelity.js");
    expect(() => relativePathContent("m1,1l2,2", 0, 0)).toThrow(/cannot be compared/);
    expect(() => relativePathContent(undefined, 0, 0)).toThrow(/unobservable/);
  });
});
