// Camera-shake audience probe for the `camera:shake` seam.
//
// THE DEFECT THIS PINS. `camera:shake` has 13 emitters and the renderer's consumer read only
// `{ amount }`, so a shake was a bare scalar with no notion of where it came from. Two of those
// emitters describe WORLD events — the ship-destruction burst in src/render/vfx/explosionPresentationVfx.js
// (0.16 for a small hull, up to 0.62 for a capital) and src/systems/combat.js's `entity:killed` kick (0.5, fired for EVERY
// entity killed) — so a ship dying anywhere in the sector kicked the player's camera exactly as hard
// as one dying on their nose. Measured on the default tutorial route: six unearned kicks in ~30 s of
// flight, from destructions ~920 WU away, at full 0.16 trauma each.
//
// The fix lives at the CONSUMER rather than at every call site: renderer.js routes every shake
// through camera.js's cameraShakeAmountForPlayer. A payload without `position` is already
// player-scoped by construction (player hit / death / respawn, drill, tether, presentation cues)
// and passes through whole; a positioned payload is a WORLD event and — since the camera gate
// landed — spends none of the player's shake budget unless it explicitly claims `audience: 'hero'`,
// in which case it falls off with distance (world effects keep their local light and debris
// feedback). That covers the emitters nobody has audited.
//
// This probe asserts, in order of how likely each is to rot:
//   1. THE CURVE IS SANE — full strength close in, monotonically decreasing, exactly zero at cutoff.
//   2. THE CONSUMER HONORS IT — renderer.js reads `position` and applies the attenuation, and passes
//      un-positioned payloads through unchanged (source pattern; the handler needs a live WebGL
//      renderer to construct, so behavior is pinned at the curve and the emitters instead).
//   3. THE WORLD EMITTERS TAG THEIR POSITION — every emitter in src/ is enumerated and only the
//      files that own world events may send `position`; player-scoped sites deliberately do not.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  cameraShakeAmountForPlayer,
  SHAKE_CUTOFF_RADIUS_WU,
  SHAKE_FULL_RADIUS_WU,
  shakeDistanceAttenuation,
} from '../src/render/camera.js';

const failures = [];
function check(name, fn) {
  try { fn(); console.log(`ok   ${name}`); } catch (err) { failures.push(name); console.error(`FAIL ${name}\n     ${err.message}`); }
}

// ---- 1. the curve -----------------------------------------------------------------------------
check('attenuation is full strength inside the full-strength radius', () => {
  for (const d of [0, 1, SHAKE_FULL_RADIUS_WU * 0.5, SHAKE_FULL_RADIUS_WU]) {
    assert.equal(shakeDistanceAttenuation(d), 1, `distance ${d} should be unattenuated`);
  }
});

check('attenuation is exactly zero at and beyond the cutoff radius', () => {
  assert.equal(shakeDistanceAttenuation(SHAKE_CUTOFF_RADIUS_WU), 0, 'cutoff must reach exactly zero, not merely small');
  assert.equal(shakeDistanceAttenuation(SHAKE_CUTOFF_RADIUS_WU * 4), 0, 'beyond cutoff stays zero');
});

check('attenuation decreases monotonically across the falloff band', () => {
  let prev = Infinity;
  for (let d = SHAKE_FULL_RADIUS_WU; d <= SHAKE_CUTOFF_RADIUS_WU; d += 10) {
    const a = shakeDistanceAttenuation(d);
    assert(a <= prev + 1e-12, `attenuation rose between ${d - 10} and ${d} WU (${prev} -> ${a})`);
    assert(a >= 0 && a <= 1, `attenuation out of range at ${d} WU: ${a}`);
    prev = a;
  }
});

check('a mid-range destruction is strongly damped, not merely nudged', () => {
  // The measured regression case: a small hull popping ~920 WU away used to land its full 0.16.
  const att = shakeDistanceAttenuation(920);
  assert(0.16 * att < 0.01, `0.16 trauma at 920 WU should fall under 0.01 (got ${(0.16 * att).toFixed(4)})`);
  // And a kill right beside the player must still be felt at close to full force.
  assert(shakeDistanceAttenuation(60) === 1, 'a kill inside the full-strength radius must not be damped');
});

