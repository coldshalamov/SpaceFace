# Consensus review r1 — encounters packet 9d65866e15 (RC-459 honest physical asks)

Reviewer pass 1 of 3. Audited the commit's interpreter + generator hunks directly,
sampled regenerated-module diffs (401 tow_settle, 413 clear_scav, 410 gap_formation,
417 strain, 426 deliver_second, 536 toll), and ran the named tests.

**Verdict: two actionable findings, both low severity.** The packet is correct,
fair, and well-tested; neither finding blocks the design.

## Findings

1. **`propEnt` claims to catch a *recycled* prop id; it cannot.** —
   `src/systems/vignetteInterpreter.js:78-80` (`propEnt`), `:34-38` (`roleEnt`),
   `:300-308` (`enterAwait` snapshot). The new comment at `:75-77` and the
   `propEnt` callers promise "a dead, **recycled**, or non-finite prop aborts".
   But `roleEnt` resolves `v.roleIds.prop` through `state.entities.get(id)`, and
   `allocateEntityId` pops `state.freeIds` first (`src/core/entity.js:152-158`),
   so a prop destroyed mid-await can have its id reissued to a *new* live entity
   within seconds. `subjectEnt` passes on the new occupant: a latch on it then
   satisfies `latchedToProp` (id compares equal), and `displaced`/`parked`
   evaluate against the wrong body — the exact false-satisfaction this packet
   set out to close. The repo already ships the mechanism for this:
   `occupantGenerationOf(entity)` (`src/core/entity.js:208`). Fix: at
   `enterAwait`, record `v.entityGens[id] = occupantGenerationOf(e)` beside
   `entityStarts`, and have `roleEnt` (or a dedicated check inside `propEnt`)
   reject when the current entity's generation differs. ~5 lines.

2. **"let it drift to rest" copy promises a settle the physics never performs.** —
   `scripts/build-lived-vignettes.mjs:908` (`RC459_COPY.tow_settle.instruction`;
   same pattern at `:914` tow_clear "drop the line, let it settle" and `:997`
   toll `bLine` "let it settle"). Payload material carries no linear damping —
   the commit's own test note says the swing "never died on its own" — so a load
   released with residual speed *never* drifts to rest; only a cut made while the
   line is quiet satisfies `parked`/`settled` (speed ≤3/≤5 held). A player who
   reads the instruction literally, cuts at speed, and waits will hit
   `physical_timeout` doing exactly what they were told. The register already has
   the honest phrasing: `park_tight` says "dead slow for a four-count". Fix:
   give tow_settle/tow_clear/toll_weight the same discharge cue ("set it down
   dead slow inside thirty", "cut the line while she's quiet"), then rerun
   `--row=459` (verified write-if-changed; reran clean, 0/30 rewrites, during
   this review).

## Checks run

- `node --test test/rc-vignettes-459-4242.test.mjs` — **13/13 green**, including
  the real Rapier massline tow (965 ms of production-chain physics).
- `node --test test/lived-world.test.mjs` — **16/16 green**.
- `node --test test/vignette-navigation.test.mjs` — **6/7**; the one red
  ("moving-point speed allowance leaves ordinary intercept caps… intact",
  `test/vignette-navigation.test.mjs:200`) is caused by a foreign dirty hunk in
  `src/ai/maneuver.js` (Row-491 `interceptSpeed` 72→100 — the fixture's 90 WU/s
  approach no longer exceeds the cap). **Not this packet's defect; preserved,
  not fixed.**
- `node scripts/build-lived-vignettes.mjs --row=459` — regenerated **0 of 30**;
  the landed modules are byte-identical to current generator output, so the
  strand-recovery claim holds.

## Audit notes (no action)

- **Physical asks read honestly.** Every instruction names the real measured
  bar: `displaced:120` ↔ "a hundred-twenty of drag/haul/line work";
  `clearOfActors:180` ↔ "a hundred-eighty clear of both their hulls";
  `parked ≤30/≤20` ↔ "within thirty"/"inside twenty"; `oppositeSides` band ↔
  "inside the band". Prop berths at (170,−100) put the receiver ~197 WU out —
  the instructed route clears the 120 bar ~55 WU before the park ring opens
  (the new test asserts the berth ≥150 outright).
- **The sponsor branch is genuinely paid AND physical**: `b → charge_b (debit)
  → await_b meet(hull_0, 60 WU, ≤5 WU/s, 2 s)`, and the label now carries both
  ("24 cr, then close in slow"). The `meet` step predates this packet; the
  label disclosure is the new part — and it is honest. On the six
  `keepMotion` scenes (403/406/410/416/423/429) the convoy keeps creeping
  (~28 WU/s) through `await_b`, so "close in slow" resolves as *park on the
  track and let the hull pass over you* — findable, disclosed, and recoverable
  on a lapse (the debit is acknowledged verbatim).
- **The snub maneuver is humanly findable.** It is the game's one braking
  technique — hold the hull downwind of the load's velocity so the taut rope
  does negative work — and the scripted pilot clears the scene in ~29 s of the
  120 s window, leaving ~4× slack for an imperfect human line. The unfair part
  is only the copy (finding 2), not the physics.
- **`gapCross` re-measure is sound.** Both observations are now dotted onto
  *today's* segment; a stationary player can never accrue a sign flip (P0==P1
  reads the same side), while a real transit still interpolates to a midpoint
  crossing bounded by `within`. The stale `perp` field stays in `v.gapPrev` —
  harmless, and the new test reads it to prove the sampler ran.
- **`propEnt 'gone'` bricks nothing that used to complete.** All 16 modules with
  `released`/`latched`/`strained`/`settled`/`parked` steps also carry a real
  `verb:'prop'` phase (checked the whole encounters dir); the removed
  `propId == null` auto-pass in `released` was unreachable in practice —
  `latched` gates first in every recipe. A dead/NaN prop mid-await now aborts
  `physical_subject_gone`, which the new tests prove for both failure modes.
- **`prop` verb → `type:'payload'` is correct and precedented**: authored
  encounters 1100–1106 already spawn payload props; `payload` sits in
  `NON_COLLIDING_ACQUISITION_TYPES` (tetherGameplay.js:175) and maps to
  `combat_profile_tether_payload` by entity-type default (combatDefs.js:594);
  the conditional stamp only fills an unauthored profile. Ambient-predation
  skips story payloads (`data.payloadType` unset). No collide/AI side effects:
  `parentType:'story_prop'` still filters it from vignette steering.
- **Corner case, pre-existing (not this packet)**: `displaced`'s baseline is
  the prop position at `enterAwait` — a player who drags the prop during the
  56 s offer window, then accepts, must displace it a *further* 120 WU from
  wherever it lies. `enterAwait` was untouched by this diff; noting so the next
  reviewer doesn't double-count it.
- LANDED_REVIEW row `R-9d65866` exists and is OPEN — this review is its
  requested second look.
