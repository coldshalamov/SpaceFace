// THE RUNAWAY KILN — self-registered runtime for the Vesta Forge ballistic rescue
// (build_map §30.3 VIG-02). An unmanned kilnback-mass crucible drifts ballistically
// on the depot ring: no crew, no helm, no throttle. Shooting it lights the molten
// load — that is a real detonation ending, not a failure screen. The only save is
// physical: a Mass Seed anchor, a Twin Bridle on a counterweight, or a plain rope
// and your own thrust, bleeding the vector down where the yard can collect her.
//
// The script only composes live owners: spawnProp for the crucible (the measured
// kilnback compound body), the massline and mass-seed verbs the player already
// carries, sectorsim:impulse for the noise, economy/faction intents for the
// settlement, news:publish for the headline. No timer HUD, no scripted stop at N
// metres — completion is a function of the crucible's own velocity, nothing else.
import { occupantGenerationOf } from '../core/entity.js';
import { physicsBodyNativeReady, readPhysicsTelemetry } from '../core/physicsAuthority.js';
import { kilnbackPhysicalBody, KILNBACK_RADIUS } from '../data/kilnbackBody.js';

const DRIFT_SPEED = 24;           // WU/s authored closing speed — ~90-100 s of work on the ring
const SPAWN_MIN_WU = 900;
const SPAWN_MAX_WU = 2400;
const RING_RADIUS = 260;          // inside this at speed, the ring takes the load
const SAVE_SPEED = 12;            // below this the yard can collect her — the bleed is done
const GRACE_S = 420;              // after this the lane stops watching
const PAY = 320;
const IMPACT_DANGER = 0.03;       // the scorch is real noise on the lane, via the danger pool
const DEPOT_STATION = 'station_depot3';
const SAVE_KEY = 'openRunawayKiln';
const SHAPE_ID = 'the_runaway_kiln';
const BINDINGS = new WeakMap();
const TRANSPORT = new WeakMap();

function bindCrucible(live, entity, restored = null, nativeRequired = false) {
  BINDINGS.set(live, { entity, data: entity.data, generation: occupantGenerationOf(entity), restored, nativeRequired, initialMotion: projectedMotion(entity) });
}

function ownedCrucible(state, live) {
  const binding = BINDINGS.get(live);
  const entity = state.entities?.get(live.vars.crucibleId);
  return binding && entity === binding.entity && entity.data === binding.data
    && occupantGenerationOf(entity) === binding.generation
    && entity.type === 'payload' && entity.data.encounterId === live.id
    && entity.data.storyPropKind === 'runaway_kiln'
    && !entity.data.worldRecordId && !entity.data.persistenceOwner ? entity : null;
}

function projectedMotion(entity) {
  return { pos: { x: entity.pos.x, z: entity.pos.z }, vel: { x: entity.vel.x, z: entity.vel.z },
    rot: entity.rot, angVel: entity.angVel };
}
function sameMotion(a, b) {
  return a.pos.x === b.pos.x && a.pos.z === b.pos.z && a.vel.x === b.vel.x
    && a.vel.z === b.vel.z && a.rot === b.rot && a.angVel === b.angVel;
}

