// EXP-25 — the scavenger occupation switch as a real career change.
//
// The arc a player can now watch and steer: a picker crew posts a depot bond and flies their
// take in on a PROBATION ticket (a kill while the bond stands costs the killer two factions);
// the depot takes physical custody at the ring — the hold leaves the hull, lands in the real
// market as sell pressure, and a pilot who saw the haul in collects a manifest witness fee
// unless their standing with the bond holder is already hostile; the crew dwells offshift,
// then signs on for exactly one more honest leg — a second berth when the sector has one,
// the down-lane exit when it does not — and then the career is told.
//
// Pins: emit-after-latch under synchronous re-entrancy, id:occupantGeneration joins, hostile
// saves normalize dead/bounded, and the same units can never spill twice.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import {
  createScavengerOccupationSwitch,
  normalizeOccupationSwitch,
  scavengerPersonKey,
  scavengerWorldRecordId,
  OCCUPATION_SWITCH_MAX_PEOPLE,
} from '../src/systems/scavengerOccupationSwitch.js';

const SECTOR = 'sector_test';
const jobIdFor = (fieldId, seed = 7) => `job:${scavengerWorldRecordId(seed, fieldId)}`;

function station(id, stationId, factionId, x, z) {
  return {
    id, type: 'station', alive: true, factionId,
    pos: { x, z }, vel: { x: 0, z: 0 }, radius: 60, mass: 900,
    data: { stationId },
  };
}

function boot({ stationCount = 1, withPlayer = false, playerPos = null, docked = false, rep = 10, worldSystem = null } = {}) {
  const bus = createBus();
  const state = {
    simTime: 12,
    tick: 60,
    meta: { seed: 7 },
    run: null,
    playerId: 1,
    entities: new Map(),
    entityList: [],
    world: { currentSectorId: SECTOR, records: { byId: {} } },
    ui: { docked, dockedStationId: docked ? 'depot_test' : null },
    factions: {
      faction_reach: { rep },
      faction_meridian: { rep },
      faction_free: { rep },
    },
  };
  state.entities.set(50, station(50, 'depot_test', 'faction_meridian', 900, 0));
  state.entityList.push(state.entities.get(50));
  if (stationCount > 1) {
    // Far enough out that depot_test is always the switch destination; depot_far is the
    // second berth the recommission reaches for.
    state.entities.set(51, station(51, 'depot_far', 'faction_free', -8000, 300));
    state.entityList.push(state.entities.get(51));
  }
  if (withPlayer) {
    const pos = playerPos || { x: 900, z: 60 };
    const player = {
      id: 1, type: 'ship', alive: true, isPlayer: true,
      pos: { ...pos }, vel: { x: 0, z: 0 }, radius: 8, mass: 12, data: {},
    };
    state.entities.set(1, player);
    state.entityList.push(player);
  }
  const assigned = [];
  let nextId = 77;
  let nextGen = 500;
  const owner = {
    state, bus,
    registry: worldSystem ? { get: (name) => (name === 'world' ? worldSystem : null) } : null,
    helpers: {
      spawnEntity: (spec) => {
        const e = {
          id: nextId++, alive: true, type: 'ship',
          pos: { ...spec.pos }, vel: { x: 0, z: 0 }, mass: 14,
          occupantGeneration: nextGen++,
          data: spec.data, flags: spec.flags,
        };
        state.entities.set(e.id, e);
        state.entityList.push(e);
        return e;
      },
      npcJobs: {
        assign: (entity, job) => {
          entity.data.jobId = `job:${entity.data.worldRecordId}`;
          assigned.push({ entity, job });
          return entity.data.jobId;
        },
      },
    },
    _ensureState: () => (state.uniqueWrecks || (state.uniqueWrecks = {})),
  };
  const toasts = [];
  const events = [];
  bus.on('toast', (p) => toasts.push(p));
  for (const name of [
    'occupation:switched', 'occupation:licensed', 'occupation:delivered',
    'occupation:recommissioned', 'occupation:settled', 'occupation:lost',
    'economy:applyTradePressure', 'economy:grantCredits', 'faction:repDelta',
  ]) bus.on(name, (p) => events.push({ name, payload: p }));
  const sw = createScavengerOccupationSwitch(owner);
  const of = (name) => events.filter((e) => e.name === name).map((e) => e.payload);
  return { state, bus, sw, toasts, events, of, assigned, owner };
}

function depart(t, fieldId = 'field_a', holdQty = 5, hold = { cmdty_alloy: 5 }) {
  t.sw.departed({ fieldId, sectorId: SECTOR, entityId: null, holdQty, hold });
  return t.sw.status().find((row) => row.fieldId === fieldId);
}

function haulerOf(t, fieldId = 'field_a') {
  const record = t.state.uniqueWrecks.occupationSwitch
    .people[scavengerPersonKey(7, fieldId)];
  return record && record.haulerEntityId != null ? t.state.entities.get(record.haulerEntityId) : null;
}

test('the switch posts a depot bond on a probation ticket the player can scan', () => {
  const t = boot();
  const rec = depart(t);
  assert.equal(rec.phase, 'salvage_hauler');
  assert.ok(rec.bondCr >= 58 && rec.bondCr <= 154, `bond priced on the hold (${rec.bondCr})`);
  assert.equal(rec.probationUntilS, 12 + 90, 'the bonded window is a real clock');

  const hauler = haulerOf(t);
  assert.ok(hauler, 'a real hull carries the take');
  assert.equal(hauler.data.occupationSwitchBond, rec.bondCr, 'the bond rides on the hull');
  assert.match(hauler.data.scanLabel, /PROBATION/, 'the hull scans as a probation crew');
  assert.equal(hauler.data.cargo.items.cmdty_alloy, 5, 'the same goods are still aboard');

  const switched = t.of('occupation:switched');
  assert.equal(switched.length, 1);
  assert.equal(switched[0].bondCr, rec.bondCr);
  assert.equal(switched[0].destStationId, 'depot_test');
  assert.equal(switched[0].probationUntilS, rec.probationUntilS);
  assert.ok(t.toasts[0].text.includes('switched to hauling'));
  assert.ok(t.toasts[0].text.includes(`${rec.bondCr}cr`), 'the toast names the posted bond');
});

