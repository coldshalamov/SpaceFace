# V-01 plan — Comms/bark density (tribunal; joint with ATT-V01 and §1P X-06)

Scores: Drifter 5/5/5/5/5 · Archivist 5/5/5/5/5 · Skeptic 5/5/4/5/4.

## Landed
- `SECTOR_GREETING_BARKS` in `src/data/barks.js`: a frozen bank keyed by
  `sectorId`, all twenty-five sectors, four voice-neutral lines each (≤12 words,
  the bar-register cap). Lines carry the sector's own identity — lane rules,
  hazards, landmarks, and oblique sightings of the Shift machine-people where
  canon places them (the lamplighter, the gardener, the printer, the shepherd,
  the scale keeper, the holder of clamps, the tuner, the archivist).
- `sectorGreetingBarkFor(sectorId, index)`: returns a sector line for the
  sector-share of hails (index parity — even index speaks local), `null`
  otherwise so the caller falls back to the faction pool. Line pick uses the
  upper index bits (`Math.floor(index / 2) % len`) so the share decision and
  the line pick are decorrelated but both ride the one deterministic hash.
- One-seam mix in `barkDirector._speak`: for `situation === 'patrol-greeting'`
  the sector bank is consulted first; a `null` falls through to `barkFor`.
  Dedupe, suppression, voice-say acceptance, and `barkDirector:voice` receipts
  are untouched — a sector hail spends exactly the same per-entity budget.
- Focused test `test/sector-greeting-barks.test.mjs`: all 25 sectors banked and
  ≤12-word lines; helper returns a bank line on even index and `null` on odd;
  the `_speak` mix speaks a sector line on the even-index hull and a faction
  line on the odd-index hull.

## Rejected
- A parallel `_speakSectorHail` path: would duplicate dedupe/voice machinery and
  could double-spend the situation budget (vetoed by Archivist + Skeptic).
- Sector lines inside `BARKS[faction]['patrol-greeting']`: the speaker's faction
  is random — a Concord hull cannot credibly recite a deep-frontier local.
- Sector banks for tourists/grandees/work-role hails: those paths already carry
  stronger identity; mixing would fake variety (Skeptic veto).
- A higher share than half: the ledger wants sector voice audible, not faction
  voice erased.

## Register check
Voice-neutral held: no line leans on a house register, a name the speaker
couldn't know, or a fact requiring a scan. Local color only — landmarks, work,
hazards, rumors a passing local would plausibly share on an open hail.
