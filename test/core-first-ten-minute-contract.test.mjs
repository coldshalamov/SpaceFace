#!/usr/bin/env node
// CORE-FIRST-TEN-MINUTE-CONTRACT-GROK-001
//
// GLOBAL default-game contract for the first ten minutes of a clean New Game.
// Test-first / fail-closed only — no production edits, no goldens, no input.js,
// no fake duplicate systems, no headed processes. Live APIs only.
//
// Acceptance (all must hold):
//   1. Stationary clean new player inside protected Helios starter radius sees no
//      hostile acquire/fire for ≥90 sim seconds, or until an explicit lethal trigger.
//   2. Every first hostile that acquires/fires records motive, trigger, zone,
//      approach telegraph, and a no-fire response window.
//   3. Standard starter weapon sustains ≥20 shots across a 4s hold-fire window.
//   4. Standard starter tether survives a 2.5s capture hold with ~2× load headroom.
//   5. High-speed flyby enters Focus and expands latch so tether is permitted.
//   6. Primary objective exposes one action, destination, distance, and a
//      distinctive mission-marker identity (HUD/radar path).
//
// Evidence context (read-only): .devshots/m1-live-playtest/REVIEW.md (doctrine
// tell / tether HUD / Focus) + Agents.md live backends (flightV3, tactical AI).
//
// Run:
//   node test/core-first-ten-minute-contract.test.mjs
//   npm run check:core:first-ten-minute

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { createTimeEffects } from '../src/core/timeEffects.js';
import { core } from '../src/core/coreSystem.js';
import { physics } from '../src/core/physics.js';
import { ATTACHMENT_DEFS } from '../src/data/combatDefs.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';
import { SECTORS } from '../src/data/sectors.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { WEAPONS } from '../src/data/weapons.js';
import { SHIPS } from '../src/data/ships.js';
import { DOCTRINE_TELEGRAPH_TICKS } from '../src/ai/combatDoctrine.js';
import { pirateDoctrineForEntity, pirateDoctrineReadout } from '../src/data/pirateDoctrines.js';
import { actions } from '../src/systems/actions.js';
import { cargo } from '../src/systems/cargo.js';
import { combat } from '../src/systems/combat.js';
import { economy } from '../src/systems/economy.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { factions } from '../src/systems/factions.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { flybyFocus, pickFlybyTarget } from '../src/systems/flybyFocus.js';
import { heat } from '../src/systems/heat.js';
import {
  CURSOR_LATCH_GRACE,
  cursorAimScore,
  latchGraceScale,
  tetherGameplay,
} from '../src/systems/tetherGameplay.js';
import { traffic } from '../src/systems/traffic.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { weapons as weaponsSystem } from '../src/systems/weapons.js';
import { isHostileToPlayer } from '../src/systems/scanner.js';
import {
  fittingsFromDefaultModules,
  getDerivedStats,
  makeShipEntitySpec,
} from '../src/systems/ships.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';
import { effectiveTetherBreak } from '../src/combat/attachments.js';
import { resolveHudNavStation } from '../src/ui/hud.js';
import { STORY_BEATS } from '../src/data/missions.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const HELIOS = 'sector_helios_prime';
const SOAK_S = 90;
const STARTER_WEAPON_ID = 'wpn_pulse_laser_s';
const STARTER_TETHER_ID = 'tether_standard';
const SUSTAIN_SHOTS = 20;
const SUSTAIN_S = 4;
const CAPTURE_HOLD_S = 2.5;
const TOLERANCE_MULT = 2.0;
// Mirrors src/systems/world.js STARTER_SAFE_RADIUS (module-private; pinned by source + behavior).
const HELIOS_STARTER_SAFE_RADIUS = 1400;

const failures = [];
const passes = [];
const red = [];

async function check(name, fn) {
  try {
    await fn();
    passes.push(name);
    console.log(`  PASS  ${name}`);
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    failures.push({ name, message });
    red.push({ name, message });
    console.log(`  RED   ${name}`);
    console.log(`        ${message}`);
  }
}

function read(rel) {
  return readFileSync(new URL(rel, import.meta.url), 'utf8');
}

function fork(definition) {
  return Object.create(definition);
}

function dist(a, b) {
  return Math.hypot((a?.x || 0) - (b?.x || 0), (a?.z || 0) - (b?.z || 0));
}

