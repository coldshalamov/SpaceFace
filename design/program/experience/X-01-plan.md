# X-01 plan — P2 first hour: make the salvage bay loop visible

Row §1P 559. Audit v2 (`X-01-audit.md`). Tribunal judge, 2026-10-24.

## Scores

| draft | crit-path | authentic | specific | cost | non-redundant | total |
|---|---|---|---|---|---|---|
| Skeptic (hazard-share pod) | 4 | 4 | 5 | 3 | 3 | **19** |
| Accountant (prove sale + line) | 4 | 3 | 4 | 5 | 3 | **19** |
| Drifter (stamp lawful `d.loot`) | 4 | 5 | 4 | 2 | 1 | **16** |

Drifter builds on the v1 claim that raids drop stolen goods. With `lootShards` on, `d.loot` is skipped (`combat.js:1098,1137`), so its loot stamp would never run. Skeptic's pod adds about 290 cr on top of a burst that already pays about 1k, shifts the first-dock fit offer, and opens an ownership edge that belongs to X-05. Rejected. Spliced in: Skeptic's honest remainder copy and the Accountant's "the line points at money already paid".

## Design

The loop already pays. The player just can't see it. We say it three times, once each, through voices that already exist:

1. **First bay fill** (onboarding hint): `Salvage is in the bay. Dock to cash it.` (8 words, one imperative.)
2. **First cash-in at dock** (onboarding hint, on top of the existing cash-in toast): `Bay paid out. Fight, fill, dock.` (6 words, one imperative chain.)
3. **344 defended comms** gets a tail: `…Hazard pay transferred. Their plate's in your bay — any dock pays.` The pinned `/Hazard pay transferred/` stays.
4. **Restricted-remainder toast** (`cargo.js:1225-1228`) stops pointing at a black market no first-hour player can reach: `Restricted salvage stays in your bay: ${restricted} units. Lawful docks won't buy it.` This is true at every dock. A contraband-tolerant dock already sells it via `salvageBaySaleAllowsIllicit` (`economy.js:521`), so no toast fires there.

Both hints are player-anchored. `hud.js:2194-2201` routes them to the ordinary receipt toast, so there is no HUD meter, no new DOM, and nothing for ORRERY to absorb.

## Exact changes

- `src/ui/hudAttention.js` `FIRST_USE_LINE` (:385). Add `firstSalvageBay` and `firstSalvageCashIn` with the copy above. Copy only. `firstUseAttachKind` already returns `'player'` for these keys.
- `src/systems/onboarding.js`, in the hint block near :750:
  - `bus.on('salvage:changed', p => { if ((p?.used|0) > 0) this._showHint('firstSalvageBay', firstUseLine('firstSalvageBay'), {}); })`
  - `bus.on('salvage:bayCashedIn', p => { if ((p?.credits|0) > 0) this._showHint('firstSalvageCashIn', firstUseLine('firstSalvageCashIn'), {}); })`
  - `_showHint` (:1127) returns *before* stamping the key while the rail owns the voice (:1134). A 344 kill inside the rail therefore speaks on the next post-rail fill or cash-in. That is the intended deferral.
- `src/systems/cargo.js` :1226. Change the restricted copy as above. Leave the "could not be valued" toast alone.
- `src/data/encounters/344-opening-hauler-raid.js` :337-341. Change the defended `text` tail only. `d.grant(250,'convoy:guard')` is untouched.
- Run `node scripts/extract-localization.mjs --write` to regenerate `en-US.generated.js`, which holds the old toast string.

## Numbers

None changed. Burst values, the 0.6× bay rate, and the 250 hazard pay are all as live today. Two hint keys persist in the existing `player.hints` map.

## Save / determinism

No draws, no clocks, no new state. `player.hints` gains two booleans through the existing schema, so no migration is needed. Sim digests (`test/47a.telemetry*.expected.json`) should hold, because hints and toasts are presentation and comms. If a digest hashes `player.hints`, re-record it with the reason "two first-use keys".

## Tests to add — `test/x01-salvage-bay-voice.test.mjs`

1. Rail finished. `addSalvage(state,'cmdty_scrap_metal',4)` produces exactly one `hud:firstUse` with `verbId 'firstSalvageBay'`. A second fill produces none.
2. Rail active. A fill produces no hint, and `hints.firstSalvageBay` stays unset. After the rail finishes, the next fill speaks.
3. A `dock:docked` cash-in with credits > 0 produces one `firstSalvageCashIn`. A second dock produces none. An empty-bay dock produces none.
4. A bay holding `cmdty_munitions` at a lawful dock gives a toast that matches `/Lawful docks won't buy it/` and does not match `/black market/i`.
5. 344 defended comms matches `/Hazard pay transferred/` and `/in your bay/`.

## Must stay green

`salvage-bay`, `infer-salvage-bay-reading`, `cargo-kill-salvage-sale-opportunity`, `first-hour-opening-choice`, `opening-hauler-raid-and-pursuit`, `m01-opening-raid-aftermath`, `starter-world-opening-raid-*`, `batch3-econ-workflows`, `localization-runtime`, `localization-reachability`, `check:player-facing-labels`, `node scripts/check-encounter-director.mjs`.

## Non-goals

- No HUD bay meter. That surface belongs to ORRERY.
- No new pod or gift, and no killRewards retune.
- No forced 344 attack. Teeth are X-02's.
- No market-sale conversion of the bay.

## Approvals

- plan-gate reviewer 4964e62b — APPROVE (2026-10-24)
- plan-gate reviewer fb54441e — APPROVE (2026-10-24)
- plan-gate reviewer 53f3e19e — APPROVE (2026-10-24) — plan✓3
