import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { ENCOUNTERS } from '../src/data/encounters/index.generated.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { encounterDirector, planEncounters } from '../src/systems/encounterDirector.js';
import { EIGHTH_BELL_RUNTIME } from '../src/systems/eighthBellRuntime.js';
import { economy } from '../src/systems/economy.js';

const SECTOR = 'sector_vesta_forge';
const SHAPE = 'the_eighth_bell';
const CATHEDRAL = Object.freeze({ x: -330, z: 1060 }); // sector-local POI pos, used as the test's world-space berth

function boot(seed = 4242) {
  const sim = createSimulation({ seed, systems: [economy, encounterDirector] });
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 100, hull: 100, hullMax: 100,
    data: { intent: {}, ai: {} },
  });
  sim.state.playerId = player.id;
  sim.state.mode = 'flight';
  sim.state.world.currentSectorId = SECTOR;
  // The world system owns activeSector; the focused harness furnishes the berth target and
  // depot fallback directly so the runtime resolves its real reader, not a stub.
  sim.state.world.activeSector = {
    stations: [{ id: 'station_depot3', name: 'Refuel Depot', pos: { x: 700, z: 900 } }],
    pois: [{ poiId: 'poi_vesta_resonant_cathedral', type: 'anomaly', pos: { ...CATHEDRAL } }],
  };
  return { sim, state: sim.state, bus: sim.bus, director: sim.registry.get('encounterDirector') };
}

function force(t, suffix = 'a', options = {}) {
  t.state.world.currentSectorId = SECTOR;
  const encounterId = `debug:bell:${suffix}`;
  const result = t.director.requestAuthoredEncounter({
    shapeId: SHAPE,
    encounterId,
    sectorId: SECTOR,
    anchor: options.anchor || { x: 0, z: 0 },
    force: options.force !== false,
    data: options.data || {},
  });
  assert.equal(result.ok, true, `${SHAPE}/${suffix}: ${JSON.stringify(result)}`);
  return encounterId;
}

function choose(t, encounterId, choiceId) {
  t.bus.emit('encounter:choose', { encounterId, choiceId });
}

function completion(t, shapeId = SHAPE) {
  return t.state.story.depthProgramEncounters?.completed?.[shapeId] || null;
}

function collect(t, names) {
  const rows = [];
  for (const name of names) t.bus.on(name, (payload) => rows.push({ name, payload }));
  return rows;
}

function live(t, encounterId) {
  return t.state.encounterDirector.live[encounterId];
}

function bellOf(t, encounterId) {
  const rec = live(t, encounterId);
  return t.state.entities.get(rec.vars.bellId);
}

test('the Eighth Bell plans on the Vesta Forge approach and nowhere else', () => {
  const shape = ENCOUNTERS[SHAPE];
  assert.ok(shape, 'catalog must contain the encounter');
  assert.equal(shape.script, 'selfRegistered');
  let planned = null;
  for (let day = 0; day < 80 && !planned; day += 1) {
    planned = planEncounters(4242, SECTOR, day,
      zonesForSector(SECTOR), null, { [shape.id]: shape })
      .find((row) => row.shapeId === shape.id) || null;
  }
  assert.ok(planned, 'the seeded civilian deck must eventually select the Eighth Bell');
  assert.equal(planned.zoneId, 'zone_vesta_forge');
  for (let day = 0; day < 40; day += 1) {
    const rows = planEncounters(4242, 'sector_helios_prime', day,
      zonesForSector('sector_helios_prime'), null, { [shape.id]: shape });
    assert.equal(rows.length, 0, `the bell must not leak outside Vesta (day ${day})`);
  }
});

test('firing spawns the dead barge, two wardens, and a tetherable bell body', () => {
  const t = boot();
  const id = force(t, 'cast');
  const rec = live(t, id);
  assert.equal(rec.ids.length, 4, 'barge + two wardens + the bell prop');
  const byRole = {};
  for (const entId of rec.ids) byRole[rec.roles[entId]] = t.state.entities.get(entId);
  assert.equal(byRole.barge.data.defId, 'ship_atlas', 'the chapel-barge is the 200-mass hauler');
  assert.equal(byRole.barge.data.ai.passive, true);
  assert.equal(byRole.barge.data.ai.spawnContext, 'convoy_civilian');
  assert.notEqual(byRole.barge.data.masslineTetherable, true,
    'the independent barge cannot advertise a tow target that does not move the tracked bell');
  assert.equal(byRole.warden.data.defId, 'ship_wasp', 'wardens fly choir_zealot hulls');
  const bell = byRole.bell;
  assert.ok(bell, 'the bell must be a physical contact, not a line of text');
  assert.equal(bell.data.masslineTetherable, true);
  assert.equal(bell.mass, 60);
  assert.ok(bell.hull > 1, 'a cathedral bell soaks more than one stray shot');
  assert.equal(live(t, id).phase, 'offer');
});

