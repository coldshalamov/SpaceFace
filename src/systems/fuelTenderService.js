// Plan 18 physical fuel-tender service.
//
// This owner does not move either hull and never writes player fuel. It observes the ordinary
// npcJobs/Flight/Rapier bodies, requires a settled physical rendezvous, and submits one bounded
// transfer intent to economy. The finite lot lives in the tender's world-record cargo manifest,
// so sector transitions and Continue preserve fuel already taken without a second save owner.

import {
  CERES_ACTIVITY_SECTOR_ID,
  CERES_FUEL_TENDER_SERVICE,
} from '../data/sectorActivityPockets.js';

const TENDER_SLOT_ID = 'ceres_refinery_tender';

function speedBetween(a, b) {
  return Math.hypot(
    (a?.vel?.x || 0) - (b?.vel?.x || 0),
    (a?.vel?.z || 0) - (b?.vel?.z || 0),
  );
}

function distanceBetween(a, b) {
  return Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
}

export const fuelTenderService = {
  name: 'fuelTenderService',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this._resetContact();
    this._unsub = [
      this.bus.on('entity:killed', (payload) => {
        if (payload?.id === this._tenderId) this._interrupt('tender_destroyed');
      }),
      this.bus.on('sector:exit', () => this._interrupt('sector_exit')),
      this.bus.on('save:restoring', () => this._resetContact()),
    ];
  },

  newGame() {
    this._resetContact();
  },

  update(dt, state) {
    if (state.mode !== 'flight' || state.world?.currentSectorId !== CERES_ACTIVITY_SECTOR_ID) {
      this._interrupt('route_unavailable');
      return;
    }
    const player = state.entities?.get?.(state.playerId);
    const tender = this._findTender(state);
    if (!player || player.alive === false || !tender) {
      this._interrupt(tender ? 'player_unavailable' : 'tender_unavailable');
      return;
    }
    if (!this._jobCanServe(state, tender)) {
      this._interrupt('job_interrupted');
      return;
    }

    const service = CERES_FUEL_TENDER_SERVICE;
    const distanceWU = distanceBetween(player, tender);
    const relativeSpeedWUPerS = speedBetween(player, tender);
    if (distanceWU > service.rendezvousRadiusWU) {
      this._interrupt('out_of_range');
      return;
    }
    if (relativeSpeedWUPerS > service.maxRelativeSpeedWUPerS) {
      this._interrupt('relative_speed');
      return;
    }

    if (this._tenderId !== tender.id) {
      this._resetContact();
      this._tenderId = tender.id;
      this.bus.emit('fuelTender:rendezvousStarted', {
        serviceId: service.id,
        tenderId: tender.id,
        playerId: player.id,
        distanceWU,
        relativeSpeedWUPerS,
      });
    }

    const step = Number.isFinite(dt) ? Math.max(0, Math.min(0.25, dt)) : 0;
    this._holdS += step;
    if (this._holdS < service.settleTimeS) return;
    if (!this._readyEmitted) {
      this._readyEmitted = true;
      this.bus.emit('fuelTender:rendezvousReady', {
        serviceId: service.id,
        tenderId: tender.id,
        playerId: player.id,
      });
    }

    this._transferAccumS += step;
    const intervalS = service.transferQuantumUnits / service.transferRateUnitsPerS;
    if (this._transferAccumS + 1e-9 < intervalS) return;
    this._transferAccumS -= intervalS;

    const request = {
      serviceId: service.id,
      tenderId: tender.id,
      playerId: player.id,
      amount: service.transferQuantumUnits,
      result: null,
    };
    this.bus.emit('fuelTender:transferRequested', request);
    if (!request.result?.accepted) {
      const terminal = request.result?.reason === 'empty' || request.result?.reason === 'tank_full';
      if (terminal) {
        this.bus.emit('fuelTender:completed', {
          serviceId: service.id,
          tenderId: tender.id,
          playerId: player.id,
          reason: request.result.reason,
        });
        this._resetContact();
      } else {
        this._interrupt(request.result?.reason || 'transfer_rejected');
      }
      return;
    }

    if (request.result.remainingUnits <= 0 || request.result.fuelCurrent >= request.result.fuelMax) {
      this.bus.emit('fuelTender:completed', {
        serviceId: service.id,
        tenderId: tender.id,
        playerId: player.id,
        reason: request.result.remainingUnits <= 0 ? 'empty' : 'tank_full',
      });
      this._resetContact();
    }
  },

  _findTender(state) {
    const entities = state.entityList || [];
    for (let index = 0; index < entities.length; index += 1) {
      const entity = entities[index];
      if (entity?.alive !== false
        && entity?.data?.activityActorSlotId === TENDER_SLOT_ID
        && entity.data.durable === true
        && entity.data.worldRecordId) return entity;
    }
    return null;
  },

  _jobCanServe(state, tender) {
    const jobId = tender.data?.jobId;
    const entry = jobId && state.npcJobs?.byId?.[jobId];
    const phase = entry?.job?.phase;
    return !!entry && entry.entityId === tender.id && entry.job?.kind === 'tender'
      && phase !== 'flee' && phase !== 'complete';
  },

  _interrupt(reason) {
    if (this._tenderId != null) {
      this.bus.emit('fuelTender:interrupted', {
        serviceId: CERES_FUEL_TENDER_SERVICE.id,
        tenderId: this._tenderId,
        playerId: this.state?.playerId ?? null,
        reason,
      });
    }
    this._resetContact();
  },

  _resetContact() {
    this._tenderId = null;
    this._holdS = 0;
    this._transferAccumS = 0;
    this._readyEmitted = false;
  },

  destroy() {
    for (const unsub of this._unsub || []) unsub?.();
    this._unsub = [];
    this._resetContact();
  },
};

export default fuelTenderService;
