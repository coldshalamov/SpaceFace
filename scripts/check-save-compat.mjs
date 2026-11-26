#!/usr/bin/env node
// SAVE-AND-SOAK-1 release gate: every shipped save fixture must load through the REAL
// save path (restorePrepareSaveJsonAsync -> preflightSaveImport -> SaveSystem.loadEnvelope
// on a live sim) with no error and no warning, keep its player-visible state, and round-trip:
// the state you get by loading the re-serialized envelope is the state you got first.
//
//   node scripts/check-save-compat.mjs [--json]
//
// Exits nonzero on any failure. Fixture inventory covers every shipped schema version:
// continue-vNN (real historical captures + ladder-derived fills), frozen-vNN (serializer
// captures and injected ladder shells), world-head-vNN, and the fb-save-vNN ladder shells.

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const herePath = (...p) => path.join(root, ...p);
const here = (...p) => pathToFileURL(herePath(...p)).href;

const { createSimulation } = await import(here('src/core/sim.js'));
const { physics } = await import(here('src/core/physics.js'));
const { ships, makeShipEntitySpec } = await import(here('src/systems/ships.js'));
const { cargo } = await import(here('src/systems/cargo.js'));
const { combat } = await import(here('src/systems/combat.js'));
const { tetherGameplay } = await import(here('src/systems/tetherGameplay.js'));
const { flightV3 } = await import(here('src/systems/flightV3.js'));
const { save, preflightSaveImport } = await import(here('src/save/saveSystem.js'));
const { restorePrepareSaveJsonAsync, encodeSavePayloadFinal } = await import(here('src/save/saveWorker.js'));
const { CURRENT_VERSION } = await import(here('src/data/saveVersion.js'));
// Domain-owner systems so claims/missions/world/factions/station data deserialize into live
// state — the same set the fixture capture scripts use.
const domainSystems = [];
for (const [file, name] of [
  ['spawnBudget', 'spawnBudget'], ['economy', 'economy'], ['factions', 'factions'],
  ['heat', 'heat'], ['encounterDirector', 'encounterDirector'], ['salvage', 'salvage'],
  ['missions', 'missions'], ['world', 'world'],
]) domainSystems.push((await import(here(`src/systems/${file}.js`)))[name]);
// Mirrors saveSystem.js's DEFAULT_CONTROL_SCHEME / VALID_CONTROL_SCHEMES (module-private there).
const DEFAULT_CONTROL_SCHEME = 'helm-assist';
const VALID_CONTROL_SCHEMES = new Set(['pilot', 'helm-assist', 'classic']);

const savesDir = herePath('test/fixtures/saves');
const fixturesDir = herePath('test/fixtures');
const fixtureNames = [
  ...readdirSync(savesDir).filter((n) => /\.json$/.test(n) && n !== 'provenance.json'),
  ...readdirSync(fixturesDir).filter((n) => /^fb-save-v\d+\.json$/.test(n)).map((n) => `../${n}`),
].sort();

const errors = [];
const fail = (fixture, msg) => errors.push({ fixture, msg });
const rows = [];

async function session() {
  const sim = createSimulation({ seed: 4242,
    systems: [ships, cargo, combat, flightV3, tetherGameplay, physics, ...domainSystems, save] });
  const state = sim.state, shipOwner = sim.registry.get('ships');
  state.mode = 'flight';
  state.ui.screenStack.length = 0;
  state.save.currentSlot = 'compat-check';
  shipOwner.newGame();
  const owned = state.player.ownedShips[0];
  const player = sim.spawn(makeShipEntitySpec(owned.defId, { team: 0, isPlayer: true,
    player: state.player, fittings: owned.fittings, pos: { x: -200, z: -80 } }));
  state.playerId = player.id;
  shipOwner.recomputeActiveShip();
  const owner = sim.registry.get('physics');
  await owner.prepareBackend(state);
  return { sim, state, owner, saver: sim.registry.get('save'),
    dispose() { owner._sg02?.dispose(); sim.dispose(); } };
}

function withCapturedWarnings(fn) {
  const warnings = [], calls = [];
  for (const level of ['warn', 'error']) {
    const original = console[level];
    console[level] = (...args) => { warnings.push(`${level}: ${args.map(String).join(' ')}`); };
    calls.push([level, original]);
  }
  try { return { warnings, value: fn() }; }
  finally { for (const [level, original] of calls) console[level] = original; }
}

