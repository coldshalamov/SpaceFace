import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  doctrineTellKind,
  resolveDoctrineTellPlacement,
  resolveObjectiveHudLayout,
} from '../src/ui/hud.js';

const hudSource = readFileSync(new URL('../src/ui/hud.js', import.meta.url), 'utf8');

function overlaps(a, b) {
  return a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y;
}

function chipRect(placement) {
  return {
    x: placement.x - placement.width / 2,
    y: placement.y - placement.height / 2,
    width: placement.width,
    height: placement.height,
  };
}

test('live doctrine telegraphs map to the three player-readable tells', () => {
  assert.equal(doctrineTellKind({ kind: 'engine_flare' }), 'FLYBY');
  assert.equal(doctrineTellKind({ kind: 'attach_spool' }), 'TETHER');
  assert.equal(doctrineTellKind({ kind: 'weapon_charge' }), 'CHARGE');
  assert.equal(doctrineTellKind({ doctrineId: 'interceptor_flyby' }), 'FLYBY');
  assert.equal(doctrineTellKind({ doctrineId: 'tether_control_raider' }), 'TETHER');
  assert.equal(doctrineTellKind({ doctrineId: 'ranged_disengager' }), 'CHARGE');
  assert.equal(doctrineTellKind({ kind: 'ambient' }), null);
});

test('off-screen tell placement stays visible, points truthfully, and avoids persistent HUD anchors', () => {
  for (const [width, height] of [[1280, 720], [1920, 1080]]) {
    const layout = resolveObjectiveHudLayout(width, height);
    const reserved = [layout.objective, layout.vitals, layout.action, layout.rightDock];
    const samples = [
      { x: -600, y: height + 400, onScreen: false },
      { x: width + 700, y: height + 350, onScreen: false },
      { x: width / 2, y: -500, onScreen: false },
      { x: width / 2, y: height + 500, onScreen: false },
    ];
    for (const projected of samples) {
      const placement = resolveDoctrineTellPlacement(width, height, projected, 0);
      assert.ok(placement, 'finite off-screen projection produces a placement');
      const rect = chipRect(placement);
      assert.ok(rect.x >= 0 && rect.y >= 0, 'chip begins inside viewport');
      assert.ok(rect.x + rect.width <= width && rect.y + rect.height <= height,
        'chip ends inside viewport');
      assert.ok(Number.isFinite(placement.directionDeg), 'direction angle is explicit');
      for (const anchor of reserved) {
        assert.equal(overlaps(rect, anchor), false, 'transient tell does not cover a persistent HUD anchor');
      }
    }
  }
});

test('on-screen tells stay enemy-linked but move clear of the one-objective stack', () => {
  const width = 1280;
  const height = 720;
  const layout = resolveObjectiveHudLayout(width, height);
  const projected = {
    x: layout.objective.x + layout.objective.width / 2,
    y: layout.objective.y + layout.objective.height / 2 + 36,
    onScreen: true,
  };
  const placement = resolveDoctrineTellPlacement(width, height, projected, 1);
  assert.equal(placement.onScreen, true);
  assert.equal(overlaps(chipRect(placement), layout.objective), false,
    'enemy-linked chip yields to the persistent objective');
});

test('HUD uses one accessible announcement and a max-three reduced-effects chip pool', () => {
  const start = hudSource.indexOf('// ---- M1 doctrine player-tells');
  const end = hudSource.indexOf('// ---- HUD meta-arc', start);
  assert.ok(start >= 0 && end > start, 'M1 tell implementation has an auditable boundary');
  const section = hudSource.slice(start, end);

  assert.match(hudSource, /const TELL_POOL_SIZE = 3;/);
  assert.match(section, /tellRoot\.setAttribute\('aria-hidden', 'true'\)/);
  assert.match(section, /tellLiveAssertive\.textContent = announce/);
  assert.equal((section.match(/setAttribute\('aria-live'/g) || []).length, 1,
    'only the shared fallback announcer may declare a live region');
  assert.match(section, /getMotionReduced\(\)/);
  assert.match(section, /getFlashReduced\(\)/);
  assert.match(section, /dirEl\.style\.transform = `rotate\(/,
    'off-screen direction glyph rotates toward the projected threat');
  assert.match(section, /resolveDoctrineTellPlacement\(/,
    'runtime uses the tested objective-safe placement helper');
  assert.match(section, /if \(!placement\)[\s\S]*?setDisplay\(slot\.el, true, 'inline-flex'\)/,
    'a tell hidden while projection is unavailable remounts when authoritative placement returns');
  assert.doesNotMatch(section, /\[F\]|\bKeyF\b/,
    'tell/tether copy does not hard-code the default tether key');
});
