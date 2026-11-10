#!/usr/bin/env node
/** Candidate-only acceptance gate for M4-ASHLINE-SOURCE-FAMILY-V2-001. */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  validateAshlineEvidenceEpoch,
} from '../tools/art/lib/ashlineEvidenceEpoch.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FAMILY = resolve(ROOT, 'assets/ships/m4_ashline_v2');
const THIRD = resolve(FAMILY, 'source/reference/quaternius_ultimate_spaceships');
const PACKET = 'M4-ASHLINE-SOURCE-FAMILY-V2-001';
const LIMIT_100MB = 100 * 1024 * 1024;
const SHIPS = [
  { key: 'dart', id: 'ashline_v2_dart', role: 'flyby_interceptor' },
  { key: 'lode', id: 'ashline_v2_lode', role: 'heavy_brawler' },
  { key: 'rig', id: 'ashline_v2_rig', role: 'tether_control_raider' },
];
const REQUIRED_SOCKETS = [
  'SOCKET_Weapon_Front', 'SOCKET_Mining_Front', 'SOCKET_Engine_Main',
  'SOCKET_Trail_Main', 'SOCKET_Utility_Dorsal', 'SOCKET_Cargo_Ventral',
  'SOCKET_Camera_Focus', 'SOCKET_RCS_Port', 'SOCKET_RCS_Starboard',
];
const REQUIRED_RENDERS = [
  'forward_34.png', 'rear_34.png', 'top_ortho.png', 'side_ortho.png',
  'readability_close.png', 'readability_under45px.png', 'readability_120px.png',
  'silhouette_gray_45px.png', 'silhouette_gray_120px.png', 'gamesky_forward_34.png',
];

let errors = 0;
let warnings = 0;
const ok = (m) => console.log(`ok - ${m}`);
const fail = (m) => { errors++; console.error(`FAIL - ${m}`); };
const warn = (m) => { warnings++; console.warn(`WARN - ${m}`); };

function need(path, label = path) {
  if (!existsSync(path)) { fail(`missing ${label}`); return false; }
  if (statSync(path).isFile() && statSync(path).size === 0) { fail(`empty ${label}`); return false; }
  return true;
}
function json(path) { return JSON.parse(readFileSync(path, 'utf8')); }

function glbJson(path) {
  const b = readFileSync(path);
  if (b.toString('utf8', 0, 4) !== 'glTF') throw new Error(`not GLB: ${path}`);
  const len = b.readUInt32LE(12);
  return JSON.parse(b.toString('utf8', 20, 20 + len).replace(/\0+$/g, '').trim());
}

const provenancePath = resolve(THIRD, 'FULL_TREE_PROVENANCE.json');
const receiptPath = resolve(FAMILY, 'SOURCE_ADAPTATION.json');
if (need(provenancePath, 'official-source provenance')) {
  const p = json(provenancePath);
  const text = JSON.stringify(p).toLowerCase();
  text.includes('cc0') ? ok('source provenance records CC0') : fail('source provenance does not record CC0');
  text.includes('quaternius.com/packs/ultimatespaceships')
    ? ok('source provenance records official pack page') : fail('official pack page absent from provenance');
}
if (need(resolve(THIRD, 'License.txt'), 'upstream License.txt')) ok('upstream license preserved');
if (need(resolve(THIRD, 'LICENSE_CC0-1.0-LEGALCODE.txt'), 'CC0 legalcode snapshot')) ok('CC0 snapshot preserved');
if (need(receiptPath, 'source adaptation receipt')) {
  const receipt = json(receiptPath);
  receipt.packet === PACKET ? ok('packet receipt exact') : fail(`packet receipt mismatch ${receipt.packet}`);
  receipt.isolation?.runtimePromotion === false ? ok('candidate remains unwired') : fail('receipt claims runtime promotion');
  const donors = Object.values(receipt.ships || {}).map((x) => x.donor);
  new Set(donors).size === 3 ? ok('three distinct coherent-pack donors') : fail(`donor diversity ${donors}`);
  for (const donor of donors) need(resolve(ROOT, donor), `donor ${donor}`);
}

