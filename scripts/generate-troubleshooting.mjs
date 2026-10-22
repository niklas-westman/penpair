import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { errorRemedies } from "../packages/core/dist/errors.js";
export function troubleshootingMarkdown() {
  const rows = Object.entries(errorRemedies)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([code, remedy]) =>
        `| \`${code}\` | ${remedy.replaceAll("|", "\\|").replaceAll("\n", " ")} |`,
    )
    .join("\n");
  return `# Troubleshooting\n\nGenerated from the core error remedy inventory. Regenerate with \`pnpm docs:generate\`; tests detect drift.\n\n| Core code | Cause and next action |\n| --- | --- |\n${rows}\n\n## Other diagnostic domains\n\nConfigError uses \`missing\`, \`unreadable\`, \`invalid-json\` and \`invalid-config\`: repair the named project input; only an absent config can be initialized. Unsupported versions need the producer's migration guidance. These are config-domain codes, not aliases for core connection errors.\n\nCommand interruption uses \`deadline\` and \`cancelled\`; uncertain delivered writes retain exit 4 and their run ID. See [command outcomes](command-contract.md) and [recovery](recovery.md). Argument, lifecycle, registry and adapter errors may have service-specific messages without a stable code: read the named failing precondition instead of assuming every error belongs to this table.\n\nFor a wrong target, check [team setup](team.md) and the configured public file ID. For incomplete captures, inspect [structured evidence limits](inspection.md) and [artifact provenance](artifacts.md). For conflicting writer/ownership state, keep evidence and coordinate with the recorded owner before an explicit recovery decision.\n`;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await writeFile(
    new URL("../docs/troubleshooting.md", import.meta.url),
    troubleshootingMarkdown(),
  );
}
