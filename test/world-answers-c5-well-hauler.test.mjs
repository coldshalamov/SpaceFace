/**
 * THE WORLD ANSWERS — C5: well x route hauler.
 *
 * A well the player drops on a lane pulls a loaded hauler off its line. fields.js publishes ONE
 * `well:haulerDragged` receipt per (well, hauler); traffic reads it as a rule: the hauler's escorts
 * boost onto it and hold (the pile-up), the hauler heaves to and re-plans, its crew barks once,
 * and the destination's lane takes a bounded `sectorsim:impulse` (trade volume dips for a day).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import {
  fields,
  WELL_HAULER_DRAG_THRESHOLD,
} from '../src/systems/fields.js';
import {
  traffic,
  WELL_DRAG_REGROUP_S,
  WELL_DRAG_HOLD_RADIUS_WU,
  WELL_DRAG_PRESSURE_MIN,
  WELL_DRAG_PRESSURE_MAX,
  WELL_DRAG_DANGER,
  WELL_DRAG_ESCORT_CAP,
} from '../src/systems/traffic.js';
import { barkDirector } from '../src/systems/barkDirector.js';
import { sectorSim, SECTOR_IMPULSE_DANGER_CAP } from '../src/systems/sectorSim.js';

const DT = 1 / 60;
const SEEDS = [4242, 8008];

function boot(seed) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.tick = 600;
  state.simTime = 10;
  const bus = createBus();
  const said = [];
  const helpers = { voice: { say(p) { said.push(p); return true; } } };
  core.init({ state, bus, helpers, registry: null });
  state.world.currentSectorId = 'sector_helios_prime';

  const spawn = (spec) => helpers.spawnEntity({
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 8, mass: 12, hull: 100, hullMax: 100,
    collides: true, ...spec, data: { ...(spec.data || {}) },
  });
  const player = spawn({ type: 'ship', team: 0 });
  state.playerId = player.id;
  const home = spawn({ type: 'station', pos: { x: -400, z: 0 }, mass: 1e6, data: { stationId: 'station_helios' } });
  const dest = spawn({ type: 'station', pos: { x: 500, z: 0 }, mass: 1e6, data: { stationId: 'station_beltout' } });

  const manifest = { lines: [{ commodityId: 'cmdty_food', qty: 20 }], totalQty: 20 };
  const hauler = spawn({
    type: 'ship', team: 2, factionId: 'faction_free', pos: { x: 100, z: 0 }, vel: { x: 26, z: 0 },
    data: { trafficRole: 'hauler', role: 'hauler', factionId: 'faction_free', cargoManifest: manifest,
      intent: { moveX: 0, moveZ: 1, boost: false, fire: false, fireGroup: null, aimAngle: 0 } },
  });
  state.traffic.freighters.push({
    id: hauler.id, role: 'hauler', targetId: dest.id, waitT: 0, nextTradeT: 30, dockSeq: 0,
    carrying: false, manifest,
  });
  const escorts = [];
  for (let i = 0; i < 2; i++) {
    const e = spawn({
      type: 'ship', team: 2, factionId: 'faction_free', pos: { x: 20 + i * 15, z: 140 - i * 280 },
      data: { trafficRole: 'escort', role: 'escort',
        intent: { moveX: 0, moveZ: 0, boost: false, fire: false, fireGroup: null, aimAngle: 0 } },
    });
    state.traffic.freighters.push({ id: e.id, role: 'escort', targetId: null, waitT: 0, nextTradeT: 30, dockSeq: 0 });
    escorts.push(e);
  }

  const wellSys = Object.create(fields);
  wellSys.init({ state, bus, helpers, registry: null });
  const trafficSys = Object.assign({}, traffic);
  trafficSys.init({ state, bus, helpers, registry: null });
  const barkSys = Object.assign({}, barkDirector);
  barkSys.init({ state, bus, helpers, registry: null });

  const seen = { drags: [], impulses: [], regroups: [], voices: [] };
  bus.on('well:haulerDragged', (p) => seen.drags.push(p));
  bus.on('sectorsim:impulse', (p) => seen.impulses.push(p));
  bus.on('traffic:haulerRegroup', (p) => seen.regroups.push(p));
  bus.on('barkDirector:voice', (p) => seen.voices.push(p));

  return { state, bus, helpers, spawn, player, home, dest, hauler, escorts, wellSys, trafficSys, barkSys, said, seen, manifest };
}

function plantWell(h, id, ownerId, center = { x: 140, z: 40 }) {
  h.wellSys._kernel.register({
    id, kind: 'well', center, radius: 190, strength: 240, ownerId, sourceId: ownerId, durationS: 30,
  });
}

/**
 * Drive one tick of the well's read on a body: the hull cruises its line, the well drifts it off
 * (`pullWuPerS` toward +z) while the same per-body hook the force loop calls sees it.
 */
