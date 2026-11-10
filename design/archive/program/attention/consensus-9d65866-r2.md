# Consensus review r2 — encounters packet 9d65866e15 + r1 fix 76e554cd38 (RC-459 honest physical asks)

Reviewer pass 2 of 3, fresh eyes. Re-read the current `vignetteInterpreter.js`,
`build-lived-vignettes.mjs` RC459 blocks, the entity-generation contract
(`src/core/entity.js`), the spawn path (`coreSystem.js`, `encounterDirector.js`),
and sampled regenerated diffs/modules (401 tow_settle, 407 tow_clear, 409 relay
full read, 536 toll). Independently re-verified r1's claims rather than trusting
them.

**Verdict: two actionable findings, both low severity.** The packet is correct
and honest; r1's two fixes landed properly and the mechanism choices check out
against production code paths. Nothing here blocks the design.

## Findings

1. **`sides`/`toll` copy discloses only the ceiling of the crossing band — the
   ≥100 WU floor is invisible.** — `scripts/build-lived-vignettes.mjs:974`
   (`RC459_COPY.sides.instruction`: "…inside the hundred-sixty band") and `:992`
   (`toll.instruction`: "…pass the hull on the far side, inside the band" — no
   size named at all). The bar is `oppositeSides` `min:100, max:160, travel:120`
   (`RC459_STEPS.sides`/`toll_pass` :836/:841; enforced at
   `vignetteInterpreter.js:223` and a crossing outside the band *restarts* the
   side marker at :226). A player who circles at 60–95 WU does exactly the
   visible work the line asks — crosses to the far side with ≥120 WU of travel —
   and silently fails on the undisclosed inner edge. This is the same
   copy-promises-more-than-the-bar defect class r1 fixed for drift-to-rest, one
   rung lower. Fix: name the floor in both lines (e.g. sides: "inside the
   hundred-to-hundred-sixty band"; toll: "inside the band — a hundred out or
   better"), then `node scripts/build-lived-vignettes.mjs --row=459` (orders
   412, 425, 536). ~3 lines plus regen.

2. **The r1 generation-guard has zero coverage in the packet's own test file —
   the rejection branch never executes in fixtures.** —
   `vignetteInterpreter.js:39-40` (`roleEnt`) reads `v.roleGenerations`, bound
   at `:311`. In `test/rc-vignettes-459-4242.test.mjs` the fixture
   `spawnEntity` (:60-69 plain object; :344-349 `makeEntity` without stamping)
   never sets `occupantGeneration`, so `occupantGenerationOf` returns null,
   `roleGenerations[role]` is null, and the `gen != null` gate skips the check
   on every observation — correctly, per the documented "unprovable identity"
   contract (`entity.js:206`), but it means a regression that deleted the
   generation line would turn no test red. The recycled-id false-satisfaction
   is exactly the bug r1 fixed. Fix: in the same fixture, stamp
   `stampOccupantGeneration(state, e)` on spawned bodies and add one test —
   prop destroyed mid-await, same id reissued to a fresh stamped body, assert
   `physical_subject_gone` rather than a satisfied `latched`/`displaced`.
   ~20 lines.

## Mandate answers

- **Awaits still completable: yes.** Every curated step list walked against its
  copy: displaced:120 ↔ "hundred-twenty of drag/haul/line work";
  clearOfActors:180 ↔ "a hundred-eighty clear of both their hulls";
  parked:30/20 ↔ "inside thirty/twenty"; settled≤5/parked≤3,≤2 ↔ "dead slow"
  + named counts (two/four/six); visit:70 ↔ "seventy ring"; meet:60/≤5 ↔
  "inside sixty…dead slow"; formation/trail 60–180 + leaderProgress:100 ↔
  "sixty to a hundred-eighty…a hundred on the lead"; gapCross within:60 ↔
  "thread the gap"; depart 180/1000 ↔ "my hull is leaving". Prop offsets
  (170,−100 ≈197 WU) put the instructed route well past the 120 bar;
  clear_scav berths inside the scav ring. Ordering is sound: `latched` gates
  every line-work chain; `released` precedes `settled`/`parked`; the
  prop-death abort is fail-fast `physical_subject_gone`, never a satisfied ask.