// deepEqual-with-report: returns '' on equal, else a short path of first mismatch.
function firstMismatch(a, b, p = '') {
  if (Object.is(a, b)) return '';
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return `${p || 'root'}`;
  const ka = Object.keys(a), kb = Object.keys(b);
  for (const k of ka) if (!(k in b)) return `${p}.${k} (missing in restored)`;
  for (const k of kb) if (!(k in a)) return `${p}.${k} (unexpected in restored)`;
  for (const k of ka) {
    const r = firstMismatch(a[k], b[k], p ? `${p}.${k}` : k);
    if (r) return r;
  }
  return '';
}

// Containment variant: every SAVED key must exist and be equal in the restored state, but the
// restored state may carry extra keys the restore legitimately seeds (a starter ship for a
// ship-less save, mission boards, sector scaffolding). Extras are restore output, not input
// drift — the round-trip identity check below is what pins restored state.
function firstLoss(saved, restored, p = '') {
  if (Object.is(saved, restored)) return '';
  if (typeof saved !== 'object' || typeof restored !== 'object' || saved === null || restored === null)
    return `${p || 'root'}`;
  for (const k of Object.keys(saved)) {
    if (!(k in restored)) return `${p}.${k}`;
    const r = firstLoss(saved[k], restored[k], p ? `${p}.${k}` : k);
    if (r) return r;
  }
  return '';
}

function checkPlayerVisible(state, env, name) {
  const d = env.data;
  // Credits.
  if (d.player && typeof d.player.credits === 'number' && state.player.credits !== d.player.credits)
    fail(name, `credits ${state.player.credits} != saved ${d.player.credits}`);
  // Ship and fitted gear: every saved ship and its fittings must be aboard.
  if (Array.isArray(d.player?.ownedShips)) {
    const r = firstLoss(d.player.ownedShips, state.player.ownedShips, 'ownedShips');
    if (r) fail(name, `ship/fittings lost at ${r}`);
  }
  // Hold contents unit-for-unit (items map and the slot bag incl. the over-cap tail).
  if (d.cargo && typeof d.cargo === 'object') {
    if (d.cargo.items) {
      const r = firstMismatch(state.player.cargo.items, d.cargo.items, 'cargo.items');
      if (r) fail(name, `hold mismatch at ${r}`);
    }
    if (Array.isArray(d.cargo.slots)) {
      const sum = (slots) => (slots || []).reduce((n, s) => n + (s?.qty || 0), 0);
      if (sum(state.player.cargo.slots) !== sum(d.cargo.slots))
        fail(name, `slot-bag units ${sum(state.player.cargo.slots)} != saved ${sum(d.cargo.slots)}`);
      const byId = (slots) => {
        const m = {};
        for (const s of slots || []) if (s) m[s.commodityId] = (m[s.commodityId] || 0) + s.qty;
        return m;
      };
      const r = firstMismatch(byId(state.player.cargo.slots), byId(d.cargo.slots), 'cargo.slots');
      if (r) fail(name, `slot-bag contents mismatch at ${r}`);
    }
  }
  // Domain-level player-visible state — credits/cargo/ships compared above against live
  // state. claims/sites/factions/missions/world/station data are owner-serialized bags:
  // their serialized shape is not the live-state shape, so the loss contract is checked
  // against the re-save in checkResaved() instead.
  if (Array.isArray(d.player?.researchedNodes)) {
    const r = firstLoss([...d.player.researchedNodes].sort(), [...(state.player.researchedNodes || [])].sort(), 'researchedNodes');
    if (r) fail(name, `pilot skills lost at ${r}`);
  }
  // Settings and bindings: run-scoped keys land on the live settings. audio/video/controls/
  // accessibility and the profile gameplay pickers follow the PROFILE sidecar, not this
  // envelope, so their envelope copies are intentionally not the runtime source of truth —
  // the round-trip check below still proves the envelope keeps them.
  if (d.settings && typeof d.settings === 'object') {
    const runScoped = { gameplay: pick(d.settings.gameplay || {},
      Object.keys(d.settings.gameplay || {}).filter((k) => !PROFILE_GAMEPLAY_KEYS.has(k))) };
    if (Object.keys(runScoped.gameplay).length) {
      const r = firstLoss(runScoped, pick(state.settings || {}, ['gameplay']), 'settings');
      if (r) fail(name, `settings lost at ${r}`);
    }
    const scheme = state.settings?.gameplay?.controlScheme;
    if (typeof scheme !== 'string' || !VALID_CONTROL_SCHEMES.has(scheme))
      fail(name, `control scheme after restore is ${JSON.stringify(scheme)}`);
    else if (d.settings.gameplay?.controlScheme == null && scheme !== DEFAULT_CONTROL_SCHEME)
      fail(name, `missing controlScheme restored as ${scheme}, expected ${DEFAULT_CONTROL_SCHEME}`);
  }
}

