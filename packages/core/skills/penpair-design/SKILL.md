---
name: penpair-design
description: Work in a Penpot file through penpair: inspect, build, change, audit, export and archive frames and components, bind every value to a token, keep layout as flat auto-layout, and run Penpot as one instance per project. Use when creating, editing, inspecting or exporting anything in Penpot, adding or binding tokens, writing a project snippet, setting up or checking a Penpot instance, or diagnosing a plugin or connection error. Do not use for deciding how a screen should be structured (design-judgment).
metadata:
  version: "0.1.0"
  scope: penpot
  audience: anyone, and any AI agent, that edits a Penpot file
compatibility: A running Penpot (local Docker, a team server or the hosted service) with the plugin connected in a visible editor tab, Node 22, penpair installed.
---

# penpair-design

Penpot is the authority for the design; the code adapts to the frames. The project's component library defines what exists: a component, token or layout the library has wins, and only what it lacks becomes a project-specific component or token.

## The model in five lines

1. A Penpot file holds token sets (library tokens, then the project's own, in that order; a later set wins), components, and the frames. How a project records its own facts: [references/project-facts.md](references/project-facts.md). How a library sits in Penpot: [references/library-in-penpot.md](references/library-in-penpot.md).
2. A frame is flat auto-layout: one gap token between elements, no wrapper boards that carry spacing. Detail: [references/auto-layout.md](references/auto-layout.md).
3. Every colour, radius, shadow, typography and spacing value is token bound. `penpair audit` reports what is not.
4. Each change follows the protocol in [references/write-protocol.md](references/write-protocol.md): inspect, one write, independent readback, look at an export, then the owner's approval.
5. The plugin has traps that cost hours. Read [references/penpot-plugin-gotchas.md](references/penpot-plugin-gotchas.md) before the first script.

## Commands

| What | How |
| --- | --- |
| Validate project settings offline | `penpair config check [--json]`; `penpair config schema` prints editor hints without loading project extensions |
| Is everything up | `penpair doctor` |
| What can this Penpot do | `penpair probe`; `penpair probe --deep --write` on a scratch file |
| Read | `penpair pages`, `tree --page <name>`, `audit --page <name> --prefix <frames>`, `tokens dump` |
| Export a shape | `penpair export <id> <out.png> --page <name>` (waits for a stable render) |
| Hand a page's design to a check | `penpair baselines [--apply] [--update]` (frames listed under `baselines` in `penpair.config.json`; `--update` approves a changed design, so only on the owner's words) |
| Move old work aside | `penpair archive --page <name> --name <board> --keep <prefixes> --parts <prefixes> [--apply]` |
| Run any snippet | `penpair snippets`, `penpair run <name> --param key=value [--apply]` |
| Run your own Penpot | `penpair init`, `up`, `down`, `status`, `backup`, `backup verify <dir>`, `restore <dir> --yes` |

## Steps for a change

1. **Inspect** read-only: the frame, its children, tokens and sizes, with `tree`, `audit` or a read snippet.
2. **Map** each element to a library component or token first; name what the library lacks.
3. **Write** with a write snippet or an operation: it looks first, changes once, reads back. Done when the readback of the actual objects equals what you intended, sizes and token bindings included.
4. **Verify**: export the frames and look at them (twice: the first export after a change can be stale), run the audit.
5. **Align the code** to the frame, then re-measure.
6. **Approval**: show the owner the changed frames. Record an approval only on the owner's explicit words, with those words kept.

## Rules that decide most cases

- Pin the intended file with `penpair connect --pin-file`. Check doctor's file identity before a change. A mismatched file blocks writes, adapter operations and design artifacts; `--any-file` is an explicit override for a deliberate different target.

- Fix invalid project configuration before connecting: commands refuse unreadable, malformed or invalid config, including with `--any-instance`. Config-free built-in inspection requires `--standalone` in a folder without a config; writes and registered snippets require a project.

- Every gap and padding is a spacing token; the layout stack carries the spacing, items carry none.
- One primary action per screen; a banner action is the secondary button.
- Work on the page you have open; Penpot's editor acts on the focused page, and a script that switches page takes effect only after it ends.
- Keep the Penpot tab visible. A "suspended" error does not mean nothing was written: read the page before running a write again.
- A snippet stays under 90 KB; the request is refused at about 110 KB.
- The MCP key is personal. Never print it, paste it into chat or commit it.
- Report what you did not verify, and name every deviation you chose.
