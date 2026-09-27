// Diagnostic: which shipping channels actually fire during a proof.sixty_seconds window?
// Boots seed 47 at the Ambush Run pocket, plays the tape, counts every beat-relevant event
// and dumps payload keys for the job/law/heat/cargo channels.
import { SIM_DT } from '../src/core/sim.js';
import * as proof from '../src/testing/lab/proofSixtySeconds.js';
const {
  buildProofInputTape, aimTargetForTick, syncTapeKeysToInput, featherSwingPump,
  markProofPointerActive, installProofAimPassthrough,
  PROOF_AMBUSH_POCKET_ID, pocketEntryGlobal,
} = proof;
import { createInputTapeDriver } from '../src/testing/lab/inputTape.js';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { getNodeSystemFactoryTable } from '../src/runtime/nodeSystemFactoryTable.js';
import { stuntGrammar } from '../src/systems/stuntGrammar.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import {
  applyFeatureConfigToMaps, restoreFeatureMaps, snapshotFeatureMaps,
} from '../src/data/featureFlags.js';

async function boot(seed) {
  const table = getNodeSystemFactoryTable({ tacticalAI: true, flightBackend: 'v3' });
  if (!table.get('stuntGrammar')) table.set('stuntGrammar', stuntGrammar);
  const runtime = createAuthoritativeRuntime({
    profileId: 'production', nodeSafeOnly: true, seed, systemLookup: table,
    slots: {
      aiSlot: table.get('aiSlot'), flightSlot: table.get('flightSlot'),
      aiBackend: 'sg06-tactical', flightBackend: 'v3',
    },
  });
  const state = runtime.state;
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.settings.gameplay.flightBackend = 'v3';
  state.settings.gameplay.aiBackend = 'sg06-tactical';
  if (!state.input.actions) state.input.actions = { brake: false, autopursuit: false };
  state.settings.gameplay.masslineReleaseAssist = process.env.PROOF_ASSIST || 'arm';
  installProofAimPassthrough(runtime.getSystem('input'), state);
  const player = runtime.spawn(makeShipEntitySpec('ship_hornet', {
    isPlayer: true, player: state.player, pos: { x: 0, z: 0 },
    fittings: ['wpn_concussion_cannon_m'], factionId: 'faction_free',
  }));
  state.playerId = player.id;
  const world = runtime.getSystem('world');
  world.enterSector('sector_ceres_belt');
  const at = pocketEntryGlobal(PROOF_AMBUSH_POCKET_ID);
  world.relocatePlayerInSector({ x: at.x, z: at.z, heading: 0 }, { reason: 'probe:channels' });
  player.vel.x = 0; player.vel.z = 0;
  const physics = runtime.getSystem('physics');
  const prev = snapshotFeatureMaps();
  applyFeatureConfigToMaps(runtime.config.features);
  try { await physics.prepareBackend(state, { reset: true }); }
  finally { restoreFeatureMaps(prev); }
  return { runtime, state, bus: runtime.bus, player };
}

const seed = Number(process.argv[2] || 47);
const { runtime, state, bus, player } = await boot(seed);
const driver = createInputTapeDriver(buildProofInputTape());
const inputSys = runtime.getSystem('input');

const channels = [
  'traffic:jobActionReceipt', 'npcjobs:work', 'npcjobs:depart', 'npcjobs:transit',
  'npcjobs:load', 'npcjobs:truncated', 'mining:npcExtraction',
  'combat:fire', 'combat:damage', 'encounter:spawned', 'encounter:telegraph',
  'interdiction:triggered', 'pirateParley:started',
  'combat:tumbled', 'massline:tumbled',
  'massline:throw', 'tether:released', 'tether:latched', 'massline:releaseValidated',
  'tether:whipImpact', 'massline:sweepImpact',
  'combat:collisionConsequence',
  'freight:cargoSpilled', 'cargo:jettisoned', 'pickup:collected',
  'law:dispatchStarted', 'law:incidentOpened', 'law:distressRaised',
  'heat:changed', 'ai:flee', 'entity:killed', 'distress:call',
  'law:reportIncidentReceipt', 'law:responseDeferred', 'traffic:ceresCausalReceipt',
];
const counts = new Map();
const samples = new Map();
const offs = channels.map((name) => bus.on(name, (p) => {
  counts.set(name, (counts.get(name) || 0) + 1);
  if (!samples.has(name)) samples.set(name, []);
  const arr = samples.get(name); if(name==="combat:damage"||name==="distress:call"||name==="entity:killed"){ if(arr.length<400) arr.push({ t: +state.simTime.toFixed(2), tick: state.tick, p: Object.fromEntries(Object.entries(p || {}).filter(([,v])=>v==null||typeof v!=="object").map(([k,v])=>[k,typeof v==="number"?+v.toFixed(2):v])) }); return; }
  if (arr.length < 4) {
    arr.push({ t: +state.simTime.toFixed(2), tick: state.tick, p: Object.fromEntries(
      Object.entries(p || {}).filter(([, v]) => v == null || typeof v !== 'object')
        .map(([k, v]) => [k, typeof v === 'number' ? +v.toFixed(2) : v])) });
  }
}));

const MAX_TICKS = Number(process.env.PROBE_MAX_TICKS) || 5400;
for (let i = 0; i < MAX_TICKS; i++) {
  const tick = state.tick | 0;
  const tether = !!(state.player && state.player.tether && state.player.tether.active);
  driver.apply(state, tick, SIM_DT, { playerEntity: player, tetherAttached: tether });
  syncTapeKeysToInput(inputSys, driver.snapshotKeys());
  featherSwingPump(state, driver, inputSys, tick);
  const aim = aimTargetForTick(state, player, tick);
  if (aim && aim.pos) {
    state.input = state.input || {};
    state.input.aimAngle = Math.atan2(aim.pos.z - player.pos.z, aim.pos.x - player.pos.x);
    state.input.aimWorld = { x: aim.pos.x, z: aim.pos.z };
  }
  markProofPointerActive(inputSys);
  runtime.step(SIM_DT);
}
console.log('=== channel counts over', MAX_TICKS, 'ticks ===');
for (const name of channels) console.log(`${name}: ${counts.get(name) || 0}`);
console.log('=== samples ===');
for (const name of channels) {
  const arr = samples.get(name);
  if (!arr || !arr.length) continue;
  console.log(`--- ${name} ---`);
  for (const s of arr) console.log(`  ${s.t}s #${s.tick} ${JSON.stringify(s.p)}`);
}
for (const off of offs) off();
runtime.dispose();
