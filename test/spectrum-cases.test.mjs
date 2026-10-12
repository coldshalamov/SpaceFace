import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { scanner } from '../src/systems/scanner.js';
import { spectrum } from '../src/systems/spectrum/index.js';
import { publicSpectrum } from '../src/systems/spectrum/model.js';
import { signalMetaText } from '../src/ui/signalInvestigationPrompt.js';
import { admitReceipt } from '../src/ui/hudAttention.js';
import { SPECTRUM_CASES, spectrumCaseById } from '../src/data/spectrum/scenarios.js';
import { dist2 } from '../src/systems/spectrum/geometry.js';

function boot(seed) {
  const sim = createSimulation({ seed, systems: [scanner, spectrum] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.input.actions = state.input.actions || {};
  state.world.currentSectorId = 'sector_test_spectrum';
  state.world.activeSector = { id: 'sector_test_spectrum', pois: [] };
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 10, hull: 100, hullMax: 100, data: {},
  });
  state.playerId = player.id;
  player.vel = player.vel || { x: 0, z: 0 };
  const events = { results: [], investigated: [], triangulated: [], courses: [], toasts: [], resolved: [] };
  bus.on('signal:scanResults', (payload) => events.results.push(payload));
  bus.on('signal:investigated', (payload) => events.investigated.push(payload));
  bus.on('anomaly:triangulated', (payload) => events.triangulated.push(payload));
  bus.on('ui:setCourse', (payload) => events.courses.push(payload));
  bus.on('toast', (payload) => events.toasts.push(payload));
  bus.on('spectrum:resolved', (payload) => events.resolved.push(payload));
  return { sim, state, bus, player, events };
}

function pulseAt(run, time, pos, vel = { x: 0, z: 0 }) {
  const target = time - SIM_DT;
  if (run.state.simTime < target - 1e-6) {
    const ticks = Math.max(0, Math.round((target - run.state.simTime) / SIM_DT));
    if (ticks) run.sim.runTicks(ticks);
  }
  run.player.pos.x = pos.x;
  run.player.pos.z = pos.z;
  run.player.vel.x = vel.x;
  run.player.vel.z = vel.z;
  run.state.input.actions.scanPulse = true;
  run.sim.runTicks(1);
}

function tow(run, propId, x, z) {
  const prop = run.state.spectrum.propPos[propId];
  run.player.pos.x = prop.x;
  run.player.pos.z = prop.z;
  run.bus.emit('spectrum:tow', { propId, x, z });
  return { ...run.state.spectrum.propPos[propId] };
}

function brakeAtFix(run) {
  const model = run.state.spectrum;
  if (!model.fix) throw new Error(`no fix ${summary(run)}`);
  const dt = run.state.simTime - (model.fixTime || 0);
  const velocity = model.velocity || { x: 0, z: 0 };
  run.player.pos.x = model.fix.x + velocity.x * dt;
  run.player.pos.z = model.fix.z + velocity.z * dt;
  run.player.vel.x = 0;
  run.player.vel.z = 0;
  run.state.input.actions.brake = true;
  run.sim.runTicks(1);
}

function summary(run) {
  const view = publicSpectrum(run.state.spectrum);
  return JSON.stringify({
    revealed: view.revealed,
    resolved: view.resolved,
    reversed: view.reversed,
    identity: view.identity,
    fix: view.fix,
    reason: view.reason,
    area: view.area,
    tracks: view.tracks.map((track) => ({
      key: track.key,
      label: track.chartLabel,
      cls: track.motionClass,
      n: track.sampleCount,
      area: track.area,
      claim: track.claim,
      contra: track.contradiction,
      reason: track.reason,
      echo: track.echo,
    })),
  });
}

