# Consensus review r2 — encounters packet e562b1c9e40 (Codex-gate re-open)

Fresh-eyes pass — second consecutive independent confirmation; decides whether the
re-opened packet closes again. Re-read `src/systems/vignetteInterpreter.js` in full
(roleEnt generation guard, both spawn-time `spawnGenerations` bindings, enterAwait
baseline preference, stepAwait steering guard, every await step kind, runVerb guards,
hop, compile validation), all of `scripts/build-lived-vignettes.mjs`
RC459_REWARDS/RC459_STEPS/RC459_PROP_OFFSETS/RC459_RECIPES/RC459_COPY/curatedValues/
curatedHail/curatedChoiceRows/curatedReceipts/curatedPhases, the entity-generation
contract (`src/core/entity.js:148-211`), production stamping
(`coreSystem.js:340-360` — `constructEntity` stamps every spawn), role binding inside
`spawnShips` (`encounterDirector.js:1958-1959` — `live.ids`/`live.roles` written
before the interpreter's stamp loop), `spawnProp` (`:2003-2021` — same
`spawnEntity` → stamp chain), the save-slice boundary
(`saveSystem.js:1538-1557` — only named/receipts/cooldowns/stats; live encounters
and `spawnGenerations` are never serialized), the overlay skip
(`livedWorldDirector.js:109-113` — intact), the e562b1c9e40 diff itself, the new
test's discrimination, and all eleven prior consensus files for adjudication
history. Every copy-vs-bar claim re-derived independently; all 30 transmitted
`work_line`s extracted and compared against RC459_COPY.

**Verdict: OPTIMAL — no actionable improvement.** Second consecutive OPTIMAL on the
re-opened packet; the packet closes.

## Mandate answers

- **spawnGenerations binding — both spawn paths verified at HEAD.**
  - Ship-cast path (`vignetteInterpreter.js:567-574`): after the `spawn_failed`
    guard, every returned id is stamped `live.spawnGenerations[id] =
    occupantGenerationOf(e)`. `spawnShips` has already pushed `live.ids` and
    `live.roles[ent.id] = sh.role || 'squad'` by then — the id→role→generation
    triple is complete before the hail. Entities stamped at the source
    (`stampOccupantGeneration` inside `constructEntity`, `coreSystem.js:356`).
  - Prop path (`:602-603`): `spawnGenerations[prop.id]` stamped immediately after
    the id/role push — the prop phase runs before the offer in every generated
    module, so the baseline exists while the offer is on the table.
  - Edge coverage re-derived independently: an id whose entity is already gone at
    stamp time gets no stamp → live-gen fallback at enterAwait → same as pre-fix;
    an unstamped (fixture) body gets `null` → permissive path per the documented
    caller's-choice contract (`entity.js:203-210`); generation is a monotonic
    counter (`entity.js:187-200`), never reused, so a recycled occupant can never
    alias the original stamp. `nextOccupantGeneration` need not be durable —
    live encounters are never serialized (`saveSystem.js:1538-1557`), so no
    restore-vs-baseline comparison can exist.
- **enterAwait prefers spawn stamps (`:311-315`).** `v.roleGenerations[role] =
  spawnGen != null ? spawnGen : occupantGenerationOf(e)`. Both replacement
  orderings verified: (a) recycle before enterAwait → `roleIds[role]` binds the
  impostor's id but `roleGenerations[role]` keeps the ORIGINAL gen → every
  `roleEnt` eval mismatches → 'gone'; (b) recycle after enterAwait → same
  mismatch on the next observation. The new test exercises (a) live
  (`rc-vignettes-459-4242.test.mjs:315-342`, green). Reverting the preference
  makes the impostor the baseline → strain proceeds → assertion fails — the
  test provably discriminates the fix.
- **Steering guard resolves before the write (`:338-343`).** In the
  non-keepMotion braking loop, `role = live.roles[id] → gen =
  v.roleGenerations[role]`; `gen != null && occupantGenerationOf(e) !== gen`
  `continue`s BEFORE `steerToward` at `:343`. Two backstops verified: a role
  unbound at enterAwait (subject failed then) has no `roleGenerations` entry —
  unguarded, but `v.entityStarts[id]` is also unset, so `start` fails and no
  write occurs anyway; a dead-but-unrecycled body passes the gen check and gets
  a harmless `ai.activity`/`intent` write on a corpse (pre-existing behavior,
  no flight effect).
