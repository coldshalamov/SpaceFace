// PQ-193.12 regression: every station the player can reach resolves an authored body — the
// procedural fat-cylinder-plus-hoops primitive is a defect, not a style. Resolution is total
// (stationTypeId covers the whole catalog vocabulary, gates cover the jump ring), an unresolvable
// station fails closed instead of publishing a substitute, and the hidden diagnostic substrate
// keeps only shared primitives so authored-commit cleanup cannot corrupt failure controls.
import { SECTORS, STATION_TYPES } from '../src/data/sectors.js';
import {
  STATION_ARCHETYPE_PLACE_IDS,
  buildAuthoredStationArchetype,
  resolvePlaceFileForEntity,
} from '../src/render/partsLibrary.js';
import { createVisualFactory } from '../src/render/visualFactory.js';
import { installVisualOverrides } from '../src/render/visualOverrides.js';
import * as THREE from 'three';

let failures = 0;
function check(label, cond, detail = '') {
  if (cond) return;
  console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  failures++;
}

// 1. The station type vocabulary is total: every STATION_TYPES id names an authored place file.
for (const typeId of STATION_TYPES) {
  const expected = `places/place_station_${typeId}.glb`;
  const ent = { type: 'station', radius: 72, data: { stationTypeId: typeId } };
  const resolved = resolvePlaceFileForEntity(ent);
  check(`stationTypeId '${typeId}' resolves its authored family body`, resolved === expected, String(resolved));
  const expectedId = `place_station_${typeId}`;
  check(`station type '${typeId}' is a whitelisted archetype`, STATION_ARCHETYPE_PLACE_IDS.includes(expectedId));
}

// 2. Every station and gate record the live route can spawn resolves to a place file, mirroring
//    the spawn shape in world.js ({ stationId, stationTypeId, archetypeGlb, dockRadius }).
for (const sector of SECTORS) {
  for (const st of sector.stations || []) {
    const ent = {
      type: 'station', radius: 72,
      data: { stationId: st.id, stationTypeId: st.type, archetypeGlb: st.archetypeGlb, dockRadius: 72 },
    };
    const resolved = resolvePlaceFileForEntity(ent);
    check(`${sector.id}/${st.id} resolves an authored body`, typeof resolved === 'string', String(st.archetypeGlb));
    const visual = buildAuthoredStationArchetype(ent, { releaseMode: true });
    check(`${sector.id}/${st.id} builds an authored boundary`, !!(visual && visual.isObject3D));
    if (visual) {
      check(`${sector.id}/${st.id} starts pending authored admission`,
        visual.userData.authoredAssetState === 'awaiting-authored-admission',
        String(visual.userData.authoredAssetState));
      const substrate = visual.children.find((child) => /Fallback/.test(child.name || ''));
      check(`${sector.id}/${st.id} keeps a hidden diagnostic substrate`, !!substrate && substrate.visible === false);
      let nonShared = 0;
      (substrate || visual).traverse((object) => {
        if (object.geometry && !(object.geometry.userData && object.geometry.userData.spacefaceSharedFallback)) nonShared++;
      });
      check(`${sector.id}/${st.id} substrate holds only shared fallback primitives`, nonShared === 0,
        `nonShared=${nonShared}`);
    }
  }
  for (const g of sector.gates || []) {
    const ent = {
      type: 'station', radius: 70,
      data: { stationId: null, isGate: true, isWormhole: !!g.wormhole, archetypeGlb: g.archetypeGlb, dockRadius: 70 },
    };
    check(`${sector.id}/gate->${g.to} resolves the authored jump ring`,
      resolvePlaceFileForEntity(ent) === 'places/place_gate_jump_ring.glb',
      String(resolvePlaceFileForEntity(ent)));
  }
}

// 3. A gate or wormhole without an archetype tag still resolves the authored jump ring.
for (const flag of ['isGate', 'isWormhole']) {
  const ent = { type: 'station', radius: 70, data: { [flag]: true, dockRadius: 70 } };
  check(`${flag} station without archetypeGlb resolves the jump ring`,
    resolvePlaceFileForEntity(ent) === 'places/place_gate_jump_ring.glb',
    String(resolvePlaceFileForEntity(ent)));
}

// 4. A mistyped archetype tag on a catalog station rescues to its authored family body (the data
//    defect is diagnosed via console.warn) rather than degrading to the primitive fallback.
{
  const ent = {
    type: 'station', radius: 72,
    data: { stationId: 'station_bogus', stationTypeId: 'refinery', archetypeGlb: 'place_station_typo' },
  };
  check('mistyped archetype rescues to authored family body',
    resolvePlaceFileForEntity(ent) === 'places/place_station_refinery.glb',
    String(resolvePlaceFileForEntity(ent)));
  const visual = buildAuthoredStationArchetype(ent, { releaseMode: true });
  check('rescued station still builds an authored boundary', !!(visual && visual.isObject3D));
}

// 5. A station with no resolvable authored identity fails closed — it must never fall back to the
//    fat-cylinder primitive or to an unrelated substitute.
{
  const ent = {
    id: 'station_identity_void', type: 'station', radius: 72,
    data: { stationId: 'station_identity_void', archetypeGlb: 'place_station_nonexistent' },
  };
  check('unresolvable station resolves no place file', resolvePlaceFileForEntity(ent) === null);
  let threw = false;
  try { buildAuthoredStationArchetype(ent, { releaseMode: true }); }
  catch { threw = true; }
  check('unresolvable station build fails closed', threw);

  const vf = installVisualOverrides(createVisualFactory(), { releaseMode: true });
  const visual = vf.build(ent);
  check('unresolvable station publishes the unavailable fail-closed visual',
    !!(visual && visual.isObject3D) && visual.visible === false
      && visual.userData.authoredAssetState === 'unavailable',
    visual && visual.userData && visual.userData.authoredAssetState);
  let stationPrimitiveMeshes = 0;
  (visual || new THREE.Group()).traverse((object) => { if (object.isMesh) stationPrimitiveMeshes++; });
  check('unresolvable station publishes zero meshes', stationPrimitiveMeshes === 0,
    `meshes=${stationPrimitiveMeshes}`);
}

if (failures) {
  console.error(`pq193-12-station-authored-body.test: ${failures} failures`);
  process.exit(1);
}
console.log('pq193-12-station-authored-body.test: ok');
process.exit(0);
