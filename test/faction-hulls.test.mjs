// S6 faction hulls: palette + lit-trim variants of existing Forge hulls, routed per enemy id (hostiles)
// or per faction (shared hulls). The variants change which BODY an existing id renders, never what
// spawns where. Structural tests need no published bytes; the "resolves to" tests need the render-package
// pilots that `node tools/blender/forge/publish.mjs <ids>` regenerates (renderPackageManifest.js),
// because a mapped file with no pilot fails closed on purpose.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { ENEMY_TYPES } from '../src/data/enemies.js';
import {
  isPackagedLiveWholeShipFile,
  spawnableShipArchetypePrewarmUrls,
  wholeShipVisualForEntity,
} from '../src/render/partsLibrary.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (rel) => JSON.parse(readFileSync(resolve(ROOT, rel), 'utf8'));

// body id -> { base hull it is a variant of, live file, runtime asset id }
const BODIES = Object.freeze({
  hornet_scn_interdictor: { base: 'hornet', file: 'wholeships/hornet_scn_interdictor.glb', assetId: 'SF_HORNET_SCN_INTERDICTOR' },
  wasp_quiet_ghost: { base: 'wasp', file: 'wholeships/wasp_quiet_ghost.glb', assetId: 'SF_WASP_QUIET_GHOST' },
  ashline_dart_choir: { base: 'ashline_dart', file: 'wholeships/ashline_dart_choir.glb', assetId: 'SF_WHOLESHIP_ASHLINE_DART_CHOIR' },
  ashline_lode_vael: { base: 'ashline_lode', file: 'wholeships/ashline_lode_vael.glb', assetId: 'SF_WHOLESHIP_ASHLINE_LODE_VAEL' },
  ashline_rig_quiet: { base: 'ashline_rig', file: 'wholeships/ashline_rig_quiet.glb', assetId: 'SF_WHOLESHIP_ASHLINE_RIG_QUIET' },
  helios_cradle_dmc: { base: 'helios_cradle', file: 'wholeships/helios_cradle_dmc.glb', assetId: 'SF_WHOLESHIP_HELIOS_CRADLE_DMC' },
});
assert.equal(Object.keys(BODIES).length <= 6, true, 'S6 budget: at most six new bodies');

// Enemy ids routed by id, with the faction that owns them in the enemy table.
const ENEMY_ROUTES = Object.freeze({
  patrol_lawman: { faction: 'faction_scn', body: 'hornet_scn_interdictor' },
  customs_cutter: { faction: 'faction_scn', body: 'hornet_scn_interdictor' },
  quiet_ghost: { faction: 'faction_quiet', body: 'wasp_quiet_ghost' },
  choir_zealot: { faction: 'faction_choir', body: 'ashline_dart_choir' },
  warden_escort: { faction: 'faction_vael', body: 'ashline_lode_vael' },
});

// Body routing at the pre-S6 commit (3a989e9ad), per enemy id and per traffic role (patrol/escort
// roles resolve through ship defs and the Wasp kit table, which this change does not touch).
const BASELINE_ENEMY_BODY = Object.freeze({
  wasp_swarmer: 'wholeships/ashline_dart.glb',
  lancer_sniper: 'wholeships/wasp_production_v1.glb',
  detonator_dart: 'wholeships/wasp_production_v1.glb',
  bruiser_brawler: 'wholeships/ashline_lode.glb',
  mule_trader: 'wholeships/helios_span.glb',
  reaver_pirate: 'wholeships/ashline_rig.glb',
  corsair_raider: 'wholeships/ashline_rig_corsair_blade.glb',
  patrol_lawman: 'wholeships/hornet_production_v1.glb',
  dreadnought_boss: 'wholeships/leviathan_production_v1.glb',
  mine_layer_jackal: 'wholeships/ashline_rig.glb',
  pd_screen_escort: 'wholeships/ashline_lode.glb',
  customs_cutter: 'wholeships/hornet_production_v1.glb',
  choir_zealot: 'wholeships/ashline_dart.glb',
  quiet_ghost: 'wholeships/wasp_production_v1.glb',
  tether_control_raider: 'wholeships/ashline_rig.glb',
  warden_escort: 'wholeships/ashline_lode.glb',
  field_anchor_controller: 'wholeships/ashline_lode.glb',
  mirrorjaw_foreman: 'wholeships/ashline_lode.glb',
  forge_regent: 'wholeships/ashline_lode.glb',
});
const BASELINE_TRAFFIC_BODY = Object.freeze({
  courier: 'wholeships/helios_lark.glb',
  miner: 'wholeships/helios_cradle.glb',
  hauler: 'wholeships/helios_span.glb',
  arclight: 'wholeships/helios_arclight.glb',
  ore_carrier: 'wholeships/ore_barge.glb',
  tender: 'wholeships/repair_tender.glb',
  salvor: 'wholeships/salvage_cutter.glb',
  surveyor: 'wholeships/survey_pin.glb',
  express: 'wholeships/massline_express_liner_v1.glb',
  rescue: 'wholeships/rescue_lifter.glb',
  prospector: 'wholeships/prospector_skiff.glb',
  sweeper: 'wholeships/scrap_sweeper.glb',
  shuttle: 'wholeships/apron_shuttle.glb',
  tug: 'wholeships/yard_tug.glb',
  tanker: 'wholeships/volatiles_tanker.glb',
  customs: 'wholeships/inspection_cutter.glb',
  smuggler: 'wholeships/drifter_production_v1.glb',
  pirate: 'wholeships/wasp_production_v1.glb',
});

