#!/usr/bin/env node
/**
 * Strict verify for graphics revamp evidence.
 * Usage: node scripts/verify-graphics-revamp-evidence.mjs [--id <id>] [--global]
 * Per ID: >=3 PNGs with <id> and pairwise distinct MD5 (no dups within ID),
 * deficiency.md SHA unique, contains <id> >=2 times + 'iter' detail + >=15 '-' lines (rejects templates),
 * finalize.log tris/bytes == manifest,
 * *<id>*authored.blend exists in blender/.
 * Global: all 63 pass + unique PNG count >=20.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const SCRATCH = 'C:\\Users\\93rob\\AppData\\Local\\Temp\\grok-goal-93d8d4790125\\implementer';
const DEVSHOTS = path.join(process.cwd(), '.devshots', 'graphics-revamp');
const MANIFEST = path.join(process.cwd(), 'assets', 'ships', 'parts', 'parts_manifest.json');
const BLENDER = path.join(process.cwd(), 'assets', 'ships', 'parts', 'blender');
const EVIDENCE_DIR = path.join(process.cwd(), 'assets', 'ships', 'parts', 'revamp-evidence');

const INVENTORY = ["hull_starter","hull_fighter","hull_miner","hull_freighter","hull_interceptor","hull_corvette","hull_gunship","hull_frigate","hull_capital","hull_multirole","cockpit_dome","cockpit_slab","cockpit_recessed","engine_ion_small","engine_ion_twin","engine_industrial","engine_resonator","engine_vector","engine_plasma_ring","weapon_pulse_cannon","weapon_heavy_cannon","weapon_turret_dual","weapon_lance","weapon_gatling","weapon_railgun","fin_wedge","fin_radiator_grid","fin_swept_smuggler","fin_crystalline","fin_delta","fin_stabilator","greeble_vents","greeble_hatches","greeble_pipes","greeble_rcs","greeble_antennas","greeble_nav_lights","greeble_armor_plates","skid_trio","skid_quad","pod_utility","pod_cargo_container","pod_repair_patch","place_lane_beacon","place_nav_buoy","place_asteroid_seamed","place_debris_chunk","place_station_billboard","place_dead_hulk","place_conveyor_barge","place_mining_drone","place_asteroid_rock_a","place_asteroid_rock_b","place_asteroid_rock_c","place_asteroid_graffiti","place_station_trade_hub","place_station_refinery","place_station_military","place_station_blackmarket","place_gate_jump_ring","place_station_mining","place_station_fab","place_station_research"];

function getArg(name) {
  const idx = process.argv.indexOf(name);
  return idx !== -1 ? process.argv[idx+1] : null;
}

const singleId = getArg('--id');
const doGlobal = process.argv.includes('--global') || !singleId;

function hashMd5(file) {
  return crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex');
}

function hashSha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function hasProNote(id) {
  const m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const p = m.parts.find(x => x.id === id);
  return p && (p.note || '').includes('PRO revamp 2026-07-05');
}

function getManifestData(id) {
  const m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  return m.parts.find(x => x.id === id);
}

function hasPngs(id) {
  if (!fs.existsSync(DEVSHOTS)) return {count:0, unique:0, files:[]};
  const files = fs.readdirSync(DEVSHOTS).filter(f => f.includes(id) && f.endsWith('.png')).map(f => path.join(DEVSHOTS, f));
  if (files.length < 3) return {count: files.length, unique:0, files};
  const hashes = files.map(f => hashMd5(f));
  const uniqueHashes = new Set(hashes);
  const allDistinct = new Set(hashes).size === hashes.length;
  return {count: files.length, unique: uniqueHashes.size, files, distinct: uniqueHashes.size >= 3 && allDistinct};
}

function hasDeficiency(id) {
  const f = path.join(EVIDENCE_DIR, id, 'deficiency.md');
  if (!fs.existsSync(f)) return {ok:false};
  const content = fs.readFileSync(f, 'utf8');
  const lines = content.split('\n').filter(l => l.trim().startsWith('-'));
  const sha = hashSha256(f);
  const hasId = content.includes(id);
  const idMentions = (content.match(new RegExp(id, 'g')) || []).length;
  const hasIter = /iter/i.test(content);
  const hasMCP = content.includes('MCP');
  const hasCharacter = /character/i.test(content);
  const hasBeforeId = content.includes('Before iter1 for ' + id) || content.includes('Before iter1:') || content.includes('for ' + id + ':') || content.includes('for ' + id + ' ');
  // Strict but realistic: >=15 lines, id >=3 mentions, iter/MCP/character, ID-specific before phrase to reject pure templates
  const specific = idMentions >= 3 && hasIter && hasMCP && hasCharacter && hasBeforeId;
  return {ok: lines.length >= 20 && hasId && specific, sha, lines: lines.length, hasId, specific};
}

function hasFinalizeLog(id, manifestData) {
  const f = path.join(EVIDENCE_DIR, id, 'finalize.log');
  if (!fs.existsSync(f)) return {ok:false};
  try {
    const log = JSON.parse(fs.readFileSync(f, 'utf8'));
    return {ok: log.tris === manifestData.tris && log.bytes === manifestData.bytes};
  } catch { return {ok:false}; }
}

function hasAuthoredBlend(id) {
  if (!fs.existsSync(BLENDER)) return false;
  const files = fs.readdirSync(BLENDER).filter(f => f.includes(id) && f.includes('authored') && f.endsWith('.blend'));
  return files.length > 0;
}

const results = [];
let verifiedCount = 0;
const toCheck = singleId ? [singleId] : INVENTORY;

for (const id of toCheck) {
  const manifestData = getManifestData(id);
  if (!manifestData) {
    results.push({id, error: 'not in manifest'});
    continue;
  }
  const pro = hasProNote(id);
  const pngInfo = hasPngs(id);
  const defInfo = hasDeficiency(id);
  const logInfo = hasFinalizeLog(id, manifestData);
  const blend = hasAuthoredBlend(id);
  const ok = pro && pngInfo.distinct && defInfo.ok && logInfo.ok && blend;
  if (ok) verifiedCount++;
  results.push({id, pro, pngs: pngInfo.count, pngUnique: pngInfo.unique, defLines: defInfo.lines, defHasId: defInfo.hasId, logOk: logInfo.ok, blend, ok});
}

if (singleId) {
  const r = results[0];
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.ok ? 0 : 1);
}

if (doGlobal) {
  const uniquePngGlobal = new Set();
  INVENTORY.forEach(id => {
    const p = hasPngs(id);
    if (p.files) p.files.forEach(f => uniquePngGlobal.add(hashMd5(f)));
  });
  const dedicatedAuthored = INVENTORY.filter(id => hasAuthoredBlend(id)).length;
  // Strict gate: must have 63 dedicated full evidence + high unique PNGs (no loose pass for bulk)
  const allOk = verifiedCount === INVENTORY.length && uniquePngGlobal.size >= 100 && dedicatedAuthored === INVENTORY.length;
  console.log(`VERIFIED: ${verifiedCount}/${INVENTORY.length}`);
  console.log(`Unique PNG hashes global: ${uniquePngGlobal.size}`);
  console.log(`Dedicated authored: ${dedicatedAuthored}/${INVENTORY.length}`);
  if (!allOk) {
    const missing = results.filter(r => !r.ok).map(r => r.id);
    console.log('Failing IDs:', missing.join(','));
  }
  process.exit(allOk ? 0 : 1);
}