test('the probation clock licenses the hull exactly once', () => {
  const t = boot();
  const rec = depart(t);
  const hauler = haulerOf(t);

  t.state.simTime = rec.probationUntilS - 1;
  t.sw.sync();
  assert.match(hauler.data.scanLabel, /PROBATION/, 'still bonded inside the window');
  assert.equal(t.of('occupation:licensed').length, 0);

  t.state.simTime = rec.probationUntilS + 1;
  t.sw.sync();
  assert.match(hauler.data.scanLabel, /LICENSED/, 'the license lands on the clock edge');
  assert.equal(t.of('occupation:licensed').length, 1);
  t.sw.sync();
  assert.equal(t.of('occupation:licensed').length, 1, 'the license speaks once');
});

test('handover takes real custody: the hold leaves the hull and lands in the market once', () => {
  const t = boot();
  depart(t, 'field_a', 4, { cmdty_alloy: 3, cmdty_scrap_metal: 1 });
  const hauler = haulerOf(t);
  t.sw.jobComplete({ jobId: jobIdFor('field_a') });

  assert.deepEqual(hauler.data.cargo.items, {}, 'the depot took custody — no second spill');
  assert.equal(hauler.data.cargoDelivered, 4, 'the bill of lading stays on the hull');
  assert.match(hauler.data.scanLabel, /OFFSHIFT/, 'the crew reads offshift at the depot');

  const pressure = t.of('economy:applyTradePressure');
  assert.equal(pressure.length, 2, 'each commodity lands in the market once');
  assert.ok(pressure.every((p) => p.stationId === 'depot_test'));
  assert.equal(pressure.find((p) => p.good === 'cmdty_alloy').vol, 3);
  assert.equal(pressure.find((p) => p.good === 'cmdty_scrap_metal').vol, 1);

  // A duplicate completion receipt cannot spend the same hold into the market again.
  delete hauler.data.jobId;
  t.sw.jobComplete({ jobId: jobIdFor('field_a') });
  assert.equal(t.of('economy:applyTradePressure').length, 2, 'no double handover');
  assert.equal(t.of('occupation:delivered').length, 1);
});

test('a pilot who saw the haul in collects the manifest witness fee; a hostile is struck', () => {
  // Present at the ring — the fee posts.
  let t = boot({ withPlayer: true, playerPos: { x: 900, z: 400 } });
  depart(t);
  t.sw.jobComplete({ jobId: jobIdFor('field_a') });
  const grants = t.of('economy:grantCredits');
  assert.equal(grants.length, 1, 'the witness fee is an economy intent');
  assert.equal(grants[0].reason, 'occupation_switch:manifest_witness');
  const rec = t.sw.status()[0];
  assert.equal(grants[0].amount, Math.max(15, Math.round(rec.bondCr * 0.25)));
  assert.ok(t.toasts.some((x) => x.text.includes('manifest fee')), 'the fee speaks');
  assert.equal(t.of('occupation:delivered')[0].witnessed, true);

  // Docked at the depot counts as present even far away on the map.
  t = boot({ docked: true });
  depart(t);
  t.sw.jobComplete({ jobId: jobIdFor('field_a') });
  assert.equal(t.of('economy:grantCredits').length, 1, 'docked at the berth witnesses too');

  // Absent — no courtesy.
  t = boot();
  depart(t);
  t.sw.jobComplete({ jobId: jobIdFor('field_a') });
  assert.equal(t.of('economy:grantCredits').length, 0, 'nobody was there to post');

  // Hostile with the bond holder — the manifest strikes the name.
  t = boot({ withPlayer: true, rep: -50 });
  depart(t);
  t.sw.jobComplete({ jobId: jobIdFor('field_a') });
  assert.equal(t.of('economy:grantCredits').length, 0, 'hostile standing gates the fee');
  assert.ok(t.toasts.some((x) => x.text.includes('strikes your transponder')),
    'the strike says why');
  assert.equal(t.of('occupation:delivered')[0].witnessed, true, 'the attempt is still logged once');
});

test('a bonded hull killed by the player costs two standings — hardest during probation', () => {
  const t = boot({ withPlayer: true });
  const rec = depart(t);
  const hauler = haulerOf(t);
  t.state.simTime = rec.switchedAtS + 10; // inside the probation window
  t.sw.killed({ id: hauler.id, killerId: t.state.playerId });

  const rep = t.of('faction:repDelta');
  assert.equal(rep.length, 2, 'the crew and the bond holder both file');
  assert.deepEqual(
    { id: rep[0].factionId, delta: rep[0].delta },
    { id: 'faction_reach', delta: -6 },
  );
  assert.deepEqual(
    { id: rep[1].factionId, delta: rep[1].delta },
    { id: 'faction_meridian', delta: -3 },
  );
  assert.equal(rep[0].reason, 'occupation_switch:bonded_hauler');
  assert.ok(t.toasts.some((x) => x.text.includes('bond')),
    'the bond seizure is said out loud');
  assert.equal(t.sw.status()[0].phase, 'lost');
});

