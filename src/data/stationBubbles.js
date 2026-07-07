// stationBubbles.js — BP-11 packet A2 "Station Orbit Bubbles", PURE DATA HALF.
// (See design/revamp/detail/A_sector_station.md packet A2.)
//
// Approaching a station reads as concentric rings: outer TRAFFIC → PATROL lane → DOCKING approach
// → hard NO-FIRE core. The radii are DERIVED geometry — deterministic functions of the station's
// existing dockRadius · fixed multipliers · a size factor. No RNG, no state, no DOM, no imports.
//
// The no-fire ring is a READABILITY + COMMS cue, NOT a hostility or spawn system:
//   * hostility stays with scanner.isHostileToPlayer (AGENTS §6) — nothing here reads factionId
//     for behavior; factionId is passed through for cosmetic ring tinting + voice attribution only.
//   * enforcement stays ADVISORY: one 'warn' bark per ring ENTRY (debounced below) plus the
//     existing kill-rep path if the player actually shoots something. No new spawns, no collision.
//
// ── RENDER-LANE WIRING CONTRACT (handoff — src/render/stationBubbleRings.js, graphics lane) ────
// The render module this file feeds is graphics-lane-owned (AGENTS §6/§10 — release.__building was
// active when this landed, so the mesh half is handed off). It should:
//   1. draw ≤4 rings per station from bubblesFor(station), faction-tinted, LOD: rings fade beyond
//      ~2·traffic radius; only the docked-target/nearest station renders all four (no ring spam);
//   2. own ONE createNoFireWatch({ say: (msg) => ctx.helpers.voice.say(msg) }) instance;
//   3. call watch.update(playerPos, stations) once per frame, and
//      watch.weaponDrawn(playerPos, stations) on each 'combat:fire' whose ownerId is the player.
// The watch below is headless/deterministic so its debounce contract is CI-pinned regardless.

// Ring multipliers over the station's dock radius. Strictly increasing → radii are monotonic
// (noFire < docking < patrol < traffic) for ANY positive base radius.
export const BUBBLE_MULTIPLIERS = {
  noFire:  1.5,
  docking: 2.4,
  patrol:  4.0,
  traffic: 6.0,
};

// Size factor: bigger stations project bigger control volumes. Unknown sizes read as M.
export const BUBBLE_SIZE_FACTOR = { S: 0.9, M: 1.0, L: 1.15 };

// Ring role colors (render tints these toward the station's faction color).
export const BUBBLE_COLORS = {
  noFire:  '#FF4D5E', // red — weapons cold
  docking: '#FFB13D', // amber — approach lane
  patrol:  '#3A78FF', // blue — patrol orbit
  traffic: '#7FE0C0', // teal — outer traffic shell
};

const DEFAULT_DOCK_RADIUS = 80;

/** Defensive base radius: station.dockRadius, else entity-style station.data.dockRadius, else radius. */
function baseRadiusOf(station) {
  if (!station || typeof station !== 'object') return DEFAULT_DOCK_RADIUS;
  const data = station.data || {};
  const r = [station.dockRadius, data.dockRadius, station.radius, data.radius]
    .find((v) => Number.isFinite(v) && v > 0);
  return r || DEFAULT_DOCK_RADIUS;
}

function sizeOf(station) {
  if (!station || typeof station !== 'object') return 'M';
  return station.size || (station.data && station.data.size) || 'M';
}

/**
 * bubblesFor(station) -> { traffic, patrol, docking, noFire }
 * Each ring: { radius, color }. Plus `factionId` (cosmetic tint/voice attribution only) and
 * `stationId` for bookkeeping. PURE + deterministic: same station fields → same bubbles.
 * Monotonic by construction: noFire < docking < patrol < traffic.
 */
export function bubblesFor(station) {
  const base = baseRadiusOf(station);
  const sizeFactor = BUBBLE_SIZE_FACTOR[sizeOf(station)] || BUBBLE_SIZE_FACTOR.M;
  const ring = (key) => ({
    radius: Math.round(base * BUBBLE_MULTIPLIERS[key] * sizeFactor * 100) / 100,
    color: BUBBLE_COLORS[key],
  });
  const data = (station && station.data) || {};
  return {
    traffic: ring('traffic'),
    patrol:  ring('patrol'),
    docking: ring('docking'),
    noFire:  ring('noFire'),
    factionId: (station && station.factionId) || data.factionId || null,
    stationId: (station && (station.id || station.stationId)) || data.stationId || null,
  };
}

// ── no-fire entry watch (headless, deterministic, debounced per ENTRY) ─────────────────────────

// One advisory line. Neutral wording — the arbiter carries the faction attribution.
export const NO_FIRE_BARK = 'Weapons hot in a no-fire zone — traffic control logs your registry. Stand down.';

function keyOf(station) {
  return String(
    (station && (station.id ?? station.stationId)) ??
    (station && station.data && station.data.stationId) ?? 'station',
  );
}

function insideNoFire(playerPos, station) {
  if (!playerPos || !station || !station.pos) return false;
  const r = bubblesFor(station).noFire.radius;
  const dx = playerPos.x - station.pos.x;
  const dz = playerPos.z - station.pos.z;
  return dx * dx + dz * dz <= r * r;
}

/**
 * createNoFireWatch({ say }) — the debounced comms cue for weapon-draw inside a no-fire ring.
 *
 * Contract (CI-pinned by scripts/check-station-bubbles.mjs):
 *   * weaponDrawn(playerPos, stations): if the player is inside some station's no-fire ring and
 *     has NOT yet barked since entering it → exactly one say({channel:'warn', ...}) and returns
 *     the station key; otherwise no call, returns null. Staying inside → later draws are silent.
 *   * update(playerPos, stations): tracks ring entry/exit; LEAVING a ring re-arms its bark, so
 *     enter → bark → leave → re-enter → bark again.
 *   * Outside every ring: never barks. No clock, no RNG — pure function of the call sequence.
 */
export function createNoFireWatch(opts = {}) {
  const say = typeof opts.say === 'function' ? opts.say : null;
  const armed = new Map(); // stationKey -> { inside:boolean, barked:boolean }

  function slot(key) {
    let s = armed.get(key);
    if (!s) { s = { inside: false, barked: false }; armed.set(key, s); }
    return s;
  }

  function refresh(playerPos, stations) {
    for (const st of (stations || [])) {
      if (!st) continue;
      const s = slot(keyOf(st));
      const now = insideNoFire(playerPos, st);
      if (!now && s.inside) s.barked = false; // exit re-arms the bark
      s.inside = now;
    }
  }

  return {
    update(playerPos, stations) { refresh(playerPos, stations); },

    weaponDrawn(playerPos, stations) {
      refresh(playerPos, stations);
      for (const st of (stations || [])) {
        if (!st) continue;
        const key = keyOf(st);
        const s = slot(key);
        if (!s.inside || s.barked) continue;
        s.barked = true;
        if (say) {
          say({
            channel: 'warn',
            text: NO_FIRE_BARK,
            kind: 'noFireZone',
            factionId: (st.factionId || (st.data && st.data.factionId)) || null,
          });
        }
        return key;
      }
      return null;
    },
  };
}

export default { bubblesFor, createNoFireWatch, BUBBLE_MULTIPLIERS, BUBBLE_SIZE_FACTOR, BUBBLE_COLORS, NO_FIRE_BARK };
