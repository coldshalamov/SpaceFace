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
import { lossLedger, lossesFor } from '../src/systems/lossLedger.js';
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

// REV-CV-SO-2 — lossLedger tags every spawned wreck in a loss-bearing sector. On a marker-owned
// wreck (the rematerialization path) a wholesale provenance replace severed the marker binding,
// dropped the recorded names, and could aim the ledger's lossId at a different victim's row.
test('a foreign ledger tag cannot sever the marker binding or overwrite the record', () => {
  const { state, bus, sys } = boot();
  const ledger = Object.create(lossLedger);
  ledger.init({ state, bus });
  try {
    // A foreign ship's loss in the sector — the bait the tag used to aim at.
    const foreignVictim = addEntity(state, ship(21, 60, { name: 'OTHER HULL' }));
    bus.emit('entity:killed', { id: foreignVictim.id, type: 'ship', killerId: 999 });
    assert.equal(lossesFor(state, 'sector_a').length >= 1, true, 'the foreign loss recorded');

    const victim = addEntity(state, ship(22, 40, { name: 'MERIDIA SPOKE' }));
    const killer = addEntity(state, ship(23, 50, { name: 'RAVEL THREE' }));
    sys._recordKill({ id: victim.id, killerId: killer.id, type: 'ship', pos: victim.pos });
    const marker = markerFor(state, victim.id);
    const spec = sys._specForMarker(marker);
    const entity = {
      id: 96, type: 'wreck', alive: true, team: 0,
      pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, rot: 0,
      radius: 8, mass: 100, hull: 1, hullMax: 1,
      data: spec.data,
    };
    bus.emit('entity:spawned', { id: entity.id, type: 'wreck', entity });

    assert.equal(entity.data.provenance.markerId, marker.markerId, 'the marker binding survives');
    assert.equal(entity.data.provenance.victimLabel, 'MERIDIA SPOKE', 'the victim name survives');
    assert.equal(entity.data.provenance.killerLabel, 'RAVEL THREE', 'the record survives');
    assert.ok(entity.data.provenance.lossId == null, 'no foreign loss attaches to a marker wreck');

    const reveal = buildWreckScanReveal(entity, state, {
      origin: { x: 800, z: 0 }, now: state.simTime,
    });
    assert.match(reveal.story, /black box lists killer RAVEL THREE/);
  } finally {
    ledger.destroy?.();
    sys.destroy?.();
  }
});

test('a wreck whose provenance a foreign tag clobbered still files the record from the marker clone', () => {
  const { state, sys } = boot();
  try {
    const victim = addEntity(state, ship(24, 40, { name: 'MERIDIA SPOKE' }));
    const killer = addEntity(state, ship(25, 50, { name: 'RAVEL THREE' }));
    sys._recordKill({ id: victim.id, killerId: killer.id, type: 'ship', pos: victim.pos });
    const marker = markerFor(state, victim.id);
    const spec = sys._specForMarker(marker);
    const entity = {
      id: 95, type: 'wreck', alive: true, team: 0,
      pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, rot: 0,
      radius: 8, mass: 100, hull: 1, hullMax: 1,
      data: spec.data,
    };
    // The pre-fix tag's shape: provenance wholesale-replaced by a foreign ledger row.
    entity.data.provenance = { lossId: 'loss_stranger', kind: 'ship', simDay: 1, cargoHint: null };

    const reveal = buildWreckScanReveal(entity, state, {
      origin: { x: 800, z: 0 }, now: state.simTime,
    });
    assert.match(reveal.story, /black box lists killer RAVEL THREE/,
      'data.aftermath still carries the record past the clobber');
  } finally {
    sys.destroy?.();
  }
});

