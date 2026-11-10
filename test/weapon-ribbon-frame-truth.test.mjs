// The wake does not lie about the path. Live measurement (Crucible seed 4242, pilot
// sweeping aim while firing, `.devshots/aplan/ribbon-truth.json`) put every ribbon
// vertex within 0 WU of the sim path while the sim paths themselves curved 300-2300
// WU — banked rounds are real curves. This test pins the OTHER half: a straight
// round's wake must stay on the straight world path when the floating frame origin
// re-anchors mid-flight (INF-047: hist re-expressed, never retracted).
import assert from 'node:assert/strict';
import test from 'node:test';
import { WeaponVfxPresenter } from '../src/render/weapons/presenter.js';

function straightWorldLine(n, from, step) {
  const pts = [];
  for (let i = 0; i < n; i++) pts.push({ x: from.x + step.x * i, z: from.z + step.z * i });
  return pts;
}

function perpToChord(p, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const L = Math.hypot(dx, dz) || 1;
  return Math.abs((p.x - a.x) * dz - (p.z - a.z) * dx) / L;
}

test("a straight round's wake stays within 1 WU of the straight path while the frame origin moves", () => {
  // The presenter is fed LOCAL coordinates (pos minus world.frameOrigin); on a rebase
  // every laid point must be re-expressed, exactly like vfx.reprojectFrame drives it.
  const frameOrigin = { x: 1000, z: -2000 };
  const presenter = new WeaponVfxPresenter({
    scene: null,
    state: {},
    helpers: {},
    toLocalXZ: (x, z, out) => {
      const t = out || { x: 0, z: 0 };
      t.x = x - frameOrigin.x;
      t.z = z - frameOrigin.z;
      return t;
    },
  });
  const ribbons = presenter.ribbons;
  const entityId = 7;
  const world = straightWorldLine(24, { x: 1200, z: -1900 }, { x: 12, z: 4 });

  // Spawn + push the first dozen heads under the original frame.
  const l0 = presenter.toLocalXZ(world[0].x, world[0].z, { x: 0, z: 0 });
  ribbons.spawn({ entityId, x: l0.x, y: 0.32, z: l0.z, width: 0.2, linger: 0.1 });
  for (let i = 1; i < 12; i++) {
    const l = presenter.toLocalXZ(world[i].x, world[i].z, { x: 0, z: 0 });
    ribbons.pushHead(entityId, l.x, 0.32, l.z);
  }

  // The frame re-anchors: the player crossed an origin cell. world.js bumps
  // frameOriginSeq and render reprojects local anchors by (oldOrigin - newOrigin).
  const old = { x: frameOrigin.x, z: frameOrigin.z };
  frameOrigin.x += 512;
  frameOrigin.z -= 256;
  presenter.reproject(old.x - frameOrigin.x, old.z - frameOrigin.z);

  // More heads land, now under the NEW frame — the live loop keeps pushing local.
  for (let i = 12; i < world.length; i++) {
    const l = presenter.toLocalXZ(world[i].x, world[i].z, { x: 0, z: 0 });
    ribbons.pushHead(entityId, l.x, 0.32, l.z);
  }

  // Every stored point, converted back to world under the current origin, must lie
  // on the straight sim path — the wake bends only where the path bent.
  const slot = ribbons.byEntity.get(entityId);
  assert.notEqual(slot, undefined, 'the round owns a ribbon slot');
  const hb = slot * ribbons.segments * 3;
  assert.equal(ribbons.histLen[slot], world.length, 'all heads were laid');
  const a = world[0], b = world[world.length - 1];
  for (let i = 0; i < world.length; i++) {
    const wx = ribbons.hist[hb + i * 3] + frameOrigin.x;
    const wz = ribbons.hist[hb + i * 3 + 2] + frameOrigin.z;
    const dev = perpToChord({ x: wx, z: wz }, a, b);
    assert.ok(dev <= 1, `point ${i} deviates ${dev.toFixed(3)} WU from the straight path`);
    // pushHead stores newest-first: hist[0] is the last head pushed.
    const sim = world[world.length - 1 - i];
    assert.ok(Math.hypot(wx - sim.x, wz - sim.z) <= 1,
      `point ${i} sits ${Math.hypot(wx - sim.x, wz - sim.z).toFixed(3)} WU off its sim sample`);
  }
});

test('without the re-express pass the same move would bend the wake — the guard is doing work', () => {
  const presenter = new WeaponVfxPresenter({ scene: null, state: {}, helpers: {} });
  const ribbons = presenter.ribbons;
  const entityId = 3;
  ribbons.spawn({ entityId, x: 0, y: 0.32, z: 0, width: 0.2, linger: 0.1 });
  ribbons.pushHead(entityId, 10, 0.32, 0);
  ribbons.pushHead(entityId, 20, 0.32, 0);
  const slot = ribbons.byEntity.get(entityId);
  const hb = slot * ribbons.segments * 3;
  const before = ribbons.hist[hb];
  presenter.reproject(-512, -256);
  assert.equal(ribbons.hist[hb], before - 512, 'reproject shifts every laid point, head included');
  assert.equal(ribbons.hist[hb + 2], -256);
});
