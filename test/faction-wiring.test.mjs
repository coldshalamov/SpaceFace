// Faction wiring (Lane 3 follow-up to fix-faction-reachability):
//   choir        flying a Choir sector raises shrines and bells (and one sealed relic) at
//                seeded, data-driven spots; a slain shrine stays down for the re-raise
//                window; the relic is minted once
//   fulfillment  Order #0000001's crate closes the ticket when brought into the Pit's
//                berth and pays once through the economy intent; a train moves one rail
//                step per tick even when physics already advanced it; the hauler's
//                "never fires first" lives on data.ai where the fire gates read it

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { sectorGlobalOrigin, sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { choirResonance, ensureChoirState } from '../src/systems/faction_choir.js';
import { CHOIR_SITES } from '../src/data/factions/choir.js';
import {
  fulfillmentRoutes, spawnHauler, routeWaypoint, ensureFulfillmentState,
} from '../src/systems/faction_fulfillment.js';
import { FULFILLMENT_ROUTES, FULFILLMENT_ORDER_ONE } from '../src/data/factions/fulfillment.js';

function boot(systems, sectorId, seed = 4242) {
  const bus = createBus();
  const sim = createSimulation({ seed, bus, systems });
  const { state } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = sectorId;
  const origin = sectorGlobalOrigin(sectorId);
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: origin.x + 9000, z: origin.z + 9000 }, radius: 12, mass: 24,
    hull: 100, hullMax: 100, collides: true,
  });
  state.playerId = player.id;
  return { sim, state, bus, player };
}

const live = (state, pred) => state.entityList.filter((e) => e && e.alive !== false && pred(e));

// ── Choir ───────────────────────────────────────────────────────────────────────────────

test('choir: flying Vesta Forge raises the shrines, bells and relic from the data table', () => {
  const { sim, state } = boot([choirResonance], 'sector_vesta_forge');
  try {
    sim.runTicks(3);
    const table = CHOIR_SITES.sectors.sector_vesta_forge;
    const shrines = live(state, (e) => e.data?.choirShrine === true);
    const bells = live(state, (e) => e.data?.choirBell === true);
    const relics = live(state, (e) => e.data?.carriedRelic === true);
    assert.equal(shrines.length, table.shrines.length, 'every authored shrine stands');
    assert.equal(bells.length, table.bells.length, 'every authored bell hangs');
    assert.equal(relics.length, table.relics.length, 'the sealed relic is in the world');
    for (const e of [...shrines, ...bells]) {
      assert.equal(e.factionId, 'faction_choir');
      const row = [...table.shrines, ...table.bells].find((r) => r.id === e.data.choirSiteId);
      const want = sectorLocalToGlobalForSector(row.pos, 'sector_vesta_forge');
      assert.ok(Math.hypot(e.pos.x - want.x, e.pos.z - want.z) <= CHOIR_SITES.jitterR + 1e-6,
        `${row.id} sits at its authored spot in Vesta's frame`);
      assert.ok(e.data.scanLabel && !/_/.test(e.data.name), 'player-facing name, no internal id');
    }
    assert.equal(relics[0].factionId ?? null, null, 'the relic is cargo, not a chorister');
    // Shrines key their pilgrim ledger by authored id, so a re-raised shrine keeps its book.
    assert.ok(shrines.every((s) => s.data.shrineId === s.data.choirSiteId));
    // Steady state: no duplicates on later scans.
    sim.runTicks(180);
    assert.equal(live(state, (e) => e.data?.choirShrine === true).length, table.shrines.length);
    assert.equal(live(state, (e) => e.data?.carriedRelic === true).length, 1);
  } finally { sim.dispose(); }
});

