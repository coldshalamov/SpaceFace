import { fieldContainsPoint } from './fieldKernel.js';
import { witnessLineOfSight } from '../../combat/lineOfSight.js';
import { scalarHitToDamagePacket } from '../../combat/damage.js';

// Optional recipe on the ONE field kernel. Zero force, finite life, combat-owned damage/heat.
export { normalizeKilnbackThermalRecipe as normalizeThermalRecipe } from '../../data/kilnback.js';
export function thermalPointCooled(fields, point, family = 'kilnback') {
  return fields.some(f => f.thermal?.kind === 'coolant' && f.thermal.family === family && fieldContainsPoint(f, point.x, point.z));
}
export function applyThermalFields({ state, fields, kernel, dt, bus, candidatesFor }) {
  if (!(dt > 0) || !kernel) return;
  const burns = fields.filter(f => f.thermal?.kind === 'burn');
  if (!burns.length) return;
  const seen = new Set();
  for (const field of burns) {
    const candidates = candidatesFor ? candidatesFor(field) : state.entityList;
    let affected = 0;
    for (const target of candidates) {
      if (!target?.alive || !target.pos || !['ship', 'drone', 'asteroid', 'wreck', 'payload'].includes(target.type)) continue;
      if (affected >= field.maxAffected) break;
      if (!fieldContainsPoint(field, target.pos.x, target.pos.z) || thermalPointCooled(fields, target.pos)) continue;
      const key = `${field.thermal.attackId}:${target.id}`;
      if (seen.has(key)) continue; // overlapping pulses never multiply one furnace's output
      const owner = state.entities.get(field.ownerId);
      const attackerId = owner?.occupantGeneration === field.thermal.ownerLife
        && owner.data?.kilnbackKey === field.thermal.sourceKey ? owner.id : null;
      if (!witnessLineOfSight(state, { id: attackerId ?? field.id, pos: field.center }, target.pos, [target.id])) continue;
      seen.add(key); affected++;
      const packet = scalarHitToDamagePacket({ damage: field.thermal.damagePerSecond * dt,
        damageType: 'thermal', heat: field.thermal.heatPerSecond * dt, pos: { ...target.pos },
        source: { kind: 'kilnback_heat', fieldId: field.id, attackId: field.thermal.attackId } });
      packet.armorFlatScale = Math.min(1, dt);
      const result = kernel.routeDamage({ attackerId, targetId: target.id, packet,
        origin: { kind: 'field', id: field.id } });
      if (result.ok) bus?.emit('fields:thermalHit', { fieldId: field.id, sourceKey: field.thermal.sourceKey,
        attackId: field.thermal.attackId, targetId: target.id, selfBurn: attackerId === target.id, tick: state.tick });
    }
  }
}
