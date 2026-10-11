// THE WORLD ANSWERS — T8: a named ace answers a ram player with a ram pass (build_map §15.5).
// Third ram-style kill (ACE_STYLE_ESCALATE_AT) -> the returning ace carries the ram-plate kit and
// ONE telegraphed head-on pass: bark, one beat, then aiPorts authorizes the ram for a window on a
// MEDIUM hull. Below the threshold nothing changes. Fixed seeds 4242 / 8008. Headless.
import assert from 'node:assert/strict';
import test from 'node:test';

import { ManeuverKind } from '../src/ai/contracts.js';
import { ManeuverPlanner } from '../src/ai/maneuver.js';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import {
  ACE_RAM_PASS_TELEGRAPH_BARK,
  ACE_RAM_PASS_TELEGRAPH_TICKS,
  ACE_RAM_PASS_WINDOW_TICKS,
  ACE_STYLE_ESCALATE_AT,
  aceKillStyleFromHints,
  styleEscalationBark,
  styleLoadoutForAce,
} from '../src/data/namedAces.js';
import { aceMemory } from '../src/systems/aceMemory.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';

const ACE_ID = 'ace_yara_no_cut';
const ACE_NAME = 'Yara No-Cut';

function boot(seed = 4242) {
  const sim = createSimulation({ seed, systems: [spawnBudget, aceMemory, aiPorts] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_sker_haven';
  state.playerId = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, hull: 200, hullMax: 200, radius: 10,
  }).id;
  const voices = [];
  const system = sim.registry.get('aceMemory');
  system.helpers = { ...system.helpers, voice: { say(payload) { voices.push(payload); return true; } } };
  return { sim, state, bus, voices };
}

function killStyle(bus, state, style, n, cause = 'ship_collision', startId = 300) {
  for (let i = 0; i < n; i += 1) {
    bus.emit('entity:killed', {
      id: startId + i, killerId: state.playerId, type: 'ship', factionId: 'faction_reach',
      killStyle: style, presentation: { playerCaused: true, cause },
    });
  }
}

function returnAce(sim) {
  const { state, bus } = sim;
  let returned = null;
  const off = bus.on('aceMemory:returnSpawned', (payload) => { returned = payload; });
  bus.emit('namedAce:fled', { aceId: ACE_ID, sectorId: state.world.currentSectorId });
  const rec = state.aceMemory[ACE_ID];
  assert.ok(rec && Number.isFinite(rec.returnAt), 'flee must schedule a return');
  state.simTime = rec.returnAt;
  sim.runTicks(Math.ceil(0.55 / SIM_DT));
  if (typeof off === 'function') off();
  return returned;
}

function bossOf(sim, returned) {
  const id = returned && Array.isArray(returned.spawnedIds) ? returned.spawnedIds[0] : null;
  return id != null ? sim.state.entities.get(id) : null;
}

function selfFrame(sim, boss) {
  const ports = sim.registry.get('aiPorts');
  const frame = ports.helpers.aiSensors.liveFrameFor(boss.id, sim.state.tick);
  return frame && frame.self;
}

/** Park the ace in the player's face on an attack run so the sensor frame reads a live pass. */
function commitAttackRun(sim, boss, distance = 400) {
  const player = sim.state.entities.get(sim.state.playerId);
  boss.pos.x = player.pos.x + distance;
  boss.pos.z = player.pos.z;
  boss.data.ai.activity = { kind: 'attack_run', reason: 'ace_return', targetId: player.id };
  boss.data.ai.engagementTrigger = 'ace_return';
  boss.data.ai.approachTelegraph = 'ace_return';
}

test('T8 a ram player\'s kills are read as ram style, and the threshold is the existing pattern', () => {
  assert.equal(ACE_STYLE_ESCALATE_AT, 3);
  assert.equal(aceKillStyleFromHints({ trickId: 'slingshot_golf' }), 'ram');
  assert.equal(aceKillStyleFromHints({ cause: 'ship_collision' }), 'ram');
  assert.equal(aceKillStyleFromHints({ cause: 'ship_collision', flung: true }), 'fling', 'a flung hull is still a fling kill');
  assert.equal(aceKillStyleFromHints({ cause: 'terrain_collision' }), 'rock');
  assert.equal(aceKillStyleFromHints({}), 'gun');
  const loadout = styleLoadoutForAce({ returnArchetype: 'corsair_raider', escortArchetype: 'wasp_swarmer' }, 'ram');
  assert.equal(loadout.gimmickTag, 'ram-plate');
  assert.ok(loadout.capabilities.includes('ram_pass'));
  assert.match(styleEscalationBark({ name: ACE_NAME }, 'ram'), /^Yara No-Cut: three times you rode your mass/);
});

