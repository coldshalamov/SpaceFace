import { indexedTypeScan } from '../../world/livingWorldViews.js';
import { shouldDrawTableVfx, tableLookAtDelta, tableVfxDrawWuFromState } from '../tabletopPolicy.js';
import {
  NPC_JOB_REACTION,
  deployFraction,
  resolveNpcJobReaction,
  resolveNpcJobSignaturePreferCue,
  writeNpcJobSignatureFrame,
} from '../npcJobSignatureVfx.js';

// The fallback remains local when the persisted route cannot resolve a live asteroid.
const NPC_JOB_CUT_BEAM_FALLBACK = 26;
// Beyond this authored reach, a beam would claim contact across several visible frames.
const NPC_JOB_CUT_BEAM_MAX_REACH = 110;
// Entity type to entity-index bucket, used by exact work/contact target resolution.
const INDEX_BUCKET_BY_TYPE = {
  ship: 'ships',
  drone: 'drones',
  station: 'stations',
  asteroid: 'asteroids',
  wreck: 'wrecks',
  payload: 'payloads',
  pickup: 'pickups',
  projectile: 'projectiles',
  mine: 'mines',
  vectormine: 'vectorMines',
  charge: 'charges',
};

// The VFX instance remains the scratch, pool, and shared-streak owner. These methods pull and
// paint the canonical NPC job state without adding a second lifecycle or effect pool.
export function createNpcJobSignatureMethods({
  SPR_FLASH,
  SPR_PUFF,
  SPR_RING,
  _tableLookAtScratch,
  initNpcJobContactScratch,
  resetNpcJobContactScratch,
}) {
  return {
    /**
     * Is this hull heavy?
     *
     * Derived from the PHASE GRAPH, never from `job.payload`. The kernel treats payload as a static
     * cargo INTENT and never clears it at unload (npcJobs.js:299-300), so reading it would report every
     * hauler that ever carried anything as permanently full — and "Amber heartbeat means mass" is the
     * single most-consulted line in the Code. A hauler is heavy between LOAD and UNLOAD; a miner is
     * heavy on RETURN; a patrol is never heavy.
     */
    _npcJobLoaded(kind, phase) {
      if (kind === 'hauler') return phase === 'depart' || phase === 'transit' || phase === 'approach';
      if (kind === 'miner') return phase === 'return' || phase === 'unload';
      return false;
    },

    /**
     * The rock a miner is cutting, or null.
     *
     * traffic._buildJobSpec names the field waypoint `field:<entityId>` (traffic.js:_buildJobSpec), so
     * the route itself carries the identity of the worked body. Recovering it lets the cut beam
     * terminate on the real asteroid — EVE's motionless-barge-on-rock read — instead of projecting a
     * fake beam into empty space. If the rock is gone (depleted, sector churn) the caller falls back.
     */
    _npcJobWorkTarget(job) {
      const route = job && job.route;
      if (!Array.isArray(route)) return null;
      for (let i = 0; i < route.length; i++) {
        const wp = route[i];
        const id = wp && wp.id;
        if (typeof id !== 'string' || !id.startsWith('field:')) continue;
        const numeric = Number(id.slice(6));
        if (!Number.isFinite(numeric)) continue;
        const rock = this._ent(numeric);
        // The TYPE check is the load-bearing one, not the liveness check. `job.route` is PERSISTED —
        // npcJobsRuntime serializes the kernel record and the save owner writes it out — so this id
        // survives a save/reload, while entity ids are handed out fresh on restore. Without this
        // guard a restored barge would happily cut whatever now holds its old rock's id: a station,
        // another ship, a pickup. That failure is silent and looks like an art bug, not a stale
        // reference. A miss simply falls back to the forward-projected beam.
        if (rock && rock.type === 'asteroid' && rock.alive !== false && rock.pos) return rock;
      }
      return null;
    },

    _updateNpcJobSignatures(step) {
      const slots = this._npcJobSignatureSlots;
      const byId = this.state && this.state.npcJobs && this.state.npcJobs.byId;
      if (!slots || !slots.length || !byId) return 0;

      const settings = this.state && this.state.settings || null;
      const video = settings && settings.video || null;
      const accessibility = settings && settings.accessibility || null;
      const reducedMotion = !!(
        (video && video.motionReduce)
        || (accessibility && accessibility.motionPreference === 'reduce')
      );
      const player = this.helpers && this.helpers.player
        ? this.helpers.player()
        : this._ent(this.state.playerId);
      const drawWu = this._tableVfxDrawWu || tableVfxDrawWuFromState(this.state);

      // Generation stamp: slots claimed this tick are off-limits for reuse, so two jobs can never
      // fight over one slot within a single pass and produce a strobing half-drawn code.
      const gen = (this._npcJobSignatureGen = ((this._npcJobSignatureGen | 0) + 1) | 0);
      let emitted = 0;
      let active = 0;
      let drawn = 0;
      let reacting = 0;

      for (const jobId in byId) {
        const entry = byId[jobId];
        if (!entry) continue;
        const job = entry.job;
        if (!job || job.corrupt) continue;
        active++;

        // A virtualized job has no hull on screen; there is nothing to light.
        if (entry.entityId == null) continue;
        const ent = this._ent(entry.entityId);
        if (!ent || ent.alive === false || !ent.pos) continue;

        if (player && player.pos) {
          const look = tableLookAtDelta(this.state, player.pos, ent.pos, _tableLookAtScratch);
          if (!shouldDrawTableVfx(look.x, look.z, drawWu)) continue;
        }

        // D3: prefer entity.data.ceresCausalCue when present; fall back to job phase.
        // Same profile table, same 12-slot pool — no new profiles or pool growth.
        const profile = resolveNpcJobSignaturePreferCue(
          entry.kind,
          job.phase,
          this._npcJobLoaded(entry.kind, job.phase),
          ent.data && ent.data.ceresCausalCue,
        );
        if (!profile) continue;

        let slot = null;
        for (let i = 0; i < slots.length; i++) {
          if (slots[i].jobId === jobId) { slot = slots[i]; break; }
        }
        if (!slot) {
          for (let i = 0; i < slots.length; i++) {
            if (slots[i].gen !== gen && slots[i].jobId === null) { slot = slots[i]; break; }
          }
        }
        if (!slot) {
          for (let i = 0; i < slots.length; i++) {
            if (slots[i].gen !== gen) { slot = slots[i]; break; }
          }
        }
        if (!slot) continue; // pool saturated this tick; the remaining hulls simply stay dark

        if (slot.jobId !== jobId) {
          slot.jobId = jobId;
          slot.profileId = null;
          // Stable per-job de-phasing so eight patrols do not blink in lockstep and read as one
          // machine. Derived from the id string, not RNG, so it survives save/reload unchanged.
          let h = 2166136261;
          for (let i = 0; i < jobId.length; i++) {
            h ^= jobId.charCodeAt(i);
            h = Math.imul(h, 16777619);
          }
          slot.seed = (h >>> 0) % 1000;
        }
        slot.gen = gen;

        // A phase change restarts the code from its first beat. A signal caught mid-cycle is a
        // different signal — the Code counts beats, so a chevron that begins on its second lamp is
        // simply a different claim.
        if (slot.profileId !== profile.id) {
          slot.profileId = profile.id;
          slot.elapsed = 0;
          slot.lastEmitStep = -1;
        }
        slot.elapsed += step;

        const frame = writeNpcJobSignatureFrame(
          profile,
          slot.elapsed,
          Number.isFinite(ent.rot) ? ent.rot : 0,
          ent.vel ? ent.vel.x : 0,
          ent.vel ? ent.vel.z : 0,
          slot.seed,
          reducedMotion,
          slot.frame,
        );
        drawn++;

        // Working gear swings out to work and folds back to fly. Derived from phase + time-in-phase,
        // never stored, so a hull can never be caught flying with its jaws still open.
        slot.deploy = deployFraction(job.phase, slot.elapsed, reducedMotion);

        // And the hull notices you. The reaction rides on top of the job — the barge is still mining,
        // it has just stopped advertising it — so it changes presentation only and never the sim.
        let reactionDist = Infinity;
        if (player && player.pos) {
          reactionDist = Math.hypot(ent.pos.x - player.pos.x, ent.pos.z - player.pos.z);
        }
        const reaction = resolveNpcJobReaction(entry.kind, reactionDist, job.phase);
        slot.reaction = reaction.id;
        slot.reactionT = reaction.intensity;
        if (reaction.id !== NPC_JOB_REACTION.NONE) {
          reacting++;
          this._lastNpcJobReaction = reaction.id;
        }

        if (frame.emitStep === slot.lastEmitStep) continue;
        slot.lastEmitStep = frame.emitStep;
        this._lastNpcJobSignatureId = profile.id;
        emitted += this._emitNpcJobSignature(slot, profile, ent, job, reducedMotion);
        emitted += this._emitNpcJobContact(slot, profile, ent, job, reducedMotion);
        emitted += this._emitNpcJobReaction(slot, ent, reducedMotion);
      }

      // Pirates are not a working trade. Their sentence is the intercept itself: a hunt beam onto
      // the live combat/activity prey, pulled from existing AI state, never a scripted pose.
      emitted += this._emitNpcPirateIntercepts(player, drawWu, reducedMotion);

      // Release slots whose job vanished this tick, so a departed hull's cache cannot be mistaken for
      // a live one when ids are recycled. Contact scratch is reset in place (FB-096) — the next
      // claim re-samples its own client's surface rather than reusing a dead job's cached root.
      for (let i = 0; i < slots.length; i++) {
        if (slots[i].gen !== gen && slots[i].jobId !== null) {
          slots[i].jobId = null;
          slots[i].profileId = null;
          slots[i].lastEmitStep = -1;
          slots[i].elapsed = 0;
          resetNpcJobContactScratch(slots[i]);
        }
      }

      this._npcJobSignatureActive = active;
      this._npcJobSignatureDrawn = drawn;
      this._npcJobReacting = reacting;
      return emitted;
    },

    // Occupational light needs a subject AND an object. Resolve only the body's actual route
    // reference; never substitute the nearest ship/rock or draw a fictional client at a waypoint.
    // Cache identity between beats, but validate live membership before using a retained body.
    _npcJobContactTarget(slot, ent, job) {
      const waypoint = job.route && job.route[job.routeIndex];
      const ref = waypoint && (waypoint.targetRef || waypoint.id);
      if (!ref || typeof ref !== 'string') return null;
      const now = this.state.simTime || 0;
      const old = slot.contactTarget;
      if (slot.contactRef === ref && now < slot.contactRefreshAt
        && old && old.alive !== false && this._ent(old.id) === old) return old;
      slot.contactRef = ref;
      slot.contactRefreshAt = now + 1;
      slot.contactTarget = null;
      let field = null, value = null, type = null;
      if (ref.startsWith('object:')) {
        field = 'activityObjectSlotId'; value = ref.slice(7); type = 'fx';
      } else if (ref.startsWith('field:slot:')) {
        field = 'activityObjectSlotId'; value = ref.slice(11); type = 'asteroid';
      } else if (ref.startsWith('world-site:')) {
        field = 'worldRecordId'; value = `${ref.slice(11)}/root`; type = 'fx';
      } else if (ref.startsWith('dest:') || ref.startsWith('home:')
        || ref.startsWith('client:') || ref.startsWith('berth:')) {
        // Traffic tenders name the call-out `client:<stationId>` and home `berth:<stationId>`.
        // Treating those as unknown left the weld in empty space and the hull reading as a factory.
        field = 'stationId';
        value = ref.slice(ref.indexOf(':') + 1);
        type = 'station';
      } else if (ref.startsWith('field:') || ref.startsWith('hulk:') || ref.startsWith('prey:')) {
        const body = this._ent(Number(ref.slice(ref.indexOf(':') + 1)));
        const validType = ref.startsWith('field:') ? body && body.type === 'asteroid'
          : ref.startsWith('prey:') ? body && body.type === 'ship'
          : body && (body.type === 'wreck' || body.type === 'payload');
        if (validType && body.alive !== false && body !== ent) slot.contactTarget = body;
        return slot.contactTarget;
      }
      if (!field) return null;
      // Keyed maps under the entity index's coverage contract: slot refs name an
      // activityObjectSlotId (indexed set enumerates every indexed carrier), and a world-site
      // ref is a worldRecordId with a counted holder — count>1 keeps the lane scan so duplicate
      // carriers still resolve the same answer the walk gives.
      let keyed = null;
      const index = this.state.entityIndex;
      // Only under full coverage (every entities-map member indexed) do the keyed sets
      // enumerate the whole candidate population — otherwise keep the historical lane scan.
      if (index && index.__spacefaceEntityIndexV1 === true && index.ready === true
        && index._indexedIds instanceof Set && this.state.entities
        && this.state.entities.size === index._indexedIds.size) {
        if (field === 'activityObjectSlotId') {
          keyed = index.byActivityObjectSlotId.get(value) || null;
        } else if (field === 'worldRecordId'
          && (index.byWorldRecordIdCount.get(value) || 0) === 1) {
          keyed = [index.byWorldRecordId.get(value)];
        }
      }
      // Indexed type bucket when available — the predicate below still re-checks `body.type`,
      // so an unknown type simply falls back to the full entity list.
      const list = keyed || indexedTypeScan(this.state, INDEX_BUCKET_BY_TYPE[type]);
      for (const body of list) {
        if (body === ent || body.alive === false || body.type !== type
          || !body.data || body.data[field] !== value || !body.pos) continue;
        if (slot.contactTarget) { slot.contactTarget = null; break; }
        slot.contactTarget = body;
      }
      return slot.contactTarget;
    },

    _emitNpcJobContact(slot, profile, ent, job, reducedMotion) {
      const kind = job.kind;
      const role = (job.payload && job.payload.role) || kind;
      const working = job.phase === 'work' || job.phase === 'load' || job.phase === 'unload';
      const survey = kind === 'surveyor'
        && (job.phase === 'work' || job.phase === 'transit' || job.phase === 'approach');
      const pirate = kind === 'pirate' || role === 'pirate' || role === 'raider';
      const patrol = kind === 'patrol' && !pirate
        && (job.phase === 'hold' || job.phase === 'transit' || job.phase === 'approach');
      const miner = kind === 'miner' && job.phase === 'work';
      const scavenger = kind === 'salvor' || kind === 'scavenger' || role === 'scavenger';
      if (!patrol && !survey && !pirate && !miner
        && (!working || (kind !== 'hauler' && kind !== 'tender' && !scavenger))) return 0;
      const r = Math.max(3, Number(ent.radius) || 6);
      const x = ent.pos.x, z = ent.pos.z;
      // Above the working deck. The old sub-WU flashes were often occluded by their own hull.
      let y = Math.max(2, r * 0.38);
      const cadence = reducedMotion ? (profile.reducedCadenceHz || profile.cadenceHz) : profile.cadenceHz;
      const life = Math.min(3, Math.max(0.35, 1.35 / cadence));
      let emitted = 0;
      if (survey) {
        const bearing = Number(ent.rot) || 0;
        const spread = 0.54;
        const reach = r * 4.5;
        // An instrument sweeps a bounded sector, with range returns across it; a patrol's single
        // searchlight stays a different silhouette. These are optical traces, not solid cargo.
        const sweep = reducedMotion ? bearing : bearing + Math.sin(slot.elapsed * 0.65) * spread;
        for (let i = 0; i < 5; i++) {
          const angle = bearing - spread + i * spread * 0.5;
          const ux = Math.cos(angle), uz = Math.sin(angle);
          const hot = Math.max(0, 1 - Math.abs(angle - sweep) / 0.35);
          emitted += this._spawnStationSideEventStreak(
            x + ux * reach * 0.6, y, z + uz * reach * 0.6,
            life, r * (0.028 + hot * 0.035), reach * 0.8, 0.28 + hot * 0.40,
            '#7ad9e8', 0, 0, ux, uz,
          );
          const d = reach * (0.72 + (i % 2) * 0.12);
          emitted += this._spawnStationSideEventStreak(
            x + ux * d, y, z + uz * d, life,
            r * 0.055, r * 0.50, 0.40, '#b1ece9', 0, 0, -uz, ux,
          );
        }
        return emitted;
      }
      if (pirate) {
        const prey = this._npcPirateInterceptTarget(ent);
        if (!prey || !prey.pos) return 0;
        const px = prey.pos.x - x, pz = prey.pos.z - z;
        const distance = Math.hypot(px, pz);
        if (distance < r || distance > 220) return 0;
        const ux = px / distance, uz = pz / distance;
        const end = Math.max(r, distance - (Number(prey.radius) || 6) * 0.7);
        const start = r * 0.75;
        // One hostile hunt beam onto the live prey — not a patrol's cool searchlight, not a scan fan.
        emitted += this._spawnStationSideEventStreak(
          x + ux * (start + end) * 0.5, y, z + uz * (start + end) * 0.5,
          life, r * 0.08, end - start, 0.62, '#ff6a4a', 0, 0, ux, uz,
        );
        emitted += this._spawnStationSideEventStreak(
          x + ux * end, y, z + uz * end, life, r * 0.05, r * 0.85,
          0.55, '#ffb35c', 0, 0, -uz, ux,
        );
        const vx = ent.vel ? ent.vel.x : -ux;
        const vz = ent.vel ? ent.vel.z : -uz;
        const speed = Math.hypot(vx, vz) || 1;
        const bx = -vx / speed, bz = -vz / speed;
        const nx = -bz, nz = bx;
        emitted += this._spawnStationSideEventStreak(
          x + bx * r * 1.05 + nx * r * 0.28, y * 0.7, z + bz * r * 1.05 + nz * r * 0.28,
          life, r * 0.07, r * 1.15, 0.70, '#ff7a3a', 0, 0, bx, bz,
        );
        emitted += this._spawnStationSideEventStreak(
          x + bx * r * 1.05 - nx * r * 0.28, y * 0.7, z + bz * r * 1.05 - nz * r * 0.28,
          life, r * 0.07, r * 1.15, 0.70, '#ff7a3a', 0, 0, bx, bz,
        );
        return emitted;
      }
      if (patrol) {
        const player = this._ent(this.state.playerId);
        if (!player || !player.pos) return 0;
        const ax = player.pos.x - x, az = player.pos.z - z;
        const distance = Math.hypot(ax, az);
        if (distance < r || distance > 140) return 0;
        // The existing stranger-paint response held long enough to read its target in one frame.
        // A single narrow search beam and a transverse return differ from the survey's range fan.
        const ux = ax / distance, uz = az / distance;
        const end = Math.max(r, distance - (Number(player.radius) || 6) * 0.7);
        const start = r * 0.7;
        emitted += this._spawnStationSideEventStreak(
          x + ux * (start + end) * 0.5, y, z + uz * (start + end) * 0.5,
          life, r * 0.055, end - start, 0.48, '#a8e4ff', 0, 0, ux, uz,
        );
        emitted += this._spawnStationSideEventStreak(
          x + ux * end, y, z + uz * end, life, r * 0.035, r * 0.7,
          0.38, '#c7eaf5', 0, 0, -uz, ux,
        );
        return emitted;
      }
      const target = this._npcJobContactTarget(slot, ent, job);
      if (!target || !target.pos) return 0;
      const ax = target.pos.x - x, az = target.pos.z - z;
      const distance = Math.hypot(ax, az);
      const targetR = Math.max(2, Number(target.radius) || 6);
      // The effect may only bridge the real working clearance. A job clock reaching WORK early
      // never authorizes a kilometre-long repair beam through the rest of the pocket.
      const gap = distance - r - targetR;
      if (gap > 100 || distance < 0.01) return 0;
      let ux = ax / distance, uz = az / distance;
      let end = Math.max(r, distance - targetR * 0.82);
      let endY = y;
      const root = target.view && target.view.root;
      if (root) {
        // A wreck's centre may be an empty passage. Choose a real point on its currently visible
        // metal, with a bounded sample per submesh; never a collision-radius point in empty space.
        const origin = this.state.world && this.state.world.frameOrigin;
        const ox = origin && origin.x || 0, oz = origin && origin.z || 0;
        // Pool slots own their contact scratch from construction (FB-096); only a bare
        // harness-built slot arrives here without it.
        if (!slot.contactVisit) initNpcJobContactScratch(slot);
        const now = this.state.simTime || 0;
        if (slot.contactSurfaceRoot !== root || now >= (slot.contactSurfaceUntil || 0)) {
          slot.contactFrom.set(x - ox, y, z - oz);
          slot.contactBest = Infinity;
          root.traverseVisible(slot.contactVisit);
          slot.contactSurfaceRoot = root;
          slot.contactSurfaceUntil = now + 0.5;
          // Store global coordinates so an origin shift cannot drag the retained work point.
          if (Number.isFinite(slot.contactBest)) {
            slot.contactPoint.x += ox;
            slot.contactPoint.z += oz;
          }
        }
        if (Number.isFinite(slot.contactBest)) {
          const point = slot.contactPoint;
          const hx = point.x - x, hz = point.z - z;
          end = Math.hypot(hx, hz) - 0.2;
          ux = hx / (end + 0.2); uz = hz / (end + 0.2);
          endY = point.y + 0.15;
        }
      }
      const nx = -uz, nz = ux;
      const start = Math.min(r * 0.65, end * 0.35);
      if (end <= start || end - start > 120) return 0;
      const length = end - start;
      if (kind === 'hauler') {
        // Parallel cargo rails + directed packets. Not a weld, not a cut.
        for (let side = -1; side <= 1; side += 2) {
          const offset = side * r * 0.28;
          const segments = Math.abs(endY - y) > 1 ? 6 : 1;
          for (let i = 0; i < segments; i++) {
            const t = (i + 0.5) / segments;
            const along = start + length * t;
            emitted += this._spawnStationSideEventStreak(
              x + ux * along + nx * offset, y + (endY - y) * t,
              z + uz * along + nz * offset,
              life, r * 0.07, length / segments * 1.08, 0.55, '#e5ae64', 0, 0, ux, uz,
            );
          }
        }
        const flow = reducedMotion ? 0 : (slot.elapsed * 0.65) % 1;
        for (let i = 0; i < 3; i++) {
          let t = (i / 3 + flow) % 1;
          if (job.phase === 'load') t = 1 - t;
          const along = start + t * length;
          emitted += this._spawnStationSideEventStreak(
            x + ux * along, y + (endY - y) * t + 0.12, z + uz * along,
            life * 0.65, r * 0.16, r * 0.50, 0.68, '#eec897', 0, 0, nx, nz,
          );
        }
        return emitted;
      }
      if (kind === 'tender') {
        // Weld ON the client's plate. Long cyan rails read as station lights — that is not repair.
        // Size from the CLIENT, never the tender: a mule-radius stitch (6–10 wu) through a fighter
        // hangs into the working gap and reads as exhaust or a factory spark (seed 14102).
        const plate = Math.max(2.6, Math.min(5.2, targetR * 0.42));
        const stitch = plate;
        const spark = Math.min(3.4, plate * 0.62);
        const inboard = Math.max(2.45, Math.min(targetR * 0.28, 4.8));
        const along = reducedMotion ? 0 : Math.sin(slot.elapsed * 1.3) * Math.min(0.35, targetR * 0.04);
        const side = Math.min(0.85, targetR * 0.08);
        const thick = Math.max(0.32, Math.min(0.72, targetR * 0.07));
        // Pin to the live client body. A closest-vertex sample on a fighter fin parks the
        // cross in empty sky (seed 14102). Inset from the hull centre toward the tender.
        const tx = target.pos.x - ux * inboard + nx * along;
        const tz = target.pos.z - uz * inboard + nz * along;
        let weldY = endY;
        const weldRoot = target.view && target.view.root;
        if (weldRoot) {
          // Pool-owned scratch (FB-096); bare harness slots still get one on first weld.
          if (!slot.contactBox) slot.contactBox = new THREE.Box3();
          slot.contactBox.setFromObject(weldRoot);
          if (Number.isFinite(slot.contactBox.max.y)) weldY = slot.contactBox.max.y + 0.15;
        }
        emitted += this._spawnStationSideEventStreak(
          tx + nx * side, weldY, tz + nz * side, life, thick, stitch, 0.88, '#ff4a3a', 0, 0, nx, nz,
        );
        emitted += this._spawnStationSideEventStreak(
          tx - nx * side, weldY, tz - nz * side, life, thick, stitch, 0.88, '#ff4a3a', 0, 0, nx, nz,
        );
        emitted += this._spawnStationSideEventStreak(
          tx, weldY, tz, life, thick * 1.15, spark, 0.94, '#d8f4ff', 0, 0, nx, nz,
        );
        emitted += this._spawnStationSideEventStreak(
          tx, weldY, tz, life, thick, stitch * 0.55, 0.82, '#f0f6e4', 0, 0, ux, uz,
        );
        return emitted;
      }
      if (kind === 'miner') {
        // Cutting beam into the rock plus ejecta — amber work cone, not a survey fan or a weld.
        emitted += this._spawnStationSideEventStreak(
          x + ux * (start + end) * 0.5, y, z + uz * (start + end) * 0.5,
          life, r * 0.09, length, 0.72, '#ffcf7a', 0, 0, ux, uz,
        );
        const hitX = x + ux * end, hitZ = z + uz * end;
        emitted += this._spawnStationSideEventStreak(
          hitX, endY, hitZ, life, r * 0.05, r * 0.48, 0.6, '#ffb35c',
          (-ux + nx) * 6, (-uz + nz) * 6, -ux + nx, -uz + nz,
        );
        emitted += this._spawnStationSideEventStreak(
          hitX, endY, hitZ, life, r * 0.04, r * 0.36, 0.5, '#ffe0a8',
          (-ux - nx) * 5, (-uz - nz) * 5, -ux - nx, -uz - nz,
        );
        return emitted;
      }
      // Salvor / scavenger: one cutter into the wreck face plus scrap thrown off it.
      emitted += this._spawnStationSideEventStreak(
        x + ux * (start + end) * 0.5, y, z + uz * (start + end) * 0.5,
        life, r * 0.10, length, 0.64, '#ffca89', 0, 0, ux, uz,
      );
      const hitX = x + ux * end, hitZ = z + uz * end;
      const fling = reducedMotion ? 0.2 : 0.8;
      emitted += this._spawnStationSideEventStreak(
        hitX, endY, hitZ, life, r * 0.04, r * 0.55, 0.58, '#d8b083',
        (-ux + nx * fling) * 9, (-uz + nz * fling) * 9, -ux + nx * fling, -uz + nz * fling,
      );
      emitted += this._spawnStationSideEventStreak(
        hitX, endY, hitZ, life, r * 0.035, r * 0.42, 0.50, '#9fb0bd',
        (-ux - nx * fling) * 8, (-uz - nz * fling) * 8, -ux - nx * fling, -uz - nz * fling,
      );
      return emitted;
    },

    _npcPirateIdentity(ent) {
      if (!ent || ent.alive === false || ent.type !== 'ship' || !ent.pos) return false;
      const data = ent.data || {};
      const ai = data.ai || {};
      if (ai.lawful === true) return false;
      const role = String(data.trafficRole || data.role || ai.role || '').toLowerCase();
      if (role === 'salvor' || role === 'scavenger' || role === 'miner' || role === 'hauler'
        || role === 'tender' || role === 'surveyor' || role === 'patrol' || role === 'escort') {
        return false;
      }
      if (role === 'pirate' || role === 'raider') return true;
      if (ai.pirate === true || ai.archetype === 'pirate') return true;
      const spawn = String(ai.spawnContext || '');
      if (spawn.includes('ambush')) return true;
      return (ent.factionId || data.factionId) === 'faction_reavers';
    },

    _npcPirateInterceptTarget(ent) {
      const data = ent && ent.data || {};
      const ai = data.ai || {};
      const combat = data.combat || {};
      const activity = ai.activity && typeof ai.activity === 'object' ? ai.activity : null;
      const id = data.npcInterceptTargetId ?? combat.targetId ?? (activity && activity.targetId)
        ?? ai.predationTargetId ?? ai.retaliationTargetId ?? ai.securityTargetId;
      if (id != null) {
        const prey = this._ent(id);
        if (prey && prey !== ent && prey.alive !== false && prey.pos) return prey;
      }
      return null;
    },

    _emitNpcPirateIntercepts(player, drawWu, reducedMotion) {
      const scratch = this._pirateInterceptScratch;
      if (!scratch || !this.state) return 0;
      const list = indexedTypeScan(this.state, 'ships');
      scratch.elapsed = this.state.simTime || 0;
      const job = scratch.job || (scratch.job = { kind: 'pirate', phase: 'hold', routeIndex: 0, route: null });
      const profile = scratch.cadence || (scratch.cadence = { cadenceHz: 3.2, reducedCadenceHz: 1.2 });
      let emitted = 0;
      let used = 0;
      for (let i = 0; i < list.length; i++) {
        const ent = list[i];
        if (!this._npcPirateIdentity(ent)) continue;
        if (player && player.pos) {
          const look = tableLookAtDelta(this.state, player.pos, ent.pos, _tableLookAtScratch);
          if (!shouldDrawTableVfx(look.x, look.z, drawWu)) continue;
        }
        emitted += this._emitNpcJobContact(scratch, profile, ent, job, reducedMotion);
        used += 1;
        if (used >= 2) break;
      }
      return emitted;
    },

    /**
     * Draw one beat of one hull's signal.
     *
     * SUBSTRATE CHOICE IS PHYSICAL, and it was wrong the first time. Lamps are point sources, so they
     * are sprites — a soft bright core that grows and fades, which is what a blinking navigation light
     * actually looks like. Only genuinely LINEAR things are streaks: a cut beam, a sweep, a chevron
     * arm, a transfer boom, a plume. Drawing a lamp as a stretched quad produced a flat opaque orange
     * BAR beside the hull rather than a light on it — visible, correctly placed, and obviously wrong.
     *
     * Every branch is a distinct SILHOUETTE and CADENCE, not a re-tint: at the distance this reads at,
     * arrangement and blink rhythm carry the meaning and colour is a close-range bonus.
     */
    _emitNpcJobSignature(slot, profile, ent, job, reducedMotion) {
      const frame = slot.frame;
      const x = ent.pos.x;
      const z = ent.pos.z;
      const dx = frame.dirX;
      const dz = frame.dirZ;
      const nx = frame.normalX;
      const nz = frame.normalZ;
      // Signals scale with the hull. A Meridian bulk mule's lamp bank is physically bigger than a
      // courier's, and the Code is read on hulls from 6 to 30 units across.
      const r = Math.max(3, Number(ent.radius) || 6);
      const beat = frame.beat;
      let emitted = 0;

      switch (profile.rhythm) {
        case 'spine-wake': {
          // "Bow lamp, midships, stern, one beat each." One lamp walks the keel; the hull's LENGTH is
          // the message, so the read is a travelling light rather than a flash in place.
          const along = (1 - beat) * r * 1.05;
          emitted += this._spawnJobLamp(x + dx * along, 0.42, z + dz * along, r, 0.085, '#e8f0ff', reducedMotion);
          break;
        }

        case 'load-heartbeat': {
          // The loaded heartbeat: port and starboard amber together, then a rest. Two lamps firing as
          // a PAIR is what separates mass from every single-lamp code in the book.
          if (beat === 0) {
            const off = r * 0.92;
            emitted += this._spawnJobLamp(x + nx * off, 0.46, z + nz * off, r, 0.12, '#ffb35c', reducedMotion);
            emitted += this._spawnJobLamp(x - nx * off, 0.46, z - nz * off, r, 0.12, '#ffb35c', reducedMotion);
          }
          break;
        }

        case 'empty-bar': {
          // "Three dim whites in a row" — hold open for hire. Deliberately dim and ventral: an empty
          // hull is announcing that it is not worth the interdiction maths.
          const lateral = (beat - 1) * r * 0.62;
          emitted += this._spawnJobLamp(x + nx * lateral, 0.24, z + nz * lateral, r, 0.062, '#cfe4ff', reducedMotion, 0.5);
          break;
        }

        case 'bow-final': {
          // Steady green bow lamp every beat — "green final is a promise" — plus one lateral thruster
          // tick that alternates sides, which is the stepped bleed-off the Code describes.
          emitted += this._spawnJobLamp(x + dx * r * 1.15, 0.44, z + dz * r * 1.15, r, 0.105, '#7dffb0', reducedMotion);
          const side = beat === 0 ? 1 : -1;
          emitted += this._spawnStationSideEventStreak(
            x + nx * side * r * 0.7, 0.38, z + nz * side * r * 0.7,
            reducedMotion ? 0.34 : 0.22, r * 0.05, r * 0.38, 0.50, '#b8ccdd',
            -nx * side * 3, -nz * side * 3, -nx * side, -nz * side,
          );
          break;
        }

        case 'work-cone': {
          // The blind cone. Three things at once, because extraction is the loudest thing a civilian
          // hull ever does: a beam onto the face, spall coming off it, and a red flank lamp walking
          // the arc nobody may enter. The beam is the one place a stretched quad is the right shape.
          const rock = this._npcJobWorkTarget(job);
          const noseX = x + dx * r * 0.8;
          const noseZ = z + dz * r * 0.8;
          let bx = dx;
          let bz = dz;
          let reach = NPC_JOB_CUT_BEAM_FALLBACK;
          if (rock && rock.pos) {
            const rx = rock.pos.x - noseX;
            const rz = rock.pos.z - noseZ;
            const dist = Math.hypot(rx, rz);
            // The range gate matters as much as the aim. A barge in WORK holds position wherever it
            // happened to arrive — the kernel's route position is advisory, not a teleport — so it can
            // legitimately be hundreds of units short of the rock its route names. Measured live: a
            // working barge 434 units from its own seam, which would draw a 423-unit lance across the
            // whole frame and well past it. That is not a cut, it is a targeting line. Past the gate
            // the hull keeps its work code and its flank strobe but shows the short local beam, which
            // reads as "rigged and running" rather than claiming a contact it does not have.
            if (dist > 1e-3 && dist <= NPC_JOB_CUT_BEAM_MAX_REACH) {
              bx = rx / dist;
              bz = rz / dist;
              // Stop at the rock's surface, not its centre — a beam that vanishes inside the body
              // reads as a bug, and the spall belongs on the face.
              reach = Math.max(2, dist - (Number(rock.radius) || 6));
            }
          }
          const midX = noseX + bx * reach * 0.5;
          const midZ = noseZ + bz * reach * 0.5;
          emitted += this._spawnStationSideEventStreak(
            midX, 0.40, midZ,
            reducedMotion ? 0.34 : 0.20, r * 0.10, reach, 0.62, '#ffcf7a', 0, 0, bx, bz,
          );
          // Spall off the face: thrown BACK along the beam, spreading. Contact is the channel that
          // proves the link is doing work rather than merely pointing.
          const hitX = noseX + bx * reach;
          const hitZ = noseZ + bz * reach;
          if (!reducedMotion) {
            const spread = (beat - 1.5) * 0.34;
            const sx = -bx * Math.cos(spread) + bz * Math.sin(spread);
            const sz = -bz * Math.cos(spread) - bx * Math.sin(spread);
            emitted += this._spawnStationSideEventStreak(
              hitX, 0.36, hitZ,
              0.62, r * 0.035, r * 0.28, 0.55, '#d8b083', sx * 11, sz * 11, sx, sz,
            );
          }
          if (this._spawnSprite(
            SPR_FLASH, hitX, 0.42, hitZ,
            0.16, r * 0.10, r * 0.26, 0.62, 0, '#ffe0a8', 0, 0, 1.2, Math.atan2(bz, bx),
          )) emitted++;
          // "Do not enter this arc." The red lamp walks the forbidden flank, one quarter per beat.
          const arc = (beat / 4) * Math.PI - Math.PI * 0.5;
          const ax = dx * Math.cos(arc) - dz * Math.sin(arc);
          const az = dz * Math.cos(arc) + dx * Math.sin(arc);
          // The forbidden arc widens as the magnet arms come out — the cone you may not enter is
          // literally the reach of the deployed gear.
          const armed = 0.55 + 0.50 * (slot.deploy || 0);
          emitted += this._spawnJobLamp(x + ax * r * armed, 0.50, z + az * r * armed, r, 0.10, '#ff6a5c', reducedMotion);
          break;
        }

        case 'pin-sweep': {
          // "A patrol that doesn't sweep is not a patrol." A beam riding a rotating bearing — genuinely
          // linear, so genuinely a streak — plus a steady mast lamp at the hull.
          const sx = Math.cos(frame.sweepAngle);
          const sz = Math.sin(frame.sweepAngle);
          emitted += this._spawnStationSideEventStreak(
            x + sx * r * 1.5, 0.52, z + sz * r * 1.5,
            reducedMotion ? 0.52 : 0.30, r * 0.045, r * 0.80, 0.60, '#9ed8ff', 0, 0, sx, sz,
          );
          // Mast lamp: identity survives after the sweep detail dies at range. The research is explicit
          // that nav lights should outlive job detail.
          if (beat === 0) {
            emitted += this._spawnJobLamp(x, 0.62, z, r, 0.095, '#dceeff', reducedMotion);
          }
          break;
        }

        case 'mouth-open': {
          // Hatch aperture spill plus a transfer arm. Three beats against a two-swing arm never line
          // up, which is what makes the cadence read as irregular without any randomness at all.
          const side = beat === 1 ? -1 : 1;
          const mouthX = x + nx * side * r * 0.85;
          const mouthZ = z + nz * side * r * 0.85;
          if (this._spawnSprite(
            SPR_PUFF, mouthX, 0.38, mouthZ,
            0.90, r * 0.20, r * 0.46, 0.46, 0, '#ffcf9a', 0, 0, 1, 0,
          )) emitted++;
          emitted += this._spawnStationSideEventStreak(
            mouthX + nx * side * r * 0.5, 0.44, mouthZ + nz * side * r * 0.5,
            reducedMotion ? 0.62 : 0.42, r * 0.055, r * 0.85, 0.52, '#cbb89a',
            0, 0, nx * side, nz * side,
          );
          break;
        }

        case 'tally': {
          // "Spilling the count." The one signal a bystander is meant to literally count, so it is
          // fast, regular and paired with the dust that proves the hold is actually emptying.
          const ring = (beat / 5) * Math.PI * 2;
          const tx = Math.cos(ring);
          const tz = Math.sin(ring);
          emitted += this._spawnJobLamp(x + tx * r * 0.75, 0.58, z + tz * r * 0.75, r, 0.09, '#ff9a3c', reducedMotion);
          if (!reducedMotion && beat % 2 === 0 && this._spawnSprite(
            SPR_PUFF, x - dx * r * 0.9, 0.30, z - dz * r * 0.9,
            1.10, r * 0.16, r * 0.55, 0.32, 0, '#9a8570', -dx * 4, -dz * 4, 1, 0,
          )) emitted++;
          break;
        }

        case 'return-chevron': {
          // Load-strobe AND the chevron. Two amber lamps stacked, walked so the chevron has a
          // direction — "if the chevron points home, don't offer them a side job."
          const off = r * 0.92;
          emitted += this._spawnJobLamp(x + nx * off, 0.46, z + nz * off, r, 0.12, '#ffb35c', reducedMotion);
          emitted += this._spawnJobLamp(x - nx * off, 0.46, z - nz * off, r, 0.12, '#ffb35c', reducedMotion);
          const rise = beat === 0 ? 0.56 : 0.76;
          const back = r * (beat === 0 ? 0.35 : 0.75);
          emitted += this._spawnStationSideEventStreak(
            x - dx * back + nx * r * 0.34, rise, z - dz * back + nz * r * 0.34,
            reducedMotion ? 0.64 : 0.42, r * 0.045, r * 0.50, 0.64, '#ffd08a',
            0, 0, dx * 0.78 + nx * 0.62, dz * 0.78 + nz * 0.62,
          );
          emitted += this._spawnStationSideEventStreak(
            x - dx * back - nx * r * 0.34, rise, z - dz * back - nz * r * 0.34,
            reducedMotion ? 0.64 : 0.42, r * 0.045, r * 0.50, 0.64, '#ffd08a',
            0, 0, dx * 0.78 - nx * 0.62, dz * 0.78 - nz * 0.62,
          );
          break;
        }

        case 'pulse-ring': {
          // "Pulse. Wait. Pulse." An expanding shell-flash, and a single cool pin held out on the
          // boom. The whole read is the SILENCE between beats — a fast pulse means lost or lying —
          // so the ring is large and short-lived rather than bright and frequent.
          if (beat === 0 && this._spawnSprite(
            SPR_RING, x, 0.44, z,
            reducedMotion ? 1.30 : 0.86, r * 0.55, r * 3.4, 0.44, 0, '#8fe6ff', 0, 0, 1, 0,
          )) emitted++;
          // The survey pin sits off the nose on its boom, crabbed to one side — the dossier's
          // "slender boom that can crab ninety degrees off the nose". It never blinks off.
          // The boom SWINGS. Stowed it lies along the hull; deployed it crabs ninety degrees off the
          // nose, which is the dossier's own description and the whole silhouette change of the trade.
          const swing = 0.18 + 1.07 * (slot.deploy || 0);
          const pinX = x + dx * r * 0.5 + nx * r * swing;
          const pinZ = z + dz * r * 0.5 + nz * r * swing;
          emitted += this._spawnJobLamp(pinX, 0.58, pinZ, r, 0.075, '#bfe8ff', reducedMotion, 0.7);
          emitted += this._spawnStationSideEventStreak(
            x + dx * r * 0.3 + nx * r * swing * 0.55, 0.54, z + dz * r * 0.3 + nz * r * swing * 0.55,
            reducedMotion ? 0.90 : 0.62, r * 0.035, r * (0.35 + 0.75 * (slot.deploy || 0)), 0.34,
            '#7fc4e0', 0, 0, nx, nz,
          );
          break;
        }

        case 'salvage-umbrella': {
          // Hooded floods aimed DOWN at the hull being stripped, plus intermittent cutter arcs. The
          // Code is emphatic that umbrellas-on is what separates recovery from a kill still in
          // progress, so they are the constant and the arc is the flicker.
          // The umbrellas UNFOLD. Stowed they sit tight against the hull; open they reach out over
          // the plate being stripped, which is what stops passing traffic reading this as a kill.
          const spread = 0.22 + 0.78 * (slot.deploy || 0);
          const hood = (beat % 3) - 1;
          emitted += this._spawnStationSideEventStreak(
            x + nx * hood * r * 0.7 * spread + dx * r * 0.3, 0.55, z + nz * hood * r * 0.7 * spread + dz * r * 0.3,
            reducedMotion ? 0.74 : 0.52, r * 0.13, r * (0.28 + 0.42 * spread), 0.62, '#ffb35c', 0, 0, dx, dz,
          );
          // Cutter arc: short, bright, and off half the beats — a wreck fights back in a way a rock
          // does not, which is what makes this irregular where the miner's work cone is even.
          if (beat % 2 === 0) {
            const bite = r * (0.9 + (beat / 6) * 0.5);
            if (this._spawnSprite(
              SPR_FLASH, x + dx * bite, 0.40, z + dz * bite,
              0.13, r * 0.08, r * 0.22, 0.78, 0, '#dff0ff', 0, 0, 1.4, Math.atan2(dz, dx),
            )) emitted++;
            if (!reducedMotion) {
              const fling = (beat === 0 ? 1 : -1) * 0.8;
              emitted += this._spawnStationSideEventStreak(
                x + dx * bite, 0.36, z + dz * bite,
                0.70, r * 0.03, r * 0.30, 0.46, '#9fb0bd',
                (dx + nx * fling) * 9, (dz + nz * fling) * 9, dx + nx * fling, dz + nz * fling,
              );
            }
          }
          break;
        }

        case 'men-at-work': {
          // Static red corners bracketing the open bay — the Code's own words — carried every beat so
          // they read as continuous presence, not a warning flash. The welding stars carry the rhythm.
          for (const side of [1, -1]) {
            emitted += this._spawnJobLamp(
              x + nx * side * r * 0.8 + dx * r * 0.55, 0.30,
              z + nz * side * r * 0.8 + dz * r * 0.55,
              r, 0.07, '#ff4a3a', reducedMotion, 0.66,
            );
          }
          // Weld stars on the client's plate, alternating along the seam. No ejecta anywhere: repair
          // ADDS material, and that absence is the channel separating this from a salvor's arc.
          const seam = (beat === 0 ? 0.5 : -0.5) * r;
          if (this._spawnSprite(
            SPR_FLASH, x + dx * r * 1.05 + nx * seam, 0.46, z + dz * r * 1.05 + nz * seam,
            reducedMotion ? 0.34 : 0.19, r * 0.06, r * 0.30, 0.88, 0, '#cfe4ff', 0, 0, 1, null,
          )) emitted++;
          // One drive cold: a tender on a call-out is a soft target by necessity, and the Code says
          // so with a "do not push" bar across the dead engine.
          emitted += this._spawnStationSideEventStreak(
            x - dx * r * 1.0, 0.36, z - dz * r * 1.0,
            reducedMotion ? 0.80 : 0.58, r * 0.045, r * 0.62, 0.40, '#e8eef4', 0, 0, nx, nz,
          );
          break;
        }

        case 'distress-alternate': {
          // "Red-white is not a negotiation." A whole-hull alternating flash, the fastest and largest
          // signal in the Code, because its entire job is to break any rhythm the reader has locked on.
          const hot = beat === 0;
          if (this._spawnSprite(
            SPR_FLASH, x, 0.46, z,
            0.20, r * 0.45, r * 1.15, hot ? 0.82 : 0.68, 0,
            hot ? '#ff5a4a' : '#ffffff', 0, 0, 1, 0,
          )) emitted++;
          // Asymmetric plume: a wounded hull does not burn politely.
          const skew = frame.chatter * 0.5;
          emitted += this._spawnStationSideEventStreak(
            x - dx * r * 1.1, 0.40, z - dz * r * 1.1,
            reducedMotion ? 0.40 : 0.26, r * 0.075, r * 0.9, 0.58, '#ffa070',
            0, 0, -dx + nx * skew, -dz + nz * skew,
          );
          break;
        }

        default:
          break;
      }

      return emitted;
    },

    /**
     * Draw this hull's response to the player closing.
     *
     * A reaction is an OVERLAY, not a mode. The job's own signal keeps running underneath — the barge
     * is still mining, it has just stopped advertising it — which is what makes the reaction read as a
     * crew decision rather than a state machine flipping. Each one is in the trade's own currency,
     * from its dossier's "how they react to a stranger closing" entry.
     */
    _emitNpcJobReaction(slot, ent, reducedMotion) {
      const t = slot.reactionT;
      if (!t || slot.reaction === NPC_JOB_REACTION.NONE) return 0;
      const frame = slot.frame;
      const x = ent.pos.x;
      const z = ent.pos.z;
      const dx = frame.dirX;
      const dz = frame.dirZ;
      const nx = frame.normalX;
      const nz = frame.normalZ;
      const r = Math.max(3, Number(ent.radius) || 6);
      const player = this.helpers && this.helpers.player
        ? this.helpers.player()
        : this._ent(this.state.playerId);
      let emitted = 0;

      switch (slot.reaction) {
        case NPC_JOB_REACTION.PAINT: {
          // The narrow secondary beam, swung onto YOU rather than round the sky. A patrol boat and a
          // survey rig answer a stranger with the same gesture and mean different things by it.
          if (!player || !player.pos) break;
          const ax = player.pos.x - x;
          const az = player.pos.z - z;
          const len = Math.hypot(ax, az) || 1;
          const ux = ax / len;
          const uz = az / len;
          const reach = Math.min(len, r * 6);
          emitted += this._spawnStationSideEventStreak(
            x + ux * reach * 0.5, 0.56, z + uz * reach * 0.5,
            reducedMotion ? 0.44 : 0.26, r * 0.03 * (0.6 + t), reach, 0.30 + 0.34 * t,
            '#a8e4ff', 0, 0, ux, uz,
          );
          break;
        }

        case NPC_JOB_REACTION.FLINCH: {
          // Weld stops mid-stroke. The tell is the ABSENCE of the next star plus the corners coming up
          // hard — the Code's "men at work" turning from a notice into a warning.
          for (const side of [1, -1]) {
            emitted += this._spawnJobLamp(
              x + nx * side * r * 0.8 + dx * r * 0.55, 0.32,
              z + nz * side * r * 0.8 + dz * r * 0.55,
              r, 0.075 + 0.03 * t, '#ff3a2a', reducedMotion, 0.5 + 0.4 * t,
            );
          }
          break;
        }

        case NPC_JOB_REACTION.WATCH: {
          // Umbrellas tilt toward you and stay on. Dousing them would read as a kill in progress, and
          // the Code is explicit that umbrellas-on is the difference. So: keep cutting, tilt, watch.
          if (!player || !player.pos) break;
          const ax = player.pos.x - x;
          const az = player.pos.z - z;
          const len = Math.hypot(ax, az) || 1;
          emitted += this._spawnStationSideEventStreak(
            x + (ax / len) * r * 0.95, 0.24, z + (az / len) * r * 0.95,
            reducedMotion ? 0.80 : 0.58, r * 0.09, r * 0.5, 0.34 + 0.30 * t,
            '#ffb35c', 0, 0, ax / len, az / len,
          );
          break;
        }

        case NPC_JOB_REACTION.GO_DARK: {
          // "Loud greedy cut raises attention." The floods die back and one cold hull lamp stays lit
          // so you can still see there is somebody there — going fully dark is a smuggler's move and
          // a licensed barge will not risk being read that way.
          if (t > 0.35) {
            emitted += this._spawnJobLamp(x, 0.60, z, r, 0.05, '#7f93a6', reducedMotion, 0.30);
          }
          break;
        }

        case NPC_JOB_REACTION.BRIGHTEN: {
          // An insured hull's defence is being boringly, expensively legitimate. Its running lamps go
          // UP, not down: look at me, I am exactly what my manifest says.
          const off = r * 1.05;
          emitted += this._spawnJobLamp(x + nx * off, 0.50, z + nz * off, r, 0.09 + 0.04 * t, '#ffd9a0', reducedMotion, 0.55 + 0.35 * t);
          emitted += this._spawnJobLamp(x - nx * off, 0.50, z - nz * off, r, 0.09 + 0.04 * t, '#ffd9a0', reducedMotion, 0.55 + 0.35 * t);
          break;
        }

        default:
          break;
      }
      return emitted;
    },

    /**
     * One navigation/work lamp: a soft bright core that grows slightly and fades.
     *
     * `scale` is a FRACTION OF HULL RADIUS, not world units, so the same code reads the same on a
     * 6-unit courier and a 30-unit bulk mule. Reduced motion holds the lamp longer and grows it less,
     * so the signal stays countable without the sharp blink.
     */
    _spawnJobLamp(x, y, z, r, scale, color, reducedMotion, opacity = 0.85) {
      const size0 = r * scale;
      return this._spawnSprite(
        SPR_FLASH,
        x, y, z,
        reducedMotion ? 0.62 : 0.34,
        size0,
        size0 * (reducedMotion ? 1.35 : 2.1),
        opacity,
        0,
        color,
        0, 0,
        1,
        null,
      ) ? 1 : 0;
    },

    // ---- mining beam visual (energy line from ship to contact point) ----------
    _miningBeam: null,
  };
}
