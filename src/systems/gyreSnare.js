// The Gyre Snare — held-key telekinetic grav-lash ("katamari tractor beam").
//
// Owns the whole verb end to end (see src/data/gyreSnare.js for the authored tuning):
//
//   beam    — while the verb is held, a glassy cone leads from the nose to a maw point a
//             fixed distance ahead. Bodies inside the maw's basin are yanked toward it
//             (coupling-scaled: light mass zips, heavies shrug — same contract as fields).
//             Asteroid-field rocks inside the basin are promoted so belt gravel feeds it.
//   hold    — the first absorbable body to reach the maw's heart SNAGS into the clump core.
//             The core is spring-bound to a slow orbit slot revolving around the maw, damped
//             against the ship's frame so the ball tracks wherever the ship flies. A suck
//             band around the core drags more absorbables in and MERGES them into the ball
//             (mass union, volumetric radius growth, member ledger for VFX lumps).
//   launch  — releasing the verb bowls the clump along the nose at a fixed Δv; the impulse
//             carries player provenance so the collision-damage pipeline credits the pilot.
//
// Ownership: writes only its own runtime subtree (state.gyreSnare — runtime mirror, never
// serialized), plus body commands through the physics membrane (queuePhysicsImpulse /
// queuePhysicsTorqueImpulse / writePhysicsBodyResponse — additive, never overwriting pilot
// control). The player's own hull is never pulled and never damaged by its own clump.
// Determinism: no rng, no wall clock — all wobble is a pure function of state.simTime and
// the (deterministic-order) spatial query results.

import { couplingScale } from '../core/fields/fieldKernel.js';
import {
  queuePhysicsImpulse,
  queuePhysicsTorqueImpulse,
  syncDerivedPhysicsMass,
} from '../core/physicsAuthority.js';
import {
  recordImpulseProvenance,
  holdImpulseProvenance,
} from '../combat/impulseKernel.js';
import { queryAsteroidField, promoteAsteroidFieldRock } from '../world/asteroidField.js';
import { GYRE_SNARE, GYRE_EVENTS, GYRE_ABSORBABLE_TYPES } from '../data/gyreSnare.js';

const D = GYRE_SNARE;
const PHASE = Object.freeze({ OFF: 'off', BEAM: 'beaming', HOLD: 'holding', LAUNCH: 'launching' });
const ABSORBABLE = new Set(GYRE_ABSORBABLE_TYPES);
// Types the beam's gravity never touches at all (the pull pass is for loose world mass).
// Deliberately absent: 'projectile' — incoming fire eats the courtesy tug and bends into
// the maw (wedge ≈ wedgeAccel·couple·wedgeFalloff·(1−lipT) ≈ ≤100 wu/s²; basin ≈ 380).
// Emergent point-defense is part of the weapon's identity: you can sweep a volley aside
// while winding up the ball, at cap cost.
const PULL_SKIP_TYPES = new Set(['ship', 'station', 'fx', 'fieldEmitter', 'massSeed', 'masslineSnareAnchor']);
// …except drones, which DO get tugged lightly (coupling-shrugged) — they're listed in neither set.
const WEAPON_ID = 'wpn_gyre_snare';
const PROV_TAG = 'gyre_snare';

function finite(v, d = 0) { return Number.isFinite(v) ? v : d; }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

function entityMass(e) {
  const m = Number(e && e.physicsBody && e.physicsBody.mass);
  if (Number.isFinite(m) && m > 0) return m;
  const top = Number(e && e.mass);
  return Number.isFinite(top) && top > 0 ? top : 1;
}

function entityRadius(e) {
  const r = Number(e && (e.radius || (e.physicsBody && e.physicsBody.radius)));
  return Number.isFinite(r) && r > 0 ? r : 4;
}

function isDynamic(e) {
  return !!(e && e.physicsBody && e.physicsBody.dynamic !== false && e.collides !== false);
}

function freshRuntime() {
  return {
    phase: PHASE.OFF,
    wasHeld: false,
    // Clump ledger (hold phase): the core entity + what it has eaten.
    coreId: null,
    clumpMass: 0,          // t — bookkeeping mass (base core + absorbed members)
    clumpRadius: 0,        // wu — volumetric union radius (for visuals/absorb tests)
    coreBaseMass: 0,
    members: [],           // bounded absorb records for the clump lumps VFX
    // Launch bookkeeping.
    launchLeft: 0,         // ticks of the launch impulse burst still owed
    launchDir: { x: 1, z: 0 },
    launchedId: null,      // the ball in flight (TTL/telemetry only — it is a free body)
    ballId: null,          // survives LAUNCH→OFF until the thrown clump despawns (mirror track)
    ballMass: 0,           // t — clump mass frozen at launch so the ball's HUD/VFX keeps it
    ballMembers: null,     // frozen member ledger — the glass lumps ride the thrown ball to its grave
    ballClumpRadius: 0,    // wu — clump radius frozen at launch (same deal as ballMass)
    ballAbsorbs: 0,        // total absorbed count frozen at launch (HUD's ×N stays honest)
    totalAbsorbed: 0,      // absorbs ever merged into this clump — NOT bounded by the VFX ledger
    lastAbsorbCueS: -1e9,  // simTime of the last absorb tick — gates the glass-tick cue rate
    strainCueLatched: false, // gyre_snare_strain fires once per strain excursion
    orbitSeed: 0,          // per-clump phase so successive balls don't share a start angle
  };
}

