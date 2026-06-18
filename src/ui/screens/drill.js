// Drill lens screen (V2 §7 / cut-list #27). The 2D ant-farm mining view. Renders the vein cross-
// section to a canvas, handles L/R (move) + up/down (drill) input locally (the sim is paused while
// this screen is open, so we own input here), and shows yield + a hazard tell legend. Exits back to
// flight via ESC / the Exit button, which calls drill.end().
//
// Entry: pushed onto the screen stack when the player docks-with / drills a rich asteroid. For this
// vertical slice we expose a 'drill' screen that the game can push with the asteroid id passed via
// state.ui.pendingDrillAsteroidId (set before pushScreen). The screen reads it on mount.
import { DRILL_CONST } from '../../systems/drill.js';

const { COLS, ROWS, TILE } = DRILL_CONST;

// Ore -> render colour (mirrors the ore palette loosely; distinct enough to read at a glance).
const ORE_COLOR = {
  cmdty_ore_iron: '#c8a878',
  cmdty_ore_copper: '#d8703a',
  cmdty_ore_silicon: '#b8b8d0',
  cmdty_ore_titanium: '#d0d8e8',
  cmdty_ore_platinoid: '#e8d850',
  cmdty_ore_ice: '#9ad8ff',
};
const TILE_COLOR = {
  empty: 'rgba(8,10,16,0)',     // transparent (the "see through the ground" ant-farm feel)
  dirt: '#3a2e22',
  rock: '#2a2a32',
  vein: '#5a4a2a',              // base; ore colour overlays the yield dots
  gas: '#3a2e22',               // disguised as dirt UNTIL revealed — the tell is a faint tint added in render
};
const GAS_TELL_TINT = 'rgba(180,60,200,0.28)'; // the discoloration that warns an alert player

const STYLE_ID = 'sf-drill-style';

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
.drill-screen { display:flex; flex-direction:column; align-items:center; gap:12px; padding:20px;
  min-width:min(94vw, 860px); max-height:92vh; pointer-events:auto; }
.drill-title { font-family:var(--mono); letter-spacing:.24em; font-size:18px; color:var(--accent);
  text-shadow:0 0 16px rgba(57,208,255,.4); text-transform:uppercase; }
