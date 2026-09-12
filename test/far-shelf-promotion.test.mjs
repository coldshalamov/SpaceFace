// The far shelf has to give the bodies back.
//
// Since 2026-09-09 (9c4509ff1 "Shelve far ships and wrecks until the player approaches" and
// b8cce1567) ships and wrecks outside the player's bubble are parked as compact far-actor rows
// (src/world/farActorTable.js) instead of living on the combat list. That is why the Ceres
// structural-cost census counts 14 of the wreck cathedral's 15 planned bodies and 4 of the cinder
// sluice's 5 as *shelved* at boot, and why scripts/lib/pq020CeresTopology.mjs counts live+shelved
// against the plan.
//
// What that census cannot see is the half that matters to a player: whether approaching the site
// brings the bodies BACK. If `promoteFarActor` / `tickFarActors` ever stopped restoring, the
// cathedral would be an empty marker with a name on it and every check in the repository would
// still be green — the plan would still be "materialized", just never on screen and never
// collidable. This file flies the player in and looks.
//
// It also guards the other direction: leaving must re-shelve, and the round trip must not
// double-materialize. Bodies are counted by `data.worldRecordId`, which is stable across the
// shelve/promote cycle, so a second copy of one wreck shows up as a duplicate key rather than
// hiding inside a plausible total.
//
// asteroidSites stays the site owner (single writer); this test only moves the player and reads.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { CINDER_SLUICE_SITE_ID } from '../src/data/environmentalMachinery.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { worldSiteManifestById } from '../src/data/worldSiteManifests.js';
import { asteroidSites } from '../src/systems/asteroidSites.js';
import { world } from '../src/systems/world.js';
import { farActorTableRadius } from '../src/world/farActorTable.js';

const SECTOR_ID = 'sector_ceres_belt';
const CATHEDRAL_SITE_ID = 'world_site_wreck_cathedral';
const SEED = 47;

/** Planned body counts, from the two manifests' own materialization plans. */
const CATHEDRAL_BODIES = 15;
const SLUICE_BODIES = 5;

function worldRecordId(row) {
  return String((row && row.data && row.data.worldRecordId) || '');
}

function bootCeres() {
  const sim = createSimulation({ seed: SEED, systems: [world, asteroidSites] });
  const { state } = sim;
  state.mode = 'flight';
  const origin = sectorLocalToGlobalForSector({ x: 0, z: 0 }, SECTOR_ID);
  const player = sim.spawn({
    type: 'ship',
    team: 0,
    pos: { x: origin.x, z: origin.z },
    vel: { x: 0, z: 0 },
    radius: 10,
    mass: 1,
    collides: false,
    data: { farShelfHarnessPlayer: true },
  });
  state.playerId = player.id;
  sim.registry.get('world').enterSector(SECTOR_ID, {
    continuous: true,
    noTeleport: true,
    placePlayer: false,
  });
  sim.step(SIM_DT);
  return { sim, state, origin };
}

/** Teleport the player and let the world system's far-actor tick react. */
function flyTo(sim, pos, ticks = 8) {
  const player = sim.state.entities.get(sim.state.playerId);
  player.pos.x = pos.x;
  player.pos.z = pos.z;
  player.vel.x = 0;
  player.vel.z = 0;
  for (let i = 0; i < ticks; i += 1) sim.step(SIM_DT);
}

function siteCensus(state, siteId) {
  const prefix = `${siteId}/`;
  const live = [...state.entities.values()]
    .filter((e) => e && e.alive !== false && worldRecordId(e).startsWith(prefix));
  const table = state.world && state.world.farActors;
  const shelved = ((table && Array.isArray(table.rows)) ? table.rows : [])
    .filter((r) => r && r.alive !== false && worldRecordId(r).startsWith(prefix));
  const byRecord = new Map();
  for (const row of [...live, ...shelved]) {
    const id = worldRecordId(row);
    byRecord.set(id, (byRecord.get(id) || 0) + 1);
  }
  return {
    live,
    shelved,
    liveCount: live.length,
    shelvedCount: shelved.length,
    total: live.length + shelved.length,
    distinct: byRecord.size,
    duplicates: [...byRecord].filter(([, n]) => n > 1).map(([id, n]) => `${id} x${n}`),
    collidableLive: live.filter((e) => e.collides === true).length,
  };
}

