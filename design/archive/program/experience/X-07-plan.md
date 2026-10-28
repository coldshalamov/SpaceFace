# X-07 plan — mining payoff: the peg stops banking, the clean cut gets a name

Row §1P 565. Audit `X-07-audit.md` (audit✓3). Owner ruling 2026-09-21 binds (`mining.js:192-198`). Tribunal judge, 2026-10-24.

## Scores

| draft | crit-path | authentic | specific | cost | non-redundant | total |
|---|---|---|---|---|---|---|
| Skeptic | 4 | 4 | 5 | 4 | 4 | **21** |
| Accountant | 4 | 4 | 5 | 5 | 4 | **22** |
| Drifter (cook decay) | 4 | 5 | 4 | 3 | 3 | **19** |

The Drifter's `−0.5 depth/s pegged` decays a banked bonus — forbidden by the ruling and pinned at `mining-beam-heat-no-lockout.test.mjs:149`; only its one-time hints survive. Core: the Accountant's stop-accrual and `clean` field; name: the Skeptic's HUD word.

## Verified mechanism

- `_pulseOre += delivered` runs every player tick with no heat check (`mining.js:1173-1177`).
- `_resolveVent` pays `floor(pulseOre · 0.75 · depth)` and resets (`:902-944`).
- `_updateBeamHeat` clamps at `heatMax` and never gates extraction (`:843-899`).

## Design (sim — `src/systems/mining.js`)

1. **Pegged flag from the start of the tick.**
   - In `_updateBeamHeat`, after `prev` is read, set `this._beamPegged = working && prev >= heatMax`.
   - While pegged, also run `this._pulsePeggedS += dt`.
   - Using `prev` means the tick that *reaches* the peg still banks.
   - Reset both wherever `_pulseOre` resets (`:270, :299, :906, :949`).
2. **Accrual stops at the peg.**
   - At `:1175`: `if (!this._beamPegged) this._pulseOre += delivered;`
   - Target and commodity bookkeeping stays unconditional.
   - Extraction, cooling and the band are untouched.
   - What was banked before the peg still pays at depth 1. Nothing is forfeited or decays.
3. **Clean cut, as data.**
   - In `_resolveVent`, compute `clean = depth >= 0.85 && this._pulsePeggedS === 0`. Read `_pulsePeggedS` before resetting it.
   - Add `clean` and `peggedS` as additive fields on the `mining:ventBonus` payload.

## Design (voice)

- **`src/ui/miningHud.js`.**
  - Subscribe to `mining:ventBonus` next to `heatChanged` (`:206/:219`).
  - On `clean`, set `dom.word.textContent = 'CLEAN CUT'` for 1.2 s, then restore `seamWordFor(last)`.
  - Text only, in the existing word slot. No class, token or layout change, so it stays ORRERY-consistent.
- **`src/systems/onboarding.js`.** One `mining:ventBonus` listener with two one-time lines:
  - first `clean` → `_showHint('miningCleanCut', 'Clean cut. Let go before the peg.', {})`
  - first vent with `peggedS >= 1` → `_showHint('miningPegged', 'Pegged beam stops banking. Let go in the amber.', {})`

## Numbers (mk1: heat 22/s, cool 55/s, max 100, band 0.62; peg at about 4.5 s of a 13 s rock)

| style | bonus per rock | rock-equivalents per beam-second |
|---|---|---|
| hold to empty (one pegged release) | 0.75 × 4.5/13 ≈ **+26 %** | 1.26/13 ≈ 0.097 |
| rhythm: release ~95, re-press ~60 (1.6 s on / 0.6 s off, depth 0.87) | ≈ **+65 %** | 1.65/17.9 ≈ 0.092 |

Per rock, rhythm now pays about 31 % more. That matters because seams and rocks are finite, and it sits on top of seam aim's ~3× (`:168-169`). Per beam-second the two styles are about level, so the peg stops being the dominant play and becomes a choice: fill fast, or fill rich. There is no lockout and no slow cooling.

The clean threshold is 0.85 depth, which is heat ≥ 0.943 before any peg. That is a top-of-band release a flying pilot can hit, not a frame-perfect one.

## Save / determinism

No draws. `_beamPegged` and `_pulsePeggedS` are system-local and unsaved. Pegged holds pay less bonus, so mining digests shift. Re-record deliberately with the reason "peg stops banking (owner lever)": `inf-mine-heat-4242`, and any `first-hour-economy-floor` or `rc-458-first-half-hour` credit band a holding scripted pilot crosses. If a floor fails, retune the pilot to vent. Never retune the economy.

## Tests to add — `test/x07-peg-stops-banking.test.mjs`

1. **Peg stops accrual, never shrinks the bank.** Release at the first peg tick and record the bonus B. Then hold 10 s more and release: the bonus equals B within ±1 u, and it is never less.
2. **Pegged extraction is full rate.** The per-tick `oreHP` delta while pegged equals the pre-peg delta.
3. **Clean cut.**
   - Release at heat 0.95, never pegged: `clean === true`, depth ≥ 0.85.
   - Pegged for one tick, then release: `clean === false`, `peggedS > 0`.
   - Release at 0.70: `clean === false`.
4. Mining drones never bank (existing exclusion, `:1173`).
5. **HUD.** `ventBonus {clean:true}` sets the word to `CLEAN CUT`, and it reverts after 1.2 s of sim time.
6. **Onboarding.** Each hint fires once and stays silent while the rail is active.

## Must stay green (unchanged)

- `mining-beam-heat-no-lockout`, all three cases. `:149` still sees qty ≥ 2 at depth 1 from about 4.5 s of banked ore.
- `mining-hud-three-rhythms`, `mining-beam-pod-split-f12`, `metallic-ore-mining`, `mining-first-player`, `npc-starter-seam-mining`, `salvage-vent-core`, `drone-mining-contact`, `check:player-facing-labels`.

## Non-goals

- No lockout, no slowed radiator, no forfeit or decay.
- No retune of heat, cool, band or bonus max.
- No new HUD element.

## Approvals

- plan-gate reviewer 4964e62b — APPROVE (2026-10-24)
- plan-gate reviewer fb54441e — APPROVE (2026-10-24)
- plan-gate reviewer 53f3e19e — APPROVE (2026-10-24) — plan✓3
