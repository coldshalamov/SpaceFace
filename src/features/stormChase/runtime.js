// GLASSWAKE's production membrane. Geometry describes a force; physicalEffects/physicsAuthority
// admit it, the physics owner moves bodies, and the existing cargo/economy owners settle samples.
// EncounterDirector is a calendar clock, so this adapter MUST run on the fixed physics tick.
import { queryPhysicalBodies, deliverPhysicalImpulseDetailed } from '../../combat/physicalEffects.js';
import { WRECK_COLLIDER_PROPORTIONS } from '../../data/wreckClasses.js';
import { sectorLocalToGlobalForSector } from '../../data/sectorCoordinates.js';
import { fieldBodyProfile } from '../../systems/fields.js';
import { STORM_LIMITS, STORM_PATTERN_BY_ID } from './catalog.js';
import { createStormPlan, normalizeStormPlan, sampleStorm, forecastStorm, sampleStormAtPoint, stormEnvironmentalProfiles } from './controller.js';
import { sampleStormBodyIntent } from './forces.js';
import {
  createSampleLedger, bindSampleBody, chargeSample, observeSampleBodies, loseSample,
  extractSample, finishSampleLedger, snapshotSampleLedger, restoreSampleLedger,
  sampleBody, sampleLedgerSummary,
} from './ownership.js';

export const STORM_CHASE_SITE = Object.freeze({
  sectorId: 'sector_vesta_forge', zoneId: 'zone_vesta_derelict',
  origin: Object.freeze({ x: 1500, z: -1650 }), heading: 0,
  offerRange: 1600, playerSpawnClearance: 90, returnGraceS: 90,
  maxOwnedBodies: 17, maxHistory: 16,
});
export const STORM_CHASE_ENCOUNTER_ID = 'glasswake_storm_chase';
const RUNTIMES = new WeakMap();
const SAMPLE_IDS = Object.freeze(['lee_a', 'lee_b', 'middle_a', 'middle_b', 'deep_a', 'deep_b']);
const TERMINAL = new Set(['extracted', 'lost']);
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
const planar = point => !!point && Number.isFinite(point.x) && Number.isFinite(point.z);
const generation = entity => Number.isSafeInteger(entity?.occupantGeneration) ? entity.occupantGeneration : null;
const currentSector = state => state?.world?.currentSectorId ?? null;
const nowOf = state => Math.max(0, finite(state?.simTime));
const playerOf = state => state?.entities?.get(state.playerId) || null;
const recordOf = state => state?.stormChase?.active || null;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const siteOrigin = () => sectorLocalToGlobalForSector(STORM_CHASE_SITE.origin, STORM_CHASE_SITE.sectorId);

function freshState() { return { schemaVersion: 1, nextSerial: 1, active: null, history: [] }; }
function featureState(state) {
  if (!state.stormChase || state.stormChase.schemaVersion !== 1) state.stormChase = freshState();
  return state.stormChase;
}
function runSamples() {
  return SAMPLE_IDS.map((id, index) => ({
    id, commodityId: 'cmdty_crystal_lumin', quantity: 1 + Math.floor(index / 2),
    bonusCr: [60, 60, 115, 115, 180, 180][index], chargeSeconds: 4 + Math.floor(index / 2),
  }));
}
function bodyOf(state, run, ref) {
  const entity = state.entities?.get(ref?.id);
  return entity && entity.alive !== false && generation(entity) === ref.generation
    && entity.data?.stormChase?.expeditionId === run.id ? entity : null;
}
function rememberBody(run, entity, role) {
  if (!entity || !Number.isSafeInteger(entity.id) || entity.id <= 0) return false;
  entity.data = entity.data || {};
  entity.data.stormChase = { ...entity.data.stormChase, expeditionId: run.id, role };
  run.bodies.push({ id: entity.id, generation: generation(entity), role });
  return true;
}
function summaryOf(run) {
  return { id: run.id, patternId: run.plan.patternId, sectorId: run.plan.sectorId,
    startedAt: run.plan.startedAt, endedAt: run.endedAt, outcome: run.outcome,
    ...sampleLedgerSummary(run.ledger) };
}

/** Pure admission check: Vesta's outer derelict drift, deliberate consent, no starter-sector fire. */
export function stormChaseEntry(state) {
  const player = playerOf(state);
  if (currentSector(state) !== STORM_CHASE_SITE.sectorId) return { ok: false, reason: 'wrong_sector' };
  if (state.mode && state.mode !== 'flight') return { ok: false, reason: 'not_flying' };
  if (state.physicsVenue?.active || (state.run?.kind && state.run.kind !== 'adventure' && state.run.phase !== 'inactive')) return { ok: false, reason: 'dedicated_mode' };
  if (!player || player.alive === false || !planar(player.pos) || player.flags?.docked || state.ui?.docked
      || (Number.isFinite(player.hull) && player.hull <= 0)) return { ok: false, reason: 'pilot_unavailable' };
  if (dist(player.pos, siteOrigin()) > STORM_CHASE_SITE.offerRange) return { ok: false, reason: 'outside_approach' };
  return { ok: true, reason: 'ready' };
}

/** A renderer reads the runtime attached to its own state; it never imports a mutable singleton. */
export function readStormChaseView(state) { return RUNTIMES.get(state)?.view || state?.stormChaseView || null; }

/**
 * ctx is the normal init context: {state,bus,helpers,registry}. No gameplay-owner substitutes
 * are installed. Missing owners fail admission; a headless caller can supply the same owners.
 */
