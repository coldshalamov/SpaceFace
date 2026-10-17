import test from 'node:test';
import assert from 'node:assert/strict';
import { RESCUE_COOL_PER_POD } from '../src/systems/heat.js';
import { lawScenario } from './helpers/infLawScenario.mjs';

test('LAW-13 [4242] delivering a towed pod earns the authored witness cooling and testimony once', () => {
  const { sim, state, bus, pods, events } = lawScenario();
  const rescued = events('survivorPod:rescued');
  const cooled = events('survivorPod:heatCooled');
  const toasts = events('toast');
  const clears = events('heat:clear');
  state.player.heat = 0.5;
  const victim = sim.spawn({
    type: 'ship', team: 2, factionId: 'faction_mts', pos: { x: 30, z: 0 }, vel: { x: 0, z: 0 },
    hull: 0, hullMax: 100, radius: 12, data: { trafficRole: 'hauler' },
  });
  const pod = pods._spawnCausalPod(state, victim, { pos: victim.pos, vel: victim.vel });
  assert.ok(pod);
  state.player.tether = { active: true, targetId: pod.id };
  bus.emit('tether:latched', { targetId: pod.id });
  assert.equal(rescued.length, 1, 'the physical station delivery signs the rescue receipt');
  assert.equal(rescued[0].reason, 'station_delivery');
  assert.equal(rescued[0].playerAnswered, true);
  assert.equal(RESCUE_COOL_PER_POD, 0.08, 'pin the authored amount, not just its exported name');
  assert.ok(Math.abs(state.player.heat - 0.42) < 1e-12);
  assert.equal(cooled.length, 1);
  assert.ok(Math.abs(cooled[0].cooled - 0.08) < 1e-12);
  assert.equal(toasts.filter((row) => row.text === 'RESCUED PILOT — testimony filed; heat reduced.').length, 1);
  assert.equal(clears.length, 0, 'testimony cools the warrant rather than clearing it');

  bus.emit('survivorPod:rescued', rescued[0]);
  state.simTime += 61;
  bus.emit('survivorPod:rescued', { ...rescued[0], t: state.simTime });
  pods.update(1 / 60, state);
  assert.equal(cooled.length, 1, 'duplicate delivery stays spent beyond the rate-limit window');
  assert.ok(Math.abs(state.player.heat - 0.42) < 1e-12);

  const savedLedger = structuredClone(state.player.heatRescueCooled);
  state.player.heatRescueCooled = structuredClone(savedLedger);
  bus.emit('survivorPod:rescued', rescued[0]);
  assert.equal(cooled.length, 1, 'the serialized player ledger keeps the once-only guard');
  assert.equal(toasts.filter((row) => row.text === 'RESCUED PILOT — testimony filed; heat reduced.').length, 1);
});
