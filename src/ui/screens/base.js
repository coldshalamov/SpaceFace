// Base screen (V2 §6 / M3). The base-management view for a claimed body — shows the body's module
// slots, lets the player build modules (depot/refinery/teleporter/defense), and fire the
// teleporter. Reuses the screen-modal pattern (like station hub). Entry: pushed from the claim/base
// binding near an already-claimed body (input.js sets state.ui.pendingClaimBodyId first).
import { BODY_MODULES, BODY_MODULE_BY_ID, BODY_SLOTS_BY_SIZE } from '../../data/claimableBodies.js';
import { TECH_NODES } from '../../data/tech.js';
import { escapeHtml } from '../comms.js';
import { BINDINGS } from '../bindings.js';

const STYLE_ID = 'sf-base-style';
const TECH_BY_ID = new Map(TECH_NODES.map((t) => [t.id, t]));
const BASE_PLAN_STEPS = [
  {
    moduleId: 'mod_depot',
    title: 'First useful build: Cargo Depot',
    body: 'Create a drone dropoff and overflow store so this claim starts feeding cargo loops instead of just existing on the map.',
  },
  {
    moduleId: 'mod_defense',
    title: 'Stabilize the claim: Defense Battery',
    body: 'Add a local deterrent before unattended routes and mining runs depend on this body staying safe.',
  },
  {
    moduleId: 'mod_refinery',
    title: 'Industry upgrade: On-Site Refinery',
    body: 'Convert raw ore into denser materials at the source, cutting station round-trips and improving trade value.',
  },
  {
    moduleId: 'mod_teleporter',
    title: 'Late route rewrite: Quantum Teleporter',
    body: 'Collapse the worst cargo leg to a station link once the base is already producing.',
  },
];

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
#sf-base .base-plan { border:1px solid rgba(57,208,255,.28); border-radius:8px; padding:10px 12px;
  background:rgba(57,208,255,.07); box-shadow:0 0 18px rgba(57,208,255,.06); }
#sf-base .base-plan-k { color:var(--accent); font-family:var(--mono); font-size:10px; letter-spacing:.14em;
  text-transform:uppercase; }
#sf-base .base-plan-title { margin-top:4px; color:var(--ink); font-size:13px; font-weight:700; }
#sf-base .base-plan-body { margin-top:4px; color:var(--ink-dim); font-size:12px; line-height:1.45; }
#sf-base .base-plan-cta { margin-top:7px; color:var(--good); font-family:var(--mono); font-size:11px;
  letter-spacing:.06em; text-transform:uppercase; }
#sf-base .base-plan--locked .base-plan-cta,
#sf-base .base-plan--funding .base-plan-cta,
#sf-base .base-plan--slots .base-plan-cta { color:var(--warn); }
#sf-base .base-plan--complete .base-plan-cta { color:var(--ink-mute); }
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
function fmtCr(n) { return (Math.round(n) || 0).toLocaleString('en-US'); }
function techName(id) {
  const node = TECH_BY_ID.get(id);
  return (node && node.name) || String(id || 'required tech').replace(/^tech_/, '').replace(/_/g, ' ');
}

export function describeBaseBuildAction(mod, player = {}, body = {}) {
  if (!mod) {
    return {
      state: 'missing',
      disabled: true,
      label: 'Unavailable',
      title: 'Select a module to inspect build options.',
    };
  }
  const modules = Array.isArray(body.modules) ? body.modules : [];
  const slots = Math.max(0, Number(body.slots) || 0);
  const usedSlots = modules.length;
  const researched = new Set(player.researchedNodes || []);
  const credits = Math.max(0, Number(player.credits) || 0);
  const cost = Math.max(0, Number(mod.cost) || 0);
  const built = modules.includes(mod.id);
  const techOk = !mod.techReq || researched.has(mod.techReq);
  const afford = credits >= cost;
  const slotFree = usedSlots < slots;

  if (built) {
    return {
      state: 'built',
      disabled: true,
      label: 'Built',
      title: mod.name + ' is already installed on this base.',
    };
  }
  if (!techOk) {
    const req = techName(mod.techReq);
    return {
      state: 'locked',
      disabled: true,
      label: 'Research ' + req,
      title: mod.name + ' requires ' + req + ' before this base can build it.',
    };
  }
  if (!afford) {
    const missing = Math.max(0, cost - credits);
    return {
      state: 'funding',
      disabled: true,
      label: 'Need ' + fmtCr(missing) + ' cr',
      title: mod.name + ' costs ' + fmtCr(cost) + ' cr. You need ' + fmtCr(missing) + ' more credits.',
    };
  }
  if (!slotFree) {
    return {
      state: 'slots',
      disabled: true,
      label: 'No free base slot',
      title: (body.name || 'This base') + ' has ' + usedSlots + '/' + slots + ' module slots filled.',
    };
  }
  return {
    state: 'available',
    disabled: false,
    label: 'Build',
    title: 'Build ' + mod.name + ' on ' + (body.name || 'this base') + ' for ' + fmtCr(cost) + ' cr.',
  };
}

