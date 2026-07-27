// Massline whip-impact events — read-only observer (massline rung 13).
// Runs immediately AFTER masslineThreats in UPDATE_ORDER: it reads the already-settled
// state.player.tether mirror (tetherGameplay) plus entities, and detects the payoff moment of the
// swing — the tethered (or just-released) MASS whacking into a solid body. It writes ONLY its own
// runtime subtree at state.player.masslineImpacts and emits exactly one documented event:
// `tether:whipImpact` ({ targetId, victimId, relSpeed, massSpeed, mass, momentum, slung, severity,
// rating, tick, time }). It never mutates entities, attachments, the tether, or sibling subtrees.
//
// What counts as a whip-impact (thresholds mirror the massline feel bars in masslineTelemetry.js):
//   • the whipped mass is the tether TARGET — either still on the line (latched) or coasting
//     ballistic inside a short post-release window (slung). The player smacking into things is
//     masslineThreats' 'collision-course' domain, not ours.
//   • the mass is doing the hitting: its WORLD speed >= 25 wu/s (the SNAP_CATCH_MIN_SPEED
//     "genuinely moving" bar). A parked tow rammed by a passing ship is not a whip.
//   • the contact is energetic: relative speed mass-vs-victim >= the same 25 wu/s bar.
//   • contact = body overlap (combined radii + a small pad, tolerant of physics keeping solids
//     separated at rest) OR the swept relative path crossing the combined radius within this tick
//     (so a fast crossing can't tunnel between overlap samples).
//   • emitted at most once per victim per run (a run = one latch and its trailing sling window);
//     a new latch re-arms all victims.
// Impact records PERSIST after the run ends (impacts log + latest) — like telemetry.snapCatch,
// they are completed-trick facts that scenario predicates (rung 20 debris-sling proof) and the
// whip feedback/damage consumer (rung 14) read after the fact; each record carries tick/time so
// consumers can window them. Only the log cap trims them.

const WHIP_IMPACT_MIN_SPEED = 25;   // wu/s — mirrors SNAP_CATCH_MIN_SPEED ("genuinely moving")
const WHIP_IMPACT_SOLID = 55;       // wu/s relSpeed — rating floor for a 'solid' hit
const WHIP_IMPACT_CRUSHING = 95;    // wu/s relSpeed — 'crushing' floor; also the severity ceiling
const WHIP_SLING_WINDOW_S = 6;      // s — a released mass stays "the player's whip" this long
const WHIP_CONTACT_PAD = 0.5;       // wu — overlap tolerance (physics rests solids at ~touching)
const WHIP_LOG_CAP = 12;            // per-session record cap (oldest dropped)

// Solid bodies a whipped mass can meaningfully hit — same set as masslineThreats' collidables.
const COLLIDABLE_TYPES = new Set(['asteroid', 'ship', 'station', 'drone']);

const FALLBACK = Object.freeze({
  tracking: false,
  slung: false,
  massId: null,
  impacts: Object.freeze([]),
  latest: null,
});

