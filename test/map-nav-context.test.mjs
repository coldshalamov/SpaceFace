// test/map-nav-context.test.mjs — the "Never Lost" readout (Wave 2, Slice A).
//
// Every positional case is exercised in sector_tethys_junction (origin 12288, 8192) as well as, or
// instead of, Helios. Helios sits at (0,0), so a global/sector-local frame mistake is arithmetically
// invisible there and 12,288 WU wrong everywhere else — the exact class of bug this program exists
// to fix, and the reason the starting sector is the worst possible place to test a coordinate.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAP_NAV_CONTEXT_SCHEMA,
  NAV_CONTEXT_ROW_KEYS,
  NAV_ROW_TONE,
  resolveMapNavContext,
  resolveMapFramingActions,
  formatDistanceWU,
} from '../src/ui/map/mapNavContext.js';
import { MAP_PRESET_SPAN_WU, levelForSpan } from '../src/ui/map/mapCamera.js';
import { sectorGlobalOrigin } from '../src/data/sectorCoordinates.js';

const HELIOS = 'sector_helios_prime';
const TETHYS = 'sector_tethys_junction';
const TETHYS_ORIGIN = sectorGlobalOrigin(TETHYS);
const HELIOS_ORIGIN = sectorGlobalOrigin(HELIOS);

test('tethys origin is nonzero, so these tests can actually catch a frame mistake', () => {
  assert.equal(TETHYS_ORIGIN.x, 12288);
  assert.equal(TETHYS_ORIGIN.z, 8192);
  assert.equal(HELIOS_ORIGIN.x, 0);
  assert.equal(HELIOS_ORIGIN.z, 0);
});

// ---------------------------------------------------------------------------------------------
// The contract: four rows, always, never empty
// ---------------------------------------------------------------------------------------------

test('an empty input still yields four populated rows — the chart never looks broken', () => {
  const ctx = resolveMapNavContext();
  assert.equal(ctx.schema, MAP_NAV_CONTEXT_SCHEMA);
  assert.equal(ctx.rows.length, NAV_CONTEXT_ROW_KEYS.length);
  assert.deepEqual(ctx.rows.map((r) => r.key), [...NAV_CONTEXT_ROW_KEYS]);
  for (const row of ctx.rows) {
    assert.ok(row.value && row.value.length > 0, `row ${row.key} must never render an empty value`);
    assert.ok(row.label && row.label.length > 0, `row ${row.key} must carry a label`);
  }
});

test('rows are exactly the fixed four in every state — no row grows a fifth sibling (D9.9)', () => {
  const states = [
    {},
    { playerGlobal: { x: 10, z: 10 } },
    { playerGlobal: TETHYS_ORIGIN, goal: { label: 'Sample', pos: { x: 13338, z: 8572 } } },
    {
      playerGlobal: HELIOS_ORIGIN,
      route: { legs: [{ from: HELIOS, to: TETHYS }] },
      executor: { engaged: true, legIndex: 0, legCount: 1, destinationSectorId: TETHYS },
    },
  ];
  for (const input of states) {
    const ctx = resolveMapNavContext(input);
    assert.deepEqual(ctx.rows.map((r) => r.key), [...NAV_CONTEXT_ROW_KEYS]);
  }
});

test('an absent answer is stated in words and toned MUTED, never left blank', () => {
  const ctx = resolveMapNavContext({ playerGlobal: TETHYS_ORIGIN });
  const byKey = new Map(ctx.rows.map((r) => [r.key, r]));
  assert.equal(byKey.get('objective').tone, NAV_ROW_TONE.MUTED);
  assert.equal(byKey.get('destination').tone, NAV_ROW_TONE.MUTED);
  assert.equal(byKey.get('leg').tone, NAV_ROW_TONE.MUTED);
  assert.match(byKey.get('objective').value, /None tracked/);
  assert.match(byKey.get('destination').value, /No route plotted/);
  // The reason a row is empty is itself information — an empty detail would be a dead row.
  assert.ok(byKey.get('objective').detail.length > 0);
  assert.ok(byKey.get('destination').detail.length > 0);
});

// ---------------------------------------------------------------------------------------------
// 1. Where am I — delegated to deepSpaceAddress, including empty space
// ---------------------------------------------------------------------------------------------

test('inside a sector the location row names that sector', () => {
  const ctx = resolveMapNavContext({ playerGlobal: { x: TETHYS_ORIGIN.x + 400, z: TETHYS_ORIGIN.z - 250 } });
  assert.equal(ctx.address.kind, 'sector');
  assert.equal(ctx.address.sectorId, TETHYS);
  assert.equal(ctx.rows[0].value, ctx.locationLabel);
  assert.ok(ctx.locationLabel.length > 0);
  assert.match(ctx.locationLabel, /TETHYS/i);
});

