// The instant kill-cam tape (DEMO_READINESS_2026-09-20 §4 "The toy (swarm)", NEW:
// instant kill-cam). During a survival run a presentation-side recorder walks the poses
// the sim already stepped into a bounded ring buffer — last ~5 s, the player, the
// hostiles, their rounds. Round end hands the tail to the results screen, where a
// replay stage (src/render/killcamStage.js) plays the fight back once behind the plate.
//
// The same discipline as the live title tape (titleAttractTape.js), without the bake:
// the schema keeps the encode/decode split — the recorder writes only what the sim
// produced (read-only: it never writes state, velocity, credits, or the run), and
// `encodeKillcamTape` seals a self-contained tape the stage consumes through
// `decodeKillcamTape`. A later deterministic re-sim can replace the recorder wholesale
// and leave the tape shape — and every consumer behind it — untouched. One deliberate
// divergence from the baked title tape: samples ride in Float32Arrays, not base64
// int16 — this tape crosses a module boundary in memory, never a source file, so the
// quantize step would be serialization ritual without a serialization payoff.
//
// Bounds (the recorder runs on the live 60 Hz sim — it must never cost the frame):
//   - sampling cadence every 2nd tick (30 Hz), ships and rounds alike;
//   - preallocated typed rings, one per track; no per-tick allocation beyond track
//     metadata reuse — a pool of ship tracks and round tracks is recycled oldest-dead
//     first when a wave outspawns the pool;
//   - capacity: 48 ship tracks + 128 round tracks x 150 samples ≈ 240 KB resident,
//     tape encode ~2x transiently for the few seconds the results screen is up.

export const KILLCAM_TAPE_SCHEMA = 'spaceface.killcamTape.v1';

/** How much fight the tape holds. The demo doc names five seconds. */
export const KILLCAM_WINDOW_S = 5;
/** Sim ticks between samples: 60 Hz sim, 30 Hz tape. */
export const KILLCAM_SAMPLE_STRIDE = 2;
export const KILLCAM_SAMPLE_RATE = 60 / KILLCAM_SAMPLE_STRIDE;
export const KILLCAM_SAMPLE_COUNT = KILLCAM_WINDOW_S * KILLCAM_SAMPLE_RATE;

/** Bounded entity set: the player, the hostiles alive in the window, their rounds. */
export const KILLCAM_MAX_SHIPS = 48;
export const KILLCAM_MAX_ROUNDS = 128;
/** Ship deaths in the window (kill flashes). */
export const KILLCAM_MAX_FLASHES = 96;

const SHIP_STRIDE = 3; // x, z, rot per sample — the attract tape's channel order
const ROUND_STRIDE = 2; // x, z per sample (heading is derived between neighbours)

const wrapPi = (a) => {
  let v = a % (Math.PI * 2);
  if (v > Math.PI) v -= Math.PI * 2;
  else if (v < -Math.PI) v += Math.PI * 2;
  return v;
};

function createShipTrack() {
  return {
    used: false,
    id: null,
    team: 0,
    player: false,
    visual: null,
    silhouette: null,
    radius: 0,
    firstSample: 0,   // global sample index currently in ring slot 0
    lastSample: -1,   // global sample index of the newest written sample
    dead: false,
    deathSample: -1,
    // Death velocity for the wreck drift, derived at close time from the last two samples.
    vx: 0, vz: 0, wz: 0,
    ring: new Float32Array(KILLCAM_SAMPLE_COUNT * SHIP_STRIDE),
  };
}

function createRoundTrack() {
  return {
    used: false,
    id: null,
    team: 0,
    firstSample: 0,
    lastSample: -1,
    dead: false,
    ring: new Float32Array(KILLCAM_SAMPLE_COUNT * ROUND_STRIDE),
  };
}

/**
 * The recorder. `note(state)` runs once per sim tick while a survival run is live;
 * it reads poses only and allocates nothing on the steady path. `clear()` is the round
 * boundary. `encodeKillcamTape()` seals the window.
 */