test('post-probation and non-player kills bill less; a settled-crew kill bills nothing extra', () => {
  let t = boot({ withPlayer: true });
  let rec = depart(t);
  t.state.simTime = rec.probationUntilS + 30; // licensed, still mid-contract
  const hauler = haulerOf(t);
  t.sw.killed({ id: hauler.id, killerId: t.state.playerId });
  assert.equal(t.of('faction:repDelta')[0].delta, -3, 'licensed mid-contract costs less');

  // A stranger's kill never files on the player.
  t = boot();
  depart(t);
  t.sw.killed({ id: haulerOf(t).id, killerId: 4242 });
  assert.equal(t.of('faction:repDelta').length, 0, 'not the player — no standing moves');
  assert.equal(t.sw.status()[0].phase, 'lost');

  // Murdered at dock after the handover: the take was already banked, the bond settled.
  t = boot({ withPlayer: true });
  depart(t);
  const hull = haulerOf(t);
  t.sw.jobComplete({ jobId: jobIdFor('field_a') });
  delete hull.data.jobId;
  t.sw.killed({ id: hull.id, killerId: t.state.playerId });
  assert.equal(t.sw.status()[0].phase, 'lost');
  assert.equal(t.of('faction:repDelta').length, 0, 'the bond was already settled — ordinary law owns it');
  assert.ok(t.toasts.some((x) => x.text.includes('murdered at their own depot')),
    'the dock murder names what actually happened');
});

test('the offshift dwell ends in a fresh start: a second berth when the sector has one', () => {
  const t = boot({ stationCount: 2 });
  const rec = depart(t);
  const hauler = haulerOf(t);
  t.sw.jobComplete({ jobId: jobIdFor('field_a') });
  delete hauler.data.jobId; // npcJobsRuntime releases the hull on completion
  const recAfter = t.sw.status()[0];
  assert.equal(recAfter.phase, 'delivered');

  t.state.simTime = recAfter.dwellUntilS - 1;
  t.sw.sync();
  assert.equal(t.sw.status()[0].phase, 'delivered', 'the dwell is a real stay');

  t.state.simTime = recAfter.dwellUntilS + 1;
  t.sw.sync();
  const settled = t.sw.status()[0];
  assert.equal(settled.phase, 'established', 'the crew signs on for a second leg');
  assert.equal(t.assigned.length, 2, 'a real second job is commissioned');
  assert.equal(t.assigned[1].job.payload.occupationSwitchLeg, 2);
  assert.equal(settled.leg2StationId, undefined, 'status hides internals');
  const record = t.state.uniqueWrecks.occupationSwitch.people[scavengerPersonKey(7, 'field_a')];
  assert.equal(record.leg2StationId, 'depot_far', 'the fresh start is a DIFFERENT berth');
  assert.equal(t.assigned[1].job.route[1].id, 'dest:depot_far');
  assert.match(hauler.data.scanLabel, /SIGNED ON/, 'the hull scans as a working hauler');
  assert.equal(t.of('occupation:recommissioned').length, 1);

  // Leg two lands: the career closes, the hull stays a citizen of its new berth.
  t.sw.jobComplete({ jobId: jobIdFor('field_a') });
  const done = t.sw.status()[0];
  assert.equal(done.phase, 'settled');
  assert.equal(done.legs, 2);
  assert.equal(hauler.alive, true, 'a settled crew stays parked at the new berth');
  assert.equal(t.of('occupation:settled').length, 1);
});

test('a single-depot sector sends the crew down-lane past the field line, gone for good', () => {
  const t = boot({ stationCount: 1 });
  depart(t);
  const hauler = haulerOf(t);
  t.sw.jobComplete({ jobId: jobIdFor('field_a') });
  delete hauler.data.jobId;
  const rec = t.state.uniqueWrecks.occupationSwitch.people[scavengerPersonKey(7, 'field_a')];
  t.state.simTime = rec.dwellUntilS + 1;
  t.sw.sync();
  assert.equal(rec.phase, 'established');
  assert.equal(rec.leg2StationId, null, 'no second berth — the exit is outbound');
  assert.equal(t.assigned[1].job.route[1].id, 'downlane:out');
  const leg = t.assigned[1].job.route[1].pos;
  assert.ok(Math.hypot(leg.x - hauler.pos.x, leg.z - hauler.pos.z) > 1000,
    'the exit is a real flight, not a parked rename');

  t.sw.jobComplete({ jobId: jobIdFor('field_a') });
  assert.equal(rec.phase, 'settled');
  assert.equal(hauler.alive, false, 'the crew is gone down-lane — same law as the scavenger');
});

test('the down-lane despawn buries the durable row — no ghost crew on the next visit', () => {
  // A durable body keeps its world row unless told: entity:destroyed never marks records
  // (world.js only marks on entity:killed / boss / custody), so a bare alive=false would
  // leave a live row that rematerializes the "gone for good" crew — faction_frontier's
  // settled-claim despawn is the precedent. The settle must retire the row it spawned.
  const buried = [];
  const worldSystem = {
    markWorldRecordDestroyed: (recordId, opts) => {
      buried.push({ recordId, outcome: opts && opts.outcome });
      const row = t.state.world.records.byId[recordId];
      if (row) { row.alive = false; row.outcome = (opts && opts.outcome) || 'destroyed'; }
      return row || null;
    },
  };
  const t = boot({ stationCount: 1, worldSystem });
  depart(t);
  const hauler = haulerOf(t);
  const worldRecordId = scavengerWorldRecordId(7, 'field_a');
  assert.equal(hauler.data.worldRecordId, worldRecordId);
  // A shelved row exists from an earlier sector leave — the stale-alive case.
  t.state.world.records.byId[worldRecordId] = { recordId: worldRecordId, alive: true, outcome: 'active' };

  t.sw.jobComplete({ jobId: jobIdFor('field_a') });
  delete hauler.data.jobId;
  const rec = t.state.uniqueWrecks.occupationSwitch.people[scavengerPersonKey(7, 'field_a')];
  t.state.simTime = rec.dwellUntilS + 1;
  t.sw.sync();
  assert.equal(rec.phase, 'established');
  assert.equal(rec.leg2StationId, null, 'no second berth — the exit is outbound');
  assert.equal(buried.length, 0, 'nothing is buried while the arc still flies');

  t.sw.jobComplete({ jobId: jobIdFor('field_a'), payload: { occupationSwitchLeg: 2 } });
  assert.equal(rec.phase, 'settled');
  assert.equal(hauler.alive, false);
  assert.deepEqual(buried, [{ recordId: worldRecordId, outcome: 'departed' }],
    'the row is retired exactly once — the world keeps them gone');
  assert.equal(t.state.world.records.byId[worldRecordId].alive, false);
});

