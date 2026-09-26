import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { liveSolidGlbCatalog } from '../src/render/partsLibrary.js';

const ROOT = resolve(import.meta.dirname, '..');
const EFFECT = /glow|gas|shield|particle|plume|thruster|beacon|emissive|lamp|flare|vfx|exhaust|corona|halo|light/i;
const GLASS = /glass|canopy|window|cockpit|visor/i;

function parseJson(buffer) {
  const length = buffer.readUInt32LE(12);
  return JSON.parse(buffer.subarray(20, 20 + length).toString('utf8').replace(/\0+$/, ''));
}

function classify(material) {
  const name = String(material.name || '');
  const alpha = String(material.alphaMode || 'OPAQUE');
  const transmission = Number(material.extensions?.KHR_materials_transmission?.transmissionFactor || 0);
  const emissive = material.emissiveFactor || [0, 0, 0];
  const emissiveMag = Math.max(emissive[0] || 0, emissive[1] || 0, emissive[2] || 0);
  const base = material.pbrMetallicRoughness?.baseColorFactor || [1, 1, 1, 1];
  const seeThrough = alpha === 'BLEND' || alpha === 'MASK' || transmission > 0.05 || (base[3] != null && base[3] < 0.98);
  const glass = transmission > 0.05 || (seeThrough && GLASS.test(name) && emissiveMag < 0.45);
  const effect = EFFECT.test(name) || (seeThrough && emissiveMag > 0.45 && !glass);
  const additive = seeThrough && emissiveMag > 0.45;
  const depthWrite = alpha === 'OPAQUE' && transmission <= 0.05;
  return {
    name,
    opaqueHull: !seeThrough && !glass && !effect,
    glass,
    effect,
    seeThrough,
    additive,
    depthWrite,
    doubleSided: material.doubleSided === true,
  };
}

test('loaded opaque hull materials are front-sided', () => {
  const files = new Map();
  for (const row of liveSolidGlbCatalog()) {
    if (!row.file) continue;
    const rel = String(row.file).replace(/\\/g, '/').replace(/^assets\/ships\/release\/parts\//, '');
    files.set(rel, row.frozenMesh === true || /kestrel/i.test(rel));
  }
  const failures = [];
  let checked = 0;
  for (const [rel, frozen] of files) {
    if (frozen) continue;
    const abs = resolve(ROOT, 'assets/ships/release/parts', rel);
    let gltf;
    try {
      gltf = parseJson(readFileSync(abs));
    } catch {
      continue;
    }
    checked += 1;
    for (const material of gltf.materials || []) {
      const kind = classify(material);
      if (kind.opaqueHull && (kind.doubleSided || kind.additive || !kind.depthWrite)) {
        failures.push(`${rel} ${kind.name} sided=${kind.doubleSided} add=${kind.additive} depth=${kind.depthWrite}`);
      }
      if (kind.seeThrough && !kind.glass && !kind.effect) {
        failures.push(`${rel} ${kind.name} see-through is not glass`);
      }
      if ((kind.additive || !kind.depthWrite) && !kind.effect && !kind.glass) {
        failures.push(`${rel} ${kind.name} additive or depth-fail is not on the effect list`);
      }
    }
  }
  assert.ok(checked > 20, `checked ${checked}`);
  assert.deepEqual(failures, []);
});
