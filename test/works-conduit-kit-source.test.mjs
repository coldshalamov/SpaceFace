// PQ-131.06 — conduit kit source-candidate contract.
//
// Source only. Does not claim release, loadWorksPart wiring, G6, or G7.
// Reads the real exported GLBs and the kit inventory, not a stand-in mesh.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PARTS = resolve(ROOT, 'assets/ships/parts/works');
const KIT = resolve(ROOT, 'assets/works/conduit_kit');
const FAMILIES = ['power', 'lane'];
const KINDS = ['straight', 'corner', 't', 'cross', 'end', 'junction'];
const PORTS = {
  straight: ['-X', '+X'],
  corner: ['+X', '+Y'],
  t: ['-X', '+X', '+Y'],
  cross: ['-X', '+X', '-Y', '+Y'],
  end: ['+X'],
  junction: ['-X', '+X', '-Y', '+Y'],
};
const WIDTH = { power: 0.48, lane: 0.76 };

function sha256(abs) {
  return createHash('sha256').update(readFileSync(abs)).digest('hex').toUpperCase();
}

function readGlb(abs) {
  const buf = readFileSync(abs);
  assert.equal(buf.readUInt32LE(0), 0x46546c67, `GLB magic at ${abs}`);
  const jsonLength = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLength).toString('utf8'));
  return json;
}

function names(json) {
  return (json.nodes || []).map((n) => n.name || '');
}

function assetId(family, kind) {
  return `place_works_conduit_${family}_${kind}`;
}

function lodTriangles(json) {
  const out = { 0: 0, 1: 0, 2: 0 };
  const meshes = json.meshes || [];
  const nodes = json.nodes || [];
  for (const node of nodes) {
    const name = node.name || '';
    const lod = /^LOD([012])_/.exec(name);
    if (!lod || node.mesh === undefined) continue;
    const mesh = meshes[node.mesh];
    if (!mesh) continue;
    for (const prim of mesh.primitives || []) {
      const acc = json.accessors?.[prim.indices];
      if (acc) out[Number(lod[1])] += acc.count / 3;
    }
  }
  return out;
}

test('inventory is Cycle 03 and lists twelve pieces', () => {
  const inv = JSON.parse(readFileSync(resolve(KIT, 'INVENTORY.json'), 'utf8'));
  assert.equal(inv.packet, 'PQ-131.06');
  assert.equal(inv.cycle, 3);
  assert.equal(inv.pieces.length, 12);
  for (const family of FAMILIES) {
    for (const kind of KINDS) {
      const row = inv.pieces.find((p) => p.id === assetId(family, kind));
      assert.ok(row, `${family} ${kind} in inventory`);
      assert.equal(row.family, family);
      assert.equal(row.kind, kind);
    }
  }
});

test('each piece GLB carries LODs, the family hook, and matching ports', () => {
  for (const family of FAMILIES) {
    const hook = family === 'power' ? 'powered' : 'flow_mesh';
    for (const kind of KINDS) {
      const id = assetId(family, kind);
      const path = resolve(PARTS, `${id}.glb`);
      const src = resolve(KIT, 'source', `${id}.glb`);
      assert.equal(existsSync(path), true, path);
      assert.equal(existsSync(src), true, src);
      assert.equal(sha256(path), sha256(src), `${id} parts and source match`);
      const json = readGlb(path);
      const nodeNames = names(json);
      assert.ok(nodeNames.includes(id), `${id} root`);
      assert.ok(nodeNames.includes(hook), `${id} hook ${hook}`);
      if (kind === 'junction') {
        assert.ok(nodeNames.includes('service_lid'), `${id} service_lid`);
      }
      for (const lod of [0, 1, 2]) {
        assert.ok(nodeNames.some((n) => n.startsWith(`LOD${lod}_`)), `${id} LOD${lod}`);
      }
      const extras = json.asset?.extras?.spacefaceAsset || {};
      assert.equal(extras.family, family);
      assert.equal(extras.kind, kind);
      assert.equal(extras.packet, 'PQ-131.06');
      assert.equal(extras.cycle, 3);
      const got = (extras.ports || []).map((p) => p.axis);
      assert.deepEqual(new Set(got), new Set(PORTS[kind]), `${id} ports`);
      for (const port of extras.ports || []) {
        assert.equal(port.ok, true, `${id} ${port.axis} ok`);
        assert.ok(Math.abs(port.width - WIDTH[family]) < 0.08, `${id} ${port.axis} width`);
        const origin = port.originBlender || [];
        if (port.axis === '+X') assert.ok(Math.abs(origin[0] - 1.1) < 0.002);
        if (port.axis === '-X') assert.ok(Math.abs(origin[0] + 1.1) < 0.002);
        if (port.axis === '+Y') assert.ok(Math.abs(origin[1] - 1.1) < 0.002);
        if (port.axis === '-Y') assert.ok(Math.abs(origin[1] + 1.1) < 0.002);
      }
      const tris = lodTriangles(json);
      assert.ok(tris[0] > 200 && tris[0] <= 2000, `${id} LOD0 tris ${tris[0]}`);
      assert.ok(tris[1] > 0 && tris[1] < tris[0], `${id} LOD1 cheaper`);
      assert.ok(tris[2] > 0 && tris[2] <= tris[1], `${id} LOD2 cheaper`);
      assert.ok((json.images || []).length >= 3, `${id} three atlas maps`);
    }
  }
});

test('the two families are mechanically distinct at the port', () => {
  const power = readGlb(resolve(PARTS, 'place_works_conduit_power_straight.glb'));
  const lane = readGlb(resolve(PARTS, 'place_works_conduit_lane_straight.glb'));
  const pw = power.asset.extras.spacefaceAsset.ports[0].width;
  const lw = lane.asset.extras.spacefaceAsset.ports[0].width;
  assert.ok(lw - pw > 0.2, 'lane is the wider tray');
  const pn = names(power);
  const ln = names(lane);
  assert.ok(pn.includes('powered'));
  assert.ok(!pn.includes('flow_mesh'));
  assert.ok(ln.includes('flow_mesh'));
  assert.ok(!ln.includes('powered'));
});

test('Cycle 03 evidence names producer binding and does not claim KEEP', () => {
  const reportPath = resolve(KIT, 'evidence/cycle_03/CYCLE_03_REPORT.json');
  const hashPath = resolve(KIT, 'evidence/cycle_03/HASHES.json');
  assert.equal(existsSync(reportPath), true, 'cycle 03 report');
  assert.equal(existsSync(hashPath), true, 'cycle 03 hashes');
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  assert.equal(report.cycle, 3);
  assert.equal(report.gates.G1, 'open');
  assert.equal(report.gates.G6, 'open');
  assert.equal(report.gates.G7, 'open');
  const blob = JSON.stringify(report);
  assert.equal(blob.includes('"KEEP"'), false, 'report does not self-KEEP');
  const hashes = JSON.parse(readFileSync(hashPath, 'utf8'));
  assert.ok(hashes.producer?.builder?.sha256);
  assert.ok(hashes.producer?.camera?.sha256);
  assert.ok(hashes.master?.sha256);
});
