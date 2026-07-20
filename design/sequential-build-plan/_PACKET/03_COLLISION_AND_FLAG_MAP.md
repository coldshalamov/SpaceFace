# 03 — Collision map & flags (the decision-relevant core)

> This file maps every SF-XX topic to its existing home in the live repo, lists the
> competing build programs, captures the current DONE/NEXT truth, names every
> single-writer authority the plan touches, lists the npm check commands, and flags
> 16 specific duplications/contradictions/wonky spots the reviewer must resolve.
>
> **The single most important fact in this whole packet:** the live repo already runs
> **three concurrent build programs**, and the SF-00…SF-35 sequence is effectively a
> **fourth**. A naive execution would duplicate or contradict live authority in ~12 places.

---

## 1. The four competing "depth" authorities (the central problem)

| Authority | Location | What it is | Status | Scope |
|---|---|---|---|---|
| **Roadmap (the work order)** | `design/program/roadmap/` | **113 execution packets** in 6 families: F01–F17 (Foundation), G01–G20 (Gold Corridor), T01–T18 (Massline/Tether), A01–A20 (Asteroid Ops), W01–W20 (World/Content/Story), R01–R18 (UX/Release) | **ACTIVE WORK ORDER** — reset 2026-07-18; Wave-01 packets T02/T03/A02/A05/A06/A08/A10/W01/W02/G02/G03/G04 all `FOCUSED_GREEN+INTEGRATED` | Owns packet work order; **does NOT own completion status** (that projects into `program/01–05`) |
| **Depth Program** | `design/depth-program/` | **31 chunks** in 4 pipelines: P1 Sector Landmarks, P2 Story-Beat Embodiment, P3 Faction Visual Identity, P4 Set-Piece Mission Types | **ACTIVE SCOPE** — built 2026-07-12/14; roll-up: **0 DONE / 16 IP-CP / 15 TODO** | Owns detailed scope for the "depth" content; roll-up projects into `program/` |
| **Atlas Program** | `design/program/atlas/` | Universe Atlas & Physical Travel; 4 files (`00_COMMON_CONTEXT`, `01_DECISIONS`, `03_LEDGER`, `04_RELEASE_GATE`) | **ACTIVE** — written 2026-07-19; **inverts** the prior atlas sequencing; `check:journey:textile` at **10/11** | Owns map/navigation/route-follower/travel-burn; explicitly **supersedes** the atlas prompt pack's README |
| **SF-00…SF-35 (incoming)** | `design/sequential-build-plan/PLANS/` | **36 sequential prompts** distilled from the three upstream packages + the user thread | **PROPOSED — not yet reconciled with the above three** | Covers massline, gravity, planets, NPC jobs, world sites, wrecks, asteroid ops, story, visual families, HUD/VFX, gold corridor, endings, release |

**The repo's own rule (`PLAN_REGISTRY.md`):** *"only `program/roadmap/**` owns packet
work order."* Running SF-XX as a parallel ID space violates this.

### 1a. The decision you must drive

The incoming SF-00…SF-35 plan is **best understood as a second attempt at exactly the
depth-program scope**, extended with massline/atlas/release material. You must produce
a clear recommendation among:

- **(A) Re-statement / fold-in:** map each SF-XX outcome to its existing roadmap packet
  ID (T05, A15, etc.) and/or depth-program chunk ID (H1a, A2, S1–S4, etc.). Update
  those in place. Do not create parallel SF-XX authority.
- **(B) Full supersession:** the SF sequence IS the new plan; tombstone
  `design/depth-program/BUILD_PLAN.md` and reconcile the roadmap's overlapping packets.
- **(C) Parallel track:** keep SF-XX IDs but enforce that overlapping content respects
  existing packet/chunk IDs (i.e. SF-20 "Wreck Cathedral" must reference depth H1a).

