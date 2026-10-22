# Hello, card

Copy these four JavaScript bodies into the configured scratch project. Use existing active typography, color, spacing and radius token names. The files create one named root, record an explicit ownership marker, bind its card/text and independently read the result. Repeating a completed build preserves IDs. A changed, renamed, ambiguous or differently owned example refuses a fresh build rather than deleting content.

From that project's root (adjust the copied paths):

```sh
penpair run-file examples/hello-card/build.js \
  --include @kit --include examples/hello-card/helpers.js \
  --inspect examples/hello-card/inspect.js --readback examples/hello-card/readback.js \
  --page Candidate --param name=HelloExample --param marker=hello-example-1 \
  --param typo=YOUR_TYPOGRAPHY_TOKEN --param color=YOUR_COLOR_TOKEN \
  --param space=YOUR_SPACING_TOKEN --param radius=YOUR_RADIUS_TOKEN
```

Review inspection, then repeat with `--apply`. The marker is ownership bookkeeping, not authorization or authentication. Save the returned `rootId`; export it twice and look at the resulting image. Independent token/structure verification does not approve visual parity. Use a separate reviewed operation for later edits or removal.

For a temporary example that is built, exported and removed automatically, use the opt-in `probe --deep --kit --write` on an authorized scratch file. Read [kit contracts and limits](../../docs/build-kit.md).