for (const ship of SHIPS) {
  const base = resolve(FAMILY, 'evidence', ship.key);
  const blend = resolve(FAMILY, 'blender', `${ship.id}_production.blend`);
  const source = resolve(FAMILY, 'source/wholeships', `${ship.id}.glb`);
  const candidate = resolve(FAMILY, 'release_candidates/wholeships', `${ship.id}.glb`);
  const metricsPath = resolve(base, 'production_metrics.json');
  const summaryPath = resolve(base, 'build_summary.json');
  for (const [path, label] of [[blend, `${ship.key} blend`], [source, `${ship.key} source GLB`],
    [candidate, `${ship.key} candidate GLB`], [metricsPath, `${ship.key} metrics`],
    [summaryPath, `${ship.key} summary`]]) need(path, label);
  if (![blend, source, candidate, metricsPath, summaryPath].every(existsSync)) continue;
  if (statSync(candidate).size >= LIMIT_100MB) fail(`${ship.key} candidate exceeds GitHub 100MB`);
  else ok(`${ship.key} candidate ${(statSync(candidate).size / 1048576).toFixed(2)} MiB`);

  const summary = json(summaryPath);
  const lod = summary.lodTriangles || {};
  lod.lod0 > lod.lod1 && lod.lod1 > lod.lod2 && lod.lod2 > 0
    ? ok(`${ship.key} true LOD monotonicity ${lod.lod0}/${lod.lod1}/${lod.lod2}`)
    : fail(`${ship.key} invalid LODs ${JSON.stringify(lod)}`);
  summary.sockets?.length === 9 && REQUIRED_SOCKETS.every((s) => summary.sockets.includes(s))
    ? ok(`${ship.key} exact nine-socket contract`) : fail(`${ship.key} socket contract ${summary.sockets}`);
  summary.collisionBounds?.size?.every((v) => v > 0)
    ? ok(`${ship.key} measurable collision`) : fail(`${ship.key} collision missing`);
  const dims = summary.lod0AabbSize || [];
  dims[0] > dims[1] && dims[0] > dims[2]
    ? ok(`${ship.key} +X is dominant length axis`) : fail(`${ship.key} +X length dominance ${JSON.stringify(dims)}`);

  let gltf;
  try { gltf = glbJson(candidate); } catch (e) { fail(e.message); continue; }
  const used = gltf.extensionsUsed || [];
  used.includes('EXT_meshopt_compression') ? ok(`${ship.key} Meshopt`) : fail(`${ship.key} missing Meshopt`);
  used.includes('KHR_texture_basisu') ? ok(`${ship.key} KTX2`) : fail(`${ship.key} missing KTX2`);
  const nodeNames = (gltf.nodes || []).map((n) => n.name);
  REQUIRED_SOCKETS.every((s) => nodeNames.includes(s))
    ? ok(`${ship.key} exported sockets`) : fail(`${ship.key} GLB missing socket node`);
  const collisionNodes = nodeNames.filter((n) => n === 'COLLISION_HULL' || n?.startsWith('COLLISION_HULL_'));
  collisionNodes.length >= 3
    ? ok(`${ship.key} compound collision ${collisionNodes.length} helpers`)
    : fail(`${ship.key} compound collision requires >=3 helpers, found ${collisionNodes.length}`);
  nodeNames.some((n) => /plume|flame/i.test(n || ''))
    ? fail(`${ship.key} contains baked plume/flame`) : ok(`${ship.key} has no baked plume`);

  for (const render of REQUIRED_RENDERS) {
    need(resolve(base, 'renders', render), `${ship.key}/historical/${render}`);
  }
}

const familyMetricsPath = resolve(FAMILY, 'evidence/family/family_metrics.json');
const finalizePath = resolve(FAMILY, 'evidence/family/finalize_report.json');
if (need(familyMetricsPath, 'family metrics')) {
  const family = json(familyMetricsPath);
  family.ships?.length === 3 ? ok('family metrics cover three ships') : fail('family metrics incomplete');
}
if (need(finalizePath, 'finalize report')) {
  const report = json(finalizePath);
  report.finalized?.length === 3 ? ok('finalizer covers three ships') : fail('finalize report incomplete');
  report.isolation?.defaultPlayWired === false ? ok('finalizer confirms no live wiring') : fail('finalizer isolation mismatch');
  const epoch = await validateAshlineEvidenceEpoch(report.evidenceEpoch, { root: ROOT });
  if (epoch.pass) {
    ok(`evidence epoch ${epoch.epochDigest}`);
  } else {
    for (const failure of epoch.failures) fail(`evidence epoch ${failure}`);
  }
  if (report.evidenceEpoch?.currentAcceptance?.visualEvidenceEligible === false
      && report.evidenceEpoch?.currentAcceptance?.requiresCurrentRender === true) {
    warn('current exact-source visual evidence remains open; historical renders are ineligible');
  }
}

// Historical contacts remain preservation records only. A current versioned exact-source renderer
// must bind new artifacts into evidenceEpoch before they can close a visual gate.
if (!existsSync(resolve(FAMILY, 'evidence/family/lod_transition_contact.png'))) {
  warn('lod_transition_contact.png not produced in the single author macro-cycle');
}

console.error(`\ncheck-m4-ashline-v2: ${errors ? 'FAIL' : 'PASS'} (${errors} errors, ${warnings} warnings)`);
process.exitCode = errors ? 1 : 0;