// Read the registered owner, never a telemetry flag or a second physics writer. Native
// handles are checked in place and only detached scalar values leave this function.
function nativeMotion(d, entity, settling) {
  const physics = d.registry?.get?.('physics');
  const state = d.state, owner = physics?._sg02, world = owner?.world;
  const rec = owner?.records?.get(entity.id), body = rec?.body, spec = entity.physicsBody;
  const life = occupantGenerationOf(entity), data = entity.data;
  const tail = owner?.completedOrchardTail?.();
  const current = () => d.state === state && d.registry?.get?.('physics') === physics
    && physics?.state === state && physics._sg02 === owner && owner?.world === world
    && state.entities?.get(entity.id) === entity && occupantGenerationOf(entity) === life
    && entity.data === data && entity.physicsBody === spec && owner?.records?.get(entity.id) === rec
    && rec?.entity === entity && rec.body === body && owner?.dynamicRecords?.has(rec)
    && !physics._nativeRestorePending && !physics._nativeRestoreDeferred
    && !owner._pendingNativeRebuilds?.size && physics._diag?.sg02Ready === true
    && state.settings?.gameplay?.physicsBackend === 'rapier-dynamic'
    && owner.orchardAuthorityAvailable() && physicsBodyNativeReady(entity)
    && world.getRigidBody(body.handle) === body && body.isDynamic() && body.isEnabled()
    && rec.revision === spec.revision && rec.proxyId === spec.collisionProxyManifest?.id
    && ['dynamic', 'ccd', 'radius', 'shape', 'mass', 'inertiaY', 'material'].every(k => rec.spec[k] === spec[k])
    && (!settling || (tail && owner.completedOrchardTail() === tail
      && tail.nativeTick === owner.tick && tail.canonicalTick === state.tick));
  try {
    if (!physics || !owner || !rec || !body || !spec || !current()) return null;
    const origin = owner.getFrameOrigin(), originSeq = owner.getFrameOriginSeq();
    const p = body.translation(), v = body.linvel(), q = body.rotation(), w = body.angvel();
    if (![p.x,p.y,p.z,v.x,v.y,v.z,q.x,q.y,q.z,q.w,w.x,w.y,w.z,origin.x,origin.z].every(Number.isFinite)) return null;
    let rot = -Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z));
    if (rot <= -Math.PI) rot += 2 * Math.PI;
    const motion = { pos: { x: p.x + origin.x, z: p.z + origin.z },
      vel: { x: v.x, z: v.z }, rot, angVel: -w.y || 0 };
    return current() && owner.getFrameOrigin() === origin && owner.getFrameOriginSeq() === originSeq ? motion : null;
  } catch (_) { return null; }
}

function kilnMotion(d, live, entity, settling = false) {
  if (!physicsBodyNativeReady(entity)) return null;
  const native = nativeMotion(d, entity, settling);
  if (native) return native;
  const physics = d.registry?.get?.('physics'), binding = BINDINGS.get(live);
  const telemetry = readPhysicsTelemetry(entity);
  // Historical no-physics unit fixtures are not native-world acceptance. Once any
  // native observation exists, an absent/replaced/failed owner cannot use this lane.
  if (!physics && !binding.nativeRequired && !telemetry && !binding.restored) return projectedMotion(entity);
  if (settling || (binding.nativeRequired && !physics) || telemetry || physics?._sg02?.records?.has(entity.id)) return null;
  if (physics?._sg02 && !physics._sg02.orchardAuthorityAvailable()) return null;
  // Before admission only the exact retained reconstruction/authored seed may be
  // saved, never used to settle. This exception cannot invent a new zero velocity.
  const seed = binding.restored || binding.initialMotion;
  return seed && sameMotion(projectedMotion(entity), seed)
    ? { pos: { ...seed.pos }, vel: { ...seed.vel }, rot: seed.rot, angVel: seed.angVel } : null;
}

