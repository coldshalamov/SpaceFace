# SpaceFace — Canonical Technical Architecture

> This document is the **contract**. Every implementer follows it verbatim. Where the ten subsystem specs disagreed, this document makes one call and names the loser. Conflict resolutions are marked **[RESOLVED]**. Do not re-litigate them in code; raise a design ticket if a number must change.

---

## 0. GLOBAL CONVENTIONS (decide once, apply everywhere)

### 0.1 Coordinate plane — AUTHORITATIVE
- Gameplay is on the **XZ plane**, **+Y is up**, the world is flat. Sim holds `y = 0` for all positions/velocities.
- Heading `rot` is a **yaw** angle in radians around **+Y**, measured from **+X toward +Z**: `rot = atan2(dz, dx)`.
- `forward = (cos rot, 0, sin rot)`; `right = (-sin rot, 0, cos rot)`.
- Distances are **world units (wu)**, ~1 m visually.
- **[RESOLVED]** Specs variously said "XZ or XY". It is **XZ**, always. 2D math (radar, AI, physics) uses `(x, z)` as the plane; `(x, y)` in 2D-only code means `(world.x, world.z)`.

### 0.2 Units
| Quantity | Unit | Symbol |
|---|---|---|
| money | credits | cr |
| distance | world units | wu |
| speed | wu/s | — |
| accel | wu/s² | — |
| angular vel | rad/s | — |
| mass | tonnes | t |
| cargo volume | volume units | u |
| time | seconds | s |
| research | research points | RP |

### 0.3 Event-name delimiter — AUTHORITATIVE
- **All events use `:` as the delimiter**, lowercase, `domain:verb` or `domain:noun` form (`combat:kill`, `economy:tradeCompleted`).
- **[RESOLVED]** Specs used `.`, `:`, `/`, `_` interchangeably. `:` is the plurality (combat, factions, ships, audio, UI). **Every** event from every spec is rewritten to `:` in the master event table (§4.4). Old names are dead.

### 0.4 ID naming scheme — AUTHORITATIVE
- Content IDs are **lower_snake_case strings**, namespaced by category: `ship_kestrel`, `wpn_pulse_laser_s`, `mod_shield_booster_s`, `cmdty_ore_iron`, `tech_combat_basics`, `sector_helios_prime`, `station_helios`, `faction_scn`, `mission_*`, `recipe_refine_iron`.
- Entity instances use **numeric** ids (monotonic allocator, see §3).
- **All cross-system references are by string ID** (never object refs) so save/load is safe.

### 0.5 RNG & determinism — AUTHORITATIVE
- One master `GameState.meta.seed:int`. Each system derives its own stream from it so streams never interfere:
  - `state.rng` — core sim PRNG (mulberry32 seeded from `seed`).
  - `state.combat.rng` — combat (loot/spread), seeded `hash32(seed, 'combat')`.
  - `state.economy.rng` — economy events.
  - `state.world.rng` — sector/field generation, seeded `hash32(seed, sectorId)` per sector.
  - missions use `hash32(seed, stationId, refreshEpoch)` per board (stateless).
  - `state.automation.rng` — loss/raid rolls.
- **The simulation NEVER calls `Math.random()`.** All seeds serialize. VFX/particles may use `Math.random()` (cosmetic, not serialized).

### 0.6 Single-writer ownership rules — AUTHORITATIVE
- **Credits** (`state.player.credits`): the **economy** module is the only writer. Everyone else emits `economy:grantCredits` / `economy:chargeCredits`. (Fallback: direct write only if economy is unsubscribed, e.g. unit tests.)
- **Reputation** (`state.factions[id].rep`): the **factions** module is the only writer, via `applyRep()`. Others emit `faction:repDelta`.
- **Cargo** (`state.player.cargo`): the **cargo** module is the only writer, via `addCargo`/`removeCargo`. Others call those helpers or emit requests.
- **Ship derived stats** (`entity.derived` / ship stat block): the **ships** module is the only writer, via `getDerivedStats()`; emits `ship:statsChanged`.
- **Sector ownership** (`state.world.sectors[id].owner`): the **factions** module writes it (war resolution only); the **world** module reads it.
- **`state.player.credits` is a number; debt/bounty are separate fields.**

### 0.7 Health model — AUTHORITATIVE [RESOLVED]
- Core spec used `hp/maxHp + shield`. Combat used `hull/armor/shield/cap`. **Combat's 4-field model wins** (core itself said "values from combat").
- Canonical health fields on a ship entity: `hull, hullMax, armorHp, armorMax, armorFlat, shield, shieldMax, cap, capMax` (+ regen/delay fields).
- `entity.hp` is an **alias** that equals `hull` (kept so generic core code reading "hp" works). `entity.maxHp == hullMax`. Implement `hp` as a getter/setter over `hull` on ships; asteroids/wrecks use `hull` directly with `armorHp=0, shield=0`.

### 0.8 Security & danger scale — AUTHORITATIVE [RESOLVED]
- World owns sectors; **security is a float `0.0..1.0`** (`sector.security`). Combat's `securityLevel 0..5` is dead.
- Conversion (single source of truth, lives in `src/data/sectors.js` helper):
  - `dangerTier(sector) = clamp(round((1 - sector.security) * 5), 0, 5)` → feeds `scaleCombatant`.
  - `wealthIndex(sector) = clamp(0.3 + 0.16*tier + 0.10*(1-security), 0.3, 1.6)`.
  - `dangerIndex(sector) = clamp(0.05 + 0.22*tier + 0.25*(1-security), 0, 1.0)`.

### 0.9 Reputation scale — AUTHORITATIVE [RESOLVED]
- **Reputation is `[-1000, +1000]` with 9 tiers** (factions spec). The UI spec's `-100..+100`/5-tier scale and the Save spec's `-100..100` default range are **WRONG** — they are overruled. UI renders the -1000..1000 / 9-tier bar. New-game default rep is `0` for most factions (faction-specific starts in §3.10).

