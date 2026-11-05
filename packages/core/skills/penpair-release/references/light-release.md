# Light release: copy, then attest

Use this when the person wants a release page checked and approved quickly. It needs the personal access token (`PENPAIR_PAT_TOKEN`; `penpair doctor` shows whether it works) and the pinned file. There is no plugin route: the check reads Penpot's stored data and renders nothing.

## Steps

1. **Get the boards onto `release/VERSION`.** By hand in Penpot, or `penpair design-release copy --source-page PAGE --frame ID ... --release VERSION` (preview first; `--apply` needs `--debug-port`). Do not pass `--frame` for boards that did not change; they stay on their earlier page.
2. **Check, read-only.** `penpair design-release attest --release VERSION`. Read the whole report:
   - `verified`: every release board has exactly one source board and no real difference. Nothing was written.
   - `failed`: read `problems`. A board with no source (renamed or edited in the release page), several sources (add `--source-page PAGE`, repeatable) or a real attribute difference. Nothing was recorded. Fix the page or the source, then run again.
   - `already-attested` / `changed-since-attestation`: a record exists. The second names the boards (`changed`) that differ from it.
3. **Let the owner look.** The check does not look at pixels. Offer `penpair export --renderer editor ...` for a quick image or ask the owner to open the page in Penpot. Layout-driven boards (`layoutDrivenFrames`) were resized by Penpot's auto layout on purpose; mention how many.
4. **Record, only on the owner's words.** `penpair design-release attest --release VERSION --write --by OWNER --note "OWNER WORDS"`. The words are theirs, for this exact release, in their own phrasing; if they have not given them, stop and ask. The record is `design/releases/VERSION.attestation.json`; tell the person to review and commit it.
5. **Later.** Run `attest` again to see whether anything changed. To record a changed page: look at the named boards, get new words, then `--write --replace`.

## What the record says, and does not say

Says: at that time the release page equalled its sources on Penpot's stored data, per board (hash of each side's subtree, node count), approved by the named person in their words.
Does not say: that the boards look right, that the implementation matches them, or that an earlier approval carries over. It is not a `design-release finalize`; it does not satisfy `check` or `status` for a strict release record. Say which one you produced.

## Recovery

- `access-token-invalid` / not set: create a token under Profile, Access tokens, put it in `.env.local` or the environment, run `penpair doctor`. Never print it.
- `backend-unavailable` right after a copy: Penpot saves a few seconds after the editor shows a change (12–18 s seen). Wait and run again; the check is read-only and safe to repeat.
- `no page named release/VERSION`: the page name must match exactly.
- A record file already exists and the page changed: `changed-since-attestation`; never delete the old record to get past it.
