<!-- LIFETIME: CAMPAIGN -->
# special-500 build log

Owner commission: 500 special in-game things. Debate phase (rounds 1-4,
ratified) produced `CONSENSUS_500.json`. Build phase status lives here.

## Landed

- `ebaea2ad5c1` — debate artifacts + ratified consensus (500 + 20 bench).
- `d47d91c9e61` — spine: `src/data/special500/` catalog + `src/systems/special500Director.js`
  wired into the registry; 5-entry vertical slice; `test/special500-catalog.test.mjs` (6 tests).
- `d6d4383ad19` — wave 1: 152 entries; director anchor-resolution + sector-scoping fixes.
- `3d7caf80ae4` — wave 2: 182 entries (339 total).
- `06f381a8c58` — waves 3-4: 161 entries. **Catalog complete: exactly 500.**
  Kind mix matches the ratified consensus exactly. SPECIAL500_COMPLETE=true.

## Runtime shape

500 entries, 7 trigger types (receipt 204, proximity 105, hashDaily 67,
calendar 58, sectorEntry 46, flag 15, simWindow 5), 6 channels (memory 254,
spectacle 127, comms 60, commsLog 48, news 11). One-time semantics persist as
`state.story.flags['special500.<id>']`; calendar-recurring entries re-arm per
40-day world year; memory/spectacle firings additionally record
`depthProgramEncounters.completed['special500.<id>']` for encounter-file gating.

## Gates

- `test/special500-catalog.test.mjs` — 6/6 green (schema, channels, calendar
  re-arm, sector-entry, proximity, hash stability, full-count).
- `check:baseline` — 26/27; `check:47a:physical-branches` timed out at budget
  under 4-way parallel contention, green on solo re-run (contention, not a
  product defect; the harness says as much).
- `player-truth --mode=adventure --gate` — **ENVIRONMENT (harness): served
  assets stale vs HEAD; browser not started; verdict text: "This is not a
  gameplay FAIL."** Cause: the ship render-package lane has in-flight asset
  regeneration on this box (8650 blobs checked, mismatched sizes in
  assets/ships/release/render-packages/). MUST RE-RUN the gate when the asset
  lane settles — the catalog changes no assets, but the default-route verdict
  is owed.

## Remaining (the deep-content phase)

- **335 entries carry `followup` markers** naming their bespoke mechanic leg
  (vendors, hidden caches that open, choice scenes, NPC spawns, counters).
  165 entries fire complete through the director as authored. The followup
  legs are the next batches: numbered encounter files in `src/data/encounters/`
  (1310+, build-encounter-index.mjs regenerates the index), mail rows in
  `src/data/mail.js` keyed to `special500:<id>` receipts, codex rows.
- Mail channel: director support exists (emits the receipt); letter rows land
  in the serial integration pass.
- Sector-scope caveat: sectors annotate triggers, but a `sectors`-bound entry
  only fires while the player is inside the listed sector (director applies
  this to every trigger type).
