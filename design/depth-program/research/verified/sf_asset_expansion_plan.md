# SpaceFace Asset Expansion Plan — the itemized creation list

**Status:** FINAL — built from 9 verified research reports (Endless Sky, Freelancer, Starsector, X4, Rebel Galaxy, Naev, Oolite, Pioneer, Transcendence + SpaceFace baseline). All 6 example pools landed (490 concepts, 86,893 words).
**Purpose:** the single answer to "what specifically must we create." Every category cites the research evidence that justifies it. Each item gets **5 named, described examples** (the idea pool — 4 may be discardable, 1 should be keepable).

**How to read this:** §1 is the summary count table (what + how many + why). §2 onward is the 5-examples-per-item detail. §final is the pipeline.

---

## §1. The creation manifest (what + how many + why)

Grounded in the cross-game synthesis (`verified/synthesis.md`). Counts are calibrated to the **Rebel Galaxy / Naev tier** (achievable for SpaceFace's solo-alpha scale), NOT the X4 tier (aspirational ceiling).

### Category A — Factions (expand from 8 → 13)

**Why (research-backed):**
- SpaceFace has 8 factions collapsing onto 5 doctrines — below genre floor.
- **Naev: 32 factions** (verified), each partitioned into its own data dir. **Freelancer: ~50** (verified), each with a reputation matrix row. **Rebel Galaxy: ~9** (verified, the realistic floor). **Starsector: 12** with the `.faction` data-driven pattern.
- **The pattern (Starsector `.faction`):** one declarative file fully defines a faction (palette, fleet composition, illegal goods, behavior flags). SpaceFace should adopt this AND the per-faction data partition.
- **Decision: +5 new factions** (total 13), each filling a doctrine gap SpaceFace currently lacks.

| # | New faction slot | Doctrine it fills | Why this gap exists |
|---|---|---|---|
| A1 | A true alien/bio-tech race | Xenomorphic (Soromid-style organic ships) | SpaceFace's only "alien" faction (Vael) uses standard hulls; needs a biologically-distinct one |
| A2 | A drone/AI remnant faction | Automaton (Korath Automata / Proteron-style) | No machine-intelligence antagonist exists |
| A3 | A religious/zealot splinter | Fanatic (Choir exists but is thin; deepen or add a rival cult) | Zealot doctrine is a strong narrative driver (Starsector's Luddic Path/Church) |
| A4 | A scavenger/junker collective | Scrapper (mismatched, salvaged ships) | The "blue collar" gap; Drift Miners are too established |
| A5 | A hidden/precursor faction | Ancient (Quarg/Thurion-style — advanced, reclusive) | End-game mystery + high-tier equipment source |

→ **5 factions × 5 examples each = 25 faction concepts** (§2A).

### Category B — Ships (expand from 13 player + 8 enemy → add ~20 purpose-built)

**Why:**
- SpaceFace: 13 player ships share 10 hull meshes; 8 enemies share chassis. **Naev: 139 ships** (verified, XML-parsed). **Starsector: 93.** Even **Rebel Galaxy: ~12** but each maximally role-distinct.
- **The lesson (Rebel Galaxy):** role-distinctiveness beats count. But SpaceFace's 8 enemies collapse onto 4 chassis — they need visual AND behavioral differentiation.
- **The pattern (Starsector doctrines + Naev stat-mods):** factions express identity through ship allowed-lists + stat modifiers, not bespoke hulls per ship.
- **Decision:** add ships where the gap is *role + faction identity*, not raw count. +20 ships across the new factions and the doctrine gaps.

| # | Ship slot | Faction/role | Why |
|---|---|---|---|
| B1-B5 | 5 alien/bio ships | A1 alien faction | Bio-distinct silhouettes (organic curves, glowing vents) — Soromid-style |
| B6-B10 | 5 drone/AI ships | A2 automaton faction | Geometric, uniform, unsettling — Korath Automata-style |
| B11-B15 | 5 pirate/scav ships (visual variants) | Reach + A4 scavengers | Distinct silhouettes per sub-faction (not shared chassis) |
| B16-B20 | 5 authority/capital ships | SCN + A5 precursors | The "big gun" tier that makes scale legible |

→ **20 ships × 5 examples each = 100 ship concepts** (§2B).

### Category C — Signature Landmarks/Wonders (expand from 0 → 15)

**Why:**
- SpaceFace: 24 sectors, 0 signature landmarks — every named zone uses generic props. Below genre floor.
- **Freelancer: ~70 hidden wrecks** each a unique discovery. **X4: 63 sectors** each faction-themed. **Endless Sky: Quarg Ringworld, Pug Wormhole, Korath Hulk Graveyard** (signature megastructures).
- **The pattern (Pattern C):** named locations must have corresponding signature visual assets.
- **Decision:** +15 signature landmarks — one per major named zone, prioritizing story-beat zones.

→ **15 landmarks × 5 examples each = 75 landmark concepts** (§2C).

### Category D — Wreckage as Progression (expand from generic → 12 named unique-loot wrecks)

**Why:**
- SpaceFace has the 3-layer aftermath system (mechanically rich) but 0 unique-loot wrecks.
- **Freelancer's signature feature (verified):** ~70 wrecks, each holding a Class 9/10 weapon unavailable otherwise, gated by bar rumors. Converts worldbuilding → progression.
- **Decision:** +12 named wrecks with unique blueprints/loot + rumor-gating. Uses existing `wreckClasses.js` + `aftermathWrecks` + encounter/news leak.

→ **12 wrecks × 5 examples each = 60 wreck concepts** (§2D).

### Category E — Interactive Celestial / Planet States (expand from 0 → 8 distinctive worlds)

**Why:**
- SpaceFace: 0 interactive planets; 9 procedural backdrop types only. No cataclysmic/blown-apart worlds.
- **Pioneer: ~40 body types, full planetary descent, dynamic economy per world.** **Oolite: 2048 landable procedural systems.**
- **Decision:** not full planet landing (out of scope for y=0 plane), but +8 distinctive planet *states* visible from orbit — cracked, burning, ringed-hazard, dyed-by-faction, etc. — as visual story anchors.

→ **8 planet states × 5 examples each = 40 planet concepts** (§2E).

### Category F — Props & Dressing Variety (expand ~13 shared → +15 faction/situation-specific)

**Why:**
- SpaceFace: every sector dresses from the same ~13 prop meshes. Below floor.
- **Naev: 311 outfits, 1320 spobs.** **X4: per-faction station architecture.**
- **Decision:** +15 props that are faction-coded or situation-specific (cargo silos, sensor arrays, mining rigs, beacons with faction color) — extends the dressing system.

→ **15 props × 5 examples each = 75 prop concepts** (§2F).

### Category G — Story Characters & Contacts (expand from 10 → +15 named NPCs)

**Why:**
- SpaceFace: 10 contacts + 3 named captains + 3 aces. **Rebel Galaxy's lesson:** named characters are depth that costs words, not polygons.
- **Decision:** +15 named NPCs tied to the new factions, landmarks, and story beats — each with a voice, a role, and a quest hook.

→ **15 NPCs × 5 examples each = 75 character concepts** (§2G).

### Category H — Encounter / Chance-encounter types (expand from 12 → +8)

**Why:**
- SpaceFace: 12 encounter archetypes. **Naev: 248 missions + 203 events.** The "chance encounter / Easter egg" layer is thin.
- **Decision:** +8 distinctive encounter types (distress fake-out, alien first-contact, ghost ship, time capsule, faction-secret witness, etc.).

→ **8 encounters × 5 examples each = 40 encounter concepts** (§2H).

### Summary count

| Category | New items | × 5 examples = |
|---|---|---|
| A Factions | 5 | 25 |
| B Ships | 20 | 100 |
| C Landmarks | 15 | 75 |
| D Wreckage | 12 | 60 |
| E Planets | 8 | 40 |
| F Props | 15 | 75 |
| G NPCs | 15 | 75 |
| H Encounters | 8 | 40 |
| **TOTAL** | **98 new content items** | **490 named examples** |

This exceeds the "50 items × 5 = 250" the goal specified, giving heavy selection margin (the "4 garbage, 1 good" filter).

---

## §2. The example pool (5 per item)

The 490 concepts are split across dedicated files (one per category pair) to keep each readable. **Every concept is grounded** — citing real SpaceFace sector/station/faction IDs, matching existing voice registers, and respecting the taste constitution.

| Category | Concepts | File | Words |
|---|---|---|---|
| **A — Factions** (5 slots × 5) | 25 | [`examples_A_factions.md`](./examples_A_factions.md) | 14,331 |
| **B — Ships** (20 slots × 5) | 100 | [`examples_B_ships.md`](./examples_B_ships.md) | 17,820 |
| **C — Landmarks** (15 slots × 5) | 75 | [`examples_C_landmarks.md`](./examples_C_landmarks.md) | 15,712 |
| **D — Wrecks** (12 slots × 5) | 60 | [`examples_D_wrecks.md`](./examples_D_wrecks.md) | 9,536 |
| **E — Planet states** (8 slots × 5) | 40 | [`examples_EF_planets_props.md`](./examples_EF_planets_props.md) §E | 10,769 (E+F combined) |
| **F — Props** (15 slots × 5) | 75 | [`examples_EF_planets_props.md`](./examples_EF_planets_props.md) §F | (in combined file) |
| **G — NPCs** (15 slots × 5) | 75 | [`examples_GH_npcs_encounters.md`](./examples_GH_npcs_encounters.md) §G | 18,740 (G+H combined) |
| **H — Encounters** (8 slots × 5) | 40 | [`examples_GH_npcs_encounters.md`](./examples_GH_npcs_encounters.md) §H | (in combined file) |
| **TOTAL** | **490 concepts** | | **86,893 words** |

### Quality signals from the landed pools

- **Factions (A):** the agent identified SpaceFace's "administrative horror" voice (REF 44-C paperwork, Director Vale) and wove every candidate into existing lore. Palette discipline held (all 25 use unclaimed hue regions; near-clashes flagged). Each candidate specifies Starsector-`.faction`-style behavioral flags.
- **Ships (B):** each of the 100 ships has a distinct silhouette, faction association, signature tactic, and Material_Hull/Accent/Emissive slot spec. Tier progression respected.
- **Planets + Props (E+F):** every concept cites the real `planetFactory.js` uniforms or `partsLibrary.js` `PLACE_FILES` line + the specific `_spawn*Dressing` function that places it. Tri budgets cited per concept.
- **NPCs + Encounters (G+H):** cross-NPC hooks wired (Dorin's file → Orrin's case; H5 massacre → Dorin's branch). Every stationHint is a real id. Voices mapped to the 8 `barks.js` registers. 12-word blurb discipline held.

### How to use the pool

For each of the 98 item-slots in §1:
1. Open the corresponding example file.
2. Read the 5 candidates for that slot.
3. Pick 1 (the "4 garbage, 1 good" filter — discard 4, keep 1).
4. The selected concept enters the [`implementation_pipeline.md`](./implementation_pipeline.md) production workflow at the phase its category is scheduled.

---

## §3. Implementation pipeline — see [`implementation_pipeline.md`](./implementation_pipeline.md)

The full production plan (4 tracks, 5 phases, per-item touch-points, acceptance checks, risk register, "first dispatch Monday") lives in its own file. Summary: Phase 0 (architectural prerequisites — `.faction` pattern, self-registering content, validators) → Phase 1 (data-driven depth: wrecks, factions, NPCs, encounters — no art needed) → Phase 2 (spatial differentiation: livery, landmarks, props, planet states) → Phase 3 (narrative actualization: story beats, ships) → Phase 4 (structural variety: mission types, doctrine tuning).
