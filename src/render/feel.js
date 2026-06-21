// Game-feel "punch" system (V2 plan §9). The single highest-leverage feel layer for an action
// space game: micro hit-stop (brief timeScale dip) on heavy hits, plus a synchronized FOV punch
// and a red damage vignette. None of this adds gameplay — it makes every impact *land*.
//
// DESIGN (cooperates with the rest of the engine, never fights it):
//   - Hit-stop is implemented as a render-phase driver that pulses `state.timeScale` DOWN from 1
//     for a few tens of ms, then eases it back. The sim loop (loop.js) already gates stepping on
//     timeScale, so a dip to ~0.1 freezes the world ~briefly = the "weight" of a hit.
//   - We MUST NOT clobber a deliberate freeze: pause.js, saveSystem.js, and mainMenu.js all set
//     timeScale=0 on purpose. So we only ever drive timeScale when state.mode === 'flight' AND no
//     modal screen is open. We snapshot the pre-hit timeScale and only restore *to 1*, and only if
//     nothing else has since frozen it. A modal opening mid-hit-stop simply wins (we bail).
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
import { WEAPONS } from '../data/weapons.js';

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

// Tunables — kept conservative for a space game (not a brawler). Hit-stop is short so it reads as
// "weight," not "lag." FOV punch is a few degrees. Vignette is brief.
const HS_HEAVY = 0.055;   // s — timeScale dip duration for a heavy hit (big damage / shield break)
const HS_KILL  = 0.090;   // s — dip duration for a kill
const HS_DEATH = 0.160;   // s — dip duration for the player dying (the biggest beat)
const HS_RAMP_TIME = 0.25; // s — cinematic ease-IN for the death dip (1 -> floor over this window)
const HS_DEPTH = 0.12;    // timeScale floor during a dip (0.12 = near-frozen but not fully, so the
                          // camera/particles still creep — feels heavier than a hard freeze)
const FOV_PUNCH_HEAVY = 2.2;   // deg additive on heavy hit
const FOV_PUNCH_KILL  = 4.0;   // deg additive on kill
const FOV_PUNCH_DEATH = 7.0;   // deg additive on player death
const FOV_DECAY = 6.5;         // exponential decay rate (higher = snappier return)
// Weapon-recoil fov kick (per player shot). Smaller than a heavy-hit punch since it fires often; a
// quick 0.5-1.5° kick that decays fast reads as "kickback" without going seasick on auto fire.
const RECOIL_FOV_MAX = 1.5;    // deg additive per shot (scaled down by recoilWeight)
const RECOIL_FOV_MIN = 0.4;    // floor so even the lightest weapon nudges the fov a touch

const VIG_HEAVY = 0.18;   // peak vignette opacity for a heavy hit on the player
const VIG_DEATH = 0.55;   // peak vignette opacity for player death
const VIG_DECAY = 4.0;    // vignette fade rate

