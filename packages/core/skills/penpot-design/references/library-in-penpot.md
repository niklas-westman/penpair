# A component library in Penpot

How a design library sits in a Penpot file, in general. The live file is the source of truth: read it with `penpair tokens dump` and `penpair pages` before trusting any list.

## Token sets

Sets are applied in list order and a later set wins. A common order:

| Set | Role |
| --- | --- |
| Library core | the library's own theme, generated from the library |
| Library dark | dark overrides, generated |
| Project typography | the project's typeface, if it differs |
| Project light brand | brand colours, radii and text colours |
| Project dark brand | the same for dark mode |
| Project page or feature sets | tokens the library lacks: shadows, radii, typography for one page |

- Themes (for example `Mode/Light` and `Mode/Dark`) say which sets are active together.
- Generate the library sets from the installed library, not by hand, and keep the snapshot in the repository so a change shows in review.
- Names follow the library (`<library>-color-*`, `-spacing-*`, `-radius*`, `-typography-*`); the project's additions get their own prefix.
- Typography is composite (family, size, weight, line height, letter spacing).
- A parity test that compares the app's theme with these tokens catches drift in either direction.

## Components

- Library components are named `Library / Part / Variant`; project components `Project / Part`. Remember Penpot splits the name into a path and a name (see the gotchas).
- Check the library first: a component, prop or token it has is used as is. What it lacks is recorded where the project keeps its component map and built as a project component or token. Never add an escape hatch to the library for a project's divergence.
- Icons are drawn from the SVG the library renders, as primitives, with strokes bound to tokens.

## Pages and frames

- Name frames `<Page> / <Flow> / <State> / <Device>`; keep experiments in an archive board (`penpair archive`) once a version is chosen.
- Library parts live next to the frames on the page, never in the archive.
- The pixel gate or the project's own checks register frames by id; do not rename by id.
