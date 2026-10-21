import { physicsBodyNativeReady } from '../core/physicsAuthority.js';
// One original Stormshift spill, not a new inventory or salvage manager. Quotes are
// transient exact-life capabilities; both durable receipts are plain existing save data.
import { indexedTypeScan } from './livingWorldViews.js';
import { PLANET_SITE } from '../data/planets.js';
import { stableRecordId, RECORD_KIND } from './worldRecords.js';
import { isOrchardReceiver } from './anvilOrchardTowAssist.js';

export const ANVIL_RETURN_GAS = 'return_gas';
export const ANVIL_RENDEZVOUS = 'spill_rendezvous', ANVIL_CANCEL_RENDEZVOUS = 'cancel_spill_rendezvous';
const rendezvousQuotes = new WeakMap(), rendezvous = new WeakMap();
const RENDEZVOUS_BUDGET_S = 30;
const quotes = new WeakMap();
const whole = n => Number.isSafeInteger(n) && n >= 0;
const live = (s, e) => e?.alive === true && e.hull > 0 && s.entities?.get(e.id) === e;
const pose = e => [e?.pos?.x,e?.pos?.z,e?.vel?.x,e?.vel?.z].every(Number.isFinite);
export function anvilSpillReceipt(state, receiver) {
  if (!isOrchardReceiver(state, receiver) || receiver.data.jobId) return null;
  const id = stableRecordId(state.meta?.seed || 1, PLANET_SITE.sectorId, RECORD_KIND.CONVOY, 'anvil:shift:receiver');
  const record = state.world?.records?.byId?.[id];
  if (!record || record.alive === false || ['destroyed','defeated'].includes(record.outcome)) return null;
  const index = state.entityIndex;
  const count = index?.__spacefaceEntityIndexV1 === true && index.ready === true && index.byWorldRecordIdCount instanceof Map
    ? index.byWorldRecordIdCount.get(id) || 0 : null;
  if (count !== 1 || index?.byWorldRecordId?.get(id) !== receiver) for (const other of state.entities.values())
    if (other !== receiver && other.alive !== false && other.data?.worldRecordId === id) return null;
  const r = receiver.data.itinerary.anvilSpillReturn;
  return r?.version === 1 && r.ownerRecordId === id && typeof r.manifestId === 'string' && r.manifestId
    && r.id === `anvil-spill:${id}:${r.manifestId}` && whole(r.initialQty) && r.initialQty > 0 && r.initialQty <= 12
    && whole(r.returnedQty) && r.returnedQty <= r.initialQty ? r : null;
}
export function anvilSpillReturnFacts(state, receiver) {
  return returnFacts(state, receiver, anvilSpillReceipt(state,receiver));
}
function returnFacts(state, receiver, receipt) {
  if (state?.mode !== 'flight') return null;
  if (!receipt || receipt.returnedQty === receipt.initialQty) return null;
  const player = state.entities.get(state.playerId), tether = state.player?.tether;
  const attachment = tether?.active && state.combat?.attachments?.byId?.[tether.attachmentId];
  const pod = attachment && state.entities.get(attachment.targetId);
  if (!live(state, player) || !live(state, pod) || attachment.state !== 'active'
    || attachment.ownerId !== player.id || attachment.ownerGeneration !== player.occupantGeneration
    || attachment.targetGeneration !== pod.occupantGeneration || tether.targetId !== pod.id) return null;
  const d = pod.data, mark = d?.anvilSpillReturn;
  if (pod.type !== 'payload' || d?.jettisonedCargo !== true || d.payloadType !== 'jettisoned_cargo'
    || mark?.id !== receipt.id || mark.ownerRecordId !== receipt.ownerRecordId || mark.manifestId !== receipt.manifestId
    || d.ownerRecordId !== receipt.ownerRecordId || d.manifestId !== receipt.manifestId
    || d.commodityId !== PLANET_SITE.harvest.commodityShallow || !whole(d.amount) || !d.amount
    || d.amount > receipt.initialQty - receipt.returnedQty
    || !d.salvagePool || Object.keys(d.salvagePool).length !== 1 || d.salvagePool[d.commodityId] !== d.amount
    || d.reservedBy || d.salvageSourceKey || d.freightCustodyPod || d.richLotSource || d.lotSource
    || d.salvorClaimedBy || d.npcTowedByJobId || d.caughtByNet || d.caughtByNetId) return null;
  for (const other of indexedTypeScan(state,'payloads')) if (other !== pod && other.alive !== false && other.data?.anvilSpillReturn?.id === receipt.id) return null;
  for (const a of Object.values(state.combat?.attachments?.byId || {})) if (a !== attachment && a.state === 'active'
    && ((a.targetId === pod.id && a.targetGeneration === pod.occupantGeneration)
      || (a.ownerId === pod.id && a.ownerGeneration === pod.occupantGeneration))) return null;
  const m = receiver.data.cargoManifest;
  if (!m || !whole(m.totalQty) || m.totalQty > 48 || !Array.isArray(m.lines)
    || m.lines.some(l => l.commodityId !== d.commodityId || !whole(l.qty) || !l.qty)
    || m.lines.reduce((n,l) => n+l.qty,0) !== m.totalQty) return null;
  const center = receiver.data.itinerary.center;
  if (!pose(receiver) || !pose(pod) || !pose(player) || !Number.isFinite(center?.x) || !Number.isFinite(center?.z)) return null;
  const dx = receiver.pos.x-center.x, dz = receiver.pos.z-center.z, length = Math.hypot(dx,dz);
  if (!(length > 0)) return null;
  const service = {x:receiver.pos.x-dx/length*60,z:receiver.pos.z-dz/length*60};
  const amount = Math.min(d.amount,48-m.totalQty);
  const ready = amount > 0 && Math.hypot(pod.pos.x-service.x,pod.pos.z-service.z) <= 24
    && Math.hypot(pod.vel.x-receiver.vel.x,pod.vel.z-receiver.vel.z) <= 8
    && Math.hypot(player.pos.x-receiver.pos.x,player.pos.z-receiver.pos.z) <= 560;
  return {receipt,player,pod,attachment,manifest:m,amount,ready,service};
}
export function anvilSpillReturnQuote(state, receiver) {
  return makeQuote(state,receiver,anvilSpillReturnFacts(state,receiver));
}
function makeQuote(state,receiver,f) {
  if (!f?.ready || !Number.isFinite(state.simTime)) return null;
  const quote = Object.freeze({id:f.receipt.id,amount:f.amount,podId:f.pod.id,expiresAt:state.simTime+4});
  quotes.set(quote,{...f,state,world:state.world,entities:state.entities,receiver,
    receiverLife:receiver.occupantGeneration,podLife:f.pod.occupantGeneration,playerLife:f.player.occupantGeneration,
    data:f.pod.data,pool:f.pod.data.salvagePool,route:receiver.data.itinerary,quantity:f.pod.data.amount,returned:f.receipt.returnedQty,
    manifestJSON:JSON.stringify(f.manifest),createdAt:state.simTime});
  return quote;
}
export function takeAnvilSpillReturnQuote(state,receiver,quote,physics) {
  const b = quotes.get(quote); quotes.delete(quote);
  const f = anvilSpillReturnFacts(state,receiver);
  if (!b || !f?.ready || b.state !== state || b.world !== state.world || b.entities !== state.entities
    || b.receiver !== receiver || b.receiverLife !== receiver.occupantGeneration || b.route !== receiver.data.itinerary
    || b.player !== f.player || b.playerLife !== f.player.occupantGeneration || b.pod !== f.pod || b.podLife !== f.pod.occupantGeneration
    || b.data !== f.pod.data || b.pool !== f.pod.data.salvagePool || b.quantity !== f.pod.data.amount || b.attachment !== f.attachment
    || b.receipt !== f.receipt || b.returned !== f.receipt.returnedQty || b.manifest !== f.manifest
    || b.manifestJSON !== JSON.stringify(f.manifest) || f.amount !== quote.amount
    || state.simTime < b.createdAt || state.simTime >= quote.expiresAt) return null;
  const current = nativeBinding(state,receiver,f,physics), saved=b.native;
  if (!sameNative(saved,current)) return null;
  return f;
}
function sameNative(saved,current) {
  return !!saved && !!current && saved.physics===current.physics && saved.owner===current.owner && saved.world===current.world
    && saved.epoch===current.epoch && saved.line===current.line && saved.handle===current.handle
    && saved.bodies.every((r,i)=>r.record===current.bodies[i].record && r.body===current.bodies[i].body
      && r.spec===current.bodies[i].spec && r.nativeSpec===current.bodies[i].nativeSpec && r.revision===current.bodies[i].revision);
}
function nativeBinding(state,receiver,f,physics) {
  const owner=physics?._sg02;
  if (state.settings?.gameplay?.physicsBackend!=='rapier-dynamic' || physics?.state!==state
    || physics._diag?.sg02Ready!==true || physics._nativeRestorePending || physics._nativeRestoreDeferred
    || !owner?.world || owner._pendingNativeRebuilds?.size || !owner.orchardAuthorityAvailable?.()) return null;
  try {
    const bodies=[receiver,f.player,f.pod].map(e=>{
      const r=owner.records.get(e.id);
      if(r?.entity!==e || r.revision!==e.physicsBody?.revision || r.spec?.revision!==r.revision || !r.body?.isValid() || !r.body.isEnabled() || !r.body.isDynamic() || !physicsBodyNativeReady(e))return null;
      const p=r.body.translation(),v=r.body.linvel(),o=owner._frameOrigin;
      if(![p.x,p.z,v.x,v.z,o?.x,o?.z].every(Number.isFinite)
        || Math.hypot(p.x+o.x-e.pos.x,p.z+o.z-e.pos.z)>=.1
        || Math.hypot(v.x-e.vel.x,v.z-e.vel.z)>=.1)return null;
      return {record:r,body:r.body,spec:e.physicsBody,revision:e.physicsBody?.revision,nativeSpec:r.spec};
    });
    if(bodies.some(r=>!r))return null;
    const a=f.attachment,line=owner.attachments.get(a.id);
    if(!line || a.defId!=='tether_standard' || a.physicsHandle?.id!==a.id
      || (a.controlMode!=null && a.controlMode!=='player') || line.owner!==bodies[1].record
      || line.target!==bodies[2].record || line.ownerEntity!==f.player || line.targetEntity!==f.pod
      || line.ownerLife!==f.player.occupantGeneration || line.targetLife!==f.pod.occupantGeneration
      || (a.controllerId!=null && (a.controllerId!==f.player.id || a.controllerGeneration!==f.player.occupantGeneration)))return null;
    return {physics,owner,world:owner.world,epoch:physics._sg02Token,bodies,line,handle:a.physicsHandle};
  }catch{return null;}
}
export function bindAnvilSpillReturnQuote(state,receiver,quote,physics) {
  const b=quotes.get(quote);
  if(!b || b.native || b.state!==state || b.receiver!==receiver)return false;
  const f=anvilSpillReturnFacts(state,receiver),native=f&&nativeBinding(state,receiver,f,physics);
  if(!native || f.pod!==b.pod || f.attachment!==b.attachment)return false;
  b.native=native;return true;
}

