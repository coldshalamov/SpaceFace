export const meta = {
  name: 'spaceface-wave-a',
  description: 'Implement the fight+mine+feedback pillar: ships, cargo, weapons, combat, ai, mining, vfx, audio (each replaces its stub)',
  phases: [{ title: 'Wave A systems', detail: '8 agents implement one system each against the shared contract' }],
}

const CONTRACT = `You implement ONE system of the SpaceFace game by REPLACING its stub file (cwd: C:\\\\Users\\\\93rob\\\\Documents\\\\GitHub\\\\SpaceFace). The engine spine already boots and the player ship flies; your job adds your system's behavior.

READ FIRST (authoritative, in this order):
1. ARCHITECTURE.md — THE CONTRACT. Especially §0 (resolved constants), §2.3 (sim update order), §3 + §3.4.1 (GameState + the canonical Entity shape), §4.1-4.3 (system interface + ctx.helpers), and §4.4 (the MASTER EVENT TABLE — use these exact event names + payloads).
2. Your subsystem design spec under design/specs/ (named below).
3. The core you build on: src/core/entity.js, src/core/coreSystem.js (the ctx.helpers + lifecycle), src/core/eventBus.js, src/core/physics.js (collision emits projectile:hit/pickup:collected/collision/dock:range), src/core/gameState.js, src/systems/flight.js + src/systems/input.js (how the player drives), src/core/registry.js (update order). Plus the src/data/*.js you consume.

NON-NEGOTIABLE RULES:
- A system is an ES module exporting a NAMED const equal to its name: export const <name> = { name:'<name>', init(ctx){}, update(dt,state){}, ... }. Keep that export name; do NOT add a default export. Do NOT edit main.js, registry.js, loop.js, or any OTHER system's file (only your own file(s), listed below).
- init(ctx) gets { state, bus, three, registry, helpers }. Subscribe to events in init(); do per-tick work in update(dt,state) (runs in §2.3 order). Create entities ONLY via ctx.helpers.spawnEntity(spec) (it assigns id, inserts, and emits entity:spawned so render builds the mesh). Use ctx.helpers.getEntity(id), ctx.helpers.queryRadius(pos,r). Mark an entity dead with entity.alive=false (core sweeps it).
- Events: use ':' names EXACTLY as in §4.4 with the documented payload shapes. Only emit/handle real table entries.
- SINGLE-WRITER (§0.6): only the owner writes credits(economy)/rep(factions)/cargo(cargo)/derived-stats(ships). To grant money or rep, EMIT economy:grantCredits{amount,reason} / economy:chargeCredits / faction:repDelta (economy & factions are still stubs this wave — these emits may no-op for now; that is fine and expected).
- DETERMINISM: never call Math.random() in simulation logic — use state.rng() (cosmetic VFX/particles MAY use Math.random()).
- XZ plane, +Y up; yaw rot=atan2(dz,dx), forward=(cos rot,0,sin rot). Health is 4-layer hull/armorHp/shield/cap; hp aliases hull.

SHARED ENTITY DATA SHAPE for a ship (ships WRITES it; weapons/combat/ai/mining READ it — conform exactly):
entity.data = {
  defId:'ship_*',
  derived:{ hull,hullMax, armorHp,armorMax,armorFlat, shield,shieldMax,shieldRegenRate,shieldRegenDelay, cap,capMax,capRegen, thrust,turnRate,maxSpeed,drag, mass, radius, cargoCap },
  weapons:[ { slotIndex, defId:'wpn_*', dmg,rof,energyCost,heat,heatMax,projSpeed,range,spread,tracking,lockTimeS,damageType,arc, _cooldown:0,_heat:0 } ],
  miningBeam:{ tierId:'beam_*', dps,range,_heat:0,heatMax,overheated:false } | null,
  combat:{ targetId:null, lockTarget:null, lockProgress:0 },
  intent:{ moveX,moveZ,boost,fire,fireGroup,aimAngle } | null,  // ai writes for NPCs; flight reads it; player intent is state.input
  ai:{...}|null, factionId, team, lootTableId:null, bountyCr:0,
}
ships ALSO copies the derived stat fields onto the entity TOP LEVEL (entity.hull,hullMax,shield,shieldMax,shieldRegenRate,cap,capMax,capRegen,thrust,turnRate,maxSpeed,drag,radius,mass) so flight/physics read them directly.

PLAYER CONTROLS already wired: state.input = { moveX,moveZ,boost, fire(left-mouse/Space → weapon group 1), fireGroup(2 when right-mouse held → use for the MINING beam), aimWorld{x,z}, aimAngle }.

VERIFY before finishing: run \`node --check <your file>\` for each file you wrote (must pass). Do NOT import 'three' unless you render meshes (only vfx does).
RETURN a short note: file(s) written, events emitted + handled, entity/state fields you touched, and anything simplified.`

