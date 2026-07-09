# Top-50 Wonder Build Plan + Quality Gates

**Status:** LIVE — director-facing production slate for **M3 Wonder / ~$30 Steam visual bar**  
**Date:** 2026-07-09  
**Owner:** Human director + graphics / presentation agents  
**Product authority:** `design/vision/00_CONSTITUTION.md` · `design/vision/03_MASTER_BUILD_PLAN.md` Wave 4  
**Process authority:** this file + `QUALITY_RITUAL.md` + `.grok/skills/spaceface-blender-pipeline/SKILL.md`  
**Complement (do not lower bar):** `FULL_GRAPHICS_REVAMP_GOAL.md` (full kit process) · `design/revamp/BP-08_VISUAL_ASSET_SPEC.md` (coverage/identity) · `needed-assets.md` (inventory) · `assets/QUEUE.md`

---

## 0. Why this document exists

| Problem | This doc’s job |
|---|---|
| Agents stop after half-done clay / few iters | **Hard gates** + a **copy-paste goal** that forbids early exit |
| “Revamp everything” is too large to start | **Top 50 ranked** + **5 slices** with clear exit shots |
| FGRG / BP-08 / QUEUE overlap confuses agents | **One priority spine** for store-page + first-hour wonder |
| Screenshots crop or fake progress | **Full-view law** + weighted rubric + evidence paths |
| Mesh work without VFX/UI/audio leaves clay universe | Ranks include **RUNTIME / VFX / UI2D / AUDIO-VIS** |

**Prime directive:** Space games live on wonder + tactile feedback. Excellent systems under clay placeholders do not sell at ~$30. Target is **real 2026 hard-surface + presentation** (Eve / modern space-sim bar at game scale), browser-safe via LOD/instancing/batching.

**This is not “polish a few parts then declare victory.”** Slice A must produce **Steam-quality undock frames**. Slices B–E fill combat, density, retail, and fleet scale. The full kit (~70 GLBs + BP-08 gaps) still lives under FGRG — this file is the **order of attack** that maximizes player-visible value.

---

## 1. Authority chain (when docs disagree)

1. Root `Agents.md` §3 (uncommitted tree — never `reset`/`stash`/`checkout .`) + §10 (lanes) + graphics lock  
2. `design/vision/00_CONSTITUTION.md` (product pillars)  
3. **This file** for Top-50 order + slice exits + anti-laziness goal  
4. `QUALITY_RITUAL.md` for iteration floors + shot IDs + rubric  
5. `spaceface-blender-pipeline` + three pass skills + `professional-techniques.md`  
6. `FULL_GRAPHICS_REVAMP_GOAL.md` for whole-kit process when expanding past Top 50  
7. `BP-08` for faction silhouettes / missing gameplay assets  
8. Exporter contract: `tools/blender/spaceface_export.py` (never relax assertions)

**Taste:** `design/spec2/00_MASTER_TASTE.md` Forbidden list still rejects diffs (including HUD visor motifs).

---

## 2. Build philosophy

### 2.1 Effort multiplier (non-negotiable)

Agents default to **~5–10% of real craft**. This plan forces **10–20× that effort**:

| Lazy failure mode | Required behavior |
|---|---|
| One blockout, call it done | **≥20** full iteration cycles (hero/standard 3D); **≥10** small props |
| Tiny nudge each iter (“add a bevel”) | Each iter **rebuilds ≥50% of the remaining gap** toward the full goal for that pass |
| Cropped / dark / partial screenshots | **Invalid** — subject must be fully framed; redo before counting |
| “Loads in Blender / exported GLB” | Not done until **release + checks + in-game authored screenshot** |
| Flat gray / single material | Fail **Material zones** + **Wear/story** criteria |
| Skip techniques doc | Every deficiency list **names** techniques from `professional-techniques.md` |
| Stop after starter only | Forbidden by FGRG; this plan still requires **Slice A exit** then continue |

### 2.2 Three professional passes (every hero 3D asset)

