// Worldfeel — three emitted events that had a writer and no ear, pad, or voice.
// Subscribe-only. Emitters stay where they are. Admission uses sim tick, never the wall clock.
// `flight:sweptHull` reuses one payload object; copy it before the handler returns.

const ADMIT_TICKS = Object.freeze({
  'mining:beamLocked': 90,
  'flight:sweptHull': 40,
  'cargo:volatileExposed': 8,
});

const VOLATILE_STAGES = Object.freeze({
  warming: Object.freeze({
    recipeId: 'sfx_mining_fracture_warning',
    caption: 'Volatile cargo warming.',
    gain: 0.4,
    assertive: false,
    sev: 'info',
    text: 'VOLATILE WARMING',
    ttl: 1.6,
    haptic: Object.freeze({ strong: 0.2, weak: 0.25, ms: 60 }),
  }),
  critical: Object.freeze({
    recipeId: 'sfx_mining_fracture_break',
    caption: 'Volatile cargo critical.',
    gain: 0.62,
    assertive: true,
    sev: 'warn',
    text: 'VOLATILE CRITICAL',
    ttl: 2.2,
    haptic: Object.freeze({ strong: 0.55, weak: 0.45, ms: 110 }),
  }),
  venting: Object.freeze({
    recipeId: 'sfx_explosion_small',
    caption: 'Volatile cargo venting.',
    gain: 0.78,
    assertive: true,
    sev: 'danger',
    text: 'VOLATILE VENTING',
    ttl: 2.8,
    haptic: Object.freeze({ strong: 0.85, weak: 0.7, ms: 160 }),
  }),
});

export const WORLD_FEEL_SEAM_IDS = Object.freeze([
  'mining:beamLocked',
  'flight:sweptHull',
  'cargo:volatileExposed',
]);

export function worldFeelTick(state) {
  if (!state) return NaN;
  if (Number.isFinite(state.tick)) return state.tick;
  if (Number.isFinite(state.simTime)) return Math.floor(state.simTime * 60);
  return NaN;
}

/** Synchronous copy. The flight advisory object is retained across emits. */
export function copySweptHullFeel(payload) {
  if (!payload) return null;
  const point = payload.contactPoint;
  return {
    shipId: payload.shipId,
    active: payload.active,
    sliding: payload.sliding === true,
    contactId: payload.contactId,
    contactType: payload.contactType,
    contactRadius: payload.contactRadius,
    contactDistance: payload.contactDistance,
    timeToContactS: payload.timeToContactS,
    contactPoint: point && Number.isFinite(point.x) && Number.isFinite(point.z)
      ? { x: point.x, z: point.z }
      : null,
  };
}

function sweptHullNear(payload) {
  if (!payload || payload.active === false) return false;
  // A predictive sweep can be hundreds of metres ahead at travel speed. It is
  // telemetry, not contact. `sliding` means lateral flight, so it also needs an
  // actual small surface gap; a sideways approach across the map stays silent.
  return payload.sliding === true && Number.isFinite(payload.contactDistance)
    && payload.contactDistance >= 0 && payload.contactDistance <= 3;
}

export function createWorldFeelBook(bus) {
  const book = Object.create(null);
  const reset = () => { for (const key of Object.keys(book)) delete book[key]; };
  for (const event of ['game:newGame', 'save:loaded', 'sector:enter']) bus?.on?.(event, reset);
  return book;
}

/** Tactile and danger feedback belongs to the pilot's surroundings, not every
 * volatile container simulated anywhere in the sector. */
export function worldFeelRelevant(state, eventName, payload) {
  if (eventName === 'flight:sweptHull') return payload?.shipId === state?.playerId;
  if (eventName !== 'cargo:volatileExposed') return true;
  const pod = state?.entities?.get?.(payload?.podId);
  const pilot = state?.entities?.get?.(state.playerId);
  if (!pod?.pos || pod.alive === false || !pilot?.pos) return false;
  if (state.player?.tether?.active && state.player.tether.targetId === pod.id) return true;
  return Math.hypot(pod.pos.x - pilot.pos.x, pod.pos.z - pilot.pos.z) <= 240;
}

function admitKey(eventName, payload) {
  if (eventName === 'mining:beamLocked') return `beam:${payload && payload.asteroidId}`;
  if (eventName === 'flight:sweptHull') {
    return `sweep:${payload && payload.shipId}:${payload && payload.contactId}`;
  }
  return `volatile:${payload && payload.podId}:${payload && payload.stage}`;
}

