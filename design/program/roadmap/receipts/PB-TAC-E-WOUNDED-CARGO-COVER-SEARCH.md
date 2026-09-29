# PB-TAC-E — wounded cargo tradeoff · retreat-to-cover · bounded squad search

Row: `build_map.md` #91 (SF-055 + SF-056 + SF-057).

## What landed

`src/ai/ambientPredation.js`, `src/systems/encounterDirector.js`, `src/ai/combatDoctrine.js`,
`src/ai/squad.js`, `src/ai/contracts.js`, `src/ai/doctrine.js`, `src/ai/stack.js`,
`src/systems/aiFireIntent.js`:

- **SF-055 wounded-cargo tradeoff** — `accelerateBoundRaiderEscape` runs ahead of
  `releaseBoundRaiderForRetaliation` in the director's player-damage path: a bound raider still
  holding secured freight answers the hit by running *harder*, not by turning to fight. An
  in-flight `cargo_escape` re-aims its leg off the *attacker's* bearing (origin and deadline hold —
  the run's clock doesn't restart because the shooter kept shooting); a mid-recovery raider cuts
  straight to `beginAmbientEscape` aimed off the attacker. Only `securedQty <= 0` after the
  hit's jettison shed converts the intervention into ordinary `self_defense` retaliation.
  `beginAmbientEscape` gained an `awayFrom` parameter (attacker → victim → seeded-random fallback
  bearing) so the escape runs off whoever is actually applying pressure.
- **SF-056 wounded fallback to cover** — `pack_pursuit` gains a `retreat` phase: the minimum
  fraction across drive/weapon/sensor/power subsystems at or below 0.5 breaks the press into a
  bounded fallback. The destination re-resolves from live perception every tick — nearest visible
  same-team hull (the pack is the cover), else the far-side shadow of the nearest visible hazard
  (radius + 60 WU deep), else a straight 700 WU flee line. The `fallbackArmed` latch spends on
  trigger and re-arms only when the wound recovers past 0.75, so a crippled hull fights hurt
  instead of flickering press/retreat on one wound; a rebuilt record (target change) resets armed.
  Retreat exits on arrive-and-settle (≤90 WU after ≥60 ticks) or the 840-tick cap, landing back in
  `press` with `outcome: 'wounded_fallback'`. The snapshot maps it to `ManeuverKind.RETREAT` with
  `faceTarget`/`maneuverTargetId` cleared and no `allowedActionId` — guns cold while falling back.
- **SF-057 squad cooperation without omniscience** — `mergeContacts` now counts `liveSightings`
  and tracks `observationTracked` per merged record; `targetObservedBySquad` returns the tri-state
  (`undefined` for producers that never publish `visible`, `true` on any live member sighting,
  `false` when every member's contact is stale memory). `objectiveFor` threads it onto
  FOCUS/ENGAGE/SCREEN/assignment/arena objectives as `targetObserved`. `applyAIFiringIntent`
  closes the gun channel (`target_unobserved`, drops `aimCommit`) on `targetObserved === false`
  for non-PD actors — before fire-window admission, so a stale window burns no admission — while
  the objective itself survives to steer the bounded search leg. A fresh live sighting reopens
  fire on the next decision.
- **Dispatched marks are maneuver authority, not sightings** — a `dispatchedTarget` contact still
  authorizes the doctrine to fly its assignment (combatDoctrine's selection admits it), but the
  gun channel waits for an actual member sighting: the report can be stale while the fire gate
  resolves the *live* entity position.
- **Flag survives the override seams (review fix)** — `overrideDirectiveForWingOrder` (both the
  authoritative-assignment and `wing_order:` rebuilds) and `overrideDirectiveForCombatDoctrine`
  rebuild `objective` and previously stripped the field, leaving dispatched/wing-ordered members
  outside the gate entirely. Both now carry the squad verdict when the target id is unchanged and
  fall back to `memberObservedTarget` — the member's own contact row — on a re-point; the stack
  passes the doctrine-scoped perception. A re-point at a contact the member holds stale or not at
  all fails closed.
- **Re-pinned regression** — `pirate-predation-authority` "player fire mid-escape converts…" now
  pins the SF-055 contract: laden hit → accelerate + jettison (motive stays `ambient_cargo_raid`),
  repeated hits past the jettison cooldown drain the hold piecemeal, the last lump frees the
  `self_defense` conversion, and the kill still conserves the whole 7-unit take end to end.

## Tests

- `test/pb-tac-e-wounded-cover-search.test.mjs` — 14 tests: accelerate-not-revenge with escape
  re-aim and jettison conservation, mid-recovery cut-to-escape, empty-hold conversion; pack
  retreat to ally / hazard shadow / bounded flee, wound-latch anti-oscillation + repair re-arm,
  mid-band no-trigger; merge live-sighting propagation, pure-memory focus gates guns while the
  search leg survives, close/reopen on reacquire, dispatched-mark-is-not-a-sighting, the full
  override chain (`commander.update → wing-order → doctrine perception → runtime → doctrine
  override → fire gate`) for dispatched responders, and member-level derivation on a re-pointed
  objective.
- `test/pirate-predation-authority.test.mjs` — 28/28 including the re-pinned laden-escape test.

Adjacent battery re-run post-fix: sg06 squad fire discipline, ai-behavior-stability,
depth-program-k1-tactical, doctrine-distinct, inf-022/023, squad-tether-overload-gate,
ai-fire-lead-model, ai-fire-recent-damage, combat-ai-intentional-movement,
ai-engagement-authority, combat-doctrines, law-responder-doctrine, ceres-job-law-response,
f11-raider-flies-off-with-pod, economy-honesty, ai-encounter-quiet-latch, wingman-guard-asset,
wingman-mining-order, wf02-doctrine-divergence, wf02-escort-screen-doctrine,
pq206-00-dreadnought-wing-cell, tactical-ai contact-index/id-reuse/production-cadence/quiet-latch,
tactical-map-second-generation — all green.

## Review

Two-pass reviewer: first verdict FAIL — `targetObserved` was stripped by both directive-override
seams (the dispatched-mark loophole shipped inert) and no test covered the production chain. Both
fixed (carry-or-derive + `memberObservedTarget` + end-to-end chain test); second pass **PASS**.
Residuals logged as non-blocking: under a dispatch filter a wounded pack member's retreat sees no
allies (degrades to hazard shadow or bounded flee); the 840-tick retreat cap is untested-by-test
(verified by inspection); `frozenRecord` doesn't expose `fallbackArmed`; a speculative
factionPresence second-writer concern; aiPorts' reported-offender fallback emits `visible:true`
at live position when no snapshot exists (pre-existing producer contract the gate now honors).

## Route status

Implemented, route-unproven — production code committed, focused tests + the full decision-chain
exercise pass; the ordinary player route (wound a fleeing raider, watch a pack hull fall back,
break a squad's contact) was not observed live.
