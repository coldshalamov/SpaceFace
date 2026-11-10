// S8 — the spectacle ladder's global flash law.
// A flash is a world-space sprite; its screen-area fraction reads (size / liveZoom)^2.
// The plan's law: ≤ 15% of the screen and ≤ 0.2 s, for the largest bomb's beat, global.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FLASH_SCREEN_FRACTION_CAP,
  FLASH_LIFE_CAP_S,
  clampFlashToScreenCap,
  flashScreenCapSize,
} from '../src/render/vfxAccessibility.js';
import { BOMB_DEFS } from '../src/data/bombs.js';

const areaFraction = (size, liveZoom) => (size / liveZoom) ** 2;

test('the global flash law bounds area and life', () => {
  assert.ok(FLASH_SCREEN_FRACTION_CAP <= 0.15);
  assert.ok(FLASH_LIFE_CAP_S <= 0.2);
});

test('the largest bomb flash fits under the cap at the tightest zoom', () => {
  // The largest bomb beat: biggest payload radius through bombDetonationVfx's own growth
  // (radius = clamp(sqrt(payloadRadius) * 1.8, 7, 24)) — its flash fronts ride a fraction of that.
  const biggest = Math.max(...Object.values(BOMB_DEFS).map((d) => d.radius || 0));
  const bombRadius = Math.min(24, Math.max(7, Math.sqrt(Math.max(1, biggest)) * 1.8));
  // Tightest lens the flight camera can hold — a smaller zoom is a bigger screen share.
  const tightZoom = 40;
  const authoredFlash = { life: 0.075, size0: bombRadius * 0.055, size1: bombRadius * 2.4 };
  clampFlashToScreenCap(authoredFlash, tightZoom);
  assert.ok(areaFraction(authoredFlash.size1, tightZoom) <= FLASH_SCREEN_FRACTION_CAP * (1 + 1e-9),
    `flash ${authoredFlash.size1}wu at zoom ${tightZoom} must stay under ${FLASH_SCREEN_FRACTION_CAP}`);
  assert.ok(authoredFlash.life <= FLASH_LIFE_CAP_S);
});

test('a deliberately oversized flash is cut to the cap, not the authored size', () => {
  const authored = { life: 1.5, size0: 500, size1: 900, opacity0: 1, opacity1: 0 };
  clampFlashToScreenCap(authored, 144);
  assert.equal(authored.size1, flashScreenCapSize(144));
  assert.equal(authored.life, 0.2);
});

test('a small flash is not grown by the cap', () => {
  const authored = { life: 0.08, size0: 2, size1: 4, opacity0: 1, opacity1: 0 };
  clampFlashToScreenCap(authored, 144);
  assert.equal(authored.size0, 2);
  assert.equal(authored.size1, 4);
  assert.equal(authored.life, 0.08);
});

test('a missing or degenerate zoom falls back to the nominal flight lens', () => {
  assert.equal(flashScreenCapSize(0), flashScreenCapSize(144));
  assert.equal(flashScreenCapSize(NaN), flashScreenCapSize(144));
});