function finitePoint(p) {
  return p && Number.isFinite(p.x) && Number.isFinite(p.z)
    && Math.abs(p.x) <= 1e9 && Math.abs(p.z) <= 1e9;
}
function safeId(id) {
  return typeof id === 'string' && id.length > 0 && id.length <= 160
    && !['__proto__', 'constructor', 'prototype'].includes(id);
}
function terminal(state, id) {
  return state.story?.flags?.runawayKiln === 'saved'
    || state.story?.depthProgramEncounters?.completed?.[SHAPE_ID]?.encounterId === id;
}
function validSave(row, state) {
  if (!row || typeof row !== 'object' || Array.isArray(row)
    || !Object.hasOwn(row, 'schemaVersion') || row.schemaVersion !== 1
    || !['zoneId', 'zoneName', 'factionId', 'squadId', 'zoneType', 'variantKind'].every(key =>
      row[key] == null || (typeof row[key] === 'string' && row[key].length <= 160))
    || !safeId(row.encounterId) || row.sectorId !== 'sector_vesta_forge'
    || row.currentSectorId !== state.world?.currentSectorId
    || row.seed !== state.meta?.seed || terminal(state, row.encounterId)
    || !Number.isFinite(row.capturedAt) || Math.abs(row.capturedAt - (state.simTime || 0)) > 1e-6
    || !Number.isFinite(row.elapsed) || row.elapsed < 0 || row.elapsed > 86400
    || !finitePoint(row.pos) || !finitePoint(row.vel) || !finitePoint(row.ring)
    || !Number.isFinite(row.rot) || !Number.isFinite(row.angVel)
    || !Number.isFinite(row.hull) || row.hull <= 0 || row.hull > 90
    || !Number.isInteger(row.struck) || row.struck < 0 || row.struck > 1
    || typeof row.scanned !== 'boolean' || typeof row.latchedOnce !== 'boolean') return false;
  return true;
}


function ringTarget(d, state) {
  const active = state.world && state.world.activeSector;
  const stations = (active && Array.isArray(active.stations) && active.stations)
    || d.stationsInSector();
  const depot = stations.find((s) => s && (s.stationId === DEPOT_STATION || s.id === DEPOT_STATION) && s.pos
    && Number.isFinite(s.pos.x) && Number.isFinite(s.pos.z));
  const ring = depot || stations.find((s) => s && s.pos
    && Number.isFinite(s.pos.x) && Number.isFinite(s.pos.z));
  return ring ? { x: ring.pos.x, z: ring.pos.z, name: ring.name || 'the depot' } : null;
}

function crucibleEntity(state, live) {
  const entity = ownedCrucible(state, live);
  return entity && entity.alive !== false ? entity : null;
}

function speedOf(entity) {
  const vel = entity && entity.vel;
  return vel && Number.isFinite(vel.x) && Number.isFinite(vel.z)
    ? Math.hypot(vel.x, vel.z) : 0;
}

function finish(d, live, state, outcome, flags = {}) {
  const story = state.story || (state.story = { flags: {} });
  if (!story.flags || typeof story.flags !== 'object') story.flags = {};
  if (!story.depthProgramEncounters || typeof story.depthProgramEncounters !== 'object') {
    story.depthProgramEncounters = { schemaVersion: 1, completed: {}, history: [] };
  }
  const memory = story.depthProgramEncounters;
  if (!memory.completed || typeof memory.completed !== 'object') memory.completed = {};
  if (!Array.isArray(memory.history)) memory.history = [];
  const rec = {
    outcome,
    at: d.now(),
    tick: state.tick | 0,
    encounterId: live.id,
    sectorId: live.sectorId,
    seed: state.meta && state.meta.seed,
  };
  memory.completed[live.shapeId] = rec;
  memory.history.push({ shapeId: live.shapeId, ...rec });
  if (memory.history.length > 64) memory.history.splice(0, memory.history.length - 64);
  Object.assign(story.flags, flags);
  d.resolve(live, outcome, { vars: live.vars });
}

function saved(d, live, state) {
  d.say(live, 'info',
    `DEPOT THREE: Vector bled dead. The yard takes her from here — gently, like a foundry egg.`,
    null, { literal: true });
  d.emit('audio:cue', { id: 'sfx_station_dock', gain: 0.8 });
  d.grant(PAY, 'runaway_kiln_saved');
  d.rep('faction_choir', 8, 'runaway_kiln_saved');
  d.emit('news:publish', {
    text: 'CRUCIBLE NINE-ARM CAUGHT SHORT OF THE DEPOT RING — ONE PILOT, ONE ROPE, NO GUNS',
    kind: 'choir', sectorId: live.sectorId, encounterId: live.id, source: 'the_runaway_kiln',
  });
  finish(d, live, state, 'saved', { runawayKiln: 'saved' });
}

