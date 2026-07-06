# WORLD OVERHAUL 2.1 — "A Reason For Everything"

> **Status: LEGACY 2026-07-06.** This is unmanaged drift per `AGENTS.md §4`. The live world/sectors
> authority is `design/spec3/SPEC3-F7-living-universe.md` + `design/spec3/SPEC3-F8-world-threads.md`
> (where they exist) + the economy/ecology threads `design/spec3/SPEC3-F1*`/`F2*` and the revamp BPs
> BP-11 (sector atmosphere), BP-12 (causal economy), BP-13 (pirate ecology) in `design/revamp/`. The
> "reason for everything" ethos is inherited by those threads. Do **not** implement from this file —
> reconcile against the spec3 threads and the revamp ledger first.

> **Goal:** turn SpaceFace's sectors from *a flat disc of unrelated dots that reads like a test room*
> into *inhabited, territorial, historical, economically-motivated space* — EVE density, Freelancer
> sector-clarity, Elite travel-fantasy, X4/Starsector faction identity, Everspace-2 encounter readability.
>
> **Governing principle (verbatim from the design brief):**
> *"Nothing should spawn randomly unless the randomness has a believable cause. Space should feel
> inhabited, territorial, historical, dangerous, and economically motivated."*
>
> **Authority:** extends `ARCHITECTURE.md` (technical contract) and `design/GDD_2_0.md` (design authority);
> implements the already-written `design/spec3/SPEC3-F7-living-universe.md` (specs 29–32) and
> `SPEC3-F4` (spec 21 encounter-director-AI), and finishes `design/spec2/04_WORLD_ALIVE.md` (Not-Built).
> Where this doc and those disagree on a number, this doc names the call and those specs supply the depth.
>
> **Status legend:** ✅ shipped & verified · 🔨 next lane (specced here, not built) · 📐 design-only.

---

## 0. TL;DR for an implementer picking up a lane

1. Read §1 (what already shipped — do **not** rebuild it) and §2 (the zone data contract everything hangs off).
2. Find your lane in §4. Each lane has: **why**, **files to touch**, **integration seams already discovered**,
   **acceptance**, and **cross-refs** to the deep spec. Build only your lane; the seams are stable.
3. Obey §5 (determinism / perf / golden rules). The sim never calls `Math.random()`. Ships are budget-capped.
4. `factionId` is **readability only** (radar/HUD colour + kill-rep target). Hostility is decided by
   `scanner.isHostileToPlayer` (team / archetype / spawnContext / sector security) — **never** by faction.

---

## 1. What shipped in Wave A (✅ verified, the foundation)

The single highest-leverage change: **why enemies read as "cheap and random" was never the AI brains.**
The SG-06 tactical stack (`src/ai/`) already does squads, wedge/line/ring formations, roles, 8 tactics,
flee-when-damaged, reinforcements, and deterministic (non-random) steering. The two real failures were
**placement without purpose** and **zero readability**. Wave A fixes both:

| # | Change | Files | Proof |
|---|---|---|---|
| A1 | **Named zones per sector** — every sector has zones with a faction, a one-line *reason it exists*, geometry aligned to real stations/fields/POIs, a 0–5 threat tier, and optional `presence`. | `src/data/sectorZones.js` (new) | boots clean; `check:bundle` green |
| A2 | **Purposeful, zone-anchored spawning** — ambient hostiles/patrols spawn *from* the right zone (pirates on ambush lanes, patrols on corridors, scavengers at derelicts) as **one cohesive faction squad per zone** (shared `ai.squadId`), instead of scattering singletons on random radial rings. Budget-neutral (same ship count → same perf). | `src/systems/world.js` `_spawnEnemies` | runtime: Ceres → Refinery-patrol + Belt-Shadow-Ambush + Driller squads; Sker → 4-ship + 3-ship Reach wedges; no console errors |
| A3 | **Truthful enemy factions** — every hostile used to be tagged `faction_vael` (green alien), so a Crimson Reach pirate read as a Vael. Now each archetype carries its real faction and a zone can override it. Pirates read red, patrols blue, traders friendly. | `src/data/enemies.js`, `src/systems/combat.js` (`makeEnemySpawnSpec(..., opts)`) | radar `FACTION_COLOR` now resolves correctly |
| A4 | **Zone-entry cue** — crossing into a named zone fires `world:zoneEntered` + a threat-coloured toast (`⟢ Belt-Shadow Ambush`) and publishes `state.world.currentZone` for the HUD/map. | `src/systems/world.js` `_tickZoneLabel` | runtime: correct toast + `currentZone` on entry |
| A5 | **Steady mining** — ore now trickles in per-tick in lockstep with beam damage (was: silent beam then a 25%-threshold "dump"). Total yield unchanged. Added `ast.data.miningWear` (0→1) as a render hint for progressive shrink/darken. | `src/systems/mining.js` | `check:mining:2` green |

