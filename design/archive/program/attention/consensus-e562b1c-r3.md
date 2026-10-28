# Consensus review r3 — encounters packet e562b1c9e40 (Codex-gate re-open)

Fresh-eyes pass — third consecutive independent confirmation; decides whether the
re-opened packet stays closed. Re-read `src/systems/vignetteInterpreter.js` in full
(roleEnt generation guard, both spawn-time `spawnGenerations` bindings, enterAwait
baseline preference, stepAwait steering guard, all fifteen await step kinds, every
runVerb arm, hop, compile validation), all of `scripts/build-lived-vignettes.mjs`
RC459_REWARDS/RC459_STEPS/RC459_PROP_OFFSETS/RC459_RECIPES/RC459_COPY/curatedValues/
curatedHail/curatedChoiceRows/curatedReceipts/curatedPhases/phasesFor plus the
`--row=459` scoped-write path, the entity-generation contract
(`src/core/entity.js:151-211`), production stamping (`coreSystem.js:349-357` —
`constructEntity` stamps every spawn), role binding inside `spawnShips`
(`encounterDirector.js:1953-1960`) and `spawnProp` (`:2003-2021`), the e562b1c9e40
diff itself, the full new test file, both prior consensus files on this commit
(r1, r2 — including the corrected keepMotion adjudication), and the 9d65866-r1…r8
series for adjudication history. Every copy-vs-bar claim re-derived independently;
all 30 transmitted `work_line`s swept for the enforced bars. Module full reads this
pass (first full reads across all rounds): **406 (trail), 426 (deliver_second)** —
the two not yet read end-to-end (r2 read 423/408/421/405).

**Verdict: OPTIMAL — no actionable improvement.** Third consecutive OPTIMAL on the
re-opened packet; the packet stays closed. One substantive outside-diff
observation is recorded below (sponsor-b `meet` under orbit/ring keepMotion) — a
pre-existing property of the 9d65866 design surface, routed to the demo defect
ledger per the r1→D259 convention, not raised as a packet finding.

## Mandate answers

- **spawnGenerations binding — both spawn paths verified at HEAD.**
  - Ship-cast (`vignetteInterpreter.js:567-574`): after the `spawn_failed` guard,
    every returned id is stamped `live.spawnGenerations[id] = occupantGenerationOf(e)`.
    `spawnShips` has already pushed `live.ids` and `live.roles[ent.id]` inside its
    spawn loop (`encounterDirector.js:1958-1959`), so the id→role→generation triple
    is complete before the hail. Stamped at the source (`stampOccupantGeneration`
    inside `constructEntity`, `coreSystem.js:356`).
  - Prop (`:602-603`): stamped immediately after the id/role push; the generated
    `prop` phase runs before the offer in every prop recipe, so the baseline exists
    while the offer is on the table.
  - Edges re-derived: entity already gone at stamp → no stamp → live-gen fallback
    (pre-fix behavior, worst case); unstamped fixture body → `null` → permissive
    per the documented caller's-choice contract (`entity.js:203-210`); generation
    is a monotonic counter, never reused, so a recycled occupant can never alias
    an original stamp. `nextOccupantGeneration` durability is void — live
    encounters are never serialized.
- **enterAwait prefers spawn stamps (`:311-315`).** `spawnGen != null ? spawnGen :
  occupantGenerationOf(e)`. Both replacement orderings verified: recycle before
  enterAwait → `roleIds[role]` binds the impostor id but `roleGenerations[role]`
  keeps the ORIGINAL gen → every `roleEnt` eval mismatches → 'gone'; recycle
  after → same mismatch next observation. The new test exercises the first
  ordering live (417 pre-choice replacement → `aborted:physical_subject_gone`,
  `rc-vignettes-459-4242.test.mjs:315-342`, green). Reverting the preference
  makes the impostor the baseline → strain proceeds → assertion fails — the test
  provably discriminates the fix.
