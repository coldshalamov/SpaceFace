import test from 'node:test';
import assert from 'node:assert/strict';
import { ENEMY_TYPES } from '../src/data/enemies.js';
import { ENEMY_SILHOUETTE_ENGINE_GLOW, engineGlowForSilhouette } from '../src/data/enemyEngineGlow.js';
import { offscreenShooterMarker } from '../src/ui/threatHalo.js';

test('row 490: every enemy type owns a bold silhouette with a distinct engine-glow read', () => {
  assert.ok(ENEMY_TYPES.length >= 20, 'enemy roster present');
  for (const t of ENEMY_TYPES) {
    assert.ok(t.silhouette, `${t.id} missing silhouette`);
    const glow = engineGlowForSilhouette(t.silhouette);
    assert.ok(glow, `${t.id} silhouette ${t.silhouette} has no engine glow`);
    assert.match(glow, /^#[0-9a-f]{6}$/i, `${t.id} glow is not a colour`);
    assert.notEqual(glow.toLowerCase(), '#ff7a3c', `${t.id} kept the generic hostile burn`);
  }
  // Role read needs hue separation, not one shared flame — families must span several colours.
  const distinct = new Set(Object.values(ENEMY_SILHOUETTE_ENGINE_GLOW).map((c) => c.toLowerCase()));
  assert.ok(distinct.size >= 10, `glow table too homogeneous (${distinct.size} hues)`);
});

test('row 490: rings only for threats outside the frame', () => {
  // On-screen hostiles get no edge mark — the silhouette + glow is the read.
  assert.equal(offscreenShooterMarker({ canShoot: true, onScreen: true, screenX: 640, screenY: 360 }), null);
  assert.equal(offscreenShooterMarker({ alive: false, canShoot: true, onScreen: false }), null);
  assert.equal(offscreenShooterMarker({ canShoot: false, onScreen: false }), null);
  // Off-screen shooters still get the one edge mark.
  const m = offscreenShooterMarker({ canShoot: true, onScreen: false, screenX: -200, screenY: 360 });
  assert.ok(m && m.side, 'off-screen shooter earns an edge mark');
});
