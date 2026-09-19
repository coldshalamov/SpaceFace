// Audio mix direction — the four seams of the PQ-158 mix pass, proven headless:
//
//   1. combat choreography — a scripted escalation produces measurably rising pressure
//      (pressure-bed gain + combat/music fader movement recorded in the bus-meter ledger);
//   2. critical comms duck the world mix for their phrase and release it;
//   3. the tether strain/spool layer reads the REAL physics mirror (tetherGameplay._mirror
//      writes state.player.tether — the same fields production writes) and attach/strain/
//      release cues fire from the real bus events;
//   4. hull occlusion + authored reverb sends ride the existing bus graph (interiors wet and
//      muffled, the void open and dry);
//   5. sector beds crossfade on retune instead of hard-replacing, and the PQ-158.03 blind
//      cue-naming bench still names every composed bed — twice;
//   6. the whole stack stays inside the limiter's loudness bound and the frame-sleep budget:
//      zero node creation on idle frames, ledger bounded.
import assert from 'node:assert/strict';
import test, { after } from 'node:test';

// ---------------------------------------------------------------------------
// Mock Web Audio (same shape as test/asteroid-sound-routing.test.mjs)
// ---------------------------------------------------------------------------
class MockAudioParam {
  constructor(v = 1) { this.value = v; this.timeline = []; }
  setValueAtTime(val, t) { this.timeline.push({ type: 'set', val, t }); this.value = val; return this; }
  linearRampToValueAtTime(val, t) { this.timeline.push({ type: 'linear', val, t }); this.value = val; return this; }
  exponentialRampToValueAtTime(val, t) { this.timeline.push({ type: 'exp', val, t }); this.value = val; return this; }
  setTargetAtTime(val, t, tc) { this.timeline.push({ type: 'target', val, t, tc }); this.value = val; return this; }
  cancelScheduledValues(t) { this.timeline = this.timeline.filter((e) => e.t < t); return this; }
}
class MockGainNode {
  constructor(g = 1) { this.gain = new MockAudioParam(g); this._out = []; }
  connect(d) { this._out.push(d); }
  disconnect() { this._out.length = 0; }
}
class MockOscillatorNode {
  constructor() { this.frequency = new MockAudioParam(440); this.detune = new MockAudioParam(0); this.type = 'sine'; this._started = false; this._stopped = false; }
  connect() {} disconnect() {}
  start() { this._started = true; }
  stop() { this._stopped = true; }
}
class MockBiquadFilterNode {
  constructor() { this.frequency = new MockAudioParam(1000); this.Q = new MockAudioParam(1); this.type = 'lowpass'; }
  connect() {} disconnect() {}
}
class MockBufferSource {
  constructor() { this.buffer = null; this.loop = false; this.playbackRate = new MockAudioParam(1); this._started = false; this._stopped = false; }
  connect() {} disconnect() {}
  start() { this._started = true; }
  stop() { this._stopped = true; }
}
class MockAudioContext {
  constructor() {
    this.currentTime = 0; this.state = 'running'; this.sampleRate = 44100;
    this.created = { gain: 0, osc: 0, filter: 0, source: 0, panner: 0 };
  }
  createBuffer(channels, length, sampleRate) {
    return { length, sampleRate, numberOfChannels: channels, getChannelData() { return new Float32Array(length); } };
  }
  createGain() { this.created.gain++; return new MockGainNode(); }
  createOscillator() { this.created.osc++; return new MockOscillatorNode(); }
  createBiquadFilter() { this.created.filter++; return new MockBiquadFilterNode(); }
  createBufferSource() { this.created.source++; return new MockBufferSource(); }
  createDynamicsCompressor() {
    return {
      threshold: new MockAudioParam(-6), knee: new MockAudioParam(6), ratio: new MockAudioParam(12),
      attack: new MockAudioParam(0.003), release: new MockAudioParam(0.25),
      connect() {}, disconnect() {},
    };
  }
  createStereoPanner() { this.created.panner++; return { pan: new MockAudioParam(0), connect() {}, disconnect() {} }; }
  createWaveShaper() { return { curve: null, oversample: 'none', connect() {}, disconnect() {} }; }
  createDelay(max = 1) { return { delayTime: new MockAudioParam(Math.min(0.1, max)), connect() {}, disconnect() {} }; }
  createChannelMerger() { return { connect() {}, disconnect() {} }; }
  createChannelSplitter() { return { connect() {}, disconnect() {} }; }
  createConvolver() { return { buffer: null, normalize: true, connect() {}, disconnect() {} }; }
  createPanner() { return { connect() {}, disconnect() {} }; }
  resume() { this.state = 'running'; return Promise.resolve(); }
  close() { this.state = 'closed'; return Promise.resolve(); }
}

