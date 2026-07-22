# Top-50 Wonder Build Plan

> **ACTIVE PRIORITY SPINE.** This file owns the ranked order and slice outcomes. It does not own global
> program status, impose iteration quotas, or replace independent visual judgment. It also does not
> activate a sprint merely by being discovered: a user/lead or the program ledger must select a bounded
> slice before its thread prompts and ownership lanes apply. Start at `README.md`.

**Status:** LIVE — director-facing visual production slate
**Date:** 2026-07-09  
**Owner:** Human director + graphics / presentation agents  
**Authority:** `README.md` · this file (order) · `FULL_GRAPHICS_REVAMP_GOAL.md` (coverage/outcome) ·
`design/revamp/BP-08_VISUAL_ASSET_SPEC.md` (coverage/identity) · live contracts/checks

---

## 0. Why this document exists

| Problem | This doc’s job |
|---|---|
| Agents stop after half-done clay | Outcome gates and a copy-paste goal that requires player-route evidence |
| “Revamp everything” is too large to start | **Top 50 ranked** + **5 slices** with clear exit shots |
| FGRG / BP-08 / QUEUE overlap confuses agents | **One priority spine** for store-page + first-hour wonder |
| Screenshots crop or fake progress | Fully framed context views, independent critique, and evidence paths |
| Mesh work without VFX/UI/audio leaves clay universe | Ranks include **RUNTIME / VFX / UI2D / AUDIO-VIS** |

**Prime directive:** Space games live on wonder + tactile feedback. Excellent systems under clay placeholders do not sell at ~$30. Target is **real 2026 hard-surface + presentation** (Eve / modern space-sim bar at game scale), browser-safe via LOD/instancing/batching.

**This is not “polish a few parts then declare victory.”** Slice A must produce **Steam-quality undock frames**. Slices B–E fill combat, density, retail, and fleet scale. The full kit (~70 GLBs + BP-08 gaps) still lives under FGRG — this file is the **order of attack** that maximizes player-visible value.

---

## 1. Authority chain (when docs disagree)

1. Root `AGENTS.md` for repository safety, live paths, ownership, and performance doctrine.
2. `README.md` for graphics-document authority and quality doctrine.
3. **This file** for Top-50 order and slice exits.
4. `FULL_GRAPHICS_REVAMP_GOAL.md` for whole-kit coverage and outcome bar.
5. `BP-08` for faction silhouettes and missing gameplay assets.
6. `QUALITY_RITUAL.md` for evidence/critique structure.
7. Exporter/runtime contracts and current checks for technical truth.

---

## 2. Build philosophy

### 2.1 Outcome discipline

| Lazy failure mode | Required behavior |
|---|---|
| One blockout, call it done | Review modeling, surfacing, life, and the live player route before acceptance |
| Tiny cosmetic changes avoid the main gap | Make the largest coherent improvement justified by current critique |
| Only cropped / dark / partial screenshots | Add a fully framed neutral and lit context view |
| “Loads in Blender / exported GLB” | Not done until **release + checks + in-game authored screenshot** |
| Flat gray / single material | Fail **Material zones** + **Wear/story** criteria |
| Apply a universal technique recipe | Choose techniques because they solve the asset's actual visible gaps |
| Treat one improved asset as the whole slice | Claim only the assets and slice outcomes actually proven; retain unfinished admitted work in the current program backlog |

### 2.2 Professional review dimensions (apply as the asset requires)

| Dimension | Useful skill | Evidence question |
|---|---|---|
| **Modeling** | `spaceface-blender-blockout` | Does form, scale, construction, and silhouette work at the game camera? |
| **Surfacing** | `spaceface-blender-hardsurface` | Do materials, surface story, and lighting response work in the actual renderer? |
| **Life & polish** | `spaceface-blender-surface-pass` | Do motion, function, sockets/hooks, wear, and final presentation support this asset's role? |

Use as many of these dimensions and techniques as the visible deficiencies require. Do not force a
fixed pass count, technique checklist, or rank-based ceremony when current evidence supports a more
direct route to the same professional result.

### 2.3 Fidelity tiers

| Tier | Use | Review posture | Performance posture |
|---|---|---|---|
| **A — Hero** | Starter ship, trailer stations, landmarks, massline VFX | Highest scrutiny across context and detail | Measure; use appropriate LOD/HLOD and structural optimization |
| **B — Cast** | Common NPCs, archetype stations, engines/weapons | Strong role/faction read at play distance | Share/cache materials where coherent; preserve identity |
| **C — Crowd** | Debris, rocks, distant traffic dressing | Convincing composition and variation at its actual screen size | Instance, batch, cull, and simplify only where visually equivalent |

