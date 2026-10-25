# X-04 plan — P2 first gate jump: the toll is part of the pay

Row §1P 562. Audit `X-04-audit.md` (audit✓3). Tribunal judge, 2026-10-24.

## Scores

| draft | crit-path | authentic | specific | cost | non-redundant | total |
|---|---|---|---|---|---|---|
| Skeptic | 4 | 4 | 5 | 4 | 4 | **21** |
| Accountant | 4 | 3 | 4 | 5 | 4 | **20** |
| Drifter | 4 | 5 | 4 | 3 | 3 | **19** |

**Verified:**
- Each toll is priced by the *destination's* security: `gateTollFor` (`travelChoices.js:15-17`) is applied to the target sector (`world.js:5815,7474`).
- Helios has security 0.98 and Ceres 0.72 (`sectors.js:54,281`). That makes the out leg 194, the home leg 246, and the round trip 440. The run pays 760 (`economyContractTemplates.js:346`).
- `gate:range` carries `gateTo` (`physics.js:1614-1619`).
- `jump:arrive` carries `sectorId` but **no `via`** (`world.js:5624-5628`). The Accountant's `via:'gate'` filter does not exist.
- Accepting the run ends the rail (`onboarding.js:1856-1857`), so every line below speaks off-rail through `_showHint`.

**Rejected:**
- The Skeptic and the Drifter both track tolls actually charged. That adds onboarding state for one line.
- A broke-at-gate grant would be an unpriced faucet (Accountant).

## Design — three one-shot lines + one remedy

All numbers are computed at speak time from `gateTollFor(sector)` and the active run's reward. None are literals. The run is `(state.missions.active||[]).find(m => m.source === FIRST_TRADE_CONTRACT_SOURCE)`. Completion payloads carry `source` (`missions.js:5101`).

1. **Gate approach** (`onboarding.js:741-745`, gate anchor).
   - Condition: run active, and `payload.gateTo === run.destSectorId`.
   - Speak `_showHint('firstGateToll', text, payload)` and also stamp `hints.firstGate = true`, so "Plot a jump." never follows it.
   - Otherwise the existing `firstGate` branch is unchanged.
   - Text: `Toll ${out} out, ${home} home. The run pays ${pay}. Jump.` That reads "Toll 194 out, 246 home. The run pays 760. Jump." (10 words, one imperative.)
2. **Arrival.** A new `bus.on('jump:arrive', p => …)`.
   - Condition: `p.sectorId === run.destSectorId` and the run is active.
   - Speak `_showHint('firstGateArrive', 'Ceres. Follow the Flare Rack to the refinery.', {})` (8 words). The Flare Rack is the authored worklight on the inbound leg (`sectorAnchors.js:109-116`, `poi_ceres_flare_rack`).
   - The hint is player-anchored, so it becomes a receipt toast (`hud.js:2200`).
3. **Paid.** In `_onMissionCompleted` (`:1863`), before the `dock` beat early-return:
   - Condition: `payload.source === FIRST_TRADE_CONTRACT_SOURCE`.
   - Speak `_showHint('firstTradePaid', \`Paid ${pay}. Keep ${home} for the gate home.\`, {})` (8 words).
   - `pay` comes from the payload's `rewardCr` (`missions.js:5107`) if present, else `FIRST_TRADE_CONTRACT.terms.paysCr`.
4. **Refusal remedy.** In `src/ui/jumpNotice.js:50`, change the string to `Gate toll ${needed} cr — purse holds ${held} cr. Earn it at a dock.` That is true everywhere: sell the hold or work the board. String only. The generic fallback at :51 stays.

**Fallthrough:** a run already abandoned, or an id mismatch, gives silence. A player who reached the gate before accepting heard `firstGate`. `firstGateToll` stays a separate key, so it can still speak on the next approach while holding the run.

## Exact files

- `src/systems/onboarding.js`: the gate handler branch, one `jump:arrive` listener, and the `_onMissionCompleted` hint. Imports `gateTollFor` from `../data/travelChoices.js` and `FIRST_TRADE_CONTRACT` (already imported partially, `:77`).
- `src/ui/jumpNotice.js:50`: one template.
- Run `node scripts/extract-localization.mjs --write`.

## Numbers

194 / 246 / 760 are the live values. Net +320 is pinned at `first-session-places.test.mjs:101-109`. The 30-minute target holds: the rail ends around 12:30 and the gate is about 4.2k wu out.

## Save / determinism

No draws and no credit flows. `player.hints` gains up to three booleans, plus `firstGate`, which already exists. The existing free-key bag needs no migration. Nothing changes in the sim, so no digest moves.

## Tests to add — `test/x04-first-gate-toll-line.test.mjs`

1. Run active and `gate:range {gateTo:'sector_ceres_belt'}` gives one `hud:firstUse` `firstGateToll` with text `Toll 194 out, 246 home. The run pays 760. Jump.` A second approach gives none, and `firstGate` never speaks after it.
2. No run gives the generic `firstGate` "Plot a jump.".
3. Run active but `gateTo` another sector gives the generic line.
4. Raising Ceres security in a fixture makes the line follow `gateTollFor`, which proves there are no literals.
5. `jump:arrive {sectorId:'sector_ceres_belt'}` with the run gives `firstGateArrive` once. No run gives silence.
6. Completion with `source:'firstTradeContract'` gives `Paid 760. Keep 246 for the gate home.` once.
7. `jumpAbortText({ reason:'credits', creditsNeeded:194, creditsHeld:120 })` (single payload object, `jumpNotice.js:34-36`) returns `Gate toll 194 cr — purse holds 120 cr. Earn it at a dock.`

## Must stay green

- **Re-pin deliberately:** `jump-verb-notice` at :38 and :267. The two exact strings gain the suffix, and the commit names the re-pin.
- **Must stay green:** `infer-p11-gate-remedy`, `first-trade-contract`, `first-session-places`, `galaxy-map-gate-jump-seam`, `inf-law-11-toll-footprint`, `first-hour-voice`, `first-hour-voice-priority`, `first-hour-alert-dedupe`, `check:player-facing-labels`, `localization-reachability`.

## Non-goals

- No forced jump and no rail beat.
- No toll rescue grant, no toll retune, no route lock.
- No new onboarding state for summing tolls.

## Approvals

- v1 APPROVE-with-corrections 4964e62b; v2 applies the three literal corrections (signature, line, rewardCr) — gate restarted
- v2: plan-gate reviewer abc98e75 — APPROVE (2026-10-24)
- v2: plan-gate reviewer cd65c632 — APPROVE (2026-10-24)
- v2: plan-gate reviewer 390312bc — APPROVE (2026-10-24) — plan✓3