export function admitWorldFeelSeam(book, eventName, payload, tick) {
  if (!WORLD_FEEL_SEAM_IDS.includes(eventName)) return false;
  if (!Number.isFinite(tick)) return false;
  if (book) {
    // Also handle direct restoration and test hosts without a boundary bus.
    if (Number.isFinite(book._tick) && tick < book._tick) {
      for (const key of Object.keys(book)) delete book[key];
    }
    book._tick = tick;
  }
  if (eventName === 'mining:beamLocked' && (!payload || payload.asteroidId == null)) return false;
  if (eventName === 'flight:sweptHull' && !sweptHullNear(payload)) return false;
  if (eventName === 'cargo:volatileExposed') {
    const stage = payload && payload.stage;
    if (stage !== 'warming' && stage !== 'critical' && stage !== 'venting') return false;
  }
  const key = admitKey(eventName, payload);
  const last = book && book[key];
  const gap = ADMIT_TICKS[eventName];
  if (Number.isFinite(last) && tick - last < gap) return false;
  if (book) book[key] = tick;
  if (book && Object.keys(book).length > 256) {
    const oldest = Object.keys(book).find((entry) => entry !== '_tick');
    if (oldest) delete book[oldest];
  }
  return true;
}

export function worldFeelCue(eventName, payload) {
  if (eventName === 'mining:beamLocked') {
    return {
      recipeId: 'sfx_mining_cutter_lock',
      caption: 'Cutter locked. Developed rock — use the port.',
      gain: 0.5,
      assertive: true,
    };
  }
  if (eventName === 'flight:sweptHull') {
    return {
      recipeId: 'sfx_hull_scrape',
      caption: 'Hull grazing a face.',
      gain: 0.42,
      assertive: false,
    };
  }
  if (eventName === 'cargo:volatileExposed') {
    const row = VOLATILE_STAGES[payload && payload.stage];
    if (!row) return null;
    return {
      recipeId: row.recipeId,
      caption: row.caption,
      gain: row.gain,
      assertive: row.assertive,
    };
  }
  return null;
}

export function worldFeelVoice(eventName, payload) {
  if (eventName === 'mining:beamLocked') {
    return { key: 'beam-locked', sev: 'warn', text: 'DEVELOPED ROCK — USE THE PORT', ttl: 2.2 };
  }
  if (eventName === 'flight:sweptHull') {
    return { key: 'swept-hull', sev: 'info', text: 'HULL SKIMMING', ttl: 1.2 };
  }
  if (eventName === 'cargo:volatileExposed') {
    const row = VOLATILE_STAGES[payload && payload.stage];
    if (!row) return null;
    return { key: `volatile-${row.sev}`, sev: row.sev, text: row.text, ttl: row.ttl };
  }
  return null;
}

export function worldFeelHaptic(eventName, payload) {
  if (eventName === 'mining:beamLocked') return { strong: 0.28, weak: 0.18, ms: 50 };
  if (eventName === 'flight:sweptHull') return { strong: 0.22, weak: 0.48, ms: 70 };
  if (eventName === 'cargo:volatileExposed') {
    const row = VOLATILE_STAGES[payload && payload.stage];
    return row ? row.haptic : null;
  }
  return null;
}

function entityPos(state, id) {
  if (id == null || !state || !state.entities || typeof state.entities.get !== 'function') return null;
  const ent = state.entities.get(id);
  const pos = ent && ent.alive !== false && ent.pos;
  if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return null;
  return { x: pos.x, z: pos.z };
}

export function worldFeelPosition(state, eventName, payload) {
  if (!payload) return null;
  if (eventName === 'mining:beamLocked') return entityPos(state, payload.asteroidId);
  if (eventName === 'flight:sweptHull') {
    return entityPos(state, payload.shipId);
  }
  if (eventName === 'cargo:volatileExposed') return entityPos(state, payload.podId);
  return null;
}

export function playWorldFeelSeam(host, book, eventName, payload) {
  if (!worldFeelRelevant(host?.state, eventName, payload)) return null;
  const tick = worldFeelTick(host && host.state);
  if (!admitWorldFeelSeam(book, eventName, payload, tick)) return null;
  const cue = worldFeelCue(eventName, payload);
  if (!cue || typeof host.play !== 'function') return null;
  const position = worldFeelPosition(host.state, eventName, payload);
  const played = host.play(cue.recipeId, { id: cue.recipeId, position, gain: cue.gain });
  if (played && cue.caption && typeof host._emitPresentationCaption === 'function') {
    host._emitPresentationCaption(cue.caption, {
      assertive: cue.assertive === true,
      channel: 'cue',
    });
  }
  return played;
}

export function installWorldFeelSeams(host, bus) {
  if (!bus || typeof bus.on !== 'function') return WORLD_FEEL_SEAM_IDS;
  const book = createWorldFeelBook(bus);
  for (const eventName of WORLD_FEEL_SEAM_IDS) {
    bus.on(eventName, (payload) => {
      const snap = eventName === 'flight:sweptHull' ? copySweptHullFeel(payload) : payload;
      playWorldFeelSeam(host, book, eventName, snap);
    });
  }
  return WORLD_FEEL_SEAM_IDS;
}
