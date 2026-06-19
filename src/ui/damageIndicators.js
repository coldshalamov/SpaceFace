// Directional damage indicators (V2 plan §12 UX clarity). Red arcs at the screen edge that flash
// toward wherever the player was hit from, then fade. Solves the "where am I being shot from?"
// sore thumb — the most important situational-awareness readout a space shooter can have.
//
// Mirrors the objective arrow's edge-clamp math (hud.js:356-367) but for damage sources. Built as
// a factory like floatingText so the HUD owns one instance and ticks it in its frame loop. All
// DOM is self-built and self-styled; pointer-events:none so it never intercepts clicks.
//
// Contract: { el, tick(dt, helpers), onDamage(p) }. HUD wires ctx.bus 'combat:damage' -> onDamage
// for player hits, and calls tick(dt, helpers) once per frame with the worldToScreen helper.

const STYLE_ID = 'sf-dmgind-style';
const MAX_ARCS = 4;      // pool size: a quadruply-bracketed player is already in trouble; more is noise
const TTL = 1.1;         // seconds an arc stays visible after the last hit from that direction
const FADE_IN = 0.06;    // seconds to ramp opacity up (fast, so it reads as a flash not a fade)

export function createDamageIndicators() {
  // Inject style once.
  if (!document.getElementById(STYLE_ID)) {
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
.sf-dmgind-root { position:absolute; inset:0; z-index:1100; pointer-events:none; overflow:hidden; }
.sf-dmgind-arc {
  position:absolute; left:0; top:0; width:0; height:0;
  pointer-events:none; opacity:0; transform-origin:center;
  will-change:transform,opacity;
  transition: none;
}
.sf-dmgind-arc__blade {
  position:absolute; left:0; top:0; transform:translate(-50%,-50%);
  width:230px; height:96px; pointer-events:none;
  /* a sweeping red arc, brighter at the leading (inner) edge, fading outward */
  background:
    radial-gradient(ellipse 120px 50px at 0% 50%,
      rgba(255,60,70,.92) 0%,
      rgba(255,70,80,.55) 45%,
      rgba(255,40,60,.10) 75%,
      rgba(255,40,60,0) 100%);
  filter: blur(.4px) drop-shadow(0 0 10px rgba(255,40,60,.5));
  mix-blend-mode: screen;
}
.sf-dmgind-arc.crit .sf-dmgind-arc__blade {
  background:
    radial-gradient(ellipse 140px 58px at 0% 50%,
      rgba(255,40,50,1) 0%,
      rgba(255,30,40,.75) 45%,
      rgba(255,20,30,.18) 75%,
      rgba(255,20,30,0) 100%);
  filter: blur(.4px) drop-shadow(0 0 16px rgba(255,20,40,.8));
}
    `;
    document.head.appendChild(s);
  }

  const root = document.createElement('div');
  root.className = 'sf-dmgind-root';

  // Pool of arc elements. Reused in LRU order; the oldest is recycled when the pool is exhausted.
  const arcs = [];
  for (let i = 0; i < MAX_ARCS; i++) {
    const a = document.createElement('div');
    a.className = 'sf-dmgind-arc';
    const blade = document.createElement('div');
    blade.className = 'sf-dmgind-arc__blade';
    a.appendChild(blade);
    a.style.display = 'none';
    root.appendChild(a);
    arcs.push({ el: a, t: 0, age: Infinity, angle: 0, crit: false });
  }

  function worldAngleToSource(playerPos, hitPos) {
    // Angle in screen space: world +x is right, world +z is "down" on a top-down-ish cam, but the
    // camera looks down -z forward with +x right, so a source at +dx,+dz from the player projects
    // to a screen direction of (dx, -dz) before any camera roll. We resolve the *final* on-screen
    // direction with worldToScreen in tick(); here we only need a coarse grouping angle to bucket
    // nearby hits onto the same arc. Group by 12 o'clock sectors (every 30°).
    const dx = hitPos.x - playerPos.x;
    const dz = hitPos.z - playerPos.z;
    return Math.atan2(-dz, dx); // screen-y grows downward, so invert dz
  }

  function onDamage(p) {
    if (!p) return;
    // Player hits only — NPC-vs-NPC damage would spam indicators pointlessly.
    const isPlayer = p.isPlayer || (p.targetId != null && p.targetId === this._playerId);
    if (!isPlayer) return;
    const player = this._player();
    if (!player) return;
    const hitPos = p.pos || p.hitPoint || (p.sourcePos) || null;
    if (!hitPos) return;
    const ang = worldAngleToSource(player.pos, hitPos);
    const crit = !!(p.brokeShield || (p.amount >= 25)); // big hits / shield breaks read as critical

    // Find an existing arc close to this angle (within ~28°) to refresh, else take the oldest.
    const SECTOR = 0.49; // ~28° in radians
    let slot = null;
    let oldest = arcs[0], oldestAge = -1;
    for (const a of arcs) {
      if (a.age < Infinity) {
        let da = Math.abs(a.angle - ang);
        if (da > Math.PI) da = Math.PI * 2 - da;
        if (da < SECTOR) { slot = a; break; }
      }
      if (a.age > oldestAge) { oldestAge = a.age; oldest = a; }
    }
    if (!slot) slot = oldest;
    slot.angle = ang;
    slot.crit = slot.crit || crit;
    slot.age = 0; // reset lifetime; brightness re-ramps via FADE_IN
    slot.t = 0;
  }

  // Per-frame: position each active arc via worldToScreen and advance its lifetime.
  // `helpers` is the HUD ctx.helpers (has worldToScreen). We synthesize a world point just off the
  // player in the hit direction, project it, and clamp to the screen edge exactly like the
  // objective arrow. This way the indicator respects the current camera roll automatically.
  function tick(dt, helpers) {
    const player = this._player();
    const w2s = helpers && helpers.worldToScreen;
    if (!player || !w2s) {
      for (const a of arcs) if (a.age < Infinity) { a.el.style.display = 'none'; a.age = Infinity; }
      return;
    }
    const w = window.innerWidth, h = window.innerHeight;
    const mx = w * 0.40, my = h * 0.40; // edge inset (slightly inside the arrow's 0.42 so they layer)

    for (const a of arcs) {
      if (a.age >= Infinity) continue;
      a.age += dt;
      a.t += dt;
      if (a.age >= TTL) { a.el.style.display = 'none'; a.age = Infinity; continue; }

      // Synthesize a world point 600u away from the player along the hit direction and project it.
      // Using worldToScreen means the arc tracks the player's rotation/roll for free.
      const dist = 600;
      const wx = player.pos.x + Math.cos(a.angle) * dist;
      const wz = player.pos.z - Math.sin(a.angle) * dist; // invert back from screen-angle
      const proj = w2s({ x: wx, y: 0, z: wz });
      let dx, dy;
      if (proj.onScreen) {
        dx = proj.x - w / 2; dy = proj.y - h / 2;
      } else {
        // worldToScreen returns mirrored coords for behind-camera points; normalize direction.
        dx = proj.x - w / 2; dy = proj.y - h / 2;
      }
      const len = Math.hypot(dx, dy) || 1;
      dx /= len; dy /= len;
      const ex = w / 2 + dx * mx, ey = h / 2 + dy * my;
      const screenAngle = Math.atan2(dy, dx);

      // Opacity: quick fade-in (FADE_IN), then decay over TTL.
      const fadeIn = Math.min(1, a.t / FADE_IN);
      const decay = Math.max(0, 1 - (a.age / TTL));
      const op = fadeIn * decay;
      a.el.className = 'sf-dmgind-arc' + (a.crit ? ' crit' : '');
      a.el.style.display = 'block';
      a.el.style.opacity = String(op);
      // rotate the arc so its blade points outward from center toward the hit source
      a.el.style.transform = `translate3d(${ex}px,${ey}px,0) translate(-50%,-50%) rotate(${screenAngle}rad)`;
    }
  }

  return {
    el: root,
    onDamage,
    tick,
    // injected by HUD at mount so we can read the live player entity + id without holding ctx
    _player: null,
    _playerId: null,
    bind(getPlayer, playerId) { this._player = getPlayer; this._playerId = playerId; return this; },
  };
}
