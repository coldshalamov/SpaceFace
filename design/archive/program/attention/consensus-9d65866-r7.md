# Consensus review r7 — encounters packet 9d65866e15 + r1 76e554cd38 + r2 5cb383bdc8/5bf71a925e + r3 d199472d34 + r4 e6dfc71361 + r5 53ed0b13e4

Fresh-eyes pass — second consecutive independent confirmation. Re-read
`src/systems/vignetteInterpreter.js` in full (roleEnt generation guard, propEnt
'gone' semantics, every await step kind, enterAwait/stepAwait per-step resets,
runVerb guards, hop, compile validation), all of `scripts/build-lived-vignettes.mjs`
RC459_STEPS/RC459_PROP_OFFSETS/RC459_RECIPES/RC459_COPY/curatedValues/
curatedChoiceRows/curatedReceipts/curatedPhases, the entity-generation contract
(`src/core/entity.js:152-211`), production stamping (`coreSystem.js:342`), the
overlay skip (`livedWorldDirector.js:113`), full reads of regenerated modules
413 (clear_scav) and 426 (deliver_second) — the two singleton recipes no prior
round read in full — plus all six prior consensus files for adjudication
history. Every copy-vs-bar claim re-derived independently.

**Verdict: OPTIMAL — no actionable improvement.**

The packet is unchanged since r6's OPTIMAL (interpreter untouched since r1's
76e554cd38; build script and modules untouched since r5's 53ed0b13e4), and the
independent re-walk found the same thing: every measured distance bar in the
15-recipe instruction surface is spoken, every prop-dependent step validates
its body each observation, and a dead/recycled/non-finite subject aborts
`physical_subject_gone` — never satisfies an ask.

## Mandate answers

- **RC459_STEPS vs RC459_COPY, all 15 recipes walked independently:**
  - tow_settle (401/408): latched → displaced:120 → released → parked(hull_0,
    30, ≤3, 3 s) ↔ "a hundred-twenty of drag before you let go — then cut it
    quiet, dead slow, inside thirty" (:908). All bars named; the 3 s hold rides
    the state verb (adjudicated convention).
  - tow_clear (407/420): same chain ending settled(≤5, 2 s) ↔ "past the
    hundred-twenty mark, then cut it quiet — dead slow when the line comes off"
    (:914).
  - relay (409/414/421): latched → displaced:120 → near(prop→hull_0, 60) →
    near(prop→hull_1, 60) → released → settled ↔ "a hundred-twenty on the line —
    inside sixty of our hull first, then inside sixty of the far hull, in that
    order. Let go dead slow" (:920). r4 fix verified live. The `near` steps do
    not re-check the latch — the bar is *looser* than "carry on the line"
    implies, which is the safe direction; a released early prop still has to
    end `settled ≤5`, and the zero-linear-damping payload makes the on-line
    route the only workable one anyway.
  - park_tight (411/418/424/427): parked(20, ≤2, 4 s) ↔ "inside twenty…dead
    slow for a four-count" (:926) — the only recipe that speaks its hold count.
  - clear_scav (413): clearOfActors(180) after displaced:120 ↔ "a
    hundred-eighty clear of both their hulls — a hundred-twenty of line work
    at least — release, settle" (:932). Prop at (40,−20) starts ~45 WU off
    hull_0, inside the ring the copy names; "at least" is honest — clearing 180
    off both hulls needs ~135+ WU of real drag.
  - deliver_second (426): parked(hull_1, 30, ≤3, 3 s) ↔ "the second hull, not
    ours — a hundred-twenty of haul…park it inside thirty" (:938). Prop
    (170,−100) to hull_1 (−150,90) is ~372 WU — the named 120 is the floor
    bar, "tow it there" names the real ask; honest.
  - match_lead (403/423): formation(60–180, 8 s, lead-100) ↔ "sixty to a
    hundred-eighty off our bow while we make a hundred on the lead" (:944).
  - trail (406/416): trail(60–180, 6 s, rel≤8, lead-100) ↔ "sixty to a
    hundred-eighty, matched speed, six-count" (:950); lead-100 self-clears
    under keepMotion creep and is receipt-named (adjudicated r4).
  - gap_formation (410/429): gapCross(60) → formation(60–180, 8 s, lead-100) ↔
    "Thread the gap…hold station sixty to a hundred-eighty off the lead while
    it makes a hundred" (:956) — the r5 fix, verified in both modules.
  - visit_ab (402/419) / visit_aba (404/415): visit ≤70 ×2/×3 ↔ "Enter each
    seventy ring" / "three separate seventy-ring entries" (:962/:968).
  - sides (412/425) / toll_pass (536): oppositeSides(100–160, travel 120) ↔
    "cross a hundred-twenty through to the other, between a hundred and a
    hundred-sixty of us" (:974) / "cross a hundred-twenty past the hull to the
    far side, between a hundred and a hundred-sixty of us" (:992).
  - inspect (405/428): meet(60, ≤5, 2 s) ↔ "inside sixty…dead slow for a
    two-count" (:980).
  - strain (417/422): strained(≥0.35, 2 s) ↔ "hold real line load a two-count"
    (:986) — the HUD's own smoothed number (adjudicated r2).
  - toll (536) full walk: charge_a 36 = aCost = label "Pay the count — 36 cr" =
    "thirty-six" prose — four placements consistent; b-side toll_weight
    (latched → displaced:120 → released → settled) ↔ "tow our dent a
    hundred-twenty clear" + bLine "cut it quiet"; await_b skips the charge —
    the tow substitutes for coin; c-line overridden "No coin and no tow";
    grant_a 0 (verb guards amount>0, no payout emits).
  - depart(180/1000) on every decline branch ↔ "my hull is leaving" —
    fail-open decline path (adjudicated).
