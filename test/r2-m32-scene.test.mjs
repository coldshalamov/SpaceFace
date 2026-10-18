import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { ENCOUNTERS } from '../src/data/encounters/index.generated.js';
import { modelById } from '../src/data/reactiveMatter/models.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { encounterDirector, planEncounters } from '../src/systems/encounterDirector.js';
import { economy } from '../src/systems/economy.js';
import { reactiveMatter } from '../src/systems/reactiveMatter.js';

const SEED = 4242;
const SECTOR = 'sector_tethys_junction';
const SHAPE = 'two_ships_one_mistake';
const HUB = Object.freeze({ x: 400, z: 0 });

function boot() {
  const sim = createSimulation({ seed: SEED, systems: [reactiveMatter, encounterDirector, economy] });
  const player = sim.spawn({
    type: 'ship', isPlayer: true, team: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 3, mass: 16, hull: 100, hullMax: 100,
    data: {},
  });
  sim.state.playerId = player.id;
  sim.state.mode = 'flight';
  sim.state.timeScale = 1;
  sim.state.world.currentSectorId = SECTOR;
  sim.state.world.activeSector = {
    stations: [{ id: 'station_tethys', name: 'Tethys Trade Hub', pos: { x: HUB.x, z: HUB.z } }],
    pois: [],
  };
  return { sim, state: sim.state, bus: sim.bus, player, director: sim.registry.get('encounterDirector') };
}

function force(t, suffix) {
  const encounterId = `debug:mistake:${suffix}`;
  const result = t.director.requestAuthoredEncounter({
    shapeId: SHAPE,
    encounterId,
    sectorId: SECTOR,
    anchor: { x: 0, z: 0 },
    force: true,
  });
  assert.equal(result.ok, true, `${suffix}: ${JSON.stringify(result)}`);
  return encounterId;
}

function choose(t, encounterId, choiceId) {
  t.bus.emit('encounter:choose', { encounterId, choiceId });
}

function live(t, encounterId) {
  return t.state.encounterDirector.live[encounterId];
}

function completion(t) {
  return t.state.story?.depthProgramEncounters?.completed?.[SHAPE] || null;
}

function polymers(t) {
  return t.state.player.cargo.items.cmdty_polymers || 0;
}

function hulls(t) {
  const list = (t.state.entityList || []).filter((entity) => entity?.data?.reactiveMatter && entity.alive !== false);
  return {
    list,
    first: list.find((entity) => entity.data.scanLabel === 'FIRST HAULER') || null,
    second: list.find((entity) => entity.data.scanLabel === 'SECOND HAULER') || null,
    loose: list.find((entity) => entity.data.scanLabel === 'LOOSE END') || null,
  };
}

function bridgeBetween(state, a, b) {
  const keyA = a?.data?.reactiveMatter?.key;
  const keyB = b?.data?.reactiveMatter?.key;
  const bridges = state.reactiveMatterWorld?.adhesive?.bridges;
  if (!bridges || keyA == null || keyB == null) return null;
  for (const bridge of bridges.values()) {
    if ((bridge.aId === keyA && bridge.bId === keyB) || (bridge.aId === keyB && bridge.bId === keyA)) return bridge;
  }
  return null;
}

function untilBridge(t, a, b) {
  let bridge = null;
  for (let i = 0; i < 8; i += 1) {
    bridge = bridgeBetween(t.state, a, b);
    if (bridge?.alive) return bridge;
    t.sim.runTicks(1);
  }
  return bridge;
}

function impulseAlong(entity, nx, nz) {
  const command = consumePhysicsCommand(entity);
  if (!command) return 0;
  let sum = 0;
  for (const row of command.impulses) sum += row.x * nx + row.z * nz;
  return sum;
}

function separating(a, b) {
  const dx = b.pos.x - a.pos.x;
  const dz = b.pos.z - a.pos.z;
  const dist = Math.hypot(dx, dz) || 1;
  const nx = dx / dist;
  const nz = dz / dist;
  const sep = (b.vel.x - a.vel.x) * nx + (b.vel.z - a.vel.z) * nz;
  return { sep, nx, nz, dist };
}

function assertPlain(text) {
  assert.equal(typeof text, 'string', text);
  assert.ok(text.length > 8, text);
  assert.equal(/[a-z]+_[a-z0-9_]+/.test(text), false, text);
  assert.equal(/[a-z][A-Z]/.test(text), false, text);
}

function collect(t, names) {
  const rows = [];
  for (const name of names) t.bus.on(name, (payload) => rows.push({ name, payload }));
  return rows;
}