test('roping the bell starts the tow; a fast bell tolls and berthing resolves', () => {
  const t = boot();
  const events = collect(t, [
    'encounter:voice', 'sectorsim:impulse', 'audio:cue',
    'economy:grantCredits', 'faction:repDelta', 'news:publish', 'encounter:resolved',
  ]);
  const id = force(t, 'tow');
  const rec = live(t, id);
  const bell = bellOf(t, id);

  // The barge and bell are independent bodies. Only attaching to the objective body may start
  // the tow; latching the nearby barge must not create a stranded, non-moving objective.
  const barge = rec.ids.map((entityId) => t.state.entities.get(entityId))
    .find((entity) => rec.roles[entity.id] === 'barge');
  t.bus.emit('tether:attached', { actorId: t.state.playerId, targetId: barge.id });
  assert.equal(live(t, id).phase, 'offer', 'the unrelated barge does not begin the bell tow');

  // The physical read beats the menu: attach the line before answering the hail.
  t.bus.emit('tether:attached', { actorId: t.state.playerId, targetId: bell.id });
  assert.equal(live(t, id).phase, 'towing', 'the latch itself is the answer');

  bell.vel.x = 90; bell.vel.z = 0;
  t.sim.runTicks(70);
  assert.ok(events.some((row) => row.name === 'sectorsim:impulse'
    && row.payload.kind === 'eighth_bell_toll' && row.payload.danger > 0),
    'a toll is real noise on the lane');
  assert.ok(events.some((row) => row.name === 'audio:cue'
    && row.payload.id === 'sfx_eighth_bell_toll'), 'the toll must have a voice');
  assert.ok(events.some((row) => row.name === 'encounter:voice' && /BELL TOLLS/i.test(row.payload.text)));
  assert.equal(live(t, id).vars.tolls, 1, 'the peal counts once until she re-arms');

  bell.pos.x = CATHEDRAL.x + 10; bell.pos.z = CATHEDRAL.z;
  bell.vel.x = 0;
  t.sim.runTicks(70);
  assert.equal(completion(t)?.outcome, 'berthed');
  assert.equal(t.state.story.flags.eighthBellGone, 'berthed');
  assert.equal(t.state.story.flags.eighthBellTolls >= 1, true);
  assert.ok(events.some((row) => row.name === 'economy:grantCredits' && row.payload.amount === 240));
  assert.ok(events.some((row) => row.name === 'faction:repDelta'
    && row.payload.factionId === 'faction_choir' && row.payload.delta === 10));
  assert.ok(events.some((row) => row.name === 'news:publish' && /EIGHTH BELL/.test(row.payload.text)));

  const blocked = t.director.requestAuthoredEncounter({
    shapeId: SHAPE, encounterId: 'debug:bell:again',
    sectorId: SECTOR, anchor: { x: 0, z: 0 },
  });
  assert.deepEqual(blocked, { ok: false, reason: 'gated' }, 'blockAfterOutcome must seal the bell');
});

test('paying the Forge charges the yard tug and ends the encounter gently', () => {
  const t = boot();
  t.state.player.credits = 1000;
  const events = collect(t, ['economy:chargeCredits', 'faction:repDelta', 'encounter:resolved']);
  const id = force(t, 'hire');
  choose(t, id, 'hire');
  assert.equal(completion(t)?.outcome, 'hired');
  assert.equal(t.state.story.flags.eighthBellGone, 'hired');
  assert.ok(events.some((row) => row.name === 'economy:chargeCredits' && row.payload.amount === 260));
  assert.equal(t.state.player.credits, 740, 'the sole economy owner settles the accepted tug');
  assert.ok(events.some((row) => row.name === 'faction:repDelta'
    && row.payload.factionId === 'faction_choir' && row.payload.delta === 3));
  // The bell is spoken for: a later forced request dies in fire, not in the planner.
  const refire = t.director.requestAuthoredEncounter({
    shapeId: SHAPE, encounterId: 'debug:bell:hired-again',
    sectorId: SECTOR, anchor: { x: 0, z: 0 }, force: true,
  });
  assert.deepEqual(refire, { ok: false, reason: 'resolved_on_fire' });
});

test('an unaffordable tug offer does not spend credits or resolve the bell', () => {
  const t = boot();
  t.state.player.credits = 100;
  const events = collect(t, ['economy:chargeCredits', 'faction:repDelta', 'encounter:resolved']);
  const id = force(t, 'hire-short');
  choose(t, id, 'hire');

  const rec = live(t, id);
  assert.ok(rec, 'the procession remains available after the wire refuses payment');
  assert.equal(rec.phase, 'offer');
  assert.equal(completion(t), null);
  assert.equal(t.state.player.credits, 100, 'the exact charge rejects a short balance');
  assert.equal(events.filter((row) => row.name === 'economy:chargeCredits').length, 1);
  assert.equal(events.some((row) => row.name === 'faction:repDelta'), false,
    'a refused tug cannot grant Choir standing');
  assert.equal(events.some((row) => row.name === 'encounter:resolved'), false,
    'a refused tug cannot settle as hired');

  // The answer consumes the menu offer, but the physical line remains a valid alternative.
  t.bus.emit('tether:attached', { actorId: t.state.playerId, targetId: bellOf(t, id).id });
  assert.equal(live(t, id).phase, 'towing');
});

