import {
  DEFAULT_VFX_ADMISSION_PRIORITY,
  normalizeVfxAdmissionPriority,
} from '../../presentation/vfxAdmissionPriority.js';

function schedule(duration, events) {
  return Object.freeze({ duration, events: Object.freeze(events.map((event) => Object.freeze(event))) });
}

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

const EXPLOSION_CAUSES = new Set([
  'generic',
  'kinetic',
  'explosive',
  'terrain_collision',
  'ship_collision',
]);

export const EXPLOSION_STYLE_IDS = Object.freeze([
  'ordinary',
  'terrain_smash',
  'chain',
  'well_collapse',
  'burn_up',
]);

const EXPLOSION_STYLES = new Set(EXPLOSION_STYLE_IDS);

function normalizeExplosionCause(value) {
  return EXPLOSION_CAUSES.has(value) ? value : 'generic';
}

export function normalizeExplosionStyle(value) {
  return EXPLOSION_STYLES.has(value) ? value : 'ordinary';
}

/** Chain depth only scales radiance/density. Missing or junk values carry no extra weight. */
export function normalizeExplosionChainDepth(value) {
  const depth = Math.trunc(Number(value));
  return Number.isFinite(depth) && depth > 0 ? Math.min(4, depth) : 0;
}

// Explosion layout needs authored irregularity, but Math.random() made the same destruction receipt
// produce a different silhouette in every capture and could occasionally collapse all lobes into a
// soft disc. This integer mixer gives each resident event a repeatable, allocation-free pattern.
// It is presentation-only and deliberately does not consume simulation RNG.
const PHASE_SALTS = Object.freeze({
  ignition: 0x11f03a75,
  'kinetic-tear': 0x2c716b09,
  'contact-compression': 0x35dc20e1,
  'terrain-spall': 0x4a72d3c5,
  'collision-shear': 0x582e91af,
  internal: 0x43a6972d,
  'internal-secondary': 0x7ed16f4b,
  breakup: 0xa51c93e7,
  rupture: 0xc31d84af,
  debris: 0xe8075b91,
  pressure: 0x253ab58d,
  residue: 0x6d2b79f5,
  'well-implode': 0x91c40b63,
  'burn-shroud': 0xb8a32e47,
});

