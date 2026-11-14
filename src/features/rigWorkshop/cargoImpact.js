// Relay cargo owns only its original unpaid bodies. Native physics supplies the
// collision; the shared collision law computes shock and combat alone writes hull.
import { physicsBodyNativeReady } from '../../core/physicsAuthority.js';
import { resolveCollisionConsequence } from '../../combat/impulseKernel.js';
import { scalarHitToDamagePacket } from '../../combat/damage.js';
import { getCombatKernel } from '../../combat/kernel.js';
import { combatFlag } from '../../data/featureFlags.js';

export function installRelayCargoImpacts(ctx) {
  const { state, bus } = ctx;
  const recent = new WeakMap();
  const onImpact = p => {
    if (state.mode !== 'flight' || !combatFlag('weaponImpulseConsequences')
      || p?.backend !== 'rapier-dynamic' || p.consequenceKernelVersion !== 1
      || p.tick !== state.tick || !(p.impulse > 0)) return;
    const w = state.rigWorkshop, job = w?.jobs?.relay;
    // Its own unpaid originals gate first: an ordinary collision does no work here.
    if (!job || job.settled || w.bench?.sectorId !== state.world?.currentSectorId
      || !job.cargo.some(c => !c.paid && !c.lost && (c.id === p.aId || c.id === p.bId))) return;
    const a = state.entities.get(p.aId), b = state.entities.get(p.bId);
    if (!a || !b || a === b || a.alive === false || b.alive === false
      || !Number.isSafeInteger(p.aGeneration) || !Number.isSafeInteger(p.bGeneration)
      || a.occupantGeneration !== p.aGeneration || b.occupantGeneration !== p.bGeneration) return;
    // Physics reuses its event payload; combat listeners may synchronously emit another contact.
    p = { ...p, pos: p.pos && { ...p.pos }, normal: p.normal && { ...p.normal } };
    for (const [target, other] of [[a, b], [b, a]]) {
      const tag = target.data?.rigWorkshopCargo;
      const record = job.cargo.find(r => r.id === target.id && r.token === tag?.token);
      // A synchronous damage listener can replace a life or settle the order mid-pair.
      if (state.entities.get(target.id) !== target || state.entities.get(other.id) !== other
        || target.alive === false || !(target.hull > 0) || target.type !== 'payload'
        || !record || record.paid || record.lost || job.settled
        || tag?.delivered || tag?.jobId !== 'relay' || tag?.ownerId !== w.ownerId
        || target.data.rigWorkshopOwner !== w.ownerId || target.data.payloadType !== 'rig_workshop'
        || w.bench?.sectorId !== state.world?.currentSectorId
        || !physicsBodyNativeReady(target) || !physicsBodyNativeReady(other)) continue;
      let pairs = recent.get(target);
      if (!pairs) recent.set(target, pairs = new Map());
      const last = pairs.get(other);
      if (last != null && p.tick - last < 12) continue;
      const receipt = resolveCollisionConsequence({ target, other, payloadDamageOnly: true,
        exchangedMomentum: p.impulse, preSolveClosingSpeed: p.preSolveClosingSpeed,
        tick: p.tick, pos: p.pos, normal: p.normal });
      if (!(receipt?.impactDamage > 0)) continue;
      // Record before the combat writer: a synchronous listener cannot replay payment damage.
      for (const [body, tick] of pairs) if (p.tick - tick >= 12) pairs.delete(body);
      pairs.set(other, p.tick);
      const packet = scalarHitToDamagePacket({ damage: receipt.impactDamage, damageType: 'kinetic',
        pos: receipt.pos, source: { kind: `collision_${receipt.surface}` } });
      packet.flags = { allowAnyTarget: true, ignoreFriendlyFire: true };
      getCombatKernel(ctx).routeDamage({ attackerId: null, targetId: target.id, packet,
        origin: { kind: 'collision', id: receipt.surface } });
    }
  };
  return bus.on('physics:impact', onImpact);
}
