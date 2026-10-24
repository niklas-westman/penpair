import { createHash } from "node:crypto";
import { mkdtemp, open, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { hashImageBytes, readImageEvidence } from "../src/image-evidence.js";
import {
  extendedLosslessWebp,
  losslessWebp,
  lossyWebp,
  webpChunk,
  webpContainer,
} from "./helpers/image-fixture.js";
import { png } from "./helpers/reflection-fixture.js";

async function readFixture(bytes: Buffer) {
  const root = await mkdtemp(path.join(os.tmpdir(), "penpair-image-"));
  await writeFile(path.join(root, "evidence.data"), bytes);

  return readImageEvidence(root, "evidence.data");
}

describe("image evidence headers", () => {
  it.each([
    png,
    losslessWebp,
    extendedLosslessWebp,
  ])("reads PNG and static lossless WebP by bytes, preserving hashes", async (bytes) => {
    expect(await readFixture(bytes)).toEqual({
      bytes,
      width: 1,
      height: 1,
    });
    expect(hashImageBytes(bytes)).toBe(createHash("sha256").update(bytes).digest("hex"));
  });

  it("extracts both 14-bit VP8L dimensions", async () => {
    const bytes = Buffer.from(losslessWebp);
    bytes.writeUInt32LE((1234 - 1) | ((9876 - 1) << 14), 21);
    expect(await readFixture(bytes)).toMatchObject({
      width: 1234,
      height: 9876,
    });
  });

  it("rejects lossy WebP and unrelated bytes", async () => {
    await expect(readFixture(lossyWebp)).rejects.toThrow(/PNG or static lossless WebP/);
    await expect(readFixture(Buffer.from("not an image"))).rejects.toThrow(
      /PNG or static lossless WebP/,
    );
  });

  it.each([
    "ANIM",
    "ANMF",
    "ALPH",
  ])("rejects unsupported %s chunks even without a feature flag", async (chunk) => {
    await expect(
      readFixture(webpContainer(losslessWebp.subarray(12), webpChunk(chunk, Buffer.alloc(8)))),
    ).rejects.toThrow(/PNG or static lossless WebP/);
  });

  it.each([
    0x01,
    0x02,
    0x40,
    0x80,
  ])("rejects animation or reserved VP8X flag %i", async (flag) => {
    const bytes = Buffer.from(extendedLosslessWebp);
    bytes[20] = flag;
    await expect(readFixture(bytes)).rejects.toThrow(/Malformed/);
  });

  it("rejects reserved VP8X bytes and inconsistent canvas dimensions", async () => {
    for (const offset of [
      21,
      22,
      23,
      24,
      27,
    ]) {
      const bytes = Buffer.from(extendedLosslessWebp);
      bytes[offset] = 1;
      await expect(readFixture(bytes)).rejects.toThrow(/Malformed/);
    }
  });

  it.each([
    0x20,
    0x40,
    0x80,
  ])("rejects nonzero VP8L version bits %i", async (version) => {
    const bytes = Buffer.from(losslessWebp);
    bytes[24] = version;
    await expect(readFixture(bytes)).rejects.toThrow(/Malformed/);
  });

  it("rejects missing or duplicate image and dimension chunks", async () => {
    const extendedChunk = extendedLosslessWebp.subarray(12, 30);
    for (const bytes of [
      webpContainer(extendedChunk),
      webpContainer(losslessWebp.subarray(12), losslessWebp.subarray(12)),
      webpContainer(extendedChunk, extendedChunk, losslessWebp.subarray(12)),
      webpContainer(losslessWebp.subarray(12), extendedChunk),
      webpContainer(webpChunk("VP8X", Buffer.alloc(9)), losslessWebp.subarray(12)),
      webpContainer(
        webpChunk(
          "VP8L",
          Buffer.from([
            0x2f,
            0,
            0,
            0,
            0,
          ]),
        ),
      ),
    ]) {
      await expect(readFixture(bytes)).rejects.toThrow(/Malformed/);
    }
  });

  it("rejects truncated containers, oversized chunks, trailing data and invalid padding", async () => {
    const oversizedChunk = Buffer.from(losslessWebp);
    oversizedChunk.writeUInt32LE(1000, 16);
    const invalidPadding = Buffer.from(losslessWebp);
    invalidPadding[invalidPadding.length - 1] = 1;
    const badSignature = Buffer.from(losslessWebp);
    badSignature[20] = 0;
    const nonAsciiChunk = Buffer.from(losslessWebp);
    nonAsciiChunk[15] = 0xcc;
    const shortChunk = webpContainer(Buffer.from("VP8L"));

    for (const bytes of [
      losslessWebp.subarray(0, losslessWebp.length - 1),
      oversizedChunk,
      invalidPadding,
      badSignature,
      nonAsciiChunk,
      shortChunk,
      Buffer.concat([
        losslessWebp,
        Buffer.from([
          0,
        ]),
      ]),
    ]) {
      await expect(readFixture(bytes)).rejects.toThrow(/Malformed/);
    }
  });

  it("rejects zero PNG dimensions", async () => {
    const bytes = Buffer.from(png);
    bytes.writeUInt32BE(0, 16);
    await expect(readFixture(bytes)).rejects.toThrow(/PNG or static lossless WebP/);
  });

  it("retains the 64 MiB file limit before reading evidence", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "penpair-image-"));
    const file = await open(path.join(root, "oversized.webp"), "w");
    try {
      await file.truncate(64 * 1024 * 1024 + 1);
    } finally {
      await file.close();
    }

    await expect(readImageEvidence(root, "oversized.webp")).rejects.toThrow(/64 MiB/);
  });
});
