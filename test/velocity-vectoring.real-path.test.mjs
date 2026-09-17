// Velocity-vectoring assist on the REAL path (docs/TUNING_JOBS.md job 1). Prints the before/after
// quadruple for the C-band variants and guards the bars the packet names.
import assert from 'node:assert/strict';
import test from 'node:test';

import { measureVelocityVectoring, formatRows, DEFAULT_SEED } from './velocity-vectoring.real-path.mjs';

const LONG = { timeout: 600_000 };
const TWITCH = 'Turn NOW when I twitch.';
const EARNED = 'If I swing well, slingshot well, fly well, I EARN speed and I KEEP it.';
const B2 = 'From rest to cruise ≤ 1.5 s. Full 180° velocity reversal ≤ 3.0 s. Turn radius at cruise ≤ 1 screen depth.';
const B1 = 'After leaving the cap at 2× cruise by ANY means, speed 10 s later is ≥ 99 % of the exit speed with hands off, and ≥ 99 % with forward held.';
const TICK_S = 1 / 60;

test('velocity vectoring on the real path: the band keeps B1/B2 and redirects sooner at full speed', LONG, async () => {
  const rows = await measureVelocityVectoring({ seed: DEFAULT_SEED });
  console.log('\n' + formatRows(rows) + '\n');
  const off = rows.find((r) => r.variant === 'off');
  const band = rows.find((r) => r.variant === '1.6/0.9');
  assert.ok(off && band, 'the off row and the band row must both be measured');

  // B1 — zero above the cap, tick for tick (sector fence removed for these arms; see the harness).
  for (const r of rows) {
    assert.ok(r.earnedHandsOffSwung.keptFraction >= 0.99, `${B1} — ${r.variant} hands off, nose swung, kept ${r.earnedHandsOffSwung.keptFraction}`);
    assert.ok(r.earnedForwardHeld.keptFraction >= 0.99, `${B1} — ${r.variant} forward held kept ${r.earnedForwardHeld.keptFraction}`);
    assert.ok(r.earnedForwardStrafe.keptFraction >= 0.99, `${B1} — ${r.variant} forward + strafe held kept ${r.earnedForwardStrafe.keptFraction}`);
    assert.ok(Math.abs(r.earnedHandsOffSwung.speedAt10s - off.earnedHandsOffSwung.speedAt10s) < 1e-6,
      `${EARNED} — with no main drive the assist can never be live: ${r.variant} must match the unassisted ship exactly (${r.earnedHandsOffSwung.speedAt10s} vs ${off.earnedHandsOffSwung.speedAt10s})`);
  }

  // B2 clauses 1 and 2 are untouched by construction (no vectoring without main thrust; a flip is
  // not a turn): the numbers must be identical to the unassisted ship within one tick.
  assert.ok(Math.abs(band.restToCruiseS - off.restToCruiseS) <= TICK_S + 1e-9,
    `${B2} — rest to cruise must not move (${band.restToCruiseS} vs ${off.restToCruiseS})`);
  assert.ok(band.velocity180TimeS != null && off.velocity180TimeS != null
    && Math.abs(band.velocity180TimeS - off.velocity180TimeS) <= TICK_S + 1e-9,
  `${B2} — the flip-and-burn reversal must not move (${band.velocity180TimeS} vs ${off.velocity180TimeS})`);
  assert.ok(band.restToCruiseS <= 1.5, `${B2} — rest to cruise ${band.restToCruiseS} s`);
  assert.ok(band.velocity180TimeS <= 3.0, `${B2} — reversal ${band.velocity180TimeS} s`);

  // B2 clause 3 — the assist must not widen the turn (the bar itself is judged by
  // feel.reversal_course; here the guard is "no regression beyond noise").
  assert.ok(band.turnRadius.radiusScreenDepths != null && off.turnRadius.radiusScreenDepths != null,
    'both turn sweeps must complete');
  assert.ok(band.turnRadius.radiusScreenDepths <= off.turnRadius.radiusScreenDepths * 1.05,
    `${B2} — turn radius must not regress beyond 5% (${band.turnRadius.radiusScreenDepths} vs ${off.turnRadius.radiusScreenDepths} screens)`);

  // The packet's metric and the felt case: sooner, and at speed.
  assert.ok(band.redirect90.timeS != null && off.redirect90.timeS != null
    && band.redirect90.timeS < off.redirect90.timeS,
  `${TWITCH} — redirect90 must get sooner (${band.redirect90.timeS} vs ${off.redirect90.timeS} s)`);
  assert.ok(band.twitch90.timeS != null && off.twitch90.timeS != null
    && band.twitch90.timeS <= off.twitch90.timeS * 0.75,
  `${TWITCH} — a held 100 deg twitch must bend the path 90 deg at least 25% sooner (${band.twitch90.timeS} vs ${off.twitch90.timeS} s)`);
  assert.ok(band.twitch90.minSpeed >= band.twitch90.cruiseSpeed * 0.9,
    `${EARNED} — the twitch keeps >= 90% of cruise while bending (min ${band.twitch90.minSpeed} of ${band.twitch90.cruiseSpeed})`);
  assert.ok(band.redirect90.minSpeed > off.redirect90.minSpeed,
    `${EARNED} — redirect90 keeps more speed than the unassisted speed dump (min ${band.redirect90.minSpeed} vs ${off.redirect90.minSpeed})`);
});
