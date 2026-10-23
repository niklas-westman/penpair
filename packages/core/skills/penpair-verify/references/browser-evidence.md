# Real browser evidence

The optional `@penpair/reflection-check` adapter connects approved design cases to
a trusted project module exporting `async runCase(test)`. Match its version to
the installed command/core and preserve existing adapter entries. Read the
[adapter guide](https://github.com/niklas-westman/penpair/blob/main/docs/adapters.md#check-the-frontend-against-the-design)
for installation and the current provider contract.

The command package ships `examples/reflection-browser/`: for a web installation,
start at `node_modules/@penpair/web/examples/reflection-browser/README.md`. The
starter supplies browser capture and pixel comparison plumbing. Project hooks
still own the actual route, state setup, fixture, theme observation, capture root
and expected fonts. The standalone Reflection application is optional; a pinned
browser dependency and working provider are still required in the project.

Before claiming a comparison, retain the case ID, approved reference/hash, setup
name, provider identity/version and actual browser observation. Check viewport,
theme, state, fixture, loaded fonts, PNG dimensions and scale. Missing state
hooks, placeholder routes or echoed test inputs leave verification pending.
Inspect pointer/hover, scroll/sticky behavior, occlusion and capture-root bounds
when they can explain a mismatch. Do not hide them by changing the reference.

Use the project's existing verification command or pass its explicit mapping and
provider to the installed `penpair reflection` command. Providers execute trusted
project code, not sandboxed data. Preserve approved baseline bytes before and
after running them. Browser state and screenshots must be independently observed;
an adapter accepts an evidence contract but cannot attest that a provider is
honest.

Keep the result and screenshots in a project-owned report. Distinguish measured
drift, a visual finding, behavior/accessibility checks and owner acceptance.
Design-to-design state variants need a source/candidate critique, not an
implementation parity score against intentionally different content.
