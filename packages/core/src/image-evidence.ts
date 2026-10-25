import { open } from "node:fs/promises";
import { resolveProjectInput } from "./project-input.js";

export type BaselineImageFormat = "png" | "webp";
export const maximumImageBytes = 64 * 1024 * 1024;

interface ImageSize {
  width: number;
  height: number;
}

function losslessWebpSize(bytes: Buffer): ImageSize {
  const malformed = () => new Error("Malformed static lossless WebP evidence");
  if (bytes.readUInt32LE(4) + 8 !== bytes.length) {
    throw malformed();
  }

  let imageSize: ImageSize | undefined;
  let canvasSize: ImageSize | undefined;
  let offset = 12;

  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) {
      throw malformed();
    }

    const chunk = bytes.subarray(offset, offset + 4).toString("latin1");
    const size = bytes.readUInt32LE(offset + 4);
    const payload = offset + 8;
    const end = payload + size;
    const paddedEnd = end + (size % 2);

    if (paddedEnd > bytes.length || (size % 2 !== 0 && bytes[end] !== 0)) {
      throw malformed();
    }

    if (chunk === "VP8 " || chunk === "ANIM" || chunk === "ANMF" || chunk === "ALPH") {
      throw new Error("Provider evidence must reference PNG or static lossless WebP bytes");
    }

    if (chunk === "VP8X") {
      if (
        offset !== 12 ||
        canvasSize ||
        size !== 10 ||
        (bytes[payload]! & 0xc3) !== 0 ||
        bytes.readUIntLE(payload + 1, 3) !== 0
      ) {
        throw malformed();
      }

      canvasSize = {
        width: bytes.readUIntLE(payload + 4, 3) + 1,
        height: bytes.readUIntLE(payload + 7, 3) + 1,
      };
    } else if (chunk === "VP8L") {
      if (imageSize || size <= 5 || bytes[payload] !== 0x2f) {
        throw malformed();
      }

      const dimensions = bytes.readUInt32LE(payload + 1);
      if (dimensions >>> 29 !== 0) {
        throw malformed();
      }

      imageSize = {
        width: (dimensions & 0x3fff) + 1,
        height: ((dimensions >>> 14) & 0x3fff) + 1,
      };
    } else if (offset === 12) {
      throw malformed();
    }

    offset = paddedEnd;
  }

  if (
    !imageSize ||
    (canvasSize && (canvasSize.width !== imageSize.width || canvasSize.height !== imageSize.height))
  ) {
    throw malformed();
  }

  return imageSize;
}

export interface ImageMetadata extends ImageSize {
  format: BaselineImageFormat;
}

/** Header/container assurance only; this does not decode compressed pixels. */
export function inspectImageEvidence(bytes: Buffer): ImageMetadata {
  if (bytes.length > maximumImageBytes) {
    throw new Error("Image exceeds 64 MiB");
  }
  if (
    bytes.length >= 24 &&
    bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a" &&
    bytes.subarray(12, 16).toString("latin1") === "IHDR"
  ) {
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    if (width > 0 && height > 0) {
      return {
        format: "png",
        width,
        height,
      };
    }
  } else if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("latin1") === "RIFF" &&
    bytes.subarray(8, 12).toString("latin1") === "WEBP"
  ) {
    return {
      format: "webp",
      ...losslessWebpSize(bytes),
    };
  }
  throw new Error("Provider evidence must reference PNG or static lossless WebP bytes");
}

export async function readImageEvidence(
  root: string,
  file: string,
): Promise<
  {
    bytes: Buffer;
  } & ImageMetadata
> {
  const input = await resolveProjectInput(root, file);
  const handle = await open(input, "r");
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > maximumImageBytes) {
      throw new Error("Image exceeds 64 MiB or is not a regular file");
    }
    const buffer = Buffer.alloc(info.size + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null);
      if (bytesRead === 0) {
        break;
      }
      length += bytesRead;
    }
    if (length > info.size) {
      throw new Error("Image changed during bounded read");
    }
    const bytes = buffer.subarray(0, length);
    return {
      bytes,
      ...inspectImageEvidence(bytes),
    };
  } finally {
    await handle.close();
  }
}
