import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { ActivityKind, normalizeActivity } from '../src/ai/doctrine.js';

function boot({ anchor, stationPresent = true, atCenter = false, holder = false } = {}) {
  const sim = createSimulation({ seed: 47, systems: [lawSecurity] });
  sim.state.mode = 'flight';
  const station = stationPresent ? sim.spawn({ type: 'station', pos: { x: 12038, z: 9792 },
    radius: 78, data: { stationId: 'visiting_carrier' } }) : null;
  const center = { x: 12038, z: 9792 };
  const patrol = sim.spawn({ type: 'ship', team: 2, radius: 18,
    pos: atCenter ? { ...center } : { x: center.x - 40, z: center.z + 20 },
    vel: { x: 0, z: 0 }, data: {
      ai: { lawful: true, zoneId: 'jurisdiction:visiting_carrier', securityTargetId: 900,
        witnessIncidentId: 'response', witnessRole: holder ? 'hold' : 'chase',
        activity: normalizeActivity({ kind: ActivityKind.ATTACK_RUN,
          anchor: anchor || center, leashRadius: 1500 }) },
      combat: { targetId: 900 }, intent: { fire: true, fireGroup: 'primary' },
    } });
  const law = sim.registry.get('lawSecurity');
  sim.state.lawSecurity.incidents.response = { id: 'response', stationId: 'visiting_carrier',
    stationEntityId: station?.id, ringPos: center };
  return { sim, law, station, patrol, center };
}

for (const holder of [false, true]) {
  test(`${holder ? 'witness holder' : 'patrol'} returns outside a station's occupied approach`, () => {
    const { sim, law, station, patrol, center } = boot({ holder });
    const beforePos = { ...patrol.pos };
    const beforeVel = { ...patrol.vel };
    law._clearResponder(patrol, 900, 'response');
    const ai = patrol.data.ai;
    assert.equal(ai.activity.kind, ActivityKind.RETURN_TO_ANCHOR);
    assert.ok(Math.hypot(ai.activity.anchor.x - center.x, ai.activity.anchor.z - center.z)
      >= station.radius + patrol.radius + 120 - 1e-8,
    'return destination must clear both hulls, the 30-WU approach volume, and steering arrival slack');
    assert.ok(ai.activity.anchor.x < center.x, 'return stays on the responder side of the station');
    assert.equal(ai.zoneId, 'jurisdiction:visiting_carrier');
    assert.equal(ai.activity.leashRadius, 1500);
    assert.deepEqual({ ...patrol.pos }, beforePos, 'law issues an activity, never teleports the ship');
    assert.deepEqual({ ...patrol.vel }, beforeVel, 'physics retains velocity ownership');
    assert.equal(patrol.data.combat.targetId, null);
    assert.equal(patrol.data.intent.fire, false);
    sim.dispose();
  });
}

test('a safe authored return anchor is preserved exactly', () => {
  const anchor = { x: 12500, z: 9900 };
  const { sim, law, patrol } = boot({ anchor });
  law._clearResponder(patrol, 900, 'response');
  assert.deepEqual(patrol.data.ai.activity.anchor, anchor);
  sim.dispose();
});

test('a nonstation ring anchor is preserved when no station remains', () => {
  const { sim, law, patrol, center } = boot({ stationPresent: false });
  law._clearResponder(patrol, 900, 'response');
  assert.deepEqual(patrol.data.ai.activity.anchor, center);
  sim.dispose();
});

test('coincident responder and station have a finite deterministic return direction', () => {
  const anchors = [];
  for (let i = 0; i < 2; i++) {
    const { sim, law, patrol, station, center } = boot({ atCenter: true });
    law._clearResponder(patrol, 900, 'response');
    anchors.push(patrol.data.ai.activity.anchor);
    assert.ok(Math.hypot(anchors[i].x - center.x, anchors[i].z - center.z)
      >= station.radius + patrol.radius + 120 - 1e-8);
    sim.dispose();
  }
  assert.deepEqual(anchors[0], anchors[1]);
});

test('jurisdiction lookup also clears an unsafe anchor without an incident record', () => {
  const { sim, law, patrol, station, center } = boot();
  law._clearResponder(patrol, 900);
  assert.ok(Math.hypot(patrol.data.ai.activity.anchor.x - center.x,
    patrol.data.ai.activity.anchor.z - center.z) >= station.radius + patrol.radius + 120 - 1e-8);
  sim.dispose();
});

test('an off-center anchor still inside the occupied approach is projected out', () => {
  const { sim, law, patrol, station, center } = boot({ anchor: { x: 12048, z: 9802 } });
  law._clearResponder(patrol, 900, 'response');
  const anchor = patrol.data.ai.activity.anchor;
  assert.ok(Math.hypot(anchor.x - center.x, anchor.z - center.z)
    >= station.radius + patrol.radius + 120 - 1e-8);
  sim.dispose();
});

test('a recycled incident id occupied by a ship does not become a station return obstacle', () => {
  const { sim, law, patrol, center } = boot({ stationPresent: false, holder: true });
  const unrelated = sim.spawn({ type: 'ship', pos: { x: 500, z: 600 }, radius: 900 });
  sim.state.lawSecurity.incidents.response.stationEntityId = unrelated.id;
  law._clearResponder(patrol, 900, 'response');
  assert.deepEqual(patrol.data.ai.activity.anchor, center);
  sim.dispose();
});
