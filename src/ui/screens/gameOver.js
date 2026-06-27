// Game Over screen (Ironman permadeath). Honors the New Game UI's "permadeath" promise: when the
// player dies on Ironman difficulty, combat.kill() emits game:over instead of respawning. This
// screen subscribes, opens over the wreck, and shows a run summary with New Game / Main Menu.
// The save slot is preserved (Ironman is single-slot; the player may still import a prior export),
// but the run is over — no respawn, no continue from the dead state.

const STYLE_ID = 'sf-gameover-style';

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
  .sf-gameover { display:flex; flex-direction:column; gap:18px; padding:34px 40px;
    min-width:380px; max-width:min(92vw,620px); pointer-events:auto; }
  .sf-gameover h1 { margin:0; font-family:var(--mono); letter-spacing:.34em; font-size:26px;
    color:#ff5a5a; text-shadow:0 0 24px rgba(255,60,60,.5); text-transform:uppercase; text-align:center; }
  .sf-gameover .sf-go-sub { text-align:center; color:var(--ink-dim); font-size:13px;
    letter-spacing:.08em; margin-top:-10px; }
  .sf-gameover h2 { margin:6px 0 2px; font-size:11px; letter-spacing:.16em; text-transform:uppercase;
    color:var(--ink-dim); }
  .sf-gameover .sf-go-grid { display:grid; grid-template-columns:auto 1fr; gap:7px 22px;
    align-items:center; font-size:14px; padding:10px 0; }
  .sf-gameover .sf-go-grid .k { color:var(--ink-dim); font-family:var(--mono); letter-spacing:.05em; font-size:12px; }
  .sf-gameover .sf-go-grid .v { color:var(--ink); font-family:var(--mono); text-align:right; }
  .sf-gameover .sf-go-foot { display:flex; gap:10px; justify-content:center; margin-top:10px; }
  .sf-gameover button.sf-btn { padding:12px 22px; font-size:14px; letter-spacing:.08em; min-width:150px; }
  .sf-gameover .sf-go-newgame { border-color:var(--accent); color:var(--accent); }
  `;
  document.head.appendChild(s);
}

function fmtTime(s) {
  s = Math.max(0, Math.floor(s || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return h + 'h ' + m + 'm';
  if (m > 0) return m + 'm ' + sec + 's';
  return sec + 's';
}

function fmtCr(c) { return (Math.max(0, Math.round(c || 0))).toLocaleString() + ' cr'; }

function getManager(ctx) {
  if (ctx && ctx.screenManager) return ctx.screenManager;
  if (ctx && ctx.screens && ctx.screens.pushScreen) return ctx.screens;
  const ui = ctx && ctx.registry && ctx.registry.get && ctx.registry.get('ui');
  if (ui && ui.screenManager) return ui.screenManager;
  return null;
}

export const gameOverScreen = {
  id: 'gameOver',
  _summaryEls: null,

  mount(rootEl, ctx) {
    injectStyle();
    rootEl.innerHTML = '';
    rootEl.classList.add('panel', 'sf-gameover');

    const h = document.createElement('h1');
    h.textContent = 'Run Over';
    rootEl.appendChild(h);

    const sub = document.createElement('div');
    sub.className = 'sf-go-sub';
    sub.textContent = 'Your ship was lost. In Ironman, death is final.';
    rootEl.appendChild(sub);

    const grid = document.createElement('div');
    grid.className = 'sf-go-grid';
    this._summaryEls = Object.create(null);
    const rows = [
      ['time', 'Time flown'],
      ['credits', 'Final credits'],
      ['profit', 'Lifetime profit'],
      ['kills', 'Kills'],
      ['missions', 'Missions completed'],
      ['beats', 'Story beats reached'],
    ];
    for (const [key, label] of rows) {
      const kd = document.createElement('div'); kd.className = 'k'; kd.textContent = label; grid.appendChild(kd);
      const vd = document.createElement('div'); vd.className = 'v'; vd.textContent = '0'; grid.appendChild(vd);
      this._summaryEls[key] = vd;
    }
    rootEl.appendChild(grid);

    const foot = document.createElement('div');
    foot.className = 'sf-go-foot';

    const bNew = document.createElement('button');
    bNew.className = 'sf-btn sf-go-newgame';
    bNew.textContent = 'New Game';
    bNew.addEventListener('click', () => {
      const mgr = getManager(ctx);
      // A fresh new game clears the dead run; main.js's game:new handler resets all run state.
      ctx.bus.emit('game:over:dismissed', {});
      ctx.bus.emit('game:new', { name: null, difficulty: 'ironman' });
      if (mgr && mgr.popScreen) { try { mgr.popScreen(); } catch (e) {} }
    });
    foot.appendChild(bNew);

    const bMenu = document.createElement('button');
    bMenu.className = 'sf-btn';
    bMenu.textContent = 'Main Menu';
    bMenu.addEventListener('click', () => {
      state.mode = 'menu';
      ctx.bus.emit('game:over:dismissed', {});
      ctx.bus.emit('sim:pause', {});
      const mgr = getManager(ctx);
      if (mgr) {
        if (mgr.closeAll) mgr.closeAll();
        if (mgr.replaceScreen) mgr.replaceScreen('mainMenu');
        else if (mgr.pushScreen) mgr.pushScreen('mainMenu');
      }
    });
    foot.appendChild(bMenu);

    rootEl.appendChild(foot);
    this._refreshSummary(ctx);
  },

  onShow(ctx) {
    this._refreshSummary(ctx);
    // Freeze the sim under the game-over screen (the run is over; nothing should advance).
    if (ctx.state) ctx.state.timeScale = 0;
    ctx.bus.emit('sim:pause', {});
  },

  onHide() {},
  refresh(ctx) { this._refreshSummary(ctx); },

  _refreshSummary(ctx) {
    const els = this._summaryEls;
    if (!els) return;
    const state = ctx && ctx.state || {};
    const player = state.player || {};
    const stats = player.stats || {};
    const missions = state.missions || {};
    const meta = state.meta || {};
    const values = {
      time: fmtTime(meta.playtimeS),
      credits: fmtCr(player.credits),
      profit: fmtCr(stats.lifetimeProfit),
      kills: String(stats.kills || 0),
      missions: String(stats.missionsDone || 0),
      beats: String((missions.completedLog || []).length),
    };
    for (const key in values) {
      if (els[key] && els[key].textContent !== values[key]) els[key].textContent = values[key];
    }
  },
};
