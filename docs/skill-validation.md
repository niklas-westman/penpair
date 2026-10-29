# Validate skill discovery and behavior

Installation, selection, workflow application, browser evidence and owner
acceptance are separate checks. A host can load a skill without showing the
selection in the way a person expects, and can read a skill but underapply it.

## Offline discovery

```sh
pnpm exec penpair skills check --agent codex --json
pnpm exec penpair skills check --agent claude --agents CLAUDE.md --json
pnpm exec penpair skills check --agent copilot --agents .github/copilot-instructions.md --json
pnpm exec penpair skills check --only penpair-verify --agents AGENTS.md --json
pnpm exec penpair skills check --only penpair-design-release --agents AGENTS.md --json
```

Exit 0 means the selected bundled skills have valid discoverable entrypoints,
an enabled host invocation policy where evaluated, resolvable local entrypoint resources and matching
links in the installer-owned task routes. Exit 3 means readiness is incomplete;
exit 1 indicates invalid arguments or an execution/configuration error. `--only`
can be repeated. Default selection is all bundled skills; partial installs should
select their intended subset explicitly.

The report distinguishes entrypoints matching the bundle from valid local
customizations. Different independent installed copies require review. For Codex, missing
optional `agents/openai.yaml` means implicit invocation is allowed by default;
an explicit false policy leaves explicit invocation available. Claude's
`disable-model-invocation` is checked independently. Copilot's invocation policy
is not evaluated (`implicitInvocation: null`); Codex metadata does not disable
other hosts. Legacy setup-guide folders make readiness incomplete and require
review. `--agent` selects the host; it does not change the installation. The check reads
bounded regular project files, follows in-project links and refuses escapes.
It does not load adapters/providers, connect to Penpot, read credentials, write
repairs or inspect global agent settings.

The instruction check recognizes Penpair's generated owned task routes. It does
not interpret arbitrary custom routing prose. Preview updates with
`skills install --agents AGENTS.md --dry-run`, preserve intentional customizations
and project-owned facts, then apply the reviewed refresh. Diagnostics do not
override owner choices or silently enable disabled skills.

## Realistic invocation trials

Run these separately in fresh Claude Code, Copilot and Codex sessions in an authorized disposable consumer project.
Do not append skill names to the natural request. Supply actual reference IDs,
images, approved scope and case files where the task needs them. For a negative
case, keep Penpot/provider work out of scope. Each trial uses the same fixture and
records the actual outcome, including missing skills or unavailable tools.

| Natural request | Expected primary skill | Observable result |
| --- | --- | --- |
| Set up Penpair with me, step by step. | penpair-setup | Assisted setup preserves the chosen package manager; private browser/key steps handed to the person. |
| Give me manual installation steps; do not run them. | penpair-setup | Commands and expected results only; no installation or connection commands executed. |
| I installed the package manually; help me finish with your assistance. | penpair-setup | Inspects existing progress and continues without resetting the config. |
| Connect this project to Penpot; doctor cannot reach the editor. | penpair-setup | Diagnose the failed check; preserve personal credentials. |
| Inspect this Penpot frame and export its current design. | penpair-design | Pinned target, complete inspection and actual export. |
| Create an empty state from this approved Penpot screen. | penpair-recipes | Source evidence, declared regions, representative candidate and critique before expansion. |
| Implement this approved Penpot design in the frontend. | penpair-handoff | Explicit component mapping/unknowns and routed verification readiness. |
| Compare this running route with its approved design and fix the visual mismatches. | penpair-verify | Actual case setup/readback, screenshots, findings, scoped fixes and rerun. |
| Prepare the next Penpot product release, keeping unchanged Login frames on their earlier page. | penpair-design-release | Reads installed capabilities and canonical release status; reports the current step, complete inventory, blockers and next valid action. |
| Resume this interrupted Penpot release without duplicating frames. | penpair-design-release | Checks actual journal and target identities before a supported recovery; never infers a paste from a preparation run ID. |
| Publish the next Penpair npm version. | none of these | Follows the repository package release guide; no product design-release or Penpot workflow started. |
| Critique this screen's density and hierarchy. | design-judgment | Consequential findings grounded in the supplied image; no implicit Penpot writes. |
| Fix a backend calculation with no UI change. | none of these | No Penpot or comparison work added. |
| Explain this repository's release workflow. | none required | No design/browser workflow started. |
| Explain what Reflection Check does; do not run anything. | none required | Explanation respects the requested scope; no provider execution. |

For each case retain: request/context, visible skill catalog if available, actual
SKILL.md reads, selection announcement, relevant output/checkpoint, command
results and missing evidence. Record correct selection and correct application
separately. A badge, a stated intention, a keyword match or valid YAML proves
neither. If natural selection fails, repeat with explicit invocation (`$skill-name` in Codex, `/skill-name` in Claude Code, or a skill name/path request in Copilot) to
distinguish discovery/selection from problems following the workflow. Record the
installed skill version; compare before/after under the same conditions.

Do not run live writes just to measure invocation. A read-only plan can establish
selection; authorized scratch trials establish mutation and visual behavior.
Missing tools, design references, browser providers or owner approval remain
pending instead of simulated success.

## Release skill behavior trials

Use `penpair-design-release` with raw fixture records and the installed CLI in a
fresh session. Do not supply the intended step or expected next action in the
agent's request. Give only the release identity, permitted resources and write
scope. Keep these trials independent of the source/unit tests for the evaluator.

| Fixture | Observable behavior |
| --- | --- |
| Draft names a missing or invalid finalized base | Reports the missing exact base evidence; does not assemble or invent inheritance. |
| Adopted historical images lack verifiable owner approval | Keeps adoption pending, distinguishes legacy evidence from earlier approval and requests fresh review when recovery is impossible. |
| Assembly was interrupted after an uncertain response | Inspects the actual journal and destination; recommends resume only for matching recorded inputs. |
| Retained frame drifts or disappears | Names the affected member and live blocker, preserves the original finalized evidence and avoids a copy/frozen-reference fallback. |
| Candidate is technically verified but lacks review | Presents the exact artifact/hash for the missing review; does not infer owner words from technical success. |
| Design is finalized and valid but implementation is not assessed | Reports design readiness separately and routes implementation work to handoff/verification. |
| A comparison has passing cases and pending cases | Reports comparison incomplete and names the missing coverage; does not claim full-release acceptance. |
| A finalized record has subsequent live drift | Keeps its recorded final state and reports current invalidity; does not rewrite history. |

Check the checkpoint's release identity, step, evidence scope, blocker and next
action against the CLI result. Check whether the agent read only the relevant
reference and whether its action stayed within authorization. Evaluate behavior,
not exact headings or sentence matching. A skill YAML validator, installed-link
check or evaluator unit test alone does not establish that the agent followed
the workflow. Record unexecuted trials as pending, not passed.

## Retain the observed results

Keep trial results in the project's own review folder. Retain actual loaded
skills, resulting artifacts, failures and unresolved evidence separately from
expected behavior. Source/package checks and real consumer trials are described
in the [validation guide](validation.md).

See [official Codex skill documentation](https://developers.openai.com/codex/skills/)
for supported discovery locations, implicit selection and optional metadata.
