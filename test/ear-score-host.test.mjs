// THE EAR — the real audio host, booted on a fake AudioContext, plays a seed-4242 story
// (travel → chase → fight → aftermath → dock) through its own threat read. The score director
// lives in the host's Band runtime and its frames drive the four progressive stem faders; room
// tone rides the same place intent. This proves the shipped path, not the pure helpers.
import assert from 'node:assert/strict';
import test, { after, mock } from 'node:test';

class MockAudioParam {
  constructor(v = 1) { this.value = v; this.timeline = []; }
  setValueAtTime(val, t) { this.timeline.push({ type: 'set', val, t }); this.value = val; return this; }
  linearRampToValueAtTime(val, t) { this.timeline.push({ type: 'linear', val, t }); this.value = val; return this; }
  exponentialRampToValueAtTime(val, t) { this.timeline.push({ type: 'exp', val, t }); this.value = val; return this; }
  setTargetAtTime(val, t, tc) { this.timeline.push({ type: 'target', val, t, tc }); this.value = val; return this; }
  cancelScheduledValues(t) { this.timeline = this.timeline.filter((e) => e.t < t); return this; }
}
const node = (extra = {}) => ({ connect() {}, disconnect() {}, ...extra });
class MockAudioContext {
  constructor() { this.currentTime = 0; this.state = 'running'; this.sampleRate = 44100; this.created = 0; }
  createBuffer(channels, length, sampleRate) {
    return { length, sampleRate, numberOfChannels: channels, getChannelData() { return new Float32Array(length); } };
  }
  createGain() { this.created++; return node({ gain: new MockAudioParam(1) }); }
  createOscillator() {
    this.created++;
    return node({ frequency: new MockAudioParam(440), detune: new MockAudioParam(0), type: 'sine', start() {}, stop() {} });
  }
  createBiquadFilter() { this.created++; return node({ frequency: new MockAudioParam(1000), Q: new MockAudioParam(1), gain: new MockAudioParam(0), type: 'lowpass' }); }
  createBufferSource() { this.created++; return node({ buffer: null, loop: false, playbackRate: new MockAudioParam(1), start() {}, stop() {} }); }
  createDynamicsCompressor() {
    return node({
      threshold: new MockAudioParam(-6), knee: new MockAudioParam(6), ratio: new MockAudioParam(12),
      attack: new MockAudioParam(0.003), release: new MockAudioParam(0.25),
    });
  }
  createStereoPanner() { this.created++; return node({ pan: new MockAudioParam(0) }); }
  createWaveShaper() { return node({ curve: null, oversample: 'none' }); }
  createDelay(max = 1) { return node({ delayTime: new MockAudioParam(Math.min(0.1, max)) }); }
  createChannelMerger() { return node(); }
  createChannelSplitter() { return node(); }
  createConvolver() { return node({ buffer: null, normalize: true }); }
  createPanner() { return node(); }
  resume() { this.state = 'running'; return Promise.resolve(); }
  close() { this.state = 'closed'; return Promise.resolve(); }
}

// House seed: every Math.random the presentation layer draws comes from one LCG seeded 4242.
let seed = 4242;
const realRandom = Math.random;
Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

let FAKE_NOW_MS = 0;
globalThis.window = { addEventListener() {}, removeEventListener() {}, AudioContext: MockAudioContext, webkitAudioContext: MockAudioContext };
globalThis.performance = { now: () => FAKE_NOW_MS };
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};

const { audio } = await import('../src/audio/audioSystem.js');
const { createBus } = await import('../src/core/eventBus.js');
const { ROOM_TONE_MAX_GRAPHS } = await import('../src/audio/roomTone.js');

after(() => { try { audio.destroy(); } catch (_) {} Math.random = realRandom; });

