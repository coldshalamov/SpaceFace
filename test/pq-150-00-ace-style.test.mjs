// PQ-150.00 — third same-style kill changes the ace's next loadout; bark names the act.
// Kit and behaviour, never a +HP bump. Fixed seed. Headless.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import {
  ACE_STYLE_ESCALATE_AT,
  aceKillStyleFromHints,
  returnCrewForAce,
  styleEscalationBark,
  styleLoadoutForAce,
} from '../src/data/namedAces.js';
import { aceMemory } from '../src/systems/aceMemory.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';

const SEED = 15000;
const ACE_ID = 'ace_yara_no_cut';
const ACE_NAME = 'Yara No-Cut';

function boot(seed = SEED) {
  const sim = createSimulation({
    seed,
    systems: [spawnBudget, aceMemory, aiPorts],
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_sker_haven';
  state.playerId = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, hull: 200, hullMax: 200, radius: 10,
  }).id;
  const voices = [];
  const system = sim.registry.get('aceMemory');
  system.helpers = {
    ...system.helpers,
    voice: {
      say(payload) {
        voices.push(payload);
        return true;
      },
    },
  };
  return { sim, state, bus, voices };
}

function killStyle(bus, state, style, n, startId = 200) {
  for (let i = 0; i < n; i += 1) {
    bus.emit('entity:killed', {
      id: startId + i,
      killerId: state.playerId,
      type: 'ship',
      factionId: 'faction_reach',
      killStyle: style,
      presentation: { playerCaused: true, cause: style === 'rock' ? 'terrain_collision' : 'generic' },
    });
  }
}

function returnAce(sim, aceId = ACE_ID) {
  const { state, bus } = sim;
  let returned = null;
  const off = bus.on('aceMemory:returnSpawned', (payload) => { returned = payload; });
  bus.emit('namedAce:fled', { aceId, sectorId: state.world.currentSectorId });
  const rec = state.aceMemory[aceId];
  assert.ok(rec && Number.isFinite(rec.returnAt), 'flee must schedule a return');
  state.simTime = rec.returnAt;
  sim.runTicks(Math.ceil(0.55 / SIM_DT));
  if (typeof off === 'function') off();
  return returned;
}

function bossOf(sim, returned) {
  const bossId = returned && Array.isArray(returned.spawnedIds) ? returned.spawnedIds[0] : null;
  return bossId != null ? sim.state.entities.get(bossId) : null;
}

test('PQ-150.00 third fling-kill swaps Yara onto line-cutters and a sink, and names the fling', () => {
  assert.equal(ACE_STYLE_ESCALATE_AT, 3);

  const beforeCrew = returnCrewForAce({ id: ACE_ID, returnArchetype: 'corsair_raider', escortArchetype: 'wasp_swarmer' }, 1);
  assert.equal(beforeCrew[0].archetype, 'corsair_raider');

  const { sim, state, bus, voices } = boot();
  const baseline = returnAce(sim);
  const baselineBoss = bossOf(sim, baseline);
  assert.ok(baselineBoss, 'unescalated return must spawn');
  assert.equal(baselineBoss.data.lootTableId, 'corsair_raider');
  assert.equal(baselineBoss.data.aceMemory && baselineBoss.data.aceMemory.style, null);
  const baselineHull = baselineBoss.hullMax;
  const baselineBark = voices.map((v) => v.text).join('\n');
  assert.equal(baselineBark.includes('flung our hulls'), false, 'style bark must not fire before the third kill');

  const after = boot();
  killStyle(after.bus, after.state, 'fling', 3);
  assert.equal(after.state.aceMemory.playerStyle.factions.faction_reach.fling, 3);
  assert.equal(after.state.aceMemory.playerStyle.factions.faction_reach.escalated, 'fling');
  assert.equal(after.state.aceMemory[ACE_ID].escalatedStyle, 'fling');

  const returned = returnAce(after.sim);
  const boss = bossOf(after.sim, returned);
  assert.ok(boss, 'escalated return must spawn');
  assert.equal(boss.data.lootTableId, 'tether_control_raider');
  assert.equal(boss.data.styleKit && boss.data.styleKit.style, 'fling');
  assert.equal(boss.data.aceMemory.style, 'fling');
  assert.equal(boss.data.aceMemory.gimmickTag, 'tether-cutter');
  assert.ok(
    Array.isArray(boss.data.ai && boss.data.ai.capabilities)
      && boss.data.ai.capabilities.includes('counter_tether_cut'),
    'fling counter must bring line-cut behaviour',
  );
  assert.deepEqual(boss.data.styleWeapons, ['wpn_momentum_sink_s']);
  assert.ok(
    Array.isArray(boss.data.weapons)
      && boss.data.weapons.some((weapon) => weapon && weapon.defId === 'wpn_momentum_sink_s'),
    'the sink must be on the hull, not a loadout stamp',
  );

  const escortId = returned.spawnedIds[1];
  const escort = escortId != null ? after.state.entities.get(escortId) : null;
  assert.ok(escort, 'escalated return must bring a sink escort');
  assert.equal(escort.data.lootTableId, 'field_anchor_controller');

  const bark = styleEscalationBark({ name: ACE_NAME }, 'fling');
  assert.equal(bark, 'Yara No-Cut: three times you flung our hulls. We brought line-cutters.');
  assert.ok(
    after.voices.some((v) => v.text === bark),
    `return bark must name the fling; heard ${JSON.stringify(after.voices.map((v) => v.text))}`,
  );
  assert.notEqual(boss.hullMax, baselineHull, 'kit change must not be a silent +HP bump on the same hull');
  assert.notEqual(boss.data.lootTableId, 'corsair_raider');

  console.log(`PQ-150.00 seed=${SEED} third-fling loadout=${boss.data.lootTableId} escort=${escort.data.lootTableId} hull ${baselineHull}->${boss.hullMax} bark=${JSON.stringify(bark)}`);
});

