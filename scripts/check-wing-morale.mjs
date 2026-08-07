#!/usr/bin/env node
// BP-02.1/C12 Wing Morale contract.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { createSimulation } from '../src/core/sim.js';
import {
  PRODUCTION_INIT_ORDER,
  PRODUCTION_UPDATE_ORDER,
} from '../src/runtime/authoritativeSystemManifest.js';
import { wingMorale, wingMoraleState } from '../src/systems/wingMorale.js';

assert.equal(typeof window, 'undefined', 'this check must run headless');
assert.ok(existsSync(new URL('../src/systems/wingMorale.js', import.meta.url)),
  'src/systems/wingMorale.js exists');

let sections = 0;
function ok(label) {
  sections++;
  console.log(`  PASS ${label}`);
}

function guarded(fn) {
  const random = Math.random;
  const now = Date.now;
  Math.random = () => { throw new Error('Math.random in wing morale path'); };
  Date.now = () => { throw new Error('Date.now in wing morale path'); };
  try { return fn(); } finally { Math.random = random; Date.now = now; }
}

guarded(testLeaderKillScattersSurvivorsAndSpeaksOnce);
guarded(testFallbackLeaderUsesHighestMass);
guarded(testEscortDeathEnragesWard);
guarded(testCommsDisableBlocksReinforcement);
testPackageAndRegistryWiring();

console.log(`[check-wing-morale] PASS - ${sections} sections green`);