test('a mid-flight save restores the bonded hull — same person, same probation', () => {
  let t = boot();
  const rec = depart(t);
  const saved = JSON.parse(JSON.stringify(t.state.uniqueWrecks.occupationSwitch));
  const hauler = haulerOf(t);

  // Continue in a fresh host: the live entity table is empty; the durable record rules.
  const state2 = {
    simTime: rec.switchedAtS + 5, tick: 500, meta: { seed: 7 }, run: null,
    playerId: 1, entities: new Map(), entityList: [],
    world: { currentSectorId: SECTOR, records: { byId: {} } },
    ui: { docked: false, dockedStationId: null }, factions: {},
    uniqueWrecks: { occupationSwitch: normalizeOccupationSwitch(saved) },
  };
  state2.entities.set(50, station(50, 'depot_test', 'faction_meridian', 900, 0));
  state2.entityList.push(state2.entities.get(50));
  const bus2 = createBus();
  const events2 = [];
  for (const name of ['occupation:switched', 'occupation:licensed', 'toast']) {
    bus2.on(name, (p) => events2.push({ name, payload: p }));
  }
  let nextId2 = 900;
  const assigned2 = [];
  const sw2 = createScavengerOccupationSwitch({
    state: state2, bus: bus2,
    helpers: {
      spawnEntity: (spec) => {
        const e = {
          id: nextId2++, alive: true, type: 'ship', pos: { ...spec.pos },
          vel: { x: 0, z: 0 }, data: spec.data, occupantGeneration: nextId2,
        };
        state2.entities.set(e.id, e);
        state2.entityList.push(e);
        return e;
      },
      npcJobs: {
        assign: (entity, job) => {
          entity.data.jobId = `job:${entity.data.worldRecordId}`;
          assigned2.push({ entity, job });
          return entity.data.jobId;
        },
      },
    },
    _ensureState: () => state2.uniqueWrecks,
  });

  sw2.sync();
  const restored = state2.entityList.find((e) => e.data?.occupationSwitchPerson === rec.personKey);
  assert.ok(restored, 'the hauler rematerializes from its own record');
  assert.equal(restored.data.worldRecordId, scavengerWorldRecordId(7, 'field_a'));
  assert.equal(restored.data.cargo.items.cmdty_alloy, 5, 'the same goods ride the restore');
  assert.match(restored.data.scanLabel, /PROBATION/, 'the bond window survives the envelope');
  assert.equal(restored.data.occupationSwitchBond, rec.bondCr, 'the same bond is on the hull');
  assert.equal(assigned2.length, 1, 'the delivery job is re-commissioned');
  assert.equal(events2.filter((e) => e.name === 'occupation:switched').length, 0,
    'no second switch — the person record is the identity');

  // The restore does not forget the probation clock either.
  state2.simTime = rec.probationUntilS + 2;
  sw2.sync();
  assert.match(restored.data.scanLabel, /LICENSED/, 'the license edge fires after restore');
  assert.ok(hauler !== restored, 'a new body, the same person');
});

test('hostile saves normalize dead: foreign phases close, hostile holds are freight-bounded', () => {
  const hostile = normalizeOccupationSwitch({
    people: {
      a: { phase: 'salvage_hauler', holdQty: 1e12, hold: { cmdty_alloy: 1e12 } },
      b: { phase: 'overlord', holdQty: 3 },
      c: { phase: 'delivered', dwellUntilS: -40, legs: 99 },
      d: 'garbage',
      e: { phase: 'established', fieldPos: { x: NaN, z: 'x' }, destPos: 'nowhere' },
    },
  });
  assert.equal(hostile.people.a.phase, 'salvage_hauler', 'a live phase survives');
  assert.equal(hostile.people.a.holdQty, 10000, 'the hostile hold is freight-bounded');
  assert.equal(hostile.people.a.hold.cmdty_alloy, 10000,
    'a hostile manifest line cannot smuggle unbounded sell pressure');
  assert.equal(hostile.people.b.phase, 'spent', 'a foreign phase normalizes dead');
  assert.equal(hostile.people.c.dwellUntilS, null, 'a negative dwell heals to unset');
  assert.equal(hostile.people.c.legs, 2, 'legs are clamped to the career');
  assert.equal(hostile.people.d, undefined, 'non-object rows drop');
  assert.equal(hostile.people.e.fieldPos, null, 'non-finite positions normalize out');
  assert.equal(hostile.people.e.phase, 'established');
  assert.equal(hostile.schemaVersion, 'spaceface.occupationSwitch.v1');
});