**Root-cause note for future lanes:** the AI roster groups squads by
`ai.squadId ?? ai.wingId ?? \`${doctrine}:${faction}\`` (`src/systems/aiPorts.js:262`). Give a group a
shared `squadId` + spawn it clustered and SG-06 forms it up on the spot. That is the whole trick behind A2.

---

## 2. The zone data contract (`src/data/sectorZones.js`) — READ BEFORE ANY LANE

Every downstream lane (map, missions, encounters, economy) reads zones. The shape is stable:

```js
{ id, name, type, factionId, reason, center:{x,z}, radius, threat?, presence? }
```

* **`type`** ∈ `ZONE_TYPES` — `civilian_core`, `trade_lane`, `patrol_corridor`, `border_checkpoint`,
  `refinery_approach`, `mining_belt`, `colony`, `derelict_field`, `outlaw_zone`, `radiation_field`,
  `nebula_fog`, `ambush_lane`, `anomaly_deep`. Each carries a map `color`, default `threat`, and
  `safe`/`hazard` flags.
* **`presence`** (optional) — `{ role, archetypes[], size:[lo,hi], doctrine, formation, context, hostile, factionId? }`.
  Only zones with `presence.archetypes` get combat spawns; civilian/trade/mining zones are populated by
  ambient traffic (Lane C). Presence templates live in the `P.*` helpers at the top of the file.
* **Helpers:** `zonesForSector(id)`, `zoneAt(id,x,z)` (smallest containing disc), `zoneThreat(zone)`,
  `zoneTypeMeta(type)`, and `planZoneSpawns(id, budget, [lvLo,lvHi], rng)` → deterministic spawn intents.

**Authored coverage:** all 10 sectors have zones; the starter neighbourhood (Helios, Ceres, Tethys, Vesta,
Pallas, Io) is authored richly. Geometry aligns to `src/data/sectorAnchors.js` so a label sits on real
content. **To add content, extend the data — do not add code paths.**

**Adding a zone type or a sector's zones is pure data.** No system changes needed for placement + readability.

---

## 3. The felt "first hour" this unlocks (the target experience)

Per the brief, the starter neighbourhood must read as a **frontier hub**, not a sandbox. With Wave A + the
lanes below, the first hour becomes: undock from **Concord Core** (safe, patrolled) → learn to mine at the
**Sanctioned Claim** → jump one gate to **Ceres Mining Belt** → get the `⟢ Belt-Shadow Ambush` warning and
meet a **Crimson Reach** pirate wedge camping the ore lane → fight or run → find **The Abandoned Driller**
derelict and scavengers → sell ore at **Ceres Refinery** under a Concord patrol → see the map light up with
safe/danger/profit/faction zones. Helios stays combat-free (tutorial); danger begins exactly one jump out.

---

## 4. Build lanes (each is one implementation session)

### Lane B — Readability surface: ONE galaxy map + contact identity 🔨
**Why:** the player must, at a glance, read *safe / dangerous / profitable / faction / unknown*. Today there
are **two** maps (N `localmap.js`, M `starmap.js`) and contacts don't show ship threat-level.
**Files:** new `src/ui/screens/galaxymap.js`; `src/ui/bindings.js`, `src/ui/input.js`, `src/ui/uiRoot.js`
(register one screen, retire the split); read zones from `sectorZones.js` and `state.world.currentZone`.
**Seams already found:** the autopilot pipeline is done — clicking anything emits `ui:setCourse` (pos → local
waypoint via `world.js:_onSetCourse`; sectorId → Dijkstra route via `computeRoute`). The new map only needs to
emit `ui:setCourse`; **do not touch flight/nav.** Radar (`src/ui/radar.js`) already has `FACTION_COLOR` +
hostility shapes — reuse it.
**Scope:**
1. One screen, smooth zoom **local → system → sector → galaxy** (fold both existing renderers into layers).
2. Draw zone discs + labels + threat tint (from `ZONE_TYPES.color` / `zoneThreat`); fog uncharted sectors.
3. Click any station/zone/sector → set autopilot. Show services on station select; threat/resources on zone select.
4. Contact HUD/target panel: show **faction · role · threat-level** and a **ship class/level badge** (data is
   already on `entity.data.ai.archetype`, `entity.data.shipClass`, `entity.data.level`, `entity.factionId`).
