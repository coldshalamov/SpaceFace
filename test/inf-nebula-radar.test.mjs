// INF-10 (WF-12): inside a nebula the radar really goes blind past close range. Presentation only:
// the model below is the radar's own contact census. Seed 4242 (no RNG is involved).
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NEBULA_VEIL_GHOST_FRACTION,
  NEBULA_VEIL_HIDE_FRACTION,
  VEIL_CLEAR,
  VEIL_GHOST,
  VEIL_HIDDEN,
  censusRadarContactsStillLayer,
  createRadarContactsStillCache,
  nebulaVeilActive,
  nebulaVeilBand,
} from '../src/ui/radar.js';
import { tacticalRadarMetrics } from '../src/ui/map/tacticalMapGrammar.js';
import { createSimulation } from '../src/core/sim.js';
import { hazardHints } from '../src/data/hazardLanguage.js';

const RANGE = 4000;
const rangeSq = RANGE * RANGE;
const metrics = tacticalRadarMetrics(false);

// Named lane contacts are salient, so the close-band traffic dial draws them sector-wide.
function ship(id, x, team = 0, named = false) {
  return {
    id, type: 'ship', alive: true, team, pos: { x, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    data: { ai: { passive: team === 0 }, namedLaneContactId: named ? `lane-${id}` : null },
  };
}
const station = { id: 50, type: 'station', alive: true, team: 0, pos: { x: 3600, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, data: {} };

const CONTACTS = [
  ship(10, 1000),          // 25 %  - inside the reduced range
  ship(11, 1700),          // 42.5 % - still inside
  ship(12, 2200, 0, true), // 55 %  - ghost band
  ship(13, 2900, 0, true), // 72.5 % - ghost band
  ship(14, 3300, 0, true), // 82.5 % - gone
  ship(18, 2400),          // ordinary traffic at 60 %: the close-band dial never draws it, veil or not
  ship(17, 2500, 1),       // hostile in the ghost band
  ship(15, 3300, 1),       // hostile at 82.5 % - gone, and no off-range chevron either
  ship(16, 5200, 1),       // hostile beyond the dial - no chevron inside a nebula
  station,
];

function census({ veil, targetId = null, cache = createRadarContactsStillCache(), contacts = CONTACTS } = {}) {
  const hostile = [];
  const infra = [];
  const neutral = [];
  const ghosts = [];
  const result = censusRadarContactsStillLayer({
    contacts,
    player: { id: 1, pos: { x: 0, z: 0 }, team: 0 },
    playerTeam: 0,
    state: { playerId: 1, factions: {} },
    range: RANGE,
    rangeSq,
    metrics,
    targetId,
    projectScratch: { x: 0, y: 0, dx: 0, dz: 0, distance: 0, offRange: false, angle: 0, scale: 0, resolved: true },
    pushHostileMark: (entity) => hostile.push(entity.id),
    pushInfrastructureMark: (entity) => infra.push(entity.id),
    pushNeutralMark: (entity) => neutral.push(entity.id),
    hostileMarks: { length: 0, set length(v) { hostile.length = v; }, get length() { return hostile.length; } },
    infrastructureMarks: { set length(v) { infra.length = v; }, get length() { return infra.length; } },
    neutralMarks: { set length(v) { neutral.length = v; }, get length() { return neutral.length; } },
    cache,
    hostileOf: (entity) => entity.team === 1,
    veil,
    ghostMarks: { set length(v) { ghosts.length = v; }, get length() { return ghosts.length; } },
    pushGhostMark: (entity) => ghosts.push(entity.id),
  });
  return { result, hostile, infra, neutral, ghosts };
}

test('the veil bands are 45 % and 75 % of the radar range', () => {
  assert.equal(NEBULA_VEIL_GHOST_FRACTION, 0.45);
  assert.equal(NEBULA_VEIL_HIDE_FRACTION, 0.75);
  assert.equal(nebulaVeilBand(1800 * 1800, rangeSq), VEIL_CLEAR, 'exactly at 45 % is still clear');
  assert.equal(nebulaVeilBand(1801 * 1801, rangeSq), VEIL_GHOST);
  assert.equal(nebulaVeilBand(3000 * 3000, rangeSq), VEIL_GHOST);
  assert.equal(nebulaVeilBand(3001 * 3001, rangeSq), VEIL_HIDDEN);
  assert.equal(nebulaVeilBand(1, 0), VEIL_CLEAR, 'a degenerate range never hides anything');
});

test('the hazard read decides: nebula and nebula_fog veil, everything else does not', () => {
  assert.equal(nebulaVeilActive({ ui: { hazardRead: { type: 'nebula' } } }), true);
  assert.equal(nebulaVeilActive({ ui: { hazardRead: { type: 'nebula_fog' } } }), true);
  assert.equal(nebulaVeilActive({ ui: { hazardRead: { type: 'radiation' } } }), false);
  assert.equal(nebulaVeilActive({ ui: { hazardRead: null } }), false);
  assert.equal(nebulaVeilActive({}), false);
  assert.equal(nebulaVeilActive(null), false);
});

test('without a nebula the census is unchanged: every contact resolves normally and nothing is ghosted', () => {
  const clear = census({ veil: false });
  assert.deepEqual(clear.neutral.sort(), [10, 11, 12, 13, 14]);
  assert.deepEqual(clear.hostile.sort(), [15, 17]);
  assert.deepEqual(clear.ghosts, []);
  assert.equal(clear.result.nearestOffRangeHostile.id, 16, 'the off-range hostile chevron works');
});

test('inside a nebula far contacts ghost, farther ones vanish, near ones are untouched', () => {
  const veiled = census({ veil: true });
  // 10, 11 are inside 45 %; 12, 13 are ghosts; 14, 15, 16 are gone.
  assert.deepEqual(veiled.neutral.sort(), [10, 11], 'near contacts keep their normal marks');
  assert.deepEqual(veiled.ghosts.sort(), [12, 13, 17], 'mid contacts, hostile ones too, become unknown ghosts');
  assert.ok(!veiled.ghosts.includes(18), 'ordinary traffic the dial hides is not revealed as a ghost');
  assert.deepEqual(veiled.hostile, [], 'a hostile past the veil is not drawn as a hostile');
  assert.equal(veiled.result.nearestOffRangeHostile, null, 'and no rim chevron gives its bearing away');
  assert.deepEqual(veiled.infra, [50], 'a charted station keeps its mark');
});

test('the locked target keeps its mark inside the reduced range and is only a ghost beyond it', () => {
  const near = census({ veil: true, targetId: 11 });
  assert.ok(near.neutral.includes(11), 'a target inside the reduced range is unchanged');
  const far = census({ veil: true, targetId: 12 });
  assert.ok(far.ghosts.includes(12) && !far.neutral.includes(12), 'beyond the reduced range it is a ghost, not erased');
});

test('leaving the nebula restores every mark at once, even through the still-layer cache', () => {
  const cache = createRadarContactsStillCache();
  const inside = census({ veil: true, cache });
  assert.deepEqual(inside.ghosts.sort(), [12, 13, 17]);
  const outside = census({ veil: false, cache });
  assert.deepEqual(outside.neutral.sort(), [10, 11, 12, 13, 14]);
  assert.deepEqual(outside.ghosts, []);
  assert.deepEqual(outside.hostile.sort(), [15, 17]);
  const again = census({ veil: true, cache });
  assert.deepEqual(again.ghosts.sort(), [12, 13, 17], 'and it veils again on re-entry');
});

test('the census is deterministic for the same contacts and veil', () => {
  const a = census({ veil: true });
  const b = census({ veil: true });
  assert.deepEqual({ ...a, result: undefined }, { ...b, result: undefined });
});

test('the locked target is never erased: beyond the hide band it stays a ghost while it is on the dial', () => {
  const far = census({ veil: true, targetId: 14 });
  assert.ok(far.ghosts.includes(14), 'a target at 82.5 % is a ghost, not gone');
  assert.ok(!far.neutral.includes(14));
  const other = census({ veil: true, targetId: null });
  assert.ok(!other.ghosts.includes(14), 'an unlocked contact at the same range is gone');
  const offDial = census({ veil: true, targetId: 16 });
  assert.ok(!offDial.ghosts.includes(16), 'a target beyond the dial itself has no mark to ghost');
});

test('a nebula read stamped in another sector never veils the radar', () => {
  const inHere = { world: { currentSectorId: 'sector_pallas_drift' }, ui: { hazardRead: { type: 'nebula', sectorId: 'sector_pallas_drift' } } };
  const stale = { world: { currentSectorId: 'sector_helios_prime' }, ui: { hazardRead: { type: 'nebula', sectorId: 'sector_pallas_drift' } } };
  assert.equal(nebulaVeilActive(inHere), true);
  assert.equal(nebulaVeilActive(stale), false, 'the jump left the nebula behind');
});

test('enter a nebula, jump sector: the hazard read clears and the radar is not veiled', () => {
  const sim = createSimulation({ seed: 4242, systems: [hazardHints] });
  const { state, bus } = sim;
  state.world.currentSectorId = 'sector_pallas_drift';
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 }, hull: 100, hullMax: 100, radius: 6 });
  state.playerId = player.id;
  bus.emit('hazard:enter', { entityId: player.id, zoneType: 'nebula', intensity: 0.9 });
  assert.equal(state.ui.hazardRead.type, 'nebula');
  assert.equal(state.ui.hazardRead.sectorId, 'sector_pallas_drift');
  assert.equal(nebulaVeilActive(state), true, 'inside the nebula the radar is veiled');
  state.world.currentSectorId = 'sector_helios_prime';
  bus.emit('sector:enter', { sectorId: 'sector_helios_prime' });
  assert.equal(state.ui.hazardRead, null, 'sector entry clears the read (world emits no hazard:exit)');
  assert.equal(nebulaVeilActive(state), false);
  assert.deepEqual(census({ veil: nebulaVeilActive(state) }).ghosts, [], 'clear space shows every contact');
  bus.emit('hazard:enter', { entityId: player.id, zoneType: 'nebula', intensity: 0.9 });
  assert.equal(nebulaVeilActive(state), true, 'a nebula in the new sector veils again');
});
