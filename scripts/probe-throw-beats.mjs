// Diagnostic: why does rope_projectile stay dark in proof.sixty_seconds?
// Boots seed 47 at the Ambush Run pocket, plays the tape, and dumps every
// tether/massline receipt plus periodic tether state.
import { SIM_DT } from '../src/core/sim.js';
import { runProofPocketCensus } from '../src/testing/lab/proofSixtySeconds.js';

// Boot internals are module-private; replicate via the module's exports where possible.
import * as proof from '../src/testing/lab/proofSixtySeconds.js';

// We need bootCeresPocket — re-create through the exported probe path pieces.
// proofSixtySeconds exports buildProofInputTape, aimTargetForTick, syncTapeKeysToInput,
// markProofPointerActive, installProofAimPassthrough, PROOF_AMBUSH_POCKET_ID, pocketEntryGlobal.
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
  applyFeatureConfigToMaps, massline2Flag, restoreFeatureMaps, snapshotFeatureMaps,
} from '../src/data/featureFlags.js';

const PROOF_PLAYER_HULL_ID = 'ship_hornet';
const PROOF_SHOVE_WEAPON_ID = 'wpn_concussion_cannon_m';

async function boot(seed) {
  const table = getNodeSystemFactoryTable({ tacticalAI: true, flightBackend: 'v3' });
  if (!table.get('stuntGrammar')) table.set('stuntGrammar', stuntGrammar);
  const runtime = createAuthoritativeRuntime({
    profileId: 'production',
    nodeSafeOnly: true,
    seed,
    systemLookup: table,
    slots: {
      aiSlot: table.get('aiSlot'),
      flightSlot: table.get('flightSlot'),
      aiBackend: 'sg06-tactical',
      flightBackend: 'v3',
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
  const player = runtime.spawn(makeShipEntitySpec(PROOF_PLAYER_HULL_ID, {
    isPlayer: true,
    player: state.player,
    pos: { x: 0, z: 0 },
    fittings: [PROOF_SHOVE_WEAPON_ID],
    factionId: 'faction_free',
  }));
  state.playerId = player.id;
  const world = runtime.getSystem('world');
  world.enterSector('sector_ceres_belt');
  const at = pocketEntryGlobal(PROOF_AMBUSH_POCKET_ID);
  world.relocatePlayerInSector({ x: at.x, z: at.z, heading: 0 }, { reason: 'probe:throw' });
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

const events = [];
const interesting = [
  'tether:latched', 'tether:latchDenied', 'tether:released', 'tether:cut', 'tether:broke',
  'tether:releaseRated', 'massline:throw', 'massline:selfSling', 'massline:releaseValidated',
  'massline:releaseWindow', 'massline:releaseCancelled',
  'combat:collisionConsequence', 'combat:tumbled',
];
let throwMiss = null;
const offs = interesting.map((name) => bus.on(name, (p) => {
  if (name === 'massline:throw' && p?.payloadId != null) {
    const tgt = aimTargetForTick(state, player, state.tick);
    const tgtEnt = tgt && state.entities.get(tgt.id);
    throwMiss = {
      tick: state.tick, payloadId: p.payloadId,
      aimId: tgt?.id ?? null, aimPos: tgtEnt ? { x: +tgtEnt.pos.x.toFixed(1), z: +tgtEnt.pos.z.toFixed(1) } : null,
      aimVel: tgtEnt ? { x: +tgtEnt.vel.x.toFixed(1), z: +tgtEnt.vel.z.toFixed(1) } : null,
      ships: new Map(),
    };
  }
  events.push({ t: state.simTime.toFixed(2), tick: state.tick, name, p: {
    targetId: p?.targetId, payloadId: p?.payloadId, victimId: p?.victimId,
    attackerId: p?.attackerId, source: p?.source,
    otherId: p?.otherId, targetType: p?.targetType, otherType: p?.otherType,
    deltaV: p?.deltaV != null ? +p.deltaV.toFixed(1) : null,
    reason: p?.reason, open: p?.open, mode: p?.mode, killed: p?.killed,
    surface: p?.surface, classification: p?.classification,
    divergenceRad: p?.divergenceRad != null ? +p.divergenceRad.toFixed(4) : null,
    withinTolerance: p?.withinTolerance ?? null,
    actualSpeed: p?.actual?.speed != null ? +p.actual.speed.toFixed(1) : null,
    predSpeed: p?.prediction?.payloadSpeed != null ? +p.prediction.payloadSpeed.toFixed(1) : null,
    predAngle: p?.prediction?.interceptAngle != null ? +p.prediction.interceptAngle.toFixed(3) : null,
    actualAngle: p?.actual?.angle != null ? +p.actual.angle.toFixed(3) : null,
  } });
}));

const tetherLog = [];
const thrownTrack = [];
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
  const thrown = state.entities.get(131);
  if (thrown && tick % 30 === 0 && tick > 500 && tick < 2000) {
    thrownTrack.push({ tick, t: state.simTime.toFixed(2), alive: thrown.alive,
      pos: { x: +thrown.pos.x.toFixed(1), z: +thrown.pos.z.toFixed(1) },
      vel: { x: +thrown.vel.x.toFixed(1), z: +thrown.vel.z.toFixed(1) } });
  }
  if (throwMiss && tick > throwMiss.tick && tick <= throwMiss.tick + 240 && tick % 4 === 0) {
    const pl = state.entities.get(throwMiss.payloadId);
    if (pl) {
      for (const e of state.entities.values()) {
        if (!e || e.id === pl.id || e.id === state.playerId || e.type !== 'ship' || !e.alive) continue;
        const d = Math.hypot(e.pos.x - pl.pos.x, e.pos.z - pl.pos.z);
        const rec = throwMiss.ships.get(e.id);
        if (!rec || d < rec.minDist) {
          throwMiss.ships.set(e.id, { minDist: rec ? Math.min(rec.minDist, d) : d,
            atTick: !rec || d < rec.minDist ? tick : rec.atTick });
        }
      }
    }
  }
  const t = state.player && state.player.tether;
  if (tick >= 700 && tick <= 1800 && tick % 20 === 0) {
    const sol = state.massline2 && state.massline2.throw && state.massline2.throw.solution;
    const aimT = aimTargetForTick(state, player, tick);
    tetherLog.push({
      tick, t: state.simTime.toFixed(2), phase: t?.phase ?? null,
      load: t?.load != null ? +t.load.toFixed(2) : null,
      strain: t?.strain != null ? +t.strain.toFixed(2) : null,
      onSolution: sol?.onSolution ?? null, reachable: sol?.reachable ?? null,
      aimId: aimT && aimT.id, aimDist: aimT ? +Math.hypot(aimT.pos.x-player.pos.x, aimT.pos.z-player.pos.z).toFixed(0) : null,
      win: sol?.window ? { e: sol.window.enterS, x: sol.window.exitS, r: sol.window.reliable } : null,
    });
  }
  if (tick % 120 === 0 || (tick >= 460 && tick <= 560)) {
    tetherLog.push({
      tick,
      t: state.simTime.toFixed(2),
      tetherActive: t?.active ?? null,
      targetId: t?.targetId ?? null,
      phase: t?.phase ?? null,
      throwArm: state.input?.actions?.throwArm ?? null,
      m2: inputSys?._m2 ?? null,
      throwFlag: state.runtime?.features?.massline2?.throw ?? massline2Flag('throw'),
    });
  }
}
console.log('=== tether/throw timeline ===');
for (const row of tetherLog) console.log(JSON.stringify(row));
console.log('=== thrown hull 131 trajectory ===');
for (const row of thrownTrack) console.log(JSON.stringify(row));
console.log('=== events ===');
for (const e of events) console.log(`${e.t}s #${e.tick} ${e.name} ${JSON.stringify(e.p)}`);
console.log('=== lastThrow ===');
console.log(JSON.stringify(state.massline2 && state.massline2.throw && state.massline2.throw.lastThrow, null, 1));
if (throwMiss) {
  console.log('=== throw miss geometry ===');
  console.log(`throw tick ${throwMiss.tick} payload ${throwMiss.payloadId} aim ${throwMiss.aimId} aimPos ${JSON.stringify(throwMiss.aimPos)} aimVel ${JSON.stringify(throwMiss.aimVel)}`);
  const rows = [...throwMiss.ships.entries()].sort((a, b) => a[1].minDist - b[1].minDist);
  for (const [id, r] of rows) console.log(`  ship ${id} minDist ${r.minDist.toFixed(1)} @ tick ${r.atTick}`);
}
for (const off of offs) off();
runtime.dispose();