**Acceptance:** single keybind opens the map; N and M no longer open two maps; `check:starmap-objective` +
`check:localmap-routes` still green (or are replaced by `check:galaxymap`); clicking a far station autopilots there.
**Cross-ref:** `design/world-identity/WORLD_NAVIGATION_SPEC.md`, `SPEC3-F10` (UX), brief §"Map and navigation".

### Lane C — Living traffic + NPC-vs-NPC faction combat 🔨
**Why:** the world must continue without the player — traders run cargo, miners work belts with escorts,
patrols save civilians, bounty hunters chase *marked targets* (not the player), pirates raid *traders*.
**Files:** `src/systems/traffic.js` (itineraries), `src/systems/factions.js` (relation→hostility), the team model.
**Seams / the one hard problem:** today all NPCs are `team === 1`, and `isHostile` returns false for same-team —
so patrols and pirates **coexist without fighting**. To get NPC-vs-NPC combat, add a faction-relation hostility
path in `scanner.isHostile`/`aiPorts.isHostile` (two team-1 ships are hostile when their factions' relation is
negative, gated to avoid griefing the player's escorts). This is the keystone for "patrols save civilians" and
"bounty hunters blow up their marks."
**Scope:** trader itineraries (station→station on economy gradients), miner+escort clusters on `mining_belt`
zones, convoys on `trade_lane` zones (robbable), bounty NPCs that pursue a marked NPC across a sector, distress
calls (60% genuine / 40% pirate bait — reuse `comms`/bar-rumor plumbing).
**Acceptance:** `check:traffic` (new) proves ≥1 trader run, ≥1 convoy, and one NPC-vs-NPC kill in a low-sec
sector over N ticks, deterministically; `check:sim:compare` unaffected (traffic is offscreen-budgeted).
**Cross-ref:** `SPEC3-F7` spec 29 (ambient NPC traffic — has the full itinerary/convoy/rescue design).

### Lane D — Encounter director (dynamic encounters) 🔨
**Why:** finish the Not-Built `SPEC2/04 World Alive`. Weighted encounter budget (max 1 major + 2 minor / 10 min),
deterministic via `hash32(seed, sectorId, dayIndex)`.
**Files:** new `src/systems/encounterDirector.js` + `scripts/check-encounter-director.mjs` (both named as
missing in `CURRENT_BUILD_STATUS.md`). Anchor encounters to zones (ambush on `ambush_lane`, inspection on
`border_checkpoint`, distress in deep space).
**Encounter shapes:** interdiction, patrol scan ("submit to inspection"), pirate cargo-demand (pay/fight),
distress (genuine/bait), named bounty, convoy-under-attack, surrender. Pirates flee <20% hull (already in
archetype data), call reinforcements (already wired), demand-before-attack (new dialog state).
**Acceptance:** `check:encounter-director` green; budget respected; encounters cite a zone reason.
**Cross-ref:** `SPEC2/04`, `SPEC3-F4` spec 21, `SPEC3-F7` spec 29; brief §"Dynamic encounter ideas".

### Lane E — Ring-lane travel + seamless traversal 🔨
**Why:** the brief wants high-speed ring "highways" between economically-linked regions, **no loading screens**,
pirates that blow rings to strand traders, and manual flight where factions don't share a clean network.
**Files:** ring structures as a new `POI_TYPES` entry + `sectorAnchors` placements; `src/systems/cruise.js`
(ring-boost mode); `src/systems/world.js` traversal. **Seamless option:** stream neighbour-sector content into
a halo around the active sector rather than the hard `enterSector` despawn/respawn — the biggest architectural
item; spec a streaming ring before building (keep the seeded per-sector determinism).
**Acceptance:** ring entry accelerates the player along a lane; a destroyed ring drops them into a danger pocket;
`check:sim:compare` determinism preserved.
**Cross-ref:** brief §"Travel and ring-lane ideas"; `SPEC3-F3` (flight/cruise constants).

### Lane F — Salvage, wrecks & discovery 🔨
**Why:** deep-space wreckage should tell stories — a floating communicator near a `derelict_field` starts a
mission chain; black boxes reveal who attacked; survivor pods create moral choices; salvage is dangerous.
**Files:** `src/systems/mining.js` (salvage beam already drains wrecks — extend with named-loot + mission
triggers), `src/systems/missions.js`, `src/systems/scanner.js` (signal categories: distress/combat/wreck/
anomaly/illegal/encrypted; triangulation for hidden bases).
**Acceptance:** salvaging a flagged wreck can emit `mission:offered`; scanning classifies unknown contacts.
**Cross-ref:** `SPEC3-F7` spec 31 (exploration/anomalies), spec 32 (narrative spine); brief §"Salvage and wreck".

### Lane G — Economy causation + reputation consequence 🔨
**Why:** presence must be economically motivated and player actions must ripple. Stations need resources;
piracy on a route raises prices; clearing pirates makes traders safer; smuggling trades military rep for
black-market access.
**Files:** `src/systems/economy.js`, `src/systems/economyCycles.js`, `src/systems/factions.js`,
`src/systems/sectorSim.js` (already diffuses danger/price/influence over the graph — feed zone outcomes in).
**Acceptance:** killing pirates in a zone measurably lowers local danger + trader spawn risk over time (`check:balance`).
**Cross-ref:** `SPEC3-F1` (economy), `SPEC3-F6` (territory/faction war); brief §"Economy" + §"Reputation".

### Lane H — Station identity + "why can't I dock" + faction comms 🔨
**Why:** non-dockable stations must still say *why* (abandoned / private / military-only / under construction /
quarantine), and factions must sound different over comms.
**Files:** `src/data/sectors.js` (station `dockable` + `dockDenyReason`), `src/ui/comms.js` (faction-flavoured
barks tied to SG-06 tactic transitions — the barks table already exists in the legacy `ai.js`; surface it).
**Acceptance:** approaching a non-dockable station gives a specific reason toast; pirate vs Concord comms differ.
**Cross-ref:** brief §"Station and structure ideas" + §"Professional polish"; `SPEC3-F8` spec 36 (HUD/UI visual).

---

## 5. Non-negotiable rules for every lane

* **Determinism:** the sim never calls `Math.random()`. Use `state.world.rng` (sector gen), `state.combat.rng`,
  etc. `planZoneSpawns` takes the RNG as a parameter for exactly this reason. VFX may use `Math.random()`.
* **Perf:** the live ship budget is ~10–14 (`check:perf`, 30fps floor, draw-call budget). Zone spawning is
  **budget-neutral** — relocate ships, don't multiply them. New systems that spawn must respect the cap.
* **Goldens:** never edit `test/*.expected.json` to pass. `check:sim:compare` (47-A) is a scripted scenario —
  it does not use the sector ambient spawner, so world-content changes don't perturb it. (It is currently red
  on the WIP baseline for a **pre-existing** "projectile-collision precondition" reason — not from this work.)
