// pb-wire-selection.test.mjs — row 285 / SF-244 consumer half.
//
// The local map's click-target/inspector path resolves through the stable-identity model
// (src/ui/sim/stableSelection.js, orphaned since row 148): a destroyed hull whose entity id was
// recycled closes the selection instead of pointing the ring, inspector and course commit at the
// body that inherited the id, while a durable station follows its instance swap. The model itself
// is proven in pb-ui-b-sim-models.test.mjs; this file proves the map consumes it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createGameState } from '../src/core/gameState.js';
import {
  buildLocalModel,
  commitCoursePayload,
  reconcileMapSelection,
  resolveCourseEntityId,
  resolveCourseTarget,
  resolveGalaxyMapPrimaryAction,
} from '../src/ui/galaxyMap.js';
import { world } from '../src/systems/world.js';
import { scanner } from '../src/systems/scanner.js';
import { resolveAutopilotTarget } from '../src/systems/flightV3.js';
import { resolveWaypointPresentationPosition } from '../src/ui/navigationWaypoint.js';
import { captureEntitySelection, resolveEntitySelection } from '../src/ui/sim/stableSelection.js';
import { masslineThrow } from '../src/systems/masslineThrow.js';
import { resolveGateApproachTarget } from '../src/render/cameraDirector.js';
import { predictNextSector } from '../src/render/sectorPredict.js';
import { save } from '../src/save/saveSystem.js';

const SEED = 4242;
const ROOT = join(import.meta.dirname, '..');

function spawn(state, e) {
  state.entities.set(e.id, e);
  state.entityList.push(e);
  return e;
}

function despawn(state, e) {
  state.entities.delete(e.id);
  const i = state.entityList.indexOf(e);
  if (i >= 0) state.entityList.splice(i, 1);
}

function boot() {
  const state = createGameState(SEED);
  spawn(state, {
    id: 0, type: 'ship', alive: true,
    pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, rot: 0,
    data: { role: 'player' }, team: 'player',
  });
  return state;
}

function hostileMule(id, over = {}) {
  return {
    id, type: 'ship', alive: true,
    pos: { x: 60, y: 0, z: 40 }, vel: { x: 0, y: 0, z: 0 }, rot: 0,
    factionId: 'red_wake',
    data: { name: 'Kestrel raider', role: 'raider', kind: 'raider', hostile: true },
    ...over,
  };
}

function aurumDepot(id, pos = { x: 120, y: 0, z: -80 }) {
  return {
    id, type: 'station', alive: true,
    pos, vel: { x: 0, y: 0, z: 0 }, rot: 0,
    data: { stationId: 'aurum_depot', name: 'Aurum Depot' },
  };
}

function contactFor(model, id) {
  return model.contacts.find((c) => c.id === id) || null;
}

test('PB-285: live contacts carry a stable-identity stamp', () => {
  const state = boot();
  spawn(state, hostileMule(7));
  spawn(state, aurumDepot(3));
  spawn(state, { id: 11, type: 'asteroid', alive: true, pos: { x: -40, y: 0, z: 90 }, vel: { x: 0, y: 0, z: 0 }, rot: 0, data: { typeId: 'rock' } });

  const model = buildLocalModel(state, () => false, {});
  const mule = contactFor(model, 7);
  const depot = contactFor(model, 3);
  const rock = contactFor(model, 11);
  assert.ok(mule && depot && rock, 'all three bodies chart');

  assert.equal(mule.stable.key, 'entity:7');
  assert.equal(mule.stable.durable, false);
  assert.equal(mule.stable.entityId, 7);
  assert.equal(rock.stable.key, 'entity:11', 'a rock is transient identity too');
  assert.equal(depot.stable.key, 'station:aurum_depot');
  assert.equal(depot.stable.durable, true);
});

