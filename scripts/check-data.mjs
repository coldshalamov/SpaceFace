// Verifies every canonical data module imports cleanly in Node (no three/DOM deps) and exposes
// its required named exports. Run: `node scripts/check-data.mjs` (exit 1 on any failure).
//
// `--user-content-dir=<dir>` (PQ-172.00): scans a user content ("mods") directory and installs
// the payload on globalThis.__SF_USER_MODS__ BEFORE any data module is imported — the same path
// the game server's index.html injection takes. The whole check list then runs against the
// merged tables, so mod records are held to exactly the contracts shipped data satisfies
// (imports clean, refs resolve through check-data-refs when run with the same flag). Afterwards
// the per-mod report is asserted clean: any parse error or refused record fails the run, because
// pointing the checker at a directory means asking whether that content would load.
import { createRequire } from 'node:module';

const checks = [
  ['../src/data/saveVersion.js', ['CURRENT_VERSION']],
  ['../src/data/ships.js', ['SHIPS']],
  ['../src/data/weapons.js', ['WEAPONS']],
  ['../src/data/modules.js', ['MODULES']],
  ['../src/data/tech.js', ['TECH_NODES']],
  ['../src/data/commodities.js', ['COMMODITIES', 'COMMODITY_FLAVOR']],
  ['../src/data/commodityFlavor.js', ['COMMODITY_FLAVOR']],
  ['../src/data/mining.js', ['ORES', 'ASTEROIDS', 'BEAMS', 'RECIPES', 'FIELDS']],
  ['../src/data/sectors.js', ['SECTORS', 'STATION_TYPES', 'HAZARD_TYPES', 'POI_TYPES', 'dangerTier']],
  ['../src/data/factions.js', ['FACTION_META']],
  ['../src/data/missions.js', ['MISSION_TYPES', 'STORY_BEATS', 'OFFER_MIX', 'MISSION_TUNING', 'offerMixWeight', 'validateOfferMix']],
  ['../src/data/automation.js', ['DRONES', 'TRADERS', 'OUTPOSTS', 'AUTO_BALANCE']],
  ['../src/data/enemies.js', ['ENEMY_TYPES']],
  ['../src/data/audioRecipes.js', ['RECIPES', 'MUSIC_STEMS']],
  ['../src/data/palettes.js', ['FACTION_PALETTES', 'SECTOR_PALETTES', 'SHIP_RECIPES']],
  ['../src/data/newGameDefaults.js', ['NEW_GAME']],
  ['../src/data/combatDefs.js', ['ACTION_DEFS', 'STATUS_DEFS', 'SUBSYSTEM_DEFS', 'ATTACHMENT_DEFS', 'COMBAT_PROFILES']],
];

const argv = process.argv.slice(2);
const ucEq = argv.find((a) => a.startsWith('--user-content-dir='));
const ucIdx = argv.indexOf('--user-content-dir');
const userContentDir = ucEq ? ucEq.slice('--user-content-dir='.length)
  : ucIdx >= 0 ? argv[ucIdx + 1] ?? ''
  : null;
if (userContentDir != null) {
  if (!userContentDir) {
    console.log('FAIL --user-content-dir must name a directory');
    process.exit(1);
  }
  const require = createRequire(import.meta.url);
  const { scanUserContentDir } = require('./lib/userContentStore.cjs');
  globalThis.__SF_USER_MODS__ = scanUserContentDir(userContentDir);
  console.log(`user content dir: ${userContentDir}`);
}

let ok = 0, fail = 0;
for (const [path, names] of checks) {
  try {
    const m = await import(path);
    const missing = names.filter((e) => !(e in m));
    if (missing.length) { console.log(`FAIL ${path} — missing exports: ${missing.join(', ')}`); fail++; continue; }
    if (path.endsWith('missions.js')) {
      const mix = typeof m.validateOfferMix === 'function' ? m.validateOfferMix() : { ok: false, errors: ['validateOfferMix missing'] };
      if (!mix.ok) { console.log(`FAIL ${path} — OFFER_MIX named weights: ${mix.errors.join('; ')}`); fail++; continue; }
      const pulls = typeof m.validateEndgamePullCatalog === 'function' ? m.validateEndgamePullCatalog() : { ok: true, errors: [] };
      if (!pulls.ok) { console.log(`FAIL ${path} — endgame pulls: ${pulls.errors.join('; ')}`); fail++; continue; }
    }
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

if (userContentDir != null) {
  // The merge surface itself: encounters and zone places merge in modules the canonical list
  // does not import directly, so verify them here (merged tables are what the game boots with).
  const [{ listUserMods, userContentDirLabel }, encounters, sectorZones] = await Promise.all([
    import('../src/data/userContent.js'),
    import('../src/data/encounters.js'),
    import('../src/data/sectorZones.js'),
  ]);
  const mods = listUserMods();
  console.log(`\nuser content (${userContentDirLabel() || userContentDir}):`);
  console.log(`  merged tables: ENCOUNTERS=${Object.keys(encounters.ENCOUNTERS).length}  `
    + `sectors=${Object.keys(sectorZones.SECTOR_ZONES).length}`);
  if (!mods.length) {
    console.log('FAIL no mods found in the mounted directory (expected at least one manifest)');
    fail++;
  }
  for (const mod of mods) {
    const counts = Object.entries(mod.counts).filter(([, n]) => n > 0)
      .map(([k, n]) => `${n} ${k}`).join(', ') || 'no content';
    const line = `  ${mod.name} (${mod.id}) v${mod.version || '?'} — ${mod.status}: ${counts}`;
    if (mod.status === 'loaded') { console.log(`ok ${line}`); ok++; }
    else {
      console.log(`FAIL ${line}`);
      for (const e of mod.errors) console.log(`       error: ${e}`);
      for (const r of mod.rejected) console.log(`       refused: ${r}`);
      fail++;
    }
  }
}

console.log(`\n${ok} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
