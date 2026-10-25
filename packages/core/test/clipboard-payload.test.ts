import { describe, expect, it } from "vitest";
import { nativeClipboardPayloadMatches } from "../src/clipboard-payload.js";

const fileId = "11111111-1111-4111-8111-111111111111";
const first = "22222222-2222-4222-8222-222222222222";
const second = "33333333-3333-4333-8333-333333333333";
const other = "44444444-4444-4444-8444-444444444444";
const plain = {
  type: "copied-shapes",
  "file-id": fileId,
  selected: [
    first,
    second,
  ],
  objects: {
    [first]: {
      id: first,
    },
    [second]: {
      id: second,
    },
  },
};
const encoded = {
  "~:type": "~:copied-shapes",
  "~:file-id": `~u${fileId}`,
  "~:selected": {
    "~#ordered-set": [
      `~u${first}`,
      `~u${second}`,
    ],
  },
  "~:objects": {
    [`~u${first}`]: {
      "~:id": `~u${first}`,
    },
    [`~u${second}`]: {
      "~:id": `~u${second}`,
    },
  },
};
const validate = (raw: unknown) =>
  nativeClipboardPayloadMatches(JSON.stringify(raw), fileId, [
    first,
    second,
  ]);

describe("browser-local copied-shape identity validation", () => {
  it("accepts plain identity fixtures and known Penpot JSON-verbose Transit", () => {
    expect(validate(plain)).toBe(true);
    expect(validate(encoded)).toBe(true);
    expect(
      validate({
        ...encoded,
        "~:selected": {
          "~#set": [
            `~u${second}`,
            `~u${first}`,
          ],
        },
      }),
    ).toBe(true);
    expect(
      validate({
        ...encoded,
        "~:selected": [
          "~#ordered-set",
          [
            `~u${first}`,
            `~u${second}`,
          ],
        ],
      }),
    ).toBe(true);
  });
  it.each([
    null,
    [],
    "private prior clipboard text",
    {
      ...plain,
      type: "copied-props",
    },
    {
      ...plain,
      "file-id": other,
    },
    {
      ...plain,
      selected: [
        first,
        other,
      ],
    },
    {
      ...plain,
      selected: [
        first,
        first,
      ],
    },
    {
      ...plain,
      selected: [
        first,
      ],
    },
    {
      ...plain,
      selected: [
        first,
        second,
        other,
      ],
    },
    {
      ...plain,
      selected: {
        "~#unknown": [
          first,
          second,
        ],
      },
    },
    {
      ...plain,
      selected: [
        "~#unknown",
        [
          first,
          second,
        ],
      ],
    },
    {
      ...plain,
      objects: {
        [first]: {
          id: first,
        },
      },
    },
    {
      ...plain,
      objects: {
        [first]: {
          id: other,
        },
        [second]: {
          id: second,
        },
      },
    },
    {
      ...plain,
      objects: {
        [first]: {
          id: first,
        },
        [second]: {
          id: second,
        },
        ["~u" + first]: {
          "~:id": "~u" + first,
        },
      },
    },
    {
      ...plain,
      objects: [],
    },
    {
      ...plain,
      "~:type": "~:copied-shapes",
    },
    {
      ...encoded,
      "~:file-id": `~z${fileId}`,
    },
  ])("rejects unknown, stale, ambiguous or mismatched payload %#", (raw) => {
    expect(validate(raw)).toBe(false);
  });
  it("requires bounded distinct expected UUIDs", () => {
    expect(nativeClipboardPayloadMatches(JSON.stringify(plain), fileId, [])).toBe(false);
    expect(
      nativeClipboardPayloadMatches(JSON.stringify(plain), fileId, [
        first,
        first,
      ]),
    ).toBe(false);
    expect(
      nativeClipboardPayloadMatches(JSON.stringify(plain), "file-123", [
        first,
        second,
      ]),
    ).toBe(false);
    expect(
      nativeClipboardPayloadMatches("x".repeat(16 * 1024 * 1024 + 1), fileId, [
        first,
      ]),
    ).toBe(false);
    expect(
      nativeClipboardPayloadMatches("not json", fileId, [
        first,
      ]),
    ).toBe(false);
  });
  it("allows descendant objects while requiring each selected root to identify itself", () => {
    expect(
      validate({
        ...plain,
        objects: {
          ...plain.objects,
          [other]: {
            id: other,
          },
        },
      }),
    ).toBe(true);
    expect(
      validate({
        ...plain,
        objects: {
          ...plain.objects,
          [other]: {
            id: first,
          },
        },
      }),
    ).toBe(false);
  });
});
