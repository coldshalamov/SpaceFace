// §22 F14 — One hauler is worth catching.
//
// The production path already provides every clause: the Helios pocket guarantees one express
// liner on the Mule hull (heavier than the starter Hitch), stamped hitchable with a real station
// destination; the standard tether latches it through the ordinary attachment service; the
// Rapier spring tows the player on the liner's earned momentum with no new force; and the
// earned-speed rule keeps the released speed — the assist lets go above the cap and the solver
// cap never truncates given momentum. These fixtures pin all three done-when clauses plus the
// legacy 47-A flag pin. No new force, no second tow mode, no 47-A edit.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createAttachmentService } from '../src/combat/attachments.js';
import { createCombatCatalog, ensureCombatState } from '../src/combat/runtime.js';
import { createBus } from '../src/core/eventBus.js';
import { writePhysicsControl } from '../src/core/physicsAuthority.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { createPropulsionRuntime, stepPropulsion } from '../src/core/flight/propulsionKernel.js';
import { resolvePropulsionProfile } from '../src/core/flight/propulsionCatalog.js';
import { applyFeatureConfigToMaps, restoreFeatureMaps } from '../src/data/featureFlags.js';
import { SECTORS } from '../src/data/sectors.js';
import { SHIPS } from '../src/data/ships.js';
import { LEGACY47A_FEATURES, PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import { getDerivedStats, makeShipEntitySpec } from '../src/systems/ships.js';
import { traffic } from '../src/systems/traffic.js';
import { isAttachable } from '../src/systems/tetherGameplay.js';

const DT = 1 / 60;
const HELIOS = SECTORS.find((s) => s.id === 'sector_helios_prime');
const KESTREL = SHIPS.find((s) => s.id === 'ship_kestrel');
// The express liner's authored cruise: drive_reaction_l combatSpeed x boostSpeedMult (170 x 1.45),
// which is what TRAFFIC_ROLES.express.speed = 247 describes and what the boosted NPC intent earns.
const LINER_CRUISE = 246.5;

test('the opening pocket guarantees one hitchable hauler that outweighs the starter', () => {
  const h = pocketHarness();
  const liners = h.spawned.filter((e) => e.data && e.data.trafficRole === 'express');
  assert.equal(liners.length, 1, 'Helios pocket must hold exactly one express liner');
  const liner = liners[0];
  assert.equal(liner.data.hitchable, true);
  // Whichever service owns the slot (express hitch route or the civic passenger claim), the liner
  // must carry a real destination — not a decorative hull. The hull itself is faction-substituted
  // (Mule or Atlas under SCN), but it must always outweigh the starter so the tow is a real catch.
  const itinerary = liner.data.itinerary;
  assert.ok(itinerary, 'the liner must carry a route itinerary');
  assert.ok(typeof itinerary.destinationStationId === 'string' && itinerary.destinationStationId,
    'the liner must have a real destination');
  assert.notEqual(itinerary.destinationStationId, itinerary.originStationId,
    'the destination must be somewhere other than where it started');
  assert.ok(liner.mass > KESTREL.mass,
    `liner mass ${liner.mass} (${liner.data.defId}) must outweigh starter ${KESTREL.mass}`);
  assert.equal(isAttachable(liner, h.player.id), true, 'the liner must be latchable');
});

test('the 47-A pin stays hitchhiking:false while production keeps it on', () => {
  assert.equal(PRODUCTION_FEATURES.massline2.hitchhiking, true);
  assert.equal(LEGACY47A_FEATURES.massline2.hitchhiking, false);
});

test('latching the liner tows the player past their own cap; release keeps the earned speed', async () => {
  const player = shipBody('player', 'ship_kestrel', -80, 0, 0, 0);
  player.isPlayer = true;
  const liner = shipBody('liner', 'ship_mule', 0, 0, LINER_CRUISE, 0);
  liner.data.trafficRole = 'express';
  liner.data.hitchable = true;

  const state = {
    mode: 'flight', tick: 0, simTime: 0, playerId: player.id,
    runtime: { features: PRODUCTION_FEATURES },
    world: { currentSectorId: 'sector_helios_prime' },
    entities: new Map([[player.id, player], [liner.id, liner]]),
    entityList: [player, liner],
    player: { tether: null },
  };
  ensureCombatState(state);
  const bus = createBus();
  const runtime = await createSg02DynamicBodyOwner({ fixedDt: DT, quantum: 1e-5, mode: 'rapier-dynamic' });
  try {
    runtime.syncFromEntities([player, liner]);
    const attachments = createAttachmentService({
      state, catalog: createCombatCatalog(), helpers: { combatPhysics: runtime }, bus,
    });
    const created = attachments.create({
      defId: 'tether_standard', ownerId: player.id, targetId: liner.id,
      sourceWorld: { x: player.pos.x, z: player.pos.z },
      targetWorld: { x: liner.pos.x, z: liner.pos.z },
    });
    assert.equal(created.ok, true, `latch must succeed: ${created.reason || 'unknown failure'}`);

    // The liner flies its route under its own drive (boosted, per the express intent); the player
    // hangs on the line with zero thrust of their own.
    const tau = 0.22;
    let settledMin = Infinity;
    let settledMax = 0;
    for (let tick = 0; tick < 720; tick += 1) {
      writePhysicsControl(liner, {
        source: 'f14-liner-drive', mode: 'newtonian',
        force: { x: ((LINER_CRUISE - liner.vel.x) / tau) * liner.mass, y: 0, z: ((0 - liner.vel.z) / tau) * liner.mass },
        torque: { x: 0, y: 0, z: 0 }, maxSpeed: Infinity,
      });
      writePhysicsControl(player, {
        source: 'f14-player-idle', mode: 'newtonian',
        force: { x: 0, y: 0, z: 0 }, torque: { x: 0, y: 0, z: 0 }, maxSpeed: Infinity,
      });
      runtime.step(DT);
      if (tick >= 600) {
        const speed = Math.hypot(player.vel.x, player.vel.z);
        settledMin = Math.min(settledMin, speed);
        settledMax = Math.max(settledMax, speed);
      }
    }

    const hitchCap = getDerivedStats(KESTREL.id, [], null).maxSpeed;
    assert.ok(settledMin > hitchCap,
      `the towed ride must beat the starter's own cap even on the low swing: `
      + `${settledMin.toFixed(1)} > ${hitchCap.toFixed(1)}`);
    assert.ok(settledMin > LINER_CRUISE * 0.6,
      `tow must rise toward the liner's cruise: low swing ${settledMin.toFixed(1)} vs ${LINER_CRUISE}`);
    assert.ok(settledMax < LINER_CRUISE * 1.2,
      `the spring may overshoot but cannot carry far past the tow: high swing ${settledMax.toFixed(1)}`);

    // Release keeps what the tow earned: pure physics — no drag, no governor — must not spend it.
    attachments.cut(created.attachment.id, player.id, 'release');
    const atRelease = Math.hypot(player.vel.x, player.vel.z);
    for (let tick = 0; tick < 180; tick += 1) {
      writePhysicsControl(liner, {
        source: 'f14-liner-drive', mode: 'newtonian',
        force: { x: ((LINER_CRUISE - liner.vel.x) / tau) * liner.mass, y: 0, z: ((0 - liner.vel.z) / tau) * liner.mass },
        torque: { x: 0, y: 0, z: 0 }, maxSpeed: Infinity,
      });
      writePhysicsControl(player, {
        source: 'f14-player-idle', mode: 'newtonian',
        force: { x: 0, y: 0, z: 0 }, torque: { x: 0, y: 0, z: 0 }, maxSpeed: Infinity,
      });
      runtime.step(DT);
    }
    const afterRelease = Math.hypot(player.vel.x, player.vel.z);
    assert.ok(afterRelease >= atRelease * 0.98,
      `released speed must persist: ${afterRelease.toFixed(1)} vs ${atRelease.toFixed(1)}`);
    assert.ok(afterRelease > hitchCap, 'the kept speed is still past the starter cap');
  } finally {
    runtime.dispose();
  }
});

test('the flight kernel never confiscates the released tow speed', () => {
  // Released at liner cruise, hands off: the assist lets go above the cap and the governor floors
  // forward thrust at zero rather than braking — the earned-speed rule, at the kernel seam.
  const profile = resolvePropulsionProfile(
    { id: 'p', type: 'ship', data: { defId: 'ship_kestrel', derived: getDerivedStats('ship_kestrel', [], null) } },
    { runtime: { features: PRODUCTION_FEATURES } },
  );
  let runtime = createPropulsionRuntime(profile);
  const body = { pos: { x: 0, z: 0 }, vel: { x: LINER_CRUISE, z: 0 }, rot: 0, angVel: 0, mass: KESTREL.mass, inertia: KESTREL.mass * 4 };
  const cap = profile.combatSpeed;
  assert.ok(LINER_CRUISE > cap, `fixture must sit above the cap (${LINER_CRUISE} > ${cap})`);

  const result = stepPropulsion({
    dt: DT, body, profile, runtime,
    input: { throttle: 0, strafe: 0, turn: 0, boost: false, brake: false, assistMode: 'assisted' },
  });
  runtime = result.runtime;
  const decel = Math.hypot(result.force.x, result.force.z);
  assert.ok(decel < body.mass * 1,
    `over-cap coast must not be confiscated: |F| ${decel.toFixed(1)} on mass ${body.mass}`);

  // Even with the throttle held — the common case right after release — the governor floors
  // forward thrust at zero and the assist stays off: no hidden brake on earned speed.
  const held = stepPropulsion({
    dt: DT, body, profile, runtime,
    input: { throttle: 1, strafe: 0, turn: 0, boost: false, brake: false, assistMode: 'assisted' },
  });
  const heldDecel = Math.hypot(held.force.x, held.force.z);
  assert.ok(heldDecel < body.mass * 1,
    `held throttle above the cap must coast, not brake: |F| ${heldDecel.toFixed(1)}`);
});

function shipBody(id, defId, x, z, vx, vz) {
  const spec = makeShipEntitySpec(defId, { team: 2, pos: { x, z }, ai: { archetype: 'fleeing_trader', passive: true } });
  return {
    ...spec,
    id, alive: true,
    pos: { x, z }, vel: { x: vx, z: vz }, rot: 0, angVel: 0,
    physicsBody: {
      schemaVersion: 1, radius: spec.radius, mass: spec.mass,
      inertiaY: spec.mass * 4, dynamic: true, ccd: true, revision: 0,
    },
    data: { ...spec.data },
  };
}

function pocketHarness() {
  const helios = station('station_helios', 0, 0);
  const coalition = station('station_coalition', 2400, 0);
  const player = {
    id: 'player', type: 'ship', alive: true, isPlayer: true, team: 1,
    pos: { x: 240, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, data: {},
  };
  const entities = new Map([[player.id, player], [helios.id, helios], [coalition.id, coalition]]);
  const state = {
    mode: 'flight', meta: { seed: 4815 }, tick: 0, simTime: 0,
    runtime: { features: PRODUCTION_FEATURES },
    world: { currentSectorId: HELIOS.id },
    entities,
    entityList: [player, helios, coalition],
    playerId: player.id,
    player: { targetId: null, credits: 0, cargo: { items: {} } },
  };
  const spawned = [];
  let seq = 0;
  const helpers = {
    spawnEntity(spec) {
      const e = Object.assign({}, spec, {
        id: `traffic-${++seq}`, alive: true,
        pos: { x: spec.pos.x, z: spec.pos.z }, vel: { x: 0, z: 0 },
        data: spec.data || {},
      });
      entities.set(e.id, e);
      state.entityList.push(e);
      spawned.push(e);
      return e;
    },
  };
  const system = Object.create(traffic);
  system.init({ state, bus: createBus(), helpers, registry: null });
  // The pocket's express guarantee reads the ambient flag map — seed it the way production boot does.
  const restore = applyFeatureConfigToMaps(PRODUCTION_FEATURES);
  try {
    system._onSectorEnter({ sector: HELIOS });
  } finally {
    restoreFeatureMaps(restore);
  }
  return { state, spawned, player };
}

function station(id, x, z) {
  return { id, type: 'station', alive: true, pos: { x, z }, data: { stationId: id, name: id } };
}
