// Flight-plane skins, seeds 4242 and 8008. The measurement does not depend on the seed.
// Each seed still has to keep the gate throat open, one station mouth open, an arm blocked,
// and a chase near-point outside the shell.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  modelTruthPlanarRadius,
  modelTruthProxyManifest,
  modelTruthRows,
  modelTruthSkinPrimitives,
  modelTruthSlideOutside,
  modelTruthThroatOpen,
  separateSkinOverlaps,
} from '../src/data/modelTruth.js';
import {
  CAMERA_NEAR_MARGIN_WU,
  flightPlaneToleranceWu,
  radialGap,
  skinContains,
} from '../src/data/modelTruthMath.js';

const SEEDS = [4242, 8008];

function angleDelta(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

function entityFor(row, seed) {
  const dock = row.gameplay && row.gameplay.dockRadius;
  const radius = (row.gameplay && row.gameplay.entityRadius) || 12;
  const shift = seed === 8008 ? 25 : 0;
  const station = row.family === 'station' || row.family === 'gate';
  return {
    id: `${row.id}:${seed}`,
    type: station ? 'station' : 'ship',
    alive: true,
    collides: row.solid !== false,
    rot: 0,
    pos: { x: shift, z: shift * 0.25 },
    radius,
    data: {
      defId: row.id,
      placeId: row.id,
      archetypeGlb: row.id,
      dockRadius: dock || null,
      isGate: row.family === 'gate',
      collisionProxy: row.family === 'gate'
        ? 'gate_jump_ring'
        : (row.family === 'station' ? 'station_ring_hub' : `skin:${row.id}`),
    },
  };
}

function referenceOf(row) {
  if (row.gameplay && row.gameplay.dockRadius) return row.gameplay.dockRadius;
  return (row.gameplay && row.gameplay.entityRadius) || row.shell.silhouetteRadius || 1;
}

test('measured skins cover the outline, keep openings, and hold the camera outside', () => {
  const rows = modelTruthRows().filter((row) => row.solid !== false && row.proposedSkin && row.proposedSkin.adopted === true);
  assert.ok(rows.length >= 20, 'adopted skins');
  for (const seed of SEEDS) {
    for (const row of rows) {
      const entity = entityFor(row, seed);
      const outline = row.collider && row.collider.outline;
      assert.ok(outline && outline.length >= 8, row.id);
      const ref = referenceOf(row);
      const primitives = modelTruthSkinPrimitives(entity);
      assert.ok(primitives && primitives.length > 0 && primitives.length <= 32, `${row.id} primitive count`);
      const mouth = row.proposedSkin.mouthBearingDeg;
      const opening = mouth == null ? null : {
        bearing: mouth * Math.PI / 180,
        half: row.opening === 'gate-throat' ? 0.5 : (row.opening === 'dock-mouth' ? 0.42 : 0),
      };
      const local = primitives.map((primitive) => {
        if (primitive.kind === 'circle') {
          return { ...primitive, x: primitive.x - entity.pos.x, z: primitive.z - entity.pos.z };
        }
        if (primitive.kind === 'capsule') {
          return {
            ...primitive,
            ax: primitive.ax - entity.pos.x,
            az: primitive.az - entity.pos.z,
            bx: primitive.bx - entity.pos.x,
            bz: primitive.bz - entity.pos.z,
          };
        }
        return { ...primitive, x: primitive.x - entity.pos.x, z: primitive.z - entity.pos.z };
      });
      const gap = radialGap(outline, local, row.collider.toleranceWu || flightPlaneToleranceWu(row.shell.silhouetteRadius), opening);
      assert.ok(gap.gapWu <= 2.5, `${row.id} gap ${gap.gapWu} at seed ${seed}`);

      if (row.opening === 'gate-throat') {
        assert.equal(modelTruthThroatOpen(entity), true, row.id);
        assert.equal(skinContains(entity.pos.x, entity.pos.z, primitives), false, `${row.id} throat`);
      }

      if (row.opening === 'dock-mouth' && mouth != null) {
        const bearing = mouth * Math.PI / 180;
        const berth = 0.72 * ref;
        assert.equal(
          skinContains(entity.pos.x + Math.cos(bearing) * berth, entity.pos.z + Math.sin(bearing) * berth, primitives),
          false,
          `${row.id} berth`,
        );
        let arm = null;
        for (let i = 0; i < outline.length; i += 1) {
          const angle = -Math.PI + ((i + 0.5) / outline.length) * Math.PI * 2;
          if (angleDelta(angle, bearing) <= 0.42) continue;
          if (!arm || outline[i] > arm.visual) arm = { visual: outline[i], angle };
        }
        assert.ok(arm && arm.visual > 1, row.id);
        const armX = entity.pos.x + Math.cos(arm.angle) * arm.visual * 0.65;
        const armZ = entity.pos.z + Math.sin(arm.angle) * arm.visual * 0.65;
        assert.equal(skinContains(armX, armZ, primitives), true, `${row.id} arm`);
        if (modelTruthPlanarRadius(entity) * 2 >= 120) {
          const slid = modelTruthSlideOutside([entity], armX, armZ, CAMERA_NEAR_MARGIN_WU);
          assert.equal(skinContains(slid.x, slid.z, primitives), false, `${row.id} camera`);
          const dx = slid.x - entity.pos.x;
          const dz = slid.z - entity.pos.z;
          const outer = Math.hypot(dx, dz);
          assert.ok(outer + 0.05 >= arm.visual * 0.65, `${row.id} camera slid outward`);
        }
      }
    }
  }
});

test('gas stays enterable and an undeclared body does not grow a skin', () => {
  const gas = modelTruthRows().find((row) => row.id === 'ast_gas_cloud');
  assert.equal(gas.status, 'green');
  assert.notEqual(gas.proposedSkin && gas.proposedSkin.adopted, true);
  const gasBody = entityFor(gas, 4242);
  gasBody.data.collisionProxy = null;
  assert.equal(modelTruthProxyManifest(gasBody), null);
});

test('overlapping skins are pushed apart without dropping a body', () => {
  const station = modelTruthRows().find((row) => row.id === 'place_station_trade_hub');
  const a = entityFor(station, 4242);
  const b = entityFor(station, 4242);
  b.id = 'other-station';
  b.pos = { x: a.pos.x + 10, z: a.pos.z };
  const before = 2;
  separateSkinOverlaps([a, b]);
  assert.equal([a, b].length, before);
  const dist = Math.hypot(b.pos.x - a.pos.x, b.pos.z - a.pos.z);
  assert.ok(dist + 0.05 >= modelTruthPlanarRadius(a) + modelTruthPlanarRadius(b));
});
