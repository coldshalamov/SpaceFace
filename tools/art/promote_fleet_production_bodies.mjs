import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PARTS = resolve(ROOT, 'assets/ships/parts/wholeships');
const RELEASE = resolve(ROOT, 'assets/ships/release/parts/wholeships');

const SHIPS = [
  ['fleet_player_bodies_v1/drifter', 'drifter'],
  ['fleet_player_bodies_v1/hornet', 'hornet'],
  ['fleet_player_bodies_v1/ironback', 'ironback'],
  ['fleet_player_bodies_v1/bastion', 'bastion'],
  ['fleet_player_bodies_v1/atlas', 'atlas'],
  ['fleet_player_bodies_v1/ranger', 'ranger'],
  ['fleet_player_bodies_v1/warden', 'warden'],
  ['fleet_player_bodies_v1/colossus', 'colossus'],
  ['fleet_player_bodies_v1/leviathan', 'leviathan'],
  ['fleet_player_bodies_v1/ashline_dart', 'ashline_dart'],
  ['fleet_player_bodies_v1/ashline_lode', 'ashline_lode'],
  ['fleet_player_bodies_v1/ashline_rig', 'ashline_rig'],
  ['fleet_player_bodies_v1/helios_lark', 'helios_lark'],
  ['fleet_player_bodies_v1/helios_cradle', 'helios_cradle'],
  ['fleet_player_bodies_v1/helios_span', 'helios_span'],
  ['fleet_player_bodies_v1/ore_barge', 'ore_barge'],
  ['fleet_player_bodies_v1/repair_tender', 'repair_tender'],
  ['fleet_player_bodies_v1/salvage_cutter', 'salvage_cutter'],
  ['fleet_player_bodies_v1/survey_pin', 'survey_pin'],
  ['pelican_production_v1', 'pelican'],
  ['mule_production_v1', 'mule'],
  ['wasp_production_v1', 'wasp'],
];

mkdirSync(PARTS, { recursive: true });
mkdirSync(RELEASE, { recursive: true });

const copied = [];
for (const [family, id] of SHIPS) {
  const lod0 = resolve(ROOT, 'assets/ships', family, 'source/wholeships', `${id}_production_v1_lod0.glb`);
  const lod1 = resolve(ROOT, 'assets/ships', family, 'source/wholeships', `${id}_production_v1_lod1.glb`);
  const lod2 = resolve(ROOT, 'assets/ships', family, 'source/wholeships', `${id}_production_v1_lod2.glb`);
  if (!existsSync(lod0)) throw new Error(`missing ${lod0}`);
  copyFileSync(lod0, resolve(PARTS, `${id}_production_v1.glb`));
  copyFileSync(lod0, resolve(RELEASE, `${id}_production_v1.glb`));
  if (existsSync(lod1)) copyFileSync(lod1, resolve(PARTS, `${id}_production_v1_lod1.glb`));
  if (existsSync(lod2)) copyFileSync(lod2, resolve(PARTS, `${id}_production_v1_lod2.glb`));
  copied.push(id);
}

console.log(`Promoted ${copied.length} production bodies (Hitch untouched): ${copied.join(', ')}`);
