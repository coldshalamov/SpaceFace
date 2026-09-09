# Implementation Pipeline Plan — how we actually build the depth

**Status:** v1, built from the verified research (`verified/synthesis.md`) + the itemized creation manifest (`verified/sf_asset_expansion_plan.md`) + the example pools (`verified/examples_*.md`).
**Purpose:** the answer to "how do we proceed with the pipeline and what must be done." A production workflow that turns the 490 example concepts into shipped, integrated, in-game content — respecting SpaceFace's architecture (60Hz fixed sim, determinism goldens, non-diegetic HUD, data-driven `src/data/*`, the existing asset pipeline).

This plan operationalizes the depth-program pipelines (`design/depth-program/P1`–`P4`) with the research-backed priorities. It is the production layer above them.

---

## §1. The four production tracks (parallel, mostly independent)

The 98 new content items divide into four production tracks by craft type. These map onto (but extend) the existing P1–P4 pipelines:

| Track | Craft | Items | Outputs into | Maps to |
|---|---|---|---|---|
| **T-Art** | 3D authoring (Blender → GLB) | Ships (B), Landmarks (C), Props (F), Planet shaders (E) | `assets/ships/parts/`, `PLACE_FILES`, `planetFactory.js` | P1 + graphics lane |
| **T-Data** | Data files (JSON/JS) | Factions (A), Wrecks (D), NPCs (G) | `src/data/*`, `src/story/campaign47a/` | P3 + P2 (data layer) |
| **T-Code** | Engine/system code | Wreckage-as-progression loop, self-registering content, encounter hooks (H), mission types | `src/systems/*`, `src/story/*` | P2 + P4 |
| **T-Narrative** | Prose (comms/barks/news/rumors) | NPC voice, wreck rumors, encounter dialogue | `src/data/narrative.js`, `barks.js`, `embodiedDialogue.js` | P2 (narrative layer) |

**Parallelism rule:** T-Art is gated by the single Blender lock (`design/graphics-sprints/BLENDER_EXCLUSIVE_LOCK.md`) — only one art thread at a time. T-Data, T-Code, and T-Narrative can all run alongside each other and alongside T-Art, since they touch different file domains.

---

## §2. The production sequence (priority order)

Ranked by: depth-per-unit-effort × research-backing × unblocking downstream work. This is the order to dispatch in.

### Phase 0 — Architectural prerequisites (do FIRST, unblocks everything)

These are small code/data changes that make all subsequent content cheaper to add. From the synthesis patterns:

| # | Prerequisite | Why first | Effort | Research backing |
|---|---|---|---|---|
| 0.1 | **Adopt the `.faction` data-file pattern** — migrate `src/data/factions.js` from a flat array to one-file-per-faction (`src/data/factions/<id>.js`) carrying palette, fleet composition weights, illegal goods, behavior flags | Every new faction (Cat A) + every faction-kit (P3) becomes "drop a file" instead of editing a monolith | 1-2 days | Starsector `.faction` (Pattern A) |
| 0.2 | **Self-registering content files** — give missions/encounters/news a metadata-header convention (Naev's Lua-XML-comment trick adapted to JS) so adding content = dropping a file, no central registry edits | Every new encounter (Cat H), mission variant, and rumor (Cat D) becomes drop-in | 2-3 days | Naev self-registering Lua (Pattern E) |
| 0.3 | **`check:faction-livery` + `check:story-beat-embodiment` + `check:mission-types` validators** — build the acceptance checks BEFORE content lands, so each addition is gated green | Prevents the "shallow masquerading as done" failure mode across all tracks | 1 day | VERIFICATION_RUBRIC principle |

**Do not start Phase 1 until 0.1 + 0.2 land.** They're the force-multipliers.

### Phase 1 — Data-driven depth (highest ROI, no art required)

These deliver depth-feeling through data + prose, not 3D assets. Cheapest, fastest, and (per Rebel Galaxy lesson) often *more* immersive per hour than art.

| Priority | Item | Track | Why this order |
|---|---|---|---|
| 1.1 | **Wreckage-as-progression loop** — 12 named wrecks with unique loot + rumor leaks (Cat D) | T-Code + T-Narrative | Highest-ROI feature work (Freelancer's signature pattern). Uses existing `aftermathWrecks` + `wreckClasses` + encounter/news. Turns existing systems into a progression loop. |
| 1.2 | **+5 new factions as data files** (Cat A) | T-Data | Fills the registered-kit set (9→14). Once 0.1 lands, each is a drop-in file. |
| 1.3 | **+15 named NPCs/contacts** (Cat G) | T-Data + T-Narrative | Words-not-polygons depth (Rebel Galaxy lesson). Each enables a quest hook. |
| 1.4 | **+8 encounter types** (Cat H) | T-Code | Chance-encounter/Easter-egg layer. Once 0.2 lands, each is drop-in. |

### Phase 2 — Spatial differentiation (the "feels repetitive" cure)

Now the art track. This is where the "same station everywhere" complaint dies.

| Priority | Item | Track | Why this order |
|---|---|---|---|
| 2.1 | **Runtime faction livery** (P3 Tier A) — `stationLiveryFor(entity)` wiring + livery data for all 8+5 factions | T-Code (no new GLBs) | Cheapest spatial-ROI. Same GLBs, different read per faction. Do BEFORE sculpting. |
| 2.2 | **+15 signature landmarks** (Cat C) at named zones | T-Art | The single biggest "place becomes place-y" investment. Stages Phase 3. |
| 2.3 | **+15 faction/situation props** (Cat F) | T-Art | Expands the dressing vocabulary so sectors stop sharing ~13 props. |
| 2.4 | **+8 planet states** (Cat E) as planetFactory variants | T-Art (shaders) | Visual story anchors (cracked, burning, megastructure-wrapped). No landing — y=0 respected. |

### Phase 3 — Narrative actualization (staged at the new places)

Now the story beats get played at the new landmarks, voiced by the new NPCs.

| Priority | Item | Track | Why this order |
|---|---|---|---|
| 3.1 | **Deepen story beats B0–B7** (P2) — each becomes a multi-step set-piece staged at a Phase 2.2 landmark | T-Code + T-Narrative | The "story laid out but not actualized" gap. Depends on landmarks existing. |
| 3.2 | **+20 purpose-built ships** (Cat B) | T-Art | The expensive lift. Do AFTER factions + landmarks so ships have somewhere to belong and someone to fight for. |

### Phase 4 — Structural variety (the force-multiplier)

| Priority | Item | Track | Why |
|---|---|---|---|
| 4.1 | **+3 set-piece mission types** (P4: boarding, investigation, blockade-run) | T-Code | Fixes the activity-shape gap. Each creates a *class* of content the generator fills forever. |
| 4.2 | **Faction doctrine differentiation** — move all 14 registered kits onto distinct doctrine profiles | T-Data + T-Code (tuning) | Enemies fly differently per faction; registry-only profiles remain labeled until a natural fleet carrier exists. |

---

## §3. The per-item production workflow (how one concept becomes shipped content)

Every one of the 98 items follows the same lifecycle, regardless of track. Adapted from the existing asset lifecycle (`design/graphics-sprints/00_ORCHESTRATION.md` §5) plus the verification gate.

```
CONCEPT (from examples_*.md — 5 candidates per slot)
   ↓ user picks 1 (the "4 garbage, 1 good" filter)
SELECTED
   ↓ author to budget (tri/word-count) per category spec
AUTHORED
   ↓ register in all required places (see §4 — the touch-points per category)
REGISTERED
   ↓ run the category's acceptance checks (§5)
CHECKS GREEN
   ↓ screenshot/verify in default game path (no probe special-casing)
VERIFIED IN-PLAY
   ↓ update the audit log + QUEUE.md status
SHIPPED
```

**The non-negotiable rule (from `VERIFICATION_RUBRIC.md`):** no item is "done" until its acceptance check is green AND it's verified visible/functional in the default game path (browser, `http://localhost:8123/`). A broken GLB that silently falls back to procedural geometry is the #1 false-positive — guard against it explicitly.

---

## §4. The touch-points per category (where each thing registers)

This is the "where it goes" answer for each of the 98 items. Cited to current file:line.

### Category A — Factions (5 new)
- `src/data/factions/<id>.js` (new, after Phase 0.1 migration) — the `.faction` file: palette, fleet composition, illegal goods, behavior flags, home sectors
- `src/data/palettes.js` `FACTION_PALETTES` — add the 6-field palette entry
- `src/data/palettes.js` `PAINT_PROFILES` — add personality profile if new
- `src/data/factions.js` `relations` matrix — add rows/columns for existing factions
- Acceptance: `check:faction-livery` (Phase 0.3) green + faction appears on galaxy map with correct color

### Category B — Ships (20 new)
- `src/data/ships.js` — add the ship def (tier, role, slots, driveId, visuals)
- `src/data/enemies.js` — if NPC-only, add the enemy archetype + silhouette
- `assets/ships/parts/hulls/hull_<name>.glb` — the authored mesh (Material_Hull/Accent/Emissive slots)
- `src/render/partsLibrary.js:271-285` `HULL_FILE_BY_DEF_ID` — map def→mesh
- `assets/ships/parts/parts_manifest.json` — register the part
- Acceptance: `check:asset-reachability` + `check:assets:live` (failureCount:0) + screenshot in default play

### Category C — Landmarks (15 new)
- `assets/ships/parts/places/place_landmark_<name>.glb` — authored mesh (8-15k tris)
- `src/render/partsLibrary.js:59` `PLACE_FILES` — append
- `assets/ships/parts/parts_manifest.json` — parts[] + runtimeSlots.place
- `src/data/sectorAnchors.js` OR `src/data/frontierRegions/*.js` — set `landmarkGlb` + `landmark:true` on the target POI
- Acceptance: `check:asset-reachability` + `check:assets:live` + `check:visual-stability` + screenshot at the named zone

### Category D — Wrecks (12 new, unique-loot)
- `src/data/wreckClasses.js` — add the named wreck (class, sector, zone, loot table)
- `src/systems/aftermathWrecks.js` — ensure the wreck materializes on entry
- The **unique loot**: a variant/blueprint of an existing weapon (`src/data/weapons.js`) or module (`src/data/modules.js`) — add as a `*_wreck_<name>` variant
- The **rumor leak**: add to `src/data/narrative.js` (news) OR `src/data/encounters.js` (bar hint) OR `src/ui/comms.js` (intercept)
- Acceptance: `check:sim:compare` (hashEqual:true — determinism preserved) + the wreck is findable via its rumor in default play

### Category E — Planet states (8 new)
- `src/render/planetFactory.js` — add the state variant (extends `PLANET_TYPES_BY_TIER` or adds a child-mesh overlay; reuses existing uniforms `uSunDir`/`uTime`/`uSeed`)
- `src/data/sectors.js` — flag which sectors host which planet state
- Acceptance: `check:visual-stability` + screenshot of the planet state from orbit

### Category F — Props (15 new)
- `assets/ships/parts/places/place_<name>.glb` — authored mesh (1-3k tris, Material_Hull/Accent/Emissive slots)
- `src/render/partsLibrary.js:59` `PLACE_FILES` — append
- `assets/ships/parts/parts_manifest.json` — register
- `src/systems/world.js:1209-1345` — add a placement call in the matching `_spawn*Dressing` function
- Acceptance: `check:asset-reachability` + `check:assets:live` + screenshot in a sector

### Category G — NPCs (15 new)
- `src/story/campaign47a/embodiedDialogue.js` — add the contact `card()` + comms `line()` variants
- `src/data/namedAces.js` OR `src/data/encounters.js` — if they have a ship/captain presence
- The **quest hook**: wire to a mission (`src/data/missions.js`) or encounter (`src/data/encounters.js`)
- Acceptance: NPC is reachable at their station, voice matches `barks.js` register, 12-word blurb limit enforced

### Category H — Encounters (8 new)
- `src/data/encounters.js` — add the encounter archetype (deck/tier/weight/squad/bark/choices)
- `src/systems/encounterScripts.js:782` — add the script (after Phase 0.2 self-registering pattern)
- `src/data/narrative.js` — supporting comms/news if needed
- Acceptance: `check:encounter-director` + `check:encounter-voice` green + encounter triggers in default play

---

## §5. Acceptance checks per change-type (the no-regression floor)

From `AGENTS.md` §9 + `VERIFICATION_RUBRIC.md`. Every item must run its row:

| After touching… | Run |
|---|---|
| Assets / manifests / `src/render/**` | `check:asset-reachability`, `check:assets:live`, `check:visual-stability` |
| Flight or render loop | `check:flight:clean`, `check:assets:live`, `check:perf` |
| Sim / determinism-affecting | `check:sim:compare` (hashEqual:true) + `check-tether-gameplay.mjs` |
| Story / narrative | `check:story-beats`, `check:encounter-director`, `check:encounter-voice` |
| Missions | `check:mission-standing-ladder`, `check:mission-types` (Phase 0.3) |
| UI / a11y | `check:ui-a11y`, `check:wcag-contrast` |
| Broad / unknown | `npm run check` (full gate) |

**Plus, always:** a screenshot pair into `.devshots/` for anything visual. **Transcripts are not proof — checks are.**

---

## §6. Estimating the scope

Rough, solo-alpha cadence (informed by how long the existing Kestrel whole-ship + landmark queue has taken):

| Phase | Items | Est. effort | Critical path? |
|---|---|---|---|
| 0 — Architectural | 3 | ~1 week | YES — unblocks all |
| 1 — Data-driven depth | 40 items (D+A+G+H) | ~3-4 weeks | High ROI, low art |
| 2 — Spatial differentiation | 38 items (livery+landmarks+props+planets) | ~6-8 weeks (art-gated) | The "feels repetitive" cure |
| 3 — Narrative actualization | 28 items (beats+ships) | ~4-6 weeks | Depends on Phase 2 places |
| 4 — Structural variety | 3 mission types + doctrine tuning | ~2 weeks | Force-multiplier |

**Total: ~16-21 weeks solo, compressible with parallel agents.** The art track (Phase 2-3) is the long pole; everything else can run ahead.

---

## §7. Risk register (what could go wrong)

| Risk | Mitigation |
|---|---|
| **Determinism breakage** from new content (wrecks, encounters) | Every new spawner MUST use `state.rng` seeded per-offer; run `check:sim:compare` after every Cat D/H item |
| **Silent procedural fallback** masquerading as a shipped asset | `check:assets:live` failureCount:0 + screenshot is mandatory; no exceptions |
| **Scope creep beyond Rebel Galaxy tier** | The 98-item manifest is the scope. New items require a research-backed justification added to the synthesis, not ad-hoc |
| **Art-track bottleneck** (single Blender lock) | Prioritize Tier A livery (no new GLBs) before any sculpting; batch art items per the lock protocol |
| **Faction identity drift** (new factions feel generic) | Every new faction must cite which Starsector/Naev/Freelancer pattern it embodies; the `.faction` file is the contract |
| **Story/narrative voice inconsistency** | All prose passes the `barks.js`/`narrative.js` register check + the 12-word blurb validator |

---

## §8. How this connects to the existing depth-program (P1–P4)

This pipeline is the **production scheduling layer** above the existing pipeline specs:

- **P1 (Landmarks)** = Phase 2.2 + Category C
- **P2 (Story-Beat Embodiment)** = Phase 3.1
- **P3 (Faction Kits)** = Phase 0.1 + 1.2 + 2.1 + Category A
- **P4 (Mission Types)** = Phase 4.1

The existing P1–P4 docs define *how* each pipeline works technically; this doc defines *when* and *in what order* to run them, grounded in the research evidence about what produces depth-feeling fastest.

---

## §9. The first concrete dispatch (what to do Monday)

If executing this plan, the first dispatch is unambiguous:

1. **Phase 0.1** — migrate `factions.js` to one-file-per-faction (the `.faction` pattern). Small, mechanical, unblocks Cat A and P3.
2. **Phase 0.3** — build `check:faction-livery`, `check:story-beat-embodiment`, `check:mission-types` (the validators). One day. Gates all subsequent content.
3. **Phase 1.1** — the wreckage-as-progression loop (Cat D, 12 wrecks). Highest-ROI feature work; uses existing systems; research-backed (Freelancer's signature pattern).

Everything else sequences from there per §2.

---

*Built 2026-07-12 from 9 verified research reports. Every priority is grounded in cited evidence from `verified/synthesis.md`. Refine as the example pools land and as Endless Sky extraction completes.*