function makeState() {
  const player = {
    id: 1, isPlayer: true, alive: true, type: 'ship', team: 'player',
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    hull: 100, hullMax: 100, shield: 100, shieldMax: 100, flags: {},
  };
  return {
    playerId: 1, tick: 0, simTime: 0,
    entities: new Map([[1, player]]),
    entityList: [player],
    player: { credits: 0, fuel: 100, cruise: { phase: 'idle' }, cargo: { items: {} },
      tether: { active: false, targetId: null, strain: 0, load: 0, phase: 'slack' } },
    input: { moveX: 0, moveZ: 0, brake: false, fire: false, actions: {} },
    world: { currentSectorId: 'sector_helios_prime', sectors: {}, activeSector: { stations: [] } },
    settings: {
      audio: { muted: false, master: 0.55, sfx: 0.7, music: 0.32, engine: 0.7, ambient: 0.7, combat: 0.7, ui: 0.7, comms: 0.7 },
      video: { motionReduce: true },
      accessibility: { audioCues: true, captions: false },
    },
    ui: { docked: false, screenStack: [] },
  };
}

const hunter = (id, x, z) => ({
  id, alive: true, type: 'ship', team: 'raider', pos: { x, z },
  data: { ai: { combatant: true }, combat: { targetId: 1 } },
});

const FRAME_S = 1 / 30;

function runStory() {
  try { audio.destroy(); } catch (_) {}
  seed = 4242;
  FAKE_NOW_MS = 0;
  mock.timers.enable({ apis: ['setTimeout'] });
  const state = makeState();
  const bus = createBus();
  audio.init({ state, bus, helpers: {} });
  const ctx = audio._ensureContext();
  const rt = audio.rt;
  assert.ok(ctx && rt.stemGains.A && rt.bandBed, 'the host builds its stems and Band runtime');

  // Every fader write the host makes, with the clock it was made on.
  const writes = [];
  for (const key of ['A', 'B', 'C', 'D']) {
    const p = rt.stemGains[key].gain;
    const orig = p.setTargetAtTime.bind(p);
    p.setTargetAtTime = (val, t, tc) => { writes.push({ key, val, at: t, now: ctx.currentTime }); return orig(val, t, tc); };
  }

  const phases = [];
  const samples = {};
  let maxRoomGraphs = 0;
  const step = (seconds) => {
    const n = Math.round(seconds / FRAME_S);
    for (let i = 0; i < n; i++) {
      ctx.currentTime += FRAME_S;
      FAKE_NOW_MS += FRAME_S * 1000;
      state.simTime += FRAME_S;
      state.tick += 1;
      mock.timers.tick(FRAME_S * 1000);
      const writesBefore = writes.length;
      audio._frame();
      const f = rt.bandBed.scoreFrame;
      if (f && phases.at(-1)?.phase !== f.phase) {
        phases.push({ phase: f.phase, t: Math.round(ctx.currentTime * 100) / 100, writesBefore });
      }
      const room = rt.bandBed.room;
      if (room) maxRoomGraphs = Math.max(maxRoomGraphs, (room.activeGraph ? 1 : 0) + (room.fadingGraph ? 1 : 0));
    }
  };
  const sample = (label) => {
    const g = {};
    for (const key of ['A', 'B', 'C', 'D']) g[key] = Math.round(rt.stemGains[key].gain.value * 1000) / 1000;
    const room = rt.bandBed.room && rt.bandBed.room.activeGraph;
    samples[label] = {
      phase: rt.bandBed.scoreFrame.phase,
      intensity: Math.round(rt.bandBed.scoreFrame.intensity * 1000) / 1000,
      gains: g,
      room: room ? room.profile.id : null,
    };
  };
  const addShips = (ships) => { for (const e of ships) { state.entityList.push(e); state.entities.set(e.id, e); } };
  const clearShips = () => {
    for (const e of state.entityList) if (e.id !== 1) { e.alive = false; state.entities.delete(e.id); }
    state.entityList = state.entityList.filter((e) => e.id === 1);
  };

  step(20); sample('travel');
  addShips([hunter(2, 1600, 0)]); // committed, out of the 1200 WU near band: a chase, not a fight
  step(12); sample('chase');
  addShips([hunter(3, 300, 40), hunter(4, 420, -60), hunter(5, 500, 90)]);
  for (let i = 0; i < 7; i++) {
    state.entities.get(1).shield = 40;
    bus.emit('combat:damage', { isPlayer: true, shieldDamage: 12, pos: { x: 20, z: 0 } });
    step(2);
  }
  sample('fight');
  clearShips();
  state.entities.get(1).shield = 100;
  step(10); sample('aftermath');
  step(14); sample('settled');
  state.ui.docked = true; state.entities.get(1).flags.docked = true;
  step(10); sample('dock');
  mock.timers.reset();
  return { phases, samples, writes, maxRoomGraphs, created: ctx.created };
}

