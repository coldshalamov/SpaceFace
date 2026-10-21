import { CHARON_SUPPLY, charonSupplyLive as live, charonSupplyBook as book, charonSupplyQuantity as quantity, charonSupplyActor as actor, charonSupplyCarrier as carrier, charonSupplyRecipient as recipient, charonSupplyActorLife } from './charonSupplyReadout.js';
export { CHARON_SUPPLY, charonSupplyHailLines, charonSupplyFacts } from './charonSupplyReadout.js';
// One visiting crew, one authored air-system supply lot. Cargo stays in native pods/manifests;
// this bounded provenance receipt never creates inventory or a replacement hull.
import { activityPocketById } from '../data/sectorActivityPockets.js';
import { sectorLocalToGlobalForSector } from '../data/sectorCoordinates.js';
import { spawnJettisonedCargoPod } from '../systems/lootShards.js';
import { resolvePropulsionProfile } from '../core/flight/propulsionCatalog.js';
import { physicsBodyNativeReady } from '../core/physicsAuthority.js';
import { successfulPickupAmount } from '../core/pickupAcceptance.js';
const C = CHARON_SUPPLY,
  CLAIM = 'charon_colony_supply';
const whole = x => Number.isSafeInteger(x) && x >= 0;
const clone = x => JSON.parse(JSON.stringify(x));
const receipts = new WeakSet(),
  deathProof = new WeakMap(),
  leafLives = new WeakMap(),
  pickupTransactions = new WeakMap();
