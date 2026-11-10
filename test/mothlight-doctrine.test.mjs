import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { mothlight } from '../src/systems/mothlight.js';
import { MOTHLIGHT as C, mothlightGunCadence, validMothlightGunCadence } from '../src/data/mothlight.js';
import { CombatDoctrineRuntime } from '../src/ai/combatDoctrine.js';
import { normalizeSensorFrame } from '../src/ai/contracts.js';

function fixture(start = 120, decisionInterval = 2, lastDecision = start - 1) {
  const sim = createSimulation({ seed: 810, systems: [aiPorts, mothlight, { name: 'tacticalAI',
    decisionIntervalTicks: decisionInterval, stack: { lastTick: lastDecision } }] });
  const s = sim.state; s.mode = 'flight'; s.tick = start; s.simTime = start / 60;
  s.settings.gameplay.physicsBackend = 'legacy';
  const spawn = sim.registry.ctx.helpers.spawnEntity;
  const player = spawn({ type: 'ship', team: 0, pos: { x: 500, z: 0 }, hull: 100, data: {} });
  s.playerId = player.id;
  const tender = spawn({ type: 'ship', team: 1, pos: { x: 0, z: 0 }, hull: 100,
    data: { lootTableId: C.enemyId } });
  const owner = sim.registry.get('mothlight'), row = owner.bind(tender);
  row.targetId = player.id; row.targetLife = player.occupantGeneration;
  owner._phase(tender, row, 'true_charge');
  const runtime = new CombatDoctrineRuntime({ seed: 810 });
  const frame = (cadence = mothlightGunCadence(s, tender), overrides = {}) => ({
    tick: s.tick,
    self: { id: tender.id, occupantGeneration: tender.occupantGeneration, pos: tender.pos, vel: { x: 0, z: 0 }, rot: 0,
      hullFraction: 1, energyFraction: 1, heatFraction: 0, roe: 'weapons_free',
      activity: { kind: 'attack_run' }, ...(cadence ? { mothlightGunCadence: cadence } : {}), ...overrides },
    contacts: [{ id: player.id, occupantGeneration: player.occupantGeneration, kind: 'ship',
      alive: true, valid: true, visible: true, confidence: 1, hostile: true, pos: player.pos, vel: { x: 0, z: 0 } }],
  });
  const update = (cadence, overrides) => runtime.update({ tick: s.tick, entityId: tender.id,
    doctrineId: 'ranged_disengager', perception: frame(cadence, overrides),
    directive: { objective: { kind: 'focus', targetId: player.id } } });
  return { sim, s, owner, tender, player, row, runtime, frame, update };
}

for (const [start, interval, last] of [[120, 2, 119], [121, 2, 120], [130, 3, 128], [144, 12, 140]]) {
  test(`one owner warning aligns the exact ordinary decision tick: ${start}/${interval}`, () => {
    const h = fixture(start, interval, last);
    try {
      const due = h.row.nextAttackTick;
      assert.ok(due - start >= C.chargeTicks && due - start < C.chargeTicks + interval);
      assert.equal((due - last) % interval, 0);
      for (let tick = start; tick <= due; tick++) {
        h.s.tick = tick;
        const d = h.update();
        assert.equal(d.fireWindow, tick === due, `fire at ${tick}`);
        assert.equal(h.row.nextAttackTick, due, 'reads never rearm or extend the owner clock');
      }
      h.s.tick = due + 1;
      assert.equal(h.update().fireWindow, false, 'a missed exact tick never becomes a delayed shot');
    } finally { h.sim.dispose(); }
  });
}

test('stale, forged, wrong-life and malformed cadence never opens the ranged action', () => {
  const h = fixture();
  try {
    const original = mothlightGunCadence(h.s, h.tender);
    assert.equal(validMothlightGunCadence(original, h.frame().self, h.s.tick), true);
    const normalized = normalizeSensorFrame(h.frame(original), h.tender.id, h.s.tick);
    assert.equal(normalized.self.mothlightGunCadence, original, 'sensor normalization retains owner provenance');
    h.s.tick = h.row.nextAttackTick;
    assert.equal(h.update(original).fireWindow, false, 'stale sensor sample cannot open the deadline');
    const current = mothlightGunCadence(h.s, h.tender);
    for (const forged of [{ ...current }, { ...current, nextAttackTick: NaN }, { ...current, phaseStartTick: h.s.tick },
      { ...current, ownerLife: current.ownerLife + 1 }, { ...current, sampledTick: h.s.tick + 1 }]) {
      assert.equal(h.update(forged).fireWindow, false);
    }
    assert.equal(h.update(current, { occupantGeneration: h.tender.occupantGeneration + 1 }).fireWindow, false);
    const impostor = h.sim.registry.ctx.helpers.spawnEntity({ type: 'ship', pos: { x: 10, z: 0 }, hull: 100,
      data: { ...h.tender.data, mothlightGunCadence: current } });
    assert.equal(mothlightGunCadence(h.s, impostor), null, 'copied entity metadata has no owner binding');
    const sensors = h.sim.registry.get('aiPorts');
    assert.equal(sensors._sensorFrameFor(impostor.id, h.s.tick).self.mothlightGunCadence, undefined);
    const live = sensors._sensorFrameFor(h.tender.id, h.s.tick).self;
    assert.equal(validMothlightGunCadence(live.mothlightGunCadence, live, h.s.tick), true);
    h.tender.occupantGeneration++;
    assert.equal(sensors._sensorFrameFor(h.tender.id, h.s.tick).self.mothlightGunCadence, undefined);
    h.tender.occupantGeneration--;
    h.owner._restoring = true;
    assert.equal(mothlightGunCadence(h.s, h.tender), null, 'restoration cannot publish a warning');
  } finally { h.sim.dispose(); }
});

test('ordinary ranged actors retain their own volley clock; Moth pressing and ROE still veto', () => {
  const h = fixture();
  try {
    let ordinaryFire = false;
    for (let tick = 120; tick < 240; tick++) { h.s.tick = tick; ordinaryFire ||= h.update(null).fireWindow; }
    assert.equal(ordinaryFire, true);
    h.s.tick = h.row.nextAttackTick;
    h.player.pos.x = 100;
    assert.equal(h.update().fireWindow, false, 'point-blank pressure preserves retreat');
    assert.equal(h.update(undefined, { roe: 'hold_fire' }), null);
  } finally { h.sim.dispose(); }
});
