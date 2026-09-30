import { SIM_DT } from '../src/core/sim.js';
import * as proof from '../src/testing/lab/proofSixtySeconds.js';
const { buildProofInputTape, syncTapeKeysToInput, PROOF_AMBUSH_POCKET_ID, pocketEntryGlobal } = proof;
import { createInputTapeDriver } from '../src/testing/lab/inputTape.js';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { getNodeSystemFactoryTable } from '../src/runtime/nodeSystemFactoryTable.js';
import { stuntGrammar } from '../src/systems/stuntGrammar.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { applyFeatureConfigToMaps, restoreFeatureMaps, snapshotFeatureMaps } from '../src/data/featureFlags.js';

const table = getNodeSystemFactoryTable({ tacticalAI: true, flightBackend: 'v3' });
if (!table.get('stuntGrammar')) table.set('stuntGrammar', stuntGrammar);
const runtime = createAuthoritativeRuntime({
  profileId: 'production', nodeSafeOnly: true, seed: 47, systemLookup: table,
  slots: { aiSlot: table.get('aiSlot'), flightSlot: table.get('flightSlot'), aiBackend: 'sg06-tactical', flightBackend: 'v3' },
});
const state = runtime.state;
state.mode = 'flight';
state.settings.gameplay.physicsBackend = 'rapier-dynamic';
const player = runtime.spawn(makeShipEntitySpec('ship_hornet', { isPlayer: true, player: state.player, pos: { x: 0, z: 0 }, factionId: 'faction_free' }));
state.playerId = player.id;
runtime.getSystem('world').enterSector('sector_ceres_belt');
const at = pocketEntryGlobal(PROOF_AMBUSH_POCKET_ID);
runtime.getSystem('world').relocatePlayerInSector({ x: at.x, z: at.z, heading: 0 }, { reason: 'probe' });
const physics = runtime.getSystem('physics');
const prev = snapshotFeatureMaps();
applyFeatureConfigToMaps(runtime.config.features);
try { await physics.prepareBackend(state, { reset: true }); } finally { restoreFeatureMaps(prev); }
const bus = runtime.bus;
const off = [
  bus.on('mining:npcExtraction', (p) => console.log(`MINER-EXTRACT ${state.simTime.toFixed(2)}s #${state.tick}`, JSON.stringify(p))),
  bus.on('npcjobs:work', (p) => console.log(`WORK ${state.simTime.toFixed(2)}s #${state.tick}`, JSON.stringify({ kind: p.kind, phase: p.phase, jobId: p.jobId }))),
  bus.on('traffic:jobActionReceipt', (p) => { if (String(p.actorSlotId||'').includes('miner') || String(p.jobKind||'')==='miner') console.log(`RECEIPT ${state.simTime.toFixed(2)}s #${state.tick}`, JSON.stringify({ slot: p.actorSlotId, action: p.action, effect: p.effectType })); }),
  bus.on('distress:call', (p) => console.log(`DISTRESS-CALL ${state.simTime.toFixed(2)}s #${state.tick}`, JSON.stringify({ callerId: p.callerId, role: p.callerRole, cause: p.cause, routed: p.routedToPlayer }))),
];
// No input tape — just let the world run.
for (let i = 0; i < 5400; i++) runtime.step(SIM_DT);
for (const o of off) o();
runtime.dispose();
