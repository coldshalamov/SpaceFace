# S-01 plan — Helios Prime (tribunal synthesis)

Scores (rubric 1–5): **Drifter** — weight 5, authenticity 5, specificity 4, cost 5,
non-redundancy 4. **Archivist** — weight 4, authenticity 5, specificity 4, cost 5,
non-redundancy 3 (the Pit/memorial memory is already the sector's strongest layer; more of
it risks redundancy). **Set Dresser** — weight 5, authenticity 4, specificity 4, cost 5,
non-redundancy 4, but its bark/ads rejection loses real surface the register names ("gossip
barks" is sanctioned detail).

**Synthesis:** Drifter's skeleton (gate-leg furniture + working voice + employed-party
notices), Set Dresser's placement law (every new body sits on a flown corridor chord, not a
random coordinate), one Archivist splice (Bulletin lines that name the new physical things,
closing the loop between ticker and place).

## The plan

**`src/data/sectors.js` — 4 new POI rows** (inline `pos` on real chords, `landmarkGlb` +
`visualRadius`, `discoveryPlate`, `chartNote` where the map should speak):

1. `poi_helios_shift_bell` — beacon, "Shift Bell 3", place_tally_post, on the
   station→Ceres-gate leg at (-1288,988), ~70% out, clear of the outer cluster.
   Third-shift horn the day shift has never heard.
2. `poi_helios_misdeclared` — beacon, "Misdeclared Marker 12-K", place_nav_buoy, on the
   station→Tethys-gate leg at (1834,586). Manifests-wrong register made physical: a buoy
   still broadcasting the wrong mass after two corrections.
3. `poi_helios_lost_freight` — derelict, "Lost Freight Apron", place_container_rack, on the
   station→Vesta-gate leg at (576,1390). Unclaimed crates orbiting their own paperwork.
4. `poi_helios_overtime` — derelict, "Overtime Berth", place_dead_hulk, on the
   Coalition→Vesta-gate short chord at (-644,1617). A dock tug that never clocked out;
   its shift ticket still open.

(Coordinates above are as shipped — pushed farther down each chord than the draft so
the beats land mid-corridor rather than on top of the station apron.)

**`src/data/flavor/040-band.js` — 4 lines appended to `concord_bulletin`** (`concord_61..64`):
the desk reporting on its own errors — the misdeclared marker, the lost freight apron, the
bell only third shift can name, Checkpoint Niner's green lamp. Deadpan, no sneer.

**`src/data/flavor/020-ad-board.js` — 4 `ad_pulse_306..309` entries** tagged
`sector_helios_prime` / `faction_scn`: third-shift canteen hours, lost-freight claim window,
misdeclaration amnesty desk, bell-listener's notice.

**`src/data/barkSituationFill.js` — 5 lines into `faction_scn`** (scan ×3, patrol-greeting
×2): the stamp's human side — clerks who know the manifest is wrong, the greeting that
admits the corridor is mostly third shift's.

## Explicit non-goals

No new lane contacts (pick pool is seed-pinned by `fb-world-40-two-faces.test.mjs`), no
`sectorAnchors.js` edits (contended table; inline `pos` is the sanctioned path), no new
`place_*` ids (reuse released bodies only), no rim_poi_lore (Helios is test-excluded).
