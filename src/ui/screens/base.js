// Base screen (V2 §6 / M3). The base-management view for a claimed body — shows the body's module
// slots, lets the player build modules (depot/refinery/teleporter/defense), and fire the
// teleporter. Reuses the screen-modal pattern (like station hub). Entry: pushed when the player
// presses C near an already-claimed body (input.js sets state.ui.pendingClaimBodyId first).
import { BODY_MODULES, BODY_MODULE_BY_ID, BODY_SLOTS_BY_SIZE } from '../../data/claimableBodies.js';
import { escapeHtml } from '../comms.js';

const STYLE_ID = 'sf-base-style';

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
#sf-base { display:flex; flex-direction:column; gap:14px; padding:24px; min-width:min(92vw,720px);
  max-height:90vh; overflow-y:auto; pointer-events:auto; }
#sf-base .base-title { font-family:var(--mono); letter-spacing:.22em; font-size:17px;
  color:var(--accent); text-shadow:0 0 14px rgba(57,208,255,.35); text-transform:uppercase; }
#sf-base .base-sub { color:var(--ink-mute); font-size:12px; }
#sf-base .base-slots { display:flex; gap:10px; flex-wrap:wrap; }
#sf-base .base-slot { flex:1; min-width:120px; border:1px solid var(--panel-edge); border-radius:8px;
  padding:12px; background:var(--panel); position:relative; }
#sf-base .base-slot.empty { border-style:dashed; opacity:.6; display:flex; align-items:center;
  justify-content:center; color:var(--ink-mute); font-size:12px; min-height:80px; }
#sf-base .base-slot .nm { font-weight:600; color:var(--ink); font-size:13px; margin-bottom:4px; }
#sf-base .base-slot .eff { color:var(--accent); font-size:11px; font-family:var(--mono); }
#sf-base .base-shop { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
#sf-base .base-mod { border:1px solid var(--panel-edge); border-radius:8px; padding:12px; background:var(--panel); }
#sf-base .base-mod .nm { font-weight:600; color:var(--ink); font-size:13px; }
#sf-base .base-mod .desc { color:var(--ink-mute); font-size:11px; margin:4px 0 8px; min-height:28px; }
#sf-base .base-mod .meta { display:flex; justify-content:space-between; align-items:center; font-size:11px;
  color:var(--ink-dim); font-family:var(--mono); }
