<!-- LIFETIME: CAMPAIGN -->
# special-500 catalog authoring brief

You author ONE batch of ratified consensus entries into ONE pure-data module.
The owner commissioned 500 special in-game things; the ratified list is
`CONSENSUS_500.json` (three-lens debate, round-4 ratification). The runtime
spine is live and committed.

## Read first, in order

1. `src/data/special500/index.js` — entry schema, vocabularies, validation.
2. `src/data/special500/entries.js` — the vertical slice (style/register).
3. `src/systems/special500Director.js` — what triggers and channels do at runtime.
4. `src/data/special500/entries-comms-a.js` (or any landed wave-1 batch) — mass-authoring register.
5. Your entries: `node --input-type=module -e` to extract your ids from
   `CONSENSUS_500.json` (fields: id, title, kind, where, trigger, sees, payoff,
   seam, effort, hones, mergedFrom). Apply every hones directive; fold every
   mergedFrom into the surviving entry.

## Output

One file `src/data/special500/entries-<batch-suffix>.js` exporting
`export const ENTRIES_<NAME> = [ ... ];` — pure data, no imports, no edits to
any other file, no commits.

## Schema per entry

`{ id, kind, title, sectors, trigger, recurring?, channel, payload, followup? }`

- `id` must equal the consensus id, exactly once.
- `sectors`: only real ids. `SECTORS` in `src/data/sectors.js` assembles core +
  frontier packs — check `src/data/frontierRegions/*.js` too. 'any sector' → `[]`.
  If the consensus names a sector that does not exist, remap to the nearest real
  one and record the remap in a file-header comment (wave-1 precedent:
  Phoebe Echo → sector_io_reach, Triton Wake → sector_charon_expanse).
- Sector scoping applies to EVERY trigger type at runtime (a sectors-bound entry
  fires only while the player is in that sector). Choose sectors accordingly.

## Trigger mapping (deterministic only — state.simTime / state.rng-hash / proximity / receipts / flags)

- 'sim-time, day N, once/recurring, watch, bell' → `{ type:'calendar', dayOfYear: 1-40, windowS:[a,b] }`
  (world day = 600 s; window inside it; `recurring: true` when the text repeats).
- 'first entry / on arriving' → `{ type:'sectorEntry' }`.
- 'near station/poi X' → `{ type:'proximity', nearStation:'<id>', wu }`. Anchors
  resolve via entity `data.stationId` / `data.poiId` — use real ids from
  sectors.js (stations[].id) or place registrations.
- 'after the player does X' → `{ type:'receipt', event }` ONLY with an event name
  you verified exists (grep `bus.emit(` in src/systems). Verified examples:
  `combat:kill`, `scan:completed`, `poi:discovered`, `rescue:started`,
  `distress:call`, `dock:docked`, `gate:verdict`, `economy:tradeCompleted`,
  `law:fineAssessed`, `calendar:marketDay`, `drill:chargeBlast`,
  `claim:convoyDocked`, `salvage:communicatorFound`, `aceMemory:*`,
  `story:*`. Stat-gate prose (counts, streaks) maps to the nearest verified
  causal event, never an unconditioned chance roll.
- 'seeded chance / rare' → `{ type:'hashDaily', chance }`.
- chained follow-on → `{ type:'flag', requires:'special500.<id-or-flag>' }`.
- fixed save-age window → `{ type:'simWindow', startS, endS }`.

## Channel mapping

- `comms` — addressed popup (payload `{from, text, ttl?}`).
- `commsLog` — ambient band line (`{from, text}`).
- `news` — sector wire (`{text, kind}`).
- `memory` — silent record; use when the core is bespoke-interactive, plus
  `followup: '<one line naming the mechanic>'`.
- `spectacle` — the noticing line for a visual/audio moment; the renderer leg is
  a later batch keyed on the same memory receipt.
- NEVER `mail` (mail rows land in a serial integration pass).

## Text quality is the job

The payload lines are what the player reads. Game voice: gritty lived-in
working space, dry wit, physics-as-spectacle; forecastable by an attentive
pilot; no memes, no external IP. Calibrate against 2-3 files in
`src/data/encounters/` and the wave-1 batches. Comms lines 1-3 sentences;
news in wire style.

## Self-verify (all must pass before you report)

1. `node --check <your file>`
2. `node --input-type=module -e` — import your array + `validateSpecial500`
   from `./src/data/special500/index.js`; zero problems; length equals batch
   id count; ids match the batch exactly.
3. Grep your file for `sector_` ids and spot-check three against sectors data.