export const masslineImpacts = {
  id: 'masslineImpacts',
  name: 'masslineImpacts',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    // Per-run trackers. System-private, like masslineThreats' throttle state.
    // _latch tracks the mass while it is on the line; _sling tracks the last released mass for a
    // bounded ballistic window. Both carry a per-victim `warned` set (the once-per-victim
    // throttle); the sling inherits the latch's set so a victim can't double-fire across the cut.
    this._latch = null;   // { massId, warned:Set }
    this._sling = null;   // { massId, until, warned:Set }
  },

  update(dt, state) {
    const playerState = state.player || (state.player = {});
    const runtime = ensureImpactsSubtree(playerState);

    if (state.mode !== 'flight') {
      // Out of flight (menu/docked): drop live trackers. Completed records persist (see header).
      this._latch = null;
      this._sling = null;
      mirrorTrackers(runtime, this._latch, this._sling);
      return;
    }

    const now = Number.isFinite(state.simTime) ? state.simTime
      : (Number.isFinite(state.tick) ? state.tick / 60 : null);
    const tether = playerState.tether;
    const latchedId = tether && tether.active && tether.targetId != null ? tether.targetId : null;

    // Latch transitions. tetherGameplay mirrored BEFORE us this tick, so on the release tick the
    // mirror already reads inactive while the freed mass still carries its post-cut velocity —
    // exactly the moment to decide whether it left the line as a genuine sling.
    if (this._latch && this._latch.massId !== latchedId) {
      this._armSling(state, now, this._latch);
      this._latch = null;
    }
    if (latchedId != null && !this._latch) {
      // A relatch onto the mass we are still sling-tracking resumes the same run: the line is back
      // on the same body, so its warned set carries over and the sling slot frees up.
      if (this._sling && this._sling.massId === latchedId) {
        this._latch = { massId: latchedId, warned: this._sling.warned };
        this._sling = null;
      } else {
        this._latch = { massId: latchedId, warned: new Set() };
      }
    }

    // Sling expiry: window over, or the mass died/vanished.
    if (this._sling) {
      const mass = getEntity(state, this._sling.massId);
      if ((now != null && now > this._sling.until) || !mass || !mass.alive) this._sling = null;
    }

    // Detection passes — the latched mass and a still-flying earlier sling are independent whips.
    if (this._latch) {
      const mass = getEntity(state, this._latch.massId);
      if (mass && mass.alive && mass.pos && mass.vel) {
        this._scanForImpacts(runtime, state, dt, now, mass, this._latch.warned, false);
      }
    }
    if (this._sling) {
      const mass = getEntity(state, this._sling.massId);
      if (mass && mass.pos && mass.vel) {
        this._scanForImpacts(runtime, state, dt, now, mass, this._sling.warned, true);
      }
    }

    mirrorTrackers(runtime, this._latch, this._sling);
  },

  // A released mass becomes a tracked sling only if it left the line genuinely moving in the
  // world frame — a static drop is not a throw. Window is fixed from the release moment.
  _armSling(state, now, endedLatch) {
    if (now == null) return;
    const mass = getEntity(state, endedLatch.massId);
    if (!mass || !mass.alive || !mass.pos || !mass.vel) return;
    const speed = Math.hypot(finite(mass.vel.x, 0), finite(mass.vel.z, 0));
    if (speed < WHIP_IMPACT_MIN_SPEED) return;
    // Single sling slot: a newer release supersedes an older one still in flight (two live slings
    // inside one 6 s window is a corner we trade away for one tracker's worth of state).
    this._sling = { massId: endedLatch.massId, until: now + WHIP_SLING_WINDOW_S, warned: endedLatch.warned };
  },

  // One entity pass for one whipped mass. The world-speed gate is per-mass (outside the loop);
  // the relative-speed gate and contact test are per-victim.
  _scanForImpacts(runtime, state, dt, now, mass, warned, slung) {
    const massSpeed = Math.hypot(finite(mass.vel.x, 0), finite(mass.vel.z, 0));
    if (massSpeed < WHIP_IMPACT_MIN_SPEED) return;
    const entities = state.entities;
    if (!entities || typeof entities.values !== 'function') return;

    for (const e of entities.values()) {
      if (!e || !e.alive || !e.pos) continue;
      if (e.id === mass.id) continue;
      // Reeling the mass home always ends in player contact — that is the reel, not a whip; and
      // whipping yourself is threats' collision-course read. The player is never a victim here.
      if (e.id === state.playerId) continue;
      if (warned.has(e.id)) continue;
      if (!COLLIDABLE_TYPES.has(e.type) || !Number.isFinite(e.radius)) continue;

      const rvx = finite(mass.vel.x, 0) - finite(e.vel && e.vel.x, 0);
      const rvz = finite(mass.vel.z, 0) - finite(e.vel && e.vel.z, 0);
      const relSpeed = Math.hypot(rvx, rvz);
      if (relSpeed < WHIP_IMPACT_MIN_SPEED) continue;
      if (!inContact(mass, e, rvx, rvz, dt)) continue;

      warned.add(e.id);
      this._emitImpact(runtime, state, now, mass, e, relSpeed, massSpeed, slung);
    }
  },

  // The single documented emit. The record is mirrored at runtime.latest + runtime.impacts (this
  // system's own subtree) and the emitted payload IS the mirrored record (single source of truth,
  // same discipline as telemetry.snapCatch / masslineThreats.latest).
  _emitImpact(runtime, state, now, mass, victim, relSpeed, massSpeed, slung) {
    const tick = Number.isFinite(state.tick) ? state.tick : null;
    const massKg = Math.max(0, finite(mass.mass, 0));
    const rating = relSpeed >= WHIP_IMPACT_CRUSHING ? 'crushing'
      : relSpeed >= WHIP_IMPACT_SOLID ? 'solid'
      : 'glance';
    const record = {
      targetId: mass.id,               // the whipped mass — same field name as snapCatch/reelPump
      victimId: victim.id,
      // Neither end of this event is the player: the cue targets the struck body and sources the
      // whipped mass, so cueSchema.inferRelevance has nothing to key on and falls through to its
      // distance table (0.72/0.52/0.28) — below presentationAdapters' PLAYER_LANE_RELEVANCE_FLOOR
      // of 0.8. The result was that the payoff moment of the whole swing produced sparks and a
      // crack but never a HUD readout, a caption, or a camera kick, and got quieter the further
      // out the player worked. Every record here describes the player's OWN whip (the observer
      // tracks only their tether target and its sling), so state it: 0.88 is inferRelevance's own
      // value for "the player is the source", the same value rateRelease uses for the same reason.
      // Deliberately not 1.0 — that is the "addressed TO the player" tier and it would also cross
      // the 0.9 assertive-caption bar in _applyAccessibility, turning an info-tier reward into a
      // screen-reader interrupt that pre-empts real warnings.
      playerRelevance: 0.88,
      relSpeed,
      massSpeed,
      mass: massKg,
      momentum: massKg * relSpeed,     // the damage-relevant read for the rung-14 consumer
      slung,
      severity: clamp01(relSpeed / WHIP_IMPACT_CRUSHING),
      rating,
      tick,
      time: now,
    };
    runtime.impacts.push(record);
    if (runtime.impacts.length > WHIP_LOG_CAP) runtime.impacts.shift();
    runtime.latest = record;
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('tether:whipImpact', record);
    }
  },
};

