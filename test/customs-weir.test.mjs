// CR-WEIR — customs is a gate you can fly, not the empty zone disc.
// Helios is a corridor. Tethys is a cone. A contraband body inside is what gets seen.
import assert from 'node:assert/strict';
import test from 'node:test';

import { readCustomsWeir } from '../src/presentation/customsWeir.js';
import { JETTISONED_CARGO_PAYLOAD_TYPE } from '../src/systems/lootShards.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import {
  HELIOS_CUSTOMS_WEIR,
  TETHYS_CUSTOMS_WEIR,
  pointInsideCustomsWeir,
} from '../src/world/customsWeir.js';

function harness(sectorId, playerPos) {
  const player = {
    id: 'pilot', type: 'ship', alive: true, team: 0, isPlayer: true,
    pos: { ...playerPos }, hull: 140, hullMax: 140,
  };
  const events = [];
  const state = {
    mode: 'flight',
    tick: 0,
    simTime: 0,
    playerId: player.id,
    player: {},
    entities: new Map([[player.id, player]]),
    entityList: [player],
    world: { currentSectorId: sectorId },
  };
  const sys = Object.create(lawSecurity);
  sys.bus = { emit(name, payload) { events.push({ name, payload }); } };
  sys.state = state;
  return { state, sys, player, events };
}

function contrabandPod(id, pos) {
  return {
    id,
    type: 'payload',
    alive: true,
    pos: { ...pos },
    data: {
      payloadType: JETTISONED_CARGO_PAYLOAD_TYPE,
      commodityId: 'cmdty_narcotics',
      amount: 4,
    },
  };
}

test('the Helios weir is a corridor inside the lane, not the patrol disc', () => {
  const center = HELIOS_CUSTOMS_WEIR.center;
  assert.equal(pointInsideCustomsWeir(HELIOS_CUSTOMS_WEIR, center), true);
  const inDiscOnly = { x: center.x + 400, z: center.z };
  assert.ok(Math.hypot(400, 0) < HELIOS_CUSTOMS_WEIR.zoneRadius);
  assert.equal(pointInsideCustomsWeir(HELIOS_CUSTOMS_WEIR, inDiscOnly), false);
  assert.equal(HELIOS_CUSTOMS_WEIR.shape, 'corridor');
  assert.equal(TETHYS_CUSTOMS_WEIR.shape, 'cone');
  assert.equal(pointInsideCustomsWeir(TETHYS_CUSTOMS_WEIR, center), false);
  const forward = {
    x: TETHYS_CUSTOMS_WEIR.origin.x + Math.cos(TETHYS_CUSTOMS_WEIR.heading) * 120,
    z: TETHYS_CUSTOMS_WEIR.origin.z + Math.sin(TETHYS_CUSTOMS_WEIR.heading) * 120,
  };
  const behind = {
    x: TETHYS_CUSTOMS_WEIR.origin.x - Math.cos(TETHYS_CUSTOMS_WEIR.heading) * 40,
    z: TETHYS_CUSTOMS_WEIR.origin.z - Math.sin(TETHYS_CUSTOMS_WEIR.heading) * 40,
  };
  assert.equal(pointInsideCustomsWeir(TETHYS_CUSTOMS_WEIR, forward), true);
  assert.equal(pointInsideCustomsWeir(TETHYS_CUSTOMS_WEIR, behind), false);
});

test('standing in the corridor is seen, and the hull is not the price', () => {
  const outside = { x: HELIOS_CUSTOMS_WEIR.center.x + 400, z: HELIOS_CUSTOMS_WEIR.center.z };
  const { state, sys, player, events } = harness('sector_helios_prime', outside);
  sys._updateCustomsWeir(0.2, state);
  assert.equal(readCustomsWeir(state).seen, false);
  assert.equal(events.filter((row) => row.name === 'customs:weirPresence').length, 0);
  player.pos.x = HELIOS_CUSTOMS_WEIR.center.x;
  player.pos.z = HELIOS_CUSTOMS_WEIR.center.z;
  sys._updateCustomsWeir(0.2, state);
  assert.equal(readCustomsWeir(state).seen, true);
  assert.equal(readCustomsWeir(state).shape, 'corridor');
  assert.equal(readCustomsWeir(state).segments.length, 2);
  assert.equal(events.filter((row) => row.name === 'contraband:scanned').length, 0);
  assert.equal(player.hull, 140);
  player.pos.x = outside.x;
  sys._updateCustomsWeir(0.2, state);
  assert.equal(readCustomsWeir(state).seen, false);
  assert.equal(events.filter((row) => row.name === 'customs:weirPresence' && row.payload.inside === false).length, 1);
});

test('a contraband body held in the weir is scanned once, and a legal body is not', () => {
  const center = HELIOS_CUSTOMS_WEIR.center;
  const { state, sys, player, events } = harness('sector_helios_prime', {
    x: center.x + 400,
    z: center.z,
  });
  const pod = contrabandPod('pod-hot', center);
  const legal = contrabandPod('pod-ore', { x: center.x, z: center.z + 20 });
  legal.data.commodityId = 'cmdty_ore_iron';
  state.entityList.push(pod, legal);
  sys._updateCustomsWeir(0.4, state);
  assert.equal(events.filter((row) => row.name === 'contraband:scanned').length, 0);
  sys._updateCustomsWeir(0.4, state);
  const scans = events.filter((row) => row.name === 'contraband:scanned');
  assert.equal(scans.length, 1);
  assert.equal(scans[0].payload.podId, 'pod-hot');
  assert.equal(scans[0].payload.source, 'customs_weir');
  assert.equal(scans[0].payload.found, true);
  sys._updateCustomsWeir(0.4, state);
  assert.equal(events.filter((row) => row.name === 'contraband:scanned').length, 1);
  assert.equal(player.hull, 140);
  assert.equal(legal.data.customsScanned, undefined);
});
