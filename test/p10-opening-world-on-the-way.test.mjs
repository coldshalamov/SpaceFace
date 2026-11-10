// P10 (build_map §1C row 59) — the world on the way, at the opening.
//
// Two halves, one neighbourhood, seed 4242 on the production route:
//   1. The working chain's movement half (freight hauler, staging pod, customs patrol) opens
//      within two screen-depths (230 WU — the unit encounter 344 authors for A1's raid reach)
//      of the opening position. The old freight-leg anchor was the claim mark at 671 WU: the
//      nearest chain body sat 655 WU (5.7 screen-depths) out, and every assertion here failed.
//   2. The first raid is already happening: with NO injected pending, the day-0 opening hauler
//      raid fires inside three minutes and commits its raiders to the hauler within two
//      screen-depths. (verb-02 proves the shape's contract by injecting dir.pending; this pins
//      the organic schedule on the real boot route.)
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { world } from '../src/systems/world.js';
import { asteroidSites } from '../src/systems/asteroidSites.js';
import { traffic } from '../src/systems/traffic.js';
import { cargo } from '../src/systems/cargo.js';
import { economy } from '../src/systems/economy.js';
import { factions } from '../src/systems/factions.js';
import { heat } from '../src/systems/heat.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import {
  HELIOS_ACTIVITY_POCKETS_BY_ID,
  HELIOS_ACTIVITY_SECTOR_ID,
  HELIOS_POCKET_ACTOR_SLOT_ORDER,
} from '../src/data/sectorActivityPockets.js';

const SEED = 4242;
const SECTOR = HELIOS_ACTIVITY_SECTOR_ID;
// A1/P10 unit: encounter 344 authors fireWithinWu: 230 as "~2 screen-depths (115 WU each)".
const SCREEN_DEPTH_WU = 115;
const TWO_SCREEN_DEPTHS_WU = 2 * SCREEN_DEPTH_WU;

function bootOpeningRoute() {
  const sim = createSimulation({
    seed: SEED,
    systems: [spawnBudget, world, asteroidSites, npcJobsRuntime, traffic, cargo, economy, factions, heat, encounterDirector],
  });
  const { state } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR;
  const player = sim.spawn({
    type: 'ship', team: 0, alive: true, collides: false, radius: 6, mass: 1,
    pos: sectorLocalToGlobalForSector({ x: 0, z: 0 }, SECTOR),
    vel: { x: 0, z: 0 }, data: {},
  });
  state.playerId = player.id;
  state.player = state.player || { flags: {}, credits: 5000, cargo: { items: {} } };
  state.player.heat = 0;
  state.onboarding = { active: false, finished: true };
  // Boot-style enter (no continuous/noTeleport): the planner runs and the player is placed at
  // the sector origin — the real new-game opening.
  sim.registry.get('world').enterSector(SECTOR);
  return { sim, state };
}

function liveChainBodies(state) {
  const bySlot = new Map();
  for (const rec of state.traffic.freighters || []) {
    const entity = state.entities.get(rec.id);
    if (!entity || !entity.alive) continue;
    const slotId = (entity.data && entity.data.activityActorSlotId) || rec.activityActorSlotId;
    if (!slotId || !HELIOS_POCKET_ACTOR_SLOT_ORDER.includes(slotId)) continue;
    bySlot.set(slotId, { rec, entity });
  }
  return bySlot;
}

function distanceFromOpening(state, entity) {
  const player = state.entities.get(state.playerId);
  return Math.hypot(entity.pos.x - player.pos.x, entity.pos.z - player.pos.z);
}

test('the freight leg opens inside two screen-depths: data law on the pocket descriptor', () => {
  const leg = HELIOS_ACTIVITY_POCKETS_BY_ID['helios_freight_leg'];
  assert.ok(leg, 'the freight leg pocket exists');
  const anchor = leg.activityAnchor.localPos;
  const bodies = [
    ...leg.actorSlots.map((slot) => ({ id: slot.id, offset: slot.spawnOffset })),
    ...leg.objectSlots.map((object) => ({ id: object.id, offset: object.offset })),
  ];
  assert.ok(bodies.length >= 3, `the leg casts bodies, not just an anchor: ${bodies.length}`);
  for (const body of bodies) {
    const d = Math.hypot(anchor.x + body.offset.x, anchor.z + body.offset.z);
    assert.ok(d <= TWO_SCREEN_DEPTHS_WU,
      `${body.id} opens at ${d.toFixed(1)} WU — inside two screen-depths (${TWO_SCREEN_DEPTHS_WU}) of the opening`);
  }
});

