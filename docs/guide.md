# Guide (skeleton)

The contract an adopting project works through. It grows with the code; each section ends in a checklist like Reflection's provider guide.

## Extension points
| Point | A project supplies | First implementations |
| --- | --- | --- |
| Connection profile | endpoint, Penpot version, where the token comes from | local Docker, shared self-hosted, hosted |
| Library adapter | where tokens and components come from | Marwes |
| Snippet registry | named plugin snippets with inputs and a size check | tree, audit, tokens, archive |
| Verification provider | what "matches the design" means | a page-verify gate, Reflection |
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
