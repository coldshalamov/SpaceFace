// PQ-141.02 — occupational contact light. Every actor has a sentence: a still of a working
// hull must show WHAT it works on, so the service/transfer emitters only fire between the real
// subject and the real object its route names — never a fictional client at a waypoint.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { vfx } from '../src/render/vfx.js';

const actor = { id: 1, pos: { x: 0, z: 0 }, radius: 10, rot: 0 };
const target = {
  id: 2, type: 'fx', alive: true, pos: { x: 65, z: 0 }, radius: 12,
  data: { activityObjectSlotId: 'client' },
};

function host(list = [actor, target]) {
  const h = Object.create(vfx);
  h.state = { simTime: 1, entityList: list };
  h._ent = (id) => list.find((e) => e.id === id);
  h.lines = [];
  h._spawnStationSideEventStreak = (...args) => { h.lines.push(args); return 1; };
  return h;
}

const job = { kind: 'tender', phase: 'work', routeIndex: 0, route: [{ targetRef: 'object:client' }] };

test('a service connection requires the actual named, live client', () => {
  const h = host();
  const slot = {};
  assert.equal(h._npcJobContactTarget(slot, actor, job), target);
  h.state.entityList.pop();
  assert.equal(h._npcJobContactTarget(slot, actor, job), null);
  // Two live bodies answering the same ref: ambiguous, so no beam rather than a coin flip.
  assert.equal(host([actor, target, { ...target, id: 3 }])._npcJobContactTarget({}, actor, job), null);
  assert.equal(host([actor, { ...target, type: 'ship' }])._npcJobContactTarget({}, actor, job), null);
});

test('repair emits at the real clearance, never in transit or at a distant waypoint', () => {
  const h = host();
  const slot = { elapsed: 0.5 };
  assert.equal(h._emitNpcJobContact(slot, { cadenceHz: 2 }, actor, job, false), 4);
  assert.equal(h._emitNpcJobContact(slot, { cadenceHz: 2 }, actor, { ...job, phase: 'transit' }, false), 0);
  const far = host([actor, { ...target, pos: { x: 1000, z: 0 } }]);
  assert.equal(far._emitNpcJobContact({}, { cadenceHz: 2 }, actor, job, false), 0);
});

test('survey and transfer remain distinct and finite with reduced motion', () => {
  for (const reduced of [false, true]) {
    const h = host();
    assert.equal(h._emitNpcJobContact({ elapsed: 2 }, { cadenceHz: 2 }, actor, { ...job, kind: 'hauler', phase: 'load' }, reduced), 5);
    assert.equal(h._emitNpcJobContact({ elapsed: 2 }, { cadenceHz: 2 }, actor, { ...job, kind: 'surveyor', phase: 'transit' }, reduced), 10);
    assert.ok(h.lines.every((line) => line.every((v) => typeof v !== 'number' || Number.isFinite(v))));
  }
});

test('service contact reaches the visible plate across a floating origin', () => {
  const root = new THREE.Mesh(new THREE.BoxGeometry(18, 12, 26), new THREE.MeshBasicMaterial());
  root.position.set(65 - 1000, 0, -2000);
  root.updateMatrixWorld(true);
  const plate = { ...target, radius: 42, view: { root } };
  const h = host([actor, plate]);
  h.state.world = { frameOrigin: { x: 1000, z: 2000 } };
  const before = JSON.stringify([actor.pos, plate.pos]);
  const slot = { elapsed: 0 };
  assert.ok(h._emitNpcJobContact(slot, { cadenceHz: 2 }, actor, job, false) >= 4);
  const weld = h.lines.at(-2);
  const nearFace = 55.8;
  assert.ok(weld[0] > nearFace + 2, `weld must sit inboard of the near face, x=${weld[0]}`);
  assert.ok(weld[0] < 65, `weld must stay on the plate, x=${weld[0]}`);
  assert.ok(Math.abs(weld[1] - 6.15) < 0.01, 'contact lies on the upper plate with the 0.15 WU surface bias');
  assert.equal(JSON.stringify([actor.pos, plate.pos]), before);
  root.geometry.dispose();
  root.material.dispose();
});