| Pass | Skill | Gate |
|---|---|---|
| **Modeling** | `spaceface-blender-blockout` | Clay form would pass pro scrutiny (macro/meso/micro, bevel language, silhouette 5/5) |
| **Surfacing** | `spaceface-blender-hardsurface` | Baked AO/normal/roughness (ORM), wear, decals, material roles, lit rubric ≥4 |
| **Life & polish** | `spaceface-blender-surface-pass` | Secondary life, thruster/gun readiness, sockets/hooks, final lit set |

Distant C-tier props may abbreviate Life pass; **never** for ranks 1, 6–8, 11, 16–21, 28–29, 31–32, 48.

### 2.3 Fidelity tiers

| Tier | Use | Iter floor | Budget posture |
|---|---|---:|---|
| **A — Hero** | Starter ship, trailer stations, landmarks, massline VFX | 20 | Full bake set; raise budget only with rationale + perf proof |
| **B — Cast** | Common NPCs, archetype stations, engines/weapons | 20 | Shared materials; strong silhouette |
| **C — Crowd** | Debris, simple rocks, distant traffic dressing | 10 | Instanced / efficient; still bevel + AO |

### 2.4 Parallel tracks (meshes alone are not enough)

| Track | Thread | Owns ranks (approx.) |
|---|---|---|
| Kit 3D | **A** | Parts, hulls, modules |
| World 3D | **B** | Stations, landmarks, props (after lock) |
| Wholeship repair | **E** | Blocked wholeships only (exclusive vs A) |
| Wiring | **C** | `partsLibrary`, anchors, manifests after handoff |
| Presentation | **D** | VFX, camera, lighting, thrusters, LODs |
| Integrator | daily | Release build + checks |

**One Blender lock at a time** (`BLENDER_EXCLUSIVE_LOCK.md`).

---

## 3. Top 50 production slate (priority order)

**Classes:** `SHIP` · `PART` · `STATION` · `LANDMARK` · `PROP` · `VFX` · `ENV` · `UI2D` · `AUDIO-VIS` · `RUNTIME`