- **Steering guard resolves before the write (`:338-343`).** In the non-keepMotion
  braking loop, `role → v.roleGenerations[role]`; `gen != null && !== ` `continue`s
  BEFORE `steerToward` at `:343`. Backstops re-verified: a role unbound at
  enterAwait has no `roleGenerations` entry AND no `entityStarts` — `start` fails
  so no write occurs anyway; a dead-but-unrecycled body still gen-matches and gets
  a harmless `ai.activity`/`intent` write on a corpse (pre-existing, no flight
  effect).
- **applyMotion keepMotion path — corrected adjudication verified independently.**
  `applyMotion` (`:439-526`) has no generation guard — and does not need the
  mandate's guard. Re-derived on module 406 (trail): its cast spawns `hull_0` AND
  `hull_1` (`406-*.js:10-27`) while every await step references `of:'hull_0'` only
  (`:154-162`, `:172-180`) — r2's correction of r1's mechanism claim confirmed
  first-hand: a recycled unreferenced `hull_1` occupant would be steered for the
  await's duration, not one tick — but it can never satisfy or block an ask
  (every referenced role still runs the roleEnt guard), the writes are
  passive/hold_fire transit anchors bounded by the 120 s deadline, and the same
  unguarded steering runs through every pre-offer motion phase on all 30 scenes —
  the adjudicated "steering a foreign hull is flavor" class. Props are excluded
  at `:444-445` (`parentType === 'story_prop'`).
- **All 15 RC459_STEPS bars spoken in RC459_COPY — re-derived independently:**
  - tow_settle (401/408): latched → displaced:120 → released → parked(hull_0,30,
    ≤3,3s) ↔ "a hundred-twenty of drag … then cut it quiet, under three, held a
    three-count, inside thirty" (`:908`). ✓
  - tow_clear (407/420): …→ settled(≤5,2s) ↔ "past the hundred-twenty mark …
    under five, held a two-count, when the line comes off" (`:914`). ✓
  - relay (409/414/421): …→ near(prop→hull_0,60) → near(prop→hull_1,60) →
    released → settled ↔ "a hundred-twenty on the line — inside sixty of our hull
    first, then inside sixty of the far hull, in that order. Let go under five,
    held a two-count" (`:920`). ✓
  - park_tight (411/418/424/427): …→ parked(hull_0,20,≤2,4s) ↔ "a hundred-twenty
    of drag — and park it inside twenty of the receiver, under two for a
    four-count" (`:926`). ✓
  - clear_scav (413): …→ clearOfActors([hull_0,hull_1],180) → released → settled
    ↔ "a hundred-eighty clear of both their hulls — a hundred-twenty of line work
    at least — release, settle under five for a two-count" (`:932`). ✓
  - deliver_second (426): …→ parked(hull_1,30,≤3,3s) ↔ "the second hull, not ours
    — a hundred-twenty of haul … release, park it inside thirty, under three for
    a three-count" (`:938`). ✓
  - match_lead (403/423): formation(hull_0,60–180,8s,lead-100) ↔ "sixty to a
    hundred-eighty off our bow, an eight-count, while we make a hundred on the
    lead" (`:944`). ✓
  - trail (406/416): trail(hull_0,60–180,6s,rel≤8,lead-100) ↔ "sixty to a
    hundred-eighty, within eight of our pace, a six-count, while the lead makes
    its hundred" (`:950`). ✓
  - gap_formation (410/429): gapCross([hull_0,hull_1],within:60) →
    formation(hull_0,60–180,8s,100) ↔ "through the middle sixty — then hold
    station sixty to a hundred-eighty off the lead, an eight-count, while it
    makes a hundred" (`:956`). ✓
  - visit_ab (402/419) / visit_aba (404/415): "Enter each seventy ring" / "Three
    separate seventy-ring entries" + explicit ordering — unchanged, exact. ✓
  - sides (412/425) / toll_pass (536): oppositeSides(100–160,travel 120) ↔
    "cross a hundred-twenty … between a hundred and a hundred-sixty" (`:974`/`:992`). ✓
  - inspect (405/428): meet(hull_0,60,≤5,2s) ↔ "inside sixty of us and hold under
    five for a two-count" (`:980`). ✓
  - strain (417/422): latched → strained(≥0.35,2s) → released ↔ "hold line load
    past a third for a two-count — then cut the line" (`:986`). ✓
  - toll (536): `${aCost} cr clears the count` — four placements consistent
    (charge_a 36 = label "Pay the count — 36 cr" = aLine "thirty-six" = aCost 36;
    TOLL_CR=36 agrees for the non-curated path) + b-side "tow our ${noun} a
    hundred-twenty clear and leave it settled — under five for a two-count" ↔
    toll_weight (latched → displaced:120 → released → settled ≤5,2s). ✓
  - Copy-vs-bar direction on every speed clause is the safe one: "under
    three/five/two" reads stricter than enforced ≤; "past a third" rounds 0.35
    down (delta 0.017, adjudicated); hold counts match exactly. Await-step
    `num()` defaults equal the generated bars — a degenerate step still enforces
    what the copy names.
