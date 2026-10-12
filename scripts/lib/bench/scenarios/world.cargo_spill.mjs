// world.cargo_spill — the real-path replacement for the inline spill arithmetic.
//
// THE REAL-PATH LAW (scenarios/README.md): the old inline case emitted its own
// `freight_cargoSpilled` / `npc:salvageCoursePlotted` / `npc:salvorArrived` events and timed a
// salvor as 0.75 s + 450 WU / 150 WU/s. Nothing in production ran. This module boots the full
// production manifest in Helios Prime (world.reaction_trio's boot), lets the sector populate its
// own traffic, picks a live laden civilian hauler, and lands ONE player hit on it through the
// production damage router. Traffic's own violence handler decides whether cargo spills; the
// module only watches what the world then does with the pod it produced.
//
// Readout order is the causal chain; the first link that does not happen is reported as
// `firstViolatedExpectation`, so the next agent knows which production owner to open:
//   spill_emitted -> spill_noticed -> npc_targets_pod -> npc_reaches_pod -> pod_custody_changed
import { deliverProductionGunHit } from './feel.hitstun_curve.mjs';
import { B10B_DEADLINE_S, bootWorld, bodilessActors, withFeatures } from './world.reaction_trio.mjs';

const DT = 1 / 60;
const SETTLE_TICKS = 600;          // let the sector spawn and route its own traffic
const STANDOFF_WU = 220;
const SAMPLE_STRIDE = 6;
const ARRIVAL_WU = 60;
const HIT_MAGNITUDE = 60;
// Roles traffic itself treats as civilian dump-on-violence carriers. Read-only mirror: if
// traffic changes its set, a run that finds no candidate says so instead of guessing.
const CARRIER_ROLES = new Set(['hauler', 'shuttle', 'tanker', 'arclight']);

const finite = (v, d = 0) => (Number.isFinite(v) ? v : d);
const r1 = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null);
const dist = (a, b) => Math.hypot(finite(a.x) - finite(b.x), finite(a.z) - finite(b.z));

function pickCarrier(state) {
  const recs = (state.traffic && state.traffic.freighters) || [];
  for (const rec of recs) {
    if (!rec || !CARRIER_ROLES.has(rec.role)) continue;
    if (!(rec.manifest && rec.manifest.totalQty > 0)) continue;
    const e = state.entities.get(rec.id);
    if (e && e.alive !== false && e.type === 'ship') return { rec, entity: e };
  }
  return null;
}

