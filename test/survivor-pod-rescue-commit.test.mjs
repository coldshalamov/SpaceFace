// survivorPod D133 — the rescue latch lands on the contract, not the choice.
// A tethered RESCUE that missions accepts inside the same synchronous `survivorPod:rescueSelected`
// dispatch records `rescueSelected` on the pod's public point mirror AT the latch — not a tick
// later — so a save or any reader between the choice and the next update sees the truth. A
// refused accept rolls the latch back and keeps the choice live for the retry; without the tow
// the rescue is refused outright.
import test from 'node:test';
import assert from 'node:assert/strict';

import { survivorPod } from '../src/systems/survivorPod.js';

function makeBus() {
  const handlers = new Map();
  const emitted = [];
  const bus = {
    on(evt, fn) { if (!handlers.has(evt)) handlers.set(evt, []); handlers.get(evt).push(fn); },
    off(evt, fn) { const l = handlers.get(evt) || []; const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); },
    emit(evt, p) { emitted.push({ evt, p }); for (const fn of (handlers.get(evt) || []).slice()) fn(p); },
  };
  return { bus, emitted };
}

function wreckEntity(id, pointId, pos = { x: 100, z: 0 }) {
  return {
    id,
    type: 'wreck',
    alive: true,
    pos,
    radius: 8,
    data: {
      parentType: 'debris',
      salvagePointId: pointId,
      salvagePool: { cmdty_scrap_metal: 2 },
      scanLabel: 'Wreck Debris',
    },
  };
}

function makeState() {
  const a = wreckEntity(501, 'zone_tethys_derelict:sal0');
  const b = wreckEntity(502, 'zone_tethys_derelict:sal1', { x: 160, z: 40 });
  return {
    meta: { seed: 991 },
    simTime: 100,
    mode: 'flight',
    playerId: 1,
    player: { credits: 1000, tether: { active: false, targetId: null } },
    factions: { faction_scn: { rep: 0 } },
    missions: { active: [] },
    ui: {},
    world: {
      currentSectorId: 'sector_tethys_junction',
      sectors: { sector_tethys_junction: { id: 'sector_tethys_junction', name: 'Tethys Junction' } },
    },
    entities: new Map([
      [1, { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, hull: 100 }],
      [a.id, a],
      [b.id, b],
    ]),
    salvage: {
      plannedSectorId: 'sector_tethys_junction',
      points: [
        { id: 'zone_tethys_derelict:sal0', sectorId: 'sector_tethys_junction', zoneId: 'zone_tethys_derelict', pos: { x: a.pos.x, z: a.pos.z }, entityId: a.id, isCommunicator: false, wreckMissionId: null, offered: false },
        { id: 'zone_tethys_derelict:sal1', sectorId: 'sector_tethys_junction', zoneId: 'zone_tethys_derelict', pos: { x: b.pos.x, z: b.pos.z }, entityId: b.id, isCommunicator: false, wreckMissionId: null, offered: false },
      ],
    },
  };
}

function boot() {
  const { bus, emitted } = makeBus();
  const state = makeState();
  const sys = { ...survivorPod };
  sys.init({ state, bus, helpers: {} });
  bus.emit('salvage:placed', { sectorId: 'sector_tethys_junction', count: 2, communicators: 0 });
  const point = state.salvage.points.find((p) => p && p.survivorPod);
  assert.ok(point, 'one salvage point promotes to a survivor pod');
  return { state, bus, emitted, sys, point };
}

/** The shipped accept: missions hears rescueSelected and commits the passenger contract inside
 *  the same emit, so the latch check that follows already sees the live mission. */
function stubMissionsAccept(state, bus) {
  bus.on('survivorPod:rescueSelected', (p) => {
    state.missions.active.push({
      id: `m_rescue_${p.salvagePointId}`,
      status: 'active',
      type: 'passenger_transport',
      params: { survivorPodId: p.salvagePointId },
    });
  });
}

test('a committed rescue records rescueSelected on the public point mirror the same dispatch', () => {
  const { state, bus, emitted, sys, point } = boot();
  stubMissionsAccept(state, bus);
  state.player.tether = { active: true, targetId: point.entityId };

  bus.emit('survivorPod:choose', { salvagePointId: point.id, optionId: 'rescue' });

  assert.ok(emitted.some((e) => e.evt === 'survivorPod:rescueSelected'), 'the choice event fires');
  const rec = state.survivorPod.promotedByPoint[point.id];
  assert.equal(rec.rescueSelected, true, 'the internal record latches');
  assert.equal(point.survivorPod.rescueSelected, true,
    'the public point mirror records the latch without waiting for the next tick');
  const ent = state.entities.get(point.entityId);
  assert.equal(ent.data.survivorPod.rescueSelected, true, 'the entity mirror records it too');
  assert.equal(emitted.some((e) => e.evt === 'survivorPod:rescueBlocked'), false,
    'a committed rescue emits no refusal');

  // A second choose on the committed pod is refused — no double accept against a withdrawn offer.
  bus.emit('survivorPod:choose', { salvagePointId: point.id, optionId: 'rescue' });
  assert.equal(
    emitted.filter((e) => e.evt === 'survivorPod:rescueSelected' || e.evt === 'survivorPod:rescueBlocked').length,
    1,
    'a committed pod never re-runs the choice',
  );
  sys.destroy();
});

test('a refused accept rolls the latch back and the choice stays live for the retry', () => {
  const { state, bus, emitted, sys, point } = boot();
  // No listener accepts — the offer row is gone / standing was lost at the destination desk.
  state.player.tether = { active: true, targetId: point.entityId };

  bus.emit('survivorPod:choose', { salvagePointId: point.id, optionId: 'rescue' });

  assert.ok(emitted.some((e) => e.evt === 'survivorPod:rescueSelected'), 'the pilot selection still emits');
  const blocked = emitted.filter((e) => e.evt === 'survivorPod:rescueBlocked');
  assert.equal(blocked.length, 1, 'the refusal is announced once');
  assert.equal(blocked[0].p.reason, 'accept_refused', 'the refusal names the failed accept');
  assert.equal(point.survivorPod.rescueSelected, false, 'no contract means no latch');
  const rec = state.survivorPod.promotedByPoint[point.id];
  assert.equal(rec.rescueSelected, false);

  // The retry is not dead: once the accept can land, the same choice commits.
  stubMissionsAccept(state, bus);
  bus.emit('survivorPod:choose', { salvagePointId: point.id, optionId: 'rescue' });
  assert.equal(rec.rescueSelected, true, 'the retried choice latches once a contract exists');
  assert.equal(point.survivorPod.rescueSelected, true);
  sys.destroy();
});

test('without the tow the rescue is refused before any latch', () => {
  const { state, bus, emitted, sys, point } = boot();
  stubMissionsAccept(state, bus);
  state.player.tether = { active: false, targetId: null };

  bus.emit('survivorPod:choose', { salvagePointId: point.id, optionId: 'rescue' });

  const blocked = emitted.find((e) => e.evt === 'survivorPod:rescueBlocked');
  assert.ok(blocked, 'the tow gate refuses');
  assert.equal(blocked.p.reason, 'tow_required');
  assert.equal(state.missions.active.length, 0, 'the refused rescue never reaches a contract');
  const rec = state.survivorPod.promotedByPoint[point.id];
  assert.equal(rec.rescueSelected, false);
  assert.equal(point.survivorPod.rescueSelected, false);
  sys.destroy();
});