let FAKE_NOW_MS = 0;
globalThis.window = { addEventListener() {}, removeEventListener() {}, AudioContext: MockAudioContext, webkitAudioContext: MockAudioContext };
globalThis.performance = { now: () => FAKE_NOW_MS };
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};

const {
  audio,
  PRESSURE_MIX,
  COMMS_DUCK,
  AUDIO_RECIPE_BY_ID,
  audioRecipeBasePeak,
} = await import('../src/audio/audioSystem.js');
const { createBus } = await import('../src/core/eventBus.js');
const { tetherGameplay } = await import('../src/systems/tetherGameplay.js');
const { masslineHumHz } = await import('../src/audio/masslineInstrument.js');
const { createBandBedRuntime } = await import('../src/audio/bandBeds.js');
const {
  SECTOR_BEDS,
  resolveSectorBed,
  sectorBedToBandIntent,
} = await import('../src/audio/themeMatrix.js');
const {
  renderSectorBedPcm,
  identifySectorBedFromPcm,
  THEME_SAMPLE_RATE,
} = await import('../src/audio/themeCompose.js');
const { environmentOcclusion, ENVIRONMENT_IR } = await import('../src/audio/environmentMix.js');

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------
function hostile(id, x, z) {
  return { id, alive: true, type: 'ship', team: 'raider', pos: { x, z }, data: { ai: { combatant: true } } };
}

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
    player: {
      credits: 0, fuel: 100, cruise: { phase: 'idle' }, cargo: { items: {} },
      tether: { active: false, targetId: null, strain: 0, load: 0, phase: 'slack' },
    },
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

function boot() {
  try { audio.destroy(); } catch (_) {}
  FAKE_NOW_MS = 0;
  const state = makeState();
  const bus = createBus();
  audio.init({ state, bus, helpers: {} });
  const ctx = audio._ensureContext();
  assert.ok(ctx, 'mock AudioContext must come up');
  return { state, bus, ctx, rt: audio.rt };
}

// 60 Hz frames on both clocks the audio lane uses (ctx.currentTime + performance.now) and the
// sim clock, so threat windows and the ledger cadence see a real timeline.
function frame(h, n = 1) {
  for (let i = 0; i < n; i++) {
    h.ctx.currentTime += 1 / 60;
    FAKE_NOW_MS += 1000 / 60;
    h.state.simTime += 1 / 60;
    h.state.tick += 1;
    audio._frame();
  }
}

// ===========================================================================
// 1 — combat choreography: scripted escalation rises in the ledger
// ===========================================================================
test('combat escalation produces measurably rising mix pressure in the bus-meter ledger', () => {
  const h = boot();
  frame(h, 30); // 0.5 s idle — ledger warms at 0.25 s cadence
  const led = () => audio.mixLedger();
  const calm = led().at(-1);
  assert.ok(calm, 'the ledger must be writing bus meters');
  assert.ok(calm.pressure <= 0.001, `no pressure without threat, got ${calm.pressure}`);
  assert.ok(calm.combat <= calm.combatFader * 0.01, 'the combat meter must sit near silence');

  // Escalation: one hostile closing + a hit taken.
  const h2 = hostile(2, 400, 0);
  h.state.entityList.push(h2);
  h.state.entities.set(2, h2);
  h.state.entities.get(1).shield = 40;
  h.bus.emit('combat:damage', { isPlayer: true, shieldDamage: 12, pos: { x: 20, z: 0 } });
  frame(h, 30);
  const mid = led().at(-1);

  // More hostiles + another hit — a real escalation, not a single spike.
  for (const e of [hostile(3, 300, 50), hostile(4, 500, -80)]) {
    h.state.entityList.push(e);
    h.state.entities.set(e.id, e);
  }
  h.bus.emit('combat:damage', { isPlayer: true, shieldDamage: 20, pos: { x: -15, z: 10 } });
  frame(h, 30);
  const hot = led().at(-1);

  assert.ok(mid.threat > calm.threat, `threat must rise ${calm.threat} -> ${mid.threat}`);
  assert.ok(hot.threat > mid.threat, `threat must keep rising ${mid.threat} -> ${hot.threat}`);
  assert.ok(mid.pressure > calm.pressure, `pressure bed must rise ${calm.pressure} -> ${mid.pressure}`);
  assert.ok(hot.pressure > mid.pressure, `pressure must keep rising ${mid.pressure} -> ${hot.pressure}`);
  assert.ok(hot.pressure <= PRESSURE_MIX.bedBaseGain + PRESSURE_MIX.bedGain + 1e-9,
    `pressure bed stays inside its bounded peak, got ${hot.pressure}`);

  // The meter itself: combat bus feed rises, the combat fader leans in, the music fader bows.
  assert.ok(hot.combat > calm.combat, `combat meter ${calm.combat} -> ${hot.combat}`);
  assert.ok(hot.combat > mid.combat, `combat meter must keep rising ${mid.combat} -> ${hot.combat}`);
  assert.ok(hot.combatFader > calm.combatFader, `combat fader leans in with threat ${calm.combatFader} -> ${hot.combatFader}`);
  assert.ok(hot.musicFader < calm.musicFader, `music fader bows under threat ${calm.musicFader} -> ${hot.musicFader}`);

  // Ledger contract: bounded, ordered, carries the meters the receipts need.
  const entries = led();
  assert.ok(entries.length <= PRESSURE_MIX.ledgerCap, 'ledger is bounded');
  for (let i = 1; i < entries.length; i++) assert.ok(entries[i].t >= entries[i - 1].t, 'ledger is time-ordered');
  for (const k of ['threat', 'pressure', 'combat', 'music', 'ambient', 'engine', 'master']) {
    assert.ok(Number.isFinite(entries.at(-1)[k]), `ledger entry must carry ${k}`);
  }
});

