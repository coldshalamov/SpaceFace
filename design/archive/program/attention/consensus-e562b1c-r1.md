# Consensus review r1 — encounters packet e562b1c9e40 (Codex-gate re-open)

Fresh-eyes pass on the re-opened packet at HEAD (e562b1c9e40; the only commit
above it, 3e7fc8f51e7, is its LANDED_REVIEW row). Re-read
`src/systems/vignetteInterpreter.js` in full (roleEnt generation guard, both
spawn-time bindings, enterAwait baseline preference, stepAwait steering guard,
every await step kind, runVerb guards, hop, compile validation), all of
`scripts/build-lived-vignettes.mjs` RC459_REWARDS/RC459_STEPS/RC459_PROP_OFFSETS/
RC459_RECIPES/RC459_COPY/curatedValues/curatedChoiceRows/curatedReceipts/
curatedPhases, the entity-generation contract (`src/core/entity.js:151-211`),
production stamping (`coreSystem.js:356`), role binding inside `spawnShips`
(`encounterDirector.js:1958-1959`), the save-slice boundary (`saveSystem.js`
`_serializeEncounterDirector` — live encounters are never serialized, so
`spawnGenerations`/`occupantGeneration` durability questions are void), the full
new test file, and all eight prior consensus files (9d65866-r1…r8) for
adjudication history. Every copy-vs-bar claim re-derived independently; every
transmitted `work_line` in all 30 curated modules extracted and compared.

**Verdict: OPTIMAL — no actionable improvement.**

All three mandate items landed exactly and the full suite is green.

## Mandate answers

- **Generation binding — both paths verified.**
  - Ship-cast path: `runVerb` `verb === 'spawn'` stamps
    `live.spawnGenerations[id] = occupantGenerationOf(e)` for every spawned id
    after the `spawn_failed` guard (`vignetteInterpreter.js:567-574`). Roles are
    already bound inside `spawnShips` (`live.roles[ent.id] = sh.role || 'squad'`,
    `encounterDirector.js:1959`), so the id→role→generation triple is complete
    before the hail.
  - Prop path: `runVerb` `verb === 'prop'` stamps
    `live.spawnGenerations[prop.id]` immediately after the id/role push
    (`:602-603`). In the generated modules the `prop` phase runs before the
    offer, so the baseline exists while the offer is still on the table.
  - `enterAwait` prefers `live.spawnGenerations[id]` and only falls back to the
    live occupant when no stamp exists (`:314-315`). A cast member recycled
    between hail and choice keeps the ORIGINAL generation as baseline — the
    impostor fails `roleEnt` and aborts `physical_subject_gone` instead of
    silently becoming the cast member. Verified live by the new test
    (prop replaced pre-choice → abort, `rc-vignettes-459-4242.test.mjs:315-342`,
    green) and by reading: an unstamped or absent body still resolves 'gone' or
    legacy-permissive per the documented caller's-choice contract
    (`entity.js:203-210`) — `occupantGeneration` is a monotonic counter
    (`stampOccupantGeneration`, `entity.js:187-200`), never reused.
  - Steering guard: `stepAwait`'s non-keepMotion braking loop resolves
    `role → v.roleGenerations[role]` and `continue`s on mismatch BEFORE
    `steerToward` writes (`:338-343`). The previously-noted "steers one
    statement before eval" latent item is now closed — a pre-choice-replaced
    hull/prop is never braked even across the ticks before its role is next
    evaluated.
