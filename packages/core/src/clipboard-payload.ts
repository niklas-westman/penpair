/** A bounded identity check, evaluated inside the browser; clipboard text never leaves that page. */
export function nativeClipboardPayloadMatches(
  text: string,
  fileId: string,
  frameIds: string[],
): boolean {
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  const identity = (value: unknown): string | undefined => {
    if (typeof value !== "string") {
      return undefined;
    }
    const plain = value.startsWith("~u") ? value.slice(2) : value;
    return uuid.test(plain) ? plain.toLowerCase() : undefined;
  };
  const field = (record: Record<string, unknown>, name: string): unknown => {
    const ordinary = Object.hasOwn(record, name);
    const encoded = Object.hasOwn(record, `~:${name}`);
    return ordinary === encoded ? undefined : record[ordinary ? name : `~:${name}`];
  };
  const object = (value: unknown): value is Record<string, unknown> =>
    Boolean(value && typeof value === "object" && !Array.isArray(value));
  if (
    typeof text !== "string" ||
    text.length > 16 * 1024 * 1024 ||
    !uuid.test(fileId) ||
    !Array.isArray(frameIds) ||
    !frameIds.length ||
    frameIds.length > 100 ||
    frameIds.some((id) => typeof id !== "string" || !uuid.test(id)) ||
    new Set(frameIds.map((id) => id.toLowerCase())).size !== frameIds.length
  ) {
    return false;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return false;
  }
  if (!object(raw)) {
    return false;
  }
  const type = field(raw, "type");
  if (
    (type !== "copied-shapes" && type !== "~:copied-shapes") ||
    identity(field(raw, "file-id")) !== fileId.toLowerCase()
  ) {
    return false;
  }
  let selected = field(raw, "selected");
  if (object(selected)) {
    const tags = Object.keys(selected);
    if (
      tags.length !== 1 ||
      ![
        "~#set",
        "~#ordered-set",
      ].includes(tags[0]!)
    ) {
      return false;
    }
    selected = selected[tags[0]!];
  } else if (
    Array.isArray(selected) &&
    selected.length === 2 &&
    typeof selected[0] === "string" &&
    [
      "~#set",
      "~#ordered-set",
    ].includes(selected[0])
  ) {
    selected = selected[1];
  }
  if (!Array.isArray(selected) || selected.length !== frameIds.length) {
    return false;
  }
  const selectedIds = selected.map(identity);
  if (
    selectedIds.some((id) => !id) ||
    new Set(selectedIds).size !== frameIds.length ||
    frameIds.some((id) => !selectedIds.includes(id.toLowerCase()))
  ) {
    return false;
  }
  const objects = field(raw, "objects");
  if (!object(objects)) {
    return false;
  }
  const entries = Object.entries(objects);
  if (entries.length > 20000 || entries.length < frameIds.length) {
    return false;
  }
  const objectIds = new Set<string>();
  for (const [key, value] of entries) {
    const id = identity(key);
    if (!id || objectIds.has(id) || !object(value) || identity(field(value, "id")) !== id) {
      return false;
    }
    objectIds.add(id);
  }
  return frameIds.every((id) => objectIds.has(id.toLowerCase()));
}
