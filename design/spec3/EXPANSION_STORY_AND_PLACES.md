<!-- LIFETIME: DURABLE -->
# SpaceFace expansion story and places

**Status:** `CONCEPT_SYNTHESIS` — retained, unreviewed proposals; non-dispatching.
**Date:** 2026-09-06.

This document preserves the authored story beats, physical mission ideas, and place briefs that
were too detailed for the canonical routing map. It organizes them under the packets that already
own the work:

- [`PQ-032`](../program/roadmap/active/PQ-032.md) owns the single campaign spine, its ending gate,
  and the existing endings.
- [`PQ-152`](../program/roadmap/active/PQ-152.md) owns ten authored set-piece slots and the
  physical mission verbs.
- [`PQ-162`](../program/roadmap/active/PQ-162.md) owns the existing station arrival and screen
  redesign; [`PQ-153`](../program/roadmap/active/PQ-153.md) remains the owner of sector identity.

The companion to the broader four-pillar synthesis is
[`EXPANSION_MASTER_BLUEPRINT.md`](../program/roadmap/active/EXPANSION_MASTER_BLUEPRINT.md). The
canonical routing map remains the front door: [`CANONICAL_BUILD_MAP.md`](../../CANONICAL_BUILD_MAP.md).

## Boundaries

These are concept proposals, not implementation, admission, acceptance, or asset approvals. An
owning packet must adopt a proposal before it becomes work, and must set its own write set,
measurements, tuning, accessibility checks, and player-route evidence.

- The campaign stays one linear B0–B7 through-line. Moment-to-moment tactics may vary, but these
  proposals add no dialogue tree, choice menu, new branch, or ending.
- The ending gate keeps two reachable entry routes: a builder route and a combat-stake route.
  Both reach the existing ending flow; a combat-only run remains a supported route. The packet
  owns the exact threshold and telemetry target.
- `PQ-152` still has ten authored set-piece slots. `SM-01`–`SM-08` below are candidates to fill
  eight of those existing slots, not eight additional missions or leaves. Its other existing
  slots, including the ace duel and the loud heist, remain packet scope.
- Mass, speed, cable tolerance, hull thresholds, enemy counts, rewards, timers if any, and
  survivability are packet-owned tuning. The concepts name relationships and momentum problems,
  not fixed numbers.
- A collision may have serious physical consequences, but no proposal promises a forced fatal
  collision. A player must have two reachable solutions on a trackpad; the simulation decides the
  resulting damage, deflection, break-up, or escape.
- The place briefs describe identity and arrival for existing stations. They add no station type,
  do not redesign the flight HUD, and do not approve a model or texture for shipping.

## 1. Campaign spine candidate beats

`PQ-032.00` connects the first three authored beats to physical set pieces. The remaining beats
carry the same investigation from the first discrepancy to Ashfall without turning it into a
branch graph. These treatments are candidate staging and fiction for the existing eight beats;
they do not change the runtime story source by themselves.

