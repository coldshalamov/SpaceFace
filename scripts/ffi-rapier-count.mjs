// FFI call-count probe: wraps Rapier compat prototypes and counts calls.
// Usage: node --import ./scripts/ffi-rapier-count.mjs scripts/sf-sim.mjs run 47a ...
import { writeFileSync } from 'node:fs';
import { loadRapierCompatRuntime } from '../src/core/rapierCompatRuntime.js';

const counts = Object.create(null);
const RAPIER = await loadRapierCompatRuntime();

function wrap(proto, names) {
  for (const name of names) {
    const d = Object.getOwnPropertyDescriptor(proto, name);
    if (d && typeof d.value === 'function') {
      const fn = d.value;
      proto[name] = function (...a) { counts[name] = (counts[name] || 0) + 1; return fn.apply(this, a); };
    }
  }
}

wrap(RAPIER.RigidBody.prototype, [
  'isSleeping', 'wakeUp', 'sleep', 'setCanSleep', 'resetForces', 'resetTorques',
  'linvel', 'angvel', 'rotation', 'translation', 'setLinvel', 'setAngvel', 'setRotation',
  'addForce', 'addTorque', 'applyImpulse', 'applyImpulseAtPoint', 'applyTorqueImpulse',
]);
wrap(RAPIER.World.prototype, ['step', 'propagateModifiedBodyPositionsToColliders']);
const wdesc = Object.getOwnPropertyDescriptor(RAPIER.World.prototype, 'timestep');
if (wdesc && wdesc.set) {
  const set = wdesc.set;
  Object.defineProperty(RAPIER.World.prototype, 'timestep', {
    get: wdesc.get,
    set(v) { counts['set timestep'] = (counts['set timestep'] || 0) + 1; return set.call(this, v); },
    configurable: true,
  });
}

process.on('exit', () => {
  writeFileSync(process.env.FFI_COUNT_OUT || 'ffi_counts.json', JSON.stringify(counts, null, 2));
});
