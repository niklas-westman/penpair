import type { AdapterCommand, AdapterContext } from "../../../packages/core/src/adapters.js";

async function runExampleStatus(
  context: AdapterContext,
  commandArguments: string[],
): Promise<number> {
  if (commandArguments.length > 0) {
    throw new Error("Usage: example-status");
  }

  const report = {
    configured: Boolean(context.config.file),
  };
  context.output?.result(report);
  context.log(JSON.stringify(report));

  return report.configured ? 0 : 3;
}

// Register in an adapter's defineAdapter({ commands: [...] }) when adopting this pattern.
export const exampleStatusCommand: AdapterCommand = {
  name: "example-status",
  summary: "Report offline file-pin readiness",
  usage: [
    "penpair example-status",
  ],
  run: runExampleStatus,
};
