// ANI-08 seal + wiring test: the shipped wasp fragment motion banks validate against the
// contract, describe the MOTION_* pivots the compiled render packages carry, resolve through
// wreckPackagedFile for fracture-piece entities, and drive the torn-edge clip end to end.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { bindAuthoredMotion, evaluateMotionClip, validateMotionBank } from '../src/contracts/motionBank.js';
import { fractureFragmentFileForEntity, wreckPackagedFile } from '../src/render/visualFactory.js';

const BANKS = {
  'wasp-frag-bow': {
    path: 'assets/ships/motions/wasp-frag-bow.motion.json',
    pkg: 'assets/ships/release/render-packages/wasp-frag-bow/render-package.json',
    rigId: 'wasp_frag_bow',
    groups: ['frag_flap_a', 'frag_flap_b'],
  },
  'wasp-frag-aft': {
    path: 'assets/ships/motions/wasp-frag-aft.motion.json',
    pkg: 'assets/ships/release/render-packages/wasp-frag-aft/render-package.json',
    rigId: 'wasp_frag_aft',
    groups: ['frag_flap', 'frag_mast'],
  },
};

for (const [key, spec] of Object.entries(BANKS)) {
  test(`${key} bank validates, is sealed into its render package, and kicks then rests`, () => {
    const bank = JSON.parse(readFileSync(spec.path, 'utf8'));
    assert.equal(validateMotionBank(bank), bank);
    assert.equal(bank.rigId, spec.rigId);
    assert.equal(bank.events['wreck:rupture'], 'rupture', 'bank maps wreck:rupture -> rupture');

    const pkg = JSON.parse(readFileSync(spec.pkg, 'utf8'));
    const ref = pkg.runtime && pkg.runtime.motionBank;
    assert.ok(ref, `${key} render package must carry runtime.motionBank`);
    const bytes = readFileSync(spec.path);
    assert.equal(ref.bytes, bytes.length);
    assert.equal(ref.sha256, createHash('sha256').update(bytes).digest('hex'));
    assert.equal(ref.uri, spec.path);
    assert.equal(ref.rigId, bank.rigId);

    const nodeNames = new Set((pkg.nodes || []).map((n) => n.nodeName));
    for (const binding of bank.bindings) {
      assert.ok(nodeNames.has(binding.node), `${key} package is missing pivot ${binding.node}`);
    }

    const clip = bank.clips.find((c) => c.name === 'rupture');
    assert.ok(clip, 'bank must declare a rupture clip');
    assert.equal(clip.endMode, 'rest', 'one deliberate kick returns to rest');
    assert.ok(clip.durationS >= 1.0 && clip.durationS <= 2.5,
      `rupture reads the reference beat (got ${clip.durationS})`);

    // The kick: mid-clip every bound group shows a non-trivial rotational delta off rest.
    const mid = evaluateMotionClip(bank, clip, 0.14);
    for (const group of spec.groups) {
      const delta = mid.get(group);
      assert.ok(delta && Array.isArray(delta.rotation), `mid-kick ${group} has a rotation delta`);
      const tilt = Math.abs(delta.rotation[0]) + Math.abs(delta.rotation[1]) + Math.abs(delta.rotation[2]);
      assert.ok(tilt > 0.02, `mid-kick ${group} rotated measurably (got ${tilt})`);
    }
    // The settle: at clip end every group is back at rest (residual pose, physics-owned).
    const end = evaluateMotionClip(bank, clip, clip.durationS);
    for (const group of spec.groups) {
      const delta = end.get(group);
      const tilt = Math.abs(delta.rotation[0]) + Math.abs(delta.rotation[1]) + Math.abs(delta.rotation[2]);
      assert.ok(tilt < 1e-6, `clip end ${group} lands on rest (got ${tilt})`);
    }
  });
}