| # | ID / pack name | Class | Thread | Slice | Concrete targets (repo IDs / systems) |
|---:|---|---|---|---|---|
| 1 | Player starter hero | SHIP | A (+ code-native overlay) | A | `hull_starter` + Hitch/`kestrelHero` path; engines/fins/cockpit used on starter |
| 2 | Massline VFX pack | VFX | D | A | Latch, taut, break, whip in `vfx.js` / profiles |
| 3 | Thruster + RCS VFX | VFX | D | A | Idle / boost / cruise; socket-driven |
| 4 | Primary thruster mesh | PART | A | A | `engine_vector` or `engine_ion_twin` + starter mount |
| 5 | Combat feedback VFX | VFX | D | A | Hit spark, shield pop, hull breach |
| 6 | Helios trade hub (hero) | STATION | B | A | `place_station_trade_hub` — unique exterior, not generic brick |
| 7 | Helios landmark | LANDMARK | B | A | `landmark_beacon_spire` or sector monument |
| 8 | Gate + transit | STATION+VFX | B+D | A | `place_gate_jump_ring` + charge/streak VFX |
| 9 | Mining VFX pack | VFX | D | A | Beam, break, ore chunks |
| 10 | Helios sky/lighting kit | ENV | D | A | Sector palette, nebula, fog, dust (SPEC3-F8) |
| 11 | Fighter hull | SHIP | A | B | `hull_fighter` (Wasp path) |
| 12 | Kinetic/energy hardpoints | PART | A | B | `weapon_pulse_cannon`, `weapon_heavy_cannon` / gatling family |
| 13 | Chase camera juice | RUNTIME | D | A | Closer chase option, bank-readable framing |
| 14 | Asteroid hero set | PROP | B | A | rock_a/b/c + seamed + 1 ore-hero surface response |
| 15 | Death / explosion pack | VFX | D | B | S/M/L explosions + debris |
| 16 | Military station | STATION | B | C | `place_station_military` faction silhouette (BP-08) |
| 17 | Mining + refinery stations | STATION | B | C | `place_station_mining`, `place_station_refinery` |
| 18 | Blackmarket station | STATION | B | C | `place_station_blackmarket` |
| 19 | Freighter hull | SHIP | A | E | `hull_freighter` |
| 20 | Mining barge hull | SHIP | A | B | `hull_miner` |
| 21 | Interceptor hull | SHIP | A | B | `hull_interceptor` |
| 22 | Hunter signature rails 1–4 | PART | A | B | `hunter_sig_rail_01`…`04` (`QUEUE.md`) |
| 23 | Cockpit set | PART | A | A/B | `cockpit_dome`, `recessed`, `slab` |
| 24 | Fin / wing set | PART | A | A/B | delta, wedge, radiator, swept (manifest fins) |
| 25 | Greeble kit | PART | A | B | antennas, vents, pipes, RCS, armor, hatches |
| 26 | Hulk + debris kit | PROP | B | C | `place_dead_hulk`, debris variants |
| 27 | Nav language props | PROP | B | C | lane beacon, nav buoy, billboard |
| 28 | Corvette / gunship hulls | SHIP | A | E | `hull_corvette`, `hull_gunship` |
| 29 | Capital silhouette | SHIP | A | E | `hull_capital` (+ frigate if trailer needs scale) |
| 30 | Faction material language | PART/MAT | A+D | E | 8 fleet trims; accent variants in manifest |
| 31 | Landmarks — Ashfall + Veil | LANDMARK | B | C | wreck cathedral, veil obelisk |
| 32 | Landmarks — Pit / Vault / Tower | LANDMARK | B | C | pit_anchor, vault_maw, tower_crown |
| 33 | Weapon VFX differentiation | VFX | D | B | pulse / kinetic / beam / plasma / missile / flak |
| 34 | Shield + damage decals | VFX | D | B | bubble + atlas |
| 35 | Cruise / gate streak | VFX+ENV | D | A/C | continuous travel feel |
| 36 | Planet cards (10 sectors) | ENV | D | C | background bodies / parallax plates |
| 37 | Dock berth + shipyard stages | STATION | B | C | dock interiors (UI + exterior berth) |
| 38 | Industrial density props | PROP | B | C | conveyor barge, mining drone, cargo yard pieces |
| 39 | Module visuals | PART | A | E | drill, cargo pod, shield, winch, claw (`QUEUE.md`) |
| 40 | Icon atlas | UI2D | UI lane | D | commodities, weapons, modules, POIs, status |
| 41 | Cinematic portraits pack | UI2D | UI lane | D | named + roles (non-sticker, non-visor-HUD) |
| 42 | Steam key art set | UI2D | Marketing | D | capsule, library, 4–6 stills matching **in-game** |
| 43 | Liquid glass UI juice | RUNTIME | UI | D | DOM + canvas sync; data-dense, not prose |
| 44 | Map/scanner silhouettes | UI2D | UI | D | ship 2D silhouettes + markers |
| 45 | Night emissives / station windows | RUNTIME | D | C | light language after dark |
| 46 | Engine audio-visual sync | AUDIO-VIS | Audio+D | A | glow/heat ramps tied to procedural audio |
| 47 | Massline audio bed | AUDIO-VIS | Audio+D | A | spool / taut / break |
| 48 | Faction NPC heroes | SHIP | A (+ code builders) | E | Concord, Meridian, Quiet, Drift signature looks |
| 49 | Anomaly / hazard language | ENV | D | E | Veil, Ashfall war-wash, hazard readability |
| 50 | Perf contract (LOD/instance/batch) | RUNTIME | D+Perf | all | 60 fps browser path; no silent quality cliffs |

**Note:** Several ranks are **packs**. Completing rank 2 means the full latch/taut/break/whip family, not one particle.

### 3.1 Mapping to existing inventories

