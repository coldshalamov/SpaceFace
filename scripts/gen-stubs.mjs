// One-shot scaffolder: writes safe STUB system modules so the whole registry boots before any
// subsystem is implemented (advisor guidance: fill-in-stubs, not wire-in-90-files).
// Each stub exports a named system object matching its registry import. Re-running is safe ONLY
// for files that don't yet exist — it will NOT overwrite an implemented system.
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const header = (name) =>
  `// ${name} system — STUB. Implemented later against ARCHITECTURE.md (the contract) + design/specs/.\n` +
  `// Safe no-op now so the registry boots; do not change the system interface when filling it in.\n`;

const sys = (name, extra = '') =>
  header(name) +
  `export const ${name} = {\n` +
  `  name: '${name}',\n` +
  `  init(ctx) { this.state = ctx.state; this.bus = ctx.bus; this.helpers = ctx.helpers; },\n` +
  `  update(dt, state) {},\n` +
  `};\n` + extra;

const shipsExtra = `
// Safe default derived stat block so flight/combat/render never read undefined before ships is real.
export function getDerivedStats(/* shipDef, fittings, player */) {
  return {
    hull: 120, hullMax: 120, armorHp: 0, armorMax: 0, armorFlat: 0,
    shield: 60, shieldMax: 60, shieldRegenRate: 6, shieldRegenDelay: 3,
    cap: 80, capMax: 80, capRegen: 12,
    thrust: 48, turnRate: 3.0, maxSpeed: 135, drag: 1.25, mass: 18,
    cargoCap: 40, slots: [], hardpoints: [], modules: [],
  };
}
`;

const cargoExtra = `
// Safe helpers other systems may call before cargo is real (no-ops that don't throw).
export function addCargo(state, commodityId, qty) { return 0; }
export function removeCargo(state, commodityId, qty) { return 0; }
`;

const files = {
  'src/systems/ai.js': sys('ai'),
  'src/systems/weapons.js': sys('weapons'),
  'src/systems/combat.js': sys('combat'),
  'src/systems/mining.js': sys('mining'),
  'src/systems/cargo.js': sys('cargo', cargoExtra),
  'src/systems/economy.js': sys('economy'),
  'src/systems/automation.js': sys('automation'),
  'src/systems/world.js': sys('world'),
  'src/systems/factions.js': sys('factions'),
  'src/systems/missions.js': sys('missions'),
  'src/systems/ships.js': sys('ships', shipsExtra),
  'src/render/vfx.js': sys('vfx'),
  'src/audio/audioSystem.js': sys('audio'),
  'src/ui/uiRoot.js': sys('ui'),
  'src/save/saveSystem.js': sys('save'),
};

let wrote = 0, skipped = 0;
for (const [p, c] of Object.entries(files)) {
  if (existsSync(p)) { skipped++; continue; }
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, c);
  wrote++;
}
console.log(`stubs: wrote ${wrote}, skipped(existing) ${skipped}`);
