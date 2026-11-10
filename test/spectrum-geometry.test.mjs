import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { recordAnomalyBearing } from '../src/systems/scanner.js';
import { admitReceipt } from '../src/ui/hudAttention.js';
import { SPECTRUM_PROP_KINDS } from '../src/data/spectrum/props.js';
import { REVEAL_AREA_WU2, SPECTRUM_APPROXIMATION } from '../src/data/spectrum/constants.js';
import {
  bearingDeg,
  bounceOnSegment,
  dist2,
  foldEcho,
  reflectPoint,
  segmentHitsCircle,
} from '../src/systems/spectrum/geometry.js';
import { solveTrack } from '../src/systems/spectrum/solve.js';
import {
  applyFocus,
  applyMeasure,
  createSpectrumModel,
  hydrateSpectrum,
  publicSpectrum,
  serializeSpectrum,
} from '../src/systems/spectrum/model.js';
import { buildSpectrumFrame, spectrumFrameVertexCount } from '../src/render/spectrum/frame.js';
import { silhouetteBounds } from '../src/render/spectrum/silhouettes.js';
import { spectrumCaseById } from '../src/data/spectrum/scenarios.js';

const FORBIDDEN = new Set(['truth', 'truepos', 'fixedpos', 'secret', 'targetpos', 'emitterpos', 'sourceid']);

function walkKeys(value, hits, path) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN.has(key.toLowerCase())) hits.push(`${path}${key}`);
    if (child && typeof child === 'object') walkKeys(child, hits, `${path}${key}.`);
  }
}

function nearTruth(value, truth, hits, path) {
  if (!value || typeof value !== 'object') return;
  if (Number.isFinite(value.x) && Number.isFinite(value.z) && dist2(value, truth) < 1) {
    hits.push(path || 'root');
  }
  for (const [key, child] of Object.entries(value)) {
    if (child && typeof child === 'object') nearTruth(child, truth, hits, `${path}${key}.`);
  }
}

test('bearing matches the scanner and a short baseline is the scanner gate', () => {
  const from = { x: 0, z: 0 };
  const to = { x: 1000, z: 0 };
  const gated = recordAnomalyBearing(null, from, to, {}, 0);
  assert.ok(Math.abs(gated.bearingDeg - bearingDeg(from, to)) < 0.002);
  const second = recordAnomalyBearing(gated.record, { x: 100, z: 0 }, to, {
    minBaselineWu: 350,
    minBearingDeltaDeg: 8,
    requiredPings: 3,
  }, 10);
  assert.equal(second.accepted, false);
  assert.equal(second.reason, 'baseline_short');
});

test('mirror fold puts the true source on the reflected ray', () => {
  const observer = { x: 80, z: 80 };
  const target = { x: 400, z: 1500 };
  const a = { x: 1000, z: 280 };
  const b = { x: 1000, z: 1680 };
  const image = reflectPoint(target, a, b);
  assert.ok(dist2(reflectPoint(image, a, b), target) < 1e-6);
  const bounce = bounceOnSegment(observer, image, a, b);
  assert.ok(bounce, 'echo should strike the charted wall');
  const folded = foldEcho(observer, bearingDeg(observer, image), a, b);
  const theta = folded.bearingDeg * Math.PI / 180;
  const residual = Math.cos(theta) * (target.x - folded.origin.x)
    + Math.sin(theta) * (target.z - folded.origin.z);
  assert.ok(Math.abs(residual) < 1e-4, residual);
  assert.equal(segmentHitsCircle(200, 200, 400, 1500, 400, 780, 260), true);
});