export function createKillcamRecorder(options = {}) {
  const stride = Number.isInteger(options.sampleStride) && options.sampleStride >= 1
    ? options.sampleStride : KILLCAM_SAMPLE_STRIDE;
  const sampleCount = Number.isInteger(options.sampleCount) && options.sampleCount >= 2
    ? options.sampleCount : KILLCAM_SAMPLE_COUNT;
  const maxShips = Number.isInteger(options.maxShips) && options.maxShips >= 1
    ? options.maxShips : KILLCAM_MAX_SHIPS;
  const maxRounds = Number.isInteger(options.maxRounds) && options.maxRounds >= 1
    ? options.maxRounds : KILLCAM_MAX_ROUNDS;
  const maxFlashes = Number.isInteger(options.maxFlashes) && options.maxFlashes >= 1
    ? options.maxFlashes : KILLCAM_MAX_FLASHES;

  const ships = new Array(maxShips);
  for (let i = 0; i < maxShips; i++) ships[i] = createShipTrack();
  const rounds = new Array(maxRounds);
  for (let i = 0; i < maxRounds; i++) rounds[i] = createRoundTrack();
  const byId = new Map(); // entity id -> track (ship or round)
  // Ship deaths in the window, oldest first: ring of [sample, x, z, size].
  const flashes = new Float32Array(maxFlashes * 4);
  const flashState = { head: 0, count: 0 };

  function recycleOldest(pool) {
    // The pool is small; a once-per-wave scan beats a free-list for the same result.
    // Preference: an unused track, then a dead one, then the oldest live one — a live
    // hull's samples are the ones still being watched, so it loses its ring last.
    for (const track of pool) if (!track.used) return track;
    let best = null;
    let bestScore = Infinity;
    for (const track of pool) {
      const score = (track.dead ? 0 : 1e9) + Math.max(0, track.lastSample);
      if (score < bestScore) { bestScore = score; best = track; }
    }
    if (best && best.id != null && byId.get(best.id) === best) byId.delete(best.id);
    return best;
  }

  function pushFlash(sample, x, z, size) {
    const at = flashState.head;
    flashes[at * 4] = sample;
    flashes[at * 4 + 1] = x;
    flashes[at * 4 + 2] = z;
    flashes[at * 4 + 3] = size;
    flashState.head = (at + 1) % maxFlashes;
    flashState.count = Math.min(maxFlashes, flashState.count + 1);
  }

  const recorder = {
    get sampleSeq() { return recorder._sampleSeq | 0; },
    _sampleSeq: 0,

    /** Wipe everything — the round boundary (run:started). */
    clear() {
      byId.clear();
      for (const track of ships) { track.used = false; track.id = null; track.dead = false; track.lastSample = -1; }
      for (const track of rounds) { track.used = false; track.id = null; track.dead = false; track.lastSample = -1; }
      flashState.head = 0;
      flashState.count = 0;
      recorder._sampleSeq = 0;
    },

    /**
     * Read one frame of the world. Called every sim tick; samples land every `stride`
     * ticks. Reads only — entity poses, teams, visual identities.
     */
    note(state) {
      if (!state) return;
      const tick = Number.isInteger(state.tick) ? state.tick : 0;
      if (tick % stride !== 0) return;
      const seq = tick / stride;
      recorder._sampleSeq = seq;

      const list = state.entityList;
      if (Array.isArray(list)) {
        for (let i = 0; i < list.length; i++) {
          const e = list[i];
          if (!e || !e.pos || e.alive === false) continue;
          if (e.type !== 'ship' && e.type !== 'projectile') continue;
          const isShip = e.type === 'ship';
          let track = byId.get(e.id);
          if (track && (track.dead || seq - track.lastSample > 1)) {
            // A stale hit means the id came back (or the track was recycled under us):
            // the old samples must not bleed into the new life. Start the track over.
            if (byId.get(e.id) === track) byId.delete(e.id);
            track = null;
          }
          if (!track) {
            track = isShip ? recycleOldest(ships) : recycleOldest(rounds);
            if (!track) continue; // pool bounds hold even in a pathological wave
            track.used = true;
            track.id = e.id;
            track.firstSample = seq;
            track.lastSample = -1;
            track.dead = false;
            track.deathSample = -1;
            track.vx = 0; track.vz = 0; track.wz = 0;
            if (isShip) {
              track.team = e.team | 0;
              track.player = state.playerId != null && e.id === state.playerId;
              track.visual = (e.data && (e.data.lootTableId || e.data.defId)) || null;
              track.silhouette = (e.data && e.data.silhouette) || null;
              track.radius = Number.isFinite(e.radius) ? e.radius : 0;
            } else {
              track.team = e.team | 0;
            }
            byId.set(e.id, track);
          }
          const slot = seq % sampleCount;
          if (isShip) {
            const base = slot * SHIP_STRIDE;
            track.ring[base] = e.pos.x;
            track.ring[base + 1] = e.pos.z;
            track.ring[base + 2] = Number.isFinite(e.rot) ? e.rot : 0;
          } else {
            const base = slot * ROUND_STRIDE;
            track.ring[base] = e.pos.x;
            track.ring[base + 1] = e.pos.z;
          }
          track.lastSample = seq;
        }
      }

      // Close what died since the last accepted sample — alive flag dropped or entity
      // swept. A closed ship leaves its samples in place (the wreck) and a death flash.
      for (const [id, track] of byId) {
        if (track.dead || track.lastSample < 0 || track.lastSample >= seq) continue;
        const stillThere = findAlive(list, id);
        if (stillThere) continue;
        track.dead = true;
        if (isShipTrack(track)) {
          track.deathSample = track.lastSample;
          const [x, z, rot, vx, vz, wz] = shipDeathMotion(track, sampleCount);
          track.vx = vx; track.vz = vz; track.wz = wz;
          pushFlash(track.lastSample, x, z, Math.max(2.5, (track.radius || 0) * 2.6));
        }
        // Dead tracks keep their ring until recycled — the wreck and its flash replay
        // for as long as they stay inside the window.
      }
    },

    /** Ship death flashes, ascending by sample, inside the window [fromSample, toSample]. */
    flashesBetween(fromSample, toSample) {
      const out = [];
      for (let i = 0; i < flashState.count; i++) {
        const at = (flashState.head - flashState.count + i + maxFlashes) % maxFlashes;
        const sample = flashes[at * 4];
        if (sample >= fromSample && sample <= toSample) {
          out.push({ sample, x: flashes[at * 4 + 1], z: flashes[at * 4 + 2], size: flashes[at * 4 + 3] });
        }
      }
      return out;
    },

    /** Test seam: live track census. */
    census() {
      let shipCount = 0, roundCount = 0;
      for (const track of ships) if (track.used) shipCount++;
      for (const track of rounds) if (track.used) roundCount++;
      return { ships: shipCount, rounds: roundCount, flashes: flashState.count, sampleSeq: recorder._sampleSeq };
    },

    _ships: ships,
    _rounds: rounds,
  };
  return recorder;
}

