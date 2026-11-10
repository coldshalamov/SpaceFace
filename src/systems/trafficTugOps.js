// Row 413 extraction — methods moved verbatim out of traffic.js;
// spread back onto the traffic object, so `this` still binds to the system at call time.
import { deferredEnterNow } from '../core/sectorEnterDefer.js';
import { hash32 } from '../core/rng.js';
import { makeShipEntitySpec } from './ships.js';
import { forEachJobInteractable } from '../world/livingWorldViews.js';
import { CERES_ACTIVITY_SECTOR_ID } from '../data/sectorActivityPockets.js';
import { NPC_JOB_PHASE } from './npcJobs.js';
import { CHARON_SUPPLY } from '../world/charonSupplyReadout.js';
import { CIVILIAN_MANIFEST_PAYLOAD_TYPE, MAX_GENERAL_SALVORS_PER_SECTOR, MAX_YARD_TUGS_PER_SECTOR, PINNED_BODY_MASS, TOWABLE_BODY_MIN_RADIUS_WU, TRAFFIC_ROLES, YARD_TUG_LOT, factionHullFor, stationIdentity } from './traffic.js';

export const trafficTugOps = {
  // ── Yard tugs: the ordinary-life tow (PQ-143.01) ───────────────────────────────────────────────
  //
  // Same doctrine as the cleanup profession below: the tug is dispatched against a real body, never
  // rolled from the ambient mix (`trafficRoleMixForSector` holds `out.tug = 0`). Unlike salvors this
  // DOES run in the Ceres pocket — the eight-actor authored cast contains a salvor but no tug, so a
  // dispatched tug is additive ambient traffic and never contends with an authored slot.
  //
  // The tug takes the body somewhere; the cutter strips it where it lies. They must therefore never
  // want the same wreck in the same moment, which `_salvorClaimantOf` and `npcTowedByJobId` already
  // enforce from both sides.

  _countYardTugs() {
    let n = 0;
    for (const rec of this.state.traffic.freighters || []) {
      if (!rec || rec.role !== 'tug') continue;
      const ent = this.state.entities && this.state.entities.get && this.state.entities.get(rec.id);
      if (!ent || ent.alive === false || !ent.data) continue;
      if (ent.data.ceresActivityCast === true || ent.data.activityActorSlotId) continue;
      if (ent.data.jobId) n += 1;
    }
    return n;
  },

  // A towable body is a salvageable body heavy enough to be worth a tug and not already spoken for
  // by a cutter or another tug. Reusing `_listSalvageTargets` keeps one cached census of loose
  // bodies per tick instead of adding a second full `entityList` sweep.
  _isTowableBody(entity) {
    if (!this._isSalvageableBody(entity)) return false;
    if (entity.type !== 'wreck' && entity.type !== 'payload') return false;
    const data = entity.data || {};
    if (data.npcTowedByJobId != null) return false;
    if (this._salvorClaimantOf(entity)) return false;
    // Authored site structure is not loose freight. Every "wreck" standing in the Ceres pocket is a
    // `world_site_*` collision proxy or component owned by worldSiteKernel; dragging one away would
    // dismantle an authored place.
    if (data.worldSiteId != null || data.worldObjectId != null) return false;
    if (Number(entity.mass) >= PINNED_BODY_MASS) return false;
    return Number(entity.radius) >= TOWABLE_BODY_MIN_RADIUS_WU;
  },

  _pickUnclaimedTowTarget(anchor) {
    const ax = anchor && anchor.pos && Number.isFinite(anchor.pos.x) ? anchor.pos.x : 0;
    const az = anchor && anchor.pos && Number.isFinite(anchor.pos.z) ? anchor.pos.z : 0;
    let best = null;
    let bestD2 = Infinity;
    let bestId = '';
    for (const target of this._listSalvageTargets()) {
      if (!this._isTowableBody(target) || this._deferOrdinaryCleanupClaim(target)) continue;
      if (!this._salvorNoticeReady(target, deferredEnterNow(this.state) || 0)) continue;
      const dx = target.pos.x - ax;
      const dz = target.pos.z - az;
      const d2 = dx * dx + dz * dz;
      if (!Number.isFinite(d2)) continue;
      const id = String(target.id);
      // Distance first, id second: a stable total order, so two ticks with the same world pick the
      // same body and the choice never depends on entity iteration order.
      if (d2 < bestD2 || (d2 === bestD2 && id < bestId)) { best = target; bestD2 = d2; bestId = id; }
    }
    return best;
  },

  _spawnYardTugNear(home, sectorId, seq) {
    if (!this.helpers || typeof this.helpers.spawnEntity !== 'function') return null;
    if (!home || !home.pos) return null;
    const def = TRAFFIC_ROLES.tug;
    const sector = (this.state.world && this.state.world.sectors)
      ? this.state.world.sectors[sectorId]
      : null;
    const controllingFaction = (sector && sector.factionId)
      || (this.state.world && this.state.world.currentSector && this.state.world.currentSector.factionId)
      || 'faction_free';
    const ang = ((hash32((this.state.meta && this.state.meta.seed) || 1, 'yard_tug_spawn', sectorId, seq) >>> 0)
      / 0xffffffff) * Math.PI * 2;
    const r = 110 + (seq % 3) * 24;
    const pos = { x: home.pos.x + Math.cos(ang) * r, z: home.pos.z + Math.sin(ang) * r };
    const spec = makeShipEntitySpec(factionHullFor(def.ship, controllingFaction, () => 0.5), {
      team: def.team,
      factionId: controllingFaction,
      pos,
      ai: {
        archetype: def.archetype,
        passive: true,
        spawnContext: 'convoy_civilian',
      },
    });
    const ent = this.helpers.spawnEntity(spec);
    if (!ent) return null;
    this._stampTrafficDurableIdentity(ent, sectorId, 'tug', def, 900 + (seq | 0));
    ent.data.trafficRole = 'tug';
    ent.data.role = 'tug';
    ent.data.homeStationId = stationIdentity(home);
    ent.data.trafficLabel = def.label;
    ent.data.yardTug = true;
    this._active.push(ent.id);
    const rec = {
      id: ent.id,
      role: 'tug',
      targetId: home.id,
      waitT: 0,
      nextTradeT: 0,
      orbitPhase: ang,
      dockSeq: 0,
      manifest: null,
      yardTug: true,
    };
    this.state.traffic.freighters.push(rec);
    return { entity: ent, rec };
  },

  // The physical thing the tug came for. It exists because a tug job exists, and it is a real body
  // the player can shoot, salvage or simply get in front of — not a marker and not a line ending in
  // nothing. Traffic owns this lifecycle exactly as it owns the hulls it spawns; npcJobsRuntime only
  // binds the already-live body through the combat attachment service.
  _spawnYardTugLot(berth, sectorId, manifest, seq) {
    if (!this.helpers || typeof this.helpers.spawnEntity !== 'function') return null;
    if (!berth || !berth.pos) return null;
    const total = manifest && Number.isFinite(Number(manifest.totalQty)) ? Math.floor(Number(manifest.totalQty)) : 0;
    if (!(total > 0)) return null; // no finite freight → no lot, and therefore no job
    const ang = ((hash32((this.state.meta && this.state.meta.seed) || 1, 'yard_tug_lot', sectorId, seq) >>> 0)
      / 0xffffffff) * Math.PI * 2;
    // Stand the lot off the berth ring so it is clear of the station collider it was loaded from.
    const r = (Number(berth.radius) || 40) + YARD_TUG_LOT.radius + 34;
    const pos = { x: berth.pos.x + Math.cos(ang) * r, z: berth.pos.z + Math.sin(ang) * r };
    // The lot's salvage value IS the booked manifest, so a player who cracks it open takes exactly
    // the freight the tug was hired to move. Nothing is minted here that the economy did not book.
    const salvagePool = {};
    for (const line of Array.isArray(manifest.lines) ? manifest.lines : []) {
      const qty = Math.floor(Number(line && line.qty) || 0);
      if (line && typeof line.commodityId === 'string' && qty > 0) {
        salvagePool[line.commodityId] = (salvagePool[line.commodityId] || 0) + qty;
      }
    }
    if (Object.keys(salvagePool).length === 0) return null;
    const ent = this.helpers.spawnEntity({
      type: 'payload',
      team: 2,
      pos,
      vel: { x: 0, z: 0 },
      rot: ang,
      radius: YARD_TUG_LOT.radius,
      mass: YARD_TUG_LOT.mass,
      hull: YARD_TUG_LOT.hull,
      hullMax: YARD_TUG_LOT.hull,
      collides: true,
      ttl: Infinity,
      homeSectorId: sectorId,
      physicsBody: {
        dynamic: true,
        radius: YARD_TUG_LOT.radius,
        mass: YARD_TUG_LOT.mass,
        inertiaY: 0.5 * YARD_TUG_LOT.mass * YARD_TUG_LOT.radius * YARD_TUG_LOT.radius,
      },
      data: {
        sectorId,
        payloadType: CIVILIAN_MANIFEST_PAYLOAD_TYPE,
        authoredPayloadAssetId: YARD_TUG_LOT.assetId,
        payloadStableId: 'yard_tug_lot',
        yardTugLot: true,
        towable: true,
        salvagePool,
        cargoManifest: manifest,
      },
    });
    if (!ent) return null;
    // A lot under tow must survive Continue with its tug.
    ent.flags = Object.assign({}, ent.flags, { persistent: true });
    this._active.push(ent.id);
    return ent;
  },

  _dispatchYardTugs(sectorId) {
    if (!sectorId) return 0;
    const assign = this.helpers && this.helpers.npcJobs && this.helpers.npcJobs.assign;
    if (typeof assign !== 'function') return 0; // golden / headless without job runtime → no tugs
    if ((this.state.mode || 'flight') !== 'flight') return 0;
    this._ensureState();
    const stations = this._sectorStations();
    if (stations.length < 2) return 0; // a tow needs somewhere to take the body

    let active = this._countYardTugs();
    if (active >= MAX_YARD_TUGS_PER_SECTOR) return 0;

    // Two ways a tow exists. FIRST, a loose body already drifting in the pocket — the honest case,
    // and the one a player creates by leaving a kill behind. SECOND, and this is what makes the
    // profession visible in a quiet five minutes, the yard's own outbound freight: a berth books a
    // finite lot, and the tug is what moves it. Both are real bodies under the same physics owner.
    // Stage the tow where it can actually be seen AND actually be simulated. Both reasons point the
    // same way: ordinary life the player never flies past is not ordinary life, and SG-02 only gives
    // a Rapier body to what is inside the player's physics reach — a tug working the far side of the
    // sector gets a tow line to a body with no dynamic authority, which is a line to nothing.
    // Measured 2026-09-06 on the Ceres reference pocket: dispatching from `stations[0]` produced a
    // booked lot that never moved for a full five-minute capture.
    const player = this.state.entities && this.state.playerId != null
      ? this.state.entities.get(this.state.playerId)
      : null;
    const berth = (player && player.pos ? this._nearestStationTo(stations, player) : null) || stations[0];
    if (!berth || !berth.pos) return 0;

    let dispatched = 0;
    let existing = this._pickUnclaimedTowTarget(berth);

    while (active < MAX_YARD_TUGS_PER_SECTOR) {
      const home = existing ? (this._nearestStationTo(stations, existing) || berth) : berth;
      if (!home || !home.pos) break;

      // Prefer an idle tug hull already in the sector before adding another body to the pocket.
      let pair = null;
      for (const rec of this.state.traffic.freighters || []) {
        if (!rec || rec.role !== 'tug') continue;
        const ent = this.state.entities && this.state.entities.get && this.state.entities.get(rec.id);
        if (!ent || ent.alive === false || !ent.data) continue;
        if (ent.data.ceresActivityCast === true || ent.data.activityActorSlotId) continue;
        if (ent.data.jobId) continue;
        pair = { entity: ent, rec };
        break;
      }
      if (!pair) {
        pair = this._spawnYardTugNear(home, sectorId, active + dispatched);
        if (!pair) break;
      }

      // The finite work lot the tug books for this run. Stamped before assign so the job kernel and
      // the npcJobsRuntime manifest gate see the same numbers the economy owner wrote.
      this._assignManifest(pair.entity, 'tug', home, sectorId);
      const manifest = pair.entity.data && pair.entity.data.cargoManifest;
      // No loose body to fetch → the berth's own outbound lot becomes the physical load.
      let target = existing;
      let spawnedLot = null;
      if (!target) {
        spawnedLot = this._spawnYardTugLot(home, sectorId, manifest, active + dispatched);
        target = spawnedLot;
      }
      if (!target || !target.pos) break;

      const spec = this._buildJobSpec('tug', pair.entity, home, target, stations, sectorId);
      if (!spec || !this._stampSalvorClaim(target, pair.entity.data.worldRecordId)) {
        if (spawnedLot) this._despawnYardTugLot(spawnedLot);
        break;
      }
      const jobId = assign(pair.entity, spec);
      if (!jobId) {
        this._clearSalvorClaim(target, pair.entity.data.worldRecordId);
        if (spawnedLot) this._despawnYardTugLot(spawnedLot);
        break;
      }
      pair.entity.data.jobKind = 'hauler';
      pair.entity.data.yardTug = true;
      pair.rec.yardTug = true;
      pair.rec.role = 'tug';
      active += 1;
      dispatched += 1;
      existing = null;
    }
    return dispatched;
  },

  // A delivered or abandoned lot must leave the world. Without this the yard accumulates one
  // container per completed run forever, which is unbounded entity growth, not ordinary life.
  _despawnYardTugLot(lot) {
    if (!lot) return;
    lot.alive = false;
    lot.ttl = 0;
    if (lot.data) lot.data.yardTugLotRetired = true;
    const despawn = this.helpers && (this.helpers.despawnEntity || this.helpers.removeEntity);
    if (typeof despawn === 'function') despawn(lot.id);
    else if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('entity:destroyed', { id: lot.id, reason: 'yard_tug_lot_delivered' });
    }
  },

  // Release a tug whose body vanished (the player stripped it, a cutter finished it, it despawned)
  // so the hull returns to its ambient stepper instead of hauling an empty line to the yard.
  _maintainYardTugJobs() {
    const getJob = this.helpers && this.helpers.npcJobs && this.helpers.npcJobs.get;
    const release = this.helpers && this.helpers.npcJobs && this.helpers.npcJobs.release;
    if (typeof getJob !== 'function' || typeof release !== 'function') return;
    for (const rec of this.state.traffic.freighters || []) {
      if (!rec || rec.role !== 'tug') continue;
      const ent = this.state.entities && this.state.entities.get && this.state.entities.get(rec.id);
      if (!ent || !ent.data || !ent.data.jobId || ent.data.ceresActivityCast === true) continue;
      const entry = getJob(ent.data.jobId);
      const job = entry && entry.job;
      if (!job || job.kind !== 'hauler' || job.corrupt) continue;
      const targetId = job.payload && job.payload.towTargetId;
      if (targetId == null) continue;
      const body = this.state.entities && this.state.entities.get
        ? this.state.entities.get(targetId)
        : null;
      // Still there, or already under tow: leave the run alone.
      if (body && body.alive !== false && (body.data && body.data.npcTowedByJobId != null
        || this._salvagePoolTotal(body.data && body.data.salvagePool) > 0)) continue;
      if (body) this._clearSalvorClaim(body, ent.data.worldRecordId);
      release(ent.data.jobId);
    }
    this._retireDeliveredYardTugLots();
  },

  // Delivery cleanup. A lot the tug booked is retired once no live job still owns it: the run
  // completed at the yard, or the tug that was hired for it is gone. A lot the PLAYER is working
  // (its pool already opened) is left alone — that is their salvage now, not the yard's freight.
  _retireDeliveredYardTugLots() {
    const byId = this.state.npcJobs && this.state.npcJobs.byId;
    forEachJobInteractable(this.state, (ent) => {
      if (!ent.data || ent.data.yardTugLot !== true) return;
      if (ent.data.npcTowedByJobId != null) {
        // Under tow: alive by definition, and its owning job is the authority.
        const owner = ent.data.npcTowedByJobId;
        if (byId && byId[owner]) return;
      }
      let owned = false;
      for (const rec of this.state.traffic.freighters || []) {
        if (!rec || rec.role !== 'tug') continue;
        const tug = this.state.entities && this.state.entities.get && this.state.entities.get(rec.id);
        if (!tug || tug.alive === false || !tug.data || !tug.data.jobId) continue;
        const entry = byId && byId[tug.data.jobId];
        const payload = entry && entry.job && entry.job.payload;
        if (payload && payload.towTargetId === ent.id) { owned = true; break; }
      }
      if (owned) return;
      this._despawnYardTugLot(ent);
    });
  },

  _dispatchGeneralSalvors(sectorId) {
    if (!sectorId || sectorId === CERES_ACTIVITY_SECTOR_ID) return 0;
    const assign = this.helpers && this.helpers.npcJobs && this.helpers.npcJobs.assign;
    if (typeof assign !== 'function') return 0; // golden / headless without job runtime → no cutters
    if ((this.state.mode || 'flight') !== 'flight') return 0;
    this._ensureState();
    const stations = this._sectorStations();
    if (!stations.length) return 0;

    let active = this._countGeneralSalvors();
    if (active >= MAX_GENERAL_SALVORS_PER_SECTOR) return 0;

    let dispatched = 0;
    const targets = this._listSalvageTargets();
    for (const target of targets) {
      if (active >= MAX_GENERAL_SALVORS_PER_SECTOR) break;
      if (this._salvorClaimantOf(target) || this._deferOrdinaryCleanupClaim(target)) continue;
      if (!this._salvorNoticeReady(target, deferredEnterNow(this.state) || 0)) continue;
      // The authored Vesta cutter must return to Forge, not whichever pocket station happens to
      // be first in the current entity ordering. Missing Forge means no Vesta dispatch, never a
      // fallback trip to another sector's service route.
      const home = this._salvorHomeForTarget(stations, sectorId, target);
      if (!home || !home.pos) continue;

      // Prefer an existing idle salvor hull; otherwise spawn one near the yard.
      let pair = null;
      for (const rec of this.state.traffic.freighters || []) {
        if (!rec || rec.role !== 'salvor') continue;
        const ent = this.state.entities && this.state.entities.get && this.state.entities.get(rec.id);
        if (!ent || ent.alive === false || !ent.data) continue;
        if (ent.data.ceresActivityCast === true || ent.data.activityActorSlotId) continue;
        if (ent.data.jobId) continue;
        pair = { entity: ent, rec };
        break;
      }
      if (!pair) {
        pair = this._spawnGeneralSalvorNear(home, sectorId, active + dispatched);
        if (!pair) break;
      }

      const spec = this._buildSalvorJobSpec(home, target, sectorId);
      if (!spec) continue;
      // Reserve the body before assign so two cutters cannot claim the same wreck in one tick.
      if (!this._stampSalvorClaim(target, pair.entity.data.worldRecordId)) continue;
      const jobId = assign(pair.entity, spec);
      if (!jobId) {
        this._clearSalvorClaim(target, pair.entity.data.worldRecordId);
        continue;
      }
      pair.entity.data.jobKind = 'salvor';
      pair.entity.data.generalSalvor = true;
      if (spec.payload && spec.payload.salvageSource) {
        pair.entity.data.salvageSource = spec.payload.salvageSource;
        pair.entity.data.salvagePointId = spec.payload.salvagePointId || null;
      } else {
        delete pair.entity.data.salvageSource;
        delete pair.entity.data.salvagePointId;
      }
      pair.rec.generalSalvor = true;
      pair.rec.role = 'salvor';
      active += 1;
      dispatched += 1;
    }
    return dispatched;
  },

  _maintainGeneralSalvorJobs() {
    const getJob = this.helpers && this.helpers.npcJobs && this.helpers.npcJobs.get;
    if (typeof getJob !== 'function') return;
    const sectorId = this.state.world && this.state.world.currentSectorId;
    if (!sectorId || sectorId === CERES_ACTIVITY_SECTOR_ID) return;

    for (const rec of this.state.traffic.freighters || []) {
      if (!rec || rec.role !== 'salvor') continue;
      const ent = this.state.entities && this.state.entities.get && this.state.entities.get(rec.id);
      // Authored activity casts own their choreography — the generic retarget must not
      // hijack their work legs. The Charon supply salvor is the one sanctioned exception:
      // its job is real salvage work whose work leg the finite-supply feature retargets
      // (charonSupplyReadout/originalJob's allowSalvageRetarget blesses that exact mutation).
      if (!ent || !ent.data || !ent.data.jobId || ent.data.ceresActivityCast === true
        || (ent.data.activityActorSlotId && ent.data.activityActorSlotId !== CHARON_SUPPLY.salvor)) continue;
      const entry = getJob(ent.data.jobId);
      const job = entry && entry.job;
      if (!job || job.corrupt) {
        // The job entry dropped or went corrupt under a live hull, but its claim stamps —
        // the source record's claimId and the body's salvorClaimedBy — outlive it and would
        // lock the body until this salvor dies. Release both exactly as the despawn path
        // does, then drop the dead reference so the hull can take fresh work and a later
        // cutter (or the player) can take the body.
        const worldRecordId = typeof ent.data.worldRecordId === 'string' && ent.data.worldRecordId
          ? ent.data.worldRecordId
          : null;
        if (worldRecordId) {
          const sourceKey = typeof ent.data.salvageSource === 'string' && ent.data.salvageSource
            ? ent.data.salvageSource
            : null;
          if (sourceKey) this._releaseSalvageSourceClaim({ sourceKey }, worldRecordId);
          forEachJobInteractable(this.state, (body) => {
            if (body && body.data && body.data.salvorClaimedBy === worldRecordId) {
              this._clearSalvorClaim(body, worldRecordId);
            }
          });
        }
        delete ent.data.jobId;
        // The phase/progress mirrors die with the binding (the same strip
        // _sweepJobOwnedPersistence applies): a stale jobPhase on a jobless hull would
        // still read WORK · <phase> on the hail and target readout.
        if (ent.data.jobPhase !== undefined) delete ent.data.jobPhase;
        if (ent.data.jobProgress !== undefined) delete ent.data.jobProgress;
        continue;
      }
      if (job.kind !== 'salvor') continue;

      const held = ent.data.cargoManifest;
      if (held?.salvageIntakeHeld && held.totalQty > 0) {
        const yardId = job.route?.[0]?.id?.slice(5);
        const intakeOwner = this._registry?.get('economy');
        // A refused remainder stays on its actual cutter at the yard. It is not another cut,
        // delivered freight, or a second custody store. Retry when the existing receiver can
        // genuinely take something (including a legacy scrap-only receipt's electronics).
        job.phase = NPC_JOB_PHASE.UNLOAD; job.routeIndex = 0; job.progress = 0;
        if (intakeOwner?.quoteNpcSalvageIntake(yardId, held.lines)?.ok) delete held.salvageIntakeHeld;
        continue;
      }
      const site = job.route && job.route[1];
      const source = this._salvageSourceBindingFromPayload(job.payload);
      rec.generalSalvor = true;
      ent.data.generalSalvor = true;
      ent.data.jobKind = 'salvor';
      if (source) {
        ent.data.salvageSource = source.sourceKey;
        ent.data.salvagePointId = source.salvagePointId || null;
      }
      const target = site ? this._resolveSalvorTargetFromWaypoint(site.id, job.payload) : null;
      const hasCargo = !!(ent.data.cargoManifest
        && Array.isArray(ent.data.cargoManifest.lines)
        && ent.data.cargoManifest.totalQty > 0);
      // Retarget only before source work. An empty home APPROACH must finish unloading/release,
      // not restart RETURN every time the hull reaches its yard.
      const beforeClaim = !hasCargo
        && (job.phase === NPC_JOB_PHASE.COMMISSION
          || job.phase === NPC_JOB_PHASE.TRANSIT
          || (job.phase === NPC_JOB_PHASE.APPROACH && job.routeIndex === 1)
          || job.phase === NPC_JOB_PHASE.WORK);
      if (!beforeClaim) continue;
      if (target && this._isSalvageableBody(target)
        && (!this._salvorClaimantOf(target) || this._salvorClaimantOf(target) === ent.data.worldRecordId)) {
        // Continue rematerializes the durable source with a new numeric entity id. Keep the job's
        // save-stable key, then refresh only the volatile waypoint/id/position from the live wreck.
        if (site) site.id = `${target.type === 'payload' ? 'payload' : 'hulk'}:${target.id}`;
        job.payload.targetId = target.id;
        if (site.pos && target.pos) {
          site.pos.x = target.pos.x;
          site.pos.z = target.pos.z;
        }
        continue;
      }

      // A shelved workpiece is unavailable, not lost. Never spend its pool virtually or
      // assign another source while the same finite body waits for native residency.
      if (!target && this._salvorSourceShelved(job.payload)) continue;
      // Release claim on the missing body and try another.
      if (target) this._clearSalvorClaim(target, ent.data.worldRecordId);
      if (source) this._releaseSalvageSourceClaim(source, ent.data.worldRecordId);
      const next = this._pickUnclaimedSalvageTarget(ent);
      if (next && site) {
        // A competing reservation is a refusal, not proof that the current work was lost.
        // Keep its job/custody intact and retry; only an admitted source resets the cut below.
        if (!this._stampSalvorClaim(next, ent.data.worldRecordId)) continue;
        const kind = next.type === 'payload' ? 'payload' : 'hulk';
        const nextSource = this._salvageSourceBinding(next);
        site.id = `${kind}:${next.id}`;
        site.pos = { x: next.pos.x, z: next.pos.z };
        site.label = kind === 'payload' ? 'Loose Cargo' : 'Hulk';
        job.payload = {
          targetId: next.id,
          targetType: next.type,
          ...(!nextSource ? { targetKey: this._salvorTargetKey(next) } : {}),
          ...(nextSource ? {
            salvageSource: nextSource.sourceKey,
            salvagePointId: nextSource.salvagePointId,
          } : {}),
          extracted: false,
        };
        if (nextSource) {
          ent.data.salvageSource = nextSource.sourceKey;
          ent.data.salvagePointId = nextSource.salvagePointId || null;
        } else {
          delete ent.data.salvageSource;
          delete ent.data.salvagePointId;
        }
        // New target, new cut. A retarget never inherits work already spent on another hull.
        job.phase = NPC_JOB_PHASE.TRANSIT; job.routeIndex = 0; job.progress = 0;
        continue;
      }
      // Nothing left — keep flying the empty cycle home rather than inventing a second mover.
      job.payload = { ...job.payload, extracted: false, sourceUnavailable: true };
      job.phase = NPC_JOB_PHASE.RETURN; job.routeIndex = 1; job.progress = 0;
    }
  },
};
