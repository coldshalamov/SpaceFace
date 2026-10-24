// DOCKET / PX-14 — the parcel drone that wants to be delivered. Content, voice and save
// normalization only: no renderer, no runtime side effects. A Fulfillment parcel drone whose
// fleet dissolved mid-route; the delivery address still stands, so it asks to be carried —
// thrown, towed, blasted, it does not care how — to the dead relay at Shepherd's Ring.
//
// VOICE LAW (docs/worldbuilding/vibe/vibe-CANONICAL.md, "Dialog Register"): flat declaratives of
// physical and logistical reality, in the register of shipping paperwork — manifests, stamps,
// receipt lines. A Docket line never names its own emotional state and never performs; its
// courtesies are stamps, not feelings. test/docket.test.mjs lints every string below with
// violatesRegister() (src/characters/docketRules.js).

export const DOCKET = Object.freeze({
  id: 'character_docket', name: 'Docket', callsign: 'PX-14 · DOCKET',
  sectorId: 'sector_io_reach',
  // Adrift at the Listening Field's edge, where the fleet's last route ran out. The delivery
  // address is the dead relay inside Shepherd's Ring — ~2700 WU across the sector, by design:
  // "throw it, accurately, at its own address across a contested sector" (03 §4.3).
  anchor: Object.freeze({ x: 350, z: -950 }),
  depot: Object.freeze({ x: -1100, z: 700 }),
  // The parcel: small, light, throwable. Radius 5 keeps it under the lightest Line-class
  // throw gate; mass 55 means a tether swing, a shove or a blast all move it worth the name.
  radius: 5, mass: 55, hull: 120,
  maxSpeed: 26, maxAccel: 9, hoverHeight: 4,
  // Delivery is positional, never method-gated: inside the cradle and slow. A fast pass is an
  // overshoot — the drone calls it and waits for the redirect.
  depotRadius: 140, arriveSpeed: 30,
  // Inside the approach shelf it trims its own final approach — weak, capped, and only toward
  // the address. A wild throw still carries it through and out.
  approachShelf: 380, approachAccel: 14, approachSpeed: 22,
  // Station-keeping while undelivered: drifts back toward the anchor so the encounter stays
  // findable. Once a hand has moved it (tether, hit, blast) it stops homing — the carrier owns
  // the transit leg, and a parcel mid-route does not steer itself home.
  anchorAccel: 2.2, anchorLeash: 900, touchedQuietSeconds: 45,
  // Ranges (world units).
  discoverRadius: 520, scanRadius: 300, nearRadius: 150,
  // The one-voice arbiter queues a line against the sim clock and drops it unspoken if the floor
  // stays held past its ttl.
  voiceTtl: 9,
  // Cadence.
  quietSeconds: 55, voiceCooldown: 6, overshootCooldown: 14, transitCooldown: 20,
});

export const DOCKET_LINES = Object.freeze({
  discover: 'DOCKET / PX-14 — a parcel drone, still in transit. Its fleet is not. Scan to read the manifest.',
  hello: 'DOCKET: PX-14. Fulfillment parcel, class small. Contents: one parcel drone. The fleet dissolved mid-route. The delivery address stands.',
  brief: 'DOCKET: The address is the dead relay at Shepherd\'s Ring, marked on your chart. I do not have propulsion worth the name. Parcel class means carried. Throw me, tow me — accurate delivery is still delivery.',
  lineOn: 'DOCKET: Line on the parcel. Noted as postage.',
  inTransit: 'DOCKET: In transit.',
  overshoot: 'DOCKET: That was the address. We are through it. Redirect.',
  wrongway: 'DOCKET: The manifest names the other ring. This leg has no address.',
  close: 'DOCKET: Address in range. Trimming final approach.',
  arrived: 'DOCKET: Delivered. Thank you. I have never been delivered.',
  deliveredHello: 'DOCKET: Delivery complete. The manifest is closed. The relay does not answer. It never did. That was the job.',
  deliveredQuiet: 'DOCKET: The dock is empty. The paperwork is full.',
  damage: 'DOCKET: Parcel damaged. Contents: one parcel drone. This side up.',
  wronged: 'DOCKET: Damage logged against the carrier. The carrier is you.',
  shy: 'DOCKET: Rough handling noted on the manifest.',
  quiet1: 'DOCKET: Fragile is a suggestion to the carrier.',
  quiet2: 'DOCKET: Every parcel arrives somewhere.',
  quiet3: 'DOCKET: The fleet is late. The fleet is always late.',
  quiet4: 'DOCKET: Address first. Stamps later.',
  quiet5: 'DOCKET: Undelivered is a status, not a verdict.',
  news: 'IO REACH — A Fulfillment parcel drone completed delivery to the dead Shepherd\'s Ring relay, nine years after its fleet dissolved. The relay has not acknowledged receipt.',
  memorial: 'PX-14 — undelivered. The manifest stays open. Nothing closes it now.',
  memorialScan: 'PX-14 — the parcel drone is dark. Its address is still on the chart.',
});