#sf-base .base-foot { display:flex; gap:10px; justify-content:flex-end; }
#sf-base button.sf-btn { width:auto; padding:8px 18px; }
#sf-base button.sf-btn--primary { background:var(--accent); color:#04121a; }
#sf-base .base-warn { color:var(--danger); font-size:11px; }
  `;
  document.head.appendChild(s);
}

function pretty(id) { return (id || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()); }

export const baseScreen = {
  id: 'base',
  _rootEl: null,
  _ctx: null,
  _bodyId: null,

  // Build the shell ONCE and cache refs. Screens are mounted once by screenManager (build()), so the
  // per-open render — which depends on the just-set state.ui.pendingClaimBodyId — must live in
  // onShow()/_render(), NOT here. Doing it in mount() would freeze the screen on the FIRST body
  // opened and show its stale data on every subsequent open (the bug this file is fixing).
  mount(rootEl, ctx) {
    injectStyle();
    this._rootEl = rootEl;
    this._ctx = ctx;
  },

  // Full render of the currently-selected body (this._bodyId) against LIVE claims state. Safe to call
  // repeatedly: it rebuilds rootEl each time. Called on every open (onShow) and after a build.
  _render() {
    const rootEl = this._rootEl;
    const ctx = this._ctx;
    if (!rootEl || !ctx) return;
    const state = ctx.state;
    const claims = ctx.registry && ctx.registry.get('claims');
    const body = this._bodyId && claims ? claims.list().find((b) => b.id === this._bodyId) : null;

    rootEl.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.id = 'sf-base';

    if (!body) {
      wrap.innerHTML = '<div class="base-title">No body selected</div><div class="base-sub">Press C near a claimed body to manage it.</div>';
      const foot = document.createElement('div');
      foot.className = 'base-foot';
      const close = document.createElement('button');
      close.className = 'sf-btn';
      close.textContent = 'Close';
      close.addEventListener('click', () => { if (ctx.screenManager) ctx.screenManager.popScreen(); });
      foot.appendChild(close);
      wrap.appendChild(foot);
      rootEl.appendChild(wrap);
      return;
    }

    const title = document.createElement('div');
    title.className = 'base-title';
    title.textContent = '◆ ' + body.name.toUpperCase() + ' ◆';
    wrap.appendChild(title);

    const sub = document.createElement('div');
    sub.className = 'base-sub';
    const usedSlots = body.modules.length;
    sub.textContent = body.size + '-class body · ' + usedSlots + '/' + body.slots + ' module slots · sector ' + (body.sectorId || '?');
    wrap.appendChild(sub);

    // ---- installed modules (slot grid) ----
    const slotsWrap = document.createElement('div');
    slotsWrap.className = 'base-slots';
    for (let i = 0; i < body.slots; i++) {
      const slot = document.createElement('div');
      const modId = body.modules[i];
      if (modId) {
        const mod = BODY_MODULE_BY_ID.get(modId);
        slot.className = 'base-slot';
        slot.innerHTML = '<div class="nm">' + escapeHtml(mod ? mod.name : pretty(modId)) + '</div>' +
          '<div class="eff">' + (mod ? '◆ ' + escapeHtml(mod.effect.toUpperCase()) : '') + '</div>';
      } else {
        slot.className = 'base-slot empty';
        slot.textContent = '— empty slot —';
      }
      slotsWrap.appendChild(slot);
    }
    wrap.appendChild(slotsWrap);

    // teleport button if a teleporter is built
    if (body.modules.includes('mod_teleporter')) {
      const tp = document.createElement('button');
      tp.className = 'sf-btn sf-btn--primary';
      tp.style.width = 'auto';
      tp.style.alignSelf = 'flex-start';
      tp.textContent = '⚡ Teleport to ' + (claims._stationName ? claims._stationName(body.linkedStationId) : 'linked station');
      tp.addEventListener('click', () => {
        claims.teleportFrom(body.id);
        if (ctx.screenManager) ctx.screenManager.popScreen();
      });
      wrap.appendChild(tp);
    }

    // ---- build shop ----
    const shopHead = document.createElement('div');
    shopHead.style.cssText = 'font-family:var(--mono);letter-spacing:.1em;font-size:12px;color:var(--ink-dim);text-transform:uppercase;margin-top:6px;';
    shopHead.textContent = 'Build module';
    wrap.appendChild(shopHead);

    const shop = document.createElement('div');
    shop.className = 'base-shop';
    const player = state.player;
    for (const mod of BODY_MODULES) {
      const card = document.createElement('div');
      card.className = 'base-mod';
      const built = body.modules.includes(mod.id);
      const techOk = !mod.techReq || player.researchedNodes.includes(mod.techReq);
      const afford = player.credits >= mod.cost;
      const slotFree = usedSlots < body.slots;
      const canBuild = !built && techOk && afford && slotFree;
      card.innerHTML =
        '<div class="nm">' + escapeHtml(mod.name) + (built ? ' <span style="color:var(--good)">✓ built</span>' : '') + '</div>' +
        '<div class="desc">' + escapeHtml(mod.desc || '') + '</div>' +
        '<div class="meta"><span>' + mod.cost.toLocaleString() + ' cr' + (mod.techReq ? ' · ' + escapeHtml(mod.techReq) : '') + '</span></div>';
      if (!built) {
        const btn = document.createElement('button');
        btn.className = 'sf-btn sf-btn--primary';
        btn.style.cssText = 'width:100%;margin-top:8px;padding:6px;';
        btn.textContent = !techOk ? 'Locked' : !afford ? 'Too expensive' : !slotFree ? 'No free slot' : 'Build';
        btn.disabled = !canBuild;
        btn.addEventListener('click', () => {
          if (claims.buildModule(body.id, mod.id)) this._render();
        });
        card.appendChild(btn);
      }
      shop.appendChild(card);
    }
    wrap.appendChild(shop);

    // close
    const foot = document.createElement('div');
    foot.className = 'base-foot';
    const close = document.createElement('button');
    close.className = 'sf-btn';
    close.textContent = 'Close';
    close.addEventListener('click', () => { if (ctx.screenManager) ctx.screenManager.popScreen(); });
    foot.appendChild(close);
    wrap.appendChild(foot);

    rootEl.appendChild(wrap);
  },

  // Read the requested body FRESH on each open — input.js (the 'C' keybind) sets
  // state.ui.pendingClaimBodyId right before pushScreen('base'), so a different body each time
  // re-renders correctly. Clear the handoff flag once consumed; if re-shown with no new pending id
  // (e.g. popped back to from a screen pushed on top), keep the last body rather than blanking out.
  onShow(ctx) {
    if (ctx) this._ctx = ctx;
    const state = this._ctx && this._ctx.state;
    const pending = (state && state.ui && state.ui.pendingClaimBodyId) || null;
    if (pending) {
      this._bodyId = pending;
      state.ui.pendingClaimBodyId = null;
    }
    this._render();
  },

  onHide() {},

  // IMPORTANT: must be a no-op (mirrors settings.js / drill.js). uiRoot.frame() calls
  // screenManager.refreshTop() ~3x/sec for any open screen; since _render() does a full
  // rootEl.innerHTML rebuild, running it here would flicker the panel and could drop a click on a
  // Build button. The screen needs no periodic refresh: base pauses the sim (timeScale 0) so nothing
  // mutates underneath it, and the only change (build) re-renders directly from its own handler.
  refresh() {},
};