export const gyreSnare = {
  name: 'gyreSnare',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this.registry = ctx.registry || null;
    this._rt = freshRuntime();
    this._scratch = [];
    this._fieldRocks = [];
    this._subs = [];
    if (this.bus && typeof this.bus.on === 'function') {
      const on = (name, fn) => this._subs.push(this.bus.on(name, fn));
      // Runtime-only tool: a load/new-sector/new-game boundary always drops the beam cold.
      // The clump (if any) stays a live free body — dropping just releases it.
      on('save:loaded', () => this._drop('save_loaded'));
      on('game:newGame', () => this._drop('new_game'));
      on('sector:exit', () => this._drop('sector_exit'));
    }
  },

  destroy() {
    for (const off of this._subs || []) { if (typeof off === 'function') off(); }
    this._subs = [];
    this._rt = freshRuntime();
  },

  // ── entry points used by tests / other systems ─────────────────────────────────
  isActive() { return this._rt.phase !== PHASE.OFF; },

  /** Drop the beam without launching (death, dock, save/sector boundary, strain break). */
  _drop(reason) {
    const rt = this._rt;
    const wasOff = rt.phase === PHASE.OFF;
    const coreId = rt.coreId;
    const boundary = reason === 'save_loaded' || reason === 'new_game' || reason === 'sector_exit';
    if (boundary) {
      // A mid-hold save serializes data.gyreCore onto the entity, and the fresh state swap
      // makes the rt.coreId lookup stale — sweep every entity for the residue flag so a
      // loaded rock isn't pull-immune for the rest of the save. gyreLaunched stays: a ball
      // mid-flight in the save is still a launched body (it despawns on its own schedule).
      this._sweepBoundaryResidue();
    } else if (!wasOff) {
      this._clearCoreMark();
    }
    const droppedPhase = rt.phase;
    rt.phase = PHASE.OFF;
    rt.coreId = null;
    rt.clumpMass = 0;
    rt.clumpRadius = 0;
    rt.coreBaseMass = 0;
    rt.members.length = 0;
    rt.launchLeft = 0;
    rt.launchedId = null;
    // The drop-side ledger dies with the clump too — a fresh beam must not publish the last
    // ball's absorb count (or reuse its orbit phase) while it searches for a new core.
    rt.totalAbsorbed = 0;
    rt.orbitSeed = 0;
    // A boundary drop also forgets the flying ball — its entity is about to vanish with the
    // sector anyway, and stale ballPos would leak a dead clump overlay into the next scene.
    if (boundary) { rt.ballId = null; rt.ballMass = 0; rt.ballMembers = null; rt.ballClumpRadius = 0; rt.ballAbsorbs = 0; }
    // Cue/haptic gates reset on EVERY drop: simTime restarts at 0 on a fresh run (a stale
    // stamp would silence the absorb tick for the old run's whole length), and a fresh
    // clump's first strain excursion should re-arm the latch instead of inheriting it hot.
    rt.lastAbsorbCueS = -1e9; rt.strainCueLatched = false;
    if (this.bus && !wasOff) {
      this.bus.emit(GYRE_EVENTS.beamOff, { phase: droppedPhase, reason: String(reason || 'dropped'), tick: this.state && this.state.tick });
      // dropped = a live beam/hold released without launch; coreId is null when the beam
      // closed empty (no clump ever snagged).
      this.bus.emit(GYRE_EVENTS.dropped, { coreId, reason: String(reason || 'dropped'), boundary, tick: this.state && this.state.tick });
      // A live lash ending without a launch gets the descending release voice — quiet for
      // an empty-beam release, fuller when a clump slipped the beam. Boundaries stay silent
      // (a save/sector swap shouldn't talk).
      if (!boundary) {
        this.bus.emit('audio:cue', {
          id: coreId != null ? 'gyre_snare_drop' : 'gyre_snare_off',
          gain: coreId != null ? 0.9 : 0.5,
        });
      }
    }
  },

  _clearCoreMark() {
    const rt = this._rt;
    const core = rt.coreId != null && this.state ? this.state.entities.get(rt.coreId) : null;
    if (core && core.data && core.data.gyreCore) {
      delete core.data.gyreCore;
      if (this.helpers && typeof this.helpers.markEntityVisualChanged === 'function') {
        this.helpers.markEntityVisualChanged(core);
      }
    }
  },

  _sweepBoundaryResidue() {
    const ents = this.state && this.state.entities;
    if (!ents || typeof ents.forEach !== 'function') return;
    const mark = this.helpers && typeof this.helpers.markEntityVisualChanged === 'function'
      ? this.helpers.markEntityVisualChanged : null;
    ents.forEach((e) => {
      if (e && e.data && e.data.gyreCore) {
        delete e.data.gyreCore;
        if (mark) mark(e);
      }
    });
  },

  // ── the verb ───────────────────────────────────────────────────────────────────
  _held(state) {
    const acts = state && state.input && state.input.actions;
    return !!(acts && acts.gyreSnare);
  },

  _playerCapable(state) {
    const player = this.helpers.player ? this.helpers.player() : (state.entities.get(state.playerId) || null);
    if (!player || player.alive === false || !player.pos) return null;
    if (player.flags && player.flags.docked) return null;
    if (state.ui && state.ui.docked === true) return null;
    return player;
  },

  _maw(player, out) {
    const rot = finite(player.rot, 0);
    out.x = player.pos.x + Math.cos(rot) * D.mawDist;
    out.z = player.pos.z + Math.sin(rot) * D.mawDist;
    return out;
  },

  _noseDir(player, out) {
    const rot = finite(player.rot, 0);
    out.x = Math.cos(rot);
    out.z = Math.sin(rot);
    return out;
  },

  _cap(player) {
    return typeof player.cap === 'number' ? player.cap
      : (player.data && player.data.derived && player.data.derived.cap) || 0;
  },

  _spendCap(player, amount) {
    if (typeof player.cap === 'number' && Number.isFinite(player.cap)) {
      player.cap = Math.max(0, player.cap - amount);
      return;
    }
    const derived = player.data && player.data.derived;
    if (derived && typeof derived.cap === 'number') derived.cap = Math.max(0, derived.cap - amount);
  },

  _evidence(tick) {
    const ev = this._evidenceObj || (this._evidenceObj = { kind: PROV_TAG, tick: 0, provenance: null });
    ev.tick = tick;
    return ev;
  },

  // Body profile for couplingScale — same mass-shrug contract fields read.
  _profile(e) {
    return {
      type: e.type,
      mass: entityMass(e),
      fieldResponseMult: e.physicsBody && e.physicsBody.fieldResponseMult,
      boosting: !!(e.flags && e.flags.boosting),
    };
  },

  _queueAccel(e, ax, az, mass, dt, state) {
    const a2 = ax * ax + az * az;
    if (!(a2 > 0)) return;
    const cap = D.pullMaxAccel;
    if (a2 > cap * cap) {
      const s = cap / Math.sqrt(a2);
      ax *= s; az *= s;
    }
    // Impulse = a·m·dt → Δv = a·dt (the membrane contract).
    queuePhysicsImpulse(e, { x: ax * mass * dt, y: 0, z: az * mass * dt }, this._evidence(state.tick));
  },

  // ── phases ─────────────────────────────────────────────────────────────────────

  /** Beam pull: everything loose in the basin/wedge gets dragged toward the maw. */
  _pullPass(dt, state, player, maw, nose) {
    const queryRadius = this.helpers && typeof this.helpers.queryRadius === 'function'
      ? this.helpers.queryRadius : null;
    if (!queryRadius) return;
    const reach = D.mawDist + D.basinRadius + D.queryReachWu;
    const cands = queryRadius(player.pos, reach, this._scratch);
    const tan = Math.tan(D.coneHalfAngleRad);
    const shipVx = finite(player.vel && player.vel.x);
    const shipVz = finite(player.vel && player.vel.z);
    for (let i = 0; i < cands.length; i++) {
      const e = cands[i];
      if (!e || e.alive === false || !e.pos) continue;
      if (e.id === state.playerId) continue;
      if (!isDynamic(e)) continue;
      const dx = e.pos.x - maw.x;
      const dz = e.pos.z - maw.z;
      const distMaw = Math.hypot(dx, dz);
      // In the basin (the cone's wide end) or inside the wedge? The wedge's soft lip is a
      // fade band, not extra grab range: pull eases to zero at the lip so the drawn cone
      // edge IS the physics edge instead of bodies past the rim eating the full yank.
      let inBasin = distMaw <= D.basinRadius;
      let inWedge = false;
      let lipT = 0;
      if (!inBasin) {
        // The wedge is measured from the PUBLISHED apex (player.pos + nose·noseGap), not the
        // hull center — the physics cone and the drawn cone share an origin and a slope, so
        // nothing visibly outside the glass eats a pull. effTan carries the endRadius floor:
        // on a capital the drawn mouth is wider than the geometric cone and the wedge follows.
        const noseGap = D.noseGap + entityRadius(player);
        const coneLen = Math.max(1, D.mawDist - noseGap);
        const effTan = Math.max(tan, D.basinRadius / coneLen);
        const px = e.pos.x - (player.pos.x + nose.x * noseGap);
        const pz = e.pos.z - (player.pos.z + nose.z * noseGap);
        const axial = px * nose.x + pz * nose.z;
        // Clamp at the maw plane — the basin sphere owns everything past it; letting the
        // wedge reach basinRadius beyond would pull bodies an annulus wide of the drawn rim.
        if (axial > 0 && axial <= coneLen) {
          const radial = Math.abs(px * nose.z - pz * nose.x);
          const rimR = axial * effTan;
          if (radial <= rimR + D.wedgeSoftLipWu) {
            inWedge = true;
            lipT = radial <= rimR ? 0 : (radial - rimR) / D.wedgeSoftLipWu;
          }
        }
      }
      if (!inBasin && !inWedge) continue;
      if (PULL_SKIP_TYPES.has(e.type)) continue;
      if (e.data && e.data.gyreLaunched) continue; // a thrown ball is never pulled back
      // The held core is owned by the orbit spring — a basin grab on it fights the slot and
      // makes the ball chatter instead of floating loose.
      if (e.data && e.data.gyreCore) continue;
      // Only absorbables get the full basin grab; other dynamics get a courtesy tug so the
      // beam still reads as gravity on them.
      const absorbable = ABSORBABLE.has(e.type);
      const couple = couplingScale(this._profile(e));
      const mass = entityMass(e);
      let ax = 0, az = 0;
      if (inBasin) {
        const pull = (absorbable ? D.basinAccel : D.basinAccel * D.nonAbsorbablePull) * couple;
        if (distMaw > 1e-4) {
          ax -= (dx / distMaw) * pull;
          az -= (dz / distMaw) * pull;
          // Tangential swirl — the basin spirals bodies in rather than ray-shooting them.
          ax += (dz / distMaw) * D.mawSwirlAccel * couple;
          az -= (dx / distMaw) * D.mawSwirlAccel * couple;
        }
        // Frame damping inside the basin: settle relative to the ship so captures stick.
        ax -= (finite(e.vel.x) - shipVx) * D.basinDamping;
        az -= (finite(e.vel.z) - shipVz) * D.basinDamping;
      } else {
        // Wedge courtesy: gentle drift toward the maw down the cone, easing to zero at
        // the soft-lip outer edge (lipT 0 inside the drawn rim → 1 at the lip).
        const wedge = D.wedgeAccel * couple * (absorbable ? 1 : D.wedgeFalloff) * (1 - lipT);
        if (distMaw > 1e-4) {
          ax -= (dx / distMaw) * wedge;
          az -= (dz / distMaw) * wedge;
        }
      }
      this._queueAccel(e, ax, az, mass, dt, state);
    }
    // Belt gravel: any field rock inside the basin promotes into a real body so the beam
    // can catch it (same promotion path the tether uses).
    const rocks = queryAsteroidField(state, maw, D.basinRadius, this._fieldRocks);
    for (let i = 0; i < rocks.length; i++) {
      const rec = rocks[i];
      if (!rec || rec.alive === false || rec.liveEntityId != null) continue;
      promoteAsteroidFieldRock(state, rec.id, this.helpers, 'gyre_snare');
    }
    this._fieldRocks.length = 0;
  },

  /** Snag the closest absorbable at the maw's heart → it becomes the clump core. */
  _trySnag(state, maw) {
    const queryRadius = this.helpers && typeof this.helpers.queryRadius === 'function'
      ? this.helpers.queryRadius : null;
    if (!queryRadius) return false;
    const cands = queryRadius(maw, D.snagRadius, this._scratch);
    let best = null, bestD = Infinity;
    for (let i = 0; i < cands.length; i++) {
      const e = cands[i];
      if (!e || e.alive === false || !e.pos) continue;
      if (e.id === state.playerId || e.data && e.data.gyreLaunched) continue;
      if (!ABSORBABLE.has(e.type) || !isDynamic(e)) continue;
      // A snagged core becomes the thrown ball — it needs a real collider and must never
      // be a mission/persistent body the ball's 9 s despawn could quietly delete. Pickups
      // stay absorbable as members but never become the core: their collider is a sensor,
      // which would bowl a ball that hits nothing.
      if (e.type === 'pickup') continue;
      if (e.physicsBody && e.physicsBody.material === 'sensor') continue;
      if ((e.flags && e.flags.persistent) || (e.data && e.data.worldRecordId)) continue;
      const d = Math.hypot(e.pos.x - maw.x, e.pos.z - maw.z);
      if (d < bestD) { bestD = d; best = e; }
    }
    if (!best) return false;
    const rt = this._rt;
    rt.phase = PHASE.HOLD;
    rt.coreId = best.id;
    rt.coreBaseMass = entityMass(best);
    rt.clumpMass = rt.coreBaseMass;
    rt.clumpRadius = entityRadius(best);
    rt.totalAbsorbed = 0; // new clump ledger — the HUD count restarts with the core
    rt.orbitSeed = (best.id * 0.37) % (Math.PI * 2);
    best.data = best.data || {};
    best.data.gyreCore = true;
    if (this.helpers.markEntityVisualChanged) this.helpers.markEntityVisualChanged(best);
    if (this.bus) {
      this.bus.emit(GYRE_EVENTS.snagged, {
        coreId: best.id, type: best.type, mass: rt.clumpMass, radius: rt.clumpRadius,
        tick: state.tick,
      });
      this.bus.emit('audio:cue', { id: 'gyre_snare_snag' });
    }
    return true;
  },

  /** Hold phase: orbit the core around the maw; suck absorbables onto the clump. */
  _holdPass(dt, state, player, maw, nose) {
    const rt = this._rt;
    const core = state.entities.get(rt.coreId);
    if (!core || core.alive === false || !core.pos) { this._drop('core_lost'); return; }
    const t = Number.isFinite(state.simTime) ? state.simTime : state.tick / 60;

    // Strain break first: something violent flung the ball too far off the maw — the beam slips.
    // Checking before the spring queue keeps a freed core from eating one last pull.
    const coreDistMaw = Math.hypot(core.pos.x - maw.x, core.pos.z - maw.z);
    if (coreDistMaw > D.holdBreakDist) { this._drop('strained'); return; }

    // Orbit slot: revolves around the maw, breathes in/out — "loosely floating in zero G".
    const orbitR = Math.max(D.orbitRadiusMin, rt.clumpRadius * D.orbitRadiusScale)
      + Math.sin(t * D.orbitLiftRate + rt.orbitSeed) * D.orbitLiftRad;
    const angle = rt.orbitSeed + t * D.orbitRate + Math.sin(t * D.orbitWobbleRate + rt.orbitSeed) * D.orbitWobbleRad;
    const tx = maw.x + Math.cos(angle) * orbitR;
    const tz = maw.z + Math.sin(angle) * orbitR;

    // Spring → orbit slot, damped vs ship frame so the ball tracks the ship.
    const shipVx = finite(player.vel && player.vel.x);
    const shipVz = finite(player.vel && player.vel.z);
    let ax = (tx - core.pos.x) * D.holdSpringK - (finite(core.vel.x) - shipVx) * D.holdDamping;
    let az = (tz - core.pos.z) * D.holdSpringK - (finite(core.vel.z) - shipVz) * D.holdDamping;
    const a2 = ax * ax + az * az;
    if (a2 > D.holdMaxAccel * D.holdMaxAccel) {
      const s = D.holdMaxAccel / Math.sqrt(a2);
      ax *= s; az *= s;
    }
    // The authored body carries the real clump mass (grown on every absorb via
    // syncDerivedPhysicsMass), so impulse = a·m·dt produces the authored Δv regardless of how
    // big the ball has become — the lash holds a 2400 t clump as surely as a 6 t pebble.
    const mass = entityMass(core);
    queuePhysicsImpulse(core, { x: ax * mass * dt, y: 0, z: az * mass * dt }, this._evidence(state.tick));
    // A lazy tumble — the ball reads as levitating rock, not a rigid joint.
    queuePhysicsTorqueImpulse(core, { x: 0, y: mass * D.tumbleTorqueK * dt, z: 0 }, this._evidence(state.tick));

    // The beam keeps sweeping the basin into the ball: bodies near the maw get a pull
    // retargeted onto the CORE (the clump is what "increases gravity" now).
    this._suckPass(dt, state, player, core, rt);
    // Keep the wedge pull alive so the cone keeps feeding material into the ball.
    this._pullPass(dt, state, player, maw, nose);
  },

  /** Drag absorbables onto the clump and merge the ones that touch. */
  _suckPass(dt, state, player, core, rt) {
    const queryRadius = this.helpers && typeof this.helpers.queryRadius === 'function'
      ? this.helpers.queryRadius : null;
    if (!queryRadius) return;
    const suckR = rt.clumpRadius + D.suckBandWidth;
    const cands = queryRadius(core.pos, suckR, this._scratch);
    const shipVx = finite(player && player.vel && player.vel.x);
    const shipVz = finite(player && player.vel && player.vel.z);
    for (let i = 0; i < cands.length; i++) {
      const e = cands[i];
      if (!e || e.alive === false || !e.pos || e.id === core.id) continue;
      if (e.id === state.playerId) continue;
      if (!ABSORBABLE.has(e.type) || !isDynamic(e)) continue;
      if (e.data && e.data.gyreLaunched) continue; // a thrown ball is never re-absorbed
      // Persistent / world-record mass stays live — the katamari must not eat a quest item.
      if ((e.flags && e.flags.persistent) || (e.data && e.data.worldRecordId)) continue;
      const dx = core.pos.x - e.pos.x;
      const dz = core.pos.z - e.pos.z;
      const dist = Math.hypot(dx, dz);
      const er = entityRadius(e);
      // Surface contact → merge into the ball (mass union; radius by volume, capped). The
      // meal sticks the moment its skin crosses the clump's — katamari stick-on-touch, not a
      // nested overlap, so a fast spiral can't orbit forever inside the band.
      if (dist <= (rt.clumpRadius + er) * D.absorbOverlap) {
        this._absorb(state, rt, core, e, dx, dz, dist);
        continue;
      }
      if (dist > 1e-4) {
        // A FULL clump can't keep another gram — stop vacuuming meals it will never
        // merge. Same gate _absorb enforces at contact, extended to the pull lane so a
        // capped ball doesn't drag leeches against its skin forever.
        if (rt.clumpMass >= D.maxClumpMass) continue;
        const pull = D.suckAccel * couplingScale(this._profile(e));
        const mass = entityMass(e);
        let ax = (dx / dist) * pull;
        let az = (dz / dist) * pull;
        // Gentle frame damping so incoming mass settles onto the ball instead of orbiting it.
        ax -= (finite(e.vel.x) - shipVx) * D.suckDamping;
        az -= (finite(e.vel.z) - shipVz) * D.suckDamping;
        this._queueAccel(e, ax, az, mass, dt, state);
      }
    }
  },

  _absorb(state, rt, core, e, dx, dz, dist) {
    if (rt.clumpMass >= D.maxClumpMass) return; // capped — still eats nothing
    const em = entityMass(e);
    const er = entityRadius(e);
    rt.clumpMass = Math.min(D.maxClumpMass, rt.clumpMass + em);
    rt.clumpRadius = Math.min(
      D.maxClumpRadius,
      Math.cbrt(rt.clumpRadius ** 3 + er ** 3),
    );
    // Member ledger for the VFX lumps — bounded, keeps the approach direction so lumps
    // land where the mass actually hit. totalAbsorbed stays unbounded so the HUD's ×N
    // count doesn't freeze at the ledger cap while mass keeps climbing.
    rt.totalAbsorbed += 1;
    if (rt.members.length < D.maxAbsorbRecords) {
      const nx = dist > 1e-4 ? -dx / dist : 0;
      const nz = dist > 1e-4 ? -dz / dist : 0;
      rt.members.push({ type: e.type, mass: em, radius: er, nx, nz });
    }
    if (this.helpers.removeEntity) this.helpers.removeEntity(e.id);
    else e.alive = false;
    // Grow the AUTHORED body record (mass/inertia/radius + revision bump → the physics owner
    // rebuilds the ball with the new spec). A one-tick writePhysicsBodyResponse would revert
    // on the next pass; this is the real katamari — the rapier body genuinely gains mass and
    // a bigger collider, which also keeps the skin-touch absorb threshold honest.
    syncDerivedPhysicsMass(
      core,
      rt.clumpMass,
      Math.max(8, Math.round(rt.clumpMass * rt.clumpRadius * rt.clumpRadius * 0.4)),
      rt.clumpRadius,
    );
    // The clump's HEART visibly grows too: entity.radius is what the motion presenters scale
    // the core's mesh off — keep it in step with the physics record so growth is visceral.
    if (!finite(core.radius) || core.radius < rt.clumpRadius) {
      core.radius = rt.clumpRadius;
      if (this.helpers && typeof this.helpers.markEntityVisualChanged === 'function') {
        this.helpers.markEntityVisualChanged(core);
      }
    }
    if (this.bus) {
      this.bus.emit(GYRE_EVENTS.absorbed, {
        coreId: core.id, victimId: e.id, victimType: e.type, mass: em,
        clumpMass: rt.clumpMass, clumpRadius: rt.clumpRadius,
        nx: dist > 1e-4 ? -dx / dist : 0, nz: dist > 1e-4 ? -dz / dist : 0,
        tick: state.tick,
      });
      // A dense belt feed can merge several bodies per tick — the absorb event fires for
      // every one (HUD honesty) but the glass tick is rate-gated so it stays readable
      // instead of stacking into noise.
      const nowS = Number.isFinite(state.simTime) ? state.simTime : state.tick / 60;
      if (nowS - rt.lastAbsorbCueS >= D.absorbCueMinGapS) {
        rt.lastAbsorbCueS = nowS;
        // Meal size in the ear too: the tick drops pitch as the victim gets heavier — a
        // pebble ticks high, a wreck thuds low.
        this.bus.emit('audio:cue', { id: 'gyre_snare_absorb', gain: 0.7, rate: 1.15 - Math.min(0.5, em / 160) });
      }
    }
  },

  /** Release: bowl the clump along the nose. */
  _launch(state, player) {
    const rt = this._rt;
    const core = rt.coreId != null ? state.entities.get(rt.coreId) : null;
    if (!player || !core || core.alive === false || !core.pos) {
      this._drop(!player ? 'player_lost' : 'launch_without_core');
      return;
    }
    const dir = this._launchDirObj || (this._launchDirObj = { x: 1, z: 0 });
    this._noseDir(player, dir);
    rt.phase = PHASE.LAUNCH;
    rt.launchLeft = D.launchTicks;
    rt.launchDir.x = dir.x;
    rt.launchDir.z = dir.z;
    rt.launchedId = core.id;
    rt.ballId = core.id; // outlives LAUNCH so render/HUD can track the bowling ball to its grave
    rt.ballMass = rt.clumpMass;
    // The katamari lumps are part of the thrown payload — freeze the ledger so the glass
    // clump overlay keeps riding the ball through its whole flight instead of shedding at OFF.
    rt.ballMembers = rt.members.slice();
    rt.ballClumpRadius = rt.clumpRadius;
    rt.ballAbsorbs = rt.totalAbsorbed;
    // The ball becomes a weapon: authored impact scale + provenance for kill credit + a
    // bounded flight so the map doesn't keep it forever.
    const scale = Math.min(
      D.launchImpactScaleMax,
      D.launchImpactScaleBase + rt.clumpMass / D.launchImpactScalePerMass,
    );
    core.physicsBody = core.physicsBody || {};
    core.physicsBody.impactDamageScale = scale;
    // Bump the body revision — RESOLVED_BODY_CACHE keys on (body, revision), so the
    // authored-spec write must invalidate or the resolved spec reads stale.
    core.physicsBody.revision = Math.max(0, Math.trunc(finite(core.physicsBody.revision))) + 1;
    core.data = core.data || {};
    delete core.data.gyreCore;
    core.data.gyreLaunched = true;
    core.data.despawnAt = (Number.isFinite(state.simTime) ? state.simTime : 0) + D.ballTtlS;
    recordImpulseProvenance(core, {
      actorId: state.playerId,
      weaponId: WEAPON_ID,
      tag: 'gyre_launch',
      appliedTick: state.tick | 0,
      magnitude: rt.clumpMass * D.launchSpeed,
    });
    holdImpulseProvenance(core, (state.tick | 0) + Math.round(D.launchProvenanceHoldS * 60), state.tick | 0);
    if (this.helpers.markEntityVisualChanged) this.helpers.markEntityVisualChanged(core);
    if (this.bus) {
      this.bus.emit(GYRE_EVENTS.launched, {
        coreId: core.id, mass: rt.clumpMass, radius: rt.clumpRadius,
        speed: D.launchSpeed, dir: { x: dir.x, z: dir.z }, members: rt.members.length,
        tick: state.tick,
      });
      this.bus.emit('audio:cue', { id: 'gyre_snare_launch' });
    }
  },

  _finishLaunch(state) {
    const rt = this._rt;
    rt.phase = PHASE.OFF;
    rt.coreId = null;
    rt.clumpMass = 0;
    rt.clumpRadius = 0;
    rt.coreBaseMass = 0;
    rt.members.length = 0;
    rt.launchedId = null;
    // ballId/ballMass deliberately survive: the clump visual keeps riding the thrown mass until it
    // despawns, and the HUD's "ball live" dot reads the same flag.
    if (this.bus) {
      this.bus.emit(GYRE_EVENTS.beamOff, { phase: PHASE.LAUNCH, reason: 'launched', tick: this.state && this.state.tick });
    }
  },

  // ── presentation mirror (read-only for render/HUD; runtime-only, never saved) ───
  _publish(state, player) {
    const rt = this._rt;
    const pub = state.gyreSnare || (state.gyreSnare = {
      phase: PHASE.OFF, nose: { x: 0, z: 0 }, maw: { x: 0, z: 0 },
      coneLen: 0, halfAngleRad: D.coneHalfAngleRad, endRadius: 0,
      coreId: null, clumpMass: 0, clumpRadius: 0, absorbs: 0, maxClumpMass: D.maxClumpMass,
      strain01: 0, corePos: { x: 0, z: 0 }, launchDir: { x: 1, z: 0 },
      members: null, launchedId: null, ballPos: { x: 0, z: 0 }, ballMass: 0,
    });
    pub.phase = rt.phase;
    // Track a live bowling ball even in OFF: launchedId stays published until the entity is
    // gone (despawnAt/impact), so the glass-clump overlay retires with the ball, not the burst.
    if (rt.ballId != null && state && state.entities) {
      const ball = state.entities.get(rt.ballId);
      // A ball that lost its despawnAt was adopted by another system (encounterScripts,
      // egressExit, lootShards, terrainAnchors all strip it) — it is no longer the bowling
      // ball: retire it rather than pin ballId/HUD forever on a pull-immune asteroid.
      if (!ball || ball.alive === false || !ball.data || !ball.data.gyreLaunched || !ball.pos
        || ball.data.despawnAt == null) {
        // The ball met its grave. Only a quiet TTL expiry gets the shatter — an entity
        // left dead with its deadline passed — while impact deaths (removed, or dead with
        // no deadline pending) already sing through collision audio at the same spot.
        if (ball && ball.data && ball.data.despawnAt != null
          && Number.isFinite(state && state.simTime) && state.simTime >= ball.data.despawnAt
          && this.bus) {
          this.bus.emit('audio:cue', { id: 'gyre_snare_ball_death', gain: 0.6, position: { x: pub.ballPos.x, z: pub.ballPos.z } });
        }
        rt.ballId = null;
        rt.ballMass = 0;
        rt.ballMembers = null;
        rt.ballClumpRadius = 0;
        rt.ballAbsorbs = 0;
      } else {
        pub.ballPos.x = ball.pos.x; pub.ballPos.z = ball.pos.z;
      }
    }
    pub.launchedId = rt.ballId;
    pub.ballMass = rt.ballId != null ? rt.ballMass : 0;
    if (rt.phase === PHASE.OFF) {
      pub.coreId = null; pub.strain01 = 0;
      if (rt.ballId != null) {
        // Ball still flying: publish the frozen clump so the lumps/mass/count ride it out.
        pub.members = rt.ballMembers;
        pub.clumpMass = rt.ballMass;
        pub.clumpRadius = rt.ballClumpRadius;
        pub.absorbs = rt.ballAbsorbs;
      } else {
        pub.members = null;
        pub.clumpMass = 0; pub.clumpRadius = 0; pub.absorbs = 0;
      }
      return pub;
    }
    if (!player) return pub;
    const nose = this._noseDir(player, this._pubNose || (this._pubNose = { x: 1, z: 0 }));
    // Apex rides the hull skin, not the center — a 14 wu gap is invisible on a 14-radius
    // Hitch but sprouts the cone 30 wu inside a capital hull's mesh.
    const noseGap = D.noseGap + entityRadius(player);
    pub.nose.x = player.pos.x + nose.x * noseGap;
    pub.nose.z = player.pos.z + nose.z * noseGap;
    const maw = this._maw(player, this._pubMaw || (this._pubMaw = { x: 0, z: 0 }));
    pub.maw.x = maw.x; pub.maw.z = maw.z;
    pub.coneLen = Math.hypot(maw.x - pub.nose.x, maw.z - pub.nose.z);
    // The drawn rim may over-cover the basin (short apex on a capital hull widens the
    // mouth past the pull zone) but never under-cover it — the cone edge is the physics
    // edge, so the visual radius floors at basinRadius.
    pub.endRadius = Math.max(pub.coneLen * Math.tan(D.coneHalfAngleRad), D.basinRadius);
    pub.coreId = rt.coreId;
    pub.maxClumpMass = D.maxClumpMass;
    // A re-beam while the thrown ball still flies keeps ITS frozen ledger — opening a fresh
    // search must not strip the old ball's lumps or collapse its eventual death-burst to
    // the 6 wu floor. The live ledger only wins while a new core is held.
    const ridingBall = rt.coreId == null && rt.ballId != null && rt.ballMembers != null;
    pub.clumpMass = ridingBall ? rt.ballMass : rt.clumpMass;
    pub.clumpRadius = ridingBall ? rt.ballClumpRadius : rt.clumpRadius;
    pub.absorbs = ridingBall ? rt.ballAbsorbs : rt.totalAbsorbed;
    pub.members = ridingBall ? rt.ballMembers : rt.members;
    pub.launchDir.x = rt.launchDir.x; pub.launchDir.z = rt.launchDir.z;
    const core = rt.coreId != null ? state.entities.get(rt.coreId) : null;
    if (core && core.pos) {
      pub.corePos.x = core.pos.x; pub.corePos.z = core.pos.z;
      pub.strain01 = clamp(
        (Math.hypot(core.pos.x - maw.x, core.pos.z - maw.z) - D.holdStrainDist)
          / Math.max(1, D.holdBreakDist - D.holdStrainDist),
        0, 1,
      );
    } else pub.strain01 = 0;
    // Strain gets its own voice on the same hysteresis the HUD uses: the glass tension
    // rises the tick the clump strains, and latches quiet again once it reels back in.
    if (!rt.strainCueLatched && pub.strain01 > 0.4) {
      rt.strainCueLatched = true;
      if (this.bus) this.bus.emit('audio:cue', { id: 'gyre_snare_strain', gain: 0.7 });
      // Strain reaches the hands too — one warning pulse on the latch edge, not a rumble
      // the whole excursion (the sustained voice + HUD carry that).
      if (this.bus) this.bus.emit(GYRE_EVENTS.strained, { tick: state && state.tick });
    } else if (pub.strain01 < 0.25) {
      rt.strainCueLatched = false;
    }
    return pub;
  },

  update(dt, state) {
    this.state = state;
    const rt = this._rt;
    if (!state || state.mode !== 'flight') { if (rt.phase !== PHASE.OFF) this._drop('not_flight'); rt.wasHeld = false; if (state) this._publish(state, null); return; }
    const player = this._playerCapable(state);
    const held = this._held(state) && !!player;

    // Verb edges — rising opens the beam; falling bowls the clump (or just closes an empty beam).
    if (held && !rt.wasHeld && rt.phase === PHASE.OFF) {
      const cap = this._cap(player);
      if (cap >= D.capActivateMin) {
        rt.phase = PHASE.BEAM;
        if (this.bus) {
          this.bus.emit(GYRE_EVENTS.beamOn, { playerId: player.id, tick: state.tick });
          // The lash has its own wake voice now — a soft rising shimmer, distinct from the
          // snag bite that fires when mass actually grips.
          this.bus.emit('audio:cue', { id: 'gyre_snare_beam', gain: 0.55 });
        }
      } else if (this.bus) {
        // A denied wake is still a wake attempt — the refusal needs the same voice
        // every other tool's no-cap edge gets, or the held key reads dead.
        this.bus.emit('toast', { kind: 'warn', text: 'Gyre Snare needs charge to wake', ttl: 1.6 });
        this.bus.emit('audio:cue', { id: 'ui_deny', gain: 0.7 });
      }
    }
    if (!held && rt.wasHeld) {
      // Deliberate release bowls a held clump; every other close (beam with no core, mid-launch,
      // or the player gone/docked) is a drop — never a launch from a dock seat or a corpse.
      if (rt.phase === PHASE.HOLD && player) this._launch(state, player);
      else if (rt.phase === PHASE.BEAM) this._drop('released');
      // LAUNCH is exempt: the release edge that starts the bowl must not truncate its burst.
      // (Any other close — player gone, docked, dead — lands via the !player drop below.)
    }
    rt.wasHeld = held;

    if (rt.phase === PHASE.OFF) { this._publish(state, player); return; }
    if (!player) { this._drop('player_lost'); this._publish(state, null); return; }

    // Cap drain — an empty tank bowls whatever the beam is holding right now. Hold drain
    // scales with clump mass: a huge ball can out-pull the hull's regen — the bigger the
    // katamari, the shorter the fuse on your hold.
    const drainMult = rt.phase === PHASE.HOLD
      ? D.capHoldMult * (1 + rt.clumpMass / D.capMassDrainRef)
      : 1;
    const drain = D.capDrainPerS * drainMult * dt;
    this._spendCap(player, drain);
    const dry = this._cap(player) <= 0;

    const maw = this._maw(player, this._mawObj || (this._mawObj = { x: 0, z: 0 }));
    const nose = this._noseDir(player, this._noseObj || (this._noseObj = { x: 1, z: 0 }));

    if (rt.phase === PHASE.LAUNCH) {
      const core = rt.launchedId != null ? state.entities.get(rt.launchedId) : null;
      if (core && core.alive !== false && rt.launchLeft > 0) {
        const mass = entityMass(core);
        // Per-tick impulse = m·(v/launchTicks): launchTicks of these sum to Δv = launchSpeed.
        const j = (D.launchSpeed * mass) / D.launchTicks;
        queuePhysicsImpulse(core, {
          x: rt.launchDir.x * j, y: 0, z: rt.launchDir.z * j,
        }, this._evidence(state.tick));
        rt.launchLeft -= 1;
      } else {
        rt.launchLeft = 0;
      }
      if (rt.launchLeft <= 0) this._finishLaunch(state);
    } else if (rt.phase === PHASE.BEAM) {
      this._pullPass(dt, state, player, maw, nose);
      this._trySnag(state, maw);
    } else if (rt.phase === PHASE.HOLD) {
      this._holdPass(dt, state, player, maw, nose);
    }

    // The capacitor running dry mid-hold auto-bowls (dramatic and honest).
    if (dry && rt.phase === PHASE.HOLD) this._launch(state, player);
    else if (dry && rt.phase === PHASE.BEAM) this._drop('cap_dry');

    this._publish(state, player);
  },
};

export const GYRE_SNARE_PHASES = PHASE;