test('deep space between sectors yields a transit address, not a blank readout', () => {
  // Midway along the Helios <-> Tethys chord, well outside both discs.
  const mid = {
    x: (HELIOS_ORIGIN.x + TETHYS_ORIGIN.x) / 2,
    z: (HELIOS_ORIGIN.z + TETHYS_ORIGIN.z) / 2,
  };
  const ctx = resolveMapNavContext({ playerGlobal: mid });
  assert.equal(ctx.address.kind, 'transit');
  assert.ok(ctx.address.transit, 'a transit address must carry its chord');
  assert.match(ctx.locationLabel, /TRANSIT/);
  assert.match(ctx.locationLabel, /%/);
  // The detail line must carry forward progress, which is the thing that makes empty space legible.
  assert.match(ctx.rows[0].detail, /to [A-Z]/);
});

test('with no player position the location row still says something true', () => {
  const ctx = resolveMapNavContext({ playerGlobal: null });
  assert.equal(ctx.address, null);
  assert.equal(ctx.locationLabel, 'POSITION UNKNOWN');
  assert.equal(ctx.rows[0].value, 'POSITION UNKNOWN');
});

// ---------------------------------------------------------------------------------------------
// 2/3/4. Objective, destination, next leg
// ---------------------------------------------------------------------------------------------

test('objective distance is measured in the GLOBAL frame from the live player position', () => {
  const player = { x: TETHYS_ORIGIN.x, z: TETHYS_ORIGIN.z };
  const goalPos = { x: TETHYS_ORIGIN.x + 300, z: TETHYS_ORIGIN.z + 400 };
  const ctx = resolveMapNavContext({ playerGlobal: player, goal: { label: 'Tethys Station', pos: goalPos } });
  assert.equal(ctx.objective.label, 'Tethys Station');
  assert.equal(ctx.objective.distanceWU, 500);
  assert.equal(ctx.rows[1].tone, NAV_ROW_TONE.TRACKED);
  assert.equal(ctx.rows[1].detail, '500 WU');
});

test('a sector-local goal position would be caught: the same numbers in Helios give a different distance', () => {
  // This is the discriminating case. If any consumer ever treated `goal.pos` as sector-local and
  // added the sector origin (or failed to), the two distances below would coincide.
  const goalLocal = { x: 300, z: 400 };
  const tethysCtx = resolveMapNavContext({ playerGlobal: TETHYS_ORIGIN, goal: { label: 'g', pos: goalLocal } });
  const heliosCtx = resolveMapNavContext({ playerGlobal: HELIOS_ORIGIN, goal: { label: 'g', pos: goalLocal } });
  assert.equal(heliosCtx.objective.distanceWU, 500);
  // Same authored numbers, wildly different global distance from Tethys — proving x/z is read as
  // global and never rebased against the player's sector.
  assert.ok(tethysCtx.objective.distanceWU > 14000,
    `expected a lattice-scale distance, got ${tethysCtx.objective.distanceWU}`);
});

test('an objective with a sector but no fix reports null distance rather than a fabricated one', () => {
  const ctx = resolveMapNavContext({
    playerGlobal: HELIOS_ORIGIN,
    goal: { label: 'Deliver textiles', pos: null, sectorId: TETHYS },
    sectorNames: { [TETHYS]: 'Tethys Junction' },
  });
  assert.equal(ctx.objective.distanceWU, null);
  assert.equal(ctx.objective.sectorName, 'Tethys Junction');
  assert.equal(ctx.rows[1].detail, 'in Tethys Junction');
});

test('destination resolves from the route terminal and counts the leg in flight as remaining', () => {
  const ctx = resolveMapNavContext({
    playerGlobal: HELIOS_ORIGIN,
    route: { legs: [{ from: HELIOS, to: 'sector_ceres_belt' }, { from: 'sector_ceres_belt', to: TETHYS }] },
    executor: { engaged: true, legIndex: 0, legCount: 2, destinationSectorId: TETHYS },
    sectorNames: { [TETHYS]: 'Tethys Junction' },
  });
  assert.equal(ctx.destination.sectorId, TETHYS);
  assert.equal(ctx.destination.legCount, 2);
  assert.equal(ctx.destination.legsRemaining, 2, 'the leg you are flying has not been finished');
  assert.deepEqual(ctx.destination.globalPos, { x: TETHYS_ORIGIN.x, z: TETHYS_ORIGIN.z });
  assert.equal(ctx.rows[2].tone, NAV_ROW_TONE.TRACKED);
});