| Beat | Candidate treatment | Packet route |
|---|---|---|
| **B0 — Cold Start / Berth Runner** | Wren leaves Concord Penal Transport CPV-2214, “the Can,” with the *Tessera* and a cold transponder. A release discrepancy sends Contract 47-A toward Helios Bay 7. The visual anchor is the severe transport hull and its pressure-heavy docking hardware. | `PQ-032` spine; visual candidate `ship_cpv2214_can` |
| **B1 — Honest Work / Slurry Run** | A high-inertia run through contested asteroid lanes turns an ordinary cargo handoff into a physical tow. The cargo tag quietly becomes `SURPLUS REDISTRIBUTION`, making the administrative mystery part of the route. | `PQ-032.00` → `PQ-152.01`; `SM-03` is a candidate treatment |
| **B2 — First Blood / The Whistleblower** | Wren meets Elroy’s courier near the Pit perimeter. Civilian registration is briefly visible before the kill feed rewrites the contact; the physical beat is a rescue-pod recovery under hostile escort fire. | `PQ-032.00` → `PQ-152.01`; `SM-02` is a candidate treatment |
| **B3 — Bigger Boat / Kessler’s Hull** | The path reaches the Pit shipyard and the Tier-2 *Variance Adjustment*. Slate’s repair work and the asymmetrical heavy bow make the upgrade a visible consequence of the earlier route. | `PQ-032.00` and existing ship progression; visual candidate `ship_variance_adjustment` |
| **B4 — Pick a Side / The Bourse** | The story introduces the Clearing Station and its Concord, Meridian, and Free Captain accounts. The meeting reveals pressure in the ledger while the campaign remains linear; a faction presentation is not a branching menu. | `PQ-032` spine; place candidate `env_clearing_station_concourse` belongs in §3 |
| **B5 — Proving Ground / The Silent Route** | Wren moves sealed administrative logs through the Gate 3 customs scanner. The scene tests reading, timing, mass, and route choice through the existing physical verbs rather than a dialogue choice. | `PQ-032` spine; `SM-06` is a candidate mission treatment |
| **B6 — Empire Seed / The Board Notice** | A physical asset stake and its first remittance show how the institution turns the discrepancy into a living system. The combat-stake route remains available alongside the builder route; no fixed payout or capital threshold belongs here. | `PQ-032.01` and existing economy owners |
| **B7 — The Deep Reach / Climax at Ashfall** | Wren carries the investigation into the Ashfall Reach graveyard and meets Kurtz, the station administrator still counting the same mass at his desk. The graveyard, shattered freighters, and isolated command module give the existing ending flow a physical place to land. | `PQ-032.02`; visual candidates `env_ashfall_boneyard` and `station_kurtz_terminal` |

### Spine hazard checks

The beat order is one line from B0 through B7. The five existing endings and post-ending chains
remain untouched; a candidate beat can change the physical approach and the evidence the player
has earned, but cannot add a new branch or require a particular ending choice. The two ways into
the gate are authored as different verbs, not as separate story trees: a builder can meet the
gate through the existing ownership path, and a combat-only player can meet it through the
combat stake. The exact heavy-verb requirement and time-to-ending target stay with `PQ-032.01`.

## 2. Eight candidate briefs for existing set-piece slots

These briefs retain the authored momentum problems while routing them through the existing
`PQ-152` leaves. The first three also give `PQ-032.00` physical treatments for B1–B3. They are
unreviewed candidates: an owner may adopt, merge, or replace a brief without increasing the ten
slot count.

### SM-01 — The Wrecking Ball (demolition)

- **Physical problem:** Use a tethered orbital mass to strike selected load-bearing points on a
  decommissioned refinery tower.
- **Candidate solutions:** Build a precise sling trajectory from an offset orbit, or tow and
  release the mass at close range while using the player hull as the pendulum counterweight.
- **Owner route:** `PQ-152.00`/`.01`; `PQ-032.00` may use it for the opening set piece.

### SM-02 — Pod Rescue Under Fire (rescue)

- **Physical problem:** Recover drifting life pods from a shattered hauler while hostile escorts
  pressure the debris field. Cable tension, pod fragility, and hull fragments make the line itself
  part of the rescue problem.
- **Candidate solutions:** Stage pods one at a time behind cover, or pull a safe corridor with the
  Massline and recover the group from stand-off range.
- **Owner route:** `PQ-152.00`/`.01`; `PQ-032.00` may use it for B2.

### SM-03 — The Long Tow (logistics and inertia)

- **Physical problem:** Drag a dense unrefined slag core through a Ceres asteroid slalom. The
  towed mass should pull the player’s flight vector into a real pendulum problem.
- **Candidate solutions:** Take a direct line with deliberate angle and momentum management, or
  use a wider staged route with controlled releases and re-latches.
- **Owner route:** `PQ-152.00`/`.01`; `PQ-032.00` may use it for B1/B3 progression.

### SM-04 — Convoy Defence With Real Cargo (escort)

