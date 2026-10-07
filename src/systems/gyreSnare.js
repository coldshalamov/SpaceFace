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
  isDynamicPhysicsBodyEntity,
} from '../core/physicsAuthority.js';
import {
  recordImpulseProvenance,
  holdImpulseProvenance,
  clearImpulseProvenance,
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
const PULL_SKIP_TYPES = new Set(['ship', 'station', 'fx', 'fieldEmitter', 'massSeed', 'masslineSnareAnchor', 'masslineSnare']);
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
  // Prefer the collider radius: the absorb trigger rests just outside rapier contact,
  // so keying on the visual would grind a fat-collider/thin-skin body against the
  // clump's surface without ever crossing the absorb distance.
  const r = Number(e && ((e.physicsBody && e.physicsBody.radius) || e.radius));
  return Number.isFinite(r) && r > 0 ? r : 4;
}

function isDynamic(e) {
  // isDynamicPhysicsBodyEntity is the shared substance convention — record-less bodies
  // count as dynamic (SG-02 materializes the record in a tick), matching every other
  // pull lane in the tree. The local collides guard stays on top of it.
  return !!(e && e.collides !== false && isDynamicPhysicsBodyEntity(e));
}

// Read current custody/content at the destructive boundary. A former claim alone
// does not protect empty scrap; live cargo, a quest hook, or a durable world body does.
function hasProtectedContent(e) {
  if (e.flags && (e.flags.persistent || e.flags.missionPinned)) return true;
  const data = e.data || {};
  if (data.persistent || data.persistenceOwner || data.missionPinned
    || data.missionTargetSlot != null || data.worldRecordId != null
    || data.worldRecordSlotId != null || data.wreckMissionId != null
    || data.isCommunicator === true) return true;
  if (data.salvagePool && Object.values(data.salvagePool).some((qty) => Number(qty) > 0)) return true;
  if (Array.isArray(data.loot) && data.loot.some((lot) => lot && Number(lot.qty ?? lot.amount ?? 1) > 0)) return true;
  if (Array.isArray(data.cargoManifest?.lines)
    && data.cargoManifest.lines.some((line) => line && Number(line.qty) > 0)) return true;
  const freight = data.freightCustodyPod;
  return !!(freight && Number(freight.qty) > 0 && (!freight.status || freight.status === 'live'));
}

function ingestionReason(e, remainingMass = D.maxClumpMass) {
  if (!e || e.alive === false || !ABSORBABLE.has(e.type) || !isDynamic(e)
    || e.physicsBody === false || e.physicsBody?.material === 'sensor'
    || e.data?.gyreCore || e.data?.gyreLaunched) return 'unavailable';
  if (hasProtectedContent(e)) return 'protected';
  if (entityMass(e) > remainingMass || entityRadius(e) > D.maxClumpRadius) return 'too-heavy';
  return null;
}

function freshRuntime() {
  return {
    phase: PHASE.OFF,
    wasHeld: false,
    // Clump ledger (hold phase): the core entity + what it has eaten.
    coreId: null,
    clumpMass: 0,          // t — bookkeeping mass (base core + absorbed members)
    clumpRadius: 0,        // wu — volumetric union radius (for visuals/absorb tests)
    members: [],           // bounded absorb records for the clump lumps VFX
    // Launch bookkeeping.
    launchLeft: 0,         // ticks of the launch impulse burst still owed
    launchWindup: 0,       // ticks of the pre-burst coil (anticipation) still owed
    launchCarry: 0,        // aft-velocity the coil left on the ball — repaid inside the burst
                           // so authored launchSpeed is the FINAL flight speed, not the impulse sum
    launchSpeedEff: 0,     // wu/s — launchSpeed after the throw-mass penalty; computed in
                           // _launch off the frozen ballMass, reset in _finishLaunch
    launchDir: { x: 1, z: 0 },
    launchedId: null,      // the ball in flight (TTL/telemetry only — it is a free body)
    ballId: null,          // survives LAUNCH→OFF until the thrown clump despawns (mirror track)
    ballIds: [],           // bounded watch list of every live launched id — second launches and
                           // boundary reloads can't orphan a gyreLaunched mark + weapon scale
    ballMass: 0,           // t — clump mass frozen at launch so the ball's HUD/VFX keeps it
    ballMembers: null,     // frozen member ledger — the glass lumps ride the thrown ball to its grave
    ballClumpRadius: 0,    // wu — clump radius frozen at launch (same deal as ballMass)
    ballAbsorbs: 0,        // total absorbed count frozen at launch (HUD's ×N stays honest)
    totalAbsorbed: 0,      // absorbs ever merged into this clump — NOT bounded by the VFX ledger
    lastAbsorbCueS: -1e9,  // simTime of the last absorb tick — gates the glass-tick cue rate
    strainCueLatched: false, // gyre_snare_strain fires once per strain excursion
    fuseCueLatched: false,   // the fuse-low warning fires once per hold
    orbitSeed: 0,          // per-CORE orbit phase (stable id hash) — different cores get different start angles, any id type
    orbitDir: 1,           // ±1 — revolution direction from the same hash, so successive clumps don't all circle one way
    basinCount: 0,         // absorbables inside the cone — feeds the "×N IN NET" anticipation
    suckCount: 0,          // absorbables in the clump's suck annulus during HOLD (the +N read's second half)
    fullCueLatched: false, // gyre_snare_full fires once per clump on first cap-crossing
    basinSpots: [],        // bounded {x,z,r,k} of bodies actually being dragged — the victim-side pull glow
    towCount: 0,           // non-absorbable bodies under tow this tick — loot the beam drags but never eats
    tooHeavyCount: 0,      // whole bodies that cannot fit; never promise them as the next meal
    holdLag: 0,            // wu — core's distance off its orbit slot: the spring's residual error,
                           // a mild second-order tension read for ordinary dragging (strained only
                           // trips past holdStrainDist — lag shades the glass before that)
    dropReason: null,      // last _drop cause ('strained', 'released', ...) — presentation reads it for the close shape
  };
}

