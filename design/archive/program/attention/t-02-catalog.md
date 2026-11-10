# T-02 catalog — station life, people, comms

## What the player sees
`src/data/stationLife.js` + `src/data/stationLifeAudio.js` are untracked foreign files —
the named joint lane (ATT-T02) already occupies them; not edited. The reachable voice
surface in owned data is `BAR_GREETING_BARKS` (barks.js:1715): per-faction `any`/`barkeep`
cells, 8 live factions + 5 staged deep ones, each barkeep cell 2 deep.

## What is thin
Barkeep voice repeats at 2 variants per faction — third visit already echoes.

## Additive seam (used)
`BAR_GREETING_BARKS[faction].barkeep` +1 line × 8 live factions. Staged factions untouched.