| Source | Relationship |
|---|---|
| `needed-assets.md` §A (63 parts) | Top 50 **prioritizes** which of these get hero attention first; FGRG still owns finishing the rest |
| `assets/QUEUE.md` | Landmarks, hunter rails, claim modules, module_vis — appear as ranks 22, 31–32, 39 |
| BP-08 P0–P5 | Stations/landmarks/wrecks/gates — Slice C + ranks 16–18, 26, 8 |
| Blocked wholeships | Thread E only after real hull body; do **not** wire accessory-only GLBs |

---

## 4. Execution slices (do these in order)

Do **not** open all 50 in parallel. One Blender owner; D/UI can parallel if no lock conflict.

### Slice A — “Undock and believe” (ranks 1–10, 13–14 core)

**Goal:** 30 seconds after New Game, the game looks like a commercial space product.

| Must ship | Exit criteria (all required) |
|---|---|
| Starter hull + supporting parts at pro bar | No floating white/emissive junk; silhouette 5/5; in-game authored path |
| Massline + thruster + hit VFX | Latch readable; boost trails present; hits not “whisper” |
| Helios hub + 1 landmark + rock set | Destinations findable; screenshot names the place |
| Gate + Helios sky kit | Travel + depth |
| Chase camera option | Bank/nose readable in wide shot |

**Exit artifacts:**
- `.devshots/slice-A/undock-wide.png`
- `.devshots/slice-A/undock-close.png`
- `.devshots/slice-A/massline-latch.png`
- `.devshots/slice-A/station-approach.png`
- Optional 5–10s GIF/mp4 of undock → station course

**Human gate:** “Would I put this still on the Steam page?” If no → continue iterating; do not open Slice B as an excuse to abandon A.

### Slice B — “Fight and mine look real” (11–12, 15, 20–22, 33–34)

Fighter/weapons, mining barge, combat VFX differentiation, hunter rails 1–4, explosions.

**Exit:** Combat and mining stills where weapon type is readable without HUD text; hunter silhouette distinct.

### Slice C — “World has places” (16–18, 26–27, 31–32, 37–38)

Faction stations, landmarks, dressing flood, dock stages.

**Exit:** Three different sectors/stations identifiable from paused screenshots alone.

### Slice D — “Retail surfaces” (40–47, 42–44)

Icons, portraits, key art, glass juice, audio-visual sync.

**Exit:** Station bar + market + one key art frame match product constitution (glass, data-first, cinematic faces).

### Slice E — “Scale & fleets” (19, 28–30, 48–50)

Haulers, capitals, faction materials, NPC heroes, perf lock.

**Exit:** Capital or fleet still works as trailer scale; `check:perf` / hitch budget honest; no quality cliffs.

---

## 5. Quality gates (hard)

### 5.1 Per-iteration gate (every counted iter)

An iteration **only counts** if **all** of the following are true:

1. **Full-view law:** Subject fully visible in `clay_34_full` and `lit_34_full` (see `QUALITY_RITUAL.md` shot table). Cropped / black void / auto-frame miss = **0 credit**.  
2. **Shot set saved** under `assets/ships/parts/revamp-evidence/<id>/renders/` with `iterN` in filename (3D), or `.devshots/<slice>/` for RUNTIME/VFX.  
3. **Written assessment** in `deficiency.md` or ledger: ≥5 deficiencies (≥8 hero), each naming a technique from `professional-techniques.md`.  
4. **Substantial rebuild:** Next change addresses ≥50% of listed critical deficiencies for that pass — not a single micro-tweak “to save the next iter.”  
5. **Weighted self-score** recorded (see §5.2).  
6. **`iteration_ledger.json`** incremented.

### 5.2 Weighted rubric (score 1–5 every iter)

