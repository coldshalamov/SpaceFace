import { SIM_DT } from '../src/core/sim.js';
import * as proof from '../src/testing/lab/proofSixtySeconds.js';
const { buildProofInputTape, syncTapeKeysToInput, featherSwingPump, aimTargetForTick, installProofAimPassthrough, PROOF_AMBUSH_POCKET_ID, pocketEntryGlobal } = proof;
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
state.settings.gameplay.flightBackend = 'v3';
state.settings.gameplay.aiBackend = 'sg06-tactical';
state.settings.gameplay.masslineReleaseAssist = 'arm';
if (!state.input.actions) state.input.actions = { brake: false, autopursuit: false };
const player = runtime.spawn(makeShipEntitySpec('ship_hornet', { isPlayer: true, player: state.player, pos: { x: 0, z: 0 }, fittings: ['wpn_concussion_cannon_m'], factionId: 'faction_free' }));
state.playerId = player.id;
runtime.getSystem('world').enterSector('sector_ceres_belt');
const at = pocketEntryGlobal(PROOF_AMBUSH_POCKET_ID);
runtime.getSystem('world').relocatePlayerInSector({ x: at.x, z: at.z, heading: 0 }, { reason: 'probe' });
const physics = runtime.getSystem('physics');
const prev = snapshotFeatureMaps();
applyFeatureConfigToMaps(runtime.config.features);
try { await physics.prepareBackend(state, { reset: true }); } finally { restoreFeatureMaps(prev); }
const bus = runtime.bus;
const S = () => `${state.simTime.toFixed(2)}s #${state.tick}`;
bus.on('tether:latched', (p) => console.log(`LATCH ${S()} target=${p.targetId}`));
bus.on('tether:released', (p) => console.log(`RELEASE ${S()}`, JSON.stringify(p).slice(0, 200)));
bus.on('massline:throw', (p) => console.log(`THROW ${S()}`, JSON.stringify(p).slice(0, 240)));
bus.on('tether:whipImpact', (p) => console.log(`WHIP ${S()} mass=${p.targetId} victim=${p.victimId} relV=${(p.relSpeed || 0).toFixed(1)} slung=${p.slung}`));
bus.on('massline:releaseWindow', (p) => { if (p.open) console.log(`WINDOW-OPEN ${S()} target=${p.targetId} relV=${(p.relativeSpeed || 0).toFixed(0)}`); });
bus.on('massline:releaseValidated', (p) => console.log(`VALIDATED ${S()}`, JSON.stringify(p).slice(0, 220)));
bus.on('law:incidentOpened', (p) => console.log(`INCIDENT ${S()}`, JSON.stringify(p).slice(0, 240)));
bus.on('law:dispatchStarted', (p) => console.log(`DISPATCH ${S()}`, JSON.stringify(p).slice(0, 240)));
bus.on('freight:cargoSpilled', (p) => console.log(`SPILL ${S()}`, JSON.stringify(p).slice(0, 180)));
bus.on('heat:changed', (p) => console.log(`HEAT ${S()}`, JSON.stringify(p).slice(0, 200)));
bus.on('entity:killed', (p) => console.log(`KILLED ${S()}`, JSON.stringify(p).slice(0, 240)));
bus.on('combat:damage', (p) => {
  if (p && (p.attackerId === 1 || p.targetId === 443 || p.targetId === 447 || p.targetId === 131)) {
    console.log(`DMG ${S()} ${p.attackerId}->${p.targetId} amt=${p.amount || p.applied || 0} w=${p.weaponId || 'collision'} hostile=${p.targetHostileToPlayer}`);
  }
});
bus.on('combat:tumbled', (p) => console.log(`TUMBLE ${S()} victim=${p.victimId} attacker=${p.attackerId} src=${p.source}`));
bus.on('combat:fire', (p) => { if (p && p.ownerId === 1) console.log(`FIRE ${S()} w=${p.weaponId} dir=${p.dir ? JSON.stringify(p.dir).slice(0,60) : '-'}`); });
bus.on('ai:flee', (p) => console.log(`FLEE ${S()}`, JSON.stringify(p).slice(0, 160)));

const tape = buildProofInputTape();
const driver = createInputTapeDriver(tape);
const inputSys = runtime.getSystem('input');
installProofAimPassthrough(inputSys, state);
const ENTS = [1, 131, 443, 447, 444];
for (let tick = 0; tick < 1400; tick++) {
  const tether = !!(state.player && state.player.tether && state.player.tether.active);
  driver.apply(state, tick, SIM_DT, { playerEntity: player, tetherAttached: tether });
  syncTapeKeysToInput(inputSys, driver.snapshotKeys());
  featherSwingPump(state, driver, inputSys, tick);
  const t = aimTargetForTick(state, player, tick);
  if (t && t.pos) {
    state.input.aimWorld = { x: t.pos.x, z: t.pos.z };
    state.input.aimAngle = Math.atan2(t.pos.z - player.pos.z, t.pos.x - player.pos.x);
  }
  if (inputSys._screen) inputSys._screen.active = true;
  runtime.step(SIM_DT);
  if (tick % 20 === 0 && tick >= 380 && tick <= 1000) {
    const row = ENTS.map((id) => {
      const e = state.entities.get(id);
      if (!e || !e.pos) return `${id}:dead`;
      const spd = e.vel ? Math.hypot(e.vel.x, e.vel.z).toFixed(0) : '?';
      return `${id}:${e.pos.x.toFixed(0)},${e.pos.z.toFixed(0)} v${spd}`;
    }).join(' | ');
    console.log(`#${tick} ${state.simTime.toFixed(1)}s ${row} aim->${t ? t.id : '-'}`);
  }
}
runtime.dispose();
