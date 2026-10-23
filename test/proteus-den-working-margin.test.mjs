import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { wreckAftermathDressingForSector, WRECK_AFTERMATH_SALT } from '../src/data/wreckAftermathDressing.js';
import {
  everydaySpaceKitDressingForSector as dress,
  EVERYDAY_SPACE_KIT_MODEL_BY_ID as models,
  EVERYDAY_SPACE_KIT_PLACE_FILE_BY_ID as files,
  EVERYDAY_SPACE_KIT_MAX_PER_SECTOR as cap,
  PROTEUS_DEN_WORKING_MARGIN as margin,
} from '../src/data/everydaySpaceKitDressing.js';

const station = { stationId: 'station_proteus', pos: { x: -640, z: 520 } };
const anchors = { stations: [station] };
function counted(seed = 1) {
  let calls = 0, value = seed >>> 0;
  const rng = () => { calls++; value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; };
  return { rng, count: () => calls };
}
// modelTruthSkinPrimitives stores normalized shapes and scales by the live
// dockRadius (stations) or entity radius (props). Enclose the complete adopted
// primitives, including capsule caps, not just the slightly smaller mesh box.
function adoptedSkinRadius(row, liveReference) {
  assert.equal(row.proposedSkin.adopted, true);
  return Math.max(...row.proposedSkin.primitives.map(p => {
    assert.ok(p.kind === 'circle' || p.kind === 'capsule');
    const extent = p.kind === 'circle' ? Math.hypot(p.x, p.z)
      : Math.max(Math.hypot(p.ax, p.az), Math.hypot(p.bx, p.bz));
    return (extent + p.r) * liveReference;
  }));
}

const rows = () => dress('sector_proteus_well', 'fringe', () => { throw Error('authored margin consumed RNG'); }, anchors);
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
function segmentDistance(p, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const n = dx * dx + dz * dz;
  const t = n ? Math.max(0, Math.min(1, ((p.x-a.x)*dx+(p.z-a.z)*dz)/n)) : 0;
  return distance(p, { x: a.x+t*dx, z: a.z+t*dz });
}

test('Den composes three existing admitted bodies within its original six slots', () => {
  const props = rows();
  assert.equal(props.length, 3);
  assert.ok(props.length <= cap);
  assert.deepEqual(props.map(p => p.placeId), margin.props.map(p => p.placeId));
  for (const prop of props) {
    assert.equal(models[prop.placeId].live, true);
    assert.equal(files[prop.placeId], 'places/' + prop.placeId + '.glb');
    assert.equal(prop.radius, 8);
    assert.equal(prop.everydaySpaceKit, true);
    assert.equal(prop.anchor, 'station');
    assert.deepEqual(prop.anchorPos, station.pos);
    assert.equal(prop.name, models[prop.placeId].label);
    assert.ok(!/cache|finding|Pyrrha|safe/i.test(prop.name));
    assert.ok(Object.isFrozen(prop));
  }
});

test('unique named station translates the whole composition, independent of RNG and return', () => {
  const first = rows();
  const second = rows();
  assert.deepEqual(second, first);
  assert.notEqual(second, first);
  const translated = dress('sector_proteus_well', 'fringe', () => { throw Error('RNG'); },
    { stations: [{ stationId: 'other', pos: { x: 1, z: 2 } },
      { stationId: 'station_proteus', pos: { x: 1360, z: -2480 } }] });
  translated.forEach((row, i) => {
    assert.equal(row.pos.x, first[i].pos.x + 2000);
    assert.equal(row.pos.z, first[i].pos.z - 3000);
    assert.equal(row.rot, first[i].rot);
  });
});

test('missing, ambiguous, unnamed and invalid named stations retain the original picker', () => {
  for (const stations of [
    [], [{ pos: station.pos }], [{ stationId: 'other', pos: station.pos }],
    [station, station], [{ stationId: 'station_proteus', pos: { x: NaN, z: 0 } }],
    [{ stationId: 'station_proteus', pos: { x: '-640', z: 520 } }],
    [{ stationId: 'station_proteus' }],
  ]) {
    const a = counted(37), b = counted(37);
    const input = { stations, fields: [{ center: { x: 680, z: -420 } }] };
    // Both are fringe sectors without skip rules: invalid Proteus anchor must
    // use the same original algorithm, including exactly the same random draws.
    assert.deepEqual(dress('sector_proteus_well', 'fringe', a.rng, input),
      dress('sector_unclaimed_fixture', 'fringe', b.rng, input));
    assert.equal(a.count(), b.count());
  }
});