function boot(seed = 812) {
  const voices = [];
  const sim = createSimulation({
    seed,
    helpers: {
      voice: {
        say(payload) {
          voices.push(payload);
          return true;
        },
      },
    },
    systems: [wingMorale],
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_pallas_drift';
  const player = sim.spawn({
    type: 'ship',
    team: 0,
    pos: { x: 0, z: 0 },
    hull: 220,
    hullMax: 220,
    mass: 120,
    radius: 10,
    data: { defId: 'ship_kestrel' },
  });
  state.playerId = player.id;
  const log = { flees: [], broken: [], formation: [], enraged: [], blocked: [], toasts: [], voices };
  bus.on('ai:flee', (payload) => log.flees.push(payload));
  bus.on('wingMorale:broken', (payload) => log.broken.push(payload));
  bus.on('ai:formationBroken', (payload) => log.formation.push(payload));
  bus.on('wingMorale:enraged', (payload) => log.enraged.push(payload));
  bus.on('wingMorale:reinforcementBlocked', (payload) => log.blocked.push(payload));
  bus.on('toast', (payload) => log.toasts.push(payload));
  return { sim, state, bus, player, log };
}

function spawnSquad(t, squadId = 'wm_alpha', options = {}) {
  const leaderMass = options.leaderMass || 80;
  const leader = t.sim.spawn({
    type: 'ship',
    team: 1,
    mass: leaderMass,
    pos: { x: 200, z: 0 },
    hull: 80,
    hullMax: 80,
    radius: 8,
    data: {
      name: 'Wing Lead',
      intent: { fire: true },
      reinforcements: { type: 'wasp_swarmer', count: [1, 2], hullThreshold: 0.5 },
      ai: { squadId, preferredRole: options.explicitLeader === false ? null : 'leader', archetype: 'pirate' },
    },
  });
  const left = t.sim.spawn({
    type: 'ship',
    team: 1,
    mass: options.leftMass || 40,
    pos: { x: 160, z: 80 },
    hull: 70,
    hullMax: 70,
    radius: 8,
    data: {
      name: 'Left Wing',
      intent: { fire: true },
      reinforcements: { type: 'wasp_swarmer', count: [1, 2], hullThreshold: 0.5 },
      ai: { squadId, preferredRole: options.leftRole || 'screen', archetype: 'pirate' },
    },
  });
  const right = t.sim.spawn({
    type: 'ship',
    team: 1,
    mass: options.rightMass || 45,
    pos: { x: 240, z: -80 },
    hull: 70,
    hullMax: 70,
    radius: 8,
    data: {
      name: 'Right Wing',
      intent: { fire: true },
      reinforcements: { type: 'wasp_swarmer', count: [1, 2], hullThreshold: 0.5 },
      ai: { squadId, preferredRole: options.rightRole || 'support', archetype: 'pirate' },
    },
  });
  return { leader, left, right };
}

function kill(t, entity, overrides = {}) {
  entity.alive = false;
  t.bus.emit('entity:killed', {
    id: entity.id,
    killerId: overrides.killerId == null ? t.state.playerId : overrides.killerId,
    type: entity.type,
    pos: { x: entity.pos.x, z: entity.pos.z },
    victimClass: overrides.victimClass || 'raider',
  });
}

function testLeaderKillScattersSurvivorsAndSpeaksOnce() {
  const t = boot();
  const { leader, left, right } = spawnSquad(t);
  kill(t, leader);
  assert.equal(t.log.formation.length, 1, 'leader kill emits one formation-broken event');
  assert.equal(t.log.broken.length, 1, 'leader kill emits one wing-morale receipt');
  assert.equal(t.log.flees.length, 2, 'both surviving wingmates emit ai:flee');
  for (const survivor of [left, right]) {
    assert.equal(survivor.data.ai.forceFlee, true, 'survivor gets forceFlee');
    assert.equal(survivor.data.ai.fsm, 'flee', 'survivor fsm is flee for readers');
    assert.equal(survivor.data.morale, 'scattered', 'survivor morale reads scattered');
    assert.equal(survivor.data.intent.fire, false, 'survivor fire intent is cleared');
    assert.equal(survivor.data.intent.boost, true, 'survivor boosts away');
  }
  assert.equal(t.log.voices.length, 1, 'one voice cue routed through voiceArbiter helper');
  assert.equal(t.log.voices[0].text, 'SQUAD BROKEN', 'voice cue is the specified squad-broken line');

  t.sim.runTicks(400);
  assert.equal(left.data.ai.forceFlee, undefined, 'scatter clears forceFlee after morale window');
  assert.equal(left.data.morale, undefined, 'scatter morale clears after morale window');
  assert.equal(wingMoraleState(t.state).scatter[left.id], undefined, 'state scatter receipt clears');
  ok('leader kill scatters survivors and speaks once');
}

function testFallbackLeaderUsesHighestMass() {
  const t = boot(813);
  const { leader, left, right } = spawnSquad(t, 'wm_beta', {
    explicitLeader: false,
    leaderMass: 35,
    leftMass: 120,
    rightMass: 40,
    leftRole: null,
    rightRole: null,
  });
  kill(t, leader);
  assert.equal(t.log.broken.length, 0, 'lower-mass non-explicit leader does not break squad');
  kill(t, left);
  assert.equal(t.log.broken.length, 1, 'highest-mass member is fallback leader');
  assert.equal(right.data.ai.forceFlee, true, 'remaining squadmate flees after fallback leader dies');
  ok('fallback leader is highest mass when no explicit leader exists');
}

function testEscortDeathEnragesWard() {
  const t = boot(814);
  const ward = t.sim.spawn({
    type: 'ship',
    team: 1,
    mass: 160,
    pos: { x: 280, z: 0 },
    hull: 180,
    hullMax: 180,
    radius: 12,
    data: { name: 'Ward', ai: { squadId: 'wm_guard', preferredRole: 'boss' } },
  });
  const escort = t.sim.spawn({
    type: 'ship',
    team: 1,
    mass: 45,
    pos: { x: 230, z: 60 },
    hull: 60,
    hullMax: 60,
    radius: 8,
    data: {
      name: 'Escort',
      ai: { squadId: 'wm_guard', preferredRole: 'escort', wardId: ward.id },
    },
  });
  kill(t, escort);
  assert.equal(t.log.enraged.length, 1, 'escort death emits one enraged receipt');
  assert.equal(ward.data.morale, 'enraged', 'ward morale marks enraged');
  assert.equal(ward.data.ai.enraged, true, 'ward AI flag marks enraged');
  assert.equal(ward.data.ai.focusTargetId, t.state.playerId, 'ward focuses the killer');
  ok('escort death marks the protected ward enraged');
}

function testCommsDisableBlocksReinforcement() {
  const t = boot(815);
  const { leader, left, right } = spawnSquad(t, 'wm_comms');
  t.bus.emit('combat:subsystemDisabled', { targetId: left.id, subsystemId: 'subsystem_sensor' });
  assert.equal(t.log.blocked.length, 1, 'comms/sensor disable emits reinforcement-blocked receipt');
  for (const member of [leader, left, right]) {
    assert.equal(member.data.ai.reinforcementBlocked, true, 'squad member marks reinforcement blocked');
    assert.equal(member.data.reinforcements, null, 'legacy reinforcement config is nulled');
  }
  assert.equal(t.log.toasts.length, 0, 'blocking reinforcement emits no reinforcement toast');
  assert.ok(wingMoraleState(t.state).blockedSquads.wm_comms, 'blocked squad is recorded in state');
  ok('comms disable blocks the squad reinforcement path without a toast');
}

function testPackageAndRegistryWiring() {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.scripts['check:wing-morale'], 'node scripts/check-wing-morale.mjs',
    'package exposes check:wing-morale');

  const registry = readFileSync(new URL('../src/core/registry.js', import.meta.url), 'utf8');
  assert.match(registry, /import \{ wingMorale \} from '\.\.\/systems\/wingMorale\.js';/,
    'registry imports wingMorale');
  const initIndex = PRODUCTION_INIT_ORDER.indexOf('wingMorale');
  const updateIndex = PRODUCTION_UPDATE_ORDER.indexOf('wingMorale');
  assert.equal(PRODUCTION_INIT_ORDER[initIndex - 1], 'titles',
    'wingMorale initializes after the title aura authority');
  assert.equal(PRODUCTION_UPDATE_ORDER[updateIndex - 1], 'titles',
    'wingMorale updates after the title aura authority');
  assert.equal(PRODUCTION_UPDATE_ORDER[updateIndex + 1], 'tetherGameplay',
    'wingMorale remains before later gameplay readers');

  const source = readFileSync(new URL('../src/systems/wingMorale.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /Math\.random|Date\.now|performance\.now|setTimeout|setInterval/,
    'wingMorale path uses no RNG, wall-clock time, or timers');
  assert.doesNotMatch(source, /grantCredits|chargeCredits|addCargo|removeCargo|applyRep/,
    'wingMorale does not directly write economy, cargo, or reputation');
  ok('package, registry, determinism, and single-writer guards are pinned');
}
