import { createLatchArrivalVerifier } from '../core/latchNineArrivalEvidence.js';
import { createLatchTenderOwner } from './latchNineTender.js';
import { LATCH_NINE_RELEASE_PROMOTED } from '../data/latchNine.js';
import { deferSectorEnterMaterialization } from '../core/sectorEnterDefer.js';
import { stepLatchPropulsion, forgetLatchPropulsion } from './latchNinePropulsion.js';
import { dockIntentStatus } from '../core/dockIntent.js';
// SF20-01 normal-route observer. Presentation is admitted only for the accepted authored
// tender; this owner neither spawns one nor changes docking, inputs, law, money or physics.
import { createLatchNineService, LATCH_NINE_STATION_ID, LATCH_NINE_ACK_S } from './latchNineService.js';
import { resolveLatchNinePresence } from '../data/latchNine.js';

export function createLatchNineRuntime({ presenceResolver = resolveLatchNinePresence, promoted = () => LATCH_NINE_RELEASE_PROMOTED } = {}) {
  return {
    name: 'latchNine',
    init(ctx) {
      this.destroy();
      ctx.helpers ||= {};
      this.state = ctx.state;
      this.bus = ctx.bus;
      this._service = createLatchNineService();
      this._arrivalVerifier=createLatchArrivalVerifier(this.state);
      this._tenderOwner = createLatchTenderOwner(ctx,{promoted,memory:()=>this._service.serialize()});
      this._cookProvider=()=>this._tenderOwner?.sync();
      (ctx.helpers.sectorCookProviders||(ctx.helpers.sectorCookProviders=[])).push(this._cookProvider);
      this.helpers=ctx.helpers;
      this._unsubs = [];
      this._departing = false;
      this._tender = null;
      this._tenderLife = null;
      this._destroyedLife = null;
      this._ackRemaining = 0;
      this._lastPhase = 'OFF_DUTY';
      this._lastDocked = this.state.ui?.docked === true;
      const on = (event, handler) => {
        const off = this.bus?.on(event, handler);
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('dock:committed', payload => {
        if (payload?.stationId !== LATCH_NINE_STATION_ID
          || this.state.ui?.docked !== true || this.state.ui.dockedStationId !== LATCH_NINE_STATION_ID) return;
        const committedDock = dockIntentStatus(this.state, payload) === 'current';
        const clean=committedDock?this._arrivalVerifier.issue(this._tender,payload):null;
        this._sync({ committedDock });
        if(this.state.latchNine?.phase==='ACKNOWLEDGE'){if(clean)this._service.recordCleanArrival(clean);this._arrivalVerifier.finishArrival();}
      });
      on('entity:killed', payload => {
        if (payload?.id === this._tenderOwner?.entity?.id || payload?.id === this._tender?.id) { this._recordTenderDestruction(); this._sync(); }
      });
      on('law:incidentOpened', payload => {
        const player=this.state.entities?.get(this.state.playerId),id=payload?.id;
        const incident=Object.values(this.state.lawSecurity?.incidents||{}).find(row=>row?.id===id);
        const station=incident&&this.state.entities?.get(incident.stationEntityId);
        if(!Number.isSafeInteger(player?.occupantGeneration)||!Number.isSafeInteger(station?.occupantGeneration)||!incident||incident.stationId!==LATCH_NINE_STATION_ID||incident.attackerId!==player?.id||incident.attackerGeneration!==player?.occupantGeneration||incident.stationGeneration!==station?.occupantGeneration||station?.data?.stationId!==LATCH_NINE_STATION_ID)return;
        this._service.recordIncident(id);this._arrivalVerifier.taint();
      });
      on('dock:denied', payload => {
        this._service.revoke(payload?.stationId);this._arrivalVerifier.reset();
        if (payload?.stationId === LATCH_NINE_STATION_ID) this._sync();
      });
      on('sector:exit', () => { this._departing = true;this._tender=null;this._tenderLife=null;this._tenderOwner.departing=true;this._tenderOwner.clear(); this._service.invalidate(); this._sync(); });
      on('sector:enter', payload => {
        if (payload?.sectorId && payload.sectorId !== this.state.world?.currentSectorId) return;
        if (payload?.enterEpoch != null && this.state.world?.enterSerial != null
          && payload.enterEpoch !== this.state.world.enterSerial) return;
        this._departing = false;this._tenderOwner.departing=false;
        if(!deferSectorEnterMaterialization(this.state,payload,this._cookProvider))this._tenderOwner.sync();
        this._service.invalidate(); this._sync();
      });
      on('save:loaded', () => { this._tenderOwner.departing=false;this._tenderOwner.sync();this._departing = false; this._service.invalidate(); this._sync(); });
      this._sync();
    },
    newGame() {
      this._arrivalVerifier?.reset();
      this._tenderOwner?.clear();
      this._service = createLatchNineService();
      this._tender = null; this._tenderLife = null; this._destroyedLife = null;
      this._departing = false; this._ackRemaining = 0; this._lastPhase = 'OFF_DUTY';
      if (this.state) this.state.latchNine = this._service.readout;
    },
    _recordTenderDestruction() {
      // Spawn ownership survives disabled/cold presentation; current control eligibility does not.
      const tender = this._tenderOwner?.entity || this._tender;
      const life = this._tenderOwner?.entity ? this._tenderOwner.life : this._tenderLife;
      if (this._departing || !tender || this.state.entities?.get(tender.id) !== tender
        || tender.occupantGeneration !== life
        || !(tender.hull <= 0)
        || (this._destroyedLife?.tender === tender && this._destroyedLife.life === life)) return;
      this._destroyedLife = { tender, life };
      this._service.markDestroyed();
    },
    _sync({ committedDock = false, motorDt = 0 } = {}) {
      if (!this._service || !this.state) return;
      const docked = this.state.ui?.docked === true;
      if (docked && !this._lastDocked && !committedDock) this._service.invalidate();
      this._lastDocked = docked;
      this._recordTenderDestruction();
      if(!this._departing)this._tenderOwner?.sync();
      const presence = this._departing ? null : presenceResolver(this.state);
      const tender = presence?.tender || null;
      if (tender !== this._tender || tender?.occupantGeneration !== this._tenderLife) {
        this._service.invalidate();
        if (this._tender) forgetLatchPropulsion(this._tender);
        this._tender = tender;
        this._tenderLife = tender?.occupantGeneration;
      }
      const out = this._service.update(this.state, { enabled: !!tender, recovering: presence?.recovering === true });
      if (out.phase === 'ACKNOWLEDGE' && this._lastPhase !== 'ACKNOWLEDGE') this._ackRemaining = LATCH_NINE_ACK_S;
      if (out.phase !== 'ACKNOWLEDGE') this._ackRemaining = 0;
      this._lastPhase = out.phase;
      this.state.latchNine = out;
      if(motorDt>0)this._arrivalVerifier.observe(tender,out);
      if (tender && motorDt > 0) stepLatchPropulsion(this.state, tender, motorDt);
    },
    update(dt) { this._sync({ motorDt: dt }); },
    // Cosmetic acknowledgement alone uses the existing registry keepalive's wall delta.
    // It cannot move/advance service bodies or gameplay clocks while docking pauses simTime.
    keepalive(wallDt) {
      this._sync();
      if (!(this._ackRemaining > 0) || !Number.isFinite(wallDt) || wallDt <= 0) return;
      this._ackRemaining = Math.max(0, this._ackRemaining - wallDt);
      if (this._ackRemaining === 0) { this._service.finishAcknowledgement(); this._sync(); }
    },
    dismiss() { this._service?.dismiss(); this._sync(); },
    serialize() { return this._service?.serialize() || createLatchNineService().serialize(); },
    deserialize(data) {
      this._arrivalVerifier?.reset();
      this._tenderOwner?.clear();
      if (!this._service) this._service = createLatchNineService();
      this._service.deserialize(data);
      this._tender = null; this._tenderLife = null; this._destroyedLife = null;
      this._ackRemaining = 0; this._lastPhase = 'OFF_DUTY';
      if (this.state) this.state.latchNine = this._service.readout;
    },
    destroy() {
      this._arrivalVerifier?.reset();
      this._tenderOwner?.destroy();this._tenderOwner=null;
      const providers=this.helpers?.sectorCookProviders,index=providers?.indexOf(this._cookProvider);if(index>=0)providers.splice(index,1);this._cookProvider=null;
      if (this._tender) forgetLatchPropulsion(this._tender);
      for (const off of this._unsubs || []) off();
      this._unsubs = [];
      if (this.state) delete this.state.latchNine;
      this.state = null; this.bus = null; this._service = null;
      this._tender = null; this._tenderLife = null; this._destroyedLife = null;
      this._ackRemaining = 0;
    },
  };
}

export const latchNine = createLatchNineRuntime();
