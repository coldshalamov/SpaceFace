// Row 384 (SFQ-B176): precursor machines visibly deploy their scanner arm or tool
// spindle while processing work — the deploy keys off real sim flags on
// entity.data.machine, eases 0→1, and stows when the flag clears.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMachineMesh } from '../src/render/machineVisuals.js';

function entity(kind, flags = {}) {
  return { data: { machine: { kind, ...flags } } };
}

// Drive the motion handler until the deploy eases past the threshold.
function deployAmount(g, e, frames = 240, dt = 0.016) {
  let maxPitch = -Infinity;
  for (let i = 0; i < frames; i += 1) {
    g.userData.updateAuthoredMotion(dt, e);
    let pitch = -Infinity;
    g.traverse((o) => { if (o.rotation && o.rotation.x < 0) pitch = Math.max(pitch, -o.rotation.x); });
    maxPitch = Math.max(maxPitch, pitch);
  }
  return maxPitch;
}

test('surveyor prism unfolds a scanner arm while the sweep winds toward the ping', () => {
  const idle = entity('surveyor_prism', { sweepT: 0 });
  const g = buildMachineMesh(idle);
  assert.ok(g);
  assert.equal(typeof g.userData.updateAuthoredMotion, 'function');
  // Stowed: no child pitched downward.
  const stowed = deployAmount(g, idle, 90);
  assert.ok(stowed < 0.2, `stowed pitch ${stowed} should be < 0.2`);
  // Winding (sweepT past 55% of the 14 s scan period) deploys the arm.
  idle.data.machine.sweepT = 12;
  const deployed = deployAmount(g, idle, 240);
  assert.ok(deployed > 0.4, `deployed pitch ${deployed} should be > 0.4`);
  // After the ping the arm stows again.
  idle.data.machine.sweepT = 0.5;
  const restowed = deployAmount(g, idle, 400);
  assert.ok(restowed < deployed, 'arm should stow after the ping');
});

test('custodian arms pitch down and the repair spindle telescopes while repairing', () => {
  const e = entity('custodian', { repairing: false });
  const g = buildMachineMesh(e);
  assert.ok(g);
  const arms = [];
  g.traverse((o) => { if (o.geometry?.parameters?.depth === 2.4) arms.push(o); });
  assert.equal(arms.length, 4);
  for (let i = 0; i < 40; i += 1) g.userData.updateAuthoredMotion(0.016, e);
  const stowedX = arms[0].rotation.x;
  assert.ok(stowedX > 0.2, `stowed pose ${stowedX} keeps the arms folded against the shell`);
  e.data.machine.repairing = true;
  for (let i = 0; i < 400; i += 1) g.userData.updateAuthoredMotion(0.016, e);
  assert.ok(arms[0].rotation.x < stowedX - 0.6, `arm pitch ${arms[0].rotation.x} vs stowed ${stowedX}`);
  // Tips ride the arm so they stay at the end while it pitches.
  assert.equal(arms[0].children.length, 1);
  assert.equal(arms[0].children[0].name, 'cust_tip');
});

test('mason weld spindle extends while placing ballast', () => {
  const e = entity('mason', { working: false });
  const g = buildMachineMesh(e);
  assert.ok(g);
  const weld = g.getObjectByName('msn_weld');
  assert.ok(weld);
  for (let i = 0; i < 40; i += 1) g.userData.updateAuthoredMotion(0.016, e);
  const stowedZ = weld.position.z;
  e.data.machine.working = true;
  for (let i = 0; i < 400; i += 1) g.userData.updateAuthoredMotion(0.016, e);
  assert.ok(weld.position.z < stowedZ - 8, `weld tip ${weld.position.z} should extend past ${stowedZ - 8}`);
});

test('gate auditor sweeps a scan bar across the ring while interrogating', () => {
  const e = entity('auditor', { interrogating: false });
  const g = buildMachineMesh(e);
  assert.ok(g);
  let bar = null;
  g.traverse((o) => { if (o.geometry?.parameters?.width === 2 && o.geometry.parameters.height === 0.04) bar = o; });
  assert.ok(bar);
  for (let i = 0; i < 40; i += 1) g.userData.updateAuthoredMotion(0.016, e);
  assert.equal(bar.visible, false);
  e.data.machine.interrogating = true;
  for (let i = 0; i < 400; i += 1) g.userData.updateAuthoredMotion(0.016, e);
  assert.equal(bar.visible, true);
  assert.ok(bar.scale.x > 10, `bar span ${bar.scale.x} should cover the ring opening`);
  assert.ok(bar.rotation.y !== 0, 'bar sweeps around the ring centre');
});

test('debris sorter opens its mouth and extends the spine while claiming a workpiece', () => {
  const e = entity('debris_sorter', {});
  const g = buildMachineMesh(e);
  assert.ok(g);
  let spine = null; let mouth = null;
  g.traverse((o) => {
    if (o.geometry?.parameters?.depth === 2.2) spine = o;
    if (o.geometry?.parameters?.radiusTop === 1.0) mouth = o;
  });
  assert.ok(spine && mouth);
  const stowedZ = spine.scale.z;
  for (let i = 0; i < 40; i += 1) g.userData.updateAuthoredMotion(0.016, e);
  assert.equal(spine.scale.z, stowedZ);
  e.data.machine.collectId = 'wreck-1';
  for (let i = 0; i < 400; i += 1) g.userData.updateAuthoredMotion(0.016, e);
  assert.ok(spine.scale.z > stowedZ * 1.5, `spine ${spine.scale.z} should extend past ${stowedZ * 1.5}`);
  assert.ok(mouth.scale.x > 14, 'mouth opens while claiming');
});

test('executor deploys the purge spindle while awakened; jury convenes while awake', () => {
  const exe = entity('executor', { awakened: false });
  const g1 = buildMachineMesh(exe);
  for (let i = 0; i < 40; i += 1) g1.userData.updateAuthoredMotion(0.016, exe);
  let purge = null;
  g1.traverse((o) => { if (o.parent === g1 && o.type === 'Group' && o !== exe) purge = o; });
  const stowedX = purge.rotation.x;
  exe.data.machine.awakened = true;
  for (let i = 0; i < 400; i += 1) g1.userData.updateAuthoredMotion(0.016, exe);
  assert.ok(purge.rotation.x < stowedX - 0.6, 'purge spindle levels while awakened');

  const jury = entity('sleeping_jury', { awake: false });
  const g2 = buildMachineMesh(jury);
  let seal = null;
  g2.traverse((o) => { if (o.geometry?.parameters?.radius === 1.3) seal = o; });
  for (let i = 0; i < 40; i += 1) g2.userData.updateAuthoredMotion(0.016, jury);
  assert.equal(seal.position.y, 0);
  jury.data.machine.awake = true;
  for (let i = 0; i < 400; i += 1) g2.userData.updateAuthoredMotion(0.016, jury);
  assert.ok(seal.position.y > 3, 'the seal lifts when the jury convenes');
});

test('deploy motion tolerates the absolute-time call shape', () => {
  const e = entity('custodian', { repairing: true });
  const g = buildMachineMesh(e);
  g.userData.updateAuthoredMotion(e, 4.2);
  g.userData.updateAuthoredMotion(e, 4.25);
  assert.ok(true);
});