function findAlive(list, id) {
  if (!Array.isArray(list)) return false;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e && e.id === id && e.alive !== false) return true;
  }
  return false;
}

function isShipTrack(track) {
  return track && track.ring.length === KILLCAM_SAMPLE_COUNT * SHIP_STRIDE;
}

/** Last pose + finite-difference velocity of a dying ship, from its ring. */
function shipDeathMotion(track, sampleCount) {
  const s = track.lastSample;
  const at = (i) => ((i % sampleCount) + sampleCount) % sampleCount;
  const i0 = at(s - 1), i1 = at(s);
  const x0 = track.ring[i0 * SHIP_STRIDE], z0 = track.ring[i0 * SHIP_STRIDE + 1];
  const x1 = track.ring[i1 * SHIP_STRIDE], z1 = track.ring[i1 * SHIP_STRIDE + 1];
  const r0 = track.ring[i0 * SHIP_STRIDE + 2], r1 = track.ring[i1 * SHIP_STRIDE + 2];
  const dt = 1 / KILLCAM_SAMPLE_RATE;
  return [
    x1, z1, r1,
    (x1 - x0) / dt, (z1 - z0) / dt,
    wrapPi(r1 - r0) / dt,
  ];
}


/**
 * Seal the window into a self-contained tape: per-track sample copies out of the rings
 * (the ring is about to keep recording — the copy is the boundary), plus the flash list.
 * Plain data + typed arrays; the stage's decoder is the only intended consumer.
 */
