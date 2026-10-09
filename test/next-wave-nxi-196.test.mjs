// NXI-196 — the parent collision flourish keeps an accepted static semantic shape under
// reduced motion: same onset/expiry interval, same spatial anchor, oscillation/transport
// suppressed. Owner: src/render/actionVfx.js (+ vfx/actionPrimitives.js composer).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ActionVfx, ACTION_VFX_RECIPES } from '../src/render/actionVfx.js';

function fixture(reduced = false) {
  const player = { id: 1, alive: true, pos: { x: 0, z: 0 }, vel: { x: 6, z: 2 }, radius: 7 };
  const target = { id: 2, alive: true, pos: { x: 20, z: 30 }, vel: { x: 5, z: 10 }, radius: 6 };
  return {
    simTime: 1, playerId: 1, entities: new Map([[1, player], [2, target]]),
    settings: { video: reduced ? { motionReduce: true } : {} },
    fields: { active: [{ id: 'well', kind: 'well', center: { x: 0, z: 0 }, radius: 150, dir: { x: 1, z: 0 } }] },
  };
}
const detonation = { mineId: 2, ownerId: 1, pos: { x: 20, z: 30 }, blastRadius: 150 };

function run(scene, event, payload, reduced, ticks, dt = 0.05) {
  const s = fixture(reduced), out = new ActionVfx(scene);
  assert.ok(out.emit(event, payload, s), `${event} must be accepted`);
  const counts = [];
  for (let i = 0; i < ticks; i++) { s.simTime += dt; out.update(s); counts.push(out.batch.count); }
  return { out, s, counts };
}

test('NXI-196: reduced motion keeps the collision flourish as a static semantic shape for its authored interval', () => {
  const life = ACTION_VFX_RECIPES['bombs:detonated'].life; // the parent's heavy-impact flourish
  const dt = 0.05, span = Math.ceil(life / dt);
  // A slot is alive for since < life; the update whose `since` first reaches life retires it.
  const aliveFrames = Math.floor(life / dt - 1e-9);
  // Normal motion — measure the authored interval and per-frame composition.
  const normal = run(new THREE.Scene(), 'bombs:detonated', detonation, false, span + 2, dt);
  // Reduced motion — same receipt, same clock.
  const reduced = run(new THREE.Scene(), 'bombs:detonated', detonation, true, span + 2, dt);
  try {
    const normalFrames = normal.counts.filter(c => c > 0).length;
    const reducedFrames = reduced.counts.filter(c => c > 0).length;
    assert.equal(reducedFrames, normalFrames,
      'static semantic shape must persist for the same gameplay interval as the flourish');
    assert.equal(reducedFrames, aliveFrames, 'the cue lives exactly its authored interval');
    for (let i = 0; i < aliveFrames; i++) {
      assert.ok(reduced.counts[i] > 0, `frame ${i}: the cue must not disappear under reduced motion`);
      assert.equal(reduced.counts[i], normal.counts[i],
        'the static shape is the same composed surface set, not a deleted subset');
    }
    // The flourish is gone: particle transport cleared, oscillation clock frozen.
    assert.equal(reduced.out.particles.live, 0);
    assert.equal(reduced.out.batch.material.uniforms.uMotion.value, 0);
    assert.equal(normal.out.batch.material.uniforms.uMotion.value, 1);
    // The semantic slot still carries its spatial meaning under reduced motion.
    const slot = reduced.out.slots.find(sl => sl.event === 'bombs:detonated');
    assert.ok(slot.alive === false || slot.recipe.life === life);
    const inst = reduced.out.inspect().instances;
    assert.ok(inst.length === 0 || inst[0].event === 'bombs:detonated');
    // Spatial anchor: after the owning body leaves, the static shape stays at the receipted point.
    const s2 = fixture(true), out2 = new ActionVfx(new THREE.Scene());
    try {
      out2.emit('bombs:detonated', detonation, s2);
      s2.entities.get(1).pos.x = 500; s2.simTime += 0.2; out2.update(s2);
      const live = out2.slots.find(sl => sl.recipe?.verb === 'shove');
      assert.equal(live.x, 20); assert.equal(live.z, 30);
      assert.ok(out2.mesh.visible, 'the static shape is still presented');
    } finally { out2.dispose(); }
  } finally { normal.out.dispose(); reduced.out.dispose(); }
});

test('NXI-196: a neighboring success cue still works under reduced motion', () => {
  // weapons:mineArmed is a legitimate adjacent receipt in the same overlap moment.
  const life = ACTION_VFX_RECIPES['weapons:mineArmed'].life;
  const dt = 0.05, span = Math.ceil(life / dt), aliveFrames = Math.floor(life / dt - 1e-9);
  const reduced = run(new THREE.Scene(), 'weapons:mineArmed',
    { mineId: 2, ownerId: 1, pos: { x: 20, z: 30 } }, true, span + 2, dt);
  try {
    for (let i = 0; i < aliveFrames; i++) assert.ok(reduced.counts[i] > 0, `arming cue visible at frame ${i}`);
    assert.equal(reduced.counts[aliveFrames], 0, 'neighboring cue retires on its own authored life');
    assert.equal(reduced.out.particles.live, 0);
  } finally { reduced.out.dispose(); }
});
