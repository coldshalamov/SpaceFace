// PQ-146 supersedes forced kit ranking: tools are neutral, earned physical acts add style.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { runSession } from '../src/systems/runSession.js';
import { survivalRewards, estimateBoardScore } from '../src/systems/survivalRewards.js';
import { createComboState, recordTrick, bankActive } from '../src/systems/stuntCombo.js';
function boot() {
  const state = createGameState(17402); const bus = createBus(); const drops = [];
  state.playerId = 0;
  runSession.init({ state, bus }); survivalRewards.init({ state, bus });
  bus.on('loot:drop', p => drops.push(p));
  bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'swarm', seed: 17402, arenaId: 'helios_core' });
  let phase = 'loadout';
  for (const nextPhase of ['arena_intro', 'wave_intro', 'active']) {
    bus.emit('run:transitionRequested', { expectedPhase: phase, nextPhase }); phase = nextPhase;
  }
  state.stunts.combo = createComboState();
  bus.emit('run:wavePlanned', { wave: 1, plan: { rewards: { credits: 12, xp: 10 } } });
  let nextId = 1;
  return { state, bus, drops, kill({ weaponId = 'wpn_pulse_laser_s', playerOwned = true, threatClass = 'fodder' } = {}) {
    const victim = { id: nextId++, alive: true, type: 'ship', pos: { x: 40, z: 0 }, data: { runCohort: 'survival', runWave: 1, threatClass } };
    state.entities.set(victim.id, victim); bus.emit('entity:spawned', { entity: victim }); victim.alive = false;
    const receipt = { id: victim.id, killerId: playerOwned ? 0 : 999, tick: state.tick, weaponId };
    bus.emit('entity:killed', receipt); bus.emit('combat:kill', receipt);
    return victim;
  }, close() { survivalRewards.destroy(); runSession.destroy(); } };
}
test('live kill producers pay every gun and player-owned collision the same immutable threat base', () => {
  const h = boot();
  try {
    for (const weaponId of ['wpn_pulse_laser_s', 'wpn_autocannon_m', 'wpn_concussion_cannon_m', null, 'future_tool']) h.kill({ weaponId });
    assert.equal(h.state.run.score, 500); assert.equal(h.state.run.credits, 0);
    assert.equal(h.drops.length, 5); assert.ok(h.drops.every(p => p.items[0].credits === 10));
    h.bus.emit('run:waveCleared', { wave: 1 });
    assert.equal(h.state.run.credits, 50); assert.equal(h.state.run.score, 500, 'clearing grants no unrelated score');
    h.bus.emit('run:waveCleared', { wave: 1 }); assert.equal(h.state.run.credits, 50);
  } finally { h.close(); }
});
test('room kills earn cash but no personal score; high class pay is independent of level', () => {
  const h = boot();
  try {
    h.kill({ playerOwned: false }); h.kill({ threatClass: 'boss' });
    assert.equal(h.state.run.score, 2000);
    h.bus.emit('run:waveCleared', { wave: 1 }); assert.equal(h.state.run.credits, 210);
  } finally { h.close(); }
});
test('one physical pickup, destroyed pickup and missing spawn all settle the same entitlement exactly once', () => {
  const h = boot();
  try {
    h.kill(); const item = h.drops[0].items[0];
    const chip = { id: 50, type: 'pickup', alive: true, data: { ...item } }; h.state.entities.set(50, chip);
    h.bus.emit('entity:spawned', { entity: chip });
    h.bus.emit('pickup:collected', { pickupId: 50 }); h.bus.emit('entity:destroyed', { id: 50 });
    assert.equal(h.state.run.credits, 10);
    h.kill(); const chip2 = { id: 51, type: 'pickup', alive: true, data: { ...h.drops[1].items[0] } }; h.state.entities.set(51, chip2);
    h.bus.emit('entity:spawned', { entity: chip2 }); h.bus.emit('entity:destroyed', { id: 51 });
    assert.equal(h.state.run.credits, 10, 'despawn is not collection');
    h.kill(); h.bus.emit('run:waveCleared', { wave: 1 }); assert.equal(h.state.run.credits, 30);
    h.bus.emit('pickup:collected', { pickupId: 51 }); assert.equal(h.state.run.credits, 30);
  } finally { h.close(); }
});
test('mid-round death loses uncollected cash and reload preserves delivered entitlement deduplication', () => {
  const h = boot();
  try {
    h.kill(); const saved = survivalRewards.serialize(); survivalRewards.deserialize(saved);
    h.bus.emit('player:death', {}); h.bus.emit('run:waveCleared', { wave: 1 });
    assert.equal(h.state.run.credits, 0);
  } finally { h.close(); }
});
test('worked A bank pays actual run score once and cumulative stipend caps at twenty percent', () => {
  const h = boot();
  try {
    const ids = ['rock_discovery', 'bolas', 'bank_job'];
    for (let i = 0; i < 3; i++) {
      const victim = h.kill(); const budget = victim.data.stuntThreat;
      recordTrick(h.state.stunts.combo, { trickId: ids[i], episodeId: `p${i}`, tick: i * 180, rootTick: i * 180,
        victimLives: [{ lifeId: budget.lifeId, threatClass: budget.threatClass, dead: true }] });
    }
    assert.equal(h.state.run.score, 300, 'pending raw does not pay score');
    bankActive(h.state.stunts.combo); h.bus.emit('stunt:styleBanked', {});
    assert.equal(h.state.run.score, 760); assert.equal(h.state.run.credits, 6);
    h.bus.emit('stunt:styleBanked', {}); assert.equal(h.state.run.score, 760);
    h.bus.emit('run:waveCleared', { wave: 1 }); assert.equal(h.state.run.credits, 36);
    survivalRewards.init({ state: h.state, bus: h.bus }); h.bus.emit('stunt:styleBanked', {});
    assert.equal(h.state.run.score, 760); assert.equal(h.state.run.credits, 36);
  } finally { h.close(); }
});
test('stipend uses cumulative floor across banks, not independent per-bank rounding', () => {
  const h = boot();
  try {
    for (let i = 0; i < 3; i++) h.kill();
    const combo = h.state.stunts.combo;
    combo.banks = [{ bankId: 1, points: 49 }]; h.bus.emit('stunt:styleBanked', {}); assert.equal(h.state.run.credits, 0);
    combo.banks.push({ bankId: 2, points: 49 }); h.bus.emit('stunt:styleBanked', {}); assert.equal(h.state.run.credits, 1);
    combo.banks.push({ bankId: 3, points: 10000 }); h.bus.emit('stunt:styleBanked', {}); assert.equal(h.state.run.credits, 6);
  } finally { h.close(); }
});
test('board estimate never awards a force coefficient or a mandatory winner', () => {
  assert.equal(estimateBoardScore({ gunKills: 3 }), 300);
  assert.equal(estimateBoardScore({ physicsKills: 3 }), 300);
  assert.equal(estimateBoardScore({ physicsKills: 3, playerPhysics: false }), 0);
  assert.equal(estimateBoardScore({ physicsKills: 3, stuntPoints: 460 }), 760);
});
