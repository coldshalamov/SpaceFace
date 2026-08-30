// PQ-131.06 — Cycle 03 Conduit release/package/runtime identity and topology.
//
// Binds every accepted family/fitting to its Cycle 03 source, sanctioned release, and render
// package. Neighboring Works machines stay registered. The procedural network is never claimed
// deleted here; fallback-only behaviour lives in works-conduit-lifecycle.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveWorksConduitPiece, WORKS_PARTS } from '../src/ui/asteroid/worksPartLoader.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const KIT = 'ECCACB25EEC7C6BDD00DA5E5B87586B07DDD54CEC6FD14A6A09EDAFC8F1F137B';
const FAMILIES = ['power', 'lane'];
const KINDS = ['straight', 'corner', 't', 'cross', 'end', 'junction'];
const PIECES = Object.freeze([
  {
    id: 'place_works_conduit_power_straight',
    sourceSha: 'a939e2fd4a22c63a2d5116b55e237f46a6d06b5ce7c936e4c56b08a07bd1dc85',
    sourceBytes: 394432,
    releaseSha: '54ce429ecbf565c3f7965d6da71d8ad301a4e804dd78ef3556ebae4aa5a67fd8',
    releaseBytes: 493520,
    packageHash: 'be2d8e1ffded2676dd0541a04e22323c05af28bdc9fc5054ad3477eda1a5273d',
    packageBytes: 510068,
  },
  {
    id: 'place_works_conduit_power_corner',
    sourceSha: '0fe74535bc5aa6c09b07b6b10a4d1ffe0ab9e885cf459c54afb9c89ba6bc1542',
    sourceBytes: 412320,
    releaseSha: '6a032c155c130b30f79e7accaef4ec0c33530a8ef5a2894b7e56035094876770',
    releaseBytes: 499108,
    packageHash: '2fd8e3ce10650a70f14c4b91a2fae852f8c357904f204eecee65f949db1a1bf8',
    packageBytes: 523916,
  },
  {
    id: 'place_works_conduit_power_t',
    sourceSha: '8790991e0b798076e4f2a54c24c18cedaad01a6a2ed7a509e9d0860d2330e083',
    sourceBytes: 415960,
    releaseSha: '1cbeb9c458e6b1d5ba2627601f25d6c9fc5b1ee32d7434917bd343222d001f8d',
    releaseBytes: 499396,
    packageHash: '3e16f931069fa76858b278381fc2f10867dd09dd175b09c6a05db6bd098b6ad8',
    packageBytes: 524480,
  },
  {
    id: 'place_works_conduit_power_cross',
    sourceSha: 'e070997992ae8cdae6ff585319aca7154365294d918f9032e8c54230c19d5ca9',
    sourceBytes: 467708,
    releaseSha: '6dbb0d29cea0badb73ec434673544e1ad9d8f330dee734f30ce24881a233a0e0',
    releaseBytes: 510480,
    packageHash: 'b079898fcf2018cf7a8f88748164143ac30337c3fcc60e18a79670880234bcad',
    packageBytes: 545356,
  },
  {
    id: 'place_works_conduit_power_end',
    sourceSha: '0d38be7a45ce36c45019802e3851c45a030146e1ff015cb39ff96ed0ebac2d62',
    sourceBytes: 427792,
    releaseSha: '18074708c75fd8c42ba481930e3ecb00954f69622f320a16958ce05639a1dfc8',
    releaseBytes: 500144,
    packageHash: 'e64a051f0f67412d7e21c0884c55eca8f7576756bdd770ac55e025066b54f8b0',
    packageBytes: 521272,
  },
  {
    id: 'place_works_conduit_power_junction',
    sourceSha: '05ec1e15a05bcb6c25b81340ad92a6e06520066510af6db05e74116189408608',
    sourceBytes: 522136,
    releaseSha: '7d5e9140df886097520772907895f5e0ca6cfe0d594743925b9df75cf2661578',
    releaseBytes: 522164,
    packageHash: 'f4973638164f84c4d83f74bc85b2a919d4a2d3e58105c9c567cad78655444b77',
    packageBytes: 559592,
  },
  {
    id: 'place_works_conduit_lane_straight',
    sourceSha: '751e55d9e4531d877a408bb38f38698b4e7ae5e26b8929036cdae86315863c7b',
    sourceBytes: 333520,
    releaseSha: 'c852eeab644c4ad6ccfef7618ee4a80965010a4d6a7f077c0c84214c1bbc5f82',
    releaseBytes: 475236,
    packageHash: 'ee515046320b9f92eeb6aa5f0f291b096681955c74accfd327a8a78f3a86fa01',
    packageBytes: 486276,
  },
  {
    id: 'place_works_conduit_lane_corner',
    sourceSha: '654281521ed1735da34054b23e1dbdf9509a68e59a02e8bab762fac9bc99f253',
    sourceBytes: 360468,
    releaseSha: '506a15748f820d0b850399485b13f8777dcf5d6c667d6476f69aabbb772c3f6f',
    releaseBytes: 481436,
    packageHash: '01a6c7c412094b651717ab27c289df928ca09288743c3c9de0121a7229df8c91',
    packageBytes: 501484,
  },
  {
    id: 'place_works_conduit_lane_t',
    sourceSha: '3a447add078ca58b573037ebceb3ba24912ed0553b8007050b263dd96e090222',
    sourceBytes: 405432,
    releaseSha: 'e7f74b65de31c5c3ced1846c735feb4c1a62e3f59a554e9efc5dcc11ed0178d6',
    releaseBytes: 489672,
    packageHash: '8858b2d070f6128fc2a1a7f506ebf0d999155f546c6003e2920e494511279a88',
    packageBytes: 509516,
  },
  {
    id: 'place_works_conduit_lane_cross',
    sourceSha: '7ea5018bc232498d789b408e2bfd814deea69fbad0f3b75d3133ab66d755eb74',
    sourceBytes: 449632,
    releaseSha: '9a5b5b22645a7759663c2f4448596f554875909eb169bfcad9af44f52f3a348b',
    releaseBytes: 496836,
    packageHash: '097fec4a24624c3d1ec8c807bf409660bdad03868c166a19b69911ea31eeb969',
    packageBytes: 523476,
  },
  {
    id: 'place_works_conduit_lane_end',
    sourceSha: 'be6a20d98a43a5114034edf3ccb369bc5f0ee2617587cf5caafbe5581091eeb1',
    sourceBytes: 358020,
    releaseSha: '7644f8f6c019ae230c3e7e1a18bd4b6c079bae3d62cc2ae0943c913e85d019ff',
    releaseBytes: 480268,
    packageHash: 'e618c4685d3460ba22d3cbd369e214d81eff3f8be490679bf5e2472d97fd6fd6',
    packageBytes: 497348,
  },
  {
    id: 'place_works_conduit_lane_junction',
    sourceSha: '376dc71cd185cb93b9001d40f2d0c2f7a9b6848dbf444d4cd8d633b7df896e5f',
    sourceBytes: 441156,
    releaseSha: '3531b1abe9dda932b98d0928251030b6e323ede9962ebf570e70f817e07df1e8',
    releaseBytes: 498880,
    packageHash: '8c5c7db2755014b94b5b82994b2470ee625003ca6ded2e63d79f019d90c0ccb5',
    packageBytes: 529144,
  },
]);