export async function measureCargoSpill(seed) {
  const h = await bootWorld(seed);
  const { runtime, state, bus, player } = h;
  const events = [];
  const tick = () => state.tick | 0;
  for (const name of ['freight:cargoSpilled', 'traffic:spillNoticed', 'traffic:salvorDispatched',
    'npcjobs:assigned', 'pickup:collected']) {
    bus.on(name, (p) => events.push({ tick: tick(), type: name, p: p || {} }));
  }
  runtime.runTicks(SETTLE_TICKS, DT);
  const picked = pickCarrier(state);
  if (!picked) {
    runtime.dispose();
    return { metrics: { unmeasured: true, firstViolatedExpectation: 'no_laden_civilian_carrier_in_sector', barMet: false,
      timeToNpcArrivalS: null }, eventTrace: [] };
  }
  const carrier = picked.entity;
  const before = { manifestQty: picked.rec.manifest.totalQty };
  player.pos.x = carrier.pos.x + STANDOFF_WU; player.pos.z = carrier.pos.z;
  player.vel.x = 0; player.vel.z = 0;
  runtime.runTicks(60, DT);
  const missingBodies = bodilessActors(runtime, { carrier, player });

  const hitTick = tick();
  const host = { runtime, withFeatures: (fn) => withFeatures(runtime, fn) };
  const hit = deliverProductionGunHit(host, carrier, { attackerId: player.id, nx: -1, nz: 0, magnitude: HIT_MAGNITUDE });
  runtime.runTicks(1, DT);

  const spill = events.find((e) => e.type === 'freight:cargoSpilled' && e.p.carrierId === carrier.id) || null;
  const podIds = new Set(spill && Array.isArray(spill.p.podIds) ? spill.p.podIds : []);
  const pods = [...podIds].map((id) => state.entities.get(id)).filter(Boolean);
  let noticedTick = null; let noticerId = null; let nearest = Infinity; let nearestId = null;
  let arrival = null; let custody = null;
  const watched = podIds.size ? B10B_DEADLINE_S * 60 : 0;
  for (let i = SAMPLE_STRIDE; i <= watched; i += SAMPLE_STRIDE) {
    runtime.runTicks(SAMPLE_STRIDE, DT);
    const take = events.find((e) => e.type === 'pickup:collected' && podIds.has(e.p.pickupId));
    if (take && !custody) {
      custody = { tick: take.tick, collectorId: take.p.collectorId,
        byPlayer: take.p.collectorId === player.id, byOwner: take.p.collectorId === carrier.id };
      if (!custody.byPlayer && !custody.byOwner && !arrival) arrival = { tick: take.tick, id: take.p.collectorId, tookPod: true };
      break;
    }
    for (const e of state.entityList || []) {
      if (!e || e.alive === false || e.type !== 'ship' || e.id === player.id || e.id === carrier.id) continue;
      const d = e.data || {};
      const targeted = podIds.has(d.salvageTargetId) || podIds.has(d.targetId)
        || (((state.traffic && state.traffic.freighters) || []).find((r) => r && r.id === e.id) || {}).targetId != null
          && podIds.has(((state.traffic.freighters).find((r) => r && r.id === e.id)).targetId);
      if (targeted && noticedTick == null) { noticedTick = tick(); noticerId = e.id; }
      for (const pod of pods) {
        if (pod.alive === false) continue;
        const dd = dist(e.pos, pod.pos);
        if (dd < nearest) { nearest = dd; nearestId = e.id; }
        if (targeted && dd <= ARRIVAL_WU && !arrival) arrival = { tick: tick(), id: e.id, tookPod: false };
      }
    }
    if (arrival) break;
  }
  const noticed = events.find((e) => e.type === 'traffic:spillNoticed'
    && Array.isArray(e.p.podIds) && e.p.podIds.some((id) => podIds.has(id))) || null;
  const dispatched = events.filter((e) => e.type === 'traffic:salvorDispatched' || e.type === 'npcjobs:assigned');
  const chain = [
    ['spill_emitted', !!spill],
    ['spill_noticed', !!noticed || noticedTick != null],
    ['npc_targets_pod', noticedTick != null || !!arrival],
    ['npc_reaches_pod', !!arrival],
    ['pod_custody_changed', !!custody],
  ];
  const unmeasured = missingBodies.length > 0;
  const firstViolated = unmeasured ? 'unmeasured_bodiless_actor' : ((chain.find(([, ok]) => !ok) || [null])[0]);
  const s = (t) => (t == null ? null : r1((t - hitTick) / 60));
  const pod0 = pods[0] || null;
  const metrics = {
    input: { kind: 'production_damage_router', tick: hitTick, attackerId: player.id, targetId: carrier.id,
      applied: r1(finite(hit && hit.totalApplied)), shieldDamage: r1(finite(hit && hit.shieldDamage)) },
    carrier: { id: carrier.id, role: picked.rec.role, manifestQtyBefore: before.manifestQty,
      manifestQtyAfter: picked.rec.manifest ? picked.rec.manifest.totalQty : null },
    spill: spill ? { tick: spill.tick, cause: spill.p.cause, attackerId: spill.p.attackerId, qty: spill.p.qty,
      commodityId: spill.p.commodityId, podIds: [...podIds],
      podCustodyStamp: pod0 ? !!(pod0.data && pod0.data.freightCustodyPod) : null,
      podOwnerId: pod0 && pod0.data ? pod0.data.ownerId ?? null : null } : null,
    noticedAtS: s(noticed ? noticed.tick : noticedTick),
    noticerId,
    dispatchEvents: dispatched.length,
    nearestNpcApproachWU: r1(nearest), nearestNpcId: nearestId,
    arrivalId: arrival ? arrival.id : null,
    timeToNpcArrivalS: arrival ? s(arrival.tick) : null,
    custody,
    podsAlive: pods.filter((p) => p.alive !== false).length,
    podsAttracted: arrival ? 1 : 0,
    windowS: r1(watched / 60),
    unmeasured, bodilessActors: missingBodies,
    firstViolatedExpectation: firstViolated,
    barMet: firstViolated == null,
  };
  const eventTrace = events.map((e) => ({ tick: e.tick, type: e.type,
    data: { carrierId: e.p.carrierId ?? null, podIds: e.p.podIds ?? null, pickupId: e.p.pickupId ?? null,
      collectorId: e.p.collectorId ?? null, cause: e.p.cause ?? null } }));
  runtime.dispose();
  return { metrics, eventTrace };
}

export const scenario = {
  id: 'world.cargo_spill',
  label: 'B10b Cargo Spill — a real player hit on a live hauler, and what the world does with the pod',
  run: measureCargoSpill,
};

export default scenario;
