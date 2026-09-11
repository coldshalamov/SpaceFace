// PQ-158.05 — space and mix. Convolver reverb per environment class, weight-first ducking,
// and audio captions for visual events. Pure params + small runtime factory. One convolver
// node per environment class; audio is presentation.

import { dbToGain, PRIORITY_DUCK_THRESHOLD } from './cuePriorityBus.js';

export const ENVIRONMENT_MIX_SEED = 15805;

export const ENVIRONMENT_CLASSES = Object.freeze(['void', 'hangar', 'station']);

/** Live juice/adapters emit this; a `presentation:vfx` listener never hears the player route. */
export const VISUAL_EVENT_BUS = 'presentation:vfxCue';

// IR / convolver params. Hangar is a bright short room; void is almost dry; station is a
// longer metallic volume. Mix and decay are the blind-listen difference.
export const ENVIRONMENT_IR = Object.freeze({
  void: Object.freeze({
    id: 'void',
    delayS: 0.012,
    decayS: 0.14,
    mix: 0.05,
    brightness: 0.32,
    earlyMs: 6,
    irSeconds: 0.22,
    label: 'void',
  }),
  hangar: Object.freeze({
    id: 'hangar',
    delayS: 0.038,
    decayS: 0.92,
    mix: 0.42,
    brightness: 0.78,
    earlyMs: 18,
    irSeconds: 1.15,
    label: 'hangar',
  }),
  station: Object.freeze({
    id: 'station',
    delayS: 0.085,
    decayS: 1.55,
    mix: 0.28,
    brightness: 0.48,
    earlyMs: 36,
    irSeconds: 1.8,
    label: 'station',
  }),
});

export const WEIGHT_DUCK_TARGETS = Object.freeze(['music', 'ambient']);
export const WEIGHT_DUCK_UNAFFECTED = Object.freeze(['critical', 'comms', 'ui', 'sfx']);

function clamp(v, lo, hi) {
  const n = Number(v);
  if (!Number.isFinite(n)) return lo;
  return n < lo ? lo : n > hi ? hi : n;
}

export function resolveEnvironmentClass(input = {}) {
  if (input.class && ENVIRONMENT_IR[input.class]) return input.class;
  if (input.hangar || input.screen === 'shipworks' || input.berth) return 'hangar';
  if (input.docked || input.station || input.screen === 'station') return 'station';
  if (input.inMine || input.screen === 'drill') return 'void';
  return 'void';
}

export function environmentIr(classId) {
  return ENVIRONMENT_IR[classId] || ENVIRONMENT_IR.void;
}

/** Hangar vs void in player units: wet-mix dB and decay seconds on seed 15805. */
export function hangarVersusVoidDifference() {
  const voidIr = ENVIRONMENT_IR.void;
  const hangarIr = ENVIRONMENT_IR.hangar;
  const wetDb = 20 * Math.log10(hangarIr.mix / Math.max(1e-6, voidIr.mix));
  return Object.freeze({
    seed: ENVIRONMENT_MIX_SEED,
    voidMix: voidIr.mix,
    hangarMix: hangarIr.mix,
    voidDecayS: voidIr.decayS,
    hangarDecayS: hangarIr.decayS,
    wetDb: Math.round(wetDb * 10) / 10,
  });
}

/**
 * Deterministic impulse response. Seeded from the class id so hangar/void/station stay
 * byte-stable without shipping IR wavs.
 */
export function renderEnvironmentIr(classId, sampleRate = 48000) {
  const cfg = environmentIr(classId);
  const rate = Math.max(8000, sampleRate | 0);
  const n = Math.max(32, Math.round(cfg.irSeconds * rate));
  const data = new Float32Array(n);
  let h = 0x811c9dc5 ^ (classId ? classId.charCodeAt(0) : 0);
  for (let i = 0; i < String(classId || 'void').length; i++) {
    h = Math.imul(h ^ String(classId).charCodeAt(i), 0x01000193) >>> 0;
  }
  const rand = () => {
    h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const decayN = Math.max(1, cfg.decayS * rate);
  const delayN = Math.round(cfg.delayS * rate);
  const earlyN = Math.round((cfg.earlyMs / 1000) * rate);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    let s = 0;
    if (i === delayN) s += 0.9;
    if (i > 0 && i < earlyN) s += (rand() * 2 - 1) * 0.35 * (1 - i / earlyN);
    const noise = (rand() * 2 - 1) * Math.exp(-i / decayN);
    const bright = cfg.brightness;
    const high = i + 1 < n ? noise : 0;
    s += noise * (0.45 + bright * 0.55);
    if (i > 2) s += (high - noise) * bright * 0.15;
    s *= Math.exp(-t / Math.max(0.04, cfg.decayS));
    data[i] = s;
  }
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(data[i]));
  const norm = peak > 1e-9 ? 0.9 / peak : 0;
  for (let i = 0; i < n; i++) data[i] *= norm;
  return { sampleRate: rate, seconds: n / rate, pcm: data, mix: cfg.mix, classId: cfg.id };
}