test('PB-285: a destroyed hull whose id was recycled closes the selection and the course bind', () => {
  const state = boot();
  const mule = spawn(state, hostileMule(7));
  const model = buildLocalModel(state, () => false, {});
  // _selectedTarget holds the marker object captured at click time.
  const selected = { ...contactFor(model, 7) };
  assert.ok(selected.stable, 'the click target was stamped');

  // While the hull lives, the selection resolves unchanged.
  assert.equal(reconcileMapSelection(state, selected), selected);
  assert.equal(resolveCourseEntityId(state, selected), 7);

  // Kill it and recycle id 7 onto a different hull — the core's free-id pool does exactly this.
  despawn(state, mule);
  spawn(state, {
    id: 7, type: 'ship', alive: true,
    pos: { x: 900, y: 0, z: 900 }, vel: { x: 0, y: 0, z: 0 }, rot: 0,
    factionId: 'concord',
    data: { name: 'Ore mule', role: 'hauler', kind: 'freighter' },
  });

  // The selection closes; it does not follow the id onto the ore mule.
  assert.equal(reconcileMapSelection(state, selected), null);
  assert.equal(resolveCourseEntityId(state, selected), null);

  // The course commit still stands on the mark's position — the fail-closed place the sim
  // contracts — but it must not arm a target bind at the recycler.
  const payload = commitCoursePayload(state, selected);
  assert.ok(payload && payload.pos, 'the waypoint survives');
  assert.equal(payload.targetEntityId, undefined);
  assert.equal(payload.pos.x, 60);
  assert.equal(payload.pos.z, 40);

  // The inspector's primary action is gated the same way — its Set/Track commit must not arm
  // the recycler either (a released line, a dblclick and the button share the one resolver).
  const action = resolveGalaxyMapPrimaryAction(state, selected);
  assert.ok(action && action.coursePayload, 'the action still offers the positional fix');
  assert.equal(action.coursePayload.targetEntityId, undefined);
});

test('PB-285: a station selection survives an instance swap on seed 4242', () => {
  const state = boot();
  const first = spawn(state, aurumDepot(3));
  const model = buildLocalModel(state, () => false, {});
  const selected = { ...contactFor(model, 3) };
  assert.equal(selected.stable.key, 'station:aurum_depot');

  // Continuous residency materializes a fresh instance of the same station: old entity out,
  // new entity id in, same catalogue identity at a new anchor.
  despawn(state, first);
  spawn(state, aurumDepot(9, { x: 140, y: 0, z: -60 }));

  const rebound = reconcileMapSelection(state, selected);
  assert.ok(rebound, 'the durable identity still resolves');
  assert.equal(rebound.entityId, 9);
  assert.equal(rebound.id, 9, 'a marker whose id IS the entity id follows the new instance');
  assert.equal(rebound.stable.key, 'station:aurum_depot');
  assert.equal(rebound.stable.entityId, 9, 'the stamp rebinds to the live instance');
  assert.equal(rebound.x, 140);
  assert.equal(rebound.z, -60);
  assert.equal(resolveCourseEntityId(state, rebound), 9);
  // And the gated commit follows the new instance, not the dead id.
  assert.equal(commitCoursePayload(state, rebound).targetEntityId, 9);
});

test('PB-285: unstamped marks keep bare-id behaviour and a dead durable closes', () => {
  const state = boot();
  const legacy = { id: 'zone-x', kind: 'zone', x: 10, z: 10, entityId: 44 };
  assert.equal(reconcileMapSelection(state, legacy), legacy, 'no stamp -> pass through');
  assert.equal(resolveCourseEntityId(state, legacy), 44, 'legacy entityId fallback preserved');
  const byTarget = { id: 'claim-y', kind: 'claim', x: 0, z: 0, targetEntityId: 55 };
  assert.equal(resolveCourseEntityId(state, byTarget), 55, 'targetEntityId fallback preserved');

  const depot = spawn(state, aurumDepot(3));
  const selected = { ...contactFor(buildLocalModel(state, () => false, {}), 3) };
  despawn(state, depot);
  // Nothing else claims aurum_depot: the durable identity is gone, the selection closes.
  assert.equal(reconcileMapSelection(state, selected), null);
  assert.equal(resolveCourseEntityId(state, selected), null);
});

