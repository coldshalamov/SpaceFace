# SF20-01 route-observer continuation

Prerequisite: immutable clearance adapter patch SHA-2565b30771fbd1e82cf6c0298d8f74f1a02fc3aa3fefe5470d2529b31ff35601ee7. The first packet and all six of its postimages remain unchanged in the separate latch-nine-clearance-contract workspace.

## What this packet completes

- Browser and Node factory lookup, production init/update/clock declarations, and fresh-run reset register the observer immediately after physics
- UI and world-tow dock intents carry a private exact-object receipt. The UI owner validates actor, station and sector-entry identity before committing state. Repeated logical ID/generation values across restore do not make an old receipt current
- uiRoot emits a post-commit observation only after both docked fields are written, before visibility pauses the simulation. Legacy untagged/cloned docking retains ordinary compatibility but does not authorize character recognition
- The observer sees approach/permission state, current physical service-box displacement, canonical tender death, and session dismissal without writing player control or physical transforms
- Docked keepalive completes the cosmetic acknowledgement while simTime is frozen. No gameplay clock, body or permission advances from that wall delta
- The real Save capture plan, common sync/async serialization-section generator and restore prefix now delegate the four bounded semantic fields to the owner. New Game resets the owner through the existing runReset list

## Promotion and evidence boundary

`LATCH_NINE_RELEASE_PROMOTED=false` is explicit. A green census row is only a technical prerequisite and cannot secretly activate the character. No model, placeholder, spawn, renderer hook, voice line or new menu is supplied or presented by this packet. The next accepted model/spawn/presentation packet must explicitly promote the release.

Tests use a clearly labeled fabricated technical census row only to exercise observer/admission behavior. They never register it in production, load fake art or claim a visible normal route. Full authored-model readiness, native force-driven recovery, real rendered normal-route/SaveContinue capture and matched performance remain unverified.

The real Save functions are exercised with narrow fixture collaborators: capture plan, full section generator, and restore prefix up to owner deserialization. This proves hooks/order, not a full-game cold Continue. The previous native seed47 comparison belongs to the first selector-extraction packet; no heavy full-runtime test was started for this continuation while the coordinated Ceres run needs the machine quiet.

## Focused checks

Run: `node --no-warnings --test test/latch-nine-service.test.mjs test/latch-nine-runtime.test.mjs test/rep-gated-docking.test.mjs test/docking-corridor-far-quiet-latch.test.mjs`

46/46 pass:18 service,19 route-observer,3 ordinary rep-gated docking,6 corridor quiet-latch. Route coverage includes raw/old/wrong actor receipts, same logical ID+generation on fresh objects, station replacement, sector-entry changes, serialized receipt copies, post-commit listener ordering, paused completion, death, duplicate/stale observers, reset and Save hooks. Syntax and declared system clocks pass. No golden/expected values were changed.

Read `LATCH_NINE_MODEL_CONTRACT.md` for the exact next Forge/native/body/normal-route task, including the existing native compactHull early-return constraint that prevents a naive compact-hull-plus-crossbar-box manifest.

Only paths in ROUTE_PACKET.json belong to the continuation patch. Local synthetic Git preimage commits, dependency links and test support are not publication contents. No source-composition mutation, merge, push or deploy was performed by this continuation. Publication remains paused.
