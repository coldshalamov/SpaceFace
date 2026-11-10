// Recipe for the frozen load fixtures beside it (frozen-v01 / frozen-v12 / frozen-v19.json) and the
// current-version Continue matrix inputs (continue-v19-free / continue-v19-tether.json).
// Run: node test/fixtures/saves/build-frozen.mjs --write
// Without --write this does nothing (so an unscoped `node --test` that globs test/** never rewrites
// a fixture), and with it any target that already exists is SKIPPED. To rebuild one on purpose,
// delete that file first. The tests only ever READ the fixtures.
//
// frozen-v19  : a real capture by the production serializer (SaveSystem.serialize) from a played
//               sim — credits, hold cargo and one accepted contract — at CURRENT_VERSION.
// frozen-v01 / frozen-v12 : the committed ladder shells fb-save-v01 / fb-save-v12 (the oldest and a
//               mid-ladder schema) with the same credits, cargo and contract injected into their own
//               sections. The shells are the old-schema structure; the injected values are what the
//               load test compares. Checksums are re-sealed over the edited data.
// continue-v19-* : the committed v18 Continue captures migrated through the real migration ladder
//               (the 18 -> 19 step) and re-sealed. They are not a fresh physics capture; they exist so
//               the matrix covers the current schema.
//
// FROZEN means frozen: once written, a fixture is never regenerated for a later schema. Add a new
// one instead, so the old file keeps proving the old bytes still load. (The frozen-vNN names below
// are the schema they were captured at; bump the names, not the files, when the schema moves.)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

if (!process.argv.includes('--write')) {
  console.log('build-frozen: nothing to do without --write (existing fixtures are never overwritten).');
  process.exit(0);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');
const load = (rel) => import(pathToFileURL(path.join(root, rel)).href);

const { createSimulation } = await load('src/core/sim.js');
const { fnv1a } = await load('src/save/checksum.js');
const { CURRENT_VERSION } = await load('src/data/saveVersion.js');
const { MIGRATIONS } = await load('src/save/migrations.js');
const systems = [];
for (const [file, name] of [
  ['spawnBudget', 'spawnBudget'], ['cargo', 'cargo'], ['economy', 'economy'], ['factions', 'factions'],
  ['heat', 'heat'], ['encounterDirector', 'encounterDirector'], ['salvage', 'salvage'],
  ['missions', 'missions'], ['world', 'world'],
]) systems.push((await load(`src/systems/${file}.js`))[name]);
systems.push((await load('src/save/saveSystem.js')).save);

const CREDITS = 7300;
const CARGO = { cmdty_refined_metals: 4, cmdty_scrap_metal: 3 };
const SAVED_AT = '2026-10-23T00:00:00.000Z';

function capture() {
  const sim = createSimulation({ seed: 4747, systems });
  const { state } = sim;
  state.mode = 'flight';
  sim.registry.get('world').enterSector('sector_helios_prime');
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 120, z: -80 }, vel: { x: 10, z: 0 }, hull: 140, hullMax: 140, radius: 6,
  });
  state.playerId = player.id;
  sim.runTicks(60);
  state.player.credits = CREDITS;
  const hold = sim.registry.get('cargo');
  for (const [id, qty] of Object.entries(CARGO)) hold.addCargo(id, qty);
  hold.recompute();
  const missions = sim.registry.get('missions');
  const offer = missions.ensureBoard('station_helios').slots.find((slot) => slot && slot.type === 'recon_scan');
  if (!offer || !missions.acceptMission(offer.id)) throw new Error('could not accept a contract to freeze');
  const envelope = JSON.parse(JSON.stringify(sim.registry.get('save').serialize('frozen')));
  envelope.savedAt = SAVED_AT;
  envelope.slot = 'frozen';
  sim.dispose();
  return envelope;
}

function write(name, envelope) {
  if (fs.existsSync(path.join(here, name))) { console.log('exists, kept:', name); return; }
  fs.writeFileSync(path.join(here, name), `${JSON.stringify(envelope, null, 1)}\n`);
  console.log('wrote', name, 'v' + envelope.version);
}

const current = capture();
if (current.version !== CURRENT_VERSION) throw new Error('capture is not at CURRENT_VERSION');
write(`frozen-v${CURRENT_VERSION}.json`, current);

// The injected contract is the producer's own record, as the older shells' missions.active.
const activeRecords = current.data.missions.active
  ? current.data.missions.active
  : (current.data.missions.missions || {}).active;
for (const [shell, name] of [['fb-save-v01.json', 'frozen-v01.json'], ['fb-save-v12.json', 'frozen-v12.json']]) {
  const old = JSON.parse(fs.readFileSync(path.join(here, '..', shell), 'utf8'));
  old.savedAt = SAVED_AT;
  old.slot = 'frozen';
  old.data.player.credits = CREDITS;
  old.data.cargo.items = { ...CARGO };
  old.data.missions.active = JSON.parse(JSON.stringify(activeRecords));
  old.checksum = fnv1a(JSON.stringify(old.data));
  write(name, old);
}

for (const kind of ['free', 'tether']) {
  const captured = JSON.parse(fs.readFileSync(path.join(here, `continue-v18-${kind}.json`), 'utf8'));
  // Only the 18 -> 19 step runs; the rest of the capture (physics bytes included) is left as captured.
  for (const step of MIGRATIONS) if (step.from >= captured.version) step.fn(captured.data);
  captured.version = CURRENT_VERSION;
  captured.checksum = fnv1a(JSON.stringify(captured.data));
  const target = path.join(here, `continue-v${CURRENT_VERSION}-${kind}.json`);
  if (fs.existsSync(target)) { console.log('exists, kept:', path.basename(target)); continue; }
  fs.writeFileSync(target, JSON.stringify(captured));
  console.log('wrote', path.basename(target));
}
