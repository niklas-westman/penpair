import { isExternal, type ProjectConfig } from "./instance/config.js";

export function onboardingChecklist(config: ProjectConfig): {
  schemaVersion: 1;
  project: string;
  origin: string;
  file: ProjectConfig["file"] | null;
  fileUrl: string | null;
  steps: string[];
  warnings: string[];
} {
  const origin = isExternal(config)
    ? config.profile.origin
    : `http://localhost:${config.ports.frontend}`;
  const fileUrl = config.file
    ? `${origin}/#/workspace?file-id=${encodeURIComponent(config.file.id)}`
    : null;
  return {
    schemaVersion: 1,
    project: config.instance,
    origin,
    file: config.file ?? null,
    fileUrl,
    steps: [
      "Clone the project and install its locked dependencies with the repository's package manager.",
      `Ask the owner to invite your own Penpot account to the shared file at ${origin}.`,
      "Create your own personal MCP key. Keep it out of chat, commits and command arguments.",
      "Run the project's penpair connect command; enter your own key in its hidden prompt.",
      config.file
        ? `Open ${config.file.name || config.file.id} (${config.file.id}). Use the owner's full editor link if the direct file link needs team context.`
        : "Ask the owner to pin the shared file with penpair connect --pin-file and commit the pin.",
      "Open the Penpot MCP plugin and Connect. Keep the editor tab open and awake.",
      "Run penpair doctor --json, then a read-only penpair pages before proposing writes.",
      "Coordinate a write window with colleagues. Inspect the plan, apply once, verify independently and review the export.",
    ],
    warnings: [
      ...(!isExternal(config)
        ? [
            "localhost is this computer only. A colleague needs access to a shared reachable deployment; do not share generated instance secrets.",
          ]
        : []),
      ...(!config.file
        ? [
            "No shared file ID is pinned yet.",
          ]
        : []),
      "Writer markers are advisory and do not block human editing or guarantee exclusion across machines.",
    ],
  };
}
