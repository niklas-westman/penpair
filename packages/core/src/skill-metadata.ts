import { parseDocument } from "yaml";

export interface SkillMetadata {
  name: string;
  description: string;
}

export const maxSkillBytes = 128 * 1024;

/** Parse data only; aliases and unknown tags cannot expand a local skill file. */
export function parseSkillYaml(source: string): Record<string, unknown> {
  if (Buffer.byteLength(source) > maxSkillBytes) {
    throw new Error("Skill metadata exceeds the 128 KB limit");
  }

  const document = parseDocument(source, {
    uniqueKeys: true,
  });
  if (document.errors.length || document.warnings.length) {
    throw new Error("Invalid skill YAML metadata");
  }

  let value: unknown;
  try {
    value = document.toJS({
      maxAliasCount: 0,
    });
  } catch {
    throw new Error("Skill YAML aliases are not supported");
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Skill YAML metadata must be an object");
  }

  return value as Record<string, unknown>;
}

export function parseSkillMetadata(source: string, expectedName?: string): SkillMetadata {
  if (Buffer.byteLength(source) > maxSkillBytes) {
    throw new Error("SKILL.md exceeds the 128 KB limit");
  }

  const frontmatter = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source);
  if (!frontmatter) {
    throw new Error("SKILL.md requires YAML frontmatter with name and description");
  }

  const metadata = parseSkillYaml(frontmatter[1]!);
  if (
    typeof metadata.name !== "string" ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(metadata.name) ||
    metadata.name.length > 64 ||
    (expectedName !== undefined && metadata.name !== expectedName)
  ) {
    throw new Error("Skill name must match its kebab-case folder (at most 64 characters)");
  }

  if (
    typeof metadata.description !== "string" ||
    !metadata.description.trim() ||
    metadata.description.length > 1024
  ) {
    throw new Error("Skill description must be nonempty text (at most 1024 characters)");
  }

  return {
    name: metadata.name,
    description: metadata.description.trim().replace(/\s+/g, " "),
  };
}
