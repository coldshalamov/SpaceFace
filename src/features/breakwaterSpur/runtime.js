// runtime.js — the registered Breakwater Spur system. Fresh per-registry
// factory; event-driven lifecycle; the only fixed-step work is socket seating
// watches and the bounded freight loop. One authoritative row lives at
// state.world.breakwaterSpur; the save adapter (persistence.js) parks it under the
// world.breakwaterSpur envelope section.

import {
  BREAKWATER_OWNER, BREAKWATER_SITE_ID, BREAKWATER_SECTOR_ID,
  BREAKWATER_POI_ID, BREAKWATER_PHASE, BREAKWATER_CHARTER,
  BREAKWATER_DISCOVERY_RADIUS, BREAKWATER_ACTION_RADIUS,
  BREAKWATER_SITE_LOCAL, BREAKWATER_POCKET_LOCAL, BREAKWATER_CUES,
  BREAKWATER_OFFER_TTL_S, BREAKWATER_DISPATCHER, BREAKWATER_CARTRIDGES,
  BREAKWATER_SOCKETS, BREAKWATER_CONSIGNMENT, breakwaterRecordId,
} from './definition.js';
import {
  createBreakwaterRow, recomputeStage, recomputePhase,
  pushReceipt, logItinerary, surveyComplete,
} from './project.js';
import { createBreakwaterSpurPhysical } from './physical.js';
import { createBreakwaterSpurServices } from './services.js';
import { createBreakwaterSpurFreight } from './freight.js';
import { buildBreakwaterSpurOffer, breakwaterSiteGlobal, getBreakwaterSpurStatus } from './readModel.js';
import { installBreakwaterSpurSaveAdapter, normalizeBreakwaterSpurRow } from './persistence.js';
import { sectorLocalToGlobalForSector } from '../../data/sectorCoordinates.js';

const PH = BREAKWATER_PHASE;
const COURSE_APPROACH = { x: BREAKWATER_SITE_LOCAL.x, z: BREAKWATER_SITE_LOCAL.z + 90 };

// Nessa Vale — dry, practical freight dispatcher. She refers only to facts
// that actually occurred; every line keys off a real transition.
const NESSA = {
  signal: 'Unknown hull, you are passing Breakwater Spur. It is a dead loading frame, not a wreck — mark it if you haul.',
  inspect: 'Nessa Vale, dispatch. Two socket cradles, shelf still square. The original search pocket is southeast. Bring each surviving cartridge through its matching cradle mouth, align it and settle against the rear support. I will offer to seat it once it holds steady.',
  partial: 'One arm is holding. The other socket is still empty.',
  damaged: 'That original is scarred. It will seat — just settle it slower.',
  seat: 'Seated. That is a real part again, not salvage.',
  restored: 'Both sockets are holding. Bring me commissioning stock and I will put this spur on the books.',
  reopening: 'Breakwater Spur is open. First light it has had in years.',
  returnVisit: 'Spur is standing. What do you need?',
  terminal: 'That was the only original. Without it this is just a frame. I am sorry you made the trip.',
  bonded: 'Bonded freight it is. Terms are on the console — the bond is yours until the seal breaks.',
  coop: 'Cooperative berth, then. Stock is thin — the work on the board is real and it pays.',
};