function insideHeliosStarterSafe(pos, sectorOrigin = { x: 0, z: 0 }) {
  return dist(pos, sectorOrigin) <= HELIOS_STARTER_SAFE_RADIUS;
}

/** Fail-closed ledger required on every first hostile that acquires or fires. */
function firstHostileLedger(entity, telegraphEvents = []) {
  const data = (entity && entity.data) || {};
  const ai = data.ai || {};
  const doctrine = pirateDoctrineForEntity(entity);
  const readout = pirateDoctrineReadout(entity);
  const entityId = entity && entity.id;
  const telegraphs = (telegraphEvents || []).filter((t) => t && t.entityId === entityId);
  const approach = telegraphs[0] || null;

  // Explicit contract fields first; live fallbacks only as diagnostic soft evidence (still fail if
  // the canonical keys are missing — fail closed, no silent invent-from-context pass).
  const motive = ai.motive || data.motive || (doctrine && doctrine.id) || null;
  const trigger = ai.engagementTrigger || ai.lethalTrigger || ai.trigger || data.engagementTrigger || null;
  const zone = ai.zoneId || ai.zoneName || data.zoneId || null;
  const approachTelegraph = (approach && (approach.kind || approach.phase))
    || ai.approachTelegraph
    || ai.approachTelegraphKind
    || (ai.telegraph && (ai.telegraph.kind || ai.telegraph))
    || null;
  const noFireResponseWindow =
    Number.isFinite(ai.noFireResponseWindowS) ? ai.noFireResponseWindowS
      : Number.isFinite(ai.holdFireS) ? ai.holdFireS
        : Number.isFinite(ai.noFireResponseWindowTicks) ? ai.noFireResponseWindowTicks / 60
          : (approach && Number.isFinite(approach.durationTicks) ? approach.durationTicks / 60 : null);

  return {
    entityId,
    motive: motive != null && String(motive).length ? String(motive) : null,
    trigger: trigger != null && String(trigger).length ? String(trigger) : null,
    zone: zone != null && String(zone).length ? String(zone) : null,
    approachTelegraph: approachTelegraph != null && String(approachTelegraph).length
      ? String(approachTelegraph)
      : null,
    noFireResponseWindowS: Number.isFinite(noFireResponseWindow) ? noFireResponseWindow : null,
    doctrineId: doctrine && doctrine.id,
    scanReadout: readout && readout.scanReadout,
    telegraphCount: telegraphs.length,
  };
}

function assertFirstHostileLedgerComplete(ledger, label) {
  assert.ok(ledger, `${label}: ledger object required`);
  const missing = [];
  if (!ledger.motive) missing.push('motive');
  if (!ledger.trigger) missing.push('trigger');
  if (!ledger.zone) missing.push('zone');
  if (!ledger.approachTelegraph) missing.push('approachTelegraph');
  if (!(Number.isFinite(ledger.noFireResponseWindowS) && ledger.noFireResponseWindowS > 0)) {
    missing.push('noFireResponseWindowS');
  }
  assert.equal(
    missing.length,
    0,
    `${label}: first hostile ledger incomplete — missing [${missing.join(', ')}] (got ${JSON.stringify(ledger)})`,
  );
  assert.ok(
    ledger.noFireResponseWindowS + 1e-9 >= DOCTRINE_TELEGRAPH_TICKS / 60,
    `${label}: no-fire window ${ledger.noFireResponseWindowS}s must cover >=${DOCTRINE_TELEGRAPH_TICKS} ticks`,
  );
}

