export interface TokenDump {
  sets: { order: number; name: string; active: boolean; tokens: string[] }[];
  themes: { group: string; name: string; active: boolean; sets: string[] }[];
}

const toMap = (tokens: string[]): Map<string, string> => new Map(tokens.map((t) => [t.slice(0, t.indexOf("=")), t.slice(t.indexOf("=") + 1)]));

/**
 * The value each token ends up with under a theme: the theme's sets are applied in the order of the set list, so a later set wins.
 */
export function effectiveValues(dump: TokenDump, themeName: string): Map<string, string> {
  const theme = dump.themes.find((t) => t.name === themeName);
  if (!theme) throw new Error(`no theme named ${themeName}`);
  const effective = new Map<string, string>();
  for (const set of [...dump.sets].sort((a, b) => a.order - b.order)) {
    if (!theme.sets.includes(set.name)) continue;
    for (const [name, value] of toMap(set.tokens)) effective.set(name, value);
  }
  return effective;
}

export interface EffectiveDiff {
  added: string[];
  removed: string[];
  changed: { name: string; before: string; after: string }[];
}

/** What changed in the values a theme resolves to. Object-valued tokens (shadows, typography) compare by name only. */
export function diffEffective(before: Map<string, string>, after: Map<string, string>): EffectiveDiff {
  const objectLike = (value: string | undefined): boolean => value !== undefined && value.includes("[object");
  const added = [...after.keys()].filter((name) => !before.has(name));
  const removed = [...before.keys()].filter((name) => !after.has(name));
  const changed = [...after.keys()]
    .filter((name) => before.has(name) && before.get(name) !== after.get(name) && !objectLike(after.get(name)) && !objectLike(before.get(name)))
    .map((name) => ({ name, before: before.get(name) as string, after: after.get(name) as string }));
  return { added, removed, changed };
}
