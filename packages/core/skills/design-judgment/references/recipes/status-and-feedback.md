# Recipe: status and feedback

Defaults that make status and feedback consistent across screens. The tone map and the channel rule are proposals until the project's owner approves them.

## Status is a label with a tone

Use a status badge with text. Tone carries meaning, never quantity; every badge also reads in greyscale.

| Kind of value | Tone |
|---|---|
| Not yet looked at, none | neutral |
| In progress, informational | info |
| Needs attention soon, waiting | warning |
| Done, accepted, healthy | success |
| Failed, blocked | error |

Map each domain value to one row of this table and write the map down where the project keeps its decisions. If the library draws the neutral badge white, it needs a surface behind it on a white page; keep that deviation visible in the frame.

## Which feedback channel

| Situation | Channel |
|---|---|
| Field input is wrong | Inline, beside the field, with the fix |
| A region cannot load or a state persists | An error banner in that region, with a retry |
| The user's own action finished and nothing more is needed | A toast |
| An irreversible or blocking decision | A confirmation dialog with a specific verb |
| Information the user needs before acting | Inline text or an info banner |

A banner with an action uses the secondary button; one primary action per screen.

## Copy

Plain labels that name the result ("Save changes", "Delete project"); errors say what happened and what to do; the same action keeps the same name everywhere. Strings the owner has approved stay as approved.

## Check

Render each channel once; read every action label out of context; confirm no status relies on colour alone.