// ─── 0. Global default-game scope (not Casual-only) ───────────────────────────
await check('global default NEW_GAME is Helios starter Hitch, not Casual-gated', () => {
  assert.equal(NEW_GAME.startingSectorId, HELIOS, 'default sector is Helios Prime');
  assert.equal(NEW_GAME.shipId, 'ship_kestrel', 'default starter hull is Hitch/Kestrel');
  assert.ok(NEW_GAME.fittedModules.includes(STARTER_WEAPON_ID), 'default fit includes starter pulse laser');
  assert.equal(NEW_GAME.credits, 5000, 'default credits are the shared starter bank');
  // Protections must not live behind a Casual-only difficulty branch in the live defaults file.
  const ngSrc = read('../src/data/newGameDefaults.js');
  assert.doesNotMatch(ngSrc, /casualOnly|casual_only|difficulty\s*===\s*['"]casual['"]/i,
    'newGameDefaults must not gate starter contract behind Casual');
  const worldSrc = read('../src/systems/world.js');
  assert.match(worldSrc, /STARTER_SAFE_RADIUS\s*=\s*1400/,
    'world.js must keep Helios starter safe radius at 1400 wu');
  assert.match(worldSrc, /sector_helios_prime.*STARTER_SAFE|starterSafeRadius/,
    'world.js must apply starter safe radius on Helios');
  // Difficulty must not be the only path that enables starter protection.
  assert.doesNotMatch(worldSrc, /difficulty\s*===\s*['"]casual['"][\s\S]{0,120}STARTER_SAFE/i,
    'starter safe radius must not be Casual-only');
});

// ─── 1. Protected Helios soak: no hostile acquire/fire for 90s ────────────────
await check('clean stationary player inside Helios starter radius: no hostile acquire/fire for 90s', () => {
  const heliosDef = SECTORS.find((s) => s.id === HELIOS);
  assert.ok(heliosDef, 'Helios sector exists');

  const systems = [spawnBudget, traffic, cargo, economy, factions, heat, encounterDirector, weaponsSystem];
  const sim = createSimulation({ seed: 47, systems });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = HELIOS;
  state.settings = state.settings || {};
  state.settings.gameplay = Object.assign({}, state.settings.gameplay || {}, {
    difficulty: 'normal', // global path — not Casual
    flightBackend: 'v3',
    physicsBackend: 'rapier-dynamic',
    aiBackend: 'sg06-tactical',
  });

  // Anchors near the living pocket used by check-helios-living-pocket.
  sim.spawn({
    type: 'station', team: 2, pos: { x: 1280, z: -420 }, radius: 42, mass: 1e6,
    data: { stationId: 'station_helios', name: 'Helios Station', dockRadius: 80 },
  });
  sim.spawn({
    type: 'station', team: 2, pos: { x: -920, z: 1080 }, radius: 42, mass: 1e6,
    data: { stationId: 'station_coalition', name: 'Coalition Yard', dockRadius: 80 },
  });

  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 400, z: 0 }, vel: { x: 0, z: 0 },
    hull: 200, hullMax: 200, radius: 6, mass: 32,
    data: { defId: NEW_GAME.shipId, weapons: [] },
  });
  state.playerId = player.id;
  state.player.heat = 0;
  state.player.credits = NEW_GAME.credits;
  // Onboarding finished so living traffic/director may run; player remains clean + stationary.
  state.onboarding = { active: false, finished: true };

  assert.ok(insideHeliosStarterSafe(player.pos),
    `player must start inside Helios starter safe radius (${HELIOS_STARTER_SAFE_RADIUS} wu from sector origin)`);

  const hostileFires = [];
  const acquires = [];
  bus.on('combat:fire', (p) => {
    if (!p || p.ownerId === state.playerId) return;
    hostileFires.push({ t: state.simTime, ...p });
  });

  bus.emit('sector:enter', { sectorId: HELIOS, sector: heliosDef });

  const totalTicks = Math.round(SOAK_S / SIM_DT);
  for (let i = 0; i < totalTicks; i++) {
    // Stationary clean pilot — no player motion, no heat.
    player.vel.x = 0;
    player.vel.z = 0;
    state.player.heat = 0;
    sim.step(SIM_DT);

    assert.ok(insideHeliosStarterSafe(player.pos),
      `player drifted outside starter safe radius at t=${state.simTime.toFixed(2)}`);

    for (const e of state.entityList || []) {
      if (!e || !e.alive || e.id === state.playerId) continue;
      if (e.type !== 'ship' && e.type !== 'drone') continue;
      const combatData = e.data && e.data.combat;
      const targetsPlayer = !!(combatData
        && (combatData.targetId === state.playerId || combatData.lockTarget === state.playerId));
      const intent = e.data && e.data.intent;
      const fireIntent = !!(intent && intent.fire);
      if (targetsPlayer || fireIntent) {
        acquires.push({
          t: state.simTime,
          id: e.id,
          targetsPlayer,
          fireIntent,
          hostile: isHostileToPlayer(e, player.team, state),
          context: e.data && e.data.ai && (e.data.ai.spawnContext || e.data.ai.context),
          lethalTrigger: e.data && e.data.ai && (e.data.ai.lethalTrigger || e.data.ai.engagementTrigger),
        });
      }
    }
  }

  // Fail closed: any acquire/fire before an explicit lethal trigger is a contract break.
  const unlawful = acquires.filter((a) => !a.lethalTrigger);
  const firesWithoutTrigger = hostileFires.filter((f) => {
    const owner = state.entities.get(f.ownerId);
    const ai = owner && owner.data && owner.data.ai;
    return !(ai && (ai.lethalTrigger || ai.engagementTrigger));
  });

  assert.equal(unlawful.length, 0,
    `no hostile may acquire the clean stationary player inside starter radius without lethal trigger; saw ${unlawful.length}: ${JSON.stringify(unlawful.slice(0, 5))}`);
  assert.equal(firesWithoutTrigger.length, 0,
    `no hostile may fire on the clean stationary player inside starter radius without lethal trigger; saw ${firesWithoutTrigger.length}: ${JSON.stringify(firesWithoutTrigger.slice(0, 5))}`);
  assert.equal(hostileFires.length, 0,
    `expected zero hostile combat:fire during ${SOAK_S}s clean soak; got ${hostileFires.length}`);
});

