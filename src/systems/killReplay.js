// §22 B9 — the last five seconds of a kill, from the positions the sim already stepped.
// Round end plays that path back. Skip leaves the results model alone.
// The ring is fixed-size. Nothing here writes velocity, credits, or the run.

export const KILL_REPLAY_S = 5;
export const KILL_REPLAY_DT = 1 / 60;
const CAP = Math.round(KILL_REPLAY_S / KILL_REPLAY_DT);

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
  const consider = (ent) => {
    if (!ent || ent === player || ent.alive === false || !ent.pos) return;
    if (ent.type !== 'ship' && ent.type !== 'wreck') return;
    const dx = ent.pos.x - player.pos.x;
    const dz = ent.pos.z - player.pos.z;
    const d = dx * dx + dz * dz;
    if (d < bestD) { best = ent; bestD = d; }
  };
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

export const killReplay = {
  name: 'killReplay',

  init(ctx) {
    this.state = ctx && ctx.state;
    resetKillReplay();
  },

  update(_dt, state) {
    const live = state || this.state;
    if (!liveRun(live)) return;
    const player = live.entities && live.playerId != null ? live.entities.get(live.playerId) : null;
    if (!player || !player.pos) return;
    const other = nearestOther(live, player);
    const bx = other && other.pos ? other.pos.x : player.pos.x;
    const bz = other && other.pos ? other.pos.z : player.pos.z;
    pushSample(player.pos.x, player.pos.z, bx, bz);
  },
};