const FACTIONS = Object.freeze([
  'faction_scn', 'faction_mts', 'faction_dmc', 'faction_reach', 'faction_quiet', 'faction_vael', 'faction_free',
  'faction_choir', 'faction_helix', 'faction_understory', 'faction_fulfillment', 'faction_archive',
  'faction_pitborn', 'faction_verge_layers',
]);

function enemyVisual(id, factionId) {
  const enemy = ENEMY_TYPES.find((row) => row.id === id);
  assert.ok(enemy, `${id} is a real enemy type`);
  return wholeShipVisualForEntity({
    type: 'ship', alive: true, id, radius: enemy.collisionRadius, ...(factionId ? { factionId } : {}),
    data: { defId: enemy.shipId, silhouette: enemy.silhouette, lootTableId: enemy.id },
  }, { requiredWholeShip: true });
}

function trafficVisual(role, factionId) {
  return wholeShipVisualForEntity({
    type: 'ship', alive: true, id: `traffic:${role}`, ...(factionId ? { factionId } : {}),
    data: { trafficRole: role, defId: 'ship_kestrel' },
  }, { requiredWholeShip: true });
}

function requirePublished(file) {
  assert.ok(isPackagedLiveWholeShipFile(file),
    `${file} has no render-package pilot in renderPackageManifest.js: run node tools/blender/forge/publish.mjs ${Object.keys(BODIES).join(',')}`);
}