function json(rel) {
  return JSON.parse(readFileSync(resolve(ROOT, rel), 'utf8'));
}

function sha256(rel) {
  return createHash('sha256').update(readFileSync(resolve(ROOT, rel))).digest('hex');
}

function bytes(rel) {
  return readFileSync(resolve(ROOT, rel)).length;
}

function keyFor(id) {
  return `works-conduit-${id.replace('place_works_conduit_', '').replace(/_/g, '-')}`;
}

test('master kit SHA-256 is the accepted Cycle 03 KEEP identity', () => {
  const hashes = json('assets/works/conduit_kit/evidence/cycle_03/HASHES.json');
  assert.equal(hashes.master.sha256, KIT);
  assert.equal(sha256('assets/works/conduit_kit/source/works_conduit_kit.glb').toUpperCase(), KIT);
  assert.equal(bytes('assets/works/conduit_kit/source/works_conduit_kit.glb'), 2380004);
});

test('all 12 Cycle 03 pieces bind source, release, package, and runtime identity', () => {
  const release = json('assets/ships/release/release_manifest.json');
  const pilots = json('assets/ships/render-packages/pilots.json');
  const runtime = readFileSync(resolve(ROOT, 'src/render/renderPackageManifest.js'), 'utf8');
  assert.equal(PIECES.length, 12);
  assert.equal(pilots.pilots.length, 214);

  for (const piece of PIECES) {
    const sourceUrl = `assets/ships/parts/works/${piece.id}.glb`;
    const releaseUrl = `assets/ships/release/parts/works/${piece.id}.glb`;
    const key = keyFor(piece.id);
    const row = release.assets.find((asset) => asset.id === piece.id);
    const pilot = pilots.pilots.find((entry) => entry.key === key);
    const pkg = json(`assets/ships/release/render-packages/${key}/render-package.json`);
    const pkgGlb = `assets/ships/release/render-packages/${key}/render.glb`;

    assert.ok(row, piece.id);
    assert.ok(pilot, key);
    assert.equal(sha256(sourceUrl), piece.sourceSha);
    assert.equal(bytes(sourceUrl), piece.sourceBytes);
    assert.equal(row.sourceSha256, piece.sourceSha);
    assert.equal(row.sourceBytes, piece.sourceBytes);
    assert.equal(row.releaseSha256, piece.releaseSha);
    assert.equal(row.releaseBytes, piece.releaseBytes);
    assert.equal(sha256(releaseUrl), piece.releaseSha);
    assert.equal(bytes(releaseUrl), piece.releaseBytes);
    assert.equal(pilot.releaseSha256, piece.releaseSha);
    assert.equal(pilot.releaseBytes, piece.releaseBytes);
    assert.equal(pilot.runtimeAssetId, piece.id);
    assert.equal(pilot.sourceUrl, releaseUrl);
    assert.equal(pkg.assetId, `sf.render.${key}`);
    assert.equal(pkg.contentHash, piece.packageHash);
    assert.equal(bytes(pkgGlb), piece.packageBytes);
    assert.match(runtime, new RegExp(`"key": "${key}"`));
    assert.ok(WORKS_PARTS[piece.id], piece.id);
    assert.equal(WORKS_PARTS[piece.id].lod0, releaseUrl);
  }
});

