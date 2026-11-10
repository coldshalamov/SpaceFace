#!/usr/bin/env node
// scratch-stranger-metrics.mjs — onboarding-thesis vertical: fixed-seed stranger runs.
// Drives the SAME pieces as scripts/run-actual-game-playthrough.mjs (createSimulation boot,
// createStrangerPilot, createPlaythroughLedger) while the shared CLI is mid-edit by the
// instrument lane; delete when the public CLI runs the stranger directly.
import { createSimulation, SIM_DT } from './src/core/sim.js';
import { actions } from './src/systems/actions.js';
import { flightV3 } from './src/systems/flightV3.js';
import { weapons } from './src/systems/weapons.js';
import { physics } from './src/core/physics.js';
import { combat } from './src/systems/combat.js';
import { cargo } from './src/systems/cargo.js';
import { economy } from './src/systems/economy.js';
import { missions } from './src/systems/missions.js';
import { story } from './src/systems/story.js';
import { save } from './src/save/saveSystem.js';
import { world } from './src/systems/world.js';
import { mining } from './src/systems/mining.js';
import { fields } from './src/systems/fields.js';
import { traffic } from './src/systems/traffic.js';
import { salvage } from './src/systems/salvage.js';
import { lootShards } from './src/systems/lootShards.js';
import { tetherGameplay } from './src/systems/tetherGameplay.js';
import { masslineImpacts } from './src/systems/masslineImpacts.js';
import { masslineThrow } from './src/systems/masslineThrow.js';
import { masslineSnares } from './src/systems/masslineSnares.js';
import { masslineThreats } from './src/systems/masslineThreats.js';
import { encounterDirector } from './src/systems/encounterDirector.js';
import { aiEncounter } from './src/systems/aiEncounter.js';
import { createTacticalAISystem } from './src/systems/tacticalAI.js';
import { aiPorts } from './src/systems/aiPorts.js';
import { heat } from './src/systems/heat.js';
import { lawSecurity } from './src/systems/lawSecurity.js';
import { dockingCorridor } from './src/systems/dockingCorridor.js';
import { fieldDepletion } from './src/systems/fieldDepletion.js';
import { voiceArbiter } from './src/ui/voiceArbiter.js';
import { flybyFocus } from './src/systems/flybyFocus.js';
import { scanner } from './src/systems/scanner.js';
import { barkDirector } from './src/systems/barkDirector.js';
import { combatOutcome } from './src/systems/combatOutcome.js';
import { factions } from './src/systems/factions.js';
import { factionPresence } from './src/systems/factionPresence.js';
import { npcJobsRuntime } from './src/systems/npcJobsRuntime.js';
import { onboarding } from './src/systems/onboarding.js';
import { NEW_GAME } from './src/data/newGameDefaults.js';
import { COMBAT_FLAGS, MASSLINE2_FLAGS, TRAVEL_FLAGS } from './src/data/featureFlags.js';
import { PRODUCTION_FEATURES } from './src/runtime/runtimeProfiles.js';
import { fittingsFromDefaultModules, makeShipEntitySpec } from './src/systems/ships.js';
import { createPlaythroughLedger } from './scripts/lib/bench/playthroughLedger.mjs';
import { createStrangerPilot, createServices } from './scripts/lib/bench/playthroughStrangerPilot.mjs';

const tacticalAI = createTacticalAISystem();
const seed = Number(process.argv[2] || 4242) >>> 0;
const hours = Number(process.argv[3] || 1);

const sim = createSimulation({
  seed,
  systems: [
    actions, flightV3, weapons, physics, combat, cargo,
    economy, missions, story, save,
    world, mining, fields, traffic, salvage, lootShards,
    tetherGameplay, masslineImpacts, masslineThrow, masslineSnares, masslineThreats,
    encounterDirector, aiEncounter, tacticalAI, aiPorts,
    voiceArbiter, scanner, flybyFocus, barkDirector,
    combatOutcome, factions, factionPresence, npcJobsRuntime,
    heat, lawSecurity, dockingCorridor, fieldDepletion,
    onboarding,
  ],
});
const { state, bus, registry } = sim;