function pull(h, body, ticks, pullWuPerS = 30) {
  for (let i = 0; i < ticks; i++) {
    h.state.tick += 1;
    h.state.simTime += DT;
    body.pos.x += body.vel.x * DT;
    body.pos.z += pullWuPerS * DT;
    const list = h.wellSys._kernel.list();
    h.wellSys._noteWellClusterBody(body, list, {}, { ax: 120, az: 40 }, h.state);
  }
}

/** Traffic plans on a cadence gate (skipped ticks keep the last intent) — step a few ticks. */
function stepTraffic(h, n) {
  for (let i = 0; i < n; i++) {
    h.state.tick += 1; h.state.simTime += DT;
    h.trafficSys.update(DT, h.state);
  }
}

function dispose(h) {
  h.barkSys.destroy?.();
  h.trafficSys.destroy?.();
  h.wellSys.destroy?.();
}

for (const seed of SEEDS) {
  test(`C5 [${seed}]: a PLAYER well dragging a loaded hauler off its line fires the receipt exactly once`, (t) => {
    const h = boot(seed);
    t.after(() => dispose(h));
    plantWell(h, 'well_p1', h.player.id);
    // Entry contact (baseline), then a short drift well under the threshold: nothing yet.
    pull(h, h.hauler, 30, 20);
    assert.equal(h.seen.drags.length, 0, 'a small pull is not a drag');
    pull(h, h.hauler, 120, 30);
    assert.equal(h.seen.drags.length, 1, 'crossing the threshold publishes exactly one receipt');
    const r = h.seen.drags[0];
    assert.equal(r.schemaVersion, 1);
    assert.equal(r.wellId, 'well_p1');
    assert.equal(r.actorId, h.player.id);
    assert.equal(r.haulerId, h.hauler.id);
    assert.equal(r.factionId, 'faction_free');
    assert.equal(r.destStationId, 'station_beltout', 'destination resolves from traffic\'s freighter record');
    assert.equal(r.sectorId, 'sector_helios_prime');
    assert.ok(r.deflectionWu >= WELL_HAULER_DRAG_THRESHOLD, `deflection ${r.deflectionWu} >= threshold`);
    assert.ok(r.deflectionWu < WELL_HAULER_DRAG_THRESHOLD + 5, 'fires at the crossing, not long after');
    assert.ok(Number.isInteger(r.tick));

    pull(h, h.hauler, 300, 30);
    assert.equal(h.seen.drags.length, 1, 'never twice per well lifetime');
    // Leaving and re-entering the SAME well does not re-arm it.
    h.state.tick += 200;
    pull(h, h.hauler, 200, 30);
    assert.equal(h.seen.drags.length, 1, 're-entering the same well stays quiet');
  });

  test(`C5 [${seed}]: a new well may drag the same hauler again`, (t) => {
    const h = boot(seed);
    t.after(() => dispose(h));
    plantWell(h, 'well_a', h.player.id);
    pull(h, h.hauler, 150, 30);
    assert.equal(h.seen.drags.length, 1);
    h.wellSys._kernel.clear();
    h.state.tick += 200;
    plantWell(h, 'well_b', h.player.id, { x: h.hauler.pos.x + 20, z: h.hauler.pos.z + 40 });
    pull(h, h.hauler, 150, 30);
    assert.equal(h.seen.drags.length, 2);
    assert.equal(h.seen.drags[1].wellId, 'well_b');
  });

  test(`C5 [${seed}]: an NPC-owned well, a light fighter, and an empty hold do not fire it`, (t) => {
    const h = boot(seed);
    t.after(() => dispose(h));
    const npc = h.spawn({ type: 'ship', team: 1, pos: { x: 400, z: 400 } });
    plantWell(h, 'well_npc', npc.id);
    pull(h, h.hauler, 200, 30);
    assert.equal(h.seen.drags.length, 0, 'somebody else\'s well is not the player\'s act');

    h.wellSys._kernel.clear();
    plantWell(h, 'well_p', h.player.id);
    const fighter = h.spawn({
      type: 'ship', team: 1, pos: { x: 100, z: 0 }, vel: { x: 26, z: 0 }, data: {},
    });
    pull(h, fighter, 200, 30);
    assert.equal(h.seen.drags.length, 0, 'a light fighter is not a route hauler');

    const empty = h.spawn({
      type: 'ship', team: 2, pos: { x: 100, z: 0 }, vel: { x: 26, z: 0 },
      data: { trafficRole: 'hauler', cargoManifest: { lines: [], totalQty: 0 } },
    });
    pull(h, empty, 200, 30);
    assert.equal(h.seen.drags.length, 0, 'an empty hold has no lane to dent');
    assert.equal(h.seen.impulses.length, 0, 'and nothing was injected into the economy');
  });

  test(`C5 [${seed}]: escorts converge and hold on the hauler, the hauler heaves to and barks once`, (t) => {
    const h = boot(seed);
    t.after(() => dispose(h));
    const targetBefore = h.state.traffic.freighters.find((r) => r.id === h.hauler.id).targetId;
    assert.equal(targetBefore, h.dest.id);
    plantWell(h, 'well_e', h.player.id);
    pull(h, h.hauler, 150, 30);
    assert.equal(h.seen.drags.length, 1);

    // Receipt consequences: both escorts shadowed this hauler (it is the only freighter).
    assert.equal(h.seen.regroups.length, 1);
    assert.deepEqual([...h.seen.regroups[0].escortIds].sort(), h.escorts.map((e) => e.id).sort());
    assert.ok(h.seen.regroups[0].escortIds.length <= WELL_DRAG_ESCORT_CAP);

    // The hauler stops to recover and its leg is re-planned.
    const hRec = h.state.traffic.freighters.find((r) => r.id === h.hauler.id);
    assert.equal(hRec.targetId, null, 'route re-plan requested');
    assert.ok(hRec.waitT > 0, 'the hauler heaves to');

    // Escorts boost toward the hauler, aim at it, and keep doing so until they arrive.
    for (let i = 0; i < 6; i++) {
      h.state.tick += 1; h.state.simTime += DT;
      h.trafficSys.update(DT, h.state);
    }
    for (const e of h.escorts) {
      const intent = e.data.intent;
      const want = Math.atan2(h.hauler.pos.z - e.pos.z, h.hauler.pos.x - e.pos.x);
      const err = Math.abs(Math.atan2(Math.sin(intent.aimAngle - want), Math.cos(intent.aimAngle - want)));
      assert.equal(intent.moveZ, 1, 'escort drives at the hauler');
      assert.equal(intent.boost, true, 'escort boosts to close up');
      assert.ok(err < 0.05, `escort aims at the hauler (err ${err})`);
    }
    // Inside the hold radius the escort stops thrusting and brakes (the physical bunch).
    const e0 = h.escorts[0];
    e0.pos.x = h.hauler.pos.x + WELL_DRAG_HOLD_RADIUS_WU * 0.5;
    e0.pos.z = h.hauler.pos.z;
    stepTraffic(h, 8);
    assert.equal(e0.data.intent.moveZ, 0);
    assert.equal(e0.data.intent.brake, true);
    // The window is bounded: after it lapses escorts return to ordinary shadowing.
    h.state.simTime += WELL_DRAG_REGROUP_S + 1;
    h.state.tick += 400;
    stepTraffic(h, 8);
    assert.equal(h.escorts[1].data.intent.boost, false, 'the regroup window lapsed');

    // Exactly one bark, from the hauler, in plain words.
    const barks = h.said.filter((s) => s.kind === 'haulerRegroup');
    assert.equal(barks.length, 1);
    assert.equal(barks[0].id, `barkDirector:${h.hauler.id}:well-drag`);
    assert.match(barks[0].text, /pulling us off the lane/);
    assert.match(barks[0].text, /escorts close up/);
    assert.equal(h.seen.voices.filter((v) => v.entityId === h.hauler.id).length, 1);
  });

  test(`C5 [${seed}]: the lane impulse lands on the DESTINATION sector, bounded, once`, (t) => {
    const h = boot(seed);
    t.after(() => dispose(h));
    plantWell(h, 'well_i', h.player.id);
    pull(h, h.hauler, 150, 30);
    const lane = h.seen.impulses.filter((p) => p.kind === 'lane_disruption');
    assert.equal(lane.length, 1);
    assert.equal(lane[0].sectorId, 'sector_ceres_belt', 'station_beltout lives in the Ceres belt, not the sector of the drag');
    assert.ok(lane[0].pricePressure >= WELL_DRAG_PRESSURE_MIN && lane[0].pricePressure <= WELL_DRAG_PRESSURE_MAX,
      `pricePressure ${lane[0].pricePressure} bounded`);
    assert.ok(lane[0].pricePressure > WELL_DRAG_PRESSURE_MIN, 'a 20-unit hold earns more than the floor');
    assert.equal(lane[0].danger, WELL_DRAG_DANGER);
    assert.ok(lane[0].danger > 0 && lane[0].danger <= SECTOR_IMPULSE_DANGER_CAP);
    assert.equal(h.state.sectorSim?.impulses?.length ?? 0, 0, 'traffic only emitted the intent; sectorSim is not wired here');
  });

  test(`C5 [${seed}]: duplicate receipts do not double-fire traffic`, (t) => {
    const h = boot(seed);
    t.after(() => dispose(h));
    const payload = {
      schemaVersion: 1, wellId: 'well_dup', actorId: h.player.id, haulerId: h.hauler.id,
      factionId: 'faction_free', destStationId: 'station_beltout', sectorId: 'sector_helios_prime',
      deflectionWu: 50, tick: h.state.tick,
    };
    h.bus.emit('well:haulerDragged', payload);
    h.bus.emit('well:haulerDragged', { ...payload });
    h.bus.emit('well:haulerDragged', { ...payload });
    assert.equal(h.seen.impulses.filter((p) => p.kind === 'lane_disruption').length, 1);
    assert.equal(h.seen.regroups.length, 1);
    assert.equal(h.said.filter((s) => s.kind === 'haulerRegroup').length, 1);
    // A different well is a different act.
    h.bus.emit('well:haulerDragged', { ...payload, wellId: 'well_other' });
    assert.equal(h.seen.impulses.filter((p) => p.kind === 'lane_disruption').length, 2);
  });

  test(`C5 [${seed}]: a manifest-less destination falls back to the drag sector; unknown hull is inert`, (t) => {
    const h = boot(seed);
    t.after(() => dispose(h));
    h.bus.emit('well:haulerDragged', {
      schemaVersion: 1, wellId: 'w', actorId: h.player.id, haulerId: h.hauler.id,
      destStationId: null, sectorId: 'sector_helios_prime', deflectionWu: 50, tick: 1,
    });
    assert.equal(h.seen.impulses.at(-1).sectorId, 'sector_helios_prime');
    const before = h.seen.impulses.length;
    h.bus.emit('well:haulerDragged', { schemaVersion: 1, wellId: 'w2', haulerId: 999999, sectorId: 'x', tick: 2 });
    assert.equal(h.seen.impulses.length, before, 'a hull that is gone changes nothing');
  });
}