**My (the packet assembler's) read of the evidence:** (A) is the lowest-risk path and
matches the repo's own `PLAN_REGISTRY.md` rule. (B) is cleaner but discards the
depth-program's research provenance and the roadmap's dependency graph. (C) is what
naive execution would produce and is the worst option (three competing authorities).
**But this is your call as the reviewer** — see question Q1 in `04_OPEN_QUESTIONS.md`.

---

## 2. Collision map: every SF-XX topic → existing repo home

| SF-XX topic | Existing repo doc(s) | Status there | Nature |
|---|---|---|---|
| **SF-00** Live truth reconciliation | `design/program/NOW.md`, `PLAN_REGISTRY.md`, `02_REMAINING_WORK.md` | ACTIVE | **COMPLEMENTS** — SF-00 is meta/audit; produces a baseline, doesn't claim features. Safe. |
| **SF-01** Browser/Electron/graphics/perf baseline | `design/program/08_GRAPHICS_OVERHAUL_CHECKPOINT.md`, `09_DONOR_VALUE_LEDGER.md`, `design/graphics-sprints/`, roadmap R12–R13 | ACTIVE — graphics-overhaul worktree is the only registered isolated lane | **COMPLEMENTS** — but **must coordinate** with the live graphics-overhaul worktree (NOW.md:36). |
| **SF-02** Deterministic physics/control lab | roadmap T01 (orbit telemetry kernel, INTEGRATED), `src/combat/masslineOrbitTelemetry.js` | T01 INTEGRATED | **COMPLEMENTS** — the lab is a new fixture; do not rebuild telemetry. |
| **SF-03** Intent-aware tether acquisition | roadmap T02/T03 (target scoring, INTEGRATED), `src/combat/autoTargetMode.js`, gravity package Brief 01 | T02/T03 INTEGRATED | **DUPLICATES** — verify whether T02/T03 already cover the 3-signal scoring; if so, SF-03 = wire + add pre-latch preview. |
| **SF-04** Massline input grammar / reel / pay-out / cut | roadmap T04 (capture/attach), T06 (reel/pump), T07 (release/cut), T16 (input — LOCKED lease), `src/systems/input.js` | T04/T06/T07 PLANNED; T16 PLANNED | **DUPLICATES** — SF-04 = T04+T06+T07+T16. **Input.js is Lead-only-edit** (BUILD_PLAN_2_0.md:38). |
| **SF-05** Anchor-relative orbit assist | roadmap T05 (stable orbit assist, PLANNED), gravity package Brief 03 | T05 PLANNED | **DUPLICATES** — SF-05 IS T05. |
| **SF-06** Release predictor / sling course / speed language | roadmap T07 (release/cut), gravity Brief 04, atlas D7 (camera-velocity-language, **currently dirty**) | T07 PLANNED; D7 dirty concurrent writer | **DUPLICATES + CONFLICTS** — camera work collides with the live dirty D7 packet. |
| **SF-07** Replace flailing gesture flight | `src/combat/autoTargetMode.js`, roadmap (no direct packet), depth 10 §3 | G-mode is experimental prototype | **COMPLEMENTS** — no existing packet owns the G-mode decision. This is genuinely new authority. |
| **SF-08** Compound collision proxies / exterior docking | `ARCHITECTURE.md` §0.6, `src/core/physicsAuthority.js`, no direct packet | foundational gap | **COMPLEMENTS** — no existing packet; this is foundational. **But** A03/G07 are BLOCKED_BY_LEASE on renderer/bloom. |
| **SF-09** Universal weapon impulse kernel | roadmap T08 (whip impact), `src/systems/weapons.js`, `src/systems/impulseCharges.js` | T08 PLANNED | **DUPLICATES** — SF-09 = the universal layer beneath T08. |
| **SF-10** Physics-weapon vertical slice (concussion/vector mine/RCS disruptor) | gravity Brief 05, `src/systems/weapons.js`, `src/systems/impulseCharges.js` (`anchorKick`, `slingBomb`, `tailPop`) | impulse charges exist | **COMPLEMENTS** — three specific weapons; impulse-charge plumbing exists. |
| **SF-11** Deployable anchor mass seed | gravity Brief 06, no roadmap packet | new | **COMPLEMENTS** — genuinely new. |
| **SF-12** Continuous field kernel (well/repulsor/cone) | gravity Brief 06/07, no roadmap packet | new | **COMPLEMENTS** — genuinely new. |
| **SF-13** Mass-coupling tactics (inertial shunt / gravity mark / momentum sink) | gravity Brief 08, no roadmap packet | new | **COMPLEMENTS** — genuinely new. |
| **SF-14** Planetary sling / atmosphere / reentry vertical slice | gravity Brief 09/16, **depth-program W1/W2** (SHATTERSTONE/VESTA'S BURN/RAZOR-RING/REACH SCRAWL) | W1 IP-CP, W2 TODO | **DUPLICATES** — SF-14 = depth W1+W2 + gravity Brief 16. Both authors will collide on `planetFactory.js`. |
| **SF-15** Generic NPC job controller (miner/hauler/patrol) | `src/systems/sectorSim.js` (day-tick economy/faction intents), `src/systems/encounterDirector.js` (1033 lines, shipped), roadmap W06 (encounter census), depth V1/K1 | W06 PLANNED; V1/K1 IP-CP | **COMPLEMENTS + CONFLICTS** — must ride `sectorSim.js` + `encounterDirector.js`; must NOT bypass credits/rep/cargo single-writers. |
| **SF-16** Surface-launch cargo / catcher / heist / patrol / heat loop | gravity Brief 10, `src/systems/heat.js` (sole writer of `state.player.heat`), roadmap W03/W04/W05 | W03/W04/W05 PLANNED | **COMPLEMENTS + CONFLICTS** — heist/heat must emit faction/heat intents, NOT write heat directly. |
| **SF-17** Shared interaction descriptors / component-level targeting | `design/STATION_SHELL_CONTRACT.md` (intent grammar), `src/combat/AGENTS.md`, `src/ui/AGENTS.md` | ACTIVE contracts | **COMPLEMENTS** — descriptors are read-side; emit `ui:*` intents only. |
| **SF-18** Contextual industrial beam / detachable payloads / receivers | `design/ASTEROID_SITES_BRIEF.md` (mining laser stays for raw surface; developed asteroid exposes cargo port/massline transfer port), roadmap A12 (machines/recipes), `src/systems/weapons.js` | A12 PLANNED | **DUPLICATES** — SF-18's "industrial beam" is the same primitive as ASTEROID_SITES_BRIEF §2. |
| **SF-19** Persistent multi-component World Site kernel | `design/ASTEROID_OPS_VISION.md`, `design/ASTEROID_SITES_BRIEF.md` (Massline Core/Command Nexus), roadmap A15 (outpost assembly), `src/systems/asteroidSites.js`, save `$.sites` (just added `edca7c7e`) | A15 PLANNED; site kernel partially shipped | **DUPLICATES** — SF-19 = A15 + the Massline Core machine. Save-schema for `$.sites` was just added. |
| **SF-20** Wreck Cathedral monumental site | **`design/depth-program/BUILD_PLAN.md` H1a (THE WRECK CATHEDRAL — "the bar-setter")**, `design/program/02_REMAINING_WORK.md:139` | **H1a TODO — not started** | **DUPLICATES (most direct collision)** — SF-20 IS depth H1a verbatim. Author through H1a, not SF-20. |
| **SF-21** Recompose one sector into activity pockets | `design/program/atlas/` (Universe Atlas program, 2026-07-19), roadmap W07–W10 (Helios/Ceres/Tethys postcards), `design/MAP_UX_PLAN.md`, `design/MAP_OVERHAUL_BRIEF.md`, `design/vision/03_MASTER_BUILD_PLAN.md` WAVE 2 | atlas ACTIVE; W07–W10 PLANNED | **CONFLICTS** — atlas program just re-inverted this work. Collides on `src/ui/galaxyMap.js`, `src/systems/world.js`, `src/data/sectors.js`. |
| **SF-22** Environmental machinery / debris current / timed access hazard | no direct packet | new | **COMPLEMENTS** — genuinely new (hazard grammar). |
| **SF-23** Asteroid formation exteriorization & progressive survey | roadmap A03 (render formations, BLOCKED_BY_LEASE), A04 (survey, BLOCKED_BY_LEASE), `src/systems/asteroidFormationModel.js` (shipped) | A01/A02 INTEGRATED; A03/A04 BLOCKED | **DUPLICATES** — SF-23 = A03+A04. Render lease currently blocked. |
| **SF-24** Asteroid ops heat / signature / diagnostics | roadmap A06 (thermal, INTEGRATED), A07 (derating), A08 (PURE signature kernel, INTEGRATED — **design ruling: NO `state.sites` field**), A09 (sensor discovery), A11 (diagnostics) | A06/A08 INTEGRATED; A07/A09/A11 PLANNED | **DUPLICATES** — SF-24 = A07+A09+A11. **Critical:** A08 forbids `state.sites` writes. |
| **SF-25** Transforming industrial claim / outpost assembly | roadmap A15 (outpost assembly), W17 (three outpost specializations), `design/spec3/SPEC3-F6-bases-defense-territory.md`, `design/vision/03_MASTER_BUILD_PLAN.md` WAVE 6 | A15/W17 PLANNED; deferred until M5 | **DUPLICATES** — SF-25 = A15. Vision gates this behind M0–M3. |
| **SF-26** Manufactured physics & travel infrastructure | **`design/program/atlas/01_DECISIONS.md` D1** (Wave 1 the missing spine: route follower), `design/MAP_UX_PLAN.md`, `design/vision/03_MASTER_BUILD_PLAN.md` WAVE 2, `design/spec3/SPEC3-F3-flight-physics-feel.md` | atlas ACTIVE — owns `src/systems/world.js` `nav.autoTravel` + route follower | **CONFLICTS** — SF-26 collides head-on with atlas Wave 1 route-follower. Atlas explicitly states spatial foundation exists; only the spine is missing. |
| **SF-27** Specialized masslines (tractor / frame coupler / elastic whip) | roadmap T11 (tow/rescue = tractor), T12 (salvage/cargo), T13 (terrain/station anchors = frame coupler), T06 (reel/pump = elastic whip basis) | T06/T11/T12/T13 PLANNED | **DUPLICATES** — SF-27 = T11+T12+T13 (+ T06 for whip). |
| **SF-28** Advanced massline combat (monofilament / transverse snare) | roadmap T08 (whip impact = monofilament), T09 (counter-tether = transverse snare), T10 (break/cut/overload) | T08/T09/T10 PLANNED | **DUPLICATES** — SF-28 = T08+T09. |
| **SF-29** Twin bridle world-to-world tether | roadmap (no direct packet), gravity Brief 13 | new | **COMPLEMENTS** — but **crosses atlas-owned jump-graph seam**; coordinate before introducing a cross-sector tether class. |
| **SF-30** Ship's ledger / story fragments / image pipeline | **`design/depth-program/BUILD_PLAN.md` ADD-2/A2 (THE SHIP'S LEDGER)**, `src/ui/screens/shipLedger.js` (**EXISTS, 0 importers**), `design/production/09_GENERATED_MEDIA_PIPELINE.md` | A2 IP-CP | **DUPLICATES (critical)** — SF-30 = depth A2. **`shipLedger.js` already exists with zero production importers — wire it, do not rebuild.** |
| **SF-31** Visual-family ship/world asset pipeline | **`design/depth-program/BUILD_PLAN.md` S1–S4** (ship lines) + §3-C landmarks + §3-E planets + §3-F props, `design/graphics-sprints/`, `assets/ships/AGENTS.md`, `design/vision/ALPHA_PROGRAM.md` M1-VISUAL-FAMILY, `08_GRAPHICS_OVERHAUL_CHECKPOINT.md` | S1/S2 TODO; S3/S4 IP-CP; M1-VISUAL-FAMILY PROMOTED CHECKPOINT | **DUPLICATES** — SF-31 = depth S1–S4 + H1a–H1h + live graphics-sprints. **Coordinate via `08_GRAPHICS_OVERHAUL_CHECKPOINT.md`.** |
| **SF-32** Physics HUD / VFX / camera / a11y consolidation | roadmap R01–R09 (UX/a11y), **atlas D7 (camera-velocity-language, currently dirty)**, `design/PERF_BUDGET.md`, `design/ACCESSIBILITY.md`, `src/render/AGENTS.md`, `src/ui/AGENTS.md` | R01–R09 PLANNED; D7 concurrent writer | **CONFLICTS** — D7 is dirty; HUD is non-diegetic-only contract. |
| **SF-33** Gold corridor 30/90-min integration | **`design/program/roadmap/02_GOLD_CORRIDOR.md` G01–G20** (this IS the gold corridor program), `design/vision/ALPHA_PROGRAM.md` M1/M3, `design/program/02_REMAINING_WORK.md` M1-ROUTE/M3-CAREERS | G01–G06 largely INTEGRATED; G07–G20 PLANNED; G17=30-min, G18=90-min | **DUPLICATES** — SF-33 should be dispatched as G17/G18, not new work. |
| **SF-34** Embodied story / ownership / endings | **roadmap W12 (B0–B2), W13 (B3–B5), W14 (B6–B7), W16 (faction threshold), W17 (outposts), W18 (thirteen roles), W19 (five endings), W20 (post-ending sandbox)**, `docs/worldbuilding/story/STORY-STRUCTURE.md`, depth §3-G NPCs | W12–W20 PLANNED | **DUPLICATES** — SF-34 = W12–W20 exactly. |
| **SF-35** Final save / perf / platform / release closeout | **roadmap R12–R18**, `design/spec2/08_RELEASE_READINESS.md`, M6-PERFORMANCE/M6-RELEASE | R12–R18 PLANNED; M6-PERFORMANCE SYNTHESIS INTEGRATED | **DUPLICATES** — SF-35 = R12–R18 + M6-*. Release gate R18 binds all existing IDs; adding SF-XX outside creates parallel release authority. |

**Summary of the collision map:**
- **~22 of 36 prompts DUPLICATE existing roadmap packets or depth-program chunks.**
- **4 prompts CONFLICT with live dirty/leased lanes** (SF-21, SF-26, SF-32, plus SF-01
  with the graphics-overhaul worktree).
- **~10 prompts are genuinely complementary / new authority** (SF-07, SF-08, SF-11,
  SF-12, SF-13, SF-22, SF-29, and the meta SF-00/SF-02/SF-10).

---

## 3. The depth-program relationship (the deepest overlap)

`design/depth-program/` is the **"Depth Program — The Galaxy Keeps Receipts"** — a
31-chunk content-actualization plan built 2026-07-12/14 by a separate design lead. Its
thesis: the engine/systems/data layers are over-built relative to art and gameplay-
actualization; the biggest "feels repetitive" cause is latent content not yet actualized.

### 3a. The four pipelines (`00_DEPTH_PROGRAM.md`)
- **P1 Sector Signature Landmarks** (spatial) — hero landmark GLB + placement.
- **P2 Story-Beat Embodiment** (narrative) — deepen playable story beats.
- **P3 Faction Visual Identity Kit** (spatial) — runtime livery + hero silhouette.
- **P4 Set-Piece Mission Types** (structural) — new mission shapes.

### 3b. The 31 chunks (`BUILD_PLAN.md` §3–§5)
- **§3-A Factions (A1–A5):** Understory, Fulfillment, Archive, Pitborn, Verge-Layers.
- **§3-B Ships (B1–B20):** Vael bio line, Fulfillment line, Reach sub-cultures, Authority line.
- **§3-C Landmarks (C1–C15):** **Wreck Cathedral (C1, H1a)**, Resonance Obelisk, Candle
  Fleet, Quiessence, Vault Maw, Iron Maw, Lung-of-Charon, Flight Deck, Caved Shaft,
  Shard Sphere, Funnel, Metronome, Ringworld Arc, Tide-Locked Watcher, Five Capitals.
- **§3-D Wrecks (D1–D12):** 12 unique-loot wrecks.
- **§3-E Planets (E1–E8):** Shatterstone, Vesta's Burn, Razor-Ring, Reach Scrawl,
  Veiled Sister, Mycelia, The Hush, The Cage.
- **§3-F Props (F1–F15):** 15 dressing props.
- **§3-G NPCs (G1–G15):** 15 named contacts.
- **§3-H Encounters (H1–H8):** 8 chance encounters.
- **§4 ADD-1 The Band, ADD-2 Ship's Ledger, ADD-3 Living Hull.**
- **§5 build sequence:** F1/F2 → V1/V2 → R1/R2/SP1 → L1/K1 → PR1/PR2/H1a–H1h/S1–S4/
  W1/W2 → E1/A1/A2/A3/D1 → GT1.

### 3c. PROGRESS_LEDGER state (post-reconciliation roll-up, `02_REMAINING_WORK.md:110–160`)
**0 DONE / 16 IP-CP (in-progress-checkpointed) / 15 TODO.**
- **IP-CP (16):** F1, F2, V1, V2, R1, R2, SP1, E1, A1, A2 (Band, Ledger), K1, S3, S4,
  W1, D1, GT1.
- **TODO (15):** L1, PR1, PR2, **H1a (Wreck Cathedral)**, H1b, H1c, H1d, H1e, H1f, H1g,
  H1h, S1, S2, W2, A3 (Living Hull).

### 3d. Critical caveats
1. The depth-program is **explicitly subordinate** to `design/program/`
   (`PLAN_REGISTRY.md:30`, `depth-program/README.md:8`). It owns detailed scope, NOT
   global status.
2. Per `02_REMAINING_WORK.md:111–114`: *"IP-CP means implementation/check surfaces are
   preserved by checkpoint `850c80f3`. It does not mean the prior focused result has
   been rerun at current HEAD or that the chunk is accepted."*
3. **Most July-14 depth-program implementation is NOT recoverable from committed
   master** (`PROGRESS_LEDGER.md:5–7`) — it lived in a dirty-tree satellite.
4. The depth-program chunks do **NOT** appear in the 113-packet roadmap. They are a
   separate ID space (F1/V1/R1/SP1/L1/K1/PR1/H1a/S1/W1/E1/A1/D1/GT1) — easy to confuse
   with roadmap A01/W01/etc.

### 3e. Direct SF-XX ↔ depth-chunk equivalences
| SF-XX | Depth chunk | Status |
|---|---|---|
| SF-14 (planet sling/atmosphere/reentry) | W1/W2 (SHATTERSTONE etc.) | W1 IP-CP, W2 TODO |
| SF-20 (Wreck Cathedral) | **H1a** | TODO |
| SF-30 (ship's ledger) | **A2 / ADD-2** | IP-CP (`shipLedger.js` exists, 0 importers) |
| SF-31 (visual-family pipeline) | S1–S4 + H1a–H1h + §3-C/E/F | S1/S2 TODO, S3/S4 IP-CP |

---

## 4. Current live truth (what's DONE and NEXT right now)

From `design/program/NOW.md` (snapshot 2026-07-19, after merge `b235f062`; current HEAD
is `f3d1a6b0`):

### 4a. DONE right now (key quotes)
- *"npm run check:graphics:asset-receipts passes on the promoted tree and pins the
  exact Helios, representative-rock, Wasp-candidate, and RCS artifacts."* (NOW.md:23–24)
- *"all 167 performance-modified tests and 49 graphics/PBR/VFX identity tests pass
  together with camera, AI-telegraph, and exact asset-receipt checks"* (NOW.md:26–28)
- Wave-01 packets T02/T03/A02/A05/A06/A08/A10/W01/W02/G02/G03/G04 all
  `FOCUSED_GREEN+INTEGRATED` (NOW.md:78–91)
- *"check:sim:compare ok/deterministic and check:sim:v3:compare ok/hashEqual verified
  after every runtime-touching integration"* (NOW.md:142–144)
- Atlas: *"check:journey:textile scores 10 of 11 on the pinned universe"*
  (atlas/03_LEDGER.md)

### 4b. IMMEDIATE NEXT work (key quotes)
- NOW.md:46–48: *"Immediate safe work: commit this ledger transaction, then rerun the
  strict final performance contract on one clean exact commit with the measured
  ship-local batching winner. Capture exact-head propulsion settings/accessibility,
  natural Helios/rock motion, and combat/destruction GPU evidence."*
- NOW.md:50–53: *"The highest-return graphics continuation is natural-route Helios/rock
  parity, fixing rock-shaped fx interaction identity, one combined admission/rebase/
  interpolation/LOD/HLOD/pool flicker-continuity packet, combat/destruction visual
  acceptance, localized authored space structure without screen-wide haze, and the next
  high-frequency PBR family."*
- README.md:101–106 (current order): *"1. Claim G01, T01, A01, and W01 in parallel...
  2. Use the G01 diagnosis and pure interfaces to complete the Helios→Ceres→Tethys
  corridor. 3. Deepen Massline/Asteroid Ops and early encounter doctrines... 4. Embody
  world/story packets, then close cross-feature UX, accessibility, performance,
  platform, and release evidence."*
- Atlas (atlas/03_LEDGER.md E-6): *"truthful-instruments is left FAILING deliberately...
  It stays red until someone samples both sides at one instant or restricts the
  comparison to steady state."*

### 4c. Known reds (remeasure before acting — NOW.md:134–140)
- `npm run check` broad chain — **DEAD ON ARRIVAL** in `precheck`
  (`check-m1-tether-mass-grounding` asserts old `check:ci` inlining).
- `check:encounter-director` — **RED** (`got 2` at `:171`).
- `check:save-schema` (dirty tree) — RED, foreign uncommitted `bloomThreshold` 0.72→1.
- `check:sim:v3` vs expected envelope — stale expected, actual stable.

### 4d. Occupied lane
Only `SpaceFace-graphics-overhaul` worktree is registered beside `master` (NOW.md:36).

---

## 5. Single-writer authorities the plan touches

Source: `ARCHITECTURE.md` §0.6 (AUTHORITATIVE), `MODULE_MAP.md`, `STATION_SHELL_CONTRACT.md`,
nested `src/*/AGENTS.md`.

| Authority | Contract file | Rule (one line) | SF-XX prompts touching it |
|---|---|---|---|
| **Input** | `src/systems/input.js` (**LOCKED** — `BUILD_PLAN_2_0.md:38`) | *"no agent edits `src/systems/input.js` except Claude"*; owns `actions.*` semantics | SF-04, SF-07, SF-17, SF-27, SF-28, SF-29, SF-32 |
| **Physics** | `src/core/physicsAuthority.js` / Rapier (`src/core/AGENTS.md:12–13`) | never direct-write Rapier-body transforms; compatibility modules are NOT the default seam | SF-05, SF-08, SF-09, SF-11, SF-12, SF-13, SF-14, SF-29 |
| **Economy / Credits** | `src/systems/economy.js` | sole writer of `state.player.credits`; others emit `economy:grantCredits`/`chargeCredits` | SF-15, SF-16, SF-25, SF-33 |
| **Factions / Rep / Sector ownership** | `src/systems/factions.js` | sole writer of `state.factions[id].rep`/`aggro`/`state.world.sectors[id].owner` via `applyRep()`; others emit `faction:repDelta` | SF-16, SF-15, SF-21, SF-34 |
| **Cargo** | `src/systems/cargo.js` via `addCargo`/`removeCargo` | sole writer of `state.player.cargo` | SF-16, SF-18, SF-25 |
| **Heat** | `src/systems/heat.js` | sole writer of WANTED `state.player.heat` (0..1) | SF-16, SF-24 |
| **Ships / derived stats** | `src/systems/ships.js` via `getDerivedStats()` | sole writer of `entity.derived` | SF-25, SF-31 |
| **Catalog order** | `src/data/*.js` | each catalog has ONE owner module | SF-15, SF-21, SF-25, SF-31 |
| **Registry / update order** | `src/core/registry.js` | owns system selection + `UPDATE_ORDER`; reorder only with explicit dependency reason + focused order/determinism tests | ANY new registered system (SF-08, SF-12, SF-19, etc.) |
| **Save schema / migrations / Continue** | `src/save/saveSystem.js` (**integration mutex** — `00_EXECUTION_PROTOCOL.md:160`) | only lead/integration owner stages save-adapter changes | SF-19, SF-30, SF-25, SF-35 |
| **Asset manifests / release metadata** | `assets/ships/release/`, `parts_manifest.json`, `partsLibrary.js` | *"exact manifests, release metadata, and runtime maps outrank prose inventories"*; a model must be in source manifest + generated release manifest + runtime map | SF-20, SF-31, all landmark/prop authoring |
| **Map / galaxy / coordinates** | `src/ui/galaxyMap.js`, `src/data/sectorCoordinates.js` (frozen global origins on 4096 WU lattice — atlas D2) | atlas D2 invariant: *"sector-local authoring is correct and stays... Any pass that 'cleans up the frames' across `src/data/` is rejected"* | SF-21, SF-26, SF-29 |
| **Camera** | `src/render/camera.js` (position-follow only, never yaw) | *"Camera follows position only, never ship yaw (anti-nausea)"*; `feel.js` owns shake/trauma | SF-06, SF-32 |
| **HUD non-diegetic** | `src/ui/hud.js`, `src/ui/AGENTS.md:9` | *"Clean NON-diegetic HUD. No first-person/visor/cockpit motifs — no screen-edge arcs, no helmet avatars"* | SF-32, SF-17, SF-30 |
| **Station shell** | `design/STATION_SHELL_CONTRACT.md:59–72`, `src/ui/station/stationScreen.js` | *"Never invent a parallel mutation path to simplify presentation"* — station emits `ui:*` intents only | SF-30 (shipLedger wiring) |

---

## 6. The 113 roadmap packets at a glance

(`design/program/roadmap/` — 6 files, 6 families, 113 packets total)

### 6a. Foundation F01–F17 (17 packets, `01_FOUNDATION_SPRINT.md`)
**INTEGRATED** — foundation tests 68/68, 113-packet graph clean. Mostly complements
the incoming plan; provides the deterministic check harness.

### 6b. Gold Corridor G01–G20 (20 packets, `02_GOLD_CORRIDOR.md`)
- G01 FOCUSED_GREEN+INTEGRATED — public-input corridor pilot
- G02, G03 INTEGRATED — fresh-start/first-station fixtures
- G04 ROUTE_ACCEPTED — clean-checkout dock proven
- G05–G20 PLANNED — **G17 (30-min three-career pilot) and G18 (90-min pilot incl.
  Massline attach) are the direct collision with SF-33.**

### 6c. Massline/Tether T01–T18 (18 packets, `03_SIGNATURE_SYSTEMS.md:48–69`)
- T01 INTEGRATED — orbit telemetry kernel (`src/combat/masslineOrbitTelemetry.js`)
- T02, T03 INTEGRATED — invariants + target scoring
- T04 capture/attach — PLANNED (≈ SF-04)
- T05 stable orbit assist — PLANNED (≈ SF-05)
- T06 reel/pump — PLANNED (≈ SF-04 elastic whip basis)
- T07 release/cut — PLANNED (≈ SF-04/SF-06)
- T08 whip impact — PLANNED (≈ SF-09/SF-28 monofilament)
- T09 counter-tether threats — PLANNED (≈ SF-28 transverse snare)
- T10 break/cut/overload — PLANNED
- T11 noncombat tow/rescue — PLANNED (≈ SF-27 tractor)
- T12 salvage/cargo utility — PLANNED (≈ SF-27)
- T13 terrain/station anchors — PLANNED (≈ SF-27 frame coupler)
- T14 AI massline doctrines — PLANNED
- T15 camera/HUD — PLANNED
- T16 input (`input.js` EXCLUSIVE lease) — PLANNED (≈ SF-04 input)
- T17 save/replay — PLANNED
- T18 public acceptance gate — PLANNED

### 6d. Asteroid Ops A01–A20 (20 packets, `03_SIGNATURE_SYSTEMS.md:102–125`)
- A01 INTEGRATED — formation model
- A02 INTEGRATED — formation persistence (save `$.formations`+`$.sites`)
- A03 render formations — **BLOCKED_BY_LEASE** (renderer/bloom dirty)
- A04 survey — **BLOCKED_BY_LEASE** (HUD/map dirty)
- A05 INTEGRATED — contact-ring rule
- A06 INTEGRATED — thermal model (62 tests)
- A07 heat derating/faults — PLANNED (≈ SF-24)
- A08 INTEGRATED — PURE signature kernel (**design ruling: NO `state.sites` field, NO
  save-schema change**)
- A09 sensor signature → discovery/heat — PLANNED (≈ SF-24)
- A10 INTEGRATED — siteLogistics (power/material lanes, total-order machine key)
- A11 operator diagnostics — PLANNED (≈ SF-24)
- A12 six machines/recipes — PLANNED (≈ SF-18)
- A13 cluster/logistics — PLANNED
- A14 cluster selection/map — PLANNED
- A15 outpost assembly (the "World Site" kernel) — PLANNED (≈ SF-19/SF-25)
- A16 fault/raid/depletion recovery — PLANNED
- A17 console a11y — PLANNED
- A18 sites survive save/offline — PLANNED
- A19 dense perf — PLANNED
- A20 public acceptance gate — PLANNED

### 6e. World/Content/Story W01–W20 (20 packets, `04_WORLD_CONTENT_RELEASE.md:47–68`)
- W01, W02 INTEGRATED — encounter phase dispatch + combat trace
- W03 mine-layer doctrine — READY-PENDING
- W04 point-defense screen — READY-PENDING
- W05 sensor-ghost — BLOCKED_BY_LEASE
- W06 encounter census — PLANNED (≈ SF-15 NPC jobs)
- W07–W10 sector postcards (Helios/Ceres/Tethys + second wave) — PLANNED (≈ SF-21)
- W11 mission producer/carrier contract — PLANNED
- W12 B0–B2 embodiment — PLANNED (≈ SF-34)
- W13 B3–B5 — PLANNED
- W14 B6–B7 endings — PLANNED
- W15 rumor→salvage — PLANNED
- W16 faction threshold consequences — PLANNED
- W17 three outpost specializations — PLANNED (≈ SF-25)
- W18 thirteen role progressions — PLANNED
- W19 five endings — PLANNED
- W20 post-ending sandbox — PLANNED

### 6f. UX/Release R01–R18 (18 packets, `04_WORLD_CONTENT_RELEASE.md:72–91`)
All PLANNED. **R03 map cutover** is the direct collision with SF-21/SF-26 and the
atlas program. R12–R18 = the release closeout (≈ SF-35).

---

## 7. npm check commands (the verification surface — 414 scripts total)

Grouped by what they prove. **Run order per `AGENTS.md §9`: run the narrow owning
check first, then broaden in proportion to risk. `check:sim:compare` is the golden
gate after every runtime-touching change.**

### 7a. Foundation / sim determinism
`check`, `check:sim:compare`, `check:sim:v3`, `check:sim:v3:compare`, `check:sim:long`,
`check:sim:long:compare`, `check:ci`, `precheck` (= `check:m1:tether-mass && check:sim:v3 && check:sim:v3:compare`).

### 7b. Massline / tether (T-family)
`check:massline`, `check:massline2`, `check:massline2:live`, `check:massline:telemetry`,
`check:massline:target-scoring`, `check:massline:arc-data`, `check:massline:arc-render`,
`check:massline:auto-target`, `check:massline:reelpump`, `check:massline:release`,
`check:massline:load`, `check:massline:whip-impact`, `check:massline:whip-feedback`,
`check:massline:threats`, `check:massline:threat-feedback`, `check:massline:snapcatch`,
`check:massline:hitchhiking`, `check:massline:release-feedback`, `check:sg02:tether`,
`check:sg02:tether-break`, `check:sg02:dash-collision`, `check:sg02:production-combat`,
`check:m1:tether-mass`, `check:m1:combat-doctrines`, `check:tether-body-signature`,
`check:tether-strain-signature`.

### 7c. Asteroid Ops (A-family)
`check:asteroid-instance-structure`, `check:asteroid-motion`,
`check:depth-program:f2`, `check:depth-program:validators`, `check:mining:2`,
`check:mining:bulk-guidance`, `check:sensor-signatures`, `check:scan-reveal`,
`check:site-thermal`.

### 7d. Encounters / story / world (W-family + depth)
`check:encounter-director` (RED — NOW.md:138), `check:encounter-index`,
`check:encounter-voice`, `check:living-universe`, `check:one-voice`,
`check:bark-director`, `check:bark-silence`, `check:depth-program:v1`,
`check:depth-program:v2`, `check:depth-program:e1`, `check:depth-program:sp1`,
`check:depth-program:r1`, `check:depth-program:r2`, `check:depth-program:a1`,
`check:depth-program:a2`, `check:depth-program:k1`, `check:depth-program:s3`,
`check:depth-program:gt1:loot-audit`, `check:unique-loot`, `check:wreck-provenance`,
`check:ghost-convoy-rumor`, `check:pirate-rumor`, `check:story-beats`,
`check:doctrine-distinct`.

### 7e. Gold corridor / travel / map (G-family + atlas)
`check:journey:textile` (atlas — currently **10/11**, `truthful-instruments` deliberately red),
`check:journey:textile:contract`, `check:professional-travel:public-route`
(+`:browser`/`:electron`), `check:atlas`, `check:atlas-integrity`, `check:atlas-place-path`,
`check:atlas-spatial-truth`, `check:atlas:perf:strict`, `check:route-follower`,
`check:route-engage`, `check:deep-space-address`, `check:deep-state-fixture-ladder`,
`check:map-frames`, `check:map-camera`, `check:map-authority`, `check:map-confidence`,
`check:map-information-depth`, `check:map-nav-context`, `check:map-never-lost`,
`check:m2:map-cutover`, `check:m2:seamless-world`, `check:m2:galaxy-live`,
`check:m2:continuous-handoff`, `check:m2:sector-embodiment`, `check:m2b:region-data`,
`check:m2b:sector-graph`, `check:autopilot`, `check:travel-drive`, `check:travel-lanes`,
`check:travel-latch`, `check:gate-control`, `check:gate-reachability`,
`check:first-15-runtime`, `check:first-hour`, `check:first-hour-audio`, `check:onboarding`,
`check:core:first-ten-minute`, `check:wave15-baseline`, `check:wave15-flight-boot`,
`check:wave15-regression`, `check:claim-base`, `check:claim-ledger`,
`check:claim-specializations`, `check:claims-guidance`.

### 7f. M-milestone acceptance
`check:m1:tether-mass`, `check:m1:combat-doctrines`, `check:m2:*`, `check:m3:career-*`
(origins/ladders/balance/cohorts/starter-builds/hunter-route/engineering-preview/
player-facing-public-route, +`:browser`/`:electron`), `check:m4:regional-ecology`
(8/9 — RED), `check:m4:living-galaxy-player-route` (+`:contracts`), `check:m5:role-continuity`,
`check:m5:role-public-route:supporting`, `check:m5:starter-ownership-public-route`,
`check:m6:corrupt-save-recovery`, `check:m6:localization`, `check:m6:packaging`,
`check:m6:platform`, `check:alpha:evidence`, `check:alpha:evidence:contract`,
`check:alpha:baseline:browser`/`contracts`/`electron`.

### 7g. Visual / asset / perf / a11y (R-family + graphics)
`check:graphics:asset-receipts` (the acceptance boundary per NOW.md:23), `check:assets:live`,
`check:visual-stability`, `check:asset-reachability`, `check:asset-status`,
`check:asset-classifications` (+`:evidence`), `check:asset-pipeline-contract`,
`check:asset-runtime-disposal`, `check:asset-startup-readiness`, `check:runtime-assets`,
`check:art`, `check:shader-compile`, `check:ship-material-sharing`, `check:render-hotpath`,
`check:gpu-path`, `check:parallax`, `check:drill-smooth`, `check:perf`, `check:perf-budget`,
`check:perf-summary`, `check:perf:attribution`, `check:perf:control`, `check:perf:render-scale`,
`check:perf:spatial-cache`, `check:hitch-budget`, `check:radar:perf`, `check:ui:perf`,
`check:bundle`, `check:non-graphics`, `check:overnight`, `check:overnight:playable`,
`check:strict`, `check:strict:play-harness`, `check:slice-scope`, `check:camera`,
`check:camera:director`, `check:camera:velocity-language`, `check:rcs-sign-truth`,
`check:rcs-jets`, `check:actuator-telemetry`, `check:propulsion`, `check:propulsion:authority`,
`check:propulsion:extreme`, `check:handling-profile`, `check:flyby-focus`, `check:speed-lines`,
`check:ui-a11y`, `check:wcag-contrast`, `check:ui-identity`, `check:ui-effects`,
`check:player-facing-labels`, `check:intent-glyphs`, `check:sector-palettes`,
`check:sector-atmosphere`, `check:sector-geography`, `check:sector-postcard`,
`check:silhouette-roles`, `check:station-*` (archetype-wiring/glyphs/hlod/hub-classes/
interact-undock/mission-card-keyboard/missions-layout/mood/shell/side-events/tabs/
ui-stability/egress/departure/broadcast/bubbles).

### 7h. Release
`check:release-soak`, `check:launch-policy`, `check:save-schema`, `check:save-resume-confidence`,
`check:save-load-slot-trust`, `check:ci`, `check:ci:report`.

### 7i. Authority / contract
`check:physics-authority`, `check:impulse:authority`, `check:propulsion:authority`,
`check:sg02:authority`, `check:cause-ledger`, `check:fact-ledger`, `check:dispatch-discipline`,
`check:foundation`.

---

## 8. The 16 explicit flags (duplications, contradictions, wonkiness)

Each is a specific decision or hazard the reviewer should resolve.

### FLAG 1 (CRITICAL): Three competing "depth" authorities + SF = four
See §1 above. The reviewer's central decision.

### FLAG 2 (CRITICAL): Wreck Cathedral is depth H1a, currently TODO
SF-20 "Wreck Cathedral monumental site" = `design/depth-program/BUILD_PLAN.md:427–431`
(H1a) verbatim — `zone_io_derelict`, Marker light, scavenger-nest encounter hook.
`02_REMAINING_WORK.md:139` lists H1a as TODO. If SF-20 builds it under an SF-XX ID
without referencing H1a, two authorities claim the same artifact. **Resolution: author
through H1a, not SF-20.**

### FLAG 3 (CRITICAL): Ship's Ledger screen already exists
`src/ui/screens/shipLedger.js` already exists with **zero production importers**
(PROGRESS_LEDGER.md:46, depth A2). SF-30 must **wire** the existing file, not rebuild
it. Depth A2 is blocked from player-reachability while a separate station-UI owner is
active — same constraint applies to SF-30.

### FLAG 4 (CRITICAL): Atlas program inverted the travel plan
`design/program/atlas/01_DECISIONS.md` D1 (accepted 2026-07-19) states: *"the spatial
foundation already exists and is sound... the program is NOT 'build the Atlas, then fix
the map.' It is 'make the existing truth visible, then build the one missing spine
[route follower + Travel Burn], then grow semantics on top.'"* The atlas decisions file
**explicitly states it "Supersedes the sequencing proposed in the prompt pack's README."**
SF-26 "manufactured physics & travel infrastructure" collides with atlas Wave 1; SF-21
"sector recomposition" collides with atlas Wave 2.

### FLAG 5 (HIGH): Asteroid A08 design ruling forbids state.sites writes
`03_SIGNATURE_SYSTEMS.md:113`: *"A08 adds no state.sites field and no save-schema change;
A09 owns live wiring/consequences, A18 owns persistence/offline continuity"* (design
ruling 2026-07-18). SF-24 must NOT add `state.sites` fields or save-schema changes
outside the A09/A18 boundaries.

### FLAG 6 (HIGH): Massline ID collision (T01–T18 exist; 3 integrated)
SF-05/T05, SF-27/T11–T13, SF-28/T08–T09, SF-04/T04+T06+T07+T16. T01/T02/T03 are
already `FOCUSED_GREEN+INTEGRATED` with `src/combat/masslineOrbitTelemetry.js` shipped.
Rebuilding these as SF-XX duplicates live integrated packets.

### FLAG 7 (HIGH): NPC jobs collide with sectorSim + W06
SF-15 must ride existing `src/systems/sectorSim.js` (day-boundary economy/faction intent
emission) and `src/systems/encounterDirector.js` (1033 lines, shipped). A parallel
NPC-job system would violate single-writer rules for credits/rep/cargo and the W06
packet.

### FLAG 8 (HIGH): Heat single-writer — heist/heat loops must not write state.player.heat
`src/systems/heat.js` is the ONLY writer of `state.player.heat`. SF-16 and SF-24 must
emit faction/aggression events that heat.js consumes — NOT write heat directly. Same
for factions (`applyRep()` only).

### FLAG 9 (HIGH): Render/asset lease is currently blocked
`05_SPRINT2_READY_CONTRACTS.md:82–83`: A03 (render formations) and G07 (Ceres postcard)
are `BLOCKED_BY_LEASE` because `src/render/renderer.js` and `src/render/bloom.js` are
dirty under the closed `MAP-2026-07-18` lease. The `SpaceFace-graphics-overhaul`
worktree is the only registered isolated lane (NOW.md:36). Any SF-XX prompt touching
`src/render/**`, asset manifests, or the asset pipeline must verify ownership via
`08_GRAPHICS_OVERHAUL_CHECKPOINT.md` and `09_DONOR_VALUE_LEDGER.md` first.

### FLAG 10 (HIGH): Input contract is LOCKED
`BUILD_PLAN_2_0.md:38`: *"Input contract (LOCKED — no agent edits src/systems/input.js
except Claude)."* SF-04, SF-07, SF-17, SF-27, SF-28, SF-29, SF-32 all touch input.
They must consume existing `actions.*` fields or request additions through the
lead-only input lease.

