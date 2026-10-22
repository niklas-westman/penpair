import { defineAdapter } from "@penpair/core";
import { runReflectionCommand } from "./command.js";

export { planImplementationCases } from "./case-plan.js";
export { runImplementationCases } from "./run-cases.js";
export type {
  ImplementationMapping,
  ImplementationCase,
  CasePlan,
  BrowserCaptureMetadata,
  ProviderEvidence,
  ImplementationProvider,
  ImplementationCaseReport,
  ImplementationReport,
} from "./types.js";

export default defineAdapter({
  name: "@penpair/reflection-check",
  commands: [
    {
      name: "reflection",
      summary: "Plan explicit implementation cases and collect provider evidence",
      usage: [
        "penpair reflection plan --map FILE",
        "penpair reflection check --map FILE --provider FILE",
      ],
      run: runReflectionCommand,
    },
  ],
});
