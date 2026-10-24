import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { encodeBaselineImage } from "../src/image-codec.js";
import { inspectImageEvidence } from "../src/image-evidence.js";

const pixels = Buffer.from([
  255,
  0,
  0,
  255,
  0,
  255,
  0,
  128,
  21,
  45,
  89,
  0,
  0,
  0,
  255,
  255,
]);

async function sourcePng(profile = false): Promise<Buffer> {
  const image = sharp(pixels, {
    raw: {
      width: 2,
      height: 2,
      channels: 4,
    },
  });
  return (profile ? image.withIccProfile("srgb") : image).png().toBuffer();
}

describe("baseline image encoding", () => {
  it.each([
    false,
    true,
  ])("deterministically preserves RGBA, dimensions and ICC (profile: %s)", async (profile) => {
    const png = await sourcePng(profile);
    const webp = await encodeBaselineImage(png, "webp");
    expect(webp).toEqual(await encodeBaselineImage(png, "webp"));
    expect(inspectImageEvidence(webp)).toEqual({
      format: "webp",
      width: 2,
      height: 2,
    });
    expect(await sharp(webp).ensureAlpha().raw().toBuffer()).toEqual(
      await sharp(png).ensureAlpha().raw().toBuffer(),
    );
    expect((await sharp(webp).metadata()).icc).toEqual((await sharp(png).metadata()).icc);
    if (!profile) {
      expect(await sharp(webp).ensureAlpha().raw().toBuffer()).toEqual(pixels);
    }
  });

  it("preserves legacy PNG bytes exactly", async () => {
    const png = await sourcePng();
    expect(await encodeBaselineImage(png, "png")).toEqual(png);
  });

  it("rejects oversized compressed input and decoded dimensions before decoding", async () => {
    await expect(encodeBaselineImage(Buffer.alloc(64 * 1024 * 1024 + 1), "webp")).rejects.toThrow(
      /64 MiB/,
    );
    const png = await sourcePng();
    png.writeUInt32BE(8001, 16);
    png.writeUInt32BE(8000, 20);
    await expect(encodeBaselineImage(png, "webp")).rejects.toThrow(/64-megapixel/);
  });

  it("rejects 16-bit PNG, animation chunks and malformed compressed data", async () => {
    const sixteenBit = await sharp({
      create: {
        width: 1,
        height: 1,
        channels: 3,
        background: "red",
      },
    })
      .toColourspace("rgb16")
      .png()
      .toBuffer();
    await expect(encodeBaselineImage(sixteenBit, "webp")).rejects.toThrow(/static 8-bit/);
    const png = await sourcePng();
    const animation = Buffer.alloc(20);
    animation.writeUInt32BE(8, 0);
    animation.write("acTL", 4);
    await expect(
      encodeBaselineImage(
        Buffer.concat([
          png,
          animation,
        ]),
        "webp",
      ),
    ).rejects.toThrow(/static 8-bit/);
    await expect(encodeBaselineImage(png.subarray(0, png.length - 3), "webp")).rejects.toThrow(
      /Truncated/,
    );
  });
});