// One-time lines. Normalization keeps only these keys.
export const DOCKET_TOLD = Object.freeze(['hello', 'brief', 'lineOn', 'inTransit', 'arrived', 'wronged']);

const finite = (v, fallback, min, max) => Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;

export function freshDocketMemory() {
  return { version: 1, met: false, delivered: false, destroyed: false, hull: DOCKET.hull,
    visits: 0, wronged: 0, overshoots: 0, told: [] };
}

export function normalizeDocketMemory(raw) {
  const out = freshDocketMemory();
  if (!raw || typeof raw !== 'object' || raw.version !== 1) return out;
  for (const key of ['met', 'delivered', 'destroyed']) out[key] = raw[key] === true;
  out.hull = finite(raw.hull, DOCKET.hull, 0, DOCKET.hull);
  out.visits = Math.floor(finite(raw.visits, 0, 0, 1e6));
  out.wronged = Math.floor(finite(raw.wronged, 0, 0, 99));
  out.overshoots = Math.floor(finite(raw.overshoots, 0, 0, 1e6));
  out.told = Array.isArray(raw.told)
    ? [...new Set(raw.told.filter(k => DOCKET_TOLD.includes(k)))] : [];
  out.destroyed ||= out.hull === 0;
  return out;
}

export const DOCKET_AUDIO_RECIPES = Object.freeze([
  // A manifest stamp pressed home: one short mechanical clack.
  { id: 'sfx_docket_stamp', category: 'world', type: 'oscillator', wave: 'square',
    baseFreq: 1400, freqSweep: [1400, 900], sweepTimeS: 0.045, filterType: 'bandpass', filterFreq: 1200, filterQ: 2.4,
    gainEnvelope: { attack: 0.002, decay: 0.05, sustain: 0.0, release: 0.07 }, gainMult: 0.18 },
  // Receipt tape printing: dry paper whirr.
  { id: 'sfx_docket_print', category: 'world', type: 'noise_burst', noiseColor: 'white',
    filterType: 'bandpass', filterFreq: 3600, filterQ: 0.9,
    gainEnvelope: { attack: 0.03, decay: 0.12, sustain: 0.4, release: 0.4 }, gainMult: 0.2 },
  // Delivery complete: two small flat tones, stamp then stamp — not a fanfare.
  { id: 'sfx_docket_arrived', category: 'world', type: 'oscillator', wave: 'triangle',
    baseFreq: 330, freqSweep: [330, 330], sweepTimeS: 0.01,
    gainEnvelope: { attack: 0.01, decay: 0.4, sustain: 0.2, release: 0.9 },
    filterType: 'lowpass', filterFreq: 1400, gainMult: 0.26 },
  // Rough handling: a dull parcel thud.
  { id: 'sfx_docket_thud', category: 'world', type: 'noise_burst', noiseColor: 'pink',
    filterType: 'lowpass', filterFreq: 500, filterQ: 0.8,
    gainEnvelope: { attack: 0.004, decay: 0.1, sustain: 0.05, release: 0.18 }, gainMult: 0.3 },
]);
