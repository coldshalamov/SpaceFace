// The LIVE TITLE tape — build_map.md §25 "Zero to hero", Phase 5.2.
//
// A recording of the deterministic attract world (titleAttract.js), not a re-simulation:
// the fight runs once at bake time (scripts/bake-title-attract.mjs) and what ships the
// title is this small track sheet — ship poses at 30 Hz, straight-round fire events, and
// full-rate position tracks only for rounds whose path bent (homing missiles). The stage
// (src/render/titleAttractStage.js) plays poses back; it never steps the sim.
//
// Why a tape and not a second live GameState: the attract world costs ~10 ms per 60 Hz
// tick on commodity hardware — the same order as the production manifest — because the
// five production systems carry per-tick world classification and swept-projectile work
// sized for a whole sector. On the front door that is the difference between a menu that
// breathes and a menu that hitches. The task sanctions exactly this fallback ("a baked
// replay using real recorded snapshots/tape data"), and a tape is deterministic by
// construction: the recorder only ever writes what the seeded sim produced.
//
// Staleness contract: test/title-attract.test.mjs re-records a fresh window and compares
// the encoded bytes to src/sim/titleAttractTapeData.js. Any change to the fight (roster,
// systems, seed) must re-bake — same discipline as the expected.json goldens.
//
// Format (schema 'spaceface.titleAttractTape.v1'):
//   meta fields are plain JSON; every pose/event stream is int16 in `bin` (base64 LE).
//   ships[]  { v, t, b, d, n, r0, vx, vz, wz, o } — one entry per ship LIFE: born tick b,
//             died tick d, n samples at shipRate Hz, radius r0, final velocity (vx,vz)
//             and yaw-rate (wz) for the wreck drift, o = int16 offset into bin where the
//             channel blocks [x n][z n][r n] live.
//   shots[]  { b, d, x, z, vx, vz, t } — a straight round: spawn pos, velocity, team;
//             the round lives [b, d) and dies at d (impact or expiry — the flash is
//             placed at the extrapolated endpoint either way).
//   guided[] { b, d, n, t, o } — a round whose path bent (homing steering): per-tick
//             [x n][z n][r n] at the full tick rate.
//   Tick zero is the first recorded tick, not world tick zero.

export const TITLE_ATTRACT_TAPE_SCHEMA = 'spaceface.titleAttractTape.v1';
export const TAPE_TICK_RATE = 60;
/** Ships are smooth movers; 30 Hz samples + interpolation are visually identical at title distance. */
export const TAPE_SHIP_RATE = 2;
/** How many ticks of tape a loop holds. 60 s so a repeat visitor rarely sees the seam. */
export const TAPE_DURATION_TICKS = 3600;

// Quantization. Ranges chosen against the arena (≈230 wu) plus chase/bolt overshoot.
const POS_Q = 64;       // 1/64 wu ≈ 1.5 cm; int16 covers ±511 wu
const ANG_Q = 10000;    // 1e-4 rad; int16 covers ±3.27 rad (angles are wrapped to ±π)
const VEL_Q = 16;       // 1/16 wu·s⁻¹; int16 covers ±2047 wu/s
const RADIUS_Q = 16;    // 1/16 wu

const TWO_PI = Math.PI * 2;
function wrapPi(a) {
  let v = a % TWO_PI;
  if (v > Math.PI) v -= TWO_PI;
  else if (v < -Math.PI) v += TWO_PI;
  return v;
}
const clamp16 = (v) => v > 32767 ? 32767 : v < -32768 ? -32768 : v | 0;
const qPos = (v) => clamp16(Math.round(v * POS_Q));
const qAng = (v) => clamp16(Math.round(wrapPi(v) * ANG_Q));
const qVel = (v) => clamp16(Math.round(v * VEL_Q));
const qRadius = (v) => clamp16(Math.round(v * RADIUS_Q));

/**
 * Attach to a titleAttract world BEFORE it starts stepping. Call tick() after every
 * sim.step; finish() closes every open track and returns the serializable tape.
 * Recording is allocation-happy on purpose — it runs offline in the bake, never on
 * the player's machine.
 */