test('T8 third ram-kill: the returning ace carries ram-plate, a telegraph bark, then a medium-hull ram authorization', () => {
  const { sim, state, bus, voices } = boot(4242);
  killStyle(bus, state, 'ram', ACE_STYLE_ESCALATE_AT);
  assert.equal(state.aceMemory.playerStyle.counts.ram, 3);
  assert.equal(state.aceMemory[ACE_ID].escalatedStyle, 'ram');

  const returned = returnAce(sim);
  const boss = bossOf(sim, returned);
  assert.ok(boss, 'the ace returns');
  assert.equal(boss.data.styleKit.style, 'ram');
  assert.equal(boss.data.gimmickTag, 'ram-plate');
  assert.equal(boss.data.aceMemory.gimmickTag, 'ram-plate');
  assert.deepEqual(boss.data.acePass, { kind: 'ram_pass', state: 'armed' });
  assert.ok(boss.mass >= 40 && boss.mass < 140, `a MEDIUM hull (${boss.mass}) — the heavy band is not what authorizes this`);
  const escort = state.entities.get(returned.spawnedIds[1]);
  assert.equal(escort && escort.data.acePass, undefined, 'escorts do not get the pass');
  assert.ok(voices.some((v) => v.text === styleEscalationBark({ name: ACE_NAME }, 'ram')), 'the return bark names the ram habit');

  // Far from the player and before the call: no authorization, no telegraph.
  commitAttackRun(sim, boss, 3000);
  sim.runTicks(40);
  assert.equal(boss.data.acePass.state, 'armed');
  assert.equal(selfFrame(sim, boss).ramAuthorized, false);
  assert.equal(voices.some((v) => v.text.includes(ACE_RAM_PASS_TELEGRAPH_BARK)), false);

  // The player comes inside the ace's trigger range: the call goes out first...
  commitAttackRun(sim, boss, 400);
  const before = voices.length;
  let telegraphTick = -1;
  for (let i = 0; i < 60 && boss.data.acePass.state === 'armed'; i += 1) sim.runTicks(1);
  assert.equal(boss.data.acePass.state, 'telegraphed');
  telegraphTick = boss.data.acePass.telegraphTick;
  const call = voices.slice(before).filter((v) => v.text === `${ACE_NAME}: ${ACE_RAM_PASS_TELEGRAPH_BARK}`);
  assert.equal(call.length, 1, 'exactly one telegraph bark');
  assert.equal(call[0].channel, 'bark');
  assert.equal(boss.data.acePass.authorizedAtTick, telegraphTick + ACE_RAM_PASS_TELEGRAPH_TICKS);
  assert.equal(boss.data.acePass.untilTick, boss.data.acePass.authorizedAtTick + ACE_RAM_PASS_WINDOW_TICKS);
  assert.equal(selfFrame(sim, boss).ramAuthorized, false, 'one beat BEFORE the authorization, not on the bark');

  // ...one beat later the head-on pass opens, on a medium hull...
  state.tick = boss.data.acePass.authorizedAtTick;
  const open = selfFrame(sim, boss);
  assert.equal(open.ramAuthorized, true, 'ram authorized on a medium ace carrying ram-plate');
  assert.equal(open.operationalMassBand, 'medium');
  state.tick = boss.data.acePass.untilTick;
  assert.equal(selfFrame(sim, boss).ramAuthorized, true, 'through the last tick of the window');

  // ...and closes on its own: one pass per return.
  state.tick = boss.data.acePass.untilTick + 1;
  assert.equal(selfFrame(sim, boss).ramAuthorized, false);
  sim.runTicks(120);
  assert.equal(voices.filter((v) => v.text.includes(ACE_RAM_PASS_TELEGRAPH_BARK)).length, 1, 'never a second call');
  console.log(`T8 seed=4242 boss=${boss.data.lootTableId} mass=${boss.mass} telegraph@${telegraphTick} open@${boss.data.acePass.authorizedAtTick} close@${boss.data.acePass.untilTick}`);
});

