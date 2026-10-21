<!-- LIFETIME: DURABLE -->
# Charon: the evacuated colony's finite scrubber reserve

## Scope and evidence boundary

A bounded connection between the existing Colony Barge salvage crew, one physical supply lot, and the original cutter's next work round. This is not colony repopulation, an economy simulation, a new mission chain, or Charon-wide acceptance. Documentation is not acceptance.

Source checkpoints:
- Public feature baseline: `7109c3829a615a118ea63534b99bc1d9891ca711`.
- Independently reviewed feature candidate: `7308e65223584e0908c430c6f96abebe3a152367`.
- Frozen feature seal: `dd23a794c33d22e50facb7f31ff16815afb71f01`. Product source is identical to reviewed `7308`; only two test expectations changed.
- Native connected witness: `b08533f472b39049bf2e4e1035b95b23f6378e8c`. Its only difference from the inspected candidate is the later restored-phase consistency guard and its regression test. Do not relabel the earlier runtime evidence as a new run of `7308`.
- Root integration dependency checkpoint: `48e7f2fdf472bb89fad25526acb90ab4080b1f8c`, including the separately reviewed paired-camera diagnostics. This is not the Charon feature candidate or a Charon visual acceptance receipt.

Independent review reported no blocking source findings on `7308`. The frozen `dd23` feature passes 38/38 focused and 105/105 adjacent tests using an immutable raw-source shim. The two test-only corrections scope the initial running-job expectation to the staged Charon lease actors and update the obsolete native-fixture initial-round expectation; other actors retain their expectations. Reduced direct native pickup/contact/handoff/consumption passes at 37.8333 simulation seconds, with foreign/claimed/replayed-receipt controls passing. That reduced witness is not the connected aboard-Continue route described below. Final root integration and publication remain pending; no integrated final-tree pass or ordinary-player acceptance is asserted here.

## Place and fiction

The Abandoned Mining Colony (`poi_colony`) remains intact and evacuated. The original `charon_colony_salvor` and `charon_colony_hauler` are visiting salvage workers, not residents supplying a living settlement. The barge is their landmark, not a cargo receiver. Supplies recovered beside it support the cutter's work.

The six units are `cmdty_consumer_goods`, presented as **Sealed habitat scrubber kits**: abandoned air-system/filter supplies, not bottled oxygen or an invented commodity. An earlier interpretation used `cmdty_volatiles` by following stale air prose; the actual commodity represents methane/ammonia ice with corrosion behavior. Correcting the cargo semantics avoids that mismatch without a global hazard exemption. Ordinary collision, alarm, cargo and hazard rules remain in force.

Reuse is deliberate: existing colony, crew slots, authored source position, physical cargo-pod pipeline, standard cargo-pod model (`places/place_cargo_pod_standard.glb`), NPC work jobs, manifests, hails and save/world owners. **New model count: zero.** No relocated POIs or new asset commission is implied. The Broken Procession composition and the separate Warm Freighter/Borrowed Voice/Cinder Nursery story remain their existing owners' work.

## Player-facing experience

### First arrival

On first materialization the original pod and two visiting workers establish a small supply operation. Truly new, pristine original commissions can wait before their first round; elapsed, existing or restored work is not silently interrupted. Those workers finish their exact original job boundary before taking the finite supply lease. A route label alone does not prove an idle or completed job.

The hauler approaches using native flight intent and actual body contact, collects the original stock into its manifest, then closes with the cutter to deliver. The cutter waits for that physical reserve. Worker status and trader route hails explain the evacuated colony, stock disposition, and current work state. This is source-level legibility, not proof a first-time visitor notices or understands it from an ordinary gate approach.

### Ordinary repeat, change and choice

This is a one-time recovered reserve supporting one next-round admission, not a fresh six-unit shipment every cycle. After use the original work jobs can continue; the completed supply history does not mint a new pod, repeat a reward or generate endless stock.

The player may leave the crew to recover it, move the original pod within reach and release the tether, or take some/all of it through ordinary cargo recovery. An active player tether or another collector's claim is respected. Moving the pod is help only when native contact, relative speed and custody conditions permit the real pickup; a hail or fabricated event is not delivery.