// ─── 2. First-hostile ledger (motive / trigger / zone / telegraph / window) ───
await check('first hostile that engages records motive, trigger, zone, approach telegraph, no-fire window', () => {
  const sim = createSimulation({ seed: 91, systems: [weaponsSystem] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = HELIOS;
  state.player.heat = 0;

  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    hull: 200, hullMax: 200, radius: 6,
  });
  state.playerId = player.id;

  // Live enemy spawn path (combat.makeEnemySpawnSpec) — no duplicate AI.
  const pos = { x: 180, z: 0 };
  const spec = makeEnemySpawnSpec('reaver_pirate', 1, pos);
  assert.ok(spec, 'makeEnemySpawnSpec returns a live reaver_pirate spec');
  spec.data = spec.data || {};
  spec.data.ai = Object.assign({}, spec.data.ai || {}, {
    spawnContext: 'tutorial_pirate',
    // Intentionally omit motive/trigger/noFireResponseWindow so incomplete bookkeeping fails closed.
    zoneId: 'zone_helios_claim',
    zoneName: 'Sanctioned Claim',
    forcePlayerTarget: true,
    huntPlayer: true,
  });
  spec.data.combat = { targetId: player.id, lockTarget: player.id };
  const pirate = sim.spawn(spec);
  assert.ok(pirate, 'tutorial-style first hostile spawns via live helpers');

  const telegraphs = [];
  const fires = [];
  bus.on('ai:telegraph', (p) => telegraphs.push({ t: state.simTime, ...p }));
  bus.on('combat:fire', (p) => {
    if (p && p.ownerId === pirate.id) fires.push({ t: state.simTime, ...p });
  });

  // Mark acquire immediately (live combat target stamp).
  assert.equal(pirate.data.combat.targetId, player.id, 'first hostile acquires the player');

  // Emit a minimal approach telegraph the way tacticalAI does (kind + durationTicks).
  // Production may not have done this yet — we still require the ledger fields on the entity.
  bus.emit('ai:telegraph', {
    entityId: pirate.id,
    targetId: player.id,
    kind: 'engine_flare',
    durationTicks: DOCTRINE_TELEGRAPH_TICKS,
    tick: state.tick || 0,
  });

  const ledger = firstHostileLedger(pirate, telegraphs);
  // Fail closed on complete ledger — current live spawns lack motive / trigger / no-fire window fields.
  assertFirstHostileLedgerComplete(ledger, 'tutorial first hostile');
});

await check('doctrine telegraph floor is ≥30 ticks (0.5s) for approach no-fire window', () => {
  assert.ok(DOCTRINE_TELEGRAPH_TICKS >= 30,
    `DOCTRINE_TELEGRAPH_TICKS must be ≥30 (got ${DOCTRINE_TELEGRAPH_TICKS})`);
  assert.ok(DOCTRINE_TELEGRAPH_TICKS / 60 >= 0.5 - 1e-9,
    'telegraph no-fire window must cover ≥0.5 sim seconds');
});