test('three bearings fix a stationary source and four fix a constant velocity', () => {
  const still = { x: 1000, z: -40 };
  const origins = [{ x: 0, z: 0 }, { x: 0, z: 450 }, { x: -400, z: 180 }];
  const solved = solveTrack(origins.map((origin, index) => ({
    t: index * 10,
    origin,
    bearingDeg: bearingDeg(origin, still),
    sigmaWu: 48,
  })), { x: 400, z: 200, radius: 1500 });
  assert.ok(solved);
  assert.ok(dist2(solved.position, still) < 25, JSON.stringify(solved.position));
  assert.ok(solved.speed < 3, solved.speed);
  assert.ok(solved.area < 18000, solved.area);

  const velocity = { x: -36, z: 22 };
  const ship = [
    { t: 1, x: 0, z: 0 },
    { t: 12, x: 400, z: -240 },
    { t: 24, x: 180, z: 420 },
    { t: 36, x: -320, z: 80 },
  ];
  const chased = solveTrack(ship.map((at) => {
    const source = { x: 1680 + velocity.x * at.t, z: -640 + velocity.z * at.t };
    return { t: at.t, origin: { x: at.x, z: at.z }, bearingDeg: bearingDeg({ x: at.x, z: at.z }, source), sigmaWu: 48 };
  }), { x: 800, z: 0, radius: 1800 });
  const truth = { x: 1680 + velocity.x * 36, z: -640 + velocity.z * 36 };
  assert.ok(dist2(chased.position, truth) < 80, JSON.stringify(chased));
  assert.ok(Math.abs(chased.velocity.x - velocity.x) < 8, chased.velocity.x);
  assert.ok(Math.abs(chased.velocity.z - velocity.z) < 8, chased.velocity.z);
});

test('a repeated sample does not shrink uncertainty, and a jam does not either', () => {
  const model = createSpectrumModel('spectrum_cold_parallax', 0, 11);
  const first = applyMeasure(model, { x: 0, z: 0 }, { x: 0, z: 0 }, 1);
  const area = first.tracks[0].area;
  const second = applyMeasure(model, { x: 80, z: 0 }, { x: 0, z: 0 }, 12);
  assert.equal(second.reason, 'baseline_short');
  assert.equal(second.tracks[0].area, area);
  assert.equal(second.tracks[0].sampleCount, 1);

  const jammed = createSpectrumModel('spectrum_jam_curtain', 0, 11);
  const inside = applyMeasure(jammed, { x: 200, z: 0 }, { x: 0, z: 0 }, 1);
  assert.equal(inside.reason, 'jammed');
  assert.equal(inside.revealed, false);
  assert.equal(inside.fix, null);
  assert.equal(inside.tracks.length, 0);
  const still = applyMeasure(jammed, { x: 180, z: 40 }, { x: 0, z: 0 }, 12);
  assert.equal(still.reason, 'jammed');
  assert.equal(still.tracks.length, 0);
});

test('occlusion is a miss with no fix, and the public view does not carry the source', () => {
  const truth = spectrumCaseById('spectrum_cold_parallax').emitters[0].pos;
  const model = createSpectrumModel('spectrum_cold_parallax', 0, 3);
  const view = applyMeasure(model, { x: 0, z: 0 }, { x: 0, z: 0 }, 1);
  assert.equal(view.revealed, false);
  assert.equal(view.identity, 'UNRESOLVED');
  assert.equal(view.fix, null);
  const keys = [];
  walkKeys(view, keys, '');
  assert.deepEqual(keys, []);
  const close = [];
  nearTruth(view, truth, close, '');
  assert.deepEqual(close, []);
  assert.ok(view.bearingDeg != null);

  const wreck = createSpectrumModel('spectrum_skimming_wreck', 0, 3);
  // t ≈ 13.7 s puts the wreck behind the rock as seen from (-200, -200). Elapsed = simTime - armedAt.
  const blocked = applyMeasure(wreck, { x: -200, z: -200 }, { x: 0, z: 0 }, 13.7);
  assert.equal(blocked.reason, 'occluded');
  assert.equal(blocked.revealed, false);
  assert.equal(blocked.fix, null);
});