/**
 * Weight-first duck in dB. Mass and closing speed, not speech priority. Music ducks under
 * weight; critical / comms / UI do not.
 */
export function weightDuckDb(input = {}) {
  const mass = Number.isFinite(input.mass) ? input.mass : 16;
  const dp = Number.isFinite(input.dp) ? input.dp : (Number.isFinite(input.impulse) ? input.impulse : 0);
  const importance = clamp(input.importance, 0, 1);
  const massNorm = clamp((Math.log2(Math.max(1, mass)) - 4) / 4, 0, 1);
  const dpNorm = clamp(Math.sqrt(Math.max(0, dp) / 24000), 0, 1);
  const weight = Math.max(massNorm, dpNorm, importance);
  return Math.round((-3 - 15 * weight) * 100) / 100;
}

export function isWeightDuckTarget(target) {
  if (!target) return false;
  if (typeof target === 'string') {
    const key = target.replace(/[_\-\s]/g, '').toLowerCase();
    return key === 'music' || key === 'ambient';
  }
  if (target.critical) return false;
  const role = String(target.role || target.busName || target.bus || target.category || '').toLowerCase();
  return role === 'music' || role === 'ambient';
}

export function weightDuckEnvelope(input = {}, nowMs = 0) {
  const duckDb = weightDuckDb(input);
  const durationMs = Math.max(80, Number.isFinite(input.durationMs) ? input.durationMs : 280 + Math.abs(duckDb) * 18);
  const startMs = Math.max(0, Number(nowMs) || 0);
  return Object.freeze({
    schema: 'spaceface.weightDuckEnvelope.v1',
    seed: ENVIRONMENT_MIX_SEED,
    duckDb,
    duckGain: Math.round(dbToGain(duckDb) * 10000) / 10000,
    startMs,
    endMs: startMs + durationMs,
    durationMs,
    targets: WEIGHT_DUCK_TARGETS,
    mass: Number.isFinite(input.mass) ? input.mass : null,
    dp: Number.isFinite(input.dp) ? input.dp : null,
  });
}

export function weightDuckGainForTarget(target, envelope, nowMs = 0) {
  if (!envelope || (Number(nowMs) || 0) < envelope.startMs || (Number(nowMs) || 0) >= envelope.endMs) return 1;
  return isWeightDuckTarget(target) ? envelope.duckGain : 1;
}

/** Named-seed duck table: scout-on-rock vs freighter-on-station. */
export function weightDuckTable() {
  const scout = { mass: 16, dp: 40, importance: 0.2 };
  const freighter = { mass: 200, dp: 24000, importance: 0.9 };
  return Object.freeze({
    seed: ENVIRONMENT_MIX_SEED,
    scoutOnRockDb: weightDuckDb(scout),
    freighterOnStationDb: weightDuckDb(freighter),
    targets: WEIGHT_DUCK_TARGETS,
    spared: WEIGHT_DUCK_UNAFFECTED,
  });
}

export function visualEventAudioAllowed(settings) {
  if (settings == null) return true;
  if (typeof settings === 'boolean') return settings;
  const ac = settings.accessibility || settings;
  return ac.audioCues !== false;
}

export const VISUAL_EVENT_CUES = Object.freeze({
  'vfx.muzzle': Object.freeze({ recipeId: 'sfx_wpn_pulse_laser', caption: 'Weapon fire.', importance: 0.45 }),
  'vfx.explosion': Object.freeze({ recipeId: 'sfx_explosion_small', caption: 'Explosion.', importance: 0.88 }),
  'vfx.shieldHit': Object.freeze({ recipeId: 'sfx.shieldHit', caption: 'Shield hit.', importance: 0.7 }),
  'vfx.shieldBreak': Object.freeze({ recipeId: 'sfx.shieldBreak', caption: 'Shields down.', importance: 0.94 }),
  'vfx.hullHit': Object.freeze({ recipeId: 'sfx.hullHit', caption: 'Hull hit.', importance: 0.8 }),
  'vfx.dock': Object.freeze({ recipeId: 'sfx_dock_clunk', caption: 'Docking clamp.', importance: 0.6 }),
  'vfx.boost': Object.freeze({ recipeId: 'sfx_boost_whoosh', caption: 'Boost.', importance: 0.5 }),
  'vfx.wanted': Object.freeze({ recipeId: 'sfx_wanted_alert', caption: 'Wanted.', importance: 0.9 }),
  'vfx.kill': Object.freeze({ recipeId: 'sfx.killConfirmed', caption: 'Kill confirmed.', importance: 0.82 }),
  'vfx.scan': Object.freeze({ recipeId: 'sfx_scan_pulse', caption: 'Scan pulse.', importance: 0.4 }),
});