### 0.10 Starter ship & cargo — AUTHORITATIVE [RESOLVED]
- **Starter ship = `ship_kestrel`** (Ships/Modules/Tech T0, price 0). The names `Shuttle`/`shuttle_mk1`/`Scout` are dead aliases; new-game and respawn loaner both use `ship_kestrel`.
- **Starter cargo capacity = 40u.** (Mining's entire early-economy math is tuned to 40u; it is the most number-dependent spec.) The Kestrel def's `cargo 25u` and the Save/Economy `50u` are overruled to **40u**. `ship_kestrel.cargo = 40`.
- Mining laser starter rate = **18 ore-HP/s** (`beam_mk1`). Combat's 22/s and Ships/Tech's 6/s are overruled; the 6/s value is reinterpreted as the *Ships/Tech Mining Laser S yield to cargo* (a different number domain — ore-HP shaved vs u/s yielded — see §0.11).

### 0.11 Mining: ore-HP vs yield — AUTHORITATIVE [RESOLVED]
Two distinct quantities that specs conflated:
- **`beam.dps`** = ore-HP shaved off an asteroid per second (how fast you break rock). Starter = **18 ore-HP/s**.
- **asteroid `oreYield`** = total `u` of ore an asteroid releases over its life (independent of dps).
- The Ships/Tech "Mining Laser S: 6 yield/s" is mapped onto `beam.dps`-equivalent tiers via the Mining `beam_mk*` table; the canonical mining beam tiers are the **Mining spec's** `beam_mk1..beam_industrial` (dps 18/30/48/70). Module mining items in Ships/Tech (`mod_mining_laser_s` etc.) reference these beam tiers by `beamTierId`.

### 0.12 Commodity / cargo registry — AUTHORITATIVE [RESOLVED]
- There is **ONE** commodity registry (`src/data/commodities.js`) covering raw ores, refined goods, trade goods, contraband, salvage. The Mining IDs (`ore_iron`, `ice_water`, `gas_hydrogen`) and Economy IDs (`ore`, `water_ice`, `volatiles`) are unified under `cmdty_*` IDs. Mapping table is in §3.6.1.
- **Cargo shape**: `state.player.cargo = { items: {[cmdtyId]: qty}, usedVolume, usedMass, capVolume, capMass }`. The Mining bare-map shape (`{[id]:number}`) is overruled; mining reads/writes `cargo.items` through the cargo helpers. `capVolume` default = **40** (see §0.10). `capMass` is a soft penalty input, not a hard cap — see §0.13.

### 0.13 Mass is a penalty, never a second cap — AUTHORITATIVE [RESOLVED]
- Volume (`u`) is the **only hard cargo cap**. `cargoMassT` (derived) feeds flight handling as a multiplier penalty. Economy's `usedMass <= capMass` check is **demoted**: `capMass` exists only as the reference mass for the handling formula; a trade is never blocked by mass. (Economy validates volume only.)

### 0.14 Camera params — AUTHORITATIVE [RESOLVED]
- The **render layer (VFX module) owns camera numeric params**; core owns the damped-follow + shake **math**.
- Canonical numbers (VFX spec wins over Core's, except shake which Core owns):
  - `fov = 50`, `near = 1`, `far = 4000`.
  - Tilt 60° from horizontal; offset computed as `(0, D*sin60°, -D*cos60°)`.
  - Zoom presets (height/D): combat `55`, cruise `70` (default), map-peek `130`. Scroll-wheel clamps `45..130`.
  - Camera follows **position only, never ship yaw** (anti-nausea).
  - Follow lerp `CAM_LERP = 6.0/s` (Core's value; frame-rate-independent `1-exp(-CAM_LERP*frameDt)`).
  - Look-ahead `k=0.35`, max `18 wu`, aim-bias `0.25`.
  - Shake: trauma model, `SHAKE_DECAY = 1.6/s`, `maxShake = 2.2 wu + 0.04 rad roll`.
- **[RESOLVED]** VFX's `fov 42`, `offset (0,220,130)`, `lerp 12` are overruled by the above. VFX uses these canonical numbers.

### 0.15 Entity store vs combatants — AUTHORITATIVE [RESOLVED]
- There is **ONE authoritative store**: `state.entities: Map<id,Entity>` (+ `entityList`). Combat's `combatants: Combatant[]` is **NOT a separate store** — it is a **derived per-tick index** (`entityList.filter(type==='ship' && alive)`), rebuilt each combat substep, never serialized. All combat stats live **on the entity** (in the flat shape for hot fields, in `entity.data.combat` for the rest).
- Consistent with Combat's save rule: player combat fields serialize (they're on the player entity, which serializes); NPC ships regenerate from the spawner.

### 0.16 Projectile ownership & collision — AUTHORITATIVE [RESOLVED]
- **Projectiles are core Entities** (`type:'projectile'`) and use **core's single spatial hash (cell 64 wu)** + core's swept-circle test. Combat's separate `cell 120` grid and pooled `projectiles[512]` array are **overruled**.
- Combat **spawns** projectile entities (via `entity:spawnRequest`) and **consumes** `projectile:hit` to resolve damage. Pooling is an internal optimization inside the core entity factory (recycled ids), not a parallel array.
- Flak/PD projectile-vs-projectile interception is handled by giving PD projectiles `collisionMask |= PROJECTILE` and PD-tagging; core collision emits `projectile:hit` and combat decides the missile dies.

### 0.17 Catalog ownership (single owner, others defer) — AUTHORITATIVE
| Catalog | Owner module / file | Deferring specs |
|---|---|---|
| Ships (13, tiers, prices, slots, tech-gates) | ships / `src/data/ships.js` | Core's 4 & Combat's 3 are illustrative only |
| Weapons (catalog: price/slot/tier/tech) | ships / `src/data/weapons.js` | Combat owns *runtime* fields on same defs |
| Weapon runtime (damageType/heat/projSpeed/rof) | combat (fields live in `weapons.js`) | — |
| Modules + slot grid | ships / `src/data/modules.js` | Combat's hardpoint/moduleSlot split folded in |
| Tech tree (28 nodes) | ships / `src/data/tech.js` | — |
| Commodities (one registry) | economy+cargo / `src/data/commodities.js` | Mining & Economy IDs unified |
| Ores→asteroids, beams, recipes, fields | mining / `src/data/mining.js` | — |
| Sectors, stations, hazards, POIs | world / `src/data/sectors.js` | — |
| Factions, matrix, rep actions | factions / `src/data/factions.js` | — |
| Mission types, story beats | missions / `src/data/missions.js` | — |
| Automation (drones/traders/outposts) | automation / `src/data/automation.js` | — |
| Audio synth recipes | audio / `src/data/audioRecipes.js` | — |
| Faction/sector visual palettes | render / `src/data/palettes.js` | — |

- **Weapons appear in both ships and combat**: ONE def per weapon in `weapons.js` carries BOTH the catalog fields (`price, slotType, minSize, tier, requiresTech`) and the runtime fields (`damageType, dmg, rof, energyCost, heat, heatMax, projSpeed, range, spread, tracking, lockTimeS`). Ships reads the former; combat reads the latter. **[RESOLVED]** Where numbers differed (e.g. Pulse Laser dmg 6 vs 8), the **Combat spec's combat numbers win** for runtime, the **Ships/Tech prices win** for economy. Reconciled values are frozen in `weapons.js`.

### 0.18 Fitting model — AUTHORITATIVE [RESOLVED]
- Adopt **Ships/Tech's unified slot grid**: 6 slot types × 3 sizes (`weapon, shield, engine, cargo, mining, utility` × `S/M/L`). Combat's separate `hardpoints[]` + `moduleSlots[]` is overruled.
- A weapon slot carries an `arc` property (`'fixed'` or `{turret: deg}`) — this is how Combat's hardpoint arc concept survives.
- `fits(slot, module) = slot.type === module.slotType && slot.size >= module.minSize`.

### 0.19 The `player` record vs the player entity — AUTHORITATIVE
- The flyable ship **is an Entity** in `state.entities`, referenced by `state.playerId`. Its hull/shield/cap/pos/vel live on that entity.
- `state.player` is the **persistent non-spatial meta record**: credits, cargo, ownedShips, activeShipIndex, moduleInventory, researchedNodes, factions-independent fields, insurance, targetId, fireGroups, stats. **It never duplicates hull/shield** — those are on the entity.

---

## 1. TECH STACK & RENDER/UI COMPOSITION

### 1.1 Stack
- **Three.js r0.160**, ES modules, vendored at `vendor/three.module.js` (+ `vendor/BufferGeometryUtils.js`). No bundler required; native ESM via `<script type="importmap">`.
- **DOM overlay** for ALL UI (HUD, menus, trade, map, tech tree). No 3D text.
- **Web Audio API** for 100% procedural audio. No audio files.
- **No external art assets.** Meshes from Three primitives; textures from runtime `<canvas>`.
- **Zero-dependency static server** for dev; packaged later via Electron/Tauri for Steam.

### 1.2 DOM layering (single `index.html`)
```
<body>
  <canvas id="gl-canvas"></canvas>   <!-- z-index: 0  — Three.js WebGLRenderer -->
  <div id="ui-root">                  <!-- position:fixed; inset:0; pointer-events:none -->
     <div id="hud">      ...          <!-- z 10   — always-mounted flight HUD -->
     <div id="modal-backdrop"></div>  <!-- z 90   — shared blur backdrop -->
     <div id="screens">  ...          <!-- z 100  — modal screens (cached, one visible) -->
     <div id="toasts">   ...          <!-- z 1000 — transient toasts -->
     <div id="alerts">   ...          <!-- z 1100 — contextual alerts (missile lock on top) -->
     <div id="vignette"></div>        <!-- z 5    — low-health CSS radial gradient -->
  </div>
</body>
```
- `#ui-root` is `pointer-events:none`; interactive children opt back in with `pointer-events:auto`.
- The canvas fills the viewport; renderer `setPixelRatio(min(devicePixelRatio, settings.video.pixelRatioCap))`.
- UI never reads the WebGL framebuffer. The bridge from 3D→DOM is **one function**: `render.worldToScreen(vec3) -> {x, y, onScreen}` (camera.project), used by HUD for target reticles, damage numbers, off-screen arrows, dock prompts.
- Screen shake moves only the 3D camera; the DOM HUD is immune and stays readable (relied upon by UI spec).

### 1.3 Boot sequence (`src/main.js`)
1. Parse importmap, import `THREE`.
2. Create `WebGLRenderer`, scene, the bloom render targets (VFX), append `#gl-canvas`.
3. Construct the empty `GameState` (`src/core/gameState.js → createGameState()`), seeded with `meta.seed` (from `Date.now()` or a loaded save's seed).
4. Build the **event bus** (`src/core/eventBus.js`).
5. Build the **system registry** (`src/core/registry.js`): instantiate every system module, call `system.init(ctx)` in registration order (`ctx = { state, bus, three, registry, helpers }`).
6. UI mounts `#ui-root`, shows **Main Menu** (`state.mode='menu'`). No sim runs yet.
7. On **New Game**: `SaveSystem.newGame(seed)` calls each system's `newGame()` → populates GameState → emits `game:started` → `world:requestJump`/`sector:enter` for the home sector → `state.mode='flight'`.
   On **Continue/Load**: `SaveSystem.load(slot)` (see §4.5) → rebuild scene → `state.mode='flight'`.
8. Start the **single `requestAnimationFrame` loop** (`src/core/loop.js`). The fixed-timestep accumulator drives sim; render runs every frame.
9. AudioContext is created lazily on the first user gesture (autoplay policy); a one-time `pointerdown`/`keydown` listener calls `ctx.resume()`.

---

## 2. THE FIXED-TIMESTEP GAME LOOP

### 2.1 Rates
- **Sim: 60 Hz**, `DT = 1/60 s`. Render: every animation frame, interpolated.
- Economy ticks at **5 s** (internal accumulator, gated inside the loop — NOT a separate timer).
- Automation accrual runs every sim tick but credits/loss roll on their own cadences (cycle completion, raid intervals).

### 2.2 The loop (`loop.js`)
```
function frame(now):
  frameDt = min((now - last)/1000, 0.25)          // clamp huge stalls
  last = now
  accumulator += frameDt * 0  // (timeScale handled below)
  steps = 0
  // timeScale: 0=pause, 1=normal, >1 fast-fwd
  accumulator += frameDt
  while accumulator >= DT and steps < 8:           // cap 8 steps → no spiral of death
     if state.timeScale > 0:
        for s in (state.timeScale times, capped): stepSim(DT)   // see 2.3
     accumulator -= DT
     steps++
  alpha = accumulator / DT                          // render interpolation factor
  renderFrame(alpha, frameDt)                        // see 2.4
  requestAnimationFrame(frame)
```
- `state.timeScale` gates whether `stepSim` runs (0 = paused: sim frozen, render+camera+UI live). Fast-forward runs multiple `stepSim` per accumulated step, capped.

### 2.3 `stepSim(dt)` — THE UNIFIED SIM UPDATE ORDER (authoritative)
Every system module is named **exactly once**. Core's 10-step spine is the frame; combat's substeps fit inside; the 5 s economy tick is accumulator-gated; automation runs after economy+mining, before UI.

```
stepSim(dt):
  state.tick++ ; state.simTime += dt
  snapshotPrev()                       // copy pos/rot → prevPos/prevRot for interpolation

  1.  input.update(dt)                 // sample keyboard+mouse → state.input; mouse→world ray
  2.  ai.update(dt)                    // NPC FSM + steering + targeting → entity.data.intent
  3.  flight.update(dt)                // thrust+drag+rotate for player & NPCs (reads intent + handling penalty from cargo mass)
  4.  weapons.update(dt)              // [combat substep] cooldown/energy/heat gates → spawn projectile entities, beams; spend cap/heat; lock-on
  5.  physics.integrate(dt)            // vel += accel*dt ; pos += vel*dt ; sector-bounds accel
  6.  physics.rebuildHash()            // spatial hash (cell 64) from entityList
  7.  physics.collide(dt)              // broad-phase + circle/circle response; swept projectile test → emit collision/projectile:hit/pickup:collected/dock:range
  8.  combat.resolveDamage(dt)         // [combat substep] apply projectile:hit through shield→armor→hull; shield/cap/heat regen; death checks → emit combat:kill
  9.  mining.update(dt)               // applyMining on beam targets; eject ore pickups; magnet pull; salvage drain
  10. cargo.update(dt)                // recompute cargoUsedU/cargoMassT caches if dirty (drives flight handling next tick)
  11. economy.update(dt)              // accumulator += dt; if >=5s → econ tick (drift, events, propagation, recompute prices, emit economy:tick)
  12. automation.update(dt)           // drones/traders/outposts accrual, upkeep drain, loss/raid rolls (after economy prices, after mining)
  13. world.update(dt)                // jump state machine, fuel, hazard membership, POI scan ranges, gate proximity
  14. factions.update(dt)             // day-tick decay & conflict war-ticks (cheap, gated by sim-day boundary)
  15. missions.update(dt)             // TTL decrement on offers+active missions; expiry; story watcher; stale-target GC
  16. lifetime.sweep(dt)              // ttl-=dt; despawnAt; alive=false → emit entity:destroyed; free ids; flush event queue
```
- Steps 4 & 8 are **combat's** substeps but slot into the core spine at the documented positions (weapons after AI/flight so it reads fresh positions; damage after collision).
- Render + camera follow + interpolation run in `renderFrame`, **not** here.
- The event bus is **synchronous within a step** for most events, but `entity:destroyed`/spawn are **deferred to step 16** (entities are never spliced mid-step; mark `alive=false`, sweep at end).

### 2.4 `renderFrame(alpha, frameDt)` (`src/render/renderer.js`)
```
renderFrame(alpha, frameDt):
  render.syncEntityViews(alpha)     // for each entity: renderPos=lerp(prevPos,pos,alpha); renderRot=prevRot+wrap(rot-prevRot)*alpha; write to entity.view.root
  vfx.update(frameDt)               // integrate particles, engine trails, beams, shake decay
  camera.follow(frameDt)            // damped follow + look-ahead + shake offset (CAM_LERP)
  starfield.recenter(camera)        // parallax wrap
  render.draw()                     // scene → rtScene → bloom passes → screen
  ui.hud.update(frameDt)            // 60Hz cheap path: bar scaleX, numerics @10Hz, radar @20Hz, worldToScreen markers
```
- `noInterp` flag skips interpolation for an entity (e.g. just-teleported).

---

## 3. THE GameState SCHEMA (one flat, non-conflicting tree)

`createGameState()` returns this object. Every field below has exactly one owner (the system that writes it). **Transient** fields (not serialized) are marked `⊘`.

### 3.1 Root
```ts
GameState = {
  meta, settings,                 // §3.2, §3.3
  mode,                           // 'menu'|'flight'|'paused'  (UI/core)  ⊘? no — serialized as 'flight'
  timeScale,                      // 0|1|>1  (core)
  // --- core sim ---
  entities, entityList, nextEntityId, freeIds, playerId, spatialHash, ⊘
  accumulator, simTime, tick, rng, ⊘(rng fn; rngSeed in meta)
  input, camera, bounds,          // §3.4
  // --- meta records ---
  player,                         // §3.5 persistent non-spatial player record
  // --- subsystem trees ---
  cargo? (lives under player.cargo), 
  combat,                         // §3.7 (mostly transient + player combat config)
  economy,                        // §3.6 markets
  factions, conflicts,            // §3.10
  missions, story,                // §3.11
  world, jump, fuel, nav,         // §3.8
  ships? (catalogs in content),   // ship/module/tech runtime under player
  automation,                     // §3.9
  ui,                             // §3.12 ⊘ (mostly)
  content,                        // §3.13 static catalogs (NOT serialized; reloaded)
  render, vfx, audioRuntime,      // §3.14 ⊘ all transient
  save,                           // ⊘ runtime save bookkeeping
}
```

### 3.2 `meta` (owner: save) — serialized
```ts
meta = {
  version:int,            // == CURRENT_VERSION after load/migrate
  seed:int,               // master RNG seed (== rngSeed); never changes
  playtimeS:int,
  createdAt:isoString, lastSavedAt:isoString,
}
```
- **[RESOLVED]** Core's `rngSeed` and meta's `seed` are the **same field** → `meta.seed`. `state.rng` is the live fn rebuilt from it on load.

### 3.3 `settings` (owner: ui/settings) — serialized
```ts
settings = {
  uiScale:float(0.75..1.5, def 1),
  showDamageNumbers:bool,
  keybinds:{[action]:code},        // includes quicksave 'F5', quickload 'F9'
  audio:{ master:0.8, sfx:0.9, music:0.6, muted:false },
  video:{ renderScale:1, bloom:true, bloomStrength:0.9, bloomThreshold:0.65,
          vsync:true, fov:50, particleQuality:'high', pixelRatioCap:2 },
  gameplay:{ autosaveIntervalS:120, tutorialHints:true, difficulty:'standard' },
}
```
- **[RESOLVED]** Render's `settings.bloomEnabled/bloomStrength/...` are folded under `settings.video.*`. Difficulty enum: `casual|standard|veteran|ironman`.

### 3.4 Core sim runtime (owner: core)
```ts
entities: Map<int, Entity>             ⊘(structure)  — serialized as array of plain entities (minus mesh)
entityList: Entity[]                   ⊘ derived
nextEntityId:int                       serialized
freeIds:int[]                          serialized
playerId:int                           serialized
spatialHash:{ cell:64, buckets:Map }   ⊘ rebuilt each step
accumulator:float                      ⊘
simTime:float, tick:int                serialized
rng: () => float                       ⊘ (rebuilt from meta.seed)
input: {                               ⊘
  moveX, moveZ, boost:bool, fire:bool, fireGroup:1|2|null,
  aimWorld:{x,z}, aimAngle:float
}
camera: {                              ⊘ (camera obj rebuilt; zoom serialized under render)
  obj:THREE.PerspectiveCamera, tilt:60, zoom, trauma, shakeOffset:Vec3,
  focus:Vec3, lerp:6.0, lookAhead:18
}
bounds: { radius, hardRadius, center:{x,z} }   ⊘ (set per-sector from world)
```

#### 3.4.1 Canonical Entity shape (EVERY entity has all of these)
```ts
Entity = {
  id:int, type:EntityType, alive:bool,
  factionId:string|null,
  pos:Vec3(y=0), vel:Vec3(y=0), prevPos:Vec3,
  rot:float(yaw), prevRot:float, angVel:float,
  radius:float(wu), mass:float(t),
  // health (4-layer, §0.7). asteroids/wrecks: armor=shield=0, hp aliases hull
  hull, hullMax, armorHp, armorMax, armorFlat,
  shield, shieldMax, shieldRegenRate, shieldRegenDelay, lastDamageT,
  cap, capMax, capRegen,
  // flight
  thrust:float, turnRate:float, maxSpeed:float, drag:float,
  // lifecycle / collision
  ttl:float|Infinity, collides:bool, collisionMask:int(bitflags),
  team:int, ownerId:int|null,
  // presentation (runtime only)
  mesh:THREE.Object3D|null,                ⊘
  view:{ root, accents, engineSprites, shieldBubble, isBillboard } ⊘
  flags:{ boosting, docked, invuln, noInterp },
  data:object,                             // per-type payload (see below)
  get hp() { return this.hull }, set hp(v){ this.hull = v }   // alias §0.7
}
EntityType = 'ship'|'asteroid'|'station'|'projectile'|'pickup'|'drone'|'wreck'|'fx'
CollisionMask bits: SHIP=1, ASTEROID=2, STATION=4, PROJECTILE=8, PICKUP=16, DRONE=32, WRECK=64
```
**Per-type `data` payloads:**
- ship: `{ defId, combat:{ hardpointHeat:[], targetId, lockTarget, lockProgress, modules:[] }, derived:{…stat block…}, intent:{moveX,moveZ,boost,fire,aimAngle}, ai:AIState|null, lootTableId, bountyCr }`
- asteroid: `{ typeId, tier, oreHP, oreHPMax, size, pctEjected, respawnAt, ore }`
- station: `{ stationId, dockRadius, services:[], factionId }`
- projectile: `{ damage, damageType, ownerId, weaponId, kind:'bullet'|'missile', targetId, armed }`
- pickup: `{ kind:'ore'|'credits'|'cargo'|'module', commodityId, amount, despawnAt }`
- drone: `{ job:'mine'|'haul'|'escort', homeId, targetId, groupId }`
- wreck: `{ loot:[], salvagePool:{}, salvageTimeLeft, parentType }`

### 3.5 `player` (owner: multiple readers; structure owned by core/ships/economy) — serialized
```ts
player = {
  credits:int,                       // economy is sole writer
  debt:int, bounty:int,              // economy/factions
  // ship ownership & fitting (ships module)
  ownedShips: [{ defId, fittings:(moduleInstanceId|null)[], customName? }],
  activeShipIndex:int,
  moduleInventory: [{ instanceId, defId }],
  researchedNodes: string[],
  droneTierCap:int,                  // ships writes via tech
  efficiencyMods:{ miningYieldMult:1, shieldRegenMult:1, energyRegenMult:1,
                   cargoCapMult:1, tradeFeeMult:1 },
  researchPoints:int,                // RP currency (mission/scan writes; ships reads+spends)
  // cargo (cargo module sole writer) — §0.12
  cargo:{ items:{[cmdtyId]:qty}, usedVolume, usedMass, capVolume:40, capMass },
  // combat config (combat module) — runtime combat lives on the entity
  targetId:int|null,
  fireGroups:{ 1:int[], 2:int[] },   // hardpoint indices
  boostActive:bool,
  insurance:{ rate:0.6, deductibleCr:500, insuredModules:false, lastStationId:string|null },
  // mining hold derived (mining reads ship.derived)
  magnetRange:90,
  miningBeam:{ tierId:'beam_mk1', range, dps, heat, heatRate, coolRate, overheated, directToCargo },
  // stats / meta
  stats:{ lifetimeProfit, tradesCount, biggestSingleProfit, smuggledValue,
          kills, missionsDone, totalPassiveEarnedLifetime },
}
```
- **[RESOLVED]** `player.targetId` is the single target field (combat's `state.player.targetId` and ui's reads point here). It is an **entity id (int)**.

### 3.6 `economy` (owner: economy) — serialized (markets stock+eq+eventMods only; prices recomputed)
```ts
economy = {
  markets: { [stationId]: { [cmdtyId]: MarketEntry } },
  econEvents: ActiveEvent[],
  econClock: { accumulator:0, lastTickT:0, ticksElapsed:0 },
  marketIntel: { [stationId]: { snapshot, seenAtT } },
  rng,                               ⊘ (rebuilt from seed)
}
MarketEntry = { stock, equilibrium, baseEq, role:'produce'|'consume'|'none',
                lastMid, lastBuy, lastSell, eventMods:EventMod[] }
ActiveEvent = { id, type, stationId, commodityId|'*', field, mult, startT, duration, pressure }
```

#### 3.6.1 Commodity ID unification table [RESOLVED]
Single registry `cmdty_*`. Mining ejecta and economy trade use the SAME ids:
| Unified id | was (Mining) | was (Economy) | category |
|---|---|---|---|
| `cmdty_ore_iron` | ore_iron | ore (raw metal) | raw ore |
| `cmdty_ore_copper` | ore_copper | — | raw ore |
| `cmdty_ore_titanium` | ore_titanium | — | raw ore |
| `cmdty_silicate` | rock_silicate | silicates | raw ore |
| `cmdty_ice_water` | ice_water | water_ice | raw ore |
| `cmdty_volatiles` | ice_volatiles | volatiles | raw ore |
| `cmdty_gas_hydrogen` | gas_hydrogen | — | gas |
| `cmdty_gas_helium3` | gas_helium3 | — | gas |
| `cmdty_crystal_silica` | crystal_silica | — | crystal |
| `cmdty_crystal_lumin` | crystal_lumin | — | crystal |
| `cmdty_ore_platinoid` | ore_platinoid | — | rare ore |
| `cmdty_exotic_xenium` | exotic_xenium | — | exotic |
| `cmdty_refined_metals` | metal_iron_ingot | refined_metals | refined |
| `cmdty_alloys` | metal_ti_alloy | alloys | refined |
| `cmdty_polymers` | — | polymers | refined |
| `cmdty_fuel_cells` | — | fuel_cells | refined |
| `cmdty_comp_hullplate` | comp_hullplate | — | component |
| `cmdty_comp_circuitry` | comp_circuitry | ship_parts(~) | component |
| `cmdty_microchips` | — | microchips | tech |
| `cmdty_electronics` | — | electronics | tech |
| `cmdty_quantum_cores` | — | quantum_cores | tech |
| `cmdty_consumer_goods` | — | consumer_goods | consumer |
| `cmdty_textiles` | — | textiles | consumer |
| `cmdty_luxury_goods` | — | luxury_goods | luxury |
| `cmdty_art` | — | art | luxury(restricted) |
| `cmdty_food` | — | food | food |
| `cmdty_medical` | — | medical | med |
| `cmdty_scrap_metal` | scrap_metal | — | salvage |
| `cmdty_salvage_electronics` | salvage_electronics | — | salvage |
| `cmdty_narcotics` | — | narcotics | contraband |
| `cmdty_stolen_goods` | — | stolen_goods | contraband |
| `cmdty_weapons` | — | weapons | military(restricted) |
| `cmdty_munitions` | — | munitions / missile-ammo | military(restricted) |

Each `CommodityDef` carries the **union** of fields both specs needed: `{ id, name, basePrice, category, elasticity, legality, volPerU, massPerU, fineMult, producedBy[], consumedBy[], oreTier?, tags[] }`. Mining's `mass`/`vol`/`baseValue` map to `massPerU`/`volPerU`/`basePrice` (Economy's names win). Where base values differed (Mining `base 12` vs Economy `basePrice 28` for iron), **Economy's basePrice wins** for market math; Mining's per-u value is informational.

### 3.7 `combat` (owner: combat) — mostly transient; player combat config under `player`
```ts
combat = {
  rng,                               ⊘ (rebuilt; seed serialized as combat seed derived from meta.seed)
  spatialGrid,                       ⊘ (NOT used — core hash is canonical §0.16; field removed)
  beams: Beam[],                     ⊘ rebuilt each tick
  threatTables: Map<entityId, Map<attackerId,threat>>,  ⊘
}
Beam = { ownerId, factionId, from:Vec3, to:Vec3, dmgType, dpsThisTick }
```
- **`combatants` is NOT stored** (§0.15) — it's `entityList.filter(...)` computed in combat's update.
- **`projectiles` is NOT a combat array** (§0.16) — projectiles are entities.

### 3.8 `world / jump / fuel / nav` (owner: world) — serialized (overlay only)
```ts
world = {
  sectors: { [sectorId]: SectorStatic },     // loaded copy of content.sectors; owner field mutable
  currentSectorId:string,
  activeSector: { stations:[], fields:[], hazards:[], pois:[], gates:[] }, ⊘ runtime instance
  discovery: { [sectorId]: { discovered:bool, visitedCount:int,
                pois:{[poiId]:{discovered,identified}},
                fieldsDepleted:{[fieldId]:0..1} } },                 // SERIALIZED overlay
  entryPoint:{x,z,heading},  ⊘
  rng, ⊘
}
jump = { state:'IDLE'|'CHARGING'|'JUMPING'|'COOLDOWN', targetSectorId, via:'gate'|'drive'|null,
         chargeT, chargeNeeded, cooldownT }                          // serialized
fuel = { current, max }                                              // serialized
nav  = { route:{legs:[{from,to,fuel,charge,interdict}],totalFuel,totalHops}|null, autoTravel:bool } ⊘
```
- **[RESOLVED]** The three sector-access aliases (`world.graph`, `GameState.sectors`, `state.sector`) unify to **`world.sectors` + `world.currentSectorId` + `world.activeSector`**. Factions writes `world.sectors[id].owner`. Combat/economy/spawn read `world.sectors[world.currentSectorId]`.

### 3.9 `automation` (owner: automation) — serialized
```ts
automation = {
  drones: DroneGroup[], traders: Trader[], outposts: Outpost[], fleet: FleetShip[],
  fleetCap:int,                          // derived from player tier
  balance:{ activeRefByTier:[250,600,1400,3200,7000], passiveCapFrac:0.45,
            overflowEff:0.25, offlineEff:0.6, offlineCapSec:14400, distressGraceSec:120 },
  accumulators:{ creditBuffer:0, upkeepDebt:0 },
  meta:{ lastTickTime, totalPassiveEarnedLifetime, lostAssetsLog:[], rngSeed },
}
```
(DroneGroup/Trader/Outpost/FleetShip shapes per the automation spec, verbatim.)

### 3.10 `factions / conflicts` (owner: factions) — serialized
```ts
factions = { [factionId]: {
  rep:int(-1000..1000), tier:string, aggro:bool, bribesPaid:int,
  lastDelta:{value,reason,t}, knownContrabandStrikes:int, discoveredHostileBy:number,
}}
conflicts = { [pairKey 'a:b']: { tension:0..100, state:'cold'|'tense'|'war', playerLean:-1..1 } }
```
- 8 factions: `faction_scn, faction_mts, faction_dmc, faction_reach, faction_quiet, faction_vael, faction_free, faction_choir`.
- Starting rep: scn 0, mts 0, dmc 0, reach -50, quiet 0, vael -120, free +40, choir 0.

### 3.11 `missions / story` (owner: missions) — serialized
```ts
missions = {
  boards: { [stationId]: { refreshEpoch:int, slots: MissionOffer[] } },
  active: MissionInstance[],
  completedLog: [{ type, count, totalCr, success, fail }],
  nextId:int,
  config: MISSION_TUNING,                // tunable constants, serialized
}
story = { beatIndex:0..7, branch:'traders'|'patrol'|'free'|null, flags:{[key]:bool}, chainProgress:int }
```

### 3.12 `ui` (owner: ui) — mostly transient; a few serialized prefs
```ts
ui = {
  screenStack:string[],            ⊘
  docked:bool,                     ⊘
  activeStationTab:string,         ⊘
  radarRange:4000,                 serialized(pref)
  toasts:[], alerts:[],            ⊘
  trackedMissionId:string|null,    serialized
  starmapView:{cx,cy,zoom},        ⊘
}
```

### 3.13 `content` (owner: data modules) — NOT serialized (reloaded from `src/data/*` on boot)
```ts
content = {
  ships, weapons, modules, techNodes,      // ships
  commodities,                             // economy+cargo
  ores, asteroidTypes, beams, refineRecipes, fieldParams,  // mining
  sectors, stationTypes, hazardTypes, poiTypes, jumpDriveTiers,  // world
  factionMeta,                             // factions (matrix, rep actions, tiers, price curves)
  missionTypes, storyBeats, offerMix,      // missions
  droneDefs, traderDefs, outpostDefs,      // automation
  audioRecipes, musicStems,                // audio
  factionPalettes, sectorPalettes, shipClassRecipes,  // render
}
```

### 3.14 Transient runtime (owner: respective; NEVER serialized) ⊘
```ts
render = { scene, camera, cameraOffset, bloomRTs, ... }
vfx = { particles, spritePool, shake:{mag,decay} }
audioRuntime = { ctx, masterGain, sfxBus, musicBus, limiter, voices:[], stems:{A,B,C,D}, musicState, threat, alarms }
save = { lastAutosaveAt, dirty:bool, currentSlot }
```

---

## 4. THE SYSTEM INTERFACE CONTRACT

### 4.1 System module shape
Every system is an ES module exporting a factory or a singleton object with this interface:
```ts
export default {
  name: 'flight',                       // unique key; matches registry + save key map
  init(ctx) {},                          // ctx = { state, bus, three, registry, helpers }
                                         //   subscribe to events here; build runtime
  update(dt, state) {},                  // called in the fixed order (§2.3); omit if event-only
  // --- optional ---
  serialize() { return plainJSON },      // saveable systems only
  deserialize(data) {},                  // rebuild runtime + re-emit 'restored' events
  newGame() {},                          // populate GameState from data defaults
  // --- optional UI hooks (UI-bearing systems) ---
  mountUI(uiRoot) {}, refreshUI(data) {},
}
```
- `init` order == registry order. `update` order == the §2.3 spine (a separate explicit list in `registry.js`, NOT registration order, so AI runs before flight etc.).
- Systems **never** mutate another system's owned state directly (§0.6). They call exposed helpers or emit intent events.
- `ctx.helpers` exposes the cross-cutting core helpers (§4.3).

### 4.2 Registry & wiring (`src/core/registry.js`)
```ts
const SYSTEMS = [   // registration / init order
  core, input, ai, flight, weapons, physics, combat, mining, cargo,
  economy, automation, world, factions, missions, ships, render, vfx, audio, ui, save,
];
const UPDATE_ORDER = [   // §2.3 — explicit, may differ from init order
  input, ai, flight, weapons, physics /*integrate+hash+collide*/, combat /*resolveDamage*/,
  mining, cargo, economy, automation, world, factions, missions, /* lifetime.sweep is core */
];
```
- `registry.init()` → `for s of SYSTEMS: s.init(ctx)`.
- `registry.step(dt)` → run `UPDATE_ORDER`, then `core.lifetimeSweep(dt)`.
- `registry.get(name)` → system lookup (for direct helper calls where an event is overkill).
- Render/vfx/ui/audio update in `renderFrame`, not the sim step.

### 4.3 Core helpers (`ctx.helpers`, provided by core)
```
spawnEntity(spec) -> Entity            // canonical factory; assigns id, inserts, emits entity:spawned
getEntity(id) -> Entity|null
queryRadius(pos, r) -> Entity[]        // spatial-hash neighborhood
raycastToPlane(ndc) -> {x,z}           // mouse → world plane y=0
worldToScreen(vec3) -> {x,y,onScreen}  // 3D → DOM (camera.project)
hash32(...args) -> uint32              // deterministic seed mixer
mulberry32(seed) -> ()=>float          // PRNG factory
wrapAngle(a) -> float
```
All entity creation everywhere goes through `spawnEntity` or the `entity:spawnRequest` event (which calls it).

### 4.4 MASTER EVENT TABLE (authoritative — all aliases reconciled to `:`)

Legend: emitters/handlers are system `name`s. Payloads are the canonical shapes; every aliased name from the specs is folded into the row's event name.

| Event | Payload | Emitted by | Handled by | Folds these aliases |
|---|---|---|---|---|
| `entity:spawnRequest` | `{spec}` | any | core | `entity.spawn.request` |
| `entity:spawned` | `{id,type,entity}` | core | render, vfx, audio, ui(radar) | `entity.spawned` |
| `entity:destroyed` | `{id,type,pos,radius,factionId}` | core (sweep) | render, vfx, mining(wreck), ui | `entity.destroyed`, `entity.removed`, `entity:destroyed` |
| `entity:killed` | `{id,killerId,type,pos,factionId,bountyCr,lootTableId,victimClass,witnessed}` | combat/core | combat(bounty), mining(loot), missions, factions, audio, ui, stats | `entity.killed`, `combat:kill`, `ship_destroyed`, `ship:destroyed`, `combat:shipDestroyed` |
| `entity:kill` | `{id,killerId}` | missions/console | core | `entity.kill` (force-kill) |
| `combat:fire` | `{ownerId,weaponId,hardpointIdx,origin,dir}` | weapons | audio, vfx | `weapon.fired`, `weapon:fired`, `combat:fire` |
| `combat:beamStop` | `{ownerId}` | weapons | audio | `weapon:beamStop` |
| `projectile:hit` | `{targetId,ownerId,damage,damageType,pos}` | physics(collision) | combat, vfx, audio | `projectile.hit`, `combat:projectileHit`, `projectile.impact` |
| `combat:damage` | `{targetId,attackerId,amount,type,brokeShield,isPlayer,pos,hitPoint,normal,kind}` | combat | ui(numbers/shake), audio, ai(threat), factions, vfx(sparks/shield) | `entity.damaged`, `shield.hit`, `entity:hit`, `damage` |
| `collision` | `{aId,bId,impulse,pos}` | physics | audio, vfx, combat(ram) | `collision` |
| `shieldDown` / `shieldRestored` | `{combatantId}` | combat | ui, audio | — |
| `pickup:collected` | `{pickupId,collectorId,kind,amount,commodityId,pos}` | physics | cargo, economy, audio, ui | `pickup.collected`, `pickup_collected`, `item:pickup` |
| `dock:range` | `{stationId,shipId,inRange}` | physics | ui, world | `dock.range` |
| `dock:docked` | `{stationId}` | world/dock | ui, economy(market snapshot), audio, missions, save(autosave) | `docked`, `sim:dock`, `player:docked`, `dock.entered` |
| `dock:undocked` | `{}` | ui | ui(restore HUD), audio, world | `undocked`, `player:undocked`, `ui:undock` |
| `ship:boostStart`/`ship:boostStop` | `{shipId}` | flight | audio, vfx | `ship.boost.start/stop` |
| `ship:thrust` | `{id,throttle,nozzles[]}` | flight | vfx | `ship.thrust` |
| `camera:shake` | `{amount,decay?}` | many | core/camera | `camera.shake` |
| `camera:zoom` | `{delta}` or `{level}` | input/ui | core/render | `camera.zoom` |
| `sim:pause`/`sim:resume`/`sim:timescale` | `{scale?}` | ui | core | `sim.pause/resume/timescale` |
| `leaving:sector` | `{shipId,dist}` | physics | ui, ai | `leaving.sector` |
| `cargo:changed` | `{cargo,usedU,massT}` | cargo | economy, flight, ui, save | `cargo_changed`, `cargo/change`, `cargo:changed` |
| `cargo:full` | `{commodityId}` | cargo | ui | `cargo_full` |
| `mining:start`/`mining:stop` | `{minerId,targetId,position}` | weapons/input | mining, audio, vfx | `mining.start/stop`, `fire_mining_beam` |
| `mining:hit` | `{asteroidId,dmg,type:'thermal'}` | combat(mining laser) | mining | `mining:hit` |
| `mining:tick` | `{contactPos,oreType}` | mining | vfx, audio | `mining.tick` |
| `mining:yield` | `{commodityId,qty,pos}` | mining | missions, stats, vfx(pickup) | `ore_mined`, `mining.yield` |
| `asteroid:destroyed` | `{id,typeId,pos}` | mining | audio, vfx, missions | `asteroid_destroyed` |
| `beam:overheated`/`beam:ready` | `{}` | mining | ui, audio | `beam_overheated/ready` |
| `salvage:completed` | `{wreckId,loot}` | mining | missions, ui | `salvage_completed` |
| `loot:drop` | `{pos,credits,items[]}` | combat | mining(materialize pickups) | `loot:drop` |
| `economy:tick` | `{t,ticksElapsed}` | economy | automation, ui(market refresh) | `economy/tick` |
| `economy:tradeCompleted` | `{stationId,commodityId,side,qty,unitAvg,total,priceImpactPct,profit?,factionId}` | economy | missions, factions, stats, ui, audio | `trade/completed`, `trade.sold`, `trade:completed` |
| `economy:eventStarted`/`economy:eventEnded` | `{eventId,type,stationId,commodityId,duration}` | economy | ui, world(map), missions | `economy/event/*` |
| `economy:grantCredits` | `{amount,reason}` | any → economy | economy | `economy.grantCredits`, `reward:credits` |
| `economy:chargeCredits` | `{amount,reason}` | any → economy | economy | `economy.chargeCredits` |
| `credits:changed` | `{delta,reason,total}` | economy | ui, audio(credits_gained), save | `credits/change`, `credits:changed` |
| `economy:applyTradePressure` | `{stationId,good,vol}` | automation | economy | `economy:applyTradePressure` |
| `contraband:scanned` | `{stationId\|patrolId,found,fine,confiscated[],factionId,units}` | economy/customs | factions, combat, ui | `contraband/scanned`, `scan:contraband` |
| `faction:repDelta` | `{factionId,delta,reason}` | any → factions | factions | `reputation/change`, `faction.repDelta` |
| `faction:repChanged` | `{factionId,delta,reason,newRep,newTier,tierChanged}` | factions | ui, ai, economy, missions | `rep:changed`, `reputation/change`(out) |
| `faction:repSpillover` | `{factionId,delta,srcFaction}` | factions | ui, ai | `rep:spillover` |
| `faction:aggro` | `{factionId,isAggro}` | factions | ai/spawn, ui | `faction:aggro` |
| `conflict:flip` | `{pairKey,sectorId,newOwner}` | factions | world/spawn, economy, ui | `conflict:flip` |
| `conflict:warDeclared` | `{pairKey,sides}` | factions | spawn, missions, ui | `conflict:war_declared` |
| `distress:rescued` | `{factionId,tierReward}` | world/spawn | factions, economy | `distress:rescued` |
| `day:tick` | `{days}` | core(time) | factions | `day:tick` |
| `sector:enter` | `{sectorId,sector,entryPoint,firstVisit}` | world | render, vfx(palette), economy, combat/spawn, audio, ui | `sector.enter`, `sector:changed`, `sector_entered`, `sector.loaded`, `sector:loaded` |
| `sector:exit` | `{sectorId}` | world | all (despawn sector-scoped) | `sector.exit` |
| `sector:discovered` | `{sectorId}` | world | ui(map), stats | `sector.discovered` |
| `poi:discovered`/`poi:identified` | `{poiId,type,reward?}` | world | missions, ui | `poi.discovered/identified` |
| `field:depletedChanged` | `{fieldId,depleted}` | mining | world(persist) | `field.depleted.changed` |
| `jump:chargeStart` | `{targetSectorId,via,chargeNeeded}` | world | ui, audio | `jump.charge.start` |
| `jump:chargeTick` | `{progress}` | world | ui | `jump.charge.tick` |
| `jump:chargeAbort` | `{reason}` | world | ui | `jump.charge.abort` |
| `jump:start` | `{from,to,via,fromPos}` | world | vfx, audio | `jump.start`, `jump:start` |
| `jump:arrive` | `{sectorId,interdicted,ambushCount,toPos}` | world | combat/spawn, vfx | `jump.arrive` |
| `interdiction:triggered` | `{sectorId,ambushCount,spawnPos}` | world | combat/spawn | `interdiction.triggered` |
| `hazard:enter`/`hazard:exit` | `{entityId,zoneType,intensity}` | world | flight, combat, ai | `hazard.enter/exit` |
| `fuel:changed` | `{current,max}` | world | ui | `fuel.changed` |
| `fuel:empty` | `{sectorId}` | world | ui, missions(distress) | `fuel.empty` |
| `combat:lockChanged` | `{locked}` | combat | world(jump gate) | `combat.lock.changed` |
| `ship:statsChanged` | `{shipId,derived}` | ships | combat, flight, cargo, mining, ui | `ship:statsChanged` |
| `ship:purchased`/`ship:sold` | `{defId,price\|refund}` | ships | economy, ui | `ship:purchased/sold` |
| `module:equipped`/`module:unequipped` | `{shipId,slotIndex,defId}` | ships | combat, mining, world(jump drive), automation | `module:equipped/unequipped`, `module.equipped/unequipped` |
| `ship:cargoCapChanged` | `{shipId,cargoCap}` | ships | cargo (veto handshake) | `ship:cargoCapChanged` |
| `tech:researched` | `{nodeId,unlocks}` | ships | automation(droneTierCap), economy(tradeFeeMult), world(outpost), ui | `tech:researched` |
| `research:pointsChanged` | `{researchPoints}` | missions/scan | ships(ui) | `research:pointsChanged` |
| `scan:completed` | `{targetId}` | world(scan) | missions | `scan.completed` |
| `player:scannedByPatrol` | `{hasContraband}` | economy/customs | missions | `player.scannedByPatrol` |
| `player:death` | `{pos,killerId}` | combat | input(lock), ui(respawn), save(autosave), audio | `player:death` |
| `player:respawn` | `{stationId,shipId,refundCr,cargoLost}` | combat | world(teleport), ui, economy | `player:respawn` |
| `ai:stateChange` | `{npcId,from,to}` | ai | ui(debug), audio | `ai:stateChange` |
| `spawn:request` | `{entityType,sectorId,position,tags,refId}` | missions/world | combat/spawn(core spawnEntity) | `spawn.request`, `spawn:request` |
| `mission:accepted` | `{missionId,type,storyTag?}` | missions | ui, economy(collateral) | `mission.accepted` |
| `mission:completed` | `{missionId,type,factionId,repMult}` | missions | factions, economy, ui, save(autosave), audio | `mission:completed`, `mission.completed` |
| `mission:failed`/`mission:expired` | `{missionId,reason}` | missions | factions, ui | `mission.failed/expired` |
| `mission:updated` | `{missionId}` | missions | ui | `mission:updated` |
| `story:beatAdvanced` | `{fromIndex,toIndex,branch?}` | missions | ui, ships(unlocks) | `story.beatAdvanced` |
| `asset:deployed` | `{kind,id}` | automation | missions(B6) | `asset.deployed` |
| `automation:incomeCredited` | `{amount,source}` | automation | ui, stats | `automation:incomeCredited` |
| `automation:assetLost` | `{kind,id,value,sectorId}` | automation | ui, combat/spawn | `automation:assetLost` |
| `automation:outpostRaided` | `{outpostId,sectorId,lossVol}` | automation | ui, missions | `automation:outpostRaided` |
| `automation:assetDistressed`/`assetRepossessed` | `{kind,id}` | automation | ui | — |
| `combat:hitAsset` | `{assetKind,assetId,damage}` | combat | automation | `combat:hitAsset` |
| `ui:fleetOrder` | `{shipId,order,targetRef}` | ui | automation | `ui:fleetOrder` |
| `toast` | `{text,kind,ttl}` | any | ui | `toast`, `ui.notify` |
| `alert` | `{key,sev,text,ttl}` | any | ui | `alert` |
| `audio:cue` | `{id}` | ui/any | audio | `audio:cue` |
| `settings:changed` | `{section,key,value}` | ui | audio, render, save | `settings:changed`, `settings.changed` |
| `ui:buy`/`ui:sell` | `{commodityId,qty}` | ui | economy | — |
| `ui:buyShip`/`ui:fitModule`/`ui:unfitModule` | `{...}` | ui | ships | — |
| `ui:acceptMission`/`ui:abandonMission`/`ui:trackMission` | `{missionId}` | ui | missions | — |
| `ui:service` | `{type,amount}` | ui | economy/world | — |
| `ui:setCourse` | `{sectorId,path}` | ui | world | — |
| `ui:unlockTech` | `{nodeId}` | ui | ships | — |
| `ui:talkContact` | `{contactId,choiceId}` | ui | missions/dialog | — |
| `world:requestJump` | `{targetSectorId,via}` | ui | world | `request.jump` |
| `world:requestRoute` | `{targetSectorId,mode}` | ui | world | `request.route` |
| `world:requestSectorScan` | `{}` | ui/input | world | `request.sectorScan` |
| `ui:setThrottle`/`ui:cycleTarget`/`ui:targetNearestHostile`/`ui:fireGroup`/`ui:selectWeaponGroup` | `{...}` | ui/input | flight/combat | — |
| `game:new`/`game:save`/`game:load`/`game:quit` | `{...}` | ui | save | `game:new` etc. |
| `game:started` | `{}` | save | all | `game:started` |
| `save:started`/`save:completed`/`save:error`/`save:loaded` | `{slot,reason?}` | save | ui | `save:*` |

> **Resolution note:** the kill event split — core emits `entity:destroyed` (presentation/cleanup, fired by the sweep for ANY entity) AND `entity:killed` (combat semantics: a ship/asset died with a killer, fired by combat's death check). Both can fire for one ship: `entity:killed` first (combat decides loot/bounty/rep), then the sweep emits `entity:destroyed` (render disposes mesh). Asteroids fire `asteroid:destroyed`+`entity:destroyed` (no `entity:killed`).

### 4.5 Save/Load contract
- Envelope: `{ fmt:'spaceface-save', version:N, savedAt, playtimeS, slot, checksum, data:{ [saveKey]:state } }`. `checksum` = FNV-1a hex of `JSON.stringify(data)`.
- **Save-key → system map** [RESOLVED] (the Save spec's `SYSTEM_ORDER` names didn't match our systems):
  | save key | system(s) serialized | order |
  |---|---|---|
  | `meta` | save (meta) | 1 |
  | `player` | core(player meta) + ships(ownedShips/fittings/research) | 2 |
  | `cargo` | cargo (player.cargo) | 3 |
  | `economy` | economy (markets) | 4 |
  | `factions` | factions + conflicts | 5 |
  | `world` | world (discovery overlay, currentSectorId, jump, fuel) | 6 |
  | `entities` | core (entities minus mesh, ids, playerId, simTime, tick) | 7 |
  | `missions` | missions + story | 8 |
  | `automation` | automation | 9 |
  | `settings` | ui/settings | 10 |
- Load order = the above order (deps first: player before its ship fittings resolve; economy before missions; world before entities so the sector exists). Atomic: build candidate state, swap only if all `deserialize` succeed.
- Load sequence: pause → validate fmt+version → migrate (ordered `MIGRATIONS`) → clear transient runtime (despawn entities, dispose meshes) → `deserialize` in order → re-emit `entity:spawned` for each rebuilt entity (render re-creates meshes) → `save:loaded` → unpause.
- `CURRENT_VERSION` tracked in `src/data/saveVersion.js`. NPC combatants are NOT serialized (regenerated by spawner); player combat fields serialize on the player entity.
- Autosave: every `settings.gameplay.autosaveIntervalS` of unpaused play, and on `dock:docked`/`sector:enter`/`mission:completed`, debounced to ≤1 write/10 s; never while `player:death` pending or mid-jump.

---

## 5. UI SCREEN-MANAGEMENT

### 5.1 ScreenManager (`src/ui/screenManager.js`)
- State: `ui.screenStack: string[]` (modal screen ids). Empty = pure flight (HUD only). Top of stack = active modal.
- API: `pushScreen(id)`, `popScreen()`, `replaceScreen(id)`, `closeAll()`.
- Each screen node is **built once and cached** in `#screens`. Only the top screen is `display:flex`; all others `display:none` (DOM retained → scroll/tab state persists). No teardown, just visibility.
- Pushing any screen adds `.ui-modal-open` to `#ui-root` → `#hud { opacity:0; pointer-events:none; transition:120ms }`. Popping to an empty stack removes it → HUD returns.

### 5.2 HUD visibility rule
HUD (`#hud`) is visible **iff** `screenStack.length === 0 && ui.docked === false && state.mode === 'flight'`. Any modal hides it; docking hides it.

### 5.3 Docking flow
`dock:docked {stationId}` → ui sets `ui.docked=true`, `pushScreen('station')`. The Station hub has a 7-tab left rail (Market/Shipyard/Outfitting/Missions/Services/Factions/Bar) swapping a right content pane (`ui.activeStationTab`). **Undock** button emits `dock:undocked` → `popScreen()`, `ui.docked=false`, HUD returns.

### 5.4 Pause & back-nav
- ESC in flight (empty stack) → `pushScreen('pause')` + emit `sim:pause` (`timeScale=0`; sim frozen, render/UI live).
- ESC inside a modal → `popScreen()` (one level back).
- Shared `#modal-backdrop` (z 90) shown whenever stack non-empty; clicking it pops the top unless the screen has `data.locked` (mid-transaction confirm).

### 5.5 Update split (performance contract)
- **60 Hz cheap path** (in `renderFrame`): bar widths via `transform:scaleX` (GPU, no layout), numerics via `textContent` at 10 Hz (every 6th tick), radar canvas at 20 Hz, off-screen arrows via `worldToScreen`. Pre-cached element refs only; **no per-frame DOM creation, no innerHTML**.
- **Event-driven rebuild path**: lists/menus (market table, mission board, tech tree) rebuilt only on data-change events (`economy:tick`, `mission:updated`, `cargo:changed`, `ship:statsChanged`). Built with `DocumentFragment` + one delegated listener per list container.
- Canvas (radar, sparklines, star-map, tech-tree, avatars) draws to `<canvas>`, never DOM.

### 5.6 Input routing boundary [RESOLVED]
- **UI owns global/menu keys**: ESC, M (star-map), T (tech-tree), J (missions/journal), F1/H (help), Tab (cycle target), P (pause), F5/F9 (quick save/load), Enter (dock when prompted).
- **flight/input system owns movement/combat keys**: W/A/S/D, mouse-aim, Shift (boost), Space/LMB (fire group 1), RMB (fire group 2), Q/E (weapon group), F (target nearest hostile).
- A single `document` keydown listener in `src/ui/input.js` dispatches: if a modal is open, route to that screen's handler (ESC=back); else translate UI-owned keys to intent events. The flight system reads raw movement keys via its own listener writing `state.input`. This split prevents double-handling.

---

## 6. THE COMPLETE FILE MANIFEST

> All paths relative to project root. One responsibility per file; modular so agents implement in parallel. Coordinate plane is **XZ, +Y up** (stated authoritatively in §0.1).

### vendor/
| File | Responsibility | Exports | Deps |
|---|---|---|---|
| `vendor/three.module.js` | Three.js r0.160 ESM | `THREE.*` | — |
| `vendor/BufferGeometryUtils.js` | mergeGeometries helper | `mergeGeometries` | three |

### root
| File | Responsibility | Exports | Deps |
|---|---|---|---|
| `index.html` | DOM shell, importmap, `#gl-canvas`+`#ui-root` layers | — | main.js |
| `styles/ui.css` | CSS variable theme, z-layers, panel/bar/toast/alert styles, `--ui-scale` | — | — |
| `server.js` | zero-dep static file server (dev) | — | node http |
| `src/main.js` | boot sequence (§1.3); build state/bus/registry; start loop | `boot()` | core/*, all systems |

### src/core/
| File | Responsibility | Exports | Deps |
|---|---|---|---|
| `src/core/gameState.js` | `createGameState()` — the schema (§3), all defaults | `createGameState` | data/saveVersion |
| `src/core/eventBus.js` | `emit`/`on`/`off`, deferred-event queue, flush | `createBus`/`EventBus` | — |
| `src/core/registry.js` | system list, init order, UPDATE_ORDER, `step(dt)` | `Registry` | all systems |
| `src/core/loop.js` | rAF loop, fixed-timestep accumulator, render interp alpha | `startLoop` | registry, render |
| `src/core/entity.js` | Entity factory, type defaults, collision-mask bits, `hp` alias | `spawnEntity`,`EntityTypes`,`Masks` | gameState |
| `src/core/physics.js` | integrate, spatial hash (cell 64), broad-phase, circle collision, swept projectile, response, bounds | `physics` system | entity, eventBus |
| `src/core/spatialHash.js` | uniform grid build/query helper | `SpatialHash` | — |
| `src/core/rng.js` | mulberry32, hash32 (FNV mix), wrapAngle | `mulberry32`,`hash32`,`wrapAngle` | — |
| `src/core/math.js` | vec2/vec3 helpers on XZ plane, lerp, clamp, easeOutCubic | math fns | — |
| `src/core/time.js` | sim-day boundary detection → `day:tick`; playtime accrual | `time` system | eventBus |
| `src/core/coreSystem.js` | owns entities/lifetime sweep, `entity:spawnRequest`/`entity:kill` handlers, helpers (`queryRadius`,`worldToScreen` delegate) | `core` system | entity, physics |

### src/systems/
| File | Responsibility | Exports | Deps |
|---|---|---|---|
| `src/systems/input.js` | sample keyboard+mouse, mouse→world ray, write `state.input`; flight key ownership | `input` system | core/math, render(camera) |
| `src/systems/flight.js` | thrust/drag/rotate, boost, strafe, handling penalty from cargo mass, sector inward accel | `flight` system | core, cargo(read) |
| `src/systems/ai.js` | NPC FSM (idle/patrol/pursue/attack/strafe/flee), steering blend, threat/aggro target select → `entity.data.intent` | `ai` system | core, factions(read) |
| `src/systems/weapons.js` | fire gates (cooldown/energy/heat/lock/ammo), spawn projectile entities + beams, fire groups, lead/intercept | `weapons` system | core, ships(weapon defs), economy(ammo) |
| `src/systems/combat.js` | damage pipeline (shield→armor→hull), regen, death/respawn/insurance, loot roll, scaleCombatant, beams, `combatants` derived index | `combat` system | core, factions, economy, ships |
| `src/systems/mining.js` | applyMining, ore ejection, magnet, salvage, asteroid fields, refining, beam heat | `mining` system | core, cargo, economy, world |
| `src/systems/cargo.js` | unified cargo container, addCargo/removeCargo, mass/volume caches, jettison | `cargo` system + helpers | core, data/commodities |
| `src/systems/economy.js` | markets, price-from-stock, drift, events, propagation, quote/execute, fines/scan, sole credits writer | `economy` system + API | data/commodities, factions, world(read) |
| `src/systems/factions.js` | applyRep, tiers, spillover, dock/price/aggro derived, conflicts/war, decay | `factions` system + API | data/factions, world(write owner) |
| `src/systems/missions.js` | board gen (seeded), mission FSM, objective tracking, chaining, 8-beat story FSM, RP awards | `missions` system | data/missions, all event listeners |
| `src/systems/world.js` | sector graph, load/unload, jump state machine, fuel, interdiction, fog-of-war, hazards, POI scan, route Dijkstra | `world` system + API | data/sectors, factions(read owner) |
| `src/systems/ships.js` | ship/module/tech catalogs runtime, `getDerivedStats`, fitting, shipyard buy/sell, research, efficiencyMods | `ships` system + `getDerivedStats` | data/ships,weapons,modules,tech |
| `src/systems/automation.js` | drones/traders/outposts/fleet, accrual, upkeep, loss/raid, offline catch-up, passive cap | `automation` system | core, economy, mining, world |

### src/render/
| File | Responsibility | Exports | Deps |
|---|---|---|---|
| `src/render/renderer.js` | WebGLRenderer setup, scene, lights (3-light rig), draw pipeline, `worldToScreen`, syncEntityViews | `render` system | three, bloom, visualFactory |
| `src/render/camera.js` | chase camera params (§0.14), damped follow, look-ahead, shake, zoom presets | `camera` | three, core/math |
| `src/render/bloom.js` | single-pass bloom (bright-extract → blur → composite), RT management, resize | `Bloom` | three |
| `src/render/visualFactory.js` | memoized geometry/material/texture caches; ship/asteroid/station/pickup builders | `VisualFactory` | three, BufferGeometryUtils, canvasTextures |
| `src/render/canvasTextures.js` | runtime canvas textures (noise/gradient/greeble/star/fbm cloud) | texture builders | — |
| `src/render/starfield.js` | 3-layer parallax Points + nebula sprites, recenter/wrap, warp stretch | `Starfield` | three |
| `src/render/vfx.js` | pooled particle system (Points+sprites), explosions/sparks/trails/shield ripple/warp, shake emit | `vfx` system | three, eventBus |
| `src/render/shaders.js` | GLSL strings: particle, shield fresnel, star, bloom passes, nebula | shader sources | — |

### src/ui/
| File | Responsibility | Exports | Deps |
|---|---|---|---|
| `src/ui/uiRoot.js` | mount `#ui-root`, layers, `--ui-scale` hook, mode switching | `ui` system | screenManager, hud |
| `src/ui/screenManager.js` | screen stack, push/pop/replace, modal backdrop, HUD toggle | `ScreenManager` | — |
| `src/ui/input.js` | document keydown router (UI-owned keys, modal routing) | `uiInput` | eventBus, settings(keybinds) |
| `src/ui/hud.js` | flight HUD (bars, throttle/speed/cargo/credits, weapon pips), 60Hz cheap path | `Hud` | render(worldToScreen) |
| `src/ui/radar.js` | 180px radar canvas, blips by faction, off-range chevrons | `Radar` | core(queryRadius) |
| `src/ui/targetPanel.js` | selected-target panel (hull/shield/dist/closing) | `TargetPanel` | core |
| `src/ui/alerts.js` | contextual alert queue (dedupe, severity, ttl) | `Alerts` | — |
| `src/ui/toasts.js` | transient toast stack | `Toasts` | — |
| `src/ui/objectiveTracker.js` | active mission objectives + off-screen arrow | `ObjectiveTracker` | missions(read) |
| `src/ui/damageNumbers.js` | floating combat numbers, world→screen projection | `DamageNumbers` | render |
| `src/ui/screens/stationHub.js` | dock hub: 7-tab rail + content pane | `StationHub` | the tab screens |
| `src/ui/screens/market.js` | trade table, qty stepper, price impact, sparklines | `MarketScreen` | economy(quote/execute) |
| `src/ui/screens/shipyard.js` | buy/sell hulls, stat tables | `ShipyardScreen` | ships |
| `src/ui/screens/outfitting.js` | slot grid, drag-fit, live stat-delta, energy balance | `OutfittingScreen` | ships(getDerivedStats) |
| `src/ui/screens/missionBoard.js` | offer cards, gating, accept | `MissionBoard` | missions |
| `src/ui/screens/services.js` | refuel/repair/ammo/insurance | `ServicesScreen` | economy, world |
| `src/ui/screens/factions.js` | rep panel (-1000..1000, 9 tiers), relationships | `FactionsScreen` | factions |
| `src/ui/screens/bar.js` | contacts list, procedural avatars, dialog | `BarScreen` | missions/dialog |
| `src/ui/screens/starmap.js` | pannable/zoomable sector graph canvas, route preview, Set Course | `StarmapScreen` | world(route) |
| `src/ui/screens/techTree.js` | DAG node graph, prereq lines, research confirm | `TechTreeScreen` | ships |
| `src/ui/screens/automationPanel.js` | Drones/Traders/Outposts/Fleet tabs, cap bar | `AutomationPanel` | automation |
| `src/ui/screens/pause.js` | pause menu (resume/settings/save/load/quit) | `PauseScreen` | save |
| `src/ui/screens/settings.js` | audio/video/controls/gameplay tabs, key rebind | `SettingsScreen` | settings |
| `src/ui/screens/mainMenu.js` | title, new/continue/load/settings/quit | `MainMenu` | save |
| `src/ui/screens/newGame.js` | ship preview, name, difficulty → `game:new` | `NewGameScreen` | — |
| `src/ui/screens/saveLoad.js` | slot list (from sf.save.index), export/import | `SaveLoadScreen` | save |
| `src/ui/screens/help.js` | keybind cheat-sheet from settings.keybinds | `HelpOverlay` | settings |

### src/audio/
| File | Responsibility | Exports | Deps |
|---|---|---|---|
| `src/audio/audioSystem.js` | graph (master→limiter→buses), event→SFX, positional attenuation, alarms, threat | `audio` system | data/audioRecipes |
| `src/audio/synth.js` | voice pool, ADSR env, noise buffer, recipe player, biquad helpers | synth fns | — |
| `src/audio/music.js` | 4-stem adaptive bed, state machine, crossfade, ducking | `MusicBed` | synth |

### src/save/
| File | Responsibility | Exports | Deps |
|---|---|---|---|
| `src/save/saveSystem.js` | serialize registry, envelope, localStorage+file, migrations, newGame, autosave | `save` system | all serializable systems |
| `src/save/migrations.js` | ordered version migrations | `MIGRATIONS`,`CURRENT_VERSION` | — |
| `src/save/checksum.js` | FNV-1a hex | `fnv1a` | — |

### src/data/ (static content — plain JS, no logic)
| File | Responsibility | Exports |
|---|---|---|
| `src/data/saveVersion.js` | `CURRENT_VERSION` constant | `CURRENT_VERSION` |
| `src/data/ships.js` | 13 ship defs (tier/role/hull/slots/price/tech) | `SHIPS` |
| `src/data/weapons.js` | weapon defs (catalog + combat runtime, reconciled) | `WEAPONS` |
| `src/data/modules.js` | module defs (slotType/minSize/modifiers/energy/mass/price/tech) | `MODULES` |
| `src/data/tech.js` | 28 tech nodes (prereqs/cost/unlocks) | `TECH_NODES` |
| `src/data/commodities.js` | unified commodity registry (§3.6.1) | `COMMODITIES` |
| `src/data/mining.js` | ores, asteroid types, beam tiers, refine recipes, field params | `ORES`,`ASTEROIDS`,`BEAMS`,`RECIPES`,`FIELDS` |
| `src/data/sectors.js` | 10 sectors, stations, hazards, POIs, jump tiers, security/danger/wealth helpers | `SECTORS`,`STATION_TYPES`,`HAZARD_TYPES`,`POI_TYPES`,`dangerTier` |
| `src/data/factions.js` | 8 factions, matrix, spillover, rep actions, tiers, price curves | `FACTION_META` |
| `src/data/missions.js` | 10 mission types, 8 story beats, offer-mix weights, tuning | `MISSION_TYPES`,`STORY_BEATS`,`OFFER_MIX`,`MISSION_TUNING` |
| `src/data/automation.js` | drone/trader/outpost defs, activeRef curve, balance | `DRONES`,`TRADERS`,`OUTPOSTS`,`AUTO_BALANCE` |
| `src/data/audioRecipes.js` | synth recipes + music stem defs | `RECIPES`,`MUSIC_STEMS` |
| `src/data/palettes.js` | faction + sector visual palettes, ship-class build recipes | `FACTION_PALETTES`,`SECTOR_PALETTES`,`SHIP_RECIPES` |
| `src/data/newGameDefaults.js` | starting state constants (credits 5000, ship_kestrel, cargo 40u, sector_helios_prime, starting reps) | `NEW_GAME` |

---

## 7. CROSS-SYSTEM INVARIANTS (the contract in one place)

1. **Single entity store** (`state.entities`); `combatants`/`projectiles` are derived/entities, never parallel stores. (§0.15, §0.16)
2. **Health is 4-layer** (`hull/armor/shield/cap`); `hp` aliases `hull`. (§0.7)
3. **Credits, rep, cargo, derived-stats, sector-owner** each have exactly one writer; everyone else emits intents. (§0.6)
4. **Sim never calls `Math.random`**; per-system seeded streams from `meta.seed`. (§0.5)
5. **Events use `:`**, names are the §4.4 table; aliases are dead.
6. **XZ plane, yaw around +Y**, everywhere. (§0.1)
7. **Volume is the only hard cargo cap**; mass is a handling penalty. (§0.13)
8. **Security is 0..1 float** (world); `dangerTier` derives 0..5 for combat. (§0.8)
9. **Reputation is −1000..+1000 / 9 tiers.** (§0.9)
10. **Starter = `ship_kestrel`, cargo 40u, mining beam 18 ore-HP/s.** (§0.10)
11. **Catalogs have one owner** (§0.17); illustrative defs in other specs defer.
12. **Sim update order is the §2.3 list**; every system appears once.
13. **Save order = deps-first** (§4.5); NPCs regenerate, player serializes.
14. **One commodity registry**, `cmdty_*` IDs (§3.6.1); mining ejecta uses them.
15. **UI emits intents only**, never mutates sim state; HUD hidden when modal/docked. (§5)
