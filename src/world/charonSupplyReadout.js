// Dependency-free presentation and original-actor identity view. Never imports
// physical cargo owners; scanner may import Hail before the runtime is composed.
export const CHARON_SUPPLY = Object.freeze({
  sectorId: 'sector_charon_expanse',
  pocketId: 'charon_colony_barge',
  sourceId: 'charon_colony_air_pod',
  hauler: 'charon_colony_hauler',
  salvor: 'charon_colony_salvor',
  commodityId: 'cmdty_consumer_goods',
  quantity: 6,
  schema: 1
});
const C=CHARON_SUPPLY;
const actorLives=new WeakMap();
export const charonSupplyLive=(s,e)=>e?.alive===true&&s.entities.get(e.id)===e;
export const charonSupplyBook=s=>s.traffic?.charonSalvageSupply;
export const charonSupplyQuantity=(b,field)=>b.pods.reduce((n,r)=>n+r[field],0);
const live=charonSupplyLive,book=charonSupplyBook,quantity=charonSupplyQuantity;
export function charonSupplyActorLife(b,slot){return actorLives.get(b)?.get(slot);}
function actor(s, slot, recordId = null) {
  const rows = s.entityList.filter(e => live(s, e) && e.data?.activityActorSlotId === slot && (!recordId || e.data.worldRecordId === recordId));
  if (rows.length !== 1 || s.entityList.filter(e => live(s, e) && e.data?.worldRecordId === rows[0].data.worldRecordId).length !== 1) return null;
  const e = rows[0],
    b = book(s);
  if (b && !b.blocked) {
    let lives = actorLives.get(b);
    if (!lives) {
      lives = new Map();
      actorLives.set(b, lives);
    }
    const old = lives.get(slot);
    if (old && (old.entity !== e || old.life !== e.occupantGeneration)) {
      // The world owner may rematerialize a shelved hull. Rebind only its durable,
      // alive original record after the previous healthy incarnation left canon.
      const rec = s.world?.records?.byId?.[recordId || e.data.worldRecordId],
        prior = old.entity,
        key = `charon:activity:${slot}`;
      if (prior === e || prior.alive || s.entities.get(prior.id) === prior || !(prior.hull > 0) || !e.data.durable || e.data.identityKey !== key || prior.data?.identityKey !== key || rec?.recordId !== e.data.worldRecordId || rec.identityKey !== key || rec.alive !== true || rec.outcome !== 'active' || rec.homeSectorId !== C.sectorId) return null;
      lives.set(slot, {
        entity: e,
        life: e.occupantGeneration
      });
    } else if (!old) lives.set(slot, {
      entity: e,
      life: e.occupantGeneration
    });
  }
  return e;
}
function carrier(s) {
  const b = book(s);
  return b && actor(s, C.hauler, b.haulerId);
}
function recipient(s) {
  const b = book(s);
  return b && actor(s, C.salvor, b.salvorId);
}
export function charonSupplyHailLines(s, e) {
  const b = book(s);
  if (!b || b.blocked || !live(s, e) || ![[C.hauler, b.haulerId], [C.salvor, b.salvorId]].some(([slot, id]) => e.data?.activityActorSlotId === slot && e.data.worldRecordId === id)) return null;
  const h = carrier(s),
    r = recipient(s),
    loose = quantity(b, 'loose'),
    aboard = quantity(b, 'aboard');
  return ['Visiting salvage crew. The colony was evacuated. We are recovering its abandoned sealed air-system supplies; the barge is a landmark, not a cargo receiver.', b.phase === 'working' ? r ? `Recovered scrubber kits used by ${r.data?.name || 'the original cutter'} to start its next cutting round.` : 'The scrubber reserve reached the original cutter, which is no longer present.' : b.phase === 'delivered' ? 'Air-system supplies are physically aboard the cutter, awaiting next-round admission.' : b.phase === 'awaiting_round' ? b.haulerReady && b.salvorReady ? 'Waiting to recover sealed scrubber kits before our first cutting round.' : 'We are finishing our current jobs before recovering the next round’s air-system supplies.' : b.phase === 'shortfall' ? 'The next cutting round is cancelled: part of the original scrubber reserve was taken or lost. Remaining stock stays where it is; no replacement is being issued.' : !h || !r ? 'The original supply crew is missing. No replacement load has been issued.' : `Cutter waiting to start its next round: ${aboard} aboard ${h.data?.name || 'the original hauler'}, ${loose} loose, ${quantity(b, 'player')} recovered by you, ${quantity(b, 'other')} taken by another collector, ${quantity(b, 'lost')} lost. Bring the original loose supply pod within reach, slow it and release your tether.`];
}
export function charonSupplyFacts(s) {
  const b = book(s);
  if (!b || b.blocked) return null;
  return {
    phase: b.phase,
    original: b.original,
    ...Object.fromEntries(['loose', 'aboard', 'delivered', 'consumed', 'player', 'other', 'lost'].map(k => [k, quantity(b, k)])),
    haulerId: carrier(s)?.id ?? null,
    salvorId: recipient(s)?.id ?? null
  };
}

export {actor as charonSupplyActor,carrier as charonSupplyCarrier,recipient as charonSupplyRecipient};
