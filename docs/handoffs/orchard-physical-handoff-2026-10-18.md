# Orchard field arrival: evidence and open work — 18 October 2026

## Reviewed source candidate

Candidate source revision `7d82f9a7b587ba903538ae4777d2d7f56df57f30` corrects an Anvil collector arrival failure under capped field admission. Steering now uses only the actual impulse accepted by the protected physics path. That causal receipt may be consumed for one tick after acceptance, but never predicts a later admission decision. Entity life, latest force-pass, source lifetime, expiry, clear/load, and zero-force checks retire stale feedback. Authored speed, braking, admission order, budgets, and physical arrival/custody gates are unchanged.

On the prior `9679157e5239756bbe9aed1296a3565ee1a485b5` source, a real `maxAffected: 1` well excluded the collector yet steering still added throttle `0.2583124605952709` instead of the ordinary baseline `0.047058823529411764`; no collector impulse was accepted. The sealed candidate's exact five-file serial command passed **15/15, exit 0, in 23.164 seconds**; its 60-second watchdog was unused. The run fingerprinted 2,354 files before and after. This is focused source/test evidence, not saved-route or whole-game acceptance.

## Route and heat boundary

The historical 18,900-tick route, its three loaded physical returns (1/2/1 units), and cycle-three refill at tick 51,414 are evidence for source `9679157e5` only. They do not prove an empty return or acceptance of candidate `7d82f9a7`.

A bounded ordinary empty-return attempt started from the frozen tick-56,561 save (1,235,957 bytes; SHA-256 `98edbf75623ab82aba38750cca2594e160dca10dd06724025b21180bd2cdd53c`) under the revised source. At this handoff's evidence cutoff, 2026-10-18 06:17:54 UTC, that attempt was underway and had no result to record. Loading the old endpoint under the revised source creates a new heat-reset boundary because the runtime resets heat on save/load; no uninterrupted hot-recovery claim crosses it, and the exact new reset tick is not yet captured. Inspect the actual cargo and thermal state at each bounded segment. A loaded exit is not an empty-return acceptance. Do not write heat, phase, job, cargo, or actor pose to force the outcome.

The previous approved four-unit physical handoff and 120 stable ticks remain a separate source-bound result. They are not evidence for this field-feedback candidate.

## CI and delivery

The reviewed workflow addition appends only `test/anvil-outbound-field-arrival.test.mjs` to PR #456's existing serial Orchard command. The current public PR head used as preimage is `afc65918fb6dbf7a195cb22e8bd7bcb07e7e6e30`; it is open and draft. The workflow path is already owned by PR #456, so this increment continues that PR and must preserve its current ancestry. This handoff does not verify the eventual public commit or its exact-head CI; verify separately. Verify the remote parent, ref, selected blobs, draft/head, and the Orchard step before claiming delivery or CI registration.

## Next bounded work

Complete the underway empty-return attempt from its frozen input without refreshing its caps. Inspect the real lot amount after arrival, preserve native service and custody, and stop if the collector exits loaded or the empty-pass conditions fail. Record the result against the revised source and new heat boundary. Separately prove a natural empty pass, physical return under the unchanged 72 WU / 8 WU/s gates with 120 stable native ticks, production UI Continue/finalizer, and full browser/visual acceptance. Focused tests do not substitute for those routes.

## All seven broader goals remain OPEN

- **SF-GAME:** Complete and accepted game. Next: finish current Orchard gaps, then full-game review.
- **SF-ORCHARD:** Finite/native custody, refill, Continue and gameplay. Next: source-bound empty-return and production-finalizer evidence.
- **SF-PUBLISH:** Coherent verified public delivery. Next: validate PR #456 ancestry, selected blobs and exact-head CI.
- **SF-RECOVER:** All unmerged source/assets/tests recoverable. Next: retain a verified recovery archive for this increment and separate asset work.
- **SF-VISUALS:** Actual gameplay captures and visual quality review. Next: use supported runtime capture after the route work.
- **SF-ASSETBANK:** Broad reusable assets with real consumers. Next: complete consumer integration and validation.
- **SF-ASSET-QUALITY:** Cohesive detailed assets with distinct silhouettes. Next: finish exact consumer and camera/browser review.

## Historical physical handoff report (verbatim; separate source-bound result)

# Orchard physical handoff: accepted scope

Independent review accepts the physical four-unit worker handoff and 120 subsequent stable
ticks. Production source was local `21d40dc96a1811428a0b1f39978ee3df37395f99`; its `src/`
tree matches approved public snapshot `ff05b09ba0aa030fb05799cc81757ea3ec06ead1`.
Review verified all 19 archive file hashes and the source/input bindings.

From the actual moving tick-33,653 endpoint, one bounded raw-input continuation used
408/600 ticks and ended at 34,061. Both workers remained native for those **408 ticks
within that runtime instance**. The earlier 1,153-tick simultaneous window occurred before
save/load and remains separate; the windows are not combined.

Exactly one four-unit transfer occurred at tick 33,941: collector/tender custody changed
4/0 → 0/4. The actual gate read 60.093865978717474 WU and 7.823259412464947 WU/s,
within the unchanged 72 WU / 8 WU/s limits. The following 120 ticks preserved worker
identity, canonical Mule hardware and the 0/4 manifests. Player cargo stayed 8 and hull
140. Finite Orchard custody stayed source 37 + retained 3 + delivered 8 = 48; the NPC
four-unit lot is separate. No participant pose, phase, cargo or resource injection occurred.

The terminal state is moving: the empty collector automatically departed outbound.
This closes the reviewed handoff only. A further ordinary harvest/refill cycle, production
UI Continue, the complete production manifest, browser and visual acceptance remain open.
The focused native-ready callback substitutes for the UI/renderer load finalizer.

Recovery packet: `libfile_ca6e248c5bd48191a21f865e5963836a`,
588,324 bytes, SHA256 `96702069e0b9ea41c33f298c11b96a0485679b586fa374aa4a7a06d9e0099159`.
Terminal save: 1,236,407 bytes,
SHA256 `a7d6ddf086a20da371c4fbcb8def1cd7dead2d0a02d9ec4a7f8633e12b26e74f`.
Earlier [sequential re-entry evidence](orchard-worker-reentry-2026-10-18.md) retains
its original scope and historical failures.