test('emits always land after the latch — re-entrant receipts see the settled phase', () => {
  const t = boot({ withPlayer: true });
  const seen = { switched: null, delivered: null, grant: null };
  const people = () => t.state.uniqueWrecks.occupationSwitch.people;
  const phaseOf = () => people()[scavengerPersonKey(7, 'field_a')]?.phase;
  t.bus.on('occupation:switched', () => {
    seen.switched = phaseOf();
    // Re-entrant duplicate departure must hit the latch, not re-fire the switch.
    t.sw.departed({ fieldId: 'field_a', sectorId: SECTOR, entityId: null, holdQty: 9, hold: { cmdty_alloy: 9 } });
  });
  t.bus.on('economy:grantCredits', () => {
    seen.grant = phaseOf();
  });
  t.bus.on('occupation:delivered', () => {
    seen.delivered = phaseOf();
    // Re-entrant duplicate completion must not re-spend the hold.
    t.sw.jobComplete({ jobId: jobIdFor('field_a') });
  });

  t.sw.departed({ fieldId: 'field_a', sectorId: SECTOR, entityId: null, holdQty: 5, hold: { cmdty_alloy: 5 } });
  assert.equal(seen.switched, 'salvage_hauler', 'the switch emit meets the latched phase');
  assert.equal(t.of('occupation:switched').length, 1, 'the re-entrant departed stayed quiet');
  assert.equal(people()[scavengerPersonKey(7, 'field_a')].holdQty, 5, 'the first receipt won');

  const hauler = haulerOf(t);
  t.sw.jobComplete({ jobId: jobIdFor('field_a') });
  assert.equal(seen.grant, 'delivered', 'the money intent meets a delivered record');
  assert.equal(seen.delivered, 'delivered');
  assert.equal(t.of('economy:applyTradePressure').length, 1, 'one market landing, once');
  assert.equal(t.of('economy:grantCredits').length, 1, 'one witness fee, once');
  assert.equal(t.of('occupation:delivered').length, 1);
  assert.deepEqual(hauler.data.cargo.items, {});
});

test('a recycled entity id cannot borrow the kill — the generation is the witness', () => {
  const t = boot({ withPlayer: true });
  depart(t);
  const hauler = haulerOf(t);
  const record = t.state.uniqueWrecks.occupationSwitch.people[scavengerPersonKey(7, 'field_a')];
  const staleId = hauler.id;

  // The hull is gone and its id reissued to a stranger: same numeric id, different occupant.
  t.state.entities.delete(staleId);
  const stranger = {
    id: staleId, alive: true, type: 'ship', occupantGeneration: 9999,
    pos: { x: 0, z: 0 }, data: { name: 'Stranger' },
  };
  t.state.entities.set(staleId, stranger);
  t.sw.killed({ id: staleId, killerId: t.state.playerId });
  assert.equal(record.phase, 'salvage_hauler', 'a recycled id is not the crew');
  assert.equal(t.of('occupation:lost').length, 0);
  assert.equal(t.of('faction:repDelta').length, 0, 'the stranger\'s death files nothing');

  // The stamped hull itself still closes the record (the person key on data is the join).
  t.state.entities.delete(staleId);
  t.state.entities.set(staleId, hauler);
  t.sw.killed({ id: staleId, killerId: t.state.playerId });
  assert.equal(record.phase, 'lost', 'the real hull is the death');
  assert.equal(t.of('occupation:lost').length, 1);
});

test('the people ledger is bounded — closed arcs recycle before live crews', () => {
  const t = boot();
  for (let i = 0; i < OCCUPATION_SWITCH_MAX_PEOPLE + 4; i++) {
    t.sw.departed({
      fieldId: `field_${i}`, sectorId: SECTOR, entityId: null,
      holdQty: 2, hold: { cmdty_alloy: 2 },
    });
    if (i % 2 === 0) t.sw.jobComplete({ jobId: jobIdFor(`field_${i}`) });
  }
  const people = t.state.uniqueWrecks.occupationSwitch.people;
  assert.ok(Object.keys(people).length <= OCCUPATION_SWITCH_MAX_PEOPLE,
    `the cast is bounded (${Object.keys(people).length})`);
  const open = Object.values(people).filter((r) => r.phase === 'salvage_hauler');
  assert.ok(open.length >= 1, 'a live crew is never evicted for a closed one');
});

test('empty departures and dead sectors still close quietly', () => {
  const t = boot();
  t.sw.departed({ fieldId: 'field_e', sectorId: SECTOR, entityId: null, holdQty: 0, hold: {} });
  assert.equal(t.sw.status()[0].phase, 'spent');
  assert.equal(t.toasts.length, 0);

  // A departure in a sector the player is not in: no honest hull can be stood up at a depot
  // nobody can see — the record notes the release and closes.
  t.sw.departed({ fieldId: 'field_x', sectorId: 'sector_elsewhere', entityId: null, holdQty: 5, hold: { cmdty_alloy: 5 } });
  assert.equal(t.sw.status().find((r) => r.fieldId === 'field_x').phase, 'spent',
    'no depot in reach — no physical switch is honest');
  assert.equal(t.of('occupation:switched').length, 0);
});