| Criterion | Weight | Pass for export (hero) |
|---|---:|---|
| **Silhouette** (readable at game chase / 34 full) | 20% | **= 5** |
| **Macro / meso / micro hierarchy** | 15% | ≥ 4 |
| **Bevel language / edge craft** | 10% | ≥ 4 |
| **Material zones** (hull / accent / mechanical / glass) | 15% | ≥ 4 |
| **Wear / story / character** | 15% | ≥ 4 |
| **Scale truth** (bounds, mounts, origin) | 10% | **= 5** |
| **Lighting readability** (emissive control, form in shadow) | 10% | ≥ 4 |
| **Contract readiness** (roles, maps, chamfer path) | 5% | ≥ 4 |

**Weighted score** = Σ (score × weight).  
**Export bar (hero):** weighted ≥ **4.4** and no hard-fail on silhouette or scale (must be 5).  
**Export bar (standard part):** weighted ≥ **4.2**, silhouette ≥ 4, scale = 5.  
**Export bar (small prop):** weighted ≥ **4.0**, silhouette ≥ 4.

Compare every iter ≥3 against: concept/bible plane, previous iter, and mental bar “2026 ArtStation WIP / Eve-class surface.”

### 5.3 Per-asset completion gate (3D)

Asset is **DONE** only when:

| # | Gate | Proof |
|---:|---|---|
| G1 | Iter floor met | ledger `iter` ≥ 20 (or 10 prop) |
| G2 | Three passes executed | modeling → surfacing → life entries in ledger |
| G3 | Rubric export bar met | last lit set scores in `deficiency.md` |
| G4 | Exporter clean | `spaceface_export.py` / `finalize_part.mjs` **zero** assertion failures |
| G5 | Source on disk | `assets/ships/parts/<cat>/<id>.glb` (+ `.blend` if authored) |
| G6 | Evidence bundle | `revamp-evidence/<id>/{deficiency.md,iteration_ledger.json,renders/,finalize.log}` |
| G7 | Handoff written | `design/graphics-sprints/handoffs/*.yaml` per `HANDOFF_TEMPLATE.md` |
| G8 | Integrator release | `npm run build:sg04:release-assets` |
| G9 | Live checks | `check:assets:live`, `check:asset-reachability`, `check:visual-stability` (and station checks if place) |
| G10 | In-game authored | Screenshot proves **authored** mesh (not procedural fallback / boxes) |
| G11 | No sore thumbs | 5-second stare test on hero frame (constitution pillar 7) |

**Forbidden “done” claims:** loads in Blender · GLB exists · “looks fine” without shots · iter &lt; floor · release not built · only beauty render, no game shot.

### 5.4 Per-pack completion gate (VFX / ENV / RUNTIME / UI)

| # | Gate | Proof |
|---:|---|---|
| P1 | Spec events covered | Checklist of states (e.g. massline: idle/fire/latch/taut/break) |
| P2 | ≥10 verify cycles | change → play/probe → note → fix |
| P3 | Wide + close `.devshots` | full subject, correct game camera language |
| P4 | Perf honest | no silent quality drop; hitch/perf check when touching render loop |
| P5 | Determinism | sim-affecting changes use `state.rng` / no golden cheats |
| P6 | Taste | no visor HUD; non-diegetic chrome |

### 5.5 Slice completion gate

| Slice | Gate |
|---|---|
| A | All Slice A exit artifacts exist; human “Steam still?” yes; G9 green for touched assets |
| B | Weapon/mine/fight stills readable; hunter rails 1–4 live or explicitly deferred with director sign-off |
| C | ≥3 place identities from screenshots; landmarks ≥3 wired or release-built |
| D | Icon + portrait + key art paths exist; UI not prose-walls on market |
| E | Fleet/capital still + perf check; faction trims visible |

### 5.6 Integration gate (daily)

Run `INTEGRATION_GATE.md` fully. **Thread C may wire only `RELEASE_BUILT` IDs.**

### 5.7 Never do

- Relax exporter / chamfer / hull-body assertions to force green  
- Wire blocked wholeships (`WHOLE_SHIP_FILE_BY_DEF_ID` stays empty until real hulls)  
- Edit `test/*.expected.json` to fake sim  
- `git checkout` / `reset --hard` / `stash` on tracked files  
- Touch `assets/**` or `src/render/**` while another graphics lock/owner is active  
- Claim “full revamp done” after only starter or only one category  

