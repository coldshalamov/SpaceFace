// The Lamp Bus: authored data for blinking lamps on Forge bodies (runtime owner: src/render/lampBus.js).
//
// A lamp is LIGHT, not paint. Until now every Forge lamp was a constant emissive; this table gives a
// lamp a rhythm without a single extra draw call, material, texture or per-frame allocation:
//   * ONE shared time uniform (lampBus.js LAMP_UNIFORMS) advances once per frame;
//   * a lamp material carries its channel (period, flash taps, decay) as per-material constants;
//   * the fragment shader multiplies the lamp's emissive radiance by the envelope below.
//
// The envelope is flash-and-decay, never a square wave: a short linear attack to full light, then an
// exponential tail that falls toward a floor. The floor is above zero, so a lamp never goes fully dark
// (a nav light that vanishes reads as a destroyed one, which the damage system already uses as a cue).
// Every channel is held under 3 flashes per second (WCAG 2.3.1) at its nominal rate, and `steady` is the
// constant gain the reduced-flash accessibility setting flattens a channel to.
//
// WHICH LAMPS BLINK is decided here and nowhere else (resolveLampChannel). It is NEVER decided from a base
// finish alone: glow_amber / glow_cyan / glow_warm carry today's lit trims, dock lamps and window rows, and
// keying on them would pulse every trim line. Two explicit rules only:
//   1. Hull nav lamps: Material_Emissive_NavRed / Material_Emissive_NavGreen on a package whose slot is
//      'hull' (Forge exports glow_red / glow_green under those names, on HOOK_NAV_PORT / HOOK_NAV_STARBOARD).
//   2. Opt-in channel finishes: a Forge recipe asks for a rhythm by naming a variant finish, e.g.
//      F.beacon(s, 'Beacon', pos, finish='glow_amber.beacon') with COLORS['glow_amber.beacon'] set. Forge
//      exports it as Material_Emissive_Amber_beacon; the suffix is reserved (see LAMP_RESERVED_SUFFIXES).
//
// Cosmetic only: nothing here reads or writes simulation state, and phase never touches state.rng.

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export const LAMP_BUS_VERSION = 'spaceface-lamp-bus-v1';

// The shared clock wraps here so float32 keeps sub-millisecond resolution over a long session. Every
// channel period divides it exactly, so the wrap is invisible (the cycle fraction never jumps).
export const LAMP_TIME_WRAP_S = 3072;

// Accessibility ceiling: no lamp may flash more than this many times per second.
export const LAMP_MAX_FLASH_HZ = 3;

// Flash-and-decay channels. Fields:
//   period  seconds per cycle           floor   gain between flashes (never 0)
//   steady  gain under reduced-flash    attack  seconds to reach full light
//   tau     exponential decay seconds   tapAt   seconds after the first flash of the optional second tap
//   tapAmp  second tap peak (0 = none)  offset  fraction of a cycle this channel is shifted by
export const LAMP_CHANNELS = deepFreeze({
  // Classic aviation anti-collision rhythm on the hull's own nav lamps: a flash and a weaker echo, then a
  // long dim tail. Port (red) and starboard (green) alternate half a cycle apart, so the pair reads as a
  // heading cue from above rather than two lamps blinking together.
  nav_port: {
    period: 1.5, floor: 0.30, steady: 0.85, attack: 0.04, tau: 0.20, tapAt: 0.24, tapAmp: 0.50, offset: 0.0,
  },
  nav_starboard: {
    period: 1.5, floor: 0.30, steady: 0.85, attack: 0.04, tau: 0.20, tapAt: 0.24, tapAmp: 0.50, offset: 0.5,
  },
  // Opt-in channels (Forge variant finishes).
  // Rotating beacon: one slow flash.
  beacon: {
    period: 1.5, floor: 0.20, steady: 0.80, attack: 0.05, tau: 0.30, tapAt: 0.0, tapAmp: 0.0, offset: 0.0,
  },
  // Strobe: a sharp double flash. Reduced-flash holds it at a calm steady glow, well under full.
  strobe: {
    period: 2.0, floor: 0.15, steady: 0.60, attack: 0.025, tau: 0.09, tapAt: 0.18, tapAmp: 0.90, offset: 0.0,
  },
  // Slow breathing lamp: no flash at all, a gentle swell. Safe under reduced-flash as-is, but it still
  // flattens (a steady lamp is the accessible default for every channel).
  breathe: {
    period: 4.0, floor: 0.55, steady: 0.85, attack: 1.20, tau: 1.00, tapAt: 0.0, tapAmp: 0.0, offset: 0.0,
  },
});