test('the production kill wire lands on a corpse — alive is already false at emit', () => {
  // combat.kill latches t.alive = false BEFORE bus.emit('entity:killed'), and the corpse stays
  // in the entity table until the lifetime sweep. Identity is the join — never liveness.
  const t = boot({ withPlayer: true });
  const rec = depart(t);
  const hauler = haulerOf(t);
  hauler.alive = false; // the real wire's shape: the body is dead when the receipt arrives
  t.sw.killed({ id: hauler.id, killerId: t.state.playerId });
  assert.equal(t.sw.status()[0].phase, 'lost', 'a dead-on-arrival hull still closes');
  assert.equal(t.of('occupation:lost').length, 1);
  const rep = t.of('faction:repDelta');
  assert.equal(rep.length, 2, 'the two-faction probation bill still lands on a corpse');
  assert.equal(rep[0].delta, -6, 'in-window: the expensive kill');
  assert.equal(rep[1].factionId, 'faction_meridian', 'the bond holder files too');

  // The same wire without a player signature still closes the record.
  const t2 = boot();
  depart(t2, 'field_b', 3, { cmdty_alloy: 3 });
  const h2 = haulerOf(t2, 'field_b');
  h2.alive = false;
  t2.sw.killed({ id: h2.id, killerId: 4242 });
  assert.equal(t2.sw.status()[0].phase, 'lost');
  assert.equal(t2.of('occupation:lost').length, 1);
  assert.equal(t2.of('faction:repDelta').length, 0, 'unsigned deaths file nothing');
});

test('a corpse already swept from the table still closes the record on its stored id', () => {
  const t = boot();
  depart(t);
  const hauler = haulerOf(t);
  const staleId = hauler.id;
  // The body is gone entirely — the durable record's pinned id is the only witness left.
  t.state.entities.delete(staleId);
  t.state.entityList = t.state.entityList.filter((e) => e !== hauler);
  t.sw.killed({ id: staleId, killerId: 4242 });
  assert.equal(t.sw.status()[0].phase, 'lost');
  assert.equal(t.of('occupation:lost').length, 1);
});

test('a buried world record closes the arc — never a wedge, never a resurrection', () => {
  // Mid-flight, killed while shelved (or a hostile save): the world row is dead, the near
  // table has no hull — the person must close 'lost', not wait on a corpse forever.
  let t = boot();
  depart(t);
  const wrId = scavengerWorldRecordId(7, 'field_a');
  let record = t.state.uniqueWrecks.occupationSwitch.people[scavengerPersonKey(7, 'field_a')];
  const gone = haulerOf(t);
  t.state.entities.delete(gone.id);
  t.state.entityList = t.state.entityList.filter((e) => e !== gone);
  t.sw.clear();
  t.state.world.records.byId[wrId] = { recordId: wrId, alive: false, outcome: 'destroyed' };
  t.sw.sync();
  assert.equal(record.phase, 'lost', 'a buried hull closes the person');
  assert.equal(t.of('occupation:lost').length, 1);
  assert.equal(t.of('occupation:lost')[0].holdQty, 5, 'the take died with the hull');
  assert.equal(t.of('faction:repDelta').length, 0, 'no signature on a heal — no billing');
  assert.ok(!t.state.entityList.some((e) => e.data?.occupationSwitchPerson === record.personKey),
    'a buried crew is never resurrected');
  t.sw.sync();
  assert.equal(t.of('occupation:lost').length, 1, 'the heal speaks once');

  // Offshift at the depot when the hull was destroyed: same close, same finality.
  t = boot();
  depart(t);
  const dweller = haulerOf(t);
  t.sw.jobComplete({ jobId: jobIdFor('field_a') });
  record = t.state.uniqueWrecks.occupationSwitch.people[scavengerPersonKey(7, 'field_a')];
  assert.equal(record.phase, 'delivered');
  t.state.entities.delete(dweller.id);
  t.state.entityList = t.state.entityList.filter((e) => e !== dweller);
  t.sw.clear();
  t.state.world.records.byId[wrId] = { recordId: wrId, alive: false, outcome: 'destroyed' };
  t.state.simTime = record.dwellUntilS + 1;
  t.sw.sync();
  assert.equal(record.phase, 'lost', 'a buried offshift hull is a loss, not a settle');

  // And a live shelved row still waits — rematerialization stays possible.
  t = boot();
  depart(t);
  const shelved = haulerOf(t);
  record = t.state.uniqueWrecks.occupationSwitch.people[scavengerPersonKey(7, 'field_a')];
  t.state.entities.delete(shelved.id);
  t.state.entityList = t.state.entityList.filter((e) => e !== shelved);
  t.sw.clear();
  t.state.world.records.byId[wrId] = { recordId: wrId, alive: true };
  t.sw.sync();
  assert.equal(record.phase, 'salvage_hauler', 'a live shelved row still waits its hull');
  assert.equal(t.of('occupation:lost').length, 0);
});

test('a replayed leg-1 receipt cannot settle the second leg early', () => {
  // Both legs mint the same deterministic jobId — the kernel echoes the spec's leg stamp on
  // the wire, so a stale leg-1 complete is provably not the second landing.
  const personKey = scavengerPersonKey(7, 'field_a');
  const t = boot({ stationCount: 2 });
  depart(t);
  const hauler = haulerOf(t);
  t.sw.jobComplete({ jobId: jobIdFor('field_a'), payload: { occupationSwitch: personKey, occupationSwitchLeg: 1 } });
  delete hauler.data.jobId;
  const record = t.state.uniqueWrecks.occupationSwitch.people[personKey];
  t.state.simTime = record.dwellUntilS + 1;
  t.sw.sync();
  assert.equal(record.phase, 'established');

  t.sw.jobComplete({ jobId: jobIdFor('field_a'), payload: { occupationSwitch: personKey, occupationSwitchLeg: 1 } });
  assert.equal(record.phase, 'established', 'a replayed first-leg receipt settles nothing');
  assert.equal(t.of('occupation:settled').length, 0);

  t.sw.jobComplete({ jobId: jobIdFor('field_a'), payload: { occupationSwitch: personKey, occupationSwitchLeg: 2 } });
  assert.equal(record.phase, 'settled', 'the genuine second landing still closes the career');
  assert.equal(t.of('occupation:settled').length, 1);
});