export const gyreSnare = {
  name: 'gyreSnare',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this._rt = freshRuntime();
    // Same-state destroy->init (system reload without a save/sector boundary): strip any
    // gyreCore residue AND re-seed the ball watch list from serialized gyreLaunched marks —
    // a live launched ball keeps its retire pass so a later adoption can't orphan the mark.
    this._sweepBoundaryResidue();
    this._scratch = [];
    this._fieldRocks = [];
    this._spotScratch = []; // basinSpot candidates — collected in the pull pass, sorted by pullK,
                            // then the top basinSpotMax publish (strongest grips glow first)
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
    // Same-state destroy->init (system reload without a save/sector boundary): clear the
    // tracked core's mark first (its authored stashes are current-timeline and restore),
    // then sweep untracked residue — a held body left marked is pull/snag/suck-immune
    // forever, and a stashless ex-core is immortal debris.
    this._clearCoreMark();
    this._rt = freshRuntime();
    // Sweep AFTER the fresh runtime: the sweep re-adopts live marked balls into
    // rt.ballIds/ballId — sweeping first seeded the discarded runtime instead.
    this._sweepBoundaryResidue();
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
      // The tracked core is current-timeline: clear its mark through the normal path so
      // its authored lifetime stashes restore (a same-state reload must not leave it
      // immortal stasis debris). The sweep then handles only UNTRACKED residue: cores are
      // never flags.persistent, so a real save can't serialize data.gyreCore and a fresh
      // state swap can't resurrect it — but any path that rebuilds the entity map without
      // our bookkeeping (fixture replay, a future persistent core type, a same-state
      // reload) must not leave a residue flag making a body pull/snag/suck-immune forever.
      // gyreLaunched stays: a ball mid-flight in the save is still a launched body (it
      // despawns on its own schedule).
      this._clearCoreMark();
    } else if (!wasOff) {
      this._clearCoreMark();
    }
    const droppedPhase = rt.phase;
    const droppedMass = rt.clumpMass;
    rt.dropReason = reason || 'dropped'; // a strain break is a tear, not a polite release — the close reads the reason
    rt.phase = PHASE.OFF;
    rt.coreId = null;
    rt.clumpMass = 0;
    rt.clumpRadius = 0;
    rt.members.length = 0;
    rt.launchLeft = 0;
    rt.launchWindup = 0;
    rt.launchCarry = 0;
    rt.launchSpeedEff = 0;
    rt.launchDir.x = 1; rt.launchDir.z = 0; // ledger symmetry — dead data, but nothing stale survives a boundary drop mid-burst
    rt.launchedId = null;
    // The drop-side ledger dies with the clump too — a fresh beam must not publish the last
    // ball's absorb count (or reuse its orbit phase) while it searches for a new core.
    rt.totalAbsorbed = 0;
    rt.basinCount = 0;
    rt.suckCount = 0;
    rt.towCount = 0;
    rt.tooHeavyCount = 0;
    rt.holdLag = 0; // dead-state hygiene — the lag read is HOLD-only but resets like the rest
    rt.basinSpots.length = 0;
    rt.orbitSeed = 0;
    rt.orbitDir = 1;
    // A boundary drop also forgets the flying ball mirror — stale ballPos would leak a
    // dead clump overlay into the next scene. The sweep then re-seeds watch + mirror
    // from what actually lives in the new map: a serialized ball mid-flight keeps its
    // HUD mirror (and launchedId) across a save:load, while a sector-exit ball — its
    // entity gone — stays forgotten. The sweep must run AFTER these resets or they
    // would wipe the mirror it just adopted.
    if (boundary) {
      rt.ballId = null; rt.ballMass = 0; rt.ballMembers = null; rt.ballClumpRadius = 0; rt.ballAbsorbs = 0;
      // Forget the watch list BEFORE the sweep re-seeds it from live marks: a stale id
      // that aliases a live gyreLaunched entity in the post-load map would eat an
      // overflow _handBack and strip a legit serialized ball's mark + pull immunity.
      rt.ballIds.length = 0;
      this._sweepBoundaryResidue();
    }
    // Cue/haptic gates reset on EVERY drop: simTime restarts at 0 on a fresh run (a stale
    // stamp would silence the absorb tick for the old run's whole length), and a fresh
    // clump's first strain excursion should re-arm the latch instead of inheriting it hot.
    rt.lastAbsorbCueS = -1e9; rt.strainCueLatched = false; rt.fullCueLatched = false;
    rt.fuseCueLatched = false;
    if (this.bus && !wasOff) {
      this.bus.emit(GYRE_EVENTS.beamOff, { phase: droppedPhase, reason: String(reason || 'dropped'), tick: this.state && this.state.tick });
      // dropped = a live beam/hold released without launch; coreId is null when the beam
      // closed empty (no clump ever snagged) — AND during LAUNCH: the ball is already
      // thrown (or winding), so a live id would read as a clump torn off the lash when
      // the real story is "launch burst truncated" — pad/audio consumers take the
      // quieter empty-drop channel for it.
      const emitId = droppedPhase === PHASE.LAUNCH ? null : coreId;
      // Docking, mode flips, and player loss are context resets too — the verb ends
      // without a player choice, so they stay silent like boundaries (they do NOT join
      // `boundary` itself: the residue sweep + ball-mirror wipe belong to map swaps
      // only — a ball flying while you dock keeps flying).
      const quiet = boundary || reason === 'player_docked' || reason === 'not_flight' || reason === 'player_lost';
      this.bus.emit(GYRE_EVENTS.dropped, {
        coreId: emitId, reason: String(reason || 'dropped'), boundary, quiet,
        tick: this.state && this.state.tick,
      });
      // A live lash ending without a launch gets the descending release voice — quiet for
      // an empty-beam release, fuller when a clump slipped the beam. Boundaries stay silent
      // (a save/sector swap shouldn't talk).
      if (!quiet) {
        this.bus.emit('audio:cue', {
          // A strain break is the verb's biggest loss beat — it gets its own clink +
          // harsh-dust TEAR voice, not the polite release's descending fizzle.
          id: emitId != null ? (reason === 'strained' ? 'gyre_snare_tear' : 'gyre_snare_drop') : 'gyre_snare_off',
          gain: emitId != null ? 0.9 : 0.5,
        });
        // A strain break is the verb's biggest loss beat — land it in the body too
        // (mass-scaled like the launch kick, smaller since nothing was thrown).
        if (reason === 'strained') {
          this.bus.emit('camera:shake', {
            amount: 0.15 + 0.1 * Math.min(1, droppedMass / D.maxClumpMass),
          });
        }
      }
    }
  },

  _restoreLifetime(e, futureOnly = false) {
    // Stashed at snag: a freed (non-launched) core resumes its authored deadlines
    // instead of living forever as stasis residue.
    if (!e || !e.data) return;
    if (e.data.gyrePrevDespawnAt !== undefined) {
      // futureOnly (hand-back): the body's CURRENT owner keeps its deadline. Restore
      // the authored stash only when nothing else set one AND it's still in the
      // future — resurrecting a stale stash assassinates an adopted body on the next
      // lifetime sweep, and clobbering a live launch deadline would cut a still-
      // flying overflow ball's flight short.
      const now = this.state && this.state.simTime;
      if (futureOnly && (e.data.despawnAt != null
        || (Number.isFinite(now) && e.data.gyrePrevDespawnAt <= now))) {
        delete e.data.gyrePrevDespawnAt;
      } else {
        e.data.despawnAt = e.data.gyrePrevDespawnAt;
        delete e.data.gyrePrevDespawnAt;
      }
    }
    if (e.data.gyrePrevTtl !== undefined) {
      // The countdown channel is RELATIVE — frozen at snag, it can't go stale like an
      // absolute despawnAt. Resuming it under futureOnly is the honest authored state:
      // an adopter keeping the body strips deadlines itself, and a released hand-back
      // must not leave immortal debris. A non-positive stash restores nothing.
      if (futureOnly) {
        // Same current-owner guard as the despawnAt branch: a foreign owner that
        // assigns its own finite ttl keeps it — the snag only planted Infinity, so a
        // finite e.ttl here is owner-set and wins. Infinity still restores authored.
        if (!Number.isFinite(e.ttl) && Number.isFinite(e.data.gyrePrevTtl) && e.data.gyrePrevTtl > 0) {
          e.ttl = e.data.gyrePrevTtl;
        }
        delete e.data.gyrePrevTtl;
      } else { e.ttl = e.data.gyrePrevTtl; delete e.data.gyrePrevTtl; }
    }
  },

  _clearCoreMark() {
    const rt = this._rt;
    if (!rt) return; // destroy() before init() — nothing tracked
    const core = rt.coreId != null && this.state ? this.state.entities.get(rt.coreId) : null;
    if (core && core.data && core.data.gyreCore) {
      delete core.data.gyreCore;
      this._restoreLifetime(core);
      if (this.helpers && typeof this.helpers.markEntityVisualChanged === 'function') {
        this.helpers.markEntityVisualChanged(core);
      }
    }
  },

  // Adoption hand-back: another system cleared the ball's despawnAt to keep it — strip
  // the lash's marks. gyreLaunched pins permanent pull/snag/suck immunity; a left-behind
  // impactDamageScale (up to 8×) leaves a weapon-grade sleeper collider; the stashed
  // authored scale comes back rather than vanishing with the mark.
  _handBack(ball) {
    delete ball.data.gyreLaunched;
    // The launch provenance record rides launch tick + ~launchProvenanceHoldS on a
    // WeakMap — deleting the mark doesn't touch it, so an adopted body would still
    // credit wpn_gyre_snare inside the window. The hand-back contract says no lash
    // credit rides the adopter's body: clear it here (NOT in _disarmBall — the
    // evicted-but-still-marked path deliberately keeps credit to its own TTL).
    clearImpulseProvenance(ball);
    // Symmetric with _restoreLifetime on drop, but future-only: the authored deadlines
    // the ball carried before the lash caught it come back ONLY while still in the
    // future and only when the new owner left despawnAt unset — a stale stash or a
    // resumed countdown would assassinate the adopter's body on the next sweep.
    this._restoreLifetime(ball, true);
    this._disarmBall(ball);
  },

  // Shed the weapon payload WITHOUT shedding the mark: an evicted-but-still-marked
  // ball keeps gyreLaunched (pull/snag/suck immunity + launch kill credit ride it to
  // its own TTL) but nothing keeps the 8× sleeper impact scale or the launch meta —
  // if a foreign owner strips its deadline while it's unwatched, the orphan is a
  // benign immune body, not a permanently-armed collider.
  _disarmBall(ball) {
    delete ball.data.gyreLaunchMeta; // the adopter owns the body now — no lash credit rides it
    if (ball.physicsBody && ball.physicsBody !== false) {
      if (ball.data.gyrePrevImpactScale !== undefined) ball.physicsBody.impactDamageScale = ball.data.gyrePrevImpactScale;
      else delete ball.physicsBody.impactDamageScale;
      const rev = Number(ball.physicsBody.revision);
      ball.physicsBody.revision = (Number.isFinite(rev) ? Math.max(0, Math.trunc(rev)) : 0) + 1;
    }
    delete ball.data.gyrePrevImpactScale;
    if (this.helpers.markEntityVisualChanged) this.helpers.markEntityVisualChanged(ball);
  },

  _sweepBoundaryResidue() {
    const ents = this.state && this.state.entities;
    if (!ents || typeof ents.forEach !== 'function') return;
    // With 2+ serialized balls, the HUD mirror adopts the YOUNGEST (freshest deadline)
    // deterministically — tracked here across the entity walk.
    let adoptScore = -Infinity;
    const mark = this.helpers && typeof this.helpers.markEntityVisualChanged === 'function'
      ? this.helpers.markEntityVisualChanged : null;
    ents.forEach((e) => {
      if (e && e.data && e.data.gyreCore) {
        delete e.data.gyreCore;
        // The stash only restores within a live drop — a serialized body's deadlines
        // are relative to the old timeline, so loaded residue just drops them.
        delete e.data.gyrePrevDespawnAt;
        delete e.data.gyrePrevTtl;
        if (mark) mark(e);
      }
      // A serialized mid-flight ball keeps gyreLaunched + its own deadline — still a
      // launched body, so keep it watched: if an adopting system later strips the
      // deadline, the retire pass hands it back instead of orphaning the mark. The
      // lifetime stashes ride with it too — consumed by the future-only hand-back
      // contract when a foreign owner finally takes the body.
      if (e && e.data && e.data.gyreLaunched) {
        this._trackBall(e.id);
        // The kill-credit record lives in a WeakMap keyed on the entity OBJECT — a real
        // load rebuilds entities, so the post-load ball is provenance-blind and its impact
        // kills go unattributed. Re-stamp from the serialized meta; the ball's despawnAt
        // is the honest outer bound for the hold (a dead ball can't kill anyway).
        const meta = e.data.gyreLaunchMeta;
        if (meta && this.state) {
          const rec = recordImpulseProvenance(e, {
            actorId: meta.actorId, weaponId: meta.weaponId, tag: meta.tag,
            appliedTick: this.state.tick | 0, magnitude: meta.magnitude,
          });
          if (rec && Number.isFinite(meta.holdUntilSim) && Number.isFinite(this.state.simTime)) {
            const rem = Math.max(0, meta.holdUntilSim - this.state.simTime);
            // holdUntilSim is the ball's despawnAt — ~½ s tighter than a live launch's
            // launchProvenanceHoldS window. Deliberate: a dead ball can't kill, so the
            // flight bound is the honest outer envelope for the re-stamped hold.
            holdImpulseProvenance(e, (this.state.tick | 0) + Math.round(rem * 60), this.state.tick | 0);
          }
        }
        // Re-adopt the flying ball into the HUD/clump mirror: a destroy()->init() cycle
        // on a same-timeline reload left ballId null while the body still flew, so the
        // "ball live" dot and glass-clump overlay died under it. The bounded member
        // ledger + absorb count serialize on gyreLaunchMeta — a ball launched before
        // the field existed (older saves) just falls back to silhouette + ×0.
        // With 2+ serialized balls, prefer the youngest (freshest deadline) — otherwise
        // last-writer-wins adopts whichever the map happens to iterate last.
        const rt = this._rt;
        const score = Number.isFinite(e.data.despawnAt) ? e.data.despawnAt : -Infinity;
        if (rt && e.alive !== false && e.pos && score > adoptScore) {
          adoptScore = score;
          rt.ballId = e.id;
          // launchedId is nominally the LAUNCH-burst lookup field — stamped here too so
          // the HUD's 'ball live' marker survives the boundary in OFF, where launchedId
          // is read as the flying-ball flag rather than a burst cursor.
          rt.launchedId = e.id;
          rt.ballMass = entityMass(e);
          // The thrown clump may have outgrown its core's collider — the launch-time
          // radius serialized in the meta is the honest silhouette; entity radius is the
          // floor for balls launched before the field existed.
          rt.ballClumpRadius = meta && Number.isFinite(meta.clumpRadius)
            ? meta.clumpRadius : entityRadius(e);
          // The ledger rides the meta now — a re-adopted ball republishes its real
          // absorb count + member list so the HUD ×N and the glass-clump overlay
          // survive the load instead of collapsing to the collider silhouette.
          rt.ballMembers = meta && Array.isArray(meta.members) ? meta.members : null;
          rt.ballAbsorbs = meta && Number.isFinite(meta.absorbs) ? meta.absorbs : 0;
        }
      }
    });
  },

  // Watch a launched ball. The list is bounded (8): on overflow the OLDEST watch retires —
  // a still-marked ball keeps its mark but sheds the weapon payload (_disarmBall),
  // an already-adopted one gets the full hand-back; gone/dead ids just drop.
  _trackBall(id) {
    const rt = this._rt;
    if (!rt) return; // destroy() before init() — nothing to watch
    if (!rt.ballIds.includes(id)) rt.ballIds.push(id);
    while (rt.ballIds.length > D.ballWatchMax) {
      // Dead/already-unmarked slots retire first. When EVERY slot is a live marked
      // ball, evict the oldest WITHOUT _handBack — stripping gyreLaunched mid-flight
      // would drop its pull/snag immunity + launch kill-credit while it still flies.
      // It still DISARMS: if a foreign owner strips its deadline while unwatched,
      // the orphan is a benign immune body, not a sleeper collider. Its own
      // despawnAt still retires it; the residue sweep re-watches the mark on load.
      let evict = 0;
      for (let i = 0; i < rt.ballIds.length; i++) {
        const e = this.state && this.state.entities ? this.state.entities.get(rt.ballIds[i]) : null;
        if (!e || e.alive === false || !(e.data && e.data.gyreLaunched)) { evict = i; break; }
      }
      const victim = this.state && this.state.entities ? this.state.entities.get(rt.ballIds[evict]) : null;
      if (victim && victim.alive !== false && victim.data) {
        if (!victim.data.gyreLaunched) this._handBack(victim); // already adopted — full strip
        else this._disarmBall(victim); // still ours — keep the mark, shed the weapon scale
      }
      rt.ballIds.splice(evict, 1);
    }
  },

  // Retiring the HUD mirror's primary ball must unwatch it in the same breath — an id
  // left in ballIds re-enters the retire pass next tick as a dead non-primary and
  // fires a second grave + shatter for the same body.
  _unwatchBall(id) {
    const rt = this._rt;
    if (!rt) return;
    const i = rt.ballIds.indexOf(id);
    if (i !== -1) rt.ballIds.splice(i, 1);
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
    // Write ONLY e.cap — the weapons convention (weapons.js): data.derived is refreshed
    // wholesale by ships.js each tick, so spending there is both a single-writer
    // violation and a silent refund. When the direct field is absent, seed it from the
    // derived read once and spend from the seed.
    const derived = player.data && player.data.derived;
    const cur = (typeof player.cap === 'number' && Number.isFinite(player.cap))
      ? player.cap
      : (derived && typeof derived.cap === 'number' ? derived.cap : 0);
    player.cap = Math.max(0, cur - amount);
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

  /** Beam pull: everything loose in the basin/wedge gets dragged toward the maw.
   * `owned` (hold phase): { core, r } — the suck lane already owns the annulus within
   * `r` of the clump; bodies inside it are skipped here so the two pull lanes never
   * stack impulses on one entity past the authored pullMaxAccel ceiling. */
  _pullPass(dt, state, player, maw, nose, owned) {
    const queryRadius = this.helpers && typeof this.helpers.queryRadius === 'function'
      ? this.helpers.queryRadius : null;
    this._rt.basinCount = 0; // reset above the guard — a helper-less host must not
    // towCount resets at the two callers: _suckPass runs before this lane in HOLD and
    // its annulus tow would be wiped by a local reset here.
    this._rt.basinSpots.length = 0; // same early reset — a helper-less host can't keep last tick's glow spots
    // On the helper-less early return only: clear the scratch so spots _suckPass
    // staged can't publish a tick late beside the next run's basin glows. (Not
    // unconditional — the scratch is the suck lane's publish channel in HOLD.)
    if (!queryRadius) { this._spotScratch.length = 0; return; }
    const ownedCore = owned && owned.core && owned.core.pos ? owned.core : null;
    const ownedR2 = ownedCore && owned.r > 0 ? owned.r * owned.r : 0;
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
      // physicsBody:false is an authored opt-out (dropped bombs, snare sentinels): no
      // rapier body ever materializes, so queued impulses just accumulate unread.
      if (e.physicsBody === false) continue;
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
      // While the clump is held, the suck lane owns the annulus around the core —
      // without this skip a body inside both volumes eats basin+suck impulses same tick
      // (each clamped per queue, summing past the authored pullMaxAccel ceiling). The
      // count honors the same ownership: annulus bodies are _suckPass's suckCount.
      if (ownedCore && e.id !== ownedCore.id) {
        const sdx = e.pos.x - ownedCore.pos.x;
        const sdz = e.pos.z - ownedCore.pos.z;
        if (sdx * sdx + sdz * sdz <= ownedR2) continue;
      }
      const remainingMass = this._rt.phase === PHASE.HOLD
        ? D.maxClumpMass - this._rt.clumpMass : D.maxClumpMass;
      const admission = ingestionReason(e, remainingMass);
      const absorbable = admission === null;
      // Mass in the funnel: absorbable bodies already inside the cone get counted so
      // the HUD/maw can telegraph the catch before it lands ("×N IN NET").
      // The "IN NET" read names mass actually inside the glass — bodies easing through
      // the wedge's soft lip (lipT > 0, pull fading to zero past the drawn rim) don't count.
      if (absorbable
        && (inBasin || lipT === 0)
        // A capped clump has no next meal — counting these would make the HUD's +N
        // promise a feed the ball can never eat (suckCount is already gated at :785).
        && !(this._rt.phase === PHASE.HOLD && this._rt.clumpMass >= D.maxClumpMass)
        && !(e.data && (e.data.gyreCore || e.data.gyreLaunched))
        && !(e.flags && e.flags.persistent) && !(e.data && e.data.worldRecordId)) {
        this._rt.basinCount += 1;
      }
      if (e.data && e.data.gyreLaunched) continue; // a thrown ball is never pulled back
      // The held core is owned by the orbit spring — a basin grab on it fights the slot and
      // makes the ball chatter instead of floating loose. Same skip rides _trySnag and the
      // suck lane — residue in any lane must not re-flag a body as immune.
      if (e.data && e.data.gyreCore) continue;
      if (remainingMass > 0 && admission === 'too-heavy' && (inBasin || lipT === 0)) {
        this._rt.tooHeavyCount += 1;
      }
      // Only absorbables get the full basin grab; other dynamics get a courtesy tug so the
      // beam still reads as gravity on them.
      const couple = couplingScale(this._profile(e));
      const mass = entityMass(e);
      // The lane's accel share — the honest "how hard gravity grips it": 1 deep in
      // the basin for absorbables, nonAbsorbablePull for courtesy-tugged bodies,
      // fading to 0 at the wedge's dead lip. The pull glow scales on it.
      const pullK = inBasin
        ? (absorbable ? 1 : D.nonAbsorbablePull)
        : (1 - lipT) * (absorbable ? 1 : D.wedgeFalloff);
      let ax = 0, az = 0;
      if (inBasin) {
        const pull = (absorbable ? D.basinAccel : D.basinAccel * D.nonAbsorbablePull) * couple;
        if (distMaw > 1e-4) {
          ax -= (dx / distMaw) * pull;
          az -= (dz / distMaw) * pull;
          // Tangential swirl — the basin spirals bodies in rather than ray-shooting
          // them — keyed to the held core's revolution direction (orbitDir): the
          // funnel stirs the same way the clump circles, so nothing betrays
          // "each clump is its own system". Pre-snag orbitDir is 1 (the reset).
          ax += (dz / distMaw) * D.mawSwirlAccel * this._rt.orbitDir * couple;
          az -= (dx / distMaw) * D.mawSwirlAccel * this._rt.orbitDir * couple;
        }
        // Frame damping inside the basin: settle relative to the ship so captures stick.
        ax -= (finite(e.vel && e.vel.x) - shipVx) * D.basinDamping;
        az -= (finite(e.vel && e.vel.z) - shipVz) * D.basinDamping;
      } else {
        // Wedge courtesy: gentle drift toward the maw down the cone, easing to zero at
        // the soft-lip outer edge (lipT 0 inside the drawn rim → 1 at the lip).
        const wedge = D.wedgeAccel * couple * (absorbable ? 1 : D.wedgeFalloff) * (1 - lipT);
        if (distMaw > 1e-4) {
          ax -= (dx / distMaw) * wedge;
          az -= (dz / distMaw) * wedge;
        }
      }
      // The gravity-pull glow rides the same ledger the count does — a faint
      // brighten on each body being dragged so "increases gravity" reads on the
      // victim itself, not just the funnel. Bounded so the mirror stays small, and
      // gated on a real pull: a body at the wedge's dead lip isn't being dragged,
      // so it must not fake a glow.
      if (pullK > 0.05 && this._spotScratch.length < D.basinSpotMax * 4) {
        this._spotScratch.push({ x: e.pos.x, z: e.pos.z, r: entityRadius(e), k: pullK });
      }
      // Loot in tow: non-absorbable dynamics the beam drags but never eats — the HUD
      // can answer "why won't it snag?" with TOWING N instead of bare SEARCHING.
      // Projectiles excluded: fire streaking through the wedge gets the point-defense
      // tug, but a bullet isn't "loot in tow" — it would fake the retrievable count.
      if (!absorbable && admission !== 'too-heavy' && e.type !== 'projectile' && pullK > 0.05) this._rt.towCount += 1;
      this._queueAccel(e, ax, az, mass, dt, state);
    }
    // Strongest grips glow first: in a dense belt the 8 slots go to the bodies being
    // dragged hardest — a rock about to cross snagRadius mustn't lose its glow to a
    // body loitering at the dead lip. (Stable sort: equal k keeps query order.)
    if (this._spotScratch.length) {
      this._spotScratch.sort((a, b) => b.k - a.k);
      const n = Math.min(this._spotScratch.length, D.basinSpotMax);
      for (let i = 0; i < n; i++) this._rt.basinSpots.push(this._spotScratch[i]);
      this._spotScratch.length = 0;
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
      // Defense-in-depth parity with the pull/suck lanes: residue from a path the
      // boundary sweep didn't reach must not re-flag a body as the held core.
      if (e.data && e.data.gyreCore) continue;
      if (ingestionReason(e) !== null) continue;
      // Same opt-out _absorb/_launch honor: a physicsBody:false absorbable has no rapier
      // body to pull or throw — coring it would freeze it in stasis while every impulse
      // queues into a record nothing consumes.
      if (e.physicsBody === false) continue;
      // A snagged core becomes the thrown ball — it needs a real collider and must never
      // be a mission/persistent body the ball's 9 s despawn could quietly delete. Pickups
      // can't reach this line at all (not absorbable); the sensor guard still covers an
      // absorbable authored with a sensor collider — it would bowl a ball that hits nothing.
      if (e.physicsBody && e.physicsBody.material === 'sensor') continue;
      if ((e.flags && e.flags.persistent) || (e.data && e.data.worldRecordId)) continue;
      const d = Math.hypot(e.pos.x - maw.x, e.pos.z - maw.z);
      if (d < bestD) { bestD = d; best = e; }
    }
    if (!best) return false;
    const rt = this._rt;
    rt.phase = PHASE.HOLD;
    rt.coreId = best.id;
    rt.clumpMass = entityMass(best);
    rt.clumpRadius = entityRadius(best);
    rt.totalAbsorbed = 0; // new clump ledger — the HUD count restarts with the core
    rt.fullCueLatched = false;
    // Orbit seed must be finite for ANY id shape — spawnEntity passes spec.id through
    // verbatim and world data carries string ids ('poi_pwreck'); `id * 0.37` on a string
    // is NaN, which poisoned the orbit slot and silently zeroed every hold impulse.
    const idStr = String(best.id);
    let seedHash = 0;
    for (let i = 0; i < idStr.length; i++) seedHash = (seedHash * 31 + idStr.charCodeAt(i)) | 0;
    rt.orbitSeed = ((seedHash >>> 0) % 6283) * 0.001; // stable 0..2π per entity, any id type
    // Revolution direction from another hash bit — successive clumps don't all
    // circle the maw the same way.
    rt.orbitDir = (seedHash & 0x10000) !== 0 ? 1 : -1;
    best.data = best.data || {};
    best.data.gyreCore = true;
    // A timed body (timedWreckOrAsteroidDeadline) cored mid-hold would die at its own
    // deadline → core_lost evaporates the whole clump, members included. The lash
    // holds mass in stasis — BOTH lifetime channels are stashed + cleared on snag:
    // data.despawnAt (the data-table deadline) and entity.ttl (the sibling sweep at
    // coreSystem). A non-launch drop restores them — a strained-off core resumes its
    // authored cleanup deadline rather than becoming a permanent free body.
    best.data.gyrePrevDespawnAt = best.data.despawnAt;
    best.data.gyrePrevTtl = best.ttl;
    delete best.data.despawnAt;
    best.ttl = Infinity;
    if (this.helpers.markEntityVisualChanged) this.helpers.markEntityVisualChanged(best);
    if (this.bus) {
      this.bus.emit(GYRE_EVENTS.snagged, {
        coreId: best.id, type: best.type, mass: rt.clumpMass, radius: rt.clumpRadius,
        tick: state.tick,
      });
      // Mass-graded snag voice: a pebble cracks bright, a rock the size of a
      // building thumps — same convention as the launch cue below. The grip
      // shake grades by mass too — coring a wreck lands heavier than a pebble.
      this.bus.emit('audio:cue', { id: 'gyre_snare_snag', rate: 1.08 - Math.min(0.3, rt.clumpMass / 500) });
      this.bus.emit('camera:shake', { amount: 0.10 + 0.10 * Math.min(1, rt.clumpMass / D.maxClumpMass) });
    }
    return true;
  },

  /** Hold phase: orbit the core around the maw; suck absorbables onto the clump. */
  _holdPass(dt, state, player, maw, nose) {
    const rt = this._rt;
    const core = state.entities.get(rt.coreId);
    if (!core || core.alive === false || !core.pos) { this._drop('core_lost'); return; }
    if (hasProtectedContent(core)) { this._releaseProtectedCore(core); return; }
    const t = Number.isFinite(state.simTime) ? state.simTime : state.tick / 60;

    // Strain break first: something violent flung the ball too far off the maw — the beam slips.
    // Checking before the spring queue keeps a freed core from eating one last pull.
    const coreDistMaw = Math.hypot(core.pos.x - maw.x, core.pos.z - maw.z);
    if (coreDistMaw > D.holdBreakDist) { this._drop('strained'); return; }

    // Orbit slot: revolves around the maw, breathes in/out — "loosely floating in zero G".
    const orbitR = Math.max(D.orbitRadiusMin, rt.clumpRadius * D.orbitRadiusScale)
      + Math.sin(t * D.orbitLiftRate + rt.orbitSeed) * D.orbitLiftRad;
    const angle = rt.orbitSeed + rt.orbitDir * t * D.orbitRate
      + Math.sin(t * D.orbitWobbleRate + rt.orbitSeed) * D.orbitWobbleRad;
    const tx = maw.x + Math.cos(angle) * orbitR;
    const tz = maw.z + Math.sin(angle) * orbitR;
    // The spring's residual error — how far the clump rides off its slot. Zero at a
    // calm float, grows while a fast-moving ship drags the ball behind: the milder
    // "lashing" read strain01 folds in at publish (capped below the tear band).
    rt.holdLag = Math.hypot(tx - core.pos.x, tz - core.pos.z);

    // Spring → orbit slot, damped vs ship frame so the ball tracks the ship.
    const shipVx = finite(player.vel && player.vel.x);
    const shipVz = finite(player.vel && player.vel.z);
    let ax = (tx - core.pos.x) * D.holdSpringK - (finite(core.vel && core.vel.x) - shipVx) * D.holdDamping;
    let az = (tz - core.pos.z) * D.holdSpringK - (finite(core.vel && core.vel.z) - shipVz) * D.holdDamping;
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
    // Newton's third on the lash: the spring pulls the clump toward its slot, so the
    // helm eats a small fraction of the same force in opposition. Capped by towed mass —
    // a pebble is free, a 2400 t katamari tugs like a load.
    const towMass = Math.min(mass, D.holdBackReactionMassCap) * D.holdBackReactionFrac;
    if (towMass > 0) {
      queuePhysicsImpulse(player, { x: -ax * towMass * dt, y: 0, z: -az * towMass * dt }, this._evidence(state.tick));
    }
    // A lazy tumble — steer the spin toward a small target ω so it settles into
    // floating-rubble drift instead of winding up open-loop on a long hold.
    const spinErr = D.tumbleTargetRadS - finite(core.angVel);
    // Torque budgets inertia, not mass: Δω needs inertiaY·spinErr (~0.4·m·r²) — at a
    // capped r=60 ball a mass-sized impulse lands at ~1/1440 of intent and the servo
    // silently dies exactly when the big ball needs it. Fall back to the same
    // approximation syncDerivedPhysicsMass writes when the authored record is absent.
    const inertia = finite(core.physicsBody && core.physicsBody.inertiaY)
      || mass * rt.clumpRadius * rt.clumpRadius * 0.4;
    queuePhysicsTorqueImpulse(core, { x: 0, y: inertia * spinErr * D.tumbleTorqueK * dt, z: 0 }, this._evidence(state.tick));

    // The beam keeps sweeping the basin toward the maw — still the funnel throat while
    // the suck lane owns the clump annulus (the clump is what "increases gravity" there).
    // towCount resets above BOTH lanes — a local reset inside _pullPass would wipe
    // the suck lane's annulus count from the same tick.
    rt.towCount = 0;
    rt.tooHeavyCount = 0;
    this._suckPass(dt, state, player, core, rt);
    // Keep the wedge pull alive so the cone keeps feeding material into the ball —
    // outside the suck's annulus, which the core's own lane already owns.
    this._pullPass(dt, state, player, maw, nose, {
      core,
      // r:0 when the clump is capped — the suck lane is disabled then, so the basin
      // lane owns the annulus again rather than leaving a dead zone around the ball.
      r: rt.clumpMass < D.maxClumpMass
        ? this._suckRadius(rt) : 0,
    });
  },

  /** The clump's own gravity well: it widens with the payload but stays bounded —
   * a capped katamari out-reaches the beam's basin deliberately, never ~2× past it. */
  _suckRadius(rt) {
    return Math.min(D.basinRadius * 1.5, rt.clumpRadius * (1 + D.suckBandMassGain) + D.suckBandWidth);
  },

  /** Drag absorbables onto the clump and merge the ones that touch. */
  _suckPass(dt, state, player, core, rt) {
    const queryRadius = this.helpers && typeof this.helpers.queryRadius === 'function'
      ? this.helpers.queryRadius : null;
    // Reset above the guard — a helper-less host must not publish a frozen +N read forever.
    rt.suckCount = 0;
    if (!queryRadius) return;
    // The band widens with the ball — a capped katamari is hungrier than a fresh
    // snag (katamari escalation legibility; the presentation halo draws the same
    // reach), but stays bounded: ~1.5× the beam's own basin, never ~2× past it.
    const suckR = this._suckRadius(rt);
    const cands = queryRadius(core.pos, suckR, this._scratch);
    const shipVx = finite(player && player.vel && player.vel.x);
    const shipVz = finite(player && player.vel && player.vel.z);
    for (let i = 0; i < cands.length; i++) {
      const e = cands[i];
      // gyreCore skip is parity with _pullPass — the id check already covers the core
      // itself, but the flag skip makes the single-flagged-body invariant local instead
      // of depending on sweep ordering.
      if (!e || e.alive === false || !e.pos || e.id === core.id || (e.data && e.data.gyreCore)) continue;
      if (e.id === state.playerId) continue;
      if (!isDynamic(e) || PULL_SKIP_TYPES.has(e.type) || e.physicsBody === false) continue;
      if (e.data && e.data.gyreLaunched) continue; // a thrown ball is never re-absorbed
      const remainingMass = D.maxClumpMass - rt.clumpMass;
      const admission = ingestionReason(e, remainingMass);
      const absorbable = admission === null;
      if (admission === 'too-heavy') {
        // Too heavy to EAT — not too heavy to feel: falls through to the courtesy tug
        // below so the strongest gravity zone (inside owned.r, where the basin lane is
        // suppressed) has no dead spot for a heavy rock hovering at the skin.
        if (remainingMass > 0) rt.tooHeavyCount += 1;
      }
      const dx = core.pos.x - e.pos.x;
      const dz = core.pos.z - e.pos.z;
      const dist = Math.hypot(dx, dz);
      const er = entityRadius(e);
      if (!absorbable) {
        // A non-absorbable body inside the annulus still feels the clump's gravity —
        // courtesy tug toward the core at the same discounted rate the basin gives, or
        // a 60 wu gravity ball has a dead zone around it. The tug runs under the skin
        // too: _pullPass's owned-skip is type-agnostic, so this lane is the ONLY pull
        // a mine/projectile gets inside the annulus. (Inside the skin, rapier contact
        // does the real work; the tug just keeps the gravity story unbroken.)
        // CAP-GAITED: at full mass owned.r=0 hands the annulus back to the basin lane —
        // an ungated tug would stack basin-courtesy + suck-tug on the same body, pulled
        // toward two different anchors at ~2x the intended ceiling.
        if (dist > 1e-4 && rt.clumpMass < D.maxClumpMass) {
          const tugK = D.nonAbsorbablePull * couplingScale(this._profile(e));
          const tug = D.suckAccel * tugK;
          this._queueAccel(e, (dx / dist) * tug, (dz / dist) * tug, entityMass(e), dt, state);
          // Same towCount the basin lane publishes — loot riding the annulus is still
          // under tow (the projectile exclusion matches _pullPass: a bullet isn't loot).
          // Without it TOWING drops to 0 exactly while the dragged mass is closest.
          if (e.type !== 'projectile' && tugK > 0.05) rt.towCount += 1;
          // Tugged mass inside the annulus glows at its discounted share too.
          if (this._spotScratch.length < D.basinSpotMax * 4) {
            this._spotScratch.push({ x: e.pos.x, z: e.pos.z, r: er, k: tugK });
          }
        }
        continue;
      }
      // Surface contact → merge into the ball (mass union; radius by volume, capped). The
      // meal sticks the moment its skin crosses the clump's — katamari stick-on-touch, not a
      // nested overlap, so a fast spiral can't orbit forever inside the band.
      // Fixed epsilon, not a multiplier: a 1.15x factor scales with the ball — a capped
      // 60 wu clump would eat a 6 wu rock ~10 wu before resting contact (vacuum-at-
      // range). A flat +4 wu beats permanent sub-skin orbit without the overreach.
      if (dist <= rt.clumpRadius + er + D.absorbEpsilonWu) {
        this._absorb(state, rt, core, e, dx, dz, dist);
        continue;
      }
      // Below the merge check: a body absorbed THIS tick is the clump's mass, not
      // incoming mass — counting it would publish it in the +N read for one frame.
      if (rt.clumpMass < D.maxClumpMass) rt.suckCount += 1;
      if (dist > 1e-4) {
        // A FULL clump can't keep another gram — stop vacuuming meals it will never
        // merge. Same gate _absorb enforces at contact, extended to the pull lane so a
        // capped ball doesn't drag leeches against its skin forever.
        if (rt.clumpMass >= D.maxClumpMass) continue;
        const couple = couplingScale(this._profile(e));
        const pull = D.suckAccel * couple;
        const mass = entityMass(e);
        let ax = (dx / dist) * pull;
        let az = (dz / dist) * pull;
        // Gentle frame damping so incoming mass settles onto the ball instead of orbiting it.
        ax -= (finite(e.vel && e.vel.x) - shipVx) * D.suckDamping;
        az -= (finite(e.vel && e.vel.z) - shipVz) * D.suckDamping;
        this._queueAccel(e, ax, az, mass, dt, state);
        // The last stretch of the feed glows like a basin victim: pre-stage the spot
        // into the pull lane's scratch (_suckPass runs before _pullPass in HOLD) so a
        // spiraling meal competes for the 8 glow slots by the same k ordering.
        if (couple > 0.05 && this._spotScratch.length < D.basinSpotMax * 4) {
          this._spotScratch.push({ x: e.pos.x, z: e.pos.z, r: er, k: couple });
        }
      }
    }
  },

  _absorb(state, rt, core, e, dx, dz, dist) {
    if (ingestionReason(e, D.maxClumpMass - rt.clumpMass) !== null) return false;
    const em = entityMass(e);
    const er = entityRadius(e);
    const massBefore = rt.clumpMass;
    rt.clumpMass = massBefore + em;
    // Ingestion is whole-body: if the meal cannot fit it stays alive with all its mass.
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
    // `=== false` is an authored opt-out — the same guard _launch carries.
    if (core.physicsBody !== false) {
      syncDerivedPhysicsMass(
        core,
        rt.clumpMass,
        Math.max(8, Math.round(rt.clumpMass * rt.clumpRadius * rt.clumpRadius * 0.4)),
        rt.clumpRadius,
      );
    }
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
        // pebble ticks high, a wreck thuds low. And the whole arc creeps upward as the
        // katamari eats — the 20th meal sounds hungrier than the 1st (escalation you
        // hear, not just see in the clump radius).
        this.bus.emit('audio:cue', {
          id: 'gyre_snare_absorb', gain: 0.7,
          rate: 1.15 - Math.min(0.5, em / 160) + Math.min(0.3, rt.totalAbsorbed * 0.015),
        });
        // The haptic ride shares the gate: a dense belt feed would otherwise hold the
        // pad in a continuous buzz exactly where the audio designers decided it should
        // stay a discrete tick. gyre:absorbed still fires per-meal for HUD honesty.
        this.bus.emit(GYRE_EVENTS.absorbTick, { coreId: core.id, mass: em, clumpMass: rt.clumpMass, tick: state.tick });
      }
      // Escalation reaches the camera too — swallowing a wreck should feel physically
      // different from swallowing a pebble: heavy meals shake, mid meals get a
      // micro-shake (30-80t is the most common satisfying meal — it shouldn't be silent),
      // and belt gravel stays quiet.
      if (em >= 30) this.bus.emit('camera:shake', { amount: em >= 80 ? 0.04 : 0.02 });
      // Saturation beat: the absorb that first crosses the cap gets its own voice so
      // the FULL moment lands through the ear, not just the HUD flag.
      if (rt.clumpMass >= D.maxClumpMass && !rt.fullCueLatched) {
        rt.fullCueLatched = true;
        this.bus.emit('audio:cue', { id: 'gyre_snare_full', gain: 0.8 });
        // The escalation arc's ceiling beat reaches the hands too — every other
        // latch pulses the pad (absorb even lerps with mass); FULL completes it.
        this.bus.emit(GYRE_EVENTS.full, { mass: rt.clumpMass, tick: state.tick });
      }
    }
    return true;
  },

  _releaseProtectedCore(core) {
    // A cargo/quest owner can adopt a formerly empty core while it is held. Preserve
    // that owner's current deadlines instead of restoring the pre-snag stash over them.
    delete core.data.gyreCore;
    this._restoreLifetime(core, true);
    if (this.helpers.markEntityVisualChanged) this.helpers.markEntityVisualChanged(core);
    this._drop('core_adopted');
  },

  /** Release: bowl the clump along the nose. */
  _launch(state, player) {
    const rt = this._rt;
    const core = rt.coreId != null ? state.entities.get(rt.coreId) : null;
    if (!player || !core || core.alive === false || !core.pos) {
      this._drop(!player ? 'player_lost' : 'launch_without_core');
      return;
    }
    if (hasProtectedContent(core)) { this._releaseProtectedCore(core); return; }
    const dir = this._launchDirObj || (this._launchDirObj = { x: 1, z: 0 });
    this._noseDir(player, dir);
    rt.phase = PHASE.LAUNCH;
    rt.launchLeft = D.launchTicks;
    rt.launchWindup = D.launchWindupTicks;
    rt.launchCarry = 0;
    // The aim freezes at the RELEASE edge — the slingshot read. The ball doesn't fly
    // for ~117 ms (windup + first burst), and re-deriving at the burst would let the
    // player steer the throw mid-coil: you aim, then the coil bows you away.
    rt.launchDir.x = dir.x;
    rt.launchDir.z = dir.z;
    // rt.coreId keeps pointing at the now-flying ball through the 5-tick burst — the
    // clump overlay + pub.coreId ride the payload until _finishLaunch clears it.
    rt.launchedId = core.id;
    rt.ballId = core.id; // outlives LAUNCH so render/HUD can track the bowling ball to its grave
    rt.basinCount = 0; // the "N in net" read is basin-only — a flying ball owns none
    rt.suckCount = 0;  // same for the annulus half — a debugger never reads a stale +N
    rt.towCount = 0;   // no pull lane runs through LAUNCH — don't publish a stale tow
    rt.tooHeavyCount = 0;
    rt.holdLag = 0;    // HOLD-only channel — nothing may read a stale drag residual
    rt.basinSpots.length = 0;
    rt.ballMass = rt.clumpMass;
    // The floor itself sags with throw mass: a capped moon bowls ~22% slower than a
    // pebble — heavy reads heavy in the ARC, not just growl/recoil. Computed HERE,
    // off the frozen ballMass, so provenance/kill-credit magnitude sees the real
    // thrown Δv and the burst just consumes it.
    rt.launchSpeedEff = D.launchSpeed
      * (1 - D.launchMassPenalty * Math.min(1, rt.ballMass / D.maxClumpMass));
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
    core.data = core.data || {};
    if (core.physicsBody !== false) {
      // physicsBody===false is an authored opt-out — materializing a record here
      // would make shouldSyncPhysicsBodyEntity spawn a body the entity declined.
      core.physicsBody = core.physicsBody || {};
      // Stash any authored scale so the adoption hand-back restores it rather than
      // leaving the entity un-damped (or keeping the weapon scale) forever.
      core.data.gyrePrevImpactScale = core.physicsBody.impactDamageScale;
      core.physicsBody.impactDamageScale = scale;
      // Bump the body revision — RESOLVED_BODY_CACHE keys on (body, revision), so the
      // authored-spec write must invalidate or the resolved spec reads stale.
      core.physicsBody.revision = Math.max(0, Math.trunc(finite(core.physicsBody.revision))) + 1;
    }
    delete core.data.gyreCore;
    // Launch stamps its own TTL. The authored-lifetime stashes ride on the ball so an
    // adoption hand-back can restore them — symmetric with the drop contract; a boundary
    // sweep drops them as old-timeline residue.
    core.data.gyreLaunched = true;
    core.data.despawnAt = (Number.isFinite(state.simTime) ? state.simTime : 0) + D.ballTtlS;
    recordImpulseProvenance(core, {
      actorId: state.playerId,
      weaponId: WEAPON_ID,
      tag: 'gyre_launch',
      appliedTick: state.tick | 0,
      magnitude: rt.clumpMass * rt.launchSpeedEff,
    });
    holdImpulseProvenance(core, (state.tick | 0) + Math.round(D.launchProvenanceHoldS * 60), state.tick | 0);
    // Serializable shadow of the WeakMap record: a save:loaded ball keeps despawnAt +
    // weapon scale but loses its entity-keyed provenance — the boundary sweep re-stamps
    // kill credit from this meta. holdUntilSim rides despawnAt, the flight's outer bound.
    core.data.gyreLaunchMeta = {
      actorId: state.playerId == null ? null : state.playerId,
      weaponId: WEAPON_ID,
      tag: 'gyre_launch',
      magnitude: rt.clumpMass * rt.launchSpeedEff,
      holdUntilSim: core.data.despawnAt,
      clumpRadius: rt.clumpRadius,
      // The absorb ledger serializes too — a re-adopted ball republishes its real
      // ×N and the glass-clump overlay rebuilds its lumps instead of collapsing to
      // the bare collider silhouette.
      absorbs: rt.ballAbsorbs,
      members: rt.ballMembers ? rt.ballMembers.slice() : null,
    };
    // Watch every launched id, not just the newest: a second launch or a save-load
    // that keeps the entity alive would otherwise orphan gyreLaunched + weapon scale
    // forever. AFTER the marks: the overflow scan prefers an unmarked slot, and a
    // freshly-pushed pre-mark ball would read as one and evict itself.
    this._trackBall(core.id);
    if (this.helpers.markEntityVisualChanged) this.helpers.markEntityVisualChanged(core);
    if (this.bus) {
      this.bus.emit(GYRE_EVENTS.launched, {
        coreId: core.id, mass: rt.clumpMass, radius: rt.clumpRadius,
        // The honest speed at the release edge is launchSpeedEff (post-mass-penalty);
        // carry isn't known until the burst, so the authored floor would lie.
        speed: rt.launchSpeedEff, dir: { x: dir.x, z: dir.z }, members: rt.members.length,
        tick: state.tick,
      });
    }
    // The kinetic payoff (shake + Newton kick + the launch crack itself) does NOT land
    // here — it rides the first burst tick in update() so the biggest beat hits the
    // moment the coil RELEASES the ball, not while it's still winding back. The crack's
    // recipe attack is 1 ms: emitted here it would fire a beat early, against the design.
  },

  _finishLaunch(state) {
    const rt = this._rt;
    rt.phase = PHASE.OFF;
    // A press during the ~5-tick launch burst is a real edge, not held-through-launch
    // (launch only starts on release): if the key is held when OFF lands, clear the
    // latch so next tick's rising edge re-opens the beam instead of eating the press.
    if (this._held(state)) rt.wasHeld = false;
    rt.coreId = null;
    rt.clumpMass = 0;
    rt.clumpRadius = 0;
    rt.members.length = 0;
    rt.launchWindup = 0;
    rt.launchCarry = 0;   // consumed by the burst — the launch ledger dies with its phase
    rt.launchSpeedEff = 0;
    // The beam ended in a THROW, not a release or a tear — a previous lash's 'strained'
    // must not dress a clean bowl's close ramp as a slip.
    rt.dropReason = 'launched';
    rt.fuseCueLatched = false;
    // Same live-side ledger reset _drop does: after the ball dies a core-less re-beam
    // must not publish the dead clump's count/cue state as if it were live. The frozen
    // ball ledger (ballId/ballMass/ballMembers/ballClumpRadius/ballAbsorbs) survives —
    // it is the payload's own bookkeeping, not the beam's.
    rt.totalAbsorbed = 0;
    rt.basinCount = 0;
    rt.suckCount = 0;
    rt.towCount = 0;
    rt.tooHeavyCount = 0;
    rt.holdLag = 0;
    rt.basinSpots.length = 0;
    rt.orbitSeed = 0;
    rt.orbitDir = 1;
    rt.lastAbsorbCueS = -1e9;
    rt.strainCueLatched = false;
    rt.fullCueLatched = false;
    rt.launchedId = null;
    // ballId/ballMass deliberately survive: the clump visual keeps riding the thrown mass until it
    // despawns, and the HUD's "ball live" dot reads the same flag.
    if (this.bus) {
      this.bus.emit(GYRE_EVENTS.beamOff, { phase: PHASE.LAUNCH, reason: 'launched', tick: this.state && this.state.tick });
    }
  },

  // ── ball watch retire — sim-side work (emits cues, mutates entity data) ──────
  // Deliberately OUT of _publish: the mirror pass must stay read-only — a publish
  // that mutates is how a retired primary re-fired its own grave the next tick.
  // Runs in update() immediately before the mirror write.
  _sweepBallWatch(state) {
    const rt = this._rt;
    const pub = state && state.gyreSnare;
    if (!rt || !pub) return;
    // Default each tick: the grave ring only blooms when the ball actually DIES — an
    // adoption hand-back (live body, deadline stripped by a foreign owner) drops
    // launchedId without a grave, and must not shatter under a still-live body.
    pub.ballGrave = false;
    if (pub.graves === null) pub.graves = [];
    pub.graves.length = 0;
    // Retire pass over EVERY watched launched id — not just the HUD's primary ball:
    // a second launch or a boundary reload can orphan an older marked body, and an
    // adopted orphan (deadline stripped by encounterScripts/egress/lootShards) must not
    // keep gyreLaunched immunity + weapon scale forever.
    if (rt.ballIds.length && state && state.entities) {
      for (let i = rt.ballIds.length - 1; i >= 0; i--) {
        const e = state.entities.get(rt.ballIds[i]);
        // A non-primary ball's quiet-TTL grave: the lifetime sweep kills and compacts it
        // later this same step, so the shatter sings HERE on its last live tick — same
        // rule the primary ballId path uses below. A 2400t ball deserves a grave.
        if (e && e.alive !== false && e.data && e.data.gyreLaunched && e.pos
          && e.data.despawnAt != null && Number.isFinite(state && state.simTime)
          && state.simTime >= e.data.despawnAt && rt.ballIds[i] !== rt.ballId) {
          if (this.bus) {
            this.bus.emit('audio:cue', { id: 'gyre_snare_ball_death', gain: 0.6, position: { x: e.pos.x, z: e.pos.z } });
            this.bus.emit(GYRE_EVENTS.ballGrave, { id: e.id, tick: state && state.tick });
          }
          // Ring for the HUD mirror too: a retired non-primary ball still deserves a
          // visual grave — the lane's quiet-TTL shatter was audio-only.
          const meta = e.data.gyreLaunchMeta;
          pub.graves.push({
            x: e.pos.x, z: e.pos.z,
            r: meta && Number.isFinite(meta.clumpRadius) ? meta.clumpRadius : 6,
          });
          // unwatched ⇒ disarmed — same invariant the overflow/adoption paths keep:
          // the payload never outlives the watch, even when the body dies this step.
          this._disarmBall(e);
          rt.ballIds.splice(i, 1);
          continue;
        }
        if (!e || e.alive === false || !e.data || !e.data.gyreLaunched || !e.pos
          || e.data.despawnAt == null) {
          if (e && e.alive !== false && e.data && e.data.gyreLaunched && e.data.despawnAt == null) {
            this._handBack(e);
          }
          rt.ballIds.splice(i, 1);
        }
      }
    }
    // Track a live bowling ball even in OFF: launchedId stays published until the entity is
    // gone (despawnAt/impact), so the glass-clump overlay retires with the ball, not the burst.
    if (rt.ballId != null && state && state.entities) {
      const ball = state.entities.get(rt.ballId);
      // A ball that lost its despawnAt was adopted by another system (encounterScripts,
      // egressExit, lootShards, terrainAnchors all strip it) — it is no longer the bowling
      // ball: retire it rather than pin ballId/HUD forever on a pull-immune asteroid.
      if (!ball || ball.alive === false || !ball.data || !ball.data.gyreLaunched || !ball.pos
        || ball.data.despawnAt == null) {
        // Grave vs adoption: a still-live body that lost only its deadline was handed
        // back to a foreign owner — retire the mirror with NO grave (the burst would
        // bloom under a live adopted body). Dead/removed balls are real graves.
        pub.ballGrave = !(ball && ball.alive !== false);
        // The ball met its grave. Only a quiet TTL expiry gets the shatter — an entity
        // left dead with its deadline passed — while impact deaths (removed, or dead with
        // no deadline pending) already sing through collision audio at the same spot.
        if (ball && ball.data && ball.data.despawnAt != null
          && Number.isFinite(state && state.simTime) && state.simTime >= ball.data.despawnAt
          && this.bus) {
          this.bus.emit('audio:cue', {
            id: 'gyre_snare_ball_death', gain: 0.6,
            // Sing at the live position — pub.ballPos is last tick's publish, up to
            // ~9 wu stale at launchSpeed 520.
            position: ball.pos ? { x: ball.pos.x, z: ball.pos.z } : { x: pub.ballPos.x, z: pub.ballPos.z },
          });
          this.bus.emit(GYRE_EVENTS.ballGrave, { id: ball.id, tick: state && state.tick });
        }
        // Hand-back: a live adopted body keeps nothing of ours — the shared helper
        // strips gyreLaunched and restores the stashed authored impactDamageScale.
        if (ball && ball.alive !== false && ball.data && ball.data.gyreLaunched) {
          this._handBack(ball);
        }
        this._unwatchBall(rt.ballId);
        rt.ballId = null;
        rt.launchedId = null; // don't leave a stale entity reference on the retired id
        rt.ballMass = 0;
        rt.ballMembers = null;
        rt.ballClumpRadius = 0;
        rt.ballAbsorbs = 0;
      } else {
        pub.ballPos.x = ball.pos.x; pub.ballPos.z = ball.pos.z;
        pub.ballClumpRadius = rt.ballClumpRadius;
        pub.ballTtl01 = ball.data.despawnAt != null && Number.isFinite(state.simTime)
          ? Math.max(0, Math.min(1, (ball.data.despawnAt - state.simTime) / D.ballTtlS)) : 1;
        // Seconds left in the flight — the HUD's ·Ns countdown rides this so the
        // quiet-TTL grave is telegraphed instead of the ribbon just dimming away.
        pub.ballTtlS = ball.data.despawnAt != null && Number.isFinite(state.simTime)
          ? Math.max(0, ball.data.despawnAt - state.simTime) : 0;
        // TTL-imminent: the lifetime sweep marks the ball dead AND compacts it out of
        // the entity map later this same step — so next tick 'ball' is undefined and the
        // retire below goes silent. Sing the grave HERE, on the last tick the ball is
        // still live: otherwise the authored shatter is unreachable on normal expiry.
        if (ball.data.despawnAt != null && Number.isFinite(state.simTime)
          && state.simTime >= ball.data.despawnAt && this.bus) {
          this.bus.emit('audio:cue', { id: 'gyre_snare_ball_death', gain: 0.6, position: { x: ball.pos.x, z: ball.pos.z } });
          this.bus.emit(GYRE_EVENTS.ballGrave, { id: ball.id, tick: state && state.tick });
          pub.ballGrave = true; // its last live tick — the ring blooms as the body retires
          // unwatched ⇒ disarmed — the non-primary quiet-TTL path keeps this invariant;
          // the primary's gets it too even though the body dies moments later.
          this._disarmBall(ball);
          this._unwatchBall(rt.ballId);
          rt.ballId = null; rt.launchedId = null; rt.ballMass = 0; rt.ballMembers = null; rt.ballClumpRadius = 0; rt.ballAbsorbs = 0;
        }
      }
    }
  },

  // ── presentation mirror (read-only on entity state for render/HUD; runtime-only,
  // never saved — edge-latched emits like audio:cue/gyre:strained/gyre:fuseLow ARE
  // allowed here: they ride published values and mutate nothing a reader can see) ──
  _publish(state, player) {
    const rt = this._rt;
    const pub = state.gyreSnare || (state.gyreSnare = {
      phase: PHASE.OFF, nose: { x: 0, z: 0 }, maw: { x: 0, z: 0 },
      coneLen: 0, halfAngleRad: D.coneHalfAngleRad, endRadius: 0,
      coreId: null, clumpMass: 0, clumpRadius: 0, absorbs: 0, maxClumpMass: D.maxClumpMass,
      strain01: 0, corePos: { x: 0, z: 0 }, coreAngVel: 0, launchDir: { x: 1, z: 0 },
      members: null, launchedId: null, ballPos: { x: 0, z: 0 }, ballMass: 0, ballTtl01: 1,
      ballTtlS: 0,
      basinCount: 0, ballClumpRadius: 0, launchWindup01: 0, ballGrave: false,
      graves: null, thrownBeat: false, basinSpots: null, dropReason: null, fuseS: 0,
      liveBalls: 0, absorbDir: { x: 0, z: 0 }, balls: null,
    });
    if (pub.basinSpots === null) pub.basinSpots = [];
    pub.basinSpots.length = 0;
    for (let i = 0; i < rt.basinSpots.length; i++) pub.basinSpots.push(rt.basinSpots[i]);
    pub.phase = rt.phase;
    pub.dropReason = rt.dropReason;
    // Burn-only fuse read: seconds of cap left at the CURRENT drain rate — hold drain
    // scales with clump mass, so the bigger the katamari the shorter the fuse. Regen
    // isn't counted, making it the honest worst case; the HUD draws it as a countdown.
    const drainMult = rt.phase === PHASE.HOLD
      ? D.capHoldMult * (1 + Math.min(rt.clumpMass / D.capMassDrainRef, D.capMassDrainMax))
      : 1;
    pub.fuseS = (player && rt.phase !== PHASE.OFF)
      ? this._cap(player) / Math.max(0.001, D.capDrainPerS * drainMult) : 0;
    if (rt.ballId == null) { pub.ballTtl01 = 1; pub.ballTtlS = 0; pub.ballClumpRadius = 0; }
    pub.launchedId = rt.ballId;
    pub.basinCount = (rt.basinCount || 0) + (rt.phase === PHASE.HOLD ? rt.suckCount : 0);
    pub.towCount = rt.towCount || 0;
    pub.tooHeavyCount = rt.tooHeavyCount || 0;
    // Live-ball count publishes on EVERY phase incl. OFF — the HUD's '+N' counts balls
    // still flying while the lash is closed; freezing it here would pin a phantom
    // extra-ball pip until the next beam opened.
    pub.liveBalls = rt.ballIds.length;
    // Secondary live balls — a second bowl mid-flight would otherwise be silent and
    // streak-less: trail/audio/HUD mirror only the primary's pos+ttl. Bounded and
    // sorted by ttl so the soonest-dying ball owns the extra slots deterministically.
    if (pub.balls === null) pub.balls = [];
    pub.balls.length = 0;
    // Bound matches the ballIds watch list — every watched non-primary ball gets its
    // streak/rumble/countdown slot. Collect ALL live non-primaries first, then sort by
    // ttl: cap-before-sort would let a soonest-dying ball lose its slot to watch order.
    const bTmp = this._ballScratch || (this._ballScratch = []);
    bTmp.length = 0;
    for (let i = 0; i < rt.ballIds.length; i++) {
      const id = rt.ballIds[i];
      if (id === rt.ballId) continue;
      const e = state && state.entities ? state.entities.get(id) : null;
      if (!e || e.alive === false || !e.data || !e.data.gyreLaunched || !e.pos) continue;
      const ttlS = e.data.despawnAt != null && Number.isFinite(state && state.simTime)
        ? Math.max(0, e.data.despawnAt - state.simTime) : 0;
      const meta = e.data.gyreLaunchMeta;
      bTmp.push({
        id, x: e.pos.x, z: e.pos.z,
        vx: finite(e.vel && e.vel.x), vz: finite(e.vel && e.vel.z),
        ttlS,
        ttl01: D.ballTtlS > 0 ? Math.max(0, Math.min(1, ttlS / D.ballTtlS)) : 1,
        mass: entityMass(e),
        r: meta && Number.isFinite(meta.clumpRadius) ? meta.clumpRadius : entityRadius(e),
        // Bounded member slice (≤6) so a second thrown katamari isn't a bare
        // collider — the presentation seeds its cheap secondary overlay from it.
        members: meta && Array.isArray(meta.members) ? meta.members.slice(0, 6) : null,
      });
    }
    bTmp.sort((a, b) => a.ttlS - b.ttlS);
    for (let i = 0; i < bTmp.length && pub.balls.length < 8; i++) pub.balls.push(bTmp[i]);
    pub.ballMass = rt.ballId != null ? rt.ballMass : 0;
    if (rt.phase === PHASE.OFF) {
      pub.coreId = null; pub.strain01 = 0;
      if (rt.ballId != null) {
        // Ball still flying: publish the frozen clump so the lumps/mass/count ride it out.
        pub.members = rt.ballMembers;
        pub.clumpMass = rt.ballMass;
        pub.clumpRadius = rt.ballClumpRadius;
        pub.absorbs = rt.ballAbsorbs;
        const lm = rt.ballMembers && rt.ballMembers.length
          ? rt.ballMembers[rt.ballMembers.length - 1] : null;
        pub.absorbDir.x = lm ? finite(lm.nx) : 0;
        pub.absorbDir.z = lm ? finite(lm.nz) : 0;
      } else {
        pub.members = null;
        pub.clumpMass = 0; pub.clumpRadius = 0; pub.absorbs = 0;
        pub.absorbDir.x = 0; pub.absorbDir.z = 0;
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
    // Progress (not remaining): 0 at the release edge, rising to 1.0 on the throw
    // tick and holding through the burst — a "fully wound" cue keys on the ramp END,
    // which a remaining-fraction ramp could never publish.
    pub.launchWindup01 = rt.phase === PHASE.LAUNCH
      ? (D.launchWindupTicks > 0 ? 1 - rt.launchWindup / D.launchWindupTicks : 1) : 0;
    // The exact throw tick — the first burst tick ONLY, the same condition the
    // gyre:thrown emit uses: launchLeft already consumed exactly once. gyre:thrown,
    // the pad thump, camera shake and the Newton kick all land here, so the grave
    // ring blooms on this same tick instead of a frame early off windup01.
    pub.thrownBeat = rt.phase === PHASE.LAUNCH
      && rt.launchLeft === D.launchTicks - 1;
    const core = rt.coreId != null ? state.entities.get(rt.coreId) : null;
    if (core && core.pos) {
      pub.corePos.x = core.pos.x; pub.corePos.z = core.pos.z;
      // The held body's real spin — the VFX lumps ride it instead of an authored rate.
      pub.coreAngVel = finite(core.angVel);
      // Strain is a HOLD-only read: rt.coreId stays set through the launch coil/burst
      // (cleared at _finishLaunch), so a clump released already-strained would publish a
      // phantom "beam tearing" beat on a deliberate bowl. LAUNCH reports zero like BEAM.
      pub.strain01 = rt.phase === PHASE.HOLD ? Math.max(
        clamp(
          (Math.hypot(core.pos.x - maw.x, core.pos.z - maw.z) - D.holdStrainDist)
            / Math.max(1, D.holdBreakDist - D.holdStrainDist),
          0, 1,
        ),
        // Mild second-order read: the orbit spring's residual lag shades the glass
        // while the ship drags the clump behind — capped below the 0.4 STRAIN/cue
        // thresholds so lag can tense the lash but never cry "tearing".
        clamp(rt.holdLag / D.holdLagRefWu, 0, 1) * D.holdLagStrainMax,
      ) : 0;
    } else { pub.strain01 = 0; pub.coreAngVel = 0; }
    // The newest member's approach direction — the gulp dips toward the side the mass
    // actually hit instead of reading omnidirectional. nx/nz ride the member ledger.
    const lastM = pub.members && pub.members.length ? pub.members[pub.members.length - 1] : null;
    pub.absorbDir.x = lastM ? finite(lastM.nx) : 0;
    pub.absorbDir.z = lastM ? finite(lastM.nz) : 0;
    // The capacitor's dying gasp warns the hands/ears ~3 s out — a pad-first player
    // gets no `·Ns` pill read, so the forced bowl must not arrive unattributed.
    // Latched per hold like strain; _drop/_finishLaunch re-arm it for the next lash.
    if (rt.phase === PHASE.HOLD && !rt.fuseCueLatched && pub.fuseS > 0 && pub.fuseS < D.fuseLowWarnS) {
      rt.fuseCueLatched = true;
      if (this.bus) {
        this.bus.emit('audio:cue', { id: 'gyre_snare_fuse_low', gain: 0.45 });
        this.bus.emit(GYRE_EVENTS.fuseLow, { tick: state && state.tick });
      }
    }
    // Strain gets its own voice on the same hysteresis the HUD uses: the glass tension
    // rises the tick the clump strains, and latches quiet again once it reels back in.
    if (rt.phase === PHASE.HOLD && !rt.strainCueLatched && pub.strain01 > 0.4) {
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
    if (!state || state.mode !== 'flight') { if (rt.phase !== PHASE.OFF) this._drop('not_flight'); rt.wasHeld = false; if (state) { this._sweepBallWatch(state); this._publish(state, null); } return; }
    const player = this._playerCapable(state);
    const held = this._held(state) && !!player;

    // Verb edges — rising opens the beam; falling bowls the clump (or just closes an empty beam).
    if (held && !rt.wasHeld && rt.phase === PHASE.OFF) {
      const cap = this._cap(player);
      if (cap >= D.capActivateMin) {
        rt.phase = PHASE.BEAM;
        rt.dropReason = null; // a fresh wake forgets why the last lash died
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
      else if (rt.phase === PHASE.BEAM && player) this._drop('released');
      // BEAM with no player isn't a release — it falls through to the !player drop
      // below, so the reason reads 'player_lost' instead of a lie.
      // LAUNCH is exempt: the release edge that starts the bowl must not truncate its burst.
      // (Any other close — player gone, docked, dead — lands via the !player drop below.)
    }
    rt.wasHeld = held;

    if (rt.phase === PHASE.OFF) { this._sweepBallWatch(state); this._publish(state, player); return; }
    if (!player) {
      // Docked and gone are different stories — the beamOff reason is the only record
      // of why the lash died, so keep it honest.
      const raw = this.helpers.player ? this.helpers.player() : state.entities.get(state.playerId);
      const docked = !!(raw && ((raw.flags && raw.flags.docked) || (state.ui && state.ui.docked === true)));
      this._drop(docked ? 'player_docked' : 'player_lost');
      this._sweepBallWatch(state);
      this._publish(state, null);
      return;
    }

    // Cap drain — an empty tank bowls whatever the beam is holding right now. Hold drain
    // scales with clump mass: a huge ball can out-pull the hull's regen — the bigger the
    // katamari, the shorter the fuse on your hold.
    const drainMult = rt.phase === PHASE.HOLD
      ? D.capHoldMult * (1 + Math.min(rt.clumpMass / D.capMassDrainRef, D.capMassDrainMax))
      : 1;
    const drain = D.capDrainPerS * drainMult * dt;
    this._spendCap(player, drain);
    const dry = this._cap(player) <= 0;

    const maw = this._maw(player, this._mawObj || (this._mawObj = { x: 0, z: 0 }));
    const nose = this._noseDir(player, this._noseObj || (this._noseObj = { x: 1, z: 0 }));

    if (rt.phase === PHASE.LAUNCH) {
      const core = rt.launchedId != null ? state.entities.get(rt.launchedId) : null;
      if (core && core.alive !== false && rt.launchWindup > 0) {
        // Wind-up beat: a ~100 ms coil that drags the clump slightly aft of the maw
        // before the burst — the release reads as a slingshot, not an instant shove.
        rt.launchWindup -= 1;
        if (this.bus && rt.launchWindup === D.launchWindupTicks - 1) {
          // First coil tick: the pad rides a low rumble through the draw — the
          // slingshot pull-back is the feel-rich part, and silence undersold it.
          this.bus.emit(GYRE_EVENTS.windup, { tick: state.tick });
          // The draw gets a thin rising shimmer too — felt on the pad and seen in
          // the maw, it was the one beat of the throw with no voice at all.
          this.bus.emit('audio:cue', {
            id: 'gyre_snare_windup',
            position: { x: core.pos.x, z: core.pos.z },
            gain: 0.5,
          });
        }
        // The coil draw-back is absolute 13 wu — ~20% of a capped 60 wu katamari's
        // silhouette, where the bow nearly vanishes. Scale with the payload so a big
        // moon still visibly rocks back before the burst.
        const pullWu = Math.max(D.launchWindupPullWu, rt.clumpRadius * 0.4);
        const wx = maw.x - rt.launchDir.x * pullWu;
        const wz = maw.z - rt.launchDir.z * pullWu;
        const shipVx = finite(player.vel && player.vel.x);
        const shipVz = finite(player.vel && player.vel.z);
        let ax = (wx - core.pos.x) * D.launchWindupSpringK
          - (finite(core.vel && core.vel.x) - shipVx) * D.launchWindupDamping;
        let az = (wz - core.pos.z) * D.launchWindupSpringK
          - (finite(core.vel && core.vel.z) - shipVz) * D.launchWindupDamping;
        const wa2 = ax * ax + az * az;
        const wCap = D.launchWindupMaxAccel || D.holdMaxAccel;
        if (wa2 > wCap * wCap) {
          const s = wCap / Math.sqrt(wa2);
          ax *= s; az *= s;
        }
        const mass = entityMass(core);
        queuePhysicsImpulse(core, { x: ax * mass * dt, y: 0, z: az * mass * dt }, this._evidence(state.tick));
      } else if (core && core.alive !== false && rt.launchLeft > 0) {
        const mass = entityMass(core);
        if (rt.launchLeft === D.launchTicks) {
          // The coil's residual AFT-velocity is repaid by the burst — the effective
          // launch speed is a FLOOR on launch-direction flight speed: an aft-moving
          // ball still lands at pace (a heavy draw can't undercook the read), while
          // forward residual — e.g. the ship translating into the throw — keeps
          // riding. Δv floor semantics, not a hard cap: a moving ship bowls hotter.
          const fwd = finite(core.vel && core.vel.x) * rt.launchDir.x
            + finite(core.vel && core.vel.z) * rt.launchDir.z;
          rt.launchCarry = Math.max(0, -fwd);
          // launchSpeedEff was frozen in _launch off ballMass — the burst just
          // repays coil carry on top of it.
        }
        // Per-tick impulse = m·(v/launchTicks): launchTicks of these sum to Δv = vEff.
        const j = ((rt.launchSpeedEff + rt.launchCarry) * mass) / D.launchTicks;
        queuePhysicsImpulse(core, {
          x: rt.launchDir.x * j, y: 0, z: rt.launchDir.z * j,
        }, this._evidence(state.tick));
        rt.launchLeft -= 1;
        if (rt.launchLeft === D.launchTicks - 1) {
          // First burst tick = the coil release: the weapon's biggest kinetic beat lands
          // HERE — the throw is over, not while the ball was still winding back. Pad
          // players ride gyre:thrown; gyre:launched stays the release-edge record.
          if (this.bus) {
            this.bus.emit(GYRE_EVENTS.thrown, { tick: state && state.tick });
            this.bus.emit('camera:shake', {
              amount: 0.3 + 0.25 * Math.min(1, rt.ballMass / D.maxClumpMass),
            });
            // Mass-graded launch voice lands ON the release tick with the rest of the
            // throw language — a pebble cracks bright, a capped moon bowls low and
            // heavy (emitted at the release edge before, ~100 ms ahead of the sling).
            const launchFrac = Math.min(1, rt.ballMass / D.maxClumpMass);
            this.bus.emit('audio:cue', {
              id: 'gyre_snare_launch',
              position: { x: core.pos.x, z: core.pos.z },
              rate: 1.05 - 0.45 * launchFrac,
              gain: 0.7 + 0.5 * launchFrac,
            });
          }
          // Newton: throwing a small moon pushes back. A gentle mass-scaled counter-Δv
          // (capped 6 wu/s — a nudge, not a knockback) physically sells the heave.
          const recoilDv = Math.min(6, 1.2 + rt.ballMass / 500);
          const shipMass = entityMass(player);
          queuePhysicsImpulse(player, {
            x: -rt.launchDir.x * recoilDv * shipMass, y: 0, z: -rt.launchDir.z * recoilDv * shipMass,
          }, this._evidence(state.tick));
        }
      } else {
        rt.launchLeft = 0;
        rt.launchWindup = 0;
      }
      if (rt.launchWindup <= 0 && rt.launchLeft <= 0) this._finishLaunch(state);
    } else if (rt.phase === PHASE.BEAM) {
      rt.towCount = 0;
      rt.tooHeavyCount = 0;
      this._pullPass(dt, state, player, maw, nose);
      this._trySnag(state, maw);
    } else if (rt.phase === PHASE.HOLD) {
      this._holdPass(dt, state, player, maw, nose);
    }

    // The capacitor running dry mid-hold auto-bowls (dramatic and honest) — but say
    // why: an unattributed launch reads as "the lash fired itself". The toast lands
    // before the normal launch beat so the cause is legible at the moment of surprise.
    if (dry && rt.phase === PHASE.HOLD) {
      if (this.bus) {
        this.bus.emit('toast', { kind: 'warn', text: 'Gyre Snare drained — clump away', ttl: 1.6 });
        this.bus.emit('audio:cue', { id: 'ui_deny', gain: 0.5 });
      }
      this._launch(state, player);
    }
    // An empty beam dying of thirst gets the same attribution: the cone vanishes and
    // the pill goes dark — say why, or the lash reads as self-closing.
    else if (dry && rt.phase === PHASE.BEAM) {
      if (this.bus) this.bus.emit('toast', { kind: 'warn', text: 'Gyre Snare drained — lash off', ttl: 1.6 });
      this._drop('cap_dry');
    }

    this._sweepBallWatch(state);
    this._publish(state, player);
  },
};

export const GYRE_SNARE_PHASES = PHASE;
