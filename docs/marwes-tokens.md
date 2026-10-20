# Marwes tokens in Penpot, and keeping them true

`@penpair/marwes-ui` puts the design tokens of [Marwes UI](https://marwes.io) (and your own theme on top of them) into your Penpot file, and keeps them from drifting away from the Marwes your app actually uses. The idea in one line: **the installed Marwes and your theme file are the truth; Penpot is made to match, and anything that stops matching is found.**

## How it fits together

```
  installed Marwes  ─┐
  (@marwes-ui/core)  ├──▶  expected tokens  ──▶  committed snapshot  ──▶  Penpot file
  your theme file   ─┘     (generated)           design/…snapshot.json     (sets and themes)
  (acmeLight …)                              reviewed in git
```

- **Nothing is typed in twice.** The tokens are generated from the Marwes the app resolves and from the theme file the app imports (the same file and export), so what you design with is what the app renders.
- **Your choices stay visible.** Marwes's own values go in `Marwes · Core` and `Marwes · Dark`. What your theme changes goes in a small overlay set on top (`Acme · Light`, `Acme · Dark`), holding only the differences. A Marwes update moves the Marwes sets and never silently loses your choices, and the colours Marwes derives from yours (hover, pressed, disabled) follow automatically.
- **The snapshot is the record.** `design/marwes-tokens.snapshot.json` is generated, committed and reviewed like code. A Marwes bump shows up as a readable git diff of exactly which tokens changed.

## Setup

```bash
npm i -D @penpair/marwes-ui        # next to @penpair/web (or @penpair/docker)
```

In `penpair.config.json`:

```json
{
  "adapters": ["@penpair/marwes-ui"],
  "marwes": {
    "name": "Acme",
    "project": "packages/app",
    "themes": {
      "light": { "module": "packages/app/src/theme.ts", "export": "acmeLight" },
      "dark":  { "module": "packages/app/src/theme.ts", "export": "acmeDark" }
    },
    "snapshot": "design/marwes-tokens.snapshot.json"
  }
}
```

| Setting | Meaning |
| --- | --- |
| `name` | Prefix for your overlay sets. Defaults to the instance name, capitalised. |
| `project` | The folder of the package that depends on Marwes (a workspace package in a monorepo). Default: the project root. |
| `themes` | Your own light and dark themes: a file and the name of its export (a Marwes `ThemeInput`; TypeScript is fine). Leave them out and only the Marwes sets are made. |
| `snapshot` | Where the committed snapshot lives. Default: `design/marwes-tokens.snapshot.json`. |

Then:

```bash
penpair marwes tokens snapshot --write     # generate the expectation and save it; commit the file
penpair marwes tokens push --apply         # make Penpot match (look first without --apply)
```

## The commands

| Command | Needs Penpot | What it does |
| --- | --- | --- |
| `penpair marwes tokens snapshot [--write]` | no | Builds the expected tokens from the installed Marwes and your theme, and shows how they differ from the committed snapshot. `--write` saves it. |
| `penpair marwes tokens check [--json]` | no | Is the committed snapshot current? Exit 0 yes, 2 stale or missing, 1 broken (for example a half-finished Marwes upgrade). Made for CI. |
| `penpair marwes tokens diff [--json]` | yes | Penpot against the snapshot: what is missing, what differs, what was added by hand, and **how many shapes use each changed token**. |
| `penpair marwes tokens push [--apply] [--prune]` | yes | Brings Penpot to the snapshot. Looks first and prints the plan; `--apply` writes. |
| `penpair marwes tokens status` | optional | One screen: the installed Marwes packages, the snapshot, and Penpot. |

## What can drift, and what catches it

| What drifted | Caught by | Resolved by |
| --- | --- | --- |
| Marwes was upgraded (any token changed, added or removed) | `check` (offline, in CI): the snapshot is stale | `snapshot --write`, review the git diff, commit, then `push --apply` |
| Your theme file changed | `check`: the snapshot is stale | the same |
| Marwes packages are at different versions (a half-finished upgrade) | `check` fails with exit 1 | finish the upgrade; Marwes releases its packages together |
| **Marwes grew a kind of variable the adapter does not turn into a token** | `check`: the snapshot lists every variable it does not cover, so a new one changes it | review it, then extend the adapter or accept it by writing the snapshot |
| Someone edited a token in Penpot by hand | `diff`: shown as a difference, with what it reaches | `push --apply` puts it back (Marwes is authoritative) |
| Someone added a token to a Marwes set by hand | `diff`: "not in the expectation" | kept unless you push with `--prune` |
| A set was deleted or a theme changed in Penpot | `diff` | `push --apply` |
| The recorded Marwes version (in every token's description) is old | `diff` | `push --apply` updates it, so the file says which Marwes it came from |

## After a Marwes bump

```bash
pnpm up @marwes-ui/react                          # the app moves to the new Marwes
penpair marwes tokens check                       # fails: the snapshot is stale, and says what changed
penpair marwes tokens snapshot --write            # regenerate; review `git diff design/` (the tokens that moved)
penpair marwes tokens diff                        # what Penpot lacks, and how many shapes each change reaches
penpair marwes tokens push --apply                # bring Penpot along; it reads everything back to verify
```

`push` refuses to run while the snapshot is stale: the repository's record must lead, so a token never reaches Penpot that has not been through a commit. After the push, export your pages and let [Reflection](https://github.com/niklas-westman/reflection) show you what the new tokens changed visually.

## Keeping it from drifting in the first place

- **CI.** Add the check to the same pipeline that runs your tests: `penpair marwes tokens check`. It needs no Penpot and no key, so it runs anywhere. A pull request that bumps Marwes (by hand or by a dependency bot) or edits the theme without a new snapshot cannot merge.
- **A test, if you prefer.** The adapter exports the same check for your test runner:

  ```ts
  import { checkTokenSnapshot } from "@penpair/marwes-ui";

  it("the Penpot token snapshot is current", async () => {
    const check = await checkTokenSnapshot(process.cwd());
    expect(check.problems).toEqual([]);
    expect(check.current).toBe(true);
  });
  ```

- **Before designing.** `penpair marwes tokens status` takes a second and says whether the design file is on the Marwes the app uses.

## What `push` does and does not touch

- It manages only the sets the snapshot names (`Marwes · …` and your `Acme · Light/Dark`). Any other set in the file is yours and is never touched.
- It creates new sets inactive and builds the Light and Dark themes. If the file has **no active theme**, it activates Light so the tokens take part; a file that already has an active theme keeps its choice.
- Plain values are updated in place. Typography tokens are removed and added again, because Penpot stores a typography value assigned in place un-normalised.
- Tokens go in batches that stay under Penpot's request limit, and it stops at the first token Penpot rejects and says which.
- Afterwards it reads everything back: the file must match the snapshot, and **no shape may have moved or been rebound** (a fingerprint of every page's structure is compared before and after). Otherwise it says so and exits 1.

## What is covered, and what is not

Everything Marwes resolves for a theme becomes a token: colours, density sizes, the two radii, the three font families and the typography styles, plus the spacing scale. A variable that is not (today: `--mw-density-spacing-multiplier`, a multiplier) is listed in the snapshot's `unmapped` field and in `snapshot` output, so the gap is visible and a change to it is noticed.

Not covered yet: Marwes **components** in Penpot. Tokens come first; components are built as pages need them.
