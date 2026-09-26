// Walk every live solid's loaded material. Census role names are not evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';

import { liveSolidGlbCatalog } from '../src/render/partsLibrary.js';

const ROOT = resolve(import.meta.dirname, '..');

// Glows, gas, shields, particles, glass, and exhaust. Anything else that is
// double-sided, additive, or missing depth write is a hull failure.
const EFFECT_OR_GLASS = new Set([
  'Material_Thruster',
  'Material_Canopy',
  'Material_Glass',
  'KitMat_Emissive',
  'MAT_SF_Massline_Glazing_SmokedSafety',
  'Material_Emissive_Warm_RemasterRecess',
  'Material_Emissive_ColdEmergency',
  'Material_Emissive_MarkerAmber',
]);
const EFFECT_PREFIXES = ['esk_light_'];
const GLASS_NAMES = new Set([
  'Material_Canopy',
  'Material_Glass',
  'MAT_SF_Massline_Glazing_SmokedSafety',
]);

function parseGlbJson(buffer) {
  if (buffer.readUInt32LE(0) !== 0x46546c67) throw new Error('not a glb');
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (type === 0x4e4f534a) {
      return JSON.parse(buffer.subarray(start, start + length).toString('utf8').replace(/\0+$/, ''));
    }
    offset = start + length;
  }
  throw new Error('no json chunk');
}

function resolveGlb(rel) {
  const normalized = String(rel).replace(/\\/g, '/');
  const stripped = normalized.replace(/^assets\/ships\/release\/parts\//, '');
  const candidates = [
    resolve(ROOT, 'assets/ships/release/parts', stripped),
    resolve(ROOT, normalized),
  ];
  for (const candidate of candidates) {
    try {
      return readFileSync(candidate);
    } catch { /* next path */ }
  }
  return null;
}

function onEffectList(name) {
  if (EFFECT_OR_GLASS.has(name)) return true;
  return EFFECT_PREFIXES.some((prefix) => name.startsWith(prefix));
}

// The same fields GLTFLoader turns into a drawable material: side, transparency, depth write.
function loadMaterial(def) {
  const alpha = String(def.alphaMode || 'OPAQUE');
  const transmission = Number(def.extensions?.KHR_materials_transmission?.transmissionFactor || 0);
  const base = def.pbrMetallicRoughness?.baseColorFactor || [1, 1, 1, 1];
  const extrasDepth = def.extras && Object.prototype.hasOwnProperty.call(def.extras, 'depthWrite')
    ? def.extras.depthWrite !== false
    : null;
  const material = new THREE.MeshStandardMaterial();
  material.name = String(def.name || '');
  material.side = def.doubleSided === true ? THREE.DoubleSide : THREE.FrontSide;
  material.transparent = alpha === 'BLEND' || alpha === 'MASK' || transmission > 0.05 || (base[3] != null && base[3] < 0.98);
  material.depthWrite = extrasDepth != null ? extrasDepth : !material.transparent;
  material.userData = {
    alpha,
    transmission,
    glass: transmission > 0.05 || GLASS_NAMES.has(material.name),
    effect: onEffectList(material.name),
  };
  if (material.userData.glass) material.userData.effect = false;
  return material;
}

test('loaded opaque hull materials are front-sided', () => {
  const files = new Map();
  for (const row of liveSolidGlbCatalog()) {
    if (!row.file || row.solid === false) continue;
    const rel = String(row.file).replace(/\\/g, '/');
    files.set(rel, row.frozenMesh === true || /kestrel/i.test(rel));
  }
  const failures = [];
  let checked = 0;
  let materials = 0;
  let hulls = 0;
  let effects = 0;
  for (const [rel, frozen] of files) {
    if (frozen) continue;
    const buffer = resolveGlb(rel);
    if (!buffer) {
      failures.push(`${rel} missing glb`);
      continue;
    }
    const gltf = parseGlbJson(buffer);
    checked += 1;
    for (const def of gltf.materials || []) {
      const material = loadMaterial(def);
      materials += 1;
      const doubleSided = material.side === THREE.DoubleSide;
      const listed = material.userData.effect || material.userData.glass;
      if (listed) {
        effects += 1;
        continue;
      }
      hulls += 1;
      if (doubleSided || material.transparent || material.depthWrite === false) {
        failures.push(`${rel} ${material.name} sided=${doubleSided} transparent=${material.transparent} depth=${material.depthWrite}`);
      }
    }
  }
  console.log(`[model-truth] materials checked=${checked} loaded=${materials} hulls=${hulls} effectOrGlass=${effects} failures=${failures.length}`);
  assert.ok(checked > 20, `checked ${checked}`);
  assert.ok(hulls > 20, `hull materials ${hulls}`);
  assert.deepEqual(failures, []);
});
