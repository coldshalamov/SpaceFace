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
  place_works_conduit_power_straight: Object.freeze({ release: '260696197B239F31586C5F42277DD2F6C65C443F98155BFE5367FF9DD7170DE0', releaseBytes: 495772, render: '6BC164051F71DD55F7F4413537F2C7F8696A8BE2CF45D7869B3EA175EE7249A9', metadata: '30A2314523F7C476652FC553DF7CDEFE0F5261F23BB364E2DEE401D6EA84CD53' }),
  place_works_conduit_power_corner: Object.freeze({ release: 'BA486AA12D5651D360F3FCB96492C0C962836D703230B6C6BB996A6F4B64321D', releaseBytes: 500136, render: '9F2B8B585870BF737C0B053E775BB1A7D546C9F2C2B00A160B2135A87FC077D9', metadata: '5AE196FF0B5428AC80420282735EF9DF421E6E9A283BC69831E6F1D3EC5132E5' }),
  place_works_conduit_power_t: Object.freeze({ release: '2C99C0F4A9A5CE16D1D5D889D47D9073CEA5CF3FC27C400C445FCCEF2BB93F15', releaseBytes: 503416, render: 'D75AF76F0CBFA9BF8E774BC8B73C2F1A271B67437093B6C5AB164BF7A183D380', metadata: 'A403D23930D532E5A3ED0E22184EA736E8DABE2E42AA01E378B0CE04A9FE4C7C' }),
  place_works_conduit_power_cross: Object.freeze({ release: '0DA3F50BA5EDBAE7A9F51C420262EECE9B97DEDAE8404C5BB05FFCFE775285BD', releaseBytes: 516872, render: 'CA1FFB7AC57BC254DE77155F664428E290D4F4D94EC3AE023FE9E5606B3F1261', metadata: 'D62A1F151A2F15354DDF40F2EBB85F2C0FE6579A1E31242115B5A64562D7EA69' }),
  place_works_conduit_power_end: Object.freeze({ release: '8208EC0E8796B4D8484CFEAD2DD52B8C4A56AD7B549B539C295480B0B4CFB9E6', releaseBytes: 498108, render: '29B5BE77A396D22B8280145CD7A64A281DF7C2DA378E83341AD5C208E963C9A9', metadata: 'EEBA7295993F16E24D4E9F69CB930016BA01D23BEFD8C52200D46D2E45D02247' }),
  place_works_conduit_power_junction: Object.freeze({ release: '0822E1362D508C4F1F7A0BE379B801D98BAEBBD88BCA097B4640AC8DA04E2093', releaseBytes: 528968, render: '6FBFE283667C5E69132A7549C381A6D030DA2006521BD10F9763B4CBC99510DC', metadata: 'A2F1842529E91CDD603C4E90AC17C300D2C0E99C869F4AFE08FF54CFB1763A7A' }),
  place_works_conduit_lane_straight: Object.freeze({ release: '84224AF598E1F3610B6C1078B116E148BDDB09EF0D9BE87C9665CEDE2BF67CCE', releaseBytes: 466016, render: 'DBF7D96FC82AC85721DE3BB3CA425608423365E065EE6B1C7CBCB564D26BCB4F', metadata: '073E0F31204B1AAEFD09920BE5AED062AD8A94BF549FAD17AF2B49326A421B59' }),
  place_works_conduit_lane_corner: Object.freeze({ release: 'B032032555259D66543C4651776EDBE358CD0058C86874154DAB1CEDD3C38B31', releaseBytes: 470372, render: '16D541A0CDEBEEF54C9446AB3A848D3415D5CECE106AB31E10C87931070F05DA', metadata: '8FBD117BDA67D0BAF73F629EACFECA8C41ACCDBA04C88B116439E83664799B2A' }),
  place_works_conduit_lane_t: Object.freeze({ release: '4CB7382F386141782EB7A74706C041429B545EA2CA404D491739B685BAE0AC9A', releaseBytes: 480600, render: '33CF3AB67D4DCA5C49E97D2878DBFDC4068D9220B56292767E44CD85765CBFFC', metadata: '1A807C7E019DC696ACCD670871B53BAE3768265A51F82C582482C8DE941EBDEA' }),
  place_works_conduit_lane_cross: Object.freeze({ release: 'AC0534B4EADB98EF8624630FC2376B11333F376F0B48216066F9A44983E6BC23', releaseBytes: 491028, render: '7D1686EB1285DC32C9FFA0C68ACBDCCD0D5333D7ED488195CDF90D0E916C0FDC', metadata: '091BCCF7B5D2DFD6B77847A8049BE88EACD961A41659526F8CDBE137EF19E44B' }),
  place_works_conduit_lane_end: Object.freeze({ release: '3DFE2ECB230014147052A324D0A471678A355DB1615186FD54D265B3CCB34097', releaseBytes: 467268, render: '28FC76C67ED61B2F07E088A27F18F5BB92E26B0293E0D3E339E1CC8EB5792EDC', metadata: 'A59A09290917112CA094649F899AE6445E1A92BA0366BD9F578B0ADEB4406633' }),
  place_works_conduit_lane_junction: Object.freeze({ release: 'C52FF55B9B57A97DA56042A2BF2275B0E6BD4C0DEE9D446BA674D9A81328A1D2', releaseBytes: 491452, render: 'A699BCA3A82D5FCAF799D4E2DFB7D47D1AB5313F42B17C685739D4191694086F', metadata: '800081C7E6E85B873901D501BEA5832604E7418DF3B6A06D649746FD96D8D7B7' }),
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