function detonate(d, live, state, atRing) {
  const vars = live.vars;
  vars.detonatedAtRing = !!atRing;
  d.say(live, 'info',
    atRing
      ? 'THE LOAD MEETS THE RING. The scorch will outlive the paperwork.'
      : 'THE MOLTEN LOAD LETS GO. That is why nobody answered the band.',
    null, { literal: true });
  d.emit('audio:cue', { id: 'sfx_capital_predetonation', gain: 1.0 });
  d.dangerImpulse(live, 'runaway_kiln_detonation', IMPACT_DANGER);
  d.emit('news:publish', {
    text: atRing
      ? 'CRUCIBLE NINE-ARM BURNS ON THE DEPOT RING — SALVAGE GONE, RING SCORCHED'
      : 'CRUCIBLE NINE-ARM DETONATED UNDER GUNS — THE DEPOT NEVER GOT ITS GLASS',
    kind: 'choir', sectorId: live.sectorId, encounterId: live.id, source: 'the_runaway_kiln',
  });
  finish(d, live, state, atRing ? 'impact' : 'detonated', {
    runawayKiln: atRing ? 'impact' : 'detonated',
  });
}

function snapshotKiln(d, live, state) {
  if (d.state !== state || state.encounterDirector?.live?.[live.id] !== live) return undefined;
  const entity = crucibleEntity(state, live);
  if (!entity || live.phase !== 'runaway' || !physicsBodyNativeReady(entity)) return undefined;
  const motion = kilnMotion(d, live, entity);
  if (!motion) return undefined;
  const row = {
    schemaVersion: 1, encounterId: live.id, sectorId: live.sectorId,
    zoneId: live.zoneId ?? null, zoneName: live.zoneName ?? null,
    factionId: live.factionId ?? null, squadId: live.squadId ?? null,
    zoneType: live.plan.zoneType ?? null, variantKind: live.plan.variantKind ?? null,
    currentSectorId: state.world?.currentSectorId, seed: state.meta?.seed,
    capturedAt: d.now(), elapsed: d.now() - live.vars.startedAt,
    ...motion, hull: entity.hull,
    ring: { x: live.vars.ring.x, z: live.vars.ring.z },
    struck: live.vars.struck, scanned: live.vars.scanned, latchedOnce: live.vars.latchedOnce,
  };
  return validSave(row, state) ? row : undefined;
}