/** Live juice ids that had no dedicated audio:cue recipe (they used to collapse to a UI click). */
export const LIVE_VFX_ALIASES = Object.freeze({
  'combat.damage.shield': 'vfx.shieldHit',
  'combat.damage.hull': 'vfx.hullHit',
  'combat.damage.armor': 'vfx.hullHit',
  'combat.damage.kill': 'vfx.kill',
  'combat.damage.charge': 'vfx.explosion',
  'combat.weakPoint': 'vfx.explosion',
});

function visualEventPrefixKey(id) {
  if (id.startsWith('vfx.muzzle')) return 'vfx.muzzle';
  if (id.startsWith('vfx.impact')) return 'vfx.hullHit';
  if (id.startsWith('vfx.explosion')) return 'vfx.explosion';
  if (id.startsWith('vfx.shield')) {
    return (id.includes('break') || id.includes('collapse')) ? 'vfx.shieldBreak' : 'vfx.shieldHit';
  }
  return null;
}

export function resolveVisualEventCue(eventId) {
  const id = String(eventId || '');
  if (!id) return null;
  if (VISUAL_EVENT_CUES[id]) return { eventId: id, ...VISUAL_EVENT_CUES[id] };
  const short = id.startsWith('vfx.') ? id : `vfx.${id}`;
  if (VISUAL_EVENT_CUES[short]) return { eventId: short, ...VISUAL_EVENT_CUES[short] };
  const aliased = LIVE_VFX_ALIASES[id];
  if (aliased && VISUAL_EVENT_CUES[aliased]) {
    return { eventId: aliased, liveId: id, ...VISUAL_EVENT_CUES[aliased] };
  }
  const prefix = visualEventPrefixKey(id);
  if (prefix && VISUAL_EVENT_CUES[prefix]) {
    return { eventId: prefix, liveId: id, ...VISUAL_EVENT_CUES[prefix] };
  }
  return null;
}

export function visualEventCueIsWired(eventId, recipeById) {
  const cue = resolveVisualEventCue(eventId);
  if (!cue) return false;
  if (!recipeById) return true;
  return !!recipeById[cue.recipeId];
}

/**
 * Build one convolver node per environment class, tapped from a send. The caller owns the
 * AudioContext. Switching class fades the three output gains; it does not rebuild the graph.
 */
export function createEnvironmentMixRuntime(ctx, destination, options = {}) {
  if (!ctx || !destination) throw new TypeError('environment mix requires AudioContext and destination');
  const sampleRate = Number.isFinite(ctx.sampleRate) ? ctx.sampleRate : 48000;
  const send = ctx.createGain();
  send.gain.value = 1;
  const classes = {};
  for (const classId of ENVIRONMENT_CLASSES) {
    const cfg = ENVIRONMENT_IR[classId];
    const conv = typeof ctx.createConvolver === 'function' ? ctx.createConvolver() : null;
    const out = ctx.createGain();
    out.gain.value = 0.0001;
    if (conv && typeof ctx.createBuffer === 'function') {
      const ir = renderEnvironmentIr(classId, sampleRate);
      const buffer = ctx.createBuffer(1, ir.pcm.length, ir.sampleRate);
      const ch = buffer.getChannelData(0);
      ch.set(ir.pcm);
      conv.normalize = true;
      conv.buffer = buffer;
      send.connect(conv);
      conv.connect(out);
    } else {
      // Headless / test graphs without a convolver still get the wet send so mix can be asserted.
      const delay = typeof ctx.createDelay === 'function' ? ctx.createDelay(1.0) : null;
      if (delay) {
        delay.delayTime.value = cfg.delayS;
        send.connect(delay);
        delay.connect(out);
      } else {
        send.connect(out);
      }
    }
    out.connect(destination);
    classes[classId] = { out, mix: cfg.mix, convolver: conv };
  }
  let current = options.classId || 'void';
  const apply = (classId, instant) => {
    const next = ENVIRONMENT_IR[classId] ? classId : 'void';
    current = next;
    const now = ctx.currentTime || 0;
    for (const id of ENVIRONMENT_CLASSES) {
      const node = classes[id];
      const target = id === next ? Math.max(0.0001, node.mix) : 0.0001;
      try {
        if (instant || !node.out.gain.setTargetAtTime) {
          node.out.gain.setValueAtTime(target, now);
        } else {
          node.out.gain.setTargetAtTime(target, now, 0.08);
        }
      } catch (_) {
        try { node.out.gain.value = target; } catch (__) {}
      }
    }
    return next;
  };
  apply(current, true);
  return {
    send,
    classes,
    get classId() { return current; },
    setClass(classId, instant) { return apply(classId, instant); },
    mixFor(classId) { return environmentIr(classId).mix; },
    destroy() {
      try { send.disconnect(); } catch (_) {}
      for (const id of ENVIRONMENT_CLASSES) {
        try { classes[id].out.disconnect(); } catch (_) {}
      }
    },
  };
}

export { PRIORITY_DUCK_THRESHOLD };
