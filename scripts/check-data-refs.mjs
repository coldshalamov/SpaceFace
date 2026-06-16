// Field-name-agnostic cross-reference integrity check: every string value anywhere in the data
// that looks like a namespaced ID (ship_/wpn_/mod_/tech_/cmdty_/beam_/faction_/sector_) must
// resolve to a real entry in the matching registry. Catches dangling refs the export check can't.
import { SHIPS } from '../src/data/ships.js';
import { WEAPONS } from '../src/data/weapons.js';
import { MODULES } from '../src/data/modules.js';
import { TECH_NODES } from '../src/data/tech.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { ORES, ASTEROIDS, BEAMS, RECIPES, FIELDS } from '../src/data/mining.js';
import { SECTORS, STATION_TYPES } from '../src/data/sectors.js';
import { FACTION_META } from '../src/data/factions.js';
import { MISSION_TYPES, STORY_BEATS } from '../src/data/missions.js';
import { DRONES, TRADERS, OUTPOSTS } from '../src/data/automation.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';

function ids(coll) {
  const out = new Set();
  if (Array.isArray(coll)) { for (const x of coll) if (x && x.id) out.add(x.id); }
  else if (coll && typeof coll === 'object') { for (const [k, v] of Object.entries(coll)) { out.add(k); if (v && v.id) out.add(v.id); } }
  return out;
}

const reg = {
  ship_: ids(SHIPS), wpn_: ids(WEAPONS), mod_: ids(MODULES), tech_: ids(TECH_NODES),
  cmdty_: ids(COMMODITIES), beam_: ids(BEAMS), faction_: ids(FACTION_META), sector_: ids(SECTORS),
};
const prefixes = Object.keys(reg);
const problems = [];

function walk(val, path) {
  if (typeof val === 'string') {
    for (const pre of prefixes) {
      if (val.startsWith(pre)) { if (!reg[pre].has(val)) problems.push(`${path} = "${val}" — not in ${pre}* registry`); break; }
    }
  } else if (Array.isArray(val)) {
    val.forEach((v, i) => walk(v, `${path}[${i}]`));
  } else if (val && typeof val === 'object') {
    for (const [k, v] of Object.entries(val)) walk(v, `${path}.${k}`);
  }
}

const all = { SHIPS, WEAPONS, MODULES, TECH_NODES, COMMODITIES, ORES, ASTEROIDS, BEAMS, RECIPES, FIELDS, SECTORS, STATION_TYPES, FACTION_META, MISSION_TYPES, STORY_BEATS, DRONES, TRADERS, OUTPOSTS, ENEMY_TYPES, NEW_GAME };
for (const [k, v] of Object.entries(all)) walk(v, k);

const uniq = [...new Set(problems)];
console.log(`Registries: ${prefixes.map((p) => `${p}${reg[p].size}`).join('  ')}`);
if (uniq.length) {
  console.log(`\n${uniq.length} dangling reference(s):`);
  uniq.slice(0, 100).forEach((p) => console.log('  ' + p));
  process.exit(1);
} else {
  console.log('\nCross-reference integrity OK — all namespaced IDs resolve.');
}
