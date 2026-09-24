// test/small-medium-shots-composed-frame.test.mjs
// Row A5 fixture: small and medium shots are born inside the composed chase frame and live >= 0.7 s.
// Pinned on fixed seeds 4242 and 8008.

import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { EMERGENT_WEAPON_DEFS } from '../src/data/emergentPrimitives.js';
import test from 'node:test';
import * as THREE from 'three';

import { WEAPONS } from '../src/data/weapons.js';
import { projectileFlightPlan } from '../src/combat/projectileFlight.js';
import {
  clampFocusToPlayerSafeRect,
  COMPOSITION_ZOOM_MAX,
  resolveChaseComposition,
} from '../src/render/camera.js';
import { mulberry32 } from '../src/core/rng.js';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { weapons } from '../src/systems/weapons.js';

const SEEDS = [4242, 8008];
const FOV = 50;
const ASPECT = 16 / 9;
const TILT = 60;
const TACTICAL_ZOOM = 72;

function view(overrides = {}) {
  return {
    followX: 0,
    followZ: 0,
    followZoom: TACTICAL_ZOOM,
    fov: FOV,
    baseFov: FOV,
    aspect: ASPECT,
    tiltDeg: TILT,
    ...overrides,
  };
}

function perspectiveCameraForFocus(focus, zoom, aspect = ASPECT) {
  const tilt = (TILT * Math.PI) / 180;
  const camera = new THREE.PerspectiveCamera(FOV, aspect, 1, 14000);
  camera.position.set(focus.x, Math.sin(tilt) * zoom, focus.z - Math.cos(tilt) * zoom);
  camera.lookAt(focus.x, 0, focus.z);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  return camera;
}

function assertPointProjectedVisible(camera, point, label) {
  const v = new THREE.Vector3(point.x, 0, point.z);
  const ndc = v.project(camera);
  assert.ok(
    Math.abs(ndc.x) <= 1.0 + 1e-4,
    `${label}: projected x (${ndc.x.toFixed(4)}) must stay on screen (<= 1.0)`
  );
  assert.ok(
    Math.abs(ndc.y) <= 1.0 + 1e-4,
    `${label}: projected y (${ndc.y.toFixed(4)}) must stay on screen (<= 1.0)`
  );
  assert.ok(
    ndc.z >= -1.0 - 1e-4 && ndc.z <= 1.0 + 1e-4,
    `${label}: projected z (${ndc.z.toFixed(4)}) must stay in clip bounds`
  );
}

test('A5: print range and time-to-exit table for all canonical weapons', () => {
  console.log('\n================================================================================================');
  console.log('ROW A5 WEAPON RANGE & TIME-TO-EXIT TABLE');
  console.log('================================================================================================');
  console.log(
    String('ID').padEnd(30),
    String('SIZE').padEnd(6),
    String('RANGE').padEnd(8),
    String('PROJ_SPD').padEnd(10),
    String('TIME_TO_EXIT').padEnd(14),
    String('TRACKING').padEnd(12),
    'NAME'
  );
  console.log('-'.repeat(96));

  for (const w of WEAPONS) {
    let timeToExit;
    if (w.projSpeed === Infinity) {
      timeToExit = 'hitscan';
    } else if (w.deployKind) {
      timeToExit = `${(w.range / w.projSpeed).toFixed(3)}s (mine:${w.mineLifeS}s)`;
    } else {
      timeToExit = `${(w.range / w.projSpeed).toFixed(3)}s`;
    }
    console.log(
      w.id.padEnd(30),
      w.size.padEnd(6),
      String(w.range).padEnd(8),
      String(w.projSpeed).padEnd(10),
      timeToExit.padEnd(14),
      w.tracking.padEnd(12),
      w.name
    );
  }
  console.log('================================================================================================\n');
});

test('A5: small and medium projectile shots stay visible for at least 0.7 seconds', () => {
  const smWeapons = WEAPONS.filter((w) => (w.size === 'S' || w.size === 'M'));

  for (const w of smWeapons) {
    if (w.projSpeed === Infinity) {
      // Hitscan beam
      assert.ok(w.range <= 300, `Beam ${w.id} range (${w.range}) must be within combat frame`);
      continue;
    }
    const flight = projectileFlightPlan(w.range, w.projSpeed);
    assert.ok(
      flight.seconds >= 0.700 - 1e-6,
      `Weapon ${w.id} (${w.size}) flight (${flight.seconds.toFixed(3)}s) must be >= 0.7s (range: ${w.range}, speed: ${w.projSpeed})`
    );

    if (w.deployKind) {
      assert.ok(
        w.mineLifeS >= 0.7,
        `Deployed weapon ${w.id} mineLifeS (${w.mineLifeS}s) must be >= 0.7s`
      );
    }
  }
});

