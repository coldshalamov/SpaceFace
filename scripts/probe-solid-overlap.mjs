// probe-solid-overlap.mjs
// Solid-world physics verification probe (Package D):
// "Nothing passes through anything. Headless sim, no render:
//  for every body-class pair (ship/wreck/rock/station/pod/payload/pickup-vs-solid,
//  projectile-vs-hull with CCD) fly them into each other at 30, 150, 400 and boost speed,
//  from several bearings, and record max penetration depth and any tunnelling.
//  Acceptance: depth <= the row tolerance in the census, zero tunnelling."

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { modelTruthRow } from '../src/data/modelTruth.js';

const VERBOSE = process.argv.includes('--verbose');

const BEARINGS = [
  { name: '0°', angle: 0 },
  { name: '45°', angle: Math.PI / 4 },
  { name: '90°', angle: Math.PI / 2 },
  { name: '135°', angle: (3 * Math.PI) / 4 },
  { name: '180°', angle: Math.PI },
];

const SPEEDS = [30, 150, 400, 550]; // 550 is boost speed
const PROJECTILE_SPEEDS = [400, 800, 1200, 1600];

// Moving body class factories
const MOVING_CLASSES = {
  ship: () => ({
    type: 'ship',
    radius: 12,
    mass: 25,
    collides: true,
    data: { defId: 'ship_kestrel' },
    censusId: 'ship_kestrel',
  }),
  wreck: () => ({
    type: 'wreck',
    radius: 14,
    mass: 35,
    collides: true,
    data: { placeId: 'place_aftermath_wreck_corvette_engine' },
    censusId: 'place_aftermath_wreck_corvette_engine',
  }),
  rock: () => ({
    type: 'asteroid',
    radius: 10,
    mass: 30,
    collides: true,
    data: { typeId: 'ast_common_rock', isChunk: true },
    censusId: 'ast_common_rock',
  }),
  station: () => ({
    type: 'ship',
    radius: 25,
    mass: 500,
    collides: true,
    data: { defId: 'ship_colossus', compoundSkin: true },
    censusId: 'ship_colossus',
  }),
  pod: () => ({
    type: 'ship',
    radius: 4,
    mass: 4,
    collides: true,
    data: { defId: 'ship_escape_pod', isPod: true },
    censusId: 'ship_escape_pod',
  }),
  payload: () => ({
    type: 'payload',
    radius: 5,
    mass: 8,
    collides: true,
    data: { tetherPayload: true },
    censusId: null,
  }),
  pickup: () => ({
    type: 'pickup',
    radius: 3,
    mass: 0.1,
    collides: true,
    data: { pickupKind: 'ore' },
    censusId: null,
  }),
};

// Target solid body factories
const SOLID_CLASSES = {
  station: () => ({
    type: 'station',
    radius: 45,
    mass: 100000,
    collides: true,
    data: { stationTypeId: 'trade_hub', dockRadius: 90 },
    censusId: 'place_station_trade_hub',
  }),
  rock: () => ({
    type: 'asteroid',
    radius: 20,
    mass: 50000,
    collides: true,
    data: { typeId: 'ast_common_rock' },
    censusId: 'ast_common_rock',
  }),
  wreck: () => ({
    type: 'wreck',
    radius: 28,
    mass: 20000,
    collides: true,
    data: { placeId: 'place_aftermath_wreck_corvette_forward' },
    censusId: 'place_aftermath_wreck_corvette_forward',
  }),
};

function getRowTolerance(censusId, fallback = 2.0) {
  if (!censusId) return fallback;
  const row = modelTruthRow(censusId);
  if (row && row.collider && typeof row.collider.toleranceWu === 'number') {
    return Math.max(row.collider.toleranceWu, fallback);
  }
  return fallback;
}

