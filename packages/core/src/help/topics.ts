/** Durable workflow IDs used by the CLI and the shipped skills. */
export const workflowTopics = [
  {
    id: "workflows.design-release",
    summary: "Operate a native Penpot release using authoritative evidence and status",
    instructions: [
      "Read the installed penpair-release skill for product design releases. Package versioning and npm publication are a separate workflow.",
      "Start with design-release status --from RELEASE --json. Use --live when current Penpot freshness is required; follow evidence-backed blockers and next actions.",
      "Resolve the complete inherited inventory, assemble changed frames and retained links, verify live, review exact artifacts, then finalize with supplied owner words.",
      "Keep design finalization separate from application comparison and owner acceptance. Partial browser runs cannot establish whole-release verification.",
    ],
  },
  {
    id: "workflows.iterative-build",
    summary: "Build and critique one representative frame before expanding",
    instructions: [
      "Inspect the pinned file and page. Build one representative frame, then independently read back and look at its export.",
      "Critique spacing, typography, hierarchy and states before expanding to siblings. Use scoped flush({ root: shape }); omit root only for intentional whole-page work.",
      "Split large scripts into verified stages. A completed script is not owner approval. See run-file.stages and queue.recovery.",
    ],
  },
  {
    id: "workflows.capture-evidence",
    summary: "Capture a representative frame, then collect the complete evidence family",
    instructions: [
      "Use export for review, shots for immutable page captures, and baselines for configured references. Inspect the first image before a large capture.",
      "Use lossless WebP for baseline storage. Ad-hoc export --cache is a fingerprint optimization, not fresh pixel proof; baselines never use it.",
      "Run in the foreground. To save a log, use set -o pipefail; COMMAND 2>&1 | tee export.log. tail -N holds output until EOF; redirecting or capturing stderr hides progress.",
      "A captured or staged file is not published or owner-approved. Check the exit status and final JSON completeness before using it.",
    ],
  },
  {
    id: "run-file.stages",
    summary: "Bound a build using independently verified journal stages",
    instructions: [
      "Use --stages N with --inspect FILE --readback FILE --apply. CFG.stage and CFG.stages identify the stage. Each stage has its own journal checkpoint.",
      "Keep writes idempotent. Inspect current state before --resume RUN_ID. Changed snippets can invalidate older journals; never bypass revision or target guards.",
    ],
  },
  {
    id: "queue.recovery",
    summary: "Inspect queue status and resume only after checking recorded state",
    instructions: [
      "Use penpair queue status [QUEUE_ID], then penpair runs RUN_ID. Resolve uncertain writes through independent readback before retrying.",
      "Use penpair queue run jobs.json --resume QUEUE_ID only for the reviewed unchanged plan. A writer lock is not proof that a remote write stopped.",
    ],
  },
  {
    id: "export.batch",
    summary: "Export explicit frames sequentially with per-frame outcomes",
    instructions: [
      "penpair export --frames ID=review-card,OTHER_ID=review-dialog --page PAGE --out design/exports --cache --json",
      "Use 1–200 unique IDs and filename stems. One failure does not stop other frames. Require complete:true and inspect summary.failed; cached is distinct from exported.",
      "Prefer one representative frame while iterating; use the full batch after critique. Read diagnostics.progress for streaming behavior.",
    ],
  },
  {
    id: "export.cache",
    summary: "Opt into reuse for ad-hoc review exports only",
    instructions: [
      "--cache compares a bounded shape/token fingerprint, scale and stored PNG hash. Fonts, image payloads and external effects can escape that fingerprint.",
      "Truncated fingerprints are never reusable. A cache hit is reported as cached, not fresh. Omit --cache when current pixel proof is required; baseline capture always renders anew.",
    ],
  },
  {
    id: "diagnostics.progress",
    summary: "Stream real capture phases without mixing progress into result JSON",
    instructions: [
      "export, shots, baselines and design-release copy accept --progress human|json|off; default human. Progress goes to stderr; --json keeps one final CommandResult on stdout.",
      "Release copy reports source preparation before journaled writes, with runId and per-frame progress. A preparation run ID does not prove a journal exists or a paste happened; use --resume only after checking the corresponding journal and actual target state.",
      "JSON progress uses schemaVersion:1 and kind:progress, command, phase, status and elapsedMs, with frame/index/total when known. Waiting events repeat every five seconds only while an actual phase is pending.",
      "Do not pipe through tail -N, buffer stderr in a subprocess, or use file counts as success. Preserve stderr, check process exit and parse the entire final stdout envelope.",
    ],
  },
];
