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
  buildProofInputTape, aimTargetForTick, syncTapeKeysToInput, featherSwingPump, guardFireThroughSwingPayload,
  gateThrowArmByRange, reachLineForVictim, manualSwingCut, markProofPointerActive, installProofAimPassthrough,
  PROOF_AMBUSH_POCKET_ID, pocketEntryGlobal,
} = proof;

import { createInputTapeDriver } from '../src/testing/lab/inputTape.js';
import { encounterPacingBlockReason } from '../src/systems/encounterDirector.js';
import { ENCOUNTERS } from '../src/data/encounters.js';
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
  try {
    const ok = await physics.prepareBackend(state, { reset: true });
    console.log(`physics.prepareBackend ok=${ok} sg02Ready=${physics._diag && physics._diag.sg02Ready}`
      + ` sg02=${!!physics._sg02} records=${physics._sg02 ? physics._sg02.records.size : '-'}`);
  } finally { restoreFeatureMaps(prev); }
  return { runtime, state, bus: runtime.bus, player };
}

const seed = Number(process.argv[2] || 47);
const { runtime, state, bus, player } = await boot(seed);
console.log(`onboarding=${JSON.stringify(state.onboarding || null)}`);
console.log(`docked flags: player.flags.docked=${player.flags && player.flags.docked} ui.docked=${state.ui && state.ui.docked}`);
const directorSys = runtime.getSystem('encounterDirector');
// Diagnostic: wrap the pacing pump and each gate it calls so the ambush item's
// disposition (selected / pacing-bypass / gate / fire) is directly observable.
const CERES_AMB_ID = 'enc_ceres_activity_ambush';
// update() early-return tracer: which gate swallows the first ~29s of director ticks.
const updateOrig = directorSys.update.bind(directorSys);
let updateCalls = 0;
directorSys.update = (dt, s) => {
  updateCalls++;
  if (updateCalls === 1 || (updateCalls < 400 && updateCalls % 60 === 0)) {
    const dir = s.encounterDirector || {};
    console.log(`  dirUpdate#${updateCalls} @${(s.simTime || 0).toFixed(2)} mode=${s.mode}`
      + ` run=${s.run ? `${s.run.kind}/${s.run.phase}` : '-'}`
      + ` docked=${!!((s.player && s.player.flags && s.player.flags.docked) || (s.ui && s.ui.docked))}`
      + ` accum=${(dir._accum || 0).toFixed(3)} pending=${(dir.pending || []).length}`);
  }
  return updateOrig(dt, s);
};
const pumpOrig = directorSys._pump.bind(directorSys);
let pumpCalls = 0;
directorSys._pump = (dir, s, now) => {
  pumpCalls++;
  const amb = (dir.pending || []).find((it) => it && it.data && it.data.ceresActivityAmbush);
  const tag = (it) => it ? `due=${(+it.dueAt).toFixed(2)} defers=${it.defers | 0}` : 'none';
  const before = tag(amb);
  if (amb && now < 32) {
    const ob = s.onboarding;
    console.log(`  pump@${now.toFixed(1)} due-scan: amb.dueAt=${amb.dueAt} <= ${now} -> ${amb.dueAt <= now}`
      + ` tutorial=${!!(ob && ob.active && !ob.finished)}`
      + ` pending=[${(dir.pending || []).map((it) => `${it.shapeId}@${(+it.dueAt).toFixed(1)}`).join(',')}]`);
  }
  pumpOrig(dir, s, now);
  const after = (dir.pending || []).find((it) => it && it.data && it.data.ceresActivityAmbush);
  if (amb && (tag(after) !== before || !after)) {
    console.log(`  pump@${(s.simTime || 0).toFixed(1)} amb before=${before} after=${tag(after)}`);
  }
};
const gatesOrig = directorSys._gatesPass.bind(directorSys);
directorSys._gatesPass = (shape, s, opts) => {
  const ok = gatesOrig(shape, s, opts);
  if (shape && shape.id === 'ambush_snare' && opts && opts.ignoreMinSectorTier) {
    console.log(`  gatesPass(ambush)=${ok} @${(s.simTime || 0).toFixed(1)}`);
  }
  return ok;
};
const proxOrig = directorSys._playerNearItemZone.bind(directorSys);
directorSys._playerNearItemZone = (item) => {
  const ok = proxOrig(item);
  if (item && item.data && item.data.ceresActivityAmbush) {
    console.log(`  playerNearItemZone(ambush)=${ok} @${(state.simTime || 0).toFixed(1)}`);
  }
  return ok;
};
const driver = createInputTapeDriver(buildProofInputTape());
const inputSys = runtime.getSystem('input');

