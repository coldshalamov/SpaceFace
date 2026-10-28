# Consensus review r6 — encounters packet 9d65866e15 + r1 76e554cd38 + r2 5cb383bdc8/5bf71a925e + r3 d199472d34 + r4 e6dfc71361 + r5 53ed0b13e4

Fresh-eyes pass (review counter reset after r5's finding landed). Re-read
`src/systems/vignetteInterpreter.js` in full (roleEnt generation guard, propEnt
'gone' semantics, every await step kind, enterAwait/stepAwait per-step state
resets, runVerb guards, hop, compile validation), all of
`scripts/build-lived-vignettes.mjs` RC459_STEPS/RC459_PROP_OFFSETS/
RC459_RECIPES/RC459_COPY/curatedChoiceRows/curatedReceipts, the r5 diff in full,
full reads of regenerated modules 410 and 429, and all five prior consensus
files for adjudication history. Independently re-derived every copy-vs-bar
claim across all 15 recipes rather than trusting the prior walks.

**Verdict: OPTIMAL — no actionable improvement.**

The r5 finding is fixed exactly: `RC459_COPY.gap_formation.instruction` now
reads "…then hold station sixty to a hundred-eighty off the lead while it makes
a hundred" (`build-lived-vignettes.mjs:956`), transmitted verbatim at
`410-…:129` and `429-…:125` — naming the same `min:60`/`max:180`/`leaderProgress:100`
bars `match_lead` names on the identical step spec. It even dodges `match_lead`'s
"off our bow" over-specification ("off the lead" is accurate for an any-side
band). With that line landed, every measured distance bar in the 15-recipe
instruction surface is spoken; nothing in the packet hides a gate from a literal
reader any more.

## Mandate answers

- **RC459_STEPS vs RC459_COPY, all 15 recipes walked independently:**
  - tow_settle (401/408): latched → displaced:120 → released → parked(hull_0, 30,
    ≤3, 3 s) ↔ "Tether…a hundred-twenty of drag before you let go — then cut it
    quiet, dead slow, inside thirty" (:908). All bars named; the 3 s hold rides
    on the state verb (adjudicated convention).
  - tow_clear (407/420): same chain ending settled(≤5, 2 s) ↔ "past the
    hundred-twenty mark, then cut it quiet — dead slow when the line comes off"
    (:914).
  - relay (409/414/421): near(prop→hull_0, 60) then near(prop→hull_1, 60) ↔
    "inside sixty of our hull first, then inside sixty of the far hull, in that
    order" (:920) — r4 fix verified live in all three modules.
  - park_tight (411/418/424/427): parked(20, ≤2, 4 s) ↔ "inside twenty…dead slow
    for a four-count" (:926).
  - clear_scav (413): clearOfActors(180) ↔ "a hundred-eighty clear of both their
    hulls — a hundred-twenty of line work at least — release, settle" (:932).
  - deliver_second (426): parked(hull_1, 30, ≤3, 3 s) ↔ "the second hull, not
    ours — a hundred-twenty of haul…park it inside thirty" (:938).
  - match_lead (403/423): formation(60–180, 8 s, lead-100) ↔ "sixty to a
    hundred-eighty off our bow while we make a hundred on the lead" (:944).
  - trail (406/416): trail(60–180, 6 s, rel≤8, lead-100) ↔ "sixty to a
    hundred-eighty, matched speed, six-count" (:950); lead-100 is self-clearing
    and receipt-named (adjudicated r4).
  - gap_formation (410/429): gapCross(60) → formation(60–180, 8 s, lead-100) ↔
    "Thread the gap…hold station sixty to a hundred-eighty off the lead while it
    makes a hundred" (:956) — the r5 fix; verified in both regenerated modules.
  - visit_ab (402/419) / visit_aba (404/415): visit ≤70 ×2/×3 ↔ "Enter each
    seventy ring" (:962) / "three separate seventy-ring entries" (:968).
  - sides (412/425) / toll_pass (536): oppositeSides(100–160, travel 120) ↔
    "cross a hundred-twenty through to the other, between a hundred and a
    hundred-sixty of us" (:974) / "cross a hundred-twenty past the hull to the
    far side, between a hundred and a hundred-sixty of us" (:992) — r2/r3 fixes.
  - inspect (405/428): meet(60, ≤5, 2 s) ↔ "inside sixty…dead slow for a
    two-count" (:980).
  - strain (417/422): strained(≥0.35, 2 s) ↔ "hold real line load a two-count"
    (:986) — the HUD's own smoothed number, adjudicated r2.
  - toll b-side: latched → displaced:120 → released → settled ↔ "tow our
    ${noun} a hundred-twenty clear" + bLine "cut it quiet" (:992/:997).
  - toll economics: charge_a 36 = aCost = label "Pay the count — 36 cr" =
    "thirty-six" prose — four placements consistent (:992-995).
  - depart(180/1000) on the decline branch ↔ "my hull is leaving" — fail-open
    decline path, adjudicated.
- **roleEnt generation guard: correct and load-bearing.** `roleEnt` rejects when
  `occupantGenerationOf(e) !== v.roleGenerations[role]` (`:39-41`); the snapshot
  binds at `enterAwait` (`:305-313`) only for bodies passing `subjectEnt`.
  Production stamps every spawn (`constructEntity` → `stampOccupantGeneration`);
  the `gen != null` gate accepts unstamped fixtures per the caller's-choice
  contract. The recycled-prop-id test still proves the guard (green).
- **gapCross: sound.** Both observations re-dotted onto today's segment
  (`:259-265`); sign flip requires the player's own displacement; the
  interpolated crossing must land on the segment (`rel ∈ [0,1]`) and within
  `within` of the midpoint (`:270-277`). The order-410 parked-player proof is
  green.
- **Regen parity:** `node scripts/build-lived-vignettes.mjs --row=459` → **0 of
  30 rewritten** — every landed module byte-identical to generator output at
  HEAD, which also proves all 30 transmit current copy (grep sweep confirms:
  "inside sixty" in 405/409/414/421/428; "seventy" in 402/404/415/419;
  "hundred-sixty" in 412/425/536; "hundred-eighty" in 403/406/410/413/416/423/
  429).
- **Regenerated modules 410/429 (full reads):** work_line carries the new band
  copy verbatim; steps are gapCross(hull_0,hull_1, within 60) → formation
  (60–180, holdS 8, leaderProgress 100); escort pair at (0,0)/(−150,90) ≈ 175 WU
  apart; keepMotion preserved on all three awaits; charge_b 24 before await_b;
  paid-lapse timeoutLine speaks the kept debit; depart(180/1000) on the decline;
  receipts, `livedRotation`, `livedPhysical.recipeId:'gap_formation'`,
  `hasProp:false` all coherent; noop phase-IDs preserved.
- **Tree state:** every audited file clean at HEAD; the dirty tree belongs to
  other lanes (ship manifests/render packages, other test files), untouched.

## Checks run

- `node --test test/rc-vignettes-459-4242.test.mjs test/lived-world.test.mjs
  test/depth-program-encounter-loader.test.mjs` — **33/33 pass** (~11 s),
  including the recycled-prop-id abort, the real Rapier massline tow, the
  parked-player gapCross proof, and the two-hour seeded route over all thirty
  curated scenes.
- `node scripts/build-lived-vignettes.mjs --row=459` — **0 of 30** rewritten.
- `git show 53ed0b13e4` — the r5 diff is exactly one copy line plus the two
  regenerated modules; `git diff e6dfc7..53ed0b` shows no other packet change;
  the interpreter itself is untouched since r1 (76e554cd38).

## Audit notes (previously adjudicated — recorded so they stay adjudicated)

- Shared sponsor-b `meet(60, ≤5, 2 s)` copy — "then close in slow" / "close your
  hull dead slow for the hand-off" (`:1007-1008`) — names no number. Four
  adjudications running (r3/r4/r5 + the owner's r5 fix deliberately left it):
  "close in" is a process verb with no false-completion state and the funded
  debit is acknowledged verbatim on lapse. Not raised.
- Hold-count convention: `park_tight` names "a four-count"; `tow_settle`/
  `deliver_second` (3 s) and `match_lead`/`gap_formation` (8 s) name none — the
  state verb or the lead's hundred carries the stay. Adjudicated.
- `trail`'s `leaderProgress:100` is unnamed in its instruction (the receipt
  speaks "its hundred"); the lead self-propels under keepMotion so the player
  cannot fail it by inaction — adjudicated r4.
- `gapCross` within:60 ↔ "the gap": central ~120 WU of a ~175 WU pair is an
  accurate geometric name — adjudicated r2.
- Qualitative speed/load bars ("dead slow" ≤2–5, "matched speed" rel≤8, "real
  line load" ≥0.35) — adjudicated conventions; the load number is the HUD's own.
- `step.subject` not role-validated at compile (`:723-728`); `stepAwait` steers
  `live.ids` one statement before eval; `roleGenerations` keyed by role —
  latent/unreachable in the curated set, noted r2–r5.
- LANDED_REVIEW row R-9d65866 remains OPEN — its second-look queue is a separate
  surface from this consensus line; nothing in this pass changes it.
- New observation, no action: 429's retained authored hail says "No passing."
  while its work_line assigns the gap crossing — hail is scene flavor (don't
  overtake the convoy), the work_line is the ask; coherent in-fiction and the
  convention r1–r5 audited under. Recorded so it stays adjudicated.