test('PB-285: an armed course stamps its bind — a mid-burn recycle chases the fix, not the new hull', () => {
  const state = boot();
  const pirate = spawn(state, hostileMule(7));
  const system = { ...world, state, bus: { emit() {} }, computeRoute() { return null; } };
  system._onSetCourse({ pos: { x: 60, z: 40 }, targetEntityId: 7, label: 'Kestrel raider' });

  assert.ok(state.nav.waypoint.stable, 'the waypoint stamps what the id meant');
  assert.ok(state.nav.autopilot.stable, 'the armed burn stamps what the id meant');

  // While the pirate lives, the burn tracks it and the instruments read the same body.
  assert.equal(resolveAutopilotTarget(state, state.nav.autopilot).entity, pirate);
  const shown = resolveWaypointPresentationPosition(state, state.nav.waypoint);
  assert.deepEqual({ x: shown.x, z: shown.z }, { x: 60, z: 40 });

  // It dies; the pool reissues id 7 onto an unrelated ore mule far away.
  pirate.alive = false;
  spawn(state, {
    id: 7, type: 'ship', alive: true,
    pos: { x: 900, y: 0, z: 900 }, vel: { x: 0, y: 0, z: 0 }, rot: 0,
    factionId: 'vagrant_combine',
    data: { name: 'Unrelated skiff', role: 'hauler', kind: 'mule' },
  });

  // The stamp answers closed: the burn falls back to the authored fix, the instruments to the
  // waypoint pos — neither follows the recycler.
  const target = resolveAutopilotTarget(state, state.nav.autopilot);
  assert.equal(target.entity, null, 'the recycled holder is never chased');
  assert.deepEqual({ x: target.x, z: target.z }, { x: 60, z: 40 });
  const after = resolveWaypointPresentationPosition(state, state.nav.waypoint);
  assert.deepEqual({ x: after.x, z: after.z }, { x: 60, z: 40 });
});

test('PB-285: a signal record emits the body it still proves, never a stale or recycled id', () => {
  const state = boot();
  const pirate = spawn(state, hostileMule(7));
  const emitted = [];
  const sys = { ...scanner, state, bus: { emit: (name, payload) => emitted.push({ name, payload }) } };
  const own = state.signalInvestigation || (state.signalInvestigation = { records: {}, completed: {}, receipts: [], triangulations: {}, clues: { subjects: {} } });
  const record = own.records['sig:1'] = {
    id: 'sig:1',
    pos: { x: 60, z: 40 },
    classification: 'HOSTILE SHIP',
    entityId: 7,
    entityStable: captureEntitySelection(pirate),
  };

  // The live holder binds — the course follows the proven body, not the raw stored id.
  sys._armSignalInvestigation(record);
  let course = emitted.filter((e) => e.name === 'ui:setCourse').pop().payload;
  assert.equal(course.targetEntityId, 7);

  // The holder dies and the pool reissues the id — the record emits no bind rather than aim
  // the pilot at a stranger under the pirate's label.
  pirate.alive = false;
  spawn(state, {
    id: 7, type: 'ship', alive: true,
    pos: { x: 900, y: 0, z: 900 }, vel: { x: 0, y: 0, z: 0 }, rot: 0,
    factionId: 'vagrant_combine',
    data: { name: 'Unrelated skiff', role: 'hauler', kind: 'mule' },
  });
  sys._armSignalInvestigation(record);
  course = emitted.filter((e) => e.name === 'ui:setCourse').pop().payload;
  assert.equal(course.targetEntityId, null);
  assert.deepEqual(course.pos, { x: 60, z: 40 }, 'the recorded fix stays the honest aim');
});