test('C5: no player well, no receipt, no traffic change (inert by construction)', (t) => {
  const h = boot(4242);
  t.after(() => dispose(h));
  const hRec = h.state.traffic.freighters.find((r) => r.id === h.hauler.id);
  const snapshot = JSON.stringify(h.state.traffic.freighters);
  for (let i = 0; i < 120; i++) {
    h.state.tick += 1; h.state.simTime += DT;
    h.wellSys._noteWellClusterBody(h.hauler, [], {}, { ax: 0, az: 0 }, h.state);
  }
  assert.equal(JSON.stringify(h.state.traffic.freighters), snapshot);
  assert.equal(h.seen.drags.length, 0);
  assert.equal(h.seen.impulses.length, 0);
  assert.equal(hRec.targetId, h.dest.id);
});

test('C5: the real sectorSim accepts the impulse and a dented lane reads as price pressure', (t) => {
  const h = boot(4242);
  t.after(() => dispose(h));
  const sim = Object.assign({}, sectorSim);
  sim.init({ state: h.state, bus: h.bus, helpers: h.helpers, registry: null });
  t.after(() => sim.destroy?.());
  plantWell(h, 'well_s', h.player.id);
  pull(h, h.hauler, 150, 30);
  const ss = h.state.sectorSim;
  assert.ok(ss && Array.isArray(ss.impulses), 'sectorSim state exists');
  const mine = ss.impulses.filter((i) => i.kind === 'lane_disruption');
  assert.equal(mine.length, 1);
  assert.equal(mine[0].sectorId, 'sector_ceres_belt');
  assert.ok(mine[0].pricePressure > 0 && mine[0].pricePressure <= WELL_DRAG_PRESSURE_MAX);
});