export const LAMP_CHANNEL_IDS = Object.freeze(Object.keys(LAMP_CHANNELS));

// Material-name suffixes Forge recipes may use to opt a lamp into a channel. Existing colour variants
// (_jacket, _helios, _sodium, _copper, _blue, _warning, _orange, _crimson ...) are different words, so
// these three are reserved for rhythm and must never be reused as a colour name.
export const LAMP_RESERVED_SUFFIXES = Object.freeze(['beacon', 'strobe', 'breathe']);

const OPT_IN_NAME = /^Material_Emissive_[A-Za-z0-9]+_(beacon|strobe|breathe)$/;

/**
 * Which channel (if any) a lamp material belongs to. `slot` is the render-package slot of the asset the
 * material was admitted with ('hull' for ships, 'place' for stations/props, ...).
 */
export function resolveLampChannel(materialName, { slot = null } = {}) {
  const name = String(materialName || '');
  if (slot === 'hull') {
    if (name === 'Material_Emissive_NavRed') return 'nav_port';
    if (name === 'Material_Emissive_NavGreen') return 'nav_starboard';
  }
  const match = OPT_IN_NAME.exec(name);
  return match ? match[1] : null;
}

/** Nominal flashes per second of a channel (a tap is a flash). */
export function lampFlashRateHz(channel) {
  const c = typeof channel === 'string' ? LAMP_CHANNELS[channel] : channel;
  return ((c.tapAmp > 0 ? 2 : 1)) / c.period;
}

function frac(x) {
  return x - Math.floor(x);
}

function flashShape(t, attack, tau) {
  // Linear attack to 1 over `attack` seconds, then an exponential fall. t is seconds since the flash began.
  return Math.min(t / attack, 1) * Math.exp(-Math.max(t - attack, 0) / tau);
}

/**
 * JS mirror of the fragment shader (lampBus.js LAMP_GAIN_GLSL). The shader is authoritative on the GPU; this
 * is what tests and tools evaluate, and both are built from the same channel numbers.
 *   timeS         the shared lamp clock (seconds, already wrapped or not: the cycle fraction is what matters)
 *   phaseCycles   per-material stagger in cycles (0..1), from lampPhaseForKey
 *   reducedFlash  true flattens the lamp to the channel's steady gain
 */
export function lampGain(channel, timeS, phaseCycles = 0, reducedFlash = false) {
  const c = typeof channel === 'string' ? LAMP_CHANNELS[channel] : channel;
  if (reducedFlash) return c.steady;
  const cycle = frac(timeS / c.period + c.offset + phaseCycles);
  const t = cycle * c.period;
  const first = flashShape(t, c.attack, c.tau);
  let second = 0;
  if (c.tapAmp > 0) {
    let t2 = t - c.tapAt;
    if (t2 < 0) t2 += c.period;
    second = c.tapAmp * flashShape(t2, c.attack, c.tau);
  }
  return c.floor + (1 - c.floor) * Math.max(first, second);
}

/**
 * FNV-1a over a string, finished with a murmur3 avalanche, to a stable fraction in [0, 1). Cosmetic phase
 * only; never state.rng. The avalanche matters: keys that differ in a trailing character must still land
 * far apart on the cycle.
 */
export function lampPhaseForKey(key) {
  let h = 0x811c9dc5;
  const text = String(key || '');
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return (h >>> 8) / 0x1000000;
}
