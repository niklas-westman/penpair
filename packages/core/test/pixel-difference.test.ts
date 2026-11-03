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