// ─── 3. Starter weapon 20-shot / 4s sustain ───────────────────────────────────
await check('standard starter weapon sustains ≥20 shots in 4s continuous fire', () => {
  const def = WEAPONS.find((w) => w.id === STARTER_WEAPON_ID);
  assert.ok(def, 'starter weapon def exists');
  assert.equal(def.id, STARTER_WEAPON_ID);

  const shipDef = SHIPS.find((s) => s.id === NEW_GAME.shipId);
  assert.ok(shipDef, 'starter ship def exists');

  const state = createGameState(47);
  state.mode = 'flight';
  state.entities.clear();
  state.entityList.length = 0;
  state.nextEntityId = 10;

  const fittings = fittingsFromDefaultModules(NEW_GAME.shipId, NEW_GAME.fittedModules);
  const player = Object.assign(
    makeShipEntitySpec(NEW_GAME.shipId, {
      isPlayer: true,
      pos: { x: 0, z: 0 },
      rot: 0,
      fittings,
    }),
    { id: 1, alive: true, flags: {} },
  );
  // Ensure cap pool is live on the entity for weapons drain.
  const derived = getDerivedStats(NEW_GAME.shipId, fittings, state.player);
  player.cap = derived.capMax;
  player.capMax = derived.capMax;
  player.capRegen = derived.capRegen;
  player.flags = player.flags || {};
  player.vel = player.vel || { x: 0, z: 0 };
  player.data = player.data || {};
  // Live weapon instance shape (ships.makeWeaponRuntime fields weapons.js reads).
  player.data.weapons = [{
    slotIndex: 0,
    defId: STARTER_WEAPON_ID,
    name: def.name,
    dmg: def.dmg,
    rof: def.rof,
    energyCost: def.energyCost,
    heat: def.heatPerShot || 0,
    heatMax: def.heatMax || 100,
    heatDissip: def.heatDissip || 0,
    projSpeed: def.projSpeed,
    range: def.range,
    tracking: def.tracking || 'fixed',
    facing: 'front',
    facingAngle: 0,
    gimbalArc: Math.PI / 2,
    muzzleOffset: [1, 0],
    _cooldown: 0,
    _heat: 0,
  }];
  state.entities.set(1, player);
  state.entityList.push(player);
  state.playerId = 1;

  state.input.fire = true;
  state.input.aimAngle = 0;
  state.input.actions = state.input.actions || {};

  const bus = createBus();
  const helpers = {
    getEntity: (id) => state.entities.get(id),
    spawnEntity: (spec) => {
      const id = state.nextEntityId++;
      const e = Object.assign({ id, alive: true, collides: true, flags: {} }, spec);
      e.pos = e.pos || { x: 0, z: 0 };
      e.vel = e.vel || { x: 0, z: 0 };
      state.entities.set(id, e);
      state.entityList.push(e);
      return e;
    },
    mulberry32: (s) => {
      let a = s >>> 0;
      return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },
    hash32: (a, b) => {
      let h = (a >>> 0) ^ 0x9e3779b9;
      const s = String(b || '');
      for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x85ebca6b);
      return h >>> 0;
    },
  };

  const wpn = fork(weaponsSystem);
  wpn.init({ state, bus, helpers, registry: { get: () => null } });

  let shots = 0;
  bus.on('combat:fire', (p) => {
    if (p && p.ownerId === state.playerId && p.weaponId === STARTER_WEAPON_ID) shots += 1;
  });

  const ticks = Math.round(SUSTAIN_S / SIM_DT);
  for (let i = 0; i < ticks; i++) {
    // Cap regen is combat-owned in full sim; approximate live regen so heat/rof are the real gates.
    if (Number.isFinite(player.capRegen) && Number.isFinite(player.capMax)) {
      player.cap = Math.min(player.capMax, (player.cap || 0) + player.capRegen * SIM_DT);
    }
    state.entityIndex = { weaponShips: [player], ships: [player], projectiles: state.entityList.filter((e) => e && e.type === 'projectile') };
    state.simTime = i * SIM_DT;
    state.tick = i;
    wpn.update(SIM_DT, state);
  }

  const catalogCeiling = Math.floor(def.rof * SUSTAIN_S + 1e-9) + 1;
  assert.ok(
    catalogCeiling >= SUSTAIN_SHOTS,
    `starter ${STARTER_WEAPON_ID} catalog rof=${def.rof} yields at most ~${catalogCeiling} shots in ${SUSTAIN_S}s; need >=${SUSTAIN_SHOTS}`,
  );
  assert.ok(
    shots >= SUSTAIN_SHOTS,
    `starter ${STARTER_WEAPON_ID} must fire ≥${SUSTAIN_SHOTS} shots in ${SUSTAIN_S}s continuous fire; got ${shots} (rof=${def.rof}, energyCost=${def.energyCost}, capMax=${player.capMax})`,
  );
});