- **applyMotion keepMotion path — adjudicated, with a correction to r1's
  rationale.** `applyMotion` (`:439-526`) has no generation guard; on
  keepMotion awaits `live.vars.motion` is preserved (`:673`) so it steers the
  cast each tick. r1 claimed "every keepMotion recipe references every spawned
  role from step 0, so the abort is same-tick." Verified against generated
  casts: gap_formation (410/429) does reference both hulls in step-0 gapCross —
  same-tick abort holds. But match_lead/trail **do spawn an unreferenced
  `hull_1`** (cast hull_0+hull_1 confirmed in 403:12-26, 406:12-26, 423:12-25;
  formation/trail reference `of:'hull_0'` only). A recycled hull_1 occupant is
  therefore steered for the await's whole duration, not one tick — r1's
  mechanism claim was wrong. The material verdict stands anyway: the impostor
  is unreferenced, so it can never satisfy or block an ask (every eval step
  still runs the generation guard for referenced roles); the writes are
  passive/hold_fire transit anchors bounded by the 120 s deadline; and the
  identical unguarded steering already runs through every pre-offer motion
  phase on all 30 scenes — the same "steering a foreign hull is flavor" class
  adjudicated for await_c. Three prior OPTIMAL rounds passed this packet with
  no steering guard anywhere; the codex mandate's guard is delivered where it
  matters (the repeated braking write). Recorded as a corrected adjudication,
  not raised.
- **All 15 RC459_STEPS bars spoken in RC459_COPY — re-derived independently:**
  - tow_settle (401/408): latched → displaced:120 → released → parked(30, ≤3,
    3 s) ↔ "a hundred-twenty of drag … then cut it quiet, under three, held a
    three-count, inside thirty" (`:908`). ✓
  - tow_clear (407/420): …→ settled(≤5, 2 s) ↔ "past the hundred-twenty mark …
    under five, held a two-count, when the line comes off" (`:914`). ✓
  - relay (409/414/421): …→ near(prop→hull_0, 60) → near(prop→hull_1, 60) →
    released → settled ↔ "a hundred-twenty on the line — inside sixty of our
    hull first, then inside sixty of the far hull, in that order. Let go under
    five, held a two-count" (`:920`). ✓
  - park_tight (411/418/424/427): …→ parked(20, ≤2, 4 s) ↔ "a hundred-twenty
    of drag — and park it inside twenty of the receiver, under two for a
    four-count" (`:926`). ✓
  - clear_scav (413): …→ clearOfActors(180) → released → settled ↔ "a
    hundred-eighty clear of both their hulls — a hundred-twenty of line work
    at least — release, settle under five for a two-count" (`:932`). ✓
  - deliver_second (426): …→ parked(hull_1, 30, ≤3, 3 s) ↔ "the second hull,
    not ours — a hundred-twenty of haul … park it inside thirty, under three
    for a three-count" (`:938`). ✓
  - match_lead (403/423): formation(60–180, 8 s, lead-100) ↔ "sixty to a
    hundred-eighty off our bow, an eight-count, while we make a hundred on
    the lead" (`:944`). ✓
  - trail (406/416): trail(60–180, 6 s, rel≤8, lead-100) ↔ "sixty to a
    hundred-eighty, within eight of our pace, a six-count, while the lead
    makes its hundred" (`:950`). ✓
  - gap_formation (410/429): gapCross(within:60) → formation(60–180, 8 s,
    lead-100) ↔ "through the middle sixty — then hold station sixty to a
    hundred-eighty off the lead, an eight-count, while it makes a hundred"
    (`:956`). ✓
  - visit_ab (402/419) / visit_aba (404/415): "Enter each seventy ring" /
    "Three separate seventy-ring entries" + explicit ordering — unchanged. ✓
  - sides (412/425) / toll_pass (536): oppositeSides(100–160, travel 120) ↔
    "cross a hundred-twenty … between a hundred and a hundred-sixty"
    (`:974`/`:992`). ✓
  - inspect (405/428): meet(60, ≤5, 2 s) ↔ "inside sixty of us and hold under
    five for a two-count" (`:980`). ✓
  - strain (417/422): strained(≥0.35, 2 s) → released ↔ "hold line load past a
    third for a two-count — then cut the line" (`:986`). ✓
  - toll (536): `${aCost} cr clears the count` (36 = label "Pay the count —
    36 cr" = "thirty-six" line = charge_a 36 — four placements consistent) +
    b-side "tow our ${noun} a hundred-twenty clear and leave it settled —
    under five for a two-count" ↔ toll_weight (latched → displaced:120 →
    released → settled ≤5, 2 s). ✓
  - Copy-vs-bar direction on every new speed clause is the safe one: "under
    three/five/two" reads stricter than the enforced ≤; "past a third" rounds
    0.35 down (delta 0.017, adjudicated); hold counts match exactly.
  - Await-step `num()` defaults equal the generated bars (displaced 120,
    parked 30/≤3, settled ≤5, meet 60/≤5, formation 60–180/100, trail rel 8,
    oppositeSides 100–160/120, visit 70, near 60, strained 0.35, gapCross 60,
    depart 180/1000) — even a degenerate step enforces what the copy names.
