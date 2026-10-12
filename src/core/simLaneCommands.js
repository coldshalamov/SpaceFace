// S1 Phase-B stage 5 — lane-indirection for the former synchronous main→sim write surface.
//
// Every census `state.*` write routes through a lane writer here. Two modes:
//   - No sink installed (today's SIM_LANE=main): the writer calls the SAME shared applier
//     the worker drain uses → byte-identical direct mutation, unchanged semantics.
//   - Sink installed (whole-sim worker mode): the writer emits a command descriptor only.
//     Local state is untouched; the value lands when the worker drains the envelope and the
//     mirror brings it back. sink(descriptor) is installed by the host transport, which owns
//     correlation (rpc promises, spawn acks).
//
// The command ring (scripts/lib/simCommandChannel.mjs) imports the shared appliers + the
// settings allowlist from here — one source of truth for "which writes are legal".

let _sink = null;
let _tokenSeq = 0;

/** Install the lane sink. sink(descriptor) may return a value (rpc → pending Promise). */
export function installSimCommandSink(sink) {
  _sink = sink;
  return () => { _sink = null; };
}
export function uninstallSimCommandSink() { _sink = null; }
export function laneCommandSink() { return _sink; }
export function nextLaneToken(prefix) {
  return `${prefix || 'lane'}:${(++_tokenSeq).toString(36)}:${Date.now().toString(36)}`;
}

// ---------------------------------------------------------------------------
// Fold — allowlisted state paths carried on the next INPUT envelope's p.writes
// and applied on the worker immediately after applyInput, in wire order. Writers
// take (state, value) — the same mutation the direct site performed, verbatim.
// ---------------------------------------------------------------------------
export const LANE_INPUT_FOLD_WRITERS = {
  'player.targetId': (state, v) => { if (state.player) state.player.targetId = (v == null ? null : v); },
  'input.targetAssistDisabled': (state, v) => { if (state.input) state.input.targetAssistDisabled = !!v; },
  'input.autoAim': (state, v) => { if (state.input) state.input.autoAim = v; },
  'input.autoFire': (state, v) => { if (state.input) state.input.autoFire = v; },
  'input.pursuitSlot': (state, v) => { if (state.input) state.input.pursuitSlot = v; },
  'input.blocked': (state, v) => { if (state.input) state.input.blocked = v; },
  // undefined over the wire deletes the key — call sites use `delete inp.worldObjectTargetId`.
  'input.worldObjectTargetId': (state, v) => {
    if (!state.input) return;
    if (v === undefined) delete state.input.worldObjectTargetId;
    else state.input.worldObjectTargetId = v;
  },
  'ui.objectSelection': (state, v) => { if (!state.ui) state.ui = {}; state.ui.objectSelection = v; },
  'ui.docked': (state, v) => { if (!state.ui) state.ui = {}; state.ui.docked = !!v; },
  'ui.dockedStationId': (state, v) => { if (!state.ui) state.ui = {}; state.ui.dockedStationId = (v == null ? null : v); },
};

export function applyLaneInputWrites(state, writes) {
  if (!Array.isArray(writes) || writes.length === 0) return 0;
  let applied = 0;
  for (const w of writes) {
    if (!w || typeof w !== 'object') continue;
    const fn = LANE_INPUT_FOLD_WRITERS[w.path];
    if (!fn) continue;
    fn(state, w.value);
    applied += 1;
  }
  return applied;
}

/** Replace `state.<path> = v` at call sites. Always safe to call. */
export function laneInputWrite(state, path, value) {
  if (_sink) { _sink({ kind: 'inputFold', path, value }); return true; }
  const fn = LANE_INPUT_FOLD_WRITERS[path];
  if (!fn || !state) return false;
  fn(state, value);
  return true;
}

// ---------------------------------------------------------------------------
// state.mode — the worker applies the write AND emits mode:changed on its own bus
// so sim-side consumers react; main-side UX emits stay local at the call sites.
// ---------------------------------------------------------------------------
export function applyLaneMode(state, bus, mode) {
  if (!state || typeof mode !== 'string' || mode.length === 0) return false;
  state.mode = mode;
  if (bus && typeof bus.emit === 'function') bus.emit('mode:changed', { mode });
  return true;
}
export function laneSetMode(state, bus, mode) {
  if (_sink) { _sink({ kind: 'mode', mode }); return true; }
  // Direct path stays the bare write — the caller's lane emitted nothing before.
  if (!state) return false;
  state.mode = mode;
  return true;
}

