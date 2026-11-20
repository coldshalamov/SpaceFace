// Ruling 2026-11-20: in the Standard scheme (nose follows the cursor) the nose comes round as fast
// with W held as without. What slows a turn is the hull's mass and size, never the act of thrusting.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bootRealPath, writeRealPathInput } from '../scripts/lib/bench/realPath.mjs';

async function secondsFor180(hullId, thrust) {
  const host = await bootRealPath({ seed: 4242, systems: ['actions', 'flightV3', 'physics'],
    hulls: [{ hullId, pos: { x: 0, z: 0 }, isPlayer: true }] });
  try {
    const st = host.state;
    host.step(150, { before: () => writeRealPathInput(st, { moveZ: 1 }) });
    let ticks = 0; let turned = 0; let last = host.player.rot;
    while (turned < Math.PI && ticks < 600) {
      host.step(1, { before: () => { writeRealPathInput(st, { moveZ: thrust ? 1 : 0, turnIntent: 1 }); st.input.turnIntentFromAim = true; } });
      let d = host.player.rot - last; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      turned += Math.abs(d); last = host.player.rot; ticks++;
    }
    return ticks / 60;
  } finally { host.dispose(); }
}

test('Standard scheme: holding W never slows the nose; mass does', { timeout: 120_000 }, async () => {
  const lightCoast = await secondsFor180('ship_kestrel', false);
  const lightThrust = await secondsFor180('ship_kestrel', true);
  assert.ok(Math.abs(lightThrust - lightCoast) <= 1 / 30,
    `ruling: "the nose must come round as fast with W held as without" (${lightCoast.toFixed(2)} s vs ${lightThrust.toFixed(2)} s)`);
  const heavy = await secondsFor180('ship_bastion', true);
  assert.ok(heavy > lightThrust, `a heavy hull turns slower than a light one (${heavy.toFixed(2)} s vs ${lightThrust.toFixed(2)} s)`);
});