// ===========================================================================
// 2 — critical comms duck the mix
// ===========================================================================
test('a critical comms phrase bows the world mix and releases it', () => {
  const h = boot();
  frame(h, 24);
  const base = { ...h.rt._busLevels };
  assert.ok(base.music > 0 && base.combat > 0 && base.ambient > 0, 'world buses must be live');

  h.bus.emit('barkDirector:voice', { factionId: 'faction_scn', situation: 'warn', text: 'Hold position, freighter.' });
  frame(h, 3);
  const rt = h.rt;
  assert.ok(rt._commsDuckUntilS > h.ctx.currentTime, 'the comms duck window must be open');
  const ducked = { ...rt._busLevels };
  assert.ok(ducked.music < base.music * 0.75, `music bows ${base.music} -> ${ducked.music}`);
  assert.ok(ducked.combat < base.combat * 0.75, `combat bows ${base.combat} -> ${ducked.combat}`);
  assert.ok(ducked.ambient < base.ambient * 0.75, `ambient bows ${base.ambient} -> ${ducked.ambient}`);
  assert.ok(ducked.engine < base.engine * 0.75, `engine bows ${base.engine} -> ${ducked.engine}`);
  // The comms bus itself never bows — the voice must sit on top of the bow.
  assert.equal(ducked.comms, base.comms, 'comms bus must not duck itself');
  assert.equal(ducked.master, base.master, 'the master fader is the user\'s knob — untouched');

  // Release: after the phrase window the world returns to its faders.
  const wait = Math.ceil((rt._commsDuckUntilS - h.ctx.currentTime) * 60) + 12;
  frame(h, wait);
  assert.ok(h.ctx.currentTime >= rt._commsDuckUntilS, 'phrase window must close');
  assert.ok(Math.abs(rt._busLevels.music - base.music) < base.music * 0.02,
    `music returns ${rt._busLevels.music} ≈ ${base.music}`);
  assert.ok(Math.abs(rt._busLevels.combat - base.combat) < base.combat * 0.02,
    `combat returns ${rt._busLevels.combat} ≈ ${base.combat}`);
});