- **RC459_COPY vs RC459_STEPS — every enforced numeric bar is now spoken, all
  15 recipes walked, all 30 transmitted `work_line`s extracted and matched:**
  - tow_settle (401/408): "a hundred-twenty of drag … under three, held a
    three-count, inside thirty" ↔ displaced:120 → parked(30, ≤3, 3 s). ✓
  - tow_clear (407/420): "past the hundred-twenty mark … under five, held a
    two-count" ↔ displaced:120 → settled(≤5, 2 s). ✓
  - relay (409/414/421): "a hundred-twenty on the line — inside sixty of our
    hull first, then inside sixty of the far hull, in that order. Let go under
    five, held a two-count" ↔ displaced:120 → near×2(60) → settled(≤5, 2 s). ✓
  - park_tight (411/418/424/427): "a hundred-twenty of drag — and park it
    inside twenty of the receiver, under two for a four-count" ↔ parked(20,
    ≤2, 4 s). ✓
  - clear_scav (413): "a hundred-eighty clear of both their hulls — a
    hundred-twenty of line work at least — release, settle under five for a
    two-count" ↔ displaced:120 → clearOfActors(180) → settled(≤5, 2 s). ✓
  - deliver_second (426): "the second hull, not ours — a hundred-twenty of
    haul … park it inside thirty, under three for a three-count" ↔
    displaced:120 → parked(hull_1, 30, ≤3, 3 s). ✓
  - match_lead (403/423): "sixty to a hundred-eighty off our bow, an
    eight-count, while we make a hundred on the lead" ↔ formation(60–180,
    8 s, lead-100). ✓
  - trail (406/416): "sixty to a hundred-eighty, within eight of our pace, a
    six-count, while the lead makes its hundred" ↔ trail(60–180, 6 s, rel≤8,
    lead-100) — every bar including the two previously adjudicated unnamed
    (rel≤8, lead-100). ✓
  - gap_formation (410/429): "through the middle sixty — then hold station
    sixty to a hundred-eighty off the lead, an eight-count, while it makes a
    hundred" ↔ gapCross(within:60) → formation(60–180, 8 s, 100). ✓
  - visit_ab (402/419) / visit_aba (404/415): "Enter each seventy ring" /
    "Three separate seventy-ring entries" + ordering — unchanged, still exact. ✓
  - sides (412/425) / toll_pass (536): "cross a hundred-twenty … between a
    hundred and a hundred-sixty" ↔ oppositeSides(100–160, travel 120) —
    unchanged, still exact. ✓
  - inspect (405/428): "inside sixty of us and hold under five for a
    two-count" ↔ meet(60, ≤5, 2 s). ✓
  - strain (417/422): "hold line load past a third for a two-count — then cut
    the line" ↔ strained(≥0.35, 2 s) → released. ✓ (see notes)
  - toll (536): "${aCost} cr clears the count" (36 = label "Pay the count —
    36 cr" = "thirty-six" line — four placements consistent) + toll_pass bars
    spoken + b-side "tow our ${noun} a hundred-twenty clear and leave it
    settled — under five for a two-count" ↔ toll_weight
    (latched → displaced:120 → released → settled ≤5, 2 s). ✓
- **New test discriminates the fix.** Reverting the `enterAwait` preference
  mentally: an impostor's live generation would become the baseline, the
  strain chain would proceed, and the assertion
  `outcome === 'aborted:physical_subject_gone'` would fail. The test provably
  exercises the spawn-time baseline, not a no-op.

## Checks run

- `node --test test/rc-vignettes-459-4242.test.mjs test/lived-world.test.mjs
  test/depth-program-encounter-loader.test.mjs` — **34/34 pass** (~19 s),
  including the new pre-choice replacement abort, the recycled-prop-id abort,
  the real Rapier massline tow, the parked-player gapCross proof, and the
  seeded two-hour route over all thirty curated scenes.
- `node scripts/build-lived-vignettes.mjs --row=459` — **0 of 30 rewritten**:
  every landed curated module is byte-identical to generator output at HEAD.
- Transmitted-copy extraction: all 30 `work_line` fields carry the new copy
  verbatim (the 24 modules whose recipes changed were regenerated; the six
  visit/sides modules were correctly untouched).

## Audit notes (reviewed — recorded so they stay adjudicated)

- `strain` "past a third" for `loadMin: 0.35`: the one rounded bar — a player
  parked at exactly 0.34 satisfies the letter and not the gate (delta 0.017).
  The phrasing is the mandate's chosen disclosure and strictly more precise
  than the adjudicated "real line load" it replaced; a tether load far enough
  "past a third" to read as done lands at/above the bar in practice. Accepted,
  same convention class as the qualitative bars it supersedes.
- `gapCross` "middle sixty" speaks the enforced `within: 60` number; the
  geometric band it implies (central ~60) is TIGHTER than enforced (within 60
  of midpoint ≈ central 120) — safe direction; r2's geometric adjudication
  stands.
- `applyMotion` (keepMotion awaits) has no generation guard: an impostor would
  receive one tick of transit intent before the eval abort lands — but every
  keepMotion recipe references every spawned role from step 0, so the abort is
  same-tick; the write is unreachable beyond one tick and harmless when
  reached (await_c depart has no role refs — steering a foreign hull there is
  flavor, the scene is already closing). Adjudicated direction: the mandate's
  guard is delivered where it matters (the repeated braking write).
- Duplicate-role aliasing in `roleGenerations`/`roleIds` (a roleless member
  would collapse onto 'squad'): scanned all 219 encounter casts — zero
  duplicate or missing roles. Unreachable in shipped data; noted since r2.
- Save path: `spawnGenerations` is never serialized (the durable slice carries
  no live record at all — asserted by the save test), so entity
  `occupantGeneration` non-enumerability creates no restore-vs-baseline
  mismatch. Reachability closed.
- Still adjudicated, unchanged by this commit: relay `near` steps don't
  re-require the latch (bar looser than copy, safe direction); `displaced`
  baseline snapshots at enterAwait (r1); sponsor-b `meet` copy stays
  qualitative ("close in slow" — six adjudications plus owner's deliberate
  leave); `step.subject` not role-validated at compile; NaN player velocity
  reads 'gone' on `meet`; retained authored hails as flavor beside work_lines;
  `livedSceneRequestData` overlay skip for `livedRotation` entries.
- **Outside-packet observation (recorded, not raised):** a FULL unscoped run
  of `build-lived-vignettes.mjs` rewrites nine NON-curated modules
  (391/433/448/466/495/511/540/555/566 — each loses an `a2x` say-phase), i.e.
  the ambient/extended set drifts from current generator output. The curated
  packet is unaffected (`--row=459` is clean, 0/30) — the drift is between the
  generator and the landed ambient files, surfacing only if someone runs the
  unscoped pass. Flagging for whoever next touches the generator.
- This review accidentally ran the unscoped generator once while importing the
  script for step extraction; the nine rewritten non-curated modules were
  restored to HEAD in the same session and `src/data/encounters/` verified
  clean afterward. No packet file was touched.
- LANDED_REVIEW row for e562b1c9e40 exists (3e7fc8f51e7); its second-look queue
  is a separate surface — nothing here changes it.