test('patrol search light needs the player inside its reach and reads one beam', () => {
  const player = { id: 9, pos: { x: 80, z: 0 }, radius: 6 };
  const h = host([actor, player]);
  h.state.playerId = 9;
  const patrolJob = { kind: 'patrol', phase: 'hold', routeIndex: 0, route: [] };
  const emitted = h._emitNpcJobContact({ elapsed: 1 }, { cadenceHz: 2 }, actor, patrolJob, false);
  assert.ok(emitted >= 2, `expected beam + transverse return, got ${emitted}`);
  // Out of reach: the beam never spans a pocket it cannot be working.
  const farPlayer = host([actor, { ...player, pos: { x: 800, z: 0 } }]);
  farPlayer.state.playerId = 9;
  assert.equal(farPlayer._emitNpcJobContact({ elapsed: 1 }, { cadenceHz: 2 }, actor, patrolJob, false), 0);
});

test('tender client: and berth: refs resolve the named station, not empty space', () => {
  const station = {
    id: 20, type: 'station', alive: true, pos: { x: 65, z: 0 }, radius: 42,
    data: { stationId: 'station_helios' },
  };
  const tenderJob = {
    kind: 'tender', phase: 'work', routeIndex: 1,
    route: [
      { id: 'berth:station_home', pos: { x: 0, z: 0 } },
      { id: 'client:station_helios', pos: { x: 65, z: 0 } },
    ],
  };
  const h = host([actor, station]);
  assert.equal(h._npcJobContactTarget({}, actor, tenderJob), station);
  assert.equal(h._emitNpcJobContact({ elapsed: 0.5 }, { cadenceHz: 2 }, actor, tenderJob, false), 4);
  const miss = host([actor, { ...station, data: { stationId: 'station_other' } }]);
  assert.equal(miss._npcJobContactTarget({}, actor, tenderJob), null);
});

test('tender prey: ref welds a live client ship plate, not a station', () => {
  const client = { id: 7, type: 'ship', alive: true, pos: { x: 40, z: 0 }, radius: 8, data: {} };
  const tenderJob = {
    kind: 'tender', phase: 'work', routeIndex: 0,
    route: [{ id: 'prey:7', pos: { x: 40, z: 0 } }],
  };
  const h = host([actor, client]);
  assert.equal(h._npcJobContactTarget({}, actor, tenderJob), client);
  assert.equal(h._emitNpcJobContact({ elapsed: 0.5 }, { cadenceHz: 2 }, actor, tenderJob, false), 4);
  const colors = h.lines.map((line) => line[7]);
  assert.ok(colors.includes('#ff4a3a'), `red weld stitches missing, got ${colors.join(',')}`);
  assert.equal(colors.includes('#a8e4ff'), false, 'patrol cyan is not a weld');
});

test('a large tender welding a small fighter keeps the mark on the fighter plate', () => {
  const barge = { id: 1, pos: { x: 0, z: 0 }, radius: 40, rot: 0 };
  const fighter = { id: 7, type: 'ship', alive: true, pos: { x: 55, z: 0 }, radius: 8, data: {} };
  const tenderJob = {
    kind: 'tender', phase: 'work', routeIndex: 0,
    route: [{ id: 'prey:7', pos: { x: 55, z: 0 } }],
  };
  const h = host([barge, fighter]);
  assert.equal(h._emitNpcJobContact({ elapsed: 0.5 }, { cadenceHz: 2 }, barge, tenderJob, false), 4);
  const lengths = h.lines.map((line) => line[5]);
  assert.ok(lengths.every((len) => len <= fighter.radius), `fighter weld must be plate-local, got ${lengths.join(',')}`);
  for (const line of h.lines) {
    assert.ok(Math.abs(line[0] - fighter.pos.x) < fighter.radius,
      `weld x=${line[0]} must sit on the fighter at ${fighter.pos.x} r=${fighter.radius}`);
    assert.ok(Math.abs(line[2] - fighter.pos.z) < fighter.radius,
      `weld z=${line[2]} must sit on the fighter`);
  }
});

