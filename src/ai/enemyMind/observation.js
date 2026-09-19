import { compare, distance, finite, keyFor, point, unitValue, validPoint } from './math.js';

const COMBAT = new Set(['engage', 'focus']);
const RESERVED = new Set(['tug', 'steal', 'counter_tether_cut', 'counter_tether_overload']);
const NONCOMBAT = new Set(['loiter', 'patrol_route', 'transit', 'scan_approach', 'hail_hold', 'return_to_anchor']);

/** Upper-layer authority can be narrowed, never promoted. No hidden target selection. */
export function authorityFor(member, perception, directive) {
  const self = perception?.self;
  if (!self || !validPoint(self.pos) || member.alive === false || self.alive === false || member.passive === true) return 'none';
  if (self.isPlayer === true || (member.playerId != null && member.playerId === member.id)) return 'none';
  if (member.playerTeam != null && (self.team ?? member.team) === member.playerTeam) return 'none';
  const objective = directive?.objective?.kind;
  if (!objective || RESERVED.has(objective) || self.tethered === true) return 'reserved';
  const activity = self.activity?.kind || member.activity?.kind;
  if (objective === 'retreat' || activity === 'flee' || activity === 'disengage') return 'retreat';
  if (self.roe === 'hold_fire' || NONCOMBAT.has(activity)) return 'none';
  return COMBAT.has(objective) ? 'combat' : 'reserved';
}

/**
 * Reads a bounded rotating sensor window plus the last target slot. Overflow is conservative
 * (unseen means no fire); a long-lived tail contact cannot starve behind projectile clutter.
 * Copies coordinates: live PerceptionMemory frames are mutable scratch objects.
 */