const legacyCargo = e => e?.data?.carrying === true || e?.data?.cargo && Object.values(e.data.cargo).some(n => Number(n) > 0);
const empty = m => m == null || m.totalQty === 0 && Array.isArray(m.lines) && m.lines.length === 0;
function row(s, p) {
  const b = book(s),
    id = p?.data?.charonSupplyPod?.id,
    r = b?.pods?.find(r => r.id === id);
  if (!r || s.entities.get(p.id) !== p || !p.data.richLotSource?.charonLife) return null;
  const candidates = s.entityList.filter(e => s.entities.get(e.id) === e && e.data?.charonSupplyPod?.id === id && (e.alive || e === p));
  if (candidates.length !== 1) return null;
  let lives = leafLives.get(b);
  if (!lives) {
    lives = new Map();
    leafLives.set(b, lives);
  }
  const prior = lives.get(id),
    life = p.occupantGeneration;
  if (prior && (prior.entity !== p || prior.life !== life || prior.token !== p.data.richLotSource.charonLife)) return null;
  if (!prior) lives.set(id, {
    entity: p,
    life,
    token: p.data.richLotSource.charonLife
  });
  return r;
}
function pod(s, r) {
  const found = s.entityList.filter(e => live(s, e) && e.data?.charonSupplyPod?.id === r.id && e.data.commodityId === C.commodityId && e.data.amount === r.loose);
  return found.length === 1 ? found[0] : null;
}
// Save has already restored canonical entities when this event runs. Bind exact
// lives now so a queued cap removal before the first gameplay tick stays truthful.
export function bindRestoredCharonSupply(o) {
  const s = o.state,
    b = book(s);
  if (!b || b.blocked) return;
  for (const leaf of b.pods) {
    if (!leaf.loose) continue;
    const p = pod(s, leaf);
    if (p) row(s, p);
  }
  const h = carrier(s),
    r = recipient(s);
  if (!normalizeCharonSupply(b) || !['awaiting_round', 'collect', 'delivered', 'shortfall'].includes(b.phase)) return;
  if (quantity(b, 'consumed') || b.phase === 'collect' && quantity(b, 'delivered') || b.phase === 'delivered' && quantity(b, 'delivered') !== C.quantity || b.phase === 'shortfall' && !quantity(b, 'player') && !quantity(b, 'other') && !quantity(b, 'lost')) return;
  // Residency may rebuild a durable hull without its transient itinerary. Only
  // restore this proven finite lease, never adopt a foreign job or empty label.
  for (const [e, ready] of [[h, b.haulerReady], [r, b.salvorReady]]) {
    if (!e || ready !== true || e.data.jobId || e.data.itinerary || e.data.claimDepotId || legacyCargo(e) || o.helpers.npcJobs.controlClaim(`job:${e.data.worldRecordId}`)) continue;
    const rec = s.traffic.freighters.find(x => x.id === e.id);
    if (!rec) continue;
    if (b.phase === 'awaiting_round') {
      if (!empty(rec.manifest) || !empty(e.data.cargoManifest) || rec.carrying === true || quantity(b, 'aboard') || quantity(b, 'delivered') || quantity(b, 'consumed')) continue;
    } else if (!ownsFiniteCharonSupplyManifest(s, e, true) || JSON.stringify(rec.manifest) !== JSON.stringify(e.data.cargoManifest)) continue;
    e.data.itinerary = {
      kind: CLAIM,
      sourceId: C.sourceId,
      phase: 'waiting_for_next_round'
    };
    hold(e);
  }
}
export function normalizeCharonSupply(value) {
  if (value?.blocked === true) return {
    blocked: true
  };
  if (!value || value.schema !== C.schema || value.original !== C.quantity || !['admitting', 'awaiting_round', 'collect', 'delivered', 'working', 'shortfall', 'lost'].includes(value.phase) || !Array.isArray(value.pods) || value.pods.length > 128 || !value.pods.length || typeof value.haulerId !== 'string' || typeof value.salvorId !== 'string' || value.haulerId === value.salvorId) return null;
  const ids = new Set();
  let total = 0;
  for (const r of value.pods) {
    if (!r || typeof r.id !== 'string' || ids.has(r.id) || !['original', 'loose', 'aboard', 'delivered', 'consumed', 'player', 'other', 'lost'].every(k => whole(r[k])) || r.original !== r.loose + r.aboard + r.delivered + r.consumed + r.player + r.other + r.lost) return null;
    ids.add(r.id);
    total += r.original;
  }
  return total === C.quantity ? clone(value) : null;
}
function manifest(e, b, n) {
  return {
    finiteSource: CLAIM,
    manifestId: `${CLAIM}:${e.data.worldRecordId}`,
    freighterKey: e.data.worldRecordId,
    lotId: C.sourceId,
    totalQty: n,
    totalValue: 0,
    lines: n ? [{
      commodityId: C.commodityId,
      qty: n
    }] : []
  };
}
function setManifest(o, e, n) {
  const rec = o.state.traffic.freighters.find(r => r.id === e.id);
  return !!rec && o._setTrafficManifest(e, rec, manifest(e, book(o.state), n)) === true;
}
export function ownsFiniteCharonSupplyManifest(s, e, allowEmpty = false) {
  const b = book(s),
    m = e?.data?.cargoManifest;
  if (!b || b.blocked || !e?.data) return false;
  const field = e.data.worldRecordId === b.haulerId && e.data.activityActorSlotId === C.hauler ? 'aboard' : e.data.worldRecordId === b.salvorId && e.data.activityActorSlotId === C.salvor ? 'delivered' : null;
  if (!field || s.entities.get(e.id) !== e || s.entityList.filter(x => s.entities.get(x.id) === x && x.data?.worldRecordId === e.data.worldRecordId).length !== 1) return false;
  const proof = deathProof.get(e);
  if (proof && proof.book === b && e.hull <= 0 && proof.manifest === m && proof.signature === JSON.stringify(m)) return true;
  const n = quantity(b, field);
  return (allowEmpty || n > 0) && m?.finiteSource === CLAIM && m.manifestId === `${CLAIM}:${e.data.worldRecordId}` && m.freighterKey === e.data.worldRecordId && m.lotId === C.sourceId && m.totalQty === n && (n === 0 ? m.lines?.length === 0 : m.lines?.length === 1 && m.lines[0].commodityId === C.commodityId && m.lines[0].qty === n);
}
function exactJob(o, e) {
  const j = o.helpers.npcJobs?.get?.(e?.data?.jobId),
    pocket = activityPocketById(C.pocketId),
    slot = pocket?.actorSlots.find(x => x.id === e?.data?.activityActorSlotId);
  if (!slot || !j || j.entityId !== e.id || j.worldRecordId !== e.data.worldRecordId || j.sectorId !== C.sectorId || j.kind !== slot.jobKind || j.job?.kind !== slot.jobKind || j.job.corrupt || j.job.id !== `job:${e.data.worldRecordId}` || j.job.route?.length !== 2) return null;
  const marks = slot.route.marks;
  for (let i = 0; i < 2; i++) {
    const m = marks[i],
      r = j.job.route[i],
      pos = sectorLocalToGlobalForSector({
        x: pocket.activityAnchor.localPos.x + m.offset.x,
        z: pocket.activityAnchor.localPos.z + m.offset.z
      }, C.sectorId);
    if (r.id !== m.id || r.targetRef !== m.targetRef || r.pos?.x !== pos.x || r.pos?.z !== pos.z) return null;
  }
  return j;
}
function owned(o, e) {
  const b = book(o.state);
  return !!b && !e.data.jobId && e.data.itinerary?.kind === CLAIM && e.data.itinerary.sourceId === C.sourceId && [b.haulerId, b.salvorId].includes(e.data.worldRecordId);
}
function release(o, e) {
  if (e?.data?.itinerary?.kind === CLAIM && e.data.itinerary.sourceId === C.sourceId) delete e.data.itinerary;
}
export function releaseCharonSupply(o) {
  const b = book(o.state);
  if (!b || b.blocked) return;
  release(o, carrier(o.state));
  release(o, recipient(o.state));
}
// Stop only at a genuine completed original round. The runtime owns all work up
// to this boundary; no movement lease silently advances a purportedly paused job.
export function charonSupplyRoundBoundary(o, event) {
  const s = o.state,
    b = book(s);
  if (!b || b.phase !== 'awaiting_round') return false;
  const e = event?.event === 'npcjobs:cycle' ? recipient(s) : event?.event === 'npcjobs:complete' ? carrier(s) : null,
    j = e && exactJob(o, e);
  if (!e || !j || event.jobId !== j.job.id || event.kind !== j.kind || event.seq !== j.job.sequence || o.helpers.npcJobs.controlClaim(e.data.jobId) || e.data.itinerary || !empty(e.data.cargoManifest)) return false;
  const key = e.data.worldRecordId === b.haulerId ? 'haulerReady' : 'salvorReady';
  if (b[key]) return false;
  const id = e.data.jobId;
  if (o.helpers.npcJobs.release(id) !== true) return false;
  if (book(s) !== b || !live(s, e) || e.data.jobId) return false;
  b[key] = true;
  e.data.itinerary = {
    kind: CLAIM,
    sourceId: C.sourceId,
    phase: 'waiting_for_next_round'
  };
  hold(e);
  return true;
}
function stamp(p, id) {
  // Existing occupational salvage discovery excludes managed finite lots. This
  // is provenance, not title: normal player tow/scoop and custody gates remain.
  p.data.lotId = id;
  p.data.charonSupplyPod = {
    id
  };
  p.data.richLotSource = {
    lotId: id,
    provenanceId: C.sourceId,
    sourceKind: CLAIM,
    lotQty: p.data.amount,
    legalStatus: 'salvage',
    charonLife: {}
  };
  p.data.homeSectorId = C.sectorId;
  p.homeSectorId = C.sectorId;
  p.flags = {
    ...p.flags,
    persistent: true
  };
  delete p.data.despawnAt;
}
export function materializeCharonSupply(o, priorCast = null) {
  const s = o.state;
  if (s.world?.currentSectorId !== C.sectorId || book(s) || s.entityList.some(e => e.data?.charonSupplyPod || e.data?.cargoManifest?.finiteSource === CLAIM)) return false;
  const h = actor(s, C.hauler),
    r = actor(s, C.salvor);
  if (!h || !r || !exactJob(o, h) || !exactJob(o, r) || !empty(h.data.cargoManifest) || !empty(r.data.cargoManifest) || h.data.itinerary || r.data.itinerary || h.data.claimDepotId || r.data.claimDepotId || legacyCargo(h) || legacyCargo(r) || s.traffic.freighters.some(x => [h.id, r.id].includes(x.id) && (x.carrying === true || !empty(x.manifest))) || o.helpers.npcJobs.controlClaim(h.data.jobId) || o.helpers.npcJobs.controlClaim(r.data.jobId)) return false;
  const pocket = activityPocketById(C.pocketId),
    slot = pocket?.objectSlots.find(x => x.id === C.sourceId);
  if (!slot) return false;
  const pos = sectorLocalToGlobalForSector({
    x: pocket.activityAnchor.localPos.x + slot.offset.x,
    z: pocket.activityAnchor.localPos.z + slot.offset.z
  }, C.sectorId);
  // Reserve the one source BEFORE canonical spawn can call observers or reenter.
  const b = {
    schema: 1,
    original: C.quantity,
    phase: 'admitting',
    haulerId: h.data.worldRecordId,
    salvorId: r.data.worldRecordId,
    haulerReady: false,
    salvorReady: false,
    pods: [{
      id: C.sourceId,
      original: C.quantity,
      loose: C.quantity,
      aboard: 0,
      delivered: 0,
      consumed: 0,
      player: 0,
      other: 0,
      lost: 0
    }]
  };
  s.traffic.charonSalvageSupply = b;
  actor(s, C.hauler, b.haulerId);
  actor(s, C.salvor, b.salvorId);
  const spawnHelpers = {
    ...o.helpers,
    spawnEntity(spec) {
      spec.ownerId = null;
      spec.data.ownerId = null;
      if (spec.data.ownership) spec.data.ownership = {
        ...spec.data.ownership,
        ownerId: null
      };
      if (spec.data.cargoIdentity) spec.data.cargoIdentity = {
        ...spec.data.cargoIdentity,
        ownerId: null
      };
      stamp(spec, C.sourceId);
      Object.assign(spec.data, {
        activityObjectSlotId: C.sourceId,
        placeId: 'place_cargo_pod_standard',
        packagedPropFile: 'places/place_cargo_pod_standard.glb',
        packagedPropSlot: 'place',
        name: 'Sealed habitat scrubber kits'
      });
      return o.helpers.spawnEntity(spec);
    }
  };
  let p = null;
  try {
    p = spawnJettisonedCargoPod(s, {
      commodityId: C.commodityId,
      amount: C.quantity,
      pos,
      vel: {
        x: 0,
        z: 0
      },
      radius: 3,
      originId: C.sourceId,
      factionId: h.data.factionId
    }, spawnHelpers);
  } catch {/* failed admission is terminal, never a source refill */}
  if (book(s) !== b || s.world?.currentSectorId !== C.sectorId || !live(s, h) || !live(s, r)) return false;
  if (!live(s, p)) {
    b.pods[0].loose = 0;
    b.pods[0].lost = C.quantity;
    b.phase = 'lost';
    return false;
  }
  row(s, p);
  b.phase = 'awaiting_round';
  // First appearance can wait before a brand-new round starts. Existing/restored
  // hulls and any progressed job must finish through the normal boundary path.
  if (priorCast?.entities instanceof Set && priorCast.records instanceof Set) {
    for (const e of [h, r]) {
      const j = exactJob(o, e),
        k = j?.job;
      if (priorCast.entities.has(e) || priorCast.records.has(e.data.worldRecordId) || !k || k.phase !== 'commission' || k.progress !== 0 || k.sequence !== 0 || k.loopCount !== 0 || k.simTime !== 0 || k.payload || k.interrupted || j.threatId || j.towAttachmentId || j.towTargetId || o.helpers.npcJobs.controlClaim(e.data.jobId) || e.data.itinerary || !empty(e.data.cargoManifest) || legacyCargo(e)) continue;
      if (o.helpers.npcJobs.release(e.data.jobId) !== true || !live(s, e) || e.data.jobId) continue;
      b[e === h ? 'haulerReady' : 'salvorReady'] = true;
      e.data.itinerary = {
        kind: CLAIM,
        sourceId: C.sourceId,
        phase: 'waiting_for_next_round'
      };
      hold(e);
    }
  }
  return true;
}
function hold(e) {
  e.data.intent = {
    charonSupplyOwned: true,
    moveX: 0,
    moveZ: 0,
    boost: false,
    fire: false,
    brake: true,
    aimAngle: e.rot
  };
}
function steer(o, e, target, reach, contactTarget = null, contactReach = 0) {
  const dx = target.x - e.pos.x,
    dz = target.z - e.pos.z,
    d = Math.hypot(dx, dz),
    aim = Math.atan2(dz, dx),
    p = resolvePropulsionProfile(e, o.state);
  let gap = null;
  if (contactTarget) {
    const a = nativeRecord(o, e),
      b = nativeRecord(o, contactTarget);
    if (!a || !b) {
      hold(e);
      return;
    }
    for (const x of a.colliders) for (const y of b.colliders) {
      const contact = x.contactCollider(y, d + (e.radius || 0) + (contactTarget.radius || 0) + 10);
      if (contact && Number.isFinite(contact.distance)) gap = gap === null ? contact.distance : Math.min(gap, contact.distance);
    }
    if (gap === null) {
      hold(e);
      return;
    }
  }
  // Slow against actual native surfaces, not center distance. The stock can be
  // touched only at a crawl; normal collision and civilian alarm rules remain.
  const speed = contactTarget ? Math.min(18, Math.max(0.65, (gap - contactReach) * 0.3)) : Math.min(18, Math.max(0, d - reach) * 0.4);
  const brake = (contactTarget ? gap <= contactReach && contactReach > 0 : d <= reach) || Math.cos(aim - e.rot) < 0.9 || Math.hypot(e.vel.x, e.vel.z) > speed + (contactTarget ? 0.1 : 1);
  e.data.intent = {
    charonSupplyOwned: true,
    moveX: 0,
    moveZ: brake ? 0 : Math.min(1, Math.max(0.03, speed / Math.max(1, p.combatSpeed || e.maxSpeed || 100))),
    boost: false,
    fire: false,
    brake,
    aimAngle: aim
  };
}
function nativeRecord(o, e) {
  const s = o.state;
  if (e?.data?.activityActorSlotId === C.hauler && carrier(s) !== e || e?.data?.activityActorSlotId === C.salvor && recipient(s) !== e || e?.data?.charonSupplyPod && !row(s, e)) return null;
  const p = o._registry?.get?.('physics'),
    n = p?._sg02;
  if (p?.state !== s || s.settings?.gameplay?.physicsBackend !== 'rapier-dynamic' || p._diag?.sg02Ready !== true || p._nativeRestorePending || p._nativeRestoreDeferred || !live(s, e) || !physicsBodyNativeReady(e) || n?._pendingNativeRebuilds?.has(e.id)) return null;
  const r = n?.records.get(e.id);
  if (r?.entity !== e || !r.body?.isValid() || !r.body.isEnabled() || r.revision !== r.spec?.revision || r.revision !== e.physicsBody?.revision) return null;
  const t = r.body.translation(),
    v = r.body.linvel(),
    f = n._frameOrigin;
  if (Math.hypot(t.x + (f?.x || 0) - e.pos.x, t.z + (f?.z || 0) - e.pos.z) > 0.02 || Math.hypot(v.x - e.vel.x, v.z - e.vel.z) > 0.02) return null;
  return r;
}
function near(o, a, b, gap) {
  const ar = nativeRecord(o, a),
    br = nativeRecord(o, b);
  if (!ar || !br || Math.hypot(a.vel.x - b.vel.x, a.vel.z - b.vel.z) > 2) return false;
  try {
    for (const x of ar.colliders) for (const y of br.colliders) {
      const c = x.contactCollider(y, gap);
      if (c && c.distance >= -0.5 && c.distance <= gap) return true;
    }
  } catch {}
  return false;
}
function reserved(s, p) {
  return s.player?.tether?.active && s.player.tether.targetId === p.id || p.data.salvorClaimedBy && p.data.salvorClaimedBy !== book(s)?.haulerId;
}
export function charonSupplyPickupReceipt(o, payload) {
  const s = o.state,
    p = s.entities.get(payload?.pickupId),
    b = book(s),
    r = row(s, p);
  if (!b || !r || !live(s, p) || p.data.commodityId !== C.commodityId || receipts.has(payload) || r.loose !== p.data.amount) return false;
  const h = carrier(s);
  if (h && payload.collectorId === h.id) {
    payload.acceptedAmount = 0;
    payload.rejectedAmount = p.data.amount;
    const tx = pickupTransactions.get(s);
    if (!tx || tx.book !== b || tx.pod !== p || tx.podLife !== p.occupantGeneration || tx.carrier !== h || tx.carrierLife !== h.occupantGeneration) return false;
    if (!owned(o, h) || b.phase !== 'collect' || !ownsFiniteCharonSupplyManifest(s, h, true) || reserved(s, p) || !near(o, h, p, 0)) return false;
    const q = r.loose;
    if (!q || !setManifest(o, h, quantity(b, 'aboard') + q)) return false;
    r.loose -= q;
    r.aboard += q;
    payload.acceptedAmount = q;
    payload.rejectedAmount = 0;
    receipts.add(payload);
    return true;
  }
  const receiptLife = (payload.richLotSource || payload.lotSource)?.charonLife;
  if (receiptLife !== p.data.richLotSource.charonLife) return false;
  const q = successfulPickupAmount(payload);
  if (!whole(q) || !q || q > r.loose) return false;
  receipts.add(payload);
  r.loose -= q;
  r[payload.collectorId === s.playerId ? 'player' : 'other'] += q;
  return true;
}
export function settleCharonSupply(o) {
  const s = o.state,
    b = book(s),
    h = carrier(s),
    r = recipient(s);
  if (!b || b.phase !== 'collect' || !h || !r || !owned(o, h) || !owned(o, r) || !ownsFiniteCharonSupplyManifest(s, h) || !ownsFiniteCharonSupplyManifest(s, r, true) || !near(o, h, r, 4)) return false;
  const q = quantity(b, 'aboard');
  if (q !== C.quantity) return false; // partial salvage is not a complete breathing reserve
  const rm = r.data.cargoManifest;
  if (!setManifest(o, r, q)) return false;
  if (!setManifest(o, h, 0)) {
    const rec = s.traffic.freighters.find(x => x.id === r.id);
    o._setTrafficManifest(r, rec, rm);
    return false;
  }
  for (const p of b.pods) {
    p.delivered += p.aboard;
    p.aboard = 0;
  }
  b.phase = 'delivered';
  b.deliveredAt = s.simTime;
  return true;
}
function recommission(o, e) {
  const p = activityPocketById(C.pocketId),
    slot = p.actorSlots.find(x => x.id === e.data.activityActorSlotId);
  if (!slot || e.data.jobId) return false;
  const itinerary = e.data.itinerary;
  release(o, e);
  const id = o._assignActivityJob(e, {
    pocket: p,
    slot,
    service: false
  });
  if (!id) {
    if (!e.data.itinerary) e.data.itinerary = itinerary;
    return false;
  }
  return !!exactJob(o, e);
}
export function consumeCharonSupply(o) {
  const s = o.state,
    b = book(s),
    r = recipient(s);
  if (!b || b.phase !== 'delivered' || !r || quantity(b, 'delivered') !== C.quantity || !ownsFiniteCharonSupplyManifest(s, r)) return false;
  if (!r.data.jobId && !recommission(o, r)) return false;
  if (book(s) !== b || !live(s, r) || !exactJob(o, r) || !ownsFiniteCharonSupplyManifest(s, r)) return false;
  if (!setManifest(o, r, 0)) return false;
  for (const p of b.pods) {
    p.consumed += p.delivered;
    p.delivered = 0;
  }
  b.phase = 'working';
  b.consumedAt = s.simTime;
  b.nextRoundJobId = r.data.jobId;
  const h = carrier(s);
  if (h && owned(o, h)) recommission(o, h);
  return true;
}
export function stepCharonSupply(o, e, rec) {
  const s = o.state,
    b = book(s);
  if (!b || b.blocked || b.phase === 'working') return false;
  const slot = e?.data?.activityActorSlotId,
    recordId = e?.data?.worldRecordId;
  if (!(slot === C.hauler && recordId === b.haulerId || slot === C.salvor && recordId === b.salvorId)) return false;
  const h = carrier(s),
    r = recipient(s);
  if (e !== h && e !== r) return false;
  if (b.phase === 'delivered') {
    if (e === r) consumeCharonSupply(o);
    if (owned(o, e)) {
      hold(e);
      return true;
    }
    return false;
  }
  if (b.phase === 'awaiting_round') {
    if (b.haulerReady && b.salvorReady && h && r && !legacyCargo(h) && !legacyCargo(r) && owned(o, h) && owned(o, r) && empty(h.data.cargoManifest) && empty(r.data.cargoManifest)) {
      setManifest(o, h, 0);
      setManifest(o, r, 0);
      b.phase = 'collect';
    } else {
      if (owned(o, e)) {
        hold(e);
        return true;
      }
      return false;
    }
  }
  if (!owned(o, e)) return false;
  if (b.phase === 'lost' || b.phase === 'shortfall' || s.world?.currentSectorId !== C.sectorId || !h || !r) {
    hold(e);
    return true;
  }
  if (quantity(b, 'player') + quantity(b, 'other') + quantity(b, 'lost') > 0) {
    b.phase = 'shortfall';
    hold(e);
    return true;
  }
  if (e === r) {
    hold(e);
    return true;
  }
  if (!ownsFiniteCharonSupplyManifest(s, h, true)) {
    hold(h);
    return true;
  }
  if (quantity(b, 'aboard') === C.quantity) {
    steer(o, h, r.pos, 0, r, 4);
    settleCharonSupply(o);
    return true;
  }
  const target = b.pods.map(x => x.loose ? pod(s, x) : null).filter(p => p && !reserved(s, p)).sort((a, c) => Math.hypot(a.pos.x - h.pos.x, a.pos.z - h.pos.z) - Math.hypot(c.pos.x - h.pos.x, c.pos.z - h.pos.z))[0];
  if (!target) {
    hold(h);
    return true;
  }
  const dx = target.pos.x - r.pos.x,
    dz = target.pos.z - r.pos.z,
    len = Math.hypot(dx, dz) || 1,
    approach = {
      x: target.pos.x + dx / len * 55,
      z: target.pos.z + dz / len * 55
    };
  if (b.approachId !== target.data.charonSupplyPod.id) {
    if (Math.hypot(h.pos.x - approach.x, h.pos.z - approach.z) > 8) {
      steer(o, h, approach, 2);
      return true;
    }
    b.approachId = target.data.charonSupplyPod.id;
  }
  steer(o, h, target.pos, 0, target);
  if (near(o, h, target, 0)) {
    pickupTransactions.set(s, {
      book: b,
      pod: target,
      podLife: target.occupantGeneration,
      carrier: h,
      carrierLife: h.occupantGeneration
    });
    try {
      o._registry.get('physics')._tryCollectPickup(target, h);
    } finally {
      pickupTransactions.delete(s);
    }
  }
  return true;
}
function moveChild(s, parents, child, q, id) {
  const b = book(s);
  if (!b || !live(s, child) || child.data?.charonSupplyPod || !whole(q) || !q || b.pods.length >= 128 || parents.reduce((n, p) => n + p.r[p.field], 0) < q) return false;
  let left = q;
  for (const {
    r,
    field
  } of parents) {
    const n = Math.min(left, r[field]);
    r[field] -= n;
    r.original -= n;
    left -= n;
  }
  child.data.kind = 'cargo';
  child.data.commodityId = C.commodityId;
  child.data.amount = q;
  stamp(child, id);
  b.pods.push({
    id,
    original: q,
    loose: q,
    aboard: 0,
    delivered: 0,
    consumed: 0,
    player: 0,
    other: 0,
    lost: 0
  });
  row(s, child);
  return true;
}
export function inheritCharonSupplySplit(s, source, child) {
  const r = row(s, source);
  if (!r || s.entities.get(source.id) !== source || !source.data?.richLotSource?.charonLife || child?.data?.commodityId !== C.commodityId) return false;
  const id = `${r.id}:split:${r.splitSeq || 0}`;
  if (!moveChild(s, [{
    r,
    field: 'loose'
  }], child, child.data.amount, id)) return false;
  r.splitSeq = (r.splitSeq || 0) + 1;
  return true;
}
export function charonSupplySpillReceipt(o, payload) {
  const s = o.state,
    b = book(s),
    e = s.entities.get(payload?.carrierId ?? payload?.victimId);
  if (!b || !e || s.entities.get(e.id) !== e) return false;
  const m = e.data.cargoManifest;
  const identity = e.data.worldRecordId === b.haulerId && e.data.activityActorSlotId === C.hauler || e.data.worldRecordId === b.salvorId && e.data.activityActorSlotId === C.salvor;
  if (!identity || s.entityList.filter(x => s.entities.get(x.id) === x && x.data?.worldRecordId === e.data.worldRecordId).length !== 1 || m?.finiteSource !== CLAIM || m.manifestId !== `${CLAIM}:${e.data.worldRecordId}` || m.lotId !== C.sourceId || m.freighterKey !== e.data.worldRecordId || !whole(m.totalQty) || (m.totalQty === 0 ? m.lines?.length !== 0 : m.lines?.length !== 1 || m.lines[0].commodityId !== C.commodityId || m.lines[0].qty !== m.totalQty)) return false;
  if (e.hull <= 0 && ownsFiniteCharonSupplyManifest(s, e)) deathProof.set(e, {
    book: b,
    manifest: m,
    signature: JSON.stringify(m)
  });
  const field = e.data.worldRecordId === b.haulerId ? 'aboard' : 'delivered';
  let moved = false;
  for (const id of payload.podIds || (payload.payloadId != null ? [payload.payloadId] : [])) {
    const child = s.entities.get(id),
      q = child?.data?.salvagePool?.[C.commodityId];
    if (child?.data?.manifestId !== m.manifestId || !whole(q) || !q || q > quantity(b, field) || !(e.hull <= 0 && m.totalQty === quantity(b, field) || m.totalQty + q === quantity(b, field))) continue;
    if (moveChild(s, b.pods.map(r => ({
      r,
      field
    })), child, q, `${C.sourceId}:spill:${b.spillSeq || 0}`)) {
      b.spillSeq = (b.spillSeq || 0) + 1;
      moved = true;
    }
  }
  return moved;
}
export function charonSupplyDestroyed(o, payload) {
  const s = o.state,
    p = payload?.entity,
    b = book(s);
  if (!b || b.blocked || !p || /shelv|sector|virtual|restore|reset/.test(payload.reason || '')) return;
  const capped = ['jettisoned_cargo_pod_cap', 'manifest_payload_cap'].includes(payload.reason);
  let r = row(s, p);
  // Canonical cap removal publishes after deleting the entity-map entry. Accept
  // only the exact previously bound incarnation, never copied labels or stale IDs.
  if (!r && capped && p.alive === false && s.entities.get(p.id) !== p) {
    const id = p.data?.charonSupplyPod?.id,
      bound = leafLives.get(b)?.get(id);
    if (bound?.entity === p && bound.life === p.occupantGeneration && bound.token === p.data.richLotSource?.charonLife) r = b.pods.find(x => x.id === id);
  }
  if (!r) return;
  if (p.hull <= 0 || capped) {
    r.lost += r.loose;
    r.loose = 0;
  }
}
// Run after synchronous death listeners have offered the actual finite manifest spill.
// Absence during streaming/Continue is not death and never creates a replacement lot.
export function reconcileCharonSupply(o) {
  const s = o.state,
    b = book(s);
  if (!b || b.blocked) return;
  for (const [id, field] of [[b.haulerId, 'aboard'], [b.salvorId, 'delivered']]) {
    const entities = s.entityList.filter(e => s.entities.get(e.id) === e && e.data?.worldRecordId === id),
      rec = s.world?.records?.byId?.[id];
    const bound = charonSupplyActorLife(b, field === 'aboard' ? C.hauler : C.salvor);
    const dead = entities.length === 1 && entities[0] === bound?.entity && entities[0].occupantGeneration === bound.life && entities[0].hull <= 0 || rec?.alive === false || ['destroyed', 'defeated'].includes(rec?.outcome);
    if (!dead) continue;
    for (const r of b.pods) {
      r.lost += r[field];
      r[field] = 0;
    }
    if (!['delivered', 'working'].includes(b.phase)) b.phase = 'lost';
  }
}
export function charonSupplyNativeDiagnostic(o, a, b) {
  const ar = nativeRecord(o, a),
    br = nativeRecord(o, b),
    p = o._registry?.get?.('physics');
  const raw = e => {
    const r = p?._sg02?.records.get(e?.id);
    return {
      live: live(o.state, e),
      revision: e?.physicsBody?.revision,
      nativeRevision: r?.revision,
      specRevision: r?.spec?.revision,
      enabled: r?.body?.isEnabled(),
      valid: r?.body?.isValid(),
      position: e?.pos,
      nativePosition: r?.body?.translation(),
      velocity: e?.vel,
      nativeVelocity: r?.body?.linvel()
    };
  };
  let contacts = [];
  try {
    for (const x of ar?.colliders || []) for (const y of br?.colliders || []) {
      const c = x.contactCollider(y, 1);
      if (c) contacts.push(c.distance);
    }
  } catch {}
  return {
    a: !!ar,
    b: !!br,
    rawA: raw(a),
    rawB: raw(b),
    contacts
  };
}
export function ownsCharonSupplyHull(s, e) {
  const b = book(s);
  if (!b || b.blocked || !live(s, e) || e.data?.itinerary?.kind !== CLAIM || e.data.itinerary.sourceId !== C.sourceId) return false;
  return (e === carrier(s) && b.haulerReady === true || e === recipient(s) && b.salvorReady === true) && !e.data.jobId;
}
