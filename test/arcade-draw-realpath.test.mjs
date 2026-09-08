// Actual registered input-command owner -> Flight V3 -> Rapier, not a private motion integrator.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bootRealPath, writeRealPathInput } from '../scripts/lib/bench/realPath.mjs';
import { autoTargetAssist } from '../src/systems/autoTargetAssist.js';
import { drawWrapAngle } from '../src/core/flight/drawFlightControl.js';

async function boot() {
  return bootRealPath({ seed: 4242, systems: [autoTargetAssist, 'actions', 'flightV3', 'physics'],
    hulls: [{ hullId: 'ship_kestrel', pos: { x: 0, z: 0 }, rot: 0, isPlayer: true, factionId: 'faction_free' }] });
}
function stroke(host, relative) {
  const p = host.player.pos;
  host.state.input.autoFire = true;
  host.state.input.drawFlightManual = false;
  host.state.input.autoTargetPath = { active: true, drawing: false, pointIndex: 1,
    points: relative.map(q => ({ x: p.x + q.x, z: p.z + q.z })) };
}
function sample(host, ticks, controls = {}) {
  const rows = [];
  host.step(ticks, { before: ({ state }) => writeRealPathInput(state, controls), after: ({ state }) => {
    const p = host.player;
    rows.push({ tick: state.tick, speed: Math.hypot(p.vel.x, p.vel.z), x: p.pos.x, z: p.pos.z,
      heading: Math.atan2(p.vel.z, p.vel.x), command: !!state.input.drawFlight,
      cap: p._flightFrame?.drawFlight?.speedCommand });
  } });
  return rows;
}
const shapes = {
  corner: [{ x: 0, z: 0 }, { x: 60, z: 0 }, { x: 60, z: 220 }],
  reversal: [{ x: 0, z: 0 }, { x: -220, z: 0 }],
  S: Array.from({ length: 81 }, (_, i) => ({ x: i * 6, z: 45 * Math.sin(i/80*Math.PI*2) })),
  short: [{ x: 0, z: 0 }, { x: 3, z: 0 }],
};
for (const [name, points] of Object.entries(shapes)) {
  test(`Rapier ${name}: >=98% of the G cap throughout, with real turning and no parking`, async () => {
    const host = await boot();
    try {
      stroke(host, [{ x: 0, z: 0 }, { x: 900, z: 0 }]);
      sample(host, 120);
      const cruise = Math.hypot(host.player.vel.x, host.player.vel.z);
      assert.ok(cruise > 145 && cruise < 160, 'starter G cap, not the slower manual cruise denominator');
      stroke(host, points);
      const rows = sample(host, 300);
      assert.equal(host.proof().sg02Ready, true);
      assert.equal(host.proof().backend, 'rapier-dynamic');
      assert.ok(rows.every(r => r.command), 'the live controller applies every tick');
      assert.ok(rows.every(r => r.speed >= .98 * cruise), `floor ${Math.min(...rows.map(r=>r.speed))}/${cruise}`);
      assert.ok(rows.every(r => r.speed < cruise * 1.02), 'not an unbounded speed multiplier');
      assert.equal(host.state.input.drawFlight.exhausted, true, 'actually traversed the stroke');
      if (name === 'corner') assert.ok(host.player.vel.z > cruise * .98);
      if (name === 'reversal') assert.ok(host.player.vel.x < -cruise * .98);
      for (let i=1;i<rows.length;i++) {
        assert.ok(Math.abs(drawWrapAngle(rows[i].heading-rows[i-1].heading)) <= 6/60 + .005);
        const travel = Math.hypot(rows[i].x-rows[i-1].x,rows[i].z-rows[i-1].z);
        assert.ok(travel >= cruise/60 * .98, 'actual displacement agrees with speed, not just the velocity label');
        assert.ok(travel <= cruise/60 * 1.05,
          'the physics step, not a positional snap, moves the ship');
      }
    } finally { host.dispose(); }
  });
}

test('Rapier collision authority still blocks a full-speed draw command at a solid rock', async () => {
  const host = await boot();
  try {
    const rock = host.spawnObstacle({ pos: { x: 240, z: 0 }, radius: 55, dynamic: false });
    stroke(host, [{ x: 0, z: 0 }, { x: 600, z: 0 }]);
    let impacts = 0;
    const off = host.bus.on('physics:impact', () => impacts++);
    const rows = sample(host, 180);
    off?.();
    host.assertBodies([host.player]);
    assert.ok(host.proof().sg02Bodies >= 2, 'static obstacle and dynamic player are registered');
    assert.ok(impacts > 0, 'actual contact receipts, not an obstacle drawn over a no-collision rail');
    assert.ok(host.player.pos.x < rock.pos.x, 'does not teleport through the rock');
    const tail = rows.slice(-60);
    assert.ok(Math.hypot(tail.at(-1).x-tail[0].x, tail.at(-1).z-tail[0].z)<1,
      'contact physically blocks travel despite a continuing flight command');
  } finally { host.dispose(); }
});

test('manual brake cancels draw ownership and can actually bring Rapier to rest', async () => {
  const host = await boot();
  try {
    stroke(host, [{ x: 0, z: 0 }, { x: 900, z: 0 }]);
    sample(host, 120);
    sample(host, 300, { brake: true });
    assert.equal(host.state.input.drawFlight, undefined);
    assert.equal(host.state.input.autoTargetPath.active, false);
    assert.ok(Math.hypot(host.player.vel.x, host.player.vel.z) < 2);
    assert.equal(host.state.input.autoFire, true, 'manual flight override does not disable the guns');
  } finally { host.dispose(); }
});
