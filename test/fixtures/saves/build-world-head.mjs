// Recipe for world-head-v23.json: a real production-serializer capture taken at the 2026-11-20
// checkpoint (d480208bdb), BEFORE the WORLD persistence slices (ambient cast ledger, rock regrowth).
// It holds the world state those slices change the meaning of:
//   - Pallas Drift visited, its ambient hostiles rolled, one of them killed (a tombstone), and the
//     sector then left (survivors captured as ordinary 180 s memory records);
//   - Helios starter-belt rocks touched: one half-mined, one mined out (resource-body ledger rows).
// Run (only to rebuild on purpose; existing files are kept): node test/fixtures/saves/build-world-head.mjs --write
// FROZEN: never regenerate this file for a later schema — it proves today's saves still load.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

if (!process.argv.includes('--write')) {
  console.log('build-world-head: nothing to do without --write.');
  process.exit(0);
}
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');
const load = (rel) => import(pathToFileURL(path.join(root, rel)).href);
const target = path.join(here, 'world-head-v23.json');
if (fs.existsSync(target)) { console.log('exists, kept:', path.basename(target)); process.exit(0); }

const { createSimulation } = await load('src/core/sim.js');
const { persistTouchedResourceBody } = await load('src/systems/mining.js');
const systems = [];
for (const [file, name] of [['spawnBudget', 'spawnBudget'], ['cargo', 'cargo'], ['economy', 'economy'],
  ['factions', 'factions'], ['heat', 'heat'], ['salvage', 'salvage'], ['missions', 'missions'],
  ['fieldDepletion', 'fieldDepletion'], ['world', 'world']]) systems.push((await load(`src/systems/${file}.js`))[name]);
systems.push((await load('src/save/saveSystem.js')).save);

const sim = createSimulation({ seed: 4747, systems });
const { state } = sim;
state.mode = 'flight';
const world = sim.registry.get('world');
const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, hull: 140, hullMax: 140, radius: 6 });
state.playerId = player.id;

const PALLAS = 'sector_pallas_drift';
world.enterSector(PALLAS);
sim.runTicks(60);
const hostiles = [...state.entities.values()].filter((e) => e.alive !== false && e.type === 'ship'
  && e.id !== state.playerId && (e.homeSectorId === PALLAS || e.data?.homeSectorId === PALLAS) && e.data?.ai);
if (hostiles.length < 2) throw new Error(`expected a Pallas ambient cast, got ${hostiles.length}`);
const victim = hostiles[0];
victim.hull = 0; victim.alive = false;
sim.bus.emit('entity:killed', { id: victim.id, killerId: state.playerId });
sim.runTicks(10);

world.enterSector('sector_helios_prime');
sim.runTicks(60);
// Touch two starter-belt rocks through the mining persistence seam (promote, then write).
const { promoteAsteroidFieldRock } = await load('src/world/asteroidField.js');
const rows = [...state.world.asteroidField.byId.values()]
  .filter((r) => r && r.alive !== false && r.data && r.data.fieldId === 'f_helios_starter' && !r.data.authoredBoulderId)
  .sort((a, b) => String(a.data.asteroidSlotId).localeCompare(String(b.data.asteroidSlotId)));
const half = promoteAsteroidFieldRock(state, rows[0].id, sim.helpers || world.helpers, 'fixture');
const spent = promoteAsteroidFieldRock(state, rows[1].id, sim.helpers || world.helpers, 'fixture');
half.data.oreHP = Math.round(half.data.oreHPMax / 2); half.hull = half.data.oreHP;
half.data.pctEjected = 0.5; half.data.miningWear = 0.5; half.data.lastMinedT = state.simTime;
persistTouchedResourceBody(state, half);
spent.data.oreHP = 0; spent.hull = 0; spent.data.pctEjected = 1; spent.data.miningWear = 1;
spent.data.depletedAtT = state.simTime; spent.data.lastMinedT = state.simTime; spent.alive = false;
persistTouchedResourceBody(state, spent);
sim.runTicks(60);

const envelope = JSON.parse(JSON.stringify(sim.registry.get('save').serialize('world-head')));
envelope.savedAt = '2026-11-20T00:00:00.000Z';
envelope.slot = 'world-head';
envelope._fixture = { pallasVictimRecordId: victim.data.worldRecordId,
  halfRockSlot: half.data.asteroidSlotId, spentRockSlot: spent.data.asteroidSlotId, fieldId: 'f_helios_starter' };
fs.writeFileSync(target, `${JSON.stringify(envelope)}\n`);
console.log('wrote', path.basename(target), 'v' + envelope.version, 'records', Object.keys(envelope.data.world.records.byId).length,
  'bodies', Object.keys(envelope.data.world.resourceBodies.byId || {}).length);
sim.dispose();
