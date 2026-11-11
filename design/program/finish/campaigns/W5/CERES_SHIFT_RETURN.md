# Ceres return: exact PR #945 adapter

## Result and scope

The eight reviewed source/test files are published as a partial adjacent increment
on parent commit `6539117c5dac1e333e6d0aa5c1fe41378b5d4c6c`, tree
`25799f2618334c1b7d010be35b13f2d138d9eb02`. Their original review parent was
`4ee9a0ab3bf0108dd01cbfd744eac1868d7b1d22`. The intervening commit adds only the
Ceres commission's director card; its exact bytes are preserved. It does not
change any runtime or test dependency. Full-tree reconstruction verifies that
there is no other intervening change.

This scene does not complete Winching, the Ninth Mouth, the Stranger Test, or
EC-S02. The director card's order and acceptance requirements remain in force.
The PR remains a partial, draft commission, not a finished area.

After actual Second Measure plate work, Kessler's ordinary Helios Bar card offers a
return conversation. It distinguishes the 400-credit brace wage from a recorded
original-plate delivery, unfinished or unsupported work, stopped equipment, custody,
and loss. The player can ask about the crew and reversibly remember that emphasis.
A prior delivery retains its historical meaning after a later loss or equipment stop.
No injury, survival, replacement load, or new work reward is invented.

Seven runtime files and one new regression test form the adapter. The existing
Bar readability CSS and both published readability tests are unchanged. The Bar
controller retains complete responses, keyboard/gamepad choice scrolling, original
layout, and the existing reply focus behavior. Prior Ceres physical, wage, custody,
receiver and save owners are untouched. Unrelated dirty Wex/Rook, mission and worker
changes were not imported.

## Previously missing dependency

The first seven-file transplant failed the production-worker cold-contact test:
authority accepted the question, but `player.stationContacts` did not publish the
new choice on that reply. Both author and independent reviewer reproduced 10/11.
The original review had silently relied on a surrounding dirty worker change.

The eighth file, `scripts/lib/simWorkerHost.mjs`, adds only the existing
`stationContact:changed` event's contact-bag invalidation and paired unsubscribe.
It uses the existing differ API and lifecycle owner. This is four added lines,
including two comments; no other worker change was copied.

The read model adds only `npcJobs.ceresWorkfleet.phase` at cadence one. Site records
keep their existing bounded cadence. Spoken Ceres answers wait for an authoritative,
request-correlated accepted/refused receipt, so stale queued questions cannot show a
successful answer. Save loading, hidden/replaced conversations, undocking, newer
questions, duplicate replies and disposal retire the appropriate pending reply.

## Original exact-parent review

- Ceres owned checks: **11/11 pass** on the exact parent adapter.
- Published Bar mounted readability checks: **5/5 pass**, with unchanged test bytes.
- Independent review: **12/12 pass**, including a separately authored worker scope
  and shutdown test. No remaining code blocker found on the frozen runtime hashes.
- Broader aggregate: **120/123 pass**. Three domain-node lifecycle tests fail identically
  on untouched #945: dotted-parent collapse/re-add, expanded Orchard, and expanded boss
  presentation probe parity. Baseline is **2/5** for that test file. No tests or expected
  values were changed to suppress the failures. This is not a fully green aggregate.
- Native Ceres tests use production mining/physics/site/save owners, earn either the
  paid brace or an unsupported cut, then exercise conversation and full Save/Continue.
  They rematerialize one 1,800-mass original, with one 400-credit payment or no payment.
- Prior Ceres consequences, receiver handoff/Continue, stagecraft and wage checks pass,
  as do adjacent Bar/contact and domain-cadence/profile checks in the aggregate.
- 47-A seed 47, 720 ticks, reload 600: exact parent and candidate each pass uninterrupted
  versus Continue comparison, with all four hashes equal to
  `ebbfe82a6bf1e87ac1912942751e661fe6cf4ba42e69a2ddce360c408385061b`.