- **Regenerated modules read in full — first full reads across all rounds:
  406 (trail), 426 (deliver_second).**
  - 406 (hunt/trade_lane/verge_layers, VERGE voice): work_line carries the trail
    bars verbatim; trail step matches (60–180, holdS 6, rel≤8, lead-100);
    grant_a 42 / charge_b 24 = RC459_REWARDS.hunt; rep 2/3; b-timeoutLine names
    the kept 24 cr; keepMotion:true on all three awaits under `depart` motion —
    the lead transits ~870 WU and stops short of its endpoint, so the sponsor
    meet is feasible once it arrives; cast hull_0+hull_1 with hull_1 unreferenced
    (the corrected adjudication above); retained hail "Stay outside it." is the
    adjudicated flavor-hail convention; receipts carry the unique title tail.
    Coherent.
  - 426 (wreck/derelict_field/vael, VAEL voice): prop "HYMN" at PROP_TOW_OFFSET
    (170,−100); cast:2 with hull_1 at (−150,90) — `parked at:'hull_1'` pairs with
    "the second hull, not ours" (correct disambiguation: hull_0 is the hailer);
    latched → displaced:120 → released → parked(30,≤3,3s) matches the spoken
    order verbatim, including the explicit "release" this recipe carries;
    grant_a 54 / charge_b 24 = wreck row; keepMotion:false — the cast is braked
    at entry positions during awaits (sponsor meet feasible); noun 'hymn' =
    prop scanLabel. Coherent.
  - Spot-read additionally: all four park_tight modules (411/418/424/427) carry
    the exact copy+steps; both tow_clear modules (407/420) carry their copy.

## Checks run

- `node --test test/rc-vignettes-459-4242.test.mjs test/lived-world.test.mjs
  test/depth-program-encounter-loader.test.mjs` — **34/34 pass** (~7.6 s),
  including the pre-choice replacement abort, recycled-prop-id abort, dead/NaN
  prop aborts, the real Rapier massline tow (~1.1 s production-chain physics),
  the parked-player gapCross proof, the save-through-active-await slice, and the
  seeded two-hour route over all thirty curated scenes.
- `node scripts/build-lived-vignettes.mjs --row=459` — **0 of 30 rewritten**:
  every landed curated module is byte-identical to generator output at HEAD.
  (Scoped run only — the unscoped ambient drift is defect D259, still outside
  this packet.)
- Transmitted-copy sweep: all 30 `work_line` fields carry the current RC459_COPY
  bars verbatim (extracted per-order and matched against each recipe's numeric
  phrases).
- `git status` on the interpreter, build script, test file, and all 30 modules —
  clean; the dirty tree belongs to other lanes, untouched.
- HEAD moved twice mid-pass (168838ed871 → 0e938a757eb startup/readiness →
  4d0ead7f5c2 merge of origin/pr/590). Diffs on audited paths: the first move —
  zero; the second — two NON-curated encounter modules (358/367) and a ~10-line
  encounterDirector hunk confined to the freight-predation custody path
  (`captureFreightCustodyControl`, `normalizeFreightPredation`,
  `clearPredationBindingOnEntity`) — `spawnShips`/`spawnProp`/role binding and
  the whole vignette seam are untouched. This audit is valid at 4d0ead7f5c2.

## Audit notes (reviewed — recorded so they stay adjudicated)