Any recorded player/other recovery or loss creates a **terminal shortfall** for this reserve. The next cutting round is cancelled; remaining stock stays where it is and no replacement is issued. The implementation does not promise a later donation/reimbursement route. If an original worker is missing or dead, a same-label replacement does not inherit its authority or refill the lot.

### Delivery is not consumption

All six units must reach the original cutter's finite manifest. A partial load is not a complete reserve. Delivery changes the book to `delivered`; consumption requires admission of the cutter's exact original next cutting job. If admission fails, the physical reserve remains staged aboard the cutter with its lease. Only successful job admission consumes it and records `working`, once. This proves admission, not completion of that subsequent cutting round or extraction of a new finite scrap yield.

## Custody, persistence and protection

The conservation account is six original units distributed among loose, aboard, delivered, consumed, player, other and lost. Splits and native spills inherit bounded provenance rather than creating a second source. Failed initial source admission is terminal. Destruction and canonical cargo-cap eviction account for actual loss; sector shelving, streaming and restore are not deaths.

Traffic saves the finite account; production Save/Continue restores entities/manifests and binds proven original incarnations. Healthy durable original records may rematerialize after real sector exit/reentry, with new runtime entity IDs but the same durable worker identities. Reentry, claiming the evacuated colony, or an invalid saved book must not remint supply. Future-schema or malformed books fail closed; the later candidate additionally refuses to reconstruct a lease from contradictory active-phase totals.

Foreign itineraries, jobs, control claims, legacy cargo and mismatched manifests are not appropriated. Duplicate identities, stale lives, copied provenance and fabricated remote pickup receipts cannot stand in for the original transaction. Exact finite-manifest checks scope wreck/loot treatment to this stock; unrelated ordinary cargo retains its normal salvage behavior. The existing occupational salvor selector excludes the managed lot without globally excluding surrounding salvage.

## What the connected native witness establishes

The opt-in `test/fixtures/charon-salvage-supply-connected.mjs` uses the production runtime profile with `nodeSafeOnly: true`, Rapier dynamic bodies, and the production traffic, save and world owners. Its seed is 4242. The player starts near the colony at sector-local `(-820, 1220)` and the fixture enters Charon programmatically. It does not fly an ordinary arrival from a gate, operate a live camera or capture visual acceptance.

The inspected `b08533` checkpoints establish:
1. At 0.0167 simulation seconds, the six units are loose and collection is active.
2. At 28.9333 seconds, all six are aboard the original hauler, with no consumed/delivered/player/other/lost units.
3. A real production save envelope is serialized and loaded while the stock is aboard. Native physics is prepared again and the route continues, rather than substituting a mocked save or directly granting a receipt.
4. At 42.9833 seconds, all six are consumed and the phase is `working`; the cutter has its original next job admitted. Original worker durable IDs survive while runtime IDs change across Continue. Independent checkpoint review reported unchanged worker hulls (200/180).
5. Actual world entry into Dione and back into Charon retains the original identities, consumed total and cutter job. Explicit rematerialization refuses a new lot and no live supply pod remains.

The timestamps are a bounded deterministic fixture result, not a travel-time promise or benchmark. The witness proves native collection, aboard Continue, delivery/use and post-use sector return under that setup. It does not prove normal-flight discoverability, every failure path through native gameplay, a full subsequent cutting job, camera readability, frame-time quality or broad sector completion. Source preview imagery did not accept the visuals; a separate 49/49 paired-camera diagnostic receipt is not a Charon camera witness.

## Regression map and remaining gates

Implementation: `src/world/charonSalvageSupply.js`; hooks in `src/systems/traffic.js`, `src/core/physics.js`, `src/systems/mining.js`, `src/systems/aftermathWrecks.js`; wording in `src/data/contactHail.js`, `src/data/sectorActivityPockets.js`, `src/data/sectorZones.js`.