export function createStormChaseRuntime(ctx = {}) {
  const state = ctx.state;
  if (!state || !state.entities?.get) throw new TypeError('GLASSWAKE requires a live GameState');
  const previous = RUNTIMES.get(state);
  if (previous) previous.detach();
  const helpers = ctx.helpers || {}, bus = ctx.bus || null, registry = ctx.registry || null;
  const unsubs = [], fieldIds = new Set(), nearby = [];
  let detached = false, restoring = false, lastTick = null, lastTime = null;
  let director = null, liveRef = null, currentView = null, lastNoticeAt = -Infinity;
  let settling = 0, pendingFinish = null;
  let lastCovers = [];
  let stagedRestore = null, hasStagedRestore = false;
  const publishView = view => { currentView = view; state.stormChaseView = view; return view; };
  publishView(null);
  const owner = name => registry?.get?.(name) || null;
  const emit = (name, payload) => { if (bus?.emit) bus.emit(name, payload); };
  const notice = (text, kind = 'info', force = false) => {
    const now = nowOf(state);
    if (!force && now - lastNoticeAt < 4) return;
    lastNoticeAt = now;
    emit('toast', { text, kind, ttl: 4 });
  };
  function clearFields() {
    const fields = owner('fields');
    for (const id of fieldIds) fields?.unregisterExternal?.(id);
    fieldIds.clear();
  }
  function retire(entity) {
    // A synchronous save/new-game listener can recycle this numeric ID before a finally block.
    // Retire only the exact physical occupant handed to us, never its replacement.
    if (!entity || state.entities.get(entity.id) !== entity || !entity.data?.stormChase
        || typeof helpers.removeEntity !== 'function') return false;
    helpers.removeEntity(entity.id);
    return true;
  }
  function liveFor(run) {
    if (liveRef?.id === run.encounterId && liveRef.phase !== 'done') return liveRef;
    return state.encounterDirector?.live?.[run.encounterId] || null;
  }
  function retireOwned(run) {
    for (const ref of run.bodies) {
      const entity = bodyOf(state, run, ref);
      if (entity) retire(entity);
    }
  }
  function receiverOf(run) {
    const ref = run.bodies.find(item => item.role === 'receiver');
    const body = bodyOf(state, run, ref);
    return body && (!Number.isFinite(body.hull) || body.hull > 0) ? body : null;
  }
  function fieldsFor(frame) {
    const fields = owner('fields');
    if (!fields) return false;
    const profiles = stormEnvironmentalProfiles(frame);
    if (!profiles.length) { clearFields(); return true; }
    for (const spec of profiles) {
      // Envelopes have no force recipients. The masked kernel intent below is delivered ONCE.
      // External records are runtime-only: fields' save owner must not persist zero diagnostics
      // separately from this expedition or resurrect them after a finished/invalid restore.
      if (fields.hasExternal?.(spec.id)) fields.updateExternal?.(spec.id, spec);
      else if (!fields.registerExternal?.({ ...spec, createdAt: frame.simTime })) return false;
      fieldIds.add(spec.id);
    }
    return true;
  }
  function hasOwners() {
    const cargo = owner('cargo'), economy = owner('economy'), fields = owner('fields');
    return typeof helpers.stageEntitySpawn === 'function' && typeof helpers.removeEntity === 'function'
      && typeof cargo?.addCargo === 'function' && typeof economy?.grantCredits === 'function'
      && typeof fields?.registerExternal === 'function' && typeof fields?.unregisterExternal === 'function'
      && typeof fields?.hasExternal === 'function' && typeof fields?.updateExternal === 'function';
  }
  function spawn(run, spec, role) {
    const current = () => run.phase !== 'finished' && recordOf(state) === run && !restoring;
    const canAdmit = () => {
      if (!current() || run.bodies.length >= STORM_CHASE_SITE.maxOwnedBodies) return false;
      const player = playerOf(state);
      const clearance = role === 'sample' ? 12 : role === 'receiver' ? 40 : STORM_CHASE_SITE.playerSpawnClearance;
      return !player?.pos || dist(player.pos, spec.pos) >= Math.max(0, finite(player.radius)) + spec.radius + clearance;
    };
    if (!canAdmit()) return null;
    const sampleId = role === 'sample' ? spec.data?.stormChase?.sampleId : null;
    const row = role === 'sample' ? run.ledger.samples.find(item => item.id === sampleId) : null;
    if (role === 'sample' && (!row || row.status !== 'pending')) return null;
    let stage = null, entity = null, recorded = false;
    const abort = () => {
      if (!recorded || !entity) return;
      const index = run.bodies.findIndex(ref => ref.id === entity.id && ref.generation === generation(entity));
      if (index >= 0) run.bodies.splice(index, 1);
      if (row?.bodyId === entity.id && row.bodyGeneration === generation(entity))
        loseSample(run.ledger, row.id, 'admission_interrupted', nowOf(state));
      recorded = false;
    };
    try {
      // The core owner's staged boundary assigns ID/life privately. Commit custody BEFORE
      // publishing entity:spawned, so a synchronous save can never capture an unowned capsule.
      stage = helpers.stageEntitySpawn({ ...spec, flags: { persistent: true, ...(spec.flags || {}) },
        data: { ...(spec.data || {}), encounterId: run.encounterId, homeSectorId: run.plan.sectorId,
          stormChase: { expeditionId: run.id, role, ...(sampleId ? { sampleId } : {}) } } });
      entity = stage.entity;
      const admitted = stage.commit({
        preflight: () => canAdmit() && (!row || row.status === 'pending'),
        commit: () => {
          if (!canAdmit() || !rememberBody(run, entity, role)) return false;
          recorded = true;
          return !row || bindSampleBody(run.ledger, row.id, entity);
        },
        abort,
      });
      if (!admitted || !stage.committed) { stage.abort(); return null; }
      if (!current() || state.entities.get(entity.id) !== entity) { retire(entity); return null; }
      return entity;
    } catch (_) {
      // Once core publication committed, a throwing presentation listener cannot make the
      // admitted body retryable. Late context replacement may only retire this exact occupant.
      if (stage?.committed) {
        if (current() && state.entities.get(entity?.id) === entity) return entity;
        retire(entity);
      } else { stage?.abort(); abort(); }
      return null;
    }
  }
  function spawnFieldBodies(run, frame) {
    // Publish the mandatory real receiver first. Every synchronous spawn observer can then
    // save a complete minimal expedition; later optional dressing never needs reconstruction.
    const receiver = spawn(run, { type: 'payload', pos: { x: frame.extraction.x, z: frame.extraction.z + frame.extraction.radius + 36 },
      vel: { x: 0, z: 0 }, radius: 18, mass: 2400, hull: 1000, hullMax: 1000,
      physicsBody: { shape: 'capsule', mass: 2400, dynamic: false, anchorRecoil: false },
      data: { kind: 'payload', payloadType: 'glasswake_receiver', authoredPayloadAssetId: 'place_breakaway_sp07',
        salvagePool: {}, scanLabel: 'Glasswake sample mooring', transientSector: true } }, 'receiver');
    if (!receiver) return false;
    // Existing authored wreck pieces/cargo capsules/flywheel assembly; no new art body.
    for (let index = 0; index < 8; index++) {
      const angle = run.plan.phaseOffset + index * Math.PI * 2 / 8;
      const radius = frame.fronts[index % 2].radius;
      const p = { x: frame.eye.x + Math.cos(angle) * radius, z: frame.eye.z + Math.sin(angle) * radius };
      const current = sampleStormAtPoint(frame, p).mediumVelocity;
      spawn(run, { type: 'wreck', pos: p, vel: { x: current.x, z: current.z },
        rot: angle, radius: 6 + index % 3, mass: 48 + index * 18, hull: 180, hullMax: 180,
        physicsBody: { shape: 'capsule', mass: 48 + index * 18, material: 'debris' },
        data: { parentType: 'debris', proportions: WRECK_COLLIDER_PROPORTIONS, loot: [], salvagePool: {},
          salvageTimeLeft: 0, scanLabel: 'Glasswake rim wreckage', masslineTetherable: true } }, 'debris');
    }
    for (let index = 0; index < 2; index++) {
      const angle = run.plan.heading + (index === 0 ? 1.8 : -1.6);
      spawn(run, { type: 'payload', pos: { x: frame.eye.x + Math.cos(angle) * 208, z: frame.eye.z + Math.sin(angle) * 208 },
        vel: { x: 0, z: 0 }, radius: 22, mass: 1700, hull: 800, hullMax: 800,
        physicsBody: { shape: 'capsule', mass: 1700, fieldResponseMult: 0.2 },
        data: { kind: 'payload', payloadType: 'glasswake_anchor', authoredPayloadAssetId: 'place_breakaway_sp07',
          salvagePool: {}, scanLabel: 'Glasswake heavy cover / Pin anchor', masslineTetherable: true,
          transientSector: true } }, 'cover');
    }
    return true;
  }
  function releaseSamples(run, frame) {
    for (let index = 0; index < run.ledger.samples.length; index++) {
      if (run.phase === 'finished' || recordOf(state) !== run || restoring) return;
      const row = run.ledger.samples[index];
      if (row.status !== 'pending') continue;
      const pocket = frame.pockets[Math.floor(index / 2)];
      if (run.attemptedSamples.includes(row.id)) { loseSample(run.ledger, row.id, 'interrupted_admission', frame.simTime); continue; }
      if (frame.elapsed >= pocket.closesAtS) { loseSample(run.ledger, row.id, 'missed_pocket', frame.simTime); continue; }
      if (!pocket.open) continue;
      const side = index % 2 ? 1 : -1;
      const p = { x: pocket.x + Math.cos(pocket.angle + Math.PI / 2) * side * 10,
        z: pocket.z + Math.sin(pocket.angle + Math.PI / 2) * side * 10 };
      // A pilot already riding this pocket is never overlapped by a new collider. Keep the
      // slot pending until there is clearance, instead of consuming its one spawn admission.
      const player = playerOf(state);
      if (player?.pos && dist(player.pos, p) < finite(player.radius) + 5 + Math.floor(index / 2) + 12) continue;
      // Reserve before a canonical spawn callback can synchronously reenter or trigger a save.
      run.attemptedSamples.push(row.id);
      const nextPocket = sampleStorm(run.plan, frame.simTime + 0.1).pockets[Math.floor(index / 2)];
      const velocity = { x: (nextPocket.x - pocket.x) * 10, z: (nextPocket.z - pocket.z) * 10 };
      const entity = spawn(run, { type: 'payload', pos: p, vel: velocity,
        radius: 5 + Math.floor(index / 2), mass: 40 + Math.floor(index / 2) * 30, hull: 130, hullMax: 130,
        physicsBody: { shape: 'capsule', mass: 40 + Math.floor(index / 2) * 30 },
        data: { kind: 'payload', payloadType: 'glasswake_sample', authoredPayloadAssetId: 'pod_cargo_container',
          salvagePool: {}, transientSector: true,
          scanLabel: `Glasswake sample ${index + 1} / charge then tow home`, masslineTetherable: true,
          stormSampleCommodity: row.commodityId, stormChase: { sampleId: row.id } } }, 'sample');
      if (!entity || sampleBody(run.ledger, row.id, state) !== entity) {
        if (entity) retire(entity);
        loseSample(run.ledger, row.id, 'spawn_not_admitted', frame.simTime);
      }
    }
  }
  function chargeAndReceive(run, frame, dt) {
    observeSampleBodies(run.ledger, state);
    const cargo = owner('cargo'), economy = owner('economy');
    for (let index = 0; index < run.ledger.samples.length; index++) {
      if (run.phase === 'finished' || recordOf(state) !== run || restoring) return;
      if (!receiverOf(run)) { api.finish('receiver_lost'); return; }
      const row = run.ledger.samples[index], body = sampleBody(run.ledger, row.id, state);
      if (!body || TERMINAL.has(row.status)) continue;
      const pocket = frame.pockets[Math.floor(index / 2)];
      if (row.status === 'drifting') {
        const range = dist(body.pos, pocket);
        const exposure = pocket.open && frame.intensity > 0 ? clamp(1 - (range / pocket.radius) ** 2, 0, 1) : 0;
        chargeSample(run.ledger, row.id, { dt, exposure, simTime: frame.simTime });
      }
      if (row.status !== 'charged') continue;
      let result;
      settling++;
      try {
        result = extractSample(run.ledger, row.id, {
          state, player: playerOf(state), receiver: frame.extraction, simTime: frame.simTime,
          addCargo: cargo?.addCargo?.bind(cargo), grantCredits: economy?.grantCredits?.bind(economy), retireBody: retire,
          isCurrent: () => recordOf(state) === run && run.phase !== 'finished' && !restoring,
        });
      } catch (_) {
        // A throwing owner cannot turn a consumed body into a retryable sample. Its ledger
        // reservation is terminal; close this feature without taking the whole game tick down.
        result = { ok: false, reason: 'settlement_owner_error' };
        pendingFinish = { run, reason: 'settlement_owner_error' };
      } finally {
        settling--;
        if (settling === 0 && pendingFinish) {
          const pending = pendingFinish; pendingFinish = null;
          // A synchronous Continue may have installed a different expedition while this
          // source's cargo callback ran. Deferred teardown belongs only to its captured run.
          if (!restoring && recordOf(state) === pending.run) api.finish(pending.reason);
        }
      }
      if (recordOf(state) !== run) return;
      if (result.ok) notice(`GLASSWAKE: sample banked. ${result.quantity} Phosphor Crystal + ${result.bonusCr} credits. Next pocket is optional.`, 'good', true);
      else if (result.reason === 'hold_full' && dist(body.pos, frame.extraction) < frame.extraction.radius + 40)
        notice('GLASSWAKE: receiver is ready; free cargo space before handing over this pod.', 'warn');
    }
  }
  function applyCurrent(run, frame, dt) {
    if (run.phase === 'finished' || recordOf(state) !== run || restoring
      || frame.phase === 'forecast' || frame.phase === 'finished' || !(frame.intensity > 0)) return;
    const queryRadius = frame.outerRadius + 48;
    queryPhysicalBodies(state, frame.eye, queryRadius, helpers, nearby,
      { promote: false, includeAnchored: true });
    const candidates = [], seen = new Set();
    const admit = body => {
      if (!body || body.alive === false || seen.has(body.id) || candidates.length >= STORM_LIMITS.maxBodies
        || state.entities.get(body.id) !== body || !planar(body.pos)
        || dist(body.pos, frame.eye) > queryRadius + Math.max(0, finite(body.radius))) return;
      candidates.push(body); seen.add(body.id);
    };
    // The host owns spatial gathering. Our work after that query remains bounded even in a
    // dense wreck field: pilot + finite owned roster first, then at most 96 nearest candidates.
    admit(playerOf(state));
    for (const ref of run.bodies) admit(bodyOf(state, run, ref));
    const checks = Math.min(nearby.length, STORM_LIMITS.maxCandidateChecks);
    for (let index = 0; index < checks && candidates.length < STORM_LIMITS.maxBodies; index++) admit(nearby[index]);
    const covers = candidates.filter(body => body.mass >= STORM_LIMITS.heavyCoverMass && body.radius >= 12)
      .sort((a, b) => b.mass - a.mass || a.id - b.id).slice(0, STORM_LIMITS.maxCovers);
    lastCovers = covers;
    let admitted = 0;
    for (const body of candidates) {
      const intent = sampleStormBodyIntent(frame, body, { dt, state, covers,
        bodyProfile: fieldBodyProfile(body, state) });
      if (!intent.eligible || !intent.impulse || !(Math.hypot(intent.impulse.x, intent.impulse.z) > 0)) continue;
      const receipt = deliverPhysicalImpulseDetailed(state, body, intent.impulse,
        { tag: 'glasswake_current', kind: 'environmental_current', actorId: null, tick: state.tick },
        { continuous: true, dt, scaleEnvironment: false });
      if (receipt.accepted) admitted++;
    }
    run.lastAffectedCount = admitted;
  }
  function buildView(run, frame) {
    const summary = sampleLedgerSummary(run.ledger);
    const returning = frame.phase === 'finished';
    const text = run.phase === 'finished' ? `Expedition ${run.outcome}. ${summary.extracted}/${summary.total} samples banked.`
      : returning ? 'The storm has passed. Tow charged pods to the mooring before the return window closes.'
      : frame.phase === 'forecast' ? 'Read the double-notch opening. Hold pods inside a marked pocket until charged, then tow them to the mooring.'
      : `${summary.extracted} banked · ${summary.charged} charged. Ride the eye or return now; every later pocket is optional.`;
    return {
      expeditionId: run.id, phase: run.phase, active: run.phase !== 'finished', outcome: run.outcome, frame,
      forecast: forecastStorm(run.plan, frame.simTime, 8),
      samples: run.ledger.samples.map((row, index) => {
        const body = sampleBody(run.ledger, row.id, state), pocket = frame.pockets[Math.floor(index / 2)];
        return { id: row.id, bodyId: row.bodyId, position: body?.pos ? { x: body.pos.x, z: body.pos.z } : null,
          status: row.status, charge: row.charge, requiredCharge: 1, quality: pocket.valueTier,
          label: `Sample ${index + 1}`, commodityId: row.commodityId, quantity: row.quantity };
      }),
      covers: (lastCovers.length ? lastCovers : run.bodies.filter(ref => ref.role === 'cover')
        .map(ref => bodyOf(state, run, ref)).filter(Boolean)).slice(0, STORM_LIMITS.maxCovers)
        .filter(body => body.alive !== false && state.entities.get(body.id) === body).map(body => ({
          id: body.id, position: { x: body.pos.x, z: body.pos.z }, radius: body.radius,
          flow: { ...sampleStormAtPoint(frame, body.pos).mediumVelocity },
          pinned: finite(state.combat?.entities?.[String(body.id)]?.physicsResponse?.massScale,
            finite(body.physicsResponse?.massScale, 1)) > 1.001,
        })),
      extraction: { ...frame.extraction, relativeSpeedLimit: 12, active: run.phase !== 'finished' },
      objective: { title: 'GLASSWAKE', text, returnRemainingS: Math.max(0, run.returnDeadline - frame.simTime) },
      settledCount: summary.extracted, totalCredits: summary.bonusCr,
    };
  }

  const api = {
    get state() { return state; },
    get active() { return recordOf(state); },
    get view() { return currentView; },
    ready() { return !detached && !restoring && hasOwners(); },
    begin({ patternId = 'lee_arc', live = null, director: d = null } = {}) {
      if (detached || restoring) return { ok: false, reason: 'runtime_unavailable' };
      const entry = stormChaseEntry(state);
      if (!entry.ok) return entry;
      if (!hasOwners()) return { ok: false, reason: 'owner_unavailable' };
      const data = featureState(state), previousRun = data.active;
      if (previousRun && previousRun.phase !== 'finished') return { ok: false, reason: 'expedition_active' };
      if (!STORM_PATTERN_BY_ID[patternId]) return { ok: false, reason: 'unknown_pattern' };
      const now = nowOf(state), serial = Math.max(1, Math.floor(finite(data.nextSerial, 1)));
      const id = `glasswake_${state.meta?.seed >>> 0}_${serial}`;
      const plan = createStormPlan({ seed: state.meta?.seed ?? 4242, patternId,
        ...STORM_CHASE_SITE, origin: siteOrigin(), startedAt: now, id });
      const frame = sampleStorm(plan, now);
      // Starting from inside the future weather is refused. Forecast never materializes into a hull.
      if (dist(playerOf(state).pos, frame.eye) < frame.outerRadius + STORM_CHASE_SITE.playerSpawnClearance)
        return { ok: false, reason: 'move_outside_front' };
      data.nextSerial = serial + 1;
      const run = {
        schemaVersion: 1, id, plan, encounterId: live?.id ?? null, phase: 'expedition', outcome: '', endedAt: null,
        returnDeadline: now + plan.durationS + STORM_CHASE_SITE.returnGraceS,
        ledger: createSampleLedger({ expeditionId: id, sectorId: plan.sectorId, createdAt: now, samples: runSamples() }),
        bodies: [], attemptedSamples: [], lastAffectedCount: 0,
      };
      data.active = run; director = d; liveRef = live; lastTick = null; lastTime = now; lastCovers = [];
      if (!fieldsFor(frame)) { api.finish('owner_unavailable'); return { ok: false, reason: 'owner_unavailable' }; }
      if (!spawnFieldBodies(run, frame) || recordOf(state) !== run || run.phase === 'finished') {
        if (recordOf(state) === run) api.finish('admission_interrupted');
        return { ok: false, reason: 'admission_interrupted' };
      }
      if (live) { live.phase = 'expedition'; live.vars = live.vars || {}; live.vars.stormChaseId = run.id; }
      publishView(buildView(run, frame));
      notice('GLASSWAKE: storm forecast acquired. Tow charged pods to the marked mooring below 12 WU/s. Every delivery is banked.', 'info', true);
      return { ok: true, expeditionId: run.id, plan };
    },
    update(dt) {
      if (detached || restoring) return null;
      const run = recordOf(state);
      if (!run || run.phase === 'finished') return currentView;
      if (currentSector(state) !== run.plan.sectorId) { api.finish('sector_left'); return currentView; }
      const player = playerOf(state);
      if (!player || player.alive === false || (Number.isFinite(player.hull) && player.hull <= 0)) { api.finish('pilot_lost'); return currentView; }
      if (!receiverOf(run)) { api.finish('receiver_lost'); return currentView; }
      if (state.mode && state.mode !== 'flight') return currentView;
      const now = nowOf(state), tick = Number.isInteger(state.tick) ? state.tick : now;
      if (lastTime !== null && now < lastTime) { api.finish('clock_reversed'); return currentView; }
      if (now >= run.returnDeadline) { api.finish('return_window_closed'); return currentView; }
      if (tick === lastTick || (lastTime !== null && now === lastTime)) return currentView;
      const step = clamp(Math.min(finite(dt), lastTime === null ? finite(dt) : now - lastTime), 0, STORM_LIMITS.maxDt);
      lastTick = tick; lastTime = now;
      if (!(step > 0)) return currentView;
      const frame = sampleStorm(run.plan, now);
      if (!frame) { api.finish('invalid_plan'); return currentView; }
      if (!hasOwners() || !fieldsFor(frame)) { api.finish('owner_unavailable'); return currentView; }
      releaseSamples(run, frame);
      if (recordOf(state) !== run || run.phase === 'finished' || restoring) return currentView;
      applyCurrent(run, frame, step);
      chargeAndReceive(run, frame, step);
      if (recordOf(state) !== run || run.phase === 'finished' || restoring) return currentView;
      if (run.ledger.samples.every(row => TERMINAL.has(row.status))) api.finish('samples_accounted');
      else if (dist(player.pos, frame.eye) > 2200 && dist(player.pos, frame.extraction) > 1800) api.finish('departed');
      if (recordOf(state) === run && !restoring) publishView(buildView(run, frame));
      return currentView;
    },
    /** Leaving is always allowed. Already banked cargo/credits remain with their real owners. */
    finish(reason = 'withdrawn') {
      const run = recordOf(state);
      if (!run || run.phase === 'finished') return false;
      if (settling > 0) { pendingFinish = { run, reason: String(reason).slice(0, 80) }; return true; }
      const now = nowOf(state), summary = sampleLedgerSummary(run.ledger);
      run.phase = 'finished'; run.outcome = summary.extracted > 0 ? 'extracted' : String(reason).slice(0, 80); run.endedAt = now;
      finishSampleLedger(run.ledger, run.outcome, now);
      clearFields(); retireOwned(run);
      if (recordOf(state) !== run) return true;
      const data = featureState(state);
      data.history.push(summaryOf(run));
      if (data.history.length > STORM_CHASE_SITE.maxHistory) data.history.splice(0, data.history.length - STORM_CHASE_SITE.maxHistory);
      const live = liveFor(run), d = director || owner('encounterDirector');
      if (live && d?.resolve) d.resolve(live, run.outcome);
      else if (recordOf(state) === run) {
        // Continue intentionally clears the director's transient live rows. The feature's
        // durable custody still finishes, with a truthful result even without an old dialog.
        const ending = reason === 'receiver_lost' ? 'Sample mooring lost.' : 'Expedition closed.';
        notice(`GLASSWAKE: ${ending} ${summary.extracted}/${summary.total} samples banked. Unreturned bottles are written off.`, 'info', true);
      }
      if (recordOf(state) === run) publishView(buildView(run, sampleStorm(run.plan, now)));
      return true;
    },
    snapshot() {
      const data = featureState(state), run = data.active;
      return { schemaVersion: 1, nextSerial: data.nextSerial, history: data.history.map(row => ({ ...row })),
        active: run ? { schemaVersion: 1, id: run.id, plan: normalizeStormPlan(run.plan), encounterId: run.encounterId,
          phase: run.phase, outcome: run.outcome, endedAt: run.endedAt, returnDeadline: run.returnDeadline,
          ledger: snapshotSampleLedger(run.ledger), bodies: run.bodies.map(ref => ({ ...ref })),
          attemptedSamples: [...run.attemptedSamples], lastAffectedCount: 0 } : null };
    },
    serialize() { return api.snapshot(); },
    // saveSystem deserializes feature slices before its persistent actor respawn. Stage only;
    // save:loaded supplies the save owner's exact old-ID -> new-ID map after all spawns settle.
    deserialize(raw, options = {}) {
      if (restoring) { stagedRestore = raw ?? null; hasStagedRestore = true; return true; }
      return api.restore(raw, options);
    },
    restore(raw, { entityIdRemap = null } = {}) {
      const outgoing = recordOf(state);
      const source = raw?.active;
      const remap = entityIdRemap instanceof Map ? entityIdRemap : null;
      clearFields(); liveRef = null; director = null; lastTick = null; lastTime = nowOf(state); publishView(null); lastCovers = [];
      function retireUnbound(incoming = null) {
        const retained = new Set((incoming?.bodies || []).map(ref => `${ref.id}:${ref.generation}`));
        for (const ref of Array.isArray(outgoing?.bodies) ? outgoing.bodies.slice(0, STORM_CHASE_SITE.maxOwnedBodies) : []) {
          if (!ref || !Number.isSafeInteger(ref.id)) continue;
          if (incoming?.id === outgoing.id && retained.has(`${ref.id}:${ref.generation}`)) continue;
          const body = bodyOf(state, outgoing, ref);
          if (body) retire(body);
        }
      }
      function retireRejectedIncoming() {
        // A rejected feature envelope may still have valid physical actors restored by core.
        // Retire only referenced, save-owner-remapped feature occupants; never scan the world
        // for matching tags or weaken generation checks during an ordinary direct restore.
        if (!remap || typeof source?.id !== 'string') return;
        const rows = Array.isArray(source.ledger?.samples) ? source.ledger.samples.slice(0, 6) : [];
        const refs = Array.isArray(source.bodies) ? source.bodies.slice(0, STORM_CHASE_SITE.maxOwnedBodies) : [];
        const candidates = refs.map(ref => ({ ...ref,
          sampleId: ref?.role === 'sample' ? rows.find(row => row?.bodyId === ref.id && row.bodyGeneration === ref.generation)?.id : null }))
          .concat(rows.map(row => ({ id: row?.bodyId, generation: row?.bodyGeneration, role: 'sample', sampleId: row?.id })));
        const retired = new Set();
        for (const ref of candidates) {
          if (!Number.isSafeInteger(ref.id) || !['sample', 'debris', 'cover', 'receiver'].includes(ref.role)) continue;
          const id = remap.get(String(ref.id)), body = state.entities.get(id), tag = body?.data?.stormChase;
          const key = `${id}:${generation(body)}`;
          if (!Number.isSafeInteger(id) || retired.has(key) || !body || generation(body) === null
            || tag?.expeditionId !== source.id || tag.role !== ref.role
            || (ref.role === 'sample' && (!SAMPLE_IDS.includes(ref.sampleId) || tag.sampleId !== ref.sampleId))) continue;
          retired.add(key); retire(body);
        }
      }
      if (!raw || raw.schemaVersion !== 1) {
        state.stormChase = freshState(); retireRejectedIncoming(); retireUnbound(); return false;
      }
      const data = freshState();
      data.nextSerial = clamp(Math.floor(finite(raw.nextSerial, 1)), 1, 1000000000);
      data.history = Array.isArray(raw.history) ? raw.history.slice(-STORM_CHASE_SITE.maxHistory).map(row => ({
        id: String(row?.id || '').slice(0, 120), patternId: String(row?.patternId || '').slice(0, 40),
        sectorId: String(row?.sectorId || '').slice(0, 80), startedAt: finite(row?.startedAt), endedAt: finite(row?.endedAt),
        outcome: String(row?.outcome || '').slice(0, 80), total: clamp(finite(row?.total), 0, 6),
        extracted: clamp(finite(row?.extracted), 0, 6), lost: clamp(finite(row?.lost), 0, 6),
        charged: 0, bonusCr: clamp(finite(row?.bonusCr), 0, 12000),
      })) : [];
      const plan = normalizeStormPlan(source?.plan);
      state.stormChase = data;
      if (!source || !plan || source.id !== plan.id || plan.sectorId !== STORM_CHASE_SITE.sectorId
        || plan.startedAt > nowOf(state) + 1e-8 || dist(plan.origin, siteOrigin()) > 0.01
        || Math.abs(plan.heading - STORM_CHASE_SITE.heading) > 1e-8) {
        retireRejectedIncoming(); retireUnbound(); return !source;
      }
      try {
        // Ordinary restore keeps occupant-generation guards intact. Only the save owner's
        // explicit mapping can transfer custody to a freshly spawned persistent occupant.
        // Exact expedition + role + sample tags are required; there is no broad tag search.
        const mappedBody = (savedId, role, sampleId = null) => {
          if (!Number.isSafeInteger(savedId) || !remap?.has(String(savedId))) return null;
          const id = remap.get(String(savedId));
          if (!Number.isSafeInteger(id) || id <= 0) return null;
          const body = state.entities.get(id), tag = body?.data?.stormChase;
          return body && body.alive !== false && generation(body) !== null
            && tag?.expeditionId === plan.id && tag.role === role
            && (role !== 'sample' || tag.sampleId === sampleId) ? body : null;
        };
        const ledger = restoreSampleLedger(source.ledger, { expeditionId: plan.id });
        if (ledger.sectorId !== plan.sectorId || ledger.samples.length !== SAMPLE_IDS.length
          || ledger.samples.some((row, index) => row.id !== SAMPLE_IDS[index])) {
          retireRejectedIncoming(); retireUnbound(); return false;
        }
        for (const row of ledger.samples) {
          if (!remap?.has(String(row.bodyId))) continue;
          const body = mappedBody(row.bodyId, 'sample', row.id);
          if (row.status === 'drifting' || row.status === 'charged') {
            if (body) { row.bodyId = body.id; row.bodyGeneration = generation(body); }
            else loseSample(ledger, row.id, 'restored_body_not_owned', nowOf(state));
          } else if (body && TERMINAL.has(row.status)) {
            // A snapshot taken during settlement may still contain its consumed capsule.
            // It is cleanup-owned, but a terminal receipt can never become chargeable again.
            retire(body);
          }
        }
        observeSampleBodies(ledger, state);
        const bodyRefs = Array.isArray(source.bodies) ? source.bodies.slice(0, STORM_CHASE_SITE.maxOwnedBodies).filter(ref =>
          Number.isSafeInteger(ref?.id) && ref.id > 0 && ['debris', 'cover', 'receiver', 'sample'].includes(ref.role))
          .map(ref => {
            const sampleId = ref.role === 'sample' ? source.ledger.samples.find(row => row.bodyId === ref.id && row.bodyGeneration === ref.generation)?.id : null;
            const body = mappedBody(ref.id, ref.role, sampleId);
            if (remap?.has(String(ref.id)) && !body) return null;
            return { id: body?.id ?? ref.id, generation: body ? generation(body) : Number.isSafeInteger(ref.generation) ? ref.generation : null, role: ref.role };
          }).filter(Boolean) : [];
        const run = {
          schemaVersion: 1, id: plan.id, plan,
          encounterId: typeof source.encounterId === 'string' || Number.isSafeInteger(source.encounterId) ? source.encounterId : null,
          phase: source.phase === 'finished' || ledger.closed ? 'finished' : 'expedition',
          outcome: String(source.outcome || '').slice(0, 80), endedAt: Number.isFinite(source.endedAt) ? source.endedAt : null,
          returnDeadline: plan.startedAt + plan.durationS + STORM_CHASE_SITE.returnGraceS, ledger,
          bodies: bodyRefs.filter((ref, index, refs) => refs.findIndex(other => other.id === ref.id && other.generation === ref.generation) === index),
          attemptedSamples: Array.isArray(source.attemptedSamples) ? [...new Set(source.attemptedSamples.filter(id => SAMPLE_IDS.includes(id)))].slice(0, 6) : [],
          lastAffectedCount: 0,
        };
        data.active = run;
        // Live custody records remain cleanup-owned even if a damaged envelope omitted its
        // redundant body roster. Rebinding IDs never spawns anything or revives a lost sample.
        for (const row of ledger.samples) {
          const body = sampleBody(ledger, row.id, state);
          if (body && !run.bodies.some(ref => ref.id === body.id && ref.generation === generation(body))) {
            if (TERMINAL.has(row.status)) retire(body);
            else if (run.bodies.length < STORM_CHASE_SITE.maxOwnedBodies)
              run.bodies.push({ id: body.id, generation: generation(body), role: 'sample' });
          }
        }
        retireUnbound(run);
        for (const row of ledger.samples) if (row.status === 'pending' && run.attemptedSamples.includes(row.id)) loseSample(ledger, row.id, 'interrupted_admission', nowOf(state));
        if (run.phase === 'finished') {
          finishSampleLedger(ledger, run.outcome || 'restored_finished', nowOf(state));
          retireOwned(run);
        }
        else if (currentSector(state) !== plan.sectorId || nowOf(state) >= run.returnDeadline) api.finish('restore_expired');
        else if (!receiverOf(run)) api.finish('receiver_lost');
        if (recordOf(state) === run && !restoring) publishView(buildView(run, sampleStorm(plan, nowOf(state))));
        return true;
      } catch (_) { data.active = null; retireRejectedIncoming(); retireUnbound(); return false; }
    },
    // Renderer or registry teardown may detach without consuming a live saved expedition.
    detach() {
      if (detached) return;
      detached = true; clearFields(); publishView(null);
      for (const unsub of unsubs) if (typeof unsub === 'function') unsub();
      unsubs.length = 0;
      if (RUNTIMES.get(state) === api) RUNTIMES.delete(state);
    },
    dispose() { api.finish('disposed'); api.detach(); },
  };
  featureState(state);
  RUNTIMES.set(state, api);
  if (bus?.on) {
    unsubs.push(bus.on('sector:exit', () => { if (!restoring) api.finish('sector_left'); }));
    unsubs.push(bus.on('player:death', () => api.finish('pilot_lost')));
    unsubs.push(bus.on('game:new', () => {
      const run = recordOf(state);
      if (run && run.phase !== 'finished') {
        run.phase = 'finished';
        finishSampleLedger(run.ledger, 'new_game', nowOf(state));
        retireOwned(run);
      }
      clearFields(); state.stormChase = freshState(); publishView(null); lastCovers = [];
      lastTick = null; lastTime = null; pendingFinish = null; stagedRestore = null; hasStagedRestore = false; restoring = false;
    }));
    unsubs.push(bus.on('save:restoring', () => {
      restoring = true; clearFields(); publishView(null); stagedRestore = null; hasStagedRestore = false;
    }));
    unsubs.push(bus.on('save:loaded', () => {
      const incoming = hasStagedRestore ? stagedRestore : state.stormChase;
      stagedRestore = null; hasStagedRestore = false; restoring = false;
      api.restore(incoming, { entityIdRemap: state.sessionEntityIdRemap });
    }));
    unsubs.push(bus.on('save:error', () => {
      restoring = false; stagedRestore = null; hasStagedRestore = false; lastTick = null; lastTime = nowOf(state);
    }));
  }
  if (recordOf(state)) api.restore(state.stormChase);
  return api;
}