test('scavenger hulk: ref is the live wreck face', () => {
  const wreck = { id: 8, type: 'wreck', alive: true, pos: { x: 65, z: 0 }, radius: 12, data: {} };
  const salvorJob = {
    kind: 'salvor', phase: 'work', routeIndex: 0,
    route: [{ id: 'hulk:8', pos: { x: 65, z: 0 } }],
  };
  const h = host([actor, wreck]);
  assert.equal(h._npcJobContactTarget({}, actor, salvorJob), wreck);
  assert.equal(h._emitNpcJobContact({ elapsed: 0.5 }, { cadenceHz: 2 }, actor, salvorJob, false), 3);
});

test('repair stays on the client plate; long cyan rails are not a weld', () => {
  const h = host();
  assert.equal(h._emitNpcJobContact({ elapsed: 0.5 }, { cadenceHz: 2 }, actor, job, false), 4);
  const lengths = h.lines.map((line) => line[5]);
  assert.ok(lengths.every((len) => len < 20), `tender stitches must be local, got ${lengths.join(',')}`);
  const nearFace = 65 - 12 * 0.82;
  for (const line of h.lines) {
    assert.ok(line[0] > nearFace, `weld center x=${line[0]} must sit inboard of the client near face ${nearFace}`);
    assert.ok(Math.abs(line[0] - 65) < 12, `weld center x=${line[0]} must stay on the client hull`);
  }
});

test('a scavenger cutter reaches the wreck face and throws scrap off it', () => {
  const h = host();
  const n = h._emitNpcJobContact({ elapsed: 0.5 }, { cadenceHz: 2 }, actor, { ...job, kind: 'salvor' }, false);
  assert.equal(n, 3);
  const lengths = h.lines.map((line) => line[5]);
  assert.ok(Math.max(...lengths) > 20, `cutter must span the working clearance, got ${lengths.join(',')}`);
});

test('pirate intercept is a hunt beam onto the live combat prey, not a patrol searchlight', () => {
  const pirate = {
    id: 4, type: 'ship', alive: true, pos: { x: 0, z: 0 }, radius: 8, rot: 0,
    vel: { x: 12, z: 0 },
    data: { trafficRole: 'pirate', ai: { pirate: true }, combat: { targetId: 2 } },
  };
  const prey = { id: 2, type: 'ship', alive: true, pos: { x: 80, z: 0 }, radius: 10 };
  const h = host([pirate, prey]);
  const pirateJob = { kind: 'pirate', phase: 'hold', routeIndex: 0, route: [] };
  const n = h._emitNpcJobContact({ elapsed: 1 }, { cadenceHz: 3.2 }, pirate, pirateJob, false);
  assert.equal(n, 4);
  assert.ok(h.lines.some((line) => line[7] === '#ff6a4a'), 'hunt beam is hostile red, not patrol blue');
  assert.equal(h.lines.some((line) => line[7] === '#a8e4ff'), false);
  assert.equal(h._npcPirateInterceptTarget(pirate), prey);
  assert.equal(h._npcPirateIdentity(pirate), true);
  assert.equal(h._npcPirateIdentity({ ...pirate, type: 'ship', data: { trafficRole: 'salvor' } }), false);
  assert.equal(h._npcPirateInterceptTarget({ ...pirate, data: { trafficRole: 'pirate', combat: {} } }), null);
});

test('nearby pirate intercepts are pulled from combat targets, not invented', () => {
  const pirate = {
    id: 4, type: 'ship', alive: true, pos: { x: 0, z: 0 }, radius: 8, vel: { x: 10, z: 0 },
    data: { trafficRole: 'pirate', combat: { targetId: 2 } },
  };
  const prey = { id: 2, type: 'ship', alive: true, pos: { x: 70, z: 0 }, radius: 8 };
  const h = host([pirate, prey]);
  h._pirateInterceptScratch = { elapsed: 0 };
  assert.equal(h._emitNpcPirateIntercepts(null, 300, false), 4);
  const idle = host([{ ...pirate, data: { trafficRole: 'pirate', combat: {} } }, prey]);
  idle._pirateInterceptScratch = { elapsed: 0 };
  assert.equal(idle._emitNpcPirateIntercepts(null, 300, false), 0);
});

const SEED = 14102;

