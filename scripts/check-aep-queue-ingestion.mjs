#!/usr/bin/env node
/**
 * AEP §3 queue-ingestion verification (chunk F3).
 *
 * Re-runs the spec's ingest rule for every item in ASSET_EXPERIENCE_PROGRAM §3:
 * each item carries {source file, item id(s), manifest row, on-disk path,
 * lifecycle status} verified by a named command — this script is that command.
 *
 * Emits the machine-checkable item table later chunks diff against:
 *   design/program/asset-experience-program/QUEUE_INGESTION_VERIFICATION.json
 *   design/program/asset-experience-program/QUEUE_INGESTION_VERIFICATION.md
 *
 * Modes:
 *   (default)   verify every item and print the table + failures (exit 1 on fail)
 *   --check     same, plus fail if the committed artifacts differ from fresh output
 *   --write     regenerate the two artifacts
 *
 * Reviewers re-run `npm run check:aep-queue-ingestion` before approving a chunk
 * (spec §4.0 / §6). Chunk agents run `--write` after their ingest changes the
 * observed truth (e.g. a commission gains a manifest row or GLB bytes).
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => resolve(ROOT, p);
const SPEC_PATH = 'design/program/asset-experience-program/ASSET_EXPERIENCE_PROGRAM.md';
const AUDIT_PATH = 'design/world-identity/WORLD_PLACEMENT_AUDIT.md';
const AF_PATH = 'design/program/world-depth-2026-10-02/ASSET_FAMILIES.md';
const OUT_JSON = 'design/program/asset-experience-program/QUEUE_INGESTION_VERIFICATION.json';
const OUT_MD = 'design/program/asset-experience-program/QUEUE_INGESTION_VERIFICATION.md';
const PARTS_DIR = 'assets/ships/parts';

const txtCache = new Map();
function txt(p) {
  if (!txtCache.has(p)) {
    try { txtCache.set(p, readFileSync(R(p), 'utf8')); }
    catch { txtCache.set(p, null); }
  }
  return txtCache.get(p);
}

const manifest = JSON.parse(txt(`${PARTS_DIR}/parts_manifest.json`));
const MAN = new Map((manifest.parts || []).map((p) => [p.id, p]));
const ledger = JSON.parse(txt('assets/ASSET_STATUS.json'));
const LEDGER = ledger.assets || {};

const TEXTS = {
  queue: 'assets/QUEUE.md',
  needed: 'needed-assets.md',
  spec: SPEC_PATH,
  audit: AUDIT_PATH,
  af: AF_PATH,
  otc: 'src/data/occupationalTrafficCraft.js',
  alien: 'src/data/alienEcology.js',
  envmach: 'src/data/environmentalMachinery.js',
  contacts: 'src/data/laneContacts.js',
  aces: 'src/data/namedAces.js',
  fauna: 'src/render/faunaVisuals.js',
  machines: 'src/render/machineVisuals.js',
};
const frontierTxt = ['west', 'north', 'east', 'south']
  .map((w) => txt(`src/data/frontierRegions/${w}.js`) || '')
  .join('\n') + '\n' + (txt('src/data/sectors.js') || '');

function* walk(dir) {
  let entries = [];
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}
const partsBasenames = new Set([...walk(R(PARTS_DIR))].map((p) => basename(p)));

// --- check kinds -------------------------------------------------------------
// Each check is a thunk returning {check, expect, observed, pass}.
const ck = (check, expect, observed, pass) => ({ check, expect, observed, pass: pass !== false });
const exists = (p) => () => { const e = existsSync(R(p)); return ck(`exists ${p}`, 'present', e ? 'present' : 'absent', e); };
const dirExists = (p) => () => { let e = false; try { e = statSync(R(p)).isDirectory(); } catch {} return ck(`dir ${p}`, 'present', e ? 'present' : 'absent', e); };
const absent = (p) => () => { const e = existsSync(R(p)); return ck(`absent ${p}`, 'absent', e ? 'present' : 'absent', !e); };
const manRow = (id, opts = {}) => () => {
  const r = MAN.get(id);
  if (!r) return ck(`manifest ${id}`, 'row present', 'absent', false);
  const obs = [`status:${r.status || '(none)'}`, `file:${r.file || '(none)'}`];
  let pass = true;
  if (opts.status) pass = r.status === opts.status;
  if (opts.noStatus) pass = !('status' in r);
  return ck(`manifest ${id}`, opts.status ? `status=${opts.status}` : opts.noStatus ? 'no status field' : 'row present', obs.join(' '), pass);
};
const manFile = (id) => () => {
  const r = MAN.get(id);
  if (!r) return ck(`manifest+GLB ${id}`, 'row + GLB on disk', 'no manifest row', false);
  const f = r.file ? existsSync(R(`${PARTS_DIR}/${r.file}`)) : false;
  return ck(`manifest+GLB ${id}`, 'row + GLB on disk', `${r.file || '(no file)'} ${f ? 'on disk' : 'MISSING'}`, Boolean(r.file) && f);
};
const noMan = (id) => () => ck(`no manifest ${id}`, 'absent', MAN.has(id) ? 'present' : 'absent', !MAN.has(id));
const ledgerRow = (id, lifecycle) => () => {
  const r = LEDGER[id];
  if (!r) return ck(`ledger ${id}`, 'row present', 'absent', false);
  const ok = lifecycle ? r.lifecycle === lifecycle : true;
  return ck(`ledger ${id}`, lifecycle ? `lifecycle=${lifecycle}` : 'row present', `lifecycle:${r.lifecycle || '(none)'}`, ok);
};
const hasIn = (tag, needle) => () => {
  const s = TEXTS[tag] ? txt(TEXTS[tag]) : null;
  const hit = s ? s.includes(needle) : false;
  return ck(`${TEXTS[tag] || tag} contains "${needle}"`, 'present', hit ? 'present' : (s === null ? 'file missing' : 'absent'), hit);
};
const hasFile = (p, needle) => () => {
  const s = txt(p);
  const hit = s ? s.includes(needle) : false;
  return ck(`${p} contains "${needle}"`, 'present', hit ? 'present' : (s === null ? 'file missing' : 'absent'), hit);
};
const hasAny = (paths, needle) => () => {
  const hit = paths.some((p) => (txt(p) || '').includes(needle));
  return ck(`one of ${paths.length} files contains "${needle}"`, 'present', hit ? 'present' : 'absent', hit);
};
const hasFrontier = (needle) => () => ck(`frontier sectors contain "${needle}"`, 'present', frontierTxt.includes(needle) ? 'present' : 'absent', frontierTxt.includes(needle));
const countRe = (p, reStr, opts = {}) => () => {
  const s = txt(p);
  const n = s ? (s.match(new RegExp(reStr, 'g')) || []).length : 0;
  const pass = opts.min != null ? n >= opts.min : true;
  return ck(`${p} /${reStr}/`, opts.min != null ? `>= ${opts.min}` : 'recorded', String(n), pass);
};
const countReIn = (tag, reStr, opts = {}) => () => {
  const s = txt(TEXTS[tag]);
  const n = s ? (s.match(new RegExp(reStr, 'g')) || []).length : 0;
  const pass = opts.min != null ? n >= opts.min : true;
  return ck(`${TEXTS[tag]} /${reStr}/`, opts.min != null ? `>= ${opts.min}` : 'recorded', String(n), pass);
};
const partsAbsent = (substr) => () => {
  const hits = [...partsBasenames].filter((b) => b.includes(substr));
  return ck(`no ${PARTS_DIR} file matching "${substr}"`, '0 files', `${hits.length} file(s)${hits.length ? ': ' + hits.slice(0, 3).join(',') : ''}`, hits.length === 0);
};
const metric = (label, observed, note) => () => ({ check: label, expect: note || 'recorded', observed: String(observed), pass: true });
// Merge-state checks record presence/absence of files owned by a sibling chunk's
// merge. They always pass: the §6.5 landing sequence (F1 → F2 → F3) makes either
// state valid truth, and --write snapshots whichever is observed so the artifact
// still diffs merge truth. A hard absent() assert here would go red the moment
// the sibling chunk lands.
const mergeState = (p, note) => () => {
  const e = existsSync(R(p));
  return ck(`merge-state ${p}`, `present or absent (${note})`, e ? 'present' : 'absent', true);
};

// --- spec-side observed metrics (shared by several items) --------------------
const encDir = R('src/data/encounters');
const encFiles = existsSync(encDir) ? readdirSync(encDir).filter((f) => f.endsWith('.js') && f !== 'index.generated.js') : [];
const livedFiles = encFiles.filter((f) => basename(f).includes('lived-'));
// F1 lands encounters as `NNN-scene-*.js` (verified 570-scene-… through 585-scene-…).
const sceneFiles = encFiles.filter((f) => /^\d+-scene-/.test(f));

// Files owned by sibling chunks in the §6.5 sequence — recorded, never asserted.
const F1_FILES = ['src/data/livedSectorOverlays.js'];
const F2_FILES = [
  'src/combat/latticeWarden.js',
  'src/render/latticeWardenTethers.js',
  'src/data/encounters/capital-boss/lattice-warden.js',
];
let tollCount = 0;
for (const f of encFiles) {
  const s = txt(`src/data/encounters/${f}`) || '';
  tollCount += (s.match(/"situation":\s*"toll"/g) || []).length;
}
const aftermathFiles = [...walk(R('assets/ships/release'))].filter((p) => basename(p).startsWith('aftermath'));

// --- item registry ------------------------------------------------------------
// item(): {item, section, source_file, item_ids, checks, canonical_id?, lifecycle_status?, note?}
const it = (item, section, source_file, item_ids, checks, extra = {}) =>
  ({ item, section, source_file, item_ids, ...extra, checks });

const ITEMS = [];

// §3.1 — unshipped-but-authored / admission debt
ITEMS.push(
  it('RP-1', '3.1', 'design/ASSET_REPURPOSE_POOL.md', ['assets/ships/m5_kestrel_upgrade/'],
    [dirExists('assets/ships/m5_kestrel_upgrade'), hasIn('spec', 'm5_kestrel_upgrade')],
    { lifecycle_status: 'unshipped (.blend source in repurpose pool)' }),
  it('RP-2', '3.1', 'design/ASSET_REPURPOSE_POOL.md', ['role-identification-sheet.png'],
    [exists('assets/incubator/npc_activity_pack/evidence/role-identification-sheet.png')],
    { lifecycle_status: 'unshipped (design input only)' }),
  it('RP-3', '3.1', 'design/ASSET_REPURPOSE_POOL.md',
    ['m4_ashline_v2', 'kestrel_borrowed_time_v2', 'kestrel_borrowed_time_v3', 'm4_hero_hauler'],
    [
      absent('assets/ships/m4_ashline_v2'), absent('assets/ships/kestrel_borrowed_time_v2'),
      absent('assets/ships/kestrel_borrowed_time_v3'), absent('assets/ships/m4_hero_hauler'),
    ],
    { lifecycle_status: 'deleted 2026-09-08 — restore-or-retire decision per dir' }),
  it('Q1', '3.1', 'assets/QUEUE.md', ['wholeship_pelican', 'wholeship_wasp', 'wholeship_pelican_production_v1', 'wholeship_wasp_production_v1', 'wholeship_kestrel'],
    [
      hasIn('queue', 'wholeship_pelican'), hasIn('queue', 'wholeship_wasp'),
      manRow('wholeship_pelican', { status: 'blocked' }),
      manRow('wholeship_wasp', { status: 'blocked' }),
      manRow('wholeship_pelican_production_v1', { status: 'integration_candidate' }),
      manRow('wholeship_wasp_production_v1', { status: 'accepted' }),
      manRow('wholeship_kestrel', { noStatus: true }),
    ],
    { lifecycle_status: 'residual: admit pelican_production_v1; retire/repair 2 blocked rows; kestrel already live' }),
);

const AD = [
  ['AD-1', 'atlas', 'wholeship_atlas_production_v1'], ['AD-2', 'bastion', 'wholeship_bastion_production_v1'],
  ['AD-3', 'colossus', 'wholeship_colossus_production_v1'], ['AD-4', 'hornet', 'wholeship_hornet_production_v1'],
  ['AD-5', 'ironback', 'wholeship_ironback_production_v1'], ['AD-6', 'leviathan', 'wholeship_leviathan_production_v1'],
  ['AD-7', 'saucer', 'wholeship_saucer_production_v1'], ['AD-8', 'massline_express_liner', 'wholeship_massline_express_liner_v1'],
  ['AD-9', 'mule', 'wholeship_mule_production_v1'], ['AD-10', 'pelican', 'wholeship_pelican_production_v1'],
  ['AD-11', 'ranger', 'wholeship_ranger_production_v1'], ['AD-12', 'warden', 'wholeship_warden_production_v1'],
];
for (const [aid, name, mid] of AD) {
  ITEMS.push(it(aid, '3.1', 'parts_manifest.json', [mid],
    [manRow(mid, { status: 'integration_candidate' }), manFile(mid)],
    { manifest_row: mid, lifecycle_status: `integration_candidate (adopt, don't rebuild)${name === 'massline_express_liner' ? ' — only AD id without _production_v1 suffix' : ''}` }));
}

// §3.2 — finish-tier queue (needed-assets §A places / parts + QUEUE rows)
const PLACES = [
  'place_station_trade_hub', 'place_station_refinery', 'place_station_military', 'place_station_blackmarket',
  'place_station_mining', 'place_station_fab', 'place_station_research', 'place_station_billboard',
  'place_asteroid_seamed', 'place_asteroid_rock_a', 'place_asteroid_rock_b', 'place_asteroid_rock_c',
  'place_asteroid_graffiti', 'place_dead_hulk', 'place_debris_chunk',
  'place_lane_beacon', 'place_nav_buoy', 'place_conveyor_barge', 'place_mining_drone', 'place_gate_jump_ring',
];
for (const id of PLACES) {
  ITEMS.push(it('PL', '3.2', 'needed-assets.md §A', [id],
    [hasIn('needed', id), manFile(id), ledgerRow(id, 'VISIBLE_IN_PLAY')],
    { manifest_row: id, lifecycle_status: 'VISIBLE_IN_PLAY (finish-tier revamp, not a new GLB)' }));
}
const PT_A = ['hull_starter', 'cockpit_recessed', 'engine_resonator', 'engine_vector', 'engine_plasma_ring', 'weapon_pulse_cannon', 'weapon_heavy_cannon', 'weapon_turret_dual', 'weapon_lance', 'weapon_gatling', 'weapon_railgun', 'fin_wedge', 'fin_radiator_grid', 'fin_swept_smuggler', 'fin_crystalline', 'fin_delta', 'fin_stabilator'];
for (const id of PT_A) {
  ITEMS.push(it('PT-A', '3.2', 'needed-assets.md §A', [id],
    [hasIn('needed', id), manFile(id)],
    { manifest_row: id, lifecycle_status: 'finish-tier (no FULL FINISH note)' }));
}
const PT_B = ['greeble_vents', 'greeble_hatches', 'greeble_pipes', 'greeble_rcs', 'greeble_antennas', 'greeble_nav_lights', 'greeble_armor_plates', 'skid_trio', 'skid_quad', 'pod_utility', 'pod_cargo_container', 'pod_repair_patch'];
for (const id of PT_B) {
  ITEMS.push(it('PT-B', '3.2', 'needed-assets.md §A', [id],
    [hasIn('needed', id), manFile(id)],
    { manifest_row: id, lifecycle_status: 'finish-tier (no FULL FINISH note)' }));
}
const Q2 = ['claim_hopper', 'claim_battery_mast', 'claim_hangar_frame', 'claim_hab_ring', 'claim_sensor_dish', 'claim_depot_silo', 'claim_teleport_ring',
  ...Array.from({ length: 12 }, (_, i) => `hunter_sig_rail_${String(i + 1).padStart(2, '0')}`),
  'module_vis_battery_S', 'module_vis_battery_M', 'module_vis_battery_L', 'module_vis_drill_head', 'module_vis_cargo_pod', 'module_vis_shield_emitter', 'module_vis_salvage_claw', 'module_vis_tow_winch'];
for (const id of Q2) {
  ITEMS.push(it('Q2', '3.2', 'assets/QUEUE.md', [id],
    [hasIn('queue', id), noMan(id), partsAbsent(id)],
    { lifecycle_status: 'missing — commission under this id at its QUEUE row budget' }));
}
const Q3 = [
  ['landmark_beacon_spire', 'place_landmark_beacon_spire', 'commission (C6)'],
  ['landmark_veil_obelisk', 'place_landmark_veil_obelisk', 'commission (C6)'],
  ['landmark_pit_anchor', 'place_landmark_pit_anchor', 'commission (C6) — same canonical id as needed-assets §B row; dedupe'],
  ['landmark_vault_maw', 'place_landmark_vault_maw', 'commission (C6) — same canonical id as needed-assets §B row; dedupe'],
  ['landmark_tower_crown', 'place_landmark_tower_crown', 'commission (C6)'],
  ['landmark_wreck_cathedral', 'place_landmark_wreck_cathedral', 'RETIRE — shipped+wired; no new GLB'],
];
for (const [qid, cid, ruling] of Q3) {
  const checks = [hasIn('queue', qid)];
  if (ruling.startsWith('RETIRE')) checks.push(manFile(cid));
  else checks.push(noMan(cid), partsAbsent(cid));
  ITEMS.push(it('Q3', '3.2', 'assets/QUEUE.md', [qid], checks,
    { canonical_id: cid, lifecycle_status: ruling }));
}

// §3.3 — BP-08 world-identity assets (needed-assets §B, genuinely missing)
const BP8 = {
  'BP-8a': ['place_station_concord_hub', 'place_station_meridian_exchange', 'place_station_drift_refinery', 'place_station_reach_den', 'place_station_quiet_cache', 'place_station_choir_shrine', 'place_station_free_waystation', 'place_station_vael_spire'],
  'BP-8c': ['place_gate_concord', 'place_gate_merchant', 'place_gate_reach'],
  'BP-8d': ['place_wreck_freighter', 'place_wreck_patrol', 'place_wreck_miner', 'place_wreck_capital_section', 'place_comm_beacon'],
  'BP-8e': ['place_asteroid_luminite', 'place_asteroid_ice'],
};
for (const [lane, ids] of Object.entries(BP8)) {
  for (const id of ids) {
    ITEMS.push(it(lane, '3.3', 'needed-assets.md §B', [id],
      [hasIn('needed', id), noMan(id), partsAbsent(id)],
      { canonical_id: id, lifecycle_status: 'missing — commission (per §3.9 id map)' }));
  }
}
const BP8B = [
  ['place_landmark_vault_maw', 'place_landmark_vault_maw', 'commission — dedupes with QUEUE landmark_vault_maw'],
  ['place_landmark_crystal_spire', 'place_landmark_crystal_spire', 'commission — distinct from beacon_spire'],
  ['place_landmark_pit_anchor', 'place_landmark_pit_anchor', 'commission — dedupes with QUEUE landmark_pit_anchor'],
  ['place_landmark_billboard_array', 'place_landmark_billboard_array', 'commission'],
];
for (const [id, cid, ruling] of BP8B) {
  ITEMS.push(it('BP-8b', '3.3', 'needed-assets.md §B', [id],
    [hasIn('needed', id), noMan(cid), partsAbsent(cid)],
    { canonical_id: cid, lifecycle_status: ruling }));
}
ITEMS.push(it('BP-8b', '3.3', 'needed-assets.md §B', ['place_landmark_cathedral_wreck'],
  [
    hasIn('needed', 'place_landmark_cathedral_wreck'),
    noMan('place_landmark_cathedral_wreck'),
    manFile('place_landmark_wreck_cathedral'),
  ],
  {
    canonical_id: 'place_landmark_wreck_cathedral',
    lifecycle_status: 'spelling alias of shipped asset — fold into state variants; a distinct second cathedral takes place_landmark_cathedral_wreck_ii via C6 brief',
    note: 'never author the cathedral_wreck spelling (§3.9)',
  }));

// §3.4 — audit §8 new-asset list
const ID_H = [
  ['police_interceptor', 'Police interceptor', []],
  ['prison_barge', 'Prison barge', []],
  ['worker_shuttle', 'Worker shuttle', []],
  ['pilgrim_hulk', 'Pilgrim hulk', []],
  ['capital_silhouettes_x2', 'Capital silhouettes', [
    manRow('wholeship_leviathan_production_v1'), manRow('wholeship_massline_express_liner_v1'), exists('src/data/ilexArk.js')]],
  ['ice_cutter_sled', 'Ice-cutter', []],
  ['racer_hull', 'Racer hull', []],
];
for (const [id, pat, extra] of ID_H) {
  ITEMS.push(it('ID-H', '3.4', AUDIT_PATH, [id],
    [hasIn('audit', pat), ...extra],
    { lifecycle_status: 'commission (audit §8 ship row); capital silhouettes try leviathan/liner/ark reuse first' }));
}
const ID_P = [
  ['market_stall_module', 'Market stall module', [
    exists(`${PARTS_DIR}/places/place_freight_platform.glb`), exists(`${PARTS_DIR}/places/place_container_rack.glb`)]],
  ['hose_umbilical', 'Hose / umbilical', []],
  ['banner_strike_sign', 'Banner / strike sign', []],
  ['lantern_buoy', 'Lantern buoy', [manRow('place_lane_beacon')]],
  ['toy_kits_x15', 'Toy kits', [
    exists('assets/ships/release/parts/places/place_customs_pylon.glb'), exists(`${PARTS_DIR}/places/place_scrap_cage.glb`), manRow('place_dead_hulk')]],
  ['duel_ring_markers', 'Duel ring markers', [manRow('place_ash_pin')]],
  ['faction_beacon_variants', 'Faction beacon variants', [manRow('place_nav_buoy')]],
];
for (const [id, pat, extra] of ID_P) {
  ITEMS.push(it('ID-P', '3.4', AUDIT_PATH, [id],
    [hasIn('audit', pat), ...extra],
    { lifecycle_status: 'commission (audit §8 place row); kitbash refs verified where extra checks listed' }));
}
const ID_V = [
  ['fire_front_vfx', 'Fire-front VFX', []],
  ['thermal_plume_vfx', 'Thermal plume', []],
  ['ion_storm_front_vfx', 'Ion storm front', [hasIn('envmach', 'WEATHER_VOLUMES')]],
  ['radio_chatter_corpus', 'Radio chatter', [exists('src/data/barks.js')]],
  ['crowd_liveries', 'Crowd liveries', []],
];
for (const [id, pat, extra] of ID_V) {
  ITEMS.push(it('ID-V', '3.4', AUDIT_PATH, [id],
    [hasIn('audit', pat), ...extra],
    { lifecycle_status: 'commission (audit §8 VFX/audio/texture row)' }));
}
ITEMS.push(
  it('ID-L', '3.4', AUDIT_PATH, ['cut_saw_track'],
    [hasIn('audit', 'Cut Saw'), hasFrontier('sector_hyperion_cut')],
    { lifecycle_status: 'commission (monumental landmark, Hyperion)' }),
  it('ID-S', '3.4', AUDIT_PATH, ['ringworld_arc'],
    [hasIn('audit', 'Ringworld Arc'), hasFrontier('sector_sedna_dark')],
    { lifecycle_status: 'commission (skybox/parallax artifact for Sedna — not a GLB)' }),
);
const ID_F = [
  ['customs_pen', 'Institutions'], ['salvage_court', 'Institutions'], ['relief_berth', 'Institutions'],
  ['repair_quay', 'Institutions'], ['black_market_intake', 'Institutions'],
];
for (const [id] of ID_F) {
  ITEMS.push(it('ID-F', '3.4', `${AF_PATH} §D`, [id],
    [hasIn('af', 'Institutions and planetary workplaces'), exists('src/data/authoredPlaces.js')],
    { lifecycle_status: 'commission (institution frontage structure, ASSET_FAMILIES §D)' }));
}
ITEMS.push(it('ID-FA', '3.4', AUDIT_PATH, ['rim_fauna_casts'],
  [
    hasIn('audit', 'Rim fauna'), exists('src/data/alienEcology.js'),
    hasFile('src/render/faunaVisuals.js', 'wake_eel'), hasFile('src/render/faunaVisuals.js', 'glassback'),
    hasFile('src/render/faunaVisuals.js', 'furnace_maw'), hasFile('src/render/faunaVisuals.js', 'cold_bell'),
    hasFrontier('sector_triton_wake'), hasFrontier('sector_haumea_rift'), hasFrontier('sector_rhea_cinder'), hasFrontier('sector_sedna_dark'),
  ],
  { lifecycle_status: 'site casts in alienEcology.js — species already procedural in faunaVisuals.js; not new GLBs' }));

// §3.5 — new units [P]
const UNITS = [
  ['npc_customs_interceptor', [
    hasIn('otc', 'inspection_cutter'), exists(`${PARTS_DIR}/wholeships/hornet_scn_interdictor.glb`)],
    'traffic/NPC — doctrine+silhouette variant of inspection_cutter/hornet_scn_interdictor'],
  ['npc_prison_warden_barge', [
    exists('src/systems/traffic.js'), exists('src/data/enemies.js')],
    'traffic + encounter — hull = ID-H prison barge commission'],
  ['npc_media_drone', [
    hasIn('otc', 'inspection_cutter')],
    'traffic/NPC — small wholeship or inspection_cutter variant (picked in brief)'],
  ['npc_fuel_tender', [
    manRow('wholeship_volatiles_tanker'), manRow('wholeship_repair_tender')],
    'traffic/NPC — reuse volatiles_tanker/repair_tender, no new hull'],
  ['npc_quarantine_corvette', [
    hasIn('alien', 'quarantine'), hasFrontier('sector_charon_expanse')],
    'traffic + encounter — Charon quarantine fields exist in data'],
  ['npc_courier_relay', [
    countReIn('contacts', "role:\\s*'courier'", { min: 10 }), manRow('wholeship_apron_shuttle')],
    'traffic/NPC — promote courier lane contacts (10) to timed-manifest runs'],
  ['npc_storm_prospector', [
    hasIn('envmach', 'WEATHER_VOLUMES')],
    'CONDITIONAL — requires moving weather-front system (§3.8) or cut'],
  ['enemy_assassin', [
    exists('src/data/enemies.js'), exists('src/data/combatDefs.js'), countReIn('aces', "id:\\s*'ace_", { min: 16 })],
    'enemy path — differentiate vs 16 named aces (stated in brief)'],
  ['npc_diplomat_yacht', [
    hasIn('spec', 'pilgrim hulk')],
    'traffic/NPC — hull = ID-H pilgrim hulk commission'],
  ['enemy_duel_champion', [
    manRow('place_ash_pin'), hasFrontier('sector_sker_haven')],
    'enemy path — Sker ash_pin duel rings; hull = ID-H racer commission'],
];
for (const [id, checks, note] of UNITS) {
  ITEMS.push(it('U', '3.5', SPEC_PATH, [id], [hasIn('spec', id), ...checks],
    { lifecycle_status: `[P] unit def — ${note}` }));
}
ITEMS.push(it('F2-ref', '3.5', 'devin/1791167345-lattice-warden (unmerged)', ['lattice_warden'],
  F2_FILES.map((p) => mergeState(p, 'lands via F2')),
  { lifecycle_status: 'unmerged reference pattern — lands via chunk F2' }));

// §3.6 — placeholder replacements
ITEMS.push(
  it('PH-1', '3.6', 'src/data/encounters/', ['lived-* vignettes', 'situation:toll'],
    [
      metric('lived-* encounter files', livedFiles.length, 'F1 target: de-templated'),
      metric('situation:"toll" defs', tollCount, 'post-F1 gate: <=90 catalog entries'),
    ],
    { lifecycle_status: `baseline recorded: ${livedFiles.length} lived-* files, ${tollCount} toll defs (pre-F1)` }),
  it('PH-2', '3.6', SPEC_PATH, ['= BP-8a'],
    [hasIn('spec', 'PH-2')], { lifecycle_status: 'owned by C7 — no duplicate work' }),
  it('PH-3', '3.6', 'needed-assets.md', ['place_station_trade_hub'],
    [
      hasIn('needed', 'faction redesign'), manFile('place_station_trade_hub'), ledgerRow('place_station_trade_hub', 'VISIBLE_IN_PLAY'),
    ],
    { lifecycle_status: 'faction-redesign note lands with the C1 finish pass' }),
  it('PH-4', '3.6', AUDIT_PATH, ['fence sectors', 'vael-courier sectors'],
    [
      hasFrontier('sector_nyx_march'), hasFrontier('sector_eris_margin'), hasFrontier('sector_eunomia_gulf'), hasFrontier('sector_kepler_scar'),
      hasFrontier('sector_orcus_shadow'), hasFrontier('sector_triton_wake'), hasFrontier('sector_phoebe_echo'),
    ],
    { lifecycle_status: 'opposite-verb resolution via rim packets (§3.7 PR)' }),
);

// §3.7 — placement packets
ITEMS.push(
  it('PP-1', '3.7', AUDIT_PATH, ['Cam<=4 sectors'],
    [
      hasFrontier('sector_helios_prime'), hasFrontier('sector_veil_nebula'), hasFrontier('sector_pallas_drift'), hasFrontier('sector_io_reach'),
    ],
    { lifecycle_status: 'placement packet — macroform belts + approach lanes (rim sectors carried by PR rows)' }),
  it('PP-2', '3.7', AUDIT_PATH, ['battle dressing'],
    [exists('src/data/enemies.js'), exists('src/data/combatDefs.js'), exists('src/data/wreckAftermathDressing.js')],
    { lifecycle_status: 'placement packet — staged cover, aftermath, escalation' }),
  it('PP-3', '3.7', `${AF_PATH} §D`, ['institution frontage'],
    [hasIn('af', 'Institutions and planetary workplaces'), exists('src/data/authoredPlaces.js')],
    { lifecycle_status: 'placement packet — consumes C10 ID-F structures' }),
  it('PP-4', '3.7', AUDIT_PATH, ['economy/crime'],
    [exists('src/data/fences.js'), exists('src/data/regionalEconomyProfiles.js')],
    { lifecycle_status: 'placement packet — claims, custody props, smuggler lanes' }),
  it('PP-5', '3.7', AUDIT_PATH, ['play pack'],
    [exists('src/data/environmentalMachinery.js'), hasFrontier('sector_sker_haven')],
    { lifecycle_status: 'placement packet — toy systems + bazaars + duel rings' }),
  it('PP-6', '3.7', 'scripts/lib/bench/scenarios/world.sector_identity.mjs', ['camera scale'],
    [exists('src/data/sectorActivityPockets.js'), exists('scripts/lib/bench/scenarios/world.sector_identity.mjs')],
    { lifecycle_status: 'placement packet — 144 WU arrival-frame census' }),
  it('PR-1', '3.7', AUDIT_PATH, ['Kepler', 'Dione', 'Rhea', 'Phoebe', 'Sedna'],
    [
      hasFrontier('sector_kepler_scar'), hasFrontier('sector_dione_lane'), hasFrontier('sector_rhea_cinder'),
      hasFrontier('sector_phoebe_echo'), hasFrontier('sector_sedna_dark'),
    ],
    { lifecycle_status: 'rim signature packet wave 1 (audit order)' }),
  it('PR-2', '3.7', AUDIT_PATH, ['Nyx', 'Hyperion', 'Orcus', 'Haumea', 'Eris', 'Nereid', 'Proteus', 'Triton', 'Eunomia'],
    [
      hasFrontier('sector_nyx_march'), hasFrontier('sector_hyperion_cut'), hasFrontier('sector_orcus_shadow'),
      hasFrontier('sector_haumea_rift'), hasFrontier('sector_eris_margin'), hasFrontier('sector_nereid_shoal'),
      hasFrontier('sector_proteus_well'), hasFrontier('sector_triton_wake'), hasFrontier('sector_eunomia_gulf'),
    ],
    { lifecycle_status: 'rim signature packet wave 2' }),
);

// §3.8 — deferred queues (dispositions are the deliverable)
const DEFERRED = [
  ['D-BP-9', 'BP-9', [metric('aftermath_* release assets', aftermathFiles.length, 'reuse pool for wreck lifecycle')]],
  ['D-BP-10', 'BP-10', []],
  ['D-BP-11', 'BP-11', [exists('src/data/laneContacts.js')]],
  ['D-BP-12', 'BP-12', [exists('src/data/heistFacilities.js'), exists('src/data/ilexArk.js')]],
  ['D-BP-13', 'BP-13', [exists('src/data/namedAces.js'), countReIn('aces', 'homeSectorId', {})]],
  ['D-BP-14', 'BP-14', [hasFrontier('sector_sedna_dark')]],
  ['D-BP-15', 'BP-15', [hasFrontier('sector_pallas_drift'), hasFrontier('sector_vesta_forge'), hasFrontier('sector_haumea_rift'), hasFrontier('sector_dione_lane')]],
];
for (const [id, bpPat, extra] of DEFERRED) {
  ITEMS.push(it(id, '3.8', AUDIT_PATH, [bpPat],
    [hasIn('audit', bpPat), ...extra], { lifecycle_status: 'deferred per §3.8 disposition' }));
}
const DEFERRED_AF = [
  ['D-AF-A', '### A.', [exists(AF_PATH)]],
  ['D-AF-B', '### B.', [exists('src/data/shipRoleLattice.js')]],
  ['D-AF-C', '### C.', []],
  ['D-AF-E', '### E.', []],
  ['D-AF-F', '### F.', [exists('src/render/faunaVisuals.js')]],
  ['D-AF-G', '### G.', [exists('src/render/machineVisuals.js')]],
  ['D-AF-H', '### H.', []],
  ['D-AF-I', '### I.', []],
];
for (const [id, secPat, extra] of DEFERRED_AF) {
  ITEMS.push(it(id, '3.8', AF_PATH, [secPat],
    [hasIn('af', secPat), ...extra], { lifecycle_status: 'deferred per §3.8 disposition' }));
}
ITEMS.push(it('D-RW', '3.8', 'design/program/02_REMAINING_WORK.md', ['graphics rows'],
  [exists('design/program/02_REMAINING_WORK.md'), hasIn('spec', '02_REMAINING_WORK')],
  { lifecycle_status: 'cross-check, not absorbed — final wave gate notes overlap' }));

// F1 baseline record (pre-merge truth this branch verifies)
ITEMS.push(it('F1-ref', '3.6', 'devin/1791689614-world-placement-program (unmerged)', ['scene-* encounters'],
  [
    metric('scene-* encounter files', sceneFiles.length, '0 expected pre-F1 merge; 16 expected after'),
    ...F1_FILES.map((p) => mergeState(p, 'lands via F1')),
  ],
  { lifecycle_status: 'unmerged — lands via chunk F1' }));

// --- run ---------------------------------------------------------------------
function runItems() {
  const out = [];
  for (const item of ITEMS) {
    const checks = item.checks.map((c) => c());
    const verdict = checks.every((c) => c.pass) ? 'pass' : 'fail';
    out.push({
      item: item.item,
      section: item.section,
      source_file: item.source_file,
      item_ids: item.item_ids,
      manifest_row: item.manifest_row || null,
      canonical_id: item.canonical_id || null,
      lifecycle_status: item.lifecycle_status || null,
      note: item.note || null,
      checks,
      verdict,
    });
  }
  return out;
}

const results = runItems();
const failed = results.filter((r) => r.verdict !== 'pass');
const artifact = {
  schemaVersion: 1,
  program: 'asset-experience-program',
  spec: SPEC_PATH,
  audit: AUDIT_PATH,
  verify_command: 'node scripts/check-aep-queue-ingestion.mjs --check',
  summary: {
    items: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    metrics: {
      'lived-* encounter files': livedFiles.length,
      'situation:"toll" defs': tollCount,
      'scene-* encounter files': sceneFiles.length,
      'aftermath_* release assets': aftermathFiles.length,
      'F1 merge files present': F1_FILES.filter((p) => existsSync(R(p))).length,
      'F2 merge files present': F2_FILES.filter((p) => existsSync(R(p))).length,
    },
  },
  items: results,
};

function toMarkdown(a) {
  const lines = [];
  lines.push('# AEP §3 queue-ingestion verification — machine-checkable item table');
  lines.push('');
  lines.push('Generated by `node scripts/check-aep-queue-ingestion.mjs --write` (chunk F3).');
  lines.push('Re-verify: `npm run check:aep-queue-ingestion`. Later chunks diff this table');
  lines.push('against their own ingest run (spec §4.0 / §6 reviewer-1 protocol).');
  lines.push('');
  lines.push(`Items: ${a.summary.items} · passed: ${a.summary.passed} · failed: ${a.summary.failed}`);
  lines.push('');
  let section = null;
  for (const r of a.items) {
    if (r.section !== section) {
      section = r.section;
      lines.push('', `## §${section}`, '', '| item | item ids | source file | manifest row | canonical id | lifecycle / disposition | verdict |', '|---|---|---|---|---|---|---|');
    }
    const man = r.manifest_row || (r.checks.some((c) => c.check.startsWith('manifest')) ? '(see checks)' : '—');
    const failedChecks = r.checks.filter((c) => !c.pass).map((c) => c.check).join('; ');
    lines.push(`| ${r.item} | ${r.item_ids.join('<br>')} | ${r.source_file} | ${man} | ${r.canonical_id || '—'} | ${r.lifecycle_status || '—'} | ${r.verdict}${failedChecks ? ' — ' + failedChecks : ''} |`);
  }
  lines.push('');
  return lines.join('\n');
}

const mode = process.argv[2];
if (mode === '--write') {
  writeFileSync(R(OUT_JSON), JSON.stringify(artifact, null, 2) + '\n');
  writeFileSync(R(OUT_MD), toMarkdown(artifact));
  console.log(`wrote ${OUT_JSON} + ${OUT_MD} (${results.length} items, ${failed.length} failed)`);
  process.exit(failed.length ? 1 : 0);
}

console.log(`AEP §3 queue-ingestion: ${results.length} items, ${results.length - failed.length} pass, ${failed.length} fail`);
for (const f of failed) {
  console.log(`FAIL ${f.item} ${f.item_ids.join(',')}`);
  for (const c of f.checks.filter((c) => !c.pass)) console.log(`     ${c.check}: expected ${c.expect}, got ${c.observed}`);
}

let artifactDrift = false;
if (mode === '--check') {
  const committedJson = txt(OUT_JSON);
  const committedMd = txt(OUT_MD);
  if (!committedJson || !committedMd) {
    console.log('FAIL artifacts missing — run `node scripts/check-aep-queue-ingestion.mjs --write` and commit the output');
    artifactDrift = true;
  } else {
    // Normalize CRLF so a Windows checkout can never fake staleness (.gitattributes
    // also pins both artifacts to eol=lf).
    const norm = (s) => (s || '').replace(/\r\n/g, '\n');
    if (norm(committedJson) !== JSON.stringify(artifact, null, 2) + '\n') {
      console.log(`FAIL ${OUT_JSON} is stale — regenerate with --write`);
      artifactDrift = true;
    }
    if (norm(committedMd) !== toMarkdown(artifact)) {
      console.log(`FAIL ${OUT_MD} is stale — regenerate with --write`);
      artifactDrift = true;
    }
    if (!artifactDrift) console.log('artifacts in sync with live verification');
  }
}

process.exit(failed.length || artifactDrift ? 1 : 0);
