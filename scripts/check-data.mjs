// Verifies every canonical data module imports cleanly in Node (no three/DOM deps) and exposes
// its required named exports. Run: `node scripts/check-data.mjs` (exit 1 on any failure).
const checks = [
  ['../src/data/saveVersion.js', ['CURRENT_VERSION']],
  ['../src/data/ships.js', ['SHIPS']],
  ['../src/data/weapons.js', ['WEAPONS']],
  ['../src/data/modules.js', ['MODULES']],
  ['../src/data/tech.js', ['TECH_NODES']],
  ['../src/data/commodities.js', ['COMMODITIES']],
  ['../src/data/mining.js', ['ORES', 'ASTEROIDS', 'BEAMS', 'RECIPES', 'FIELDS']],
  ['../src/data/sectors.js', ['SECTORS', 'STATION_TYPES', 'HAZARD_TYPES', 'POI_TYPES', 'dangerTier']],
  ['../src/data/factions.js', ['FACTION_META']],
  ['../src/data/missions.js', ['MISSION_TYPES', 'STORY_BEATS', 'OFFER_MIX', 'MISSION_TUNING']],
  ['../src/data/automation.js', ['DRONES', 'TRADERS', 'OUTPOSTS', 'AUTO_BALANCE']],
  ['../src/data/enemies.js', ['ENEMY_TYPES']],
  ['../src/data/audioRecipes.js', ['RECIPES', 'MUSIC_STEMS']],
  ['../src/data/palettes.js', ['FACTION_PALETTES', 'SECTOR_PALETTES', 'SHIP_RECIPES']],
  ['../src/data/newGameDefaults.js', ['NEW_GAME']],
];

let ok = 0, fail = 0;
for (const [path, names] of checks) {
  try {
    const m = await import(path);
    const missing = names.filter((e) => !(e in m));
    if (missing.length) { console.log(`FAIL ${path} — missing exports: ${missing.join(', ')}`); fail++; continue; }
    const counts = names.map((e) => {
      const v = m[e];
      const n = Array.isArray(v) ? v.length : (v && typeof v === 'object' ? Object.keys(v).length : typeof v);
      return `${e}:${n}`;
    }).join('  ');
    console.log(`ok   ${path} — ${counts}`); ok++;
  } catch (err) {
    console.log(`ERR  ${path} — ${err.message}`); fail++;
  }
}
console.log(`\n${ok} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
