import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Quaternion } from 'three';
import { fitLegacyModularMounts } from '../src/render/modularLegacyMountPlacement.js';
import { fitLegacyMultiroleCockpit } from '../src/render/modularMultiroleCockpitPlacement.js';
import { fitLegacyMultiroleFins } from '../src/render/modularMultiroleFinPlacement.js';
import { handedFinPlacement } from '../src/render/modularFinHandedness.js';

const root = new URL('../', import.meta.url);
const json = path => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const finSpec = {
  wedge: ['SF_FIN_WEDGE', 'fin-wedge', 'fin_wedge'],
  delta: ['SF_FIN_DELTA', 'fin-delta', 'fin_delta'],
  swept: ['SF_PART_FIN_SWEPT_SMUGGLER', 'fin-swept-smuggler', 'fin_swept_smuggler'],
  radiator: ['SF_FIN_RADIATOR_GRID', 'fin-radiator-grid', 'fin_radiator_grid'],
  crystalline: ['SF_FIN_CRYSTALLINE', 'fin-crystalline', 'fin_crystalline'],
  stabilator: ['SF_FIN_STABILATOR', 'fin-stabilator', 'fin_stabilator'],
};

function packageRecord(assetId, slot, stem, packageName) {
  const meta = json(`assets/ships/release/render-packages/${packageName}/render-package.json`);
  return { assetId, url: `assets/ships/release/parts/${slot}/${stem}.glb`,
    renderPackage: { contentHash: meta.contentHash } };
}

function fixture(hullName, finName) {
  const hullMeta = json(`assets/ships/release/render-packages/hull-${hullName}/render-package.json`);
  const bytes = readFileSync(new URL(`assets/ships/release/parts/hulls/hull_${hullName}.glb`, root));
  const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
  const normal = 1.72 / hullMeta.runtime.bounds.size[0];
  const mount = node => ({
    position: node.translation.map(n => n * normal),
    quaternion: new Quaternion().fromArray(node.rotation || [0, 0, 0, 1]),
    mountScale: node.scale || [1, 1, 1],
    mountKey: node.name,
    targetLength: 0.58,
  });
  const byName = prefix => gltf.nodes.filter(n => n.name?.startsWith(prefix)).map(mount);
  const [finId, finPackage, finStem] = finSpec[finName];
  return {
    hull: packageRecord(`SF_HULL_${hullName.toUpperCase()}`, 'hulls', `hull_${hullName}`, `hull-${hullName}`),
    // The candidate remains staged; its publication-specific content hash is intentional.
    cockpit: { assetId: 'SF_COCKPIT_RECESSED', metadata: { spacefaceCockpitDesign: 'recessed-v5' },
      renderPackage: { contentHash: 'bb174bbc411f41e30fbc65a13171284006d475476dac0a6e6b826fcc9105e461' } },
    engine: packageRecord('SF_ENGINE_ION_SMALL', 'engines', 'engine_ion_small', 'engine-ion-small'),
    fin: packageRecord(finId, 'fins', finStem, finPackage),
    placements: { cockpit: byName('MOUNT_COCKPIT')[0], engines: byName('MOUNT_ENGINE_'), fins: byName('MOUNT_FIN_') },
  };
}
const apply = f => fitLegacyModularMounts(f.hull, f.cockpit, f.engine, f.fin, f.placements);
const key = p => p.mountKey.replace(/^MOUNT_/, '').toLowerCase();