function accept(t, suffix) {
  const id = force(t, suffix);
  choose(t, id, 'take');
  const bodies = hulls(t);
  assert.ok(bodies.first && bodies.second && bodies.loose, 'accept puts two haulers and a loose end in the lane');
  assert.equal(polymers(t), 2);
  const bridge = untilBridge(t, bodies.first, bodies.second);
  assert.ok(bridge?.alive, 'the leaked film bridges the two haulers');
  return { id, ...bodies, bridge };
}

test('the pair plans on the Tethys trade lane and nowhere else', () => {
  const shape = ENCOUNTERS[SHAPE];
  assert.ok(shape, 'catalog must contain the encounter');
  assert.equal(shape.script, 'selfRegistered');
  let planned = null;
  for (let day = 0; day < 120 && !planned; day += 1) {
    planned = planEncounters(SEED, SECTOR, day, zonesForSector(SECTOR), null, { [shape.id]: shape })
      .find((row) => row.shapeId === shape.id) || null;
  }
  assert.ok(planned, 'the seeded civilian deck must eventually select the pair');
  assert.equal(planned.zoneType, 'trade_lane');
  for (let day = 0; day < 40; day += 1) {
    const rows = planEncounters(SEED, 'sector_helios_prime', day,
      zonesForSector('sector_helios_prime'), null, { [shape.id]: shape });
    assert.equal(rows.length, 0, `the pair must not leak onto Helios (day ${day})`);
  }
});

test('the offer can be declined before any cargo or pay moves', () => {
  const t = boot();
  const events = collect(t, ['encounter:choiceOffered', 'encounter:receipt', 'economy:grantCredits', 'encounter:voice']);
  const id = force(t, 'decline');
  t.sim.runTicks(5);
  assert.equal(live(t, id).phase, 'offered');
  assert.equal(polymers(t), 0);
  assert.equal(t.state.player.credits, 0);
  assert.equal(hulls(t).list.length, 0, 'declining is still possible because nothing has been spawned');
  const offer = events.find((row) => row.name === 'encounter:choiceOffered');
  assert.ok(offer, 'the hail is a real choice, not a line of flavor');
  assertPlain(offer.payload.title);
  for (const option of offer.payload.options) assertPlain(option.label);
  const ids = offer.payload.options.map((option) => option.id).sort();
  assert.deepEqual(ids, ['decline', 'take']);

  choose(t, id, 'decline');
  assert.equal(completion(t)?.outcome, 'declined');
  assert.equal(polymers(t), 0);
  assert.equal(t.state.player.credits, 0);
  assert.equal(hulls(t).list.length, 0);
  assert.equal(events.filter((row) => row.name === 'economy:grantCredits').length, 0);
  const receipt = events.find((row) => row.name === 'encounter:receipt');
  assert.ok(receipt);
  assertPlain(receipt.payload.text);
  assert.match(receipt.payload.text, /DECLINED/i);
  for (const row of events) {
    if (row.payload && typeof row.payload.text === 'string') assertPlain(row.payload.text);
  }
  t.sim.dispose();
});

test('a missed spray during the job spends nothing and writes no status', () => {
  const t = boot();
  const events = collect(t, ['toast']);
  const job = accept(t, 'miss');
  const before = polymers(t);
  assert.equal(before, 2);
  assert.equal(job.loose.data.status, undefined);
  assert.equal(job.first.data.status, undefined);
  assert.equal(job.second.data.status, undefined);

  const reach = t.player.pos;
  reach.x = job.loose.pos.x + 4;
  reach.z = job.loose.pos.z;
  t.bus.emit('physics:impact', {
    aId: t.player.id,
    bId: job.loose.id,
    normal: { x: 1, z: 0 },
    preSolveClosingSpeed: 48,
    tick: t.state.tick | 0,
  });
  t.sim.runTicks(1);
  const coat = t.state.reactiveMatterWorld?.adhesive?.coatings?.get(job.loose.data.reactiveMatter.key);
  assert.equal(coat, undefined);
  assert.equal(polymers(t), before);
  assert.equal(job.loose.data.status, undefined);
  assert.equal(job.loose.data.reactiveMatter.status, undefined);
  assert.equal(events.filter((row) => /spray took/i.test(row.payload?.text || '')).length, 0);

  t.bus.emit('physics:impact', {
    aId: t.player.id,
    bId: job.loose.id,
    normal: { x: 1, z: 0 },
    preSolveClosingSpeed: 6,
    tick: t.state.tick | 0,
  });
  t.sim.runTicks(1);
  const laid = t.state.reactiveMatterWorld?.adhesive?.coatings?.get(job.loose.data.reactiveMatter.key);
  assert.ok(laid && laid.integrity > 0.9, 'a gentle bump spends one can from the job grant');
  assert.equal(polymers(t), before - 1);
  assert.equal(job.loose.data.status, undefined, 'a real coat is not a hidden status flag');
  const took = events.filter((row) => /spray took/i.test(row.payload?.text || ''));
  assert.equal(took.length, 1);
  assertPlain(took[0].payload.text);
  t.sim.dispose();
});

