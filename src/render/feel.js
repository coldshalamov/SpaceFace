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

const STYLE_ID = 'sf-feel-style';

// Tunables — kept conservative for a space game (not a brawler). Hit-stop is short so it reads as
// "weight," not "lag." FOV punch is a few degrees. Vignette is brief.
const HS_HEAVY = 0.055;   // s — timeScale dip duration for a heavy hit (big damage / shield break)
const HS_KILL  = 0.090;   // s — dip duration for a kill
const HS_DEATH = 0.160;   // s — dip duration for the player dying (the biggest beat)
const HS_DEPTH = 0.12;    // timeScale floor during a dip (0.12 = near-frozen but not fully, so the
                          // camera/particles still creep — feels heavier than a hard freeze)
const FOV_PUNCH_HEAVY = 2.2;   // deg additive on heavy hit
const FOV_PUNCH_KILL  = 4.0;   // deg additive on kill
const FOV_PUNCH_DEATH = 7.0;   // deg additive on player death
const FOV_DECAY = 6.5;         // exponential decay rate (higher = snappier return)

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
        // Only restore to normal if we're still in flight with no modal. If a modal opened during
        // the dip, leave timeScale alone — the modal owns it now.
        if (this.state.mode === 'flight' && this._modalClear()) {
          this.state.timeScale = 1;
        }
      } else if (this.state.mode === 'flight' && this._modalClear()) {
        // Ease toward the floor at the start of the dip, then it'll snap back when the timer ends.
        // A simple lerp reads as a fast-in/slow-out freeze without per-frame oscillation.
        this.state.timeScale = this._hsReturn = HS_DEPTH;
      }
    }

    // ---- FOV punch integration ----
    if (this._fovPunch > 0.001) {
      // exponential decay toward 0
      this._fovPunch += -this._fovPunch * FOV_DECAY * frameDt;
      if (this._fovPunch < 0.001) this._fovPunch = 0;
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