const tasks = [
  { key: 'ships', spec: '04-ships-modules-tech-tree-progression.md', file: 'src/systems/ships.js', prompt:
    `Implement the \`ships\` system in src/systems/ships.js (keep the named export getDerivedStats; also export makeShipEntitySpec). Consume src/data/ships.js(SHIPS), weapons.js(WEAPONS), modules.js(MODULES), tech.js(TECH_NODES), mining.js(BEAMS), newGameDefaults.js(NEW_GAME). Also read design/specs/00-core-simulation-flight-physics-camera.md for how thrust/turnRate/maxSpeed/drag relate to a ship's handling+mass.
    - getDerivedStats(defId, fittings, player) -> the full derived block. Map ship-def fields: shield->shieldMax, baseShieldRegen->shieldRegenRate, energyCap->capMax, energyRegen->capRegen, collisionRadius->radius, hull->hull/hullMax. Derive thrust/turnRate/maxSpeed/drag from handling+mass (pick formulas that make the Kestrel feel like the current player: thrust ~48, turnRate ~3.0, maxSpeed ~135, drag ~1.25; heavier/low-handling ships slower & less nimble). Sum module modifiers; apply player.efficiencyMods. Start with full hull/shield/cap.
    - makeShipEntitySpec(defId,{team,factionId,fittings,isPlayer}) -> a spawnEntity spec with type:'ship', the derived top-level stat fields, and data per the SHARED SHAPE. Resolve data.weapons from equipped weapon modules; if none and isPlayer (fresh Kestrel), equip the starter weapon(s) from NEW_GAME.startModules so the player can SHOOT immediately. Resolve data.miningBeam from an equipped mining laser, defaulting the Kestrel to beam_mk1 so mining works.
    - Handle: module:equipped/unequipped, ui:fitModule/ui:unfitModule, ui:buyShip, ui:unlockTech, tech:researched -> recompute & re-copy derived onto the entity, emit ship:statsChanged{shipId,derived} and ship:cargoCapChanged{shipId,cargoCap}. Implement shipyard buy/sell and outfitting fit/unfit (emit economy:chargeCredits/grantCredits). Respect fitting rule fits(slot,module)=type match && slot.size>=module.minSize.`,
  },
  { key: 'cargo', spec: '02-mining-ores-cargo.md', file: 'src/systems/cargo.js', prompt:
    `Implement the \`cargo\` system in src/systems/cargo.js (keep named helpers addCargo/removeCargo, signature (state, commodityId, qty) -> qty actually moved). Consume src/data/commodities.js (volPerU/massPerU). Own state.player.cargo {items,usedVolume,usedMass,capVolume,capMass}.
    - addCargo clamps to capVolume (VOLUME is the only hard cap, §0.13; mass is informational and feeds flight handling, never blocks). Update usedVolume/usedMass; emit cargo:changed{cargo,usedU,massT}; emit cargo:full{commodityId} when a deposit is partially/fully refused.
    - Handle pickup:collected (kind 'ore'/'cargo'/'module') -> addCargo or moduleInventory. Handle ship:cargoCapChanged/ship:statsChanged -> set capVolume from the active ship's derived cargoCap. update(): recompute caches only when dirty. jettison helper.`,
  },
  { key: 'weapons', spec: '01-combat-weapons-enemy-ai.md', file: 'src/systems/weapons.js', prompt:
    `Implement the \`weapons\` system in src/systems/weapons.js. Consume src/data/weapons.js. Each tick, for the player (fire when state.input.fire, group 1) and each NPC ship (fire when entity.data.intent && entity.data.intent.fire), iterate entity.data.weapons and for each weapon gate on _cooldown<=0, energy (entity.cap>=energyCost), and heat (_heat<heatMax). On fire: spend cap, add heat, set _cooldown=1/rof, and spawn a projectile via helpers.spawnEntity({type:'projectile', pos:muzzle (ship nose), vel: dir*projSpeed (+ a bit of shooter vel), rot:angle, radius:~0.7, team:shooter.team, ownerId:shooter.id, ttl:range/projSpeed, collides:true, data:{damage:dmg,damageType,ownerId,weaponId:defId,kind:'bullet'|'missile'}}). dir = shooter.rot for fixed mounts (apply spread); for turret arc and missiles, lead/track entity.data.combat.targetId. Emit combat:fire{ownerId,weaponId,hardpointIdx,origin,dir}. Cool _heat over time; emit combat:beamStop on beam release if you implement beam weapons (state.combat.beams). Missiles: build lock over lockTimeS before they track. Do NOT handle the mining beam here (that is the mining system, on right-mouse / fireGroup 2).`,
  },
  { key: 'combat', spec: '01-combat-weapons-enemy-ai.md', file: 'src/systems/combat.js', prompt:
    `Implement the \`combat\` system in src/systems/combat.js (also export scaleCombatant and makeEnemySpawnSpec). You MAY import { getDerivedStats, makeShipEntitySpec } from './ships.js'. Consume src/data/enemies.js (ENEMY_TYPES), ships.js, weapons.js.
    - Handle projectile:hit{targetId,ownerId,damage,damageType,pos}: apply damage shield -> armorHp (minus armorFlat per hit) -> hull. Emit combat:damage{targetId,attackerId,amount,type,brokeShield,isPlayer,pos}; emit shieldDown{combatantId} when shield reaches 0. On hull<=0: entity.alive=false; emit entity:killed{id,killerId,type,pos,factionId,bountyCr,lootTableId,victimClass}; emit loot:drop{pos,credits,items} and economy:grantCredits{amount,reason:'bounty'} for the kill reward.
    - update(dt): regen shield (only after shieldRegenDelay seconds since lastDamageT; set lastDamageT on hits) and regen cap, for all alive ships. Maintain a DERIVED combatants list (entityList.filter ship&alive) locally each tick — never a persistent store.
    - scaleCombatant(enemyDef, level): scale hull/shield/dmg by level. makeEnemySpawnSpec(enemyTypeId, level, pos): build a hostile NPC ship spec (team:1, an enemy factionId) via makeShipEntitySpec for the enemy's shipId, with data.ai set so the ai system drives it, scaled by level, with bountyCr + lootTableId.
    - Player death (the killed entity is state.playerId): emit player:death{pos,killerId}; implement a simple respawn at the last station with an insurance cost (emit player:respawn{stationId,shipId,refundCr,cargoLost}). Emit camera:shake on player hits.`,
  },
  { key: 'ai', spec: '01-combat-weapons-enemy-ai.md', file: 'src/systems/ai.js', prompt:
    `Implement the \`ai\` system in src/systems/ai.js. For every NPC ship (type 'ship', id !== state.playerId, has entity.data.ai), run an FSM: idle/patrol -> pursue -> attack/strafe -> flee(low hull). Steering toward/around the target; write entity.data.intent={moveX,moveZ,boost,fire,fireGroup,aimAngle} each tick (flight consumes movement, weapons consumes fire). aimAngle should point at the predicted target position so they actually hit. Default hostility: team 1 targets the player (team 0). Set entity.data.combat.targetId to the chosen target. Maintain simple threat/aggro; flee + stop firing under ~25% hull. Emit ai:stateChange{npcId,from,to} on transitions. Read design/specs/01-combat-weapons-enemy-ai.md for the archetypes (swarmer/sniper/brawler/etc.) and vary behavior by entity.data.ai.archetype. Goal: enemies visibly chase and shoot the player, and can be killed.`,
  },
  { key: 'mining', spec: '02-mining-ores-cargo.md', file: 'src/systems/mining.js', prompt:
    `Implement the \`mining\` system in src/systems/mining.js. Consume src/data/mining.js (ORES,ASTEROIDS,BEAMS), commodities.js. The MINING BEAM trigger is the player holding RIGHT-MOUSE: state.input.fireGroup===2 (and the ship has entity.data.miningBeam). On trigger: pick the target asteroid = the nearest asteroid (type 'asteroid', alive) within miningBeam.range of the ship (prefer one near the aim direction). Each tick mining: reduce target.data.oreHP by miningBeam.dps*dt, emit mining:tick{contactPos,oreType} (vfx/audio) and accrue fractional ore; when >=1 unit liberated, emit mining:yield{commodityId,qty,pos} and either spawn an ore pickup entity (type:'pickup', radius ~2.2, data:{kind:'ore',commodityId,amount}) that drifts toward the ship (magnet within player.magnetRange via velocity), or add directly to cargo if miningBeam.directToCargo (emit pickup:collected so cargo handles it, OR call addCargo). commodityId comes from the asteroid type's oreTable (use state.rng() for weighted pick — deterministic). When oreHP<=0: emit asteroid:destroyed{id,typeId,pos}, set asteroid.alive=false, optionally spawn a couple debris pickups. Beam heat/overheat (beam:overheated/ready). Also handle salvage on 'wreck' entities (salvage:completed). Keep it simple but it MUST work: hold right-mouse near a rock -> its HP drops -> ore pickups appear -> cargo fills.`,
  },
  { key: 'vfx', spec: '10-art-vfx-direction-three-js-primitives-only.md', file: 'src/render/vfx.js', prompt:
    `Implement the \`vfx\` system in src/render/vfx.js (you MAY import * as THREE from 'three'). In init, get the scene via state.render.scene (render inits before vfx). Build a POOLED particle system (THREE.Points and/or sprite pools; additive blending) and subscribe to: combat:fire (muzzle flash at origin along dir), projectile:hit + combat:damage (impact sparks; a shield-ripple when brokeShield), entity:killed + entity:destroyed (explosion = bright flash + expanding shockwave ring + debris; size by entity radius/type), mining:tick (sparks at contact), ship:thrust + ship:boostStart/Stop (engine trail behind ships), jump:start (warp streak). Expose update(frameDt) — it is called every frame inside renderFrame — to integrate/age particles. Emit camera:shake{amount} on large explosions and player hits. Cosmetic Math.random() is allowed. Pool aggressively (no per-event allocation in steady state). Read design/specs/10 for the look/palette.`,
  },
  { key: 'audio', spec: '11-procedural-audio-save-load-meta.md', file: 'src/audio/audioSystem.js', prompt:
    `Implement the \`audio\` system in src/audio/audioSystem.js (you may also create src/audio/synth.js). 100% Web Audio synthesis — NO audio files, no three. Consume src/data/audioRecipes.js (RECIPES, MUSIC_STEMS). In init: create AudioContext lazily and resume it on the first pointerdown/keydown (autoplay policy); build master->limiter->{sfxBus,musicBus} with gains from state.settings.audio. Subscribe and synthesize SFX from RECIPES on: combat:fire (laser/autocannon by weaponId), projectile:hit + combat:damage (hit / shield-hit), entity:killed (explosion small/large), mining:tick (a gated beam loop), pickup:collected (pickup), credits:changed (cash), dock:docked (dock clamp), jump:start (warp), shieldDown + low-hull (alarms), toast / audio:cue / ui:* (UI clicks/confirm/deny). Distance-attenuate world-space SFX by distance from the player ship. Implement a simple adaptive music bed from MUSIC_STEMS that shifts between calm/tense/combat (count nearby hostiles) and docked. Honor settings.audio.master/sfx/music/muted and settings:changed. Must not throw if the AudioContext is still suspended (queue or skip gracefully).`,
  },
]

phase('Wave A systems')
const results = await parallel(tasks.map((t) => () =>
  agent(
    `${CONTRACT}\n\n=== YOUR SYSTEM: ${t.key} ===\nDesign spec to read: design/specs/${t.spec}\nFile to write: ${t.file}\n\n${t.prompt}`,
    { label: `impl:${t.key}`, phase: 'Wave A systems', agentType: 'general-purpose' }
  ).then((note) => ({ key: t.key, file: t.file, note }))
))

return { wave: 'A', results: results.filter(Boolean) }