export function describeBasePlan(body = {}, player = {}) {
  if (!body) {
    return {
      state: 'missing',
      moduleId: null,
      title: 'Pick a claimed body',
      body: 'Press ' + BINDINGS.claimBase.label + ' near a claimed body to review modules and build blockers.',
      actionLabel: 'Find claim',
    };
  }
  const modules = Array.isArray(body.modules) ? body.modules : [];
  const slots = Math.max(0, Number(body.slots) || 0);
  if (slots <= 0) {
    return {
      state: 'complete',
      moduleId: null,
      title: 'No module slots available',
      body: (body.name || 'This body') + ' cannot mount base modules. Find a larger claim for automation infrastructure.',
      actionLabel: 'Scout larger claim',
    };
  }
  if (modules.length >= slots) {
    return {
      state: 'complete',
      moduleId: null,
      title: 'Base slots full',
      body: (body.name || 'This base') + ' has ' + modules.length + '/' + slots + ' slots filled. Future upgrades need a larger claim or a different build order.',
      actionLabel: 'Review build order',
    };
  }

  const step = BASE_PLAN_STEPS.find((entry) => !modules.includes(entry.moduleId) && BODY_MODULE_BY_ID.has(entry.moduleId));
  if (!step) {
    return {
      state: 'complete',
      moduleId: null,
      title: 'Base plan complete',
      body: 'Every known module type is already represented here. Use this claim as an anchor for cargo, industry, or route collapse.',
      actionLabel: 'Plan complete',
    };
  }

  const mod = BODY_MODULE_BY_ID.get(step.moduleId);
  const action = describeBaseBuildAction(mod, player, body);
  const ready = !action.disabled;
  return {
    state: ready ? 'ready' : action.state,
    moduleId: mod.id,
    title: step.title,
    body: step.body + ' ' + (ready ? 'Ready now: ' : 'Next blocker: ') + action.title,
    actionLabel: action.label,
  };
}

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
      wrap.innerHTML = '<div class="base-title">No body selected</div><div class="base-sub">Press ' + BINDINGS.claimBase.label + ' near a claimed body to manage it.</div>';
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

    const plan = describeBasePlan(body, state.player);
    const planEl = document.createElement('div');
    planEl.className = 'base-plan base-plan--' + plan.state;
    planEl.innerHTML = '<div class="base-plan-k">Base Plan</div>' +
      '<div class="base-plan-title">' + escapeHtml(plan.title) + '</div>' +
      '<div class="base-plan-body">' + escapeHtml(plan.body) + '</div>' +
      '<div class="base-plan-cta">Next: ' + escapeHtml(plan.actionLabel) + '</div>';
    wrap.appendChild(planEl);

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
      const buildAction = describeBaseBuildAction(mod, player, body);
      const techLabel = mod.techReq ? ' · ' + techName(mod.techReq) : '';
      card.innerHTML =
        '<div class="nm">' + escapeHtml(mod.name) + (built ? ' <span style="color:var(--good)">✓ built</span>' : '') + '</div>' +
        '<div class="desc">' + escapeHtml(mod.desc || '') + '</div>' +
        '<div class="meta"><span>' + mod.cost.toLocaleString() + ' cr' + escapeHtml(techLabel) + '</span></div>';
      if (!built) {
        const btn = document.createElement('button');
        btn.className = 'sf-btn sf-btn--primary';
        btn.style.cssText = 'width:100%;margin-top:8px;padding:6px;';
        btn.textContent = buildAction.label;
        btn.disabled = buildAction.disabled;
        btn.title = buildAction.title;
        btn.setAttribute('aria-label', buildAction.title);
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
