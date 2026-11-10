// Debug probe: boot the same production runtime as a6OpeningSlice and find what
// flings the player to ~200k units during the idle wait_raid window.
// Instruments: every bus event, every entity spawn (entityList diff), player
// speed trace. Dumps the last 3 s of context when the player exceeds 300 u/s.
import { createAuthoritativeRuntime } from '../../src/runtime/createAuthoritativeRuntime.js';
import { getNodeSystemFactoryTable } from '../../src/runtime/nodeSystemFactoryTable.js';
import { applyFeatureConfigToMaps, restoreFeatureMaps, snapshotFeatureMaps } from '../../src/data/featureFlags.js';
import { makeShipEntitySpec, fittingsFromDefaultModules } from '../../src/systems/ships.js';
import { NEW_GAME } from '../../src/data/newGameDefaults.js';

const DT = 1 / 60;
const lookup = getNodeSystemFactoryTable();
lookup.set('input', { name: 'input', init() {}, update() {}, destroy() {} });
const runtime = await createAuthoritativeRuntime({
  profileId: 'production', nodeSafeOnly: true, seed: 4242, systemLookup: lookup,
  exclusions: ['input:no-op-headless'],
});
const { state, bus } = runtime;
const withFeatures = (fn) => {
  const prev = snapshotFeatureMaps();
  applyFeatureConfigToMaps(runtime?.config?.features);
  try { return fn(); } finally { restoreFeatureMaps(prev); }
};

const eventLog = [];
const origEmit = bus.emit.bind(bus);
bus.emit = (ev, p) => {
  if (eventLog.length < 40000) {
    try { eventLog.push({ t: state.simTime, ev, p: p && JSON.parse(JSON.stringify(p)).slice(0, 400) }); }
    catch { eventLog.push({ t: state.simTime, ev }); }
  }
  return origEmit(ev, p);
};

state.mode = 'flight';
state.settings.gameplay.physicsBackend = 'rapier-dynamic';
state.settings.gameplay.flightBackend = 'v3';
state.settings.gameplay.aiBackend = 'sg06-tactical';
state.settings.gameplay.tutorialHints = false;
if (!state.input.actions) state.input.actions = {};
state.player.credits = NEW_GAME.credits;
runtime.getSystem('ships').newGame();
const player0 = runtime.spawn(makeShipEntitySpec(NEW_GAME.shipId, {
  team: 0, factionId: 'faction_free', isPlayer: true, player: state.player,
  fittings: fittingsFromDefaultModules(NEW_GAME.shipId, NEW_GAME.fittedModules || []),
  pos: { x: 0, z: 0 }, rot: 0,
}));
state.playerId = player0.id;
const world = runtime.getSystem('world');
if (typeof world.newGame === 'function') world.newGame();
const econ0 = runtime.getSystem('economy');
if (econ0 && typeof econ0.newGame === 'function') econ0.newGame();
world.enterSector('sector_helios_prime', {});
origEmit('game:started', {});
await withFeatures(() => runtime.getSystem('physics').prepareBackend(state, { reset: true }));
runtime.runTicks(60, DT);

const player = state.entities.get(state.playerId);
const known = new Set((state.entityList || []).map(e => e && e.id));
const spawnLog = [];
// ring buffer of per-tick context
const ring = [];
const RING_N = 240;
let flung = false;
for (let i = 0; i < 60 * 300; i++) {
  await withFeatures(() => runtime.runTicks(1, DT));
  for (const e of state.entityList || []) {
    if (e && !known.has(e.id)) {
      known.add(e.id);
      const d = Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z);
      spawnLog.push({ t: state.simTime, id: e.id, type: e.type, defId: e.data?.defId, d: +d.toFixed(1), m: e.mass, v: +(Math.hypot(e.vel?.x || 0, e.vel?.z || 0)).toFixed(1) });
    }
  }
  const speed = Math.hypot(player.vel?.x || 0, player.vel?.z || 0);
  let nearestD = Infinity, nearest = null;
  for (const e of state.entityList || []) {
    if (!e || !e.pos || e.id === player.id) continue;
    const dd = Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z);
    if (dd < nearestD) { nearestD = dd; nearest = e; }
  }
  ring.push({ t: state.simTime, px: +player.pos.x.toFixed(1), pz: +player.pos.z.toFixed(1), v: +speed.toFixed(1), nd: +nearestD.toFixed(1), nid: nearest && `${nearest.id}:${nearest.type}` });
  if (ring.length > RING_N) ring.shift();
  if (speed > 300 && !flung) {
    flung = true;
    console.log(`FLING t=${state.simTime.toFixed(2)} speed=${speed.toFixed(0)} pos=(${player.pos.x.toFixed(0)},${player.pos.z.toFixed(0)}) nearest=${nearest && nearest.id}:${nearest && nearest.type}@${nearestD.toFixed(0)}`);
    console.log('--- last player trace (every 10th tick) ---');
    for (let k = 0; k < ring.length; k += 10) console.log(' ', JSON.stringify(ring[k]));
    console.log('--- recent spawns ---');
    for (const s of spawnLog.slice(-30)) console.log(' ', JSON.stringify(s));
    console.log('--- last 60 events ---');
    for (const e of eventLog.slice(-60)) console.log(`${e.t.toFixed(2)} ${e.ev} ${e.p ? JSON.stringify(e.p).slice(0, 250) : ''}`);
    break;
  }
}
if (!flung) {
  console.log('no fling in 300s; player pos', player.pos, 'speed', Math.hypot(player.vel?.x || 0, player.vel?.z || 0).toFixed(1));
  console.log('spawns:', spawnLog.length);
  for (const s of spawnLog.slice(-20)) console.log(' ', JSON.stringify(s));
  const raids = eventLog.filter(e => /encounter|spawn|raid/i.test(e.ev));
  for (const e of raids.slice(-20)) console.log(`${e.t.toFixed(2)} ${e.ev}`);
}
process.exit(0);