Focused tests: `test/charon-salvage-supply.test.mjs`. Fixtures: `test/fixtures/charon-salvage-supply-{save,native,native-custody,connected}.mjs`. Coverage includes original boundaries, partial scoop, splits, actual violence spills, held-reserve admission failure, staged and aboard persistence, real sector return, native tether/release, canonical cap loss, foreign ownership, first-round staging and inconsistent restored-phase rejection. Passing focused cases must not be represented as one complete ordinary-route playthrough.

Before calling this integrated or accepted:
- Complete final root integration and its verification/publication; preserve exact-tree receipts. The frozen feature seal is passing, but is not itself a published integrated tree.
- Witness ordinary flight arrival and readable worker/source/hail relationships with the live camera, including a meaningful player choice and its return consequence.
- Inspect visual composition and performance in that ordinary route. Reuse existing assets unless the evidence identifies a concrete failure.
- Keep Borrowed Voice gates, ecology progression, other Charon routines and the wider sector register open under their own acceptance criteria.

## CI follow-through and local dialogue, 21 October 2026

The first integrated source was published as `d0522e8d382215085bbb4a3789b471d2c1e33809` in draft PR480. Its actual 47-A browser cold-open check passes with ten actors and 34 trace records; stale preload 404s are gone. Its standalone Orchard readout entry exposes a new import cycle: contactHail → Charon controller → lootShards → scanner → contactHail. The prior db576 entry passes 11/11. This follow-through extracts unchanged identity/readout computations into a dependency-free leaf, shared by the controller and Hail; it does not alter cargo authority or scanner constants. Four fresh-process entry regressions, 11 Orchard and 38 Charon cases pass, plus 27 readout/source contracts. Independent review verifies shared export/cache identity. This is a repair of the standalone entry, not a claim that the browser failed to boot.

Returned Charon workers could also select two generic errands about a Tally gold post. Those two templates now require the actual living Tethys Tally POI and its authored footprint, and recheck that context before speech/motion. Their prose and all generic hash picks/cadence remain unchanged; an inapplicable post window is silent rather than reshuffling the other errands. No fictional gold-phase flag is introduced. The dedicated nine tests include the real World POI spawn path; the focused/adjacent set passes 64/64. An unrelated rack-dressing assertion remains the same 5-pass/1-fail WF03 baseline result. This is headless context evidence, not ordinary-arrival acceptance.

The actual d0522 camera diagnostic records SwiftShader software rendering at 435×245 content inside a 1280×720 buffer (effective scale 0.33984375). Its first PNG capture times out at two seconds, so there is no new image or second sample from that run. The paired diagnostic now allows up to four seconds per capture, clamped after directory preparation to the original ten-second total deadline. Other callers retain two seconds; graphics settings, animations and acceptance gates are unchanged. A subsequent actual image remains required. Whole-game CI, ordinary flown Charon arrival, visual quality and all larger goals remain open.

## Default-play legibility and staged camera route

The ordinary scanner and compact Hail presenter both retain two lines. The old Charon STATUS/ROUTE composition prepended a generic line to two supply lines, so the actual stock/action guidance was discarded before display. This increment supplies concise current-state lock, initial-offer and STATUS copy for the exact original crew, plus a read-only SUPPLY ROUTE action on the worker using the existing wrapped detail surface. Trader ROUTE keeps both complete lines. No global line limit, CSS, Band station, announcement, heard flag, reward or cargo authority changes. Text reads current custody because the crew begins work at sector entry, before an ordinary player necessarily reaches the colony. Crew loss does not falsely imply all remaining loose stock vanished.

Baseline reproduction follows the actual scanner-to-DOM/ARIA chain. The reviewed focused/adjacent set passes 79/79, including real production Save/loadEnvelope and actual world leave/reentry with original durable identities, source contracts and fresh import orders. Independent review approves. These checks establish presentation contracts, not ordinary flown-arrival or pixel-level acceptance.