### 2.4 Parallel tracks (meshes alone are not enough)

| Track | Thread | Owns ranks (approx.) |
|---|---|---|
| Kit 3D | **A** | Parts, hulls, modules |
| World 3D | **B** | Stations, landmarks, props (after lock) |
| Wholeship repair | **E** | Blocked wholeships only (exclusive vs A) |
| Wiring | **C** | `partsLibrary`, anchors, manifests after handoff |
| Presentation | **D** | VFX, camera, lighting, thrusters, LODs |
| Integrator | daily | Release build + checks |

**One active writer for overlapping Blender/source-GLB paths at a time.** Verify marker, process,
heartbeat, and current edits per `BLENDER_EXCLUSIVE_LOCK.md`; stale markers do not reserve the lane.

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
| 43 | UI polish juice | RUNTIME | UI | D | DOM + canvas sync; data-dense, not prose; intentional screen-specific materials and measured compositor cost |
| 44 | Map/scanner silhouettes | UI2D | UI | D | ship 2D silhouettes + markers |
| 45 | Night emissives / station windows | RUNTIME | D | C | light language after dark |
| 46 | Engine audio-visual sync | AUDIO-VIS | Audio+D | A | glow/heat ramps tied to the shared audio event/mix path |
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

Select coherent slices whose file sets and review surfaces can complete together. Parallelize
non-overlapping Blender, runtime, and UI work while keeping a single verified writer on each
overlapping source-GLB path.

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

Icons, portraits, key art, UI polish juice, audio-visual sync.

**Exit:** Station bar + market + one key art frame match product constitution (clean chrome, data-first, cinematic faces).

### Slice E — “Scale & fleets” (19, 28–30, 48–50)

Haulers, capitals, faction materials, NPC heroes, perf lock.

**Exit:** Capital or fleet still works as trailer scale; `check:perf` / hitch budget honest; no quality cliffs.

---

## 5. Quality gates

### 5.1 Review evidence

Save representative fully framed neutral and lit views, useful detail views, and a current player-route
screenshot. Record the visible gaps that matter and how the revision addressed them. Compare against relevant
concepts, the prior result, adjacent in-game assets, and professional genre references when useful.

Use the categories in `QUALITY_RITUAL.md` as critique prompts, not a numeric scorecard. Iteration counts,
deficiency counts, technique counts, and author self-scores have no acceptance weight.

### 5.2 Per-asset completion gate (3D)

Asset is **DONE** only when:

| # | Gate | Proof |
|---:|---|---|
| G1 | Visual outcome reviewed | independent critique of current context/detail/player-route views |
| G2 | Relevant passes complete | modeling, surfacing, and life/polish as appropriate to the asset's role |
| G3 | Identity and craft hold up | silhouette, hierarchy, materials, story, scale, and lighting are convincing |
| G4 | Exporter clean | `spaceface_export.py` / `finalize_part.mjs` **zero** assertion failures |
| G5 | Source on disk | `assets/ships/parts/<cat>/<id>.glb` (+ `.blend` if authored) |
| G6 | Evidence bundle | current critique, representative renders, exporter log; optional chronology |
| G7 | Handoff written | `design/graphics-sprints/handoffs/*.yaml` per `HANDOFF_TEMPLATE.md` |
| G8 | Integrator release | `npm run build:sg04:release-assets` |
| G9 | Live checks | `check:assets:live`, `check:asset-reachability`, `check:visual-stability` (and station checks if place) |
| G10 | In-game authored | Screenshot proves **authored** mesh (not procedural fallback / boxes) |
| G11 | No sore thumbs | independent review of the complete hero frame |

**Forbidden “done” claims:** loads in Blender · GLB exists · “looks fine” without evidence · release not built ·
only a beauty render with no current game shot.

### 5.3 Per-pack completion gate (VFX / ENV / RUNTIME / UI)

| # | Gate | Proof |
|---:|---|---|
| P1 | Spec events covered | Checklist of states (e.g. massline: idle/fire/latch/taut/break) |
| P2 | Coherent verification | relevant checks and player/probe evidence; diagnose and rerun failures |
| P3 | Wide + close `.devshots` | full subject, correct game camera language |
| P4 | Perf honest | no silent quality drop; hitch/perf check when touching render loop |
| P5 | Determinism | sim-affecting changes use `state.rng` / no golden cheats |
| P6 | Taste | no visor HUD; non-diegetic chrome |