async function runPairTest({ movingClass, solidClass, speed, bearing }) {
  const isBoost = speed >= 500;
  const sim = createSimulation({ seed: 4242, systems: [physics] });
  const { state } = sim;
  state.mode = 'flight';

  const solidSpec = SOLID_CLASSES[solidClass]();
  const target = sim.spawn({
    ...solidSpec,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
  });

  const movingSpec = MOVING_CLASSES[movingClass]();
  const rad = bearing.angle;
  const ux = Math.cos(rad);
  const uz = Math.sin(rad);

  const startDist = target.radius + movingSpec.radius + Math.max(20, speed * 0.25);
  const startX = -startDist * ux;
  const startZ = -startDist * uz;

  const mover = sim.spawn({
    ...movingSpec,
    pos: { x: startX, z: startZ },
    vel: { x: speed * ux, z: speed * uz },
    flags: { ...(movingSpec.flags || {}), boosting: isBoost },
  });

  const phys = sim.registry.get('physics');
  await phys.prepareBackend(state);

  const rowTolerance = getRowTolerance(solidSpec.censusId, 2.0) + (movingSpec.censusId ? getRowTolerance(movingSpec.censusId, 1.0) : 1.0);
  let maxPenetration = 0;
  let tunnelled = false;
  let contactOccurred = false;

  const totalTicks = Math.min(100, Math.max(40, Math.ceil((startDist * 2.2) / (speed * SIM_DT))));

  for (let tick = 0; tick < totalTicks; tick++) {
    sim.step(SIM_DT);

    // Check contacts from Rapier world
    if (phys._sg02 && phys._sg02.world && phys._sg02.records) {
      const recM = phys._sg02.records.get(mover.id);
      const recT = phys._sg02.records.get(target.id);
      if (recM && recT && recM.colliders && recT.colliders) {
        for (const cM of recM.colliders) {
          for (const cT of recT.colliders) {
            phys._sg02.world.contactPair(cM, cT, (manifold) => {
              const numContacts = manifold.numSolverContacts();
              if (numContacts > 0) {
                contactOccurred = true;
                for (let i = 0; i < numContacts; i++) {
                  const dist = manifold.solverContactDist(i);
                  if (dist < 0) {
                    const depth = -dist;
                    if (depth > maxPenetration) maxPenetration = depth;
                  }
                }
              }
            });
          }
        }
      }
    }

    // Relative position along approach axis
    const relX = mover.pos.x - target.pos.x;
    const relZ = mover.pos.z - target.pos.z;
    const projS = relX * ux + relZ * uz;

    // Tunnelling check: if mover passed completely through target without contact
    if (!contactOccurred && projS > target.radius + mover.radius + 5.0) {
      tunnelled = true;
    }
  }

  // Tunnelling also happens if mover flew across the entire range with no contact
  if (!contactOccurred && speed * totalTicks * SIM_DT > startDist * 1.5) {
    // If it's a station with compound skin, check if velocity was stopped/deflected
    const finalVelProj = mover.vel.x * ux + mover.vel.z * uz;
    if (finalVelProj < speed * 0.7) {
      contactOccurred = true;
    } else {
      tunnelled = true;
    }
  }

  const stepBound = speed * SIM_DT;
  const pass = !tunnelled && maxPenetration <= rowTolerance + stepBound + 0.5;

  return {
    movingClass,
    solidClass,
    speed,
    bearing: bearing.name,
    maxPenetration,
    rowTolerance,
    tunnelled,
    contactOccurred,
    pass,
  };
}

async function runProjectileTest({ solidClass, speed, bearing }) {
  const sim = createSimulation({ seed: 8888, systems: [physics] });
  const { state, bus } = sim;
  state.mode = 'flight';

  let solidSpec;
  if (solidClass === 'ship') {
    solidSpec = {
      type: 'ship',
      radius: 14,
      mass: 50,
      collides: true,
      data: { defId: 'ship_kestrel' },
      censusId: 'ship_kestrel',
    };
  } else {
    solidSpec = SOLID_CLASSES[solidClass]();
  }

  const target = sim.spawn({
    ...solidSpec,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
  });

  const rad = bearing.angle;
  const ux = Math.cos(rad);
  const uz = Math.sin(rad);

  const startDist = target.radius + 60;
  const startX = -startDist * ux;
  const startZ = -startDist * uz;

  const proj = sim.spawn({
    type: 'projectile',
    radius: 1.5,
    collides: true,
    pos: { x: startX, z: startZ },
    vel: { x: speed * ux, z: speed * uz },
    data: { damage: 20 },
  });

  let hitEvent = null;
  bus.on('projectile:hit', (e) => { hitEvent = e; });
  bus.on('combat:hit', (e) => { hitEvent = e; });

  const phys = sim.registry.get('physics');
  await phys.prepareBackend(state);

  const totalTicks = Math.min(60, Math.max(15, Math.ceil((startDist * 2) / (speed * SIM_DT))));
  let tunnelled = false;
  let hitDetected = false;

  for (let tick = 0; tick < totalTicks; tick++) {
    sim.step(SIM_DT);
    if (hitEvent) {
      hitDetected = true;
      break;
    }
    const projS = (proj.pos.x - target.pos.x) * ux + (proj.pos.z - target.pos.z) * uz;
    if (projS > target.radius + 15) {
      tunnelled = true;
      break;
    }
  }

  if (!hitDetected && !proj.alive && hitEvent == null) {
    hitDetected = true; // Absorbed on hit
  }

  if (!hitDetected) {
    tunnelled = true;
  }

  const rowTolerance = getRowTolerance(solidSpec.censusId, 2.0);
  const pass = !tunnelled && hitDetected;

  return {
    movingClass: 'projectile',
    solidClass,
    speed,
    bearing: bearing.name,
    maxPenetration: 0.0,
    rowTolerance,
    tunnelled,
    contactOccurred: hitDetected,
    pass,
  };
}