---

## 6. Workflow (agent operating loop)

```
┌─────────────────────────────────────────────────────────────┐
│ 0. Director assigns ONE slice item / ONE asset ID           │
│ 1. Read: this file §5 + QUALITY_RITUAL + pipeline skill     │
│ 2. Acquire blender.LOCK (if 3D)                             │
│ 3. Inspect current → iter0 full-view shots + scores         │
│ 4. Define character (3–5 sentences)                         │
│ 5. LOOP until export bar + iter floor:                      │
│      full-view render set → score → deficiency list →       │
│      LARGE rebuild (≥50% gap) → techniques named → ledger   │
│ 6. Export → finalize → evidence bundle                      │
│ 7. Handoff YAML → release lock                              │
│ 8. Integrator: release build + checks                       │
│ 9. In-game screenshots → only then mark DONE                │
│ 10. Next asset — do NOT skip remaining slice items          │
└─────────────────────────────────────────────────────────────┘
```

**Batch size:** Thread A = one category (e.g. engines) or **one hero** at a time for ranks 1/6/7. Never “all 63 this session” if it causes early stop.

**Time posture:** Prefer **one asset at true bar** over five half-done. Incomplete assets stay **not done** in status — honesty over vanity counts.

---

## 7. Status tracking

Maintain rows in `assets/ASSET_STATUS.json` (or create) per integrator:

```json
{
  "hull_starter": {
    "top50_rank": 1,
    "slice": "A",
    "lifecycle": "RELEASE_BUILT",
    "art": "full_finish",
    "iterations": 20,
    "weighted_score": 4.6,
    "in_game_shot": ".devshots/slice-A/undock-wide.png",
    "handoff": "design/graphics-sprints/handoffs/..."
  }
}
```

Director reviews slice exits with shots — **transcripts are not proof**.

---

## 8. Relationship to FGRG / long tail

| After Top 50 slices | Still required for full FGRG |
|---|---|
| Slice A–E complete | Remaining manifest parts not in Top 50 get full 20-iter pass |
| | BP-08 wrecks, comm beacon, extra gate variants |
| | Claim/empire props when Wave 6 opens |
| | ASSET_STATUS populated for **all** LIVE assets |

Top 50 is the **spine**. FGRG is the **completion law** for every authored GLB. Never lower FGRG’s bar when doing long-tail work.

---

## 9. Copy-paste goals

Use **§9.1** for a multi-asset / slice campaign that must not quit early.  
Use **§9.2** for a single-asset hero (Blender MCP).  
Use existing `GOAL_PROMPTS.md` threads when staying inside A/B/C/D/E isolation.

---

### 9.1 MASTER GOAL — Top-50 Wonder Campaign (anti-lazy, no early stop)

Copy everything in the fence as the session goal:

