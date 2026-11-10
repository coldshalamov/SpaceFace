import test from 'node:test';
import assert from 'node:assert/strict';
import {createSimulation} from '../src/core/sim.js';
import {morrow} from '../src/systems/morrow.js';
import {MORROW} from '../src/data/morrow.js';
import {SIM_TIER} from '../src/world/activityClassification.js';
import {
  isAnonymousMorrowTwin,
  restoreFarActorTable,
  shouldVirtualizeFarActor,
} from '../src/world/farActorTable.js';

// D189: old saves carry anonymous far rows minted when pre-fix Morrow bodies shelved
// without authoredCharacter. The rows hold no identity beyond the immutable spec they were
// snapshotted with — but that spec (type drone, mass 18000, radius 15) matches no ambient
// spawner, so the migration keys on it and never on position.

function oldMorrowRow(id, over = {}) {
  return {
    id, type: 'drone', alive: true, farResident: true,
    pos: {x: 1000, z: -200}, vel: {x: 0, z: 0}, rot: 0, angVel: 0,
    radius: MORROW.radius, mass: MORROW.mass, hull: 200, hullMax: MORROW.hull,
    shield: 0, shieldMax: 0, team: 2, factionId: 'faction_free',
    homeSectorId: MORROW.sectorId, hullDefId: null,
    intent: null, route: null, lastExactT: 0, nextEventAtT: -1,
    collides: true, data: {ai: {archetype: 'passive'}},
    jobId: null, trafficRole: null, virtualizedAt: 0,
    ...over,
  };
}

function ambientRow(id) {
  return oldMorrowRow(id, {
    radius: 4, mass: 12, hull: 100, hullMax: 100, team: 0, factionId: 'faction_player',
    homeSectorId: 'sector_other', data: {ai: {archetype: 'passive'}},
  });
}

test('isAnonymousMorrowTwin matches by immutable spec, never by position', () => {
  assert.equal(isAnonymousMorrowTwin(oldMorrowRow(1)), true);
  // Damaged hull and drifted position do not matter; hull is state, not identity.
  assert.equal(isAnonymousMorrowTwin(oldMorrowRow(2, {hull: 5, pos: {x: -40000, z: 41000}})), true);
  // Missing home sector still matches: mass+radius alone identify the shell.
  const noSector = oldMorrowRow(3); delete noSector.homeSectorId;
  assert.equal(isAnonymousMorrowTwin(noSector), true);
  // Unrelated actors never match.
  assert.equal(isAnonymousMorrowTwin(ambientRow(4)), false);
  assert.equal(isAnonymousMorrowTwin(oldMorrowRow(5, {type: 'ship'})), false);
  assert.equal(isAnonymousMorrowTwin(oldMorrowRow(6, {mass: 40, radius: 14})), false);
  assert.equal(isAnonymousMorrowTwin(oldMorrowRow(7, {homeSectorId: 'sector_other'})), false);
  // Any identity marker disqualifies: marked, mission-pinned, and claimed rows stay.
  assert.equal(isAnonymousMorrowTwin(oldMorrowRow(8, {data: {authoredCharacter: 'morrow'}})), false);
  assert.equal(isAnonymousMorrowTwin(oldMorrowRow(9, {data: {morrow: true}})), false);
  assert.equal(isAnonymousMorrowTwin(oldMorrowRow(10, {data: {missionId: 'm1'}})), false);
  assert.equal(isAnonymousMorrowTwin(oldMorrowRow(11, {data: {missionPinned: true}})), false);
  assert.equal(isAnonymousMorrowTwin(null), false);
});

test('restore drops anonymous Morrow shells and keeps everything else', () => {
  const state = {world: {}};
  const rows = [
    oldMorrowRow(1), oldMorrowRow(2, {hull: 5}),
    ambientRow(3),
    oldMorrowRow(4, {data: {missionId: 'm1'}}),
    oldMorrowRow(5, {data: {authoredCharacter: 'morrow'}}),
    oldMorrowRow(6, {homeSectorId: 'sector_other'}),
  ];
  const table = restoreFarActorTable(state, {schema: 'spaceface.farActors.v1', version: 0, rows});
  assert.deepEqual(table.rows.map((r) => r.id).sort((a, b) => a - b), [3, 4, 5, 6]);
});