const events = [];
const interesting = [
  'tether:latched', 'tether:latchDenied', 'tether:released', 'tether:cut', 'tether:broke',
  'tether:releaseRated', 'massline:throw', 'massline:selfSling', 'massline:releaseValidated',
  'massline:releaseWindow', 'massline:releaseCancelled',
  'combat:collisionConsequence', 'combat:tumbled',
  'encounter:spawned', 'encounter:telegraph', 'encounter:resolved', 'encounter:aborted',
  'combat:fire', 'combat:damage',
];
let throwMiss = null;
const swingNear = { ships: new Map() };
const flyby = [];
const offs = interesting.map((name) => bus.on(name, (p) => {
  if ((name === 'massline:throw' || name === 'tether:released')
      && (p?.payloadId != null || p?.targetId != null)) {
    const pid = p.payloadId != null ? p.payloadId : p.targetId;
    const tgt = aimTargetForTick(state, player, state.tick);
    const tgtEnt = tgt && state.entities.get(tgt.id);
    // Track the LATEST release: the flyby that matters is the one after the last cut/throw.
    throwMiss = {
      tick: state.tick, payloadId: pid,
      aimId: tgt?.id ?? null, aimPos: tgtEnt ? { x: +tgtEnt.pos.x.toFixed(1), z: +tgtEnt.pos.z.toFixed(1) } : null,
      aimVel: tgtEnt ? { x: +tgtEnt.vel.x.toFixed(1), z: +tgtEnt.vel.z.toFixed(1) } : null,
      ships: new Map(),
    };
    flyby.length = 0;
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
let dumpedLatch = false;
const MAX_TICKS = Number(process.env.PROBE_MAX_TICKS) || 5400;
for (let i = 0; i < MAX_TICKS; i++) {
  const tick = state.tick | 0;
  const tether = !!(state.player && state.player.tether && state.player.tether.active);
  driver.apply(state, tick, SIM_DT, { playerEntity: player, tetherAttached: tether });
  syncTapeKeysToInput(inputSys, driver.snapshotKeys());
  featherSwingPump(state, driver, inputSys, tick);
  manualSwingCut(state, driver, inputSys, tick);
  reachLineForVictim(state, driver, inputSys, tick);
  gateThrowArmByRange(state, driver, inputSys, tick);
  guardFireThroughSwingPayload(state, inputSys);
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
  // Tethered contact tracker: while a hull is on the line, a swung hull that physically
  // reaches a ship is the same collateral billiard as a released one — the victim was already
  // spun by the opening ram, so the smack itself is the receipt. Record the closest the swing
  // ever carries the payload past each hull.
  const liveTether = state.player && state.player.tether;
  if (liveTether && liveTether.active && liveTether.targetId != null) {
    const pl = state.entities.get(liveTether.targetId);
    if (pl && pl.pos) {
      for (const e of state.entities.values()) {
        if (!e || e.id === pl.id || e.id === state.playerId || e.type !== 'ship' || !e.alive) continue;
        const d = Math.hypot(e.pos.x - pl.pos.x, e.pos.z - pl.pos.z);
        const rec = swingNear.ships.get(e.id);
        if (!rec || d < rec.minDist) {
          swingNear.ships.set(e.id, { minDist: rec ? Math.min(rec.minDist, d) : d,
            atTick: !rec || d < rec.minDist ? tick : rec.atTick });
        }
      }
    }
  }
  if (throwMiss && tick > throwMiss.tick && tick <= throwMiss.tick + 150) {
    const pl = state.entities.get(throwMiss.payloadId);
    const v444 = state.entities.get(444);
    if (pl && v444 && v444.alive !== false) {
      const dx = v444.pos.x - pl.pos.x, dz = v444.pos.z - pl.pos.z;
      const d = Math.hypot(dx, dz);
      flyby.push({ tick, d: +d.toFixed(1),
        pl: [+pl.pos.x.toFixed(0), +pl.pos.z.toFixed(0)], plv: [+pl.vel.x.toFixed(0), +pl.vel.z.toFixed(0)],
        v: [+v444.pos.x.toFixed(0), +v444.pos.z.toFixed(0)], vv: [+v444.vel.x.toFixed(0), +v444.vel.z.toFixed(0)] });
    }
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
  if (tick % 60 === 0) {
    const hauler = [...state.entities.values()].find((e) => e && e.data
      && e.data.activityActorSlotId === 'ceres_ambush_loaded_hauler');
    const pirates = [...state.entities.values()].filter((e) => e && e.alive !== false
      && e.type === 'ship' && e.team === 1);
    for (const p of pirates) {
      if (!hauler || !hauler.pos) { console.log(`  prey@${tick}: no loaded hauler`); break; }
      const d = Math.hypot(hauler.pos.x - p.pos.x, hauler.pos.z - p.pos.z);
      console.log(`  prey@${tick}: pirate ${p.id}↔hauler ${hauler.id} d=${d.toFixed(0)}`
        + ` haulerAlive=${hauler.alive} piratePassive=${!!p.data?.ai?.passive}`);
    }
  }
  if (tick === 560 || tick === 900 || tick === 1300 || tick === 2400 || tick === 3600) {
    const dir = state.encounterDirector || state.director || {};
    const live = dir.live || {};
    const ids = Object.keys(live);
    const amb = (dir.stats && dir.stats.ceresActivityAmbush) || null;
    console.log(`  director @${tick}: live=[${ids.join(',')}] pending=${(dir.pending || []).length}`
      + ` ambushPhase=${amb ? amb.phase : '-'}`);
    for (const it of (dir.pending || [])) {
      const shape = ENCOUNTERS[it.shapeId];
      const why = it.data && it.data.ceresActivityAmbush
        ? encounterPacingBlockReason(dir, state, shape, state.simTime)
        : null;
      console.log(`    pending ${it.shapeId} zone=${it.zoneId} due=${it.dueAt}`
        + ` defers=${it.defers | 0} ceres=${!!(it.data && it.data.ceresActivityAmbush)}`
        + ` zc=${it.zoneCenter ? `${it.zoneCenter.x.toFixed(0)},${it.zoneCenter.z.toFixed(0)}` : '-'}`
        + ` zr=${it.zoneRadius ?? '-'} pace=${why || '-'}`);
    }
    console.log(`    player pos=${player.pos.x.toFixed(0)},${player.pos.z.toFixed(0)}`
      + ` cohort=${directorSys._ceresActivityAmbushCohort().length}`
      + ` preyInReach=${directorSys._ceresAmbushPreyInReach()}`
      + ` admission=${directorSys._spawnAdmissionAvailable(dir.pending[0], ENCOUNTERS[dir.pending[0].shapeId])}`);
  }
  if (tick >= 1600 && tick <= 2100 && tick % 50 === 0) {
    const rows = [];
    for (const e of state.entities.values()) {
      if (!e || e.type !== 'ship' || e.id === state.playerId || !e.alive) continue;
      const d = Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z);
      if (d > 2500) continue;
      rows.push(`${e.id}@${d.toFixed(0)} pos=${e.pos.x.toFixed(0)},${e.pos.z.toFixed(0)} v=${e.vel.x.toFixed(0)},${e.vel.z.toFixed(0)}`);
    }
    console.log(`  geo@${tick} player=${player.pos.x.toFixed(0)},${player.pos.z.toFixed(0)} :: ${rows.join(' | ')}`);
  }
  if (tick === 560 || tick === 900 || tick === 1300) {
    console.log(`=== ship census @${tick} ===`);
    for (const e of state.entities.values()) {
      if (!e || e.type !== 'ship' || e.id === state.playerId) continue;
      const d = Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z);
      const v = Math.hypot(e.vel.x, e.vel.z);
      console.log(`  ship ${e.id} alive=${e.alive} team=${e.team} d=${d.toFixed(0)} v=${v.toFixed(0)}`
        + ` arch=${e.data?.ai?.archetype || e.data?.role || ''} lawful=${!!e.data?.ai?.lawful}`);
    }
  }
  const t = state.player && state.player.tether;
  if (t && t.active && t.targetId != null && dumpedLatch !== t.targetId) {
    dumpedLatch = t.targetId;
    const e = state.entities.get(t.targetId);
    const ai = (e && e.data && e.data.ai) || {};
    console.log(`LATCHED-ENTITY id=${e.id} type=${e.type} team=${e.team} alive=${e.alive}`
      + ` archetype=${ai.archetype || ai.doctrine || ai.role || e.data?.role || ''}`
      + ` context=${ai.spawnContext || ai.context || ''} lawful=${!!ai.lawful}`
      + ` retaliates=${ai.retaliationTargetId ?? '-'} forcePlayer=${!!ai.forcePlayerTarget}`
      + ` huntPlayer=${!!ai.huntPlayer} passive=${!!ai.passive} encounter=${!!e.data?.encounter}`);
  }
  if (tick >= 700 && tick <= 1800 && tick % 20 === 0) {
    const sol = state.massline2 && state.massline2.throw && state.massline2.throw.solution;
    const aimT = aimTargetForTick(state, player, tick);
    const pay = state.entities.get(t.targetId);
    tetherLog.push({
      tick, t: state.simTime.toFixed(2), phase: t?.phase ?? null,
      load: t?.load != null ? +t.load.toFixed(2) : null,
      strain: t?.strain != null ? +t.strain.toFixed(2) : null,
      rest: t?.restLength != null ? +t.restLength.toFixed(0) : null,
      span: pay && pay.pos ? +Math.hypot(pay.pos.x - player.pos.x, pay.pos.z - player.pos.z).toFixed(0) : null,
      payV: pay && pay.vel ? +Math.hypot(pay.vel.x, pay.vel.z).toFixed(0) : null,
      onSolution: sol?.onSolution ?? null, reachable: sol?.reachable ?? null,
      aimId: aimT && aimT.id, aimDist: aimT ? +Math.hypot(aimT.pos.x-player.pos.x, aimT.pos.z-player.pos.z).toFixed(0) : null,
      payAim: aimT && pay && pay.pos ? +Math.hypot(aimT.pos.x-pay.pos.x, aimT.pos.z-pay.pos.z).toFixed(0) : null,
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
{
  console.log('=== flyby hull↔444 (post-throw, per-tick) ===');
  let best = null;
  for (const r of flyby) {
    if (!best || r.d < best.d) best = r;
    if (r.tick % 8 === 0 || r.d < 60) console.log(`  t${r.tick} d=${r.d} hull=${r.pl} v=${r.plv} | 444=${r.v} v=${r.vv}`);
  }
  if (best) console.log(`  closest: d=${best.d} @${best.tick}`);
}
{
  console.log('=== swing near-miss (tethered) ===');
  const rows = [...swingNear.ships.entries()].sort((a, b) => a[1].minDist - b[1].minDist);
  for (const [id, r] of rows.slice(0, 8)) console.log(`  ship ${id} minDist ${r.minDist.toFixed(1)} @ tick ${r.atTick}`);
}
if (throwMiss) {
  console.log('=== throw miss geometry ===');
  console.log(`throw tick ${throwMiss.tick} payload ${throwMiss.payloadId} aim ${throwMiss.aimId} aimPos ${JSON.stringify(throwMiss.aimPos)} aimVel ${JSON.stringify(throwMiss.aimVel)}`);
  const rows = [...throwMiss.ships.entries()].sort((a, b) => a[1].minDist - b[1].minDist);
  for (const [id, r] of rows) console.log(`  ship ${id} minDist ${r.minDist.toFixed(1)} @ tick ${r.atTick}`);
}
for (const off of offs) off();
runtime.dispose();