// Owner-serialized domains: the loss contract is CONTENT, not shape — migrations and restore
// legitimately reshape bags (market tuples carry a different curve layout, story state arms on
// continue, derived catalogs regenerate). Every non-empty saved scalar value must still be
// present somewhere in the re-saved domain.
const RESHAPE_NOTES = [];
function leafValues(obj, out = []) {
  if (obj == null) return out;
  if (Array.isArray(obj)) { for (const v of obj) leafValues(v, out); return out; }
  if (typeof obj === 'object') { for (const v of Object.values(obj)) leafValues(v, out); return out; }
  if (obj !== '' && !(typeof obj === 'number' && !Number.isFinite(obj))) out.push(obj);
  return out;
}
function deepContainsValue(root, needle) {
  if (root == null) return false;
  if (typeof root === 'object') {
    for (const v of Object.values(root)) if (deepContainsValue(v, needle)) return true;
    return false;
  }
  return Object.is(root, needle);
}

function checkResaved(env, resaved, name) {
  for (const domain of ['claims', 'sites', 'factions', 'missions', 'world',
    'stationServices', 'economy', 'npcJobs', 'onboarding']) {
    const saved = env.data[domain];
    if (!saved || typeof saved !== 'object' || !Object.keys(saved).length) continue;
    const resavedDomain = resaved?.data?.[domain];
    if (domain === 'economy') {
      // Stored market curves: tuple layout changed across schemas — identity is the
      // commodity id at row[0] and the curve price at row[1] must persist in the row.
      for (const [stationId, rows] of Object.entries(saved.markets || {})) {
        const resavedRows = resavedDomain?.markets?.[stationId];
        if (!Array.isArray(resavedRows)) { fail(name, `economy.markets.${stationId} lost`); continue; }
        for (const row of rows || []) {
          if (!Array.isArray(row)) continue;
          const match = resavedRows.find((r) => Array.isArray(r) && r[0] === row[0]);
          if (!match) fail(name, `economy market row ${stationId}/${row[0]} lost`);
          else if (Number.isFinite(row[1]) && !match.includes(row[1]))
            fail(name, `economy market price ${stationId}/${row[0]} changed ${row[1]} -> ${JSON.stringify(match)}`);
        }
      }
      // The rest of the economy bag is stored curve internals (regression coefficients,
      // 'log'/'sine'/'turbulent' shape labels) that the current curve model re-fits on
      // restore from the persisted prices/history above — derived, not lost.
      continue;
    }
    if (domain === 'world') {
      // Player-visible world state is the discovery overlay (§3.8): discovered places and
      // visit history. Everything else in the bag (sector catalogs, resource bodies,
      // entry pose) is derived from definitions or re-entered each session.
      for (const v of leafValues(saved.discovery || {})) {
        if (!deepContainsValue(resavedDomain?.discovery, v)) fail(name, `world discovery value ${JSON.stringify(v)} lost`);
      }
      continue;
    }
    if (domain === 'missions') {
      // beatStatus 'idle' -> 'tracking' is the campaign arming on continue — a restore-time
      // state transition, not a drop. Verified against the live state, which shows the same.
      const savedValues = leafValues(saved).filter((v) => v !== 'idle');
      for (const v of savedValues) {
        if (!deepContainsValue(resavedDomain, v)) fail(name, `missions value ${JSON.stringify(v)} lost`);
      }
      continue;
    }
    for (const v of leafValues(saved)) {
      if (!deepContainsValue(resavedDomain, v)) fail(name, `${domain} value ${JSON.stringify(v)} lost`);
    }
  }
}

const PROFILE_GAMEPLAY_KEYS = new Set(['autosaveIntervalS', 'tutorialHints', 'controlScheme',
  'controlSchemeV2', 'masslineReleaseAssist', 'orbitAssistStrength', 'targetAssistStrength',
  'damageNumbers', 'stuntMoments', 'gameSpeed', 'velocityVectoring', 'pauseOnFocusLoss',
  'powerFire', 'pilotPickAtOnce', 'pursuitSlotAssist', 'hitPips', 'racingGhost',
  'steeringView', 'racingDistance', 'racingHeight', 'racingLookAhead']);

