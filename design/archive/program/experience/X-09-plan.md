# X-09 plan — per-cause death lessons, only where a real rung teaches it

Row §1P 567 (joint with ledger V-04). Audit `X-09-audit.md` (audit✓3). Tribunal judge, 2026-10-24.

## Scores

| draft | crit-path | authentic | specific | cost | non-redundant | total |
|---|---|---|---|---|---|---|
| Skeptic | 5 | 4 | 5 | 5 | 5 | **24** |
| Accountant | 5 | 3 | 4 | 4 | 3 | **19** |
| Drifter | 5 | 5 | 4 | 3 | 3 | **20** |

**Rejected: weapon → boost_keep_speed / you_can_run_dry** (Accountant, Drifter).
- `infer-b-world-teach.test.mjs:265-278` pins it: a weapon death from a contact gives `rangeOffer === undefined` and `ui.deathRangeOfferedRung === undefined`.
- `:368-378` pins the hidden death-screen offer as well.
- A weapon → boost/cap row would break both pins. Neither rung teaches surviving gunfire, so that offer would also be a lie.

**Spliced:**
- Skeptic: the honest table and the per-rung gate.
- Accountant: profile persistence in `player.hints`, because `state.ui` is session-only.
- Drifter: the house-voice lead-ins, on the new rows only.

## Cause → rung table (existing rungs only; `rangeRails.js` untouched)

Inputs come from values `buildDefeatReceipt` already computes:
- `physicalLabel`: `physicalWeaponLabelFromDamage`, `playerDefeat.js:90-142`
- `source.kind`: `defeatSource`, `:166-192`

| order | condition | rung (`rangeRails.js`) | line |
|---|---|---|---|
| 1 | `isSlackLineSnapDeath(lethal)` (unchanged, first) | `swing_do_not_pull` | `The Range can teach Swing, do not pull.` (byte-identical) |
| 2 | `physicalLabel === 'arena impact'` and `source.kind ∈ {self, environment}` | `stopping_takes_room` | `Came in hot. The Range can teach Stopping takes room.` (10 words) |
| 3 | `physicalLabel === 'hull ram'` and `source.kind ∈ {self, environment}` | `slip_a_gap` ("Touch nothing.") | `Clipped a hull. The Range can teach Slip the gap.` (10 words) |
| — | weapon, contact-caused ram or throw, hazard or gas, thrown mass, unknown | none | silence |

**Why these rows.**
- An arena impact the player caused is a failure to stop. The drill is "From flat out, stop before the wall line."
- A hull the player flew into is a failure to thread. The drill is "Thread the slot… Touch nothing."
- Anything a contact did to you is outplay, not carelessness, and no rung teaches it.

## Exact changes — `src/combat/playerDefeat.js`

1. Give `defeatRangeOffer(state, lethal, read = {})` an optional third argument, `{ physicalLabel, sourceKind }`.
   - The snap check runs first, as today. Without the read, behaviour equals today's, so existing callers are safe.
   - Add a frozen `DEFEAT_RUNG_ROWS = [{ label, sources, rungId, lead }]` for rows 2–3.
   - Add a generic `rangeRow(id)` that replaces `swingRangeRow` and keeps its `rangeRungIndex >= 0` guard. A missing rung id means no offer, never a throw.
2. **Gate per rung, not once ever.** A rung counts as offered when either of these holds:
   - `state.ui.deathRangeOfferedRung === rungId` (the legacy session string), or
   - `state.player?.hints?.['deathRung:' + rungId] === true` (profile).
   On offer, `buildDefeatReceipt` (`:518-524`) still writes `state.ui.deathRangeOfferedRung = offer.rungId` (the pinned mirror, `test:263`) and also sets `player.hints['deathRung:' + rungId] = true`.
3. `buildDefeatReceipt` passes `{ physicalLabel, sourceKind: source.kind }` into the call at `:518`.
4. Line format: `${lead ? lead + ' ' : ''}The Range can teach ${sentenceCase(row.rule)}.`. Snap has no lead, so its string is unchanged.

`gameOver.js:258-263,970-973` already renders any `rangeOffer.line`, so the frontend needs no edit.

## Numbers

At most three offers per profile, one per row. The rule is no repeats, and a second death by the same cause shows only the cost lines.

## Save / determinism

No draws. Up to three new `player.hints` booleans go into the free-key bag (`saveSystem.js:7444`), with no migration. Legacy saves have no keys, so they get each new lesson once. The swing lesson re-offers once after a reload on old saves, which is the current behaviour since `state.ui` is not saved. No sim digest changes.

## Tests to add (extend `test/infer-b-world-teach.test.mjs`, keep the existing TEACH-08 cases unchanged)

1. **Arena impact.** A terrain-collision lethal with `killerId null` gives `stopping_takes_room`, and the line is exactly `Came in hot. The Range can teach Stopping takes room.`. A repeat gives `undefined`.
2. **Hull ram.** A `collision_craft` lethal with `killerId === playerId` gives `slip_a_gap` once.
3. **Contact causes stay silent.**
   - A `collision_craft` lethal from contact id 9 gives no offer.
   - `massline_throw` from a contact gives no offer.
