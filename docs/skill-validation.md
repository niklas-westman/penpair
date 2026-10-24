# Validate skill discovery and behavior

Installation, selection, workflow application, browser evidence and owner
acceptance are separate checks. Codex can load a skill without showing the
selection in the way a person expects, and can read a skill but underapply it.

## Offline discovery

```sh
pnpm exec penpair skills check --json
pnpm exec penpair skills check --only penpair-verify --agents AGENTS.md --json
```

Exit 0 means the selected bundled skills have valid discoverable entrypoints,
allowed implicit invocation, resolvable local entrypoint resources and matching
links in the installer-owned task routes. Exit 3 means readiness is incomplete;
exit 1 indicates invalid arguments or an execution/configuration error. `--only`
can be repeated. Default selection is all bundled skills; partial installs should
select their intended subset explicitly.

The report distinguishes entrypoints matching the bundle from valid local
customizations. Different independent installed copies require review. Missing
optional `agents/openai.yaml` means implicit invocation is allowed by default;
an explicit false policy leaves explicit invocation available. The check reads
bounded regular project files, follows in-project links and refuses escapes.
It does not load adapters/providers, connect to Penpot, read credentials, write
repairs or inspect global agent settings.

The instruction check recognizes Penpair's generated owned task routes. It does
not interpret arbitrary custom routing prose. Preview updates with
`skills install --agents AGENTS.md --dry-run`, preserve intentional customizations
and project-owned facts, then apply the reviewed refresh. Diagnostics do not
override owner choices or silently enable disabled skills.

## Realistic invocation trials

Run these in fresh Codex sessions in an authorized disposable consumer project.
Do not append skill names to the natural request. Supply actual reference IDs,
images, approved scope and case files where the task needs them. For a negative
case, keep Penpot/provider work out of scope. Each trial uses the same fixture and
records the actual outcome, including missing skills or unavailable tools.

| Natural request | Expected primary skill | Observable result |
| --- | --- | --- |
| Connect this project to Penpot; doctor cannot reach the editor. | penpair-setup | Diagnose the failed check; preserve personal credentials. |
| Inspect this Penpot frame and export its current design. | penpair-design | Pinned target, complete inspection and actual export. |
| Create an empty state from this approved Penpot screen. | penpair-recipes | Source evidence, declared regions, representative candidate and critique before expansion. |
| Implement this approved Penpot design in the frontend. | penpair-handoff | Explicit component mapping/unknowns and routed verification readiness. |
| Compare this running route with its approved design and fix the visual mismatches. | penpair-verify | Actual case setup/readback, screenshots, findings, scoped fixes and rerun. |
| Critique this screen's density and hierarchy. | design-judgment | Consequential findings grounded in the supplied image; no implicit Penpot writes. |
| Fix a backend calculation with no UI change. | none of these | No Penpot or comparison work added. |
| Explain this repository's release workflow. | none required | No design/browser workflow started. |
| Explain what Reflection Check does; do not run anything. | none required | Explanation respects the requested scope; no provider execution. |

For each case retain: request/context, visible skill catalog if available, actual
SKILL.md reads, selection announcement, relevant output/checkpoint, command
results and missing evidence. Record correct selection and correct application
separately. A badge, a stated intention, a keyword match or valid YAML proves
neither. If natural selection fails, repeat with explicit `$skill-name` to
distinguish discovery/selection from problems following the workflow. Record the
installed skill version; compare before/after under the same conditions.

Do not run live writes just to measure invocation. A read-only plan can establish
selection; authorized scratch trials establish mutation and visual behavior.
Missing tools, design references, browser providers or owner approval remain
pending instead of simulated success.

## Retain the observed results

Keep trial results in the project's own review folder. Retain actual loaded
skills, resulting artifacts, failures and unresolved evidence separately from
expected behavior. Source/package checks and real consumer trials are described
in the [validation guide](validation.md).

See [official Codex skill documentation](https://developers.openai.com/codex/skills/)
for supported discovery locations, implicit selection and optional metadata.