const ROUTES = {
  spectrum_cold_parallax(run) {
    pulseAt(run, 1, { x: 0, z: 0 });
    pulseAt(run, 12, { x: 0, z: 620 });
    pulseAt(run, 24, { x: -480, z: 180 });
    brakeAtFix(run);
  },
  spectrum_echo_gallery(run) {
    pulseAt(run, 1, { x: 0, z: 0 });
    pulseAt(run, 12, { x: 600, z: -200 });
    pulseAt(run, 24, { x: 600, z: 600 });
    const hops = [[80, 460], [80, 840], [80, 1220], [200, 1500], [400, 1500]];
    for (let i = 0; i < hops.length; i++) tow(run, 'relay', hops[i][0], hops[i][1]);
  },
  spectrum_drift_chord(run) {
    pulseAt(run, 1, { x: 0, z: 0 });
    pulseAt(run, 12, { x: 700, z: -180 });
    pulseAt(run, 24, { x: -280, z: 360 });
    pulseAt(run, 36, { x: 240, z: 80 });
    run.bus.emit('spectrum:focus', { motionClass: 'DRIFTING' });
    brakeAtFix(run);
  },
  spectrum_courier_shear(run) {
    pulseAt(run, 1, { x: 0, z: 0 });
    pulseAt(run, 12, { x: 400, z: -240 });
    pulseAt(run, 24, { x: 180, z: 420 });
    pulseAt(run, 36, { x: -320, z: 80 });
    brakeAtFix(run);
  },
  spectrum_skimming_wreck(run) {
    pulseAt(run, 2, { x: 200, z: -500 });
    pulseAt(run, 18, { x: -420, z: 220 });
    pulseAt(run, 30, { x: -600, z: -100 });
    pulseAt(run, 40, { x: -80, z: 60 });
    brakeAtFix(run);
  },
  spectrum_split_wake(run) {
    pulseAt(run, 1, { x: 200, z: 900 });
    pulseAt(run, 12, { x: 0, z: 600 });
    pulseAt(run, 24, { x: 400, z: 1100 });
    pulseAt(run, 36, { x: -80, z: 480 });
    run.bus.emit('spectrum:focus', { motionClass: 'DRIFTING' });
    brakeAtFix(run);
  },
  spectrum_mirror_mine(run) {
    pulseAt(run, 1, { x: 200, z: 180 });
    for (const hop of [[280, -80], [560, 140], [730, 245], [900, 350]]) tow(run, 'slab', hop[0], hop[1]);
    for (const hop of [[280, 180], [480, 320], [700, 470], [920, 590], [1100, 700]]) {
      tow(run, 'player-decoy', hop[0], hop[1]);
    }
    pulseAt(run, 12, { x: 1500, z: 1280 });
    pulseAt(run, 24, { x: 900, z: 1500 });
    pulseAt(run, 36, { x: 1760, z: 980 });
    pulseAt(run, 48, { x: 1280, z: 1680 });
    run.bus.emit('spectrum:focus', { motionClass: 'DRIFTING' });
    brakeAtFix(run);
  },
  spectrum_jam_curtain(run) {
    pulseAt(run, 1, { x: 200, z: 0 });
    pulseAt(run, 12, { x: 1100, z: 420 });
    pulseAt(run, 24, { x: 1100, z: -180 });
    pulseAt(run, 36, { x: 1460, z: 220 });
    brakeAtFix(run);
  },
  spectrum_false_lantern(run) {
    pulseAt(run, 1, { x: 0, z: -400 });
    pulseAt(run, 12, { x: 600, z: 0 });
    pulseAt(run, 24, { x: 1050, z: 0 });
    pulseAt(run, 36, { x: 800, z: -360 });
    brakeAtFix(run);
  },
  spectrum_black_box(run) {
    pulseAt(run, 1, { x: 700, z: 200 });
    pulseAt(run, 12, { x: 200, z: 760 });
    pulseAt(run, 24, { x: -180, z: 80 });
    brakeAtFix(run);
  },
  spectrum_vent_shadow(run) {
    pulseAt(run, 1, { x: 0, z: 1200 });
    pulseAt(run, 12, { x: 420, z: 1200 });
    pulseAt(run, 24, { x: -340, z: 1100 });
    brakeAtFix(run);
  },
  spectrum_lifeboat_lie(run) {
    pulseAt(run, 1, { x: 0, z: 0 });
    pulseAt(run, 12, { x: 980, z: 240 });
    pulseAt(run, 24, { x: 400, z: 900 });
    pulseAt(run, 36, { x: 1400, z: -200 });
    pulseAt(run, 48, { x: 200, z: 1400 });
    run.bus.emit('spectrum:focus', { motionClass: 'DRIFTING' });
    brakeAtFix(run);
  },
};