4. **Ordering.** After the terrain offer, a snap death still offers `swing_do_not_pull`. After the swing offer, a terrain death still offers `stopping_takes_room`.
5. **Profile persistence.** Copy `player.hints` into a fresh `state.ui = {}`; the same cause is not offered again.
6. **Robustness.** A `rangeRow` miss (fixture with the rung removed) returns `null` without throwing.
7. **Death screen.** `showDeath` renders the terrain line and does not push `'range'`.

## Must stay green

`infer-b-world-teach` (both TEACH-08 tests exactly as written), `sfq-b058-defeat-cause-readout`, `death-slide`, `damage-death-recovery`, `defeat-mercy`, `range-door-funnel`, `check:save-schema`, `check:player-facing-labels`, `localization-reachability` (run `extract-localization.mjs --write` for the two leads).

## Non-goals

- No rung appended or reordered.
- No weapon or hazard lesson.
- No death-screen layout change.
- No new save field outside `player.hints`.


## v2 amendment (after impl review aa34888a found the v1 rows dormant)

The v1 rows (arena impact → `stopping_takes_room`, hull ram → `slip_a_gap`) landed in 94909073cd and stay: they are correct
mappings but dormant until the player can take impact damage (a separate gameplay contract, not this row) — the code comment
on `DEFEAT_RUNG_ROWS` must say so plainly, and the impl note must not claim they fire today.

**Live lesson added — the dry-cap death.** In `defeatRangeOffer` (after the snap check, before the v1 rows):
- Condition: the lethal source is an NPC weapon (`source.kind` contact/weapon, `physicalLabel` empty), AND the player entity
  passed to `buildDefeatReceipt` has finite `capMax > 0` and `cap <= 0.05 * capMax` at death, AND the player fired a weapon
  within the last 10 s of sim time (read the existing last-fire stamp if one exists on the player/weapons state — find it;
  if none exists, use only the cap condition). Missing or non-finite cap → no offer (keeps the TEACH-08 weapon pin silent:
  its fixture carries no cap).
- Rung `you_can_run_dry`; line `Ran the cap dry. The Range can teach You can run dry.` (lead + the existing
  `sentenceCase(rule)` pattern, 10 words).
- Same once-per-rung gating (`ui.deathRangeOfferedRung` mirror + `player.hints['deathRung:you_can_run_dry']`).
- Tests: dry-cap weapon death offers it once; full-cap weapon death stays silent; missing cap stays silent; second dry-cap
  death silent; snap still wins over dry-cap; save round-trip of the hint. Keep TEACH-08 pins green.
- Non-goals: no player impact damage; no lesson for hazard deaths (no rung teaches them); no UI change.


## v3 amendment (after v2 gate REJECT 43750cd9)

- **Second live row — the dock-collar scrape.** `world.js:6269-6313` damages a hull in the pocket above a berth gate with
  `origin.kind 'dock_collar'` and no attacker (`source.kind 'environment'`, `physicalLabel` null). That is a player-caused
  failure to stop, and `stopping_takes_room` ("From flat out, stop before the wall line", `rangeRails.js:43`) teaches exactly
  it. Add the row `{ origin/context 'dock_collar', sources ['environment'] } → stopping_takes_room`, lead `Came in hot.`
  (same line as the dormant arena-impact row, which shares the rung — the once-per-rung gate means whichever fires first
  spends it). This row fires today.
- **Dry-cap condition named exactly:** `source.kind === 'contact'` (there is no `'weapon'` kind — `playerDefeat.js:165-192`);
  `'unknown'` (despawned attacker) stays silent — accepted under-coverage. No sim last-fire stamp exists, so the condition
  is cap-only (`cap <= 0.05 * capMax`, finite `capMax > 0`); a module-drain dry cap also offers it, and "Ran the cap dry"
  is still true then. Pass `cap`/`capMax` through the existing `read` bag that `buildDefeatReceipt` hands `defeatRangeOffer`.
- **Not taught (no honest rung):** gas, reactor burst, debris disc, radiation, acid, mines, bombs, charges, status DoT.
- Tests add: a dock-collar death offers `stopping_takes_room` once; a dock-collar death after an arena-impact offer of the same
  rung is silent; `unknown`-source dry-cap death is silent.

## Approvals

- plan-gate reviewer 4964e62b — APPROVE (2026-10-24)
- plan-gate reviewer fb54441e — APPROVE (2026-10-24)
- plan-gate reviewer 53f3e19e — APPROVE (2026-10-24) — plan✓3 (v1)
- v1 impl landed 94909073cd; impl review aa34888a: v1 rows dormant (player takes no collision damage)
- v2: amendment above — gate restarted
- v2: 8c48fec7 APPROVE, 7a171a19 APPROVE, 43750cd9 REJECT (missed the live dock-collar cause; contact vs weapon kind)
- v3: amendment above — gate restarted
- v3: plan-gate reviewer cd4a5e75 — APPROVE
- v3: plan-gate reviewer f6a502f4 — APPROVE
- v3: plan-gate reviewer 0ee7d530 — APPROVE — plan✓3 (note: pass origin/context and cap/capMax through the read bag at playerDefeat.js:560)