test('T8 an authorized pass flies HEAD-ON at the player; an unauthorized medium hull still takes the crossing lane', () => {
  const head = (ramAuthorized) => {
    const planner = new ManeuverPlanner({ seed: 4242, config: { inputSlewPerTick: 1,
      emergencyInputSlewPerTick: 1, torqueSlewPerTick: 1, emergencyTorqueSlewPerTick: 1 } });
    const target = { id: 1, kind: 'ship', pos: { x: 400, z: 0 }, vel: { x: 0, z: 0 },
      radius: 10, tags: [], confidence: 1, operationalMassBand: 'medium' };
    const perception = { tick: 1, self: { id: 2, team: 1, pos: { x: 0, z: 0 }, vel: { x: 60, z: 0 },
      rot: 0, radius: 18, energyFraction: 1, heatFraction: 0, operationalMassBand: 'medium', ramAuthorized,
      activity: { kind: 'attack_run', reason: 'ace_return' } }, contacts: [target] };
    const maneuver = { kind: ManeuverKind.INTERCEPT, targetId: 1, lateralSign: 1, ramAuthorized,
      formationSlot: { x: 400, z: 0 }, formationBound: 170, breakFormation: true };
    const directive = { squadId: 'run', formation: { slot: { x: 400, z: 0 }, bound: 170, breakFormation: true } };
    return planner.plan({ entityId: 2, tick: 1, perception, behavior: { maneuver }, directive }).targetHeading;
  };
  assert.equal(head(true), 0, 'the pass points straight at the player');
  assert.ok(Math.abs(head(false)) > 0.2, 'without the pass the brawler crosses the lane instead of ramming');
});

test('T8 below the threshold the ace is not authorized a ram pass, whatever the player does', () => {
  const { sim, state, bus, voices } = boot(8008);
  killStyle(bus, state, 'ram', ACE_STYLE_ESCALATE_AT - 1);
  assert.equal(state.aceMemory.playerStyle.counts.ram, 2);
  assert.equal(state.aceMemory[ACE_ID] && state.aceMemory[ACE_ID].escalatedStyle || null, null);

  const returned = returnAce(sim);
  const boss = bossOf(sim, returned);
  assert.ok(boss, 'the ace still returns');
  assert.equal(boss.data.acePass, undefined, 'no pass without the habit');
  assert.equal(boss.data.styleKit, undefined);
  assert.notEqual(boss.data.gimmickTag, 'ram-plate');
  commitAttackRun(sim, boss, 300);
  sim.runTicks(180);
  assert.equal(selfFrame(sim, boss).ramAuthorized, false);
  assert.equal(voices.some((v) => v.text.includes(ACE_RAM_PASS_TELEGRAPH_BARK)), false);
});

test('T8 other habits keep their counters: a fling or gun player never earns the ram pass', () => {
  for (const [style, cause] of [['fling', 'generic'], ['gun', 'generic']]) {
    const { sim, state, bus } = boot(4242);
    killStyle(bus, state, style, ACE_STYLE_ESCALATE_AT, cause);
    const boss = bossOf(sim, returnAce(sim));
    assert.ok(boss);
    assert.equal(boss.data.styleKit.style, style);
    assert.equal(boss.data.acePass, undefined);
    commitAttackRun(sim, boss, 300);
    sim.runTicks(120);
    assert.equal(selfFrame(sim, boss).ramAuthorized, false, `${style} habit: no ram authorization on a medium hull`);
  }
});

test('T8 the ram style is lazy in the ledger: no ram kills, no ram key', () => {
  const { state, bus } = boot(4242);
  killStyle(bus, state, 'gun', 1, 'generic');
  assert.deepEqual(Object.keys(state.aceMemory.playerStyle.counts).sort(), ['fling', 'gun', 'rock']);
  killStyle(bus, state, 'ram', 1);
  assert.equal(state.aceMemory.playerStyle.counts.ram, 1);
});