test('the far shelf gives the wreck cathedral and the cinder sluice back on approach', () => {
  const { sim, state, origin } = bootCeres();
  try {
    const radii = farActorTableRadius(state);
    assert.ok(Number.isFinite(radii.enter) && radii.enter > 0, `promote radius must be a real distance: ${radii.enter}`);
    assert.ok(radii.exit > radii.enter, `shelve radius (${radii.exit}) must sit outside the promote radius (${radii.enter})`);

    const cathedral = worldSiteManifestById(CATHEDRAL_SITE_ID);
    const sluice = worldSiteManifestById(CINDER_SLUICE_SITE_ID);
    assert.ok(cathedral && cathedral.placement && cathedral.placement.pos, `${CATHEDRAL_SITE_ID} manifest missing`);
    assert.ok(sluice && sluice.placement && sluice.placement.pos, `${CINDER_SLUICE_SITE_ID} manifest missing`);

    // 1. At the sector origin both sites are out of the bubble: most of each is shelved, and the
    //    plan is still whole across the two lists.
    const bootCathedral = siteCensus(state, CATHEDRAL_SITE_ID);
    assert.equal(bootCathedral.total, CATHEDRAL_BODIES,
      `cathedral plan must be whole at boot (live ${bootCathedral.liveCount} + shelved ${bootCathedral.shelvedCount})`);
    assert.ok(bootCathedral.shelvedCount > 0, 'cathedral must actually be using the far shelf at boot');
    const bootSluice = siteCensus(state, CINDER_SLUICE_SITE_ID);
    assert.equal(bootSluice.total, SLUICE_BODIES,
      `sluice plan must be whole at boot (live ${bootSluice.liveCount} + shelved ${bootSluice.shelvedCount})`);
    assert.ok(bootSluice.shelvedCount > 0, 'sluice must actually be using the far shelf at boot');

    // 2. Fly inside the promote radius of the cathedral. Every planned body must come back.
    flyTo(sim, cathedral.placement.pos);
    const nearCathedral = siteCensus(state, CATHEDRAL_SITE_ID);
    assert.equal(nearCathedral.liveCount, CATHEDRAL_BODIES,
      `the cathedral must hand back all ${CATHEDRAL_BODIES} bodies on approach, got ${nearCathedral.liveCount} live / ${nearCathedral.shelvedCount} shelved`);
    assert.equal(nearCathedral.shelvedCount, 0, 'nothing may stay shelved inside the promote radius');
    assert.deepEqual(nearCathedral.duplicates, [], 'promotion must not double-materialize a body');
    assert.ok(nearCathedral.collidableLive > 0, 'promoted cathedral wrecks must come back collidable, not as scenery');

    // 3. Same for the cinder sluice, whose wrecks are the machine the player repairs.
    flyTo(sim, sluice.placement.pos);
    const nearSluice = siteCensus(state, CINDER_SLUICE_SITE_ID);
    assert.equal(nearSluice.liveCount, SLUICE_BODIES,
      `the sluice must hand back all ${SLUICE_BODIES} bodies on approach, got ${nearSluice.liveCount} live / ${nearSluice.shelvedCount} shelved`);
    assert.equal(nearSluice.shelvedCount, 0, 'nothing may stay shelved inside the promote radius');
    assert.deepEqual(nearSluice.duplicates, [], 'promotion must not double-materialize a body');
    assert.ok(nearSluice.collidableLive >= 2,
      `the sluice's repairable wrecks must be collidable when live, got ${nearSluice.collidableLive}`);

    // 4. Leaving re-shelves. Same sector, well outside the bubble.
    //    Not immediately: shouldVirtualizeFarActor only accepts a body once the activity
    //    classifier has walked it down off S0_EXACT, and that has hysteresis. Measured on this
    //    seed: still 15 live at 60 ticks, back to 1 live + 14 shelved by 180. 240 ticks (4 s of
    //    sim) is the margin. Nothing here should be read as "shelving is instant".
    flyTo(sim, origin, 240);
    const awayCathedral = siteCensus(state, CATHEDRAL_SITE_ID);
    assert.ok(awayCathedral.shelvedCount > 0, 'leaving the bubble must put the cathedral back on the shelf');
    assert.equal(awayCathedral.total, CATHEDRAL_BODIES,
      `the cathedral plan must survive the round trip (live ${awayCathedral.liveCount} + shelved ${awayCathedral.shelvedCount})`);
    assert.deepEqual(awayCathedral.duplicates, [], 'shelving must not leave a live copy beside the row');

    // 5. And the round trip is idempotent: a second approach restores the same 15, not 16 or 30.
    flyTo(sim, cathedral.placement.pos);
    const again = siteCensus(state, CATHEDRAL_SITE_ID);
    assert.equal(again.liveCount, CATHEDRAL_BODIES,
      `second approach must restore exactly ${CATHEDRAL_BODIES} bodies, got ${again.liveCount}`);
    assert.equal(again.shelvedCount, 0, 'second approach must empty the shelf again');
    assert.equal(again.distinct, CATHEDRAL_BODIES, 'every restored body must be a distinct world record');
    assert.deepEqual(again.duplicates, [], 'a shelve/promote cycle must not double-materialize anything');
  } finally {
    sim.dispose();
  }
});
