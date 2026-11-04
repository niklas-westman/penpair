# Native copy: how a copy is verified, and why it was slow

**Status: built and verified live, 2026-11-04.** Examined at Penpot 2.19.0 (design.penpot.app), Penpair 0.10.0 plus the branch `fix/native-copy-diagnose`.

## Question

`design-release copy` of 14 heavy frames took 339 to 582 s, or never finished. Pasting is quick (about 4 s per frame); what took the time?

## What was measured (14 frames, single-render run, 339 s)

| Part | Time | Share |
| --- | --- | --- |
| Rendering the originals and the copies to PNG | about 150 s | 44 % |
| Reading the structure of every shape through the editor plugin | about 130 s | 40 % |
| The clipboard copy and paste itself | 59 s | 17 % |

Renders are bound by Penpot (4 to 7 s per large frame even when run concurrently). Reading one frame at a time was never faster: the first versions did exactly that.

## Decided against

- **Moving shapes between pages through the plugin.** `clone()` stays on its page and cross-page `appendChild` is a silent no-op (also written in [copy-between-pages](../copy-between-pages.md); re-tested on 2.19.0). The editor's own clipboard stays the transport.
- **Loosening the pixel limits to get green runs.** The 16 per channel limit stayed. A second rule was added only after the cause was shown from data: all pixels with a large difference sat on zero-height stroked paths, while the stored data was identical.
- **Rendering on Penpot's server with the access token** (the exporter, `POST /api/export`). Probed 2026-11-04 on design.penpot.app. The exporter authenticates only through the session cookie `auth-token` (its source: `exporter/src/app/auth.cljs`, `http.cljs`). With `Authorization: Token` it cannot read the file (400, the object list is empty). With the token as the `auth-token` cookie it reaches the renderer, but the headless page is not signed in, so the board never becomes visible and the render fails after 10 s, also for a small phone-sized board that renders in under a second. A personal access token does not stand in for a login session here. Not pursued further: it would need the account's own session.
- **Reading the whole file from the backend.** `get-file` is 132 MB and 25 s. `get-page` is one page, about 1.5 s.

## Decided for

- **Verify on the backend's stored data when a personal access token is set** (`get-page`, read-only). It is more complete than the plugin (component references and override bookkeeping are observable) and about 30 times faster. The plugin route stays as the fallback and for local Docker instances, where it was not tested.
- **Pixels stay a second check over every pair** (`--verify-pixels all`, the default): one render per side, and only a pair that differs is rendered again with the settled double render. A sample was the first choice on 2026-11-04 and the owner reversed it the same day: structure is exact for every frame, but only pixels show fonts, images and effects as Penpot draws them. `sample` and `none` remain as options.

## Findings worth keeping

- The backend trails the editor by 12 to 15 s after a paste and an arrange (19 frames). The tool waits for the new ids to appear instead of sleeping.
- Right after a write the backend once answered a page in a shape the client rejected. Waiting through it until the deadline is the fix; the cause was not captured.
- Reads before the paste must tolerate a busy editor. The slow plugin read used to hide this by giving the editor time to settle after the page was created.
- Teams and access: 245 shapes had other sizes in the copy. The source holds stale automatic-layout sizes and Penpot recomputes them on paste; copying the copy is identical. First reported as `incomplete`, then made precise: of the 276 shapes that differ in size or relative position, all 276 sit under an auto-layout board and none anywhere else, so that class is now `copied` with `layoutRecomputed`, while any size or position outside an auto layout, or any other attribute, is still a problem. The rule was checked against My work and Menu: no layout-driven shape, no problem. The source is not touched; the result says which boards hold stale sizes.
- One unfinished run (`incomplete`, paste done) blocks every later copy in the same file until it is resumed or abandoned, even for other frames. This is deliberate and strict; it is the next thing to revisit if it blocks real work.

- Component instances: a copy may compare them by identity (and says so), because the plugin cannot see which properties are overridden. The rule lives in the shared fidelity code, so loosening it for the copy first loosened `design-release verify` and `check` too, unnoticed. It is now an explicit option that only the copy passes (`NativeFidelityOptions.componentIdentity`), with a test that release verification still blocks. Letting `verify` use the backend's stored data, which does include the overrides, is the sound way to allow instances there; it changes a release gate and needs the owner's decision.

## Measured result

14 heavy frames: 339 s on the plugin route, 101 s on the backend route (preparation 5.6 s instead of about 140 s). Teams and access, the 19 frames of its copy copied again: 99 s.