// One request-level projection, so Hail does not repeat population/attachment reads.
export function anvilSpillReturnOffer(state,receiver) {
  const receipt = anvilSpillReceipt(state,receiver);
  if (!receipt || receipt.returnedQty === receipt.initialQty) return null;
  const facts = returnFacts(state,receiver,receipt);
  const original = facts?.pod || indexedTypeScan(state,'payloads').find(e => e.alive !== false && e.data?.anvilSpillReturn?.id === receipt.id);
  const claimed = typeof original?.data?.salvorClaimedBy === 'string' && !!original.data.salvorClaimedBy;
  const service = anvilSpillRendezvousStatus(state,receiver);
  return original ? {facts,quote:makeQuote(state,receiver,facts),claimed,service,
    rendezvousQuote:!service.active ? rendezvousQuote(state,receiver,facts) : null} : null;
}

// One finite service budget on the existing spill receipt; native windows are transient.
function budget(receipt) {
  if (!Object.hasOwn(receipt || {},'rendezvousRemainingS')) return RENDEZVOUS_BUDGET_S;
  const n=receipt.rendezvousRemainingS;
  return Number.isFinite(n)&&n>=0&&n<=RENDEZVOUS_BUDGET_S?n:null;
}
function nearby(receiver,f) {
  return f?.amount>0 && Math.hypot(f.player.pos.x-receiver.pos.x,f.player.pos.z-receiver.pos.z)<=560
    && Math.hypot(f.pod.pos.x-receiver.pos.x,f.pod.pos.z-receiver.pos.z)<=560;
}
function rendezvousQuote(state,receiver,f) {
  const remaining=budget(f?.receipt);
  if(!f || !nearby(receiver,f) || !(remaining>0) || !Number.isFinite(state.simTime))return null;
  const q=Object.freeze({id:f.receipt.id,remainingS:remaining,expiresAt:state.simTime+4});
  rendezvousQuotes.set(q,{state,world:state.world,entities:state.entities,receiver,receiverLife:receiver.occupantGeneration,f,route:receiver.data.itinerary,
    data:f.pod.data,amount:f.pod.data.amount,returned:f.receipt.returnedQty,manifest:f.manifest,
    remaining,createdAt:state.simTime});return q;
}
export function bindAnvilSpillRendezvousQuote(state,receiver,q,physics) {
  const b=rendezvousQuotes.get(q),f=anvilSpillReturnFacts(state,receiver);
  if(!b || b.native || b.state!==state || b.receiver!==receiver || !nearby(receiver,f)
    || f.receipt!==b.f.receipt || f.pod!==b.f.pod || f.attachment!==b.f.attachment)return false;
  const n=nativeBinding(state,receiver,f,physics);if(!n)return false;b.native=n;return true;
}
export function startAnvilSpillRendezvous(state,receiver,q,physics) {
  const b=rendezvousQuotes.get(q);rendezvousQuotes.delete(q);
  advanceAnvilSpillRendezvous(state,physics);
  if(rendezvous.has(state))return {ok:false};
  const f=anvilSpillReturnFacts(state,receiver),now=state.simTime;
  if(!b || !nearby(receiver,f) || b.state!==state || b.world!==state.world || b.entities!==state.entities || b.receiver!==receiver
    || b.receiverLife!==receiver.occupantGeneration || b.route!==receiver.data.itinerary || b.data!==f.pod.data || b.f.receipt!==f.receipt || b.f.pod!==f.pod
    || b.f.player!==f.player || b.f.attachment!==f.attachment || b.manifest!==f.manifest
    || b.amount!==f.pod.data.amount || b.returned!==f.receipt.returnedQty || budget(f.receipt)!==b.remaining
    || !Number.isFinite(now) || now<b.createdAt || now>=q.expiresAt || !sameNative(b.native,nativeBinding(state,receiver,f,physics)))return {ok:false};
  const descriptor=Object.getOwnPropertyDescriptor(f.receipt,'rendezvousRemainingS');
  if(Object.getPrototypeOf(f.receipt)!==Object.prototype || (descriptor? !('value'in descriptor)||!descriptor.writable : !Object.isExtensible(f.receipt)))return {ok:false};
  f.receipt.rendezvousRemainingS=b.remaining;
  rendezvous.set(state,{...b,f,native:b.native,lastAt:now,expiresAt:now+b.remaining});
  return {ok:true,remainingS:b.remaining};
}
function settle(state,b) {
  if(state!==b.state || state.world!==b.world || state.entities!==b.entities || state.entities?.get(b.receiver.id)!==b.receiver
    || b.receiver.occupantGeneration!==b.receiverLife || b.receiver.data?.itinerary!==b.route || b.route.anvilSpillReturn!==b.f.receipt
    || b.native.physics?._sg02!==b.native.owner || b.native.physics?._sg02Token!==b.native.epoch)return false;
  const now=state.simTime,left=budget(b.f.receipt);
  if(!Number.isFinite(now)||now<b.lastAt||left==null)return false;
  const descriptor=Object.getOwnPropertyDescriptor(b.f.receipt,'rendezvousRemainingS');
  if(!descriptor || !('value'in descriptor)||!descriptor.writable)return false;
  b.f.receipt.rendezvousRemainingS=Math.max(0,Math.min(left,b.expiresAt-b.lastAt)-(now-b.lastAt));
  b.lastAt=now;return true;
}
function activeValid(state,b,physics) {
  const {receiver,f}=b;
  if(!receiver?.data || !f?.pod?.data || receiver.occupantGeneration!==b.receiverLife
    || !pose(receiver)||!pose(f.player)||!pose(f.pod))return false;
  const index=state.entityIndex;
  if(index?.ready!==true || index.byWorldRecordIdCount?.get(f.receipt.ownerRecordId)!==1
    || index.byWorldRecordId?.get(f.receipt.ownerRecordId)!==receiver)return false;
  const d=f.pod.data,r=f.receipt,m=receiver.data.cargoManifest;
  const record=state.world?.records?.byId?.[r.ownerRecordId];
  return state.world===b.world && state.entities===b.entities && state.world?.currentSectorId===PLANET_SITE.sectorId
    && state.mode==='flight' && record && record.alive!==false && !['destroyed','defeated'].includes(record.outcome)
    && live(state,receiver) && live(state,f.player) && live(state,f.pod) && state.playerId===f.player.id
    && receiver.data.itinerary===b.route && b.route.anvilSpillReturn===r && !receiver.data.jobId
    && d===b.data && d.anvilSpillReturn?.id===r.id && d.ownerRecordId===r.ownerRecordId && d.manifestId===r.manifestId
    && whole(d.amount) && d.amount>0 && d.amount<=r.initialQty-r.returnedQty && d.commodityId===PLANET_SITE.harvest.commodityShallow
    && d.salvagePool && Object.keys(d.salvagePool).length===1 && d.salvagePool[d.commodityId]===d.amount
    && !d.salvorClaimedBy && !d.npcTowedByJobId && !d.caughtByNet && !d.caughtByNetId && !d.reservedBy
    && m && whole(m.totalQty) && m.totalQty<48 && Array.isArray(m.lines)
    && m.lines.every(l=>l.commodityId===d.commodityId&&whole(l.qty)&&l.qty>0) && m.lines.reduce((n,l)=>n+l.qty,0)===m.totalQty
    && state.player?.tether?.active && state.player.tether.attachmentId===f.attachment.id
    && state.combat?.attachments?.byId?.[f.attachment.id]===f.attachment && f.attachment.state==='active'
    && nearby(receiver,{...f,amount:1}) && sameNative(b.native,nativeBinding(state,receiver,f,physics));
}
// Called once through the existing traffic owner before sector/receiver early returns.
export function advanceAnvilSpillRendezvous(state,physics) {
  const b=rendezvous.get(state);if(!b)return null;
  if(state.world!==b.world || state.entities!==b.entities || b.receiver.data?.itinerary!==b.route
    || b.route.anvilSpillReturn!==b.f.receipt || physics!==b.native.physics || physics?._sg02!==b.native.owner
    || physics?._sg02Token!==b.native.epoch){rendezvous.delete(state);return null;}
  if(!settle(state,b)||!(budget(b.f.receipt)>0)||!activeValid(state,b,physics)){rendezvous.delete(state);return null;}
  return b.receiver;
}
export function cancelAnvilSpillRendezvous(state,receiver) {
  const b=rendezvous.get(state);if(!b||(receiver&&b.receiver!==receiver))return {ok:false};
  settle(state,b);rendezvous.delete(state);return {ok:true,remainingS:budget(b.f.receipt)||0};
}
export function anvilSpillRendezvousStatus(state,receiver) {
  const b=rendezvous.get(state),receipt=receiver?.data?.itinerary?.anvilSpillReturn,left=budget(receipt);
  const active=!!b&&b.receiver===receiver&&activeValid(state,b,b.native.physics)&&Number.isFinite(state.simTime)&&state.simTime>=b.lastAt;
  return {active:active&&state.simTime<b.expiresAt,remainingS:active?Math.max(0,Math.min(left||0,b.expiresAt-state.simTime)):left};
}
