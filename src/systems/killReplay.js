// §22 B9 — the last five seconds of a kill, from the positions the sim already stepped.
// Round end plays that path back. Skip leaves the results model alone.
// The ring is fixed-size. Nothing here writes velocity, credits, or the run.
//
// ADVENTURE TAPE — the flight side of the same instrument. The replay surface is a tape: it
// needs ticks, a seed, an input ring to read boost burns from, and event marks. This producer
// keeps the last TAPE window of flight ticks in fixed typed arrays (one Map.get + one byte per
// tick, no per-tick allocation) and publishes it at state.replay.recording — the exact field
// the Replay surface resolves when nothing else published a tape. Event marks are stored in the
// window's own tick space so old marks age out with the tape instead of pointing past it.

export const KILL_REPLAY_S = 5;
export const KILL_REPLAY_DT = 1 / 60;
const CAP = Math.round(KILL_REPLAY_S / KILL_REPLAY_DT);

/** The Adventure tape window (the surface's own tape length). */
export const ADVENTURE_TAPE_S = 30;
const TAPE_CAP = Math.round(ADVENTURE_TAPE_S * 60);
const TAPE_MAX_MARKS = 32;

const ring = {
  count: 0,
  head: 0,
  px: new Float32Array(CAP),
  pz: new Float32Array(CAP),
  bx: new Float32Array(CAP),
  bz: new Float32Array(CAP),
};

function liveRun(state) {
  const run = state && state.run;
  return !!(run && run.kind === 'survival' && run.phase && run.phase !== 'inactive');
}

export function resetKillReplay() {
  ring.count = 0;
  ring.head = 0;
}

function pushSample(px, pz, bx, bz) {
  const i = ring.head;
  ring.px[i] = px;
  ring.pz[i] = pz;
  ring.bx[i] = bx;
  ring.bz[i] = bz;
  ring.head = (i + 1) % CAP;
  if (ring.count < CAP) ring.count += 1;
}

function samplesFromRing() {
  const n = ring.count;
  const out = new Array(n);
  const start = ring.count < CAP ? 0 : ring.head;
  for (let i = 0; i < n; i += 1) {
    const at = (start + i) % CAP;
    out[i] = { x: ring.px[at], z: ring.pz[at], bx: ring.bx[at], bz: ring.bz[at] };
  }
  return out;
}

/** Test and system share this. One sample of where the bodies were. */
export function noteKillReplaySample(px, pz, bx, bz) {
  pushSample(Number(px) || 0, Number(pz) || 0, Number(bx) || 0, Number(bz) || 0);
}

function nearestOther(state, player) {
  if (!state || !player || !player.pos) return null;
  let best = null;
  let bestD = Infinity;
  const px = player.pos.x;
  const pz = player.pos.z;
  // Plain inlined loop: this runs every sim tick over live ships (the replay ring samples
  // at 60 Hz). A closer wreck must not steal the body track — captureKillReplay stamps the
  // death sample onto the victim. First strict minimum in iteration order wins. The entity
  // index's ships bucket is the live-hull walk; the fat list is only used when the index
  // is not ready.
  const consider = (ent) => {
    if (!ent || ent === player || ent.alive === false || !ent.pos) return;
    if (ent.type !== 'ship') return;
    const dx = ent.pos.x - px;
    const dz = ent.pos.z - pz;
    const d = dx * dx + dz * dz;
    if (d < bestD) { best = ent; bestD = d; }
  };
  const index = state.entityIndex;
  const indexed = index && index.__spacefaceEntityIndexV1 && index.ready === true
    && Array.isArray(index.ships);
  if (indexed) {
    for (let i = 0; i < index.ships.length; i += 1) consider(index.ships[i]);
    return best;
  }
  const list = state.entityList;
  if (list && list.length) {
    for (let i = 0; i < list.length; i += 1) consider(list[i]);
  } else if (state.entities && typeof state.entities.forEach === 'function') {
    state.entities.forEach(consider);
  }
  return best;
}

/**
 * Freeze the ring plus the body that just died.
 * `samples` is the path. The last sample is the death.
 */
export function captureKillReplay(state, victim) {
  const run = state && state.run;
  const seed = run && Number.isInteger(run.seed) ? run.seed : 0;
  const tick = state && Number.isInteger(state.tick) ? state.tick : 0;
  const player = state && state.entities && state.playerId != null
    ? state.entities.get(state.playerId)
    : null;
  if (victim && victim.pos) {
    const px = player && player.pos ? player.pos.x : victim.pos.x;
    const pz = player && player.pos ? player.pos.z : victim.pos.z;
    pushSample(px, pz, victim.pos.x, victim.pos.z);
  }
  const samples = samplesFromRing();
  const radius = victim && Number(victim.collisionRadius) > 0 ? victim.collisionRadius : 8;
  if (!samples.length) return null;
  return {
    seed,
    tick,
    durationS: KILL_REPLAY_S,
    hullLength: radius,
    skipped: false,
    samples,
    body: samples[samples.length - 1],
  };
}

/** Where the replay is at `elapsed` seconds. t = 5s is the death sample. */
export function replaySampleAt(record, elapsedSeconds) {
  const samples = record && record.samples;
  if (!samples || !samples.length) return null;
  const duration = record.durationS > 0 ? record.durationS : KILL_REPLAY_S;
  const u = Math.max(0, Math.min(1, (Number(elapsedSeconds) || 0) / duration));
  const index = Math.min(samples.length - 1, Math.round(u * (samples.length - 1)));
  return samples[index];
}

export function killReplayActions(result) {
  const replay = result && result.killReplay;
  if (!replay || replay.skipped || !replay.samples || replay.samples.length < 2) return [];
  return ['Replay the last kill', 'Skip the replay'];
}