check('non-finite and negative distances degrade to full strength rather than NaN', () => {
  for (const bad of [NaN, undefined, null, -50, Infinity]) {
    const a = shakeDistanceAttenuation(bad);
    assert(Number.isFinite(a) && a >= 0 && a <= 1, `attenuation for ${String(bad)} must stay in [0,1], got ${a}`);
  }
});

// ---- 2. the consumer --------------------------------------------------------------------------
const rendererSrc = readFileSync(new URL('../src/render/renderer.js', import.meta.url), 'utf8');

check('renderer routes every shake through the shared camera.js amount-for-player helper', () => {
  assert.match(rendererSrc, /import \{[^}]*cameraShakeAmountForPlayer[^}]*\} from '\.\/camera\.js'/,
    'renderer must import cameraShakeAmountForPlayer from camera.js (a second local routing would drift)');
  const handler = rendererSrc.slice(rendererSrc.indexOf("onBus('camera:shake'"));
  assert(handler.includes('cameraShakeAmountForPlayer'),
    'the camera:shake handler must route amounts through the shared helper');
  assert(handler.includes('cam.addTrauma(scaled'),
    'the handler must add trauma from the routed amount (or the impact-kick path scaled from it)');
});

check('un-positioned shakes pass through whole; world events need hero admission to spend', () => {
  // The default-to-whole and audience contracts moved into camera.js's routing helper, so they
  // are pinned behaviorally, not as handler source text: with no usable position the amount
  // must reach the camera whole, and a positioned payload without `audience: 'hero'` spends
  // nothing — world effects keep their local feedback and only an admitted hero beat may
  // draw on the player's shake budget, attenuated by distance from there.
  assert.equal(cameraShakeAmountForPlayer({ amount: 0.3 }, null), 0.3,
    'an un-positioned cue reaches the camera whole');
  assert.equal(cameraShakeAmountForPlayer({ amount: 0.3 }, undefined), 0.3,
    'an un-positioned cue stays whole with no player position to measure against');
  assert.equal(cameraShakeAmountForPlayer({ amount: 0.16, position: { x: 0, z: 0 } }, { x: 0, z: 0 }), 0,
    'a positioned world event without hero admission spends none of the shake budget');
  assert.equal(cameraShakeAmountForPlayer({ amount: 0.5, position: { x: 60, z: 0 }, audience: 'hero' }, { x: 0, z: 0 }), 0.5,
    'a hero beat inside the full-strength radius is unattenuated');
  const far = cameraShakeAmountForPlayer({ amount: 0.16, position: { x: 920, z: 0 }, audience: 'hero' }, { x: 0, z: 0 });
  assert(far < 0.01, `a hero beat ~920 WU out must stay a rounding error (got ${far.toFixed(4)})`);
});

// ---- 3. the emitters --------------------------------------------------------------------------
// The emitters no longer live only in combat.js — `camera:shake` sites now span systems/ and
// render/ (combat, vfx, shipMicroMotion, drill, tetherGameplay, intervention, flybyFocus,
// survivalAnnounce, presentationAdapters). The durable contract was always positional, never a
// per-file count: a payload carrying `position` is a WORLD event the consumer attenuates by
// distance, and every other emitter must stay un-positioned because it is player-scoped by
// construction. So this section enumerates EVERY `emit('camera:shake', …)` site in src/ and pins
// the positioned set to the files that own world events.

const SRC_ROOT = fileURLToPath(new URL('../src/', import.meta.url));
// The world events: destruction bursts and the death-spiral detonation happen where the ship
// died; the entity:killed kick happens where the kill landed.
const WORLD_SHAKE_FILES = new Set([
  // The ship-destruction bursts (rupture/burst/tear phases) moved out of vfx.js into the
  // explosion presentation module; they are still world events and still tag where they hit.
  'render/vfx/explosionPresentationVfx.js',
  'render/shipMicroMotion.js',
  'systems/combat.js',
  // swarmJuice multi-kill/wipe dips tag the victim position and claim hero admission — a real
  // world location, so a far-off swarm wipe attenuates instead of kicking at full force.
  'systems/swarmJuice.js',
]);

