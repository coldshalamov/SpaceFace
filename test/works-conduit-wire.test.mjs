import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const MASTER_SHA256 = '1CC1A0C72684BB4E660406B3392921473C55D677CF88AAC4CDC00ED050931A53';
const FAMILIES = ['power', 'lane'];
const KINDS = ['straight', 'corner', 't', 'cross', 'end', 'junction'];
const ids = FAMILIES.flatMap((family) => KINDS.map((kind) => `place_works_conduit_${family}_${kind}`));
const EXPECTED_ARTIFACTS = Object.freeze({
  // Re-recorded for the AQ-LOD package rebuild (38cbe05ef) + the a1cc1c66d material-classifier
  // runtime-table refresh (hull -> service roles) that 3ce6f4973 applied fleet-wide but missed
  // the conduit set; metadata re-derived via build-render-package-pilots --only=works-conduit-*.
  place_works_conduit_power_straight: Object.freeze({ release: '260696197B239F31586C5F42277DD2F6C65C443F98155BFE5367FF9DD7170DE0', releaseBytes: 495772, render: '1565C63A6CBB1AA7DCEB839A74A50A358D47234008DFB9DBCB4C6FD65762C09E', metadata: '7707530C71822809168559AA9F3F3DAD2353FA68020E5A0376B62DF312E6E0DE' }),
  place_works_conduit_power_corner: Object.freeze({ release: 'BA486AA12D5651D360F3FCB96492C0C962836D703230B6C6BB996A6F4B64321D', releaseBytes: 500136, render: '724DDD5CC1177E950C99D5B25E49B231D937FBD12E276EA3E1230F8B3A3DE41D', metadata: 'C992E6784FF7B8D579343F0C8F8EB954D141C3D62E84B073FC38FF57B65DE550' }),
  place_works_conduit_power_t: Object.freeze({ release: '2C99C0F4A9A5CE16D1D5D889D47D9073CEA5CF3FC27C400C445FCCEF2BB93F15', releaseBytes: 503416, render: '1FB119C2C33F32FCFD2623D17610A0412133FF93B4EA1C87EAAE1CBECD131D3B', metadata: '9CDF31EAD745A48E2601CF15C75C80BB6FBFE9A7D9754E4523876C84D5B3FB92' }),
  place_works_conduit_power_cross: Object.freeze({ release: '0DA3F50BA5EDBAE7A9F51C420262EECE9B97DEDAE8404C5BB05FFCFE775285BD', releaseBytes: 516872, render: 'A15482AB61EA38D90787113629ADA12F804CDAF8E5D14D791C19546723C1F4BC', metadata: 'D5F82A6DBC377B81537809ED42D94591104926C5602331D9C3BE264ECE7D5090' }),
  place_works_conduit_power_end: Object.freeze({ release: '8208EC0E8796B4D8484CFEAD2DD52B8C4A56AD7B549B539C295480B0B4CFB9E6', releaseBytes: 498108, render: '930054AD3CD44B60270167086B8E49F4FF52A7A4963D173E531FECFFC52CAB1A', metadata: '8BDB546A27CA94F7E08C311F0233362EC2DE8ECDE7EAEBAB950D5C0A7CB0CD67' }),
  place_works_conduit_power_junction: Object.freeze({ release: '0822E1362D508C4F1F7A0BE379B801D98BAEBBD88BCA097B4640AC8DA04E2093', releaseBytes: 528968, render: 'BEBA8E0815018C3452F5217C321263F7F31615BD43F2E0AE157C81A4337E9B49', metadata: '030160CC29316EFE6A7A94C34A2447A5A10473640B6AE5C4BA4FDD3C41C3F8BA' }),
  place_works_conduit_lane_straight: Object.freeze({ release: '84224AF598E1F3610B6C1078B116E148BDDB09EF0D9BE87C9665CEDE2BF67CCE', releaseBytes: 466016, render: '8DE241A14188856AFD09B9E643241163AF5821079CA31EDD1486B77A53479DDD', metadata: '0EC5A57085499117709E58F911C174EAF3DD3534697A464A7EE2037999A5878A' }),
  place_works_conduit_lane_corner: Object.freeze({ release: 'B032032555259D66543C4651776EDBE358CD0058C86874154DAB1CEDD3C38B31', releaseBytes: 470372, render: 'E37BF1CC8B522CE1A4C0CB23352A834101E8B69F4812A256CB984DF12C43850E', metadata: '7E504AB88E09C94C1C31655B6B998927965671D790F8A1211E7F16BDE1AFF5F5' }),
  place_works_conduit_lane_t: Object.freeze({ release: '4CB7382F386141782EB7A74706C041429B545EA2CA404D491739B685BAE0AC9A', releaseBytes: 480600, render: 'E6C99FA40FEB603D8C6BFF2363ACB1D973617BEA284F0B7D8C14FDDC6CBACA63', metadata: '1D493C381BBB28356E720EB8FFEA14E92ACEEDCA8933232AAAF34497B86F5DD0' }),
  place_works_conduit_lane_cross: Object.freeze({ release: 'AC0534B4EADB98EF8624630FC2376B11333F376F0B48216066F9A44983E6BC23', releaseBytes: 491028, render: 'A4E7781F21485BD0EBC8CFDA2BAEC9DB08770E8A1FD5860B5AB8CDE8DED6EF85', metadata: '932252CC06DCEF32979E60E65A33D09955AE8A28002DDFC31520537BCC7635D7' }),
  place_works_conduit_lane_end: Object.freeze({ release: '3DFE2ECB230014147052A324D0A471678A355DB1615186FD54D265B3CCB34097', releaseBytes: 467268, render: '63E69F185DD1150B8971324BC214DFA42DC678DA80C3FD52E91F4B727546C250', metadata: '217B54FE75551184C900730F9CC8B29335DE553D08598F24DC650D0CA7026F65' }),
  place_works_conduit_lane_junction: Object.freeze({ release: 'C52FF55B9B57A97DA56042A2BF2275B0E6BD4C0DEE9D446BA674D9A81328A1D2', releaseBytes: 491452, render: 'E20AC6E7CCA4D3B118785ECD0D09BDBE49E0226DB4F15CACBE7AB0209E18FFF9', metadata: 'B330A3D768994E53D71F71069B12E1DB29DA5B684F0DE7F5F21AD73E28FB1F3F' }),
});

