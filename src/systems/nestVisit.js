// Book2 arrangement around the existing705 owner. No parallel enemy/economy simulator.
import { NEST_VISIT, nestPosition, nestApproach, normalizeNestVisit, NEST_OUTCOMES } from '../data/nestVisit.js';
import { captureNestRuntime, normalizeNestSnapshot, departNestRuntime, nestSnapshotSpawnSites, settleNestRuntimeForSave, nestSnapshotAdoptions } from '../data/encounters/705-the-nest.js';
import { hullEnvelopeWu, proxyOuterRadiusWu, COLLISION_PROXY_MANIFESTS } from '../data/collisionProxyManifests.js';
import { modelTruthProxyManifest } from '../data/modelTruth.js';
import { shouldSyncPhysicsBodyEntity, substanceFor } from '../core/physicsAuthority.js';
import { PHYSICS_MATERIALS } from '../data/physicsMaterials.js';
import { getBeatStepStatus } from '../story/campaign47a/campaignTransitions.js';

const has = (o, k) => Object.prototype.hasOwnProperty.call(o || {}, k);
const liveNest = d => Object.values(d.state.encounterDirector?.live || {})
  .find(l => l?.shapeId === 'the_nest' && l.phase !== 'done');
const activeRun = s => (!s.mode || s.mode === 'flight') && !s.physicsVenue?.active
  && (!s.run?.kind || s.run.kind === 'adventure' || s.run.phase === 'inactive');

export function nestSiteClear(state, anchor, radius = NEST_VISIT.coreClearance, admittedCast = null) {
  for (const e of state.entities?.values?.() || []) {
    if (!e || e.alive === false || admittedCast?.has(e) || !shouldSyncPhysicsBodyEntity(e)) continue;
    if (!Number.isFinite(e.pos?.x) || !Number.isFinite(e.pos?.z)) continue;
    if (PHYSICS_MATERIALS[substanceFor(e).material]?.ghost === true) continue;
    let r = Math.max(0, Number(e.radius) || 0, Number(e.physicsBody?.radius) || 0, hullEnvelopeWu(e));
    for (const manifest of [e.physicsBody?.collisionProxyManifest,
      COLLISION_PROXY_MANIFESTS[e.data?.collisionProxy], modelTruthProxyManifest(e)]) {
      if (manifest) r = Math.max(r, proxyOuterRadiusWu(manifest, e));
    }
    if (!Number.isFinite(r)) return false;
    if (Math.hypot(e.pos.x - anchor.x, e.pos.z - anchor.z) < radius + r + 12) return false;
  }
  return true;
}

export function captureNestVisit(d, { settle = true, persist = true } = {}) {
  const dir = d.state.encounterDirector;
  if (!dir) return undefined;
  const live = liveNest(d);
  if (live && settle) settleNestRuntimeForSave(d, live, d.state);
  let value = dir.nestVisit;
  if (live?.sectorId === NEST_VISIT.sectorId && live?.data?.nest?.contactEstablished === true && !dir.nestVisit?.receipt) {
    const snapshot = normalizeNestSnapshot(captureNestRuntime(d.state, live, d.now()));
    if (snapshot) value = { version: 1, status: 'active', encounterId: live.id,
      sectorId: NEST_VISIT.sectorId, anchor: { ...live.anchor }, snapshot, receipt: null };
  }
  if (persist && value !== undefined) dir.nestVisit = value;
  return value !== undefined || has(dir, 'nestVisit') ? normalizeNestVisit(value) : undefined;
}

export function recordNestOutcome(d, live, outcome) {
  const dir = d.state.encounterDirector, rec = live?.data?.nest;
  if (live?.shapeId !== 'the_nest' || live.sectorId !== NEST_VISIT.sectorId || dir?.live?.[live.id] !== live || !rec?.contactEstablished
      || rec.terminalOutcome !== outcome || !NEST_OUTCOMES.includes(outcome)) return false;
  if (dir.nestVisit?.receipt) return false;
  const receipt = { encounterId: live.id, shape: 'the_nest', outcome, sectorId: live.sectorId, t: d.now() };
  dir.nestVisit = { version: 1, status: 'terminal', encounterId: live.id,
    sectorId: NEST_VISIT.sectorId, anchor: { ...live.anchor }, snapshot: null, receipt };
  return true;
}

export function leaveNestVisit(d, live) {
  if (d._saveRestoring || live?.shapeId !== 'the_nest' || live.phase === 'done'
      || d.state.encounterDirector?.live?.[live.id] !== live) return false;
  if (!live.data?.nest?.contactEstablished || !d.player() || d.player().alive === false) {
    captureNestVisit(d); return false;
  }
  departNestRuntime(d, live, d.state);
  return live.phase === 'done';
}