test('choir: placement is deterministic per run seed; other sectors raise nothing', () => {
  const posOf = (seed) => {
    const { sim, state } = boot([choirResonance], 'sector_vesta_forge', seed);
    try {
      sim.runTicks(2);
      return live(state, (e) => typeof e.data?.choirSiteId === 'string')
        .map((e) => `${e.data.choirSiteId}@${e.pos.x.toFixed(3)},${e.pos.z.toFixed(3)}`).sort();
    } finally { sim.dispose(); }
  };
  assert.deepEqual(posOf(77), posOf(77), 'same seed, same spots');
  const h = boot([choirResonance], 'sector_helios_prime');
  try {
    h.sim.runTicks(30);
    assert.equal(live(h.state, (e) => typeof e.data?.choirSiteId === 'string').length, 0);
  } finally { h.sim.dispose(); }
});

test('choir: a slain shrine stays down for the re-raise window; the relic is never re-minted', () => {
  const { sim, state, bus } = boot([choirResonance], 'sector_vesta_forge');
  try {
    sim.runTicks(2);
    const shrine = live(state, (e) => e.data?.choirShrine === true)[0];
    const siteId = shrine.data.choirSiteId;
    shrine.alive = false;
    bus.emit('entity:killed', { id: shrine.id, killerId: null, factionId: 'faction_choir', pos: shrine.pos });
    sim.helpers.removeEntity(shrine.id, { reason: 'test' });
    assert.ok(ensureChoirState(state).sites.down[siteId] > state.simTime, 'the fall is booked');
    sim.runTicks(120);
    assert.equal(live(state, (e) => e.data?.choirSiteId === siteId).length, 0, 'not re-raised inside the window');
    state.simTime = ensureChoirState(state).sites.down[siteId] + 1;
    sim.runTicks(70);
    assert.equal(live(state, (e) => e.data?.choirSiteId === siteId).length, 1, 're-raised after the window');

    const relic = live(state, (e) => e.data?.carriedRelic === true)[0];
    sim.helpers.removeEntity(relic.id, { reason: 'test' });
    sim.runTicks(120);
    assert.equal(live(state, (e) => e.data?.carriedRelic === true).length, 0, 'a lost relic is not minted again');
  } finally { sim.dispose(); }
});

// ── Fulfillment ─────────────────────────────────────────────────────────────────────────

test('fulfillment: the hauler stores "never fires first" where the fire gates read it', () => {
  const { sim, state } = boot([fulfillmentRoutes], 'sector_helios_prime');
  try {
    const h = spawnHauler(state, sim.helpers, { routeId: 'route_charon_spine', legIndex: 1 });
    assert.equal(h.data.ai.passive, true);
    assert.equal(h.data.ai.roe, 'defensive');
  } finally { sim.dispose(); }
});

test('fulfillment: one rail step per tick even when physics already advanced the hull', () => {
  const { sim, state } = boot([fulfillmentRoutes], 'sector_charon_expanse');
  try {
    const ROUTE = FULFILLMENT_ROUTES.routes.route_charon_spine;
    // Park the auto-spawn clock so only our hauler rides.
    ensureFulfillmentState(state).nextSpawnAt.route_charon_spine = 1e9;
    const h = spawnHauler(state, sim.helpers, { routeId: 'route_charon_spine', legIndex: 1 });
    sim.step();
    const dt = 1 / 60;
    const start = { x: h.pos.x, z: h.pos.z };
    const N = 60;
    for (let i = 0; i < N; i++) {
      // Stand in for the physics step that runs before this system each tick.
      h.pos.x += h.vel.x * dt;
      h.pos.z += h.vel.z * dt;
      sim.step();
    }
    const moved = Math.hypot(h.pos.x - start.x, h.pos.z - start.z);
    const expected = ROUTE.speed * N * dt;
    assert.ok(Math.abs(moved - expected) < 1, `moved ${moved.toFixed(2)} WU, route speed says ${expected.toFixed(2)}`);
    // Without a physics step the rail still moves at route speed (focused harness).
    const s2 = { x: h.pos.x, z: h.pos.z };
    sim.runTicks(N);
    assert.ok(Math.abs(Math.hypot(h.pos.x - s2.x, h.pos.z - s2.z) - expected) < 1);
    // A real knock (far beyond one physics step) is kept as the new base, and the line
    // lock pulls the hull back onto the leg — it is not silently snapped to the old pose.
    const target = routeWaypoint(ROUTE, h.data.legIndex);
    const prev = routeWaypoint(ROUTE, h.data.legIndex - 1);
    h.pos.x += 300;
    sim.step();
    const lx = target.x - prev.x, lz = target.z - prev.z;
    const t = ((h.pos.x - prev.x) * lx + (h.pos.z - prev.z) * lz) / (lx * lx + lz * lz);
    const off = Math.hypot(h.pos.x - (prev.x + lx * t), h.pos.z - (prev.z + lz * t));
    assert.ok(off < 300 * 0.2, `line lock pulls the knocked hull back (off ${off.toFixed(1)})`);
  } finally { sim.dispose(); }
});

