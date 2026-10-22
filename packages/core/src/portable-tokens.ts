/** Deliberately bounded subset of the published DTCG 2025.10 format; no Penpot arithmetic or native writes. */
export interface PortableToken {
  path: string[];
  type: string;
  value: unknown;
  description?: string;
  extensions?: unknown;
}
export interface PortableTokens {
  schemaVersion: 1;
  kind: "portable-tokens";
  format: "dtcg-2025.10-subset";
  tokens: PortableToken[];
  groups: Record<
    string,
    {
      type?: string;
      description?: string;
      extensions?: unknown;
    }
  >;
  losses: string[];
}
const types = [
  "color",
  "dimension",
  "number",
  "fontFamily",
  "fontWeight",
  "typography",
];
const isObject = (v: unknown): v is Record<string, unknown> =>
  Boolean(v && typeof v === "object" && !Array.isArray(v));
const aliasPath = (v: unknown): string | undefined =>
  typeof v === "string" && /^\{[^{}]+\}$/.test(v) ? v.slice(1, -1) : undefined;
function fail(message: string): never {
  throw new Error("Portable token subset: " + message);
}
export function importDtcg(raw: unknown): PortableTokens {
  if (!isObject(raw) || JSON.stringify(raw).length > 8 * 1024 * 1024) {
    fail("input must be a bounded JSON object");
  }
  let groupCount = 0;
  const tokens: PortableToken[] = [];
  const groups: PortableTokens["groups"] = Object.create(null);
  const visit = (node: Record<string, unknown>, path: string[], inherited?: string): void => {
    if (path.length > 32 || tokens.length > 10000) {
      fail("depth/token budget exceeded");
    }
    for (const key of Object.keys(node)) {
      if (
        key.startsWith("$") &&
        ![
          "$value",
          "$type",
          "$description",
          "$extensions",
        ].includes(key)
      ) {
        fail(`unsupported metadata/reference ${key}`);
      }
    }
    const type = typeof node.$type === "string" ? node.$type : inherited;
    if (
      node.$type !== undefined &&
      (typeof node.$type !== "string" || !types.includes(node.$type))
    ) {
      fail("type must be a string");
    }
    if (node.$description !== undefined && typeof node.$description !== "string") {
      fail("description must be a string");
    }
    if (node.$extensions !== undefined && !isObject(node.$extensions)) {
      fail("extensions must be an object");
    }
    if ("$value" in node) {
      if (
        !path.length ||
        !type ||
        !types.includes(type) ||
        Object.keys(node).some((k) => !k.startsWith("$"))
      ) {
        fail("unsupported token type or mixed token/group");
      }
      tokens.push({
        path,
        type,
        value: structuredClone(node.$value),
        ...(node.$description !== undefined
          ? {
              description: node.$description as string,
            }
          : {}),
        ...(node.$extensions !== undefined
          ? {
              extensions: structuredClone(node.$extensions),
            }
          : {}),
      });
      return;
    }
    if (++groupCount > 10000) {
      fail("group budget exceeded");
    }
    groups[path.join(".")] = {
      ...(node.$type
        ? {
            type: String(node.$type),
          }
        : {}),
      ...(node.$description !== undefined
        ? {
            description: node.$description as string,
          }
        : {}),
      ...(node.$extensions !== undefined
        ? {
            extensions: structuredClone(node.$extensions),
          }
        : {}),
    };
    for (const [key, value] of Object.entries(node)) {
      if (key.startsWith("$")) {
        continue;
      }
      if (!key || /[.{}\x00-\x1f]/.test(key) || !isObject(value)) {
        fail("invalid token/group path");
      }
      visit(
        value,
        [
          ...path,
          key,
        ],
        type,
      );
    }
  };
  visit(raw, []);
  if (!tokens.length || tokens.length > 10000) {
    fail("requires 1–10000 tokens");
  }
  const portable: PortableTokens = {
    schemaVersion: 1,
    kind: "portable-tokens",
    format: "dtcg-2025.10-subset",
    tokens: tokens.sort((a, b) => a.path.join(".").localeCompare(b.path.join("."))),
    groups,
    losses: [],
  };
  validatePortableValues(portable);
  return portable;
}
function validatePortableValues(document: PortableTokens): void {
  const byPath = new Map(
    document.tokens.map((t) => [
      t.path.join("."),
      t,
    ]),
  );
  const resolved = new Map<string, unknown>();
  if (byPath.size !== document.tokens.length) {
    fail("duplicate token path");
  }
  const resolveToken = (name: string, expected: string, chain: string[]): unknown => {
    const token = byPath.get(name);
    if (!token || token.type !== expected) {
      fail(`missing/type-mismatched alias ${name}`);
    }
    if (chain.includes(name)) {
      fail(
        "alias cycle: " +
          [
            ...chain,
            name,
          ].join(" -> "),
      );
    }
    if (chain.length > 64) {
      fail("alias depth exceeds 64");
    }
    if (resolved.has(name)) {
      return resolved.get(name);
    }
    const value = validateValue(token.type, token.value, [
      ...chain,
      name,
    ]);
    resolved.set(name, value);
    return value;
  };
  const validateValue = (type: string, value: unknown, chain: string[]): unknown => {
    const ref = aliasPath(value);
    if (ref !== undefined) {
      return resolveToken(ref, type, chain);
    }
    if (isObject(value) && "$ref" in value) {
      fail("JSON Pointer property references are outside this subset");
    }
    if (type === "number" && (typeof value !== "number" || !Number.isFinite(value))) {
      fail("number must be finite");
    }
    if (
      type === "fontWeight" &&
      (typeof value !== "number" || !Number.isFinite(value) || value < 1 || value > 1000)
    ) {
      fail("fontWeight supports numeric 1–1000 only");
    }
    if (
      type === "fontFamily" &&
      !(
        (typeof value === "string" && value.length > 0) ||
        (Array.isArray(value) &&
          value.length > 0 &&
          value.length <= 100 &&
          value.every((v) => typeof v === "string" && v.length > 0))
      )
    ) {
      fail("fontFamily must be a name or ordered names");
    }
    if (
      type === "dimension" &&
      (!isObject(value) ||
        Object.keys(value).some(
          (k) =>
            ![
              "value",
              "unit",
            ].includes(k),
        ) ||
        typeof value.value !== "number" ||
        !Number.isFinite(value.value) ||
        ![
          "px",
          "rem",
        ].includes(String(value.unit)))
    ) {
      fail("dimension supports explicit finite px/rem values");
    }
    if (
      type === "color" &&
      (!isObject(value) ||
        Object.keys(value).some(
          (k) =>
            ![
              "colorSpace",
              "components",
              "alpha",
              "hex",
            ].includes(k),
        ) ||
        ![
          "srgb",
          "display-p3",
        ].includes(String(value.colorSpace)) ||
        !Array.isArray(value.components) ||
        value.components.length !== 3 ||
        value.components.some(
          (c) => typeof c !== "number" || !Number.isFinite(c) || c < 0 || c > 1,
        ) ||
        (value.alpha !== undefined &&
          (typeof value.alpha !== "number" ||
            !Number.isFinite(value.alpha) ||
            value.alpha < 0 ||
            value.alpha > 1)) ||
        (value.hex !== undefined &&
          (typeof value.hex !== "string" || !/^#[0-9a-f]{6}$/i.test(value.hex))))
    ) {
      fail("color supports finite srgb/display-p3 components in 0..1 and optional alpha/hex");
    }
    if (type === "typography") {
      if (
        !isObject(value) ||
        Object.keys(value).some(
          (k) =>
            ![
              "fontFamily",
              "fontSize",
              "fontWeight",
              "letterSpacing",
              "lineHeight",
            ].includes(k),
        )
      ) {
        fail("typography property outside subset");
      }
      const fields = {
        fontFamily: "fontFamily",
        fontSize: "dimension",
        fontWeight: "fontWeight",
        letterSpacing: "dimension",
        lineHeight: "number",
      };
      const result: Record<string, unknown> = {};
      for (const [key, expected] of Object.entries(fields)) {
        result[key] = validateValue(expected, value[key], chain);
      }
      if (Number(result.lineHeight) <= 0) {
        fail("lineHeight must be positive");
      }
      return result;
    }
    if (!types.includes(type)) {
      fail("unsupported type " + type);
    }
    return value;
  };
  for (const token of document.tokens) {
    resolveToken(token.path.join("."), token.type, []);
  }
}
export function exportDtcg(raw: unknown): Record<string, unknown> {
  const v = raw as PortableTokens;
  if (
    !v ||
    JSON.stringify(v).length > 8 * 1024 * 1024 ||
    v.schemaVersion !== 1 ||
    v.kind !== "portable-tokens" ||
    v.format !== "dtcg-2025.10-subset" ||
    !Array.isArray(v.tokens) ||
    !v.tokens.length ||
    v.tokens.length > 10000 ||
    !isObject(v.groups) ||
    !Array.isArray(v.losses) ||
    v.losses.length
  ) {
    fail("unsupported/incomplete portable schema; use import-tokens on a supported document");
  }
  const root: Record<string, unknown> = Object.create(null);
  const group = (path: string[]): Record<string, unknown> => {
    let current = root;
    for (const key of path) {
      if (!key || key.startsWith("$") || /[.{}\x00-\x1f]/.test(key)) {
        fail("invalid path");
      }
      const next = current[key];
      if (next !== undefined && (!isObject(next) || "$value" in next)) {
        fail("group/token collision");
      }
      current = (current[key] ??= Object.create(null)) as Record<string, unknown>;
    }
    return current;
  };
  for (const [key, metadata] of Object.entries(v.groups)) {
    if (
      !isObject(metadata) ||
      Object.keys(metadata).some(
        (k) =>
          ![
            "type",
            "description",
            "extensions",
          ].includes(k),
      )
    ) {
      fail("invalid group metadata");
    }
    const target = group(key ? key.split(".") : []);
    if (metadata.type !== undefined) {
      target.$type = metadata.type;
    }
    if (metadata.description !== undefined) {
      target.$description = metadata.description;
    }
    if (metadata.extensions !== undefined) {
      target.$extensions = metadata.extensions;
    }
  }
  for (const token of v.tokens) {
    if (
      !token ||
      !Array.isArray(token.path) ||
      !token.path.length ||
      token.path.length > 32 ||
      token.path.some((p) => typeof p !== "string")
    ) {
      fail("invalid token path");
    }
    const target = group(token.path.slice(0, -1));
    const key = token.path.at(-1)!;
    if (!key || key.startsWith("$") || /[.{}\x00-\x1f]/.test(key) || key in target) {
      fail("token/group collision");
    }
    target[key] = {
      $type: token.type,
      $value: structuredClone(token.value),
      ...(token.description !== undefined
        ? {
            $description: token.description,
          }
        : {}),
      ...(token.extensions !== undefined
        ? {
            $extensions: structuredClone(token.extensions),
          }
        : {}),
    };
  }
  // Re-import validates metadata and aliases; export never silently drops unsupported native formulas/units.
  importDtcg(root);
  return root;
}