- **roleEnt generation guard: correct and load-bearing.** `roleEnt` rejects
  when `occupantGenerationOf(e) !== v.roleGenerations[role]` (`:39-41`); the
  snapshot binds at `enterAwait` (`:305-313`) only for bodies passing
  `subjectEnt`. Production stamps every spawn (`constructEntity` →
  `stampOccupantGeneration`, `coreSystem.js:342` — verified live at HEAD);
  `allocateEntityId` recycles through `freeIds` (`entity.js:157-164`), so the
  guard is what keeps a reissued id from satisfying the dead prop's asks. The
  `gen != null` gate accepts unstamped fixtures per the documented
  caller's-choice contract (`entity.js:206`). Fixture coverage is real:
  `spawnEntity` stamps (`test/rc-vignettes-459-4242.test.mjs:68`, `:386`) and
  the impostor carries a different generation (`:303`) — recycled-id test
  green in this run.
- **gapCross math: sound.** Both the previous and current player positions are
  re-dotted onto *today's* segment (`:259-265`); a stationary player is the
  same point measured twice on the same line — same side, no flip — so escort
  motion alone can never accrue a crossing (order-410 test proves it). The
  interpolated crossing must land on the segment (`rel ∈ [0,1]`, `:274-275`)
  and within `within` of its midpoint (`:276-277`). Degenerate segment (A==B)
  reads side 0 both ways and never counts. Perp-distance interpolation is
  exact — perp is linear in position along the player's path.
- **Abort semantics: fail-fast and complete.** Every prop-dependent step
  validates the body per observation — `latched`/`strained`/`released` via
  `propEnt`, `displaced`/`settled`/`parked`/`clearOfActors` via `roleEnt` +
  `subjectEnt`, `subject:'prop'` `near` via the `:95` gate — so dead,
  recycled, and NaN-positioned props all abort `physical_subject_gone`. An
  unbound prop role resolves id==null → 'gone', so `released` can never
  auto-pass (the r1 hole stays closed; every recipe running prop steps also
  carries `prop: true` in `RC459_RECIPES`, and the prop phase precedes hail so
  the role binds at enterAwait). Per-step observation state resets on advance
  (`:345-352`) — no arming, side marker, or gap approach bleeds across steps.
  Deadline speaks `timeoutLine` before `physical_timeout` (`:322-327`).