export function observePilot(record, member, perception, directive, now, tick, tuning, stats) {
  const self = perception.self;
  const newFrame = perception.tick === tick && record.frameTick !== perception.tick;
  if (newFrame) {
    record.frameTick = perception.tick;
    record.frameAt = now;
  }
  const frameFresh = record.frameAt != null && now - record.frameAt <= tuning.maxSensorAge;
  const hull = unitValue(self.hullFraction, 1);
  const dt = record.observedAt == null ? 0 : Math.max(0, now - record.observedAt);
  const hit = record.observedAt == null ? 0 : Math.max(0, record.lastHull - hull);
  record.shock = unitValue(record.shock - tuning.shockDecay * dt + hit * tuning.hitShock);
  record.lastHull = hull;
  record.observedAt = now;
  const targetId = directive?.objective?.targetId ?? directive?.focusTargetId ?? null;
  let target = null;
  let incoming = 0;
  let casualties = 0;
  const friends = [];
  const deadFriends = [];
  const contacts = Array.isArray(perception.contacts) ? perception.contacts : [];
  const limit = Math.min(contacts.length, tuning.maxContactReads);
  stats.contactsTruncated += Math.max(0, contacts.length - limit);
  const cachedSlot = Number.isInteger(record.targetSlot) && record.targetSlot >= 0 && record.targetSlot < contacts.length
    ? record.targetSlot : -1;
  let walked = 0;
  const cursor = contacts.length ? (record.contactCursor || 0) % contacts.length : 0;
  for (let read = 0; read < limit; read++) {
    let index;
    if (read === 0 && cachedSlot >= 0) index = cachedSlot;
    else {
      index = (cursor + walked++) % contacts.length;
      if (index === cachedSlot) index = (cursor + walked++) % contacts.length;
    }
    stats.contactReads++;
    const c = contacts[index];
    if (!c || !validPoint(c.pos)) continue;
    const visible = frameFresh && c.visible === true && finite(c.ageTicks) === 0;
    if (!visible || finite(c.confidence, 1) < tuning.minConfidence || c.valid === false) continue;
    if (c.kind === 'ship' && c.id === targetId && c.hostile === true && c.alive !== false) {
      record.targetSlot = index;
      target = { id: c.id, pos: point(c.pos), vel: point(c.vel), targetId: c.targetId ?? null,
        confidence: unitValue(c.confidence, 1), observedAt: record.frameAt };
    }
    if (c.kind === 'ship' && c.hostile !== true && c.team != null && c.team === self.team && c.id !== member.id) {
      if (c.alive === false) { casualties++; deadFriends.push(c.id); }
      else friends.push({ id: c.id, key: keyFor(c.id), pos: point(c.pos), vel: point(c.vel), distance: distance(self.pos, c.pos) });
    }
    if (c.kind === 'projectile' && c.hostile === true && c.alive !== false) {
      const dx = c.pos.x - self.pos.x, dz = c.pos.z - self.pos.z;
      const vx = finite(c.vel?.x) - finite(self.vel?.x), vz = finite(c.vel?.z) - finite(self.vel?.z);
      const speed2 = vx * vx + vz * vz;
      const eta = speed2 > 1 ? -(dx * vx + dz * vz) / speed2 : -1;
      if (eta >= 0 && eta < 1.1 && Math.hypot(dx + vx * eta, dz + vz * eta) < finite(self.radius, 16) + 24) incoming++;
    }
  }
  record.contactCursor = contacts.length ? (cursor + walked) % contacts.length : 0;
  if (!target) record.targetSlot = null;
  friends.sort((a, b) => a.distance - b.distance || compare(a.key, b.key));
  friends.length = Math.min(friends.length, tuning.maxPeers);
  if (target) record.lastTarget = target;
  else if (record.lastTarget && (record.lastTarget.id !== targetId || now - record.lastTarget.observedAt > tuning.maxMemoryAge)) record.lastTarget = null;
  const known = target || record.lastTarget;
  return {
    id: member.id, key: record.key, squadId: record.squadId, team: self.team ?? null,
    pos: point(self.pos), vel: point(self.vel), hull, energy: unitValue(self.energyFraction, 1),
    heat: unitValue(self.heatFraction), disabled: self.disabled === true,
    authority: authorityFor(member, perception, directive), target, known, friends,
    incoming: Math.min(1, incoming * 0.35), casualties: Math.min(1, casualties * 0.4), hit,
    targeted: !!target && target.targetId === member.id,
    range: target ? distance(self.pos, target.pos) : null,
    formationSlot: validPoint(directive?.formation?.slot) ? point(directive.formation.slot) : point(self.pos),
    preferredRange: Math.max(80, Math.min(650, self.activity?.preferredRange > 0 ? self.activity.preferredRange : tuning.preferredRange)),
    // A cached decision may outlive this update; its fire lease belongs to the SENSOR frame.
    validUntil: record.frameAt == null ? now : record.frameAt + tuning.maxSensorAge,
    frameFresh, deadFriends,
  };
}

/** Radio contains SELF reports only. It cannot authorize a shot or disclose hidden enemies. */
export function hearPeers(record, observation, signals, now, tuning, stats) {
  const peers = [];
  const limit = Math.min(signals.length, tuning.maxRadioReads);
  for (let index = 0; index < limit; index++) {
    stats.radioReads++;
    const signal = signals[index];
    if (signal.key === record.key || signal.squadKey !== record.squadKey || signal.team !== observation.team) continue;
    if (signal.deliverAt > now + 1e-9 || signal.expiresAt < now) continue;
    if (observation.deadFriends.includes(signal.id)) continue;
    const range = distance(signal.pos, observation.pos);
    if (range > tuning.radioRange) continue;
    // Visible casualty overrides a still-valid last radio report only through perception. A
    // roster disappearance never becomes magical knowledge of a wingmate's death.
    peers.push({ ...signal, distance: range });
  }
  peers.sort((a, b) => a.distance - b.distance || compare(a.key, b.key));
  peers.length = Math.min(peers.length, tuning.maxPeers);
  return peers;
}