test('A5: capital, torpedo, and railgun are untouched', () => {
  const headRaw = execSync('git show HEAD:src/data/weapons.js', { encoding: 'utf8' });
  const matchHead = headRaw.match(/const SHIPPED_WEAPONS = (\[[\s\S]*?\]);\s*\/\//);
  assert.ok(matchHead, 'Must parse HEAD SHIPPED_WEAPONS');
  const headWeapons = new Function('EMERGENT_WEAPON_DEFS', `return ${matchHead[1]}`)(EMERGENT_WEAPON_DEFS);

  const preservedIds = [
    'wpn_railgun_m',
    'wpn_heavy_beam_l',
    'unique_lighthouse_heavy_beam',
    'wpn_torpedo_l',
    'wpn_siege_lance_l',
  ];

  for (const id of preservedIds) {
    const headW = headWeapons.find((w) => w.id === id);
    const liveW = WEAPONS.find((w) => w.id === id);
    assert.ok(headW && liveW, `Weapon ${id} must exist in both HEAD and live`);
    assert.equal(liveW.range, headW.range, `${id} range must match HEAD exactly`);
    assert.equal(liveW.projSpeed, headW.projSpeed, `${id} projSpeed must match HEAD exactly`);
  }
});

test('A5: damage, rate of fire, impulse, and other invariants byte-compare equal', () => {
  const headRaw = execSync('git show HEAD:src/data/weapons.js', { encoding: 'utf8' });
  const matchHead = headRaw.match(/const SHIPPED_WEAPONS = (\[[\s\S]*?\]);\s*\/\//);
  const headWeapons = new Function('EMERGENT_WEAPON_DEFS', `return ${matchHead[1]}`)(EMERGENT_WEAPON_DEFS);

  const invariantFields = [
    'id', 'baseId', 'name', 'slotType', 'size', 'tier', 'mass', 'price', 'requiresTech',
    'dmg', 'rof', 'dps', 'damageType', 'energyCost', 'tracking', 'mount',
    'heatPerShot', 'heatPerSec', 'heatMax', 'heatDissip', 'continuous',
    'impulsePerHit', 'tumbleTorque', 'impulseProvenance',
    'armorPierce', 'shieldBypass', 'subsystemShare', 'rcsDisruptS',
    'splashDmg', 'splashRadius', 'splitCount', 'submunitions',
    'purchasable', 'unique', 'salvageOnly', 'variantBonuses',
    'deployKind', 'mineArmS', 'mineTriggerRadius', 'mineBlastRadius', 'mineLifeS', 'mineMaxActive', 'mineWellPull',
  ];

  for (const headW of headWeapons) {
    const liveW = WEAPONS.find((w) => w.id === headW.id);
    assert.ok(liveW, `Live weapons must contain ${headW.id}`);

    for (const field of invariantFields) {
      if (headW[field] !== undefined) {
        assert.deepEqual(
          liveW[field],
          headW[field],
          `Invariant field "${field}" on weapon "${headW.id}" must byte-compare equal to HEAD`
        );
      }
    }
  }
});

test('A5: starter tools stay on: no heat lockout, no ammo, no cooldown added', () => {
  const pulseS = WEAPONS.find((w) => w.id === 'wpn_pulse_laser_s');
  assert.ok(pulseS, 'Starter pulse laser must exist');
  assert.equal(pulseS.ammo, undefined, 'Starter pulse laser must not require ammo');
  assert.equal(pulseS.cooldown, undefined, 'Starter pulse laser must not have a cooldown');
  assert.equal(pulseS.heatMax, 100, 'heatMax must be 100');
  assert.equal(pulseS.heatPerShot, 8, 'heatPerShot must be 8');
  assert.equal(pulseS.heatDissip, 12, 'heatDissip must be 12');
});

for (const seed of SEEDS) {
  test(`A5: all small and medium shots are born inside composed chase frame (seed ${seed})`, () => {
    const rng = mulberry32(seed);
    const cameraView = view();

    const smWeapons = WEAPONS.filter(
      (w) => (w.size === 'S' || w.size === 'M') && w.id !== 'wpn_railgun_m'
    );

    // Test across various player positions and all 360-degree angles around the player
    const angleCount = 16;
    for (const weapon of smWeapons) {
      const maxFiringDistance = weapon.range;

      for (let i = 0; i < angleCount; i++) {
        // Pseudo-random angle perturbation from seed
        const angle = (i * 2 * Math.PI) / angleCount + (rng() - 0.5) * 0.1;
        const playerPos = {
          x: (rng() - 0.5) * 200,
          z: (rng() - 0.5) * 200,
        };

        const threatPos = {
          x: playerPos.x + Math.cos(angle) * maxFiringDistance,
          z: playerPos.z + Math.sin(angle) * maxFiringDistance,
        };

        const player = {
          id: 1,
          type: 'ship',
          alive: true,
          hull: 100,
          radius: 7,
          team: 0,
          pos: playerPos,
          vel: { x: (rng() - 0.5) * 40, z: (rng() - 0.5) * 40 },
        };

        const threat = {
          id: 2,
          type: 'ship',
          alive: true,
          hull: 100,
          radius: 6,
          team: 1,
          pos: threatPos,
          vel: { x: 0, z: 0 },
          weapons: [{ defId: weapon.id, currentRange: maxFiringDistance }],
          data: {
            combat: { targetId: player.id },
          },
        };

        const state = {
          mode: 'flight',
          simTime: rng() * 100,
          playerId: player.id,
          entities: new Map([
            [player.id, player],
            [threat.id, threat],
          ]),
          entityList: [player, threat],
          meta: { seed },
        };

        const comp = resolveChaseComposition(state, player, player.pos, cameraView);

        assert.ok(
          comp.hasActiveAttacker,
          `Attacker at max range ${maxFiringDistance} must be composed as active attacker`
        );
        assert.ok(
          comp.minZoom <= COMPOSITION_ZOOM_MAX,
          `minZoom (${comp.minZoom}) must stay inside COMPOSITION_ZOOM_MAX (${COMPOSITION_ZOOM_MAX})`
        );

        const safeFocus = clampFocusToPlayerSafeRect(comp, player, {
          zoom: comp.minZoom,
          fov: FOV,
          aspect: ASPECT,
        });
        const camera = perspectiveCameraForFocus(safeFocus, comp.minZoom);

        // Assert player is visible
        assertPointProjectedVisible(camera, player.pos, `Player with threat at angle ${angle.toFixed(2)}`);

        // Assert enemy (where enemy shot is born at max range) is visible
        assertPointProjectedVisible(
          camera,
          threat.pos,
          `Threat firing ${weapon.id} at max range ${maxFiringDistance} at angle ${angle.toFixed(2)}`
        );

        // Muzzle offset where projectile actually spawns
        const muzzlePos = {
          x: threat.pos.x - Math.cos(angle) * (threat.radius + 2),
          z: threat.pos.z - Math.sin(angle) * (threat.radius + 2),
        };
        assertPointProjectedVisible(
          camera,
          muzzlePos,
          `Muzzle birth point of ${weapon.id} at angle ${angle.toFixed(2)}`
        );
      }
    }
  });

  test(`A5: sim execution validates projectile birth position and ttl on seed ${seed}`, () => {
    const rng = mulberry32(seed + 100);
    const cameraView = view();

    const smWeapons = WEAPONS.filter(
      (w) =>
        (w.size === 'S' || w.size === 'M') &&
        Number.isFinite(w.projSpeed) && w.projSpeed > 1 &&
        !w.deployKind &&
        !w.emergentPrimitive &&
        w.id !== 'wpn_railgun_m'
    );

    for (const weaponDef of smWeapons) {
      const sim = createSimulation({ seed, systems: [weapons] });
      const { state } = sim;
      state.mode = 'flight';

      const player = sim.spawn({
        type: 'ship',
        team: 0,
        hull: 500,
        hullMax: 500,
        radius: 7,
        pos: { x: (rng() - 0.5) * 50, z: (rng() - 0.5) * 50 },
        vel: { x: 0, z: 0 },
      });
      state.playerId = player.id;

      const angle = rng() * Math.PI * 2;
      const fireDist = weaponDef.range * 0.9;
      const enemy = sim.spawn({
        type: 'ship',
        team: 1,
        hull: 200,
        hullMax: 200,
        radius: 6,
        pos: {
          x: player.pos.x + Math.cos(angle) * fireDist,
          z: player.pos.z + Math.sin(angle) * fireDist,
        },
        vel: { x: 0, z: 0 },
        rot: angle + Math.PI,
        cap: 100,
        data: {
          intent: { fire: true, aimAngle: angle + Math.PI },
          combat: {
            targetId: player.id,
            lockProgress: 1,
            lockTarget: player.id,
          },
          weapons: [
            {
              defId: weaponDef.id,
              coolingRemaining: 0,
            },
          ],
        },
      });

      // Advance one tick for weapon to fire
      sim.step(SIM_DT);

      // Find the spawned projectile
      let projectile = null;
      for (const entity of state.entities.values()) {
        if (entity.type === 'projectile' && entity.ownerId === enemy.id) {
          projectile = entity;
          break;
        }
      }

      assert.ok(projectile, `Enemy armed with ${weaponDef.id} must have spawned a projectile`);
      assert.ok(
        projectile.ttl >= 0.700 - 1e-4,
        `Spawned projectile for ${weaponDef.id} ttl (${projectile.ttl.toFixed(3)}s) must be >= 0.7s`
      );

      // Test that the born projectile position is inside the composed frame
      const comp = resolveChaseComposition(state, player, player.pos, cameraView);
      const safeFocus = clampFocusToPlayerSafeRect(comp, player, {
        zoom: comp.minZoom,
        fov: FOV,
        aspect: ASPECT,
      });
      const camera = perspectiveCameraForFocus(safeFocus, comp.minZoom);

      assertPointProjectedVisible(
        camera,
        projectile.pos,
        `Spawned projectile ${weaponDef.id} birth position`
      );
    }
  });
}
