# Install skills and integrate project instructions

```sh
penpair skills install --agents AGENTS.md --dry-run
penpair skills install --agents AGENTS.md
```

The preview lists planned files/links, shows the resolved instruction path and prints the owned-block diff. Dry-run writes nothing, including skill copies and links. Add `--json` for the versioned report. Skill paths reuse the project's existing real skill folder; `--to` selects another project-relative folder. Generated links are relative to the selected instruction file, with spaces and special characters encoded.

Without `--agents`, exactly one existing AGENTS.md or CLAUDE.md is selected. If neither exists, installation prints rows and leaves instruction creation to an explicit destination. If both exist, it edits neither and exits 3 with `instructions.status: choice-required`; choose `--agents` explicitly. Skills may still have been installed. `setup --agents <path>` passes that destination to the same installer. Setup without a destination follows the same existing-file policy and reports when instruction integration still needs a choice.

The installer appends a skills section when needed or replaces only the contents between `<!-- penpair:skills:start -->` and `<!-- penpair:skills:end -->`. Existing text outside the owned region, including line endings, is preserved. Duplicate, reversed or unmatched markers stop installation before any skill files are written. An instruction file edited after planning is preserved; retry after reviewing its current contents. A repeat run with identical content is a no-op. Existing file permissions are retained.

The owned block includes task-to-skill routing as well as a skill directory. It
instructs the agent to read the relevant skill before tool work, and follows the
selected skills when `--only` is used. Installation does not guarantee that a
particular model will select or correctly apply a skill, and selecting a skill
grants no additional write permission.

Run `penpair skills check --json` for read-only Codex discovery/routing diagnostics
after a reviewed installation. Use repeated `--only NAME` for a partial install
and `--agents PATH` for its selected instruction destination. See
[skill validation](skill-validation.md) for results, limits and realistic model
invocation trials. Filesystem readiness does not prove correct agent behavior.

Bundled `agents/openai.yaml` files provide readable skill names, descriptions and
explicit starting prompts for Codex. Implicit invocation remains enabled; the
metadata is optional for discovery. Generated project instructions ask the agent
to briefly name the selected skill and its purpose. This makes intended use
visible without claiming a host-specific badge or completed verification. If a
new skill is absent from the host's available-skill list, check discovery first;
Codex normally detects changes automatically, with a restart as a fallback when
an update does not appear. See [official skill documentation](https://developers.openai.com/codex/skills/).

Local outputs must remain inside the project after resolving existing symlinks. An instruction link escaping the project or a dangling link is refused. The resolved destination is shown so a project wrapper or shared in-project target is visible. These operations do not edit global agent configuration. Entry-point/output checks do not sandbox arbitrary extensions.

Skill files modified by the project are kept unless `--force` is explicit. Project facts remain project-owned even with force, and rename migration preserves the prior facts. All writes are planned before execution, published as complete files, and instructions are written after skill copies/links. This is not a multi-file transaction: a filesystem failure or a concurrent owner edit can leave skill installation partly applied while preserving the instruction file. Review the report and rerun; unchanged files are skipped.