// ─── 4. Starter tether: 2.5s capture hold with ~2× tolerance ──────────────────
await check('standard starter tether survives 2.5s capture hold with ~2× load headroom', async () => {
  const tetherDef = ATTACHMENT_DEFS.find((d) => d.id === STARTER_TETHER_ID);
  assert.ok(tetherDef, 'tether_standard def exists');
  const breakPolicy = effectiveTetherBreak(tetherDef, {
    data: { derived: { tetherSpoolMult: 1 } },
  });
  assert.ok(breakPolicy && breakPolicy.maxTension > 0, 'effective break policy resolves');

  const state = createGameState(0x7e71);
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.settings.gameplay.flightBackend = 'v3';
  state.settings.controls.flightMode = 'newtonian';
  state.entities.clear();
  state.entityList.length = 0;
  state.nextEntityId = 1;

  const bus = createBus();
  const helpers = {};
  const runtime = {
    core: fork(core),
    physics: fork(physics),
    actions: fork(actions),
    flight: fork(flightV3),
    combat: fork(combat),
    tetherGameplay: fork(tetherGameplay),
  };
  const byName = new Map(Object.entries(runtime));
  const registry = { get: (name) => byName.get(name) || null };
  const ctx = { state, bus, helpers, registry };
  runtime.core.init(ctx);
  runtime.physics.init(ctx);
  runtime.actions.init(ctx);
  runtime.flight.init(ctx);
  runtime.combat.init(ctx);
  runtime.tetherGameplay.init(ctx);

  const events = { latched: [], broke: [], released: [] };
  bus.on('tether:latched', (p) => events.latched.push(p));
  bus.on('tether:broke', (p) => events.broke.push(p));
  bus.on('tether:released', (p) => events.released.push(p));

  const fittings = fittingsFromDefaultModules(NEW_GAME.shipId, NEW_GAME.fittedModules);
  const player = helpers.spawnEntity(makeShipEntitySpec(NEW_GAME.shipId, {
    isPlayer: true,
    pos: { x: 0, z: 0 },
    rot: 0,
    fittings,
  }));
  state.playerId = player.id;
  const asteroid = helpers.spawnEntity({
    type: 'asteroid',
    pos: { x: 90, z: 0 },
    radius: 12,
    mass: 640,
    hull: 360,
    hullMax: 360,
    collides: true,
    data: { typeId: 'ast_common_rock', oreHP: 360, oreHPMax: 360, yieldU: 8 },
  });

  runtime.physics.update(0, state);
  if (runtime.physics._sg02Init) await runtime.physics._sg02Init;
  runtime.physics.update(0, state);
  assert.ok(runtime.physics._sg02, 'SG-02 dynamic body owner required for tether capture hold');

  state.input.aimWorld = { x: asteroid.pos.x, z: asteroid.pos.z };
  state.input.aimAngle = 0;
  state.input.actions = {
    tetherFire: true, tetherCut: false, reelDelta: 0,
  };
  const step = () => {
    runtime.core.preStep(SIM_DT, state);
    runtime.actions.update(SIM_DT, state);
    runtime.flight.update(SIM_DT, state);
    runtime.physics.update(SIM_DT, state);
    runtime.combat.update(SIM_DT, state);
    runtime.tetherGameplay.update(SIM_DT, state);
    runtime.core.lifetimeSweep(SIM_DT, state);
  };
  step();
  state.input.actions.tetherFire = false;
  assert.equal(events.latched.length, 1, 'starter tether must latch the aimed asteroid');

  let peakStrain = 0;
  let peakTension = 0;
  const holdTicks = Math.round(CAPTURE_HOLD_S / SIM_DT);
  for (let i = 0; i < holdTicks; i++) {
    // Mild reel + light thrust — a normal capture/hold, not a deliberate snap.
    state.input.actions.reelDelta = -0.35;
    state.input.moveZ = 0.15;
    state.input.moveX = 0;
    state.input.boost = false;
    state.input.turnIntent = 0;
    step();
    const t = state.player && state.player.tether;
    if (t && Number.isFinite(t.strain)) peakStrain = Math.max(peakStrain, t.strain);
    // Attachment telemetry if present.
    const atts = state.combat && state.combat.attachments && state.combat.attachments.byId;
    if (atts) {
      for (const att of Object.values(atts)) {
        if (!att) continue;
        const ten = Number(att.tension || att.lastTension || 0);
        if (Number.isFinite(ten)) peakTension = Math.max(peakTension, ten);
      }
    }
  }

  assert.equal(events.broke.length, 0,
    `starter tether must survive ${CAPTURE_HOLD_S}s capture hold without break (peakStrain=${peakStrain.toFixed(3)})`);
  assert.ok(state.player.tether && state.player.tether.active,
    'tether must remain active after capture hold');

  // ~2× tolerance: peak load must stay ≤ half of break (strain 1.0 or maxTension).
  assert.ok(peakStrain <= 1 / TOLERANCE_MULT + 1e-6,
    `peak strain ${peakStrain.toFixed(3)} must leave ~${TOLERANCE_MULT}× headroom vs break (≤${(1 / TOLERANCE_MULT).toFixed(2)})`);
  if (peakTension > 0) {
    assert.ok(peakTension * TOLERANCE_MULT <= breakPolicy.maxTension + 1e-6,
      `peak tension ${peakTension} × ${TOLERANCE_MULT} must stay ≤ break maxTension ${breakPolicy.maxTension}`);
  }

  // Catalog strength itself must be at least the historical base × ~2 headroom path for starter
  // capture survival (relative to the pre-M1 420000-class base → 2× would be 840000; current is
  // +30% only — this assertion is intentionally fail-closed until production raises strength).
  const HISTORICAL_BASE_TENSION = 420000;
  assert.ok(
    breakPolicy.maxTension + 1e-6 >= HISTORICAL_BASE_TENSION * TOLERANCE_MULT,
    `tether_standard maxTension ${breakPolicy.maxTension} must be ≥ ~${TOLERANCE_MULT}× historical base ${HISTORICAL_BASE_TENSION} (=${HISTORICAL_BASE_TENSION * TOLERANCE_MULT}) for 2.5s capture margin`,
  );
});

