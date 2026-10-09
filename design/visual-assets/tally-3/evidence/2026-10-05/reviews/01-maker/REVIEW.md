# Tally-3 isolated candidate independent review

Reviewed 2026-10-05, final bounded pass at 02:48 UTC. Result: maker-owned corrections reviewed successfully; one concrete Save-owner integration blocker remains. This is not final production/game-camera acceptance.

## Scope

Read the implementation brief, technical intake and actual SF20-03 dossier; reviewed the narrow data/title/runtime/settlement/prompt/visual helpers and exact preimage diffs for salvage, economy, cargo, scanner, contact hail, provenance ledger, comms, voice arbiter, industrial beam, parts library and visual overrides. The final extension includes `scripts/lib/modelTruthTally3.mjs` and its native geometry tests. No production or shared-repository edits were made. Review-only artifacts are confined to this directory. `review-final-files.sha256` pins the reviewed files.

## Remaining blocker

High: same-session public Save/Continue can preserve a later heat-applied ledger while restoring an earlier heat scalar. In `test/tally3-atomic-cargo.test.mjs`, the snapshot taken synchronously from `law:incidentReceipt` contains accepted law/source/cargo state, heat 0, and no heat applied-ID maps. The original transaction then completes with heat .22 and its applied IDs. `save._restorePlayer` (`src/save/saveSystem.js:5274–5293`) only copies incoming keys and shallow-merges nested objects. Consequently, absent optional applied maps survive from the later live session. Tally correctly replays the original durable law fact through the heat owner; that owner sees the retained applied ID and refuses it, leaving heat 0.

This is independently reproduced, not a guessed absence of evidence. The other two public transaction-event snapshot cases pass. The candidate must not be labelled transaction-tick Save-safe until the Save owner replaces/restores these optional run-owned records without future-history contamination. No direct heat assignment or historical-witness re-query is an acceptable Tally workaround. The parent has routed this exact protected-owner repair to the integration owner.

## Corrected maker findings

All six independent assertions now pass in `owner-edge-final.tap`:

1. A theft saved at `cargo:changed` retains acquired cargo, source quantity and the original actual station-witness law consequence
2. A denied first partial theft no longer licenses a later newly witnessed transfer; only accepted law receipts suppress later reports
3. A continuous/no-teleport membership exit retains the live assessor's population slot
4. A scan-created gesture withdraws when selection changes without an open prompt
5. Normal Hail availability is bounded to the Tally runtime's 420 WU range, avoiding the formerly enabled but silent 500 WU action
6. The scan-created gesture also withdraws when the still-selected crate dies

The cargo join is narrowly scoped: ordinary `addCargo` preserves its accepted-quantity result and event behavior; the exact Tally lot receives a synchronous accepted-quantity callback, allowing salvage disposition and actual law reporting before cargo notification. The restored transaction normalizer retains its journal. The source/body/payment commit remains economy-owned with permanent receipt dedupe outside the display ring. There are no new independent wallet, cargo, heat or native-body writers.

## Verification

- `focused-initial.tap`: first maker run 37/38, with then-unfinished exact-native-cache expectation
- `focused-midreview.tap`: 39/39 after that fixture was corrected to its actual scalar-restore behavior
- `focused-final-after-corrections.tap`: 58/59 in the final full focused suite; its sole failure is the public earliest-law Save/Continue blocker above
- `owner-edge-final.tap`: all six independent assertions pass
- `regression-final.tap`: 39/39 neighboring salvage, theft, receipt, scan-provenance, bounded-lookup, voice-dismiss, cargo-lifecycle and direct-mining cargo-overflow checks after the cargo join

Native tethered Continue is honestly scoped: it restores one crate/title/receiver, reconstitutes one native tether and advances 20 native physics steps. Its recorded mode is scalar with `identity_or_contract_changed` because ambient salvage is regenerated; it does not establish exact whole-world native-cache reuse.

## Source-spine/native bay contract

The narrow helper validates the exact catalog/source/recipe/root identity and transform, decodes the hash-bound `COLLISION_HULL`, and checks its 21-vertex planar boundary against the native compact hull in both directions. It explicitly excludes arms, stamp, cradle and scan from solid coverage. Shrunk, inflated, cosmetic-fork-tip, wrong-identity and altered-byte candidates are rejected. Existing all-visible compound-box measurement stays fail-closed rather than receiving fabricated boxes.

All eight source-spine/native tests passed. They verify one actual SG-02 convex-prism collider, empty receiver/V region, 15 actual native approaches across three yaws and near-.25 WU tolerance offsets, no automatic centering/suction or payment, explicit delivery only, rejection outside .25 WU, and a positive control where the crate collides with the actual spine and transfers momentum. The source parity report is source geometry plus native collision evidence, not release-package evidence.

## Source-art review

Personally inspected actual v3 top, chase, close, working and labelled 50/100/170px source-reduction-strip pixels. The long dark central spine, pale layered panels, unequal open truss arms, substantial amber stern stamp and open forward V remain readable. At 50px the strip honestly loses fine lattice detail while retaining continuous arms and the identifying silhouette; 100/170px retain open construction. No source-art visual blocker found.

Source GLB bytes independently hash to `85ae67b12d490606224052c9e2b60f9f352b3d05984e5bec4a28b85674de7f77`, matching the contract. It has one collision node, four named motion groups, six source images and no glTF animations. The contract reports LOD triangles 16242 / 6492 / 2156 and 11 visible primitives each. The one-primitive excess over proposed near target 10 is explicitly disclosed; no live draw/GPU performance pass is inferred.

## Intentional integration boundaries

The root-owned authoredMotion, Forge fleet, canonical manifests, compressed release, runtime package and census-generator joins remain outside this maker slice. They are not passed by any source test. The new source-spine helper is suitable for that serialized generator join, subject to the exact tested identity/seal constraints.

Source Blender images, CPU decoding, motion-bank tests and the bounded normal-route fixture do not establish shipping-renderer/art acceptance, the full production Ceres route, or quiet-host performance. Those deliberate unperformed gates are not represented as passed.