export function createTapeRecorder(options = {}) {
  const ticks = Number.isInteger(options.ticks) && options.ticks > 0
    ? options.ticks : TAPE_DURATION_TICKS;
  const shipRate = Number.isInteger(options.shipRate) && options.shipRate >= 1
    ? options.shipRate : TAPE_SHIP_RATE;
  const open = new Map();
  const ships = [];
  const rounds = [];
  let tapeTick = -1;

  function close(id, entity, died) {
    const rec = open.get(id);
    if (!rec) return;
    open.delete(id);
    rec.died = died;
    if (rec.kind === 'ship') {
      const vel = entity && entity.vel;
      rec.vx = vel && Number.isFinite(vel.x) ? vel.x : 0;
      rec.vz = vel && Number.isFinite(vel.z) ? vel.z : 0;
      rec.wz = entity && Number.isFinite(entity.angVel) ? entity.angVel : 0;
      ships.push(rec);
    } else {
      rounds.push(rec);
    }
  }

  return {
    get tapeTick() { return tapeTick; },

    /** Record the world after one authoritative step. Returns false once full. */
    tick(state) {
      tapeTick += 1;
      const t = tapeTick;
      const seen = new Set();
      const list = state && state.entityList;
      if (Array.isArray(list)) {
        for (const e of list) {
          if (!e || !e.id || e.alive === false || !e.pos) continue;
          if (e.type !== 'ship' && e.type !== 'projectile') continue;
          seen.add(e.id);
          let rec = open.get(e.id);
          if (!rec) {
            rec = e.type === 'ship'
              ? {
                  kind: 'ship', born: t, died: -1,
                  visual: (e.data && (e.data.lootTableId || e.data.defId)) || null,
                  silhouette: (e.data && e.data.silhouette) || null,
                  team: e.team | 0,
                  radius: Number.isFinite(e.radius) ? e.radius : 0,
                  vx: 0, vz: 0, wz: 0,
                  x: [], z: [], r: [],
                }
              : {
                  kind: 'round', born: t, died: -1,
                  team: e.team | 0,
                  x: [], z: [], r: [],
                  vx: e.vel && Number.isFinite(e.vel.x) ? e.vel.x : 0,
                  vz: e.vel && Number.isFinite(e.vel.z) ? e.vel.z : 0,
                };
            open.set(e.id, rec);
          }
          if (rec.kind === 'ship' && ((t - rec.born) % shipRate) !== 0) {
            // 30 Hz ship sampling: this tick carries no sample for this track.
            continue;
          }
          rec.x.push(e.pos.x);
          rec.z.push(e.pos.z);
          rec.r.push(Number.isFinite(e.rot) ? e.rot : 0);
        }
      }
      // Close what died this tick: alive flag dropped or entity swept entirely.
      for (const [id, rec] of open) {
        if (seen.has(id)) continue;
        const entity = state && state.entities && typeof state.entities.get === 'function'
          ? state.entities.get(id) : null;
        close(id, entity, t);
      }
      return t < ticks - 1;
    },

    /** Seal the tape. World is no longer needed afterwards. */
    finish(state) {
      for (const [id, rec] of open) {
        const entity = state && state.entities && typeof state.entities.get === 'function'
          ? state.entities.get(id) : null;
        close(id, entity, tapeTick + 1);
      }
      open.clear();

      // Split rounds into straight shots vs guided tracks by honest reconstruction:
      // a straight round's extrapolated path must reproduce every sampled position.
      const shots = [];
      const guided = [];
      for (const rec of rounds) {
        const n = rec.x.length;
        let straight = n > 0;
        if (straight) {
          const x0 = rec.x[0], z0 = rec.z[0];
          for (let i = 1; i < n; i++) {
            const ex = x0 + rec.vx * (i / TAPE_TICK_RATE);
            const ez = z0 + rec.vz * (i / TAPE_TICK_RATE);
            if (Math.abs(ex - rec.x[i]) > 2 || Math.abs(ez - rec.z[i]) > 2) { straight = false; break; }
          }
        }
        if (straight) {
          shots.push({ b: rec.born, d: rec.died, t: rec.team,
            x: qPos(rec.x[0]), z: qPos(rec.z[0]),
            vx: qVel(rec.vx), vz: qVel(rec.vz) });
        } else if (n > 0) {
          guided.push(rec);
        }
      }

      return {
        schema: TITLE_ATTRACT_TAPE_SCHEMA,
        seed: options.seed >>> 0,
        ticks,
        tickRate: TAPE_TICK_RATE,
        shipRate,
        quant: { pos: POS_Q, ang: ANG_Q, vel: VEL_Q, radius: RADIUS_Q },
        ships,
        shots,
        guided,
      };
    },
  };
}

/**
 * Pack the tape's streams into `bin` (base64 int16 LE) and return the final JSON-safe
 * object — the exact thing baked into titleAttractTapeData.js.
 */