test('neighboring Works identities remain registered beside the conduit kit', () => {
  for (const id of ['rover', 'derrick', 'extractor', 'fabricator', 'massline_core', 'refinery']) {
    assert.ok(WORKS_PARTS[id], id);
  }
  assert.equal(FAMILIES.length * KINDS.length, 12);
});

test('four-port cells pick one service junction per network without inventing arms', () => {
  const lane = [
    { family: 'lane', key: 'a', idx: 40, mask: 15 },
    { family: 'lane', key: 'a', idx: 12, mask: 15 },
    { family: 'lane', key: 'b', idx: 8, mask: 15 },
    { family: 'lane', key: 'a', idx: 3, mask: 10 },
  ];
  const service = new Map();
  for (const rec of lane) {
    if (rec.mask !== 15) continue;
    const k = `${rec.family}:${rec.key}`;
    const prior = service.get(k);
    if (prior == null || rec.idx < prior) service.set(k, rec.idx);
  }
  const resolved = lane.map((rec) => resolveWorksConduitPiece(rec.family, rec.mask || 10, {
    service: rec.mask === 15 && service.get(`${rec.family}:${rec.key}`) === rec.idx,
  }));
  assert.equal(resolved[0].kind, 'cross');
  assert.equal(resolved[1].kind, 'junction');
  assert.equal(resolved[2].kind, 'junction');
  assert.equal(resolved[3].kind, 'straight');
  assert.equal(resolved[1].assetId, 'place_works_conduit_lane_junction');
});