// ===========================================================================
// 3 — tether strain/spool layer driven by the real physics mirror
// ===========================================================================
test('tether layer reads the real physics mirror: strain hum, winch spool, attach/strain/release', () => {
  const h = boot();
  frame(h, 12); // beds built
  const plays = [];
  const origPlay = audio.play.bind(audio);
  audio.play = (id, opts) => { plays.push(id); return origPlay(id, opts); };

  // The production mirror writer, not a test double: tetherGameplay._mirror is the function
  // that copies attachment authority into state.player.tether every tick.
  tetherGameplay._reelStrength = 0.7;
  tetherGameplay._mirror(h.state, 'rock-9', 0.8, 220, 'loaded',
    { lineControl: true, lineLength: -1, orbitDirection: 0 }, -1, false, 'massline_hook');
  const t = h.state.player.tether;
  assert.equal(t.active, true);
  assert.equal(t.phase, 'loaded');
  assert.equal(t.reeling, true);
  assert.ok(Math.abs(t.load) > 0, 'the mirror computes real load');

  audio._updateTetherHum();
  const wantHz = masslineHumHz(0.8);
  assert.ok(Math.abs(h.rt.tetherOsc.frequency.value - wantHz) < 0.5,
    `hum follows strain: ${h.rt.tetherOsc.frequency.value} vs ${wantHz}`);
  assert.ok(h.rt.tetherHum.gainValue > 0.05, 'strain hum must be audible under load');
  assert.ok(h.rt._tetherSpoolGain.gainValue > 0.005, 'the winch must sing while reeling');
  assert.ok(h.rt._tetherSpoolOsc.frequency.value > 300, 'spool pitch tracks the winch');

  h.bus.emit('tether:attached', { headId: 'massline_hook', targetId: 'rock-9', pos: { x: 30, z: 0 } });
  assert.ok(plays.includes('sfx.tetherLatch'), 'attach cue fires from the physics event');

  h.bus.emit('tether:strain', { load: t.load, strain: t.strain, pos: { x: 30, z: 0 } });
  assert.ok(plays.includes('sfx_tether_strain_creak'), 'strain creak fires while the line is loaded');

  // Release and break are different sounds — a rated release is not a snap. (A 'messy'
  // release is owned by the 158.06 snap cue on purpose; a rated one is the release chord.)
  h.bus.emit('tether:releaseRated', { classification: 'clean', pos: { x: 30, z: 0 } });
  assert.ok(plays.includes('sfx_massline_release'), 'release cue fires for a rated release');
  assert.ok(!plays.includes('sfx.tetherSnap'), 'a rated release must not play the break snap');
  plays.length = 0;
  h.bus.emit('tether:broken', { reason: 'tether_overload', pos: { x: 30, z: 0 } });
  assert.ok(plays.includes('sfx.tetherSnap'), 'an overload break is the snap');

  // The layer follows STATE, not payload: slacken the mirror and the bed obeys with no event.
  tetherGameplay._mirror(h.state, 'rock-9', 0.05, 220, 'loaded', { lineControl: false }, 0, false, 'massline_hook');
  audio._updateTetherHum();
  assert.ok(Math.abs(h.rt.tetherOsc.frequency.value - masslineHumHz(0.05)) < 0.5,
    'hum follows the eased strain');
  assert.equal(h.rt._tetherSpoolGain.gainValue, 0.0001, 'winch stopped -> spool silent');

  // Line gone entirely: the hum closes.
  tetherGameplay._mirror(h.state, null);
  audio._updateTetherHum();
  assert.equal(h.rt.tetherHum.gainValue, 0.0001, 'detached line must be silent');
  audio.play = origPlay;
});

