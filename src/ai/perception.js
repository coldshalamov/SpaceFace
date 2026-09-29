import { TraceLayer, distance2, normalizeSensorFrame, saturate, stableId } from './contracts.js';

export class PerceptionMemory {
  constructor({ memoryTicks = 300, confidenceFloor = 0.08, trace = null, freezeResults = true } = {}) {
    if (!Number.isInteger(memoryTicks) || memoryTicks < 1) throw new RangeError('memoryTicks must be positive');
    this.memoryTicks = memoryTicks;
    this.confidenceFloor = confidenceFloor;
    this.trace = trace;
    this.freeze = freezeResults === false ? identity : Object.freeze;
    this.freezeResults = this.freeze === Object.freeze;
    this.byEntity = new Map();
    this.seenScratch = new Set();
  }

  observe(entityId, frame, tick) {
    const normalized = normalizeSensorFrame(frame, entityId, tick);
    let memory = this.byEntity.get(entityId);
    if (!memory) {
      memory = {
        self: normalized.self,
        contacts: new Map(),
        events: [],
        tick: normalized.tick,
        // Maneuver planning may retain indexes over the live (non-frozen) snapshot. The
        // revision is owned by this memory and advances after every accepted sensor batch,
        // including in-place contact updates and removals.
        revision: 0,
        snapshotContacts: [],
        snapshot: { tick: normalized.tick, self: normalized.self, contacts: [], events: [], revision: 0 },
      };
      this.byEntity.set(entityId, memory);
    }
    memory.self = normalized.self;
    memory.tick = normalized.tick;
    memory.events = this.freezeResults ? normalized.events.slice() : normalized.events;

    const seen = this.seenScratch;
    seen.clear();
    for (const contact of normalized.contacts) {
      const key = contactKey(contact);
      seen.add(key);
      let record = memory.contacts.get(key);
      if (!record) {
        record = { ...contact, firstSeenTick: normalized.tick };
        memory.contacts.set(key, record);
      } else {
        Object.assign(record, contact);
      }
      record.lastSeenTick = normalized.tick;
      record.observedConfidence = contact.confidence;
    }

    for (const [key, contact] of memory.contacts) {
      if (seen.has(key)) continue;
      const age = normalized.tick - contact.lastSeenTick;
      const confidence = contact.observedConfidence * Math.max(0, 1 - age / this.memoryTicks);
      if (age > this.memoryTicks || confidence < this.confidenceFloor) memory.contacts.delete(key);
    }

    memory.revision++;
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
    const freeze = this.freeze;
    if (!memory) return freeze({ tick: tick || 0, self: null, contacts: freeze([]), events: freeze([]), revision: 0 });
    const now = tick == null ? memory.tick : tick;
    if (!this.freezeResults) return liveSnapshot(memory, now, this.memoryTicks, this.confidenceFloor);
    const contacts = [];
    for (const contact of memory.contacts.values()) {
      const ageTicks = Math.max(0, now - contact.lastSeenTick);
      const confidence = saturate(contact.observedConfidence * Math.max(0, 1 - ageTicks / this.memoryTicks));
      if (confidence < this.confidenceFloor) continue;
      contacts.push(freeze({
        id: contact.id,
        kind: contact.kind,
        team: contact.team,
        classification: contact.classification,
        pos: contact.pos,
        vel: contact.vel,
        radius: contact.radius,
        alive: contact.alive,
        valid: contact.valid,
        confidence,
        threat: contact.threat,
        hostile: contact.hostile,
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
        operationalMassBand: contact.operationalMassBand,
        mobilityBand: contact.mobilityBand,
        cargoBand: contact.cargoBand,
        tetherabilityBand: contact.tetherabilityBand,
        tags: contact.tags,
        firstSeenTick: contact.firstSeenTick,
        lastSeenTick: contact.lastSeenTick,
        ageTicks,
        visible: contact.visible !== false && ageTicks === 0,
      }));
    }
    if (freeze === Object.freeze) {
      contacts.sort((a, b) => {
        const ak = `${a.kind}|${stableId(a.id)}`;
        const bk = `${b.kind}|${stableId(b.id)}`;
        return ak < bk ? -1 : (ak > bk ? 1 : 0);
      });
    }
    return freeze({
      tick: now,
      self: memory.self,
      contacts: freeze(contacts),
      events: freeze === Object.freeze ? freeze(memory.events.slice()) : memory.events,
      revision: memory.revision,
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

function liveSnapshot(memory, now, memoryTicks, confidenceFloor) {
  const contacts = memory.snapshotContacts || (memory.snapshotContacts = []);
  contacts.length = 0;
  for (const contact of memory.contacts.values()) {
    const ageTicks = Math.max(0, now - contact.lastSeenTick);
    const confidence = saturate(contact.observedConfidence * Math.max(0, 1 - ageTicks / memoryTicks));
    if (confidence < confidenceFloor) continue;
    contact.confidence = confidence;
    contact.ageTicks = ageTicks;
    contact.visible = contact.visible !== false && ageTicks === 0;
    contacts.push(contact);
  }
  const snapshot = memory.snapshot || (memory.snapshot = { tick: now, self: null, contacts, events: [], revision: 0 });
  snapshot.tick = now;
  snapshot.self = memory.self;
  snapshot.contacts = contacts;
  snapshot.events = memory.events;
  snapshot.revision = memory.revision;
  return snapshot;
}

// SF-054: an "actionable" contact is one that can hurt the opposition now — near a squad member or
// actively prosecuted by that member. The ramp is smooth on purpose: a contact hovering at the far
// edge changes the weight continuously, so jitter across a distance line cannot flicker the signal.
const ACTIONABLE_NEAR_WU = 650;
const ACTIONABLE_FAR_WU = 1700;
const ACTIONABLE_ENGAGED_WEIGHT = 0.9;
const ACTIONABLE_COUNT_WEIGHT = 0.3;
const ACTIONABLE_PROSECUTION_KINDS = new Set(['attack_run', 'reposition']);

function actionableContactWeight(self, contact) {
  // A contact the squad remembers but cannot currently localize fails safe toward NEAR — a
  // hostile with no fix must not read as safely distant. (distance2 alone would measure a
  // missing pos as distance-to-origin, which reads far for any off-origin perceiver.)
  const distance = self && self.pos && contact && contact.pos
    ? distance2(self.pos, contact.pos) : 0;
  const proximity = saturate(
    1 - (distance - ACTIONABLE_NEAR_WU) / (ACTIONABLE_FAR_WU - ACTIONABLE_NEAR_WU),
  );
  const activity = self && self.activity;
  const engaged = !!(activity
    && activity.targetId != null && activity.targetId === contact.id
    && ACTIONABLE_PROSECUTION_KINDS.has(activity.kind));
  return Math.max(proximity, engaged ? ACTIONABLE_ENGAGED_WEIGHT : 0);
}

export function aggregatePerceivedTelemetry(perceptions, freeze = Object.freeze) {
  let hostileContacts = 0;
  let hostileThreat = 0;
  let actionableThreat = 0;
  let actionableContacts = 0;
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
      if (contact.kind === 'ship' && contact.hostile === true) {
        hostileContacts++;
        hostileThreat += contact.threat * contact.confidence;
        if (contact.alive !== false) {
          const weight = actionableContactWeight(perception.self, contact);
          actionableThreat += contact.threat * contact.confidence * weight;
          if (weight >= ACTIONABLE_COUNT_WEIGHT) actionableContacts++;
        }
      }
      if (contact.kind === 'objective') objectiveProgress = Math.max(objectiveProgress, contact.objectiveValue);
    }
    for (const event of perception.events) {
      if (event.type === 'damage_received') recentDamage += Math.max(0, event.magnitude);
      if (event.type === 'objective_progress') objectiveProgress = Math.max(objectiveProgress, event.magnitude);
    }
  }

  const denom = Math.max(1, reports);
  return freeze({
    reports,
    hostileContacts,
    visibleThreat: saturate(hostileThreat / denom),
    actionableThreat: saturate(actionableThreat / denom),
    actionableContacts,
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

function identity(value) {
  return value;
}
