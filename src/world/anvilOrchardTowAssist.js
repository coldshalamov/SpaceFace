// Read-only Orchard service facts and transient exact-life lease admission. No cargo,
// credits, native body mutation, or alternate inventory lives in this module.
import { ANVIL_ORCHARD, normalizeOrchardRecord } from '../data/anvilOrchard.js';
import { isOrchardPod, isOrchardFrame } from '../data/anvilOrchardIdentity.js';
import { PLANET_SITE } from '../data/planets.js';
import { COMMODITIES } from '../data/commodities.js';
import { stableRecordId, RECORD_KIND } from './worldRecords.js';

const leases = new WeakMap(), quotes = new WeakMap();
export const ORCHARD_TOW_HOLDER = 'orchardTowAssist';
const live = (state, e) => e && e.alive !== false && e.hull > 0 && state.entities?.get(e.id) === e;
export function isOrchardReceiver(state, entity) {
  return state?.world?.currentSectorId === ANVIL_ORCHARD.sectorId && live(state, entity)
    && entity.data?.worldRecordId === stableRecordId(state.meta?.seed || 1, PLANET_SITE.sectorId, RECORD_KIND.CONVOY, 'anvil:shift:receiver')
    && entity.data?.itinerary?.kind === 'anvil_work' && entity.data.itinerary.role === 'receiver';
}
export function hasBodyAttachment(state, target) {
  return Object.values(state.combat?.attachments?.byId || {}).some(a => a?.state === 'active'
    && ((a.targetId === target.id && a.targetGeneration === target.occupantGeneration)
      || (a.ownerId === target.id && a.ownerGeneration === target.occupantGeneration)));
}
function segmentClear(a, b, center, radius) {
  const dx = b.x - a.x, dz = b.z - a.z, length2 = dx * dx + dz * dz;
  const t = length2 ? Math.max(0, Math.min(1, ((center.x-a.x)*dx+(center.z-a.z)*dz)/length2)) : 0;
  return Math.hypot(a.x+t*dx-center.x, a.z+t*dz-center.z) > radius;
}
export function orchardTowPod(state, pod) {
  if (state?.mode !== 'flight' || state.world?.currentSectorId !== ANVIL_ORCHARD.sectorId
    || !live(state, pod) || !isOrchardPod(pod) || pod.physicsBody.dynamic !== true || pod.data.masslineTetherable !== true) return null;
  const row = normalizeOrchardRecord(state.sites?.anvilOrchard);
  const lot = row?.lots.find(l => l.id === pod.data.worldRecordId);
  const slot = lot && row.sockets[lot.socket];
  return row?.frameStatus === 'intact' && lot?.outcome === 'retained' && lot.units === pod.data.amount
    && slot?.status === 'drifting' && slot.handoff === 'ready' && slot.lotId === lot.id ? lot : null;
}
export function orchardTowQuote(state, worker) {
  if (!isOrchardReceiver(state, worker) || worker.data.jobId || hasBodyAttachment(state,worker) || state.mode !== 'flight') return null;
  const center = state.planet?.center, frame = state.entities?.get(state.planet?.orchardFrameId);
  if (!center || ![center.x,center.z].every(Number.isFinite) || !isOrchardFrame(frame)) return null;
  const dx = frame.pos.x-center.x, dz = frame.pos.z-center.z, r = Math.hypot(dx,dz);
  if (!(r > PLANET_SITE.bands.skim)) return null;
  const dest = { x: center.x+dx/r*(PLANET_SITE.field.radius+400), z: center.z+dz/r*(PLANET_SITE.field.radius+400) };
  let best = null, distance = Infinity;
  for (const pod of state.entities.values()) {
    const lot = orchardTowPod(state,pod);
    if (!lot || hasBodyAttachment(state,pod) || orchardTowLease(state,pod)) continue;
    const d = Math.hypot(worker.pos.x-pod.pos.x,worker.pos.z-pod.pos.z);
    if (d > 2600 || d >= distance) continue;
    const safeRadius = PLANET_SITE.bands.skim + Math.max(worker.radius || 0,pod.radius || 0);
    if (!segmentClear(worker.pos,pod.pos,center,safeRadius) || !segmentClear(pod.pos,dest,center,safeRadius)) continue;
    best = { pod, lot }; distance = d;
  }
  if (!best) return null;
  const basePrice = COMMODITIES.find(c => c.id === ANVIL_ORCHARD.commodityId)?.basePrice;
  if (!(basePrice > 0)) return null;
  const quote = { workerId: worker.id, workerGeneration: worker.occupantGeneration,
    targetId: best.pod.id, targetGeneration: best.pod.occupantGeneration, lotId: best.lot.id,
    amount: best.lot.units, feeCr: Math.max(1,Math.ceil(best.lot.units*basePrice*.25)),
    destination: dest, destinationLabel: 'OUTER ORCHARD PICKUP', deliverW: 200,
    frameId: frame.id, frameGeneration: frame.occupantGeneration, expiresAt: state.simTime+12 };
  Object.freeze(quote.destination); Object.freeze(quote);
  quotes.set(quote,{createdAt:state.simTime,state,world:state.world,entities:state.entities,worker,pod:best.pod,frame,center:{...center}});
  return quote;
}
export function validateOrchardTowQuote(state, worker, quote, physics) {
  const bound = quotes.get(quote), pod = bound?.pod;
  if (!bound || bound.state !== state || bound.world !== state.world || bound.entities !== state.entities || bound.worker !== worker
    || !isOrchardReceiver(state,worker) || worker.occupantGeneration !== quote.workerGeneration
    || !live(state,pod) || pod.occupantGeneration !== quote.targetGeneration
    || state.entities.get(quote.frameId) !== bound.frame || bound.frame.occupantGeneration !== quote.frameGeneration
    || !isOrchardFrame(bound.frame) || !Number.isFinite(state.simTime) || state.simTime < bound.createdAt || state.simTime >= quote.expiresAt
    || state.planet?.center?.x !== bound.center.x || state.planet?.center?.z !== bound.center.z
    || hasBodyAttachment(state,worker) || hasBodyAttachment(state,pod) || orchardTowLease(state,pod)) return null;
  const lot = orchardTowPod(state,pod);
  if (!lot || lot.id !== quote.lotId || lot.units !== quote.amount || !physics?.readOrchardPodReady?.(pod)) return null;
  const r=PLANET_SITE.bands.skim+Math.max(worker.radius||0,pod.radius||0);
  if (!segmentClear(worker.pos,pod.pos,bound.center,r) || !segmentClear(pod.pos,quote.destination,bound.center,r)) return null;
  return pod;
}
export function bindOrchardTowLease(state, worker, pod, entry, physics) {
  const lease = { state, stateWorld:state.world, entities:state.entities, worker, pod, workerLife:worker.occupantGeneration,
    targetLife:pod.occupantGeneration, entry, assist:entry.towAssist, jobs:state.npcJobs,
    physics, owner:physics?._sg02, world:physics?._sg02?.world, startedAt:state.simTime };
  let map=leases.get(state);if(!map){map=new Map();leases.set(state,map);}map.set(pod.id,lease);
  return lease;
}
export function orchardTowLease(state, pod) {
  const l=leases.get(state)?.get(pod?.id);
  if (!l || l.pod!==pod || state.world!==l.stateWorld || state.entities!==l.entities || state.npcJobs!==l.jobs
    || (state.mode!=='flight' && state.mode!=='paused') || state.world?.currentSectorId!==ANVIL_ORCHARD.sectorId
    || !live(state,pod) || !live(state,l.worker) || pod.occupantGeneration!==l.targetLife
    || l.worker.occupantGeneration!==l.workerLife || !Number.isFinite(state.simTime)
    || state.simTime<l.startedAt || state.simTime-l.startedAt>240
    || state.npcJobs?.byId?.[`job:${l.entry.worldRecordId}`]!==l.entry
    || l.entry.towAssist!==l.assist || l.entry.control?.claimId!==l.assist?.claimId
    || l.entry.control?.holder!==ORCHARD_TOW_HOLDER
    || l.physics?._sg02!==l.owner || l.owner?.world!==l.world) return null;
  return l;
}
export function clearOrchardTowLease(state, lease) {
  const map=leases.get(state);if(map && lease && map.get(lease.pod?.id)===lease)map.delete(lease.pod.id);
}
export function orchardAttachmentRefusal(state, owner, target, spec) {
  const map=leases.get(state);
  let lease=orchardTowLease(state,target) || orchardTowLease(state,owner);
  if (!lease && map) for (const candidate of map.values()) {
    if ((candidate.worker === owner || candidate.worker === target)
      && orchardTowLease(state,candidate.pod) === candidate) { lease=candidate; break; }
  }
  if (!lease) return null;
  return target===lease.pod && owner===lease.worker && owner.occupantGeneration===lease.workerLife
    && lease.attaching===true && spec?.controlMode==='npc_tow' && lease.entry.towAttachmentId==null ? null : 'orchard_tow_reserved';
}

export function withOrchardTowAttachment(state, target, create) {
  const lease=orchardTowLease(state,target);
  if(!lease)return create();
  lease.attaching=true;
  try{return create();}finally{lease.attaching=false;}
}