/** Capture the balanced `{…}` literal that starts at index 0 of `src` (src must start at `{`). */
function balancedObjectLiteral(src) {
  let depth = 0;
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(0, i + 1);
  }
  return src;
}

/**
 * Enumerate every `emit('camera:shake', …)` site in src/. Inline literals are read directly; an
 * identifier payload (a reused pooled object, e.g. shipMicroMotion's `spiralShakePayload`) is
 * resolved through its nearest preceding `ident = {…}` initializer plus any `ident.position`
 * member writes, so the classification survives emitters that no regex on one line can see.
 */
function shakeEmitters() {
  const sites = [];
  const walk = (dir) => {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, ent.name);
      if (ent.isDirectory()) { walk(p); continue; }
      if (!ent.name.endsWith('.js')) continue;
      const src = readFileSync(p, 'utf8');
      const rel = p.slice(SRC_ROOT.length).replace(/\\/g, '/');
      for (const m of src.matchAll(/emit\(\s*'camera:shake'\s*,\s*/g)) {
        const arg = src.slice(m.index + m[0].length).trimStart();
        if (arg.startsWith('{')) {
          sites.push({ file: rel, body: balancedObjectLiteral(arg) });
          continue;
        }
        const ident = (/^[$\w]+/).exec(arg);
        if (!ident) { sites.push({ file: rel, body: arg.slice(0, 60) }); continue; }
        const name = ident[0];
        const emitAt = m.index + m[0].length;
        let body = '';
        const defRe = new RegExp('\\b' + name + '\\s*=\\s*\\{', 'g');
        let d;
        while ((d = defRe.exec(src)) && d.index < emitAt) {
          body = balancedObjectLiteral(src.slice(d.index + d[0].lastIndexOf('{')));
        }
        // `ident.position.x = …` member writes after the initializer still make it positioned.
        if (new RegExp('\\b' + name + '\\s*\\.\\s*position\\b').test(src)) body += ' position:{}';
        sites.push({ file: rel, body });
      }
    }
  };
  walk(SRC_ROOT);
  return sites;
}

check('the ship-destruction bursts tag their world positions', () => {
  const bursts = shakeEmitters().filter((s) => s.file === 'render/vfx/explosionPresentationVfx.js');
  assert(bursts.length >= 2, 'expected the destruction-burst emitters in the explosion presentation module');
  assert(bursts.some((s) => s.body.includes('shake')),
    'expected the destruction-burst emitter (amount derived from `shake`)');
  for (const s of bursts) {
    assert(s.body.includes('position'),
      `destruction shakes must send position so they can be scoped to the world (got: ${s.body.slice(0, 90)})`);
  }
});

check('the entity-killed kick tags its world position, and player-scoped kicks do not', () => {
  const combat = shakeEmitters().filter((s) => s.file === 'systems/combat.js');
  assert(combat.length >= 2, `expected camera:shake emitters in combat.js (found ${combat.length})`);
  const positioned = combat.filter((s) => s.body.includes('position'));
  assert.equal(positioned.length, 1,
    'exactly one combat.js shake is a world event (entity:killed); the rest are player-scoped and must stay un-positioned');
  assert(positioned[0].body.includes('0.5'), 'the positioned combat.js shake should be the 0.5 entity:killed kick');
});

check('only world-event files emit positioned shakes, wherever the emitters live', () => {
  const sites = shakeEmitters();
  assert(sites.length >= 8, `expected the known camera:shake emitter set across src/ (found ${sites.length})`);
  const positioned = sites.filter((s) => s.body.includes('position'));
  for (const s of positioned) {
    assert(WORLD_SHAKE_FILES.has(s.file),
      `${s.file} emitted a positioned shake — a new world event must tag position deliberately; `
      + 'add the file to the world set only when the event is really world-scoped');
  }
  for (const file of WORLD_SHAKE_FILES) {
    assert(positioned.some((s) => s.file === file),
      `${file} must still tag its world-event shake with position`);
  }
});

if (failures.length) {
  console.error(`\nFAIL check:camera-shake-scope — ${failures.length} failing group(s)`);
  process.exit(1);
}
console.log('\nPASS check:camera-shake-scope');
