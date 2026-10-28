# V-01 drafts — Comms/bark density, three personas

## The Drifter (working-class regular)
A local talks about the place. The Drifter's draft: every sector gets its own
passing-hail bank — locals remarking on the lane, the hazard, the work, the strange
machine out on the rim. A hauler in the Cinder says the crowd rates fights; a hauler
in the Dark says the dead buoys are lit again. The hail should teach the sector
before the player reads a single plate — ambient comms as the first tour guide.
Half the voices stay faction (a Concord crew sounds like Concord anywhere); the
other half sound like HERE.

## The Archivist (continuity and memory)
The corpus has ONE ambient situation and it is sector-blind. The Archivist wants a
sector-keyed bank riding the same contract as every event bank in the file —
`SECTOR_GREETING_BARKS[sectorId] = [lines]`, a `*For` helper, frozen, deterministic —
and wants the pick folded into the existing per-hull `index` so the mix is save-stable.
She vetoes: a separate speak path (duplicate dedupe machinery), touching the event
banks (they are reactive, not ambient), and any line a specific faction would refuse
to say — the speaker's house is random, so every sector line must be voice-neutral.

## The Skeptic (cold reader / anti-bloat)
Twenty-five sectors × ~4 lines ≈ a hundred lines heard one-per-hull inside one gap
window — density that registers, not a wall of spam. The Skeptic counts reach: every
sector visit produces ambient hails, so this is the highest-impressions surface the
bark system has. She approves the ~50% mix (sector audible every other hail without
erasing faction voice) and the single-seam edit (one line in `_speak`), and vetoes
sector-hails for tourists/grandees/work-roles — those paths already carry identity,
and doubling them would fake variety.
