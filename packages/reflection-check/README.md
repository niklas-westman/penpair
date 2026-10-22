# @penpair/reflection-check

The recommended companion when you implement a frontend from Penpot and want repeatable visual checks against approved designs. It is an optional package installed alongside one command package at the same reviewed version and registered in `adapters`.

**Penpot design → approved reference and handoff → frontend code → browser capture → comparison → owner review.** Start with the [companion setup guide](https://github.com/niklas-westman/penpair/blob/main/docs/adapters.md#check-the-frontend-against-the-design) for installation, registration and the readiness checklist. Installing the package does not configure application state or supply a browser provider.

It depends on the neutral core; the core does not load or depend on this adapter.

The existing generated Reflection `visualSmoke` configuration remains the simple route for legacy cases. This adapter addresses the missing setup hook for rich theme/state/fixture/font cases. It does not bundle a browser or assume a version-specific Reflection API. A trusted project provider owns actual application activation, capture and comparison using the project's pinned browser/checker stack.

```sh
penpair reflection plan --map design/implementation-cases.json
penpair reflection check --map design/implementation-cases.json --provider design/reflection-provider.mjs
```

Mapping: `{"schemaVersion":1,"cases":[{"id":"dashboard-empty-dark","setup":"dark-empty"}]}`. A case must have current exact approved provenance, matching file pin and an explicit setup name. Missing mappings, legacy approvals and changed case metadata remain pending. No setup is silently replaced by the default route state. Baselines remain owned by the core; this adapter neither captures nor approves design references.

The provider module exports `async runCase(test)` and receives the immutable case ID, route, setup key, declared intent, baseline relative path/hash/scale and threshold. It must activate the route/theme/state/data fixture, verify actual browser state and fonts independently, capture a new PNG at the requested scale, and use the installed checker to compare it with the approved image. It returns:

```json
{
  "schemaVersion":1,"id":"dashboard-empty-dark","route":"/dashboard","setup":"dark-empty",
  "observed":{"viewport":{"width":1280,"height":900},"theme":"dark","state":"empty","fixture":"no-items"},
  "fonts":["Expected Font"],"fontsReady":true,"baselineHash":"EXACT_SHA256",
  "screenshot":".penpair/comparison/dashboard.png","diffPixelRatio":0.01,
  "provider":{"name":"PROJECT_PINNED_CHECKER","version":"ACTUAL_VERSION"}
}
```

Observed context must come from browser readback, not copied test inputs. The adapter checks context/font evidence, independent screenshot path, PNG dimensions, byte hashes and unchanged baseline bytes. A trusted provider can lie: this interface is an evidence contract, not a sandbox or cryptographic attestation of browser work. Modules and transitive imports execute project code. Pixel ratios are checker evidence, never a visual verdict, accessibility assessment or owner approval. Exit 0 means complete evidence within thresholds; 2 means measured drift; 3 means missing/incomplete evidence. Every result still says `owner-review-required`.

No real consumer was modified and no live implementation route was run here. The offline integration test uses a named stub; replace it with a real provider and record the I12 human trial before claiming adoption. Release/publishing is the owner's act and all six packages remain in lockstep.
