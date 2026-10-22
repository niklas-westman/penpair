import type { TokenSnapshot } from "./tokens.js";
export interface ThemeLintSettings {
  hueThresholdDegrees?: number;
  suppressions?: Array<{
    theme: "light" | "dark";
    token: string;
    reason: string;
  }>;
}
export function readThemeLint(value: unknown): ThemeLintSettings {
  if (value === undefined) {
    return {};
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("marwes.themeLint must be an object");
  }
  const v = value as ThemeLintSettings;
  if (
    Object.keys(v).some(
      (k) =>
        ![
          "hueThresholdDegrees",
          "suppressions",
        ].includes(k),
    ) ||
    (v.hueThresholdDegrees !== undefined &&
      (!Number.isFinite(v.hueThresholdDegrees) ||
        v.hueThresholdDegrees < 0 ||
        v.hueThresholdDegrees > 180))
  ) {
    throw new Error("Invalid theme lint threshold/settings");
  }
  if (
    v.suppressions !== undefined &&
    (!Array.isArray(v.suppressions) ||
      v.suppressions.length > 1000 ||
      v.suppressions.some(
        (s) =>
          !s ||
          ![
            "light",
            "dark",
          ].includes(s.theme) ||
          typeof s.token !== "string" ||
          !s.token ||
          typeof s.reason !== "string" ||
          !s.reason.trim() ||
          s.reason.length > 1000,
      ))
  ) {
    throw new Error("Theme lint suppressions need exact mode/token and a reason");
  }
  return structuredClone(v);
}
function hue(value: unknown):
  | {
      hue: number;
      saturation: number;
    }
  | undefined {
  if (typeof value !== "string" || !/^#[\da-f]{6}(?:ff)?$/i.test(value)) {
    return;
  }
  const [r, g, b] = [
    1,
    3,
    5,
  ].map((i) => parseInt(value.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (!delta) {
    return {
      hue: 0,
      saturation: 0,
    };
  }
  let h = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  h = (((h * 60) % 360) + 360) % 360;
  return {
    hue: h,
    saturation: max === 0 ? 0 : delta / max,
  };
}
function colors(snapshot: TokenSnapshot, mode: string): Map<string, unknown> {
  const result = new Map<string, unknown>();
  const theme = snapshot.themes.find((t) => t.group === "Mode" && t.name.toLowerCase() === mode);
  for (const name of theme?.sets ?? []) {
    for (const token of snapshot.sets.find((s) => s.name === name)?.tokens ?? []) {
      if (token.type === "color") {
        result.set(token.name, token.value);
      }
    }
  }
  return result;
}
export function lintThemeFamily(
  defaults: TokenSnapshot,
  project: TokenSnapshot,
  rawSettings: ThemeLintSettings = {},
) {
  const settings = readThemeLint(rawSettings);
  const warnings: Array<{
    theme: string;
    token: string;
    default: unknown;
    actual: unknown;
    primary: unknown;
    hueDistance: number;
    suppression?: string;
  }> = [];
  const unknown: Array<{
    theme: string;
    token: string;
    reason: string;
  }> = [];
  for (const mode of [
    "light",
    "dark",
  ] as const) {
    const base = colors(defaults, mode);
    const current = colors(project, mode);
    const anchor = "mw-color-primary-base";
    const primary = current.get(anchor);
    const original = base.get(anchor);
    if (primary === undefined || original === undefined || primary === original) {
      continue;
    }
    const anchorHue = hue(primary);
    if (!anchorHue || anchorHue.saturation < 0.15) {
      unknown.push({
        theme: mode,
        token: anchor,
        reason:
          "Primary is transparent, non-literal or achromatic; hue comparison is not meaningful",
      });
      continue;
    }
    for (const [token, value] of current) {
      if (
        !/^mw-color-(?:border-brand|text-(?:brand|link)|focus(?:-.+)?|surface-brand|secondary(?:-.+)?)$/.test(
          token,
        ) ||
        value !== base.get(token)
      ) {
        continue;
      }
      const other = hue(value);
      if (!other || other.saturation < 0.15) {
        unknown.push({
          theme: mode,
          token,
          reason: "Default sibling hue is unavailable or achromatic",
        });
        continue;
      }
      const delta = Math.abs(anchorHue.hue - other.hue);
      const distance = Math.min(delta, 360 - delta);
      if (distance < (settings.hueThresholdDegrees ?? 30)) {
        continue;
      }
      const suppression = settings.suppressions?.find(
        (s) => s.theme === mode && s.token === token,
      )?.reason;
      warnings.push({
        theme: mode,
        token,
        default: base.get(token),
        actual: value,
        primary,
        hueDistance: distance,
        ...(suppression
          ? {
              suppression,
            }
          : {}),
      });
    }
  }
  return {
    schemaVersion: 1,
    kind: "theme-family-lint",
    advisory: true,
    warnings,
    unknown,
    assumptions: [
      "Hue distance on opaque literal colors is a heuristic, not a brand or accessibility rule.",
      "Unchanged family defaults may be intentional; retain a reasoned suppression rather than rewriting them automatically.",
    ],
    changed: false,
  };
}