state.mode = 'flight';
state.settings.gameplay.runtimeProfile = 'production';
Object.assign(COMBAT_FLAGS, PRODUCTION_FEATURES.combat);
Object.assign(MASSLINE2_FLAGS, PRODUCTION_FEATURES.massline2);
Object.assign(TRAVEL_FLAGS, PRODUCTION_FEATURES.travel);
state.settings.gameplay.physicsBackend = 'rapier-dynamic';
state.settings.gameplay.flightBackend = 'v3';
state.settings.gameplay.aiBackend = 'sg06-tactical';
state.world.currentSectorId = 'sector_helios_prime';
state.player.credits = NEW_GAME.credits;

const playerEntity = sim.spawn(makeShipEntitySpec(NEW_GAME.shipId, {
  team: 0,
  factionId: 'faction_free',
  isPlayer: true,
  player: state.player,
  fittings: fittingsFromDefaultModules(NEW_GAME.shipId, NEW_GAME.fittedModules || []),
  pos: { x: 0, z: 0 },
  rot: 0,
}));
state.playerId = playerEntity.id;

if (typeof registry.get('economy').newGame === 'function') registry.get('economy').newGame();
if (typeof registry.get('world').newGame === 'function') registry.get('world').newGame();
bus.emit('game:started', {});
const physicsReady = await registry.get('physics').prepareBackend(state, { reset: true });
if (!physicsReady) throw new Error('physics backend did not prepare headless');

const ledger = createPlaythroughLedger({ state, bus, archetype: 'stranger', seed });
const servicesRef = { current: null };
const services = createServices({
  state, bus, ledger, econ: registry.get('economy'),
  clock: {
    tick: () => state.tick,
    undockCooldownUntil: () => (servicesRef.current ? servicesRef.current.undockCooldownUntilTick : 0),
  },
});
servicesRef.current = services;
services.undockCooldownUntilTick = 0;
const pilot = createStrangerPilot({ state, bus, ledger, services });

registry.get('world').enterSector('sector_helios_prime', {});