test('advancing a leg decrements the remaining count and moves the next leg', () => {
  const base = {
    playerGlobal: HELIOS_ORIGIN,
    route: { legs: [{ from: HELIOS, to: 'sector_ceres_belt' }, { from: 'sector_ceres_belt', to: TETHYS }] },
  };
  const first = resolveMapNavContext({
    ...base,
    executor: { engaged: true, legIndex: 0, legCount: 2, destinationSectorId: TETHYS },
  });
  const second = resolveMapNavContext({
    ...base,
    executor: { engaged: true, legIndex: 1, legCount: 2, destinationSectorId: TETHYS },
  });
  assert.equal(first.nextLeg.toSectorId, 'sector_ceres_belt');
  assert.equal(second.nextLeg.toSectorId, TETHYS);
  assert.equal(first.destination.legsRemaining, 2);
  assert.equal(second.destination.legsRemaining, 1);
});

test('next-leg distance is global and points at the leg terminal, not the final destination', () => {
  const ctx = resolveMapNavContext({
    playerGlobal: HELIOS_ORIGIN,
    route: { legs: [{ from: HELIOS, to: 'sector_ceres_belt' }, { from: 'sector_ceres_belt', to: TETHYS }] },
    executor: { engaged: false, legIndex: 0, legCount: 2, destinationSectorId: TETHYS },
  });
  const ceres = sectorGlobalOrigin('sector_ceres_belt');
  assert.deepEqual(ctx.nextLeg.globalPos, { x: ceres.x, z: ceres.z });
  assert.equal(ctx.nextLeg.distanceWU, Math.hypot(ceres.x, ceres.z));
  // Ceres (-12288, 8192) and Tethys (+12288, 8192) are mirror-symmetric about Helios, so their
  // DISTANCES from the origin are identical — comparing them would prove nothing. The POSITION is
  // the discriminator, and it is the thing a mis-pointed leg would get wrong.
  assert.notDeepEqual(ctx.nextLeg.globalPos, ctx.destination.globalPos);
  assert.equal(ctx.nextLeg.globalPos.x, -ctx.destination.globalPos.x);
});

test('an executor legLabel wins over the derived one so chart and follower agree', () => {
  const ctx = resolveMapNavContext({
    playerGlobal: HELIOS_ORIGIN,
    route: { legs: [{ from: HELIOS, to: TETHYS }] },
    executor: { engaged: true, legIndex: 0, legCount: 1, destinationSectorId: TETHYS, legLabel: 'Gate → Tethys Junction' },
  });
  assert.equal(ctx.nextLeg.label, 'Gate → Tethys Junction');
});

test('a route with no executor still reports a destination and a first leg', () => {
  const ctx = resolveMapNavContext({
    playerGlobal: HELIOS_ORIGIN,
    route: { legs: [{ from: HELIOS, to: TETHYS }] },
    executor: null,
  });
  assert.equal(ctx.destination.sectorId, TETHYS);
  assert.equal(ctx.destination.legsRemaining, 1);
  assert.equal(ctx.nextLeg.index, 0);
});

// ---------------------------------------------------------------------------------------------
// Framing controls — visibly unavailable, and they say why
// ---------------------------------------------------------------------------------------------

test('with a ship, Return to ship frames the player at LOCAL scale', () => {
  const player = { x: TETHYS_ORIGIN.x + 900, z: TETHYS_ORIGIN.z - 200 };
  const actions = resolveMapFramingActions(resolveMapNavContext({ playerGlobal: player }));
  const a = actions.returnToShip;
  assert.equal(a.available, true);
  assert.deepEqual(a.framing.focusGlobal, { x: player.x, z: player.z });
  assert.equal(a.framing.spanWU, MAP_PRESET_SPAN_WU.local);
  assert.equal(levelForSpan(a.framing.spanWU), 'local');
});

test('without a ship both controls are unavailable AND carry a reason — never a silent no-op', () => {
  const actions = resolveMapFramingActions(resolveMapNavContext({ playerGlobal: null }));
  for (const a of [actions.returnToShip, actions.frameShipAndDestination]) {
    assert.equal(a.available, false);
    assert.ok(a.reason && a.reason.length > 0, `${a.id} must explain why it is unavailable`);
    assert.equal(a.framing, null, 'an unavailable action must not hand back a framing to apply');
  }
});

test('with nothing tracked, Frame both is unavailable and explains what to do about it', () => {
  const actions = resolveMapFramingActions(resolveMapNavContext({ playerGlobal: TETHYS_ORIGIN }));
  assert.equal(actions.frameShipAndDestination.available, false);
  assert.match(actions.frameShipAndDestination.reason, /plot a route|track a mission/i);
  assert.equal(actions.frameShipAndDestination.framing, null);
});

