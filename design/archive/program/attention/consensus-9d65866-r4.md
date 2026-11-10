# Consensus review r4 — encounters packet 9d65866e15 + r1 76e554cd38 + r2 5cb383bdc8/5bf71a925e + r3 d199472d34

Fresh-eyes pass (review counter reset after r3's findings landed). Re-read
`src/systems/vignetteInterpreter.js` in full (roleEnt generation check,
propEnt 'gone' semantics, every await step kind, enterAwait/stepAwait state
resets, runVerb/hop/compile), `scripts/build-lived-vignettes.mjs`
RC459_STEPS/RC459_PROP_OFFSETS/RC459_RECIPES/RC459_COPY/curatedPhases, the
entity-generation contract (`src/core/entity.js:182-211`), production stamping
(`coreSystem.js:342`), the overlay skip (`livedWorldDirector.js:113`), the 1 Hz
tick gate (`encounterDirector.js:432`), and full reads of regenerated modules
404 (visit_aba) and 536 (toll) plus targeted reads of 409 (relay) and 410
(gap_formation geometry). Independently re-derived every copy-vs-bar claim.

**Verdict: one numbered finding, low severity.** The packet is correct and
honest; r1/r2/r3 fixes all landed properly (the travel clause and the
seventy-ring landed in copy and in the regenerated modules, verified by grep
sweep and regen byte-identity). The residual is the same copy-hides-a-bar
class one rung lower again — the last distance bar in the copy surface that
carries no number.

## Findings

1. **The relay instruction leaves both `near:60` rings unnamed — the same
   false-completion shape r3 fixed in `visit_aba`.** —
   `RC459_STEPS.relay` runs `{ kind:'near', subject:'prop', of:'hull_0',
   dist:60 }` then the same for `hull_1`
   (`build-lived-vignettes.mjs:807-808`; evaluated at
   `vignetteInterpreter.js:133-137`). `RC459_COPY.relay.instruction` says
   "past our hull first, then the far hull, in that order"
   (`build-lived-vignettes.mjs:920`; transmitted at 409's work_line,
   verified in the regenerated module). A prop towed "past" either hull at
   65–95 WU satisfies the literal line — the pass happened — while the
   `near` step never fires: the steps are sequential, so the await sits on
   the un-fired gate until the 120 s `timeoutS` lapses and the scene closes
   with "nothing owed", the player never learning a number existed. That is
   exactly the defect signature the r3 fix removed from `visit_aba` ("three
   separate ring entries" satisfied at 80–95 WU → named the seventy ring);
   here the failure lands on the prop's ring instead of the player's.
   Severity is low: `near` is a continuous check, so a second closer pass
   inside the window still counts, and the tow line's length nudges most
   natural flybys inside 60 anyway. r3 saw this line and filed it as a
   loose-register audit note ("no sibling conflict"); fresh eyes re-raises
   it because the packet's own rule — every instruction names the real
   physical bar of its step — does not hinge on a sibling, and every other
   distance bar in the copy surface now names its number (sixty/seventy/
   thirty/twenty/hundred-eighty/hundred-sixty/hundred-twenty are all spoken
   somewhere). Fix: name the sixty — e.g. "close past our hull first —
   inside sixty of it — then the far hull, in that order" — then
   `node scripts/build-lived-vignettes.mjs --row=459` (orders 409, 414,
   421). ~1 line plus regen.

## Mandate answers

- **roleEnt generation check: correct and load-bearing.** `roleEnt` binds
  `v.roleGenerations[role]` at `enterAwait` (`vignetteInterpreter.js:311`)
  and rejects on `occupantGenerationOf(e) !== gen` (`:40`). Production
  always stamps (`constructEntity` → `stampOccupantGeneration`,
  `coreSystem.js:342`); the `gen != null` gate accepts unstamped bodies per
  the documented caller's-choice contract (`entity.js:206`) — fixture-only
  asymmetry, unreachable in production. The r2 coverage is real: fixture
  `spawnEntity` stamps (`test/rc-vignettes-459-4242.test.mjs:68`, `:386`),
  the impostor is stamped a fresh generation (`:303`), and the recycled-id
  test passes against the live guard.
- **gapCross player-path measurement: sound.** Both observations are
  re-dotted onto today's segment (`vignetteInterpreter.js:259-265`); a
  parked player is the same point measured twice on the same line — hull
  motion alone can never flip the sign. The interpolated crossing must land
  on the segment (`rel ∈ [0,1]`, `:274-275`) and within `within` of its
  midpoint. Degenerate segment reads side 0 both ways. The order-410 test
  proves the parked-player case end-to-end; the stored `v.gapPrev.perp` is
  write-only bookkeeping the test reads as a sampler-ran marker (noted by
  r2, harmless).
- **RC459_STEPS + RC459_COPY: walked all 15 recipes against their steps.**
  displaced:120 ↔ "hundred-twenty" (every tow line, toll b-clause);
  oppositeSides 100/160/120 ↔ "cross a hundred-twenty…between a hundred and
  a hundred-sixty" (sides + toll — the r3 travel clause landed);
  visit dist≤70 ↔ "seventy ring"/"seventy-ring entries" (visit_ab +
  visit_aba — the r3 fix landed, verified in module 404); parked 30/20 ≤3/≤2
  ↔ "inside thirty"/"inside twenty…dead slow for a four-count"; settled ≤5 ↔
  "cut it quiet"/"let go dead slow"; clearOfActors:180 ↔ "a hundred-eighty
  clear of both their hulls"; formation/trail 60–180 + lead-100 ↔ "sixty to
  a hundred-eighty…a hundred on the lead" + "six-count"; meet:60 ≤5 ↔
  "inside sixty…dead slow for a two-count" (inspect); strained ≥0.35 ↔
  "real line load a two-count"; gapCross within:60 ↔ "thread the gap";
  toll 36 ↔ charge_a/aCost/label/receipt consistent; depart ↔ "my hull is
  leaving". Prop offsets put the instructed haul at ~197 WU (170,−100) so
  the named route clears displaced:120; clear_scav starts inside the scav
  ring (40,−20). The sole residual gap is the finding above.
- **Regenerated modules read in register.** 404 (visit_aba): full read —
  work_line names the seventy ring; steps are the three visits at the
  default ≤70; charge_b 24 = bCost = label; paid-lapse timeoutLine speaks
  the kept 24 cr; grant_a 36 = puzzle grant; `livedPhysical.recipeId` /
  `livedRotation` coherent; noop phase-IDs preserved. 536 (toll): full
  read — work_line names 36 cr, the hundred-twenty travel, and the
  hundred-to-hundred-sixty band; await_a is the same `oppositeSides` step
  as `sides`; charge_a 36 before the await; grant_a 0 (verb guards
  amount>0, no payout); await_b tow steps match the bLine's
  "a hundred-twenty clear…cut it quiet"; prop spawns at (170,−100) before
  hail so the role binds at enterAwait; `hasProp:true` coherent.
- **Every other distance bar in the copy surface is named:** confirmed by
  sweep — "seventy" in 402/404/415/419; "hundred-sixty" + "cross a
  hundred-twenty" in 412/425/536; per-kind bars above.

## Checks run

- `node --test test/rc-vignettes-459-4242.test.mjs test/lived-world.test.mjs
  test/depth-program-encounter-loader.test.mjs` — **33/33 pass** (~6.6 s),
  including the recycled-prop-id abort (the generation guard under test),
  the real Rapier massline tow, the parked-player gapCross proof, and the
  two-hour seeded route over all thirty curated scenes.
- `node scripts/build-lived-vignettes.mjs --row=459` — **0 of 30**
  rewritten; every landed module byte-identical to current generator
  output. No hand-edit drift since r3.
- `git status --short` on every audited file (interpreter, build script,
  test file, all 30 regenerated modules) — clean at HEAD; the dirty tree
  belongs to other lanes (ship manifests/render packages), untouched.

## Audit notes (no action)

- The shared sponsor-b `meet(60, ≤5, 2s)` copy — "then close in slow" /
  "close your hull dead slow for the hand-off" (`:1007-1008`) — names no
  number while `inspect`'s identical step says "inside sixty…a two-count".
  Borderline, not raised: "close in" is a process verb with no
  false-completion state (a hovering player simply hasn't finished closing
  in), the funded debit is already acknowledged on lapse, and both prior
  passes saw the string and judged it disclosed. The weakest residual in
  the surface — a future copy polish could add "inside sixty" in the same
  edit as the relay fix if the owner wants every number spoken.
- `parked` hold counts: `park_tight` names "a four-count" (holdS 4) while
  `tow_settle`/`deliver_second` (holdS 3) name none — consistent with the
  packet's qualitative convention for state verbs: "park"/"settle" carry
  the stay, the way "settle" carries the ≤5 hold without a count. Not the
  false-completion class.
- `gapCross` within:60 vs "thread the gap": escort pair at (0,0)/(−150,90)
  is ~175 WU apart; within-60-of-midpoint covers the central ~120 WU
  (≈68%) — "the gap" is fair for a central-band crossing (r2 adjudicated).
- `match_lead` says "off our bow" while `formation` accepts any side —
  over-specifies (safe direction; a stern station still completes). Same
  for `trail`'s unnamed leaderProgress:100 — the lead self-propels under
  keepMotion, so the player cannot fail it by inaction.
- Toll work_line's b-clause ("tow our dent a hundred-twenty clear") omits
  the released/settled tail that `tow_clear`'s instruction names — but the
  bLine ("…and cut it quiet") transmits it on choice, before the await
  starts. Disclosed before the work; in-register.
- `step.subject` is not role-validated at compile (only `of`/`at`,
  `:723`); a non-'prop' subject silently reads as the player — latent
  authoring trap, unreachable in the curated set (r3 noted).
- `stepAwait` steers `live.ids` ships by raw `entities.get` one statement
  before the step eval; a recycled hull could receive ≤1 tick of steering
  before `roleEnt` aborts that same tick — benign (r2 noted).
- `oppositeSides`'s side marker reads the hull's live pos/rot each
  observation; a yawing hull could theoretically flip the reading — but
  non-keepMotion awaits brake the cast to entry positions, so rotation is
  static in every recipe that uses it (sides, toll). Unreachable in the
  curated set.