test('actual released legacy marker pairs yield one complete provisional V5 assembly', () => {
  const cases = [
    ['multirole', 'wedge', 0.2520811811864766, 0.15],
    ['multirole', 'delta', 0.2520811811864766, 0.15],
    ['multirole', 'swept', 0.2520811811864766, 0.15],
    ['starter', 'wedge', 0.138031, 0.20],
    ['starter', 'delta', 0.138031, 0.20],
    ['starter', 'swept', 0.138031, 0.20],
    ['frigate', 'wedge', 0.232278, 0.12],
    ['frigate', 'delta', 0.232278, 0.12],
    ['frigate', 'swept', 0.232278, 0.12],
  ];
  for (const [hullName, finName, seatY, finZ] of cases) {
    const f = fixture(hullName, finName), before = JSON.stringify(f.placements);
    const fitted = apply(f);
    assert.notEqual(fitted, f.placements, `${hullName}/${finName} matches`);
    assert.equal(fitted.cockpit.position[0], f.placements.cockpit.position[0]);
    assert.equal(fitted.cockpit.position[1], seatY);
    assert.equal(fitted.cockpit.position[2], 0);
    for (const [key, pair, spacing] of [['engine', fitted.engines, 0.20], ['fin', fitted.fins, finZ]]) {
      const left = pair.find(p => p.mountKey.toLowerCase().endsWith(`${key}_l`)), right = pair.find(p => p.mountKey.toLowerCase().endsWith(`${key}_r`));
      assert.equal(left.position[2], -spacing);
      assert.equal(right.position[2], spacing);
      assert.equal(left.position[0], f.placements[`${key}s`].find(p => p.mountKey.toLowerCase().endsWith(`${key}_l`)).position[0]);
    }
    const port = fitted.fins.find(p => key(p) === 'fin_l');
    const starboard = fitted.fins.find(p => key(p) === 'fin_r');
    assert.equal(handedFinPlacement(f.fin, port).mirrorFinZ, true);
    assert.equal(handedFinPlacement(f.fin, starboard), starboard);
    assert.equal(JSON.stringify(f.placements), before, 'original mounts are not mutated');
    assert.equal(fitLegacyModularMounts(f.hull, f.cockpit, f.engine, f.fin, fitted), fitted, 'no double fitting');
  }
});

test('multirole/swept keeps the previously accepted cockpit and fin transforms', () => {
  const f = fixture('multirole', 'swept'), fitted = apply(f);
  const existingFins = fitLegacyMultiroleFins(f.hull, f.cockpit, f.fin, f.placements.fins);
  const existingCockpit = fitLegacyMultiroleCockpit(f.hull, f.cockpit, f.fin, f.placements.cockpit, () => f.placements.fins);
  assert.deepEqual(fitted.fins, existingFins);
  assert.deepEqual(fitted.cockpit, existingCockpit);
});

test('lowercase marker keys with matching packaged records receive the same fit', () => {
  const f = fixture('starter', 'wedge');
  for (const p of [f.placements.cockpit, ...f.placements.engines, ...f.placements.fins]) p.mountKey = key(p);
  assert.notEqual(apply(f), f.placements);
});

test('changed packages, old metadata, asymmetric markers and unreviewed fin pairings stay unchanged', () => {
  const mutations = [
    f => { f.hull.renderPackage.contentHash = 'modified'; },
    f => { delete f.hull.renderPackage; },
    f => { f.hull.url = 'mods/hulls/hull_starter.glb'; },
    f => { f.cockpit.metadata.spacefaceCockpitDesign = 'old'; },
    f => { f.cockpit.renderPackage.contentHash = 'modified'; },
    f => { f.engine.renderPackage.contentHash = 'modified'; },
    f => { f.fin.renderPackage.contentHash = 'modified'; },
    f => { f.placements.cockpit.position[2] += 0.01; },
    f => { f.placements.fins[0].position[2] += 0.01; },
    f => { f.placements.engines[0].quaternion.set(0, 0.1, 0, 1); },
    f => { f.placements.engines[0].mountScale = [1, 2, 1]; },
    f => { f.placements.engines[1].mountKey = f.placements.engines[0].mountKey; },
    f => { f.placements.fins.pop(); },
    f => { delete f.placements.cockpit.mountKey; },
  ];
  for (const mutate of mutations) {
    const f = fixture('starter', 'wedge'); mutate(f);
    assert.equal(apply(f), f.placements);
  }
  const bilateral = fixture('capital', 'stabilator');
  assert.equal(apply(bilateral), bilateral.placements, 'bilateral stabilator needs its own fit');
  for (const fin of ['radiator', 'crystalline']) {
    const detached = fixture('capital', fin);
    assert.equal(apply(detached), detached.placements, 'capital wings remain unsupported');
  }
  const otherFamily = fixture('starter', 'radiator');
  assert.equal(apply(otherFamily), otherFamily.placements);
});