test('six faction bodies are registered Forge variants of an existing hull', () => {
  const fleet = readJson('tools/blender/forge/fleet.json').ships;
  const pilots = readJson('assets/ships/render-packages/pilots.json').pilots;
  const parts = readJson('assets/ships/parts/parts_manifest.json').parts;
  const roots = new Set();
  for (const [id, body] of Object.entries(BODIES)) {
    const entry = fleet[id];
    assert.ok(entry, `${id} is in fleet.json`);
    assert.equal(entry.layout, 'npc');
    assert.equal(`wholeships/${entry.file}.glb`, body.file);
    assert.equal(entry.asset_id, body.assetId);
    assert.equal(entry.part_id, `wholeship_${id}`);
    assert.ok(!roots.has(entry.npc_root), `${id} npc_root is unique`);
    roots.add(entry.npc_root);
    assert.ok(fleet[body.base], `${id} is a variant of ${body.base}, which is a Forge hull`);

    const recipe = readFileSync(resolve(ROOT, `tools/blender/forge/ships/${id}.py`), 'utf8');
    assert.match(recipe, new RegExp(`main\\('${body.base}', SHIP_ID`), `${id} builds through variant.main over ${body.base}`);
    assert.match(recipe, new RegExp(`SHIP_ID = '${id}'`));
    assert.doesNotMatch(recipe, /def extra\(|F\.(box|plate|loft)\(/, `${id} adds no geometry`);

    const pilot = pilots.find((row) => row.key === id.replace(/_/g, '-'));
    assert.ok(pilot, `${id} has a render-package pilot row`);
    assert.equal(pilot.runtimeAssetId, body.assetId);
    assert.equal(pilot.releaseAssetId, `wholeship_${id}`);
    assert.equal(pilot.sourceUrl, `assets/ships/release/parts/${body.file}`);

    const row = parts.find((part) => part.id === `wholeship_${id}`);
    assert.ok(row, `${id} has a parts_manifest row`);
    assert.equal(row.assetId, body.assetId);
    assert.equal(row.file, body.file);
  }
});

test('Wasp and Hornet variants carry their base hull motion bank (the pilot seals one per key)', () => {
  for (const [id, base] of [['wasp_quiet_ghost', 'wasp'], ['hornet_scn_interdictor', 'hornet-production-v1']]) {
    const own = resolve(ROOT, `assets/ships/motions/${id.replace(/_/g, '-')}.motion.json`);
    assert.ok(existsSync(own), `${id} needs assets/ships/motions/${id.replace(/_/g, '-')}.motion.json`);
    // Same rig, same pivots, same clips. sourceGlbSha256 is informational provenance of the GLB the
    // bank was baked against: a variant's own GLB can never match it (the existing Wasp variants
    // already differ from the base on that one field), so it is excluded from the comparison.
    const strip = (path) => { const bank = JSON.parse(readFileSync(path, 'utf8')); delete bank.sourceGlbSha256; return bank; };
    assert.deepEqual(strip(own), strip(resolve(ROOT, `assets/ships/motions/${base}.motion.json`)),
      `${id} bank is its base bank (same hull, same pivots)`);
  }
});

test('every new body is in the sector / roster prewarm list', () => {
  const urls = new Set(spawnableShipArchetypePrewarmUrls());
  for (const [id, body] of Object.entries(BODIES)) {
    assert.ok(urls.has(body.file), `${id} is prewarmed with the other faction variants`);
  }
  for (const sibling of ['wholeships/wasp_scn_patrol.glb', 'wholeships/helios_span_dmc.glb']) {
    assert.ok(urls.has(sibling), `${sibling} (existing faction variant) is in the same list`);
  }
});

test('the covered enemy ids belong to their faction in the enemy table and resolve to its body', () => {
  for (const [id, route] of Object.entries(ENEMY_ROUTES)) {
    const enemy = ENEMY_TYPES.find((row) => row.id === id);
    assert.equal(enemy.factionId, route.faction, `${id} is a ${route.faction} enemy`);
    const body = BODIES[route.body];
    requirePublished(body.file);
    // Enemy-id keyed: the body does not depend on whichever faction a zone or encounter fielded it under.
    for (const field of [undefined, enemy.factionId, 'faction_reach', 'faction_free']) {
      const visual = enemyVisual(id, field);
      assert.equal(visual.file, body.file, `${id} (fielded as ${field || 'unflagged'}) wears ${route.body}`);
      assert.equal(visual.assetId, body.assetId);
    }
  }
  // Every enemy the table gives to these three factions is covered; Vael also fields the capital boss.
  for (const faction of ['faction_scn', 'faction_quiet', 'faction_choir']) {
    const owned = ENEMY_TYPES.filter((row) => row.factionId === faction).map((row) => row.id).sort();
    const covered = Object.entries(ENEMY_ROUTES).filter(([, route]) => route.faction === faction).map(([id]) => id).sort();
    assert.deepEqual(covered, owned, `${faction}: every enemy type is covered`);
  }
  const vael = ENEMY_TYPES.filter((row) => row.factionId === 'faction_vael').map((row) => row.id).sort();
  assert.deepEqual(vael, ['dreadnought_boss', 'warden_escort'], 'Vael enemy table is the warden and the boss');
  assert.equal(enemyVisual('dreadnought_boss').file, 'wholeships/leviathan_production_v1.glb', 'the boss keeps its capital hull');
});

test('rig hostiles wear the Quiet paint only under faction_quiet; miner barges wear DMC copper only under faction_dmc', () => {
  requirePublished(BODIES.ashline_rig_quiet.file);
  requirePublished(BODIES.helios_cradle_dmc.file);
  for (const id of ['reaver_pirate', 'mine_layer_jackal', 'tether_control_raider']) {
    assert.equal(enemyVisual(id, 'faction_quiet').file, BODIES.ashline_rig_quiet.file, `${id} fielded by the Quiet`);
    assert.equal(enemyVisual(id, 'faction_quiet').assetId, BODIES.ashline_rig_quiet.assetId);
    for (const faction of FACTIONS.filter((f) => f !== 'faction_quiet')) {
      assert.equal(enemyVisual(id, faction).file, 'wholeships/ashline_rig.glb', `${id} fielded as ${faction} keeps the rig`);
    }
  }
  assert.equal(trafficVisual('miner', 'faction_dmc').file, BODIES.helios_cradle_dmc.file);
  assert.equal(trafficVisual('miner', 'faction_dmc').assetId, BODIES.helios_cradle_dmc.assetId);
  for (const faction of [undefined, ...FACTIONS.filter((f) => f !== 'faction_dmc')]) {
    assert.equal(trafficVisual('miner', faction).file, 'wholeships/helios_cradle.glb', `miner under ${faction || 'no faction'}`);
  }
});

test('no enemy type or traffic role outside the covered set changed its body', () => {
  const allowedEnemyChanges = new Set(Object.keys(ENEMY_ROUTES));
  for (const enemy of ENEMY_TYPES) {
    assert.ok(enemy.id in BASELINE_ENEMY_BODY, `${enemy.id} has a recorded pre-S6 body (add it to BASELINE_ENEMY_BODY)`);
    if (allowedEnemyChanges.has(enemy.id)) continue;
    for (const faction of [undefined, enemy.factionId]) {
      const visual = enemyVisual(enemy.id, faction);
      assert.equal(visual && visual.file, BASELINE_ENEMY_BODY[enemy.id], `${enemy.id} (${faction || 'unflagged'}) keeps its body`);
    }
  }
  for (const [role, file] of Object.entries(BASELINE_TRAFFIC_BODY)) {
    for (const faction of [undefined, ...FACTIONS]) {
      const visual = trafficVisual(role, faction);
      const expected = role === 'miner' && faction === 'faction_dmc' ? BODIES.helios_cradle_dmc.file : null;
      if (expected) continue;
      // The Span hauler kits are the pre-existing faction logic and stay as they were.
      if (role === 'hauler' && ['faction_dmc', 'faction_mts', 'faction_reach'].includes(faction)) continue;
      assert.equal(visual && visual.file, file, `traffic ${role} (${faction || 'unflagged'}) keeps its body`);
    }
  }
  // The pre-existing lancer / pirate-Wasp contract (pq-193-09) still holds.
  assert.equal(enemyVisual('lancer_sniper', 'faction_scn').file, 'wholeships/wasp_production_v1.glb');
});
