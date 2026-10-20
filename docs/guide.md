# Guide (skeleton)

The contract an adopting project works through. It grows with the code; each section ends in a checklist like Reflection's provider guide.

## Extension points
| Point | A project supplies | First implementations |
| --- | --- | --- |
| Connection profile | endpoint, Penpot version, where the token comes from | local Docker, shared self-hosted, hosted |
| Library adapter | where tokens and components come from | Marwes |
| Snippet registry | named plugin snippets with inputs and a size check | tree, audit, tokens, archive |
| Verification provider | what "matches the design" means | `penpair baselines` (images and Reflection cases, below), a page-verify gate |
| Skill pack | rules the agent follows | the Penpot skill, design judgment |

## Sections to write
- Starting from an empty machine
- Instances (written, below): one per project, ports, volumes, secrets, backup and restore
- The write protocol
- Writing a snippet
- Writing a library adapter
- What breaks when Penpot is upgraded

## Instances
One Penpot per project, configured in `penpair.config.json` (no secrets, commit it):

```json
{ "instance": "my-app", "penpotVersion": "2.18.3", "ports": { "frontend": 9002, "mail": 1081 }, "directory": ".penpair" }
```

| Command | What it does |
| --- | --- |
| `penpair setup [--web \| --docker]` | The guided path: where is Penpot, config, start it if it is Docker, take the key (hidden), wait for the editor, read the file, install the skills |
| `penpair connect [--replace]` | Only the key and the wait for the editor; accepts a pipe (`pbpaste \| penpair connect`) |
| `penpair init [--instance <name>] [--port 9002] [--gitignore]` | Writes the config if missing, the compose file, and a secrets file (owner-only) that is never replaced |
| `penpair up` / `down` / `status` | Start (waits until the backend answers), stop (the data volumes stay), look |
| `penpair doctor [--json]` | Docker, secrets, containers, frontend, backend, then the editor and plugin through the MCP, and that `.env.local` is kept out of git (a web project checks only the address, the editor and the key file) |
| `penpair backup` | A Postgres dump and a tarball of the assets, with checksums and counts, in `.penpair/backups/` |
| `penpair backup verify <dir>` | Restores the dump into a throwaway database and compares counts, revisions and asset files |
| `penpair restore <dir> --yes` | Replaces the instance's data; a safety backup of the current data comes first; the counts are compared afterwards |

Things to know:
- Two instances never collide: the compose project is `penpair-<instance>`, so containers and volumes have their own names. `composeProject` in the config adopts an instance that was started earlier under another name.
- Keep `.penpair/` out of git. Backups hold account data (password hashes).
- The database password must not change while the database volume exists; the secrets file is never regenerated.
- The frontend answers a few seconds before the backend; `up` and `doctor` look at `/readyz`.
- `doctor` compares the MCP key's port with the instance's, because a key for another instance silently drives the wrong file.
- Penpot's accounts come from the first registration in the browser; the MCP key is made in Account, Integrations, MCP Server and goes in `.env.local` as `PENPAIR_MCP_URL`.

## Baselines for a check

`penpair baselines` hands a page's design to a check that compares the implementation against images. It reads the `baselines` block of `penpair.config.json`:

```json
"baselines": {
  "page": "Candidate",
  "root": "tests/baselines",
  "threshold": 0.05,
  "frames": [
    { "frame": "F / candidates", "id": "candidates-desktop", "route": "candidates" },
    { "frame": "F / my work", "id": "my-work" }
  ]
}
```

- `frame` is the exact name of a top-level frame on the page; two frames with the same name is an error, so the reference is never ambiguous.
- `id` names the image (`<id>.png`) and the check. `route` is the route in your app this frame is the design of; a frame without a route is exported but gets no check.
- Without `--apply` the command only looks and reports each frame as `new`, `same`, `changed`, `unstable` (the export never settled) or `missing`. `--apply` writes new images, `penpair-baselines.json` (file, revision, sizes, hashes) and `reflection-cases.json`. A `changed` image is replaced only with `--apply --update`: that is the act of approving the new design, and the owner's call. The exit code is 2 when a design differs from its image, 1 when a frame is missing or unstable.

The generated `reflection-cases.json` holds, per route, the viewports (the image's exact size) and the `visualSmoke` cases (review-only, `strict: false`). A Reflection config uses it like this; only the route's own expectations are written by hand:

```ts
import { defineReflection } from 'reflection-check';
import cases from './tests/baselines/reflection-cases.json' with { type: 'json' };

export default defineReflection({
  project: 'my-app',
  run: { defaultMode: 'smoke', ciMode: 'smoke' },
  contracts: {
    browser: {
      enabled: true,
      blocking: true,
      baseUrl: 'http://127.0.0.1:5173',
      routes: [
        { id: 'candidates', name: 'Candidates', path: '/candidates', viewports: cases.routes.candidates.viewports, expects: [{ screenshot: 'final' }] },
      ],
      visualSmoke: cases.visualSmoke as never,
    },
  },
});
```

`baselineRoot` in the generated cases is relative to the Reflection config's folder, so keep the two in the same project root. The same images work with any other image comparison; the Reflection cases are one output of the manifest.

The percentage a comparison reports is not a verdict: a correct implementation differs from a Penpot render by about 1 to 2% on text alone, so read the diff image.
