// The existing traffic owner runs this finite errand. Original encounter pods are the
// only source; physical pickup receipts debit them and the economy owns acceptance.
// No independent timer, teleport, replacement Tann, cargo reward, or fabricated output.
import { VESTA_WINNOW_RECOVERY as DEF } from '../data/vestaWinnowRecovery.js';
import { VESTA_ORE_WINNOW, vestaWinnowPhase } from '../data/environmentalMachinery.js';
import { resolvePropulsionProfile } from '../core/flight/propulsionCatalog.js';
import { resolveCollisionProxyManifest, resolveDockAnchor, resolveCorridorAxisWorld, corridorStateFor, proxyOuterRadiusWu, hullEnvelopeWu } from '../data/collisionProxyManifests.js';

import { physicsBodyNativeReady } from '../core/physicsAuthority.js';
import { successfulPickupAmount } from '../core/pickupAcceptance.js';

const seenReceipts = new WeakSet();
const persistenceLeases = new WeakMap();
const verifiedDeathManifests = new WeakMap();
const whole = v => Number.isSafeInteger(v) && v >= 0;
const copy = v => JSON.parse(JSON.stringify(v));
const living = (s, e) => e?.alive === true && s.entities.get(e.id) === e;
const pose = e => [e?.pos?.x, e?.pos?.z, e?.vel?.x, e?.vel?.z].every(Number.isFinite);
const root = s => s.traffic?.vestaWinnowRecovery;
const batch = (s, id) => root(s)?.batches.find(b => b.id === id);
const rowFor = (b, p) => b?.pods.find(r => r.id === p?.data?.vestaWinnowPod?.podId);
const tannId = e => e?.data?.namedLaneContactId || e?.data?.ai?.namedLaneContactId;
const recordFor = (o, e) => o.state.traffic?.freighters.find(r => r.id === e.id);
const held = b => b.pods.reduce((n, r) => n + r.aboard, 0);

export function normalizeWinnowRecovery(value) {
  if (!value || value.schema !== DEF.schema || !Array.isArray(value.batches) || value.batches.length > DEF.maxBatches) return null;
  const ids = new Set();
  for (const b of value.batches) {
    if (!b || typeof b.id !== 'string' || !b.id || ids.has(b.id) || !Array.isArray(b.pods) || b.pods.length > 8192) return null;
    if (!Array.isArray(b.sources) || b.sources.length>5 || b.sources.some(x=>!x || typeof x.id!=='string' || !whole(x.amount) || x.amount>2)
      || new Set(b.sources.map(x=>x.id)).size!==b.sources.length
      || b.sources.reduce((n,x)=>n+x.amount,0)!==b.pods.reduce((n,r)=>n+(r?.original||0),0)) return null;
    ids.add(b.id); const pods = new Set();
    for (const r of b.pods) {
      if (!r || typeof r.id !== 'string' || pods.has(r.id) || ![r.original, r.loose, r.aboard, r.player, r.delivered, r.lost, r.other || 0].every(whole)
        || r.original !== r.loose + r.aboard + r.player + r.delivered + r.lost + (r.other || 0)) return null;
      pods.add(r.id);
    }
  }
  const durable=copy(value);
  for(const b of durable.batches) b.pods=b.pods.filter(r=>r.original>0);
  return durable;
}