function mix32(value) {
  let x = value >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

export function explosionPattern01(serial, phase, index = 0, channel = 0) {
  const stableSerial = Number.isFinite(serial) ? serial | 0 : 0;
  const phaseSalt = PHASE_SALTS[phase] || 0x9e3779b9;
  const seed = phaseSalt
    ^ Math.imul(stableSerial + 1, 0x85ebca6b)
    ^ Math.imul((index | 0) + 1, 0xc2b2ae35)
    ^ Math.imul((channel | 0) + 1, 0x27d4eb2f);
  return mix32(seed) / 4294967296;
}

export function explosionPatternSigned(serial, phase, index = 0, channel = 0) {
  return explosionPattern01(serial, phase, index, channel) * 2 - 1;
}

export const EXPLOSION_SCHEDULES = Object.freeze({
  small: schedule(0.82, [
    { phase: 'ignition', at: 0 },
    { phase: 'rupture', at: 0.045 },
    { phase: 'debris', at: 0.10 },
    { phase: 'pressure', at: 0.16 },
    { phase: 'residue', at: 0.24 },
  ]),
  ordinary: schedule(1.42, [
    { phase: 'ignition', at: 0 },
    { phase: 'internal', at: 0.085 },
    { phase: 'rupture', at: 0.16 },
    { phase: 'debris', at: 0.23 },
    { phase: 'pressure', at: 0.28 },
    { phase: 'residue', at: 0.40 },
  ]),
  capital: schedule(3.4, [
    { phase: 'ignition', at: 0 },
    { phase: 'internal', at: 0.16 },
    { phase: 'internal-secondary', at: 0.38 },
    { phase: 'breakup', at: 0.54 },
    { phase: 'rupture', at: 0.64 },
    { phase: 'debris', at: 0.71 },
    { phase: 'pressure', at: 0.82 },
    { phase: 'residue', at: 1.02 },
  ]),
});

// Cause schedules are presentation grammar, not damage timing. Generic receipts retain the exact
// accepted class schedules above; immutable non-generic receipts select a distinct causal cadence.
// The exported set is the ordinary-class reference used by checks and art review.
export const EXPLOSION_CAUSE_SCHEDULES = Object.freeze({
  generic: EXPLOSION_SCHEDULES.ordinary,
  kinetic: schedule(0.72, [
    { phase: 'ignition', at: 0 },
    { phase: 'kinetic-tear', at: 0.035 },
    { phase: 'rupture', at: 0.07 },
    { phase: 'debris', at: 0.105 },
    { phase: 'residue', at: 0.22 },
  ]),
  explosive: schedule(1.18, [
    { phase: 'ignition', at: 0 },
    { phase: 'internal', at: 0.06 },
    { phase: 'internal-secondary', at: 0.14 },
    { phase: 'rupture', at: 0.22 },
    { phase: 'debris', at: 0.28 },
    { phase: 'pressure', at: 0.36 },
    { phase: 'residue', at: 0.52 },
  ]),
  terrain_collision: schedule(1.24, [
    { phase: 'contact-compression', at: 0 },
    { phase: 'terrain-spall', at: 0.04 },
    { phase: 'rupture', at: 0.11 },
    { phase: 'internal', at: 0.24 },
    { phase: 'debris', at: 0.30 },
    { phase: 'residue', at: 0.55 },
  ]),
  ship_collision: schedule(1.06, [
    { phase: 'collision-shear', at: 0 },
    { phase: 'ignition', at: 0.04 },
    { phase: 'rupture', at: 0.11 },
    { phase: 'debris', at: 0.18 },
    { phase: 'pressure', at: 0.25 },
    { phase: 'residue', at: 0.42 },
  ]),
});

// AC-09 style cadence is independent of the legacy weapon/contact cause schedule. Ordinary
// keeps the accepted class/cause recipe; the other four identities get their own motion beats.
// Size still stacks through the same small/ordinary/capital time scale.
export const EXPLOSION_STYLE_SCHEDULES = Object.freeze({
  ordinary: EXPLOSION_SCHEDULES.ordinary,
  terrain_smash: schedule(1.36, [
    { phase: 'contact-compression', at: 0 },
    { phase: 'terrain-spall', at: 0.045 },
    { phase: 'internal', at: 0.16 },
    { phase: 'rupture', at: 0.24 },
    { phase: 'debris', at: 0.32 },
    { phase: 'residue', at: 0.58 },
  ]),
  chain: schedule(0.88, [
    { phase: 'ignition', at: 0 },
    { phase: 'collision-shear', at: 0.05 },
    { phase: 'debris', at: 0.14 },
    { phase: 'residue', at: 0.32 },
  ]),
  well_collapse: schedule(1.28, [
    { phase: 'well-implode', at: 0 },
    { phase: 'internal', at: 0.14 },
    { phase: 'rupture', at: 0.30 },
    { phase: 'debris', at: 0.38 },
    { phase: 'residue', at: 0.56 },
  ]),
  burn_up: schedule(1.72, [
    { phase: 'burn-shroud', at: 0 },
    { phase: 'internal', at: 0.22 },
    { phase: 'debris', at: 0.48 },
    { phase: 'residue', at: 0.82 },
  ]),
});

const CAUSE_CLASS_TIME_SCALE = Object.freeze({ small: 0.78, ordinary: 1, capital: 1.65 });

function scaledCauseSchedule(base, classId) {
  if (classId === 'ordinary') return base;
  const scaleValue = CAUSE_CLASS_TIME_SCALE[classId];
  const events = [];
  let insertedBreakup = false;
  for (const event of base.events) {
    if (classId === 'capital' && !insertedBreakup && event.phase === 'rupture') {
      const previousAt = events.length ? events[events.length - 1].at : 0;
      const ruptureAt = event.at * scaleValue;
      events.push({ phase: 'breakup', at: previousAt + (ruptureAt - previousAt) * 0.55 });
      insertedBreakup = true;
    }
    events.push({ phase: event.phase, at: event.at * scaleValue });
  }
  return schedule(base.duration * scaleValue, events);
}

const EXPLOSION_CAUSE_CLASS_SCHEDULES = Object.freeze(Object.fromEntries(
  Object.entries(EXPLOSION_CAUSE_SCHEDULES).map(([cause, base]) => [cause, Object.freeze({
    small: cause === 'generic' ? EXPLOSION_SCHEDULES.small : scaledCauseSchedule(base, 'small'),
    ordinary: cause === 'generic' ? EXPLOSION_SCHEDULES.ordinary : base,
    capital: cause === 'generic' ? EXPLOSION_SCHEDULES.capital : scaledCauseSchedule(base, 'capital'),
  })]),
));

const EXPLOSION_STYLE_CLASS_SCHEDULES = Object.freeze(Object.fromEntries(
  EXPLOSION_STYLE_IDS.filter((styleId) => styleId !== 'ordinary').map((styleId) => {
    const base = EXPLOSION_STYLE_SCHEDULES[styleId];
    return [styleId, Object.freeze({
      small: scaledCauseSchedule(base, 'small'),
      ordinary: base,
      capital: scaledCauseSchedule(base, 'capital'),
    })];
  }),
));

export function explosionScheduleFor(classId, cause = 'generic', style = 'ordinary') {
  const safeClass = EXPLOSION_SCHEDULES[classId] ? classId : 'small';
  const safeStyle = normalizeExplosionStyle(style);
  if (safeStyle !== 'ordinary') return EXPLOSION_STYLE_CLASS_SCHEDULES[safeStyle][safeClass];
  const safeCause = normalizeExplosionCause(cause);
  return EXPLOSION_CAUSE_CLASS_SCHEDULES[safeCause][safeClass];
}

export class PhasedExplosionLifecycle {
  constructor(options = {}) {
    this.capacity = Math.max(1, options.capacity || 24);
    this.activeCount = 0;
    this._serial = 0;
    this.entries = Array.from({ length: this.capacity }, (_, slot) => ({
      slot,
      active: false,
      serial: -1,
      admissionSerial: -1,
      priority: DEFAULT_VFX_ADMISSION_PRIORITY,
      classId: 'small',
      age: 0,
      phaseIndex: 0,
      x: 0,
      z: 0,
      radius: 3,
      dirX: 1,
      dirZ: 0,
      cause: 'generic',
      styleId: 'ordinary',
      chainDepth: 0,
      hasNormal: false,
      normalX: 0,
      normalZ: 0,
      targetVelocityX: 0,
      targetVelocityZ: 0,
      sourceType: null,
    }));
  }

  start(input = {}) {
    const priority = normalizeVfxAdmissionPriority(
      input.admissionPriority ?? input.priority,
      DEFAULT_VFX_ADMISSION_PRIORITY,
    );
    let entry = null;
    for (let i = 0; i < this.entries.length; i++) {
      if (!this.entries[i].active) {
        entry = this.entries[i];
        break;
      }
    }
    if (!entry) {
      entry = this.entries[0];
      for (let i = 1; i < this.entries.length; i++) {
        const candidate = this.entries[i];
        if (candidate.priority < entry.priority
          || (candidate.priority === entry.priority
            && candidate.admissionSerial < entry.admissionSerial)) entry = candidate;
      }
      if (priority < entry.priority) return null;
    } else {
      this.activeCount++;
    }
    const classId = EXPLOSION_SCHEDULES[input.classId] ? input.classId : 'small';
    const direction = input.direction || null;
    let dx = finite(direction && direction.x, 0);
    let dz = finite(direction && direction.z, 0);
    const length = Math.hypot(dx, dz);
    if (length > 1e-8) {
      dx /= length;
      dz /= length;
    } else {
      dx = 1;
      dz = 0;
    }
    entry.active = true;
    entry.serial = this._serial++;
    entry.admissionSerial = entry.serial;
    entry.priority = priority;
    entry.classId = classId;
    entry.age = 0;
    entry.phaseIndex = 0;
    entry.x = finite(input.x, 0);
    entry.z = finite(input.z, 0);
    entry.radius = Math.max(1, finite(input.radius, 3));
    entry.dirX = dx;
    entry.dirZ = dz;
    entry.cause = normalizeExplosionCause(input.cause);
    entry.styleId = normalizeExplosionStyle(input.styleId ?? input.style);
    entry.chainDepth = entry.styleId === 'chain' ? normalizeExplosionChainDepth(input.chainDepth) : 0;
    const normal = input.normal || null;
    let nx = finite(normal && normal.x, 0);
    let nz = finite(normal && normal.z, 0);
    const normalLength = Math.hypot(nx, nz);
    entry.hasNormal = normalLength > 1e-8;
    if (entry.hasNormal) {
      nx /= normalLength;
      nz /= normalLength;
    } else {
      nx = 0;
      nz = 0;
    }
    entry.normalX = nx;
    entry.normalZ = nz;
    const targetVelocity = input.targetVelocity || null;
    entry.targetVelocityX = finite(targetVelocity && targetVelocity.x, 0);
    entry.targetVelocityZ = finite(targetVelocity && targetVelocity.z, 0);
    entry.sourceType = input.sourceType || null;
    return entry;
  }

  update(dt, emit) {
    const step = Math.max(0, finite(dt, 0));
    for (let entryIndex = 0; entryIndex < this.entries.length; entryIndex++) {
      const entry = this.entries[entryIndex];
      if (!entry.active) continue;
      entry.age += step;
      const scheduleDef = explosionScheduleFor(entry.classId, entry.cause, entry.styleId);
      while (entry.phaseIndex < scheduleDef.events.length) {
        const event = scheduleDef.events[entry.phaseIndex];
        if (event.at > entry.age) break;
        emit(event.phase, entry, entry.phaseIndex);
        entry.phaseIndex++;
      }
      if (entry.age >= scheduleDef.duration) this._release(entry);
    }
    return this.activeCount;
  }

  clear() {
    for (const entry of this.entries) if (entry.active) this._release(entry);
  }

  _release(entry) {
    if (!entry.active) return;
    entry.active = false;
    entry.serial = -1;
    entry.admissionSerial = -1;
    entry.priority = DEFAULT_VFX_ADMISSION_PRIORITY;
    entry.phaseIndex = 0;
    entry.age = 0;
    entry.dirX = 1;
    entry.dirZ = 0;
    entry.cause = 'generic';
    entry.styleId = 'ordinary';
    entry.chainDepth = 0;
    entry.hasNormal = false;
    entry.normalX = 0;
    entry.normalZ = 0;
    entry.targetVelocityX = 0;
    entry.targetVelocityZ = 0;
    entry.sourceType = null;
    this.activeCount = Math.max(0, this.activeCount - 1);
  }
}