// ---------------------------------------------------------------------------
// state.nav.waypoint — set/clear. Sim-authored follow-ups (nav:waypoint et al.) stay
// main-side at the call site; the worker apply is state truth only.
// ---------------------------------------------------------------------------
export function applyLaneNav(state, p) {
  if (!state || !p || typeof p !== 'object') return false;
  if (!state.nav || typeof state.nav !== 'object') state.nav = {};
  if (p.clear === true) { state.nav.waypoint = null; return true; }
  if (p.waypoint !== undefined) { state.nav.waypoint = p.waypoint; return true; }
  return false;
}
export function laneSetNavWaypoint(state, waypoint) {
  if (_sink) { _sink({ kind: 'nav', waypoint }); return true; }
  return applyLaneNav(state, { waypoint });
}
export function laneClearNavWaypoint(state) {
  if (_sink) { _sink({ kind: 'nav', clear: true }); return true; }
  return applyLaneNav(state, { clear: true });
}

// ---------------------------------------------------------------------------
// settings writes — allowlisted keys only. Includes the prior channel allowlist
// (timeScale, gameplay.difficulty) plus the census UI/video paths.
// ---------------------------------------------------------------------------
export const LANE_SETTINGS_WRITERS = {
  timeScale: (state, value) => {
    const v = Number(value);
    if (Number.isFinite(v) && v >= 0) state.timeScale = v;
  },
  'settings.gameplay.difficulty': (state, value) => {
    if (!state.settings || typeof state.settings !== 'object') return;
    const gameplay = state.settings.gameplay || (state.settings.gameplay = {});
    gameplay.difficulty = value;
  },
  'settings.ui.overviewOpen': (state, value) => {
    if (!state.settings || typeof state.settings !== 'object') return;
    const ui = state.settings.ui || (state.settings.ui = {});
    ui.overviewOpen = !!value;
  },
  'settings.ui.hudLayout': (state, value) => {
    if (!state.settings || typeof state.settings !== 'object') return;
    if (!value || typeof value !== 'object' || typeof value.key !== 'string') return;
    const ui = state.settings.ui || (state.settings.ui = {});
    const layout = ui.hudLayout || (ui.hudLayout = {});
    layout[value.key] = { x: Number(value.x) || 0, y: Number(value.y) || 0 };
  },
  'settings.video.bloom': (s, v) => { if (s.settings && s.settings.video) s.settings.video.bloom = !!v; },
  'settings.video.exposure': (s, v) => { if (s.settings && s.settings.video) s.settings.video.exposure = v; },
  'settings.video.grade': (s, v) => { if (s.settings && s.settings.video) s.settings.video.grade = v; },
  'settings.video.vignette': (s, v) => { if (s.settings && s.settings.video) s.settings.video.vignette = v; },
  'settings.video.grain': (s, v) => { if (s.settings && s.settings.video) s.settings.video.grain = v; },
};

export function applyLaneSetting(state, key, value) {
  if (!state) return false;
  const fn = LANE_SETTINGS_WRITERS[key];
  if (fn) { fn(state, value); return true; }
  // Generic deep-path writer: settings.<section>[.<nested>...].<leaf>. Covers
  // the whole settings tree the settings surface mutates (gameplay, controls,
  // accessibility, audio, video, ui) without a per-key writer entry; explicit
  // writers above keep precedence for shaped values.
  if (typeof key === 'string' && key.startsWith('settings.')) {
    const segs = key.split('.');
    if (segs.length >= 2) {
      let node = state.settings && typeof state.settings === 'object'
        ? state.settings
        : (state.settings = {});
      for (let i = 1; i < segs.length - 1; i++) {
        const next = node[segs[i]];
        node = (next && typeof next === 'object') ? next : (node[segs[i]] = {});
      }
      node[segs[segs.length - 1]] = value;
      return true;
    }
  }
  return false;
}
export function laneWriteSetting(state, key, value) {
  if (_sink) { _sink({ kind: 'settings', key, value }); return true; }
  return applyLaneSetting(state, key, value);
}