- **Recorded observation, routed to the demo defect ledger (not a packet
  finding): sponsor-b `meet` is probably unreachable on the orbit/ring
  keepMotion scenes (403, 423, 429).** The 9d65866-r1 adjudication covered
  keepMotion sponsor-b under the premise "the convoy keeps creeping (~28 WU/s)"
  — true only for `creep` (410, ~30-40 WU/s) and effectively for `depart`
  (406, hull stops at endpoint) and `hold` (416, hulls converge on the player).
  For `orbit` (403/429) and `ring` (423) the authored anchor moves at 88 / 121
  WU/s tangential, the maneuver envelope is explicitly lifted to
  `pointSpeed + 34·closing` for vignette waypoints (`maneuver.js:645-649` — its
  comment cites this exact 160-WU/0.55-rad/s case), `desiredAxes` velocity-matches
  the anchor (`maneuver.js:1628-1651`), and all three casts are hulls with
  maxSpeed 133-147+ (`enemies.js` mule_trader 133, patrol_lawman 140,
  quiet_ghost ~147). A hull at ≥85 WU/s spends ≤~1.4 s inside the meet's
  60-WU disc per pass — under the continuous 2 s `heldFor` (stepAwait runs at
  the sim's 60 Hz tick) the sponsor handshake can never complete: debit kept
  (honestly narrated by timeoutLine), rep_b withheld. Statically derived, not
  probe-confirmed — the fixture harness has no tactical-AI tick to move hulls.
  **Not this packet's defect:** the sponsor design and keepMotion flag shipped
  under 9d65866 (adjudicated through r8) and e562b1c touched none of it; the
  fail is honest and bounded (~25-30 cr, one narrated lapse). Route: one row in
  the demo defect ledger, same path r1's drift took to D259 and the D254
  consensus took to D255 — file it for the next ledger toucher since this pass
  commits nothing. Narrowest fix if confirmed live: drop keepMotion on `await_b`
  for orbit/ring recipes (the escort pauses its procession for the paid
  hand-off) — a one-line change in `curatedPhases` plus regen, or an owner's
  call to leave it as "the convoy does not stop for a donation."
- `park_tight` copy carries no literal "release" while enforcing released +
  unlatched-parked — re-derived: "park it" implies detached (a prop still on
  the line cannot be parked), the `parked` predicate independently requires
  unlatch, and a lapsed attempt moves no money. Consistent with both prior
  passes; stays adjudicated.
- `applyMotion` keeps steering an unreferenced recycled hull under keepMotion
  (406 verified: hull_1 spawned, unreferenced) — harmless per the corrected r2
  adjudication; recorded above.
- Still adjudicated, unchanged by this pass: strain "past a third" for
  `loadMin 0.35` (rounded bar, safe direction); gapCross "middle sixty" names
  the enforced `within:60` (TIGHTER than the implied band — safe direction);
  relay `near` steps don't re-require the latch; `displaced` baseline is the
  enterAwait snapshot; sponsor-b `meet` copy stays qualitative ("close in
  slow" — eight adjudications plus owner's deliberate leave; the feasibility
  question above is a separate axis); `step.subject` not role-validated at
  compile; NaN player velocity reads 'gone' on `meet`; retained authored hails
  as flavor beside work_lines; duplicate-role aliasing unreachable (generator
  emits `hull_${i}` — unique by construction; 'prop' reserved at compile);
  `livedSceneRequestData` overlay skip for `livedRotation` entries; depart
  decline copy "my hull is leaving" is the honest fail-open; the braking loop
  steering a dead-but-unrecycled body (start gate covers unbound roles);
  `v.latchedPropId` write-only bookkeeping; save slice carries no live record —
  `spawnGenerations` durability void.
- e562b1c9e40's foreign-lane sweep (station-kit GLBs/render packages/manifests)
  unchanged — noted by r1/r2; no encounters-packet content hides in it.
- HEAD during audit moved to 4d0ead7f5c2 (foreign merge; audited surface
  unchanged — see Checks run). LANDED_REVIEW row for e562b1c9e40 exists
  (3e7fc8f51e7); its second-look queue is a separate surface — nothing here
  changes it.
