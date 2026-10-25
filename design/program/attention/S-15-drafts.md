# S-15 drafts — The Bolus, three personas

## The Drifter (working-class regular)
He docked at the Rib once, sold grit, and left before the third film beat. What the gut
lacks, for him, is proof other crews came through: a swallowed hauler in the Cough with
a crew that never checked out, a watch buoy the station keeps live so the throat can't
sneak up on the berth. Draft: two finds — a derelict "last manifest" hulk in the Cough
plate that names its dead (the gut keeps what the ledger lost), and a rib-station watch
buoy off the berth whose plate is the station's clipped shift-log voice. Also a plate on
the Charon buoy — the one thing in the gut that already exists and still says nothing.

## The Archivist (continuity and memory)
The Bolus is the most pinned surface in the program: 99 layout rows, 20 flag-keyed lore
lines, nursery/berth coordinates in `bolusPlay`. The Archivist's rule: the gut speaks in
what it swallowed — don't add voice, add *evidence*. Draft: the swallowed hulk gets a
manifest-plate (crew names, cargo line, how long it's been inside — the harvest-flavor
register: what the gut keeps), the nursery volume gets its zone name on the chart
(the fingerlings already live there in `bolusPlay` — the chart just never said so), and
the buoy plate files the buoy's own provenance (which Charon crew dropped it).

## The Skeptic (cold reader / anti-bloat)
Her list of ways to break this row is long: touch the layout tables (99-row pin), touch
BOLUS_LORE (every key flag-triggered, untriggered keys are dead text), touch bolusPlay
constants (play tuning), add colliders or live actors inside a physics-choreographed
interior. What's left: card `pois:` + `BOLUS_ANCHORS.pois` + `BOLUS_ZONES` — three frozen
arrays that accept frozen rows without disturbing the layout machinery. Two POIs and one
zone is the right dose for a 5,000-WU interior that currently has one find.

## Tribunal notes (pre-scoring)
- Unanimous on: +2 POIs (manifest hulk in the Cough, watch buoy off the berth), +1 zone
  (The Nursery at the authored play coords), +1 plate on the existing Charon buoy.
- Drifter wanted the crew names in the manifest plate; Archivist supplies the
  provenance rules; Skeptic supplies the boundary (no lore keys, no layout, no actors).
- Zone type reuses `anomaly_deep` (the gut's own vocabulary); faction_free matches the
  other three zones.
