import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { actions } from '../src/systems/actions.js';
import { cargo } from '../src/systems/cargo.js';
import { combat } from '../src/systems/combat.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { surrenderRecovery } from '../src/systems/surrenderRecovery.js';

// VERB-11 — spilled freight stays in the world long enough to rope. Pods go over the side
// while the fight is still on; the old 90 s sweep could land before the player was free to
// cross the two screen-depths to latch range. The contract: a Helios spill still exists
// when a cruise-speed ship can reach it after the engagement.

const SECTOR_ID = 'sector_helios_prime';
const STATION_ID = 'station_helios';
const ANCHOR = Object.freeze({ x: 6200, z: 4800 });
const CRUISE_SPEED_WU_S = 95; // stock Hitch engine top speed (drive_reaction_s family)
const FIGHT_WINDOW_S = 150;   // generous minor-tier engagement duration

function boot(seed = 4242) {
  const systems = [combat, surrenderRecovery, cargo, spawnBudget, encounterDirector, actions];
  const sim = createSimulation({ seed, systems });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR_ID;
  state.story.beatIndex = 7;
  state.world.activeSector = {
    stations: [{ id: STATION_ID, pos: { x: ANCHOR.x + 1200, z: ANCHOR.z }, name: 'Helios Station' }],
  };
  // The player sits at the authored fire reach — roughly two screen-depths from the spill.
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: ANCHOR.x - 230, z: ANCHOR.z },
    vel: { x: 0, z: 0 }, radius: 8, hull: 200, hullMax: 200,
    data: { intent: {}, ai: {} },
  });
  state.playerId = player.id;
  sim.spawn({
    type: 'station', team: 2, factionId: 'faction_mts',
    pos: { x: ANCHOR.x + 1200, z: ANCHOR.z }, radius: 42,
    data: { stationId: STATION_ID, factionId: 'faction_mts', sectorId: SECTOR_ID, dockRadius: 72 },
  });
  return { sim, state, bus, player, director: sim.registry.get('encounterDirector') };
}

function fire(h) {
  const encounterId = 'verb11:helios-spill';
  assert.deepEqual(h.director.requestAuthoredEncounter({
    shapeId: 'curtain_convoy', encounterId, sectorId: SECTOR_ID,
    anchor: { ...ANCHOR }, zoneType: 'trade_lane', zoneRadius: 800, force: true,
  }), { ok: true, encounterId });
  const live = h.state.encounterDirector.live[encounterId];
  assert.ok(live);
  return live;
}

function spillByDriveKill(h, live) {
  const carrier = h.state.entities.get(live.data.predationTargetId);
  const raider = h.state.entities.get(live.data.predationRaiderId);
  assert.ok(carrier && raider, 'convoy carrier and raider exist');
  h.state.combat = h.state.combat || {};
  h.state.combat.entities = h.state.combat.entities || {};
  h.state.combat.entities[String(carrier.id)] = {
    entityId: carrier.id,
    capabilities: { drive: false, weapon: true },
    subsystems: { subsystem_drive: { id: 'subsystem_drive', destroyed: true, effectiveDisabled: true } },
  };
  h.bus.emit('combat:subsystemDisabled', {
    attackerId: raider.id,
    targetId: carrier.id,
    subsystemId: 'subsystem_drive',
    dependencyDisabled: false,
  });
}

function pods(h, live) {
  return live.ids
    .filter((id) => live.roles[id] === 'freight_pod')
    .map((id) => h.state.entities.get(id))
    .filter(Boolean);
}

test('a Helios spill on seed 4242 still exists when a cruise-speed ship reaches it', () => {
  const h = boot(4242);
  const live = fire(h);
  spillByDriveKill(h, live);
  const spilled = pods(h, live);
  assert.ok(spilled.length >= 1, 'the drive kill spilled freight pods');

  const now = h.state.simTime;
  for (const pod of spilled) {
    const ttl = pod.data.despawnAt - now;
    // The pod must outlive the rest of the fight plus the crossing, not just the crossing.
    const reachS = Math.hypot(pod.pos.x - h.player.pos.x, pod.pos.z - h.player.pos.z)
      / CRUISE_SPEED_WU_S;
    assert.ok(
      ttl >= FIGHT_WINDOW_S + reachS,
      `pod ${pod.id} lives ${ttl.toFixed(0)}s but needs ${(FIGHT_WINDOW_S + reachS).toFixed(0)}s`,
    );
    // And the old 90-second sweep must not be the operative bound.
    assert.ok(ttl > 90, `pod ${pod.id} still carries the 90s aftermath sweep`);
  }
});

test('respilled raider freight keeps the same long window', () => {
  const h = boot(4242);
  const live = fire(h);
  spillByDriveKill(h, live);
  const spilled = pods(h, live);
  assert.ok(spilled.length >= 1);

  // The raider secures a pod, then dies — the respill must not reset to the old short fuse.
  const pod = spilled[0];
  h.bus.emit('pickup:collected', {
    pickupId: pod.id,
    collectorId: h.state.entities.get(live.data.predationRaiderId).id,
    kind: pod.data.kind,
    amount: pod.data.amount,
    commodityId: pod.data.commodityId,
    pos: { x: pod.pos.x, z: pod.pos.z },
  });
  pod.alive = false;
  const raider = h.state.entities.get(live.data.predationRaiderId);
  h.sim.registry.get('combat').kill(raider, h.state.playerId);

  const respilled = pods(h, live).filter((p) => p.alive !== false && !spilled.includes(p));
  const now = h.state.simTime;
  for (const p of respilled) {
    assert.ok(p.data.despawnAt - now > 90, `respilled pod ${p.id} kept a short fuse`);
  }
});
