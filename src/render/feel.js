// Game-feel "punch" system (V2 plan §9). The single highest-leverage feel layer for an action
// space game: micro hit-stop (brief timeScale dip) on heavy hits, plus a synchronized FOV punch
// and a red damage vignette. None of this adds gameplay — it makes every impact *land*.
//
// DESIGN (cooperates with the rest of the engine, never fights it):
//   - Hit-stop is a render-phase request to the core time-effects owner. The lowest active request
//     wins, so expiry reveals any remaining pause/Focus request instead of restoring over it.
//   - The FOV punch is a transient additive offset on the chase camera's fov, eased back. We reach
//     the camera via state.render.camera (a PerspectiveCamera) and restore its projection matrix.
//   - The damage vignette is a pooled DOM radial gradient that flashes on heavy player hits and
//     snaps off — the directional-hit indicator work is a separate concern; this is pure *punch*.
//   - Everything is gated on state.settings.video.motionReduce (new): vestibular-sensitive players
//     get the audio/number feedback with the shake/zoom/time-freeze suppressed. Accessibility is
//     table stakes (V2 §9, §12). Default OFF (motionReduce=false) so the punch is felt by default.
//
// This is a render-phase system (no sim update). Driven from registry.renderUpdate -> feel.frame().
// All event subscriptions are registered in init; frame() integrates the timers.
import { damp } from '../core/math.js';
import { createTimeEffects } from '../core/timeEffects.js';
import { WEAPONS } from '../data/weapons.js';
import {
  VL_COLOR,
  VL_COMPOSITE,
  publishVelocityLanguage,
  resolveRegionCrossfade,
  velocityBandDrive,
  velocityLanguageFlag,
} from './velocityLanguage.js';

// Weapon recoil weight lookup (built once). The player's own gun firing produces zero camera
// response today — that inertness is the #1 "combat feels flat" tell. We scale the recoil kick by
// weapon size (S/M/L) and damage type (explosive/kinetic hit harder than energy/thermal), and by
// how slow the rate-of-fire is (a single railgun shot should punch more than a pulse laser tick).
// Fully data-driven: new weapons in WEAPONS[] get scaled automatically, no hardcoded IDs.
const WEAPON_BY_ID = new Map(WEAPONS.map((w) => [w.id, w]));
function recoilWeight(weaponId) {
  const w = WEAPON_BY_ID.get(weaponId);
  if (!w) return 0.08;   // unknown weapon — small default kick
  let weight = 0.06;     // baseline
  if (w.size === 'M') weight = 0.10;
  if (w.size === 'L') weight = 0.14;
  if (w.damageType === 'explosive') weight *= 1.6;   // missiles/torpedoes
  if (w.damageType === 'kinetic') weight *= 1.25;    // railgun/autocannon
  if (w.damageType === 'thermal') weight *= 0.9;     // plasma
  // slow heavy hitters (low rof) punch harder per shot; fast weapons stay light to avoid nausea
  const rof = w.rof || 0;
  if (rof > 0 && rof < 1.5) weight *= 1.3;
  return Math.min(0.2, weight);
}

const STYLE_ID = 'sf-feel-style';

// Tunables — spec2/02 §3 exact numbers. Hit-stop is short so it reads as "weight," not "lag.
// No hit-stop on ordinary hits; shield-break = 40 ms, player kill = 60 ms. Capital kills carry
// longer trauma but no extended freeze by default. Death is the only long cinematic dip.
const HS_HEAVY = 0.055;       // s — timeScale dip duration for a heavy hit (big damage)
const HS_SHIELD_BREAK = 0.04; // s — shield-break hit-stop (spec2/02 §3)
const HS_ARMOR_HIT = 0.0;     // s — armor hits do NOT freeze (spec2/02 §3)
const HS_HULL_HIT = 0.0;      // s — hull hits do NOT freeze (spec2/02 §3)
const HS_KILL = 0.06;         // s — small-kill hit-stop (spec2/02 §3)
const HS_CAPITAL_KILL = 0.80; // s — capital-kill hit-stop window (≤ 800 ms, spec2/02 §3)
const HS_DEATH = 0.90;        // s — dip duration for the player dying (the biggest beat)
const HS_RAMP_TIME = 0.25;    // s — cinematic ease-IN for the death dip (1 -> floor over this window)
const HS_DEPTH = 0.12;        // timeScale floor during a normal dip
const FOV_PUNCH_HEAVY = 2.2;   // deg additive on heavy hit
const FOV_PUNCH_KILL  = 4.0;   // deg additive on kill
const FOV_PUNCH_DEATH = 7.0;   // deg additive on player death
const FOV_DECAY = 6.5;         // exponential decay rate (higher = snappier return)
// Weapon-recoil fov kick (per player shot). Smaller than a heavy-hit punch since it fires often; a
// quick 0.5-1.5° kick that decays fast reads as "kickback" without going seasick on auto fire.
const RECOIL_FOV_MAX = 1.5;    // deg additive per shot (scaled down by recoilWeight)
const RECOIL_FOV_MIN = 0.4;    // floor so even the lightest weapon nudges the fov a touch

const BOOST_FOV_PUNCH = 2.8;   // deg additive on boost ignition (top-down speed kick)
const BOOST_TRAUMA = 0.18;     // camera shake on boost ignition

const VIG_HEAVY = 0.18;   // peak vignette opacity for a heavy hit on the player
const VIG_DEATH = 0.55;   // peak vignette opacity for player death
const VIG_DECAY = 4.0;    // vignette fade rate

// Speed-line ceilings. The streak drive is `intensity`, documented as 0..1 but historically never
// clamped: it is derived from speed/maxSpeed, and long-distance travel and cruise push that ratio
// far past 1 (ratio 10 produced intensity 15.5). Every downstream term scaled with it, and since
// the streaks composite with 'lighter', per-streak alpha above 1 saturated to fully opaque white —
// the screen washed out at high speed. These are hard ceilings, not taste: each is set at or above
// the value legitimate flight already reaches, so ordinary and boosting gameplay is untouched and
// only the runaway case is bounded.
// The ceilings are exported so the probe asserts against these names rather than its own copies of
// the numbers — a loosened ceiling here cannot pass by silently agreeing with a stale literal.
export const SL_STREAK_MAX = 46;      // count — live streak ceiling (= the boost-tier count at intensity 1)
export const SL_OPACITY_MAX = 0.55;   // 0..1 — overlay opacity ceiling (= the boost target the code aims at)
export const SL_ALPHA_MAX = 0.55;     // 0..1 — per-streak composed alpha ceiling; no streak may reach opaque
export const SL_LEN_SCALE_MAX = 1.96; // × — tail-length ceiling (0.55h clamp ÷ 0.28 max streak len: the
                                      //     point where the longest streak already saturates that clamp)