### 5.4 Slice completion gate

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
│ 2. Verify and record the current 3D writer/paths            │
│ 3. Inspect current → representative context/detail shots    │
│ 4. Define character (3–5 sentences)                         │
│ 5. Repair the meaningful gaps shown by current evidence     │
│ 6. Export → finalize → evidence bundle                      │
│ 7. Handoff YAML → release or transfer live ownership       │
│ 8. Integrator: release build + checks                       │
│ 9. In-game screenshots → only then mark DONE                │
│ 10. Update the program with proven and remaining outcomes   │
└─────────────────────────────────────────────────────────────┘
```

**Batch sizing:** choose the largest coherent batch that can be authored, reviewed, integrated, and
proven without hiding half-built work. Asset rank does not impose a universal one-at-a-time ritual.

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
    "visual_review": "independent review passed; see evidence path",
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
| Slice A–E complete | Remaining manifest parts not in Top 50 receive the same outcome/evidence bar |
| | BP-08 wrecks, comm beacon, extra gate variants |
| | Claim/empire props when Wave 6 opens |
| | ASSET_STATUS populated for **all** LIVE assets |

Top 50 is the **priority spine**. FGRG owns full authored-asset coverage and the professional outcome bar.

---

## 9. Copy-paste goals

Use **§9.1** for a multi-asset / slice campaign with a coherent shared outcome.
Use **§9.2** for a single-asset hero (Blender MCP).  
Use existing `GOAL_PROMPTS.md` threads when staying inside A/B/C/D/E isolation.

---

### 9.1 MASTER GOAL — Top-50 Wonder Campaign

Copy everything in the fence as the session goal:

```
# GOAL: SpaceFace Top-50 Wonder Build — professional player-facing outcome

You are executing the professional 2026 visual overhaul for SpaceFace under:
design/graphics-sprints/TOP50_WONDER_BUILD_PLAN.md

## North star
Produce assets and presentation at a real 2026 hard-surface + VFX bar (Eve / modern space-sim
readable at game scale). Wonder + tactile feedback. Clay placeholders and “good enough browser
indie” are failures. Target enables Steam ~$30 store stills and Freelancer-successor fantasy.

## Read first (mandatory, in order)
1. AGENTS.md §3 + §6 concurrent graphics + §10 lanes
2. design/graphics-sprints/README.md
3. design/graphics-sprints/TOP50_WONDER_BUILD_PLAN.md (THIS plan — build order + gates)
4. design/graphics-sprints/QUALITY_RITUAL.md
5. design/graphics-sprints/VISUAL_ITERATION_PROTOCOL.md
6. design/graphics-sprints/00_ORCHESTRATION.md + BLENDER_EXCLUSIVE_LOCK.md
7. .grok/skills/spaceface-blender-pipeline/SKILL.md
8. .grok/skills/spaceface-blender-pipeline/references/professional-techniques.md
9. assets/AGENTS.md (ship stack, blocked wholeships, registries)
10. tools/blender/spaceface_export.py contract (do not relax)
11. FULL_GRAPHICS_REVAMP_GOAL.md (coverage and outcome bar)
12. design/revamp/BP-08_VISUAL_ASSET_SPEC.md §0 for station/landmark identity when relevant

## Your assignment this session
Slice: <SLICE_LETTER>   (A | B | C | D | E)
Asset / pack IDs (only these — do not wander): <ASSET_OR_PACK_IDS>
Thread role: <A|B|C|D|E|INTEGRATOR|UI>

If Blender is required, verify `assets/ships/blender.LOCK` against live Blender/export processes,
heartbeat, recent writes, and current agent ownership. Coordinate genuine overlap or select
non-overlapping work; recover stale residue safely rather than returning a report-only result.

## Outcome discipline
- Build toward the whole visible goal for the current pass, then critique the result honestly.
- Use representative full-context and detail views; cropped detail views cannot replace a fully framed view.
- Make the largest coherent improvement justified by current evidence. Complete the protocol's minimum
  valid review cycles, continue while blockers remain, and never treat counts or self-scores as proof.
- Select techniques for the asset's actual role, construction, and story rather than applying a universal
  surface recipe.
- Claim completion only when the applicable §5 asset/pack gate and slice evidence are met. If a
  bounded dispatch ends earlier, preserve the working artifact and record the remaining player-facing
  outcome in the current program rather than manufacturing process output.

## 3D pipeline (when Thread A/B/E)
For EACH id:
1. Inspect the current GLB/blend and its player-route presentation; capture the views needed to expose
   real deficiencies.