* **`factionId` is cosmetic + kill-rep only.** Hostility lives in `scanner.isHostileToPlayer`. Don't couple them.
* **Additive/guarded:** a sector with no authored zones must keep the legacy ring spawner. Never hard-require zones.

---

## 6. Cross-reference map (so lanes extend, never duplicate)

| This doc lane | Deep spec that already designed it | Build artifact it produces |
|---|---|---|
| A (shipped) | SPEC3-F7 §30 sector-content-map | `src/data/sectorZones.js`, zone spawner |
| B map/readability | WORLD_NAVIGATION_SPEC, SPEC3-F10 | `src/ui/screens/galaxymap.js` |
| C living traffic | SPEC3-F7 §29 ambient-traffic | `traffic.js` itineraries, NPC-vs-NPC hostility |
| D encounter director | SPEC2/04, SPEC3-F4 §21 | `src/systems/encounterDirector.js` |
| E ring-lanes/seamless | SPEC3-F3, brief travel §| ring POIs, cruise ring-mode, sector streaming |
| F salvage/discovery | SPEC3-F7 §31, §32 | salvage missions, signal classification |
| G economy/reputation | SPEC3-F1, F6 | economy causation, rep ripple |
| H station id/comms | SPEC3-F8 §36 | dock-deny reasons, faction barks |

**Recommended order:** B → C → D first (they make the world *legible and alive* on top of the zone spine that
already exists), then E → F → G → H for depth. B and C are independent and can run in parallel.