export const SL_FLOW_MAX = 2600;      // screen-px/s — streak flow ceiling; above this every streak
                                      //     recycles every frame and the field degenerates to a strobe
const SL_CLEAR_R = 0.075;      // × min(w,h) — radius around screen centre kept completely streak-free
const SL_CLEAR_FADE = 0.085;   // × min(w,h) — fade band outside that radius, so the hole reads as the
                               //     streaks parting around the ship rather than a stamped-out circle
const SL_BRIGHT_MAX = 0.95;    // × — the largest per-streak brightness `b` _newStreak can roll (0.40+0.55)

// Band-3 grain field (D7). A small repeating tile is orders of magnitude cheaper than per-pixel
// noise and, being baked once from a fixed hash, is byte-identical on every boot.
const SL_NO_STREAKS = Object.freeze([]);   // iterated when the streak pass is skipped entirely
const GRAIN_TILE = 96;             // px — tile edge; also the modulo that bounds the scroll offset
const GRAIN_SCROLL_PX_S = 340;     // px/s — the field shears past at a fixed rate; only its OPACITY
                                   //     tracks speed, because a field that also accelerates reads
                                   //     as a strobe, which is the loud tell the redesign removes

// Math.min/Math.max PROPAGATE NaN — `Math.min(1, Math.max(0, NaN))` is NaN, not 0. A non-finite
// velocity (a physics hiccup, a zero-mass divide) would therefore sail straight through a naive
// clamp and reach the canvas as an Infinity line width or a NaN gradient stop. Non-finite collapses
// to the floor instead: the overlay fails dark, which is the correct direction for a whiteout bug.
const clamp01 = (x) => (Number.isFinite(x) ? (x < 0 ? 0 : x > 1 ? 1 : x) : 0);
const clampTo = (x, max) => (Number.isFinite(x) ? (x < 0 ? 0 : x > max ? max : x) : 0);

// The scalar drive behind the speed-line overlay, extracted so it can be probed headlessly
// (scripts/check-speed-lines.mjs) — the canvas loop below is the only caller, so the probe tests
// the shipped math rather than a copy that can drift. Geometry and the centre guard stay in the
// loop; this owns only the numbers that used to run away.
//
// ONE SEAM, TWO VOCABULARIES. Wave 3 replaces the language entirely (ADR D7 — see
// ./velocityLanguage.js), but the redesign is flag-switched here rather than pasted over the legacy
// body, for two reasons that are not ceremony:
//
//   1. The legacy branch stays REACHABLE AND PINNED. `scripts/check-speed-lines.mjs` asserts exact
//      literals for cruise/boost against the pre-Slice-0 formulas, and those assertions exist to
//      prove the BOUNDING work never restyled ordinary flight. Deleting the branch would delete the
//      proof along with it; rewriting the literals to match the new language would be weakening the
//      assertion to fit the change, which is the one thing a regression check must never allow.
//   2. It is a kill switch. If the new vocabulary reads wrong in play, one boolean restores a known,
//      bounded, shipped look without a revert.
//
// The flag defaults ON in the browser, so the four-band language is what actually runs in the game;
// the legacy branch is what runs under node, which is why the existing pins still describe it.
// Read at CALL TIME — a cached flag cannot be opted into by a headless test.
export function speedLineDrive(speed, maxSpeed, boosting, motionReduce) {
  if (velocityLanguageFlag('bands')) {
    return velocityBandDrive(speed, maxSpeed, boosting, motionReduce);
  }
  return speedLineDriveLegacy(speed, maxSpeed, boosting, motionReduce);
}

// The Slice 0 bounded drive, verbatim. Exported so the probe can assert the legacy branch directly
// without having to toggle a global, and so this file states plainly which numbers are historical.
export function speedLineDriveLegacy(speed, maxSpeed, boosting, motionReduce) {
  const maxSpd = Math.max(1, Number.isFinite(maxSpeed) ? maxSpeed : 1);
  const speedRatio = Number.isFinite(speed) ? Math.max(0, speed) / maxSpd : 0;

  let intensity = 0;
  let targetOpacity = 0;
  if (boosting) {
    targetOpacity = 0.55;
    intensity = 1;
  } else if (speedRatio > 0.38) {
    // Ramp in over the top 62% of the speed range, then hold — past maxSpeed the effect is already
    // at full strength and has nothing left to say.
    intensity = clamp01((speedRatio - 0.38) / 0.62);
    targetOpacity = intensity * 0.30;
  }

  // Motion-reduce: keep the information but halve the intensity/density. These stay two separate
  // factors applied after the fact (not one folded scale) so reduced motion lands on exactly the
  // 0.45/0.55 split it has always used.
  if (motionReduce) {
    targetOpacity *= 0.45;
    intensity *= 0.55;
  }
  intensity = clamp01(intensity);
  targetOpacity = clampTo(targetOpacity, SL_OPACITY_MAX);

  // Speed scales with how fast the world is moving past the ship. We express it in screen-pixels/s
  // so the overlay looks consistent regardless of camera zoom. Base speed is a moderate drift;
  // boost pushes it toward "fast fly-by". Capped: raw `speed` is unbounded, so this term ran away
  // even once intensity was bounded.
  const baseFlow = 220 + (Number.isFinite(speed) ? Math.max(0, speed) : 0) * 1.2;
  const flowSpeed = clampTo(baseFlow * (0.55 + 0.75 * intensity) * (boosting ? 1.55 : 1.0), SL_FLOW_MAX);

  // FR-3: streak LENGTH tracks raw speed continuously so throttle is readable — decoupled from the
  // opacity gate, and deliberately not routed through the motion-reduce scale. Length is geometry
  // (contrast/parallax), not luminance, so nothing brightens. The tailLen min() below already
  // clamps the drawn result; this bounds the underlying value so it cannot grow without limit.
  const lenScale = clampTo((0.18 + 1.1 * speedRatio) * (boosting ? 1.15 : 1.0), SL_LEN_SCALE_MAX);

  const count = Math.min(SL_STREAK_MAX, Math.round((boosting ? 46 : 28) * (0.50 + 0.50 * intensity)));

  // Closed-form envelope of the per-streak alpha composed in the draw loop: opacity × the brightest
  // roll, with every other factor (edge fade, centre bias, centre gate) bounded by 1.
  const maxAlpha = clampTo(targetOpacity * SL_BRIGHT_MAX, SL_ALPHA_MAX);

  return { speedRatio, intensity, targetOpacity, count, lenScale, flowSpeed, maxAlpha };
}