const targetSimSeconds = hours * 3600;
let iterations = 0;
const milestones = {};
bus.on('firsthour:milestone', (p) => { if (!milestones[p.milestone]) milestones[p.milestone] = state.simTime; });
if (process.env.STRANGER_TRACE) {
  bus.on('tether:broke', (p) => {
    if (state.simTime > 300) return;
    const ob7 = state.onboarding || {};
    const r7 = ob7.rescue;
    const rock7 = r7 && r7.ids.rock != null ? state.entities.get(r7.ids.rock) : null;
    const pl7 = state.entities.get(state.playerId);
    console.log(`  [BRK t=${state.simTime.toFixed(1)}] tgt=${p.targetId} rockId=${r7 ? r7.ids.rock : '?'} d=${rock7 && pl7 ? Math.round(Math.hypot(rock7.pos.x - pl7.pos.x, rock7.pos.z - pl7.pos.z)) : '?'} pSpeed=${pl7 ? Math.round(Math.hypot(pl7.vel.x, pl7.vel.z)) : '?'}`);
  });
  bus.on('tether:latched', (p) => {
    if (state.simTime > 300) return;
    console.log(`  [LCH t=${state.simTime.toFixed(1)}] tgt=${p.targetId}`);
  });
  bus.on('tether:whipImpact', (p) => {
    if (state.simTime > 2400) return;
    console.log(`  [WHIP t=${Math.round(state.simTime)}] tgt=${p.targetId} victim=${p.victimId} rel=${Math.round(p.relSpeed)} rating=${p.rating}`);
  });
  bus.on('scan:completed', (p) => {
    if (state.simTime > 3600) return;
    console.log(`  [SCAN t=${Math.round(state.simTime)}] found=${JSON.stringify(p.found || {})}`);
  });
  bus.on('mining:yield', (p) => {
    if (state.simTime > 3600) return;
    console.log(`  [YIELD t=${Math.round(state.simTime)}] qty=${p.qty} id=${p.commodityId}`);
  });
  bus.on('tether:latchDenied', (p) => {
    if (state.simTime > 400) return;
    console.log(`  [DENIED t=${Math.round(state.simTime)}] ${JSON.stringify(p && typeof p === 'object' ? p : {})}`.slice(0, 200));
  });
  for (const ev of ['tether:latched', 'tether:reel', 'tether:nearBreak', 'tether:broke', 'tether:released', 'tether:cut', 'tether:attached', 'tether:detach']) {
    bus.on(ev, (p) => {
      if (state.simTime > 90) return;
      if (ev === 'tether:latched' || ev === 'tether:cut' || ev === 'tether:broke') {
        const ob2 = state.onboarding || {};
        const r2 = ob2.rescue;
        console.log('    rescue.ids=', JSON.stringify(r2 && r2.ids), 'latchedTarget=', p && p.targetId);
      }
      const slim = p && typeof p === 'object' ? JSON.stringify(Object.fromEntries(Object.entries(p).filter(([, v]) => typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string').slice(0, 6))) : '';
      const pl = state.entities.get(state.playerId);
      console.log(`  [${ev}] t=${state.simTime.toFixed(2)} ${slim} pSpeed=${pl ? Math.round(Math.hypot(pl.vel.x, pl.vel.z)) : '?'}`);
    });
  }
}
const beats = () => {
  const ob = state.onboarding || {};
  const keys = ['tether', 'raid', 'claimed', 'thrust', 'brake', 'marker', 'focus', 'burst', 'disengage', 'seam', 'dock', 'choice'];
  return keys.map((k) => `${k}${ob.beatDoneAt && ob.beatDoneAt[k] != null ? '*' : '.'}`).join(',');
};

let lastLog = 0;
let lastPosLog = 0;
let loopExit = 'completed';
while (state.simTime < targetSimSeconds && iterations < targetSimSeconds * 60 * 3) {
  for (let i = 0; i < 600; i++) {
    pilot.step(SIM_DT, state.tick);
    const acts = state.input.actions;
    if (acts && acts.massline) acts.tetherFire = !!acts.massline.latch;
    sim.step(SIM_DT);
    iterations++;
  }
  if (process.env.STRANGER_TRACE && state.simTime - lastLog >= 15) {
    lastLog = state.simTime;
    const ob = state.onboarding || {};
    const r = ob.rescue || {};
    const res = r.current ? `${r.current}:${r.rockLatched ? 'L' : ''}${r.rockReeled ? 'R' : ''}${r.rockReleasedAfterReel ? 'O' : ''}` : 'none';
    const beatKey = ob.currentBeat != null && ob.currentBeat >= 0 ? ob.currentBeat : -1;
    console.log(`t=${Math.round(state.simTime)} beatIdx=${beatKey} action="${(ob.beatAction || '').slice(0, 44)}" rescue=${res}/${JSON.stringify(Object.fromEntries(Object.entries(r.beats || {}).map(([k, v]) => [k, v.state])))} wp=${state.nav && state.nav.waypoint ? (state.nav.waypoint.label || '?') : 'none'}`);
  }
  if (process.env.STRANGER_TRACE && state.simTime - lastLog >= 6) {
    const acq = state.masslineAcquisition && state.masslineAcquisition.selected;
    const r2 = state.onboarding && state.onboarding.rescue;
    if (r2 && r2.current === 'swing') {
      const rock = r2.ids.rock != null ? state.entities.get(r2.ids.rock) : null;
      const pl = state.entities.get(state.playerId);
      const pl2 = state.entities.get(state.playerId);
      console.log(`  [pos t=${Math.round(state.simTime)}] p=(${Math.round(pl2.pos.x)},${Math.round(pl2.pos.z)}) v=${Math.round(Math.hypot(pl2.vel.x, pl2.vel.z))} wpPos=(${state.nav && state.nav.waypoint ? Math.round(state.nav.waypoint.pos.x) : '?'},${state.nav && state.nav.waypoint ? Math.round(state.nav.waypoint.pos.z) : '?'})`);
      const teth = state.player && state.player.tether;
      const rk = r2.ids.rock != null ? state.entities.get(r2.ids.rock) : null;
      const dl = r2.ids.derelict != null ? state.entities.get(r2.ids.derelict) : null;
      console.log(`  [tow t=${Math.round(state.simTime)}] line=${teth && teth.active ? `on->${teth.targetId}` : 'off'} rk@(${rk ? Math.round(rk.pos.x) : '?'},${rk ? Math.round(rk.pos.z) : '?'})v${rk ? Math.round(Math.hypot(rk.vel.x, rk.vel.z)) : '?'} dl@(${dl ? Math.round(dl.pos.x) : '?'},${dl ? Math.round(dl.pos.z) : '?'})`);
      console.log(`  [acq t=${Math.round(state.simTime)}] sel=${acq ? `${acq.targetType}:${acq.targetId}:${acq.status}${acq.reason ? ':' + acq.reason : ''}` : 'none'} rockId=${r2.ids.rock} rockAlive=${rock && rock.alive !== false} d=${rock && pl ? Math.round(Math.hypot(rock.pos.x - pl.pos.x, rock.pos.z - pl.pos.z)) : '?'} type=${rock && rock.type}`);
    }
  }
  if (process.env.STRANGER_TRACE) {
    const ob3 = state.onboarding || {};
    const r3 = ob3.rescue;
    if (r3 && r3.current === 'grab') {
      const pl3 = state.entities.get(state.playerId);
      const pd = r3.ids.pod != null ? state.entities.get(r3.ids.pod) : null;
      const acq3 = state.masslineAcquisition && state.masslineAcquisition.selected;
      console.log(`  [grab t=${Math.round(state.simTime)}] p@(${Math.round(pl3.pos.x)},${Math.round(pl3.pos.z)})v${Math.round(Math.hypot(pl3.vel.x, pl3.vel.z))} pod@(${pd ? Math.round(pd.pos.x) : '?'},${pd ? Math.round(pd.pos.z) : '?'}) d=${pd ? Math.round(Math.hypot(pd.pos.x - pl3.pos.x, pd.pos.z - pl3.pos.z)) : '?'} acq=${acq3 ? `${acq3.targetType}:${acq3.status}` : 'none'}`);
    }
  }
  if (process.env.STRANGER_TRACE && state.simTime - lastPosLog >= 30) {
    lastPosLog = state.simTime;
    const ob5 = state.onboarding || {};
    const pl5 = state.entities.get(state.playerId);
    const wp5 = state.nav && state.nav.waypoint;
    console.log(`  [nav t=${Math.round(state.simTime)}] beat=${ob5.currentBeat} p@(${Math.round(pl5.pos.x)},${Math.round(pl5.pos.z)})v${Math.round(Math.hypot(pl5.vel.x, pl5.vel.z))} wp=${wp5 ? wp5.label : 'none'}@(${wp5 && wp5.pos ? Math.round(wp5.pos.x) : '?'},${wp5 && wp5.pos ? Math.round(wp5.pos.z) : '?'})`);
  }
  if (process.env.STRANGER_TRACE) {
    const ob4 = state.onboarding || {};
    const rd = ob4.raid;
    if (rd && rd.active) {
      const pl4 = state.entities.get(state.playerId);
      const rr = rd.ids.raider != null ? state.entities.get(rd.ids.raider) : null;
      const teth4 = state.player && state.player.tether;
      console.log(`  [raid t=${Math.round(state.simTime)}] raider@(${rr ? Math.round(rr.pos.x) : '?'},${rr ? Math.round(rr.pos.z) : '?'})v${rr ? Math.round(Math.hypot(rr.vel.x, rr.vel.z)) : '?'} alive=${rr && rr.alive !== false} hull=${rr ? Math.round(rr.hull || 0) : '?'} p@(${Math.round(pl4.pos.x)},${Math.round(pl4.pos.z)})v${Math.round(Math.hypot(pl4.vel.x, pl4.vel.z))} line=${teth4 && teth4.active ? `on->${teth4.targetId}` : 'off'} done=${!!ob4.beatDoneAt.raid}`);
    }
  }
  if (process.env.STRANGER_TRACE) {
    const ob8 = state.onboarding || {};
    const t8 = ob8.missingThree;
    if (t8 && t8.active) {
      const wp8 = state.nav && state.nav.waypoint;
      console.log(`  [three t=${Math.round(state.simTime)}] cur=${t8.current} boost=${t8.beats.boost.state} stroke=${t8.beats.stroke.state} well=${t8.beats.well.state} seamDone=${!!(ob8.beatDoneAt && ob8.beatDoneAt.seam)} beat=${ob8.currentBeat} wp=${wp8 ? wp8.label : 'none'}`);
    }
  }
  if (process.env.STRANGER_TRACE) {
    const ob9 = state.onboarding || {};
    const beat9 = ob9.currentBeat >= 0 ? ob9.currentBeat : -1;
    const line9 = ob9.beatAction || '';
    if (/scanner|seams/i.test(line9) || /Beam/i.test(line9)) {
      const pl9 = state.entities.get(state.playerId);
      const wp9 = state.nav && state.nav.waypoint;
      const rock9 = ob9._miningRockId != null ? state.entities.get(ob9._miningRockId) : null;
      console.log(`  [seam9 t=${Math.round(state.simTime)}] beat=${beat9} act='${line9.slice(0, 30)}' wp=${wp9 ? wp9.label : 'none'} d=${wp9 && pl9 ? Math.round(Math.hypot(wp9.pos.x - pl9.pos.x, wp9.pos.z - pl9.pos.z)) : '?'} rock=${rock9 ? 'live' : 'none'} docked=${!!(state.ui && state.ui.docked)} mode=${state.mode} pulse=${!!(state.input.actions && state.input.actions.scanPulse)} ore=${ob9.oreCollected}`);
    }
  }
  if (process.env.STRANGER_TRACE) {
    const obA = state.onboarding || {};
    const plA = state.entities.get(state.playerId);
    const trA = obA._trainerId != null ? state.entities.get(obA._trainerId) : null;
    const bD = obA.beatDoneAt || {};
    console.log(`  [st t=${Math.round(state.simTime)}] beat=${obA.currentBeat} act='${(obA.beatAction || '').slice(0, 26)}' trainer=${trA ? 'live' : (obA._trainerId != null ? 'dead' : 'null')} raid=${bD.raid != null} claimed=${bD.claimed != null} dis=${bD.disengage != null} seam=${bD.seam != null} v=${plA ? Math.round(Math.hypot(plA.vel.x, plA.vel.z)) : '?'}`);
  }
  if (state.simTime - lastLog >= 60) {
    lastLog = state.simTime;
    const p = state.entities.get(state.playerId);
    console.log(`t=${Math.round(state.simTime)}s beats[${beats()}] heat=${(heat0(state)).toFixed(2)} hull=${p ? Math.round(p.hull || 0) : '?'} credits=${state.player.credits} milestones=${JSON.stringify(milestones)}`);
  }
}
function heat0(s) { return s.player && Number.isFinite(s.player.heat) ? s.player.heat : 0; }

const result = ledger.finish();
const hour1Decisions = result.decisions.filter((d) => d.hour === 0).length;
const firstsS = Object.fromEntries(Object.entries(result.firsts)
  .filter(([, v]) => v != null).map(([k, v]) => [k, Math.round(v / 60)]));
if (state.simTime < targetSimSeconds) loopExit = `iteration cap at simTime=${Math.round(state.simTime)} (docking freeze?)`;
console.log('loopExit:', loopExit);
console.log('=== STRANGER METRICS ===');
console.log('frozeOut:', result.runMetadata && result.runMetadata.frozeOut, '| notes:', JSON.stringify((result.notes || []).slice(-4)));
console.log('seed:', seed, 'simHours:', result.hours);
console.log('firsts (s):', JSON.stringify(firstsS));
console.log('milestones (s):', JSON.stringify(milestones));
console.log('decisions hour1:', hour1Decisions);
console.log('deaths:', result.deaths.length);
console.log('totals:', JSON.stringify(result.totals).slice(0, 400));
sim.dispose();