test('seed 4242: the real host walks travel → threat → fight → aftermath → dock and the stem faders follow', () => {
  const run = runStory();
  if (process.env.EAR_DEBUG) console.log(JSON.stringify({ phases: run.phases, samples: run.samples }, null, 1));
  const seq = run.phases.map((p) => p.phase);
  const want = ['travel', 'threat', 'fight', 'aftermath', 'dock'];
  let i = 0;
  for (const p of seq) if (p === want[i]) i++;
  assert.equal(i, want.length, `phase story ${seq.join(' → ')}`);

  const { travel, chase, fight, aftermath, settled, dock } = run.samples;
  const lead = (g) => Object.entries(g).sort((a, b) => b[1] - a[1])[0][0];
  assert.equal(lead(travel.gains), 'A', 'travel: the outbound stem leads');
  assert.equal(chase.phase, 'threat');
  assert.equal(lead(chase.gains), 'B', 'chase: the tension stem takes over before any shot');
  assert.ok(chase.gains.B > travel.gains.B * 2);
  assert.equal(fight.phase, 'fight');
  assert.equal(lead(fight.gains), 'C', 'fight: the combat stem leads');
  assert.ok(fight.intensity > chase.intensity && chase.intensity > travel.intensity, 'intensity follows the threat read');
  assert.equal(aftermath.phase, 'aftermath');
  assert.ok(aftermath.gains.C < fight.gains.C && aftermath.gains.A > fight.gains.A, 'aftermath: combat recedes, the travel bed returns');
  assert.ok(settled.gains.A >= aftermath.gains.A && settled.gains.C <= aftermath.gains.C, 'the tail resolves toward calm');
  assert.equal(dock.phase, 'dock');
  assert.equal(lead(dock.gains), 'D', 'dock: the berth stem leads');

  // Room tone follows the place under its graph cap; the berth is its own room.
  assert.ok(travel.room && travel.room !== 'berth');
  assert.equal(dock.room, 'berth');
  assert.ok(run.maxRoomGraphs <= ROOM_TONE_MAX_GRAPHS);

  // Phase changes land on the incoming stem's musical grid, ahead of the clock, inside a bar-ish window.
  for (const target of ['threat', 'fight', 'aftermath']) {
    const p = run.phases.find((x) => x.phase === target);
    const landed = run.writes[p.writesBefore];
    assert.ok(landed, `${target}: the faders moved on the frame the phase turned`);
    assert.ok(landed.at > landed.now + 1e-4 && landed.at - landed.now <= 4, `${target}: quantised (${landed.now} → ${landed.at})`);
    // Riding writes made while the change waits never pull it off its downbeat.
    const riding = run.writes.slice(p.writesBefore + 4).filter((w) => w.now < landed.at);
    for (const w of riding) assert.ok(w.at >= landed.at - 1e-9, `${target}: drift write at ${w.at} cut the downbeat ${landed.at}`);
  }
  console.log(JSON.stringify({ phases: run.phases.map(({ phase, t }) => ({ phase, t })), samples: run.samples, maxRoomGraphs: run.maxRoomGraphs }));
});

test('seed 4242: the same story is the same score, frame for frame', () => {
  const a = runStory();
  const b = runStory();
  assert.deepEqual(a.phases, b.phases);
  assert.deepEqual(a.samples, b.samples);
});
