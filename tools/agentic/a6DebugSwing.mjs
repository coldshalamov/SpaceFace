// Debug probe: reproduce the A6 swing kill in isolation. Boots the same production
// runtime as a6OpeningSlice, spawns one ship_wasp 90 u ahead, runs the driver's
// latch -> pump sequence verbatim, and logs tether + payload state every tick.
// Usage: node tools/agentic/a6DebugSwing.mjs
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

const events = [];
const origEmit = bus.emit.bind(bus);
bus.emit = (ev, p) => {
  try { events.push({ t: state.simTime, ev, p: p && JSON.parse(JSON.stringify(p)) }); }
  catch { events.push({ t: state.simTime, ev }); }
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
const input = state.input;
input.actions = input.actions || {};

// Spawn one wasp ~60u ahead — same class the A6 raid guarantees as the throw payload.
const wasp = runtime.spawn(makeShipEntitySpec('ship_wasp', {
  team: 1, factionId: 'faction_reach',
  pos: { x: player.pos.x + 60, z: player.pos.z }, rot: Math.PI,
  data: { ai: { encounterRole: 'raider', hostile: true } },
}));
const waspId = wasp.id;
state.player.targetId = waspId;
input.tetherMode = 'nearest'; // pure-geometry latch: closest eligible body wins, no scoring
console.log(`wasp ${waspId} spawned at +60u mass=${wasp.mass} hull=${wasp.hull}`);

const masslineCmd = (cmd) => {
  input.actions.massline = Object.assign({
    phase: 'idle', latch: false, cut: false, lineControl: false, lineLength: 0,
    reelIn: 0, payOut: 0, orbitDirection: 0, pump: false, buffered: false, source: null,
  }, cmd);
  input.actions.tetherFire = !!cmd.latch;
};

let phase = 'approach';
for (let i = 0; i < 60 * 45; i++) {
  const t = state.simTime;
  const tether = state.player.tether;
  const p = state.entities.get(waspId);
  if (phase === 'approach') {
    masslineCmd({ latch: true, phase: 'latch' });
    if (tether && tether.active && tether.targetId === waspId) {
      phase = 'swing';
      console.log(`LATCHED t=${t.toFixed(2)} restLength=${tether.restLength}`);
      // dump attachment anchors
      const atts = state.combat && state.combat.attachments && state.combat.attachments.byId;
      for (const a of Object.values(atts || {})) {
        console.log(`  attachment src=${JSON.stringify(a.sourceAnchorLocal)} tgt=${JSON.stringify(a.targetAnchorLocal)} rest=${a.restLength}`);
      }
    }
    if (i > 60 * 10) { console.log('never latched; denial:', JSON.stringify(runtime.getSystem('tetherGameplay')._lastLatchDenial)); break; }
  } else if (phase === 'swing') {
    if (!p || p.alive === false) {
      console.log(`PAYLOAD GONE t=${t.toFixed(2)} alive=${p && p.alive} hull=${p && p.hull}`);
      for (const e of events.slice(-25)) console.log(`  ${e.t.toFixed(2)} ${e.ev} ${e.p ? JSON.stringify(e.p).slice(0, 240) : ''}`);
      break;
    }
    if (!tether || !tether.active || tether.targetId !== waspId) {
      console.log(`TETHER LOST t=${t.toFixed(2)} phase=${tether && tether.phase}`);
      for (const e of events.slice(-25)) console.log(`  ${e.t.toFixed(2)} ${e.ev} ${e.p ? JSON.stringify(e.p).slice(0, 240) : ''}`);
      break;
    }
    const rx = p.pos.x - player.pos.x, rz = p.pos.z - player.pos.z;
    const rl = Math.hypot(rx, rz) || 1;
    const pv = p.vel || { x: 0, z: 0 };
    const rvx = pv.x - (player.vel.x || 0), rvz = pv.z - (player.vel.z || 0);
    const tangential = rvx * (-rz / rl) + rvz * (rx / rl);
    const orbitSign = tangential >= 0 ? 1 : -1;
    masslineCmd({ lineControl: true, reelIn: 1, orbitDirection: orbitSign, pump: true });
    if (i % 10 === 0) {
      const speed = Math.hypot(pv.x, pv.z);
      const rot = p.rot != null ? p.rot : p.data?.rot;
      console.log(`t=${t.toFixed(2)} d=${rl.toFixed(1)} pv=${speed.toFixed(0)} pvel=(${pv.x.toFixed(0)},${pv.z.toFixed(0)}) phase=${tether.phase} strain=${Number(tether.strain).toFixed(2)} waspRot=${Number(rot).toFixed(2)} playerRot=${Number(player.rot).toFixed(2)}`);
    }
    if (t > 20) {
      console.log('swing survived 20s; tether still', tether.phase);
      for (const e of events.filter(e => /tether/.test(e.ev))) console.log(`  ${e.t.toFixed(2)} ${e.ev} ${e.p ? JSON.stringify(e.p).slice(0, 200) : ''}`);
      break;
    }
  }
  await withFeatures(() => runtime.runTicks(1, DT));
}
process.exit(0);