test('reentrant hire and tow choices cannot settle the same bell during its exact debit', () => {
  const t = boot();
  t.state.player.credits = 1000;
  const receipts = collect(t, ['economy:chargeCredits', 'faction:repDelta', 'encounter:resolved']);
  const id = force(t, 'hire-reentrant');
  const rec = live(t, id);
  let nested = false;
  t.bus.on('economy:chargeCredits', (request) => {
    if (request?.reason !== 'eighth_bell_yard_tug' || nested) return;
    nested = true;
    EIGHTH_BELL_RUNTIME.choose(t.director, rec, t.state, 'hire');
    EIGHTH_BELL_RUNTIME.choose(t.director, rec, t.state, 'vow');
    t.bus.emit('tether:attached', { actorId: t.state.playerId, targetId: rec.vars.bellId });
  });

  choose(t, id, 'hire');

  assert.equal(nested, true, 'the wallet event exercised synchronous reentry');
  assert.equal(receipts.filter((row) => row.name === 'economy:chargeCredits').length, 1,
    'nested hire does not emit a second debit');
  assert.equal(receipts.filter((row) => row.name === 'encounter:resolved').length, 1,
    'the encounter resolves exactly once');
  assert.equal(receipts.filter((row) => row.name === 'faction:repDelta').length, 1,
    'Choir standing is applied once');
  assert.equal(t.state.player.credits, 740);
  assert.equal(completion(t)?.outcome, 'hired');
  assert.equal(rec.phase, 'done');
  assert.equal(rec.vars.hirePending, false);
});

test('passing leaves the bell patient, and the lane can ask again', () => {
  const t = boot();
  const id = force(t, 'pass');
  choose(t, id, 'pass');
  assert.equal(completion(t)?.outcome, 'passed');
  assert.equal(t.state.story.flags.eighthBellGone, undefined);
  const again = t.director.requestAuthoredEncounter({
    shapeId: SHAPE, encounterId: 'debug:bell:reask',
    sectorId: SECTOR, anchor: { x: 0, z: 0 }, force: true,
  });
  assert.equal(again.ok, true, 'a passed bell stays on the lane');
});

test('firing on the procession is desecration and the wardens answer', () => {
  const t = boot();
  const events = collect(t, ['faction:repDelta', 'encounter:resolved']);
  const id = force(t, 'sin');
  const rec = live(t, id);
  const wardenId = rec.ids.find((entId) => rec.roles[entId] === 'warden');
  t.bus.emit('combat:damage', { attackerId: t.state.playerId, targetId: wardenId, applied: 4 });
  assert.equal(completion(t)?.outcome, 'desecrated');
  assert.equal(t.state.story.flags.eighthBellGone, 'desecrated');
  assert.equal(t.state.story.flags.choirBellDesecrated, true);
  assert.ok(events.some((row) => row.name === 'faction:repDelta'
    && row.payload.factionId === 'faction_choir' && row.payload.delta === -12));
  const wardens = rec.ids.filter((entId) => rec.roles[entId] === 'warden')
    .map((entId) => t.state.entities.get(entId));
  assert.ok(wardens.every((ent) => ent && ent.data.ai.forcePlayerTarget === true),
    'both wardens must turn on the player');
});

test('striking the bell rings her once as a warning; twice is desecration', () => {
  const t = boot();
  const id = force(t, 'strike');
  const bell = bellOf(t, id);
  t.bus.emit('combat:damage', { attackerId: t.state.playerId, targetId: bell.id, applied: 3 });
  assert.ok(live(t, id), 'the first struck peal is a warning, not a war');
  assert.equal(live(t, id).vars.bellStruck, 1);
  assert.equal(live(t, id).vars.tolls, 1, 'a struck bell still tolls');
  t.bus.emit('combat:damage', { attackerId: t.state.playerId, targetId: bell.id, applied: 3 });
  assert.equal(completion(t)?.outcome, 'desecrated');
});

test('vow picks up the line, drifting past the deadline spends the procession', () => {
  const t = boot();
  const id = force(t, 'vow');
  choose(t, id, 'vow');
  const rec = live(t, id);
  assert.equal(rec.phase, 'towing');
  assert.equal(rec.vars.towVia, 'vow');
  rec.vars.towingSince = t.state.simTime - 500;
  t.sim.runTicks(70);
  assert.equal(completion(t)?.outcome, 'drifted');
  assert.equal(t.state.story.flags.eighthBellGone, undefined, 'a drifted bell may return');
});

test('an ignored hail times out as a pass', () => {
  const t = boot();
  const id = force(t, 'timeout');
  const rec = live(t, id);
  rec.deadlineAt = 0.001;                    // spend the offer window directly (0 means "none")
  t.sim.runTicks(70);
  assert.equal(completion(t)?.outcome, 'passed');
});