- **Physical problem:** Protect slow freighters while raiders use grappling harpoons to strip loose
  cargo pods instead of simply burning down hulls.
- **Candidate solutions:** Sever hostile tethers and recatch each pod, or interpose the player hull
  and a controlled massline swing to drive raiders away from the cargo lane.
- **Owner route:** `PQ-152.01`; cargo custody remains with `PQ-148`.

### SM-05 — The Station-Door Jam (tactical obstacle)

- **Physical problem:** A Concord patrol wedge overwhelms the player near a station approach. A dead
  frigate hulk can obstruct or redirect the docking-ring pursuit vector.
- **Candidate solutions:** Place the hulk as a temporary jam and escape through the opened route, or
  swing it across the approach and use the release to break the wedge’s formation. Pursuers may
  deflect, withdraw, or collide according to the simulation; no collision is promised to be fatal.
- **Owner route:** `PQ-152.01`; station geometry and arrival presentation remain packet-owned.

### SM-06 — Gate 3 Impound Break (heist and infiltration)

- **Physical problem:** Liberate an impounded smuggler craft from a locked orbital cradle at Gate 3.
  The customs scanner, inspection cones, drone berths, and perimeter defenses make the facility a
  spatial puzzle.
- **Candidate solutions:** Slip through a real scan gap using a decoy and line control, or breach
  the checkpoint with a physical massline approach and leave before the response closes the lane.
- **Owner route:** `PQ-152.01`; the candidate visual anchor is `station_gate3_customs_arch`.

### SM-07 — Capital Boss Subsystem Dismantle (boss combat)

- **Physical problem:** A named capital boss such as the candidate ALA Dreadnought protects
  exposed heat radiators and stern thruster bells behind directional armor. Its subsystems should
  respond to where and how mass arrives.
- **Candidate solutions:** Fling loose debris into the exposed subsystems, or use conventional
  weapons and positioning to open those subsystems before finishing the dismantle. There are no
  immunity phases; the packet owns the damage and survivability table.
- **Owner route:** `PQ-152.02` and the existing combat owners.

### SM-08 — Debris Reef Clearance (mine bowling)

- **Physical problem:** Clear a flight corridor containing tethered magnetic proximity mines by
  moving loose iron mass through the field from a safe stand-off distance.
- **Candidate solutions:** Bowl selected asteroids through a planned detonation chain, or reposition
  the mine line with the Massline and open a corridor directly. The route must remain physically
  solvable without a guaranteed fatal collision.
- **Owner route:** `PQ-152.01`; do not treat the Clearing Station as this mission’s asset or
  setting—the station brief belongs in §3.

## 3. Four candidate place briefs

These place identities support `PQ-162.02`’s existing “arriving somewhere” outcome. They are
candidate dressing and composition, not a fifth packet leaf or a request for four new station
types. The Clearing Station reference moved here from SM-08 so the mission and place owners stay
distinct.

### Place 1 — Outpost 9 Bar (Quinn’s hub)

Sker Haven’s social room for miners and outer-route crews: Quinn checks currency chits at a heavy
zinc bar under a purple counterfeit lamp; conduit hangs over scuffed booths, a commodity ticker is
chalked onto blackened steel, and dust-stained suits make the work visible. Candidate environment
anchor: `env_outpost9_bar`.

### Place 2 — The Pit Lower Airlock and Berth 4

The working shipwright berth at Tethys Junction: the player docks against a clamp platform marked
with `THEY KNEW THE MASS.` while silica dust drifts in microgravity, Sump sweeps with a magnetic
broom, and Slate welds repaired plating from an overhead gantry. Candidate environment anchor:
`env_thepit_berth4`.

### Place 3 — Helios Bay 7 Transit Depot

The Core logistics hub where Contract 47-A begins: tall warehouse racks, yellow rail loaders,
hard halogen light, and clean Concord security lines frame a pallet rack holding the unreconciled
atmospheric-recycler grid under Ticket Y3-C2. Exact cargo mass and ticket timing remain narrative
and runtime source decisions. Candidate environment anchor: `env_helios_bay7_depot`.