test('twelve cases, three in each family, no shared layout', () => {
  assert.equal(SPECTRUM_CASES.length, 12);
  const families = {};
  const situations = new Set();
  for (const row of SPECTRUM_CASES) {
    families[row.family] = (families[row.family] || 0) + 1;
    situations.add(row.situation);
    assert.ok(row.mechanisms.length >= 1);
    assert.ok(row.publicName);
  }
  assert.deepEqual(families, { navigation: 3, hunt: 3, deception: 3, disaster: 3 });
  assert.equal(situations.size, 12);
  const mechanisms = new Set(SPECTRUM_CASES.flatMap((row) => row.mechanisms));
  for (const name of ['bearing', 'chirp', 'occlusion', 'multipath', 'spoof', 'jam']) {
    assert.ok(mechanisms.has(name), name);
  }
});

for (const spec of SPECTRUM_CASES) {
  test(`${spec.id} resolves on the scanner pulse path`, () => {
    const run = boot(50311);
    assert.equal(run.bus.emit('spectrum:arm', { caseId: spec.id }) || true, true);
    assert.equal(run.state.spectrum.caseId, spec.id);
    ROUTES[spec.id](run);
    const view = publicSpectrum(run.state.spectrum);
    assert.equal(view.resolved, true, summary(run));
    assert.equal(view.revealed, true, summary(run));
    assert.equal(view.identity, spec.publicName);
    assert.equal(run.events.investigated.length, 0);
    assert.equal(run.events.triangulated.length, 0);
    assert.equal(run.events.courses.length, 0);
    assert.ok(run.events.resolved.length === 1);
    const truth = bodyTruth(spec, run.state.simTime - run.state.spectrum.armedAt);
    if (view.fix && spec.payoff === 'brake') {
      assert.ok(dist2(view.fix, truth) < 160 || dist2(run.player.pos, truth) < 160, summary(run));
    }
    const row = run.events.results.find((payload) => payload.primary && String(payload.primary.id).startsWith('spectrum:'));
    assert.ok(row, 'scanner pulse produced a spectrum return');
    assert.equal(row.primary.manualInvestigation, true);
    const earliest = run.events.results[0].primary;
    if (!earliest.spectrum.revealed) {
      assert.equal(earliest.spectrum.identity, 'UNRESOLVED');
      assert.ok(dist2(earliest.pos, bodyTruth(spec, 0)) > 40, summary(run));
    }
    if (row.primary.triangulation) {
      assert.match(signalMetaText(row.primary), /BEARING/);
    }
    for (const toast of run.events.toasts) {
      if (!toast || !toast.text || toast.text.startsWith('Scanner recharging')) continue;
      const decision = admitReceipt({ text: toast.text, kind: toast.kind || 'info' });
      assert.equal(decision.admit, true, `${toast.text} (${decision.reason})`);
    }
    const leaked = [];
    walk(view, leaked);
    assert.deepEqual(leaked, []);
  });
}

function bodyTruth(spec, elapsed) {
  if (spec.bodyId === 'sled') return spec.sled;
  const emitter = spec.emitters.find((row) => row.id === spec.bodyId);
  if (!emitter) return { x: 0, z: 0 };
  if (emitter.motion === 'linear') {
    return {
      x: emitter.pos.x + emitter.vel.x * elapsed,
      z: emitter.pos.z + emitter.vel.z * elapsed,
    };
  }
  if (emitter.motion === 'arc') {
    const angle = emitter.phase + emitter.omega * elapsed;
    return {
      x: emitter.center.x + Math.cos(angle) * emitter.orbit,
      z: emitter.center.z + Math.sin(angle) * emitter.orbit,
    };
  }
  if (emitter.propId) return { x: 0, z: 0 };
  return emitter.pos;
}

function walk(value, hits) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (/^(truth|truepos|fixedpos|secret|sourceid)$/i.test(key)) hits.push(key);
    if (child && typeof child === 'object') walk(child, hits);
  }
}

