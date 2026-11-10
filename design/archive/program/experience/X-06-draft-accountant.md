# X-06 draft — The Accountant

## Schema

`src/data/barks.js` is pure data, and `barkFor` (`:935`) is deterministic.
`barkDirector._speak` (`barkDirector.js:1064`) picks by
`hash32(seed,'barkDirector',entityId,situation)` (`:1075`) with no `state.rng` draw. No new system,
channel or rate limit.

## Proposal

1. **Data.** Add `SECTOR_BARKS[sectorId][factionId][situation] → string[]` to `barks.js`. It is
   keyed by faction too, so Concord stays procedural and Drift stays tired: the sector gives the
   noun and the faction gives the voice. Each line names a real placed thing (the Kettle Line,
   RU-7, Checkpoint Niner) and never vapor.

   | sector | factions |
   |---|---|
   | `sector_helios_prime` | `faction_scn`, `faction_mts` |
   | `sector_ceres_belt` | `faction_dmc`, `faction_mts` |
   | `sector_tethys_junction` | `faction_scn` |
   | `sector_vesta_forge` | `faction_dmc` |

   Each cell holds 6 `patrol-greeting` and 4 `scan` lines, about 60 in all.
2. **Selector.** `sectorBarkFor(sectorId, factionId, situation, index)` returns `null` when the
   cell is missing and reuses `pickIndex`.
3. **Director.** In `_speak`, when there is no history or trophy line and
   `(hash32(seed,'barkDirector:sector',entityId,situation) & 1) === 0`, try the sector cell.
   Fall back to `barkFor`.

## Numbers

Half of the eligible lines come from the sector bank. The ambient clock is unchanged at 12 → 60 s
(`:72-73,347`), so a quiet sector hears a sector line about every 1–2 min. This is **substitution, not more chatter**, so voice-arbiter load is identical. History and trophy
lines still win. Maera's Helios `sector:enter` line (`barks.js:1657`) is a different event and is
not duplicated.

## Determinism and save

`hash32` is pure, and the text is presentation via `voice.say`. Director state stores
`said[situation]`, never text. Digests and save are unchanged.

## Tests

- New `test/x06-sector-barks.test.mjs`:
  - each listed cell holds 6 + 4 lines;
  - the same seed and entity give the same line;
  - a missing cell falls back;
  - the 50/50 split stays within ±10 % over 1,000 ids.
- Keep green: `deep-faction-voice`, `content-variety-append` (index 0 stays, `barks.js:6`),
  `exp-01-helix-barks-4242`, `distress-bark`, `check:player-facing-labels`.

## Coordination

This is joint with V-01. Its tribunal owns the line text. The Accountant owns the schema and the
split.

**Verdict: shippable. Code is S; authoring the lines is M.**
