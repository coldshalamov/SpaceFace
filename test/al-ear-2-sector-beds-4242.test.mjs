import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { SECTORS } from '../src/data/sectors.js';
import { COMPOSED_SECTOR_BEDS } from '../src/audio/sectorScoreBeds.js';
import { SECTOR_SCORE_IDENTITY, MODES, foldTonic } from '../src/audio/scoreDirector.js';
import { resolveSectorBed, sectorBedToBandIntent } from '../src/audio/themeMatrix.js';
import { renderSectorBedPcm } from '../src/audio/themeCompose.js';
import { createBandBedRuntime } from '../src/audio/bandBeds.js';

test('all 25 sectors resolve authored or composed beds; the 15 new phrases use sector and faction identities', () => {
  assert.equal(Object.keys(SECTOR_SCORE_IDENTITY).length, 25);
  assert.equal(Object.keys(COMPOSED_SECTOR_BEDS).length, 15);
  const shapes = new Set();
  for (const [id, bed] of Object.entries(COMPOSED_SECTOR_BEDS)) {
    const c = bed.composition;
    assert.equal(resolveSectorBed(id), bed);
    assert.equal(c.identity, SECTOR_SCORE_IDENTITY[id]);
    assert.equal(c.factionId, SECTORS.find(s => s.id === id).factionId);
    const allowed = MODES[c.identity.mode].map(x => ((x + foldTonic(c.identity.tonic)) % 12 + 12) % 12);
    for (const step of c.steps) {
      const pc = ((Math.round(12 * Math.log2(step.hz / 440)) % 12) + 12) % 12;
      assert.ok(allowed.includes(pc), `${id} note ${step.hz} must be in mode`);
    }
    shapes.add(c.steps.map(s => s.beat).join(','));
    const pcm = renderSectorBedPcm(bed, { sampleRate: 8000 });
    assert.deepEqual(pcm, renderSectorBedPcm(bed, { sampleRate: 8000 }));
    assert.ok(pcm.length < 8000 * 25, 'each resident phrase is bounded to 25 s');
    let peak = 0;
    for (const value of pcm) peak = Math.max(peak, Math.abs(value));
    assert.ok(peak > 0.1 && peak < 0.8, `${id} audible and below clipping (${peak})`);
  }
  assert.equal(shapes.size, 15, 'each new bed has its own rhythm, not just a retuned loop');
  for (const id of Object.keys(SECTOR_SCORE_IDENTITY)) assert.ok(resolveSectorBed(id).id.startsWith('bed_'));
});

function spectrum(pcm, sampleRate, frequencies) {
  const mags = frequencies.map(hz => {
    let real = 0, imaginary = 0;
    for (let i = 0; i < pcm.length; i += 2) {
      const angle = i / sampleRate * hz * Math.PI * 2;
      real += pcm[i] * Math.cos(angle);
      imaginary += pcm[i] * Math.sin(angle);
    }
    return Math.hypot(real, imaginary);
  });
  const norm = Math.hypot(...mags);
  return mags.map(v => v / norm);
}

test('blind PCM A/B: every neighbouring pair has a distinguishable spectral signature; emit listening sheet', () => {
  const ids = Object.keys(SECTOR_SCORE_IDENTITY);
  const frequencies = [...new Set(ids.flatMap(id => [resolveSectorBed(id).hzA, resolveSectorBed(id).hzB]))];
  const features = new Map(ids.map(id => [id, spectrum(renderSectorBedPcm(id, { sampleRate: 8000, seconds: 8 }), 8000, frequencies)]));
  const rows = [];
  for (const s of SECTORS.filter(s => features.has(s.id))) for (const other of s.neighbors) {
    if (!features.has(other) || s.id >= other) continue;
    // Features consume only PCM; no labels, mode names, or recipe IDs enter the comparison.
    const a = features.get(s.id), b = features.get(other);
    const distance = Math.hypot(...a.map((v, i) => v - b[i]));
    assert.ok(distance > 0.3, `${s.id}/${other}: blind spectral distance ${distance}`);
    rows.push(`| ${s.id} | ${other} | ${distance.toFixed(3)} |`);
  }
  assert.ok(rows.length >= 25);
  mkdirSync('.devshots/chain-ear', { recursive: true });
  writeFileSync('.devshots/chain-ear/sector-listening-sheet.md', [
    '# Sector bed listening sheet — seed 4242', '',
    'Automated blind A/B from eight seconds of the production PCM renderer. Distance is normalized spectral separation; this is audible-signal differentiation, not a human aesthetic verdict.', '',
    '| A | B | Spectral distance |', '| --- | --- | --- |', ...rows, '',
  ].join('\n'));
  console.log(`Blind neighbouring-sector A/B: ${rows.length} pairs passed; .devshots/chain-ear/sector-listening-sheet.md`);
});

test('the live Band carrier plays composed PCM, reuses its buffer and retires sources on retune/destroy', () => {
  const sources = [];
  const param = () => ({ value: 0, cancelScheduledValues() {}, setTargetAtTime() {} });
  const node = extra => ({ connect() {}, disconnect() {}, ...extra });
  const ctx = {
    currentTime: 0, sampleRate: 8000,
    createGain: () => node({ gain: param() }),
    createBiquadFilter: () => node({ frequency: param(), Q: param() }),
    createOscillator: () => node({ frequency: param(), detune: param(), start() {}, stop() {} }),
    createBuffer: (ch, n) => { const pcm = new Float32Array(n); return { getChannelData: () => pcm }; },
    createBufferSource: () => { const s = node({ playbackRate: param(), starts: 0, stops: [], start() { this.starts++; }, stop(t) { this.stops.push(t); } }); sources.push(s); return s; },
  };
  const runtime = createBandBedRuntime(ctx, node({}), { random: () => 0.5 });
  const intent = sectorBedToBandIntent(resolveSectorBed('sector_nyx_march'));
  // Carrier-only call avoids room-tone sources; the host's place update is separately covered.
  runtime.setIntent({ ...intent, layer: null });
  const first = runtime.activeGraph;
  const pcmSource = first.sources.find(s => s.buffer && s.buffer.getChannelData(0).length > 8000);
  assert.ok(pcmSource && pcmSource.loop && pcmSource.starts === 1);
  const count = sources.length;
  runtime.setIntent({ ...intent, layer: null, strength: 0.7 });
  assert.equal(runtime.activeGraph, first);
  assert.equal(sources.length, count);
  runtime.setIntent({ ...sectorBedToBandIntent(resolveSectorBed('sector_dione_lane')), layer: null });
  assert.equal(runtime.fadingGraph, first);
  assert.ok(pcmSource.stops.length, 'outgoing phrase gets its bounded fade-stop');
  runtime.destroy();
  assert.ok(sources.every(s => s.stops.length));
});
