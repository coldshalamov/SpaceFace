// Bounded admission for discrete camera shakes (Controlled Chaos packet 08).
//
// `camera:shake` has many emitters and trauma simply adds up to 1, so a swarm fight (a dozen kills,
// a shotgun burst into the player's shield) saturates the camera: the screen is always shaking and
// the one beat that deserved it is invisible. This is the single admission rule for discrete world
// and hit events at the renderer's chokepoint:
//
//   * continuous textures (amount < eventFloor: gyre ball hum, tether strain, flyby) pass untouched;
//   * a discrete event is admitted at amount / (1 + recentEnergy / referenceEnergy), so the first
//     blow in a quiet moment is whole and each further blow inside the window adds less;
//   * the energy admitted inside the decaying window never exceeds `windowCeiling`, so a massacre
//     can bound but never pin the camera;
//   * a lone hero beat (nothing else recent) is admitted in full.
//
// Pure and clock-parameterized (sim seconds); no ambient time, no randomness. Reduced motion is
// applied downstream by the camera (trauma scale / kick refusal) - this rule only decides magnitude.

export const SHAKE_ADMISSION_LAW = Object.freeze({
  eventFloor: 0.08,
  referenceEnergy: 0.45,
  decayPerS: 1.6,
  windowCeiling: 0.85,
});

export function createShakeAdmission(law = SHAKE_ADMISSION_LAW) {
  let energy = 0;
  let lastT = -Infinity;
  const decayTo = (nowS) => {
    if (Number.isFinite(nowS) && nowS > lastT) {
      const dt = Number.isFinite(lastT) ? nowS - lastT : 0;
      if (dt > 0) energy *= Math.exp(-law.decayPerS * dt);
      lastT = nowS;
    } else if (Number.isFinite(nowS) && nowS < lastT) {
      // the clock went backwards (new game / reload): forget the old window
      energy = 0;
      lastT = nowS;
    }
  };
  return {
    /** @returns {number} the amount to actually add (0..amount). */
    admit(amount, nowS) {
      const a = Number(amount);
      if (!(a > 0) || !Number.isFinite(a)) return 0;
      decayTo(nowS);
      if (a < law.eventFloor) return a;
      const taper = a / (1 + energy / law.referenceEnergy);
      const room = Math.max(0, law.windowCeiling - energy);
      const admitted = Math.min(a, taper, room);
      energy += admitted;
      return admitted;
    },
    reset() { energy = 0; lastT = -Infinity; },
    energy() { return energy; },
  };
}

// ---------------------------------------------------------------------------------------------
// OVH-06a / ruling R10 - the camera answers the player, not the room (03_COMBAT section 6).
//
// Every camera motion (trauma, directed kick, hold = hitstop) carries a `cause`. The class of that
// cause decides whether the camera may move at all:
//
//   hull  - the player's own hull took a hard blow (>= 8 % of max hull in one hit)
//   hero  - one of the four hero beats; one at a time, the only source of hitstop
//   own   - the player's own continuous textures (boost, rope strain, the player's own tools)
//   room  - everything else (other ships colliding, explosions, fodder kills, announcements...)
//
// room - and any cause the table does not know - is refused, and the gate counts every admission
// and every refusal per cause so a test or a recording can read them. Pure and clock-parameterized
// (sim seconds): no ambient time, no randomness, no simulation writes.
export const CAMERA_CAUSE_CLASS = Object.freeze({
  // the player's hull, hard blow (admitted by feel.js from the damage receipt, with its fraction)
  hullHit: 'hull',
  // hero beats
  throwKillHeavy: 'hero',
  perfectRelease: 'hero',
  ploughKill: 'hero',
  bossBreak: 'hero',
  // the player's own continuous textures: boost opening the camera, strain on the player's own
  // line, the gyre's hum, the jump drive - all on the player's own ship
  boost: 'own',
  redline: 'own',
  strain: 'own',
  tether: 'own',
  gyre: 'own',
  jump: 'own',
  // room events: named so the refusal counter says what was refused
  hullHitEvent: 'room',   // the camera:shake mirror of a hit on the player; the damage receipt owns it
  hullChip: 'room',       // a blow under the hard-hit floor
  weaponKick: 'room',     // the player's own shot landing on something else
  recoil: 'room',         // muzzle kick; the shot is felt on the weapon and the target
  collision: 'room',
  collisionFov: 'room',   // the FOV punch of a contact the player is not part of
  crunch: 'room',
  explosion: 'room',
  kill: 'room',
  multiKill: 'room',
  announce: 'room',
  flyby: 'room',
  whip: 'room',
  tumble: 'room',
  respawn: 'room',
  moment: 'room',
  charge: 'room',
  drill: 'room',
  gyreLaunch: 'room',
  knot: 'room',
  pickup: 'room',
  presentation: 'room',
});

