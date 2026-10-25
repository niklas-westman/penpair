import { inspectImageEvidence, type BaselineImageFormat } from "./image-evidence.js";

const maximumDecodedPixels = 64_000_000;

function assertStaticPng(bytes: Buffer): void {
  let offset = 8;
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) {
      throw new Error("Truncated PNG cannot be encoded as lossless WebP");
    }
    const length = bytes.readUInt32BE(offset);
    const end = offset + length + 12;
    const chunk = bytes.subarray(offset + 4, offset + 8).toString("latin1");
    if (end > bytes.length) {
      throw new Error("Truncated PNG cannot be encoded as lossless WebP");
    }
    if (chunk === "acTL" || chunk === "fcTL" || chunk === "fdAT") {
      throw new Error("Lossless WebP encoding requires a static 8-bit PNG");
    }
    offset = end;
  }
}

/** Keep PNG byte identity, or deterministically encode the same pixels as lossless WebP. */
export async function encodeBaselineImage(
  png: Buffer,
  format: BaselineImageFormat,
): Promise<Buffer> {
  const source = inspectImageEvidence(png);
  if (source.format !== "png" || (format !== "png" && format !== "webp")) {
    throw new Error("Baseline encoding requires PNG input and png or webp output");
  }
  if (source.width * source.height > maximumDecodedPixels) {
    throw new Error("Baseline image exceeds the 64-megapixel decode budget");
  }
  if (format === "png") {
    return Buffer.from(png);
  }

  assertStaticPng(png);

  const { default: sharp } = await import("sharp");
  const decoder = sharp(png, {
    failOn: "error",
    limitInputPixels: maximumDecodedPixels,
  });
  const metadata = await decoder.metadata();
  if (metadata.depth !== "uchar" || (metadata.pages ?? 1) !== 1 || metadata.bitsPerSample === 16) {
    throw new Error("Lossless WebP encoding requires a static 8-bit PNG");
  }
  const encoded = await decoder
    .keepIccProfile()
    .webp({
      lossless: true,
      exact: true,
      effort: 6,
    })
    .toBuffer();
  const output = inspectImageEvidence(encoded);
  if (
    output.format !== "webp" ||
    output.width !== source.width ||
    output.height !== source.height
  ) {
    throw new Error("Lossless WebP encoding changed image dimensions");
  }
  const verified = sharp(encoded, {
    failOn: "error",
    limitInputPixels: maximumDecodedPixels,
  });
  const encodedMetadata = await verified.metadata();
  if (
    Boolean(metadata.icc) !== Boolean(encodedMetadata.icc) ||
    (metadata.icc && !metadata.icc.equals(encodedMetadata.icc!))
  ) {
    throw new Error("Lossless WebP encoding changed the ICC profile");
  }
  const before = await sharp(png, {
    failOn: "error",
    limitInputPixels: maximumDecodedPixels,
  })
    .ensureAlpha()
    .raw()
    .toBuffer();
  const after = await verified.ensureAlpha().raw().toBuffer();
  if (!before.equals(after)) {
    throw new Error("Lossless WebP encoding changed RGBA pixels");
  }

  return encoded;
}