test('PB-285: a re-materialized gate keeps the armed burn, the throw aim and the warm prediction', () => {
  const state = boot();
  state.world.currentSectorId = 'sector_a';
  const player = state.entities.get(0);
  const gate = spawn(state, {
    id: 5, type: 'station', alive: true,
    pos: { x: 200, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, rot: 0,
    data: { stationId: 'aurelia_gate', isGate: true, gateTo: 'sector_b', dockRadius: 100, name: 'Aurelia Gate' },
  });
  // The course owner stamps the bind at arm time (world._onSetCourse does exactly this).
  const bind = captureEntitySelection(gate);
  state.nav.waypoint = { pos: { x: 200, z: 0 }, targetEntityId: 5, stable: bind };
  state.nav.autopilot = { active: true, targetEntityId: 5, stable: bind };

  // Continuous residency swaps the instance: entity 5 out, entity 12 in under the same
  // catalogue identity — the bare id now names a dead slot.
  despawn(state, gate);
  spawn(state, { ...gate, id: 12 });

  // The throw resolver aims at the re-materialized body, not the dead slot.
  const aim = masslineThrow._resolveSelfAim(state);
  assert.equal(aim.kind, 'waypoint');
  assert.equal(aim.targetId, 12);

  // The camera director's approach instrument reads the same new instance.
  const approach = resolveGateApproachTarget(state, player);
  assert.ok(approach, 'the armed gate still resolves');
  assert.equal(approach.gate.id, 12);

  // And sector warming still predicts the armed destination through the stamp.
  const prediction = predictNextSector(state);
  assert.ok(prediction, 'a prediction survives the swap');
  assert.equal(prediction.sectorId, 'sector_b');
  assert.equal(prediction.source, 'autopilot-gate');
});

test('PB-285: a mid-burn recycle closes the throw, the approach read and the warm', () => {
  const state = boot();
  state.world.currentSectorId = 'sector_a';
  const player = state.entities.get(0);
  const pirate = spawn(state, hostileMule(7, { pos: { x: 300, y: 0, z: 0 } }));
  const bind = captureEntitySelection(pirate);
  state.nav.waypoint = { pos: { x: 300, z: 0 }, targetEntityId: 7, stable: bind };
  state.nav.autopilot = { active: true, targetEntityId: 7, stable: bind };

  // While the pirate lives the throw aims at it.
  assert.equal(masslineThrow._resolveSelfAim(state).targetId, 7);

  // It dies; the pool reissues id 7 onto an unrelated skiff.
  pirate.alive = false;
  spawn(state, {
    id: 7, type: 'ship', alive: true,
    pos: { x: 900, y: 0, z: 900 }, vel: { x: 0, y: 0, z: 0 }, rot: 0,
    factionId: 'vagrant_combine',
    data: { name: 'Unrelated skiff', role: 'hauler', kind: 'mule' },
  });

  // The stamp resolves closed: the throw falls back to the recorded fix rather than throwing
  // the line at the body that inherited the id.
  const aim = masslineThrow._resolveSelfAim(state);
  assert.equal(aim.kind, 'waypoint');
  assert.equal(aim.targetId, null);
  assert.deepEqual({ x: aim.target.pos.x, z: aim.target.pos.z }, { x: 300, z: 0 });

  // The approach read and the warm prediction close the same way — never onto the recycler.
  assert.equal(resolveGateApproachTarget(state, player), null);
  assert.equal(predictNextSector(state), null);
});

test('PB-285 REV: a seeded throw re-proves its stamped bind every tick, then chases the fix', () => {
  const state = boot();
  const player = state.entities.get(0);
  const payload = { id: 99, type: 'payload' };
  const gate = spawn(state, {
    id: 5, type: 'station', alive: true,
    pos: { x: 200, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, rot: 0,
    data: { stationId: 'aurelia_gate', isGate: true, name: 'Aurelia Gate' },
  });
  const bind = captureEntitySelection(gate);
  state.nav.waypoint = { pos: { x: 200, z: 0 }, targetEntityId: 5, stable: bind, arrivalRadius: 40 };
  // The seeded record is what the latch wrote at seed time — stamp and all.
  const runtime = {
    releaseTarget: { kind: 'entity', source: 'waypoint', targetId: 5, pos: null, radius: 0, stable: bind },
  };

  // While the bind lives the release aims at the holder.
  let aim = masslineThrow._resolveThrowAim(state, player, payload, runtime);
  assert.equal(aim.entity.id, 5);

  // A post-seed rematerialize under a new id — the stamped bind follows the live body instead
  // of stranding the seeded targetId on a dead slot.
  despawn(state, gate);
  const gate2 = spawn(state, { ...gate, id: 12 });
  aim = masslineThrow._resolveThrowAim(state, player, payload, runtime);
  assert.equal(aim.entity.id, 12, 'the release followed the re-materialized gate');

  // The durable identity is gone for good — the bind closes and the throw keeps the recorded
  // fix as a point aim rather than dropping the release or trusting the dead slot.
  despawn(state, gate2);
  aim = masslineThrow._resolveThrowAim(state, player, payload, runtime);
  assert.equal(aim.entity, null);
  assert.deepEqual({ x: aim.target.pos.x, z: aim.target.pos.z }, { x: 200, z: 0 });
  assert.equal(runtime.releaseTarget.targetId, null, 'the record degraded to its point fix');
});

test('PB-285 REV: a recycled seeded bind falls back to the fix, never the new occupant', () => {
  const state = boot();
  const player = state.entities.get(0);
  const payload = { id: 99, type: 'payload' };
  const pirate = spawn(state, hostileMule(7, { pos: { x: 300, y: 0, z: 0 } }));
  const bind = captureEntitySelection(pirate);
  state.nav.waypoint = { pos: { x: 300, z: 0 }, targetEntityId: 7, stable: bind, arrivalRadius: 20 };
  const runtime = {
    releaseTarget: { kind: 'entity', source: 'waypoint', targetId: 7, pos: null, radius: 0, stable: bind },
  };

  assert.equal(masslineThrow._resolveThrowAim(state, player, payload, runtime).entity.id, 7);

  // The pirate dies; the pool reissues id 7 onto an unrelated skiff.
  pirate.alive = false;
  spawn(state, {
    id: 7, type: 'ship', alive: true,
    pos: { x: 900, y: 0, z: 900 }, vel: { x: 0, y: 0, z: 0 }, rot: 0,
    factionId: 'vagrant_combine',
    data: { name: 'Unrelated skiff', role: 'hauler', kind: 'mule' },
  });

  const aim = masslineThrow._resolveThrowAim(state, player, payload, runtime);
  assert.equal(aim.entity, null, 'the stamp resolved closed — the occupant is not the target');
  assert.deepEqual({ x: aim.target.pos.x, z: aim.target.pos.z }, { x: 300, z: 0 });
});

test('PB-285 REV: a stable-resolved gate without a pos never reaches the approach math', () => {
  const state = boot();
  const player = state.entities.get(0);
  // A live gate still composing its body mid-rematerialize: the stamp resolves, pos is absent.
  const gate = spawn(state, {
    id: 5, type: 'station', alive: true,
    vel: { x: 0, y: 0, z: 0 }, rot: 0,
    data: { stationId: 'aurelia_gate', isGate: true, gateTo: 'sector_b', name: 'Aurelia Gate' },
  });
  const bind = captureEntitySelection(gate);
  state.nav.autopilot = { active: true, targetEntityId: 5, stable: bind };
  assert.equal(resolveGateApproachTarget(state, player), null, 'a positionless gate closes the read');
});

test('PB-285 REV: a course armed at a dead payload binds nothing', () => {
  const state = boot();
  const system = { ...world, state, bus: { emit() {} }, computeRoute() { return null; } };
  // The payload names id 77, which holds no live entity — the bind cannot be proven, so the
  // course carries the fix only. A bare id here would be a bind the next occupant inherits.
  system._onSetCourse({ pos: { x: 60, z: 40 }, targetEntityId: 77, label: 'ghost' });
  assert.equal(state.nav.waypoint.targetEntityId, undefined, 'no unprovable id is written');
  assert.equal(state.nav.autopilot.targetEntityId, null, 'the armed burn binds nothing either');
  assert.equal(state.nav.waypoint.stable, undefined);
  assert.equal(state.nav.waypoint.pos.x, 60, 'the authored fix stays the aim');
});

test('PB-285 REV: record-key resolution answers through the world-record index lane', () => {
  const state = boot();
  const wreck = spawn(state, {
    id: 8, type: 'wreck', alive: true,
    pos: { x: 1, y: 0, z: 1 }, vel: { x: 0, y: 0, z: 0 }, rot: 0,
    data: { worldRecordId: 'wr_1', name: 'hulk' },
  });
  const sel = { key: 'record:wr_1', durable: true, entityId: 8, stamp: null };
  // No index yet — the entityList walk answers.
  assert.equal(resolveEntitySelection(state, sel), wreck);

  // A healthy index row resolves the same holder without the walk.
  state.entityIndex = {
    byWorldRecordId: new Map([['wr_1', wreck]]),
    byWorldRecordIdCount: new Map([['wr_1', 1]]),
  };
  assert.equal(resolveEntitySelection(state, sel), wreck);

  // A stale row (the indexed holder is dead, still counted) fails verification and the walk
  // answers the same closed result the index would have lied about.
  wreck.alive = false;
  assert.equal(resolveEntitySelection(state, sel), null);

  // Ambiguity (a second carrier) refuses the fast lane entirely — the walk still finds the
  // live holder even though the index row is the dead one.
  const wreck2 = spawn(state, {
    id: 9, type: 'wreck', alive: true,
    pos: { x: 2, y: 0, z: 2 }, vel: { x: 0, y: 0, z: 0 }, rot: 0,
    data: { worldRecordId: 'wr_1', name: 'hulk' },
  });
  state.entityIndex.byWorldRecordIdCount.set('wr_1', 2);
  assert.equal(resolveEntitySelection(state, sel), wreck2);
});

test('PB-285 REV: a durable bind survives save/restore — the stable stamp re-materializes', () => {
  const state = boot();
  // A convoy host carries a durable world-record identity — the class of body a course can be
  // armed at whose pos is stale the moment it is written.
  const convoy = spawn(state, {
    id: 21, type: 'ship', alive: true,
    pos: { x: 400, y: 0, z: -120 }, vel: { x: 0, y: 0, z: 0 }, rot: 0,
    data: { worldRecordId: 'wr_convoy_7', name: 'Pallas runner', kind: 'hauler' },
  });
  const system = { ...world, state, bus: { emit() {} }, computeRoute() { return null; } };
  system._onSetCourse({ pos: { x: 400, z: -120 }, targetEntityId: 21, label: 'Pallas runner' });
  assert.equal(state.nav.waypoint.stable.key, 'record:wr_convoy_7', 'the armed bind is durable');

  // Serialize + restore through the real save path.
  const saveSys = { ...save, state, bus: { emit() {} } };
  const restoredNav = JSON.parse(JSON.stringify(saveSys._serializeNav()));
  assert.equal(restoredNav.waypoint.targetWorldRecordId, 'wr_convoy_7',
    'the save carried the durable identity');
  assert.equal(restoredNav.waypoint.targetEntityId, undefined,
    'the runtime id never persists');
  assert.equal(restoredNav.waypoint.stable, undefined,
    'the runtime stamp itself never persists — it is re-derived on load');

  state.nav = { route: null, autoTravel: false, waypoint: null, autopilot: null };
  saveSys._restoreNav(restoredNav);
  assert.equal(state.nav.waypoint.stable.key, 'record:wr_convoy_7',
    'the restored waypoint re-materializes the durable stamp');
  assert.equal(state.nav.autopilot.stable.key, 'record:wr_convoy_7',
    'the restored burn re-materializes the same stamp');
  assert.equal(state.nav.waypoint.targetEntityId, undefined);

  // The convoy moved during the save: the re-materialized bind resolves the live body, not the
  // frozen fix — the whole point of the durable contract.
  convoy.pos.x = 900;
  convoy.pos.z = 40;
  const resolved = resolveEntitySelection(state, state.nav.waypoint.stable);
  assert.equal(resolved, convoy, 'the restored bind resolves the live record holder');

  // A record that no longer exists resolves closed — same fail-safe as any stable bind.
  convoy.alive = false;
  assert.equal(resolveEntitySelection(state, state.nav.waypoint.stable), null);
});

test('PB-285: the live route consumes the model — draw reconciles, every commit gates', () => {
  const src = readFileSync(join(ROOT, 'src/ui/galaxyMap.js'), 'utf8');
  const draw = src.slice(src.indexOf('_draw() {'));
  assert.ok(draw.includes('reconcileMapSelection('),
    'the draw path re-resolves the held selection before painting the ring/inspector');
  // The gated resolver is the single seam every commit path goes through — dblclick, released
  // line, and the inspector's primary action included.
  const commit = src.slice(src.indexOf('_commitCourse(target'));
  assert.ok(commit.includes('commitCoursePayload('),
    'the ONE course commit path resolves stamped marks');
  const primary = src.slice(src.indexOf('export function resolveGalaxyMapPrimaryAction'));
  assert.ok(primary.includes('commitCoursePayload(state, target)'),
    'the inspector primary action resolves through the same gate');
  // Waypoint/goal pins (the stalest id field — nav.waypoint persists past death) stamp or drop.
  assert.ok(src.includes('stampWaypointTarget(state, target)'),
    'waypoint markers re-witness their carried entityId');
  assert.ok(src.includes('stable: c.stable || null'), 'contact click targets carry the stamp');
  assert.ok(src.includes('stable: p.stable || null'), 'system point targets carry the stamp');
  assert.ok(src.includes('stable: captureEntitySelection(e)'), 'markers stamp the live entity at build time');
  assert.ok(src.includes("from './sim/stableSelection.js'"), 'the screen consumes the sim model, not a reimplementation');

  // The armed course is gated for its whole life, not just the commit instant: the owner
  // stamps the bind, flight and every instrument resolve through it.
  const worldSrc = readFileSync(join(ROOT, 'src/systems/world.js'), 'utf8');
  assert.ok(worldSrc.includes('captureEntitySelection(') && worldSrc.includes('waypoint.stable'),
    'the course owner stamps the bind it arms');
  const flightSrc = readFileSync(join(ROOT, 'src/systems/flightV3.js'), 'utf8');
  assert.ok(flightSrc.includes('resolveEntitySelection(state, autopilot.stable)'),
    'the burn re-proves its bind every tick instead of trusting the raw id');
  const wpSrc = readFileSync(join(ROOT, 'src/ui/navigationWaypoint.js'), 'utf8');
  assert.ok(wpSrc.includes('waypoint.stable'),
    'HUD/radar/map instruments share the stamped bind');
  // The bare-id readers downstream of the armed course read the stamp too — never the recycled
  // slot a bare targetEntityId would name after a death or an instance swap.
  const throwSrc = readFileSync(join(ROOT, 'src/systems/masslineThrow.js'), 'utf8');
  assert.ok(throwSrc.split('resolveEntitySelection(state, waypoint.stable)').length - 1 >= 2,
    'the self-throw resolver and the release seed both read the stamped waypoint bind');
  assert.ok(throwSrc.includes('resolveEntitySelection(state, releaseTarget.stable)'),
    'a seeded release re-proves its stamp every tick instead of trusting the seeded id');
  const tetherSrc = readFileSync(join(ROOT, 'src/systems/tetherGameplay.js'), 'utf8');
  assert.ok(tetherSrc.includes('resolveEntitySelection(state, waypoint.stable)') &&
    tetherSrc.includes('resolveEntitySelection(state, autopilot.stable)'),
    'the tether acquisition hint resolves the armed course through its stamps');
  const camSrc = readFileSync(join(ROOT, 'src/render/cameraDirector.js'), 'utf8');
  assert.ok(camSrc.includes('resolveEntitySelection(state, autopilot.stable)'),
    'the gate-approach instrument reads the stamped autopilot bind');
  const predictSrc = readFileSync(join(ROOT, 'src/render/sectorPredict.js'), 'utf8');
  assert.ok(predictSrc.includes('resolveEntitySelection(state, autopilot.stable)') &&
    predictSrc.includes('resolveEntitySelection(state, waypoint.stable)'),
    'the sector warmer reads both stamped binds');
  const scanSrc = readFileSync(join(ROOT, 'src/systems/scanner.js'), 'utf8');
  assert.ok(scanSrc.includes('entityStable') && scanSrc.includes('recordEntity('),
    'signal records stamp at write and validate at emit — no stale id rides out');
  // A retired bind drops its stamp with its id: a stale stamp left on the object is inert only
  // while every reader gates on active, so the retirement paths clear both fields together.
  const routeSrc = readFileSync(join(ROOT, 'src/systems/routeFollower.js'), 'utf8');
  assert.ok(routeSrc.split('autopilot.stable = null').length - 1 >= 2,
    'route disarm and gate-arrival retire the stamp with the id');
  assert.ok(flightSrc.includes('autopilot.stable = null'),
    'stopAutopilot retires the stamped bind with the burn');
  // The record lane uses the world-record index when it can give an unambiguous answer, so a
  // per-tick resolve does not walk the whole entity list.
  const selSrc = readFileSync(join(ROOT, 'src/ui/sim/stableSelection.js'), 'utf8');
  assert.ok(selSrc.includes('byWorldRecordIdCount') && selSrc.includes('byWorldRecordId'),
    'record-key resolution rides the index fast lane when the count proves one carrier');
});