### Place 4 — The Clearing Station Central Concourse

A neutral border exchange where Concord, Meridian, and Free Captain interests meet. A triangular
observation rotunda looks over divergent docking spokes; polished brass and black carbon fiber
share the frame with oxidized welded scaffolding. Candidate environment anchor:
`env_clearing_station_concourse`.

## Concept-origin inventory

The following local Antigravity paths are retained only as provenance for the candidate concepts.
They are machine-specific, nonportable, unreviewed references and are not canonical shipped
evidence, asset approvals, or manifest inputs. No file copy is implied.

| Candidate | Origin path |
|---|---|
| `ship_cpv2214_can` | `C:/Users/93rob/.t3/userdata/providers/antigravity/ac0a3dfd6dddb20962cecff6ee5fe65e19d3923be20e52c5ab52ff877f7e4c32/antigravity-acp/brain/b68ece2c-6560-409c-b346-aa9853cf58cd/penal_transport_can_1788689745459.jpg` |
| `ship_variance_adjustment` | `C:/Users/93rob/.t3/userdata/providers/antigravity/ac0a3dfd6dddb20962cecff6ee5fe65e19d3923be20e52c5ab52ff877f7e4c32/antigravity-acp/brain/b68ece2c-6560-409c-b346-aa9853cf58cd/variance_adjustment_hull_1788689314815.jpg` |
| `env_ashfall_boneyard` / `station_kurtz_terminal` | `C:/Users/93rob/.t3/userdata/providers/antigravity/ac0a3dfd6dddb20962cecff6ee5fe65e19d3923be20e52c5ab52ff877f7e4c32/antigravity-acp/brain/b68ece2c-6560-409c-b346-aa9853cf58cd/ashfall_reach_boneyard_1788691276379.jpg` |
| `station_gate3_customs_arch` | `C:/Users/93rob/.t3/userdata/providers/antigravity/ac0a3dfd6dddb20962cecff6ee5fe65e19d3923be20e52c5ab52ff877f7e4c32/antigravity-acp/brain/b68ece2c-6560-409c-b346-aa9853cf58cd/gate3_customs_arch_1788689790052.jpg` |
| `env_outpost9_bar` | `C:/Users/93rob/.t3/userdata/providers/antigravity/ac0a3dfd6dddb20962cecff6ee5fe65e19d3923be20e52c5ab52ff877f7e4c32/antigravity-acp/brain/b68ece2c-6560-409c-b346-aa9853cf58cd/outpost9_bar_1788689729112.jpg` |
| `env_thepit_berth4` | `C:/Users/93rob/.t3/userdata/providers/antigravity/ac0a3dfd6dddb20962cecff6ee5fe65e19d3923be20e52c5ab52ff877f7e4c32/antigravity-acp/brain/b68ece2c-6560-409c-b346-aa9853cf58cd/pit_airlock_dock_1788689348667.jpg` |
| `env_helios_bay7_depot` | `C:/Users/93rob/.t3/userdata/providers/antigravity/ac0a3dfd6dddb20962cecff6ee5fe65e19d3923be20e52c5ab52ff877f7e4c32/antigravity-acp/brain/b68ece2c-6560-409c-b346-aa9853cf58cd/helios_bay7_depot_1788689365975.jpg` |
| `env_clearing_station_concourse` | `C:/Users/93rob/.t3/userdata/providers/antigravity/ac0a3dfd6dddb20962cecff6ee5fe65e19d3923be20e52c5ab52ff877f7e4c32/antigravity-acp/brain/b68ece2c-6560-409c-b346-aa9853cf58cd/clearing_station_bourse_1788691294136.jpg` |

## Adoption rule

When a packet adopts a candidate, it must record the exact existing leaf, resolve any conflict with
the current story or runtime source, and specify the player-facing measurement that closes it. An
adopted place or asset still needs the relevant visual, accessibility, performance, manifest, and
route review. Until then, this file is a compact home for ideas, not evidence that anything has
shipped.