export function beginWinnowBatch(state, liveId) {
  if (state.world?.currentSectorId !== DEF.sectorId || typeof liveId !== 'string' || !liveId) return null;
  state.traffic ||= {};
  const book = state.traffic.vestaWinnowRecovery ||= { schema: DEF.schema, batches: [] };
  const id = `winnow:${liveId}`;
  if (batch(state, id)) return id;
  // Never evict unsettled finite cargo merely to admit another source.
  if (book.batches.length >= DEF.maxBatches) return null;
  book.batches.push({ id, encounterId: liveId, phase: 'episode', outcome: null, carrierId: null, sources: [], threats: [], pods: [], targetPodId: null, deliveredAt: null });
  return id;
}
export function registerWinnowPod(state, batchId, pod, podId) {
  const b = batch(state, batchId), amount = pod?.data?.amount;
  if (!b || b.phase !== 'episode' || !living(state, pod) || !whole(amount) || !amount || amount > 2
    || pod.data.commodityId !== DEF.commodityId || typeof podId !== 'string' || !podId
    || b.sources.length >= 5 || b.sources.some(source => source.id === podId)
    || b.pods.some(r => r.id === podId) || pod.data.vestaWinnowPod) return false;
  pod.data.vestaWinnowPod = { batchId, podId };
  pod.data.richLotSource = { lotId: podId, provenanceId: batchId, sourceKind: 'winnow_salvage', lotQty: amount, legalStatus: 'salvage', winnowLife: {} };
  b.sources.push({ id: podId, amount });
  b.pods.push({ id: podId, original: amount, loose: amount, aboard: 0, player: 0, delivered: 0, lost: 0, other: 0 });
  return true;
}
export function finishWinnowBatch(state, batchId, outcome) {
  const b = batch(state, batchId);
  if (!b || b.phase !== 'episode') return false;
  b.outcome = outcome;
  b.phase = outcome === 'claim_broken' ? 'available' : 'unclaimed';
  return true;
}
export function winnowRecoveryFacts(state, batchId) {
  const b = batch(state, batchId); if (!b) return null;
  const facts = { batchId, phase: b.phase, original: 0, loose: 0, aboard: 0, playerRecovered: 0, delivered: 0, lost: 0, otherConsumed: 0, playerHeld: 0 };
  for (const r of b.pods) {
    for (const k of ['original', 'loose', 'aboard', 'delivered', 'lost']) facts[k] += r[k];
    facts.playerRecovered += r.player;
    facts.otherConsumed += r.other || 0;
    facts.playerHeld += (state.player?.cargo?.richLots || []).filter(l => l.lotId === r.id).reduce((n,l) => n + l.qty, 0);
  }
  // Recovered units subsequently sold/used remain accounted for, never called destroyed.
  facts.playerDisposed = facts.playerRecovered - facts.playerHeld;
  return facts;
}
// Read-only local memory survives the temporary errand stamp and later visits.
export function winnowRecoveryHailLines(state,entity) {
  if(!uniqueTann(state,entity) || !entity.data.worldRecordId
    || state.entityList.filter(e=>living(state,e)&&e.data?.worldRecordId===entity.data.worldRecordId).length!==1) return null;
  const batches=root(state)?.batches.filter(b=>b.carrierId===entity.data.worldRecordId);
  if(!batches?.length) return null;
  const totals={original:0,delivered:0,aboard:0,loose:0,playerRecovered:0,playerHeld:0,playerDisposed:0,lost:0,otherConsumed:0};
  for(const b of batches){const facts=winnowRecoveryFacts(state,b.id);for(const key of Object.keys(totals))totals[key]+=facts[key];}
  const lines=[
    `WINNOW · ${totals.original}u original. Forge accepted ${totals.delivered}u; aboard ${totals.aboard}u; loose ${totals.loose}u.`,
    `YOUR SALVAGE · ${totals.playerRecovered}u recovered: ${totals.playerHeld}u held, ${totals.playerDisposed}u no longer held. Confirmed lost ${totals.lost}u; other consumption ${totals.otherConsumed}u.`,
  ];
  const active=batches.find(b=>['collect','deliver'].includes(b.phase)&&entity.data.vestaWinnowRecovery?.batchId===b.id);
  if(active&&ownsWinnowRecoveryHull(state,entity)) {
    const phase=vestaWinnowPhase(state.simTime).phase;
    lines.push(`WINNOW NOW · ${phase.toUpperCase()}. ${active.phase==='deliver' ? "I'm taking recovered copper to Forge." : phase==='calm' ? 'Quiet gap. Slow a pod near Forge, then release your line if you want me to take it.' : 'Keep your line until the quiet gap, or keep the salvage.'}`);
  }
  return lines;
}
function uniqueTann(state, e) {
  if (!living(state, e) || tannId(e) !== DEF.contactId || e.data?.defId !== 'ship_mule') return false;
  return state.entityList.filter(x => x.alive && tannId(x) === DEF.contactId).length === 1;
}
function emptyManifest(m) { return m == null || m.totalQty === 0 && Array.isArray(m.lines) && m.lines.length === 0; }
function sourceIndex(state) {
  const index=new Map();
  for(const e of state.entityList) {
    const stamp=e.alive&&e.data?.vestaWinnowPod;if(!stamp) continue;
    let pods=index.get(stamp.batchId);if(!pods)index.set(stamp.batchId,pods=new Map());
    pods.set(stamp.podId,pods.has(stamp.podId)?null:e);
  }
  return index;
}
function sourcePod(state, b, r, index=null) {
  if(index){const e=index.get(b.id)?.get(r.id);return e?.data.amount===r.loose?e:null;}
  const found = state.entityList.filter(e => e.alive && e.data?.vestaWinnowPod?.batchId === b.id && e.data.vestaWinnowPod.podId === r.id);
  return found.length === 1 && found[0].data.amount === r.loose ? found[0] : null;
}
function manifestFor(e, b, qty) {
  return { finiteSource: 'vesta_winnow_recovery', manifestId: `${b.id}:load`, freighterKey: e.data.worldRecordId, lotId: b.id,
    lines: qty ? [{ commodityId: DEF.commodityId, qty }] : [], totalQty: qty, totalValue: 0 };
}
export function admitWinnowRecovery(owner, entity, rec, settledManifest = null) {
  const s = owner.state, d = entity?.data;
  if(tannId(entity)!==DEF.contactId) return false;
  const candidates=root(s)?.batches.filter(b=>b.phase==='available'&&!b.carrierId);
  if(!candidates?.length) return false;
  if (s.world?.currentSectorId !== DEF.sectorId || !uniqueTann(s, entity) || !rec || rec.id !== entity.id
    || !d.worldRecordId || (!settledManifest && d.jobId) || d.itinerary || rec.worldSiteRoute || rec.claimTravelRoute || d.claimDepotId
    || d.vestaWinnowRecovery || d.civilianReaction || rec.civilianReaction) return false;
  // Only the owner's actual settled manifest may bypass the empty-hold gate.
  if (settledManifest ? d.cargoManifest !== settledManifest || rec.manifest !== settledManifest
    : !emptyManifest(d.cargoManifest) || !emptyManifest(rec.manifest)) return false;
  const index=sourceIndex(s);
  const b=candidates.find(b=>b.pods.some(r=>r.loose>0&&sourcePod(s,b,r,index)));
  if (!b) return false;
  if (settledManifest && d.jobId) {
    // A completed real unload can empty the hold while its job finishes naturally.
    if (owner._setTrafficManifest(entity, rec, manifestFor(entity, b, 0)) !== true) return false;
    return true;
  }
  const saved = { persistent: entity.flags?.persistent === true, scanLabel: d.scanLabel ?? null, intent: d.intent ? copy(d.intent) : null };
  if (owner._setTrafficManifest(entity, rec, manifestFor(entity, b, 0)) !== true) return false;
  b.carrierId = d.worldRecordId; b.phase = 'collect';
  d.vestaWinnowRecovery = { batchId: b.id, saved };
  // itinerary/cargoManifest are already durable world-record fields, no parallel cargo bag.
  d.itinerary = { kind: 'vesta_winnow_recovery', batchId: b.id, destinationStationId: DEF.stationId, phase: 'collect' };
  entity.flags = { ...entity.flags, persistent: true };
  persistenceLeases.set(entity, entity.flags);
  d.scanLabel = 'SLAG-RUN · WINNOW REMAINDER → FORGE';
  owner.bus.emit('comms:log', { from: 'SLAG-RUN', kind: 'encounter', text: 'Tann here. Keep the salvage, or help me get a pod home: bring one near Forge, slow it, then release your line when the Winnow is calm. No bounty on this run.' });
  return true;
}
function currentCarrier(owner, b) {
  const matches = owner.state.entityList.filter(e => living(owner.state, e) && e.data?.worldRecordId === b.carrierId);
  const e = matches.length === 1 ? matches[0] : null;
  return e && uniqueTann(owner.state, e) && e.data.vestaWinnowRecovery?.batchId === b.id ? e : null;
}
// A foreign/stale itinerary label alone never grants cast or cleanup immunity.
export function ownsWinnowRecoveryHull(state,entity) {
  const stamp=entity?.data?.vestaWinnowRecovery,route=entity?.data?.itinerary;
  if(!stamp || tannId(entity)!==DEF.contactId || !living(state,entity)
    || route?.kind!=='vesta_winnow_recovery' || route.batchId!==stamp.batchId
    || route.destinationStationId!==DEF.stationId || !stamp.saved) return false;
  const b=batch(state,stamp.batchId);
  return !!b && ['collect','deliver','delivered','empty'].includes(b.phase)
    && b.carrierId===entity.data.worldRecordId && currentCarrier({state},b)===entity
    && ownsFiniteWinnowManifest(state,entity,true);
}
function reserveBlocked(owner, pod) {
  return owner._deferOrdinaryCleanupClaim?.(pod) === true
    || owner.state.player?.tether?.active === true && owner.state.player.tether.targetId === pod.id;
}
// A deliberate player release may happen before the tether mirror is cleared.
// Readiness defers the automatic station sale; it grants no claim or cargo transfer.
// Matching velocity remains the later physical pickup gate, after the line is free.
export function winnowCarrierHandoffReady(owner,pod) {
  const s=owner?.state;if(!s || !living(s,pod)) return false;
  const stamp=pod.data?.vestaWinnowPod,b=stamp&&batch(s,stamp.batchId),r=rowFor(b,pod);
  if(!r || !r.loose || b.phase!=='collect' || sourcePod(s,b,r)!==pod) return false;
  const e=currentCarrier(owner,b),rec=e&&recordFor(owner,e);
  if(!e || !ownsWinnowRecoveryHull(s,e) || e.data.jobId || e.data.violenceAlarmed || rec?.violenceAlarmed
    || pod.data.salvorClaimedBy && pod.data.salvorClaimedBy!==b.carrierId
    || vestaWinnowPhase(s.simTime).phase!=='calm' || !pose(e) || !pose(pod)
    || Math.hypot(pod.pos.x-e.pos.x,pod.pos.z-e.pos.z)>180) return false;
  return !!nativeRecord(owner,e) && !!nativeRecord(owner,pod);
}
function clearTarget(state, b) {
  for (const e of state.entityList) if (e.data?.vestaWinnowPod?.batchId === b.id
    && e.data.salvorClaimedBy === b.carrierId) delete e.data.salvorClaimedBy;
  b.targetPodId = null;
}
function hold(e) { e.data.intent = { vestaWinnowOwned:true, moveX: 0, moveZ: 0, boost: false, fire: false, brake: true, aimAngle: e.rot }; }
// One local station detour, not a route planner: preserve a side until the actual
// segment clears the authored envelope. Only the final receiver corridor is exempt.
export function winnowSteeringTarget(owner,e,target,allowedStationId=null) {
  const route=e.data.vestaWinnowRecovery;if(!route)return target;
  const dx=target.x-e.pos.x,dz=target.z-e.pos.z,length2=dx*dx+dz*dz;
  if(!length2)return target;
  let selected=null;const seenStations=new Set();
  for(const station of owner.state.entityList) {
    if(!living(owner.state,station)||station.type!=='station'||!pose(station))continue;
    const key=`${station.data?.stationId||station.id}:${station.pos.x}:${station.pos.z}`;if(seenStations.has(key))continue;seenStations.add(key);
    const proxy=resolveCollisionProxyManifest(station);
    if(station.data?.stationId===allowedStationId&&proxy?.docking){
      const gate=corridorStateFor(proxy,station,e.pos,e.vel),ax=gate.axis;
      const x=e.pos.x-station.pos.x,z=e.pos.z-station.pos.z;
      const aligned=x*ax.x+z*ax.z>0&&Math.abs(-x*ax.z+z*ax.x)<=proxy.docking.capture.halfWidth*gate.scale;
      if(gate.inCorridor||gate.inCapture||aligned)continue;
    }
    const radius=Math.max(station.radius||0,proxy?proxyOuterRadiusWu(proxy,station):0)+hullEnvelopeWu(e)+12;
    const sx=station.pos.x-e.pos.x,sz=station.pos.z-e.pos.z,t=Math.max(0,Math.min(1,(sx*dx+sz*dz)/length2));
    const clearance=Math.hypot(sx-dx*t,sz-dz*t)-radius;
    const remembered=!!route.detour && route.detour.stationKey===key;
    if(clearance>=(remembered?8:0))continue;
    // A target already taking us radially away from contact needs no turn around it.
    if(t===0&&sx*dx+sz*dz<0)continue;
    if(!selected||remembered&&!selected.remembered||remembered===selected.remembered&&t<selected.t)selected={station,radius,t,remembered,key};
  }
  if(!selected){delete route.detour;return target;}
  const {station,radius}=selected,angle=Math.atan2(e.pos.z-station.pos.z,e.pos.x-station.pos.x);
  const goal=Math.atan2(target.z-station.pos.z,target.x-station.pos.x),delta=Math.atan2(Math.sin(goal-angle),Math.cos(goal-angle));
  const side=selected.remembered?route.detour.side:(Math.sign(delta)||((Number(e.id)||0)%2?1:-1));
  const distance=Math.hypot(e.pos.x-station.pos.x,e.pos.z-station.pos.z);
  const exit=selected.remembered?route.detour.exit===true:distance<radius+8;
  route.detour={stationId:station.data?.stationId,stationKey:selected.key,side,exit:exit&&distance<radius+12};
  const bearing=route.detour.exit?angle:angle+side*.45;
  return {x:station.pos.x+Math.cos(bearing)*(radius+18),z:station.pos.z+Math.sin(bearing)*(radius+18)};
}
function steer(owner, e, target, speed, reach = 2, allowedStationId=null) {
  const destination=target;
  target=winnowSteeringTarget(owner,e,target,allowedStationId);
  // Intermediate exits must cross the radius+12 release threshold, not brake
  // ten units short of the radius+18 waypoint and remain trapped forever.
  if(target!==destination) reach=Math.min(reach,2);
  const dx = target.x-e.pos.x, dz = target.z-e.pos.z, distance = Math.hypot(dx,dz), aim = Math.atan2(dz,dx);
  const p = resolvePropulsionProfile(e, owner.state), accel = Math.max(1,p.reverseAccel || 0,(p.mainAccel || 0)*0.72);
  const desired = Math.min(speed,Math.max(0,distance-reach)*0.45,Math.sqrt(2*accel*Math.max(0,distance-reach)));
  const brake = distance <= reach || Math.cos(aim-e.rot)<0.85 || Math.hypot(e.vel.x,e.vel.z)>desired+2;
  e.data.intent = { vestaWinnowOwned:true, moveX:0, moveZ:brake?0:Math.min(1,Math.max(0.03,desired/Math.max(1,p.combatSpeed||e.maxSpeed||100))), boost:false, fire:false, brake, aimAngle:aim };
}
export function winnowPickupReceipt(owner, payload) {
  const s = owner.state, p = s.entities.get(payload?.pickupId), stamp = p?.data?.vestaWinnowPod;
  const b = stamp && batch(s, stamp.batchId), r = rowFor(b,p);
  if (!r || !living(s,p) || p.data.commodityId !== DEF.commodityId || seenReceipts.has(payload)) return false;
  if (payload.collectorId === s.playerId) {
    const qty = payload.acceptedAmount;
    if (r.loose !== p.data.amount) return false; // receipt replay before the physical owner publishes remainder
    const receiptLife=(payload.richLotSource || payload.lotSource)?.winnowLife;
    if (whole(qty) && qty > 0 && qty <= r.loose && receiptLife && receiptLife===p.data.richLotSource?.winnowLife) {
      seenReceipts.add(payload); r.loose -= qty; r.player += qty;
    }
    return true;
  }
  const e = currentCarrier(owner,b);
  if (!e || e.id !== payload.collectorId) {
    const qty = successfulPickupAmount(payload);
    if (r.loose === p.data.amount && whole(qty) && qty > 0 && qty <= r.loose) {
      seenReceipts.add(payload); r.loose -= qty; r.other = (r.other || 0) + qty;
    }
    return true; // retain the ordinary collector's outcome; no invented manifest
  }
  payload.acceptedAmount = 0; payload.rejectedAmount = p.data.amount;
  if (!e || e.id !== payload.collectorId || b.phase !== 'collect' || b.targetPodId !== r.id
    || sourcePod(s,b,r) !== p || reserveBlocked(owner,p) || vestaWinnowPhase(s.simTime).phase !== 'calm'
    || e.data.jobId || !ownsFiniteWinnowManifest(s,e,true) || !pose(e) || !pose(p)
    || p.data.salvorClaimedBy && p.data.salvorClaimedBy !== b.carrierId || !nativePickupContact(owner,e,p)) return false;
  const qty = Math.min(r.loose, DEF.capacity-held(b));
  if (!qty || owner._setTrafficManifest(e, recordFor(owner,e), manifestFor(e,b,held(b)+qty)) !== true) return false;
  seenReceipts.add(payload); r.loose-=qty; r.aboard+=qty;
  payload.acceptedAmount=qty; payload.rejectedAmount=p.data.amount-qty;
  clearTarget(s,b);
  return true;
}
export function winnowReceiverAnchor(station, carrier) {
  const proxy=resolveCollisionProxyManifest(station);
  return proxy?.docking ? resolveDockAnchor(station,proxy,carrier) : null;
}
function nativeRecord(owner, entity) {
  const s=owner.state, physics=owner._registry?.get?.('physics'), native=physics?._sg02;
  if (physics?.state!==s || s.settings?.gameplay?.physicsBackend!=='rapier-dynamic'
    || physics._diag?.sg02Ready!==true || physics._nativeRestorePending || physics._nativeRestoreDeferred
    || !living(s,entity) || !pose(entity) || !physicsBodyNativeReady(entity)
    || native?._pendingNativeRebuilds?.has(entity.id)) return null;
  const rec=native?.records.get(entity.id);
  if (rec?.entity!==entity || !rec.body?.isValid() || !rec.body.isEnabled()
    || rec.revision!==rec.spec?.revision || rec.revision!==entity.physicsBody?.revision) return null;
  const at=rec.body.translation(), velocity=rec.body.linvel(), origin=native._frameOrigin;
  const q=rec.body.rotation(), yaw=-Math.atan2(2*(q.w*q.y+q.x*q.z),1-2*(q.y*q.y+q.z*q.z));
  if (!Number.isFinite(entity.rot) || Math.abs(Math.atan2(Math.sin(yaw-entity.rot),Math.cos(yaw-entity.rot)))>0.001) return null;
  if (Math.hypot(at.x+(origin?.x||0)-entity.pos.x,at.z+(origin?.z||0)-entity.pos.z)>0.02
    || Math.hypot(velocity.x-entity.vel.x,velocity.z-entity.vel.z)>0.02) return null;
  return rec;
}
function nativePickupContact(owner,carrier,pod) {
  if (reserveBlocked(owner,pod) || vestaWinnowPhase(owner.state.simTime).phase!=='calm') return false;
  const a=nativeRecord(owner,carrier),b=nativeRecord(owner,pod);
  if (!a || !b || Math.hypot(carrier.vel.x-pod.vel.x,carrier.vel.z-pod.vel.z)>DEF.pickupSpeed) return false;
  try { for (const x of a.colliders) for (const y of b.colliders) {
    const contact=x.contactCollider(y,0);
    if (contact && contact.distance<=0) return true;
  }} catch { return false; }
  return false;
}
function receiverReady(owner,e,station) {
  const s=owner.state, physics=owner._registry?.get?.('physics'), native=physics?._sg02;
  const anchor=winnowReceiverAnchor(station,e);
  if (!anchor || !living(s,e) || !living(s,station) || !pose(e) || !pose(station)
    || station.data?.stationId!==DEF.stationId || s.settings?.gameplay?.physicsBackend!=='rapier-dynamic'
    || physics?._diag?.sg02Ready!==true || physics._nativeRestorePending || physics._nativeRestoreDeferred) return false;
  const a=nativeRecord(owner,e), b=nativeRecord(owner,station);
  if (a?.entity!==e || b?.entity!==station || !a.body?.isValid() || !b.body?.isValid() || !a.body.isEnabled() || !b.body.isEnabled()) return false;
  return Math.hypot(e.pos.x-anchor.x,e.pos.z-anchor.z)<=anchor.dockRadius
    && Math.hypot(e.vel.x-station.vel.x,e.vel.z-station.vel.z)<=anchor.speedGate;
}
export function settleWinnowRecovery(owner,e,station) {
  const s=owner.state,b=batch(s,e?.data?.vestaWinnowRecovery?.batchId);
  if (!b || currentCarrier(owner,b)!==e || b.phase!=='deliver' || !receiverReady(owner,e,station)) return false;
  const manifest=e.data.cargoManifest,qty=held(b),economy=owner._registry?.get?.('economy');
  if (!qty || e.data.jobId || !ownsFiniteWinnowManifest(s,e) || typeof economy?.applyFreightDelivery!=='function') return false;
  const book=root(s),generation=e.occupantGeneration,receiverGeneration=station.occupantGeneration;
  let committed=false;
  const receiptId=`${b.id}:forge`;
  try { economy.applyFreightDelivery({receiptId,stationId:DEF.stationId,commodityId:DEF.commodityId,qty,
    commitCustody(result) {
      if (committed || root(s)!==book || currentCarrier(owner,b)!==e || e.occupantGeneration!==generation
        || station.occupantGeneration!==receiverGeneration || b.phase!=='deliver' || e.data.cargoManifest!==manifest
        || held(b)!==qty || e.data.jobId || !ownsFiniteWinnowManifest(s,e) || !receiverReady(owner,e,station) || result?.ok!==true || result.qty!==qty
        || result.receiptId!==receiptId || result.stationId!==DEF.stationId || result.commodityId!==DEF.commodityId) return false;
      if (owner._setTrafficManifest(e,recordFor(owner,e),manifestFor(e,b,0))!==true) return false;
      for (const r of b.pods) {r.delivered+=r.aboard;r.aboard=0;}
      b.phase='delivered';b.deliveredAt=s.simTime;committed=true;return true;
    }}); } catch { /* committed custody cannot be resurrected by a failing observer */ }
  if (committed) owner.bus.emit('comms:log',{from:'SLAG-RUN',kind:'encounter',text:`Forge took ${qty} units of the recovered copper.`});
  return committed;
}
export function stepWinnowRecovery(owner,e,rec) {
  const s=owner.state;
  if (!e?.data?.vestaWinnowRecovery) return admitWinnowRecovery(owner,e,rec);
  if (!ownsWinnowRecoveryHull(s,e)) return false;
  const b=batch(s,e.data.vestaWinnowRecovery.batchId);
  if (s.world?.currentSectorId!==DEF.sectorId) {hold(e);return true;}
  if (!persistenceLeases.has(e)) persistenceLeases.set(e,e.flags);
  if (b.phase==='delivered' || b.phase==='empty') {
    clearTarget(s,b);
    const saved=e.data.vestaWinnowRecovery.saved;
    if (e.data.itinerary?.kind==='vesta_winnow_recovery' && e.data.itinerary.batchId===b.id) delete e.data.itinerary;
    if (!saved.persistent && persistenceLeases.get(e)===e.flags && !e.data.jobId
      && !e.flags.missionPinned && !e.data.missionId && !e.data.missionTag && !e.data.persistent) delete e.flags.persistent;
    persistenceLeases.delete(e);
    if (e.data.scanLabel==='SLAG-RUN · WINNOW REMAINDER → FORGE') {
      if (saved.scanLabel==null) delete e.data.scanLabel;else e.data.scanLabel=saved.scanLabel;
    }
    if (e.data.intent?.vestaWinnowOwned===true) {
      if (saved.intent==null) delete e.data.intent;else e.data.intent=saved.intent;
    }
    delete e.data.vestaWinnowRecovery;
    return false;
  }
  // The traffic violence owner has already run and consumes active alarm ticks.
  // Its historical reaction label survives expiry and must not freeze escape thrust.
  if (e.data.jobId || e.data.violenceAlarmed || rec.violenceAlarmed) {clearTarget(s,b);return true;}
  if (b.phase==='collect') {
    const calm=vestaWinnowPhase(s.simTime).phase==='calm';
    const mouth=VESTA_ORE_WINNOW.globalPos;
    if (!calm && Math.hypot(e.pos.x-mouth.x,e.pos.z-mouth.z)<500) {clearTarget(s,b);hold(e);return true;}
    let target=null;
    for (const r of b.pods) {
      if (!r.loose) continue;
      const p=sourcePod(s,b,r);
      // Choose an interceptable free body; physical pickup below owns the relative-speed gate.
      // Equal motion in the world is safe contact even when both bodies exceed eight WU/s.
      if (!p || Math.hypot(p.pos.x-e.pos.x,p.pos.z-e.pos.z)>180
        || !nativeRecord(owner,p) || reserveBlocked(owner,p) || p.data.salvorClaimedBy && p.data.salvorClaimedBy!==b.carrierId) continue;
      if (!target || Math.hypot(p.pos.x-e.pos.x,p.pos.z-e.pos.z)<Math.hypot(target.pos.x-e.pos.x,target.pos.z-e.pos.z)) target=p;
    }
    if (target) {
      delete e.data.vestaWinnowRecovery.waitingHold;
      clearTarget(s,b); b.targetPodId=target.data.vestaWinnowPod.podId;target.data.salvorClaimedBy=b.carrierId;
      const distance=Math.hypot(target.pos.x-e.pos.x,target.pos.z-e.pos.z);
      const relativeGoal=calm?0:(e.radius+target.radius+30);
      const close=Math.max(0,distance-relativeGoal);
      const closingSpeed=Math.min(DEF.cruiseSpeed,Math.max(2,close*0.35));
      const speed=Math.min(DEF.cruiseSpeed,Math.hypot(target.vel.x,target.vel.z)+closingSpeed);
      const lead=Math.min(2,distance/Math.max(1,speed));
      steer(owner,e,{x:target.pos.x+target.vel.x*lead,z:target.pos.z+target.vel.z*lead},speed,relativeGoal);
      if (nativePickupContact(owner,e,target)) owner._registry.get('physics')._tryCollectPickup(target,e);
      return true;
    }
    clearTarget(s,b);
    if (!held(b)) {
      if (!b.pods.some(r=>r.loose>0)) {b.phase='empty';hold(e);return true;}
      const station=s.entityList.find(x=>living(s,x)&&x.type==='station'&&x.data?.stationId===DEF.stationId);
      const proxy=station&&resolveCollisionProxyManifest(station),axis=proxy&&resolveCorridorAxisWorld(station,proxy);
      if (station && axis) {
        const radius=proxyOuterRadiusWu(proxy,station)+hullEnvelopeWu(e)+80;
        const waiting={x:station.pos.x+axis.x*radius,z:station.pos.z+axis.z*radius};
        const distance=Math.hypot(e.pos.x-waiting.x,e.pos.z-waiting.z);
        const lease=e.data.vestaWinnowRecovery;
        // This is a waiting-area tolerance, never a pickup or receiver admission.
        // Brake through the real propulsion owner rather than orbiting an exact point.
        if (lease.waitingHold && distance>80) delete lease.waitingHold;
        if (distance<=40 && winnowSteeringTarget(owner,e,waiting)===waiting) lease.waitingHold=true;
        if (lease.waitingHold) hold(e);
        else steer(owner,e,waiting,distance<180?18:DEF.cruiseSpeed,10);
      } else hold(e);
      return true;
    }
    b.phase='deliver';e.data.itinerary.phase='deliver';
  }
  if (b.phase==='deliver') {
    const station=s.entityList.find(x=>living(s,x)&&x.type==='station'&&x.data?.stationId===DEF.stationId);
    const anchor=station&&winnowReceiverAnchor(station,e);
    if (!anchor) {hold(e);return true;}
    // Approach the corridor from outside the compiled station envelope, never through its hull.
    const proxy=resolveCollisionProxyManifest(station),axis=resolveCorridorAxisWorld(station,proxy);
    const radius=proxyOuterRadiusWu(proxy,station)+hullEnvelopeWu(e)+160;
    const dx=e.pos.x-station.pos.x,dz=e.pos.z-station.pos.z;
    const along=dx*axis.x+dz*axis.z,lateral=-dx*axis.z+dz*axis.x;
    let target=anchor;
    if (along<=0 || along<radius && Math.abs(lateral)>anchor.dockRadius*2) {
      const angle=Math.atan2(dz,dx),goal=Math.atan2(axis.z,axis.x),delta=Math.atan2(Math.sin(goal-angle),Math.cos(goal-angle));
      target={x:station.pos.x+Math.cos(angle+Math.sign(delta)*Math.min(0.2,Math.abs(delta)))*radius,z:station.pos.z+Math.sin(angle+Math.sign(delta)*Math.min(0.2,Math.abs(delta)))*radius};
    }
    steer(owner,e,target,target===anchor?25:DEF.cruiseSpeed,target===anchor?2:10,target===anchor?DEF.stationId:null);
    settleWinnowRecovery(owner,e,station);
    return true;
  }
  hold(e);return true;
}
export function winnowDestroyedReceipt(owner,payload) {
  const e=payload?.entity;
  if (!e || payload.reason && /shelv|sector|virtual|restore|reset/.test(payload.reason)) return;
  const s=owner.state,stamp=e.data?.vestaWinnowPod,b=stamp&&batch(s,stamp.batchId),r=rowFor(b,e);
  if (!r) return;
  // Dump Chute consumption queues this ordinary retirement before its economy transaction
  // commits. By receipt flush the saved ring proves the exact paid physical lifetime.
  // A stale slot receipt, live body, replay, or uncommitted request cannot debit the source.
  const qty=e.data.amount,life=e.occupantGeneration;
  const intake=Number.isSafeInteger(life) && s.economy?.podIntakeReceipts?.find(receipt=>
    receipt.intakeId===`dumpchute:${e.id}:${life}` && receipt.podId===String(e.id)
    && receipt.commodityId===DEF.commodityId && receipt.qty===qty);
  if (intake && e.alive===false && s.entities.get(e.id)!==e && whole(qty) && qty>0 && r.loose===qty) {
    r.loose-=qty;r.other=(r.other||0)+qty;return;
  }
  if (e.hull<=0 || ['jettisoned_cargo_pod_cap','manifest_payload_cap'].includes(payload.reason)) {r.lost+=r.loose;r.loose=0;}
}