test('Frame both fits ship and objective, midpoint focus, in the GLOBAL frame', () => {
  const player = { x: HELIOS_ORIGIN.x, z: HELIOS_ORIGIN.z };
  const goal = { x: TETHYS_ORIGIN.x, z: TETHYS_ORIGIN.z };
  const actions = resolveMapFramingActions(
    resolveMapNavContext({ playerGlobal: player, goal: { label: 'Tethys Hub', pos: goal } }),
  );
  const f = actions.frameShipAndDestination;
  assert.equal(f.available, true);
  assert.deepEqual(f.framing.focusGlobal, { x: 6144, z: 4096 });
  // Larger axis separation is 12288; margin 1.35 -> 16588.8.
  assert.ok(Math.abs(f.framing.spanWU - 12288 * 1.35) < 1e-6);
  assert.match(f.reason, /Tethys Hub/);
});

test('Frame both prefers the objective fix over the route terminal sector origin', () => {
  const player = { x: 0, z: 0 };
  const objectiveFix = { x: TETHYS_ORIGIN.x + 1050, z: TETHYS_ORIGIN.z + 380 };
  const ctx = resolveMapNavContext({
    playerGlobal: player,
    goal: { label: 'Tethys Station', pos: objectiveFix },
    route: { legs: [{ from: HELIOS, to: TETHYS }] },
  });
  const f = resolveMapFramingActions(ctx).frameShipAndDestination;
  assert.deepEqual(f.framing.focusGlobal, { x: objectiveFix.x / 2, z: objectiveFix.z / 2 });
});

test('Frame both falls back to the route destination when nothing is tracked locally', () => {
  const ctx = resolveMapNavContext({
    playerGlobal: HELIOS_ORIGIN,
    route: { legs: [{ from: HELIOS, to: TETHYS }] },
    sectorNames: { [TETHYS]: 'Tethys Junction' },
  });
  const f = resolveMapFramingActions(ctx).frameShipAndDestination;
  assert.equal(f.available, true);
  assert.match(f.reason, /Tethys Junction/);
});

test('coincident ship and target do not collapse the span to the zoom stop', () => {
  const p = { x: TETHYS_ORIGIN.x, z: TETHYS_ORIGIN.z };
  const ctx = resolveMapNavContext({ playerGlobal: p, goal: { label: 'Here', pos: p } });
  const f = resolveMapFramingActions(ctx).frameShipAndDestination;
  assert.equal(f.available, true);
  assert.equal(f.framing.spanWU, MAP_PRESET_SPAN_WU.local);
});

// ---------------------------------------------------------------------------------------------
// Purity and shape
// ---------------------------------------------------------------------------------------------

test('the context and its actions are deeply frozen and never mutate their inputs', () => {
  const input = {
    playerGlobal: { x: 1, z: 2 },
    goal: { label: 'g', pos: { x: 3, z: 4 } },
    route: { legs: [{ from: HELIOS, to: TETHYS }] },
  };
  const snapshot = JSON.parse(JSON.stringify(input));
  const ctx = resolveMapNavContext(input);
  const actions = resolveMapFramingActions(ctx);
  assert.deepEqual(input, snapshot, 'inputs must not be mutated');
  assert.ok(Object.isFrozen(ctx));
  assert.ok(Object.isFrozen(ctx.rows));
  assert.ok(Object.isFrozen(ctx.playerGlobal));
  assert.ok(Object.isFrozen(actions));
  assert.ok(Object.isFrozen(actions.returnToShip));
  assert.throws(() => { ctx.rows.push({}); });
});

test('formatDistanceWU stays readable across the whole lattice', () => {
  assert.equal(formatDistanceWU(0), '0 WU');
  assert.equal(formatDistanceWU(499.6), '500 WU');
  assert.equal(formatDistanceWU(9999), '9999 WU');
  assert.equal(formatDistanceWU(12288), '12.3k WU');
  assert.equal(formatDistanceWU(NaN), '—');
  assert.equal(formatDistanceWU(null), '—');
});

test('bright gold is spent only on the tracked objective and the active route', () => {
  // Tone is the colour authority. If a future edit tones the POSITION row TRACKED, the identity
  // rule ("bright gold is RESERVED for the tracked objective and the active route") is broken and
  // this fails rather than silently shipping a gold-saturated chart.
  const ctx = resolveMapNavContext({
    playerGlobal: TETHYS_ORIGIN,
    goal: { label: 'g', pos: TETHYS_ORIGIN },
    route: { legs: [{ from: HELIOS, to: TETHYS }] },
  });
  const byKey = new Map(ctx.rows.map((r) => [r.key, r]));
  assert.equal(byKey.get('location').tone, NAV_ROW_TONE.PLAIN);
  assert.equal(byKey.get('objective').tone, NAV_ROW_TONE.TRACKED);
  assert.equal(byKey.get('destination').tone, NAV_ROW_TONE.TRACKED);
  assert.equal(byKey.get('leg').tone, NAV_ROW_TONE.TRACKED);
});