- **Generation check does not break fixture-authored entities: confirmed.**
  `roleGenerations[role]` binds `occupantGenerationOf(e)`, which is null for
  unstamped bodies; `roleEnt`'s `gen != null` gate (`vignetteInterpreter.js:40`)
  accepts unprovable identity, exactly the documented caller's-choice contract.
  In production every spawn goes through `constructEntity` →
  `stampOccupantGeneration` (`coreSystem.js:342`), so real props/hulls are
  always stamped and a reissued id mismatches → 'gone'. The only asymmetry
  (unstamped bind → stamped reoccupant accepted) is unreachable in production;
  fixture-only, and the fixture ids (9e5+) never recycle anyway.
- **Instruction copy vs real physics bar: matches, with finding 1 as the one
  residual gap.** All drift-to-rest phrasing is gone from the 30 modules
  (verified by grep; remaining "settle" strings are player-voice "I will…settle
  it at the receiver hull" and receipts describing the game's own settle bar).
  `parked`/`settled` bars are release-speed gates on a zero-linear-damping
  payload — "cut it quiet, dead slow" is the honest instruction.
- **Regenerated scenes read in-register.** `--row=459` regenerates **0 of 30**
  byte-identical — no hand-edit drift since r1. Sampled: 401 (prop offset
  54,−28→170,−100; hail label capitalized; sponsor label discloses
  "then close in slow"; paid-lapse timeoutLine speaks the kept 24 cr);
  407/536 (r1 copy — "cut it quiet" landed in spec + body choices); 409 full
  read (phases, steps, receipts, `livedRotation`/`livedPhysical` markers all
  coherent; b→charge_b→await_b paid-and-physical as designed).

## Checks run

- `node --test test/rc-vignettes-459-4242.test.mjs test/lived-world.test.mjs
  test/depth-program-encounter-loader.test.mjs test/vignette-cost-verb.test.mjs
  test/vignette-navigation.test.mjs` — **42/43 pass**; every RC-459 test green
  including the real Rapier massline tow and both subject-gone failure modes.
  The single red (`vignette-navigation.test.mjs:200`, "ordinary navigation
  retains its speed cap") is caused by foreign dirty work in
  `src/ai/maneuver.js` (Row-491 `interceptSpeed` 72→100; fixture self-vel is
  90, no longer over cap → no brake). Same failure r1 attributed; **not this
  packet's defect** — preserved, not fixed.
- `node scripts/build-lived-vignettes.mjs --row=459` — 0 of 30 rewritten.

## Audit notes (no action)

- `tether.load` is the presentation-smoothed read (`tetherGameplay.js:158-170`
  phase floors: capture ⇒ 0.35), so `strained`'s `loadMin:0.35` reduces to
  "capture-or-later phase held 2 s" — the amended bar is deliberate (the legacy
  strain ratio never fires under a real tow) and the number is the same one the
  HUD shows the player. Sound; noted so the next reviewer doesn't re-litigate.
- `v.gapPrev.perp` is stored but re-derived each observation (the new
  both-points-vs-today's-segment math needs prev *position*, not prev
  side-sign); the stale field is read by the test to prove the sampler ran.
  Harmless. `v.latchedPropId` is likewise write-only bookkeeping — pre-existing,
  not this diff.
- `match_lead` says "off our bow" while `formation` enforces only the range
  band — the copy *over*specifies (the bar accepts stern station too), which is
  the safe direction; a stern station-holder still completes. In-register.
- `released` now aborts 'gone' when the prop role was never bound — verified
  every module using prop-dependent steps also runs a real `verb:'prop'` phase
  (all prop recipes carry `prop: true` in `RC459_RECIPES`); the removed
  `propId == null` auto-pass was unreachable in the curated set.
- `stepAwait` steers live ships by raw `entities.get(id)` before the step eval;
  a recycled hull could receive one tick of steering before `roleEnt` aborts
  the await that same tick. Benign — the eval always lands first.
- Pre-existing corner (not this packet, noted by r1, re-confirmed):
  `displaced`'s baseline is prop position at `enterAwait`, so pre-offer
  prop-dragging raises the post-choice ask. By design or benign.
