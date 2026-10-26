# Consensus review r5 — encounters packet 9d65866e15 + r1 76e554cd38 + r2 5cb383bdc8/5bf71a925e + r3 d199472d34 + r4 e6dfc71361

Fresh-eyes pass (review counter reset after r4's finding landed). Re-read
`src/systems/vignetteInterpreter.js` in full (roleEnt generation guard,
propEnt 'gone' semantics, every await step kind, enterAwait/stepAwait state
resets, runVerb guards, hop, compile validation),
`scripts/build-lived-vignettes.mjs` RC459_STEPS/RC459_PROP_OFFSETS/
RC459_RECIPES/RC459_COPY/curatedValues/curatedChoiceRows/curatedReceipts/
curatedPhases, the entity-generation contract (`src/core/entity.js:182-211`),
production stamping (`coreSystem.js:335-343`), and all four prior consensus
files for adjudication history. Verified the r4 relay fix in the regenerated
modules (409/414/421) and re-derived every copy-vs-bar claim across all 15
recipes independently.

**Verdict: one numbered finding, low severity.** The packet is correct and
honest; the r4 fix landed cleanly ("inside sixty" transmits in all three
relay modules; regen reports 0/30 drift). The residual is the same
copy-hides-a-bar class one rung lower — and it is now the *last* distance
bar in the instruction surface that carries no number.

## Findings

1. **`gap_formation`'s coda "then hold formation off the lead" names none of
   its formation-step bars — the same 60–180 band / lead-100 window
   `match_lead` spells out on an identical step spec.** —
   `RC459_STEPS.gap_formation` runs `gapCross within:60` then
   `{ kind:'formation', of:'hull_0', min:60, max:180, holdS:8,
   leaderProgress:100 }` (`build-lived-vignettes.mjs:830-833`) — a
   step-for-step duplicate of `match_lead`'s formation step (`:825`),
   evaluated identically at `vignetteInterpreter.js:182-190`. `match_lead`'s
   instruction names the whole bar ("Hold station sixty to a
   hundred-eighty off our bow while we make a hundred on the lead", `:944`;
   transmitted verbatim in modules 403/423). `gap_formation`'s says only
   "then hold formation off the lead" (`:956`; transmitted verbatim in
   modules 410/429, verified at HEAD). A player who threads the gap and
   settles at 40 WU — a perfectly ordinary reading of tight "formation" —
   or at 250 WU satisfies the literal line while the `min:60`/`max:180`
   gate silently never fires: the await sits on the un-met step until the
   120 s `timeoutS` lapses and the scene closes with "nothing owed", the
   player never learning a band existed. That is the same defect signature
   r3 removed from `visit_aba` (unnamed seventy ring) and r4 removed from
   relay (unnamed sixty rings): copy hides a measured bar, the literal
   reader stalls to `physical_timeout`. r3 filed this exact coda as a
   loose-register note ("self-evident station-keeping, band is generous")
   — the identical classification it gave relay's `near:60`, which r4 then
   re-raised and the owner fixed, because the packet's own rule does not
   hinge on the case being soft. After r4, this is the only remaining
   recipe instruction whose step's distance bars go unnamed. Severity is
   low: `formation` is a continuous check, so adjusting station inside the
   window still counts, and the band is a generous 3:1 — but `keepMotion`
   means the convoy creeps ~28 WU/s through the await, so a station that
   reads as "formation" and isn't can drift further out of band while the
   player waits. Fix: give `RC459_COPY.gap_formation.instruction` the
   sibling's register — e.g. "Thread the gap between the two escort hulls,
   then hold formation sixty to a hundred-eighty off the lead while it
   makes its hundred" — then `node scripts/build-lived-vignettes.mjs
   --row=459` (orders 410, 429). ~1 line plus regen.

## Mandate answers

- **roleEnt generation check: correct and load-bearing.** `roleEnt` rejects
  when `occupantGenerationOf(e) !== v.roleGenerations[role]`
  (`vignetteInterpreter.js:39-41`); the snapshot lands at `enterAwait`
  (`:305-313`) only for bodies passing `subjectEnt`. Production stamps
  every spawned body (`constructEntity` → `stampOccupantGeneration`,
  `coreSystem.js:342`); the `gen != null` gate accepts unstamped fixtures
  per the documented caller's-choice contract (`entity.js:206`). The r2
  recycled-prop-id test still proves the guard (green, below).
- **gapCross player-path measurement: sound.** Both observations re-dotted
  onto today's segment (`:259-265`); sign flip requires the player's own
  displacement; the interpolated crossing must land on the segment
  (`rel ∈ [0,1]`) and within `within` of its midpoint (`:270-277`). The
  order-410 test proves a parked player can never accrue a crossing.
- **RC459_STEPS vs RC459_COPY, all 15 recipes walked:**
  `displaced:120` ↔ "hundred-twenty" in every tow line and the toll
  b-clause; `oppositeSides 100/160/120` ↔ "cross a hundred-twenty…between
  a hundred and a hundred-sixty" (sides + toll — r2/r3 landed);
  `visit ≤70` ↔ "seventy ring"/"seventy-ring entries" (visit_ab/visit_aba);
  `near:60` relay ↔ "inside sixty of our hull first, then inside sixty of
  the far hull" (r4 landed, verified in 409/414/421); `meet 60/≤5/2s` ↔
  "inside sixty…dead slow for a two-count" (inspect); `parked 20/30` ↔
  "inside twenty"/"inside thirty"; `settled ≤5` ↔ "cut it quiet"/"dead
  slow"; `clearOfActors:180` ↔ "a hundred-eighty clear of both their
  hulls"; `trail 60–180/rel≤8/6s/lead-100` ↔ "sixty to a hundred-eighty,
  matched speed, six-count" + receipt "made its hundred"; `match_lead`
  band + lead-100 ↔ "sixty to a hundred-eighty…a hundred on the lead";
  `strained ≥0.35/2s` ↔ "real line load a two-count"; `gapCross within:60`
  ↔ "the gap" (adjudicated); toll 36 ↔ charge_a/aCost/label/prose;
  `depart` ↔ "leaving". The sole unnamed distance bar is the finding
  above.
- **Regen parity:** `--row=459` → 0 of 30 rewritten; every landed module
  byte-identical to generator output at HEAD.

## Checks run

- `node --test test/rc-vignettes-459-4242.test.mjs test/lived-world.test.mjs
  test/depth-program-encounter-loader.test.mjs` — **33/33 pass** (~11 s),
  including the recycled-prop-id abort (generation guard under test), the
  real Rapier massline tow, the parked-player gapCross proof, and the
  two-hour seeded route over all thirty curated scenes.
- `node scripts/build-lived-vignettes.mjs --row=459` — **0 of 30**
  rewritten; no hand-edit drift since r4.
- `git status --short` on every audited file — clean at HEAD; the dirty
  tree belongs to other lanes (ship manifests/render packages), untouched.

## Audit notes (no action)

- Shared sponsor-b `meet(60, ≤5, 2s)` copy — "then close in slow" /
  "close your hull dead slow for the hand-off" (`:1007-1008`) — names no
  number while `inspect`'s identical step says "inside sixty…a
  two-count". Thrice adjudicated, not raised: "close in" is a process
  verb with no false-completion state (a hovering player simply hasn't
  finished closing in), and the funded debit is acknowledged verbatim on
  lapse. The weakest residual in the surface — a future copy polish could
  add "inside sixty" there in the same edit as the finding's fix if the
  owner wants every number spoken.
- Hold counts: `park_tight` names "a four-count" while
  `tow_settle`/`deliver_second` (holdS 3) and `match_lead` (holdS 8) name
  none — the packet's qualitative convention for state-verb holds
  ("settle"/"park"/"while we make a hundred" carries the stay). Not the
  false-completion class; r4 adjudicated.
- `gapCross` `within:60` vs "thread the gap": escort pair ~175 WU apart;
  within-60-of-midpoint covers the central ~120 WU (≈68%) — "the gap" is
  an accurate geometric name for a central-band crossing (r2
  adjudicated). The finding above concerns only the formation tail.
- `match_lead` "off our bow" over-specifies (stern station completes) —
  safe direction; `leaderProgress:100` self-clears under `keepMotion`'s
  ~28 WU/s creep, so the player cannot fail it by inaction (r4 noted).
- `step.subject` is not role-validated at compile (only `of`/`at`,
  `vignetteInterpreter.js:723`); a non-'prop' subject silently reads as
  the player — latent authoring trap, unreachable in the curated set
  (r3/r4 noted).
- `stepAwait` steers `live.ids` ships by raw `entities.get` one statement
  before the step eval; a recycled hull could receive ≤1 tick of passive
  steering before `roleEnt` aborts that same tick — benign (r2–r4 noted).
- `v.roleGenerations` keyed by role collides on role reuse — unreachable
  in the curated set (hull_0/hull_1/prop unique; r3/r4 noted).
- `visit` rings (≤70) cannot overlap on the curated offsets (~175 WU
  apart, 70+70=140 < 175) — "three separate ring entries" is honest
  geometry, and `visitArmed` resets per step on advance.
- Toll literal 36 lives in four places (charge_a, aCost, label, prose) —
  consistent; a retune moves them together (r3 noted).
- `runVerb` grant/cost/charge guards verified: grant skips amount ≤0
  (`:594`), charge/cost abort `insufficient_funds` before any debit —
  the once-ever consumption on a broke pick is the deliberate fail-closed
  contract (r3 adjudicated).
