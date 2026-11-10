// Child process. Installs a user-content payload, then imports the live merge sites.
// No second validator. stdout is one JSON object.

import { scanUserContentDir } from '../../../scripts/lib/userContentStore.cjs';

const dir = process.argv[2];

async function main() {
  if (!dir) {
    console.log(JSON.stringify({ ok: false, error: 'content directory required' }));
    process.exit(2);
  }
  const payload = scanUserContentDir(dir);
  globalThis.__SF_USER_MODS__ = payload;
  const { listUserMods } = await import('../../../src/data/userContent.js');
  const weapons = await import('../../../src/data/weapons.js');
  const modules = await import('../../../src/data/modules.js');
  const encounters = await import('../../../src/data/encounters.js');
  const zones = await import('../../../src/data/sectorZones.js');
  const mods = listUserMods();
  const accepted = {
    weapons: weapons.WEAPONS.map((row) => row.id).filter((id) => id.startsWith('wpn_dock_') || id.startsWith('unique_dock_')),
    modules: modules.MODULES.map((row) => row.id).filter((id) => id.startsWith('mod_dock_') || id.startsWith('unique_dock_')),
    encounters: Object.keys(encounters.ENCOUNTERS).filter((id) => id.startsWith('dock_')),
    places: [],
  };
  for (const list of Object.values(zones.SECTOR_ZONES)) {
    if (!Array.isArray(list)) continue;
    for (const zone of list) {
      if (zone && typeof zone.id === 'string' && zone.id.startsWith('zone_dock_')) accepted.places.push(zone.id);
    }
  }
  const rejected = mods.reduce((sum, mod) => sum + mod.rejected.length + mod.errors.length, 0);
  const loaded = mods.length > 0 && mods.every((mod) => mod.status === 'loaded');
  console.log(JSON.stringify({
    ok: loaded && rejected === 0,
    mods,
    accepted,
    payloadMods: payload.mods.map((mod) => ({
      id: mod.id,
      parseErrors: mod.parseErrors,
      counts: {
        weapons: mod.content.weapons.length,
        modules: mod.content.modules.length,
        encounters: mod.content.encounters.length,
        places: mod.content.places.length,
      },
    })),
  }));
  process.exit(loaded && rejected === 0 ? 0 : 1);
}

main().catch((error) => {
  console.log(JSON.stringify({ ok: false, error: error && error.message ? error.message : String(error) }));
  process.exit(2);
});
