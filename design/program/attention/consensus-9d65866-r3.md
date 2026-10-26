# Consensus review r3 — encounters packet 9d65866e15 + r1 76e554cd38 + r2 5cb383bdc8/5bf71a925e

Reviewer pass 3 of 3 — final successive independent pass, fresh eyes. Re-read
current `src/systems/vignetteInterpreter.js` (roleEnt generation check,
propEnt 'gone' semantics, gapCross player-path measurement — full file),
`scripts/build-lived-vignettes.mjs` RC459_STEPS/RC459_COPY/curatedPhases, the
entity-generation contract (`src/core/entity.js`), production stamping
(`src/core/coreSystem.js:342`), the overlay substitution seam
(`livedWorldDirector.js:109-119`), the live tick cadence
(`encounterDirector.js:411-449`), the diffs of both fix commits, and full
reads of regenerated modules 412 and 536 plus the updated line of 425.
Independently re-derived every copy-vs-bar claim rather than trusting r1/r2.

**Verdict: two numbered findings, both low severity.** The packet is correct,
honest, and complete; both r1 and r2 fixes landed properly and the new test
provably exercises the guard (mutation probe below). The findings are residual
copy under-disclosure — the same defect class the prior rounds fixed, one rung
lower again. Neither blocks the design; each is a one-line copy fix plus a
`--row=459` regen of one or two modules.

## Findings

1. **The toll's paid-pass clause drops the `travel:120` bar that the identical
   `sides` step discloses.** — `RC459_STEPS.toll_pass` is literally the
   `sides` step: `oppositeSides of:'hull_0' min:100 max:160 travel:120`
   (`build-lived-vignettes.mjs:841` vs `:836`). The r2 fix named the band
   floor in `toll.instruction` ("between a hundred and a hundred-sixty of
   us", `:992`) but left the 120-WU accumulated-travel requirement unnamed,
   while `sides.instruction` says "cross a hundred-twenty through to the
   other" in the same sentence slot (`:974`). A paying player who flips the
   side marker on a tight in-band dart — less than 120 WU of movement since
   the await armed — satisfies every visible element of the ask and gets no
   credit; the bar quietly restarts the marker (`vignetteInterpreter.js:226`)
   and the scene holds their 36 cr until the next flip counts. Self-corrects
   because `playerTravel` is cumulative and monotonic (it cannot wedge the
   way the sub-100 band could), so the worst case is one un-credited pass —
   but it is the same copy-hides-a-bar class r2 fixed, left in the sibling
   line of the same step. ("The far side" also presumes the player starts on
   the near side; `sides`'s "start one side, cross to the other" states the
   real bar symmetrically.) Fix: give `RC459_COPY.toll.instruction` a travel
   clause — e.g. "then carry a hundred-twenty round us — pass on the far
   side, between a hundred and a hundred-sixty of us" — and regen (536 only).

2. **`visit_aba` never sizes the 70-WU ring that `visit_ab` names.** — Both
   recipes run the same `visit` step at the default `dist ≤ 70`
   (`build-lived-vignettes.mjs:834-835`; `vignetteInterpreter.js:141`), but
   `visit_ab`'s instruction says "Enter each seventy ring" (`:962`;
   transmitted at 402/415-style work_line, verified in modules 402 and 419)
   while `visit_aba`'s says only "Three separate ring entries" (`:968`;
   verified in modules 404 and 415 — the `visit` steps there carry no
   `dist`, so 70 it is). A player holding at 80–95 WU "in the ring" did what
   the line literally says and gets no credit, with no number to aim at;
   self-corrects by stepping closer (the visit arms on departure, no restart
   penalty), but the sibling discloses the same bar. Fix: name the ring —
   e.g. "Ours, theirs, ours again — three separate entries inside each
   seventy ring" — and regen (404, 415).

## Mandate answers

- **roleEnt generation check: correct, and load-bearing — verified by
  mutation.** `roleEnt` binds `v.roleGenerations[role]` at `enterAwait`
  (`vignetteInterpreter.js:311`) and rejects on `occupantGenerationOf(e)
  !== gen` (`:40`). A stamped expectation rejects both a recycled occupant
  (different gen) and an unprovable one (`null !== gen`); an unstamped bind
  accepts per the documented caller's-choice contract (`entity.js:206`) —
  fixture-only asymmetry, unreachable in production where every spawn routes
  through `constructEntity` → `stampOccupantGeneration`
  (`coreSystem.js:342`, confirmed live at HEAD; `spawnProp`/`spawnShips` go
  through `helpers.spawnEntity` → `constructEntity`).
- **propEnt 'gone' semantics: correct and complete.** Every prop-dependent
  step validates the body each evaluation — `latched`/`strained`/`released`
  via `propEnt`, `displaced`/`settled`/`parked`/`clearOfActors` via
  `roleEnt('prop')` + `subjectEnt`, `subject:'prop'` `near` steps via the
  `:95` gate. Dead, NaN-positioned, and recycled props all abort
  `physical_subject_gone`; a gone prop is never "freed" or "settled".
  `entityStarts` is keyed by id but only consulted after roleEnt cleared the
  occupant — the baseline can never be read against an impostor.
- **gapCross player-path measurement: sound.** Both the previous and current
  player positions are re-dotted onto *today's* segment
  (`vignetteInterpreter.js:259-265`): a stationary player is the same point
  measured twice on the same line — same side, no flip — so hull motion
  alone cannot cross. The interpolated crossing point must land on the
  segment (`rel ∈ [0,1]`) and within `within` of its midpoint. Degenerate
  segment (A==B) reads side 0 both ways and never counts. The order-410 test
  proves the parked-player case end-to-end.