test('authoring pause/pass clear the three actual census envelopes with a representative hull', () => {
  const census = JSON.parse(readFileSync(new URL('../src/data/modelTruthCensus.json', import.meta.url))).rows;
  const hullRadius = 48; // Explicit conservative test hull, not all ships or native-motion proof.
  const pauseRadius = margin.stop.clearRadius;
  const props = rows();
  for (const prop of props) {
    const row = census.find(r => r.id === prop.placeId);
    assert.ok(row && row.proposedSkin.adopted);
    assert.equal(row.gameplay.entityRadius, prop.radius);
    assert.equal(row.drawScale, 1);
    const sx = row.bounds.size[0], sz = row.bounds.size[2];
    // A yaw-invariant circumscribed disk conservatively encloses the X/Z mesh.
    const meshRadius = Math.max(Math.hypot(sx, sz) / 2, adoptedSkinRadius(row, prop.radius));
    assert.ok(distance(margin.stop, prop.pos) > pauseRadius + meshRadius);
    assert.ok(distance(margin.stop, prop.pos) > hullRadius + meshRadius);
    for (let i = 1; i < margin.pass.length; i++) {
      assert.ok(segmentDistance(prop.pos, margin.pass[i-1], margin.pass[i]) > hullRadius + meshRadius);
    }
  }
});

test('Den visual envelope is distinct from berth radius and remains outside the margin', () => {
  const census = JSON.parse(readFileSync(new URL('../src/data/modelTruthCensus.json', import.meta.url))).rows;
  const row = census.find(r => r.id === 'place_station_blackmarket');
  const medium = row.gameplay.sizes.find(r => r.name === 'M');
  assert.equal(medium.dockRadius, 72);
  // Production mountDrawScale: base drawScale * live dockRadius/reference dockRadius.
  // Include raw-center offset rather than treating the model as a centered dock sphere.
  const scale = row.drawScale * medium.dockRadius / row.gameplay.dockRadius;
  const offset = row.drawOffset;
  const corners = [row.bounds.min[0], row.bounds.max[0]].flatMap(x =>
    [row.bounds.min[2], row.bounds.max[2]].map(z =>
      Math.hypot(x*scale + offset[0], z*scale + offset[2])));
  const envelope = Math.max(...corners, adoptedSkinRadius(row, medium.dockRadius));
  assert.ok(envelope > 0);
  assert.ok(distance(margin.stop, station.pos) > envelope + margin.stop.clearRadius + 48);
  for (let i = 1; i < margin.pass.length; i++) {
    assert.ok(segmentDistance(station.pos, margin.pass[i-1], margin.pass[i]) > envelope + 48);
  }
});

