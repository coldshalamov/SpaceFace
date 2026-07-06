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

export const feel = {
  name: 'feel',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    // live state
    this._hsTimer = 0;        // remaining hit-stop seconds (0 = no active dip)
    this._hsReturn = 1;       // timeScale we ease back toward when the dip ends
    this._hsRampIn = 0;       // >0 = cinematic ease-in window (death); timeScale ramps 1 -> floor
    this._hsFreezeTimer = 0;  // kill-cam hard-freeze window (timeScale = 0)
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
    let intensity = 0;          // 0..1 drive for streak density/length/speed
    let dirX = 0, dirY = -1;    // default fall-back: drift downward like light rain
    let speed = 0, maxSpd = 1;

    if (player && player.vel) {
      const vel = player.vel;
      speed = Math.hypot(vel.x, vel.z);
      maxSpd = Math.max(1, player.maxSpeed || 1);
      const speedRatio = speed / maxSpd;
      boosting = !!(player.flags && player.flags.boosting);

      if (boosting) {
        targetOpacity = 0.55;
        intensity = 1;
      } else if (speedRatio > 0.38) {
        // Ramp in over the top 62% of the speed range.
        intensity = (speedRatio - 0.38) / 0.62;
        targetOpacity = intensity * 0.30;
      }

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

    // Motion-reduce: keep the information but halve the intensity/density.
    const mr = this.state.settings && this.state.settings.video && this.state.settings.video.motionReduce;
    if (mr) {
      targetOpacity *= 0.45;
      intensity *= 0.55;
    }

    // Smooth-damp toward target (rate 8 = responsive but not jarring)
    this._slOpacity = damp(this._slOpacity, targetOpacity, 8, frameDt);

    if (this._slOpacity <= 0.01) {
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
    const want = Math.round((boosting ? 46 : 28) * (0.50 + 0.50 * intensity));
    while (this._streaks.length < want) this._streaks.push(this._newStreak(false, span));
    if (this._streaks.length > want) this._streaks.length = want;

    // Speed scales with how fast the world is moving past the ship. We express it in screen-pixels/s
    // so the overlay looks consistent regardless of camera zoom. Base speed is a moderate drift;
    // boost pushes it toward "fast fly-by".
    const baseFlow = 220 + speed * 1.2;                 // screen-pixels/s, tuned by eye
    const flowSpeed = baseFlow * (0.55 + 0.75 * intensity) * (boosting ? 1.55 : 1.0);
    // FR-3: streak LENGTH tracks raw speed continuously so throttle is readable — decoupled from
    // the opacity gate. Length is geometry (contrast/parallax), not luminance, so nothing brightens.
    const speedRatio = speed / maxSpd;
    const lenScale = (0.18 + 1.1 * speedRatio) * (boosting ? 1.15 : 1.0);
    const widthMul = boosting ? 1.4 : 1.0;

    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const s of this._streaks) {
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
      const a = this._slOpacity * s.b * edgeFade * (0.55 + 0.45 * centerBias);
      if (a <= 0.012) continue;

      const grad = ctx.createLinearGradient(tailX, tailY, leadX, leadY);
      grad.addColorStop(0, 'rgba(160,205,255,0)');
      grad.addColorStop(0.55, `rgba(195,230,255,${(a * 0.45).toFixed(3)})`);
      grad.addColorStop(1, `rgba(232,248,255,${a.toFixed(3)})`);
      ctx.strokeStyle = grad;
      ctx.lineWidth = s.w * widthMul;
      ctx.beginPath(); ctx.moveTo(tailX, tailY); ctx.lineTo(leadX, leadY); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  },

  // One lateral streak in screen-space coordinates.
  // uv  = signed distance along the flow axis from screen center.
  // p   = signed distance along the perpendicular axis from the flow axis.
  // len = streak length as a fraction of screen height.
  _newStreak(spawnCenter, span) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (spawnCenter) {
      // Spawn just ahead of center (negative uv) with a random lateral offset.
      // uv = 0 is screen center; positive uv moves with the flow (behind the ship).
      return {
        uv: -(0.08 + Math.random() * 0.35) * span,
        spawnU: -(0.08 + Math.random() * 0.35) * span,
        p: (Math.random() - 0.5) * Math.max(w, h) * 0.95,
        v: 0.65 + Math.random() * 0.85,
        len: 0.10 + Math.random() * 0.18,
        b: 0.40 + Math.random() * 0.55,
        w: 0.7 + Math.random() * 1.5,
      };
    }
    // Distribute across the screen so the first frame isn't empty.
    return {
      uv: (Math.random() - 0.5) * span * 1.6,
      spawnU: (Math.random() - 0.5) * span * 1.6,
      p: (Math.random() - 0.5) * Math.max(w, h) * 1.1,
      v: 0.65 + Math.random() * 0.85,
      len: 0.10 + Math.random() * 0.18,
      b: 0.40 + Math.random() * 0.55,
      w: 0.7 + Math.random() * 1.5,
    };
  },

  _subscribe() {
    const bus = this.bus, state = this.state;

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

  frame(frameDt, state) {
    // We keep using the ctx-cached state reference; the registry passes the live state too.
    void state;

    // ---- hit-stop timer drives state.timeScale ----
    if (this._hsTimer > 0) {
      this._hsTimer -= frameDt;
      if (this._hsFreezeTimer > 0) this._hsFreezeTimer -= frameDt;
      if (this._hsTimer <= 0) {
        this._hsTimer = 0;
        this._hsRampIn = 0;
        this._hsFreezeTimer = 0;
        // Only restore to normal if we're still in flight with no modal. If a modal opened during
        // the dip, leave timeScale alone — the modal owns it now.
        if (this.state.mode === 'flight' && this._modalClear()) {
          this.state.timeScale = 1;
        }
      } else if (this.state.mode === 'flight' && this._modalClear()) {
        if (this._hsFreezeTimer > 0) {
          // Kill-cam hard freeze: the world stops completely.
          this.state.timeScale = this._hsReturn = 0;
        } else if (this._hsRampIn > 0) {
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