- Labels, UI accessibility, panel-composited WCAG contrast, UI identity, 55 UI imports,
  save schema, JavaScript syntax, and type floor pass. Existing raw-nebula contrast
  warnings remain. The type check inspected 2,559 declarations.
- Imported modules and direct file reads were validated against immutable parent or
  declared candidate content: **2,664 unique repository files, 29,891 observations,
  zero mismatches**. Existing `node_modules` supplied external packages. One existing
  parent invalid UTF-8 byte is preserved and module decoding checked as Node handles it.
- The exact patch applies in a zero-fuzz dry run. Full-tree hashing confirms only the
  eight source/test paths plus this supporting report differ from the parent.

The source loader fails closed for absent parent files. Directory listings and file
metadata are also pinned to the immutable tree, avoiding dirty-only entries or a
tracked file absent from the shared checkout. The first type-floor attempt exposed
that metadata issue; after correcting the evidence harness, the final check passes.
An initial mistyped save-check script path failed before execution; the actual
`generate-save-schema.mjs --check` command passes. Neither issue changed runtime code.

## Fresh-parent publication verification

The publication recheck uses the complete tree of `6539117c5dac1e333e6d0aa5c1fe41378b5d4c6c`,
reconstructed from the immutable original parent plus the exact GitHub director-card
blob. Its full Git tree hash matches GitHub before adding the reviewed adapter.
All eight source/test files remain byte-identical to the independent review.

- Ceres checks: **11/11 pass**. Mounted Bar readability: **5/5 pass**.
- Independent worker invalidation and shutdown check: **1/1 pass**.
- Fast tier: **39/39 commands pass**, with no changed expectations.
- Save schema passes. 47-A seed 47, 720 ticks, reload 600 again passes uninterrupted
  versus Continue comparison, with equal hashes and no divergent tick.
- Source audit: **8,170 unique repository files, 47,410 observations, zero mismatches**.
- Full-tree construction accounts for 28,196 file entries and preserves every path
  outside the declared nine-file delta, including the director card and published
  Bar readability CSS/tests.

The separate compact-layout browser test could not start because the Chromium
executable is absent. No browser ran and no installation or launch retry was made.
Consequently the aggregate invocation containing that test is **17/18**, not green.
The successful 17 checks are individually identified above. Browser layout,
game-playable route, hitch measurements and Stranger Test remain unverified.


## Reproduction and artifacts

From the integrated candidate revision:

```sh
node --test test/ceres-shift-return.test.mjs test/bar-dialogue-readability.test.mjs
node scripts/generate-save-schema.mjs --check
node scripts/sf-sim.mjs compare 47a --seed 47 --ticks 720 --inputs test/47a.inputs.json --expect test/47a.telemetry.save-v26.expected.json --reload-at 600
```

The local handoff contains `final.json`, `final/`, `parent.json`, `parent/`, the
reproducible `build-adapter.py`, exact patch, SHA-256 manifest, immutable-tree receipt,
source audit, test logs, and independent review. Only the declared source/test files
and this report are candidate repository content; evidence harnesses remain local.

## Remaining acceptance limits

No browser was launched or retried under the existing environment restriction. New
Ceres dialogue has not been visually accepted on phone or desktop. Mounted DOM tests
do not establish real wrapping, occlusion, pixel geometry, or trusted browser input.
Native operation fixtures explicitly set up approach and Helios docking, rather than
proving the uninterrupted player-flown Helios–Ceres–Helios journey. Audiovisual,
pacing, performance and full EC-S02 commission acceptance remain open.

The original preparation and independent review did not publish any changes.
This publication preserves the director card and all newer parent content, adds
only the eight frozen source/test paths and this supporting report, and leaves
the shared source/index untouched. Publication is not a merge or deployment.
Remote commit and tree verification are recorded separately after the branch
update; no green CI or full commission acceptance is claimed here.