export function encodeKillcamTape(recorder, meta = {}) {
  if (!recorder) return null;
  const endSample = recorder.sampleSeq;
  const fromSample = Math.max(0, endSample - KILLCAM_SAMPLE_COUNT + 1);
  const ships = [];
  for (const track of recorder._ships) {
    if (!track.used || track.lastSample < fromSample) continue;
    const start = Math.max(track.firstSample, fromSample);
    const n = track.lastSample - start + 1;
    if (n < 1) continue;
    const x = new Float32Array(n);
    const z = new Float32Array(n);
    const r = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const slot = ((start + i) % KILLCAM_SAMPLE_COUNT) * SHIP_STRIDE;
      x[i] = track.ring[slot];
      z[i] = track.ring[slot + 1];
      r[i] = track.ring[slot + 2];
    }
    ships.push({
      team: track.team, player: track.player === true,
      visual: track.visual || null, silhouette: track.silhouette || null,
      radius: track.radius || 0,
      b: start - fromSample,            // sample index inside the tape
      d: track.dead ? track.lastSample - fromSample : -1,
      n,
      vx: track.vx || 0, vz: track.vz || 0, wz: track.wz || 0,
      x, z, r,
    });
  }
  const rounds = [];
  for (const track of recorder._rounds) {
    if (!track.used || track.lastSample < fromSample) continue;
    const start = Math.max(track.firstSample, fromSample);
    const n = track.lastSample - start + 1;
    if (n < 1) continue;
    const x = new Float32Array(n);
    const z = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const slot = ((start + i) % KILLCAM_SAMPLE_COUNT) * ROUND_STRIDE;
      x[i] = track.ring[slot];
      z[i] = track.ring[slot + 1];
    }
    rounds.push({ team: track.team, b: start - fromSample, n, x, z });
  }
  return {
    schema: KILLCAM_TAPE_SCHEMA,
    seed: meta.seed >>> 0 || 0,
    tickRate: 60,
    sampleRate: KILLCAM_SAMPLE_RATE,
    windowS: KILLCAM_WINDOW_S,
    endSample,
    samples: endSample - fromSample + 1,
    ships,
    rounds,
    flashes: recorder.flashesBetween(fromSample, endSample)
      .map((f) => ({ s: f.sample - fromSample, x: f.x, z: f.z, size: f.size })),
  };
}

/** Structural check every consumer applies before trusting a tape. */
export function isKillcamTape(tape) {
  return !!tape && tape.schema === KILLCAM_TAPE_SCHEMA
    && Array.isArray(tape.ships) && Array.isArray(tape.rounds)
    && Array.isArray(tape.flashes)
    && (tape.ships.length > 0 || tape.rounds.length > 0);
}

/**
 * Decode into samplers the stage interpolates. Allocates once at stage build; the
 * per-frame path below allocates nothing.
 */