The existing 47-A browser check can additionally run --charon-camera-diagnostic after every original acceptance assertion and success log. The registered command opts that already-running page into programmatic Charon world entry, owner-mediated player relocation and supported camera framing. It requires actual canonical colony/crew/source identities and reports subject-specific authored asset readiness, finite stock, framing limits and current GPU/post scale. It never spawns replacement actors or stock, hides HUD, changes graphics quality or claims ordinary flight. Up to two screenshots and post snapshots fit a 20-second diagnostic budget; pre-existing final browser cleanup remains outside that budget. Failed or unresolved captures are recorded without changing completed 47-A acceptance. Fifteen focused no-browser tests and independent API/timeout reviews pass. An actual Charon image is still pending until this route executes in CI and its pixels are inspected.

## Original crews finishing older jobs

A retained production job demonstrated that the normal salvor target refresh rewrites the work mark to a live wreck or payload while preserving its original home and purpose. The previous exact authored-coordinate predicate rejected the genuine next job-cycle event, leaving supply waiting. The repaired boundary accepts only the production mutable work-mark forms (wreck/pickup hulk IDs or payload IDs) under the original crew, job kind, sector, planning constants, home and target references. A transient fence pins the canonical runtime entry and job object; it is not another saved job authority. Pristine first-round commissioning remains strict. Control claims, foreign itineraries, depots, legacy cargo and nonempty manifests remain excluded. A cycle must be the actual completed unload at home with matching sequence and loop.

The scoped candidate passes 44 focused and 32 adjacent checks. Independent review also follows real Save and sector leave/return: the hull rematerializes while the canonical job is retained, and the genuine next cycle is accepted. The retained failed terminal save and bounded kernel rejection/control probe are preserved. This is not a new full native travel-time witness. A transported Tally/Vesta durable-source numeric remapping edge is unproven for Charon and is not claimed supported by broadening this predicate.

The prior published 6b42 CI run completed non-green: scoped Charon and Orchard route/readout cases pass, as does the 47-A cold-open; browser group 3 reaches its configured timeout with only three completed leaves. Its two actual software-rendered camera frames remain soft at effective scale 0.33984375. This increment does not claim a graphics-quality improvement, ordinary Charon flight acceptance or a green whole-game build.

Actual partial pickup while original jobs are still running now reports the already-incomplete reserve immediately, without pretending the physical phase advanced or stopping those jobs. The production regression takes one kit, leaves five loose, and verifies lock, offer, STATUS and wrapped ROUTE report that next-round shortfall without offering the already-lost full-reserve choice.

## First actual Charon camera evidence, 21 October 2026

Published483b098 CI39606706755 captured two programmatically staged Charon frames in15.375seconds without capture errors. Original finite custody is six loose, zero aboard/delivered/consumed/player/other/lost, phase collect, unchanged original identities. Colony542, original hauler337 and pod402 had no visible entity meshes in either sample; cutter406 was loading. Player was authored. Requested framing418.77 exceeded supported330, so full fit was not established. Both images remain soft at435×245 scene content inside1280×720, SwiftShader scale0.34. The large teal geometry at the left remains unidentified. This is unresolved presentation evidence, not absence of production assets or visual acceptance.

Source investigation corrected an initial hypothesis: software rendering explicitly skips the hardware asynchronous live-sector cook, so that cook is not an established cause of this observation. Software still uses hidden exact-boundary preparation; a missing entity.mesh may coexist with a hidden authored boundary awaiting publication. Current evidence lacked those fields. The revised diagnostic records actual boundary preparation/root state, bounded retired failures, activity membership, queue/reconcile/retry state and simulation-clock holds. These are raw observations, not a copied eligibility oracle. A defensive hardware admission guard prevents relocation during an active cook and labels unchanged arrival captures unframed. No renderer policy, asset, stock, quality or timeout budget is changed. A new actual capture is required to identify the cause.

Actual483b runtime passes1411/1423, including the full original Orchard recurrence and all54 Charon supply, legacy-boundary and UI cases. One new test failure is the camera fixture assuming an initial request always dispatches inside its effective one-millisecond window; the observed zero-dispatch outcome safely met the deadline. The test now permits zero or one initial dispatch while a separate deterministic wedged-request regression guarantees first dispatch and forbids any later call. Twenty-one camera tests independently pass. The other eleven runtime failures remain inherited categories; no aggregate green is claimed.