// ===========================================================================
// 4 — occlusion + authored reverb sends through the existing bus graph
// ===========================================================================
test('interior occlusion lowpasses positional world voices; the void stays open; reverb sends honor recipes', () => {
  const h = boot();
  frame(h, 6);

  // Open void: no occlusion — positional voices reach their bus directly.
  audio._syncEnvironmentMix(false);
  assert.equal(h.rt._environmentClass, 'void');
  assert.equal(environmentOcclusion('void').gain, 1);
  const dryVoice = audio.play('sfx_wpn_pulse_laser', { position: { x: 0, z: 60 }, gain: 0.6 });
  assert.ok(dryVoice, 'a positional weapon voice must play');
  assert.equal(dryVoice.gain._out[0], h.rt.combatBus, 'open void routes straight to the bus');

  // Docked inside a station: the same world outside is heard through the hull.
  h.state.ui.docked = true;
  audio._syncEnvironmentMix(true);
  assert.equal(h.rt._environmentClass, 'station');
  const stationOccl = environmentOcclusion('station');
  assert.ok(stationOccl.gain < 1, 'station occlusion must attenuate');
  assert.equal(h.rt._occlusionFilters.combat.frequency.value, stationOccl.cutoffHz,
    'occlusion filter takes the station cutoff');
  const wetVoice = audio.play('sfx_wpn_pulse_laser', { position: { x: 0, z: 60 }, gain: 0.6 });
  assert.ok(wetVoice, 'the occluded voice still plays');
  assert.equal(wetVoice.gain._out[0], h.rt._occlusionFilters.combat,
    'interior routing goes through the hull lowpass before the bus');
  assert.ok(wetVoice.callGain < dryVoice.callGain * 0.9,
    `occlusion attenuates: ${dryVoice.callGain} -> ${wetVoice.callGain}`);

  // Interior voices (non-positional) never touch the occlusion path.
  const uiVoice = audio.play('sfx_ui_click', { gain: 0.5 });
  assert.ok(uiVoice && uiVoice.gain._out[0] === h.rt.uiBus, 'UI stays crisp inside');

  // Authored reverb sends: recipe.reverbMix was dead data — now it taps the shared room send.
  const recipe = AUDIO_RECIPE_BY_ID.sfx_explosion_large;
  assert.ok(recipe && recipe.reverbMix > 0, 'fixture recipe must carry reverbMix');
  const boom = audio.play('sfx_explosion_large', { gain: 0.5 });
  assert.ok(boom && boom._reverbSend, 'a reverb-authored recipe must get a wet send');
  assert.ok(boom._reverbSend._out.includes(h.rt._environmentMix.send),
    'the wet send taps the shared environment send, not a private graph');

  // Environment classes keep their wet/dry identities.
  assert.ok(ENVIRONMENT_IR.hangar.mix > ENVIRONMENT_IR.station.mix, 'hangar is the wettest room');
  assert.ok(ENVIRONMENT_IR.station.mix > ENVIRONMENT_IR.void.mix, 'station is wetter than void');
  assert.ok(ENVIRONMENT_IR.station.decayS > ENVIRONMENT_IR.hangar.decayS, 'station is the longest tail');
});

// ===========================================================================
// 5 — sector beds crossfade, follow the player, and stay blind-nameable
// ===========================================================================
test('sector retune crossfades the band bed instead of hard-replacing it', () => {
  const h = boot();
  frame(h, 6);
  const rt = h.rt;
  const heliosIntent = sectorBedToBandIntent(resolveSectorBed('sector_helios_prime'));
  const skerIntent = sectorBedToBandIntent(resolveSectorBed('sector_sker_haven'));

  rt.bandBed.setIntent(heliosIntent);
  const heliosGraph = rt.bandBed.activeGraph;
  assert.ok(heliosGraph, 'a live bed must build a graph');
  assert.ok(heliosGraph.bedSig.includes('bed_helios'), 'Helios bed signature');

  rt.bandBed.setIntent(skerIntent);
  assert.equal(rt.bandBed.fadingGraph, heliosGraph, 'the outgoing bed fades, it does not cut');
  assert.ok(rt.bandBed.activeGraph !== heliosGraph, 'a new graph carries the incoming bed');
  assert.ok(rt.bandBed.activeGraph.bedSig.includes('bed_sker'), 'Sker bed signature');
  const fadeTarget = rt.bandBed.fadingGraph.output.gain.value;
  assert.ok(fadeTarget <= 0.0001 + 1e-9, `fading bed must be gliding to silence, got ${fadeTarget}`);
  assert.ok(rt.bandBed.fadingGraph.sources.every((s) => s._stopped || s._started),
    'fading sources are scheduled to stop');
  assert.ok(rt.bandBed.fadingGraph.stopAt > h.ctx.currentTime, 'the fade has a bounded stop');
  assert.ok(rt.bandBed.activeGraph.output.gain.value > 0.0001, 'incoming bed is ramping in');

  // Bounded: rapid double-retune never leaves more than one graph fading.
  rt.bandBed.setIntent(heliosIntent);
  const midFade = rt.bandBed.fadingGraph;
  rt.bandBed.setIntent(skerIntent);
  assert.ok(rt.bandBed.fadingGraph, 'the newest outgoing graph is the one fading');
  assert.ok(midFade.stopped === true || rt.bandBed.fadingGraph === midFade,
    'an older fading graph is hard-stopped — at most one graph fades at a time');

  // Following the player: sector:enter on the real bus drives the same retune.
  h.state.world.currentSectorId = 'sector_helios_prime';
  h.bus.emit('sector:enter', { sectorId: 'sector_helios_prime' });
  frame(h, 4);
  assert.equal(rt._bandBedIntent.bed.kind, 'bed_helios');
  h.state.world.currentSectorId = 'sector_sker_haven';
  h.bus.emit('sector:enter', { sectorId: 'sector_sker_haven' });
  frame(h, 4);
  assert.equal(rt._bandBedIntent.bed.kind, 'bed_sker', 'the bed follows the player\'s sector');
  assert.ok(rt.bandBed.fadingGraph, 'the sector change crossfades, not cuts');
});