test('PQ-150.00 gun and rock counters are deterministic kit swaps on the same seed', () => {
  const gun = boot(SEED);
  killStyle(gun.bus, gun.state, 'gun', 3);
  const gunReturn = returnAce(gun.sim);
  const gunBoss = bossOf(gun.sim, gunReturn);
  assert.equal(gunBoss.data.lootTableId, 'bruiser_brawler');
  assert.equal(gunBoss.data.styleKit.style, 'gun');
  const gunBark = styleEscalationBark({ name: ACE_NAME }, 'gun');
  assert.equal(gunBark, 'Yara No-Cut: you gunned three of ours. We came in armour.');
  assert.ok(gun.voices.some((v) => v.text === gunBark));

  const gunAgain = boot(SEED);
  killStyle(gunAgain.bus, gunAgain.state, 'gun', 3);
  const gunBoss2 = bossOf(gunAgain.sim, returnAce(gunAgain.sim));
  assert.equal(gunBoss2.data.lootTableId, gunBoss.data.lootTableId);
  assert.equal(gunBoss2.hullMax, gunBoss.hullMax);

  const rock = boot(SEED);
  killStyle(rock.bus, rock.state, 'rock', 3);
  const rockBoss = bossOf(rock.sim, returnAce(rock.sim));
  assert.equal(rockBoss.data.lootTableId, 'lancer_sniper');
  assert.equal(rockBoss.data.styleKit.style, 'rock');
  assert.equal(rockBoss.data.ai.combatDoctrineId, 'ranged_disengager');
  const rockBark = styleEscalationBark({ name: ACE_NAME }, 'rock');
  assert.equal(rockBark, 'Yara No-Cut: three times you threw us into the rocks. We stay off the stones.');
  assert.ok(rock.voices.some((v) => v.text === rockBark));

  console.log(`PQ-150.00 seed=${SEED} gun=${gunBoss.data.lootTableId} rock=${rockBoss.data.lootTableId}`);
});

test('PQ-150.00 ace memory reads stunt grammar: fling tricks and terrain are not gun kills', () => {
  assert.equal(aceKillStyleFromHints({ trickId: 'tow_kill' }), 'fling');
  assert.equal(aceKillStyleFromHints({ trickId: 'rock_discovery' }), 'rock');
  assert.equal(aceKillStyleFromHints({ cause: 'terrain_collision' }), 'rock');
  assert.equal(aceKillStyleFromHints({ flung: true }), 'fling');
  assert.equal(aceKillStyleFromHints({}), 'gun');

  const { sim, state, bus } = boot();
  state.stunts = { recentTricks: [{ trickId: 'wrecking_ball', targetId: 77 }] };
  bus.emit('entity:killed', {
    id: 77,
    killerId: state.playerId,
    type: 'ship',
    factionId: 'faction_reach',
    presentation: { playerCaused: true, cause: 'generic' },
  });
  assert.equal(state.aceMemory.playerStyle.counts.fling, 1);
  assert.equal(state.aceMemory.playerStyle.counts.gun, 0);

  const loadout = styleLoadoutForAce({ returnArchetype: 'corsair_raider', escortArchetype: 'wasp_swarmer' }, 'fling');
  assert.equal(loadout.bossArchetype, 'tether_control_raider');
  assert.equal(loadout.escortArchetype, 'field_anchor_controller');
});