/** Registry-facing fixed-clock system. A factory keeps independent test/game states isolated. */
export const stormChase = {
  name: 'stormChase',
  init(ctx) { this.runtime?.detach(); this.runtime = createStormChaseRuntime(ctx); },
  update(dt, state) { if (this.runtime?.state === state) return this.runtime.update(dt); return null; },
  snapshot() { return this.runtime?.snapshot() || null; },
  serialize() { return this.runtime?.serialize() || null; },
  restore(data, options) { return this.runtime?.restore(data, options) || false; },
  deserialize(data, options) { return this.runtime?.deserialize(data, options) || false; },
  readView() { return this.runtime?.view || null; },
  destroy() { this.runtime?.dispose(); this.runtime = null; },
};

/** Exactly the existing selfRegistered fire/choose/tick contract; no invented director helpers. */
export const STORM_CHASE_ENCOUNTER_RUNTIME = Object.freeze({
  fire(d, live, state) {
    const entry = stormChaseEntry(state), runtime = RUNTIMES.get(state);
    if (!entry.ok || !runtime?.ready()) { d.abort(live, entry.ok ? 'owner_unavailable' : entry.reason); return; }
    if (runtime.active && runtime.active.phase !== 'finished') { d.abort(live, 'expedition_active'); return; }
    live.phase = 'offer'; live.deadlineAt = d.now() + 75;
    d.say(live, 'info', live.shape.primaryLine, null, { literal: true, primary: true });
    d.offerChoices(live, ['lee_arc', 'cross_shear', 'return_hook', 'decline'], 'decline', live.deadlineAt);
  },
  choose(d, live, state, choiceId) {
    if (live.phase !== 'offer') return;
    if (!STORM_PATTERN_BY_ID[choiceId]) { d.resolve(live, 'declined'); return; }
    const runtime = RUNTIMES.get(state), result = runtime?.begin({ patternId: choiceId, live, director: d });
    if (!result?.ok) { d.resolve(live, result?.reason || 'owner_unavailable'); return; }
    d.say(live, 'info', 'Double notches mark the opening. Hold physical pods inside a marked pocket until charged; tow them home below 12 WU/s. Heavy wrecks shelter you. Pin can hold an anchor. Every delivery is banked, and you may leave at any time.', null, { literal: true });
  },
  tick(d, live, state, now) {
    if (live.phase === 'offer') { if (now >= live.deadlineAt) d.resolve(live, 'declined'); return; }
    if (live.phase !== 'expedition') return;
    const run = recordOf(state);
    if (!run || run.id !== live.vars?.stormChaseId) { d.resolve(live, 'interrupted'); return; }
    if (run.phase === 'finished') d.resolve(live, run.outcome);
  },
});

export default stormChase;