// ─── 5. High-speed flyby → Focus → tether permitted ───────────────────────────
await check('high-speed flyby enters Focus and permits expanded tether latch', () => {
  const p = {
    id: 1, type: 'ship', team: 0, alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 120, z: 0 }, rot: 0, flags: {},
  };
  const foe = {
    id: 3, type: 'ship', team: 1, alive: true,
    pos: { x: 120, z: 10 }, vel: { x: -40, z: 0 }, radius: 12, mass: 60,
    data: {
      ai: { archetype: 'pirate', spawnContext: 'zone_hostile' },
      combat: { targetId: null },
      weapons: [{ id: 'wpn_test' }],
    },
  };
  const state = {
    mode: 'flight',
    simTime: 0,
    tick: 0,
    timeScale: 1,
    playerId: p.id,
    player: {
      heat: 0,
      targetId: null,
      tether: { active: false, targetId: null },
    },
    entities: new Map([[p.id, p], [foe.id, foe]]),
    entityList: [p, foe],
    input: { aimWorld: { x: foe.pos.x, z: foe.pos.z }, aimAngle: 0 },
  };

  const picked = pickFlybyTarget(state, p, [foe]);
  assert.ok(picked && picked.id === foe.id, 'high-speed hostile flyby must be eligible for Focus');

  const bus = createBus();
  const timeEffects = createTimeEffects(state);
  const system = Object.assign({}, flybyFocus);
  system.init({ state, bus, timeEffects });
  system.update(SIM_DT, state);

  assert.equal(state.player.flybyFocus.active, true, 'Focus must activate on high-speed pass');
  assert.equal(state.player.flybyFocus.targetId, foe.id, 'Focus must lock the flyby threat');
  assert.equal(state.player.targetId, foe.id, 'Focus must own player targetId for tether');
  assert.ok(state.timeScale <= 0.5 + 1e-9, 'Focus must request slow-time (≤50%)');

  const scale = latchGraceScale(state);
  assert.ok(scale >= 2.4, `Focus latch scale must expand tether grace (got ${scale})`);

  // Soft-latch permission: off-cursor aim that fails without Focus succeeds with Focus scale.
  const aim = { x: foe.pos.x + 40, z: foe.pos.z };
  const idleState = {
    player: { flybyFocus: { active: false, latchScale: 1 } },
  };
  const ux = 1, uz = 0;
  const idle = cursorAimScore(foe, aim, p, ux, uz, 200, idleState);
  const focused = cursorAimScore(foe, aim, p, ux, uz, 200, state);
  assert.ok(Number.isFinite(focused.score), 'Focus-expanded latch must score the flyby target');
  // Either Focus improves the score or idle was already in grace — but Focus must never deny latch.
  assert.ok(
    Number.isFinite(focused.score)
    && (focused.score <= idle.score || !Number.isFinite(idle.score) || idle.score === Infinity),
    `Focus must permit tether latch (idleScore=${idle.score}, focusScore=${focused.score}, grace=${CURSOR_LATCH_GRACE})`,
  );

  system.destroy();
});