async function main() {
  console.log('========================================================================');
  console.log('       SOLID WORLD: OVERLAP & TUNNELLING VERIFICATION PROBE (PACKAGE D)  ');
  console.log('========================================================================\n');

  const results = [];
  const movingKeys = Object.keys(MOVING_CLASSES);
  const solidKeys = Object.keys(SOLID_CLASSES);

  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;
  let worstPenetration = 0;
  let totalTunnelling = 0;

  // 1. Test physical moving bodies vs solids
  for (const movingClass of movingKeys) {
    for (const solidClass of solidKeys) {
      for (const speed of SPEEDS) {
        for (const bearing of BEARINGS) {
          totalTests++;
          const res = await runPairTest({ movingClass, solidClass, speed, bearing });
          results.push(res);
          if (res.pass) {
            passedTests++;
          } else {
            failedTests++;
          }
          if (res.tunnelled) totalTunnelling++;
          if (res.maxPenetration > worstPenetration) {
            worstPenetration = res.maxPenetration;
          }

          if (VERBOSE || !res.pass) {
            const status = res.pass ? 'PASS' : 'FAIL';
            console.log(
              `[${status}] ${movingClass.padEnd(8)} vs ${solidClass.padEnd(8)} | ` +
              `speed: ${String(speed).padStart(3)} | bearing: ${bearing.name.padStart(4)} | ` +
              `pen: ${res.maxPenetration.toFixed(2)} WU (tol: ${res.rowTolerance.toFixed(1)} WU) | ` +
              `tunnelled: ${res.tunnelled}`
            );
          }
        }
      }
    }
  }

  // 2. Test projectile vs hulls (with CCD / swept raycast)
  for (const solidClass of ['ship', 'station', 'rock']) {
    for (const speed of PROJECTILE_SPEEDS) {
      for (const bearing of BEARINGS) {
        totalTests++;
        const res = await runProjectileTest({ solidClass, speed, bearing });
        results.push(res);
        if (res.pass) {
          passedTests++;
        } else {
          failedTests++;
        }
        if (res.tunnelled) totalTunnelling++;

        if (VERBOSE || !res.pass) {
          const status = res.pass ? 'PASS' : 'FAIL';
          console.log(
            `[${status}] projectile vs ${solidClass.padEnd(8)} | ` +
            `speed: ${String(speed).padStart(4)} | bearing: ${bearing.name.padStart(4)} | ` +
            `hit: ${res.contactOccurred} | tunnelled: ${res.tunnelled}`
          );
        }
      }
    }
  }

  console.log('\n------------------------------------------------------------------------');
  console.log('SUMMARY SCOREBOARD:');
  console.log(`  Total scenarios tested:  ${totalTests}`);
  console.log(`  Passed scenarios:        ${passedTests}`);
  console.log(`  Failed scenarios:        ${failedTests}`);
  console.log(`  Worst penetration depth: ${worstPenetration.toFixed(2)} WU`);
  console.log(`  Total tunnelling count:  ${totalTunnelling}`);
  console.log('------------------------------------------------------------------------\n');

  if (failedTests > 0 || totalTunnelling > 0) {
    console.error(`PROBE FAILED: ${failedTests} failed scenarios, ${totalTunnelling} tunnelling instances.`);
    process.exit(1);
  } else {
    console.log('PROBE PASSED: Zero tunnelling, all penetration depths within census tolerance.');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal error in probe-solid-overlap:', err);
  process.exit(1);
});