```
# GOAL: SpaceFace Top-50 Wonder Build — NO EARLY STOP / NO LAZY HALF-ASSETS

You are executing the professional 2026 visual overhaul for SpaceFace under:
design/graphics-sprints/TOP50_WONDER_BUILD_PLAN.md

## North star
Produce assets and presentation at a real 2026 hard-surface + VFX bar (Eve / modern space-sim
readable at game scale). Wonder + tactile feedback. Clay placeholders and “good enough browser
indie” are failures. Target enables Steam ~$30 store stills and Freelancer-successor fantasy.

## Read first (mandatory, in order)
1. Agents.md §3 + §6 concurrent graphics + §10 lanes
2. design/vision/00_CONSTITUTION.md pillars 2, 7, 8
3. design/graphics-sprints/TOP50_WONDER_BUILD_PLAN.md (THIS plan — build order + gates)
4. design/graphics-sprints/QUALITY_RITUAL.md
5. design/graphics-sprints/00_ORCHESTRATION.md + BLENDER_EXCLUSIVE_LOCK.md
6. .grok/skills/spaceface-blender-pipeline/SKILL.md
7. .grok/skills/spaceface-blender-pipeline/references/professional-techniques.md
8. assets/AGENTS.md (ship stack, blocked wholeships, registries)
9. tools/blender/spaceface_export.py contract (do not relax)
10. FULL_GRAPHICS_REVAMP_GOAL.md §2–3 (quality bar — never lower)
11. design/revamp/BP-08_VISUAL_ASSET_SPEC.md §0 for station/landmark identity when relevant

## Your assignment this session
Slice: <SLICE_LETTER>   (A | B | C | D | E)
Asset / pack IDs (only these — do not wander): <ASSET_OR_PACK_IDS>
Thread role: <A|B|C|D|E|INTEGRATOR|UI>

If Blender is required: acquire assets/ships/blender.LOCK first. If lock held by another owner, STOP.

## Effort law (you will violate this unless you re-read it every asset)
- Default agent effort is too low. Work at **10–20×** normal “one pass and ship” effort.
- Minimum iterations: **20** for hero/standard 3D; **10** for small props; **10 verify cycles** for code/VFX/UI packs.
- Each iteration = full-view render set → weighted score → written deficiencies → **large rebuild**.
- **≥50% rule:** every iteration must attempt to close most of the remaining gap for the *current pass*
  (modeling OR surfacing OR life), not a cosmetic 5% nudge “because another iter is coming.”
- You are building toward the **whole goal each time** (complete form / complete surface / complete life),
  then critiquing and rebuilding. Tiny incrementalism is forbidden.
- Partial-view, cropped, black-void, or auto-framed-miss screenshots **do not count**.
- Do not stop because you are “tired of the asset,” context is long, or “it’s better than before.”
  Stop only when §5.3 / §5.4 gates in TOP50_WONDER_BUILD_PLAN.md are met with evidence paths.

## 3D pipeline (when Thread A/B/E)
For EACH id:
1. Inspect current GLB/blend via Blender MCP; iter0 full-view clay+lit set; score rubric.
2. Write character brief (3–5 sentences: role, faction wear, silhouette promise).
3. Modeling Pass (blockout skill): iterate until clay silhouette=5, hierarchy≥4, professional techniques visible.
4. Surfacing Pass (hardsurface skill): full node layering, bakes (AO/N/rough ORM), wear, decals, material roles.
5. Life Pass (surface-pass skill): secondary life, sockets/hooks, thruster/gun readiness.
6. Every iter: shots clay_34_full, clay_front, clay_side, lit_34_full, lit_close_detail
   (+ lit_nozzle / lit_muzzle when engines/weapons). Distance = ritual law (subject fully in frame).
7. deficiency.md: ≥5 items (≥8 hero), name techniques from professional-techniques.md.
8. iteration_ledger.json after every iter.
9. Export via spaceface_export.py / finalize_part.mjs — zero failures.
10. Evidence under assets/ships/parts/revamp-evidence/<id>/
11. Handoff YAML to design/graphics-sprints/handoffs/
12. Release blender.LOCK when batch done.

## VFX / RUNTIME / UI packs (when Thread D / UI)
- Implement full state checklist for the pack (e.g. massline: fire, latch, taut, break, whip).
- ≥10 verify cycles with .devshots wide+close under .devshots/slice-<X>/
- Prefer structural perf (LOD, pool, batch); never silent quality cliffs or browser/desktop divergence.
- Sync audio hooks when ranks 46–47 are in scope (procedural Web Audio + visual ramp).

## Quality bar (fail any → not done)
- Weighted rubric export bar (plan §5.2)
- No sore-thumb geometry on hero frames
- In-game screenshot shows authored asset (not procedural fallback boxes)
- Checks: as applicable — check:assets:live, check:asset-reachability, check:visual-stability,
  station load/wiring, check:flight:clean / check:perf when touching flight/render
- Never edit test/*.expected.json
- Never wire blocked wholeships
- Never git reset/stash/checkout tracked tree

## Anti-goals
- Stopping after “improved a bit”
- Declaring slice done without exit artifacts in plan §4
- Expanding scope to unlisted IDs to avoid finishing the hard hero
- Meshy / image-to-3D as mesh substitute
- Three.js metalness slider “fix” instead of fixing the GLB
- Visor/cockpit HUD motifs

## Continuity
If context limits force a pause: write CONTINUATION.md in the evidence or handoff folder with:
- exact iter number, last scores, remaining deficiencies, next techniques, file paths.
The next agent must resume from that file — not restart from zero and not skip to a new asset.

## Definition of done for this session
- Every assigned ID meets DONE gates in TOP50_WONDER_BUILD_PLAN.md §5.3 or §5.4
- Exit screenshots for the slice listed in §4 exist on disk
- 15-line summary: IDs, iter counts, weighted scores, check commands+results, shot paths, blockers

Begin with the highest-rank incomplete ID in your assignment. Do not quit early.
```