test('save restores the posterior and receipts pass the HUD admit gate', () => {
  const model = createSpectrumModel('spectrum_cold_parallax', 0, 9);
  applyMeasure(model, { x: 0, z: 0 }, { x: 0, z: 0 }, 1);
  applyMeasure(model, { x: 0, z: 500 }, { x: 0, z: 0 }, 12);
  const saved = serializeSpectrum(model);
  assert.equal(JSON.stringify(saved).includes('fixedPos":{'), false);
  const restored = hydrateSpectrum(saved);
  const cont = applyMeasure(restored, { x: -400, z: 200 }, { x: 0, z: 0 }, 24);
  const live = createSpectrumModel('spectrum_cold_parallax', 0, 9);
  applyMeasure(live, { x: 0, z: 0 }, { x: 0, z: 0 }, 1);
  applyMeasure(live, { x: 0, z: 500 }, { x: 0, z: 0 }, 12);
  const fresh = applyMeasure(live, { x: -400, z: 200 }, { x: 0, z: 0 }, 24);
  assert.equal(cont.revealed, fresh.revealed);
  assert.deepEqual(cont.fix, fresh.fix);
  assert.deepEqual(cont.tracks.map((row) => row.sampleCount), fresh.tracks.map((row) => row.sampleCount));
  for (const line of fresh.receipts) {
    const decision = admitReceipt({ text: line, kind: 'info' });
    assert.equal(decision.admit, true, `${line} (${decision.reason})`);
  }
});

test('props are distinct silhouettes and a pre-fix frame does not mark the source', () => {
  const asset = JSON.parse(readFileSync(new URL('../assets/spectrum/props.json', import.meta.url)));
  assert.match(SPECTRUM_APPROXIMATION, /not electromagnetic Doppler/i);
  assert.match(asset.note, /Procedural/);
  const bounds = SPECTRUM_PROP_KINDS.map((kind) => silhouetteBounds(kind.id));
  const signatures = new Set(bounds.map((row) => `${row.vertices}:${row.width}:${row.depth}`));
  assert.equal(signatures.size, SPECTRUM_PROP_KINDS.length);
  assert.deepEqual(asset.props.map((row) => row.id), SPECTRUM_PROP_KINDS.map((kind) => kind.id));

  const model = createSpectrumModel('spectrum_cold_parallax', 0, 1);
  const view = applyMeasure(model, { x: 0, z: 0 }, { x: 0, z: 0 }, 1);
  const echo = publicSpectrum(createSpectrumModel('spectrum_echo_gallery', 0, 1));
  const echoFrame = buildSpectrumFrame(echo, echo.props);
  assert.ok(echoFrame.props.some((prop) => prop.id === 'relay' && prop.kind === 'relay'));
  const frame = buildSpectrumFrame(view, view.props);
  assert.equal(frame.ellipse, null);
  assert.ok(frame.rays.length >= 1);
  assert.ok(frame.cues.length <= 2);
  const truth = spectrumCaseById('spectrum_cold_parallax').emitters[0].pos;
  for (const ray of frame.rays) {
    assert.ok(dist2({ x: ray.x2, z: ray.z2 }, { x: ray.x1, z: ray.z1 }) <= 161);
    assert.ok(dist2({ x: ray.x2, z: ray.z2 }, truth) > 800);
  }
  assert.ok(spectrumFrameVertexCount(frame) < 400);
});

test('two hundred measurements stay inside the sample cap and a small time budget', () => {
  const model = createSpectrumModel('spectrum_courier_shear', 0, 5);
  const started = Date.now();
  for (let i = 0; i < 200; i++) {
    applyMeasure(
      model,
      { x: (i % 7) * 180, z: (i % 5) * 160 },
      { x: 0, z: 0 },
      1 + i * 9,
    );
  }
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 500, elapsed);
  for (const track of Object.values(model.tracks)) {
    assert.ok(track.samples.length <= 8);
  }
  assert.ok(model.log.length <= 24);
  assert.ok(model.ops < 200 * 16);
});

function ellipseRadius(frame, fix) {
  if (!frame || !frame.ellipse || !fix) return null;
  return Math.hypot(frame.ellipse[0].x - fix.x, frame.ellipse[0].z - fix.z);
}

function splitWake() {
  const model = createSpectrumModel('spectrum_split_wake', 0, 1);
  const points = [[200, 900, 1], [0, 600, 12], [400, 1100, 24], [-80, 480, 36]];
  for (let i = 0; i < points.length; i++) {
    applyMeasure(model, { x: points[i][0], z: points[i][1] }, { x: 0, z: 0 }, points[i][2]);
  }
  return model;
}