export const RUNAWAY_KILN_RUNTIME = Object.freeze({
  captureSave(d, live, state) {
    // Save may restart a paced capture at a newer tick without another save:started.
    // This enumerable slot projects plain bounded data at the serializer's actual read,
    // not at the earlier announcement. No accessor or entity reference enters the save.
    Object.defineProperty(state.encounterDirector.stats, SAVE_KEY, {
      enumerable: true, configurable: true, get: () => snapshotKiln(d, live, state),
    });
  },

  restoreSaved(d, state) {
    const stats = state.encounterDirector.stats;
    const row = stats[SAVE_KEY];
    delete stats[SAVE_KEY];
    const prior = TRANSPORT.get(state);
    TRANSPORT.delete(state);
    const reusable = prior && ownedCrucible(state, prior.live);
    if (!validSave(row, state)) {
      if (reusable) d.helpers?.removeEntity?.(reusable.id, { immediate: true, reason: 'kiln_invalid_restore' });
      if (prior) BINDINGS.delete(prior.live);
      return;
    }
    const live = d.restoreEncounterRecord({ shapeId: SHAPE_ID, encounterId: row.encounterId,
      sectorId: row.sectorId, zoneCenter: row.pos, zoneId: row.zoneId, zoneName: row.zoneName,
      factionId: row.factionId, squadId: row.squadId, zoneType: row.zoneType, variantKind: row.variantKind });
    if (!live) {
      if (reusable) d.helpers?.removeEntity?.(reusable.id, { immediate: true, reason: 'kiln_restore_collision' });
      if (prior) BINDINGS.delete(prior.live);
      return;
    }
    const entity = reusable || d.spawnProp(live, { type: 'payload', pos: row.pos, radius: KILNBACK_RADIUS,
      mass: 150, scanLabel: 'CRUCIBLE NINE-ARM', storyPropKind: 'runaway_kiln' });
    if (!entity) { d.abort(live, 'crucible_restore_failed'); return; }
    if (prior) BINDINGS.delete(prior.live);
    if (!reusable) {
      entity.hull = row.hull; entity.hullMax = 90;
      entity.physicsBody = kilnbackPhysicalBody([], 0);
      entity.data.masslineTetherable = true;
      entity.vel.x = row.vel.x; entity.vel.z = row.vel.z;
      entity.rot = row.rot; entity.prevRot = row.rot; entity.angVel = row.angVel;
    }
    live.ids.push(entity.id); live.roles[entity.id] = 'crucible';
    live.vars = { crucibleId: entity.id, ring: { ...row.ring }, startedAt: d.now() - row.elapsed,
      struck: row.struck, scanned: row.scanned, latchedOnce: row.latchedOnce,
      lastSpeed: Math.hypot(row.vel.x, row.vel.z) };
    live.startedAt = live.vars.startedAt;
    live.phase = 'runaway'; live.primarySaid = true;
    bindCrucible(live, entity, row, !!d.registry?.get?.('physics'));
    this.captureSave(d, live, state);
    // No tether is recreated: a former numeric target ID is not a physical constraint.
  },

  retire(d, live, state, reason) {
    const entity = ownedCrucible(state, live);
    const stats = state.encounterDirector.stats;
    const row = reason === 'save_loaded' ? stats[SAVE_KEY] : null;
    delete stats[SAVE_KEY];
    if (row) stats[SAVE_KEY] = row;
    if (reason === 'save_loaded' && entity) {
      // Duplicate notifications have not torn down physics. Rebind this exact object
      // instead of minting another body or recycling its ID through queued destroy events.
      TRANSPORT.set(state, { live });
      live.phase = 'done';
      return;
    }
    BINDINGS.delete(live);
    if (!entity) {
      // Do not let the director's generic straggler cleanup touch a recycled/foreign ID.
      live.ids = []; live.roles = {};
    } else if (reason === 'new_game') {
      live.phase = 'done';
      d.helpers?.removeEntity?.(entity.id, { immediate: true, reason: 'kiln_transport' });
    }
  },

  fire(d, live, state) {
    const flags = (state.story && state.story.flags) || {};
    if (flags.runawayKiln === 'saved') { d.abort(live, 'kiln_already_saved'); return; }
    const ring = ringTarget(d, state);
    if (!ring) { d.abort(live, 'no_ring'); return; }

    // The crucible is already moving when the player arrives: place her back along the
    // ring->anchor line (deterministic, clamped inside a working lane distance) and give
    // her the authored closing velocity. From here on, only physics moves her.
    const anchor = live.anchor || { x: ring.x + SPAWN_MAX_WU, z: ring.z };
    let dx = anchor.x - ring.x;
    let dz = anchor.z - ring.z;
    const anchorDist = Math.hypot(dx, dz) || 1;
    const backoff = Math.min(SPAWN_MAX_WU, Math.max(SPAWN_MIN_WU, anchorDist));
    dx /= anchorDist;
    dz /= anchorDist;

    const crucible = d.spawnProp(live, {
      // A physical tow load must accept ordinary combat hits; beacons are damage-filtered.
      type: 'payload',
      pos: { x: ring.x + dx * backoff, z: ring.z + dz * backoff },
      radius: KILNBACK_RADIUS,
      mass: 150,
      scanLabel: 'CRUCIBLE NINE-ARM',
      storyPropKind: 'runaway_kiln',
    });
    if (!crucible || crucible.id == null) { d.abort(live, 'crucible_spawn_failed'); return; }
    crucible.hull = 90;
    crucible.hullMax = 90;
    crucible.data = crucible.data || {};
    crucible.data.masslineTetherable = true;
    // The measured Forge kilnback compound body: mass 150, casks folded into the hull.
    crucible.physicsBody = kilnbackPhysicalBody([], 0);
    crucible.vel.x = -dx * DRIFT_SPEED;
    crucible.vel.z = -dz * DRIFT_SPEED;
    live.ids.push(crucible.id);
    live.roles[crucible.id] = 'crucible';
    live.vars.crucibleId = crucible.id;
    live.vars.ring = ring;
    live.vars.startedAt = d.now();
    live.vars.struck = 0;
    live.vars.scanned = false;
    live.vars.latchedOnce = false;
    live.vars.lastSpeed = DRIFT_SPEED;

    bindCrucible(live, crucible, null, !!d.registry?.get?.('physics'));
    live.phase = 'runaway';
    d.say(live, 'info', live.shape.primaryLine, null, { literal: true, primary: true });
    this.captureSave(d, live, state);
  },

  tick(d, live, state, now) {
    if (live.phase !== 'runaway') return;
    const vars = live.vars;
    const crucible = crucibleEntity(state, live);
    if (!crucible) return finish(d, live, state, 'lost', { runawayKiln: 'lost' });
    const motion = kilnMotion(d, live, crucible, true);
    if (!motion) return null;

    const speed = speedOf(motion);
    vars.lastSpeed = speed;
    const ring = vars.ring;
    const distance = ring && motion.pos
      ? Math.hypot(motion.pos.x - ring.x, motion.pos.z - ring.z)
      : Infinity;

    // The save is a function of her own velocity — nothing else. No radius clause, no timer:
    // slow is safe anywhere on the lane, and the yard reads it off the glass same as the pilot.
    if (speed < SAVE_SPEED) return saved(d, live, state);
    if (distance <= RING_RADIUS) return detonate(d, live, state, true);
    if (now - vars.startedAt > GRACE_S) {
      d.say(live, 'info', 'The lane stops watching. The crucible keeps her vector.', null, { literal: true });
      return finish(d, live, state, 'drifted');
    }
    return null;
  },

  event(d, live, state, name, payload) {
    const vars = live.vars;
    const owned = ownedCrucible(state, live);
    if (!owned || (payload?.entity && payload.entity !== owned)) return;
    if (name === 'scanPulse') {
      if (vars.scanned) return;
      vars.scanned = true;
      d.say(live, 'info',
        'REGISTRY: CRUCIBLE NINE-ARM. CARGO: molten glass charge. CREW: none. DRIVE: cold. VECTOR: the depot ring.',
        null, { literal: true });
      return;
    }
    if (name === 'tetherAttached') {
      if (!payload || payload.actorId !== state.playerId) return;
      if (payload.targetId !== vars.crucibleId) return;
      if (vars.latchedOnce) return;
      vars.latchedOnce = true;
      d.say(live, 'info',
        'LINE ON. She pulls like a foundry — keep the tension across her bow and bleed her down.',
        null, { literal: true });
      return;
    }
    if (name === 'playerHitSquad') {
      if (!payload || payload.targetId !== vars.crucibleId) return;
      vars.struck = (vars.struck || 0) + 1;
      const crucible = crucibleEntity(state, live);
      // One shot lights the molten load when it breaks her; the first scratch only warns.
      // (Heavy guns skip straight to squadKill below — that is the honest detonation.)
      if (crucible && crucible.hull > 0 && vars.struck === 1) {
        d.say(live, 'info',
          'DEPOT THREE: She is FULL of molten glass. Stop shooting and slow her!',
          null, { literal: true });
        return;
      }
      if (vars.struck >= 2) return detonate(d, live, state, false);
      return;
    }
    if (name === 'squadKill' && payload) {
      if (owned.alive !== false && owned.hull > 0) return;
      if (payload.id !== vars.crucibleId) return;
      if (payload.byPlayer) return detonate(d, live, state, false);
      return finish(d, live, state, 'lost', { runawayKiln: 'lost' });
    }
  },
});

export default RUNAWAY_KILN_RUNTIME;