---

### 9.2 SINGLE HERO GOAL — one asset, maximum rigor

```
# GOAL: Single hero asset — 20 full rebuild iterations — 2026 pro bar

Read design/graphics-sprints/TOP50_WONDER_BUILD_PLAN.md §5 + QUALITY_RITUAL.md +
spaceface-blender-pipeline SKILL + professional-techniques.md + assets/AGENTS.md.

Asset ID: <ID>
Top-50 rank: <N>
Character target: <one paragraph from BP-08 / needed-assets / QUEUE>

Rules:
- Acquire blender.LOCK. Use Blender MCP heavily.
- Minimum **20** iterations. Each iteration: FULL-VIEW shot set (no crops) → score all rubric rows →
  write ≥8 deficiencies naming techniques → rebuild **most of the remaining gap** (not a tiny tweak).
- Pass order: Modeling until clay is pro → Surfacing until lit is pro → Life until ready to export.
- Attempt the **whole pass goal** every modeling/surfacing cycle; critique; rebuild.
- Effort: 10–20× normal. Do not stop at “better than before.”
- Done only when weighted ≥4.4 (hero), silhouette=5, scale=5, exporter green, release built,
  check:assets:live green, in-game authored screenshot saved.
- Evidence: assets/ships/parts/revamp-evidence/<ID>/
- Handoff YAML when complete.

Forbidden: early stop, cropped shots, relaxing exporter, wiring blocked wholeships, git destructive commands.

Print: iter count, final scores, shot paths, check output.
```

---

## 10. Director checklist (human)

Before accepting a graphics session:

- [ ] Shot paths open and subject is fully framed  
- [ ] `iteration_ledger.json` iter ≥ floor  
- [ ] Weighted scores present; silhouette/scale hard gates  
- [ ] In-game shot is authored (not fallback)  
- [ ] Checks cited with real command output  
- [ ] Handoff exists; lock released  
- [ ] Slice exit artifacts updated if slice claimed complete  

If any box fails → **reject done claim**; resume with §9.1 CONTINUATION rules.

---

## 11. Quick links

| Doc | Role |
|---|---|
| `QUALITY_RITUAL.md` | Shot IDs, iter floors, evidence layout |
| `00_ORCHESTRATION.md` | Thread isolation + daily integrate |
| `GOAL_PROMPTS.md` | Per-thread paste prompts |
| `INTEGRATION_GATE.md` | Release + checks |
| `FULL_GRAPHICS_REVAMP_GOAL.md` | Full-kit process master |
| `design/revamp/BP-08_VISUAL_ASSET_SPEC.md` | Missing assets + faction silhouettes |
| `needed-assets.md` | Inventory + story roles |
| `assets/QUEUE.md` | Queued landmarks/rails/modules |
| `.grok/skills/spaceface-blender-pipeline/` | Three passes + techniques |

---

*Built for agents that stop early. The gates and §9 goals exist to make half-finished clay impossible to call done.*