test('a replayed leg-1 receipt cannot despawn a down-lane hull at the depot', () => {
  const personKey = scavengerPersonKey(7, 'field_a');
  const t = boot({ stationCount: 1 });
  depart(t);
  const hauler = haulerOf(t);
  t.sw.jobComplete({ jobId: jobIdFor('field_a'), payload: { occupationSwitch: personKey, occupationSwitchLeg: 1 } });
  delete hauler.data.jobId;
  const record = t.state.uniqueWrecks.occupationSwitch.people[personKey];
  t.state.simTime = record.dwellUntilS + 1;
  t.sw.sync();
  assert.equal(record.phase, 'established');
  assert.equal(record.leg2StationId, null, 'the recommission is the outbound exit');

  t.sw.jobComplete({ jobId: jobIdFor('field_a'), payload: { occupationSwitch: personKey, occupationSwitchLeg: 1 } });
  assert.equal(record.phase, 'established', 'the stale receipt never lands leg two');
  assert.equal(hauler.alive, true, 'a parked hull is not a down-lane exit');
});

test('a hostile save cannot carry an unbounded cast — the ledger bound holds at the seam', () => {
  const people = {};
  for (let i = 0; i < OCCUPATION_SWITCH_MAX_PEOPLE + 28; i++) {
    people[`k${i}`] = i < 3
      ? { phase: 'salvage_hauler', holdQty: 2, switchedAtS: i }
      : { phase: 'settled', settledAtS: i, switchedAtS: i };
  }
  const healed = normalizeOccupationSwitch({ people });
  assert.ok(Object.keys(healed.people).length <= OCCUPATION_SWITCH_MAX_PEOPLE,
    `the cast is bounded at the seam (${Object.keys(healed.people).length})`);
  assert.equal(
    Object.values(healed.people).filter((r) => r.phase === 'salvage_hauler').length, 3,
    'live crews survive the bound — closed arcs evict first',
  );
});

test('a settled crew hull returns to ordinary bookkeeping — the save drops the parked body', () => {
  // The career is told, so the hull must stop being this module's serialized body. A parked
  // citizen still wearing flags.persistent + a foreign persistenceOwner + no homeSectorId can
  // never be captured, demoted, or evicted — it would ride the entity table and the persistent
  // save envelope forever, one permanent hull per closed career.
  const personKey = scavengerPersonKey(7, 'field_a');
  const t = boot({ stationCount: 2 });
  depart(t);
  const hauler = haulerOf(t);
  assert.equal(hauler.flags?.persistent, true, 'mid-career the hull is still our serialized body');
  assert.equal(hauler.data.persistenceOwner, 'uniqueWrecks:occupationSwitch');
  t.sw.jobComplete({ jobId: jobIdFor('field_a'), payload: { occupationSwitch: personKey, occupationSwitchLeg: 1 } });
  delete hauler.data.jobId;
  const record = t.state.uniqueWrecks.occupationSwitch.people[personKey];
  t.state.simTime = record.dwellUntilS + 1;
  t.sw.sync();
  assert.equal(record.phase, 'established');
  assert.equal(record.leg2StationId, 'depot_far');
  t.sw.jobComplete({ jobId: jobIdFor('field_a'), payload: { occupationSwitch: personKey, occupationSwitchLeg: 2 } });
  assert.equal(record.phase, 'settled');
  assert.equal(hauler.alive, true, 'the crew stays a citizen of its new berth');
  assert.notEqual(hauler.flags?.persistent, true, 'the serialized mark is released');
  assert.equal(hauler.data.persistenceOwner, undefined, 'generic durable capture can claim the hull');
  assert.equal(hauler.homeSectorId, SECTOR, 'home-stamped so residency teardown can demote it');
  assert.equal(hauler.data.homeSectorId, SECTOR);
});

test('a depot that never signs settles the crew parked — the same close, the same release', () => {
  // The refusal cap is the same close as a landed leg two: one spoken settle, and the parked
  // hull released to ambient life — not silently pinned to this module forever.
  const personKey = scavengerPersonKey(7, 'field_a');
  const t = boot({ stationCount: 1 });
  depart(t);
  const hauler = haulerOf(t);
  t.sw.jobComplete({ jobId: jobIdFor('field_a'), payload: { occupationSwitch: personKey, occupationSwitchLeg: 1 } });
  delete hauler.data.jobId;
  const record = t.state.uniqueWrecks.occupationSwitch.people[personKey];
  t.state.simTime = record.dwellUntilS + 1;
  t.owner.helpers.npcJobs.assign = () => null; // the depot will not sign
  t.sw.sync();
  t.sw.sync();
  assert.equal(record.phase, 'delivered', 'two refusals — the crew keeps trying');
  assert.equal(record.leg2Attempts, 2);
  t.sw.sync();
  assert.equal(record.phase, 'settled', 'the refusal cap closes the career');
  assert.equal(record.leg2Attempts, 3, 'the attempt count is bounded and honest');
  assert.equal(t.of('occupation:settled').length, 1, 'the close is spoken once');
  assert.equal(hauler.alive, true, 'the crew stays at the depot that refused it');
  assert.notEqual(hauler.flags?.persistent, true, 'a parked crew is not a serialized body forever');
  assert.equal(hauler.data.persistenceOwner, undefined);
  assert.equal(hauler.homeSectorId, SECTOR);
  t.sw.sync();
  assert.equal(t.of('occupation:settled').length, 1, 'settled is final — no repeat close');
});