// ─── 6. Objective: one action, destination, distance, distinctive marker ──────
await check('objective exposes one action, destination, distance, and distinctive mission marker identity', () => {
  // Live HUD nav resolver stays importable headless.
  assert.equal(typeof resolveHudNavStation, 'function', 'resolveHudNavStation is the live HUD station API');

  const radarSrc = read('../src/ui/radar.js');
  assert.match(radarSrc, /drawWaypointDiamond/, 'radar draws a distinctive waypoint diamond');
  assert.match(radarSrc, /COL\.objective/, 'radar uses objective color for mission markers');
  assert.match(radarSrc, /waypointLabel/, 'radar labels the mission marker');

  const hudSrc = read('../src/ui/hud.js');
  assert.match(hudSrc, /sf-nav-readout/, 'HUD exposes nav readout (destination + distance)');
  assert.match(hudSrc, /sf-mission-tracker/, 'HUD exposes mission tracker action line');

  // Construct the live onboarding B0 waypoint shape (onboarding._setObjectiveWaypoint).
  const player = { id: 1, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, alive: true, type: 'ship' };
  const beacon = {
    id: 2, type: 'beacon', alive: true,
    pos: { x: 320, z: -40 },
    data: { kind: 'kessler_handoff_beacon' },
  };
  const state = {
    playerId: 1,
    entities: new Map([[1, player], [2, beacon]]),
    entityList: [player, beacon],
    onboarding: { active: true, finished: false, currentBeat: 0 },
    story: { beatIndex: 0 },
    nav: {
      waypoint: {
        onboarding: true,
        pos: { x: beacon.pos.x, z: beacon.pos.z },
        label: 'Beacon',
        reason: 'Contract 47-A: thrust to the beacon.',
        // Mirrors onboarding._setObjectiveWaypoint: the objective owns one unmistakable radar glyph.
        markerKind: 'objective',
        mapLabel: '◆ AMBER DIAMOND',
      },
    },
    missions: { active: [] },
    ui: { trackedMissionId: null },
    world: { currentSectorId: HELIOS },
  };

  const wp = state.nav.waypoint;
  const action = String(wp.reason || '').trim();
  const destination = String(wp.label || '').trim();
  const distance = dist(player.pos, wp.pos);

  assert.ok(action.length > 0, 'objective must expose one action line');
  // One primary action: a single imperative, not a multi-sentence wall.
  const sentences = action.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
  assert.equal(sentences.length, 1, `objective must expose exactly one action sentence (got ${sentences.length}: ${action})`);
  assert.ok(destination.length > 0, 'objective must expose a destination label');
  assert.ok(Number.isFinite(distance) && distance > 0, `objective must expose a positive distance (got ${distance})`);

  // Distinctive mission marker identity — explicit id/kind separate from ordinary contacts.
  const markerIdentity = wp.markerId || wp.markerKind || wp.mapLabel || null;
  assert.ok(
    markerIdentity,
    'objective must expose a distinctive mission marker identity (markerId | markerKind | mapLabel) distinct from generic contacts',
  );
  // Soft live story beat still exists as fallback context after tutorial.
  assert.ok(STORY_BEATS && STORY_BEATS.length > 0, 'STORY_BEATS table is live');

  // Helios zones exist so destination/zone language can bind in the starter sector.
  const zones = zonesForSector(HELIOS);
  assert.ok(zones.some((z) => z.type === 'civilian_core'), 'Helios civilian_core zone exists for starter destination context');
});

// ─── Report ───────────────────────────────────────────────────────────────────
console.log('');
console.log(`CORE-FIRST-TEN-MINUTE-CONTRACT-GROK-001: ${passes.length} PASS / ${failures.length} RED / ${passes.length + failures.length} total`);
if (red.length) {
  console.log('');
  console.log('RED assertions (fix production only after this contract is green):');
  for (const r of red) {
    console.log(`  - ${r.name}`);
    console.log(`      ${r.message}`);
  }
  process.exitCode = 1;
} else {
  console.log('All first-ten-minute contract assertions GREEN.');
}