export const feel = {
  name: 'feel',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    // live state
    this._hsTimer = 0;        // remaining hit-stop seconds (0 = no active dip)
    this._hsReturn = 1;       // timeScale we ease back toward when the dip ends
    this._hsRampIn = 0;       // >0 = cinematic ease-in window (death); timeScale ramps 1 -> floor
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

    let targetOpacity = 0;
    let boosting = false;

    if (player && player.vel) {
      const vel = player.vel;
      const maxSpd = Math.max(1, player.maxSpeed || 1);
      const speedRatio = Math.hypot(vel.x, vel.z) / maxSpd;
      boosting = !!(player.flags && player.flags.boosting);

      if (boosting) {
        targetOpacity = 0.5;
      } else if (speedRatio > 0.4) {
        // Ramp from 0 at 0.4 to ~0.3 at 1.0
        targetOpacity = ((speedRatio - 0.4) / 0.6) * 0.3;
      }
    }

    // Smooth-damp toward target (rate 8 = responsive but not jarring)
    this._slOpacity = damp(this._slOpacity, targetOpacity, 8, frameDt);

    if (this._slOpacity <= 0.01) {
      // Hide canvas and skip drawing
      if (cvs.style.opacity !== '0') {
        cvs.style.opacity = '0';
      }
      return;
    }

    // Sync canvas size to window (only on change to avoid clearing needlessly)
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (this._slW !== w || this._slH !== h) {
      cvs.width = w;
      cvs.height = h;
      this._slW = w;
      this._slH = h;
    }

    // Show canvas
    cvs.style.opacity = '1';

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Draw radial speed lines from center outward
    const cx = w * 0.5;
    const cy = h * 0.5;
    const maxR = Math.hypot(cx, cy);    // distance from center to corner
    const startR = maxR * 0.4;          // lines begin ~40% out from center
    const lineCount = boosting ? 48 : 32;
    const lineWidth = boosting ? 2 : 1.2;
    const alpha = this._slOpacity;

    ctx.strokeStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();

    // Use a seeded-ish set of angles so lines don't flicker randomly every frame.
    // Slight per-line variation in start radius and length gives organic feel.
    const angleStep = (Math.PI * 2) / lineCount;
    for (let i = 0; i < lineCount; i++) {
      // Small fixed offset per line (deterministic from index) for variation
      const jitter = ((i * 7 + 3) % 13) / 13;           // 0..1 pseudo-random per line
      const angle = angleStep * i + (jitter - 0.5) * angleStep * 0.35;
      const rStart = startR + jitter * maxR * 0.08;      // slight start variation
      const rEnd = maxR * (0.92 + jitter * 0.08);        // slight end variation

      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      ctx.moveTo(cx + cosA * rStart, cy + sinA * rStart);
      ctx.lineTo(cx + cosA * rEnd, cy + sinA * rEnd);
    }
    ctx.stroke();
  },

  _subscribe() {
    const bus = this.bus, state = this.state;

    // Heavy hit = big damage OR a shield break, on any entity. We weight player involvement higher
    // (taking a big hit yourself should punch harder than watching two NPCs trade blows).
    bus.on('combat:damage', (p) => {
      if (!p) return;
      const big = (p.amount >= 25) || p.brokeShield || p.killing;
      if (!big) return;
      const isPlayer = p.isPlayer || (p.targetId === state.playerId);
      const dur = isPlayer ? HS_HEAVY * 1.3 : HS_HEAVY * 0.6;
      const fov = isPlayer ? FOV_PUNCH_HEAVY : FOV_PUNCH_HEAVY * 0.4;
      this._trigger(dur, fov, isPlayer ? VIG_HEAVY : 0, isPlayer ? 'hit' : null);
    });

    // A kill is a bigger beat — but only punch hard if the player is involved (killer or victim),
    // otherwise a distant NPC dogfight would stutter the camera constantly.
    bus.on('entity:killed', (p) => {
      if (!p) return;
      const playerInvolved = (p.killerId === state.playerId) || (p.id === state.playerId);
      const dur = playerInvolved ? HS_KILL : HS_KILL * 0.35;
      const fov = playerInvolved ? FOV_PUNCH_KILL : FOV_PUNCH_KILL * 0.3;
      this._trigger(dur, fov, 0, null);
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
      // scale gently with qty: 1 unit → ~0.6°, big strike (8+) → capped ~1.4°
      const fov = Math.min(1.4, 0.4 + Math.log2(qty) * 0.35);
      this._fovPunch = Math.min(this._fovPunch + fov, FOV_PUNCH_DEATH + 1);
      const ctrl = _warpCtrl();
      if (ctrl && typeof ctrl.addTrauma === 'function') ctrl.addTrauma(Math.min(0.08, 0.03 + qty * 0.005));
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
      // Death gets a cinematic RAMP-IN (timeScale eases 1 -> floor over ~0.25s) instead of the
      // snappy snap-to-floor normal hits use. Reads as slow-motion rather than a stutter. Only set
      // when this is the death beat (vigCls === 'death').
      this._hsRampIn = (vigCls === 'death') ? HS_RAMP_TIME : 0;
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

  // True when no modal screen is open (screenManager maintains state.ui.screenStack).
  // We treat "any open screen" as "do not steal the freeze" — pause/save/mainMenu all open one.
  _modalClear() {
    const ui = this.state.ui || {};
    const stack = ui.screenStack || ui.screens;
    return !ui.docked && (!stack || stack.length === 0);
  },

  frame(frameDt, state) {
    // We keep using the ctx-cached state reference; the registry passes the live state too.
    void state;

    // ---- hit-stop timer drives state.timeScale ----
    if (this._hsTimer > 0) {
      this._hsTimer -= frameDt;
      if (this._hsTimer <= 0) {
        this._hsTimer = 0;
        this._hsRampIn = 0;
        // Only restore to normal if we're still in flight with no modal. If a modal opened during
        // the dip, leave timeScale alone — the modal owns it now.
        if (this.state.mode === 'flight' && this._modalClear()) {
          this.state.timeScale = 1;
        }
      } else if (this.state.mode === 'flight' && this._modalClear()) {
        if (this._hsRampIn > 0) {
          // Cinematic death ease-in: ramp timeScale 1 -> HS_DEPTH over the ramp window. The ramp
          // amount is how far into the window we are (0 = just died, 1 = ramp done). Eased so the
          // slowdown accelerates — reads as the world bleeding off speed rather than a hard cut.
          this._hsRampIn -= frameDt;
          const r = Math.max(0, this._hsRampIn) / HS_RAMP_TIME;   // 1 -> 0
          const eased = 1 - (1 - r) * (1 - r);                     // ease-in quad (slow start, fast finish)
          this.state.timeScale = this._hsReturn = 1 - (1 - HS_DEPTH) * eased;
          if (this._hsRampIn <= 0) this._hsRampIn = 0;
        } else {
          // Normal hit: snap to the floor (reads as "weight", not "lag").
          this.state.timeScale = this._hsReturn = HS_DEPTH;
        }
      }
    }

    // ---- FOV punch integration ----
    // Sign-symmetric exponential decay toward 0: a punch can be positive (kick out — impacts,
    // recoil, warp-out) or negative (dip in — warp arrival deceleration). The decay rate is the same
    // either way; we snap to 0 once within epsilon so the camera settles exactly on the settings FOV.
    if (Math.abs(this._fovPunch) > 0.001) {
      this._fovPunch += -this._fovPunch * FOV_DECAY * frameDt;
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