export function skipKillReplay(result) {
  if (!result || !result.killReplay) return result;
  result.killReplay = { ...result.killReplay, skipped: true };
  return result;
}

// ── the Adventure tape ──────────────────────────────────────────────────────

const tape = {
  count: 0,            // samples held (≤ TAPE_CAP)
  total: 0,            // flight ticks stepped since the tape started
  head: 0,             // next write slot
  boost: new Uint8Array(TAPE_CAP),
  marks: [],           // { at (absolute tape tick), type, label } — windowed on publish
  marksVersion: 0,     // bumped only when marks change; the published list rebuilds then
  publishedVersion: -1,
};

function resetAdventureTape() {
  tape.count = 0;
  tape.total = 0;
  tape.head = 0;
  tape.marks.length = 0;
  tape.marksVersion += 1;
}

function tapeBoostAt(absoluteTick) {
  const base = tape.total - tape.count;
  if (absoluteTick < base || absoluteTick >= tape.total) return 0;
  return tape.boost[absoluteTick % TAPE_CAP];
}

function entityLabel(entity) {
  const data = entity && entity.data || {};
  const value = data.callsign || data.displayName || data.name
    || (data.def && data.def.name) || data.defId || entity && entity.name;
  const text = String(value || '').trim();
  return text || 'Kill';
}

function recordTape(state) {
  if (!state || state.mode !== 'flight') return;
  const player = state.entities && state.playerId != null
    ? state.entities.get(state.playerId)
    : null;
  if (!player) return;
  const intent = player.data && player.data.intent || null;
  tape.boost[tape.head] = intent && intent.boost === true ? 1 : 0;
  tape.head = (tape.head + 1) % TAPE_CAP;
  if (tape.count < TAPE_CAP) tape.count += 1;
  tape.total += 1;

  const recording = state.replay && state.replay.recording;
  if (!recording) return;
  const ticks = tape.count;
  recording.ticks = ticks;
  recording.seconds = ticks * KILL_REPLAY_DT;
  recording.base = tape.total - ticks;
  if (tape.marksVersion !== tape.publishedVersion) {
    rebuildTapeMarks(recording, recording.base);
  } else if (recording.events.length && tape.count >= TAPE_CAP) {
    // The full window slides one tick; the published marks slide with it in place — no
    // per-tick allocation. Aged-out marks go negative and the surface's own guards skip them.
    for (let i = 0; i < recording.events.length; i += 1) recording.events[i].tick -= 1;
  }
}

function rebuildTapeMarks(recording, base) {
  recording.events.length = 0;
  for (let i = 0; i < tape.marks.length; i += 1) {
    const mark = tape.marks[i];
    const at = mark.at - base;
    if (at >= 0) recording.events.push({ tick: at, type: mark.type, label: mark.label });
  }
  tape.publishedVersion = tape.marksVersion;
}

function addTapeMark(state, type, label) {
  if (tape.total <= 0) return;
  tape.marks.push({ at: tape.total - 1, type, label });
  if (tape.marks.length > TAPE_MAX_MARKS) tape.marks.shift();
  tape.marksVersion += 1;
  // Publish eagerly: a pause right after the kill must not lose the mark.
  const recording = state && state.replay && state.replay.recording;
  if (recording) rebuildTapeMarks(recording, tape.total - tape.count);
}

/** Test seam: the windowed tape in its published shape. */
export function adventureTapeRecording(state) {
  if (!state) return null;
  state.replay = state.replay || {};
  if (!state.replay.recording) {
    state.replay.recording = {
      seed: state.meta && state.meta.seed != null ? state.meta.seed : 0,
      tickRate: 60,
      ticks: 0,
      seconds: 0,
      base: 0,
      snapshotRing: null,
      events: [],
      inputRing: {
        read(winTick) {
          const boost = tapeBoostAt((state.replay.recording.base || 0) + winTick);
          return { data: { boost: boost === 1 } };
        },
      },
    };
  }
  return state.replay.recording;
}

export const killReplay = {
  name: 'killReplay',

  init(ctx) {
    this.state = ctx && ctx.state;
    resetKillReplay();
    resetAdventureTape();
    if (this.state) adventureTapeRecording(this.state);
    const bus = ctx && ctx.bus;
    if (bus && typeof bus.on === 'function') {
      this._offTapeNew = bus.on('game:new', () => {
        resetAdventureTape();
        if (this.state) {
          const recording = adventureTapeRecording(this.state);
          recording.ticks = 0;
          recording.seconds = 0;
          recording.base = 0;
          recording.events.length = 0;
        }
      });
      this._offTapeKill = bus.on('entity:killed', (p) => {
        if (!p || p.killerId == null || !this.state) return;
        if (p.killerId !== this.state.playerId) return;
        const victim = this.state.entities
          ? this.state.entities.get(p.id) : null;
        addTapeMark(this.state, 'kill', entityLabel(victim));
      });
      this._offTapeTrick = bus.on('stunt:trickDetected', (p) => {
        if (!this.state || !p) return;
        const actor = p.actorId != null ? p.actorId : null;
        if (actor != null && actor !== this.state.playerId) return;
        addTapeMark(this.state, 'stunt', String(p.name || p.trickId || 'Stunt'));
      });
    }
  },

  update(_dt, state) {
    const live = state || this.state;
    if (liveRun(live)) {
      const player = live.entities && live.playerId != null ? live.entities.get(live.playerId) : null;
      if (!player || !player.pos) return;
      const other = nearestOther(live, player);
      const bx = other && other.pos ? other.pos.x : player.pos.x;
      const bz = other && other.pos ? other.pos.z : player.pos.z;
      pushSample(player.pos.x, player.pos.z, bx, bz);
      return;
    }
    recordTape(live);
  },
};
