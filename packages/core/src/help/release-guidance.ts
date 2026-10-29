export const releaseGuidance: Record<
  string,
  {
    summary: string;
    instructions: string[];
  }
> = {
  status: {
    summary: "Identify the evidence-backed release step, blockers and next actions",
    instructions: [
      "Run penpair design-release status --from RELEASE --json at entry and after meaningful actions. It diagnoses the selected record; it does not approve or modify it.",
      "Offline status verifies saved artifacts only. --live reads current Penpot content; connection failure never becomes an offline freshness claim.",
      "Use --comparison FILE to assess a separate exact-release implementation report without rewriting finalized design. Read recordedState separately from step, design.valid, freshness, implementation and recovery. A finalized design may have current drift or an incomplete application comparison.",
      "Follow nextActions and missingInputs. Inspect actual journals and independent readback before resume; a saved step label is not write authorization.",
    ],
  },
  adopt: {
    summary: "Prepare a reviewed draft from existing Penpot frames and historical evidence",
    instructions: [
      "Use --from ADOPTION_PLAN --out DRAFT. Version-2 adoption input names exact file/page/frame identities, inspection/render artifacts and any authentic approval records.",
      "Adoption is local preparation, not approval, a frame copy or live verification. Missing historical approval requires real owner review, dated now.",
      "Read status for the draft, preview assembly on the intended existing page, and complete normal live verification and finalization before using it as an inherited base.",
    ],
  },
  plan: {
    summary: "Freeze the complete release inventory from a pinned base and explicit changes",
    instructions: [
      "Version-2 plans pin an optional finalized base release and immutable bundle, with explicit add/replace/remove changes. Version-1 full-copy plans remain supported.",
      "Preserve stable member IDs and original evidence. A replacement requires its own target approval; a removal needs a reason and consistent coverage/map contracts.",
      "Planning is offline. Inspect status and the resolved full inventory before previewing native assembly.",
    ],
  },
  assemble: {
    summary: "Preview or assemble changed destinations, retained-frame links and native maps",
    instructions: [
      "Preview with --from RELEASE; --apply performs the reviewed native write. Retained frames stay on their original pages.",
      "After native copy, supply --receipts FILE to preview and apply overview links to actual copied target IDs, then run verify with the same receipts.",
      "Preserve unmanaged content. Keep journal identity and inspect independent readback and exports after a write or uncertain response.",
    ],
  },
  verify: {
    summary: "Verify copied targets and every retained source with current native evidence",
    instructions: [
      "Supply explicit --receipts FILE for changed copies, including authentic target approval references when required. Retained-only version-2 releases need no copy receipts.",
      "Verification reads Penpot and saves immutable evidence; it does not silently refresh overview links or invent approval.",
      "Missing source identity, native fields, dependencies, stable pixels or approval stays blocking. Equal-looking copies cannot inherit another frame's approval.",
    ],
  },
};