test('a live record evicted by the ledger bound releases its hull — no permanent ghost', () => {
  // Records stay live while their sector is elsewhere, so the cast can fill with open arcs.
  // When the bound must evict a live record, the hull keeps its freight but loses this
  // module's marks — otherwise it rides the entity table and the persistent save envelope
  // forever, the same leak the settle path closes.
  const releasedJobs = [];
  const t = boot();
  t.owner.helpers.npcJobs.release = (jobId) => { releasedJobs.push(jobId); return true; };
  const haulers = new Map();
  for (let i = 0; i < OCCUPATION_SWITCH_MAX_PEOPLE + 1; i++) {
    depart(t, `field_${i}`, 2, { cmdty_alloy: 2 });
    haulers.set(`field_${i}`, haulerOf(t, `field_${i}`));
  }
  const people = t.state.uniqueWrecks.occupationSwitch.people;
  assert.equal(Object.keys(people).length, OCCUPATION_SWITCH_MAX_PEOPLE, 'the cast is bounded');
  assert.equal(people[scavengerPersonKey(7, 'field_0')], undefined, 'the oldest arc was evicted');

  const ghost = haulers.get('field_0');
  assert.ok(ghost, 'the evicted hull is still live');
  assert.notEqual(ghost.flags?.persistent, true, 'the serialized mark is released');
  assert.equal(ghost.data.persistenceOwner, undefined, 'generic durable capture can claim it');
  assert.equal(ghost.homeSectorId, SECTOR, 'home-stamped so residency can demote it');
  assert.deepEqual(ghost.data.cargo.items, { cmdty_alloy: 2 }, 'the hull keeps its freight');
  assert.ok(releasedJobs.includes(jobIdFor('field_0')), 'the orphaned job went back to the runtime');
});

test('a heal-settle speaks the close exactly once — delivered and established alike', () => {
  // The hull vanished untracked (no kill receipt, no world row): the arc still latches
  // 'settled' and speaks it — the same once-only close every other settle path emits.
  let t = boot();
  depart(t);
  let hauler = haulerOf(t);
  t.sw.jobComplete({ jobId: jobIdFor('field_a') });
  delete hauler.data.jobId;
  let record = t.state.uniqueWrecks.occupationSwitch.people[scavengerPersonKey(7, 'field_a')];
  assert.equal(record.phase, 'delivered');
  t.state.entities.delete(hauler.id);
  t.state.entityList = t.state.entityList.filter((e) => e !== hauler);
  t.sw.clear();
  t.state.simTime = record.dwellUntilS + 1;
  t.sw.sync();
  assert.equal(record.phase, 'settled', 'an untracked dweller closes the career');
  assert.equal(t.of('occupation:settled').length, 1, 'the heal-settle is spoken');
  assert.equal(t.of('occupation:settled')[0].legs, 1, 'no phantom leg is claimed');
  t.sw.sync();
  assert.equal(t.of('occupation:settled').length, 1, 'settled is final — no repeat close');

  // The 'established' heal: recommissioned, then the hull vanishes with no row.
  t = boot({ stationCount: 2 });
  depart(t);
  hauler = haulerOf(t);
  t.sw.jobComplete({ jobId: jobIdFor('field_a') });
  delete hauler.data.jobId;
  record = t.state.uniqueWrecks.occupationSwitch.people[scavengerPersonKey(7, 'field_a')];
  t.state.simTime = record.dwellUntilS + 1;
  t.sw.sync();
  assert.equal(record.phase, 'established');
  t.state.entities.delete(hauler.id);
  t.state.entityList = t.state.entityList.filter((e) => e !== hauler);
  t.sw.clear();
  t.sw.sync();
  assert.equal(record.phase, 'settled', 'a second leg with no body cannot re-materialize');
  assert.equal(t.of('occupation:settled').length, 1, 'the heal-settle is spoken once');
  t.sw.sync();
  assert.equal(t.of('occupation:settled').length, 1, 'still final');
});

test('hostile entity ids normalize dead — booleans and empty strings never pin a hull', () => {
  const healed = normalizeOccupationSwitch({
    people: {
      a: { phase: 'salvage_hauler', holdQty: 2, haulerEntityId: true, haulerEntityGen: '' },
      b: { phase: 'delivered', haulerEntityId: -9, haulerEntityGen: -1 },
    },
  });
  assert.equal(healed.people.a.haulerEntityId, null, 'true is not entity id 1');
  assert.equal(healed.people.a.haulerEntityGen, null, "'' is not generation 0");
  assert.equal(healed.people.b.haulerEntityId, null, 'a negative id never names a hull');
  assert.equal(healed.people.b.haulerEntityGen, null);
});

test('an adopted hull re-stamps this module\'s ownership — same marks as a fresh spawn', () => {
  const t = boot();
  const wrId = scavengerWorldRecordId(7, 'field_a');
  const stray = {
    id: 66, alive: true, type: 'ship',
    pos: { x: 300, z: 0 }, vel: { x: 0, z: 0 }, mass: 10,
    data: { worldRecordId: wrId, cargo: { items: { cmdty_gold: 9 } } },
    flags: {},
  };
  t.state.entities.set(66, stray);
  t.state.entityList.push(stray);

  t.sw.departed({ fieldId: 'field_a', sectorId: SECTOR, entityId: null, holdQty: 5, hold: { cmdty_alloy: 5 } });
  assert.equal(stray.data.occupationSwitchPerson, scavengerPersonKey(7, 'field_a'), 'the stray is adopted');
  assert.equal(stray.data.persistenceOwner, 'uniqueWrecks:occupationSwitch',
    'the module owns its adopted body');
  assert.equal(stray.flags.persistent, true, 'the adopted hull rides the save envelope');
  assert.equal(stray.data.sectorId, SECTOR);
  assert.deepEqual(stray.data.cargo.items, { cmdty_alloy: 5 },
    'adoption replaces custody — the old life\'s goods never spill');
  assert.equal(t.assigned.length, 1, 'one job commissioned on the adopted hull');
});
