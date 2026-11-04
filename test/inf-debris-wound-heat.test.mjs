// inf-debris-wound-heat — the wreckage remembers what killed it, for a beat.
//
// A death burst tore grey-cold metal no matter how the hull died: the shard cooling track
// started at authored cold grey even when the hull's freshest wound was still glowing in the
// killing weapon's own colors. Now the death receipt reads that wound's remaining heat and
// seeds the shard start with it — heated metal carrying the weapon's tint, cooling to the same
// dark end as always. The authored law holds: fragments never wear the cue's semantic paint,
// forced-colors and mineral terrain keep their exact greys and ores.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  WOUND_METAL_HEAT_S,
  resolveWoundMetalHeat,
} from '../src/render/vfx/woundSmoke.js';
import { mixHexGain } from '../src/render/combat/causalStructuralBurst.js';

function scar(born, weapon, severity = 0.6) {
  return {
    hullId: 'h1', lx: 2, lz: -1, ux: 0, uz: 1,
    severity, born, serial: 1,
    wr: weapon ? weapon[0] : null,
    wg: weapon ? weapon[1] : null,
    wb: weapon ? weapon[2] : null,
  };
}

const NOW = 100;

test('a fresh named wound heats the torn metal in the weapon tint over hot steel', () => {
  const plasma = [1.0, 0.35, 0.05];
  const heat = resolveWoundMetalHeat(scar(NOW, plasma), NOW, {});
  assert.equal(heat.gain01, 1, 'a strike this instant carries full breach heat');
  const settling = resolveWoundMetalHeat(scar(NOW - 0.2, plasma), NOW, {}).gain01;
  assert.ok(Math.abs(settling - 0.95) < 1e-9, 'gain eases off the wound clock, not a step');
  const r = (heat.colorHex >> 16) & 0xff;
  const g = (heat.colorHex >> 8) & 0xff;
  const b = heat.colorHex & 0xff;
  // Hot-steel base (255, 214, 148) pulled 45% toward plasma: red stays maxed, blue stays low —
  // it reads as heated metal carrying the tint, not painted glass.
  assert.equal(r, 255);
  assert.ok(b < 110, `blue channel stays low (${b})`);
  assert.ok(g > 120 && g < 200, `green sits between steel and plasma (${g})`);
});

test('the heat fades on the wound clock and then the debris forgets again', () => {
  const ion = [0.2, 0.6, 1.0];
  const fresh = resolveWoundMetalHeat(scar(NOW - 1, ion), NOW, {});
  const aging = resolveWoundMetalHeat(scar(NOW - WOUND_METAL_HEAT_S / 2, ion), NOW, {});
  assert.ok(fresh.gain01 > aging.gain01 && aging.gain01 > 0, 'gain eases down the window');
  assert.ok((aging.colorHex >> 16) & 0xff, 'an aging wound still names its tint');
  const burnt = resolveWoundMetalHeat(scar(NOW - WOUND_METAL_HEAT_S - 0.01, ion), NOW, {});
  assert.equal(burnt.gain01, 0, 'past the window the tear is burnt metal');
});

test('unnamed collisions and legacy scars heat nothing', () => {
  assert.equal(resolveWoundMetalHeat(scar(NOW - 0.2, null), NOW, {}).gain01, 0);
  assert.equal(resolveWoundMetalHeat(null, NOW, {}).gain01, 0);
});

test('the live death reader chooses the newest eligible named wound, not an older severe scar', async () => {
  const {vfx} = await import('../src/render/vfx.js');
  const older = scar(NOW - 6, [1,0,0], 1);
  const fresh = scar(NOW - 0.5, [0,0,1], 0.1);
  const owner = {_causeMarks:{scars:{slots:[older,fresh]}}, _causeNow:()=>NOW};
  const result = vfx._killBreachHeat.call(owner, 'h1');
  assert.deepEqual(result, resolveWoundMetalHeat(fresh, NOW, {}));
  assert.equal(vfx._killBreachHeat.call(owner, 'other'), null);
});

test('the shard start is the authored cold grey pulled toward the heat by the wound gain', () => {
  const cold = 0x94897b;
  const hot = 0xffaa30;
  assert.equal(mixHexGain(cold, hot, 0), cold, 'no gain: exactly the authored cold metal');
  assert.equal(mixHexGain(cold, hot, 1), hot, 'full gain: exactly the heated metal');
  const half = mixHexGain(cold, hot, 0.5);
  assert.ok(Math.abs(((half >> 16) & 0xff) - (((cold >> 16) & 0xff) + (((hot >> 16) & 0xff) - ((cold >> 16) & 0xff)) / 2)) <= 1);
  // A half-cooled tear reads as half-cooled metal, and never over-shoots either end.
  assert.ok(mixHexGain(cold, hot, 1.5) === hot);
  assert.ok(mixHexGain(cold, hot, -0.5) === cold);
});

test('the live owners are wired: the death receipt carries breach heat, the burst writer uses it', () => {
  const vfx = readFileSync(new URL('../src/render/vfx.js', import.meta.url), 'utf8');
  const burst = readFileSync(new URL('../src/render/combat/causalStructuralBurst.js', import.meta.url), 'utf8');
  assert.match(vfx, /import \{ collectHullWounds, resolveWoundBeat, resolveWoundMetalHeat, woundWorldPoint \} from '\.\/vfx\/woundSmoke\.js';/);
  assert.match(vfx, /req\.breachHeat = this\._killBreachHeat\(req\.victimId\);/,
    'the death receipt reads the freshest wound heat');
  assert.match(vfx, /const breachHeat = req\.breachHeat \|\| null;\s*req\.breachHeat = null;/,
    'the shared scratch is consumed and cleared — no heat leaks into the next burst');
  assert.match(burst, /const heat = \(!presentation\.forcedColors && !mineral/,
    'forced colors and mineral terrain keep their authored greys and ores');
  assert.match(burst, /shardColour = heat\s*\?\s*mixHexGain\(0x94897b, heat\.colorHex/,
    'the shard cooling track starts at the breach heat');
});