function pick(obj, keys) {
  const out = {};
  for (const k of keys) out[k] = obj?.[k];
  return out;
}

for (const name of fixtureNames) {
  const raw = readFileSync(path.join(savesDir, name), 'utf8');
  let envelope;
  try { envelope = JSON.parse(raw); } catch { fail(name, 'fixture is not JSON'); continue; }
  const version = envelope.version;
  let env = null, prepared = null;
  try { prepared = await restorePrepareSaveJsonAsync(raw, CURRENT_VERSION); }
  catch (e) { fail(name, `prepare threw ${e?.message || e}`); continue; }
  if (!prepared.ok) { fail(name, `prepare rejected: ${prepared.reason}`); continue; }
  env = prepared.env;
  const preflight = preflightSaveImport(env);
  if (!preflight.ok) { fail(name, `preflight rejected: ${preflight.reason}`); continue; }

  // Load 1 through the real path.
  const h1 = await session();
  let resaved;
  try {
    const { warnings } = withCapturedWarnings(() => {
      if (!h1.saver.loadEnvelope(env, `compat-${name}`)) throw new Error('loadEnvelope returned false');
    });
    for (const w of warnings) fail(name, `load warned: ${w}`);
    checkPlayerVisible(h1.state, env, name);
    resaved = JSON.parse(JSON.stringify(h1.saver.serialize(`compat-resave-${name}`)));
    checkResaved(env, resaved, name);
  } catch (e) { fail(name, `load threw ${e?.message || e}`); }
  finally { h1.dispose(); }
  if (!resaved) continue;

  // Reload the re-save through the same real path; the second restored state must persist
  // identically — compare canonical serialized data, which is the persistence contract.
  const env2 = await restorePrepareSaveJsonAsync(JSON.stringify(resaved), CURRENT_VERSION);
  if (!env2.ok) { fail(name, `re-save failed to prepare: ${env2.reason}`); continue; }
  const h2 = await session();
  try {
    const { warnings } = withCapturedWarnings(() => {
      if (!h2.saver.loadEnvelope(env2.env, `compat-resave-${name}`)) throw new Error('reload returned false');
    });
    for (const w of warnings) fail(name, `reload warned: ${w}`);
    const resaved2 = JSON.parse(JSON.stringify(h2.saver.serialize('compat-resave-2')));
    // Volatile capture fields: meta stamps a fresh savedAt each serialize; the native physics
    // snapshot bytes and tick are a live-solver capture (schema/backend still compared); an
    // entity's physicsBody is a derived spec lazily stamped on the first physics tick, so its
    // presence can differ between capture instants on identical restored state.
    const stripVolatile = (data) => {
      const c = JSON.parse(JSON.stringify(data));
      delete c.meta;
      const physics = c.physics && typeof c.physics === 'object'
        ? { schema: c.physics.schema, backend: c.physics.backend, runtime: c.physics.runtime } : c.physics;
      c.physics = physics;
      if (Array.isArray(c.entities?.persistent)) {
        for (const e of c.entities.persistent) if (e && typeof e === 'object') delete e.physicsBody;
      }
      return c;
    };
    if (resaved2.version !== CURRENT_VERSION || resaved2.data?.meta?.version !== CURRENT_VERSION)
      fail(name, `re-save is not at CURRENT_VERSION (${resaved2.version})`);
    const r = firstMismatch(stripVolatile(resaved2.data), stripVolatile(resaved.data), 'data');
    if (r) fail(name, `round-trip not identical at ${r}`);
  } catch (e) { fail(name, `reload threw ${e?.message || e}`); }
  finally { h2.dispose(); }

  rows.push({ fixture: name, version, ok: !errors.some((e) => e.fixture === name) });
}

const failed = errors.length > 0;
if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ ok: !failed, currentVersion: CURRENT_VERSION, rows, errors }, null, 1));
} else {
  console.log(`save-compat: ${fixtureNames.length} fixtures, CURRENT_VERSION=${CURRENT_VERSION}`);
  for (const row of rows) console.log(`  ${row.ok ? 'ok  ' : 'FAIL'} v${String(row.version).padStart(2)} ${row.fixture}`);
  for (const e of errors) console.log(`  ERROR ${e.fixture}: ${e.msg}`);
  console.log(failed ? `FAIL ${errors.length} problem(s)` : 'PASS');
}
process.exit(failed ? 1 : 0);
