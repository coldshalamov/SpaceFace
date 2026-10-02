// GFX-16: the ANI-38 chassis kit scales its secondary motion by the hull's own size, so a 60 m
// dreadnought breathes slowly through small angles and a 10 m dart twitches quickly: motion that
// respects size and weight. The rule lives in tools/blender/forge/animations/ANI_38.py
// (REF_LENGTH 22 m, time ~ length^0.5, angle ~ length^-0.35); this test pins it against the shipped
// banks and the hull sizes in the model census, so a re-bake that drops it fails here.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const REF_LENGTH = 22.0;
const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));
const timeScale = (length) => clamp((length / REF_LENGTH) ** 0.5, [0.75, 2.2]);
const angleScale = (length) => clamp((length / REF_LENGTH) ** -0.35, [0.55, 1.6]);

const fleet = JSON.parse(readFileSync(resolve(ROOT, 'tools/blender/forge/fleet.json'), 'utf8')).ships;
const census = JSON.parse(readFileSync(resolve(ROOT, 'src/data/modelTruthCensus.json'), 'utf8')).rows;

function chassisHulls() {
  const hulls = [];
  for (const [id, entry] of Object.entries(fleet)) {
    if (entry.layout === 'place') continue;
    const bankPath = resolve(ROOT, `assets/ships/motions/${entry.file.replace(/_/g, '-')}.motion.json`);
    if (!existsSync(bankPath)) continue;
    const bank = JSON.parse(readFileSync(bankPath, 'utf8'));
    const idle = bank.clips.find((clip) => clip.name === 'hull_idle');
    if (!idle) continue;                       // bespoke rigs (hornet, kestrel, wasp) have no chassis clips
    const row = census.find((r) => r.url && r.url.endsWith(`/${entry.file}.glb`));
    if (!row || !row.bounds) continue;
    const length = Math.max(row.bounds.size[0], row.bounds.size[2]);
    hulls.push({ id, length, bank, idle });
  }
  return hulls.sort((a, b) => a.length - b.length);
}

function maxAngleDeg(clip) {
  let peak = 0;
  for (const ch of clip.channels) {
    if (ch.path !== 'rotation') continue;
    for (let i = 0; i < ch.values.length; i += 4) {
      peak = Math.max(peak, (2 * Math.acos(Math.min(1, Math.abs(ch.values[i + 3])))) * (180 / Math.PI));
    }
  }
  return peak;
}

const hulls = chassisHulls();

test('there are chassis-rigged hulls of very different sizes to compare', () => {
  assert.ok(hulls.length >= 20, `found ${hulls.length} chassis hulls`);
  assert.ok(hulls[0].length < 16 && hulls[hulls.length - 1].length > 50, 'spans the small darts to the dreadnought');
});

test('every chassis clip lasts as long as its hull is heavy (time ~ length^0.5)', () => {
  for (const h of hulls) {
    const k = timeScale(h.length);
    assert.ok(Math.abs(h.idle.durationS - 8 * k) <= 8 * k * 0.04, `${h.id}: hull_idle ${h.idle.durationS}s vs ${(8 * k).toFixed(2)}s expected`);
    const brace = h.bank.clips.find((c) => c.name === 'hull_brace');
    assert.ok(Math.abs(brace.durationS - 1.2 * k) <= 1.2 * k * 0.04, `${h.id}: hull_brace ${brace.durationS}s vs ${(1.2 * k).toFixed(2)}s`);
  }
});

test('bigger hulls move through smaller angles (angle ~ length^-0.35)', () => {
  for (const h of hulls) {
    const wag = h.bank.clips.find((c) => c.name === 'hull_wag');
    const expected = 4.5 * angleScale(h.length);
    assert.ok(Math.abs(maxAngleDeg(wag) - expected) <= expected * 0.06, `${h.id}: wag ${maxAngleDeg(wag).toFixed(2)} deg vs ${expected.toFixed(2)} deg`);
  }
});

test('the heaviest hull is slower and gentler than the lightest, and a reference hull is untouched', () => {
  const light = hulls[0];
  const heavy = hulls[hulls.length - 1];
  assert.ok(heavy.idle.durationS > light.idle.durationS * 1.5, 'the dreadnought idles on a clearly longer cycle');
  assert.ok(maxAngleDeg(heavy.idle) < maxAngleDeg(light.idle) * 0.7, 'and breathes through clearly smaller angles');
  const medium = hulls.find((h) => Math.abs(h.length - REF_LENGTH) < 1.2);
  if (medium) assert.ok(Math.abs(medium.idle.durationS - 8) < 0.4, `a ${medium.length.toFixed(1)} m hull keeps the reference 8 s cycle`);
});

test('every shipped bank clip sits on the 60 fps grid and closes inside its own duration', () => {
  // A mass-scaled duration (7.409 s) once shipped a last key at 7.4167 s; the runtime validator
  // rejected the whole bank at bind, so 32 hulls silently lost every authored motion.
  const dir = resolve(ROOT, 'assets/ships/motions');
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.motion.json'))) {
    const bank = JSON.parse(readFileSync(resolve(dir, file), 'utf8'));
    for (const clip of bank.clips) {
      const frames = clip.durationS * 60;
      assert.ok(Math.abs(frames - Math.round(frames)) < 1e-6, `${file} ${clip.name}: ${clip.durationS}s is off the 60 fps grid`);
      for (const ch of clip.channels) {
        const last = Math.max(...ch.times);
        assert.ok(last <= clip.durationS + 1e-6, `${file} ${clip.name}: key at ${last}s past the ${clip.durationS}s clip`);
      }
    }
  }
});
