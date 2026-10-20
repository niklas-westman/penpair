# @penpair/marwes-ui

**The [Marwes UI](https://marwes.io) adapter for [penpair](https://github.com/niklas-westman/penpair): your Marwes design tokens, and your own theme on top, in your Penpot file, with drift checks against the Marwes your app actually uses.**

```bash
npm i -D @penpair/marwes-ui
```

List it in `penpair.config.json` and say where your theme lives:

```json
{
  "adapters": ["@penpair/marwes-ui"],
  "marwes": {
    "project": "packages/app",
    "themes": { "light": { "module": "packages/app/src/theme.ts", "export": "myLight" } }
  }
}
```

```bash
penpair marwes tokens snapshot --write   # the expected tokens, from the installed Marwes and your theme: commit the file
penpair marwes tokens check              # offline, for CI: is the snapshot current? (fails after a Marwes bump)
penpair marwes tokens diff               # Penpot against the snapshot, and how many shapes each change reaches
penpair marwes tokens push --apply       # make Penpot match, then read everything back to verify
```

The installed Marwes and your theme file are the truth; Penpot is made to match, and anything that stops matching is found. The full guide, including what drifts, what catches it and how to put it in CI: [Marwes tokens in Penpot, and keeping them true](https://github.com/niklas-westman/penpair/blob/main/docs/marwes-tokens.md).

Needs `@penpair/web` or `@penpair/docker` (the `penpair` command) and Marwes installed in the project. Components are not covered yet.