// How much a streak segment is allowed to draw, given its closest approach to screen centre.
// Returns 0 inside the clear radius and eases to 1 across the fade band. We measure the whole
// SEGMENT, not just its lead point: a streak whose head has just cleared the disc still has its
// tail lying across the ship, which is exactly the case that made the reticle unreadable.
export function speedLineCenterGate(uvLead, tailLen, p, clearR, fadeW) {
  const uLo = uvLead - tailLen;                                   // tail sits at the lower uv
  const nearU = uLo > 0 ? uLo : (uvLead < 0 ? -uvLead : 0);       // 0 when the segment straddles centre
  return clamp01((Math.hypot(p, nearU) - clearR) / fadeW);
}

export const feel = {
  name: 'feel',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.timeEffects = ctx.timeEffects || createTimeEffects(this.state);
    // live state
    this._hsTimer = 0;        // remaining hit-stop seconds (0 = no active dip)
    this._hsRampIn = 0;       // >0 = cinematic ease-in window (death); timeScale ramps 1 -> floor
    this._hsFreezeTimer = 0;  // kill-cam hard-freeze window (timeScale = 0)
    this._hsRequest = { scale: HS_DEPTH }; // reused: frame() performs no request allocation
    this._fovPunch = 0;       // current additive fov offset (deg)
    this._vig = 0;            // current vignette opacity (0..1)
    // (FOV base is derived live from settings.video.fov each frame — no cached field, so the FOV
    // slider and the punch never fight.)

    this._vigEl = null;
    this._injectStyle();
    this._mountVignette();
    this._subscribe();
  },

  _injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    // Pointer-events:none so the vignette never blocks clicks. Mix-blend:screen reads as a flash
    // over the dark space backdrop instead of muddying it.
    s.textContent = `
#sf-feel-vig { position:absolute; inset:0; z-index:1200; pointer-events:none; opacity:0;
  mix-blend-mode:screen; transition:none; }
.sf-feel-vig--hit   { background:radial-gradient(circle at 50% 55%, rgba(255,90,70,0) 45%, rgba(255,60,50,1) 100%); }
.sf-feel-vig--death { background:radial-gradient(circle at 50% 50%, rgba(255,30,50,0) 25%, rgba(255,20,40,1) 100%); }
#sf-speed-lines { position:absolute; inset:0; z-index:1201; pointer-events:none; opacity:0; }
    `;
    document.head.appendChild(s);
  },

  _mountVignette() {
    this._ensureVignette();
    this._mountSpeedLines();
  },

  _ensureVignette() {
    if (this._vigEl && this._vigEl.isConnected) return this._vigEl;
    // Mount under #hud (the always-present flight overlay) so it inherits the HUD layering and
    // is naturally hidden when the HUD is hidden (docked/modal). Falls back to body.
    const root = document.getElementById('hud') || document.body;
    const el = document.createElement('div');
    el.id = 'sf-feel-vig';
    el.className = 'sf-feel-vig';
    el.style.display = 'none';
    root.appendChild(el);
    this._vigEl = el;
    return el;
  },

  _mountSpeedLines() {
    if (this._slCanvas && this._slCanvas.isConnected) return;
    const root = document.getElementById('hud') || document.body;
    const cvs = document.createElement('canvas');
    cvs.id = 'sf-speed-lines';
    root.appendChild(cvs);
    this._slCanvas = cvs;
    this._slCtx = cvs.getContext('2d');
    this._slOpacity = 0;      // current smooth-damped opacity
    this._slW = 0;             // cached canvas width
    this._slH = 0;             // cached canvas height
    this._slGrain = 0;         // current smooth-damped band-3 field opacity
    this._grainU = 0;          // grain scroll phase, px along the flow axis
    this._grainPattern = null; // rebuilt against the new context — a pattern outlives its canvas
  },

  _updateSpeedLines(frameDt) {
    // Ensure canvas is mounted
    if (!this._slCanvas || !this._slCanvas.isConnected) {
      this._mountSpeedLines();
    }
    const cvs = this._slCanvas;
    const ctx = this._slCtx;
    if (!cvs || !ctx) return;

    // Resolve player entity
    const ents = this.state.entities;
    const pid = this.state.playerId;
    const player = ents && pid != null ? ents.get(pid) : null;

    let boosting = false;
    let dirX = 0, dirY = -1;    // default fall-back: drift downward like light rain
    let speed = 0, maxSpd = 1;

    if (player && player.vel) {
      const vel = player.vel;
      speed = Math.hypot(vel.x, vel.z);
      maxSpd = Math.max(1, player.maxSpeed || 1);
      boosting = !!(player.flags && player.flags.boosting);

      // Project world velocity onto the camera view plane analytically.
      // The chase camera is fixed in yaw, offset behind and above the player.
      // World +X maps to screen -X (left), world +Z maps to screen -Y (up) scaled by sin(tilt).
      // Canvas Y is inverted relative to screen Y, so we negate the vertical component.
      const camState = this.state.camera || {};
      const tiltDeg = camState.tilt || 60;
      const tiltScale = Math.sin(tiltDeg * Math.PI / 180);
      const sx = -vel.x;
      const sy = -(vel.z * tiltScale);
      const dlen = Math.hypot(sx, sy);
      if (dlen > 0.0001) {
        // dir points toward where the ship is going on the canvas;
        // streaks move opposite (particles slide past the ship).
        dirX = sx / dlen;
        dirY = sy / dlen;
      }
    }

    const mr = this.state.settings && this.state.settings.video && this.state.settings.video.motionReduce;
    const drive = speedLineDrive(speed, maxSpd, boosting, mr);

    // Region volumes (D7, second half). `player.pos` is GLOBAL (`global_v1`) — world.js spawns
    // entities through `_toGlobal`, and the render frame membrane converts to the rebased draw frame
    // only at draw time. Resolving the crossfade HERE, from the one position we know is global, is
    // what lets the background consume it without ever seeing a frame-local coordinate: the render
    // frame rebases every 8192 WU, and a region blend keyed on a rebasing frame would jump.
    let region = null;
    if (velocityLanguageFlag('regionVolumes') && player && player.pos) {
      region = resolveRegionCrossfade(player.pos);
    }

    // ONE PRODUCER. Published before every early return below, so a consumer never sees a stale
    // record just because the overlay happened to be silent this frame — "silent" is itself the
    // band-0 signal the background needs in order to stop streaming.
    publishVelocityLanguage(this.state, drive, region);

    // Smooth-damp toward target (rate 8 = responsive but not jarring). Re-clamped after the damp
    // because damp() returns NaN for a NaN dt, and a NaN opacity here would poison every gradient.
    this._slOpacity = clampTo(damp(this._slOpacity, drive.targetOpacity, 8, frameDt), SL_OPACITY_MAX);

    // Band 3's grain is a SEPARATE channel from the streaks and outlives them by design: the whole
    // point of the inversion is that particles vanish while the field remains. Gating the canvas on
    // streak opacity alone would therefore switch the field off at exactly the speed it takes over.
    const grain = clampTo(drive.grain || 0, 1);
    this._slGrain = clampTo(damp(this._slGrain || 0, grain, 4, frameDt), 1);

    if (this._slOpacity <= 0.01 && this._slGrain <= 0.002) {
      if (this._streaks) this._streaks.length = 0;   // reset so streaks re-seed on next burst
      if (cvs.style.opacity !== '0') cvs.style.opacity = '0';
      return;
    }

    // Sync canvas size to window (only on change to avoid clearing needlessly)
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (this._slW !== w || this._slH !== h) {
      cvs.width = w; cvs.height = h; this._slW = w; this._slH = h;
    }
    cvs.style.opacity = '1';
    ctx.clearRect(0, 0, w, h);

    // Directional lateral speed streaks.
    // Instead of a radial starburst (which reads as forward-into-screen warp), streaks stream
    // opposite to the ship's screen-space travel direction. This makes the top-down camera read
    // "the world is sliding past the ship" rather than "the ship is tunneling into the monitor".
    const flowX = -dirX;            // streaks move opposite to travel
    const flowY = -dirY;
    const perpX = -flowY;           // perpendicular axis in screen space
    const perpY = flowX;
    const cx = w * 0.5, cy = h * 0.5;
    const span = Math.max(w, h) * 0.55;

    if (!this._streaks) this._streaks = [];
    const want = drive.count;
    while (this._streaks.length < want) this._streaks.push(this._newStreak(false, span));
    if (this._streaks.length > want) this._streaks.length = want;

    const flowSpeed = drive.flowSpeed;
    const lenScale = drive.lenScale;
    // The band language supplies its own stroke weight (motes are THINNER than the legacy streaks,
    // not merely dimmer — thickness is half of why the old look read as lasers). The legacy branch
    // keeps its boost-only widening.
    const widthMul = Number.isFinite(drive.widthScale) ? drive.widthScale : (boosting ? 1.4 : 1.0);
    // 'lighter' is the additive composite that made per-streak alpha above 1 saturate to opaque
    // white. The band language composites NORMALLY in every band; only the legacy branch is additive.
    const composite = drive.composite === VL_COMPOSITE ? VL_COMPOSITE : 'lighter';
    const banded = composite === VL_COMPOSITE;
    // Centre-exclusion radii, hoisted out of the per-streak loop.
    const minDim = Math.min(w, h);
    const clearR = minDim * SL_CLEAR_R;
    const clearFade = minDim * SL_CLEAR_FADE;

    ctx.globalCompositeOperation = composite;
    ctx.lineCap = 'round';
    // Band 3 fades the streaks out entirely while the grain field remains, so once the overlay is
    // below the visibility floor the streak pass is skipped WHOLESALE rather than walking the array
    // to reject every stroke individually. Iterating a shared frozen empty array keeps the skip
    // allocation-free and, unlike an `if (...) for (...)` prefix, cannot be misread as guarding only
    // the first statement of a loop body this long.
    for (const s of this._slOpacity > 0.01 ? this._streaks : SL_NO_STREAKS) {
      // Advance the streak along the flow direction (opposite to ship travel).
      s.uv += flowSpeed * frameDt * s.v;

      // Recycle when the streak has crossed the screen far enough behind the ship.
      // We keep a generous margin so streaks can start well ahead of the player and finish well behind.
      if (s.uv > span * 1.35 || s.uv < -span * 1.35 ||
          s.p < -span * 1.35 || s.p > span * 1.35) {
        Object.assign(s, this._newStreak(true, span));
      }

      // Streak endpoints in screen space.
      // uv = signed distance along flow axis from screen center.
      // p  = signed distance along perpendicular axis from flow axis.
      const leadX = cx + s.uv * flowX + s.p * perpX;
      const leadY = cy + s.uv * flowY + s.p * perpY;
      const tailLen = Math.min(0.55 * h, s.len * lenScale * h);   // FR-3: cap so cruise never smears full-screen
      const tailX = leadX - tailLen * flowX;
      const tailY = leadY - tailLen * flowY;

      // Fade in near spawn, fade out near recycle, plus distance-from-center bias so the
      // effect is strongest where the ship is.
      const travelled = Math.abs(s.uv - s.spawnU);
      const edgeFade = Math.min(1, travelled / (span * 0.12)) *
                       Math.max(0, 1 - Math.max(0, (travelled - span * 0.75) / (span * 0.35)));
      const centerBias = 1.0 - Math.min(1, Math.hypot(s.p, s.uv) / (span * 1.1));
      // centerBias makes the effect strongest exactly where the ship is, which is also where the
      // player needs to read the reticle and the tracked destination. The gate wins over the bias:
      // inside the clear radius a streak contributes nothing at all.
      const centerClear = speedLineCenterGate(s.uv, tailLen, s.p, clearR, clearFade);
      const a = clampTo(this._slOpacity * s.b * edgeFade * (0.55 + 0.45 * centerBias) * centerClear, SL_ALPHA_MAX);
      if (a <= 0.012) continue;

      const grad = ctx.createLinearGradient(tailX, tailY, leadX, leadY);
      if (banded) {
        // Desaturated warm-white head with the faintest teal through the body (D7). No pure white
        // anywhere, and normal compositing, so two overlapping motes stay motes instead of summing
        // into a hot spot the way the additive branch does.
        const B = VL_COLOR.body, H = VL_COLOR.head;
        grad.addColorStop(0, `rgba(${B.r},${B.g},${B.b},0)`);
        grad.addColorStop(0.6, `rgba(${B.r},${B.g},${B.b},${(a * 0.5).toFixed(3)})`);
        grad.addColorStop(1, `rgba(${H.r},${H.g},${H.b},${a.toFixed(3)})`);
      } else {
        grad.addColorStop(0, 'rgba(160,205,255,0)');
        grad.addColorStop(0.55, `rgba(195,230,255,${(a * 0.45).toFixed(3)})`);
        grad.addColorStop(1, `rgba(232,248,255,${a.toFixed(3)})`);
      }
      ctx.strokeStyle = grad;
      ctx.lineWidth = s.w * widthMul;
      ctx.beginPath(); ctx.moveTo(tailX, tailY); ctx.lineTo(leadX, leadY); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';

    // ---- band 3: the field ----
    if (this._slGrain > 0.002) this._drawGrainField(ctx, w, h, flowX, flowY, frameDt);
  },

  // Barely-there full-screen directional grain — what remains at extreme velocity once individual
  // particles have become physically invisible (D7 band 3).
  //
  // THIS IS EXPLICITLY NOT A VIGNETTE. The user has rejected the visor/cockpit framing twice, and a
  // radial or peripheral falloff is that framing regardless of what it is called. The grain is
  // UNIFORM: one tiled pattern filling the whole viewport at a single opacity, with no radius, no
  // edge term and no centre bias anywhere in this function. It scrolls along the flow axis, so it
  // reads as the medium itself shearing past — a field, not a frame around the player's head.
  _drawGrainField(ctx, w, h, flowX, flowY, frameDt) {
    const pattern = this._ensureGrainPattern(ctx);
    if (!pattern) return;

    // Scroll offset integrated per frame rather than derived from position, so the field never jumps
    // when the speed band changes: the RATE changes, the phase stays continuous.
    const dt = Number.isFinite(frameDt) ? frameDt : 0;
    this._grainU = ((this._grainU || 0) + GRAIN_SCROLL_PX_S * dt) % GRAIN_TILE;

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = this._slGrain;
    // Translate the pattern along the flow axis. The tile wraps, so the modulo above keeps the
    // translation bounded no matter how long the burn lasts.
    ctx.translate(-flowX * this._grainU, -flowY * this._grainU);
    ctx.fillStyle = pattern;
    // Overfill by one tile in every direction to cover the translation.
    ctx.fillRect(-GRAIN_TILE, -GRAIN_TILE, w + GRAIN_TILE * 2, h + GRAIN_TILE * 2);
    ctx.restore();
  },

  // The grain tile, baked once. Anisotropic on purpose: short strokes rather than round dots, so the
  // field has a grain DIRECTION even before it is translated.
  _ensureGrainPattern(ctx) {
    if (this._grainPattern) return this._grainPattern;
    const tile = document.createElement('canvas');
    tile.width = GRAIN_TILE;
    tile.height = GRAIN_TILE;
    const tctx = tile.getContext && tile.getContext('2d');
    if (!tctx) return null;
    const C = VL_COLOR.grain;
    tctx.lineCap = 'butt';
    // Deterministic hash rather than Math.random: the grain must be identical on every boot, or a
    // screenshot comparison of the background sees noise that is not the thing it is measuring.
    let s = 0x9e3779b9 >>> 0;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    for (let i = 0; i < 220; i++) {
      const x = rnd() * GRAIN_TILE;
      const y = rnd() * GRAIN_TILE;
      const len = 2 + rnd() * 5;
      // Both lighter AND darker specks around the mean, so the field reads as grain rather than as
      // a uniform brightening — a flat lift would just be additive white saturation by another name.
      const dark = rnd() < 0.45;
      const a = 0.10 + rnd() * 0.28;
      tctx.strokeStyle = dark
        ? `rgba(12,14,18,${a.toFixed(3)})`
        : `rgba(${C.r},${C.g},${C.b},${a.toFixed(3)})`;
      tctx.lineWidth = 0.6 + rnd() * 0.9;
      tctx.beginPath();
      tctx.moveTo(x, y);
      tctx.lineTo(x + len, y);      // horizontal strokes; the caller rotates the FIELD, not the tile
      tctx.stroke();
    }
    this._grainPattern = ctx.createPattern(tile, 'repeat');
    return this._grainPattern;
  },

  // One lateral streak in screen-space coordinates.
  // uv  = signed distance along the flow axis from screen center.
  // p   = signed distance along the perpendicular axis from the flow axis.
  // len = streak length as a fraction of screen height.
  _newStreak(spawnCenter, span) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (spawnCenter) {
      // Spawn ahead of center (negative uv) with a random lateral offset, so the streak still
      // sweeps past the ship. uv = 0 is screen center; positive uv moves with the flow (behind the
      // ship). The spread runs across the whole approach stretch rather than the old narrow
      // 0.08..0.43 band: at high flow speed every streak recycles almost every frame, so a narrow
      // band put the entire field inside one stripe of screen — the "streaks cluster at the top"
      // artifact. The 1.05 outer bound is set by edgeFade, which extinguishes a streak once it has
      // travelled 1.10 * span; spawning further out would kill it before it ever reached the ship.
      const uv = -(0.08 + Math.random() * 0.97) * span;
      return {
        uv,
        // Same value, not a second independent draw. They used to diverge, so `travelled` started
        // at a random offset and a recycled streak popped straight in at full brightness instead of
        // fading up — the other half of the high-speed glare.
        spawnU: uv,
        p: (Math.random() - 0.5) * Math.max(w, h) * 0.95,
        v: 0.65 + Math.random() * 0.85,
        len: 0.10 + Math.random() * 0.18,
        b: 0.40 + Math.random() * 0.55,
        w: 0.7 + Math.random() * 1.5,
      };
    }
    // Distribute across the screen so the first frame isn't empty.
    // `spawnU` mirrors `uv` here for the same reason it does in the recycle branch above: `travelled`
    // is measured as |uv - spawnU|, so two independent draws start a brand-new streak mid-fade. With
    // both ends of the span in play the expected offset is ~0.53 * span, well past the 0.12 * span
    // fade-in ramp, so the streak popped in at full brightness (and a minority drew past the
    // 1.10 * span extinction point and were born invisible). The pool grows with speed
    // (`drive.count`), so this branch runs on every acceleration — not just the first frame.
    const uv = (Math.random() - 0.5) * span * 1.6;
    return {
      uv,
      spawnU: uv,
      p: (Math.random() - 0.5) * Math.max(w, h) * 1.1,
      v: 0.65 + Math.random() * 0.85,
      len: 0.10 + Math.random() * 0.18,
      b: 0.40 + Math.random() * 0.55,
      w: 0.7 + Math.random() * 1.5,
    };
  },

  _subscribe() {
    const bus = this.bus, state = this.state;

    const clearHitStop = () => this._resetHitStop();
    bus.on('sim:pause', clearHitStop);
    bus.on('game:new', clearHitStop);
    bus.on('save:restoring', clearHitStop);
    bus.on('save:loaded', clearHitStop);

    // Spec2/02 §3 exact feel rules: shield-break 40 ms hit-stop + 0.3 trauma if player involved;
    // armor/hull hits get NO hit-stop (only trauma for player-as-target); big damage gets a micro dip.
    bus.on('combat:damage', (p) => {
      if (!p) return;
      const isPlayer = p.isPlayer || (p.targetId === state.playerId);
      const playerInvolved = isPlayer || p.attackerId === state.playerId;
      const ctrl = this.state.render && this.state.render.cameraCtrl;

      if (p.brokeShield) {
        const fov = isPlayer ? FOV_PUNCH_HEAVY : FOV_PUNCH_HEAVY * 0.4;
        this._trigger(HS_SHIELD_BREAK, fov, isPlayer ? VIG_HEAVY : 0, isPlayer ? 'hit' : null);
        if (playerInvolved && ctrl && typeof ctrl.addTrauma === 'function') ctrl.addTrauma(0.3);
        return;
      }
      if (p.armorHit) {
        const fov = isPlayer ? FOV_PUNCH_HEAVY * 0.7 : FOV_PUNCH_HEAVY * 0.3;
        this._trigger(HS_ARMOR_HIT, fov, isPlayer ? VIG_HEAVY * 0.6 : 0, isPlayer ? 'hit' : null);
        return;
      }
      if (p.hullHit) {
        const fov = isPlayer ? FOV_PUNCH_HEAVY * 0.7 : FOV_PUNCH_HEAVY * 0.3;
        this._trigger(HS_HULL_HIT, fov, isPlayer ? VIG_HEAVY * 0.6 : 0, isPlayer ? 'hit' : null);
        if (isPlayer && ctrl && typeof ctrl.addTrauma === 'function') ctrl.addTrauma(0.08);
        return;
      }

      const big = (p.amount >= 25) || p.killing;
      if (!big) return;
      const dur = isPlayer ? HS_HEAVY * 1.3 : HS_HEAVY * 0.6;
      const fov = isPlayer ? FOV_PUNCH_HEAVY : FOV_PUNCH_HEAVY * 0.4;
      this._trigger(dur, fov, isPlayer ? VIG_HEAVY : 0, isPlayer ? 'hit' : null);
    });

    // Spec2/02 §3: small kill = 60 ms hit-stop + kill-cam kiss; capital kill = 0.5 trauma scaled
    // 1/d² (max 0.5 at ≤ 400 wu) + 800 ms hit-stop window. Player involvement required for the kiss.
    bus.on('entity:killed', (p) => {
      if (!p) return;
      const playerInvolved = (p.killerId === state.playerId) || (p.id === state.playerId);
      const ctrl = this.state.render && this.state.render.cameraCtrl;
      const isCapital = p.capital || /capital|flagship|cruiser|gunship/i.test(String(p.victimClass || p.type || '')) || (p.radius || 0) >= 55;
      if (!playerInvolved) {
        // Distant NPC kill: tiny punch only, never a hit-stop.
        this._trigger(0, FOV_PUNCH_KILL * 0.3, 0, null);
        return;
      }
      if (isCapital) {
        // Trauma falls off with distance² from the kill.
        const player = state.entities && state.entities.get(state.playerId);
        let trauma = 0.5;
        if (player && p.pos) {
          const d2 = (player.pos.x - p.pos.x) ** 2 + (player.pos.z - p.pos.z) ** 2;
          trauma = d2 <= 400 * 400 ? 0.5 : Math.min(0.5, 0.5 * ((400 * 400) / d2));
        }
        if (ctrl && typeof ctrl.addTrauma === 'function') ctrl.addTrauma(trauma);
        this._trigger(HS_CAPITAL_KILL, FOV_PUNCH_KILL, 0, null);
        return;
      }
      // Small kill: short hit-stop + camera kiss.
      this._trigger(HS_KILL, FOV_PUNCH_KILL, 0, null);
      this.bus.emit('camera:kill', {});
    });

    // Player death is the single biggest beat in the game — long dip, big FOV punch, red wash.
    bus.on('player:death', () => {
      this._trigger(HS_DEATH, FOV_PUNCH_DEATH, VIG_DEATH, 'death');
    });

    // Weapon recoil on the player's own shots. Firing currently produces VFX + audio but ZERO camera
    // response, so every shot feels like a laser pointer. We add a small weapon-class-scaled fov kick
    // (via the shared punch mechanism) + a tiny camera shake via the controller's addTrauma. No
    // hit-stop/vignette — those belong to impacts, not muzzle. Gated to the player's shots only so an
    // NPC furball doesn't jitter your view.
    bus.on('combat:fire', (p) => {
      if (!p || p.ownerId !== state.playerId) return;
      if (this.state.mode !== 'flight' || !this._modalClear()) return;
      const mr = this.state.settings && this.state.settings.video && this.state.settings.video.motionReduce;
      if (mr) return;
      const w = recoilWeight(p.weaponId);
      // fov punch scaled by weapon weight, clamped to [min, max]
      const fov = RECOIL_FOV_MIN + (RECOIL_FOV_MAX - RECOIL_FOV_MIN) * (w / 0.2);
      this._fovPunch = Math.min(this._fovPunch + fov, FOV_PUNCH_DEATH + 1);
      // small camera shake via the controller (trauma is squared internally → 0.04 reads as a nudge)
      const ctrl = this.state.render && this.state.render.cameraCtrl;
      if (ctrl && typeof ctrl.addTrauma === 'function') ctrl.addTrauma(w * 0.4);
    });

    // Jump / warp camera response. The warp particle VFX + audio already fire on charge→start→arrive,
    // but the camera is completely inert through the signature traversal moment — the single biggest
    // spectacle in the game reads as "particles, no camera". We add a 3-beat fov arc:
    //   chargeStart → small forward fov kick (anticipation, the spool winding up)
    //   start        → bigger fov kick (the warp-out punch)
    //   arrive       → snap-down fov dip then ease + a trauma kick (the drop-out-of-warp thud)
    // All gated on flight + no-modal + motion-reduce like the rest of the feel layer.
    const _warpGate = () => this.state.mode === 'flight' && this._modalClear()
      && !(this.state.settings && this.state.settings.video && this.state.settings.video.motionReduce);
    const _warpCtrl = () => this.state.render && this.state.render.cameraCtrl;
    bus.on('jump:chargeStart', () => {
      if (!_warpGate()) return;
      this._fovPunch = Math.min(this._fovPunch + 2.5, FOV_PUNCH_DEATH + 1);   // anticipation kick
    });
    bus.on('jump:start', () => {
      if (!_warpGate()) return;
      this._fovPunch = Math.min(this._fovPunch + 6.0, FOV_PUNCH_DEATH + 1);   // warp-out punch
      const ctrl = _warpCtrl();
      if (ctrl && typeof ctrl.addTrauma === 'function') ctrl.addTrauma(0.18);
    });
    bus.on('jump:arrive', (p) => {
      if (!_warpGate()) return;
      // arrival: a brief fov DIP (negative punch) then it eases back — reads as decelerating out of warp.
      // We model the dip as a negative fov offset clamped so the composite never goes below ~0.5° floor.
      this._fovPunch = Math.max(-3.0, this._fovPunch - 3.0);
      const ctrl = _warpCtrl();
      if (ctrl && typeof ctrl.addTrauma === 'function') ctrl.addTrauma(p && p.interdicted ? 0.28 : 0.15);
    });

    // Mining-yield haptic. Mining has rich VFX (beam, spark fan, yield burst) but no camera/UI pulse,
    // so popping ore feels soft. A tiny fov kick + micro-trauma on the player's yields (scaled by qty)
    // gives the economy loop a heartbeat. Kept very light — mining yields repeatedly, so a heavy kick
    // here would be nauseating. The floating "+qty" number already gets the GF-2 spawn-pop.
    bus.on('mining:yield', (p) => {
      if (!p || p.minerId !== state.playerId) return;
      if (!_warpGate()) return;
      const qty = Math.max(1, p.qty || 1);
      // scale gently with qty: 1 unit -> ~0.6, big strike (8+) -> capped ~1.4
      const fov = Math.min(1.4, 0.4 + Math.log2(qty) * 0.35);
      this._fovPunch = Math.min(this._fovPunch + fov, FOV_PUNCH_DEATH + 1);
      const ctrl = _warpCtrl();
      if (ctrl && typeof ctrl.addTrauma === 'function') ctrl.addTrauma(Math.min(0.08, 0.03 + qty * 0.005));
    });

    // Boost ignition punch. The engine trail VFX already flares, but the camera is inert, so the
    // moment of boost feels soft. A small FOV kick + trauma sells the afterburners lighting up.
    // Gated the same way as other feel effects: flight, no modal, motion-reduce suppresses.
    bus.on('ship:boostStart', (p) => {
      if (!p || p.shipId !== state.playerId) return;
      if (this.state.mode !== 'flight' || !this._modalClear()) return;
      const mr = this.state.settings && this.state.settings.video && this.state.settings.video.motionReduce;
      if (mr) return;
      this._fovPunch = Math.min(this._fovPunch + BOOST_FOV_PUNCH, FOV_PUNCH_DEATH + 1);
      const ctrl = this.state.render && this.state.render.cameraCtrl;
      if (ctrl && typeof ctrl.addTrauma === 'function') ctrl.addTrauma(BOOST_TRAUMA);
    });

    // Tether snap: 0.25 trauma (spec2/02 §3).
    bus.on('tether:broken', (p) => {
      if (!p) return;
      if (this.state.mode !== 'flight' || !this._modalClear()) return;
      const mr = this.state.settings && this.state.settings.video && this.state.settings.video.motionReduce;
      if (mr) return;
      const ctrl = this.state.render && this.state.render.cameraCtrl;
      if (ctrl && typeof ctrl.addTrauma === 'function') ctrl.addTrauma(0.25);
    });

    // Impulse charge detonate: trauma 0.2 at epicenter, 1/d² falloff (spec2/02 §3).
    bus.on('charge:detonated', (p) => {
      if (!p || !p.pos) return;
      if (this.state.mode !== 'flight' || !this._modalClear()) return;
      const mr = this.state.settings && this.state.settings.video && this.state.settings.video.motionReduce;
      if (mr) return;
      const player = state.entities && state.entities.get(state.playerId);
      let trauma = 0.2;
      if (player) {
        const d2 = (player.pos.x - p.pos.x) ** 2 + (player.pos.z - p.pos.z) ** 2;
        trauma = d2 <= 1 ? 0.2 : Math.min(0.2, 0.2 / d2);
      }
      const ctrl = this.state.render && this.state.render.cameraCtrl;
      if (ctrl && typeof ctrl.addTrauma === 'function') ctrl.addTrauma(trauma);
    });
  },

  // Arm a punch. `vigCls` selects which vignette gradient ('hit'|'death'|null).
  _trigger(hsDur, fovAdd, vigPeak, vigCls) {
    // Cooperative gate: never punch during a deliberate freeze or outside flight. If a modal just
    // opened, the sim is already frozen — adding hit-stop on top would just delay its release.
    if (this.state.mode !== 'flight') return;
    if (!this._modalClear()) return;
    const mr = this.state.settings && this.state.settings.video && this.state.settings.video.motionReduce;
    // Motion-reduce keeps the information (it's still a big hit) but drops the vestibular effects.
    if (mr) return;

    // Hit-stop: take the longer of the current remaining dip and the new one (don't truncate a
    // death punch with a late small hit). Floor the timeScale for the dip duration.
    if (hsDur > this._hsTimer) {
      this._hsTimer = hsDur;
      this._hsFreezeTimer = 0;
      // Death gets a cinematic RAMP-IN (timeScale eases 1 -> floor over ~0.25s) instead of the
      // snappy snap-to-floor normal hits use. Reads as slow-motion rather than a stutter. Only set
      // when this is the death beat (vigCls === 'death').
      this._hsRampIn = (vigCls === 'death') ? HS_RAMP_TIME : 0;
      this._hsRequest.scale = this._hsRampIn > 0 ? 1 : HS_DEPTH;
      this.timeEffects.set('feel:hit-stop', this._hsRequest);
    }
    // FOV punch: add on top of any in-flight punch (they decay together), then clamp.
    this._fovPunch = Math.min(this._fovPunch + fovAdd, FOV_PUNCH_DEATH + 1);

    // Vignette: swap gradient class and raise opacity toward the peak.
    const vigEl = this._ensureVignette();
    if (vigEl && vigPeak > 0) {
      vigEl.className = 'sf-feel-vig' + (vigCls ? (' sf-feel-vig--' + vigCls) : '');
      vigEl.style.display = 'block';
      this._vig = Math.max(this._vig, vigPeak);
    }
  },

  // Kill-cam "kiss": camera push-zoom only. The actual hit-stop is now a short 60 ms dip in the
  // entity:killed handler; this helper exists for callers that want to trigger the kiss explicitly.
  _triggerKillCam() {
    if (this.state.mode !== 'flight') return;
    if (!this._modalClear()) return;
    if (this.state.settings && this.state.settings.video && this.state.settings.video.motionReduce) return;
    this.bus.emit('camera:kill', {});
  },

  // True when no modal screen is open (screenManager maintains state.ui.screenStack).
  // We treat "any open screen" as "do not steal the freeze" — pause/save/mainMenu all open one.
  _modalClear() {
    const ui = this.state.ui || {};
    const stack = ui.screenStack || ui.screens;
    return !ui.docked && (!stack || stack.length === 0);
  },

  _resetHitStop() {
    this._hsTimer = 0;
    this._hsRampIn = 0;
    this._hsFreezeTimer = 0;
    this.timeEffects.clear('feel:hit-stop');
  },

  frame(frameDt, state) {
    // We keep using the ctx-cached state reference; the registry passes the live state too.
    void state;

    // ---- hit-stop timer updates only its time-effects request ----
    if (this._hsTimer > 0) {
      this._hsTimer -= frameDt;
      if (this._hsFreezeTimer > 0) this._hsFreezeTimer -= frameDt;
      if (this._hsTimer <= 0) {
        this._resetHitStop();
      } else if (this.state.mode === 'flight' && this._modalClear()) {
        if (this._hsFreezeTimer > 0) {
          // Kill-cam hard freeze: the world stops completely.
          this._hsRequest.scale = 0;
        } else if (this._hsRampIn > 0) {
          // Cinematic death ease-in: ramp timeScale 1 -> HS_DEPTH over the ramp window. The ramp
          // progresses monotonically from 0 -> 1. Once complete, the floor holds until expiry.
          this._hsRampIn = Math.max(0, this._hsRampIn - frameDt);
          const progress = 1 - (this._hsRampIn / HS_RAMP_TIME);
          const eased = progress * progress;
          this._hsRequest.scale = 1 - (1 - HS_DEPTH) * eased;
        } else {
          // Normal hit: snap to the floor (reads as "weight", not "lag").
          this._hsRequest.scale = HS_DEPTH;
        }
        this.timeEffects.set('feel:hit-stop', this._hsRequest);
      }
    }

    // ---- FOV punch integration ----
    // Sign-symmetric exponential decay toward 0: a punch can be positive (kick out — impacts,
    // recoil, warp-out) or negative (dip in — warp arrival deceleration). The decay rate is the same
    // either way; we snap to 0 once within epsilon so the camera settles exactly on the settings FOV.
    // damp() rather than Euler (`x += -x * rate * dt`): frame() receives the loop's frameDt
    // unclamped, and loop.js only caps it at 0.25 s, so a hitch made the Euler step factor
    // FOV_DECAY * dt = 1.625 — past 1, which flips the sign. A kick-out became a dip-in after any
    // stall. damp() is exp(-rate*dt) and cannot overshoot at any dt.
    if (Math.abs(this._fovPunch) > 0.001) {
      this._fovPunch = damp(this._fovPunch, 0, FOV_DECAY, frameDt);
      if (Math.abs(this._fovPunch) < 0.001) this._fovPunch = 0;
    }
    const cam = this.state.render && this.state.render.camera;
    if (cam && cam.isPerspectiveCamera) {
      // Derive the base from settings every frame (NOT a one-time cache) so the FOV slider and the
      // punch cooperate: the slider sets settings.video.fov (renderer live-applies it), and we add
      // the transient punch on top. When no punch is active we simply mirror the setting, so the
      // slider is always authoritative and never fights the punch.
      const baseFov = (this.state.settings && this.state.settings.video && this.state.settings.video.fov) || cam.fov || 50;
      const target = baseFov + this._fovPunch;
      if (Math.abs(cam.fov - target) > 0.001) {
        cam.fov = target;
        cam.updateProjectionMatrix();
      }
    }

    // ---- vignette integration ----
    const vigEl = this._vig > 0.001 ? this._ensureVignette() : this._vigEl;
    if (this._vig > 0.001 && vigEl) {
      this._vig += -this._vig * VIG_DECAY * frameDt;
      if (this._vig < 0.001) { this._vig = 0; vigEl.style.opacity = '0'; vigEl.style.display = 'none'; }
      else vigEl.style.opacity = String(this._vig);
    }

    // ---- speed-lines overlay ----
    this._updateSpeedLines(frameDt);
  },
};