### FLAG 11 (HIGH): Save schema is an integration mutex
`00_EXECUTION_PROTOCOL.md:160`: save schema/migrations/normalization/Continue is a mutex
domain. The save `$.sites` row was just added (`edca7c7e`); `$.formations` in the same
batch. SF-19 (persistent World Site kernel), SF-30 (ship's ledger), SF-25 (claim),
SF-35 (release) persistence changes must be requested from the lead/integration owner.

### FLAG 12 (MEDIUM): D5 encounter director is "NOT BUILT" in BUILD_PLAN_2_0 but EXISTS
`BUILD_PLAN_2_0.md:101` (historical, D5 NOT BUILT) is contradicted by
`CURRENT_BUILD_STATUS.md:59` (corrected 2026-07-06: `src/systems/encounterDirector.js`
EXISTS, 1033 lines; `scripts/check-encounter-director.mjs` EXISTS). SF-15/SF-16 must
treat encounterDirector as existing; `check:encounter-director` is currently RED
(`got 2` at `:171`) per NOW.md:138.

### FLAG 13 (MEDIUM): Camera D7 packet is a dirty concurrent writer
NOW.md:51–53: `src/render/camera.js` and `scripts/check-camera-velocity-language.mjs`
are dirty under a concurrent D7 band-3 camera-lead packet, "left untouched per D10."
SF-06 and SF-32 (camera work) must coordinate with this dirty writer.

### FLAG 14 (MEDIUM): Three "foundation" ID spaces — easy confusion
- `design/program/roadmap/01_FOUNDATION_SPRINT.md` F01–F17 (17 packets, INTEGRATED)
- `design/depth-program/BUILD_PLAN.md` §5 WAVE 0 F1/F2 (faction migration + validators, IP-CP)
- `design/spec3/SPEC3-F1-economy-trading.md` … `SPEC3-F10-ux-meta-tastemaster.md`

The SF-00…SF-35 prefix is safe (no collision). But the reviewer's mapping table must
not confuse depth "F1" with roadmap "F01."

### FLAG 15 (MEDIUM): POLISH_BRIEFING identifies real code defects the plan shouldn't re-litigate
`design/POLISH_BRIEFING.md` (RETAINED RESEARCH) identifies 10 high-leverage targets
including: T2 *"The physics single-writer membrane is aspirational, not enforced
(~17 violations)"* (POLISH_BRIEFING.md:70); T3 *"The heat integration seam (admitted,
shipping as a fallback)"* (POLISH_BRIEFING.md:89); T5 *"The load-bearing blind spots
(live, high-fan-in, ZERO doc, ZERO test)"* (POLISH_BRIEFING.md:119). SF-09 (weapon
impulse through physics authority) directly depends on T2 being fixed. Route these
through roadmap IDs, don't re-discover them.