function text(path) { return readFileSync(new URL(path, ROOT), 'utf8'); }
function json(path) { return JSON.parse(text(path)); }
function sha(path) {
  return createHash('sha256').update(readFileSync(new URL(path, ROOT))).digest('hex').toUpperCase();
}
function glbJson(path) {
  const payload = readFileSync(new URL(path, ROOT));
  assert.equal(payload.subarray(0, 4).toString('utf8'), 'glTF');
  const length = payload.readUInt32LE(12);
  return JSON.parse(payload.subarray(20, 20 + length).toString('utf8').trim());
}

function assertLanePortEnvelope(contract, id) {
  assert.deepEqual(Object.keys(contract.portsByLod || {}).sort(), ['lod0', 'lod1', 'lod2'], `${id} source LOD port records`);
  for (const [lod, ports] of Object.entries(contract.portsByLod || {})) {
    assert.ok(ports.length > 0, `${id} ${lod} has ports`);
    for (const port of ports) {
      assert.equal(port.ok, true, `${id} ${lod} ${port.axis} measured`);
      assert.equal(port.width, 1.10, `${id} ${lod} ${port.axis} is the shared 1.10-WU lane section`);
      const [x, y] = port.originBlender;
      // GLB stores float32: 1.1 reads back as 1.100000023841858. Compare with tolerance.
      const onFace = (v) => Math.abs(Math.abs(v) - 1.1) < 1e-6;
      if (port.axis.endsWith('X')) assert.ok(onFace(x), `${id} ${lod} ${port.axis} remains on the cell face`);
      if (port.axis.endsWith('Y')) assert.ok(onFace(y), `${id} ${lod} ${port.axis} remains on the cell face`);
    }
  }
}

test('PQ-131.06 wires exactly twelve selected authored conduit variants without LOD2', () => {
  assert.equal(sha('assets/works/conduit_kit/source/works_conduit_kit.glb'), MASTER_SHA256);
  const inventory = json('assets/works/conduit_kit/INVENTORY.json');
  assert.equal(inventory.authoringMaster.sha256, MASTER_SHA256);
  assert.deepEqual(inventory.selectedRuntime.exportedLods, ['lod0', 'lod1']);
  assert.equal(inventory.selectedRuntime.parts.length, 12);

  const parts = json('assets/ships/parts/parts_manifest.json');
  const release = json('assets/ships/release/release_manifest.json');
  const pilots = json('assets/ships/render-packages/pilots.json');
  for (const id of ids) {
    const expected = EXPECTED_ARTIFACTS[id];
    const family = id.includes('_power_') ? 'power' : 'lane';
    const hook = family === 'power' ? 'powered' : 'flow_mesh';
    const sourcePath = `assets/ships/parts/works/${id}.glb`;
    const releasePath = `assets/ships/release/parts/works/${id}.glb`;
    const selected = glbJson(sourcePath);
    const names = selected.nodes.map((node) => node.name || '');
    const contract = selected.asset.extras.spacefaceAsset;
    assert.deepEqual(contract.exportedLods, ['lod0', 'lod1'], id);
    assert.equal(names.some((name) => name.startsWith('LOD2_')), false, `${id} leaks LOD2`);
    assert.equal(names.includes(hook), true, `${id} hook`);
    if (family === 'lane') {
      const fullSource = glbJson(`assets/works/conduit_kit/source/${id}.glb`);
      assertLanePortEnvelope(fullSource.asset.extras.spacefaceAsset, id);
      assertLanePortEnvelope(contract, `${id} selected contract`);
    }

    const part = parts.parts.find((row) => row.id === id);
    assert.equal(part.category, 'places');
    assert.equal(part.file, `works/${id}.glb`);
    const row = release.assets.find((entry) => entry.id === id);
    assert.equal(row.kind, 'part:places');
    assert.equal(row.source, sourcePath);
    assert.equal(row.release, releasePath);
    assert.equal(row.sourceSha256, sha(sourcePath).toLowerCase());
    assert.equal(sha(releasePath), expected.release, `${id} current release hash`);
    assert.equal(readFileSync(new URL(releasePath, ROOT)).length, expected.releaseBytes, `${id} current release bytes`);
    assert.equal(existsSync(new URL(releasePath, ROOT)), true, `${id} release`);
    const key = `works-conduit-${family}-${id.split('_').at(-1)}`;
    const pilot = pilots.pilots.find((entry) => entry.key === key);
    assert.equal(pilot.runtimeAssetId, id);
    assert.equal(pilot.releaseAssetId, id);
    assert.equal(pilot.sourceUrl, releasePath);
    assert.equal(existsSync(new URL(pilot.metadataUrl, ROOT)), true, `${id} package metadata`);
    assert.equal(sha(`${pilot.outputDir}/render.glb`), expected.render, `${id} package render hash`);
    assert.equal(sha(pilot.metadataUrl), expected.metadata, `${id} package metadata hash`);
  }
});