test('quieting the pull lets the film wear off, and that pays once', () => {
  const t = boot();
  const events = collect(t, ['economy:grantCredits', 'encounter:receipt', 'encounter:voice']);
  const job = accept(t, 'cut');
  assert.equal(job.first.mass, modelById('hauler').mass);
  assert.equal(job.second.mass, modelById('hauler').mass);
  const line = separating(job.first, job.second);
  assert.ok(line.sep > 1, `the pair starts diverging, sep ${line.sep}`);
  job.first.vel.x = 0;
  job.first.vel.z = 0;
  job.second.vel.x = 0;
  job.second.vel.z = 0;

  let ticks = 0;
  while (completion(t)?.outcome !== 'separated' && ticks < 1800) {
    t.sim.runTicks(30);
    ticks += 30;
  }
  assert.equal(completion(t)?.outcome, 'separated');
  assert.equal(t.state.player.credits, 240);
  const grants = events.filter((row) => row.name === 'economy:grantCredits');
  assert.equal(grants.length, 1);
  assert.equal(grants[0].payload.amount, 240);
  const worn = bridgeBetween(t.state, job.first, job.second);
  assert.ok(!worn || worn.alive === false, 'the cut is the film letting go');
  assert.equal(job.first.alive !== false && job.second.alive !== false, true);
  const receipt = events.find((row) => row.name === 'encounter:receipt');
  assertPlain(receipt.payload.text);
  t.sim.runTicks(120);
  assert.equal(events.filter((row) => row.name === 'economy:grantCredits').length, 1);
  assert.equal(t.state.player.credits, 240);
  t.sim.dispose();
});

test('walking both hulls to the hub while the film holds pays once for the pair', () => {
  const t = boot();
  const events = collect(t, ['economy:grantCredits', 'encounter:receipt', 'encounter:voice']);
  const job = accept(t, 'pair');
  const line = separating(job.first, job.second);
  const reduced = 1 / (1 / job.first.mass + 1 / job.second.mass);
  const pullA = impulseAlong(job.first, line.nx, line.nz);
  const pullB = impulseAlong(job.second, line.nx, line.nz);
  assert.ok(Math.abs(pullA - line.sep * reduced) < 0.05, `hold ${pullA} vs load ${line.sep * reduced}`);
  assert.ok(Math.abs(pullA + pullB) < 1e-3, 'the film pulls both hulls, so the second mass is in the tow');

  const service = live(t, job.id).vars.service;
  const dx = job.second.pos.x - job.first.pos.x;
  const dz = job.second.pos.z - job.first.pos.z;
  job.first.pos.x = service.x - dx / 2;
  job.first.pos.z = service.z - dz / 2;
  job.second.pos.x = service.x + dx / 2;
  job.second.pos.z = service.z + dz / 2;
  job.first.vel.x = 0;
  job.first.vel.z = 0;
  job.second.vel.x = 0;
  job.second.vel.z = 0;
  t.sim.runTicks(70);
  assert.equal(completion(t)?.outcome, 'paired');
  assert.equal(t.state.player.credits, 360);
  const grants = events.filter((row) => row.name === 'economy:grantCredits');
  assert.equal(grants.length, 1);
  assert.equal(grants[0].payload.amount, 360);
  const held = bridgeBetween(t.state, job.first, job.second);
  assert.ok(held?.alive, 'paired delivery is the film still holding at the hub');
  assert.ok(Math.hypot(job.first.pos.x - service.x, job.first.pos.z - service.z) < 40);
  assert.ok(Math.hypot(job.second.pos.x - service.x, job.second.pos.z - service.z) < 40);
  const receipt = events.find((row) => row.name === 'encounter:receipt');
  assertPlain(receipt.payload.text);
  for (const row of events) {
    if (typeof row.payload?.text === 'string') assertPlain(row.payload.text);
  }
  choose(t, job.id, 'take');
  t.sim.runTicks(120);
  assert.equal(events.filter((row) => row.name === 'economy:grantCredits').length, 1);
  assert.equal(t.state.player.credits, 360);
  t.sim.dispose();
});