export function tickNestVisit(d) {
  const s = d.state, dir = s.encounterDirector;
  if (!dir || d._saveRestoring || !activeRun(s)) return { ok: false, reason: 'inactive' };
  const existing = liveNest(d);
  // The director captures once after runtime tick (and synchronously at Save).
  // Avoid a duplicate full semantic snapshot before that same frame's simulation.
  if (existing) return { ok: true, encounterId: existing.id, reused: true };
  const own = normalizeNestVisit(dir.nestVisit);
  if (has(dir, 'nestVisit') && !own) return { ok: false, reason: 'invalid_saved_visit' };
  if (own?.status === 'terminal') return { ok: true, reason: 'terminal' };
  const resume = own?.status === 'active';
  if (resume && own.snapshot?.pendingCarrierOutcome) {
    return { ok: d.restoreNestTerminal?.(own) === true, reason: 'pending_terminal' };
  }
  const done = getBeatStepStatus(s, 2)?.completed || [];
  if (!resume && (s.story?.beatIndex !== 2 || !done.includes('compost') || done.includes('nest'))) return { ok: false, reason: 'not_due' };
  if (s.world?.currentSectorId !== NEST_VISIT.sectorId) return { ok: false, reason: 'wrong_sector' };
  if (s.player?.flags?.docked || s.ui?.docked) return { ok: false, reason: 'docked' };
  const player = d.player();
  if (!player?.pos || player.alive === false) return { ok: false, reason: 'no_player' };
  const now = d.now();
  if (now < (d._nestVisitNextTry || 0)) return { ok: false, reason: 'retry_wait' };
  const snapshot = resume ? normalizeNestSnapshot(own.snapshot) : null;
  if (resume && (!snapshot || !snapshot.contactEstablished)) return { ok: false, reason: 'invalid_saved_cast' };
  const anchor = resume ? snapshot.carrier.pos : own?.anchor || nestPosition();
  if (!anchor || (resume && Math.hypot(player.pos.x - anchor.x, player.pos.z - anchor.z) > 3000)) return { ok: false, reason: 'resume_out_of_reach' };
  const approach = nestApproach();
  if (!resume && (Math.hypot(player.pos.x - approach.x, player.pos.z - approach.z) > NEST_VISIT.arrivalRadius
      || Math.hypot(player.pos.x - anchor.x, player.pos.z - anchor.z) > 720)) return { ok: false, reason: 'approach' };
  d._nestVisitNextTry = now + 2;
  const adoptions = resume ? nestSnapshotAdoptions(s, snapshot, own.encounterId) : { ok: true, actors: new Map() };
  if (!adoptions.ok) return { ok: false, reason: 'ambiguous_saved_actor' };
  // Generic persistence can restore only some launched cast members. Their exact saved
  // poses belong to the already-validated close assembly, not foreign berth obstacles.
  // A divergent restored pose is uncertain: never spawn a missing member through it.
  const admittedCast = new Set();
  for (const [slot, actor] of adoptions.actors) {
    const row = [snapshot.carrier, ...snapshot.doors, ...snapshot.wasps].find(a => a.slot === slot);
    if (!row || !Number.isFinite(actor.pos?.x) || !Number.isFinite(actor.pos?.z)
        || Math.hypot(actor.pos.x - row.pos.x, actor.pos.z - row.pos.z) > 0.01
        || Math.abs((Number(actor.rot) || 0) - row.rot) > 0.001) {
      return { ok: false, reason: 'divergent_saved_actor' };
    }
    admittedCast.add(actor);
  }
  const spawnSites = resume ? nestSnapshotSpawnSites(snapshot) : [{ pos: anchor, radius: NEST_VISIT.coreClearance }];
  if (!spawnSites || spawnSites.some(site => !adoptions.actors.has(site.slot) && !nestSiteClear(s, site.pos, site.radius, admittedCast))) {
    if (d._nestClearanceCueAt == null || now - d._nestClearanceCueAt >= 20) {
      d._nestClearanceCueAt = now;
      d.emit('comms:log', { from: 'CHARON LANE WATCH', text: 'Nursery berth obstructed. Hold outside; the carrier cannot arrive through another hull.', kind: 'encounter' });
    }
    return { ok: false, reason: 'occupied' };
  }
  if (!own) dir.nestVisit = { version: 1, status: 'waiting', encounterId: NEST_VISIT.encounterId,
    sectorId: NEST_VISIT.sectorId, anchor, snapshot: null, receipt: null };
  const encounterId = own?.encounterId || NEST_VISIT.encounterId;
  // Only this exact saved active visit can resume without paying a second pacing charge.
  d._nestResumePermit = resume ? encounterId : null;
  let result;
  try {
    result = d.requestAuthoredEncounter({ shapeId: 'the_nest', encounterId,
      sectorId: NEST_VISIT.sectorId, anchor, zoneId: 'charon_nest_nursery_v1',
      zoneName: 'South radiation-lane nursery', zoneType: 'outlaw_zone', zoneRadius: 520,
      respectPacing: true, data: { authoredNestVisit: true, nestSnapshot: snapshot, nestResume: resume } });
  } finally { d._nestResumePermit = null; }
  if (!result?.ok && dir.nestVisit?.status === 'waiting') {
    dir.nestVisit.waitReason = result?.reason || 'admission';
    if (d._nestWaitReason !== dir.nestVisit.waitReason) {
      d._nestWaitReason = dir.nestVisit.waitReason;
      d.emit('comms:log', { from: 'CHARON LANE WATCH', text: 'Nursery signal acquired. Traffic is still crossing the lane; hold outside the berth until the carrier is clear to arrive.', kind: 'encounter' });
    }
  } else d._nestWaitReason = null;
  captureNestVisit(d);
  return result;
}