### FLAG 16 (LOW): Handheld/console is explicitly a non-goal
`BUILD_PLAN_2_0.md:15`, `CURRENT_BUILD_STATUS.md:13–14`: *"Handheld-specific readiness
is not a target or release blocker."* SF-35 platform/release closeout should not add
handheld-specific gates.

---

## 9. Summary recommendation (the packet assembler's read, for the reviewer to confirm or overturn)

Per `PLAN_REGISTRY.md:67–74` (Updating status without drift), the cleanest path is:

1. **Deduplicate each SF-XX outcome** against roadmap F/G/T/A/W/R packets, depth-program
   31 chunks, and atlas decisions. (The table in §2 does most of this.)
2. **Where mapped:** update that packet/chunk in place; do not create parallel SF-XX
   authority. Example: SF-20 → author through depth H1a.
3. **Where unmapped (genuinely new):** retain in
   `design/program/06_RETAINED_FUTURE_BACKLOG.md` until the lead assigns a stable
   roadmap ID. Candidates: SF-07 (G-mode fix), SF-08 (compound collision — arguably
   should become a Foundation packet), SF-11/12/13 (gravity weapons — new family),
   SF-22 (env hazards).
4. **Explicitly decide the depth-program's fate:** (a) the SF plan IS the depth-program
   reorganized → tombstone `design/depth-program/BUILD_PLAN.md`; OR (b) parallel →
   respect depth chunk IDs (H1a, A2, S1–S4) for overlapping content. **Do not leave
   this ambiguous — three competing authorities is the failure mode.**
5. **Do not touch** `src/systems/input.js`, `src/render/**`, `src/ui/galaxyMap.js`,
   save schema, asset manifests, or station UI without verifying the live lease/owner
   per `NOW.md` and `08_GRAPHICS_OVERHAUL_CHECKPOINT.md`.

Key live-repo references for verification:
- `design/program/NOW.md` (live board)
- `design/program/02_REMAINING_WORK.md` (Alpha/Depth roll-up)
- `design/PLAN_REGISTRY.md` (authority map)
- `design/program/atlas/01_DECISIONS.md` (latest program inversion)
- `design/depth-program/BUILD_PLAN.md` (31-chunk depth scope)
- `ARCHITECTURE.md` §0.6 (single-writer rules)