test('focusing the stationary return logs its posterior and keeps the held hull ellipse', () => {
  const model = splitWake();
  applyFocus(model, 'DRIFTING');
  const held = publicSpectrum(model);
  const heldFrame = buildSpectrumFrame(held);
  assert.equal(held.revealed, true);
  assert.equal(held.area, 25334);
  assert.ok(held.log.some((row) => row.area === 5448));
  assert.equal(held.log[held.log.length - 1].area, 25334);
  assert.ok(Math.abs(ellipseRadius(heldFrame, held.fix) - 90) < 1.5, ellipseRadius(heldFrame, held.fix));

  const before = held.log.length;
  applyFocus(model, 'STATIONARY');
  const parked = publicSpectrum(model);
  const glint = parked.tracks.find((track) => track.contradiction);
  assert.equal(parked.revealed, false);
  assert.equal(parked.fix, null);
  assert.equal(buildSpectrumFrame(parked).ellipse, null);
  assert.equal(parked.log.length, before + 1);
  assert.equal(parked.area, glint.area);
  assert.equal(parked.log[parked.log.length - 1].area, glint.area);
  assert.equal(parked.log[parked.log.length - 1].focus, glint.key);
  assert.notEqual(parked.area, 25334);

  applyFocus(model, 'DRIFTING');
  const again = publicSpectrum(model);
  assert.equal(again.revealed, true);
  assert.equal(again.area, 25334);
  assert.ok(Math.abs(ellipseRadius(buildSpectrumFrame(again), again.fix) - 90) < 1.5);
  assert.notEqual(again.area, 5448);
});

test('a widened split-wake posterior omits the ellipse and reports the current area', () => {
  const model = splitWake();
  applyFocus(model, 'DRIFTING');
  const held = publicSpectrum(model);
  assert.equal(held.area, 25334);
  applyMeasure(model, { x: 400, z: 1100 }, { x: 0, z: 0 }, 70);
  const wide = publicSpectrum(model);
  const hull = wide.tracks.find((track) => track.motionClass === 'DRIFTING');
  assert.ok(hull.area > REVEAL_AREA_WU2, hull.area);
  assert.equal(wide.revealed, false);
  assert.equal(wide.fix, null);
  assert.equal(buildSpectrumFrame(wide).ellipse, null);
  assert.equal(wide.area, hull.area);
  assert.ok(wide.area > held.area);
  assert.notEqual(wide.area, 5448);

  const before = wide.log.length;
  applyFocus(model, 'STATIONARY');
  const parked = publicSpectrum(model);
  const glint = parked.tracks.find((track) => track.contradiction);
  assert.equal(parked.log.length, before + 1);
  assert.equal(parked.revealed, false);
  assert.equal(parked.fix, null);
  assert.equal(buildSpectrumFrame(parked).ellipse, null);
  assert.equal(parked.area, glint.area);
  assert.equal(parked.log[parked.log.length - 1].area, glint.area);
  assert.equal(parked.log[parked.log.length - 1].focus, glint.key);
  assert.notEqual(parked.area, hull.area);
  assert.notEqual(parked.area, 5448);
});

test('parallax ignores repeated collinear samples across tracks but accepts a perpendicular baseline', () => {
  const model = createSpectrumModel('spectrum_cold_parallax', 0, 1);
  for (let i = 0; i < 8; i++) {
    const key = `return-${i}`;
    model.tracks[key] = { key, samples: Array.from({ length: 8 }, (_, n) => ({
      origin: { x: (n % 4) * 800, z: 0 }, t: n, bearingDeg: 0,
    })), area: 1000, estimate: { x: 0, z: 520 }, velocity: { x: 0, z: 0 },
    estimateTime: 8, motionClass: 'STATIONARY' };
  }
  applyFocus(model, 'return-0');
  assert.equal(model.revealed, true);
  assert.equal(model.resolved, false, 'duplicate and reversed baselines are still one line');
  model.tracks['return-7'].samples[7].origin = { x: 0, z: 800 };
  applyFocus(model, 'return-0');
  assert.equal(model.resolved, true, 'a second baseline direction completes parallax');
});
