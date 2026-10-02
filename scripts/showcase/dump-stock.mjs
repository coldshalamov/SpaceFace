// Dump every armory-stock fitting def to JSON for the showcase demo matrix.
import { writeFileSync } from 'node:fs';
const { WEAPONS } = await import('../../src/data/weapons.js');
const { MODULES } = await import('../../src/data/modules.js');
const { SHIPS } = await import('../../src/data/ships.js');
const { isArmoryStock, SWARM_HULL_PRICES } = await import('../../src/data/swarmCatalog.js');
const out = { weapons: [], modules: [], hulls: [] };
for (const w of WEAPONS) if (isArmoryStock(w)) out.weapons.push({ id: w.id, name: w.name, slotType: w.slotType, size: w.size, price: w.price, sentence: w.sentence, mods: Object.keys(w.mods||{}), dmg: w.dmg, rof: w.rof, dps: w.dps, range: w.range, damageType: w.damageType, tracking: w.tracking, statuses: w.statuses, mount: w.mount, intercepts: w.intercepts, energyCost: w.energyCost, heatPerShot: w.heatPerShot, projSpeed: w.projSpeed, impulsePerHit: w.impulsePerHit, armorPierce: w.armorPierce });
for (const m of MODULES) if (isArmoryStock(m)) out.modules.push({ id: m.id, name: m.name, slotType: m.slotType, size: m.size, price: m.price, sentence: m.sentence, mods: Object.keys(m.mods||{}), modsDetail: m.mods, tier: m.tier });
out.hulls = SWARM_HULL_PRICES.map((p, i) => ({ price: p }));
writeFileSync('scripts/showcase/stock.json', JSON.stringify(out, null, 1));
console.log('weapons', out.weapons.length, 'modules', out.modules.length);