2. State the asset's role, identity, silhouette, construction, and exposure target concisely enough to
   guide decisions.
3. Repair modeling, surfacing, motion/life, sockets, and authored maps in the combination current
   evidence requires. The named Blender skills are technique references, not mandatory pass counts.
4. Capture representative neutral, lit, detail, and player-route evidence for the resulting claim.
5. Keep `deficiency.md` focused on material remaining gaps and chosen repairs; chronology is optional.
6. Export through `spaceface_export.py` / `finalize_part.mjs` with zero assertion failures.
7. Store evidence under `assets/ships/parts/revamp-evidence/<id>/`, write the handoff YAML, and release
   or explicitly transfer verified ownership when the batch is safe to hand off.

## VFX / RUNTIME / UI packs (when Thread D / UI)
- Implement full state checklist for the pack (e.g. massline: fire, latch, taut, break, whip).
- Verify the coherent change with relevant checks and `.devshots` context/detail views under `.devshots/slice-<X>/`.
- Prefer structural perf (LOD, pool, batch); never silent quality cliffs or browser/desktop divergence.
- Sync audio hooks when ranks 46–47 are in scope (procedural Web Audio + visual ramp).

## Quality bar (fail any → not done)
- Independent review of plan §5 and `QUALITY_RITUAL.md` evidence
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
- current outcome, remaining deficiencies, next justified repairs, and file paths.
The next agent must resume from that file — not restart from zero and not skip to a new asset.

## Definition of done for this session
- Every assigned ID meets the applicable asset or pack gate in TOP50_WONDER_BUILD_PLAN.md §5
- Exit screenshots for the slice listed in §4 exist on disk
- concise summary: IDs, review outcome, check commands/results, player-route and detail evidence paths

Begin with the highest-rank incomplete ID in your assignment. Do not quit early.
```

---

### 9.2 SINGLE HERO GOAL — one asset, maximum rigor

```
# GOAL: Single hero asset — professional player-facing result

Read design/graphics-sprints/TOP50_WONDER_BUILD_PLAN.md §5 + QUALITY_RITUAL.md +
spaceface-blender-pipeline SKILL + professional-techniques.md + assets/AGENTS.md.

Asset ID: <ID>
Top-50 rank: <N>
Character target: <one paragraph from BP-08 / needed-assets / QUEUE>

Rules:
- Verify and record the live Blender/source-GLB owner; stale lock markers do not reserve the lane.
- Use fully framed context views, useful detail views, and written critique sufficient for independent
  review of the claimed result.
- Address modeling, surfacing, motion/life, and integration in the order the asset's actual deficiencies
  require; no fixed number of cycles or techniques proves quality.
- Done only when independent visual review passes, exporter is green, release is built,
  `check:assets:live` is green, and a current in-game authored screenshot is saved.
- Evidence: assets/ships/parts/revamp-evidence/<ID>/
- Handoff YAML when complete.

Forbidden: cropped-only evidence, relaxing exporter contracts, wiring invalid wholeships, destructive
shared-tree git commands, or overwriting verified active concurrent work.

Print: review result, shot paths, and check output.
```

---

## 10. Director checklist (human)

Before accepting a graphics session:

- [ ] Shot paths open and subject is fully framed  
- [ ] Current critique and representative context/detail views exist
- [ ] Independent review covers silhouette, scale, materials, story, and surrounding composition
- [ ] In-game shot is authored (not fallback)  
- [ ] Checks cited with real command output  
- [ ] Handoff exists; lock released  
- [ ] Slice exit artifacts updated if slice claimed complete  

If any box fails → **reject done claim**; resume with §9.1 CONTINUATION rules.

---

## 11. Quick links

| Doc | Role |
|---|---|
| `QUALITY_RITUAL.md` | Review views, critique prompts, evidence layout |
| `00_ORCHESTRATION.md` | Thread isolation + daily integrate |
| `GOAL_PROMPTS.md` | Per-thread paste prompts |
| `INTEGRATION_GATE.md` | Release + checks |
| `FULL_GRAPHICS_REVAMP_GOAL.md` | Full-kit process master |
| `design/revamp/BP-08_VISUAL_ASSET_SPEC.md` | Missing assets + faction silhouettes |
| `needed-assets.md` | Inventory + story roles |
| `assets/QUEUE.md` | Queued landmarks/rails/modules |
| `.grok/skills/spaceface-blender-pipeline/` | Three passes + techniques |

---

*The gates and §9 goals distinguish a coherent player-facing result from partial work without making
iteration ceremony, self-reporting, or process volume a substitute for quality.*