function pitBoot() {
  const ctx = boot([fulfillmentRoutes], 'sector_ashfall_reach');
  ensureFulfillmentState(ctx.state).nextSpawnAt.route_clerk_capital = 1e9; // no train needed
  const origin = sectorGlobalOrigin('sector_ashfall_reach');
  const pit = ctx.sim.spawn({
    type: 'station', team: 0, factionId: 'faction_vael', pos: { x: origin.x - 820, z: origin.z + 480 },
    radius: 80, mass: 1e6, hull: 1e6, hullMax: 1e6, collides: true,
    data: { stationId: FULFILLMENT_ORDER_ONE.destinationStationId, dockRadius: 200 },
  });
  const crate = ctx.sim.spawn({
    type: 'cargo_pod', team: 0, pos: { x: pit.pos.x + 3000, z: pit.pos.z }, radius: 10, mass: 8,
    hull: 40, hullMax: 40, collides: true,
    data: { orderCrateSeq: FULFILLMENT_ORDER_ONE.seq, name: 'Order #0000001 Crate' },
  });
  const grants = [];
  ctx.bus.on('economy:grantCredits', (p) => grants.push(p));
  return { ...ctx, pit, crate, grants };
}

test('fulfillment: Order #0000001 closes when the crate is brought into the Pit — paid once via economy', () => {
  const { sim, state, pit, crate, grants, player } = pitBoot();
  try {
    sim.runTicks(5);
    assert.equal(ensureFulfillmentState(state).orders[1].status, 'open', 'far away: still open');
    // In the berth but the player is nowhere near: a drifting crate does not close it.
    crate.pos.x = pit.pos.x + 150; crate.pos.z = pit.pos.z;
    sim.runTicks(3);
    assert.equal(ensureFulfillmentState(state).orders[1].status, 'open', 'not by hand');
    // The player flies it in.
    player.pos.x = pit.pos.x + 400; player.pos.z = pit.pos.z;
    sim.runTicks(2);
    const order = ensureFulfillmentState(state).orders[1];
    assert.equal(order.status, 'closed', 'the hand-in closes the ticket');
    assert.equal(order.deliveredAt, FULFILLMENT_ORDER_ONE.destinationStationId);
    assert.equal(grants.length, 1, 'one economy intent');
    assert.equal(grants[0].amount, FULFILLMENT_ORDER_ONE.deliveryPayCr);
    assert.equal(state.entities.get(crate.id)?.alive === true, false, 'the crate is handed over');
    sim.runTicks(30);
    assert.equal(grants.length, 1, 'never paid twice');
  } finally { sim.dispose(); }
});

test('fulfillment: towing the crate into the berth also counts as by hand', () => {
  const { sim, state, pit, crate, grants } = pitBoot();
  try {
    state.player = state.player || {};
    state.player.tether = { active: true, targetId: crate.id };
    crate.pos.x = pit.pos.x + 120; crate.pos.z = pit.pos.z;
    sim.runTicks(2);
    assert.equal(ensureFulfillmentState(state).orders[1].status, 'closed');
    assert.equal(grants.length, 1);
  } finally { sim.dispose(); }
});
