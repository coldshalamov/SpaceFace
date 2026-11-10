/**
 * Append-only content variety contracts.
 * Imports live data modules (no re-implementations) and asserts new IDs, refs, and Helios safety.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ENEMY_TYPES } from '../src/data/enemies.js';
import { WEAPONS } from '../src/data/weapons.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { knownAces, VARIETY_ACE_IDS, NAMED_ACE_IDS } from '../src/data/namedAces.js';
import { HUNTER_TRICKS, HUNTER_TRICK_IDS, hunterTrickById } from '../src/data/hunterTricks.js';
import { ENCOUNTERS, ENCOUNTER_MODULES } from '../src/data/encounters/index.generated.js';
import { WRECK_MISSIONS, wreckMissionById, pickWreckMission } from '../src/data/wreckMissions.js';
import { SECTORS, POI_TYPES } from '../src/data/sectors.js';
import { HEADLINE_TEMPLATES } from '../src/data/newsTemplates.js';
import { BARKS, BARK_FACTIONS, barkFor } from '../src/data/barks.js';
import { FLAVOR_PACKS } from '../src/data/flavor/index.generated.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const VARIETY_ENEMY_IDS = [
  'mine_layer_jackal',
  'pd_screen_escort',
  'customs_cutter',
  'choir_zealot',
  'quiet_ghost',
];
const KNOWN_AI = new Set([
  'swarmer',
  'sniper',
  'brawler',
  'fleeing_trader',
  'pirate',
  'miniboss_capital',
]);
const VARIETY_ENCOUNTER_IDS = [
  'minefield_wake',
  'customs_logic_net',
  'ghost_on_the_bearing',
  'pattern_refrain',
  'curtain_convoy',
];
const VARIETY_TRICK_IDS = ['wake-mines', 'pd-curtain', 'sensor-ghost'];
const VARIETY_WRECK_IDS = [
  'wm_mine_wake_map',
  'wm_pd_curtain_blackbox',
  'wm_pattern_offering',
  'wm_ghost_contract',
];
const DENSIFIED_POI_IDS = [
  'poi_tethys_weigh',
  'poi_tethys_customs_log',
  'poi_vesta_slag_relay',
  'poi_vesta_ore_cache',
  'poi_charon_lung_marker',
  'poi_charon_tether_wreck',
  'poi_eunomia_ledger',
  'poi_eunomia_debris',
  'poi_sedna_cadence',
  'poi_orcus_plinth',
  'poi_haumea_probe',
  'poi_eris_dead_drop',
  'poi_proteus_buoy',
  'poi_triton_wreck',
];

const weaponIds = new Set((Array.isArray(WEAPONS) ? WEAPONS : Object.values(WEAPONS)).map((w) => w.id));
const commodityIds = new Set(
  (Array.isArray(COMMODITIES) ? COMMODITIES : Object.values(COMMODITIES)).map((c) => c.id),
);
const enemyById = new Map(ENEMY_TYPES.map((e) => [e.id, e]));
const sectorIds = new Set(SECTORS.map((s) => s.id));

test('variety enemies append unique ids with known AI archetypes and weapon refs', () => {
  const ids = ENEMY_TYPES.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length, 'enemy ids must be unique');
  for (const id of VARIETY_ENEMY_IDS) {
    const def = enemyById.get(id);
    assert.ok(def, `missing enemy ${id}`);
    assert.ok(KNOWN_AI.has(def.aiArchetype), `${id} unknown aiArchetype ${def.aiArchetype}`);
    assert.ok(Array.isArray(def.weapons) && def.weapons.length > 0, `${id} needs weapons`);
    for (const w of def.weapons) {
      assert.ok(weaponIds.has(w.id), `${id} unknown weapon ${w.id}`);
    }
    for (const drop of def.loot?.drops || []) {
      assert.ok(
        commodityIds.has(drop.id) || weaponIds.has(drop.id),
        `${id} loot ref missing: ${drop.id}`,
      );
    }
  }
});

test('variety hunter tricks register and share known verb kinds', () => {
  for (const id of VARIETY_TRICK_IDS) {
    const trick = hunterTrickById(id);
    assert.ok(trick, `missing trick ${id}`);
    assert.equal(trick.id, id);
    assert.ok(trick.verb?.kind, `${id} needs verb.kind`);
    assert.ok(trick.verb?.event, `${id} needs verb.event`);
    assert.ok(HUNTER_TRICK_IDS.includes(id));
    assert.equal(HUNTER_TRICKS[id], trick);
  }
});

test('variety aces are known, unique, and point at live archetypes/tricks', () => {
  assert.equal(NAMED_ACE_IDS.length, 3, 'B10 core ace export stays three ids');
  const known = knownAces();
  const knownIds = known.map((a) => a.id);
  assert.equal(new Set(knownIds).size, knownIds.length, 'ace ids unique');
  for (const id of VARIETY_ACE_IDS) {
    const ace = known.find((a) => a.id === id);
    assert.ok(ace, `missing variety ace ${id}`);
    assert.ok(enemyById.has(ace.returnArchetype), `${id} returnArchetype ${ace.returnArchetype}`);
    assert.ok(enemyById.has(ace.escortArchetype), `${id} escortArchetype ${ace.escortArchetype}`);
  }
});

test('variety encounters export matching ids, positive orders, and live archetypes', () => {
  const orders = ENCOUNTER_MODULES.map((m) => m.encounterOrder);
  assert.equal(new Set(orders).size, orders.length, 'encounterOrder unique');
  for (const id of VARIETY_ENCOUNTER_IDS) {
    const shape = ENCOUNTERS[id];
    assert.ok(shape, `encounter ${id} missing from catalog`);
    assert.equal(shape.id, id);
    const squad = shape.squad?.archetypes || [];
    assert.ok(squad.length > 0, `${id} needs squad archetypes`);
    for (const arch of squad) {
      assert.ok(enemyById.has(arch), `${id} unknown squad archetype ${arch}`);
    }
    // Helios is never a zoneType on these combat/patrol variety packs
    const zones = shape.zoneTypes || [];
    assert.ok(!zones.includes('tutorial'), `${id} must not bind tutorial zones`);
  }
  // Module files on disk for orders 325-329
  const encDir = join(ROOT, '../src/data/encounters');
  const files = readdirSync(encDir).filter((f) => /^\d{3}-/.test(f));
  for (const n of [325, 326, 327, 328, 329]) {
    assert.ok(files.some((f) => f.startsWith(`${n}-`)), `missing encounter file for order ${n}`);
  }
});

test('variety wreck missions resolve and pick deterministically', () => {
  for (const id of VARIETY_WRECK_IDS) {
    const m = wreckMissionById(id);
    assert.ok(m, `missing wreck mission ${id}`);
    assert.equal(m.tag, 'wreck_salvage');
    assert.ok(m.reward_cr > 0);
  }
  const a = pickWreckMission(() => 0);
  const b = pickWreckMission(() => 0);
  assert.equal(a.id, b.id);
  assert.ok(WRECK_MISSIONS.length >= 10);
});

test('densified POIs attach only to existing sectors and valid types', () => {
  const poiTypeSet = new Set(POI_TYPES);
  const found = new Map();
  for (const sector of SECTORS) {
    for (const poi of sector.pois || []) {
      found.set(poi.id, sector.id);
      assert.ok(poiTypeSet.has(poi.type), `poi ${poi.id} bad type ${poi.type}`);
    }
  }
  for (const id of DENSIFIED_POI_IDS) {
    assert.ok(found.has(id), `densified poi ${id} not on any sector`);
    assert.ok(sectorIds.has(found.get(id)));
    assert.notEqual(found.get(id), 'sector_helios_prime', 'no densify on Helios starter');
  }
});

test('Helios safety: starter enemyDensity stays 0', () => {
  const helios = SECTORS.find((s) => s.id === 'sector_helios_prime');
  assert.ok(helios);
  assert.equal(helios.enemyDensity, 0);
});

test('news and barks expansions remain non-empty and deterministic', () => {
  assert.ok(HEADLINE_TEMPLATES.piracy.length >= 6);
  assert.ok(HEADLINE_TEMPLATES.blockade.length >= 6);
  for (const fac of BARK_FACTIONS) {
    assert.ok(BARKS[fac]?.attack?.length >= 1);
  }
  const line = barkFor('faction_reach', 'scan', () => 0);
  assert.equal(typeof line, 'string');
  assert.ok(line.length > 0);
  assert.equal(line, barkFor('faction_reach', 'scan', () => 0));
});

test('rim_poi_lore flavor pack is registered against existing sector ids', () => {
  const pack = FLAVOR_PACKS.rim_poi_lore || FLAVOR_PACKS['rim_poi_lore'];
  // catalog may key by pack id
  const packs = FLAVOR_PACKS;
  const rim = packs.rim_poi_lore || Object.values(packs).find((p) => p.id === 'rim_poi_lore');
  assert.ok(rim, 'rim_poi_lore flavor pack missing');
  assert.equal(rim.kind, 'scan_lore');
  assert.ok(rim.entries.length >= 6);
  for (const entry of rim.entries) {
    const sid = entry.location?.sectorId;
    assert.ok(sectorIds.has(sid), `flavor entry ${entry.id} bad sector ${sid}`);
    assert.notEqual(sid, 'sector_helios_prime');
  }
});
