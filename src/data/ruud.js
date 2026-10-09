// HOOK-LEFT / Ruud. A living work-suit still plumbed to radiator fin Fin-3.
// Content and save normalization only. Nineteen hours is a stamp, not a clock.
import { sectorLocalToGlobalForSector } from './sectorCoordinates.js';

const FIN = Object.freeze({ x: -800, z: 830 });
const SUIT = Object.freeze({ x: -784, z: 830 });
const RAY_X = -320;
const RAY_Z = 110;
const RAY_LEN = Math.hypot(RAY_X, RAY_Z);
const BUOY_ALONG = 110;
const BUOY = Object.freeze({
  x: FIN.x + BUOY_ALONG * (RAY_X / RAY_LEN),
  z: FIN.z + BUOY_ALONG * (RAY_Z / RAY_LEN),
});

export const RUUD = Object.freeze({
  id: 'character_ruud',
  callsign: 'HOOK-LEFT',
  sectorId: 'sector_vesta_forge',
  fin: FIN,
  suit: SUIT,
  buoy: BUOY,
  bladderOffset: Object.freeze({ x: 8, z: 0 }),
  hang: 16,
  coldInset: 10.4,
  towSlack: 14,
  spareBuoy: 16,
  spareFin: 28,
  hoseStart: 0.85,
  buoySkin: 1.85,
  cutSpeed: 14,
  hours: 19,
  hull: 400,
  finRadius: 8,
  finMass: 40,
  suitRadius: 3.4,
  suitMass: 22,
  buoyRadius: 5,
  buoyMass: 8000,
  bladderRadius: 2,
  bladderMass: 8,
  discoverRadius: 280,
  scanRadius: 210,
  hearRadius: 360,
  voiceCooldown: 7,
  tickEvery: 2.4,
  hissEvery: 6.2,
  returnAcceleration: 7,
  dressingExclusion: 140,
});

export const RUUD_LINES = Object.freeze({
  discover: 'HOOK-LEFT — living suit on Fin-3. A massline ring faces the cold approach. Scan for the filing.',
  hello: 'HOOK-LEFT: Cab stamped the rotation at 04:10. The hook did not move. My ring takes a massline. The lane buoy has a berth.',
  hours: 'HOOK-LEFT: Nineteen hours. The stamp stopped the clock. I do not correct stamps.',
  towing: 'HOOK-LEFT: Your line is on the ring. Tow me to the lane buoy. Release close to the plate.',
  ignore: 'HOOK-LEFT: Still on the fin side. The berth is at the lane buoy.',
  spared: 'HOOK-LEFT: Off the fin. On the buoy.',
  buoy: 'HOOK-LEFT: The berth plate still says complete.',
  hatch: 'HOOK-LEFT: The sign is bolted through the fin. A cab cannot read it.',
  cut: 'HOOK-LEFT: Serial 14-K. Suit is on the backup bladder.',
  memorial: 'HOOK-LEFT: Serial 14-K is on the hook. The left gantry stays shut.',
  weapon: 'HOOK-LEFT: Fin-3. Cold face on the suit. The root is still cherry.',
});

const PARTS = Object.freeze(['fin', 'suit', 'buoy']);
const finite = (v, fallback, min, max) => Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;

function freshBody(part) {
  const at = part === 'bladder'
    ? { x: SUIT.x + RUUD.bladderOffset.x, z: SUIT.z + RUUD.bladderOffset.z }
    : RUUD[part];
  return { x: at.x, z: at.z, vx: 0, vz: 0, rot: 0, angVel: 0, hull: RUUD.hull };
}

export function freshRuudMemory() {
  return {
    version: 1,
    met: false,
    disposition: 'unchosen',
    plateId: '',
    visits: 0,
    hours: RUUD.hours,
    bodies: { fin: freshBody('fin'), suit: freshBody('suit'), buoy: freshBody('buoy') },
    bladder: { present: false, ...freshBody('bladder') },
  };
}

function body(value, part, disposition) {
  const b = freshBody(part);
  const keep = disposition === 'spared' || disposition === 'cut';
  if (keep && value && typeof value === 'object') {
    b.x = finite(value.x, b.x, -1e7, 1e7);
    b.z = finite(value.z, b.z, -1e7, 1e7);
    b.vx = finite(value.vx, 0, -1e5, 1e5);
    b.vz = finite(value.vz, 0, -1e5, 1e5);
    b.rot = finite(value.rot, 0, -1e6, 1e6);
    b.angVel = finite(value.angVel, 0, -30, 30);
    b.hull = finite(value.hull, RUUD.hull, 1, RUUD.hull);
  }
  return b;
}

export function normalizeRuudMemory(raw) {
  const out = freshRuudMemory();
  if (!raw || typeof raw !== 'object' || raw.version !== 1) return out;
  out.met = raw.met === true;
  out.disposition = raw.disposition === 'spared' || raw.disposition === 'cut' ? raw.disposition : 'unchosen';
  out.visits = Math.floor(finite(raw.visits, 0, 0, 1e6));
  out.hours = RUUD.hours;
  const keep = out.disposition !== 'unchosen';
  out.plateId = keep && out.disposition === 'spared' && typeof raw.plateId === 'string'
    ? raw.plateId.slice(0, 64) : '';
  for (const part of PARTS) {
    out.bodies[part] = body(raw.bodies && raw.bodies[part], part, out.disposition);
  }
  const bladder = raw.bladder && typeof raw.bladder === 'object' ? raw.bladder : null;
  out.bladder = { ...body(bladder, 'bladder', out.disposition), present: out.disposition === 'cut' && bladder?.present === true };
  if (out.disposition === 'cut' && out.bladder.present !== true) {
    out.bladder.present = true;
    const suit = out.bodies.suit;
    out.bladder.x = suit.x + RUUD.bladderOffset.x;
    out.bladder.z = suit.z + RUUD.bladderOffset.z;
    out.bladder.vx = 0;
    out.bladder.vz = 0;
    out.bladder.angVel = 0;
  }
  if (!keep) out.bladder.present = false;
  return out;
}

export function ruudGlobal(local) {
  return sectorLocalToGlobalForSector(local, RUUD.sectorId);
}

export const RUUD_AUDIO_RECIPES = Object.freeze([
  {
    id: 'sfx_ruud_tick', category: 'world', type: 'oscillator', wave: 'square',
    baseFreq: 2400, freqSweep: [2400, 1680], sweepTimeS: 0.018,
    gainEnvelope: { attack: 0.001, decay: 0.035, sustain: 0, release: 0.02 },
    filterType: 'highpass', filterFreq: 900, gainMult: 0.16,
  },
  {
    id: 'sfx_ruud_hiss', category: 'world', type: 'oscillator', wave: 'triangle',
    baseFreq: 128, freqSweep: [96, 154], sweepTimeS: 0.42,
    gainEnvelope: { attack: 0.09, decay: 0.45, sustain: 0.12, release: 0.55 },
    filterType: 'lowpass', filterFreq: 520, gainMult: 0.14,
  },
]);