test('fracture pieces resolve authored fragment GLBs off the victim defId stamp', () => {
  const waspVisual = { defId: 'ship_wasp', silhouette: 'ship_wasp' };
  // The authored bow shell is a forward-canopy shear: only that seam resolves it.
  const seam = { id: 'w1', data: { fracturePiece: 'seam', fractureSeamId: 'light_forward_canopy', fractureVisual: waspVisual } };
  const rem = { id: 'w2', data: { fracturePiece: 'remainder', fractureSeamId: 'light_forward_canopy', fractureVisual: waspVisual } };
  assert.equal(fractureFragmentFileForEntity(seam), 'places/place_wasp_frag_bow.glb');
  assert.equal(fractureFragmentFileForEntity(rem), 'places/place_wasp_frag_aft.glb');
  assert.equal(wreckPackagedFile(seam), 'places/place_wasp_frag_bow.glb');
  assert.equal(wreckPackagedFile(rem), 'places/place_wasp_frag_aft.glb');

  // Lateral spar breaks are not bow shells — the offcut falls back to generic resolution
  // while the remainder still draws the authored aft mass under any seam.
  const spar = { id: 'w3', data: { fracturePiece: 'seam', fractureSeamId: 'light_port_spar', fractureVisual: waspVisual } };
  const sparRem = { id: 'w4', data: { fracturePiece: 'remainder', fractureSeamId: 'light_port_spar', fractureVisual: waspVisual } };
  assert.equal(fractureFragmentFileForEntity(spar), null);
  assert.equal(fractureFragmentFileForEntity(sparRem), 'places/place_wasp_frag_aft.glb');

  // The remainder also resolves off the hulkVisual the aftermath merge stamps.
  const remHulk = { id: 'w5', data: { fracturePiece: 'remainder', hulkVisual: waspVisual } };
  assert.equal(wreckPackagedFile(remHulk), 'places/place_wasp_frag_aft.glb');

  // Non-fragment wrecks and unsupported defs fall through to hulk/aftermath resolution.
  const generic = { id: 'w6', data: { fracturePiece: 'seam', fractureSeamId: 'light_forward_canopy', fractureVisual: { defId: 'ship_mule' } } };
  assert.equal(fractureFragmentFileForEntity(generic), null);
});

test('rupture controller fires on a bound stub tree then parks at rest', () => {
  const bank = JSON.parse(readFileSync(BANKS['wasp-frag-bow'].path, 'utf8'));
  const clip = bank.clips.find((c) => c.name === 'rupture');
  const mkVec = () => ({ x: 0, y: 0, z: 0, set(a, b, c) { this.x = a; this.y = b; this.z = c; } });
  const mkQuat = () => ({
    x: 0, y: 0, z: 0, w: 1,
    set(a, b, c, d) { this.x = a; this.y = b; this.z = c; this.w = d; },
  });
  const nodes = [];
  for (const binding of bank.bindings) {
    const [rx, ry, rz] = binding.restPose.translation;
    const [qx, qy, qz, qw] = binding.restPose.rotation;
    const node = {
      name: binding.node,
      children: [{ isMesh: true, name: `${binding.node}_mesh`, children: [] }],
      position: mkVec(),
      quaternion: mkQuat(),
      userData: {},
      visible: true,
      parent: null,
    };
    node.position.set(rx, ry, rz);
    node.quaternion.set(qx, qy, qz, qw);
    nodes.push(node);
  }
  const root = { name: 'root', children: nodes, userData: {} };
  for (const n of nodes) n.parent = root;

  const controller = bindAuthoredMotion(root, bank);
  assert.ok(controller, 'controller binds onto the pivot tree');
  controller.handleEvent('wreck:rupture', { pieceId: 'w1' }, 100);
  assert.ok(controller.clipActive('rupture'), 'rupture started');
  // Mid-kick the bound pivot moved off rest.
  controller.update(100.14);
  const moved = nodes.some((n) => Math.abs(n.quaternion.x) > 0.01 || Math.abs(n.quaternion.z) > 0.01);
  assert.ok(moved, 'flap pivots kicked off rest mid-clip');
  // Past the clip it parks and stays parked.
  controller.update(100 + clip.durationS + 0.1);
  controller.update(400);
  assert.equal(controller.clipActive('rupture'), false, 'rupture self-parks at rest');
  const drift = nodes.reduce((acc, n) => acc + Math.abs(n.quaternion.x) + Math.abs(n.quaternion.z), 0);
  assert.ok(drift < 1e-6, `pivots parked at rest (drift ${drift})`);
});