- **Regenerated modules read in full — first full reads across all rounds:
  423 (match_lead), 408 (tow_settle), 421 (relay), 405 (inspect).**
  - 423 (convoy/refinery_approach/helix, HX-12 voice): work_line carries the
    match_lead bars verbatim; formation step matches; grant_a 48 / charge_b 24
    = RC459_REWARDS.convoy; rep 2/3; b-timeoutLine names the kept 24 cr;
    keepMotion:true on all three awaits under ring motion; hull_1 spawned
    unreferenced (the corrected note above); retained hail "VARIANCE FILE
    OPEN … NO ACTION REQUIRED" is the adjudicated flavor-hail convention;
    receipts carry the unique title tail. Coherent.
  - 408 (salvage/border_checkpoint/scn, CLERK voice): prop "TAG" at
    PROP_TOW_OFFSET (170,−100) ≈ 197 WU off hull_0 so the instructed haul
    clears displaced:120 before the 30-ring opens; grant_a 54 / charge_b 24 =
    salvage row; noun = prop scanLabel; "We have not called it scrap" is
    register-true salvage copy; parked step order and bars match the line.
    Coherent.
  - 421 (salvage/patrol_corridor/fulfillment, DISPATCH voice): prop "CASKET"
    at the same tow offset; relay steps match the spoken order (hull_0 then
    hull_1, 60 WU each); "let go under five" is load-bearing honesty — the
    payload carries no damping, so a fast release can never settle (the
    settled gate enforces it); grant_a 54 / charge_b 24 = salvage row.
    Coherent.
  - 405 (patrol/civilian_core/pitborn, PIT voice): meet(60, ≤5, 2 s) ↔
    "inside sixty of us and hold under five for a two-count"; grant_a 0 =
    patrol row (unpaid assist — the a-label promises only the scan, no pay);
    charge_b 18; inspection hail matches the submit-to-scan ask. Coherent.

## Checks run

- `node --test test/rc-vignettes-459-4242.test.mjs test/lived-world.test.mjs
  test/depth-program-encounter-loader.test.mjs` — **34/34 pass** (~7.9 s),
  including the new pre-choice replacement abort, the recycled-prop-id abort,
  the dead/NaN-prop aborts, the real Rapier massline tow (~1.1 s of
  production-chain physics), the parked-player gapCross proof, the
  save-through-active-await slice, and the seeded two-hour route over all
  thirty curated scenes.
- `node scripts/build-lived-vignettes.mjs --row=459` — **0 of 30 rewritten**:
  every landed curated module is byte-identical to generator output at HEAD.
  (Scoped run only — the unscoped pass still drifts nine non-curated ambient
  modules; that is now filed as defect D259 by commit e9ef12c7726 at HEAD and
  remains outside this packet.)
- Transmitted-copy sweep: all 30 `work_line` fields carry current RC459_COPY
  verbatim — the 24 regenerated modules plus the six correctly-untouched
  visit/sides scenes.
- `git status` on the interpreter, build script, test file, and all 30
  modules — clean at HEAD; the dirty tree belongs to other lanes, untouched.

## Audit notes (reviewed — recorded so they stay adjudicated)

- Correction recorded above: r1's "references every spawned role from step 0"
  is wrong for match_lead/trail `hull_1`; the impostor-wingman steering is
  unbounded below the deadline but provably harmless — adjudication stands.
- Still adjudicated, unchanged by this pass: strain "past a third" for
  loadMin 0.35 (rounded bar, safe direction); gapCross "middle sixty" names
  the enforced within:60 (TIGHTER than the implied band — safe direction);
  relay `near` steps don't re-require the latch; `displaced` baseline is the
  enterAwait snapshot (pre-choice dragging raises the ask); sponsor-b `meet`
  copy stays qualitative ("close in slow" — seven adjudications plus owner's
  deliberate leave); `step.subject` not role-validated at compile; NaN player
  velocity reads 'gone' on `meet`; retained authored hails as flavor beside
  work_lines; duplicate-role aliasing unreachable (219 casts clean);
  `livedSceneRequestData` overlay skip for `livedRotation` entries; depart
  decline copy "my hull is leaving" is the honest fail-open; the braking loop
  steering a dead-but-unrecycled body (start gate covers unbound roles).
- Non-packet sweep of e562b1c9e40 confirmed it also carried a foreign-lane
  asset drop (station-kit GLBs, render packages, manifests — the "disclosed
  fart sweep" of the LANDED_REVIEW row at 3e7fc8f51e7). Already noted by r1;
  no encounters-packet content hides in it.
- HEAD is now e9ef12c7726 ("File D259: ambient lived modules drift vs
  generator output") — a doc/defect-ledger filing of r1's outside-packet
  observation; it touches no packet file.
- LANDED_REVIEW row for e562b1c9e40 exists (3e7fc8f51e7); its second-look
  queue is a separate surface — nothing here changes it.