test('a pre-stamp legacy marker reports no age instead of the whole sim age', () => {
  const { state, sys } = boot();
  try {
    const victim = addEntity(state, ship(26, 40, { name: 'OLD HULK' }));
    sys._recordKill({ id: victim.id, killerId: null, type: 'ship', pos: victim.pos });
    const marker = markerFor(state, victim.id);
    const spec = sys._specForMarker(marker);
    const entity = {
      id: 94, type: 'wreck', alive: true, team: 0,
      pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, rot: 0,
      radius: 8, mass: 100, hull: 1, hullMax: 1,
      data: spec.data,
    };
    // A marker saved before the stamp existed normalizes t to 0 — on the clone and on the
    // derived killedAt alike. Anything else would report the whole sim age as the wreck's age.
    entity.data.killedAt = 0;
    entity.data.aftermath.t = 0;
    const reveal = buildWreckScanReveal(entity, state, {
      origin: { x: 800, z: 0 }, now: state.simTime + 3600,
    });
    assert.equal(reveal.daysAgo, null, 'an unknown kill stamp names no age');
  } finally {
    sys.destroy?.();
  }
});

test('a player wreck takes its own recorded loss, never a stranger\'s', () => {
  const { state, bus, sys } = boot();
  const ledger = Object.create(lossLedger);
  ledger.init({ state, bus });
  try {
    // A stranger's ship dies first — at a different stamp than the player's own death.
    const foreignVictim = addEntity(state, ship(27, 60, { name: 'OTHER HULL' }));
    bus.emit('entity:killed', { id: foreignVictim.id, type: 'ship', killerId: 999 });
    const foreignLoss = lossesFor(state, 'sector_a')[0];
    assert.ok(foreignLoss, 'the foreign loss is on the ledger');

    // The player's own defeat — the killer's name lands on the player's black box too.
    const killer = addEntity(state, ship(28, 50, { name: 'JACKAL VEER' }));
    state.simTime = 1400;
    bus.emit('player:death', { killerId: killer.id });
    const marker = markerFor(state, state.playerId);
    assert.ok(marker, 'the player marker exists');
    assert.equal(marker.killerLabel, 'JACKAL VEER', 'the player wreck files its killer');

    const spec = sys._specForMarker(marker);
    const entity = {
      id: 93, type: 'wreck', alive: true, team: 0,
      pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, rot: 0,
      radius: 8, mass: 100, hull: 1, hullMax: 1,
      data: spec.data,
    };
    bus.emit('entity:spawned', { id: entity.id, type: 'wreck', entity });

    const ownLoss = lossesFor(state, 'sector_a').find((l) => l.assetId === state.playerId);
    assert.ok(ownLoss, 'the player death recorded a loss');
    assert.equal(entity.data.provenance.lossId, ownLoss.lossId,
      'the wreck names its own recorded loss');
    assert.notEqual(entity.data.provenance.lossId, foreignLoss.lossId,
      'a stranger\'s loss can never attach');
    assert.equal(entity.data.provenance.markerId, marker.markerId, 'the binding survives');
  } finally {
    ledger.destroy?.();
    sys.destroy?.();
  }
});

test('an attributed encounter cause outranks the bare shooter name', () => {
  const { state, sys } = boot();
  try {
    const victim = addEntity(state, ship(29, 40, { name: 'MERIDIA SPOKE' }));
    const killer = addEntity(state, ship(30, 50, { name: 'RAVEL THREE' }));
    sys._recordKill({ id: victim.id, killerId: killer.id, type: 'ship', pos: victim.pos });
    const marker = markerFor(state, victim.id);
    const spec = sys._specForMarker(marker);
    const entity = {
      id: 92, type: 'wreck', alive: true, team: 0,
      pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, rot: 0,
      radius: 8, mass: 100, hull: 1, hullMax: 1,
      data: spec.data,
    };
    entity.data.causeContract = { actor: 'KEEL-NINE', motiveId: 'the press-gang motive' };
    const reveal = buildWreckScanReveal(entity, state, {
      origin: { x: 800, z: 0 }, now: state.simTime,
    });
    assert.match(reveal.story, /evidence links KEEL-NINE to the press-gang motive/);
  } finally {
    sys.destroy?.();
  }
});
