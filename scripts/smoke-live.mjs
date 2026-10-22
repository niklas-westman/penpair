import { parseArgs } from "node:util";
import {
  assertEndpointIsInstance,
  connect,
  formatDeepReport,
  redactEndpoint,
  resolveEndpoint,
  runLiveSmoke,
  validateProjectConfig,
} from "../packages/core/dist/index.js";

let endpoint;
let client;
try {
  const { values } = parseArgs({
    options: {
      "scratch-file": {
        type: "string",
      },
      origin: {
        type: "string",
      },
      "expected-version": {
        type: "string",
      },
      "confirm-scratch": {
        type: "boolean",
      },
    },
  });
  if (
    !values["scratch-file"] ||
    !values.origin ||
    !values["expected-version"] ||
    !values["confirm-scratch"]
  ) {
    throw new Error(
      "Usage: pnpm smoke:live --scratch-file <id> --origin <origin> --expected-version <version> --confirm-scratch",
    );
  }
  if (!process.env.PENPAIR_MCP_URL) {
    throw new Error(
      "Set PENPAIR_MCP_URL in the environment; live smoke never falls back to global agent configuration.",
    );
  }
  const config = validateProjectConfig({
    instance: "smoke",
    profile: {
      type: "external",
      origin: values.origin,
    },
  });
  endpoint = await resolveEndpoint({
    environment: {
      PENPAIR_MCP_URL: process.env.PENPAIR_MCP_URL,
    },
    envFiles: [],
  });
  assertEndpointIsInstance(endpoint.description, config);
  client = await connect(endpoint);
  const report = await runLiveSmoke(client, {
    scratchFileId: values["scratch-file"],
    expectedVersion: values["expected-version"],
    confirmedScratch: true,
  });
  console.log(redactEndpoint(formatDeepReport(report), endpoint));
  console.log(
    redactEndpoint(
      JSON.stringify(
        {
          tag: report.tag,
          version: report.penpotVersion,
          ok: report.ok,
          steps: report.steps,
          cleanup: report.cleanup,
          leftovers: report.leftovers,
        },
        null,
        2,
      ),
      endpoint,
    ),
  );
  if (!report.ok) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error(redactEndpoint(error instanceof Error ? error.message : String(error), endpoint));
  process.exitCode = 1;
} finally {
  await client?.close();
}
