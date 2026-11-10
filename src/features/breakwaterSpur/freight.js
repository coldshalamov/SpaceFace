// freight.js — the bounded Breakwater freight loop. At most one working hauler
// (canonical npcJobsRuntime itinerary: true load/unload/depart transitions) and
// one loose service load exist at a time. Stock changes only on an accepted
// actual delivery — never on a timer pretending a ship arrived.

import {
  BREAKWATER_CONSIGNMENT, BREAKWATER_ACTION_RADIUS,
  BREAKWATER_CHARTER, BREAKWATER_SITE_ID, BREAKWATER_STOCK, breakwaterRecordId,
} from './definition.js';
import { logItinerary, pushReceipt } from './project.js';

function finite(n, fallback = 0) { return Number.isFinite(n) ? n : fallback; }
function dist2XZ(a, b) {
  const dx = finite(a?.x) - finite(b?.x), dz = finite(a?.z) - finite(b?.z);
  return dx * dx + dz * dz;
}

export function createBreakwaterSpurFreight(ctx, physical, services) {
  const state = ctx.state;
  const bus = ctx.bus;
  const helpers = ctx.helpers;

  function playerEntity() {
    const p = state.entities?.get?.(state.playerId);
    return p?.alive ? p : null;
  }

  function playerDist2() {
    const p = playerEntity();
    if (!p?.pos) return Infinity;
    return dist2XZ(p.pos, physical.siteAnchor);
  }

  // --- loose loads -------------------------------------------------------------

  // Supply cartridge for the cooperative berth (recover → hand to the shelf).
  function stageSupplyLoad(row) {
    if (row.charter !== BREAKWATER_CHARTER.COOP) return { ok: false, reason: 'not_cooperative' };
    if (row.coop.jobs.supply.status !== 'open') return { ok: false, reason: 'job_closed' };
    const res = physical.spawnLooseLoad(row, 'supply');
    if (res.ok) {
      logItinerary(row, 'Supply cartridge staged in the salvage pocket.', state.simTime);
      pushReceipt(row, 'Reserve supply cartridge located — the yard skids marked it for pickup.', state.simTime);
    }
    return res;
  }

  // Sealed consignment for the bonded charter (posted bond → shelf staging).
  function stageConsignment(row) {
    if (row.charter !== BREAKWATER_CHARTER.BONDED) return { ok: false, reason: 'not_bonded' };
    if (row.bonded.bond.status !== 'posted') return { ok: false, reason: 'bond_required' };
    const res = physical.spawnLooseLoad(row, 'consignment');
    if (res.ok) {
      row.looseLoad.status = 'waiting';
      logItinerary(row, 'Sealed consignment staged on the receiving shelf.', state.simTime);
    }
    return res;
  }

  // The player takes custody of a waiting load by actually towing/moving it.
  function observeCustody(row) {
    const load = row.looseLoad;
    if (!load || load.status !== 'waiting') return;
    const entity = physical.findByRecordId(load.worldRecordId);
    if (!entity) return;
    load.entityId=entity.id; load.generation=entity.occupantGeneration;
    // Custody starts when the player's own line binds the original.
    const lines = physical.linesTargeting(entity.id) || [];
    if (lines.some(line=>line.ownerId===state.playerId && line.targetGeneration===entity.occupantGeneration) && load.kind === 'consignment') {
      load.status = 'in_transit';
      logItinerary(row, 'Consignment in transit — outbound to Belt Outpost.', state.simTime);
      bus.emit('breakwaterSpur:cue', { cue: 'handoff', at: state.simTime });
    }
  }

  // Shelf handoff gate for the supply cartridge (site-custody delivery).
  function supplyGate(row) {
    const load = row.looseLoad;
    if (!load || load.kind !== 'supply' || load.status === 'delivered') return { ok: false };
    const shelf = { x: physical.siteAnchor.x, z: physical.siteAnchor.z - 34 };
    return physical.custodyGate(row, load, shelf, BREAKWATER_ACTION_RADIUS * 0.35);
  }

  function tryDeliverSupply(row) {
    const load = row.looseLoad;
    if (!load || load.kind !== 'supply') return { ok: false, reason: 'no_supply_load' };
    if (load.status !== 'waiting' && load.status !== 'in_transit') return { ok: false, reason: 'not_out' };
    const gate=supplyGate(row);
    if (!gate.ok) return {ok:false,reason:gate.reason};
    const receiver=physical.findByRecordId(breakwaterRecordId('structure_shelf_drive'));
    const cargo=ctx.registry?.get?.('cargo'), attachments=ctx.registry?.get?.('combat')?.kernel?.attachments;
    if (!receiver || !cargo?.acceptBreakwaterFreight || !attachments) return {ok:false,reason:'receiver_unavailable'};
    if (dist2XZ(gate.entity.pos,receiver.pos) > 35*35) return {ok:false,reason:'out_of_range'};
    load.entityId=gate.entity.id; load.generation=gate.entity.occupantGeneration;
    const links=attachments.listForEntity?.(gate.entity.id)?.filter(a=>a.state==='active') || [];
    const own=links.find(a=>a.ownerId===state.playerId && a.targetId===gate.entity.id && a.targetGeneration===gate.entity.occupantGeneration);
    if (own && links.length===1) {
      const rebound=attachments.rebind(own.id,state.playerId,{defId:'attachment_salvage_clamp',ownerId:receiver.id,targetId:gate.entity.id,controllerId:null,sourceWorld:receiver.pos,targetWorld:gate.entity.pos});
      if (!rebound?.ok) return {ok:false,reason:'receiver_refused'};
    }
    const result=cargo.acceptBreakwaterFreight({kind:'supply',entityId:gate.entity.id,worldRecordId:load.worldRecordId,generation:gate.entity.occupantGeneration,receiverId:receiver.id,receiverGeneration:receiver.occupantGeneration});
    if (!result?.ok) return {ok:false,reason:result?.reason || 'receiver_pending'};
    const receipt=cargo.getBreakwaterFreightReceipt('supply');
    if (!receipt || receipt.worldRecordId!==load.worldRecordId) return {ok:false,reason:'receipt_missing'};
    load.status='delivered';
    row.coop.stock.repair=Math.min(BREAKWATER_STOCK.repairCap,row.coop.stock.repair+receipt.qty);
    const settle=services.settleSupplyLoad(row,receipt.receiptId);
    return {ok:true,settle};
  }

  // Consignment handoff at the Belt Outpost dock approach.
  function consignmentGate(row) {
    const load = row.looseLoad;
    if (!load || load.kind !== 'consignment' || load.status !== 'in_transit') return { ok: false };
    const receiver=[...(state.entities?.values?.() || [])].find(e=>e.alive!==false && e.type==='station' && e.data?.stationId===BREAKWATER_CONSIGNMENT.destStationId);
    if (!receiver?.pos) return {ok:false,reason:'receiver_unavailable'};
    const dest=receiver.pos;
    return physical.custodyGate(row, load, dest, BREAKWATER_CONSIGNMENT.handoffRadius);
  }

  function tryDeliverConsignment(row) {
    const load = row.looseLoad;
    if (!load || load.kind !== 'consignment') return { ok: false, reason: 'no_consignment' };
    if (load.status !== 'in_transit') return { ok: false, reason: 'not_in_transit' };
    const gate=consignmentGate(row);
    if (!gate.ok) return {ok:false,reason:gate.reason};
    load.entityId=gate.entity.id; load.generation=gate.entity.occupantGeneration;
    const receiver=[...(state.entities?.values?.() || [])].find(e=>e.alive!==false && e.type==='station' && e.data?.stationId==='station_beltout');
    const cargo=ctx.registry?.get?.('cargo'), attachments=ctx.registry?.get?.('combat')?.kernel?.attachments;
    if (!receiver || !cargo?.acceptBreakwaterFreight || !attachments) return {ok:false,reason:'receiver_unavailable'};
    if (dist2XZ(gate.entity.pos,receiver.pos) > 35*35) return {ok:false,reason:'out_of_range'};
    const links=attachments.listForEntity?.(gate.entity.id)?.filter(a=>a.state==='active') || [];
    const own=links.find(a=>a.ownerId===state.playerId && a.targetId===gate.entity.id && a.targetGeneration===gate.entity.occupantGeneration);
    if (own && links.length===1) {
      const rebound=attachments.rebind(own.id,state.playerId,{defId:'attachment_salvage_clamp',ownerId:receiver.id,targetId:gate.entity.id,controllerId:null,sourceWorld:receiver.pos,targetWorld:gate.entity.pos});
      if (!rebound?.ok) return {ok:false,reason:'receiver_refused'};
    }
    const result=cargo.acceptBreakwaterFreight({kind:'consignment',entityId:gate.entity.id,worldRecordId:load.worldRecordId,generation:gate.entity.occupantGeneration,receiverId:receiver.id,receiverGeneration:receiver.occupantGeneration});
    if (!result?.ok) return {ok:false,reason:result?.reason || 'receiver_pending'};
    load.status='delivered';
    logItinerary(row,'Consignment accepted by the outpost receiver � return for settlement.',state.simTime);
    pushReceipt(row,'Outpost receiver signed for the sealed consignment.',state.simTime);
    return {ok:true};
  }

  // Back at the spur after delivery: priced result + bond refund, separately.
  function settleConsignment(row) {
    const load = row.looseLoad;
    if (!load || load.kind !== 'consignment' || load.status !== 'delivered') {
      return { ok: false, reason: 'not_delivered' };
    }
    if (row.bonded.job.status==='done' && row.bonded.bond.status==='refunded') return {ok:false,reason:'already_settled'};
    const receipt=ctx.registry?.get?.('cargo')?.getBreakwaterFreightReceipt?.('consignment');
    if (!receipt || receipt.worldRecordId!==load.worldRecordId) return {ok:false,reason:'receipt_missing'};
    const pay = row.bonded.job.status==='open' ? services.settleBondedJob(row,receipt.receiptId) : {ok:true,paymentPending:row.bonded.job.status==='accepted'};
    if (row.bonded.bond.status==='posted' && !row.pendingPayouts?.bond_refund) services.refundBond(row,receipt.receiptId);
    logItinerary(row, 'Bonded run settled — bond returned, freight paid.', state.simTime);
    return { ok: true, pay };
  }

  // --- hauler itinerary ------------------------------------------------------------

  // Schedule the cooperative defended unload — one authored mule, one raider.
  function scheduleDefendedUnload(row) {
    if (row.charter !== BREAKWATER_CHARTER.COOP) return { ok: false, reason: 'not_cooperative' };
    const rec = row.coop.jobs.defend;
    if (rec.status !== 'open') return { ok: false, reason: 'job_closed' };
    const res = physical.spawnHauler(row, 'defended_unload');
    if (!res.ok) return res;
    rec.status = 'scheduled';
    rec.haulerJobId = res.jobId;
    logItinerary(row, 'Supply mule inbound — scheduled unload on the receiving shelf.', state.simTime);
    pushReceipt(row, 'A mule is inbound with berth stock. Keep the approach clear.', state.simTime);
    return { ok: true };
  }

  // npcJobsRuntime drains kernel intents onto the bus; match our job id only.
  function onNpcJobsEvent() {
    // The actual job owner is read in update; an event alone is not custody,
    // arrival, departure, or authority to remove the original.
  }

  // Cheap bounded per-tick freight work — only while a hauler or load is live.
  function update(row) {
    const cargoOwner=ctx.registry?.get?.('cargo');
    const supply=cargoOwner?.getBreakwaterFreightReceipt?.('supply');
    if (supply && row.looseLoad?.kind==='supply' && row.looseLoad.worldRecordId===supply.worldRecordId
      && row.coop.jobs.supply.status==='open') {
      row.looseLoad.status='delivered';
      row.coop.stock.repair=Math.min(BREAKWATER_STOCK.repairCap,row.coop.stock.repair+supply.qty);
      services.settleSupplyLoad(row,supply.receiptId);
    }
    const delivered=cargoOwner?.getBreakwaterFreightReceipt?.('consignment');
    if (delivered && row.looseLoad?.kind==='consignment' && row.looseLoad.worldRecordId===delivered.worldRecordId
      && row.looseLoad.status==='in_transit') row.looseLoad.status='delivered';
    const hauler = row.freight.hauler;
    const acceptedHaul=cargoOwner?.getBreakwaterFreightReceipt?.('defended_unload');
    if (hauler && acceptedHaul?.worldRecordId===hauler.worldRecordId && row.coop.jobs.defend.status==='scheduled') {
      row.coop.stock.repair=Math.min(BREAKWATER_STOCK.repairCap,row.coop.stock.repair+acceptedHaul.qty);
      services.settleDefendedUnload(row,acceptedHaul.receiptId);
    }
    if (hauler) {
      const entity=physical.findByRecordId(hauler.worldRecordId);
      const entry=state.npcJobs?.byId?.[hauler.jobId];
      if (!entry && !['departed','lost'].includes(hauler.phase) && row.coop.jobs.defend.status==='scheduled') hauler.phase='unconfirmed';
      if (entity && entry?.entityRef===entity && entry.worldRecordId===hauler.worldRecordId && entry.job?.id===hauler.jobId) {
        hauler.entityId=entity.id; hauler.generation=entity.occupantGeneration;
        if (entry.job.phase==='approach' || entry.job.phase==='unload') {
          hauler.phase='approach';
          if (!row.freight.raiderSpawned && !row.raider) {
            const spawned=physical.spawnRaider(row);
            if (spawned.ok) row.freight.raiderSpawned=true;
          }
        }
        else if (entry.job.phase==='complete' && row.coop.jobs.defend.status!=='scheduled') hauler.phase='departed';
        else if (entry.job.phase==='transit') hauler.phase='transit';
      }
      if (hauler.phase === 'approach' && row.coop.jobs.defend.status === 'scheduled') {
        const entity=physical.findByRecordId(hauler.worldRecordId);
        const receiver=physical.findByRecordId(breakwaterRecordId('structure_shelf_drive'));
        const cargo=ctx.registry?.get?.('cargo');
        if (entity && receiver && cargo?.acceptBreakwaterFreight) {
          hauler.entityId=entity.id; hauler.generation=entity.occupantGeneration;
          const accepted=cargo.acceptBreakwaterFreight({kind:'defended_unload',entityId:entity.id,worldRecordId:hauler.worldRecordId,generation:entity.occupantGeneration,receiverId:receiver.id,receiverGeneration:receiver.occupantGeneration,jobId:hauler.jobId});
          if (accepted?.ok) {
            const receipt=cargo.getBreakwaterFreightReceipt('defended_unload');
            if (receipt?.worldRecordId===hauler.worldRecordId) {
              row.coop.stock.repair=Math.min(BREAKWATER_STOCK.repairCap,row.coop.stock.repair+receipt.qty);
              services.settleDefendedUnload(row,receipt.receiptId);
            }
          }
        }
      }
      if (hauler.phase === 'lost') {
        if (row.coop.jobs.defend.status === 'scheduled' && hauler.purpose === 'defended_unload') {
          row.coop.jobs.defend.status = 'failed';
          pushReceipt(row, 'The scheduled mule was destroyed before it could unload.', state.simTime, 'warn');
        }
        row.freight.hauler = null;
      } else if (hauler.phase === 'departed') {
        const entity = physical.findByRecordId(hauler.worldRecordId);
        const player = playerEntity();
        const far = !entity || !player?.pos
          || dist2XZ(entity.pos, player.pos) > 1500 * 1500;
        if (far) {
          if (entity && helpers?.removeEntity) {
            helpers.removeEntity(entity.id, { reason: 'breakwater_departed' });
          }
          row.freight.hauler = null;
        }
      }
    }
    if (row.raider?.status === 'active' && row.raider.worldRecordId) {
      const raider=physical.findByRecordId(row.raider.worldRecordId);
      if (raider) {row.raider.entityId=raider.id;row.raider.generation=raider.occupantGeneration;}
    }
    if (row.raider && row.raider.status === 'down') {
      row.raider = null;
      logItinerary(row, 'The belt-shadow contact is down — approach is clear.', state.simTime);
    }
    if (row.looseLoad) {
      if (row.looseLoad.status === 'lost') {
        if (row.looseLoad.kind === 'consignment' && row.bonded.bond.status === 'posted') {
          services.forfeitBond(row);
          row.bonded.job.status = 'failed';
          pushReceipt(row, 'Consignment lost — the posted bond is forfeit.', state.simTime, 'warn');
        } else if (row.looseLoad.kind === 'supply' && row.coop.jobs.supply.status !== 'failed') {
          row.coop.jobs.supply.status = 'failed';
          pushReceipt(row, 'The original supply cartridge was lost.', state.simTime, 'warn');
        }
      } else {
        observeCustody(row);
      }
    }
  }

  return {
    stageSupplyLoad,
    stageConsignment,
    supplyGate,
    tryDeliverSupply,
    consignmentGate,
    tryDeliverConsignment,
    settleConsignment,
    scheduleDefendedUnload,
    onNpcJobsEvent,
    update,
    playerDist2,
  };
}
