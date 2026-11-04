<!-- LIFETIME: CAMPAIGN -->
# special-500 build log

Owner commission: 500 special in-game things. Debate phase (rounds 1-4,
ratified) produced `CONSENSUS_500.json`. Build phase status lives here.

## Phase 2 — build the 500 things the player encounters (opened 2026-11-04)

Owner direction: extend the campaign into its playable substance — 500 build
units, equally small/medium/large, INFERENCE-style, orchestrated by subagents
and landed on review. The decision, derivation and protocol live in
[`PHASE2_PLAN.md`](./PHASE2_PLAN.md); the per-agent contract is
[`PHASE2_BUILD_BRIEF.md`](./PHASE2_BUILD_BRIEF.md); the single status authority
is [`BUILD_LEDGER.json`](./BUILD_LEDGER.json) (regenerable by
`tools/derive-units.mjs`; preserves progress).

Derivation (2026-11-04, from live catalog truth): 330 ratified followup legs +
92 ratified spectacle-only + 14 dormant + 35 annex legs + 29 mail letters =
**500 units** (167 small / 167 medium / 166 large), 43 batches. Infra:
`INFRA-SPECTACLE-REGISTRY` (director emits `special500:spectacle`; presentation
registry + system so every spectacle leg lands as data). Pilot batch 1 (12
units, 6 families) dispatched; landed units will be recorded here per batch.

### Landed (Phase 2)

- `ab9b97e8196c` — INFRA spectacle registry + SP1-101 The Scheduled Ghost +
  SP3-127 The Echo Wreck (first two spectacle rows; templates lightFlash,
  echoRing, lampCascade, trafficAdvisory).
- `387fd003dde0` — SP2-172 The Tether Memorial's New Line + SP2-157 The Eris
  Last Pod (encounter legs 1310/1311; generated index carries a foreign worker's
  1400 module pending its owner's commit).
- `e28d9ac9e619` — pilot mail/codex slice: SP2-018, SP2-041 (+Rets bar contact),
  SP2-004 (durable scanner read found — no writer needed; rep branch deferred),
  SP2-112; ownedShips conjunct; mail occurrence rule gains 'flag'.
- `d2341bcb4999` — spectacle batch 5 (14 rows; new bellVoice template through
  the audio owner's existing cue seam) + concurrent loop-resurrection repair
  preserved into the landed owner.
- `99fbbf920f14` — mail batch 2 (14 letters; the serial mail pass opens).
- `cd41374aad19` — mail batch 3 (14 letters; 28 special500 letters live).

Running: pilot choice+vendor slice, spectacle batch 6, mail batch 4 (final 8).

## Phase 1 — the catalog (complete)

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