// Wall-clock keepalive — registry.keepalive(0, frameDt) is sim-owned under the
// lane, so the worker's registry must receive the frame dt explicitly. The
// worker runs keepalive(0, wallDt): yard repair and friends tick while the
// world is frozen.
export function laneKeepalive(wallDt) {
  if (!_sink) return false;
  _sink({ kind: 'keepalive', wallDt: Number.isFinite(wallDt) ? wallDt : 0 });
  return true;
}

// ---------------------------------------------------------------------------
// spawn / remove / promote — sink-only emits. Without a sink the call site keeps
// its existing direct helpers.* call (return value null/false → fall through).
// ---------------------------------------------------------------------------
export function laneSpawnEntity(spec, meta) {
  if (!_sink) return null;
  const token = nextLaneToken('spawn');
  _sink({ kind: 'spawn', token, spec, meta: meta || null });
  return token;
}
export function laneRemoveEntity(id, opts) {
  if (!_sink) return null;
  const token = nextLaneToken('remove');
  _sink({ kind: 'remove', token, id, opts: opts || null });
  return token;
}
export function lanePromote(p) {
  if (!_sink || !p || p.id == null) return false;
  _sink({ kind: 'promote', id: p.id, source: p.source || 'actor', reason: p.reason || '' });
  return true;
}

// ---------------------------------------------------------------------------
// rpc — correlated request/response. Sink returns the pending Promise (the host
// transport resolves it from the tick reply's rpcAcks). Without a sink a locally
// registered handler runs (SIM_LANE=main keeps its own sim).
// ---------------------------------------------------------------------------
const _rpcHandlers = new Map();
export function registerLaneRpcHandler(op, fn) { _rpcHandlers.set(op, fn); }
export function laneRpc(op, args) {
  if (_sink) return _sink({ kind: 'rpc', id: nextLaneToken('rpc'), op, args: args || {} });
  const fn = _rpcHandlers.get(op);
  if (!fn) return Promise.resolve({ ok: false, error: `no lane rpc handler for ${op}` });
  try {
    return Promise.resolve(fn(args || {})).then((result) => ({ ok: true, result }));
  } catch (e) {
    return Promise.resolve({ ok: false, error: String((e && e.message) || e) });
  }
}

// ---------------------------------------------------------------------------
// spawn-ack fanout: call sites that need the spawned id register a one-shot cb.
// The host transport calls laneNotifySpawnAcks(tickReply.spawnAcks) each reply.
// ---------------------------------------------------------------------------
const _spawnAckCbs = new Map();
export function onLaneSpawnAck(token, cb) {
  if (typeof cb === 'function') _spawnAckCbs.set(token, cb);
}
export function laneNotifySpawnAcks(acks) {
  if (!Array.isArray(acks) || _spawnAckCbs.size === 0) return;
  for (const a of acks) {
    if (!a || !_spawnAckCbs.has(a.token)) continue;
    const cb = _spawnAckCbs.get(a.token);
    _spawnAckCbs.delete(a.token);
    try { cb(a.id, a.ok !== false, a.error); } catch (e) { /* listener errors are caller bugs */ }
  }
}

// ---------------------------------------------------------------------------
// Stage-8 lane emits — DOM event descriptors, the ui fold, and the viewport
// size. Sink-only: on the main lane these are no-ops (the sim lives locally and
// already reads the real DOM). Emitters return true when shipped.
// ---------------------------------------------------------------------------
export function laneDomEvent(d) {
  if (!_sink || !d || typeof d !== 'object') return false;
  _sink({ kind: 'domEvent', d });
  return true;
}

export function laneUiFold(p) {
  if (!_sink || !p || typeof p !== 'object') return false;
  _sink({ kind: 'uiFold', p });
  return true;
}

export function laneViewport(w, h) {
  if (!_sink) return false;
  _sink({ kind: 'viewport', w, h });
  return true;
}

// Generic sim-bus event replay (main → worker): the sim's listener set inside
// the worker hears it exactly like a local emit. Emitter-side callers wrap
// their own emit with a forward-suppression latch so drained worker→main
// events never echo back.
export function laneBusEmit(type, payload) {
  if (!_sink || typeof type !== 'string' || type.length === 0) return false;
  _sink({ kind: 'busEmit', emit: type, payload });
  return true;
}
