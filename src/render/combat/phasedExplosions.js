function schedule(duration, events) {
  return Object.freeze({ duration, events: Object.freeze(events.map((event) => Object.freeze(event))) });
}

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

// Explosion layout needs authored irregularity, but Math.random() made the same destruction receipt
// produce a different silhouette in every capture and could occasionally collapse all lobes into a
// soft disc. This integer mixer gives each resident event a repeatable, allocation-free pattern.
// It is presentation-only and deliberately does not consume simulation RNG.
const PHASE_SALTS = Object.freeze({
  ignition: 0x11f03a75,
  internal: 0x43a6972d,
  'internal-secondary': 0x7ed16f4b,
  breakup: 0xa51c93e7,
  rupture: 0xc31d84af,
  debris: 0xe8075b91,
  pressure: 0x253ab58d,
  residue: 0x6d2b79f5,
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

export class PhasedExplosionLifecycle {
  constructor(options = {}) {
    this.capacity = Math.max(1, options.capacity || 24);
    this.activeCount = 0;
    this._serial = 0;
    this.entries = Array.from({ length: this.capacity }, (_, slot) => ({
      slot,
      active: false,
      serial: -1,
      classId: 'small',
      age: 0,
      phaseIndex: 0,
      x: 0,
      z: 0,
      radius: 3,
      dirX: 1,
      dirZ: 0,
      sourceType: null,
    }));
  }

  start(input = {}) {
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
        if (this.entries[i].serial < entry.serial) entry = this.entries[i];
      }
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
    entry.classId = classId;
    entry.age = 0;
    entry.phaseIndex = 0;
    entry.x = finite(input.x, 0);
    entry.z = finite(input.z, 0);
    entry.radius = Math.max(1, finite(input.radius, 3));
    entry.dirX = dx;
    entry.dirZ = dz;
    entry.sourceType = input.sourceType || null;
    return entry;
  }

  update(dt, emit) {
    const step = Math.max(0, finite(dt, 0));
    for (let entryIndex = 0; entryIndex < this.entries.length; entryIndex++) {
      const entry = this.entries[entryIndex];
      if (!entry.active) continue;
      entry.age += step;
      const scheduleDef = EXPLOSION_SCHEDULES[entry.classId];
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
    entry.phaseIndex = 0;
    this.activeCount = Math.max(0, this.activeCount - 1);
  }
}