function fixture() {
  const sim = createSimulation({seed: 4242, systems: [morrow]});
  const state = sim.state;
  state.mode = 'flight'; state.world.currentSectorId = MORROW.sectorId;
  state.playerId = sim.spawn({type: 'ship', isPlayer: true, team: 0,
    pos: {x: MORROW.anchor.x + 5000, z: MORROW.anchor.z}, radius: 4,
    hull: 100, hullMax: 100, mass: 12}).id;
  const system = sim.registry.get('morrow'); system.update(1 / 60, state);
  return {sim, state, system};
}

function liveDrones(state) {
  return state.entityList.filter((e) => e && e.alive && e.type === 'drone' && !e.isPlayer);
}

function spawnTwin(sim, state, over = {}) {
  const spawned = sim.spawn({type: 'drone', team: 2,
    pos: {x: MORROW.anchor.x + 100, z: MORROW.anchor.z}, radius: MORROW.radius,
    hull: 200, hullMax: MORROW.hull, mass: MORROW.mass, ...over});
  const twin = (spawned && spawned.id != null ? state.entities.get(spawned.id) : null) || spawned;
  twin.activity = {simTier: SIM_TIER.S2_ABSTRACT};
  return twin;
}

test('old save heals: restore drops shells, load mints exactly one Morrow', () => {
  const {sim, state, system} = fixture();
  try {
    restoreFarActorTable(state, {schema: 'spaceface.farActors.v1', version: 0,
      rows: [oldMorrowRow(11), oldMorrowRow(12, {hull: 5}), ambientRow(13)]});
    assert.equal(state.world.farActors.rows.length, 1);
    sim.bus.emit('save:restoring', {}); sim.bus.emit('save:loaded', {});
    const morrows = liveDrones(state).filter((e) => e.data && e.data.morrow === true);
    assert.equal(morrows.length, 1);
    assert.equal(state.world.farActors.rows.length, 1);
    assert.equal(state.world.farActors.rows[0].id, 13);
  } finally { system.destroy(); sim.dispose(); }
});

test('live twin beside a true body is retired, the owner keeps ritual state', () => {
  const {sim, state, system} = fixture();
  try {
    const owner = system._entity();
    assert.ok(owner && owner.data && owner.data.morrow === true);
    const twin = spawnTwin(sim, state);
    system._syncEntity();
    assert.equal(twin.alive, false);
    assert.equal(system._entity(), owner);
    assert.equal(liveDrones(state).filter((e) => e.data && e.data.morrow === true).length, 1);
  } finally { system.destroy(); sim.dispose(); }
});

test('live twin with no true body is adopted, never minted beside', () => {
  const {sim, state, system} = fixture();
  try {
    const owner = system._entity();
    system.helpers.removeEntity(owner.id);
    const before = liveDrones(state).length;
    const twin = spawnTwin(sim, state);
    assert.equal(liveDrones(state).length, before + 1);
    system._syncEntity();
    assert.equal(twin.data.morrow, true);
    assert.equal(system._entity(), twin);
    assert.equal(liveDrones(state).length, before + 1);
  } finally { system.destroy(); sim.dispose(); }
});

test('adopted twin survives the next update with full resident identity', () => {
  const {sim, state, system} = fixture();
  try {
    system.helpers.removeEntity(system._entity().id);
    const twin = spawnTwin(sim, state);
    const shelvedPos = {...twin.pos}, shelvedHull = twin.hull;
    system._syncEntity();
    assert.doesNotThrow(() => system.update(1 / 60, state));
    assert.equal(twin.data.authoredCharacter, 'morrow');
    assert.ok(twin.data.morrowPose && Number.isFinite(twin.data.morrowPose.simTime));
    assert.ok(twin.physicsBody && twin.physicsBody.shape === 'ball');
    assert.equal(twin.name, MORROW.name);
    assert.deepEqual({x: twin.pos.x, z: twin.pos.z}, {x: shelvedPos.x, z: shelvedPos.z});
    assert.equal(twin.hull, shelvedHull);
    assert.doesNotThrow(() => system.update(1 / 60, state));
  } finally { system.destroy(); sim.dispose(); }
});

test('adopted and minted bodies keep custody: they never re-shelve', () => {
  const {sim, state, system} = fixture();
  try {
    system.helpers.removeEntity(system._entity().id);
    const twin = spawnTwin(sim, state);
    system._syncEntity();
    assert.equal(shouldVirtualizeFarActor(system._entity(), state), false);
    assert.equal(twin.alive, true);
  } finally { system.destroy(); sim.dispose(); }
});
