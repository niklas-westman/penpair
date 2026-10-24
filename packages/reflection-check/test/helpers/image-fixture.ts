// Real 1×1 red images encoded with sharp 0.35.5; tests need no image decoder.
export const losslessWebp = Buffer.from(
  "UklGRhwAAABXRUJQVlA4TA8AAAAvAAAAAAcQ/Y/+ByKi/wEA",
  "base64",
);
export const lossyWebp = Buffer.from(
  "UklGRjwAAABXRUJQVlA4IDAAAADQAQCdASoBAAEAAUAmJaACdLoB+AADsAD+8ut//NgVzXPv9//S4P0uD9Lg/9KQAAA=",
  "base64",
);

export function webpChunk(name: string, payload: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.write(name, 0, "ascii");
  header.writeUInt32LE(payload.length, 4);

  return Buffer.concat([
    header,
    payload,
    Buffer.alloc(payload.length % 2),
  ]);
}

export function webpContainer(...chunks: Buffer[]): Buffer {
  const header = Buffer.alloc(12);
  header.write("RIFF", 0, "ascii");
  header.write("WEBP", 8, "ascii");
  const bytes = Buffer.concat([
    header,
    ...chunks,
  ]);
  bytes.writeUInt32LE(bytes.length - 8, 4);

  return bytes;
}

export const extendedLosslessWebp = webpContainer(
  webpChunk("VP8X", Buffer.alloc(10)),
  losslessWebp.subarray(12),
);
