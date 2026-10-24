import { PenpairError } from "../errors.js";

export class MapExportEvidenceError extends PenpairError {
  constructor(
    readonly runId: string,
    detail: string,
  ) {
    super(
      "incomplete-output",
      `Native map write is verified, but export evidence failed for run ${runId}: ${detail}. Inspect the run and rerun the original publish command with --apply --resume ${runId}.`,
    );
    this.name = "MapExportEvidenceError";
  }
}
