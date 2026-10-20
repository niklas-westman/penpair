# @penpair/docker

**The `penpair` command with Penpot in Docker on your computer. Design together. Build together.**

[penpair](https://github.com/niklas-westman/penpair) connects your AI coding assistant to a [Penpot](https://penpot.app) design file. This package is the same command as [`@penpair/web`](https://www.npmjs.com/package/@penpair/web) plus the commands that run Penpot on your own machine: one private Penpot per project, started with one command, with generated secrets kept out of git, and `backup`, `backup verify` and `restore`.

```bash
npm i -D @penpair/docker
npx penpair setup --docker
```

or, for a one-off run without installing: `npx @penpair/docker setup --docker`.

It includes everything in [`@penpair/core`](https://www.npmjs.com/package/@penpair/core) (and everything `@penpair/web` has), so install it **instead of** `@penpair/web`, not beside it: both provide the command `penpair`.

It needs Docker Desktop running and a 2 GB first download. The guide and the comparison of web and Docker are in the [repository](https://github.com/niklas-westman/penpair#web-or-docker).
