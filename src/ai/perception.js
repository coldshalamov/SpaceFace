import { TraceLayer, normalizeSensorFrame, saturate, stableId } from './contracts.js';

export class PerceptionMemory {
  constructor({ memoryTicks = 300, confidenceFloor = 0.08, trace = null } = {}) {
    if (!Number.isInteger(memoryTicks) || memoryTicks < 1) throw new RangeError('memoryTicks must be positive');
    this.memoryTicks = memoryTicks;
    this.confidenceFloor = confidenceFloor;
    this.trace = trace;
    this.byEntity = new Map();
  }

  observe(entityId, frame, tick) {
    const normalized = normalizeSensorFrame(frame, entityId, tick);
    let memory = this.byEntity.get(entityId);
    if (!memory) {
      memory = { self: normalized.self, contacts: new Map(), events: [], tick: normalized.tick };
      this.byEntity.set(entityId, memory);
    }
    memory.self = normalized.self;
    memory.tick = normalized.tick;
    memory.events = normalized.events.slice();

    const seen = new Set();
    for (const contact of normalized.contacts) {
      const key = contactKey(contact);
      seen.add(key);
      memory.contacts.set(key, {
        ...contact,
        firstSeenTick: memory.contacts.has(key) ? memory.contacts.get(key).firstSeenTick : normalized.tick,
        lastSeenTick: normalized.tick,
        observedConfidence: contact.confidence,
      });
    }

    for (const [key, contact] of memory.contacts) {
      if (seen.has(key)) continue;
      const age = normalized.tick - contact.lastSeenTick;
      const confidence = contact.observedConfidence * Math.max(0, 1 - age / this.memoryTicks);
      if (age > this.memoryTicks || confidence < this.confidenceFloor) memory.contacts.delete(key);
    }

    const snapshot = this.snapshot(entityId, normalized.tick);
    if (this.trace) {
      this.trace.emit({
        tick: normalized.tick,
        layer: TraceLayer.PERCEPTION,
        entityId,
        decision: 'sensor_frame_accepted',
        selected: { contacts: normalized.contacts.length, remembered: snapshot.contacts.length },
        context: { eventCount: normalized.events.length, memoryTicks: this.memoryTicks },
      });
    }
    return snapshot;
  }

  snapshot(entityId, tick = null) {
    const memory = this.byEntity.get(entityId);
    if (!memory) return Object.freeze({ tick: tick || 0, self: null, contacts: Object.freeze([]), events: Object.freeze([]) });
    const now = tick == null ? memory.tick : tick;
    const contacts = [];
    for (const contact of memory.contacts.values()) {
      const ageTicks = Math.max(0, now - contact.lastSeenTick);
      const confidence = saturate(contact.observedConfidence * Math.max(0, 1 - ageTicks / this.memoryTicks));
      if (confidence < this.confidenceFloor) continue;
      contacts.push(Object.freeze({
        id: contact.id,
        kind: contact.kind,
        team: contact.team,
        classification: contact.classification,
        pos: contact.pos,
        vel: contact.vel,
        radius: contact.radius,
        confidence,
        threat: contact.threat,
        targetId: contact.targetId,
        ownerId: contact.ownerId,
        attachmentId: contact.attachmentId,
        sourceSocketId: contact.sourceSocketId,
        targetSocketId: contact.targetSocketId,
        ownedBySelf: contact.ownedBySelf,
        exposed: contact.exposed,
        tethered: contact.tethered,
        disabled: contact.disabled,
        objectiveValue: contact.objectiveValue,
        massClass: contact.massClass,
        tags: contact.tags,
        firstSeenTick: contact.firstSeenTick,
        lastSeenTick: contact.lastSeenTick,
        ageTicks,
        visible: ageTicks === 0,
      }));
    }
    contacts.sort((a, b) => {
      const ak = `${a.kind}|${stableId(a.id)}`;
      const bk = `${b.kind}|${stableId(b.id)}`;
      return ak < bk ? -1 : (ak > bk ? 1 : 0);
    });
    return Object.freeze({
      tick: now,
      self: memory.self,
      contacts: Object.freeze(contacts),
      events: Object.freeze(memory.events.slice()),
    });
  }

  forgetEntity(entityId) {
    this.byEntity.delete(entityId);
  }

  inspect(entityId = null) {
    if (entityId != null) return this.snapshot(entityId);
    const out = {};
    for (const id of [...this.byEntity.keys()].sort(idSort)) out[String(id)] = this.snapshot(id);
    return Object.freeze(out);
  }
}

export function aggregatePerceivedTelemetry(perceptions) {
  let hostileContacts = 0;
  let hostileThreat = 0;
  let friendlyDisabled = 0;
  let friendlyLowHull = 0;
  let tetherThreats = 0;
  let recentDamage = 0;
  let objectiveProgress = 0;
  let reports = 0;

  for (const perception of perceptions || []) {
    if (!perception || !perception.self) continue;
    reports++;
    if (perception.self.disabled) friendlyDisabled++;
    if (perception.self.hullFraction < 0.35) friendlyLowHull++;
    for (const contact of perception.contacts) {
      if (contact.kind === 'tether' && contact.confidence >= 0.4) tetherThreats++;
      if (contact.team != null && contact.team !== perception.self.team && contact.kind === 'ship') {
        hostileContacts++;
        hostileThreat += contact.threat * contact.confidence;
      }
      if (contact.kind === 'objective') objectiveProgress = Math.max(objectiveProgress, contact.objectiveValue);
    }
    for (const event of perception.events) {
      if (event.type === 'damage_received') recentDamage += Math.max(0, event.magnitude);
      if (event.type === 'objective_progress') objectiveProgress = Math.max(objectiveProgress, event.magnitude);
    }
  }

  const denom = Math.max(1, reports);
  return Object.freeze({
    reports,
    hostileContacts,
    visibleThreat: saturate(hostileThreat / denom),
    friendlyDisabledFraction: saturate(friendlyDisabled / denom),
    friendlyLowHullFraction: saturate(friendlyLowHull / denom),
    tetherThreats,
    recentDamage: saturate(recentDamage / denom),
    objectiveProgress: saturate(objectiveProgress),
  });
}

function contactKey(contact) {
  return `${contact.kind}|${stableId(contact.id)}`;
}

function idSort(a, b) {
  const ak = stableId(a), bk = stableId(b);
  return ak < bk ? -1 : (ak > bk ? 1 : 0);
}
