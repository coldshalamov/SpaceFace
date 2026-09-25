/**
 * Portable microbench: live entityContacts observer×contact fill.
 * Before = object-spread contact alloc (prior production).
 * After  = retained contactRecords field fill (ephemeral liveFramesFor path).
 *
 * Includes PerceptionMemory-style Object.assign into durable records so the
 * bench is not a pure-GC toy — matches production observe() consumption.
 */
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';

function makeBase(id) {
  return {
    id,
    kind: 'ship',
    team: 2,
    classification: 'fighter',
    pos: { x: id * 3.1, z: -id * 1.7 },
    vel: { x: 0.2, z: -0.1 },
    radius: 8,
    alive: true,
    valid: true,
    visible: true,
    targetId: null,
    ownerId: null,
    disabled: false,
    tethered: false,
    exposed: false,
    ownedBySelf: false,
    objectiveValue: 1,
    massClass: 3,
    operationalMassBand: 'light',
    mobilityBand: 'medium',
    cargoBand: 'empty',
    tetherabilityBand: 'fair',
    tags: Object.freeze(['solid', 'armed']),
  };
}

function makeEmptyContact() {
  return {
    id: null, kind: null, team: null, classification: null,
    pos: null, vel: null, radius: 0,
    alive: true, valid: true, visible: true,
    targetId: null, ownerId: null,
    disabled: false, tethered: false, exposed: false, ownedBySelf: false,
    objectiveValue: 0, massClass: 1,
    operationalMassBand: null, mobilityBand: null, cargoBand: null, tetherabilityBand: null,
    tags: null, confidence: 0, threat: 0, hostile: false,
    attachmentId: undefined, sourceSocketId: undefined, targetSocketId: undefined,
  };
}

function fillSensorContact(out, base, confidence, threat, hostile) {
  out.id = base.id;
  out.kind = base.kind;
  out.team = base.team;
  out.classification = base.classification;
  out.pos = base.pos;
  out.vel = base.vel;
  out.radius = base.radius;
  out.alive = base.alive;
  out.valid = base.valid;
  out.visible = base.visible;
  out.targetId = base.targetId;
  out.ownerId = base.ownerId;
  out.disabled = base.disabled;
  out.tethered = base.tethered;
  out.exposed = base.exposed;
  out.ownedBySelf = base.ownedBySelf;
  out.objectiveValue = base.objectiveValue;
  out.massClass = base.massClass;
  out.operationalMassBand = base.operationalMassBand;
  out.mobilityBand = base.mobilityBand;
  out.cargoBand = base.cargoBand;
  out.tetherabilityBand = base.tetherabilityBand;
  out.tags = base.tags;
  out.confidence = confidence;
  out.threat = threat;
  out.hostile = hostile;
  out.attachmentId = undefined;
  out.sourceSocketId = undefined;
  out.targetSocketId = undefined;
  return out;
}

const CONTACTS = 18; // quiet near-disc contacts per observer
const OBSERVERS = 6; // production AI members refreshing sensors
const ITERS = 2500;
const RUNS = 11;
const bases = Array.from({ length: CONTACTS }, (_, i) => makeBase(1000 + i));

function observeAssign(memoryByKey, contacts, tick) {
  // Mirrors PerceptionMemory.observe durable-record update (Object.assign / first spread).
  for (let i = 0; i < contacts.length; i++) {
    const contact = contacts[i];
    const key = `${contact.kind}|${contact.id}`;
    let record = memoryByKey.get(key);
    if (!record) {
      record = { ...contact, firstSeenTick: tick };
      memoryByKey.set(key, record);
    } else {
      Object.assign(record, contact);
    }
    record.lastSeenTick = tick;
  }
  return memoryByKey.size;
}

function beforeOnce(tick) {
  const memories = Array.from({ length: OBSERVERS }, () => new Map());
  let n = 0;
  for (let o = 0; o < OBSERVERS; o++) {
    const out = [];
    for (let i = 0; i < CONTACTS; i++) {
      const base = bases[i];
      const hostile = (i & 1) === 0;
      out.push({
        ...base,
        confidence: 1 - i / (CONTACTS + 1),
        threat: hostile ? 0.7 : 0.2,
        hostile,
      });
    }
    n += observeAssign(memories[o], out, tick);
  }
  return n;
}

function afterOnce(tick, slotsByObserver) {
  const memories = Array.from({ length: OBSERVERS }, () => new Map());
  let n = 0;
  for (let o = 0; o < OBSERVERS; o++) {
    const out = [];
    const slots = slotsByObserver[o];
    for (let i = 0; i < CONTACTS; i++) {
      const base = bases[i];
      const hostile = (i & 1) === 0;
      const rec = fillSensorContact(
        slots[i],
        base,
        1 - i / (CONTACTS + 1),
        hostile ? 0.7 : 0.2,
        hostile,
      );
      out.push(rec);
    }
    n += observeAssign(memories[o], out, tick);
  }
  return n;
}

function bench(label, fn) {
  fn(0);
  const times = [];
  let last = 0;
  for (let r = 0; r < RUNS; r++) {
    const t0 = performance.now();
    for (let i = 0; i < ITERS; i++) last = fn(i + 1);
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  return {
    label,
    median_ms: +times[(times.length - 1) >> 1].toFixed(3),
    min_ms: +times[0].toFixed(3),
    max_ms: +times[times.length - 1].toFixed(3),
    times: times.map((t) => +t.toFixed(2)),
    last,
  };
}

const slotsByObserver = Array.from({ length: OBSERVERS }, () =>
  Array.from({ length: CONTACTS }, () => makeEmptyContact()));

const before = bench('before_spread_alloc', (tick) => beforeOnce(tick));
const after = bench('after_scratch_fill', (tick) => afterOnce(tick, slotsByObserver));
const speedups = before.times.map((t, i) => t / after.times[i]);
speedups.sort((a, b) => a - b);
const medSpeedup = before.median_ms / after.median_ms;
const result = {
  label: 'sensor-contact-scratch-fill',
  CONTACTS,
  OBSERVERS,
  ITERS,
  RUNS,
  before,
  after,
  medSpeedup: +medSpeedup.toFixed(3),
  minSpeedup: +speedups[0].toFixed(3),
  maxSpeedup: +speedups[speedups.length - 1].toFixed(3),
  ship_bar: 1.5,
  clears_bar: medSpeedup >= 1.5 && speedups[0] >= 1.35,
  primary: `~${medSpeedup.toFixed(2)}×`,
};
console.log(JSON.stringify(result, null, 2));
writeFileSync(
  new URL('./sensor-contact-scratch-fill-microbench.json', import.meta.url),
  JSON.stringify(result, null, 2),
);
