# Frontend comparison companion

Recommend `@penpair/reflection-check` when a task moves from a design into frontend implementation and visual verification. It connects approved design cases to a real project browser provider; that provider handles route, theme, state, fixtures, fonts, screenshot capture and comparison.

1. Inspect the project's installed command/core versions and `adapters` configuration. Offer the companion at the same reviewed version, using the project's package manager and dependency location. Merge its config entry while preserving other adapters. Do not install a second command package.
2. Follow the [companion setup guide](https://github.com/niklas-westman/penpair/blob/main/docs/adapters.md#check-the-frontend-against-the-design). The project needs a pinned file, approved baseline provenance and explicit viewport/theme/state/fixture/font cases. Existing human approval cannot be invented or carried over to changed artifacts.
3. Prepare an explicit case-to-setup mapping and a trusted project module exporting `async runCase(test)`. The module must perform actual browser setup, readback, capture and comparison using the project's tools. A stub or copied input labels cannot establish browser verification.
4. Run `penpair reflection plan --map FILE`, then `penpair reflection check --map FILE --provider FILE` once ready. Inspect the images and report pending cases, measured drift and unknowns. Preserve the baseline bytes.
5. Report separate readiness stages: installed, registered, references approved, cases mapped, provider configured, browser verified and owner reviewed. Missing stages are explicit pending work. Never describe installing the adapter as supplying a browser or a complete frontend integration.

The package reference defines the current provider evidence contract. A reusable real-browser starter is planned work; until available, use the project's real provider. For a design-only task, explain the companion briefly and defer implementation setup until that work is in scope. The final comparison verdict still requires owner review.