test('a hard yank snaps the film, scatters the load, and pays nothing', () => {
  const t = boot();
  const events = collect(t, ['economy:grantCredits', 'encounter:receipt', 'encounter:voice', 'sectorsim:impulse']);
  const job = accept(t, 'snap');
  const dx = job.second.pos.x - job.first.pos.x;
  const dz = job.second.pos.z - job.first.pos.z;
  const dist = Math.hypot(dx, dz) || 1;
  job.first.vel.x = -dx / dist * 30;
  job.first.vel.z = -dz / dist * 30;
  job.second.vel.x = dx / dist * 30;
  job.second.vel.z = dz / dist * 30;
  t.sim.runTicks(70);
  assert.equal(completion(t)?.outcome, 'snapped');
  assert.equal(t.state.player.credits, 0);
  assert.equal(events.filter((row) => row.name === 'economy:grantCredits').length, 0);
  const pods = (t.state.entityList || []).filter((entity) => entity?.type === 'pickup' && entity.data?.kind === 'cargo');
  assert.ok(pods.length >= 1, 'the snapped load is recoverable cargo, not an explosion');
  assert.ok(events.some((row) => row.name === 'sectorsim:impulse' && row.payload.danger > 0));
  const receipt = events.find((row) => row.name === 'encounter:receipt');
  assertPlain(receipt.payload.text);
  assert.match(receipt.payload.text, /SNAPPED/i);
  t.sim.dispose();
});

test('the paired-delivery destination is the real hub, even when the hub is far (fix-r3b-6 finding 15)', () => {
  const t = boot();
  // Move the named hub thousands of WU away from the encounter anchor. The real
  // producer of the hub position is the named station row in the active sector.
  t.state.world.activeSector.stations = [
    { id: 'station_tethys', name: 'Tethys Trade Hub', pos: { x: 6000, z: 0 } },
  ];
  const job = accept(t, 'farhub');
  const service = live(t, job.id).vars.service;
  assert.ok(service, 'the encounter must name a paired-delivery destination');
  assert.ok(Math.hypot(service.x - 6000, service.z - 0) <= 40,
    `the paired-delivery point must be the real hub berth, got (${service.x}, ${service.z})`);
  // Towing the pair a short distance into open space must NOT award the hub ending.
  const midx = (job.first.pos.x + job.second.pos.x) / 2 + 110;
  const midz = (job.first.pos.z + job.second.pos.z) / 2;
  const dx = job.second.pos.x - job.first.pos.x;
  const dz = job.second.pos.z - job.first.pos.z;
  job.first.pos.x = midx - dx / 2;
  job.first.pos.z = midz - dz / 2;
  job.second.pos.x = midx + dx / 2;
  job.second.pos.z = midz + dz / 2;
  job.first.vel.x = 0;
  job.first.vel.z = 0;
  job.second.vel.x = 0;
  job.second.vel.z = 0;
  for (let i = 0; i < 40 && !completion(t); i += 1) t.sim.runTicks(10);
  assert.notEqual(completion(t)?.outcome, 'paired',
    'a short tow into open space thousands of WU from the named hub must not pay the hub ending');
  assert.equal(t.state.player.credits, 0, 'no hub credit lands for an open-space stop');
  t.sim.dispose();
});

test('a far hub is still reachable: towing the pair thousands of WU keeps the job live and pays at the berth', () => {
  const t = boot();
  const events = collect(t, ['economy:grantCredits']);
  t.state.world.activeSector.stations = [
    { id: 'station_tethys', name: 'Tethys Trade Hub', pos: { x: 4200, z: 0 } },
  ];
  const job = accept(t, 'longtow');
  const service = live(t, job.id).vars.service;
  assert.ok(Math.hypot(service.x - 4200, service.z) <= 40, 'destination is the real, far hub');
  const dx = job.second.pos.x - job.first.pos.x;
  const dz = job.second.pos.z - job.first.pos.z;
  const place = (x, z) => {
    job.first.pos.x = x - dx / 2; job.first.pos.z = z - dz / 2;
    job.second.pos.x = x + dx / 2; job.second.pos.z = z + dz / 2;
    for (const e of [job.first, job.second]) { e.vel.x = 0; e.vel.z = 0; }
    t.player.pos.x = x - 20; t.player.pos.z = z; // the player tows from just behind the pair
  };
  // Tow in 1,000 WU legs: the player never leaves the pair, but ends far from where the job began.
  for (let x = 1000; x < service.x - 500; x += 1000) {
    place(x, 0);
    t.sim.runTicks(30);
    assert.equal(completion(t), null, `the job is still live ${x} WU along the tow`);
  }
  place(service.x, service.z);
  t.sim.runTicks(70);
  assert.equal(completion(t)?.outcome, 'paired', 'arriving at the far hub with the film holding pays the pair ending');
  assert.equal(events.filter((row) => row.name === 'economy:grantCredits').length, 1);
  t.sim.dispose();
});
