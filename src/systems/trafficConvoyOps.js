// Row 413 extraction — methods moved verbatim out of traffic.js;
// spread back onto the traffic object, so `this` still binds to the system at call time.
import { makeShipEntitySpec } from './ships.js';
import { buildCargoManifest, stableManifestId } from '../economy/freightCausality.js';
import { RECORD_KIND, stableRecordId } from '../world/worldRecords.js';
import { APERTURE_GLOBAL_POS, APERTURE_ID } from '../data/environmentalMachinery.js';
import { CLAIM_CONVOY_DEPART_CLEARANCE_WU, CLAIM_CONVOY_MAX_LIVE, TRAFFIC_ROLES, entityWithWorldRecord, industryHaulRouteAims, industryHaulWaypointSpec, industryHaulerEligible, liveEntity, stableTrafficKey, stationIdentity, stationName, terminalWorldRecord } from './traffic.js';

export const trafficConvoyOps = {
  // ── Claim Trade Relay convoys (physical legs) ──────────────────────────────────────────────
  // Claims owns the ledger leg (spec.convoy); traffic owns the manifested carrier: a mule that
  // leaves the claim pad bearing the dispatched freight on a causal manifest, routed by
  // npcJobsRuntime claim → destination berth. A kill flows through the ordinary freighter-loss
  // path (scarcity pressure + freight:loss + headline); a berth-side unload is the honest
  // arrival and emits claim:convoyDocked for claims to settle. A convoy leg that no hull ever
  // manifested (player never in-sector) simply is not here — nothing modeled could touch it.
  _maintainClaimConvoys() {
    if (this._restoreEpochPending || this.state.mode !== 'flight') return;
    const bodies = this.state.claims && this.state.claims.bodies;
    const jobs = this.helpers && this.helpers.npcJobs;
    if (!bodies || !bodies.length || !jobs || typeof jobs.assign !== 'function') return;
    const sectorId = this.state.world && this.state.world.currentSectorId;
    if (!sectorId) return;
    this._ensureState();
    const stations = this._sectorStations();
    // Reap carriers whose claim-side leg is already gone (claim released, teardown, restore
    // edge): an orphaned convoy hull would otherwise linger as unexplainable traffic. Collect
    // first — teardown splices this same list.
    const orphaned = [];
    for (const rec of this.state.traffic.freighters) {
      const ent = rec && liveEntity(this.state, rec.id);
      const mark = ent && ent.data && ent.data.claimConvoy;
      if (!mark) continue;
      const body = bodies.find((b) => b && b.id === mark.bodyId);
      const live = body && body.spec && body.spec.convoy;
      if (!live || live.convoyId !== mark.convoyId) {
        orphaned.push({
          bodyId: mark.bodyId, convoyId: mark.convoyId,
          worldRecordId: ent.data.worldRecordId, entityId: ent.id, reason: 'claim_leg_gone',
        });
      }
    }
    for (const orphan of orphaned) this._teardownClaimConvoy(orphan);
    let manifested = 0;
    for (const rec of this.state.traffic.freighters) {
      const ent = rec && liveEntity(this.state, rec.id);
      if (ent && ent.data && ent.data.claimConvoy) manifested++;
    }
    for (const body of bodies) {
      const spec = body && body.spec;
      const convoy = spec && spec.id === 'spec_relay' && spec.convoy;
      if (!convoy || typeof convoy.convoyId !== 'string' || !convoy.convoyId) continue;
      if (body.owned === false || body.sectorId !== sectorId) continue;
      if (!Number.isFinite(body.x) || !Number.isFinite(body.z)) continue;
      const station = stations.find((row) => stationIdentity(row) === convoy.destStationId);
      if (!station || !station.pos) continue; // no in-sector berth — the leg stays abstract
      const worldRecordId = convoy.worldRecordId;
      if (typeof worldRecordId !== 'string' || !worldRecordId) continue;
      let entity = entityWithWorldRecord(this.state, worldRecordId);
      const record = this.state.world && this.state.world.records && this.state.world.records.byId
        ? this.state.world.records.byId[worldRecordId] : null;
      if (terminalWorldRecord(record)) continue; // claims' kill/dock paths own the conclusion
      // World residency owns an extant offscreen hull; never spawn a second copy over its record.
      if (record && !entity) continue;
      let spawned = false;
      const wasManifested = convoy.manifested === true;
      if (!entity) {
        if (manifested >= CLAIM_CONVOY_MAX_LIVE) continue;
        const budget = this.helpers.spawnBudget;
        const requester = `claim-convoy:${convoy.convoyId}`;
        // Honor the live-ship budget when it is registered; a denied slot defers the physical
        // leg (the abstract convoy keeps flying until capacity frees).
        if (budget && typeof budget.request === 'function' && budget.request(1, requester) !== 1) {
          continue;
        }
        const dx = station.pos.x - body.x;
        const dz = station.pos.z - body.z;
        const length = Math.hypot(dx, dz) || 1;
        const shipSpec = makeShipEntitySpec(TRAFFIC_ROLES.hauler.ship, {
          team: 2, factionId: (station.data && station.data.factionId) || 'faction_free',
          pos: {
            x: body.x + dx / length * CLAIM_CONVOY_DEPART_CLEARANCE_WU,
            z: body.z + dz / length * CLAIM_CONVOY_DEPART_CLEARANCE_WU,
          },
          ai: { archetype: TRAFFIC_ROLES.hauler.archetype, passive: true, spawnContext: 'convoy_civilian' },
        });
        entity = this.helpers.spawnEntity && this.helpers.spawnEntity(shipSpec);
        if (!entity) {
          if (budget && typeof budget.release === 'function') budget.release(requester);
          continue;
        }
        entity.data.worldRecordId = worldRecordId;
        entity.data.identityKey = `claim-convoy:${body.id}:${convoy.convoyId}`;
        entity.data.durable = true;
        this._stampTrafficDurableIdentity(entity, sectorId, 'hauler', TRAFFIC_ROLES.hauler, 0);
        entity.flags = { ...entity.flags, persistent: true };
        entity.data.trafficLabel = `${body.name} convoy`;
        if (budget && typeof budget.bindEntity === 'function'
          && budget.bindEntity(entity.id, requester) !== true
          && typeof budget.release === 'function') {
          // Grant stayed unbound — free it so a failed bind cannot leak a reserved slot.
          budget.release(requester);
        }
        manifested++;
        spawned = true;
      }
      // Manifestation latch + relink in one event: a fresh spawn reports itself, and a
      // rematerialized hull re-keys the leg's entityId (world residency owns id stability).
      if (convoy.manifested !== true || convoy.entityId !== entity.id) {
        this.bus.emit('claim:convoyManifested', {
          bodyId: body.id, convoyId: convoy.convoyId,
          entityId: entity.id, worldRecordId,
        });
      }
      entity.data.claimConvoy = {
        bodyId: body.id, convoyId: convoy.convoyId,
        goodId: convoy.goodId, qty: convoy.qty, destStationId: convoy.destStationId,
      };
      entity.data.itinerary = { kind: 'claim_convoy', bodyId: body.id, convoyId: convoy.convoyId };
      let rec = this.state.traffic.freighters.find((row) => row && row.id === entity.id);
      if (!rec) {
        rec = {
          id: entity.id, role: 'hauler', targetId: station.id,
          waitT: 0, nextTradeT: 0, orbitPhase: 0, dockSeq: 0,
          manifest: entity.data.cargoManifest || null,
        };
        this.state.traffic.freighters.push(rec);
        if (!this._active.includes(entity.id)) this._active.push(entity.id);
      }
      // The hold IS the dispatched freight — one causal manifest line, keyed to the convoy's
      // durable identity. Stocking happens at first manifestation (fresh spawn or a pre-latch
      // adoption); after that an empty or missing hold stays empty — freight spilled under fire
      // is never silently re-topped by the next maintenance pass.
      const manifestId = this._claimConvoyManifestId(worldRecordId);
      const aboard = entity.data.cargoManifest;
      if (aboard ? aboard.manifestId !== manifestId : (spawned || !wasManifested)) {
        this._setTrafficManifest(entity, rec, this._claimConvoyManifest(convoy, worldRecordId));
      }
      // Idempotent every pass: assign() is keyed job:<worldRecordId> — an existing job returns
      // immediately, a rematerialized hull relinks to its retained job, and a lost runtime job
      // (shelved hull carrying a persisted jobId) is rebuilt on the same deterministic route.
      const depotPoint = {
        id: `claim:${body.id}`, pos: { x: body.x, z: body.z },
        label: `${body.name} Pad`,
      };
      const stationPoint = {
        id: `dest:${convoy.destStationId}`,
        targetRef: `station:${convoy.destStationId}`,
        pos: { x: station.pos.x, z: station.pos.z },
        label: `${stationName(station, 'Station')} Berth`,
      };
      jobs.assign(entity, {
        kind: 'hauler', sectorId, route: [depotPoint, stationPoint],
        payload: {
          manifest: entity.data.cargoManifest,
          claimConvoy: {
            bodyId: body.id, convoyId: convoy.convoyId, destStationId: convoy.destStationId,
          },
        },
      });
    }
  },

  /** Deterministic manifest identity for a claim convoy leg (stable per durable record id). */
  _claimConvoyManifestId(worldRecordId) {
    const seed = (this.state.meta && this.state.meta.seed) || 1;
    return stableManifestId(seed >>> 0 || 1, worldRecordId, 'hauler');
  },

  _claimConvoyManifest(convoy, worldRecordId) {
    const seed = (this.state.meta && this.state.meta.seed) || 1;
    const qty = Math.max(1, Math.floor(Number(convoy && convoy.qty) || 0));
    const manifest = buildCargoManifest({
      seed, freighterKey: worldRecordId, role: 'hauler',
      marketKeys: [convoy.goodId], capacity: qty,
    });
    // The convoy carries exactly what the relay pulled from its store — the builder's seeded
    // line split is overridden the same way the miner manifest is, keeping the stable identity.
    manifest.lines = [{ commodityId: convoy.goodId, qty }];
    manifest.totalQty = qty;
    manifest.claimConvoyId = convoy.convoyId;
    manifest.claimBodyId = convoy.bodyId || null;
    return manifest;
  },

  /**
   * npcjobs:unload for a claim convoy (payload.claimConvoy marks the job). Identity-checked the
   * same way the depot unload is: the intent's jobId must resolve to the exact entity carrying
   * the matching claimConvoy stamp. Emits claim:convoyDocked (claims settles the sale), then
   * retires the carrier — the run is the work; a berthed convoy has no second leg.
   */
  _unloadClaimConvoy(intent) {
    const marker = intent && intent.payload && intent.payload.claimConvoy;
    if (!marker || intent.completed !== true) return false;
    const context = this._jobTrafficContext(intent, 'hauler', ['hauler']);
    if (!context) return false;
    const ent = context.entity;
    const stamp = ent.data && ent.data.claimConvoy;
    if (!stamp || stamp.convoyId !== marker.convoyId || stamp.bodyId !== marker.bodyId) return false;
    // The hull's stamped berth is authoritative — an intent that names a different
    // destination station (or a payload that claims one) must not settle the leg.
    if (marker.destStationId && marker.destStationId !== stamp.destStationId) return false;
    const destination = typeof intent.destination === 'string' ? intent.destination : '';
    if (destination !== `dest:${stamp.destStationId}`) return false;
    const manifest = ent.data.cargoManifest || (context.rec && context.rec.manifest);
    let aboard = 0;
    for (const line of (manifest && manifest.lines) || []) {
      if (line && line.commodityId === stamp.goodId) aboard += Math.max(0, Math.floor(Number(line.qty) || 0));
    }
    this.bus.emit('claim:convoyDocked', {
      bodyId: marker.bodyId, convoyId: marker.convoyId,
      stationId: stamp.destStationId, goodId: stamp.goodId,
      qty: aboard, entityId: ent.id,
    });
    this._teardownClaimConvoy({
      bodyId: marker.bodyId, convoyId: marker.convoyId,
      worldRecordId: context.worldRecordId, entityId: ent.id,
      jobId: context.jobId, reason: 'convoy_docked',
    });
    return true;
  },

  /**
   * Retire a claim convoy carrier: release its job, remove the hull, drop the freighter row,
   * and settle the durable record so a concluded leg never rematerializes. Idempotent — safe on
   * already-gone hulls and already-cleared rows.
   */
  _teardownClaimConvoy(payload = {}) {
    const ent = (payload.entityId != null && liveEntity(this.state, payload.entityId))
      || (payload.worldRecordId && entityWithWorldRecord(this.state, payload.worldRecordId));
    if (ent && ent.data && ent.data.jobId) {
      const release = this.helpers && this.helpers.npcJobs && this.helpers.npcJobs.release;
      if (typeof release === 'function') release(ent.data.jobId);
    }
    if (payload.jobId) {
      const release = this.helpers && this.helpers.npcJobs && this.helpers.npcJobs.release;
      if (typeof release === 'function') release(payload.jobId);
    }
    // Teardown is a removal, not a kill — no entity:destroyed receipt frees the spawn slot, so
    // release the convoy's reservation explicitly (both entry points are idempotent).
    const budget = this.helpers && this.helpers.spawnBudget;
    if (budget && ent && typeof budget.releaseEntity === 'function') budget.releaseEntity(ent.id);
    if (budget && payload.convoyId && typeof budget.release === 'function') {
      budget.release(`claim-convoy:${payload.convoyId}`);
    }
    if (ent) {
      ent.alive = false;
      ent.ttl = 0;
      const despawn = this.helpers && (this.helpers.despawnEntity || this.helpers.removeEntity);
      if (typeof despawn === 'function') despawn(ent.id);
    }
    // The durable record is the anti-respawn latch: without it a shelved convoy would pop back
    // into the sector next entry as unexplained freight. A stub keeps the delivered outcome on
    // record even for a hull that was never shelved long enough to earn a bag entry.
    const world = this._registry && typeof this._registry.get === 'function'
      ? this._registry.get('world') : null;
    if (world && typeof world.markWorldRecordDestroyed === 'function' && payload.worldRecordId) {
      const sectorId = (ent && (ent.homeSectorId || (ent.data && ent.data.homeSectorId)))
        || (this.state.world && this.state.world.currentSectorId) || null;
      world.markWorldRecordDestroyed(payload.worldRecordId, {
        outcome: payload.reason === 'convoy_docked' ? 'delivered' : 'destroyed',
        pos: ent && ent.pos ? { x: ent.pos.x, z: ent.pos.z } : undefined,
        stub: sectorId && ent && ent.pos ? {
          kind: RECORD_KIND.CONVOY,
          sectorId,
          pos: { x: ent.pos.x, z: ent.pos.z },
          type: 'ship',
          shipDefId: (ent.data && ent.data.defId) || 'ship_mule',
          team: 2,
          trafficRole: 'hauler',
          trafficLabel: (ent.data && ent.data.trafficLabel) || null,
          identityKey: (ent.data && ent.data.identityKey) || null,
          itinerary: (ent.data && ent.data.itinerary) || null,
          cargoManifest: (ent.data && ent.data.cargoManifest) || null,
        } : undefined,
      });
    }
    const list = this.state.traffic && this.state.traffic.freighters;
    if (Array.isArray(list)) {
      for (let i = list.length - 1; i >= 0; i--) {
        const rec = list[i];
        if (!rec) continue;
        if (ent && rec.id === ent.id) { list.splice(i, 1); continue; }
        const recEnt = rec.id != null && this.state.entities && this.state.entities.get(rec.id);
        const mark = recEnt && recEnt.data && recEnt.data.claimConvoy;
        if (mark && mark.convoyId === payload.convoyId) list.splice(i, 1);
      }
    }
    if (ent && Array.isArray(this._active)) {
      const idx = this._active.indexOf(ent.id);
      if (idx >= 0) this._active.splice(idx, 1);
    }
    return true;
  },

  // PQ-145.00: one supply hauler per owned claim, using the SAME durable hull/job owners as
  // ordinary traffic. Inbound supplies are consumed at the depot; the return berth run is empty.
  // No abstract income, new movement writer, or Throughline requirement. Dispatch is a one-second
  // lifecycle pass; the job runtime alone drives the live ship between these physical endpoints.
  _maintainClaimDepotTraffic() {
    if (this._restoreEpochPending || this.state.mode !== 'flight') return;
    const bodies = this.state.claims?.bodies;
    if (!bodies?.length || !this.helpers?.npcJobs?.assign) return;
    const sectorId = this.state.world?.currentSectorId;
    const stations = this._sectorStations();
    if (!stations.length) return;
    const services = this.state.traffic.depotServices || (this.state.traffic.depotServices = []);
    const now = this.state.simTime || 0;
    for (const body of bodies) {
      if (body.owned === false || body.sectorId !== sectorId
        || !Number.isFinite(body.x) || !Number.isFinite(body.z)) continue;
      let service = services.find((row) => row.bodyId === body.id);
      let station = service && stations.find((row) => stationIdentity(row) === service.stationId);
      if (!service) {
        station = stations.reduce((best, row) => !best
          || Math.hypot(row.pos.x - body.x, row.pos.z - body.z)
            < Math.hypot(best.pos.x - body.x, best.pos.z - body.z) ? row : best, null);
        if (!station) continue;
        service = {
          bodyId: body.id, stationId: stationIdentity(station), generation: 0,
          legSeq: 0, nextDispatchAt: now, watchAt: now + 12,
          watchResolved: false, deliveredU: 0,
        };
        services.push(service);
      }
      if (!station || now < service.nextDispatchAt) continue;
      const worldRecordId = stableRecordId(this.state.meta?.seed || 1, sectorId,
        RECORD_KIND.CONVOY, `claim-depot:${body.id}:${service.generation}`);
      let entity = entityWithWorldRecord(this.state, worldRecordId);
      const record = this.state.world?.records?.byId?.[worldRecordId];
      if (terminalWorldRecord(record)) {
        service.generation += 1;
        service.legSeq = 0;
        service.nextDispatchAt = now + 30;
        continue;
      }
      // World residency owns an extant offscreen hull; never spawn a second copy over its record.
      if (record && !entity) continue;
      if (!entity) {
        const dx = body.x - station.pos.x;
        const dz = body.z - station.pos.z;
        const length = Math.hypot(dx, dz) || 1;
        const berth = (station.radius || 50) + 70;
        const spec = makeShipEntitySpec(TRAFFIC_ROLES.hauler.ship, {
          team: 2, factionId: station.data?.factionId || 'faction_free',
          pos: { x: station.pos.x + dx / length * berth, z: station.pos.z + dz / length * berth },
          ai: { archetype: TRAFFIC_ROLES.hauler.archetype, passive: true, spawnContext: 'convoy_civilian' },
        });
        entity = this.helpers.spawnEntity(spec);
        if (!entity) continue;
        entity.data.worldRecordId = worldRecordId;
        entity.data.identityKey = `claim-depot:${body.id}:${service.generation}`;
        entity.data.durable = true;
        entity.data.claimDepotId = body.id;
        this._stampTrafficDurableIdentity(entity, sectorId, 'hauler', TRAFFIC_ROLES.hauler, 0);
        entity.flags = { ...entity.flags, persistent: true };
        entity.data.trafficLabel = `${body.name} supply hauler`;
      }
      // World records retain itinerary and cargo, while transient entity tags are reconstructed.
      entity.data.claimDepotId = body.id;
      entity.data.itinerary = { kind: 'claim_depot', bodyId: body.id };
      if (!entity.flags?.persistent) entity.flags = { ...entity.flags, persistent: true };
      let rec = this.state.traffic.freighters.find((row) => row.id === entity.id);
      if (!rec) {
        rec = { id: entity.id, role: 'hauler', targetId: station.id,
          waitT: 0, nextTradeT: 0, orbitPhase: 0, dockSeq: 0,
          manifest: entity.data.cargoManifest || null };
        this.state.traffic.freighters.push(rec);
        if (!this._active.includes(entity.id)) this._active.push(entity.id);
      }
      if (!entity.data.jobId) {
        const inbound = service.legSeq % 2 === 0;
        const manifest = inbound
          ? this._assignManifest(entity, 'hauler', station, sectorId)
          : { lines: [], totalQty: 0, totalValue: 0 };
        this._setTrafficManifest(entity, rec, manifest);
        const stationPoint = { id: `dest:${service.stationId}`, targetRef: `station:${service.stationId}`,
          pos: { x: station.pos.x, z: station.pos.z }, label: `${stationName(station, 'Station')} → ${body.name}` };
        const depotPoint = { id: `depot:${body.id}`, pos: { x: body.x, z: body.z },
          label: `${body.name} → ${stationName(station, 'Station')}` };
        this.helpers.npcJobs.assign(entity, {
          kind: 'hauler', sectorId, route: inbound ? [stationPoint, depotPoint] : [depotPoint, stationPoint],
          payload: { manifest, claimDepot: { bodyId: body.id, legSeq: service.legSeq } },
        });
      }
      if (!service.watchResolved && now >= service.watchAt) {
        const requested = this._depotWatchRequested || (this._depotWatchRequested = new Set());
        if (!requested.has(body.id)) {
          const director = this._registry?.get('encounterDirector');
          const result = director?.requestAuthoredEncounter({
            shapeId: 'ambush_snare', encounterId: `depot-watch:${body.id}`, sectorId,
            anchor: { x: station.pos.x + (body.x - station.pos.x) * 0.75,
              z: station.pos.z + (body.z - station.pos.z) * 0.75 },
            zoneId: `depot-route:${body.id}`, zoneName: `${body.name} supply route`,
            zoneType: 'ambush_lane', zoneRadius: 240, force: true,
            data: { claimDepotId: body.id },
          });
          if (result?.ok) requested.add(body.id);
        }
      }
    }
  },

  _unloadClaimDepot(intent) {
    const marker = intent?.payload?.claimDepot;
    if (!marker || intent.completed !== true) return false;
    const context = this._jobTrafficContext(intent, 'hauler', ['hauler']);
    const service = this.state.traffic.depotServices?.find((row) => row.bodyId === marker.bodyId);
    const job = context && this.helpers.npcJobs.get(context.jobId)?.job;
    if (!context || !service || marker.legSeq !== service.legSeq
      || job?.payload?.claimDepot?.bodyId !== marker.bodyId
      || job.payload.claimDepot.legSeq !== marker.legSeq
      || context.entity.data.claimDepotId !== service.bodyId) return false;
    const inbound = service.legSeq % 2 === 0;
    if (intent.destination !== (inbound ? `depot:${service.bodyId}` : `dest:${service.stationId}`)) return false;
    // Commit before emitting: duplicate/reentrant completion cannot consume the same supplies twice.
    const qty = inbound ? Math.max(0, context.entity.data.cargoManifest?.totalQty || 0) : 0;
    service.deliveredU += qty;
    service.legSeq += 1;
    this._setTrafficManifest(context.entity, context.rec, { lines: [], totalQty: 0, totalValue: 0 });
    this.bus.emit('claim:freightDelivered', { bodyId: service.bodyId, inbound, quantity: qty });
    return true;
  },

  /**
   * A full depot or a jammed aperture asked for one haul. Bind an idle hauler, or
   * retask one plain hauler run, onto that source → destination route through the
   * existing job kernel. The receipt stays empty until that job and its actor both exist.
   */
  _onIndustryHaulRequested(payload) {
    const receipt = payload && payload.receipt;
    if (!receipt || typeof receipt !== 'object') return;
    if (typeof receipt.jobId === 'string' && receipt.jobId && receipt.entityId != null) return;
    const kind = payload.kind === 'redirect' || payload.kind === 'repair-parts' ? payload.kind : null;
    const sourceId = typeof payload.sourceId === 'string' ? payload.sourceId : '';
    const destinationId = typeof payload.destinationId === 'string' ? payload.destinationId : '';
    const commodityId = typeof payload.commodityId === 'string' ? payload.commodityId : '';
    const qty = Math.floor(Number(payload.qty));
    if (!kind || !sourceId || !destinationId || sourceId === destinationId
      || !commodityId || !Number.isSafeInteger(qty) || qty <= 0) return;

    this._ensureState();
    if (!this._industryHaulDispatched) this._industryHaulDispatched = new Map();
    const key = `${kind}|${sourceId}|${destinationId}|${commodityId}|${qty}`;
    const remembered = this._recalledIndustryHaul(key, sourceId, destinationId);
    if (remembered) {
      receipt.jobId = remembered.jobId;
      receipt.entityId = remembered.entityId;
      return;
    }

    const source = this._industryHaulPoint(sourceId);
    const destination = this._industryHaulPoint(destinationId);
    if (!source || !destination) return;
    const chosen = this._idleIndustryHauler();
    if (!chosen) return;
    const assign = this.helpers && this.helpers.npcJobs && this.helpers.npcJobs.assign;
    const getJob = this.helpers && this.helpers.npcJobs && this.helpers.npcJobs.get;
    if (typeof assign !== 'function' || typeof getJob !== 'function') return;

    const sectorId = (this.state.world && this.state.world.currentSectorId) || null;
    const jobId = assign(chosen.entity, {
      kind: 'hauler',
      sectorId,
      speed: TRAFFIC_ROLES.hauler.speed,
      route: [
        industryHaulWaypointSpec(sourceId, source, 'origin'),
        industryHaulWaypointSpec(destinationId, destination, 'dest'),
      ],
      payload: {
        haulKind: kind,
        commodityId,
        qty,
        sourceId,
        destinationId,
      },
    });
    if (typeof jobId !== 'string' || !jobId) return;
    const entry = getJob(jobId);
    const job = entry && entry.job;
    if (!job || job.kind !== 'hauler' || job.corrupt === true || entry.entityId !== chosen.entity.id) return;
    if (!industryHaulRouteAims(job.route, sourceId, source.pos, destinationId, destination.pos)) return;
    const actor = liveEntity(this.state, chosen.entity.id);
    if (!actor || !actor.data || actor.data.jobId !== jobId) return;

    this._industryHaulDispatched.set(key, { jobId, entityId: actor.id });
    receipt.jobId = jobId;
    receipt.entityId = actor.id;
  },

  _recalledIndustryHaul(key, sourceId, destinationId) {
    const remembered = this._industryHaulDispatched && this._industryHaulDispatched.get(key);
    if (!remembered || typeof remembered.jobId !== 'string') return null;
    const getJob = this.helpers && this.helpers.npcJobs && this.helpers.npcJobs.get;
    if (typeof getJob !== 'function') return null;
    const entry = getJob(remembered.jobId);
    const job = entry && entry.job;
    const actor = liveEntity(this.state, remembered.entityId);
    if (!job || job.kind !== 'hauler' || job.corrupt === true || !actor || !actor.data
      || actor.data.jobId !== remembered.jobId) return null;
    const source = this._industryHaulPoint(sourceId);
    const destination = this._industryHaulPoint(destinationId);
    if (!source || !destination
      || !industryHaulRouteAims(job.route, sourceId, source.pos, destinationId, destination.pos)) {
      return null;
    }
    return remembered;
  },

  _industryHaulPoint(pointId) {
    if (pointId === APERTURE_ID) {
      return {
        pos: { x: APERTURE_GLOBAL_POS.x, z: APERTURE_GLOBAL_POS.z },
        label: 'Hangar aperture',
        targetRef: `site:${APERTURE_ID}`,
      };
    }
    const station = this._sectorStations().find((row) => stationIdentity(row) === pointId);
    if (!station || !station.pos || !Number.isFinite(station.pos.x) || !Number.isFinite(station.pos.z)) return null;
    const id = stationIdentity(station);
    return {
      pos: { x: station.pos.x, z: station.pos.z },
      label: stationName(station, id),
      targetRef: `station:${id}`,
    };
  },

  _idleIndustryHauler() {
    const jobs = this.helpers && this.helpers.npcJobs;
    const getJob = jobs && jobs.get;
    const rows = (this.state.traffic && this.state.traffic.freighters) || [];
    const idle = [];
    for (let i = 0; i < rows.length; i++) {
      const rec = rows[i];
      const entity = liveEntity(this.state, rec && rec.id);
      if (!rec || !entity || !industryHaulerEligible(rec, entity)) continue;
      const worldRecordId = entity.data.worldRecordId;
      const existingId = typeof entity.data.jobId === 'string' ? entity.data.jobId : null;
      const entry = typeof getJob === 'function'
        ? (existingId && getJob(existingId)) || getJob(`job:${worldRecordId}`)
        : null;
      // A hauler already on a run stays on it. The depot marker waits for an idle hull.
      if (existingId || entry) continue;
      idle.push({ rec, entity });
    }
    if (!idle.length) return null;
    idle.sort((a, b) => stableTrafficKey(a.entity).localeCompare(stableTrafficKey(b.entity)));
    return idle[0];
  },
};
