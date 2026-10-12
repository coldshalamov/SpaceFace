// THE EAR — room tone. Every place has a designed quiet: the air of the room, the body of the
// structure, a pedal in the sector's key, and a sparse life layer (creaks, ticks, pings) that is
// pulsed on pooled nodes instead of spawning voices. Driven by the score director's frame, so a
// fight thins the room, the aftermath brings it back first, docking swaps space for the berth,
// and a new sector opens its room from closed. Presentation only.

import { resolveScoreIdentity, foldTonic, MODES } from './scoreDirector.js';

const SILENCE = 0.0001;
export const ROOM_TONE_MAX_GRAPHS = 2;
export const ROOM_TONE_NODES_PER_GRAPH = 14;
export const ROOM_EVENT_LOOKAHEAD_S = 0.3;
export const ROOM_EVENTS_PER_UPDATE = 3;

function room(id, cfg) { return Object.freeze({ id, ...cfg, event: cfg.event ? Object.freeze(cfg.event) : null }); }

// level = overall room loudness on the ambient bus; air/rumble/sub are layer mixes.
export const ROOM_PROFILES = Object.freeze({
  civic: room('civic', { level: 0.05, airHz: 2400, airQ: 0.7, air: 0.5, rumbleHz: 160, rumble: 0.25, sub: 0.22, breathHz: 0.09, breath: 0.25,
    event: { kind: 'clamp-tick', hz: 1800, q: 9, dur: 0.08, rate: 0.22, level: 0.5, spread: 0.2 } }),
  belt: room('belt', { level: 0.055, airHz: 900, airQ: 1.1, air: 0.35, rumbleHz: 140, rumble: 0.6, sub: 0.3, breathHz: 0.05, breath: 0.2,
    event: { kind: 'rock-creak', hz: 420, q: 8, dur: 0.35, rate: 0.3, level: 0.55, spread: 0.35 } }),
  junction: room('junction', { level: 0.05, airHz: 3200, airQ: 0.9, air: 0.55, rumbleHz: 180, rumble: 0.2, sub: 0.2, breathHz: 0.13, breath: 0.2,
    event: { kind: 'signal-blip', hz: 2600, q: 22, dur: 0.06, rate: 0.5, level: 0.45, spread: 0.12 } }),
  forge: room('forge', { level: 0.06, airHz: 1200, airQ: 1.4, air: 0.3, rumbleHz: 90, rumble: 0.75, sub: 0.35, breathHz: 0.8, breath: 0.45,
    event: { kind: 'clank', hz: 900, q: 6, dur: 0.12, rate: 0.35, level: 0.6, spread: 0.3 } }),
  drift: room('drift', { level: 0.045, airHz: 1400, airQ: 0.6, air: 0.6, rumbleHz: 120, rumble: 0.15, sub: 0.25, breathHz: 0.07, breath: 0.35,
    event: { kind: 'ice-ping', hz: 3600, q: 30, dur: 0.5, rate: 0.12, level: 0.4, spread: 0.25 } }),
  reach: room('reach', { level: 0.05, airHz: 1800, airQ: 1, air: 0.4, rumbleHz: 120, rumble: 0.45, sub: 0.25, breathHz: 0.11, breath: 0.2,
    event: { kind: 'static-crackle', hz: 5200, q: 2, dur: 0.03, rate: 0.9, level: 0.35, spread: 0.4 } }),
  deep: room('deep', { level: 0.035, airHz: 600, airQ: 0.8, air: 0.25, rumbleHz: 70, rumble: 0.3, sub: 0.45, breathHz: 0.04, breath: 0.3,
    event: { kind: 'hull-groan', hz: 180, q: 10, dur: 1.2, rate: 0.05, level: 0.5, spread: 0.2 } }),
  haven: room('haven', { level: 0.058, airHz: 1500, airQ: 1.2, air: 0.4, rumbleHz: 160, rumble: 0.55, sub: 0.25, breathHz: 0.2, breath: 0.3,
    event: { kind: 'hull-knock', hz: 260, q: 5, dur: 0.18, rate: 0.4, level: 0.6, spread: 0.3 } }),
  nebula: room('nebula', { level: 0.045, airHz: 4200, airQ: 4, air: 0.45, rumbleHz: 100, rumble: 0.12, sub: 0.3, breathHz: 0.11, breath: 0.5,
    event: { kind: 'choir-ping', hz: 1320, q: 40, dur: 0.9, rate: 0.1, level: 0.35, spread: 0.18 } }),
  ash: room('ash', { level: 0.055, airHz: 900, airQ: 0.9, air: 0.35, rumbleHz: 70, rumble: 0.6, sub: 0.3, breathHz: 0.06, breath: 0.25,
    event: { kind: 'grit-patter', hz: 3000, q: 1.5, dur: 0.04, rate: 1.2, level: 0.3, spread: 0.45 } }),
  void: room('void', { level: 0.025, airHz: 1000, airQ: 0.7, air: 0.35, rumbleHz: 90, rumble: 0.1, sub: 0.2, breathHz: 0.05, breath: 0.2, event: null }),
  // Docked: the berth's ventilation and structure. No tonal pedal — the station hum owns that.
  berth: room('berth', { level: 0.045, airHz: 1600, airQ: 0.8, air: 0.6, rumbleHz: 110, rumble: 0.4, sub: 0, breathHz: 0.18, breath: 0.15,
    event: { kind: 'berth-clatter', hz: 1100, q: 7, dur: 0.1, rate: 0.25, level: 0.45, spread: 0.3 } }),
});

