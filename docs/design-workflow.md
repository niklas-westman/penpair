# From design intent to implementation

1. Establish the project's target and declaration sources: config/file pin, actual library tokens, fixture data and authorized scope. [Team setup](team.md) distinguishes shared config from personal credentials.
2. Prototype the smallest useful state. Inspect real tokens/components; build through [reviewed file operations](run-file.md) and the [kit](build-kit.md). Retain explicit ownership and positive readback evidence.
3. Export until stable and inspect the image twice. Audit findings are review inputs; record layout/text/binding results separately from visual judgment.
4. Present the exact artifact to the owner. [Approval records](approvals.md) retain supplied words and capture hashes; a comparison percentage never supplies approval.
5. Capture [baselines and case coverage](coverage.md). A changed reference requires matching approval or an explicitly labeled waiver; unsupported cases remain pending.
6. Generate a [structured handoff](handoff.md) with explicit component mappings. Implement behavior, responsive rules and accessibility from an actual application contract rather than inferred appearance.
7. Use the recommended [Reflection Check companion](adapters.md#check-the-frontend-against-the-design) and a real project browser provider to capture the actual implementation case with stable fonts/data. Inspect comparison evidence and images, resolve drift, and report changed behavior, validation and remaining risks. Missing provider/setup work remains pending.

These seven steps are the implementer's view. For the whole journey from a first idea to a released design, including the moodboard, site pages, device sizes and the release, see [the project lifecycle](project-lifecycle.md). These seven steps are the documentation's view of the work. The installed skills
are the agent's view of the same work, and they do not map one-to-one onto these
steps: see [which skills exist](skills.md), then each skill's own
`## What this owns` section for where its responsibility starts and stops.

[Structural snapshots](snapshots.md) make design review diffable. [Archives and
restore trials](backup.md) establish recovery independently. Use the
[validation guide](validation.md) for source-package and scratch checks; automated
fixtures do not establish live behavior or human acceptance.

Before expanding variants, record a short composition decision and critique one small first frame: the `design-judgment` skill owns that decision and states it in full, including what the record must contain. Use `inspect → spec → snapshot/diff → capture/approve → comparison` from installed `penpair --help`. Exact owner words approve only the captured artifact; first-frame critique does not grant approval. Layout strategy and fresh doctor evidence are described in [build kit](build-kit.md) and [recovery](recovery.md).