test('the first six cases are the navigation and hunt set', () => {
  assert.deepEqual(SPECTRUM_CASES.slice(0, 6).map((row) => row.family), [
    'navigation', 'navigation', 'navigation', 'hunt', 'hunt', 'hunt',
  ]);
});

test('mirror mine does not resolve by collecting the decoy', () => {
  const run = boot(50311);
  run.bus.emit('spectrum:arm', { caseId: 'spectrum_mirror_mine' });
  pulseAt(run, 1, { x: 200, z: 180 });
  pulseAt(run, 12, { x: 80, z: 40 });
  pulseAt(run, 24, { x: 500, z: -200 });
  const view = publicSpectrum(run.state.spectrum);
  assert.equal(view.resolved, false, summary(run));
  assert.equal(view.revealed, false, summary(run));
  assert.equal(view.tracks.some((track) => track.contradiction), true, summary(run));
});

test('jam inside the curtain is information and does not invent a fix', () => {
  const run = boot(70);
  run.bus.emit('spectrum:arm', { caseId: 'spectrum_jam_curtain' });
  pulseAt(run, 1, { x: 200, z: 40 });
  const view = publicSpectrum(run.state.spectrum);
  assert.equal(view.reason, 'jammed');
  assert.equal(view.fix, null);
  assert.equal(view.revealed, false);
});

test('braking on the wrong drift buoy does not complete the chord', () => {
  const run = boot(50311);
  run.bus.emit('spectrum:arm', { caseId: 'spectrum_drift_chord' });
  pulseAt(run, 1, { x: 0, z: 0 });
  pulseAt(run, 12, { x: 700, z: -180 });
  pulseAt(run, 24, { x: -280, z: 360 });
  pulseAt(run, 36, { x: 240, z: 80 });
  run.bus.emit('spectrum:focus', { motionClass: 'DRIFTING' });
  const view = publicSpectrum(run.state.spectrum);
  assert.equal(view.revealed, true, summary(run));
  const west = spectrumCaseById('spectrum_drift_chord').emitters.find((row) => row.id === 'west');
  run.player.pos.x = west.pos.x;
  run.player.pos.z = west.pos.z;
  run.player.vel.x = 0;
  run.player.vel.z = 0;
  run.state.input.actions.brake = true;
  run.sim.runTicks(1);
  assert.equal(run.state.spectrum.resolved, false);
  brakeAtFix(run);
  assert.equal(run.state.spectrum.resolved, true, summary(run));
});

test('investigate does not plot a course and a fixed seed replays', () => {
  function play(seed) {
    const run = boot(seed);
    run.bus.emit('spectrum:arm', { caseId: 'spectrum_cold_parallax' });
    pulseAt(run, 1, { x: 0, z: 0 });
    const before = run.events.courses.length;
    run.bus.emit('signal:investigate', { signalId: 'spectrum:spectrum_cold_parallax' });
    assert.equal(run.events.courses.length, before);
    assert.ok(run.events.results[0].primary.manualInvestigation);
    pulseAt(run, 12, { x: 0, z: 620 });
    pulseAt(run, 24, { x: -480, z: 180 });
    return publicSpectrum(run.state.spectrum);
  }
  const a = play(50311);
  const b = play(50311);
  assert.deepEqual(a.log, b.log);
  assert.deepEqual(a.fix, b.fix);
  const other = play(9001);
  assert.equal(other.revealed, a.revealed);
});

test('echo gallery sample from the south is an echo, not the beacon coordinate', () => {
  const run = boot(4);
  run.bus.emit('spectrum:arm', { caseId: 'spectrum_echo_gallery' });
  pulseAt(run, 1, { x: 80, z: 80 });
  const view = publicSpectrum(run.state.spectrum);
  assert.equal(view.tracks.some((track) => track.echo), true, summary(run));
  assert.equal(view.revealed, false);
  const truth = spectrumCaseById('spectrum_echo_gallery').emitters[0].pos;
  assert.ok(JSON.stringify(view).includes(String(truth.x)) === false);
});