export function encodeTape(tape) {
  if (!tape || tape.schema !== TITLE_ATTRACT_TAPE_SCHEMA) {
    throw new Error(`encodeTape: not a ${TITLE_ATTRACT_TAPE_SCHEMA} tape`);
  }
  const chunks = [];
  let cursor = 0;
  const take = (ints) => {
    const block = new Int16Array(ints);
    const o = cursor;
    chunks.push(block);
    cursor += block.length;
    return o;
  };

  const ships = tape.ships.map((rec) => {
    const n = rec.x.length;
    const ints = new Int16Array(n * 3);
    for (let i = 0; i < n; i++) {
      ints[i] = qPos(rec.x[i]);
      ints[n + i] = qPos(rec.z[i]);
      ints[2 * n + i] = qAng(rec.r[i]);
    }
    return {
      v: rec.visual || null,
      s: rec.silhouette || null,
      t: rec.team | 0,
      b: rec.born | 0, d: rec.died | 0, n,
      r0: qRadius(rec.radius || 0),
      vx: qVel(rec.vx || 0), vz: qVel(rec.vz || 0), wz: qVel(rec.wz || 0),
      o: take(ints),
    };
  });

  const guided = tape.guided.map((rec) => {
    const n = rec.x.length;
    const ints = new Int16Array(n * 3);
    for (let i = 0; i < n; i++) {
      ints[i] = qPos(rec.x[i]);
      ints[n + i] = qPos(rec.z[i]);
      ints[2 * n + i] = qAng(rec.r[i]);
    }
    return { b: rec.born | 0, d: rec.died | 0, n, t: rec.team | 0, o: take(ints) };
  });

  const shotCount = tape.shots.length;
  const shotInts = new Int16Array(shotCount * 7);
  // Channel-blocked layout — the decoder reads seven contiguous channels via chan(o, n, stride),
  // the same convention ships/guided use. Interleaving records here scrambles every field.
  tape.shots.forEach((shot, i) => {
    shotInts[i] = shot.b | 0;
    shotInts[shotCount + i] = shot.d | 0;
    shotInts[2 * shotCount + i] = shot.x | 0;
    shotInts[3 * shotCount + i] = shot.z | 0;
    shotInts[4 * shotCount + i] = shot.vx | 0;
    shotInts[5 * shotCount + i] = shot.vz | 0;
    shotInts[6 * shotCount + i] = shot.t | 0;
  });
  const shotsOffset = take(shotInts);

  const bin = new Int16Array(cursor);
  let at = 0;
  for (const block of chunks) { bin.set(block, at); at += block.length; }

  return {
    schema: tape.schema,
    seed: tape.seed >>> 0,
    ticks: tape.ticks | 0,
    tickRate: tape.tickRate | 0,
    shipRate: tape.shipRate | 0,
    quant: tape.quant,
    ships,
    guided,
    shots: { count: tape.shots.length, o: shotsOffset },
    bin: base64FromBytes(new Uint8Array(bin.buffer, bin.byteOffset, bin.byteLength)),
  };
}

/**
 * Decode the baked object into typed views. The stage consumes this; it allocates once
 * at mount and never again. Malformed input throws — the caller fails closed.
 */
export function decodeTape(encoded) {
  if (!encoded || encoded.schema !== TITLE_ATTRACT_TAPE_SCHEMA || typeof encoded.bin !== 'string') {
    throw new Error(`decodeTape: not a ${TITLE_ATTRACT_TAPE_SCHEMA} tape`);
  }
  const bytes = bytesFromBase64(encoded.bin);
  if ((bytes.byteLength & 1) !== 0) throw new Error('decodeTape: odd byte count');
  const bin = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
  const q = encoded.quant || { pos: POS_Q, ang: ANG_Q, vel: VEL_Q, radius: RADIUS_Q };

  const chan = (o, n, stride) => bin.subarray(o + stride * n, o + (stride + 1) * n);
  const ships = (encoded.ships || []).map((s) => ({
    visual: s.v || null,
    silhouette: s.s || null,
    team: s.t | 0,
    born: s.b | 0, died: s.d | 0, n: s.n | 0,
    radius: (s.r0 | 0) / q.radius,
    vx: (s.vx | 0) / q.vel, vz: (s.vz | 0) / q.vel, wz: (s.wz | 0) / q.vel,
    x: chan(s.o, s.n, 0), z: chan(s.o, s.n, 1), r: chan(s.o, s.n, 2),
  }));
  const guided = (encoded.guided || []).map((g) => ({
    born: g.b | 0, died: g.d | 0, n: g.n | 0, team: g.t | 0,
    x: chan(g.o, g.n, 0), z: chan(g.o, g.n, 1), r: chan(g.o, g.n, 2),
  }));
  const shotMeta = encoded.shots || { count: 0, o: 0 };
  const shotCount = shotMeta.count | 0;
  const shots = {
    count: shotCount,
    b: chan(shotMeta.o, shotCount, 0),
    d: chan(shotMeta.o, shotCount, 1),
    x: chan(shotMeta.o, shotCount, 2),
    z: chan(shotMeta.o, shotCount, 3),
    vx: chan(shotMeta.o, shotCount, 4),
    vz: chan(shotMeta.o, shotCount, 5),
    t: chan(shotMeta.o, shotCount, 6),
  };

  return {
    schema: encoded.schema,
    seed: encoded.seed >>> 0,
    ticks: encoded.ticks | 0,
    tickRate: encoded.tickRate | 0,
    shipRate: encoded.shipRate | 0,
    seconds: (encoded.ticks | 0) / (encoded.tickRate || TAPE_TICK_RATE),
    quant: q,
    ships, shots, guided,
  };
}

/** FNV-1a of the encoded object's canonical text — the staleness fingerprint tests compare. */
export function hashEncodedTape(encoded) {
  const text = JSON.stringify(encoded);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function base64FromBytes(bytes) {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(s);
}

function bytesFromBase64(b64) {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'));
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes;
}
