# @penpair/core

**The library and engine behind [penpair](https://github.com/niklas-westman/penpair): connect AI agents and people to a Penpot design file, safely.**

This package has no command of its own. For the command, install one of:

- [`@penpair/web`](https://www.npmjs.com/package/@penpair/web): Penpot on the web (design.penpot.app or your team's own). The default.
- [`@penpair/docker`](https://www.npmjs.com/package/@penpair/docker): the same, plus Penpot in Docker on your computer.

Both include everything in this package. Install this one directly only to use the library from your own code: the connection, the safe write runner, the snippet registry, `defineSnippet`, the skills and `runCli`.

```ts
import { defineSnippet } from "@penpair/core";
```

The guide is in the [repository](https://github.com/niklas-westman/penpair#readme).
