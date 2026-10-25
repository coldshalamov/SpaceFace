# X-06 plan — per-sector bark banks that name places you can fly to

Row §1P 564 (joint with ledger V-01). Audit `X-06-audit.md` (audit✓3). Tribunal judge, 2026-10-24.

## Scores

| draft | crit-path | authentic | specific | cost | non-redundant | total |
|---|---|---|---|---|---|---|
| Skeptic (sector overlay, promise test) | 4 | 5 | 5 | 4 | 4 | **22** |
| Accountant (sector×faction schema, 60 lines) | 4 | 3 | 4 | 4 | 4 | **19** |
| Drifter (in-joke banks) | 4 | 4 | 4 | 4 | 4 | **20** |

What was spliced from each draft:
- **Skeptic:** the rule "every line names a real place" and the promise test.
- **Accountant:** the sector×faction key, so the faction keeps its voice. The bank is trimmed to the two first-hour sectors, because Tethys and Vesta are not P2.
- **Drifter:** the placement in the `_speak` chain, `patrol-greeting` only.

What was rejected:
- The Drifter's "Berth Four/Six". Those berths are vapor; no such places exist.
- The Skeptic's second selection site, the pass-by path. One link in the chain is enough.

All place names below were verified against `sectors.js` POI `name` fields and `kettleLine.js:26`.

## Design

**Data (`src/data/barks.js`).** Add after `MAERA_FLIGHT_LINES`:
- `SECTOR_PATROL_GREETINGS = Object.freeze({ [sectorId]: { [factionId]: [{ text, place }] } })`
- `sectorBarkFor(sectorId, factionId, index)`. It returns `null` for a missing cell and otherwise `cell[index % cell.length].text`.

`BARKS` and `BARK_SITUATIONS` are untouched, so the WAV index contract (`:51-60`) holds. These are text plus the radio blip, as history and trophy lines already are.

**Selection (`src/systems/barkDirector.js` `_speak`, :1085-1089).** Insert one link after `trophy` and before `barkFor`:

```js
: (situation === 'patrol-greeting'
   && (hash32(seed ?? 0, 'barkDirector:sector', entityId) & 1) === 0
   && sectorBarkFor(state.world?.currentSectorId, factionId, index))
   || barkFor(factionId, situation, index)
```

History and trophy still win. The ambient gap clock (`:3267-3286`, 12 s base, +12 s per quiet step) still rations every line. This is substitution, not more chatter.

## Lines (≤12 words, place named verbatim)

**`sector_helios_prime` · `faction_scn`**
- Checkpoint Niner reads every manifest twice. File clean.
- Procession's walking past Smear Marker 7. Give it room.
- The Pit Line bearing isn't for sightseers. Hold your lane.

**`sector_helios_prime` · `faction_scn`** (continued — v3 re-key: the two `faction_mts` cells were dead because passing traffic takes the sector's own faction (`traffic.js:1837` etc.) and convoys the station's (`trafficConvoyOps.js:80,345`); Helios stations are SCN-only (`sectors.js:63,68`), Ceres DMC-only (`sectors.js:294,303`), so every line now sits under the faction that actually hails there — six lines per cell)
- Helios Weigh-Point counted the raid twice. Nobody pays for the second.
- Helios Bay 7 runs cold. Don't ask what's in the lockers.
- Shift Bell 3 rang early. Somebody's getting docked pay.

**`sector_ceres_belt` · `faction_dmc`**
- Inbound Weigh Pin says eighteen minutes. It lies on bad shifts.
- The Kettle Line's shedding off the gate approach. Mind your drift.
- Second Measure Shipbreak's paying by the plate. Bring a cutter.

**`sector_ceres_belt` · `faction_dmc`** (continued — v3 re-key, see above)
- Follow the Refinery Flare Rack in. The scale pays honest.
- Belt Outpost buys ore. Ceres Refinery buys better. Fly the extra.
- Wreck Cathedral's lit again. Insurers want nobody near it.

## Numbers

- **About half of eligible greetings come from the bank.** Selection is a 1-in-2 hash split per entity, so the faction corpus keeps half the airtime and a hull's line is stable for the seed.
- **Three lines per cell.** That covers a first-hour sector visit before repeats under the 12→60 s gap.

## Save / determinism

`hash32` is pure and there is no `state.rng` draw. Director state stores `said[situation]`, never text. Sim digests and saves are unchanged. Seeded Helios patrol-greeting *text* changes for about half the hulls. If a fixture pins bark text, re-pin it deliberately with the reason "sector bank".

## Tests to add — `test/x06-sector-barks.test.mjs`

1. **Promise test.**
   - Every entry's `place` is a POI `name` in that sector's `sectors.js` row. For Ceres, `KETTLE_LINE.title` also counts.
   - Every `text` includes its `place`.
2. Every `text` is at most 12 words.
3. `sectorBarkFor` returns `null` for an unknown sector or faction. In `_speak`, a null result falls through to `barkFor`.
4. The same seed and entity id give the same line across two directors.
5. Over 1,000 ids, the sector share is 50 % ± 10 %.
6. Situations other than `patrol-greeting` never draw from the bank. A faction with ace history still speaks its history line.

## Must stay green

`bark-director-quiet-latch`, `demo-bark-acceptance`, `encounter-barks`, `fb-091-ambient-admission-slice`, `infer-p12-bark-coalesce`, `deep-faction-voice`, `content-variety-append`, `exp-01-helix-barks-4242`, `distress-bark`, `first-hour-voice-priority`, `first-session-places`, `check:player-facing-labels`, `localization-reachability` (run `extract-localization.mjs --write`).

## Non-goals

- No new channel, director or rate limit.
- No WAV generation and no `BARKS` cell edits.
- No banks for sectors beyond Helios and Ceres.
- No duplication of Maera's Helios `sector:enter` line.

## Approvals

- v1 APPROVE-with-nit 4964e62b; v2 fixes the place name (Ceres Refinery) — gate restarted
- v2: abc98e75 APPROVE, 390312bc APPROVE, cd65c632 REJECT (faction_mts cells unreachable in Helios/Ceres)
- v3: re-keyed to the sector-owner factions (scn Helios, dmc Ceres); the data shape is still `SECTOR_BARKS[sector][faction][situation]` so a later sector can key other factions — gate restarted
- (pending)
