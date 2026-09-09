# SpaceFace Story Sheets — Schema & Convention

> **Scope:** structured discovery layer. See [`../README.md`](../README.md) for the authority map.
> Sheets do not prove runtime implementation.

The **structured index** for the narrative canon. The prose files in `../story/`,
`../vibe/`, `../orgs/`, `../contracts/` remain the *voice*. A sheet never duplicates
prose — it extracts structured fields from it and points back.

> **Single rule:** the sheet is the index; the prose file is the voice. If a sheet
> and a prose file disagree, the prose file wins for *meaning* and the sheet is
> stale; the sheet wins for *discoverability* (what entity is where). Fix the
> stale side. Never carry the same sentence in both places.

A separate structured per-sector sheet system exists at
`design/world-identity/sectors/*.md` (render-focused: palette / GLB / landmark /
placement_id). The world sheets here own the **narrative** attributes and
cross-reference that tree rather than duplicating it.

---

## The five sheet types

### 1. Character sheet — `sheets/characters/<id>.md`

```yaml
id:                 # canonical short id, e.g. npc_kessler / pc_wren
name:
role:               # one-line function (e.g. "cargo weigher, Tycho Relay")
station_sector:     # where they are (sector id + station)
faction:            # faction id or 'unaffiliated'
voice_register:     # which of vibe-CANONICAL's three registers (comfortable / working / cornered) — one line
the_tell:           # the physical gesture that gives them away
private_motive:     # the caper they think is the real story of their life
what_they_do_not_know:  # what the system does with their caper without their knowledge
dostoyevsky_layer:      # see DOSTOYEVSKY-LAYER.md — { theme, expression, where_it_lands }
graffiti:           # [first_visit, second_visit] — exact lines
canon_refs:         # [file:section, ...] where this character's prose lives
appears_in_chapters:# [B0, B2, ...]
```

### 2. Faction sheet — `sheets/factions/<id>.md`

```yaml
id:
name:
short:              # tag, e.g. MTS
color:              # hex from src/data/factions.js
primary_function:
betrayal_pattern:
hud_graffiti_lie:
spacer_superstition:
prison_origin:
silt_role:          # this faction's function in the atmospheric economy (the real layer)
dostoyevsky_layer:  # { theme, expression }
canon_refs:
appears_in_chapters:
```

### 3. World (sector) sheet — `sheets/worlds/<id>.md`

```yaml
id:
story_band:         # S0..S9
canon_place:        # story name (e.g. "The Pit", "Helios Prime")
data_sector_id:     # src/data/sectors.js id
primary_faction:
air_smell_line:     # one line — the sensory tell
temperature:
spectrum:
maintenance_cycle:  # how long graffiti survives before being painted over
signature_landmark:
placement_id:       # cross-refs design/world-identity/sectors/<id>.md — does NOT duplicate
dostoyevsky_layer:  # { theme, expression }
canon_refs:
appears_in_chapters:
```

### 4. Commodity sheet — `sheets/commodities/<id>.md`

```yaml
id:
name:
category:           # Raw Mineral / Chemical / Waste / Digital Derivative / Balance
weight_unit:
core_value:
black_market_value:
sector_availability:
narrative_function: # what this commodity *means* (Silt = breath/class; ATMO TOKEN = a derivative that pays when people suffocate)
canon_refs:
```

### 5. Chapter (beat) sheet — `sheets/chapters/<beat>.md`

The chapter sheet is the **cohesion mechanism**. Every chapter file
(`../story/chapter-NN-*.md`) carries a footer block that lists the entities it
touches by sheet id; the chapter sheet is the reverse index (which entities
appear in which chapter).

```yaml
beat:               # B0..B7
title:
mechanic:           # the gameplay verb
hud_phase:          # 1 Protective / 2 Complicit / 3 Absent
graffiti_introduced:# [exact lines first appearing in this chapter]
manifests_introduced:# [exact manifest entries first appearing here]
comms_introduced:   # [comms popup lines first appearing here]
npcs_present:       # [character sheet ids]
factions_present:   # [faction sheet ids]
sectors_visited:    # [world sheet ids]
thread_a_beat:      # the systemic story beat (one line)
thread_b_beat:      # Wren's personal-story beat (one line, or 'dormant')
dostoyevsky_beat:   # { theme, how_it_lands, what_the_player_feels } — see DOSTOYEVSKY-LAYER.md
canon_refs:         # [STORY-SPINE section, STORY-STRUCTURE section, etc.]
```

---

## Conventions

- **`dostoyevsky_layer` / `dostoyevsky_beat`** fields cite `DOSTOYEVSKY-LAYER.md`
  by theme id (e.g. `theme: guilt_as_physiology`). The Dosto doc is the only
  place Russian-author names appear. Body prose and sheets never name-drop.
- **`canon_refs`** uses `path:relative#section` form (relative to this README).
  Example: `../story/NPCs-CANONICAL.md#KESSLER`.
- **`appears_in_chapters`** is filled progressively as chapters are written
  (Phase 5). A sheet is not "incomplete" if this is empty during Phase 3/4.
- **Cross-tree links:** world sheets link to
  `design/world-identity/sectors/<id>.md` (render/palette/GLB) and back. The two
  trees do not overlap in owned fields.
- **Prose canon remains authoritative for meaning.** Sheets can be regenerated
  from prose; prose is never "fixed" to match a sheet — the sheet is fixed to
  match the prose.

---

## File tree

```
docs/worldbuilding/
  sheets/
    README.md            (this file)
    INDEX.md             (master entity × sheet × chapter map)
    characters/          (17 files)
    factions/            (8 files)
    worlds/              (11 files)
    commodities/         (6 files; narrative concepts, not runtime cmdty_* IDs)
    chapters/            (8 beat sheets)
    groups/ gangs/ rivals/ crew/ ships/
  DOSTOYEVSKY-LAYER.md   (craft scaffold and element map)
  story/
    chapter-00-cold-start.md         (B0 prose frame)
    chapter-01-CANONICAL.md          (B0 canonical first-run HUD script; legacy filename)
    chapter-01-honest-work.md        (B1)
    chapter-02 .. chapter-07-*.md    (B2-B7 authored intent)
    chapter-05b-the-reunion.md       (future optional B5 branch)
```