export function createBreakwaterSpurSystem() {
  return {
    name: 'breakwaterSpur',

    init(ctx) {
      this.ctx = ctx;
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers;
      this.registry = ctx.registry;
      this.physical = createBreakwaterSpurPhysical(ctx);
      this.services = createBreakwaterSpurServices(ctx);
      this.freight = createBreakwaterSpurFreight(ctx, this.physical, this.services);
      this._offerRevision = null;
      this._restorePending = null;
      this._epoch = 1; this._destroyed = false; this._restoring=false; this._destinationOffer = false; this._seatOffered = new Set();

      const state = this.state;
      if (!state.world.breakwaterSpur) state.world.breakwaterSpur = createBreakwaterRow();
      else state.world.breakwaterSpur = normalizeBreakwaterSpurRow(state.world.breakwaterSpur);

      this._releaseSaveAdapter = installBreakwaterSpurSaveAdapter(this.registry?.get?.('save'), this);

      const bus = this.bus;
      this._subs = [
        bus.on('scan:completed', (p) => this._onScanCompleted(p)),
        bus.on('breakwaterSpur:action', (p) => this._onAction(p)),
        bus.on('physics:impact', (p) => this._onImpact(p)),
        bus.on('entity:killed', (p) => this._onEntityGone(p, 'killed')),
        bus.on('entity:destroyed', (p) => this._onEntityGone(p, 'destroyed')),
        bus.on('npcjobs:load', (p) => this.freight.onNpcJobsEvent('npcjobs:load', p)),
        bus.on('npcjobs:depart', (p) => this.freight.onNpcJobsEvent('npcjobs:depart', p)),
        bus.on('npcjobs:arrived', (p) => this.freight.onNpcJobsEvent('npcjobs:arrived', p)),
        bus.on('npcjobs:approach', (p) => this.freight.onNpcJobsEvent('npcjobs:approach', p)),
        bus.on('npcjobs:unload', (p) => this.freight.onNpcJobsEvent('npcjobs:unload', p)),
        bus.on('npcjobs:complete', (p) => this.freight.onNpcJobsEvent('npcjobs:complete', p)),
        bus.on('sector:exit', () => this._onSectorExit()),
        bus.on('sector:enter', () => this._onSectorEnter()),
        bus.on('save:restoring', () => this._onSaveRestoring()),
        bus.on('save:loaded', () => this.afterContinue()),
      ];
    },

    _row() {
      const state = this.state;
      if (!state.world.breakwaterSpur) state.world.breakwaterSpur = createBreakwaterRow();
      return state.world.breakwaterSpur;
    },

    _player() {
      const p = this.state.entities?.get?.(this.state.playerId);
      return p?.alive ? p : null;
    },

    _playerDist() {
      const p = this._player();
      if (!p?.pos) return Infinity;
      const site = this.physical.siteAnchor;
      return Math.hypot(site.x - p.pos.x, site.z - p.pos.z);
    },

    _inSector() {
      return this.state.world?.currentSectorId === BREAKWATER_SECTOR_ID;
    },

    _say(key) {
      const text = NESSA[key];
      if (!text) return;
      this.bus.emit('voice:say', {
        channel: 'comms', kind: 'comms', priority: 55,
        id: `breakwater:${key}:${Math.floor(this.state.simTime)}`,
        text, ttl: 7,
      });
    },

    _cue(cue, pos) {
      this.bus.emit('breakwaterSpur:cue', {
        cue, at: this.state.simTime,
        pos: pos || { x: this.physical.siteAnchor.x, z: this.physical.siteAnchor.z },
      });
    },

    _offer(page = 'home') {
      const offer = buildBreakwaterSpurOffer(this.state, page);
      if (!offer) return;
      this._offerRevision = offer.revision;
      const projected = {...offer, expiresAt:this.state.simTime + BREAKWATER_OFFER_TTL_S};
      this.state.breakwaterSpurOffer = projected;
      this.bus.emit('breakwaterSpur:offer', projected);
    },

    _closeOffer() {
      this.state.breakwaterSpurOffer = null;
      if (!this._offerRevision) return;
      this._offerRevision = null;
      this.bus.emit('breakwaterSpur:close', {});
    },

    _sync(row) {
      recomputeStage(row);
      recomputePhase(row);
      this.state.breakwaterSpurView=getBreakwaterSpurStatus(this.state);
    },

    payoutAuthorization(kind,sourceId) {
      const amounts={scrap:90,supply:160,defend:180,bonded:220,bond_refund:100};
      const pending=this._row().pendingPayouts?.[kind];
      if (!Object.hasOwn(amounts,kind) || !pending || pending.sourceId!==sourceId) return null;
      if (kind === 'scrap' && (sourceId !== 'breakwater:coop:scrap' || this.state.economy?.committedIntents?.['breakwater-materials:scrap']?.receipt?.kind !== 'scrap')) return null;
      if (['supply','defend','bonded','bond_refund'].includes(kind)) {
        const receipt=this.registry?.get?.('cargo')?.getBreakwaterFreightReceipt?.(kind==='defend' ? 'defended_unload' : kind==='supply' ? 'supply' : 'consignment');
        if (!receipt || receipt.receiptId!==sourceId) return null;
      }
      return {kind,sourceId,amount:amounts[kind],key:`breakwater:first:${kind}`};
    },

    payoutAlreadyAccepted(kind,sourceId) {
      return this._row().settledPayouts?.[kind] === sourceId;
    },

    acceptPayout(kind,sourceId,amount) {
      const auth=this.payoutAuthorization(kind,sourceId), row=this._row();
      if (!auth || auth.amount!==amount) return false;
      row.settledPayouts ||= {}; row.settledPayouts[kind]=sourceId;
      delete row.pendingPayouts[kind];
      const job=kind==='bonded' ? row.bonded.job : row.coop.jobs[kind];
      if (job) {job.status='done';job.paid=true;}
      if (kind==='bond_refund') {row.bonded.bond.status='refunded';row.bonded.bond.refundedAt=this.state.simTime;}
      return true;
    },

    _settlePending(row) {
      const eco=this.registry?.get?.('economy');
      if (typeof eco?.settleBreakwaterReceipt !== 'function') return;
      for (const [kind,pending] of Object.entries(row.pendingPayouts || {}))
        eco.settleBreakwaterReceipt(kind,pending.sourceId);
    },

    // --- discovery ------------------------------------------------------------

    update(dt) {
      const row = this._row();
      if (!this._inSector()) return;

      // Materialize/verify site bodies — cheap identity lookups, no scans.
      this.physical.ensureStructure();
      for (const role of Object.keys(BREAKWATER_CARTRIDGES)) {
        const original=this.physical.ensureCartridge(row, role) || this.physical.cartridgeEntity(row,role);
        if (original && Number.isFinite(original.hull)) this.physical.recordDamage(row,original);
      }

      const dist = this._playerDist();

      // Discovery: one restrained signal inside 650 WU. No timer, no
      // obligation — leaving and looking around commits nothing.
      if (row.phase === PH.DARK && dist <= BREAKWATER_DISCOVERY_RADIUS) {
        row.phase = PH.SIGNALED;
        row.discoveredAt = this.state.simTime;
        row.visitCount++;
        this._say('signal');
        this._cue('signal');
        pushReceipt(row, 'Breakwater Spur — dead loading frame marked.', this.state.simTime);
        this._sync(row);
      }

      // Site work only matters near the site.
      if (dist <= BREAKWATER_ACTION_RADIUS * 4) {
        const seatD = this.physical.updateSeatWatch(row, 'drive', dt);
        const seatT = this.physical.updateSeatWatch(row, 'drum', dt);
        for (const [role, result] of [['drive',seatD],['drum',seatT]]) {
          if (result.seated) {
            this._sync(row); this._cue('seat');
            this._say(row.stage >= 2 ? 'restored' : 'partial');
            if (result.cartridge.damaged) this._say('damaged');
            pushReceipt(row, `${BREAKWATER_CARTRIDGES[role].label} seated in its socket.`, this.state.simTime);
            this._offer();
          }
        }
        for (const [role, result] of [['drive',seatD],['drum',seatT]]) {
          if (!result.stable) this._seatOffered.delete(role);
          else if (!this._seatOffered.has(role) && !this._offerRevision) { this._seatOffered.add(role); this._offer(); }
        }
      }

      if (row.bonded.bond.status==='posted' && row.bonded.bond.pendingAdmission && !row.looseLoad) {
        const admitted=this.freight.stageConsignment(row);
        if (admitted.ok) row.bonded.bond.pendingAdmission=false;
      }
      this.freight.update(row);
      const player=this._player(), load=row.looseLoad;
      const destination=[...(this.state.entities?.values?.() || [])].find(e=>e.alive!==false && e.type==='station' && e.data?.stationId===BREAKWATER_CONSIGNMENT.destStationId);
      const nearDestination=load?.kind==='consignment' && load.status==='in_transit' && player?.pos && destination?.pos
        && Math.hypot(player.pos.x-destination.pos.x,player.pos.z-destination.pos.z)<=BREAKWATER_CONSIGNMENT.handoffRadius+80;
      if (!nearDestination) this._destinationOffer=false;
      else if (!this._destinationOffer && !this._offerRevision) {
        this._destinationOffer=true;
        const offer={revision:`destination:${row.seq}`,kind:'bonded',title:'Belt Outpost receiver',
          detail:'Approach from the southeast. Keep the ship clear; tow the sealed load to the receiving mark, settle below 4 WU/s and keep the line attached.',
          actions:[{id:'deliver:consignment',label:'Hand off consignment'},{id:'course:receiver',label:'Mark southeast receiving berth'},{id:'close',label:'Leave'}],
          expiresAt:this.state.simTime+BREAKWATER_OFFER_TTL_S};
        this._offerRevision=offer.revision; this.state.breakwaterSpurOffer=offer; this.bus.emit('breakwaterSpur:offer',offer);
      }
      this._settlePending(row);
      this._sync(row);
    },

    _onScanCompleted(payload) {
      const row = this._row();
      const targetId = payload?.targetId ?? this.state.player?.targetId;
      const entity = targetId != null ? this.state.entities.get(targetId) : null;
      const data = entity?.data;
      if (!data || data.persistenceOwner !== BREAKWATER_OWNER) return;
      const role = data.siteRole;
      if (role === 'socket') {
        const key = data.socketRole === 'drive' ? 'socket_drive' : 'socket_drum';
        if (!row.surveyed[key]) {
          row.surveyed[key] = true;
          pushReceipt(row, `${data.scanLabel || data.name} — empty, undamaged.`, this.state.simTime);
        }
      } else if (role === 'console') {
        if (!row.surveyed.console) {
          row.surveyed.console = true;
          this._say('inspect');
        }
      } else if (data.cartridgeRole) {
        const cart = row.cartridges[data.cartridgeRole];
        if (cart) cart.hull = entity.hull;
      }
      this._sync(row);
      if (role === 'console' && this._inSector() && this._playerDist() <= BREAKWATER_ACTION_RADIUS) this._offer();
    },

    _onAction(payload) {
      const row = this._row();
      const id = payload?.actionId || payload?.id;
      if (!id || !this._inSector() || !this._player()) return;
      if (id !== 'deliver:consignment' && id !== 'course:receiver' && id !== 'close' && this._playerDist() > BREAKWATER_ACTION_RADIUS) return;
      // Stale-offer refusal: the revision the adapter echoes must match live.
      if (!payload.revision || payload.revision !== this._offerRevision) {
        this.bus.emit('breakwaterSpur:receipt', { text: 'That offer has gone stale.', kind: 'warn' });
        return;
      }
      const selected = this.state.breakwaterSpurOffer?.actions?.find(action => action.id === id);
      if (!selected) return;
      this._offerRevision=null; this.state.breakwaterSpurOffer=null;
      const epoch=this._epoch, t=this.state.simTime;
      switch (id) {
        case 'service:menu':
          this._offer('services'); return;
        case 'service:back':
          this._offer(); return;
        case 'course':
          this.bus.emit('ui:setCourse', { pos:sectorLocalToGlobalForSector(COURSE_APPROACH,BREAKWATER_SECTOR_ID), sectorId:BREAKWATER_SECTOR_ID, label:'Breakwater Spur', autopilot:false });
          break;
        case 'course_pocket':
          this.bus.emit('ui:setCourse', { pos:sectorLocalToGlobalForSector(BREAKWATER_POCKET_LOCAL,BREAKWATER_SECTOR_ID), sectorId:BREAKWATER_SECTOR_ID, label:'Breakwater salvage pocket', autopilot:false });
          break;
        case 'course:receiver':
          if (row.charter !== BREAKWATER_CHARTER.BONDED || row.looseLoad?.kind !== 'consignment'
            || row.looseLoad.status !== 'in_transit') break;
          this.bus.emit('ui:setCourse', { pos:sectorLocalToGlobalForSector(BREAKWATER_CONSIGNMENT.receiverLocal,BREAKWATER_SECTOR_ID), sectorId:BREAKWATER_SECTOR_ID, label:'Belt Outpost southeast receiving mark', arrivalRadius:60, autopilot:false });
          break;
        case 'seat:drive': case 'seat:drum': {
          const socketRole = id.split(':')[1];
          const res = this.physical.trySeat(row, socketRole);
          if (res.ok && res.pending) {
            this.bus.emit('breakwaterSpur:receipt',{text:'Securing the original to the cradle…',kind:'info'});
          } else if (!res.ok) {
            this.bus.emit('breakwaterSpur:receipt', { text: seatRefusal(res.reason), kind: 'warn' });
          }
          break;
        }
        case 'repair:drive': case 'repair:drum': {
          const role=id.split(':')[1];
          const res=this.services.repairCartridge(row,role,this.physical.cartridgeEntity(row,role));
          this.bus.emit('breakwaterSpur:receipt',{text:res.ok ? `Cartridge repaired for ${res.price} CR.` : 'Cartridge repair unavailable or payment refused.',kind:res.ok?'info':'warn'});
          break;
        }
        case 'commission': {
          this.services.payCommission(row).then(r => { if (this._epoch===epoch && !this._destroyed) this._commissionOutcome(row,r); });
          break;
        }
        case 'charter:coop': case 'charter:bonded': {
          if (row.commission.status !== 'paid' || row.charter !== BREAKWATER_CHARTER.NONE) break;
          row.charter = id === 'charter:coop' ? BREAKWATER_CHARTER.COOP : BREAKWATER_CHARTER.BONDED;
          this._say(row.charter === BREAKWATER_CHARTER.COOP ? 'coop' : 'bonded');
          this._say('reopening');
          this._cue('commission');
          pushReceipt(row, row.charter === BREAKWATER_CHARTER.COOP
            ? 'Cooperative berth chartered — services and work board open.'
            : 'Bonded freight chartered — terms on the console.', t);
          break;
        }
        case 'job:scrap': {
          const res = this.services.deliverScrap(row);
          if (res.ok) {
            this._cue('work');
            pushReceipt(row, res.paymentPending ? 'Scrap accepted — payment pending.' : `Scrap accepted at the shelf — ${res.pay} CR paid.`, t, 'pay');
          } else {
            this.bus.emit('breakwaterSpur:receipt', { text: 'The shelf needs 8 scrap — the hold is short.', kind: 'warn' });
          }
          break;
        }
        case 'job:supply': {
          const res = this.freight.stageSupplyLoad(row);
          if (!res.ok) this.bus.emit('breakwaterSpur:receipt', { text: 'No supply load can be staged right now.', kind: 'warn' });
          break;
        }
        case 'deliver:supply': {
          const res = this.freight.tryDeliverSupply(row);
          if (!res.ok) this.bus.emit('breakwaterSpur:receipt', { text: res.reason==='receiver_unavailable' ? 'The shelf cannot currently accept this cartridge.' : 'Bring the cartridge onto the shelf and settle it.', kind: 'warn' });
          break;
        }
        case 'job:defend': {
          const res = this.freight.scheduleDefendedUnload(row);
          if (!res.ok) this.bus.emit('breakwaterSpur:receipt', { text: 'No mule is free to run right now.', kind: 'warn' });
          break;
        }
        case 'job:bonded': {
          const res = this.services.postBond(row, () => this.freight.stageConsignment(row));
          if (!res.ok) this.bus.emit('breakwaterSpur:receipt',{text:'The bond or consignment could not be accepted.',kind:'warn'});
          else pushReceipt(row,res.pendingAdmission ? 'Bond posted. Consignment admission pending.' : 'Bond posted. The sealed consignment is on the shelf.',t);

          break;
        }
        case 'deliver:consignment': {
          const res = this.freight.tryDeliverConsignment(row);
          if (!res.ok) { this._destinationOffer=false; this.bus.emit('breakwaterSpur:receipt', { text: 'Receiver handoff pending: '+res.reason, kind: 'warn' }); }
          break;
        }
        case 'settle:bonded': {
          const res = this.freight.settleConsignment(row);
          if (res.ok) {
            this._cue('handoff');
            pushReceipt(row, 'Bonded run settled — bond returned, 220 CR paid.', t, 'pay');
          }
          break;
        }
        case 'service:repair': case 'service:fuel':
        case 'service:repair:budget': case 'service:fuel:budget': {
          const kind = id.split(':')[1];
          this.services.runService(row, kind, id.endsWith(':budget') ? selected.units : undefined).then(res => {
            if (this._epoch!==epoch || this._destroyed) return;
            if (res.ok) {
              this._cue('work');
              pushReceipt(row, `${kind === 'repair' ? 'Repairs' : 'Fuel'} drawn — ${res.units} units, ${res.price} CR.`, t, 'pay');
            } else {
              this.bus.emit('breakwaterSpur:receipt', { text: serviceRefusal(res.reason), kind: 'warn' });
            }
          });
          break;
        }
        case 'intel': {
          const intel = this.services.freightIntel();
          this.bus.emit('breakwaterSpur:receipt', {
            text: `Equivalent contract rate ≈ ${Math.round(intel.equivalentRewardCr)} CR posted, ${Math.round(intel.equivalentCollateralCr)} CR bond.`,
            kind: 'info',
          });
          break;
        }
        case 'close':
          this._closeOffer();
          break;
        default:
          break;
      }
      this._sync(row);
      if (['seat:drive','seat:drum','close','commission'].includes(id)) return;
      if (this._inSector() && this._playerDist() <= BREAKWATER_ACTION_RADIUS) this._offer();
    },

    _commissionOutcome(row, res) {
      const t = this.state.simTime;
      if (res.ok) {
        this._cue('commission');
        pushReceipt(row, 'Commissioning stock accepted — the spur is on the books.', t, 'pay');
        this._offer();
      } else {
        this.bus.emit('breakwaterSpur:receipt', { text: `Commission needs ${res.reason === 'need_scrap' ? '4 scrap' : res.reason === 'need_electronics' ? '1 salvage electronics' : 'the stock'} in the hold.`, kind: 'warn' });
      }
      this._sync(row);
    },

    _onImpact(payload) {
      const row = this._row();
      this.physical.handleImpact(row, payload || {});
    },

    _onEntityGone(payload, cause) {
      if (this._restoring) return;
      const row = this._row();
      const entity = payload?.entity || this.state.entities.get(payload?.id);
      const event = this.physical.recordLoss(row, entity, cause === 'killed' ? payload?.reason || 'killed' : payload?.reason || 'removed');
      if (!event) return;
      const t = this.state.simTime;
      if (event.type === 'cartridge_lost') {
        this._say('terminal');
        pushReceipt(row, `${BREAKWATER_CARTRIDGES[event.role].label} destroyed — ${event.reason}.`, t, 'warn');
      } else if (event.type === 'raider_down') {
        pushReceipt(row, 'The belt-shadow raider is down.', t);
      } else if (event.type === 'load_lost' || event.type === 'hauler_lost') {
        // freight.update resolves the job/bond outcome on the next pass.
      }
      this._sync(row);
    },

    // --- sector & save lifecycle ------------------------------------------------

    _onSectorExit() {
      this._epoch++; this._destinationOffer=false;
      const row=this._row(); row.bodySnapshots=this.physical.snapshotBodies(row);
      this.physical.teardown();
      this._closeOffer();
    },

    _onSectorEnter() {
      const row = this._row();
      if (!this._restoring && this._inSector()) this.physical.restoreBodies(row);
      if (this._inSector() && row.phase !== PH.DARK) {
        row.visitCount++;
        if (row.visitCount > 1 && row.phase === PH.OPERATING) this._say('returnVisit');
      }
    },

    _onSaveRestoring() {
      this._epoch++; this._restoring=true; this.physical.suspendBodies();
      this._closeOffer();
    },

    // --- persistence (driven by the save adapter) ---------------------------------

    serialize() {
      const row = this.state.world.breakwaterSpur;
      if (!row) return null;
      // Detached plain-data snapshot — never live entity references.
      return JSON.parse(JSON.stringify({
        ...row,
        bodySnapshots:this.physical.snapshotBodies(row),
        seatWatch: { drive: null, drum: null },
        restored: true,
      }));
    },

    deserialize(data) {
      const row = normalizeBreakwaterSpurRow(data);
      row.restored = true;
      row.seatWatch = { drive: null, drum: null };
      this.state.world.breakwaterSpur = row;
      this.physical.teardown();
      if (this._restoring) this.physical.suspendBodies();
      this._restorePending = row;
    },

    afterContinue() {
      const row = this._row();
      this._restoring=false;
      this.physical.teardown();
      this.physical.resume();
      if (this._inSector()) {
        this.physical.restoreBodies(row);
        this.physical.ensureStructure();
        for (const role of Object.keys(BREAKWATER_CARTRIDGES)) {
          this.physical.ensureCartridge(row, role);
        }
      }
      this._sync(row);
      this._restorePending = null;
    },

    newGame() {
      this._epoch++; this._restoring=true; this.physical.retireOwned(); this._restoring=false;
      this.state.world.breakwaterSpur = createBreakwaterRow();
      this.state.breakwaterSpurView=null;
      this.physical.teardown();
      this._offerRevision = null;
      this._restorePending = null;
    },

    destroy() {
      for (const off of this._subs || []) { try { off && off(); } catch { /* idempotent */ } }
      this._subs = [];
      this._epoch++; this._destroyed=true; this.state.breakwaterSpurView=null; this._closeOffer();
      this._releaseSaveAdapter?.(); this._releaseSaveAdapter=null;
      this.physical.destroy();
    },
  };
}

function seatRefusal(reason) {
  switch (reason) {
    case 'socket_occupied': return 'That socket is already seated.';
    case 'original_lost': return 'The original is gone — there is nothing to seat.';
    case 'original_missing': return 'The cartridge is not here.';
    case 'original_body_not_ready': return 'The cartridge is still settling — give it a moment.';
    case 'bring_original_to_socket': return 'Bring the cartridge inside the socket cradle.';
    case 'socket_not_clear': return 'The socket is not clear — move other bodies off it.';
    case 'slow_and_steady_for_socket': return 'Too fast. Settle the cartridge before seating.';
    case 'align_with_socket': return 'The cartridge is skewed — straighten it against the cradle.';
    case 'settle_before_seating': return 'Hold it steady a moment longer.';
    default: return 'The socket refuses the cartridge.';
  }
}

function serviceRefusal(reason) {
  switch (reason) {
    case 'no_stock': return 'No stock left at the berth.';
    case 'nothing_to_service': return 'Nothing to service — hull and tanks are full.';
    case 'insufficient_credits': return 'Not enough credits.';
    case 'not_cooperative': return 'That service belongs to the cooperative charter.';
    default: return 'The berth cannot run that service right now.';
  }
}