export const HULL_BLOW_MIN_FRACTION = 0.08;
export const HERO_BEAT_GAP_S = 0.25;
export const HERO_SAME_BEAT_S = 0.05;
export const HITSTOP_MIN_S = 0.04;
export const HITSTOP_MAX_S = 0.06;
export const HITSTOP_REARM_S = 0.8;
const GATE_LOG_CAP = 512;

/** The share of the player's max hull one damage receipt took (shield + armor + hull), 0..1+. */
export function playerBlowFraction(receipt, hullMax) {
  const max = Number(hullMax);
  if (!receipt || !(max > 0)) return 0;
  const part = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);
  const total = part(receipt.shieldDamage) + part(receipt.armorDamage) + part(receipt.hullDamage);
  return total / max;
}

export function createCameraGate(law = SHAKE_ADMISSION_LAW) {
  const taper = createShakeAdmission(law);
  let admitted = Object.create(null);
  let refused = Object.create(null);
  let log = [];
  let heroAt = -Infinity;
  let heroCause = null;
  let hitstopAt = -Infinity;
  const bump = (map, key) => { map[key] = (map[key] || 0) + 1; };
  const note = (kind, cause, amount, nowS, ok) => {
    bump(ok ? admitted : refused, cause);
    log.push({ t: Number.isFinite(nowS) ? nowS : 0, kind, cause, amount: Number(amount) || 0, ok });
    if (log.length > GATE_LOG_CAP) log.shift();
  };
  const heroOpen = (cause, nowS) => {
    if (!Number.isFinite(nowS)) return true;
    if (cause === heroCause && nowS - heroAt >= 0 && nowS - heroAt <= HERO_SAME_BEAT_S) return true;
    if (nowS - heroAt < HERO_BEAT_GAP_S && nowS >= heroAt) return false;
    heroAt = nowS;
    heroCause = cause;
    return true;
  };
  return {
    classOf(cause) { return typeof cause === 'string' && CAMERA_CAUSE_CLASS[cause] || 'room'; },
    /**
     * @param {'trauma'|'kick'} kind
     * @returns {number} the amount to apply (0 = refused).
     */
    motion(kind, cause, amount, nowS) {
      const key = typeof cause === 'string' && cause ? cause : 'untagged';
      const a = Number(amount);
      if (!(a > 0) || !Number.isFinite(a)) return 0;
      const cls = typeof cause === 'string' && CAMERA_CAUSE_CLASS[cause] || 'room';
      if (cls === 'room') { note(kind, key, a, nowS, false); return 0; }
      if (cls === 'hero' && !heroOpen(key, nowS)) { note(kind, key, a, nowS, false); return 0; }
      const out = kind === 'kick' || cls === 'hull' ? a : taper.admit(a, nowS);
      if (!(out > 0)) { note(kind, key, a, nowS, false); return 0; }
      note(kind, key, out, nowS, true);
      return out;
    },
    /** Hitstop belongs to hero beats only: 40-60 ms, at most once per 0.8 s. @returns seconds (0 = refused). */
    hitstop(cause, seconds, nowS) {
      const key = typeof cause === 'string' && cause ? cause : 'untagged';
      const cls = typeof cause === 'string' && CAMERA_CAUSE_CLASS[cause] || 'room';
      const s = Number(seconds);
      if (cls !== 'hero' || !(s > 0)) { note('hitstop', key, s, nowS, false); return 0; }
      if (Number.isFinite(nowS) && nowS >= hitstopAt && nowS - hitstopAt < HITSTOP_REARM_S) {
        note('hitstop', key, s, nowS, false);
        return 0;
      }
      if (Number.isFinite(nowS)) hitstopAt = nowS;
      const out = Math.min(HITSTOP_MAX_S, Math.max(HITSTOP_MIN_S, s));
      note('hitstop', key, out, nowS, true);
      return out;
    },
    /** Record a refusal that never reached the motion calls (a room event feel.js dropped itself). */
    refuse(cause, nowS = 0, kind = 'event') { note(kind, cause || 'untagged', 0, nowS, false); },
    /** Record an admission decided elsewhere (the hull-blow kick and edge pulse). */
    admit(cause, amount, nowS = 0, kind = 'event') { note(kind, cause, amount, nowS, true); },
    counts() { return { admitted: { ...admitted }, refused: { ...refused } }; },
    events() { return log.slice(); },
    reset() {
      taper.reset();
      admitted = Object.create(null);
      refused = Object.create(null);
      log = [];
      heroAt = -Infinity;
      heroCause = null;
      hitstopAt = -Infinity;
    },
  };
}