- **RC459_COPY vs real bars: walked all 15 recipes.** displaced:120 ↔
  "hundred-twenty" (every tow line); parked 30/20 ≤3/≤2 held ↔ "inside
  thirty"/"inside twenty…dead slow for a four-count"; settled ≤5 held ↔
  "cut it quiet"/"let go dead slow"; clearOfActors:180 ↔ "a hundred-eighty
  clear of both"; near:60 relay ↔ "past our hull first, then the far hull"
  (loose but in-register); formation/trail 60–180 + lead-100 + hold ↔
  "sixty to a hundred-eighty…a hundred on the lead"/"six-count"; visit:70 ↔
  "seventy ring" (finding 2 is the aba exception); meet:60 ≤5 ↔ "inside
  sixty…dead slow for a two-count"; strained ≥0.35 ↔ "real line load a
  two-count"; gapCross ↔ "thread the gap"; depart ↔ "my hull is leaving";
  toll 36 ↔ "36 cr"/"thirty-six" in charge_a, label, line, receipt
  (consistent). The two residual gaps are the findings above.
- **The new recycled-id test exercises the guard: confirmed by mutation.**
  Fixture `spawnEntity` stamps (`test/rc-vignettes-459-4242.test.mjs:68`,
  `:386`), so the prop binds a real `roleGenerations.prop` at `enterAwait`;
  the impostor is stamped a different generation (`:303`). With the
  generation check disabled (`&& false` on `:40`), the test goes red —
  `'await_a' !== 'done'`: the impostor satisfies `subjectEnt` and
  `latchedToProp`, `strained`/`released` stall inside the 6 s drive window.
  With the check restored, `git status` clean and the suite green. The guard
  is the only thing rejecting that body.
- **Regenerated modules read in register.** 412 (sides): full read —
  instruction names floor+ceiling+travel against steps `100/160/120`;
  charge_b 30 = bCost; paid-lapse timeoutLine speaks the kept 30 cr;
  `livedPhysical.recipeId:'sides'`, `livedRotation`, `externalOnly` all
  coherent. 536 (toll): full read — charge_a 36 = aCost = label; grant_a 0
  (verb guards amount>0, so no payout emits); await_b tow steps match the
  bLine ("a hundred-twenty clear…cut it quiet"); paid-lapse line "Count
  paid, no pass…" acknowledges the kept debit; prop spawns before hail so
  the role binds at enterAwait. 425: updated work_line verified byte-equal
  to 412's recipe copy.

## Checks run

- `node --test test/rc-vignettes-459-4242.test.mjs test/lived-world.test.mjs
  test/depth-program-encounter-loader.test.mjs` — **33/33 pass** (73.6 s),
  including the new recycled-id test, the real Rapier massline tow (16.1 s of
  production-chain physics), and the two-hour deterministic seeded route.
- Mutation probe: `&& false` injected at `vignetteInterpreter.js:40` →
  recycled-id test fails as analyzed → restored; `git status` clean.
- `node scripts/build-lived-vignettes.mjs --row=459` — **0 of 30**
  rewritten; landed modules byte-identical to generator output.
- `git status` on every audited file — clean at HEAD; the dirty tree belongs
  to other lanes (ship manifests/render packages), untouched.

## Audit notes (no action)

- `encounterDirector.update` gates on `dir._accum < 1`
  (`encounterDirector.js:432`) — `script.tick` → `stepAwait` →
  `evalAwaitStep` runs at ≈1 Hz, so the tests' "1 Hz sampler" language is
  literal. Sampler-based steps (`gapCross`, `visit`, `oppositeSides`) need
  ≥2 observations by design; a sub-second flicker between reads counts
  nothing — consistent across all steps and tuned into the bar widths.
- `livedSceneRequestData` skips `livedOverlay` for `livedRotation` entries
  (`livedWorldDirector.js:113`) — the authored physical instruction always
  transmits; the six-line sector overlay cannot silently replace it.
- `step.subject` is not role-validated at compile (only `of`/`at` are,
  `vignetteInterpreter.js:723`); a non-'prop' subject silently reads as the
  player in `evalAwaitStep` — latent authoring trap, no curated module hits
  it.
- `gap_formation`'s coda "then hold formation off the lead" leaves the same
  60–180/8 s/lead-100 bar `match_lead` names in full — softer case: the ask
  is self-evident station-keeping and the band is generous, so in-register.
- Relay's "past our hull" likewise leaves the near:60 ring unnamed —
  same loose-register family as finding 2 but no sibling conflict; noted.
- Toll literal 36 lives in four places (charge_a, aCost, label, prose) —
  consistent today; a retune moves them together. Pre-existing pattern.
- A broke player choosing "Pay the count — 36 cr" (or an unaffordable
  sponsor branch) hits `charge` → abort `insufficient_funds` and consumes
  the once-ever scene — deliberate fail-closed contract, the outcome names
  the reason; `choiceOpen` has no credit gate. Design property, not this
  packet's defect.
- `stepAwait` steers `live.ids` ships by raw `entities.get` one statement
  before the step eval; a recycled hull could receive ≤1 tick of passive
  steering before `roleEnt` aborts that same tick — benign (r2 noted).
- `v.roleGenerations` is keyed by role, so a non-curated spec reusing one
  role across several squad members would collide — unreachable in the
  curated set (hull_0/hull_1/prop are unique).