export function resolveRoomProfile(frame) {
  if (!frame) return ROOM_PROFILES.void;
  if (frame.phase === 'dock') return ROOM_PROFILES.berth;
  const ident = frame.identity || resolveScoreIdentity(frame.sectorId);
  return ROOM_PROFILES[ident.room] || ROOM_PROFILES.void;
}

// Pedal: the sector tonic an octave under A1, with a second partial the faction colours —
// Concord rests on a fifth, Reach leans a half-step, Choir hangs a raised fourth.
export function resolveRoomPedal(frame) {
  const ident = (frame && frame.identity) || resolveScoreIdentity(frame && frame.sectorId);
  const rootHz = 55 * Math.pow(2, foldTonic(ident.tonic) / 12);
  const faction = frame && frame.faction;
  const interval = faction && Number.isFinite(faction.pedal) ? faction.pedal : (MODES[ident.mode] || MODES.aeolian)[4];
  return Object.freeze({ rootHz, partialHz: rootHz * Math.pow(2, (interval + 12) / 12), interval });
}

function roomSignature(profileRow, pedal) {
  return `${profileRow.id}:${pedal.rootHz.toFixed(2)}:${pedal.interval}`;
}

function hash32(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function lcg(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

function setTarget(param, value, now, tc) {
  if (!param) return;
  try {
    if (typeof param.cancelScheduledValues === 'function') param.cancelScheduledValues(now);
    if (typeof param.setTargetAtTime === 'function') param.setTargetAtTime(value, now, tc);
    else param.value = value;
  } catch (_) { try { param.value = value; } catch (__) {} }
}

function buildRoomGraph(ctx, destination, profileRow, pedal, noiseBuffer, sig) {
  const nodes = [];
  const sources = [];
  const gain = (v) => { const g = ctx.createGain(); g.gain.value = v; nodes.push(g); return g; };
  const filter = (type, hz, q) => {
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = hz; f.Q.value = q; nodes.push(f); return f;
  };
  const output = gain(SILENCE);
  output.connect(destination);
  const airFilter = filter('bandpass', profileRow.airHz, profileRow.airQ);
  const airGain = gain(profileRow.air);
  airFilter.connect(airGain); airGain.connect(output);
  const rumbleFilter = filter('lowpass', profileRow.rumbleHz, 0.7);
  const rumbleGain = gain(profileRow.rumble);
  rumbleFilter.connect(rumbleGain); rumbleGain.connect(output);
  const eventFilter = profileRow.event ? filter('bandpass', profileRow.event.hz, profileRow.event.q) : null;
  const eventGain = profileRow.event ? gain(0) : null;
  if (eventFilter) { eventFilter.connect(eventGain); eventGain.connect(output); }
  if (noiseBuffer && typeof ctx.createBufferSource === 'function') {
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;
    noise.connect(airFilter); noise.connect(rumbleFilter);
    if (eventFilter) noise.connect(eventFilter);
    noise.start();
    nodes.push(noise); sources.push(noise);
  }
  let subGain = null;
  if (profileRow.sub > 0) {
    subGain = gain(profileRow.sub);
    subGain.connect(output);
    const root = ctx.createOscillator();
    root.type = 'sine'; root.frequency.value = pedal.rootHz;
    root.connect(subGain); root.start();
    const partial = ctx.createOscillator();
    const partialGain = gain(0.28);
    partial.type = 'triangle'; partial.frequency.value = pedal.partialHz;
    partial.connect(partialGain); partialGain.connect(subGain); partial.start();
    nodes.push(root, partial); sources.push(root, partial);
  }
  if (profileRow.breath > 0) {
    const lfo = ctx.createOscillator();
    const depth = gain(profileRow.air * profileRow.breath);
    lfo.type = 'sine'; lfo.frequency.value = profileRow.breathHz;
    lfo.connect(depth); depth.connect(airGain.gain); lfo.start();
    nodes.push(lfo); sources.push(lfo);
  }
  return {
    sig, profile: profileRow, pedal, output, airFilter, airGain, rumbleGain, subGain, eventFilter, eventGain,
    nodes, sources, stopped: false, nextEventAt: null, rand: lcg(hash32(sig)), events: 0,
  };
}

function stopRoomGraph(graph) {
  if (!graph || graph.stopped) return;
  graph.stopped = true;
  for (const s of graph.sources) { try { s.stop(); } catch (_) {} }
  for (const n of graph.nodes) { try { n.disconnect(); } catch (_) {} }
}

export function createRoomToneRuntime(ctx, destination, options = {}) {
  if (!ctx || !destination) throw new TypeError('Room tone requires an AudioContext and destination.');
  const crossfadeS = Math.min(6, Math.max(0.2, Number(options.crossfadeS) || 2.4));
  const getNoise = typeof options.noiseBuffer === 'function' ? options.noiseBuffer : () => options.noiseBuffer || null;
  return {
    activeGraph: null,
    fadingGraph: null,
    lastFrame: null,
    crossfadeS,

    update(frame, nowS) {
      const now = Number.isFinite(nowS) ? nowS : Number(ctx.currentTime) || 0;
      this.lastFrame = frame || null;
      if (!frame) { this.stop(); return null; }
      const profileRow = resolveRoomProfile(frame);
      const pedal = resolveRoomPedal(frame);
      const sig = roomSignature(profileRow, pedal);
      if (!this.activeGraph || this.activeGraph.sig !== sig) {
        this._fade(this.activeGraph, now);
        this.activeGraph = buildRoomGraph(ctx, destination, profileRow, pedal, getNoise(), sig);
      }
      const g = this.activeGraph;
      const mix = frame.room || { level: 1, air: 1, sub: 1, events: 1, open: 1 };
      const level = Math.max(SILENCE, profileRow.level * mix.level);
      setTarget(g.output.gain, level, now, g.events === 0 && !g._warm ? crossfadeS / 3 : 0.6);
      g._warm = true;
      setTarget(g.airGain.gain, profileRow.air * mix.air, now, 0.8);
      setTarget(g.airFilter.frequency, profileRow.airHz * (0.3 + 0.7 * (mix.open ?? 1)), now, 1.2);
      setTarget(g.rumbleGain.gain, profileRow.rumble, now, 0.8);
      if (g.subGain) setTarget(g.subGain.gain, profileRow.sub * mix.sub, now, 1.0);
      this._scheduleEvents(g, profileRow, mix, now);
      return g;
    },

    _scheduleEvents(g, profileRow, mix, now) {
      const ev = profileRow.event;
      if (!ev || !g.eventGain || !(mix.events > 0)) { g.nextEventAt = null; return; }
      const rate = ev.rate * mix.events;
      if (g.nextEventAt == null || g.nextEventAt < now) g.nextEventAt = now + (0.5 + g.rand()) / rate;
      let scheduled = 0;
      while (g.nextEventAt <= now + ROOM_EVENT_LOOKAHEAD_S && scheduled < ROOM_EVENTS_PER_UPDATE) {
        const t = g.nextEventAt;
        const p = g.eventGain.gain;
        const amp = ev.level * (0.55 + 0.45 * g.rand());
        try {
          g.eventFilter.frequency.setValueAtTime(ev.hz * (1 + (g.rand() * 2 - 1) * ev.spread), t);
          p.setValueAtTime(0, t);
          p.linearRampToValueAtTime(amp, t + Math.min(0.02, ev.dur * 0.2));
          p.setTargetAtTime(0, t + Math.min(0.02, ev.dur * 0.2), ev.dur / 3);
        } catch (_) {}
        g.events += 1;
        scheduled += 1;
        g.nextEventAt = t + (0.35 + g.rand() * 1.3) / rate;
      }
    },

    _fade(graph, now) {
      if (!graph) return;
      if (this.fadingGraph && this.fadingGraph !== graph) stopRoomGraph(this.fadingGraph);
      this.fadingGraph = graph;
      setTarget(graph.output.gain, SILENCE, now, crossfadeS / 3);
      for (const s of graph.sources) { try { s.stop(now + crossfadeS); } catch (_) {} }
      graph.stopAt = now + crossfadeS;
    },

    stop() {
      const now = Number(ctx.currentTime) || 0;
      this._fade(this.activeGraph, now);
      this.activeGraph = null;
    },

    destroy() {
      stopRoomGraph(this.activeGraph);
      stopRoomGraph(this.fadingGraph);
      this.activeGraph = null;
      this.fadingGraph = null;
      this.lastFrame = null;
    },
  };
}
