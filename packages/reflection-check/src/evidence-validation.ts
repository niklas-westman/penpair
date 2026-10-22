import { observationHash } from "@penpair/core";
import { validateCaptureMetadata } from "./capture-validation.js";
import type { ImplementationCase, ProviderEvidence } from "./types.js";

export function validateProviderEvidence(
  evidence: ProviderEvidence,
  implementationCase: ImplementationCase,
): void {
  const requestedObservation = {
    viewport: implementationCase.intent.viewport,
    theme: implementationCase.intent.theme,
    state: implementationCase.intent.state,
    fixture: implementationCase.intent.fixture,
  };

  if (
    !evidence ||
    evidence.schemaVersion !== 1 ||
    evidence.id !== implementationCase.id ||
    evidence.route !== implementationCase.route ||
    evidence.setup !== implementationCase.setup ||
    observationHash(evidence.observed) !== observationHash(requestedObservation) ||
    evidence.baselineHash !== implementationCase.baseline.sha256 ||
    evidence.fontsReady !== true ||
    !Array.isArray(evidence.fonts) ||
    (implementationCase.intent.fonts ?? []).some((font) => !evidence.fonts.includes(font)) ||
    !evidence.provider?.name ||
    !evidence.provider.version ||
    !Number.isFinite(evidence.diffPixelRatio) ||
    evidence.diffPixelRatio < 0 ||
    evidence.diffPixelRatio > 1
  ) {
    throw new Error(
      "Provider did not independently observe the exact requested state, fixture, viewport, fonts and baseline",
    );
  }

  if (
    evidence.provider.name === "penpair-browser-starter-rgba-exact" &&
    (!evidence.capture || !evidence.capture.occlusion)
  ) {
    throw new Error("Browser starter requires complete capture metadata");
  }

  if (evidence.capture) {
    validateCaptureMetadata(evidence.capture, implementationCase);
  }
}