test('seed 4242 production route: the movement cast is live and working inside two screen-depths', () => {
  const { sim, state } = bootOpeningRoute();
  sim.runTicks(120); // 2 s settle — the shift is under way on arrival, not after a wait

  const bySlot = liveChainBodies(state);
  const legSlots = HELIOS_ACTIVITY_POCKETS_BY_ID['helios_freight_leg'].actorSlots.map((slot) => slot.id);
  let nearestLeg = Infinity;
  let nearestAny = Infinity;
  for (const slotId of legSlots) {
    const found = bySlot.get(slotId);
    assert.ok(found, `authored leg body is live on the production route: ${slotId}`);
    const { entity } = found;
    assert.equal(entity.data.authoredActivityCast, true, `${slotId} is authored cast, not ambient filler`);
    assert.ok(entity.data.jobId, `${slotId} is flying a real job`);
    const d = distanceFromOpening(state, entity);
    assert.ok(d <= TWO_SCREEN_DEPTHS_WU,
      `${slotId} works at ${d.toFixed(1)} WU — inside two screen-depths of the opening position`);
    nearestLeg = Math.min(nearestLeg, d);
  }
  for (const slotId of HELIOS_POCKET_ACTOR_SLOT_ORDER) {
    const found = bySlot.get(slotId);
    if (!found) continue;
    nearestAny = Math.min(nearestAny, distanceFromOpening(state, found.entity));
  }
  // The seam half stays out at the claim: the corridor orders the chain, leg first.
  const seamSlots = HELIOS_ACTIVITY_POCKETS_BY_ID['helios_starter_seam'].actorSlots.map((slot) => slot.id);
  let nearestSeam = Infinity;
  for (const slotId of seamSlots) {
    const found = bySlot.get(slotId);
    if (found) nearestSeam = Math.min(nearestSeam, distanceFromOpening(state, found.entity));
  }
  assert.ok(nearestSeam >= nearestLeg,
    `the work sits beyond the movement on the corridor (leg ${nearestLeg.toFixed(1)} WU, seam ${nearestSeam.toFixed(1)} WU)`);
  assert.ok(nearestAny <= TWO_SCREEN_DEPTHS_WU,
    `the neighbourhood is working in your first two screen-depths (${nearestAny.toFixed(1)} WU)`);
});

test('seed 4242 production route: the first raid is already happening, with no injected pending', () => {
  const { sim, state } = bootOpeningRoute();
  const dir = state.encounterDirector;
  assert.equal(dir.lastPlanned && dir.lastPlanned.count > 0, true,
    'the boot enter plans the sector day');
  assert.ok((dir.pending || []).some((item) => item.shapeId === 'opening_hauler_raid'),
    'the day-0 plan carries the authored opening raid');

  const raidWindowS = 200; // authored window hi = 170 s; bounded gate defers may add one beat
  let raid = null;
  let firedAtS = 0;
  for (let s = 0; s < raidWindowS && !raid; s++) {
    sim.runTicks(60);
    firedAtS = s + 1;
    for (const live of Object.values(dir.live || {})) {
      if (live.shapeId === 'opening_hauler_raid' && live.phase === 'conflict') { raid = live; break; }
    }
  }

  assert.ok(raid, `the opening raid fires organically within ${raidWindowS} s (no injected pending)`);
  assert.ok(firedAtS <= 180, `the raid is in progress inside three minutes of a new game (fired at ${firedAtS} s)`);

  const cast = (raid.ids || []).map((id) => state.entities.get(id)).filter(Boolean);
  const hauler = cast.find((e) => e.data && e.data.ai && e.data.ai.encounterRole === 'hauler');
  const raiders = cast.filter((e) => e.data && e.data.ai && e.data.ai.encounterRole === 'raider');
  assert.ok(hauler, 'a hauler is spawned');
  assert.ok(raiders.length >= 1, 'raiders are spawned');
  const haulerDist = distanceFromOpening(state, hauler);
  assert.ok(haulerDist <= TWO_SCREEN_DEPTHS_WU + 1,
    `the hauler under attack sits inside about two screen-depths (authored reach 230, at ${haulerDist.toFixed(1)} WU)`);
  for (const raider of raiders) {
    assert.equal(raider.data.combat && raider.data.combat.targetId, hauler.id,
      'each raider opens with the hauler as its committed focus target');
    assert.equal(raider.data.ai.targetId, hauler.id,
      'each raider opens with the hauler as its ai target');
  }
});