function fingerprint(lines) {
  return JSON.stringify({
    count: lines.length,
    colors: [...new Set(lines.map((line) => line[7]))].sort(),
    axes: lines.map((line) => [
      Math.round((Number(line[10]) || 0) * 1000) / 1000,
      Math.round((Number(line[11]) || 0) * 1000) / 1000,
    ]),
  });
}

test('miner cutting contact hits the named rock and stays finite', () => {
  const rock = {
    id: 2, type: 'asteroid', alive: true, pos: { x: 65, z: 0 }, radius: 12,
    data: { activityObjectSlotId: 'client' },
  };
  const minerJob = { kind: 'miner', phase: 'work', routeIndex: 0, route: [{ targetRef: 'field:slot:client' }] };
  const h = host([actor, rock]);
  h.state.meta = { seed: SEED };
  assert.equal(h._emitNpcJobContact({ elapsed: 0.5 }, { cadenceHz: 2 }, actor, minerJob, false), 3);
  assert.equal(h._emitNpcJobContact({ elapsed: 0.5 }, { cadenceHz: 2 }, actor, { ...minerJob, phase: 'transit' }, false), 0);
  const far = host([actor, { ...rock, pos: { x: 1000, z: 0 } }]);
  assert.equal(far._emitNpcJobContact({ elapsed: 0.5 }, { cadenceHz: 2 }, actor, minerJob, false), 0);
});

test('all seven roles emit distinct finite contact on seed 14102', () => {
  const rock = {
    id: 2, type: 'asteroid', alive: true, pos: { x: 65, z: 0 }, radius: 12,
    data: { activityObjectSlotId: 'client' },
  };
  const wreck = {
    id: 3, type: 'wreck', alive: true, pos: { x: 65, z: 0 }, radius: 12,
  };
  const player = { id: 9, pos: { x: 80, z: 0 }, radius: 6 };
  const pirate = {
    id: 1, pos: { x: 0, z: 0 }, radius: 10, rot: 0, vel: { x: 12, z: 0 },
    data: {
      trafficRole: 'pirate',
      ai: { archetype: 'pirate' },
      combat: { targetId: 9 },
      npcInterceptTargetId: 9,
    },
  };
  const rows = [
    {
      name: 'miner',
      job: { kind: 'miner', phase: 'work', routeIndex: 0, route: [{ targetRef: 'field:slot:client' }] },
      list: [actor, rock],
    },
    { name: 'hauler', job: { ...job, kind: 'hauler', phase: 'load' }, list: [actor, target] },
    { name: 'tender', job, list: [actor, target] },
    { name: 'surveyor', job: { ...job, kind: 'surveyor', phase: 'transit' }, list: [actor, target] },
    {
      name: 'patrol',
      job: { kind: 'patrol', phase: 'hold', routeIndex: 0, route: [] },
      list: [actor, player],
      playerId: 9,
    },
    {
      name: 'pirate',
      job: { kind: 'pirate', phase: 'hold', routeIndex: 0, route: [] },
      list: [pirate, player],
    },
    {
      name: 'scavenger',
      job: {
        kind: 'scavenger', phase: 'work', routeIndex: 0,
        route: [{ id: 'hulk:3' }], payload: { role: 'scavenger' },
      },
      list: [actor, wreck],
    },
  ];
  const prints = [];
  for (const row of rows) {
    const h = host(row.list);
    h.state.meta = { seed: SEED };
    h.state.simTime = SEED / 100;
    if (row.playerId) h.state.playerId = row.playerId;
    const n = h._emitNpcJobContact({ elapsed: 1 }, { cadenceHz: 2 }, row.list[0], row.job, false);
    assert.ok(n > 0, `${row.name} must emit contact on seed ${SEED}, got ${n}`);
    assert.ok(
      h.lines.every((line) => line.every((value) => typeof value !== 'number' || Number.isFinite(value))),
      `${row.name} must stay finite`,
    );
    prints.push({ name: row.name, n, print: fingerprint(h.lines) });
  }
  const unique = new Set(prints.map((row) => row.print));
  assert.equal(unique.size, 7, `expected 7 distinct signatures, got ${JSON.stringify(prints)}`);
});
