// CV-SO second slice — "the name is still out there." A kill-wreck's marker already knows the
// bare killerId, but bare ids recycle and dead shooters despawn: the record now captures the
// killer's NAME at record time, and a deep scan files that record (victim, killer, days ago)
// on the same identified+ tier a loss-ledger derelict reads its story. The locked-target
// facts line then carries the disclosure through in its own terse voice.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { aftermathWrecks } from '../src/systems/aftermathWrecks.js';
import { buildWreckScanReveal } from '../src/data/scanReveal.js';
import { objectInfoLine } from '../src/ui/targetPanel.js';

function ship(id, x, data = {}) {
  return {
    id, type: 'ship', alive: true, team: 1,
    pos: { x, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, rot: 0,
    radius: 8, mass: 12, hull: 80, hullMax: 80, factionId: 'faction_reach',
    data: { defId: 'ship_kestrel', ...data },
  };
}

function boot() {
  const state = createGameState(31);
  state.mode = 'flight';
  state.playerId = 1;
  state.simTime = 1300; // day 2 — kills recorded now read 2 days ago against day 0
  state.world = state.world || {};
  state.world.currentSectorId = 'sector_a';
  state.world.sectors = { sector_a: { id: 'sector_a', name: 'Sector A', security: 0.8 } };
  const player = ship(1, 0, { shipName: 'Meridian Dawn' });
  player.team = 0;
  state.entities.set(1, player);
  state.entityList = [player];
  const bus = createBus();
  const sys = Object.create(aftermathWrecks);
  sys.init({ state, bus });
  return { state, bus, sys, player };
}

function addEntity(state, entity) {
  state.entities.set(entity.id, entity);
  state.entityList.push(entity);
  return entity;
}

function markerFor(state, victimId) {
  const own = state.aftermathWrecks;
  const list = own && own.bySector && own.bySector.sector_a || [];
  return list.find((m) => m && m.victimId === victimId) || null;
}

test('the record captures the shooter name at kill time, not a bare id', () => {
  const { state, sys } = boot();
  try {
    const victim = addEntity(state, ship(10, 40, { name: 'MERIDIA SPOKE' }));
    const killer = addEntity(state, ship(11, 50, { name: 'RAVEL THREE' }));
    sys._recordKill({ id: victim.id, killerId: killer.id, type: 'ship', pos: victim.pos });

    const marker = markerFor(state, victim.id);
    assert.ok(marker, 'a durable marker exists');
    assert.equal(marker.killerId, killer.id);
    assert.equal(marker.killerLabel, 'RAVEL THREE');
    // The id can recycle or the shooter can die — the name must already be on the record.
    killer.alive = false;
    state.entities.delete(killer.id);
    assert.equal(marker.killerLabel, 'RAVEL THREE');
  } finally {
    sys.destroy?.();
  }
});

test('the spawned wreck carries the record into its provenance', () => {
  const { state, sys } = boot();
  try {
    const victim = addEntity(state, ship(12, 40, { name: 'KESTREL NINE' }));
    const killer = addEntity(state, ship(13, 50, { shipName: 'Gossamer Knife' }));
    sys._recordKill({ id: victim.id, killerId: killer.id, type: 'ship', pos: victim.pos });
    const marker = markerFor(state, victim.id);
    const spec = sys._specForMarker(marker);
    assert.equal(spec.data.provenance.killerLabel, 'Gossamer Knife');
    assert.equal(spec.data.killedAt, marker.t);
  } finally {
    sys.destroy?.();
  }
});

test('a save/restore roundtrip keeps the recorded name; a legacy marker stays honest', () => {
  const { state, sys } = boot();
  try {
    const victim = addEntity(state, ship(14, 40, { name: 'OLD TALLY' }));
    const killer = addEntity(state, ship(15, 50, { name: 'BRINDLE CUT' }));
    sys._recordKill({ id: victim.id, killerId: killer.id, type: 'ship', pos: victim.pos });
    const marker = markerFor(state, victim.id);

    // The serialize path normalizes every marker — the name must survive the wire.
    const restored = sys.serialize();
    assert.ok(restored, 'serialize produces the aftermath bag');
    const raw = JSON.parse(JSON.stringify(restored));
    const state2 = createGameState(31);
    state2.world = { currentSectorId: 'sector_a' };
    const sys2 = Object.create(aftermathWrecks);
    sys2.init({ state: state2, bus: createBus() });
    sys2.deserialize(raw);
    const back = markerFor(state2, victim.id);
    assert.ok(back, 'the marker roundtrips');
    assert.equal(back.killerLabel, 'BRINDLE CUT');
  } finally {
    sys.destroy?.();
  }
});

test('a deep scan files the kill record — victim, shooter, days — contact stays a hulk', () => {
  const { state, sys } = boot();
  try {
    const victim = addEntity(state, ship(16, 40, { name: 'MERIDIA SPOKE' }));
    const killer = addEntity(state, ship(17, 50, { name: 'RAVEL THREE' }));
    sys._recordKill({ id: victim.id, killerId: killer.id, type: 'ship', pos: victim.pos });
    const marker = markerFor(state, victim.id);
    const spec = sys._specForMarker(marker);
    const entity = {
      id: 99, type: 'wreck', alive: true, team: 0,
      pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, rot: 0,
      radius: 8, mass: 100, hull: 1, hullMax: 1,
      data: spec.data,
    };

    // Identified tier: the black box reads.
    const identified = buildWreckScanReveal(entity, state, {
      origin: { x: 800, z: 0 }, now: state.simTime + 1200, // day 4 — kill was day 2
    });
    assert.ok(identified && identified.quality !== 'contact', 'a close-enough scan resolves');
    assert.match(identified.story, /MERIDIA SPOKE destroyed in/);
    assert.match(identified.story, /black box lists killer RAVEL THREE/);
    assert.equal(identified.daysAgo, 2);

    // Contact tier: still just a hulk — the same disclosure gate the loss story uses.
    const contact = buildWreckScanReveal(entity, state, {
      origin: { x: 40000, z: 0 }, now: state.simTime,
    });
    if (contact) assert.equal(contact.story, null, 'contact range files no record');
  } finally {
    sys.destroy?.();
  }
});

test('a recordless kill names an unidentified killer instead of guessing', () => {
  const { state, sys } = boot();
  try {
    const victim = addEntity(state, ship(18, 40, { name: 'LAST ARGOSY' }));
    sys._recordKill({ id: victim.id, killerId: 4242, type: 'ship', pos: victim.pos });
    const marker = markerFor(state, victim.id);
    assert.equal(marker.killerLabel, null, 'no live entity means no name');
    const spec = sys._specForMarker(marker);
    const entity = {
      id: 98, type: 'wreck', alive: true, team: 0,
      pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, rot: 0,
      radius: 8, mass: 100, hull: 1, hullMax: 1,
      data: spec.data,
    };
    const reveal = buildWreckScanReveal(entity, state, {
      origin: { x: 800, z: 0 }, now: state.simTime,
    });
    assert.match(reveal.story, /an unidentified killer/);
  } finally {
    sys.destroy?.();
  }
});

test('the locked-target facts carry the disclosed record, never the undisclosed one', () => {
  const { state, sys, player } = boot();
  try {
    const victim = addEntity(state, ship(19, 40, { name: 'MERIDIA SPOKE' }));
    const killer = addEntity(state, ship(20, 50, { name: 'RAVEL THREE' }));
    sys._recordKill({ id: victim.id, killerId: killer.id, type: 'ship', pos: victim.pos });
    const marker = markerFor(state, victim.id);
    const spec = sys._specForMarker(marker);
    const entity = {
      id: 97, type: 'wreck', alive: true, team: 0,
      pos: { x: 100, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, rot: 0,
      radius: 8, mass: 100, hull: 1, hullMax: 1,
      data: spec.data,
    };

    // Undisclosed: no scan reveal yet — the facts must not leak the record.
    const blind = objectInfoLine(entity, state, player, 500);
    assert.ok(!/Killer:/.test(blind), `pre-scan line leaks the record: ${blind}`);

    // Disclosed: a resolved reveal carries the story, so the facts name the shooter.
    entity.data.scanRevealed = buildWreckScanReveal(entity, state, {
      origin: { x: 900, z: 0 }, now: state.simTime + 1200,
    });
    const line = objectInfoLine(entity, state, player, 500);
    assert.match(line, /Killer: RAVEL THREE/);
    assert.match(line, /2d ago/);
  } finally {
    sys.destroy?.();
  }
});
