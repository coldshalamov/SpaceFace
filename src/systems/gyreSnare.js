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
const TICKS_PER_S = 60; // sim tick -> simTime ratio shared by the provenance hold
                        // windows. This is the codebase-wide 60 Hz step convention
                        // (coreSystem advances simTime by dt=1/60; fieldKernel defaults
                        // the same), not a local magic number — the seconds→ticks
                        // conversions below assume it as a system contract.
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
    // A cap_dry close already narrated itself ('drained — clump away/lash off');
    // while the key is still down the re-armed rising edge must not double-narrate
    // 'needs charge to wake'. Clears when the key releases.
    dryDenyDone: false,
    beamWake: 0,           // s since BEAM opened — the basin's pull ramps in over the
                           // cone's own ~150 ms projection so the physics edge and
                           // the drawn edge agree (a body doesn't slide pre-reach)
    // Clump ledger (hold phase): the core entity + what it has eaten.
    coreId: null,
    clumpMass: 0,          // t — bookkeeping mass (base core + absorbed members)
    clumpRadius: 0,        // wu — volumetric union radius (for visuals/absorb tests)
    members: [],           // bounded absorb records for the clump lumps VFX
    absorbDir: { x: 0, z: 0 }, // newest meal's approach dir — UNBOUNDED channel (the
                             // ledger caps at 28; a frozen gulp dir past that is stale)
    absorbRadius: 0,       // newest meal's collider radius — the swallow kick grades by meal size
    // Launch bookkeeping.
    launchLeft: 0,         // ticks of the launch impulse burst still owed
    launchWindup: 0,       // ticks of the pre-burst coil (anticipation) still owed
    launchWindupTotal: 0,  // ticks the coil started at — mass-graded at _launch; the
                           // windW01/launchWindup01 channels + tick-1 latch read THIS,
                           // not the flat field, or a graded coil would over-hold the channels
    launchCarry: 0,        // aft-velocity the coil left on the ball — repaid inside the burst
                           // so authored launchSpeed is the FINAL flight speed, not the impulse sum
    launchFwd: 0,          // raw dir-projection velocity at first burst tick — the honest thrown
                           // speed = launchSpeedEff + max(0, launchFwd) (hot bowl rides free)
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
    strainCueNextTick: 0,    // the sustain retrigger — a held excursion keeps a voice
    fuseCueLatched: false,   // the fuse-low warning fires once per hold
    basinCatchLatched: false, // the first basin catch ticks once per empty->net edge
    tooHeavyLatched: false,   // the first UNEATABLE net fill ticks once too — sibling edge
    tooHeavyLane: null,       // 'basin' | 'suck' — which lane counted the newest too-heavy (positions its tick)
    catchTickPeak: 0,         // escalation ratchet — quieter count-graded ticks fire on each new shown +N peak
    prevBasinN: 0,            // last-published basin count — the re-tick's position follows whichever lane grew
    prevSuckN: 0,             // same for the annulus half
    orbitSeed: 0,          // per-CORE orbit phase (stable id hash) — different cores get different start angles, any id type
    orbitAngle: 0,         // integrated orbit phase — advanced by orbitRateEff·dt per hold tick so a ponderous-arc rate derate can't phase-jump the slot (rate × absolute t would lurch the clump on every absorb)
    orbitDir: 1,           // ±1 — revolution direction from the same hash, so successive clumps don't all circle one way
    swirlBlend: 1,         // eased stir sign — chases orbitDir over ~0.5 s (dt·4 across a range of 2) so a snag can't flip the funnel's spiral mid-feed
    tornTrack: null,       // {id, ticks} — a strain-freed core's last ~0.5 s: the close lets the lash visibly LOSE the ball
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
    // Coil-abort capture (before the ledger reset zeroes it): a non-boundary
    // drop during LAUNCH with launchLeft still full means _launch committed
    // the ball's arming stamps — gyreLaunched, up-to-8× impact scale, the
    // lash deadline, kill credit — but zero burst ticks ever fired. Handed
    // back below like any interrupted adoption; otherwise it would park at
    // the coil anchor for ballTtlS as a live attributed mine.
    const coilAbortId = !boundary && droppedPhase === PHASE.LAUNCH
      && rt.launchLeft === D.launchTicks ? rt.launchedId : null;
    // The tear snap's whip scale — captured before the reset zeroes clumpRadius
    // (which would unfloor the ponderous rate). Strain drops only.
    let droppedDir = 1, droppedOrbitR = 0, droppedRate = 0, droppedClumpR = 0;
    if (!wasOff && reason === 'strained') {
      droppedDir = rt.orbitDir;
      droppedOrbitR = Math.max(D.orbitRadiusMin, rt.clumpRadius * D.orbitRadiusScale);
      droppedRate = this._orbitRate(rt);
      droppedClumpR = rt.clumpRadius; // the whip grades on the clump it WAS
    }
    rt.dropReason = reason || 'dropped'; // a strain break is a tear, not a polite release — the close reads the reason
    rt.phase = PHASE.OFF;
    rt.coreId = null;
    rt.clumpMass = 0;
    rt.clumpRadius = 0;
    rt.members.length = 0;
    rt.absorbDir.x = 0; rt.absorbDir.z = 0; rt.absorbRadius = 0;
    rt.launchLeft = 0;
    rt.launchWindup = 0;
    rt.launchWindupTotal = 0;
    rt.launchCarry = 0;
    rt.launchFwd = 0;
    rt.launchSpeedEff = 0;
    rt.launchDir.x = 1; rt.launchDir.z = 0; // ledger symmetry — dead data, but nothing stale survives a boundary drop mid-burst
    rt.launchedId = null;
    if (coilAbortId != null) {
      // The ball leaves the watch ledger with its marks — the retire pass
      // never re-enters it and the mirror retires via ballId like an
      // ordinary adoption (alive, unmarked → no grave).
      this._unwatchBall(coilAbortId);
      const coilVictim = this.state && this.state.entities
        ? this.state.entities.get(coilAbortId) : null;
      if (coilVictim && coilVictim.alive !== false && coilVictim.data) {
        this._handBack(coilVictim);
      }
    }
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
    rt.orbitAngle = 0;
    rt.orbitDir = 1;
    rt.swirlBlend = 1;
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
    rt.lastAbsorbCueS = -1e9; rt.strainCueLatched = false; rt.strainCueNextTick = 0;
    rt.beamWake = 0; // the next beam's pull re-ramps with its own projection
    rt.fullCueLatched = false;
    rt.fuseCueLatched = false;
    rt.basinCatchLatched = false;
    rt.tooHeavyLatched = false;
    rt.tooHeavyLane = null;
    rt.catchTickPeak = 0;   // the escalation ratchet dies with the beam ledger
    rt.prevBasinN = 0; rt.prevSuckN = 0; // and the prev-count ledgers with it —
    // the re-seed sits below the OFF early-return, so a re-opened beam would
    // otherwise compute its first dBasin/dSuck off the previous beam's tail
    rt.tornTrack = null; // any new drop ends a previous torn body's follow
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
    // The tear snap is a SIM mutation — it must run on a bus-less host too, so it
    // lives outside the bus guard below (a strain break's whip isn't a cue).
    if (!wasOff && reason === 'strained' && emitId != null) {
      const st = this.state;
      const torn = st && st.entities ? st.entities.get(emitId) : null;
      const pl = st && st.entities ? st.entities.get(st.playerId) : null;
      if (torn && torn.pos && pl && pl.pos) {
        const mw = this._maw(pl, this._dropMaw || (this._dropMaw = { x: 0, z: 0 }));
        let rx = torn.pos.x - mw.x, rz = torn.pos.z - mw.z;
        const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
        let ix = -rz * droppedDir + rx * 0.4;
        let iz = rx * droppedDir + rz * 0.4;
        const il = Math.hypot(ix, iz) || 1; ix /= il; iz /= il;
        const m = entityMass(torn);
        // The whip must OUTRUN the revolve's tangential speed or the snap reads
        // weaker than the motion it interrupts. The frac term is mass-graded by
        // clumpRadius/maxClumpRadius — a routine clump's graded term lands under
        // the floor and the tear reads as one clean flick; only a near-cap ball
        // earns the whip past it (~37 wu/s at cap). Monotone in size — a heavier
        // slip always reads more violent than a smaller one.
        const snapV = Math.max(D.tearSnapWuS,
          droppedRate * droppedOrbitR * D.tearSnapOrbitFrac
            * Math.min(1, droppedClumpR / D.maxClumpRadius));
        queuePhysicsImpulse(torn,
          { x: ix * m * snapV, y: 0, z: iz * m * snapV },
          this._evidence(st.tick | 0));
        // The rubble rides the freed body for ~0.5 s (pub.tornPos) — the whip
        // reads as the lash LOSING the ball, not rubble de-rezzing mid-flight.
        // The whip's own direction goes out too (pub.tornDir) so the tear ring
        // can stretch along the actual ejection axis, not a guessed radial.
        rt.tornTrack = { id: emitId, ticks: Math.ceil(0.5 * TICKS_PER_S), dir: { x: ix, z: iz } };
        // Same-tick freshness: the tear ring blooms where the body IS — coreId
        // clears above, so _publish won't rewrite corePos this tick; last tick's
        // published spot is stale by up to a shove's worth (a teleport past
        // holdBreakDist is exactly the case the tear covers).
        const pub = this._ensurePub(st);
        pub.corePos.x = torn.pos.x; pub.corePos.z = torn.pos.z;
      }
    }
    if (this.bus && !wasOff) {
      this.bus.emit(GYRE_EVENTS.beamOff, {
        id: (this.state && this.state.playerId) || null,
        playerId: (this.state && this.state.playerId) || null,
        phase: droppedPhase, reason: String(reason || 'dropped'), tick: this.state && this.state.tick,
      });
      this.bus.emit(GYRE_EVENTS.dropped, {
        // `id` rides beside coreId: the {id:…} event convention so a future
        // consumer doesn't need to know which key a given event chose.
        id: emitId, coreId: emitId, reason: String(reason || 'dropped'), boundary, quiet,
        tick: this.state && this.state.tick,
      });
      // A live lash ending without a launch gets the descending release voice — quiet for
      // an empty-beam release, fuller when a clump slipped the beam. Boundaries stay silent
      // (a save/sector swap shouldn't talk).
      if (!quiet) {
        this.bus.emit('audio:cue', {
          // A strain break is the verb's biggest loss beat — it gets its own clink +
          // harsh-dust TEAR voice, not the polite release's descending fizzle.
          // core_lost joins the tear voice: a clump destroyed in the grip is a
          // shatter, not a polite release — same glassier cue, same close shape.
          id: emitId != null ? ((reason === 'strained' || reason === 'core_lost') ? 'gyre_snare_tear' : 'gyre_snare_drop') : 'gyre_snare_off',
          gain: emitId != null ? 0.9 : 0.5,
        });
        // A strain break is the verb's biggest loss beat — land it in the body too
        // (mass-scaled like the launch kick, smaller since nothing was thrown).
        if (reason === 'strained') {
          this.bus.emit('camera:shake', {
            amount: 0.15 + 0.1 * Math.min(1, droppedMass / D.maxClumpMass),
          });
          // Text channel parity with the file's own convention — cap_dry toasts
          // 'drained — clump away', adoption 'clump reclaimed'; the tear is the
          // LOUDEST involuntary loss and shouldn't be the one with no words.
          this.bus.emit('toast', { kind: 'warn', text: 'Gyre Snare — clump torn free', ttl: 1.6 });
        }
        // A clump destroyed in the grip gets words too — every other involuntary
        // end narrates. No extra shake: whatever killed the core already landed
        // its own impact thump, and doubling it would read as two hits.
        else if (reason === 'core_lost') {
          this.bus.emit('toast', { kind: 'warn', text: 'Gyre Snare — clump destroyed', ttl: 1.6 });
        }
      }
    }
  },

  _restoreLifetime(e, futureOnly = false) {
    // Stashed at snag: a freed (non-launched) core resumes its authored deadlines
    // instead of living forever as stasis residue.
    if (!e || !e.data) return;
    // 'in' not '!== undefined': an absent authored despawnAt stashes undefined and
    // must restore ABSENT (and still consume the stash key) — otherwise every freed
    // core that had no authored deadline carries a dead residue key forever.
    if ('gyrePrevDespawnAt' in e.data) {
      // '== null' not '=== undefined': a stash that round-tripped a real save
      // serializes Infinity/NaN/undefined as null — still "no authored deadline".
      if (e.data.gyrePrevDespawnAt == null) {
        if (!futureOnly) delete e.data.despawnAt; // absent authored → restore absent
        // futureOnly: a foreign owner's own deadline (if any) wins — leave it.
        delete e.data.gyrePrevDespawnAt;
      } else {
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
    }
    // 'in' not '!== undefined': an absent authored ttl stashes undefined and must
    // restore ABSENT (e.ttl = undefined) — otherwise a released body keeps the
    // Infinity the snag planted instead of round-tripping as authored.
    if ('gyrePrevTtl' in e.data) {
      // The countdown channel is RELATIVE — frozen at snag, it can't go stale like an
      // absolute despawnAt. Resuming it under futureOnly is the honest authored state:
      // an adopter keeping the body strips deadlines itself, and a released hand-back
      // must not leave immortal debris. A non-positive stash restores nothing.
      if (futureOnly) {
        // Same current-owner guard as the despawnAt branch: a foreign owner that
        // assigns its own finite ttl keeps it — the snag only planted Infinity, so a
        // finite e.ttl here is owner-set and wins. Infinity still restores authored.
        // An absent OR non-positive stash restores nothing — and must not leave the
        // snag's planted Infinity behind either (immortal debris): delete instead.
        if (!(e.data.gyrePrevTtl > 0)) {
          if (!Number.isFinite(e.ttl)) delete e.ttl;
        } else if (!Number.isFinite(e.ttl)) {
          e.ttl = e.data.gyrePrevTtl;
        }
        delete e.data.gyrePrevTtl;
      } else {
        // '== null' too: a serialized null stash (authored ttl was Infinity)
        // must restore ABSENT — writing e.ttl = null would decrement a corpse
        // deadline into the body and kill it on the next lifetime tick.
        if (e.data.gyrePrevTtl == null) delete e.ttl;
        else e.ttl = e.data.gyrePrevTtl;
        delete e.data.gyrePrevTtl;
      }
    }
  },

  _clearCoreMark() {
    const rt = this._rt;
    if (!rt) return; // destroy() before init() — nothing tracked
    const core = rt.coreId != null && this.state && this.state.entities
      ? this.state.entities.get(rt.coreId) : null;
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
    // The lash stamps its OWN flight deadline on the ball — indistinguishable from a
    // foreign-owner deadline by nullness alone, so the future-only restore would
    // preserve it and a pin landing mid-throw would still kill the body on the
    // aborted flight's ~9 s TTL. The stamped value is self-identifying via the meta:
    // drop it before the restore so the authored stash round-trips.
    if (ball.data.gyreLaunchMeta
      && ball.data.despawnAt === ball.data.gyreLaunchMeta.holdUntilSim) {
      delete ball.data.despawnAt;
    }
    // Symmetric with _restoreLifetime on drop, but future-only: the authored deadlines
    // the ball carried before the lash caught it come back ONLY while still in the
    // future and only when the new owner left despawnAt unset — a stale stash or a
    // resumed countdown would assassinate the adopter's body on the next sweep.
    this._restoreLifetime(ball, true);
    this._disarmBall(ball);
    // The adopter owns the body now — no lash credit rides it. The meta delete lives
    // HERE, not in _disarmBall: an evicted-but-still-marked ball keeps its serialized
    // shadow so a save:loaded boundary can re-stamp provenance + republish ×N/radius.
    delete ball.data.gyreLaunchMeta;
  },

  // Shed the weapon payload WITHOUT shedding the mark: an evicted-but-still-marked
  // ball keeps gyreLaunched (pull/snag/suck immunity + launch kill credit ride it to
  // its own TTL) AND its serialized launch meta — the boundary sweep re-stamps
  // provenance from it post-load. Only the 8× sleeper impact scale + its authored
  // stash shed: if a foreign owner strips the deadline while it's unwatched, the
  // orphan is a benign immune body, not a permanently-armed collider.
  _disarmBall(ball) {
    // 'gyrePrevImpactScale' is the disarm ledger: _launch always writes the key
    // (null when the authored scale was absent — it must round-trip through
    // clonePlain, which drops undefined-valued keys) and this consumes it. An
    // already-disarmed body — evicted-but-still-marked is the live case — has
    // its authored scale back in place; a second disarm would DELETE it.
    if (!ball.data || !('gyrePrevImpactScale' in ball.data)) return;
    if (ball.physicsBody && ball.physicsBody !== false) {
      if (ball.data.gyrePrevImpactScale != null) ball.physicsBody.impactDamageScale = ball.data.gyrePrevImpactScale;
      else delete ball.physicsBody.impactDamageScale;
      const rev = Number(ball.physicsBody.revision);
      ball.physicsBody.revision = (Number.isFinite(rev) ? Math.max(0, Math.trunc(rev)) : 0) + 1;
    }
    delete ball.data.gyrePrevImpactScale;
    if (this.helpers && typeof this.helpers.markEntityVisualChanged === 'function') this.helpers.markEntityVisualChanged(ball);
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
        // simTime survives save:load — the stashed authored deadlines are still on
        // the SAME timeline, so a mid-hold-saved timed body resumes its authored
        // life on continue instead of becoming immortal debris. (Both channels
        // round-trip: an absent authored deadline restores absent.)
        this._restoreLifetime(e);
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
        // Skip a ball whose deadline a foreign adopter already stripped before
        // the save: it is guaranteed to hit the hand-back lane (which clears
        // provenance) on the very next tick, so stamping would only open a
        // one-tick window where a foreign-owned body carries restored lash
        // credit — collisionConsequences updates before this system.
        if (meta && this.state && e.data.despawnAt != null) {
          const rec = recordImpulseProvenance(e, {
            actorId: meta.actorId, weaponId: meta.weaponId, tag: meta.tag,
            appliedTick: this.state.tick | 0, magnitude: meta.magnitude,
          });
          if (rec && Number.isFinite(meta.holdUntilSim) && Number.isFinite(this.state.simTime)) {
            const rem = Math.max(0, meta.holdUntilSim - this.state.simTime);
            // holdUntilSim is the ball's despawnAt — ~½ s tighter than a live launch's
            // launchProvenanceHoldS window. Deliberate: a dead ball can't kill, so the
            // flight bound is the honest outer envelope for the re-stamped hold.
            holdImpulseProvenance(e, (this.state.tick | 0) + Math.round(rem * TICKS_PER_S), this.state.tick | 0);
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
  // Promote the freshest surviving watched ball into the primary lane — same
  // rehydration the boundary adoption uses: entityMass + the meta's frozen
  // member ledger so the overlay/ribbon/×N read survives the retire.
  // Scored by despawnAt like the boundary sweep (adoptScore): the watch list's
  // push order is launch order at home but map-iteration order after a reload —
  // the latest deadline is the youngest flight either way.
  _promoteNextBall(rt, state, pub) {
    if (!rt || !state || !state.entities) return;
    let best = null;
    let bestScore = -Infinity;
    for (let wi = rt.ballIds.length - 1; wi >= 0; wi--) {
      const wid = rt.ballIds[wi];
      const e = state.entities.get(wid);
      if (!e || e.alive === false || !e.pos || !e.data || !e.data.gyreLaunched) continue;
      const score = Number.isFinite(e.data.despawnAt) ? e.data.despawnAt : -Infinity;
      // A live-but-expired candidate dies inside the same sweep — skip it rather
      // than promote it for one tick (self-correcting, but the flicker reads).
      if (score <= (Number.isFinite(state.simTime) ? state.simTime : -Infinity)) continue;
      if (score > bestScore) { bestScore = score; best = e; }
    }
    if (!best) return;
    const wmeta = best.data.gyreLaunchMeta;
    rt.ballId = best.id;
    rt.launchedId = best.id;
    // Seed the ribbon at the promoted ball's live spot — only when no grave is
    // blooming this tick (a dead primary keeps its last-seen pos for the ring).
    if (pub && !pub.ballGrave) { pub.ballPos.x = best.pos.x; pub.ballPos.z = best.pos.z; }
    rt.ballMass = entityMass(best);
    rt.ballClumpRadius = wmeta && Number.isFinite(wmeta.clumpRadius)
      ? wmeta.clumpRadius : entityRadius(best);
    rt.ballMembers = wmeta && Array.isArray(wmeta.members) ? wmeta.members : null;
    rt.ballAbsorbs = wmeta && Number.isFinite(wmeta.absorbs) ? wmeta.absorbs : 0;
    // The promote tick must publish ONE ball's frame: launchedId/mass/radius/
    // members already describe the survivor — re-seat its ttl + velocity too or
    // the mirror splices the dead primary's countdown/heading onto the new ball
    // for a tick. (ballPos stays last-seen on a grave tick — deliberate above.)
    if (pub) {
      pub.ballVx = finite(best.vel && best.vel.x);
      pub.ballVz = finite(best.vel && best.vel.z);
      pub.ballTtl01 = best.data.despawnAt != null && Number.isFinite(state.simTime)
        ? Math.max(0, Math.min(1, (best.data.despawnAt - state.simTime) / D.ballTtlS)) : 1;
      pub.ballTtlLeftS = best.data.despawnAt != null && Number.isFinite(state.simTime)
        ? Math.max(0, best.data.despawnAt - state.simTime) : 0;
    }
  },

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

  /** A modal screen neutralizes flight input while the verb stays held —
   *  screenStack (any open UI), fulfillmentBlackoutActive (delivery overlay),
   *  input.blocked (foreign neutralize). Shared by the fuse freeze, the dry
   *  edge, and the suck-merge gate. */
  _modalHeld(state) {
    return !!(state.ui && state.ui.screenStack && state.ui.screenStack.length)
      || !!(state.ui && state.ui.fulfillmentBlackoutActive)
      || !!(state.input && state.input.blocked);
  },

  _cap(player) {
    // Same Number.isFinite guard as _spendCap — a NaN cap would silently deaden
    // the activate check (never >= min, never <= 0 dry).
    return (typeof player.cap === 'number' && Number.isFinite(player.cap)) ? player.cap
      : (player.data && player.data.derived && player.data.derived.cap) || 0;
  },

  // HOLD drain scales with clump mass — shared between the fuse countdown
  // (_publish) and the actual cap drain (update) so a retune can't desync the
  // displayed seconds-left from the real burn.
  _holdDrainMult(rt) {
    return rt && rt.phase === PHASE.HOLD
      ? D.capHoldMult * (1 + Math.min(rt.clumpMass / D.capMassDrainRef, D.capMassDrainMax))
      : 1;
  },

  _spendCap(player, amount) {
    // Write ONLY e.cap — the weapons convention (weapons.js): data.derived is refreshed
    // wholesale by ships.js each tick, so spending there is both a single-writer
    // violation and a silent refund. When the direct field is absent, seed it from the
    // derived read once and spend from the seed.
    const derived = player.data && player.data.derived;
    // isFinite on BOTH channels: `typeof === 'number'` passes NaN through, and a
    // NaN seed would write NaN onto e.cap — every later _cap read would fall
    // through to the derived channel forever.
    const cur = (typeof player.cap === 'number' && Number.isFinite(player.cap))
      ? player.cap
      : (derived && Number.isFinite(derived.cap) ? derived.cap : 0);
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
    this._rt.beamWake = Math.min(0.15, this._rt.beamWake + dt); // saturates at the
    // ramp's end — every reader clamps vs 0.15, so an unbounded counter in a long
    // hold is dead bookkeeping.
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
        this._rt.tooHeavyLane = 'basin'; // the voice speaks where the refusal happened
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
          // them — eased toward the held core's revolution direction via swirlBlend:
          // the funnel stirs the way the clump circles, and a −1-rolling snag re-stirs
          // the spiral smoothly instead of reversing it mid-feed.
          ax += (dz / distMaw) * D.mawSwirlAccel * this._rt.swirlBlend * couple;
          az -= (dx / distMaw) * D.mawSwirlAccel * this._rt.swirlBlend * couple;
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
          // The funnel's promise is "matter spirals in" everywhere the glass
          // reaches — the courtesy lane corkscrews at the suck lane's share
          // (keyed to swirlBlend like the basin) instead of ray-dragging
          // straight while the motes around it twist.
          ax += (dz / distMaw) * wedge * D.wedgeSwirlFrac * this._rt.swirlBlend;
          az -= (dx / distMaw) * wedge * D.wedgeSwirlFrac * this._rt.swirlBlend;
        }
      }
      // The gravity-pull glow rides the same ledger the count does — a faint
      // brighten on each body being dragged so "increases gravity" reads on the
      // victim itself, not just the funnel. Bounded so the mirror stays small, and
      // gated on a real pull: a body at the wedge's dead lip isn't being dragged,
      // so it must not fake a glow.
      if (pullK > 0.05 && this._spotScratch.length < D.basinSpotMax * 4) {
        this._spotScratch.push({ x: e.pos.x, z: e.pos.z, r: entityRadius(e), k: pullK, abs: absorbable });
      }
      // Loot in tow: non-absorbable dynamics the beam drags but never eats — the HUD
      // can answer "why won't it snag?" with TOWING N instead of bare SEARCHING.
      // Projectiles excluded: fire streaking through the wedge gets the point-defense
      // tug, but a bullet isn't "loot in tow" — it would fake the retrievable count.
      if (!absorbable && admission !== 'too-heavy' && e.type !== 'projectile' && pullK > 0.05) this._rt.towCount += 1;
      // The gravity edge moves at the cone's own projection speed: the glass
      // takes ~150 ms to reach the maw, so the pull eases in over the same ramp
      // — a parked body no longer starts sliding before the cone visibly arrives.
      const wake = Math.min(1, this._rt.beamWake / 0.15);
      this._queueAccel(e, ax * wake, az * wake, mass, dt, state);
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
    // Same edge-agreement rule the pull lane rides: the glass projects over
    // ~150 ms (beamWake/0.15) — a body already parked at the dead lip must not
    // core on frame 1, before the funnel exists. The catch is the verb's
    // biggest early beat; it fires once the drawn edge is ~70% there.
    if (Math.min(1, this._rt.beamWake / 0.15) < 0.7) return false;
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
    rt.fuseCueLatched = false; // the latch's contract is 'once per hold' — a warn spent
                             // searching must not silence the hold it was actually for
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
    // The integrated phase starts at the seed — the slot sits on the circle at the
    // seeded angle on tick one, then revolves as the angle advances per hold tick.
    rt.orbitAngle = rt.orbitSeed;
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
    // Acknowledged foreign-field ride: `ttl` belongs to the lifetime sweep, outside
    // the declared data.* namespace — stashed and restored symmetrically on both
    // the drop and the future-only hand-back so the sweep's own contract resumes.
    best.ttl = Infinity;
    if (this.helpers && typeof this.helpers.markEntityVisualChanged === 'function') this.helpers.markEntityVisualChanged(best);
    if (this.bus) {
      this.bus.emit(GYRE_EVENTS.snagged, {
        id: best.id, coreId: best.id, type: best.type, mass: rt.clumpMass, radius: rt.clumpRadius,
        tick: state.tick,
      });
      // Mass-graded snag voice: a pebble cracks bright, a rock the size of a
      // building thumps — same convention as the launch cue below. The grip
      // shake grades by mass too — coring a wreck lands heavier than a pebble.
      this.bus.emit('audio:cue', {
        // /2000 keeps the pitch drop grading past mid-tier snags — /500 saturated
        // at 150t so coring a big wreck sang identically to a mid rock.
        id: 'gyre_snare_snag', rate: 1.08 - Math.min(0.45, rt.clumpMass / 2000),
        position: { x: best.pos.x, z: best.pos.z },
      });
      // /200 grades against a realistic snag mass, not the 2400t cap — a ~40t
      // pebble lands ~0.12 and a 200t wreck the full 0.20; versus maxClumpMass
      // every real snag was a flat ~0.10 and the differentiation was dead code.
      this.bus.emit('camera:shake', { amount: 0.10 + 0.10 * Math.min(1, rt.clumpMass / 200) });
    }
    return true;
  },

  /** Hold phase: orbit the core around the maw; suck absorbables onto the clump. */
  _holdPass(dt, state, player, maw, nose) {
    const rt = this._rt;
    const core = state.entities ? state.entities.get(rt.coreId) : null;
    if (!core || core.alive === false || !core.pos) { this._drop('core_lost'); return; }
    if (hasProtectedContent(core)) { this._releaseProtectedCore(core); return; }
    const t = Number.isFinite(state.simTime) ? state.simTime : state.tick / 60;

    // Strain break first: something violent flung the ball too far off the maw — the beam slips.
    // Checking before the spring queue keeps a freed core from eating one last pull.
    const coreDistMaw = Math.hypot(core.pos.x - maw.x, core.pos.z - maw.z);
    if (coreDistMaw > D.holdBreakDist) { this._drop('strained'); return; }

    // Orbit slot: revolves around the maw, breathes in/out — "loosely floating in zero G".
    const orbitBaseR = Math.max(D.orbitRadiusMin, rt.clumpRadius * D.orbitRadiusScale);
    const orbitR = orbitBaseR
      // Lift scales with the revolve radius (capped 2x): a fixed 3.5 wu bob
      // reads as breathing on a pebble but goes invisible on a capped moon
      // orbiting at ~72 wu — the loose float must not go rigid at the climax.
      + Math.sin(t * D.orbitLiftRate + rt.orbitSeed)
        * D.orbitLiftWu * Math.min(2, orbitBaseR / D.orbitRadiusMin);
    const orbitRateEff = this._orbitRate(rt);
    // Integrated phase, not rate × absolute t: orbitRateEff derates as the clump
    // grows (orbitRatePonderR), and a rate change against absolute time would
    // teleport the slot by simTime·Δrate — a spring lurch plus a holdLag spike
    // that could false-fire the strain warn on routine mid-arc absorbs.
    rt.orbitAngle += rt.orbitDir * orbitRateEff * dt;
    const angle = rt.orbitAngle
      + Math.sin(t * D.orbitWobbleRate + rt.orbitSeed) * D.orbitWobbleRad;
    const tx = maw.x + Math.cos(angle) * orbitR;
    const tz = maw.z + Math.sin(angle) * orbitR;
    // The spring's residual error — how far the clump rides off its slot. Zero at a
    // calm float, grows while a fast-moving ship drags the ball behind: the milder
    // "lashing" read strain01 folds in at publish (capped below the tear band).
    rt.holdLag = Math.hypot(tx - core.pos.x, tz - core.pos.z);
    // The funnel's stir chases the ball's real revolution over ~0.5 s for a full
    // sign flip (dt·4 across a range of 2) — a snag rolling -1 re-stirs the
    // vortex smoothly instead of flipping it mid-feed.
    rt.swirlBlend += clamp(rt.orbitDir - rt.swirlBlend, -dt * 4, dt * 4);

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
    // floating-rubble drift instead of winding up open-loop on a long hold. The
    // target escalates with strain: a clump about to tear visibly spins up
    // instead of floating serenely through its own death throe.
    const spinErr = D.tumbleTargetRadS * (1 + this._ensurePub(state).strain01) - finite(core.angVel);
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
    // The clump's merge is the one irreversible sim mutation — a wreck eaten
    // behind a modal screen can't be unseen, so only _absorb freezes with the
    // fuse. The tug/pull lanes keep running: movement is reversible, the annulus
    // keeps its gravity (no dead zone under blocked/blackout — the sim still
    // ticks there), and suckCount stays honest for the funnel read.
    this._suckPass(dt, state, player, core, rt, this._modalHeld(state));
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

  /** Ponderous heavy: revolve rate falls off past orbitRatePonderR — a capped
   * 60 wu moon lumbers at ~0.26 rad/s (the 0.3 floor × orbitRate ≈ 25 s/orbit)
   * instead of whipping tangentially faster than a pebble. The floor exists
   * because unfloored that falloff was ~0.2 rad/s — an ~31 s orbit that reads
   * frozen at the fantasy's climax. */
  _orbitRate(rt) {
    return D.orbitRate
      * Math.max(0.3, Math.min(1, D.orbitRatePonderR / Math.max(1, rt.clumpRadius)));
  },

  /** The clump's own gravity well: it widens with the payload but stays bounded —
   * a capped katamari out-reaches the beam's basin deliberately, never ~2× past it.
   * The floor band shrinks on a fresh snag: suckBandWidth 88 alone already
   * out-reaches basinRadius 86, so the "appetite widens with mass" arc had no
   * headroom at the small end — min(88, 50 + r·rise) keeps a pebble's reach honest.
   * The two growth slopes are tuned so the 129 wu cap lands at maxClumpRadius
   * exactly — the appetite ring keeps widening for the WHOLE katamari arc
   * instead of going flat halfway through it. */
  _suckRadius(rt) {
    return Math.min(D.basinRadius * 1.5,
      rt.clumpRadius * (1 + D.suckBandMassGain)
      + Math.min(D.suckBandWidth, D.suckBandFloor + rt.clumpRadius * D.suckBandFloorRise));
  },

  /** Drag absorbables onto the clump and merge the ones that touch. */
  _suckPass(dt, state, player, core, rt, modal = false) {
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
        if (remainingMass > 0) { rt.tooHeavyCount += 1; rt.tooHeavyLane = 'suck'; }
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
          // Tugged mass inside the annulus glows at its discounted share too —
          // abs:false: courtesy tows can never be caught, so they never get the hot seat.
          if (this._spotScratch.length < D.basinSpotMax * 4) {
            this._spotScratch.push({ x: e.pos.x, z: e.pos.z, r: er, k: tugK, abs: false });
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
        // The merge is the one irreversible lane — it freezes under a live modal
        // (a wreck eaten behind a screen can't be unseen); the meal rests at
        // contact and lands on the first visible tick.
        if (!modal) this._absorb(state, rt, core, e, dx, dz, dist);
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
        // The last stretch corkscrews, not ray-shoots: the funnel's own swirl
        // language and the basin's mawSwirlAccel both promise a spiral-in, so the
        // radial pull gets a tangential share keyed to the eased stir — a meal
        // visibly whips around the katamari once on the way in.
        ax += (-dz / dist) * pull * D.suckSwirlFrac * rt.swirlBlend;
        az += (dx / dist) * pull * D.suckSwirlFrac * rt.swirlBlend;
        // Gentle frame damping so incoming mass settles onto the ball instead of orbiting it.
        ax -= (finite(e.vel && e.vel.x) - shipVx) * D.suckDamping;
        az -= (finite(e.vel && e.vel.z) - shipVz) * D.suckDamping;
        this._queueAccel(e, ax, az, mass, dt, state);
        // The last stretch of the feed glows like a basin victim: pre-stage the spot
        // into the pull lane's scratch (_suckPass runs before _pullPass in HOLD) so a
        // spiraling meal competes for the 8 glow slots by the same k ordering.
        if (couple > 0.05 && this._spotScratch.length < D.basinSpotMax * 4) {
          // 1.25x boost keys on couple (mass response) — then folds in distance:
          // (1 + 1−dist/suckR) doubles the weight at the skin vs the annulus lip,
          // so the meal about to be eaten outranks a heavier body still crossing
          // the band for the hot seat instead of losing on raw response alone.
          this._spotScratch.push({ x: e.pos.x, z: e.pos.z, r: er,
            k: Math.min(1, couple * 1.25 * (1 + Math.max(0, 1 - dist / Math.max(1, suckR)))),
            abs: true });
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
    const nx = dist > 1e-4 ? -dx / dist : 0;
    const nz = dist > 1e-4 ? -dz / dist : 0;
    // The gulp direction rides its own unbounded channel — the member ledger caps
    // out and would freeze the dip on the 28th meal while absorbs keep landing.
    rt.absorbDir.x = nx; rt.absorbDir.z = nz;
    rt.absorbRadius = er; // meal size — the gulp kicks scale with what was swallowed
    // Katamari knock: the ball physically flinches off the meal's approach — a
    // mass-scaled shove so a wreck visibly rocks the tether (a pebble is a tap,
    // and a heavier ball shrugs more since Δv = impulse/mass). The hold spring
    // recovers it in ~half a second — a rock, never a displacement.
    if (dist > 1e-4) {
      // Mass-proportional impulse alone shrugs to nothing at the fantasy's
      // climax (40 t into 2400 t ≈ 0.05 wu/s) — a Δv floor keeps big meals
      // felt on big balls without touching the pebble branch.
      // Speed-graded: a 200 wu/s inbound wreck should rock the tether harder
      // than a drifter — closing speed along the approach axis, clamped so a
      // railgun-fast meal can't detonate the hold spring (≤2.5× the authored).
      const relX = finite(e.vel && e.vel.x) - finite(core.vel && core.vel.x);
      const relZ = finite(e.vel && e.vel.z) - finite(core.vel && core.vel.z);
      const closing = Math.max(0, relX * (dx / dist) + relZ * (dz / dist));
      const speedK = 1 + Math.min(1.5, closing / Math.max(1, D.absorbKnockSpeedRef));
      const knock = Math.max(em * D.absorbKnockPerMass, entityMass(core) * D.absorbKnockFloor) * speedK;
      queuePhysicsImpulse(core,
        { x: (dx / dist) * knock,
          y: 0,
          z: (dz / dist) * knock },
        this._evidence(state.tick));
    }
    if (rt.members.length < D.maxAbsorbRecords) {
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
        id: e.id, coreId: core.id, victimId: e.id, victimType: e.type, mass: em,
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
        // pebble ticks high, a wreck thuds low. And the whole arc creeps upward with the
        // GROWTH CURVE (mass fraction, not meal count) — a capped moon's 40th meal still
        // escalates while a pebble pile can't fake hunger at count 20.
        this.bus.emit('audio:cue', {
          id: 'gyre_snare_absorb', gain: 0.7,
          rate: 1.15 - Math.min(0.5, em / 160)
            + 0.3 * Math.pow(Math.min(1, rt.clumpMass / D.maxClumpMass), 0.75),
          // The meal swallows where the clump IS — off-axis meals play off-axis
          // like every other body-scoped gyre voice (snag/windup/launch/death).
          position: { x: core.pos.x, z: core.pos.z },
        });
        // The haptic ride shares the gate: a dense belt feed would otherwise hold the
        // pad in a continuous buzz exactly where the audio designers decided it should
        // stay a discrete tick. gyre:absorbed still fires per-meal for HUD honesty.
        this.bus.emit(GYRE_EVENTS.absorbTick, { id: core.id, coreId: core.id, mass: em, clumpMass: rt.clumpMass, tick: state.tick });
      }
      // Escalation reaches the camera too — swallowing a wreck should feel physically
      // different from swallowing a pebble: heavy meals shake, mid meals get a
      // micro-shake (30-80t is the most common satisfying meal — it shouldn't be silent),
      // light meals whisper (10-30t gets every other channel — camera joins at 0.01),
      // and belt gravel stays quiet.
      if (em >= 10) this.bus.emit('camera:shake', { amount: em >= 80 ? 0.04 : em >= 30 ? 0.02 : 0.01 });
      // Saturation beat: the absorb that first crosses the cap gets its own voice so
      // the FULL moment lands through the ear, not just the HUD flag.
      if (rt.clumpMass >= D.maxClumpMass && !rt.fullCueLatched) {
        rt.fullCueLatched = true;
        this.bus.emit('audio:cue', { id: 'gyre_snare_full', gain: 0.8 });
        // The escalation arc's ceiling beat reaches the hands too — every other
        // latch pulses the pad (absorb even lerps with mass); FULL completes it.
        this.bus.emit(GYRE_EVENTS.full, {
          id: core.id, coreId: core.id, playerId: state.playerId || null,
          mass: rt.clumpMass, tick: state.tick,
        });
      }
    }
    return true;
  },

  _releaseProtectedCore(core) {
    // A cargo/quest owner can adopt a formerly empty core while it is held. Preserve
    // that owner's current deadlines instead of restoring the pre-snag stash over them.
    delete core.data.gyreCore;
    this._restoreLifetime(core, true);
    if (this.helpers && typeof this.helpers.markEntityVisualChanged === 'function') this.helpers.markEntityVisualChanged(core);
    // Involuntary losses narrate themselves (cap_dry/strained/drained all toast or
    // voice) — the quietest path in the file shouldn't be the one where someone
    // else's cargo simply de-rezzes mid-hold.
    if (this.bus) this.bus.emit('toast', { kind: 'warn', text: 'Gyre Snare — clump reclaimed', ttl: 1.6 });
    this._drop('core_adopted');
  },

  /** Release: bowl the clump along the nose. */
  _launch(state, player) {
    const rt = this._rt;
    const core = rt.coreId != null && state.entities ? state.entities.get(rt.coreId) : null;
    if (!player || !core || core.alive === false || !core.pos) {
      this._drop(!player ? 'player_lost' : 'launch_without_core');
      return;
    }
    if (hasProtectedContent(core)) { this._releaseProtectedCore(core); return; }
    const dir = this._launchDirObj || (this._launchDirObj = { x: 1, z: 0 });
    this._noseDir(player, dir);
    rt.phase = PHASE.LAUNCH;
    rt.launchLeft = D.launchTicks;
    // The heave grades by payload like the pull distance already does: a capped
    // moon takes the longer bow (+3 ticks ≈ 150 ms) while a pebble keeps the
    // snappy ~100 ms draw — the fantasy's biggest throw visibly loads.
    rt.launchWindupTotal = D.launchWindupTicks
      + Math.round(D.launchWindupTicksMass * Math.min(1, rt.clumpMass / D.maxClumpMass));
    rt.launchWindup = rt.launchWindupTotal;
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
    // basinSpots deliberately rides through LAUNCH: the victims are still real
    // free bodies at their last-dragged spots, and the presentation fades the
    // pull glows on (1 - launchWindup01) — "the well collapsing into the throw".
    // An instant clear here popped them ~11 ticks before the launched close
    // ramp even started. _finishLaunch's ledger reset owns the real clear.
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
      // leaving the entity un-damped (or keeping the weapon scale) forever. ?? null:
      // clonePlain/JSON drops undefined-valued keys — a serialized ball would load
      // armed but ledger-less, and _disarmBall's 'in' gate would early-return on it
      // forever (a permanently-armed collider). null round-trips; ?? preserves an
      // authored 0 (0 ?? null === 0).
      core.data.gyrePrevImpactScale = core.physicsBody.impactDamageScale ?? null;
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
    holdImpulseProvenance(core, (state.tick | 0) + Math.round(D.launchProvenanceHoldS * TICKS_PER_S), state.tick | 0);
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
    if (this.helpers && typeof this.helpers.markEntityVisualChanged === 'function') this.helpers.markEntityVisualChanged(core);
    if (this.bus) {
      this.bus.emit(GYRE_EVENTS.launched, {
        id: core.id, coreId: core.id, mass: rt.clumpMass, radius: rt.clumpRadius,
        // The honest speed at the release edge is launchSpeedEff (post-mass-penalty);
        // carry isn't known until the burst, so the authored floor would lie.
        speed: rt.launchSpeedEff, dir: { x: dir.x, z: dir.z }, members: rt.members.length,
        // members is the bounded VFX-ledger count (≤28) — the honest absorb total
        // rides beside it so consumers don't silently under-report past the cap.
        absorbs: rt.totalAbsorbed,
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
    rt.absorbDir.x = 0; rt.absorbDir.z = 0; rt.absorbRadius = 0;
    rt.launchWindup = 0;
    rt.launchWindupTotal = 0;
    rt.launchCarry = 0;   // consumed by the burst — the launch ledger dies with its phase
    rt.launchFwd = 0;
    rt.launchSpeedEff = 0;
    rt.launchDir.x = 1; rt.launchDir.z = 0; // drop-path symmetry — a clean bowl leaves no stale aim
    // The beam ended in a THROW, not a release or a tear — a previous lash's 'strained'
    // must not dress a clean bowl's close ramp as a slip.
    rt.dropReason = 'launched';
    rt.fuseCueLatched = false;
    rt.strainCueNextTick = 0; // ledger symmetry with _drop — dead data, nothing stale survives
    rt.tornTrack = null;      // a completed bowl ends the previous torn body's follow,
                            // same as _drop — its rubble chase must not ride into the
                            // next hold
    rt.beamWake = 0;
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
    rt.orbitAngle = 0;
    rt.orbitDir = 1;
    rt.swirlBlend = 1;
    rt.lastAbsorbCueS = -1e9;
    rt.strainCueLatched = false;
    rt.fullCueLatched = false;
    rt.basinCatchLatched = false;
    rt.tooHeavyLatched = false;
    rt.tooHeavyLane = null;
    rt.catchTickPeak = 0;         // drop/finishLaunch reset symmetry — the ratchet
    // dies with the funnel: _publish's latch clear covers non-BEAM ticks anyway
    rt.prevBasinN = 0; rt.prevSuckN = 0; // and the prev-count ledgers — a re-beam
    // after a completed bowl must not diff its first counts off the thrown beam's tail
    rt.launchedId = null;
    // ballId/ballMass deliberately survive: the clump visual keeps riding the thrown mass until it
    // despawns, and the HUD's "ball live" dot reads the same flag.
    if (this.bus) {
      this.bus.emit(GYRE_EVENTS.beamOff, {
        id: (this.state && this.state.playerId) || null,
        playerId: (this.state && this.state.playerId) || null,
        phase: PHASE.LAUNCH, reason: 'launched', tick: this.state && this.state.tick,
      });
    }
  },

  // ── ball watch retire — sim-side work (emits cues, mutates entity data) ──────
  // Deliberately OUT of _publish: the mirror pass must not mutate LIFECYCLE
  // state — a publish that mutates is how a retired primary re-fired its own
  // grave the next tick. (Edge-latched emit bookkeeping — basinCatchLatched,
  // tooHeavyLatched, catchTickPeak, prevBasinN/prevSuckN, the cue latches —
  // still writes rt inside _publish by design: those gate the emits' own
  // edges, ride published values, and mutate nothing any other lane reads.)
  // Runs in update() immediately before the mirror write.
  _sweepBallWatch(state) {
    const rt = this._rt;
    if (!rt || !state) return;
    // Lazily create the mirror like _publish — the retire pass below is SIM-SIDE
    // (unwatch + disarm + meta shed) and must not depend on a presentation mirror
    // existing first. "unwatched ⇒ disarmed" runs on the very first tick.
    const pub = this._ensurePub(state);
    // The torn-core follow window counts down HERE — _publish only reads the
    // track, so sim bookkeeping stays out of the read-only publish pass. The
    // dead-entity clear lives here too: an expired corpse ends the follow on
    // the same tick the countdown would have anyway.
    if (rt.tornTrack) {
      const torn = state.entities ? state.entities.get(rt.tornTrack.id) : null;
      if ((rt.tornTrack.ticks -= 1) <= 0 || !torn || torn.alive === false || !torn.pos) rt.tornTrack = null;
    }
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
            const bdf = Math.min(1, entityMass(e) / D.maxClumpMass);
            this.bus.emit('audio:cue', {
              id: 'gyre_snare_ball_death',
              // Mass-graded like the launch voice — a pebble's shatter cracks
              // bright, a capped moon's bowls out low and heavy.
              gain: 0.45 + 0.3 * bdf, rate: 1.1 - 0.35 * bdf,
              position: { x: e.pos.x, z: e.pos.z },
            });
            this.bus.emit(GYRE_EVENTS.ballGrave, { id: e.id, tick: state && state.tick });
          }
          // Ring for the HUD mirror too: a retired non-primary ball still deserves a
          // visual grave — the lane's quiet-TTL shatter was audio-only. The id
          // rides along so the secondary overlay can tell a real death from an
          // adoption (which never publishes a grave — the body lives on).
          const meta = e.data.gyreLaunchMeta;
          pub.graves.push({
            id: e.id,
            x: e.pos.x, z: e.pos.z,
            // Symmetry with the balls[] lane (:1843): a pre-meta serialized ball
            // rings at its real collider size, not the 6 wu floor.
            r: meta && Number.isFinite(meta.clumpRadius) ? meta.clumpRadius : entityRadius(e),
          });
          // unwatched ⇒ disarmed — same invariant the overflow/adoption paths keep:
          // the payload never outlives the watch, even when the body dies this step.
          // The credit shadow sheds too: it rides the mark only while the ball can
          // still ACT — a deadline-passed body's kills are already settled.
          this._disarmBall(e);
          clearImpulseProvenance(e);
          delete e.data.gyreLaunchMeta;
          // The mark sheds too: the lifetime sweep should kill this body in the same
          // step, but if the skip path ever lets it live (unready index, a future
          // absorbable type) a marked unwatched body is pull/snag/suck-immune forever.
          delete e.data.gyreLaunched;
          if (rt.launchedId === rt.ballIds[i]) rt.launchedId = null;
          rt.ballIds.splice(i, 1);
          continue;
        }
        if (!e || e.alive === false || !e.data || !e.data.gyreLaunched || !e.pos
          || e.data.despawnAt == null) {
          // A marked non-primary that DIED in flight rings at its grave — the
          // primary gets the same on any death (pub.ballGrave below), and it
          // lives in this list too, so skip it or the ring blooms twice. Only
          // while the mark still owns the body: an adopter's stripped corpse
          // narrates for its new owner (the asymmetry documented below).
          if (e && e.alive === false && e.pos && e.data && e.data.gyreLaunched
            && rt.ballIds[i] !== rt.ballId) {
            const gMeta = e.data.gyreLaunchMeta;
            pub.graves.push({
              id: e.id,
              x: e.pos.x, z: e.pos.z,
              r: gMeta && Number.isFinite(gMeta.clumpRadius) ? gMeta.clumpRadius : entityRadius(e),
            });
          }
          if (e && e.alive !== false && e.data && e.data.gyreLaunched && e.data.despawnAt == null) {
            this._handBack(e);
          } else if (e && e.alive !== false && e.data && e.data.gyreLaunched) {
            // Live + marked + still-deadlined, spliced on a lane other than adoption
            // (e.g. missing pos): unwatched ⇒ disarmed, same as every exit path.
            this._disarmBall(e);
          } else if (e && e.data) {
            if (e.alive !== false) {
              // Live body whose mark vanished while its deadline survived (a foreign
              // adopter that kept despawnAt — documented ones strip it and get the
              // _handBack lane): same unwatched ⇒ disarmed contract — the weapon
              // scale and the lifetime stash shed with the marks, not just the keys.
              this._disarmBall(e);
              delete e.data.gyrePrevDespawnAt;
              delete e.data.gyrePrevTtl;
              // Credit rides only while our stamped deadline still owns the body —
              // an adopter that stripped despawnAt WITH the mark takes the kills.
              if (e.data.despawnAt == null) clearImpulseProvenance(e);
              // DELIBERATE asymmetry with the quiet-TTL grave lane: narration
              // follows the WATCH ledger (this splice ends it) while credit
              // follows the stamp. An unmarked body that later dies on our
              // deadline gets no shatter/grave ring — its remaining flight
              // belonged to whoever stripped the mark.
            }
            // Corpse or live, the shadow ledger is dead — shed BOTH marks so a dead
            // corpse can't re-stamp credit post-load or resurrect as a pull-immune ball.
            delete e.data.gyreLaunchMeta;
            delete e.data.gyreLaunched;
          }
          if (rt.launchedId === rt.ballIds[i]) rt.launchedId = null;
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
          const bdf = Math.min(1, entityMass(ball) / D.maxClumpMass);
          this.bus.emit('audio:cue', {
            id: 'gyre_snare_ball_death',
            // Mass-graded like the launch voice — a pebble's shatter cracks
            // bright, a capped moon's bowls out low and heavy.
            gain: 0.45 + 0.3 * bdf, rate: 1.1 - 0.35 * bdf,
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
        } else if (ball && ball.data) {
          // Every other retirement still sheds the shadow ledger — the primary
          // lane can't leak what the sibling splice lane strips above: a serialized
          // corpse would re-watch + re-stamp credit post-load, and a live unmarked
          // adoptee can't keep the armed scale, lifetime stash, meta or credit.
          // stillOurs: while the id sat in ballIds the splice lane ran this shed
          // FIRST — its work left nothing behind, and re-disarming would delete
          // (not restore) the just-restored authored scale. An UNWATCHED body
          // (evicted primary, boundary residue) still carries the keys.
          const stillOurs = 'gyrePrevImpactScale' in ball.data
            || 'gyreLaunchMeta' in ball.data
            || 'gyrePrevDespawnAt' in ball.data
            || 'gyrePrevTtl' in ball.data;
          if (ball.alive !== false && stillOurs) {
            this._disarmBall(ball);
            delete ball.data.gyrePrevDespawnAt;
            delete ball.data.gyrePrevTtl;
            // Credit rides only while our stamped deadline still owns the body —
            // an adopter that stripped despawnAt WITH the mark takes the kills.
            if (ball.data.despawnAt == null) clearImpulseProvenance(ball);
          }
          // Corpse or live, the shadow ledger is dead — shed BOTH marks so a dead
          // body can't re-stamp credit post-load or resurrect pull-immune.
          delete ball.data.gyreLaunchMeta;
          delete ball.data.gyreLaunched;
        }
        const retiredId = rt.ballId;
        this._unwatchBall(retiredId);
        rt.ballId = null;
        rt.launchedId = null; // don't leave a stale entity reference on the retired id
        rt.ballMass = 0;
        rt.ballMembers = null;
        rt.ballClumpRadius = 0;
        rt.ballAbsorbs = 0;
        // Promote the freshest surviving watch — with two katamari in flight the
        // younger one keeps the primary overlay/ribbon/×N ledger instead of the
        // read degrading to the lighter pub.balls[] lane.
        this._promoteNextBall(rt, state, pub);
        // Mirror hygiene parity: ballPos stays last-seen deliberately (the grave
        // ring blooms where it died) but velocity zeroes like ttl/radius — a dead
        // ball has no heading to keep. Only when nothing promoted: a survivor's
        // own vx/vz/ttl were just re-seated inside _promoteNextBall.
        if (rt.launchedId == null) { pub.ballVx = 0; pub.ballVz = 0; }
      } else {
        pub.ballPos.x = ball.pos.x; pub.ballPos.z = ball.pos.z;
        // Live velocity too — the primary ribbon steers by it like the secondaries
        // do: after a ricochet the streak must point where the ball NOW flies, not
        // along the frozen launchDir it left on.
        pub.ballVx = finite(ball.vel && ball.vel.x); pub.ballVz = finite(ball.vel && ball.vel.z);
        pub.ballClumpRadius = rt.ballClumpRadius;
        pub.ballTtl01 = ball.data.despawnAt != null && Number.isFinite(state.simTime)
          ? Math.max(0, Math.min(1, (ball.data.despawnAt - state.simTime) / D.ballTtlS)) : 1;
        // Seconds left in the flight — the HUD's ·Ns countdown rides this so the
        // quiet-TTL grave is telegraphed instead of the ribbon just dimming away.
        pub.ballTtlLeftS = ball.data.despawnAt != null && Number.isFinite(state.simTime)
          ? Math.max(0, ball.data.despawnAt - state.simTime) : 0;
        // TTL-imminent: the lifetime sweep marks the ball dead AND compacts it out of
        // the entity map later this same step — so next tick 'ball' is undefined and the
        // retire below goes silent. Sing the grave HERE, on the last tick the ball is
        // still live: otherwise the authored shatter is unreachable on normal expiry.
        if (ball.data.despawnAt != null && Number.isFinite(state.simTime)
          && state.simTime >= ball.data.despawnAt) {
          if (this.bus) {
            const bdf = Math.min(1, entityMass(ball) / D.maxClumpMass);
            this.bus.emit('audio:cue', {
              id: 'gyre_snare_ball_death',
              gain: 0.45 + 0.3 * bdf, rate: 1.1 - 0.35 * bdf,
              position: { x: ball.pos.x, z: ball.pos.z },
            });
            this.bus.emit(GYRE_EVENTS.ballGrave, { id: ball.id, tick: state && state.tick });
          }
          // The retire itself is a sim mutation — on a bus-less host it must still
          // disarm + shed + unwatch THIS tick instead of deferring to the !ball lane.
          pub.ballGrave = true; // its last live tick — the ring blooms as the body retires
          // unwatched ⇒ disarmed — the non-primary quiet-TTL path keeps this invariant;
          // the primary's gets it too even though the body dies moments later.
          this._disarmBall(ball);
          // The credit shadow sheds with the corpse: it rides the mark only while the
          // ball can still act — a deadline-passed body's kills are already settled.
          clearImpulseProvenance(ball);
          delete ball.data.gyreLaunchMeta;
          // The mark sheds too — the sweep should kill this body in-step, but a
          // survivor must not stay marked: pull/snag/suck-immune debris forever.
          delete ball.data.gyreLaunched;
          this._unwatchBall(rt.ballId);
          rt.ballId = null; rt.launchedId = null; rt.ballMass = 0; rt.ballMembers = null; rt.ballClumpRadius = 0; rt.ballAbsorbs = 0;
          this._promoteNextBall(rt, state, pub); // a younger flight inherits the primary lane
          // Same guard as the dead-ball lane above: zero only when nothing
          // promoted — the survivor's own heading was re-seated inside the call.
          if (rt.launchedId == null) { pub.ballVx = 0; pub.ballVz = 0; }
        }
      }
    }
  },

  // ── presentation mirror (read-only on entity state for render/HUD; runtime-only,
  // never saved — edge-latched emits like audio:cue/gyre:strained/gyre:fuseLow ARE
  // allowed here: they ride published values and mutate nothing a reader can see) ──
  _ensurePub(state) {
    return state.gyreSnare || (state.gyreSnare = {
      phase: PHASE.OFF, nose: { x: 0, z: 0 }, maw: { x: 0, z: 0 },
      coneLen: 0, halfAngleRad: D.coneHalfAngleRad, endRadius: 0,
      coreId: null, clumpMass: 0, clumpRadius: 0, absorbs: 0, maxClumpMass: D.maxClumpMass,
      strain01: 0, corePos: { x: 0, z: 0 }, coreAngVel: 0, launchDir: { x: 1, z: 0 },
      members: null, launchedId: null, ballPos: { x: 0, z: 0 }, ballVx: 0, ballVz: 0, ballMass: 0, ballTtl01: 1,
      ballTtlLeftS: 0,
      basinCount: 0, ballClumpRadius: 0, launchWindup01: 0, launchBurst01: 0, ballGrave: false,
      graves: null, thrownBeat: false, basinSpots: null, dropReason: null, fuseS: 0,
      liveBalls: 0, absorbDir: { x: 0, z: 0 }, absorbR: 0, balls: null,
      tornId: null, tornPos: { x: 0, z: 0 }, tornDir: { x: 0, z: 0 },
      // Published unconditionally at rt's rest values — a reader between
      // init and the first publish tick sees these too, not undefined.
      suckRadius: 0, swirlBlend: 1, orbitSeed: 0,
    });
  },

  _publish(state, player) {
    const rt = this._rt;
    const pub = this._ensurePub(state);
    if (pub.basinSpots === null) pub.basinSpots = [];
    pub.basinSpots.length = 0;
    for (let i = 0; i < rt.basinSpots.length; i++) pub.basinSpots.push(rt.basinSpots[i]);
    pub.phase = rt.phase;
    pub.dropReason = rt.dropReason;
    // Torn-core follow: ~0.5 s of the strain-freed body's live pos so the close
    // ramp can fly the rubble off WITH it. Dead entity / elapsed window -> null.
    if (rt.tornTrack) {
      const torn = state.entities ? state.entities.get(rt.tornTrack.id) : null;
      if (torn && torn.alive !== false && torn.pos && rt.tornTrack.ticks > 0) {
        pub.tornId = rt.tornTrack.id;
        pub.tornPos.x = torn.pos.x; pub.tornPos.z = torn.pos.z;
        if (rt.tornTrack.dir) { pub.tornDir.x = rt.tornTrack.dir.x; pub.tornDir.z = rt.tornTrack.dir.z; }
      } else pub.tornId = null; // dead/expired read — _sweepBallWatch owns the rt clear
    } else pub.tornId = null;
    // The funnel's drawn spiral + the clump's float phase ride the same eased stir /
    // orbit seed the sim uses — a -1 snag re-stirs the GLASS too, not just the pull.
    // Safe unconditionally: _drop/_finishLaunch already reset both to 1/0.
    pub.swirlBlend = rt.swirlBlend;
    pub.orbitSeed = rt.orbitSeed;
    // Burn-only fuse read: seconds of cap left at the CURRENT drain rate — hold drain
    // scales with clump mass, so the bigger the katamari the shorter the fuse. Regen
    // isn't counted, making it the honest worst case; the HUD draws it as a countdown.
    const drainMult = this._holdDrainMult(rt);
    pub.fuseS = (player && rt.phase !== PHASE.OFF)
      ? this._cap(player) / Math.max(0.001, D.capDrainPerS * drainMult) : 0;
    // No-live-ball hygiene: heading zeroes with the rest of the ball channels —
    // covers every exit path (boundary drops bypass the retire lanes above).
    if (rt.ballId == null) { pub.ballTtl01 = 1; pub.ballTtlLeftS = 0; pub.ballClumpRadius = 0; pub.ballVx = 0; pub.ballVz = 0; }
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
      // The primary skips this lane only while it still owns the clump group —
      // either no live core at all, or the thrown ball itself riding its own mark
      // through the coil/burst (rt.coreId stays set until _finishLaunch): self-
      // publishing there double-dressed it in the primary group AND the
      // secondary overlay for ~11 ticks. A new snag mid-flight hands the overlay
      // to the fresh core — only THEN does the displaced ball join this lane.
      if (id === rt.ballId && (rt.coreId == null || rt.coreId === id)) continue;
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
        // Bounded member slice (≤12, the overlay's own lump ceiling) so a second
        // thrown katamari isn't a bare collider — and the radius-graded lump
        // count the presentation computes (4 + r/8) can actually reach ~11 on a
        // capped ball instead of clipping at the old 6-wide slice.
        members: meta && Array.isArray(meta.members) ? meta.members.slice(0, 12) : null,
      });
    }
    bTmp.sort((a, b) => a.ttlS - b.ttlS);
    for (let i = 0; i < bTmp.length && pub.balls.length < D.ballWatchMax; i++) pub.balls.push(bTmp[i]);
    pub.ballMass = rt.ballId != null ? rt.ballMass : 0;
    if (rt.phase === PHASE.OFF) {
      pub.coreId = null; pub.strain01 = 0;
      // OFF zeroes the other transient HOLD channels too — a lagged clump's last
      // drag or spin can't publish forever. corePos DELIBERATELY stays last-seen:
      // the strain-break ring blooms there when the close ramp starts.
      pub.coreAngVel = 0;
      // Same dead-state hygiene for the launch channels: a boundary/dock/death drop
      // landing on the single thrownBeat tick would otherwise latch it for the whole
      // OFF phase, and launchWindup01 pins at 1.0 after every launch.
      pub.thrownBeat = false; pub.launchWindup01 = 0; pub.launchBurst01 = 0;
      // The documented contract is "during HOLD (0 otherwise)" — without the
      // reset the mirror would keep the last annulus radius after a HOLD->OFF
      // close and lie to any reader that doesn't gate on phase itself.
      pub.suckRadius = 0;
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
        pub.absorbR = lm ? finite(lm.radius) : 0;
      } else {
        pub.members = null;
        pub.clumpMass = 0; pub.clumpRadius = 0; pub.absorbs = 0;
        pub.absorbDir.x = 0; pub.absorbDir.z = 0; pub.absorbR = 0;
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
    // Fetched here (not just at the publish below) so the escalation tick can
    // position at the clump's LIVE seat — pub.corePos is one publish stale.
    const core = rt.coreId != null && state.entities ? state.entities.get(rt.coreId) : null;
    // The +N lane deltas feed the escalation ratchet's seat pick inside the bus
    // block — but the prevN ledgers must re-seed EVERY publish tick, bus or not
    // (their field comments promise per-tick re-seed), so they live outside the
    // emit guard.
    const dBasin = rt.basinCount - rt.prevBasinN;
    const dSuck = (rt.phase === PHASE.HOLD ? rt.suckCount : 0) - rt.prevSuckN;
    rt.prevBasinN = rt.basinCount;
    rt.prevSuckN = rt.phase === PHASE.HOLD ? rt.suckCount : 0;
    // First-catch edge: the net going empty -> occupied gets a soft tick so the
    // "xN IN NET" read has ears too — positioned at the maw where the mass
    // actually entered the funnel. HOLD's absorbs have their own voice.
    if (this.bus) {
      const caught = rt.phase === PHASE.BEAM && rt.basinCount > 0;
      if (caught && !rt.basinCatchLatched) {
        rt.basinCatchLatched = true;
        rt.catchTickPeak = rt.basinCount;
        this.bus.emit('audio:cue', {
          id: 'gyre_snare_catch', gain: 0.3, rate: 1.35,
          position: { x: maw.x, z: maw.z },
        });
        // The net's first fill lands in the hands too — a whisper pulse only on
        // this edge; the +N ratchet stays audio-only or a dense belt feed would
        // buzz the pad on every arrival.
        this.bus.emit(GYRE_EVENTS.caught, { id: player.id, tick: state.tick });
      } else if (!caught) rt.basinCatchLatched = false;
      // "It can't eat that": a too-heavy body crossing into the net was the one
      // arrival class with no voice — the catch tick, +N ratchet, absorb gulp,
      // snag bite and deny edges all narrate but an uneatable rock entering the
      // funnel was eyes-only (TOO HEAVY pill + warm class). A hushed descending
      // drop-tail variant on the 0->1 edge closes the why-won't-it-snag
      // channel — latch symmetry with the catch (re-arms when the net empties).
      const heavy = (rt.phase === PHASE.BEAM || rt.phase === PHASE.HOLD) && rt.tooHeavyCount > 0;
      if (heavy && !rt.tooHeavyLatched) {
        rt.tooHeavyLatched = true;
        // "It can't eat that" lands as a let-DOWN — the descending drop-tail
        // contour at whisper gain, not the rising catch tick at low pitch.
        // Position on the lane that counted it: a basin refusal speaks at the
        // maw, an annulus refusal at the clump's live seat (the +N ratchet's
        // own rule — up to ~90 wu apart).
        const heavyAt = rt.tooHeavyLane === 'suck'
          ? (core && core.pos ? core.pos : pub.corePos) : maw;
        this.bus.emit('audio:cue', {
          id: 'gyre_snare_drop', gain: 0.14, rate: 0.9,
          position: { x: heavyAt.x, z: heavyAt.z },
        });
      } else if (!heavy) rt.tooHeavyLatched = false;
      // The appetite has a voice while it builds: the shown +N (basin fold +
      // annulus arrivals during HOLD) used to climb eyes-only. A quieter
      // count-graded re-tick on each new peak lets the funnel stack be heard
      // stacking — the ratchet keys on the SHOWN count so merges (which pull
      // a body out of it) never double-narrate over the absorb's own voice.
      const shownN = (rt.basinCount || 0) + (rt.phase === PHASE.HOLD ? rt.suckCount : 0);
      // Which lane grew? The tick belongs where the arrival happened — a basin
      // arrival speaks at the maw, an annulus arrival at the clump (up to ~90 wu
      // apart — an always-maw tick points the ear at empty space during HOLD).
      // (dBasin/dSuck + the prevN re-seeds hoist above the bus guard so the
      // ledgers re-seed on bus-less hosts too — bookkeeping, not emit-gated.)
      if ((rt.phase === PHASE.BEAM || rt.phase === PHASE.HOLD) && shownN > rt.catchTickPeak) {
        rt.catchTickPeak = shownN;
        const n = Math.min(6, shownN);
        // The lane that grew picks the position — an annulus arrival speaks at
        // the clump's live seat (pub.corePos lags a publish; fall back to it
        // only if the entity lookup itself missed), a basin arrival at the maw.
        const at = dSuck > dBasin ? (core && core.pos ? core.pos : pub.corePos) : maw;
        this.bus.emit('audio:cue', {
          id: 'gyre_snare_catch',
          gain: 0.16 + 0.03 * n,
          rate: 1.3 + 0.05 * n,
          position: { x: at.x, z: at.z },
        });
      }
    }
    pub.coneLen = Math.hypot(maw.x - pub.nose.x, maw.z - pub.nose.z);
    // The drawn rim may over-cover the basin (short apex on a capital hull widens the
    // mouth past the pull zone) but never under-cover it — the cone edge is the physics
    // edge, so the visual radius floors at basinRadius.
    pub.endRadius = Math.max(pub.coneLen * Math.tan(D.coneHalfAngleRad), D.basinRadius);
    pub.coreId = rt.coreId;
    pub.maxClumpMass = D.maxClumpMass;
    // The suck annulus publishes its own drawn radius — the halo reads the sim's
    // formula instead of re-computing it, so a tuning edit can't silently desync
    // the drawn ring from the real pull (same contract as endRadius above). The
    // publish rides through LAUNCH like ballMass/ballClumpRadius: rt.clumpRadius
    // is frozen for the coil+burst, so the annulus keeps its drawn reach and dies
    // on the close fade — zeroing here snapped a capped ball's ring ~129→~60 wu
    // in one frame exactly as the windup collapse began.
    pub.suckRadius = (rt.phase === PHASE.HOLD || rt.phase === PHASE.LAUNCH) && rt.coreId != null ? this._suckRadius(rt) : 0;
    // A re-beam while the thrown ball still flies keeps ITS frozen ledger — opening a fresh
    // search must not strip the old ball's lumps or collapse its eventual death-burst to
    // the 6 wu floor. The live ledger only wins while a new core is held.
    const ridingBall = rt.coreId == null && rt.ballId != null && rt.ballMembers != null;
    pub.clumpMass = ridingBall ? rt.ballMass : rt.clumpMass;
    pub.clumpRadius = ridingBall ? rt.ballClumpRadius : rt.clumpRadius;
    pub.absorbs = ridingBall ? rt.ballAbsorbs : rt.totalAbsorbed;
    // READ-ONLY CONTRACT: members aliases the rt ledger live (no per-tick slice);
    // basinSpots is a stable pub-owned array REFILLED each tick — same entries,
    // different container. Either way consumers read only: a mutation would
    // corrupt the ledger mid-pass.
    pub.members = ridingBall ? rt.ballMembers : rt.members;
    pub.launchDir.x = rt.launchDir.x; pub.launchDir.z = rt.launchDir.z;
    // Progress (not remaining): 0 at the release edge, rising to 1.0 on the throw
    // tick and holding through the burst — a "fully wound" cue keys on the ramp END,
    // which a remaining-fraction ramp could never publish.
    // The denominator is the graded total, not the flat field — a capped moon's
    // longer bow must still ramp 0→1 across its whole coil, not over-hold at 1.
    pub.launchWindup01 = rt.phase === PHASE.LAUNCH
      ? Math.max(0, Math.min(1, 1 - rt.launchWindup / Math.max(1, rt.launchWindupTotal || D.launchWindupTicks))) : 0;
    // Burst progress on its own channel — windup01 pins at 1.0 through the burst
    // (a "fully wound" cue needs the ramp END), so presentation lanes that want
    // to RE-GROW through the throw (the flight ribbon) need the burst clock.
    pub.launchBurst01 = rt.phase === PHASE.LAUNCH && rt.launchWindup <= 0
      ? 1 - rt.launchLeft / D.launchTicks : 0;
    // The exact throw tick — the first burst tick ONLY, the same condition the
    // gyre:thrown emit uses: launchLeft already consumed exactly once. gyre:thrown,
    // the pad thump, camera shake and the Newton kick all land here, so the grave
    // ring blooms on this same tick instead of a frame early off windup01.
    pub.thrownBeat = rt.phase === PHASE.LAUNCH
      && rt.launchLeft === D.launchTicks - 1;
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
        // while the ship drags the clump behind. The ceiling scales with payload —
        // a pebble's lag stays sub-warn, but hauling a capped katamari hard can
        // legitimately reach the 0.4 strain band: the lash IS near tearing there.
        clamp(rt.holdLag / D.holdLagRefWu, 0, 1)
          * (D.holdLagStrainMax
            + D.holdLagStrainMassGain * Math.min(1, rt.clumpMass / D.maxClumpMass)),
      ) : 0;
      // (The normalized smoothed-lag mirror channel was retired — the presentation
      // leans on corePos directly; strain01 above keeps the raw-residual read.)
    } else { pub.strain01 = 0; pub.coreAngVel = 0; }
    // The newest meal's approach direction — the gulp dips toward the side the mass
    // actually hit. Rides rt.absorbDir, not the bounded member ledger: once the
    // ledger caps out the dip must keep updating with every meal, not freeze.
    pub.absorbDir.x = finite(rt.absorbDir.x);
    pub.absorbDir.z = finite(rt.absorbDir.z);
    pub.absorbR = finite(rt.absorbRadius);
    // The capacitor's dying gasp warns the hands/ears ~3 s out — a pad-first player
    // gets no `·Ns` pill read, so the forced bowl must not arrive unattributed.
    // Latched per hold like strain; _drop/_finishLaunch re-arm it for the next lash.
    // BEAM warns too — a dying capacitor force-closes the lash there the same
    // way (cap_dry), and a pad-first player deserves the countdown in the hands
    // before the lash fires itself, not just a HUD ·Ns they never saw coming.
    if ((rt.phase === PHASE.HOLD || rt.phase === PHASE.BEAM)
      && !rt.fuseCueLatched && pub.fuseS > 0 && pub.fuseS < D.fuseLowWarnS) {
      rt.fuseCueLatched = true;
      if (this.bus) {
        this.bus.emit('audio:cue', { id: 'gyre_snare_fuse_low', gain: 0.45 });
        this.bus.emit(GYRE_EVENTS.fuseLow, {
          id: (this.state && this.state.playerId) || null,
          playerId: (this.state && this.state.playerId) || null,
          tick: state && state.tick,
        });
      }
    }
    // Strain gets its own voice on the same hysteresis the HUD uses: the glass tension
    // rises the tick the clump strains, then a softer shimmer sustains every ~0.5 s
    // while the excursion holds — a hard drag can sit in the warn band for seconds
    // and the one-shot rise can't be the whole voice. Latches quiet under 0.25.
    if (rt.phase === PHASE.HOLD && pub.strain01 > 0.4) {
      const tk = state && state.tick;
      if (!rt.strainCueLatched) {
        rt.strainCueLatched = true;
        rt.strainCueNextTick = (Number.isFinite(tk) ? tk : 0) + Math.ceil(0.5 * TICKS_PER_S);
        if (this.bus) this.bus.emit('audio:cue', { id: 'gyre_snare_strain', gain: 0.7 });
        // Strain reaches the hands too — one warning pulse on the latch edge, not a rumble
        // the whole excursion (the sustained voice + HUD carry that).
        // The warn latch shares its name with the terminal drop reason 'strained'
        // (deliberate — one word for the tear at both scopes); gyre:dropped carries
        // it on payload.reason, not the event name, so the channels don't collide.
        if (this.bus) this.bus.emit(GYRE_EVENTS.strained, {
          id: (this.state && this.state.playerId) || null,
          playerId: (this.state && this.state.playerId) || null,
          tick: state && state.tick,
        });
      } else if (Number.isFinite(tk) && tk >= rt.strainCueNextTick) {
        rt.strainCueNextTick = tk + Math.ceil(0.5 * TICKS_PER_S);
        if (this.bus) this.bus.emit('audio:cue', {
          id: 'gyre_snare_strain', gain: 0.3 + 0.3 * pub.strain01, rate: 0.9,
        });
      }
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
    // One state read for the whole tick — the fuse freeze, the dry edge, and the
    // release-edge deferral all read the same modal contract. (screenStack itself
    // suspends every non-keepalive system's update, so its release edge arrives
    // deferred on the first tick the sim runs again — the gate below keeps it armed.)
    const modalHeld = this._modalHeld(state);

    // Verb edges — rising opens the beam; falling bowls the clump (or just closes an empty beam).
    // The wake edge is modal-gated like the release edge: a verb press that can't be
    // seen must not commit cap or open the funnel blind (pad level-reads CAN produce
    // held under input.blocked — keyboard can't). A chord held through the lift still
    // fires on the first visible tick — the same deferred-commit contract as release.
    if (held && !rt.wasHeld && !modalHeld && rt.phase === PHASE.OFF) {
      const cap = this._cap(player);
      if (cap >= D.capActivateMin) {
        rt.phase = PHASE.BEAM;
        rt.beamWake = 0;
        rt.dropReason = null; // a fresh wake forgets why the last lash died
        if (this.bus) {
          this.bus.emit(GYRE_EVENTS.beamOn, { id: player.id, playerId: player.id, tick: state.tick });
          // The lash has its own wake voice now — a soft rising shimmer, distinct from the
          // snag bite that fires when mass actually grips.
          this.bus.emit('audio:cue', { id: 'gyre_snare_beam', gain: 0.55 });
        }
      } else if (this.bus && !rt.dryDenyDone) {
        // A denied wake is still a wake attempt — the refusal needs the same voice
        // every other tool's no-cap edge gets, or the held key reads dead.
        this.bus.emit('toast', { kind: 'warn', text: 'Gyre Snare needs charge to wake', ttl: 1.6 });
        this.bus.emit('audio:cue', { id: 'ui_deny', gain: 0.7 });
        rt.dryDenyDone = true; // the flag's contract is 'denied while held' — every
                             // deny lane sets it, not just the cap_dry close sites
      }
    }
    if (!held) rt.dryDenyDone = false; // a released key re-arms the deny voice
    if (!held && rt.wasHeld && !modalHeld) {
      // Deliberate release bowls a held clump; every other close (beam with no core, mid-launch,
      // or the player gone/docked) is a drop — never a launch from a dock seat or a corpse.
      if (rt.phase === PHASE.HOLD && player) this._launch(state, player);
      else if (rt.phase === PHASE.BEAM && player) this._drop('released');
      // BEAM with no player isn't a release — it falls through to the !player drop
      // below, so the reason reads 'player_lost' instead of a lie.
      // LAUNCH is exempt: the release edge that starts the bowl must not truncate its burst.
      // (Any other close — player gone, docked, dead — lands via the !player drop below.)
    }
    // Under a live modal (blocked/blackout — screenStack suspends the whole tick
    // instead) the edge and its latch both freeze: the throw is the one close the
    // player must see, so a release they can't watch stays armed and lands the
    // first tick the screen lifts — never committed blind.
    if (!modalHeld) rt.wasHeld = held;

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
    // katamari, the shorter the fuse on your hold. LAUNCH keeps draining at 1× —
    // deliberate (pinned by test): the slingshot's energy is the capacitor's own act,
    // so the ~0.18 s coil+burst burns ~1.2 cap as the cost of the throw itself.
    const drainMult = this._holdDrainMult(rt);
    // The fuse freezes while flight input is neutralized (a screen open): the verb
    // stays held through the overlay (massline parity) but the countdown is behind
    // it — draining blind could force a _launch the player literally cannot see.
    const drain = modalHeld ? 0 : D.capDrainPerS * drainMult * dt;
    this._spendCap(player, drain);
    // Same blind-commit rule on the OTHER side of the drain: a foreign system that
    // emptied the tank while the screen was up still can't bowl behind the modal —
    // the dry edge fires on the first tick the player can see.
    const dry = !modalHeld && this._cap(player) <= 0;

    const maw = this._maw(player, this._mawObj || (this._mawObj = { x: 0, z: 0 }));
    const nose = this._noseDir(player, this._noseObj || (this._noseObj = { x: 1, z: 0 }));

    if (rt.phase === PHASE.LAUNCH) {
      // The launch's target is launch-OWNED (rt.coreId), not promote-managed
      // (rt.launchedId): if the throwing ball exits the watch ledger mid-coil
      // via an ALIVE retire — a foreign adopter strips the mark/deadline →
      // _promoteNextBall re-seats launchedId to a survivor — the survivor must
      // NOT inherit the remaining coil spring / burst impulses / carry read /
      // thrown beat / recoil along the dead ball's frozen axis. On divergence
      // (promote or null) core is null → the else truncates → _finishLaunch
      // ends the phase cleanly; the retire lane already shed what adoption took.
      const core = rt.coreId != null && rt.launchedId === rt.coreId && state.entities
        ? state.entities.get(rt.coreId) : null;
      // The coil+burst takes ~11 ticks — the same protected-content contract HOLD
      // and the launch edge enforce must hold HERE too: a pin landing mid-throw
      // means the ball is a mission owner's body now, not our projectile. Hand it
      // back (mark + weapon payload + credit shadow shed, adopter's deadlines kept)
      // and drop — bowling protected cargo can never complete.
      if (core && core.alive !== false && hasProtectedContent(core)) {
        this._handBack(core);
        this._unwatchBall(core.id);
        // Involuntary losses narrate themselves — a pin landing inside the
        // ~11-tick coil/burst is the ONE adoption the player least expects;
        // it shouldn't also be the one that silently eats their throw.
        if (this.bus) this.bus.emit('toast', { kind: 'warn', text: 'Gyre Snare — clump reclaimed', ttl: 1.6 });
        this._drop('core_adopted');
      } else if (core && core.alive !== false && rt.launchWindup > 0) {
        // Wind-up beat: a ~100 ms coil that drags the clump slightly aft of the maw
        // before the burst — the release reads as a slingshot, not an instant shove.
        rt.launchWindup -= 1;
        // The graded total, not the flat field — the crescendo + tick-1 latch
        // must fire on the FIRST coil tick whatever the payload's bow length.
        const windW01 = Math.max(0, 1 - rt.launchWindup / Math.max(1, rt.launchWindupTotal || D.launchWindupTicks));
        if (this.bus && rt.launchWindup === (rt.launchWindupTotal || D.launchWindupTicks) - 1) {
          // First coil tick: the pad rides a low rumble through the draw — the
          // slingshot pull-back is the feel-rich part, and silence undersold it.
          this.bus.emit(GYRE_EVENTS.windup, { id: core.id, mass: rt.ballMass, tick: state.tick });
          // A whisper of camera anticipation on the draw — the pull-back is felt,
          // not only seen/heard. 0.025 is the smallest amount that still reads:
          // it leans the frame into the coil without moving the reticle.
          this.bus.emit('camera:shake', { amount: 0.025 });
        }
        if (this.bus) {
          // The draw CRESCENDOS: a shimmer per coil tick, gain + rate ramping
          // 0→1 into the thrownBeat — the ~100 ms pull-back builds instead of
          // front-loading one shimmer on tick 1. Payload still grades the voice —
          // a capped moon's coil reads heavier in the ear, not just the pull-back.
          const windupFrac = Math.min(1, rt.ballMass / D.maxClumpMass);
          this.bus.emit('audio:cue', {
            id: 'gyre_snare_windup',
            position: { x: core.pos.x, z: core.pos.z },
            gain: (0.4 + 0.3 * windupFrac) * (0.35 + 0.65 * windW01),
            rate: (1.05 - 0.3 * windupFrac) - 0.25 * (1 - windW01),
          });
        }
        // The coil draw-back is absolute 13 wu — ~20% of a capped 60 wu katamari's
        // silhouette, where the bow nearly vanishes. Scale with the payload so a big
        // moon still visibly rocks back before the burst.
        const pullWu = Math.max(D.launchWindupPullWu, rt.clumpRadius * 0.4);
        // Anchor on the FROZEN launch frame the renderer draws (player.pos +
        // launchDir·mawDist), not the live maw — a hard yaw during the ~100 ms
        // coil would drag the clump laterally off the drawn glass axis right
        // before the throw, and the burst fires along launchDir regardless.
        const wx = player.pos.x + rt.launchDir.x * (D.mawDist - pullWu);
        const wz = player.pos.z + rt.launchDir.z * (D.mawDist - pullWu);
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
          rt.launchFwd = fwd;
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
            // Post-carry effective speed — fwd was measured THIS tick, so the thrown
            // speed is honest: launchSpeedEff + positive residual (ship translating
            // into the throw bowls hotter; an aft draw still lands the floor).
            this.bus.emit(GYRE_EVENTS.thrown, {
              id: core.id,
              tick: state && state.tick,
              speed: rt.launchSpeedEff + Math.max(0, rt.launchFwd),
              // Mass too — the pad grades its crack off this, not speed (a capped
              // moon throws SLOWER; speed-lerping would invert the intent).
              mass: rt.ballMass,
            });
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
      // Phase re-checked: the adoption branch above already dropped and reported —
      // _finishLaunch must not crown a thrown-out hand-back with a 'launched' close.
      if (rt.phase === PHASE.LAUNCH && rt.launchWindup <= 0 && rt.launchLeft <= 0) this._finishLaunch(state);
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
      rt.dryDenyDone = true; // the drain toast IS the wake attempt's narration
      this._launch(state, player);
    }
    // An empty beam dying of thirst gets the same attribution: the cone vanishes and
    // the pill goes dark — say why, or the lash reads as self-closing.
    else if (dry && rt.phase === PHASE.BEAM) {
      if (this.bus) this.bus.emit('toast', { kind: 'warn', text: 'Gyre Snare drained — lash off', ttl: 1.6 });
      rt.dryDenyDone = true;
      this._drop('cap_dry');
    }

    this._sweepBallWatch(state);
    this._publish(state, player);
  },
};

export const GYRE_SNARE_PHASES = PHASE;