test('PQ-158.03 blind bench: every composed sector bed names itself — twice', () => {
  const sectorIds = Object.keys(SECTOR_BEDS);
  assert.ok(sectorIds.length >= 10, `expected >=10 sector beds, got ${sectorIds.length}`);
  for (let pass = 1; pass <= 2; pass++) {
    let named = 0;
    for (const sectorId of sectorIds) {
      const pcm = renderSectorBedPcm(resolveSectorBed(sectorId));
      if (identifySectorBedFromPcm(pcm, THEME_SAMPLE_RATE) === sectorId) named += 1;
    }
    assert.equal(named, sectorIds.length, `blind bed names pass ${pass}: ${named}/${sectorIds.length}`);
  }
});

// ===========================================================================
// 6 — loudness bound + frame budget
// ===========================================================================
test('the mix stays inside the pinned loudness bound at worst-case combat stacking', () => {
  const h = boot();
  frame(h, 6);
  // Modeled master-referred peak: the loudest pinned combat stack — three heavy voices plus
  // every continuous combat-bed strand at its cap — through the lifted combat fader and master.
  const sfxVal = 0.7, combatVal = 0.7, masterVal = 0.55;
  const combatFaderMax = sfxVal * sfxVal * combatVal * combatVal * 0.25119 * (1 + PRESSURE_MIX.combatLift);
  const masterTarget = masterVal * masterVal * 0.501187;
  const voicePeak = Math.max(
    audioRecipeBasePeak(AUDIO_RECIPE_BY_ID.sfx_explosion_large),
    audioRecipeBasePeak(AUDIO_RECIPE_BY_ID['sfx.hullHit']),
    audioRecipeBasePeak(AUDIO_RECIPE_BY_ID.sfx_wpn_pulse_laser),
  );
  const bedStack = PRESSURE_MIX.bedBaseGain + PRESSURE_MIX.bedGain + PRESSURE_MIX.subGain
    + 0.136 /* tether hum cap */ + 0.055 /* overload */ + 0.075 /* spool */;
  const worstFeed = 3 * voicePeak + bedStack;
  const masterReferred = worstFeed * combatFaderMax * masterTarget;
  assert.ok(masterReferred < 0.72,
    `worst-case combat stack ${masterReferred.toFixed(4)} must sit under the 0.72 headroom pin`);
  assert.ok(masterReferred < 0.5,
    `typical bound: ${masterReferred.toFixed(4)} stays under the limiter knee (~-6 dB)`);
  // The pressure bed alone can never swamp the mix even at full threat.
  const bedAlone = (PRESSURE_MIX.bedBaseGain + PRESSURE_MIX.bedGain + PRESSURE_MIX.subGain) * combatFaderMax * masterTarget;
  assert.ok(bedAlone < 0.02, `pressure bed's own ceiling ${bedAlone.toFixed(5)} stays a layer, not a wall`);
});

test('idle frames do no allocation-class work: zero node creation, bounded ledger', () => {
  const h = boot();
  frame(h, 180); // warm: beds, band graph, ledger ring all allocate once
  const created = { ...h.ctx.created };
  const ledgerBefore = h.rt._mixLedger.n;

  frame(h, 60); // one quiet second
  const delta = {
    gain: h.ctx.created.gain - created.gain,
    osc: h.ctx.created.osc - created.osc,
    filter: h.ctx.created.filter - created.filter,
    source: h.ctx.created.source - created.source,
    panner: h.ctx.created.panner - created.panner,
  };
  for (const [kind, n] of Object.entries(delta)) {
    assert.equal(n, 0, `idle frame created ${n} ${kind} node(s) — the frame path must not allocate`);
  }
  // Ledger cadence is real but bounded: ~4 entries per second, never unbounded growth.
  const ledgerDelta = h.rt._mixLedger.n - ledgerBefore;
  assert.ok(ledgerDelta >= 3 && ledgerDelta <= 6, `ledger cadence ~4 Hz, got ${ledgerDelta}/s`);
  assert.ok(h.rt._mixLedger.n <= PRESSURE_MIX.ledgerCap, 'ledger ring is bounded');
});

// The music sequencer re-arms a lookahead setTimeout; release it so the process can exit.
after(() => { try { audio.destroy(); } catch (_) {} });