// Splitting/violence/death move the original finite inventory through the existing
// producers. A successful child body inherits only the quantity actually admitted.
function moveToLooseChild(state,b,parents,child,qty,id) {
  if (!b || !living(state,child) || !whole(qty) || !qty || child.data?.vestaWinnowPod
    || b.pods.some(r=>r.id===id) || parents.reduce((n,p)=>n+p.row[p.field],0)<qty) return false;
  let left=qty; const lineage=[],sourceIds=new Set();
  for (const {row,field} of parents) {
    const take=Math.min(left,row[field]); if (!take) continue;
    row[field]-=take;row.original-=take;left-=take;lineage.push({id:row.id,qty:take});
    for(const source of row.sourceIds || [row.id]) sourceIds.add(source);
  }
  child.data.vestaWinnowPod={batchId:b.id,podId:id};
  child.data.richLotSource={lotId:id,provenanceId:b.id,sourceKind:'winnow_salvage',lotQty:qty,legalStatus:'salvage',winnowLife:{}};
  child.flags={...child.flags,persistent:true};
  delete child.data.despawnAt;
  b.pods.push({id,original:qty,loose:qty,aboard:0,player:0,delivered:0,lost:0,other:0,lineage,sourceIds:[...sourceIds]});
  return true;
}
export function inheritWinnowSplit(state,source,child) {
  const stamp=source?.data?.vestaWinnowPod,b=stamp&&batch(state,stamp.batchId),r=rowFor(b,source);
  if (!r || child?.data?.commodityId!==DEF.commodityId) return false;
  const id=`${r.id}:split:${(r.splitSeq||0)+1}`;
  if (!moveToLooseChild(state,b,[{row:r,field:'loose'}],child,child.data.amount,id)) return false;
  r.splitSeq=(r.splitSeq||0)+1;
  return true;
}
export function ownsFiniteWinnowManifest(state,entity,allowEmpty=false) {
  const death=verifiedDeathManifests.get(entity);
  if (!allowEmpty && death && entity.hull<=0 && death.book===root(state) && death.manifest===entity.data?.cargoManifest && death.signature===JSON.stringify(death.manifest)) return true;
  const b=batch(state,entity?.data?.vestaWinnowRecovery?.batchId),m=entity?.data?.cargoManifest;
  return !!b && b.carrierId===entity.data.worldRecordId && tannId(entity)===DEF.contactId
    && m?.finiteSource==='vesta_winnow_recovery' && m.manifestId===`${b.id}:load`
    && m.freighterKey===b.carrierId && m.lotId===b.id && m.totalQty===held(b)
    && (allowEmpty && m.totalQty===0 && m.lines?.length===0
      || m.totalQty>0 && m.lines?.length===1 && m.lines[0].commodityId===DEF.commodityId && m.lines[0].qty===m.totalQty);
}
export function winnowSpillReceipt(owner,payload) {
  const s=owner.state,e=s.entities.get(payload?.carrierId??payload?.victimId);
  const b=batch(s,e?.data?.vestaWinnowRecovery?.batchId);
  if (!b || b.carrierId!==e.data.worldRecordId) return false;
  const m=e.data.cargoManifest;
  if (m?.finiteSource!=='vesta_winnow_recovery' || m.manifestId!==`${b.id}:load`
    || m.freighterKey!==b.carrierId || m.lotId!==b.id || !whole(m.totalQty) || m.totalQty>held(b)
    || (m.totalQty===0 ? m.lines?.length!==0 : m.lines?.length!==1 || m.lines[0].commodityId!==DEF.commodityId || m.lines[0].qty!==m.totalQty)) return false;
  const ids=payload.podIds || (payload.payloadId!=null?[payload.payloadId]:[]);
  let moved=false;
  if (payload.victimId===e.id && e.hull<=0 && ownsFiniteWinnowManifest(s,e)) {
    verifiedDeathManifests.set(e,{book:root(s),manifest:e.data.cargoManifest,signature:JSON.stringify(e.data.cargoManifest)});
  }
  for (const id of ids) {
    const child=s.entities.get(id),qty=child?.data?.salvagePool?.[DEF.commodityId];
    if (!child || child.data.manifestId!==`${b.id}:load` || child.data.vestaWinnowPod || !whole(qty) || !qty || qty>held(b)) continue;
    const leaf=`${b.id}:spill:${(b.spillSeq||0)+1}`;
    if (!moveToLooseChild(s,b,b.pods.map(row=>({row,field:'aboard'})),child,qty,leaf)) continue;
    b.spillSeq=(b.spillSeq||0)+1;
    // The salvage promise travels with its original remainder, even after a hull loss.
    child.data.kind='cargo';child.data.commodityId=DEF.commodityId;child.data.amount=qty;
    delete child.data.ownerId;delete child.ownerId;
    if(child.data.cargoIdentity) child.data.cargoIdentity={...child.data.cargoIdentity,ownerId:null};
    moved=true;
  }
  return moved;
}
export function trackWinnowThreats(state,batchId,entities) {
  const b=batch(state,batchId);if(!b || b.threats.length) return;
  for(let i=0;i<entities.length;i++) {
    const e=entities[i];if(!living(state,e)) continue;
    const id=`${b.id}:threat:${i}`;
    e.data.vestaWinnowThreat={batchId:b.id,id};
    e.flags={...e.flags,persistent:true};
    b.threats.push({id,defeated:false});
  }
}
export function winnowKilledReceipt(owner,payload) {
  const e=owner.state.entities.get(payload?.id),stamp=e?.data?.vestaWinnowThreat;
  const b=stamp&&batch(owner.state,stamp.batchId);
  const threat=b?.threats.find(t=>t.id===stamp.id);
  if(threat) threat.defeated=true;
  const load=batch(owner.state,e?.data?.vestaWinnowRecovery?.batchId);
  if(load && load.carrierId===e.data.worldRecordId) load.carrierDestroyed=true;
}
export function reconcileWinnowRecovery(owner) {
  const s=owner.state;
  for(const b of root(s)?.batches || []) {
    if(['episode','unclaimed'].includes(b.phase) && !s.encounterDirector?.live?.[b.encounterId] && b.threats?.length && b.threats.every(t=>t.defeated)) {
      b.phase='available';b.outcome=b.outcome||'threats_defeated';
    }
    if (!b.carrierId || !['collect','deliver'].includes(b.phase)) continue;
    const original=s.entityList.find(e=>e.data?.worldRecordId===b.carrierId);
    if (b.carrierDestroyed || original && original.hull<=0) {
      // The ordinary loot owner already offered a finite manifest payload on the kill.
      // Only an actually destroyed carrier with no remaining physical spill proves loss.
      for(const r of b.pods) {r.lost+=r.aboard;r.aboard=0;}
      clearTarget(s,b);b.phase='carrier_lost';
      const facts=winnowRecoveryFacts(s,b.id);
      owner.bus.emit('comms:log',{from:'FORGE TRAFFIC',kind:'encounter',
        text:`Tann's carrier is lost. Winnow: ${facts.loose}u loose; ${facts.lost}u confirmed lost. Loose copper remains legal salvage; sell recovered copper at Forge's Market.`});
    }
  }
}