- **Regenerated modules 413 and 426 (full reads):** 413 — both scavenger hulls
  cast, prop inside their ring, steps match the copy's order and numbers,
  charge_b 24 = bCost, paid-lapse timeoutLine speaks the kept 24 cr, grant_a
  54 = wreck grant, `livedPhysical.recipeId:'clear_scav'`, noop phase-IDs
  preserved. 426 — `parked` targets hull_1 ("the second hull, not ours" —
  hull_0 is the hailer), keepMotion false so the cast brakes to entry
  positions, same economics/receipt/noop coherence.
- **Regen parity:** `node scripts/build-lived-vignettes.mjs --row=459` → **0 of
  30 rewritten** — every landed module byte-identical to generator output at
  HEAD; no hand-edit drift since r5.
- **Tree state:** every audited file clean at HEAD; the dirty tree belongs to
  other lanes (ship manifests/render packages), untouched.

## Checks run

- `node --test test/rc-vignettes-459-4242.test.mjs test/lived-world.test.mjs
  test/depth-program-encounter-loader.test.mjs` — **33/33 pass** (~5.5 s),
  including the recycled-prop-id abort, the real Rapier massline tow (~588 ms
  of production-chain physics), the parked-player gapCross proof, and the
  two-hour seeded route over all thirty curated scenes.
- `node scripts/build-lived-vignettes.mjs --row=459` — **0 of 30** rewritten.
- `git log`/`git status` on the interpreter, build script, test file, and all
  30 modules — clean at HEAD; nothing in the packet moved since r6.

## Audit notes (previously adjudicated — recorded so they stay adjudicated)

- Shared sponsor-b `meet(60, ≤5, 2 s)` copy — "then close in slow" / "close
  your hull dead slow for the hand-off" (`:1007-1008`) — names no number. Five
  adjudications running plus the owner's r5 fix deliberately left it: "close
  in" is a process verb with no false-completion state and the funded debit is
  acknowledged verbatim on lapse. Not raised.
- Hold-count convention: `park_tight` names "a four-count"; `tow_settle`/
  `deliver_second` (3 s) and `match_lead`/`gap_formation` (8 s) name none —
  the state verb or the lead's hundred carries the stay. Adjudicated.
- `trail`'s `leaderProgress:100` unnamed in instruction (receipt speaks "its
  hundred"); self-propels under keepMotion — cannot be failed by inaction.
  Adjudicated r4.
- `gapCross` within:60 ↔ "the gap": central ~120 WU of a ~175 WU pair is an
  accurate geometric name. Adjudicated r2.
- Qualitative speed/load bars ("dead slow" ≤2–5, "matched speed" rel≤8, "real
  line load" ≥0.35 = the HUD's smoothed read). Adjudicated conventions.
- Relay `near` steps don't re-require the latch (copy implies on-line carry) —
  bar looser than copy, safe direction; the `settled ≤5` tail still forces the
  stop. New observation, same adjudicated class as `match_lead`'s
  over-specification. No action.
- `step.subject` not role-validated at compile (`:723-728`); `stepAwait`
  steers `live.ids` one statement before eval; `roleGenerations` keyed by
  role; NaN player velocity reads 'gone' on `meet` — latent/unreachable or
  deliberate in the curated set, noted r2–r6.
- `displaced`'s baseline is the enterAwait snapshot — pre-offer prop-dragging
  raises the post-choice ask. Pre-existing corner, adjudicated r1.
- `livedSceneRequestData` skips `livedOverlay` for `livedRotation` entries
  (`livedWorldDirector.js:113`) — the authored instruction always transmits
  for the curated thirty; the overlay-substitution branch in `runVerb` say
  (`:522-525`) is unreachable for them. Confirmed live at HEAD.
- LANDED_REVIEW row R-9d65866 remains OPEN — its second-look queue is a
  separate surface from this consensus line; nothing in this pass changes it.
