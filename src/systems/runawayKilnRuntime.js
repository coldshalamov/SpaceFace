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

function ringTarget(d, state) {
  const active = state.world && state.world.activeSector;
  const stations = (active && Array.isArray(active.stations) && active.stations)
    || d.stationsInSector();
  const depot = stations.find((s) => s && s.id === DEPOT_STATION && s.pos
    && Number.isFinite(s.pos.x) && Number.isFinite(s.pos.z));
  const ring = depot || stations.find((s) => s && s.pos
    && Number.isFinite(s.pos.x) && Number.isFinite(s.pos.z));
  return ring ? { x: ring.pos.x, z: ring.pos.z, name: ring.name || 'the depot' } : null;
}

function crucibleEntity(state, live) {
  const id = live.vars.crucibleId;
  const entity = id != null && state.entities && state.entities.get
    ? state.entities.get(id) : null;
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

export const RUNAWAY_KILN_RUNTIME = Object.freeze({
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
      type: 'beacon',
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

    live.phase = 'runaway';
    d.say(live, 'info', live.shape.primaryLine, null, { literal: true, primary: true });
  },

  tick(d, live, state, now) {
    if (live.phase !== 'runaway') return;
    const vars = live.vars;
    const crucible = crucibleEntity(state, live);
    if (!crucible) return finish(d, live, state, 'lost', { runawayKiln: 'lost' });

    const speed = speedOf(crucible);
    vars.lastSpeed = speed;
    const ring = vars.ring;
    const distance = ring && crucible.pos
      ? Math.hypot(crucible.pos.x - ring.x, crucible.pos.z - ring.z)
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
      if (payload.id !== vars.crucibleId) return;
      if (payload.byPlayer) return detonate(d, live, state, false);
      return finish(d, live, state, 'lost', { runawayKiln: 'lost' });
    }
  },
});

export default RUNAWAY_KILN_RUNTIME;