test('authored Den and seam route envelopes remain east of the waiting margin', () => {
  const source = readFileSync(new URL('../src/data/sectorActivityPockets.js', import.meta.url), 'utf8');
  const start = source.indexOf("sectorId: 'sector_proteus_well'");
  const end = source.indexOf("sectorId: 'sector_triton_wake'", start);
  assert.ok(start >= 0 && end > start);
  const body = source.slice(start, end);
  const pockets = [
    { body: body.slice(0, body.indexOf("id: 'proteus_quiet_seams'")), anchor: station.pos },
    { body: body.slice(body.indexOf("id: 'proteus_quiet_seams'")), anchor: { x: 680, z: -420 } },
  ];
  for (const pocket of pockets) {
    const points = [pocket.anchor];
    for (const m of pocket.body.matchAll(/spawn: \[(-?[\d.]+), (-?[\d.]+)\]|\['proteus_[^']+', (-?[\d.]+), (-?[\d.]+),/g)) {
      points.push({ x: pocket.anchor.x + Number(m[1] ?? m[3]), z: pocket.anchor.z + Number(m[2] ?? m[4]) });
    }
    assert.ok(points.length >= 7);
    // All authored joins lie in this half-plane, including return to anchor.
    // Dynamic avoidance, live destinations, hostile traffic and overshoot are
    // not established by a static authored-route clearance assertion.
    const minX = Math.min(...points.map(p => p.x));
    assert.ok(minX - margin.stop.x > margin.stop.clearRadius + 48);
    assert.ok(minX - margin.stop.x > 48 + 48);
    for (const prop of rows()) assert.ok(minX - prop.pos.x > prop.radius + 48);
  }
});

test('composition contains no second reward, marker, actor, berth or cache authority', () => {
  for (const prop of rows()) {
    assert.deepEqual(Object.keys(prop).sort(),
      ['placeId','pos','rot','name','radius','anchor','anchorPos','everydaySpaceKit'].sort());
  }
  assert.ok(margin.props.every(prop => prop.x < station.pos.x));
});



test('clustered released bodies do not overlap adopted primitive or mesh envelopes', () => {
  const census = JSON.parse(readFileSync(new URL('../src/data/modelTruthCensus.json', import.meta.url))).rows;
  const props = rows();
  const radii = props.map(prop => {
    const row = census.find(r => r.id === prop.placeId);
    return Math.max(adoptedSkinRadius(row, prop.radius), Math.hypot(row.bounds.size[0], row.bounds.size[2])/2);
  });
  for (let i=0;i<props.length;i++) for(let j=i+1;j<props.length;j++) {
    assert.ok(distance(props[i].pos,props[j].pos)>radii[i]+radii[j]);
  }
  assert.deepEqual(props.map(p=>p.pos), [{x:-925,z:600},{x:-945,z:616},{x:-945,z:584}]);
});

// Exercise the exact warm-owner function and its actual seeded kit-stub loop.
// Only its unrelated global-origin dependency is fixed to zero for these local
// comparison fixtures; this is not a full renderer or Continue execution.
const warmSource = readFileSync(new URL('../src/render/saveEnvelopeSectorWarm.js', import.meta.url), 'utf8');
const warmStart = warmSource.indexOf('function sectorDressingRows(');
const warmEnd = warmSource.indexOf('/**', warmStart);
assert.ok(warmStart>=0 && warmEnd>warmStart);
const warmFunction = warmSource.slice(warmStart,warmEnd);
const seededStart = warmSource.indexOf('  if (seeded) {', warmSource.indexOf('  const { kitRows, wreckRows'));
const seededEnd = warmSource.indexOf('  const recordsById',seededStart);
assert.ok(seededStart>=0 && seededEnd>seededStart);
const emitStubs = new Function('seeded','kitRows','wreckRows',
  'const out={placeStubs:[]};'+warmSource.slice(seededStart,seededEnd)+';return out.placeStubs;');
function compileWarm(source, calls) {
  return new Function('everydaySpaceKitDressingForSector','wreckAftermathDressingForSector',
    'EVERYDAY_SPACE_KIT_SALT','WRECK_AFTERMATH_SALT','hash32','mulberry32','sectorGlobalOrigin',
    source+';return sectorDressingRows;')(
    dress,wreckAftermathDressingForSector,'everydaySpaceKit',WRECK_AFTERMATH_SALT,hash32,
    seed=>{const rng=mulberry32(seed);return ()=>{calls.n++;return rng();};},()=>({x:0,z:0}));
}

test('seeded warm kit stubs equal runtime Proteus models, with unseeded omission intact', () => {
  const callCount={n:0}, warm=compileWarm(warmFunction,callCount);
  for (const seed of [1,37,991]) {
    // Sector catalogs may omit authored station coordinates. Stub identity must
    // still agree because named anchor membership, not absolute position, selects.
    for(const pos of [undefined,station.pos]) {
      const result=warm({id:'sector_proteus_well',stations:[{id:'station_proteus',pos}],pois:[]},'fringe',seed);
      const stubs=emitStubs(true,result.kitRows,result.wreckRows).filter(s=>s.data.everydaySpaceKit);
      assert.deepEqual(stubs.map(s=>s.data.placeId),rows().map(s=>s.placeId));
      assert.deepEqual(emitStubs(false,result.kitRows,result.wreckRows),[]);
    }
  }
});

test('named warm-anchor mapper preserves generic non-Proteus output and RNG consumption', () => {
  const oldFunction=warmFunction.replace(/  \/\/ Keep named anchors[^\n]*\n  const stations = \(sector\.stations \|\| \[\]\)\.map\(\(st\) => \(\{[\s\S]*?  \}\)\);/,
    '  const stations = (sector.stations || []).map((st) => (st && st.pos) || { x: 0, z: 0 });');
  assert.notEqual(oldFunction,warmFunction);
  const a={n:0},b={n:0},before=compileWarm(oldFunction,a),after=compileWarm(warmFunction,b);
  const ids=['helios_prime','ceres_belt','tethys_junction','vesta_forge','pallas_drift','sker_haven',
    'veil_nebula','triton_wake','nereid_shoal','phoebe_rim','sedna_dark','nyx_reach'];
  for(const id of ids)for(const palette of ['core','belt','fringe','anomaly'])for(const seed of [1,37,991]) {
    const sector={id:'sector_'+id,worldRadius:5000,enemyDensity:.5,
      stations:[{id:'station_customs',pos:{x:-640,z:-1180}},{id:'station_veil',pos:{x:20,z:40}},null],
      fields:[{center:{x:680,z:-420}}],neighbors:['other'],pois:[{id:'wreck',type:'wreck',pos:{x:1400,z:900}}]};
    assert.deepEqual(after(sector,palette,seed),before(sector,palette,seed));
    assert.equal(a.n,b.n);
  }
});
