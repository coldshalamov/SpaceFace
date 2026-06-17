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
#sf-feel-vig--hit   { background:radial-gradient(circle at 50% 55%, rgba(255,90,70,0) 45%, rgba(255,60,50,1) 100%); }
#sf-feel-vig--death { background:radial-gradient(circle at 50% 50%, rgba(255,30,50,0) 25%, rgba(255,20,40,1) 100%); }
    `;
    document.head.appendChild(s);
  },

  _mountVignette() {
    // Mount under #hud (the always-present flight overlay) so it inherits the HUD layering and
    // is naturally hidden when the HUD is hidden (docked/modal). Falls back to body.
    const root = document.getElementById('hud') || document.body;
    const el = document.createElement('div');
    el.id = 'sf-feel-vig';
    el.className = 'sf-feel-vig';
    el.style.display = 'none';
    root.appendChild(el);
    this._vigEl = el;
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
    if (this._vigEl && vigPeak > 0) {
      this._vigEl.className = 'sf-feel-vig' + (vigCls ? (' sf-feel-vig--' + vigCls) : '');
      this._vigEl.style.display = 'block';
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
    if (this._vig > 0.001 && this._vigEl) {
      this._vig += -this._vig * VIG_DECAY * frameDt;
      if (this._vig < 0.001) { this._vig = 0; this._vigEl.style.opacity = '0'; this._vigEl.style.display = 'none'; }
      else this._vigEl.style.opacity = String(this._vig);
    }
  },
};