export function decodeKillcamTape(tape) {
  if (!isKillcamTape(tape)) return null;
  const total = tape.samples | 0;
  const ships = tape.ships.map((ship) => ({
    ship,
    last: ship.n - 1,
    poseAt(t) {
      const n = ship.n;
      const f = Math.max(0, Math.min(n - 1, t - ship.b));
      const i0 = Math.floor(f), i1 = Math.min(n - 1, i0 + 1), a = f - i0;
      return {
        x: ship.x[i0] + (ship.x[i1] - ship.x[i0]) * a,
        z: ship.z[i0] + (ship.z[i1] - ship.z[i0]) * a,
        rot: ship.r[i0] + wrapPi(ship.r[i1] - ship.r[i0]) * a,
        turning: wrapPi(ship.r[i1] - ship.r[i0]) * KILLCAM_SAMPLE_RATE,
      };
    },
  }));
  const rounds = tape.rounds.map((round) => ({
    round,
    poseAt(t) {
      const n = round.n;
      const f = Math.max(0, Math.min(n - 1, t - round.b));
      const i0 = Math.floor(f), i1 = Math.min(n - 1, i0 + 1), a = f - i0;
      const x = round.x[i0] + (round.x[i1] - round.x[i0]) * a;
      const z = round.z[i0] + (round.z[i1] - round.z[i0]) * a;
      return { x, z, vx: (round.x[i1] - round.x[i0]) * KILLCAM_SAMPLE_RATE, vz: (round.z[i1] - round.z[i0]) * KILLCAM_SAMPLE_RATE };
    },
  }));
  return {
    tape,
    total,
    seconds: total / tape.sampleRate,
    ships, rounds,
    flashes: tape.flashes.slice().sort((a, b) => a.s - b.s),
  };
}

// ---------------------------------------------------------------------------------------------
// The session: one recorder for the live game, the same module-singleton posture as the
// kill-replay ring (src/systems/killReplay.js). The registry system below feeds it; the
// results screen pulls the sealed tape; run:started clears it.
// ---------------------------------------------------------------------------------------------

const session = {
  recorder: createKillcamRecorder(),
  tape: null,
  skipped: false,
};

/** The one registered system: read-only, run-bounded, clears on the round boundary. */
export const killcamRecorder = {
  name: 'killcamRecorder',

  init(ctx) {
    this.state = ctx && ctx.state;
    this.bus = ctx && ctx.bus;
    session.recorder.clear();
    session.tape = null;
    session.skipped = false;
    this._unsubs = [];
    if (this.bus && typeof this.bus.on === 'function') {
      // Round boundary: a fresh run wipes the ring, the seal, and any stale skip.
      this._unsubs.push(this.bus.on('run:started', () => clearKillcamTape()));
      this._unsubs.push(this.bus.on('game:started', () => clearKillcamTape()));
    }
  },

  update(_dt, state) {
    const live = state || this.state;
    const run = live && live.run;
    if (!run || run.kind !== 'survival' || !run.phase || run.phase === 'inactive') return;
    session.recorder.note(live);
  },

  destroy() {
    if (Array.isArray(this._unsubs)) {
      for (const off of this._unsubs) {
        try { if (typeof off === 'function') off(); } catch { /* teardown is best-effort */ }
      }
    }
    this._unsubs = null;
  },
};

/** Round boundary / "run again": everything about the last fight goes. */
export function clearKillcamTape() {
  session.recorder.clear();
  session.tape = null;
  session.skipped = false;
}

/**
 * Round end: seal the window once and hand it back. Sealing is idempotent — the results
 * screen can remount without the tape drifting under it; the next run:started replaces it.
 */
export function takeKillcamTape(meta = {}) {
  if (!session.tape) {
    session.tape = encodeKillcamTape(session.recorder, meta);
  }
  return session.tape;
}

/** Test/teaardown seam. */
export function killcamSessionCensus() {
  return session.recorder.census();
}

/** The stage request the results screen declares: plain data, no renderer import. */
export function killcamStageRequestFor(state) {
  if (session.skipped) return null;
  const video = state && state.settings && state.settings.video;
  if (video && video.motionReduce) return null;
  if (typeof matchMedia === 'function') {
    try { if (matchMedia('(prefers-reduced-motion: reduce)').matches) return null; } catch { /* host without media queries shows the still */ }
  }
  const tape = takeKillcamTape();
  if (!isKillcamTape(tape)) return null;
  return { scene: 'crucible-killcam' };
}

/** The results screen's visible SKIP: the still comes back and stays back. */
export function skipKillcamPlayback() {
  session.skipped = true;
}

/** The stage reads this every frame: a skipped film holds its tableau and stops moving. */
export function killcamPlaybackSkipped() {
  return session.skipped;
}