// Contact this tick: already inside the padded combined radius, OR the relative ballistic path
// crosses the (unpadded) combined radius within dt (swept test — same closest-approach math as
// masslineThreats' timeToImpact, horizon = one tick, so a fast crossing can't tunnel).
function inContact(mass, e, rvx, rvz, dt) {
  const rx = finite(e.pos.x, 0) - finite(mass.pos.x, 0);
  const rz = finite(e.pos.z, 0) - finite(mass.pos.z, 0);
  const R = Math.max(0, finite(e.radius, 0)) + Math.max(0, finite(mass.radius, 0));
  const rr = rx * rx + rz * rz;
  const Rpad = R + WHIP_CONTACT_PAD;
  if (rr <= Rpad * Rpad) return true;
  const ww = rvx * rvx + rvz * rvz;
  if (ww < 1e-9) return false;
  const rw = rx * rvx + rz * rvz;
  if (rw <= 0) return false;                   // moving apart — no crossing this tick
  const disc = rw * rw - ww * (rr - R * R);
  if (disc <= 0) return false;                 // closest approach misses the body
  const t = (rw - Math.sqrt(disc)) / ww;       // first-contact time along the relative path
  return t >= 0 && t <= (Number.isFinite(dt) ? dt : 0);
}

function getEntity(state, id) {
  return state.entities && state.entities.get ? state.entities.get(id) : null;
}

function mirrorTrackers(runtime, latch, sling) {
  runtime.tracking = !!(latch || sling);
  runtime.slung = !latch && !!sling;
  runtime.massId = latch ? latch.massId : (sling ? sling.massId : null);
}

function ensureImpactsSubtree(playerState) {
  if (!playerState.masslineImpacts) playerState.masslineImpacts = freshRuntime();
  return playerState.masslineImpacts;
}

function freshRuntime() {
  return {
    tracking: false,
    slung: false,
    massId: null,
    impacts: [],
    latest: null,
  };
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

export { FALLBACK };