.drill-canvas-wrap { position:relative; border:1px solid var(--panel-edge); border-radius:8px;
  background:linear-gradient(180deg,#0a0d14 0%,#050709 100%); overflow:hidden; box-shadow:0 0 40px rgba(0,0,0,.6) inset; }
.drill-canvas { display:block; image-rendering:pixelated; }
.drill-hud { display:flex; gap:18px; font-family:var(--mono); font-size:12px; color:var(--ink-dim);
  letter-spacing:.06em; align-items:center; flex-wrap:wrap; justify-content:center; }
.drill-hud .v { color:var(--accent); }
.drill-hud .warn { color:#ff8a4a; }
.drill-legend { display:flex; gap:14px; font-size:11px; color:var(--ink-mute); flex-wrap:wrap; justify-content:center; }
.drill-legend span { display:inline-flex; align-items:center; gap:5px; }
.drill-legend i { width:12px; height:12px; border-radius:2px; display:inline-block; }
.drill-foot { display:flex; gap:10px; justify-content:center; margin-top:4px; }
.drill-foot button.sf-btn { width:auto; padding:9px 22px; }
.drill-toast { position:absolute; left:50%; top:18px; transform:translateX(-50%);
  font-family:var(--mono); font-size:13px; padding:6px 14px; border-radius:5px;
  background:rgba(20,28,40,.92); border:1px solid var(--accent); color:var(--accent);
  opacity:0; transition:opacity .25s; pointer-events:none; white-space:nowrap; }
.drill-toast.show { opacity:1; }
.drill-toast.bad { border-color:#ff5470; color:#ff8a9a; }
  `;
  document.head.appendChild(s);
}

function flashToast(el, text, bad) {
  el.textContent = text;
  el.classList.toggle('bad', !!bad);
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 1400);
}

export const drillScreen = {
  id: 'drill',

  mount(rootEl, ctx) {
    injectStyle();
    rootEl.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'drill-screen';

    const title = document.createElement('div');
    title.className = 'drill-title';
    title.textContent = '◆ DEEP-DRILL ◆';
    wrap.appendChild(title);

    // canvas
    const canvasWrap = document.createElement('div');
    canvasWrap.className = 'drill-canvas-wrap';
    const canvas = document.createElement('canvas');
    canvas.className = 'drill-canvas';
    canvas.width = COLS * TILE;
    canvas.height = ROWS * TILE;
    canvasWrap.appendChild(canvas);
    const toast = document.createElement('div');
    toast.className = 'drill-toast';
    canvasWrap.appendChild(toast);
    wrap.appendChild(canvasWrap);

    // HUD row (yield + gas-hits)
    const hud = document.createElement('div');
    hud.className = 'drill-hud';
    hud.innerHTML =
      '<span>YIELD: <span class="v" data-yield>0</span></span>' +
      '<span>GAS HITS: <span class="warn" data-gas>0</span></span>' +
      '<span>CARGO: <span class="v" data-cargo>0</span></span>';
    wrap.appendChild(hud);

    // legend
    const legend = document.createElement('div');
    legend.className = 'drill-legend';
    legend.innerHTML =
      '<span><i style="background:#3a2e22"></i>dirt</span>' +
      '<span><i style="background:#2a2a32"></i>rock</span>' +
      '<span><i style="background:#5a4a2a"></i>vein</span>' +
      '<span><i style="background:' + GAS_TELL_TINT + '"></i>gas tell</span>' +
      '<span style="color:var(--ink-mute)">←→ move · ↑↓ drill · ESC exit</span>';
    wrap.appendChild(legend);

    // exit button
    const foot = document.createElement('div');
    foot.className = 'drill-foot';
    const exitBtn = document.createElement('button');
    exitBtn.className = 'sf-btn';
    exitBtn.textContent = 'Eject (ESC)';
    foot.appendChild(exitBtn);
    wrap.appendChild(foot);

    rootEl.appendChild(wrap);

    const state = ctx.state;
    const drillSys = ctx.drill || (ctx.registry && ctx.registry.get('drill'));

    // Resolve the asteroid to drill. Caller sets state.ui.pendingDrillAsteroidId before pushScreen;
    // if absent, bail gracefully (pop self) so a stray open can't soft-lock.
    const asteroidId = (state.ui && state.ui.pendingDrillAsteroidId) || null;
    if (state.ui) state.ui.pendingDrillAsteroidId = null;
    if (!asteroidId || !drillSys) {
      exitBtn.addEventListener('click', () => { if (ctx.screenManager) ctx.screenManager.popScreen(); });
      return;
    }
    drillSys.begin(asteroidId);

    // ---- input (local; sim is paused so we own keys) ----
    const held = { left: false, right: false, up: false, down: false };
    let moveCooldown = 0;
    const MOVE_INTERVAL = 0.10; // seconds between horizontal moves (prevents zipping)
    const onKeyDown = (ev) => {
      const c = ev.code;
      if (c === 'ArrowLeft' || c === 'KeyA') { held.left = true; ev.preventDefault(); }
      else if (c === 'ArrowRight' || c === 'KeyD') { held.right = true; ev.preventDefault(); }
      else if (c === 'ArrowUp' || c === 'KeyW') { held.up = true; ev.preventDefault(); }
      else if (c === 'ArrowDown' || c === 'KeyS') { held.down = true; ev.preventDefault(); }
      else if (c === 'Escape') { exit(); }
    };
    const onKeyUp = (ev) => {
      const c = ev.code;
      if (c === 'ArrowLeft' || c === 'KeyA') held.left = false;
      else if (c === 'ArrowRight' || c === 'KeyD') held.right = false;
      else if (c === 'ArrowUp' || c === 'KeyW') held.up = false;
      else if (c === 'ArrowDown' || c === 'KeyS') held.down = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    exitBtn.addEventListener('click', exit);

    function exit() {
      // summarize yield in a toast on the flight HUD after exit
      const d = state.drill;
      const yieldLog = d ? d.yieldLog : {};
      drillSys.end();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      if (ctx.screenManager) ctx.screenManager.popScreen();
      // emit a summary toast for the flight HUD
      const total = Object.values(yieldLog).reduce((a, b) => a + b, 0);
      if (total > 0 && ctx.bus) ctx.bus.emit('toast', { text: 'Drill complete: +' + total + ' ore extracted', kind: 'good', ttl: 4 });
    }

    // ---- render + tick loop (rAF; we own time since sim is paused) ----
    const ctx2d = canvas.getContext('2d');
    let last = performance.now();
    let rafId = 0;
    const gasHitFlash = { t: 0 };
    const yieldFlash = { t: 0, text: '' };

    ctx.bus.on('drill:yield', (p) => {
      yieldFlash.t = 0.9; yieldFlash.text = '+' + p.qty + ' ' + (p.commodityId || '').replace('cmdty_ore_', '');
    });
    ctx.bus.on('drill:gasHit', (p) => {
      gasHitFlash.t = 0.6;
      flashToast(toast, '⚠ GAS POCKET! Hull damaged', true);
    });

    function frame(now) {
      rafId = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;

      // advance drilling from held keys
      moveCooldown -= dt;
      if (held.left && moveCooldown <= 0) { drillSys.move(-1); moveCooldown = MOVE_INTERVAL; }
      if (held.right && moveCooldown <= 0) { drillSys.move(1); moveCooldown = MOVE_INTERVAL; }
      if (held.up) drillSys.drillVertical(-1, dt);
      if (held.down) drillSys.drillVertical(1, dt);

      // flash timers
      if (gasHitFlash.t > 0) gasHitFlash.t -= dt;
      if (yieldFlash.t > 0) yieldFlash.t -= dt;

      render();
      updateHud();
    }

    function render() {
      const d = state.drill;
      if (!d) return;
      ctx2d.clearRect(0, 0, canvas.width, canvas.height);

      // tiles
      for (let c = 0; c < COLS; c++) {
        for (let r = 0; r < ROWS; r++) {
          const t = d.field[c][r];
          const x = c * TILE, y = r * TILE;
          if (t.type === 'empty') continue; // transparent (ant-farm: see through cleared ground)
          // base fill
          ctx2d.fillStyle = TILE_COLOR[t.type] || TILE_COLOR.dirt;
          ctx2d.fillRect(x, y, TILE, TILE);
          // texture tick (cheap pseudo-random speckle from coords, no allocation)
          ctx2d.fillStyle = 'rgba(255,255,255,0.04)';
          ctx2d.fillRect(x + ((c * 7 + r * 3) % (TILE - 4)), y + ((c * 5 + r * 11) % (TILE - 4)), 2, 2);
          // ore vein: show yield dots in the ore colour
          if (t.type === 'vein' && t.ore) {
            const col = ORE_COLOR[t.ore] || '#e0c060';
            ctx2d.fillStyle = col;
            const dots = Math.min(4, (t.yieldU || 1));
            for (let k = 0; k < dots; k++) {
              const dx = x + 4 + ((c * 3 + k * 5 + r) % (TILE - 8));
              const dy = y + 4 + ((c * 2 + k * 7 + r * 3) % (TILE - 8));
              ctx2d.fillRect(dx, dy, 3, 3);
            }
          }
          // gas tell: if revealed (adjacent to a cleared tile), tint faintly so an alert player sees it
          if (t.type === 'gas' && drillSys.isHazardRevealed(c, r)) {
            ctx2d.fillStyle = GAS_TELL_TINT;
            ctx2d.fillRect(x, y, TILE, TILE);
          }
          // partially-drilled tile: show damage cracks (hp < maxHp)
          if (t.maxHp > 0 && t.hp < t.maxHp) {
            const frac = 1 - (t.hp / t.maxHp);
            ctx2d.strokeStyle = 'rgba(0,0,0,' + (0.25 + frac * 0.4) + ')';
            ctx2d.lineWidth = 1;
            ctx2d.beginPath();
            ctx2d.moveTo(x + 3, y + 3); ctx2d.lineTo(x + TILE - 3, y + TILE - 3);
            ctx2d.moveTo(x + TILE - 3, y + 3); ctx2d.lineTo(x + 3, y + TILE - 3);
            ctx2d.stroke();
          }
        }
      }

      // avatar (the drilling rover/ship)
      const ax = d.avatar.col * TILE, ay = d.avatar.row * TILE;
      ctx2d.fillStyle = '#39d0ff';
      ctx2d.fillRect(ax + 4, ay + 4, TILE - 8, TILE - 8);
      ctx2d.fillStyle = '#9af0ff';
      ctx2d.fillRect(ax + 7, ay + 6, TILE - 14, 3);

      // gas-hit red flash overlay
      if (gasHitFlash.t > 0) {
        ctx2d.fillStyle = 'rgba(255,40,70,' + (gasHitFlash.t * 0.5) + ')';
        ctx2d.fillRect(0, 0, canvas.width, canvas.height);
      }
      // yield popup
      if (yieldFlash.t > 0) {
        ctx2d.save();
        ctx2d.globalAlpha = Math.min(1, yieldFlash.t * 1.5);
        ctx2d.fillStyle = '#9af0ff';
        ctx2d.font = 'bold 16px ' + (getComputedStyle(document.body).getPropertyValue('--mono') || 'monospace');
        ctx2d.textAlign = 'center';
        ctx2d.fillText(yieldFlash.text, ax + TILE / 2, ay - 8 - (1 - yieldFlash.t) * 20);
        ctx2d.restore();
      }
    }

    function updateHud() {
      const d = state.drill;
      if (!d) return;
      const total = Object.values(d.yieldLog).reduce((a, b) => a + b, 0);
      hud.querySelector('[data-yield]').textContent = total;
      hud.querySelector('[data-gas]').textContent = d.gasHits;
      const cargo = state.player.cargo;
      const cargoUsed = cargo ? Math.round((cargo.usedVolume / cargo.capVolume) * 100) : 0;
      hud.querySelector('[data-cargo]').textContent = cargoUsed + '%';
    }

    rafId = requestAnimationFrame(frame);

    // stash cleanup so onHide can stop the loop + remove listeners
    this._cleanup = () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  },

  onShow() {},
  onHide() { if (this._cleanup) this._cleanup(); },
  refresh() {},
};
