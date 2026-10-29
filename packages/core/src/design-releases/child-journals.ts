import { observationHash } from "../journal.js";

/** Deterministic run ID of the map journal that an assembly run opens for one release contract. */
export function childMapRunId(parentRunId: string, index: number): string {
  return `map-${observationHash({
    runId: parentRunId,
    index,
  }).slice(0, 48)}`;
}
