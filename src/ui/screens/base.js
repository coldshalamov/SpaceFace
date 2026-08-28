// Base screen (V2 §6 / M3). The base-management view for a claimed body — shows the body's module
// slots, lets the player build modules (depot/refinery/teleporter/defense), and fire the
// teleporter. Reuses the screen-modal pattern (like station hub). Entry: pushed from the claim/base
// binding near an already-claimed body (input.js sets state.ui.pendingClaimBodyId first).
import {
  BODY_MODULES,
  BODY_MODULE_BY_ID,
  BODY_SLOTS_BY_SIZE,
  BODY_SPECIALIZATIONS,
  BODY_SPECIALIZATION_BY_ID,
} from '../../data/claimableBodies.js';
import { TECH_NODES } from '../../data/tech.js';
import { escapeHtml } from '../comms.js';
import { icon } from '../station/icons.js';
import { BINDINGS } from '../bindings.js';
import { confirm, isConfirmOpen } from '../confirm.js';

const STYLE_ID = 'sf-base-style';
const TECH_BY_ID = new Map(TECH_NODES.map((t) => [t.id, t]));
const BASE_BUILD_PRIORITY = ['mod_depot', 'mod_refinery', 'mod_sensor_post', 'mod_throughline_sling', 'mod_defense', 'mod_teleporter'];

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
/* Layout only: the plate material, tokens, buttons and stamp come from styles/menu.css via the
   .screen.sf-menu class mount() puts on the screen root. #sf-base is the inner column, so it
   carries no padding/scroller of its own — the plate already provides both. */
#sf-base { display:flex; flex-direction:column; gap:14px; padding:0; min-width:min(92vw,720px);
  pointer-events:auto; }
#sf-base .base-title { font-family:var(--mono); letter-spacing:.22em; font-size:17px;
  color:var(--accent); text-transform:uppercase; }
#sf-base .base-sub { color:var(--ink-mute); font-size:12px; }
#sf-base .base-plan { border:1px solid rgba(219,152,56,.28); border-radius:2px; padding:10px 12px;
  background:rgba(23,27,31,.58); display:grid; gap:4px; }
#sf-base .base-plan--ok { border-color:rgba(88,201,138,.35); background:rgba(24,42,34,.4); }
#sf-base .base-plan--warn { border-color:rgba(227,161,61,.38); background:rgba(48,38,20,.4); }
#sf-base .base-plan--bad { border-color:rgba(237,105,97,.38); background:rgba(46,24,22,.4); }
#sf-base .base-plan-k { color:var(--accent); font-family:var(--mono); font-size:12px; letter-spacing:.14em; text-transform:uppercase; }
#sf-base .base-plan--ok .base-plan-k { color:var(--good); }
#sf-base .base-plan--warn .base-plan-k { color:var(--warn); }
#sf-base .base-plan--bad .base-plan-k { color:var(--danger); }
#sf-base .base-plan-title { color:var(--ink); font-weight:700; font-size:13px; }
#sf-base .base-plan-body { color:var(--ink-dim); font-size:12px; line-height:1.35; }
#sf-base .base-slots { display:flex; gap:10px; flex-wrap:wrap; }
#sf-base .base-slot { flex:1; min-width:120px; border:1px solid var(--panel-edge); border-radius:2px;
  padding:12px; background:var(--panel); position:relative; }
#sf-base .base-slot.empty { border-style:dashed; opacity:.6; display:flex; align-items:center;
  justify-content:center; color:var(--ink-mute); font-size:12px; min-height:80px; }
#sf-base .base-slot .nm { font-weight:600; color:var(--ink); font-size:13px; margin-bottom:4px; }
#sf-base .base-slot .eff { color:var(--accent); font-size:12px; font-family:var(--mono); }
#sf-base .base-shop { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
#sf-base .base-specializations { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; }
#sf-base .base-spec { border:1px solid var(--panel-edge); border-radius:2px; padding:12px;
  background:var(--panel); display:grid; gap:7px; align-content:start; }
/* Active identity reads as a machined index notch, not a glow (mirrors menu.css .sf-slot.sel). */
#sf-base .base-spec.active { border-color:#8a6a3c; background:var(--mf-worklight-dim);
  box-shadow:inset 2px 0 0 var(--accent); }
#sf-base .base-spec .nm { color:var(--ink); font-size:13px; font-weight:700; }
#sf-base .base-spec .desc { color:var(--ink-mute); font-size:12px; line-height:1.35; }
#sf-base .base-spec .verb { color:var(--accent); font-size:12px; font-weight:700; line-height:1.35; }
#sf-base .base-spec .effect { color:var(--good); font-size:12px; line-height:1.35; }
#sf-base .base-spec .risk { color:var(--warn); font-size:12px; line-height:1.35; }
#sf-base .base-ledger { border:1px solid rgba(219,152,56,.25); border-radius:2px; padding:12px;
  background:rgba(14,17,19,.88); display:grid; gap:8px; }
#sf-base .base-ledger-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px; }
#sf-base .base-ledger-cell { border-left:2px solid rgba(219,152,56,.32); padding-left:8px; }
#sf-base .base-ledger-k { color:var(--ink-mute); font-family:var(--mono); font-size:12px;
  letter-spacing:.12em; text-transform:uppercase; }
#sf-base .base-ledger-v { color:var(--ink); font-size:12px; margin-top:2px; }
#sf-base .base-freight { display:flex; gap:8px; flex-wrap:wrap; }
#sf-base .base-receipt { color:var(--ink-dim); font-size:12px; }
#sf-base .base-mod { border:1px solid var(--panel-edge); border-radius:2px; padding:12px; background:var(--panel); }
#sf-base .base-mod .nm { font-weight:600; color:var(--ink); font-size:13px; }
#sf-base .base-mod .desc { color:var(--ink-mute); font-size:12px; margin:4px 0 8px; min-height:28px; }
#sf-base .base-mod .meta { display:flex; justify-content:space-between; align-items:center; font-size:12px;
  color:var(--ink-dim); font-family:var(--mono); }
#sf-base .base-foot { display:flex; gap:10px; justify-content:flex-end; }
#sf-base button.sf-btn { width:auto; padding:8px 18px; }
#sf-base .sf-btn-ico { display:inline-flex; align-items:center; margin-right:7px; vertical-align:-2px; }
#sf-base .sf-btn-ico svg { display:block; }
#sf-base button.sf-btn--primary { background:linear-gradient(180deg,#ffc064,#db9838);
  border-color:#6b4a26; color:#1c1206; }
/* Build buttons set an inline width:100%/padding:6px, which the fascia's left index notch would
   sit on top of. Drop the notch for those and center the label instead. */
#sf-base .base-mod button.sf-btn { text-align:center; }
#sf-base .base-mod button.sf-btn::before { display:none; }
@media (max-width:760px) {
  #sf-base .base-specializations { grid-template-columns:1fr; }
  #sf-base .base-ledger-grid { grid-template-columns:1fr 1fr; }
}
  `;
  document.head.appendChild(s);
}

function pretty(id) { return (id || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()); }
function fmtCr(n) { return (Math.round(n) || 0).toLocaleString('en-US'); }
function techName(id) {
  const node = TECH_BY_ID.get(id);
  return (node && node.name) || String(id || 'required tech').replace(/^tech_/, '').replace(/_/g, ' ');
}

/** Describe the irreversible credit/material commitment before invoking the claims owner. */
export function describeBaseInvestmentConfirm(item, player = {}, body = {}, options = {}) {
  if (!item) return null;
  const cost = Math.max(0, Number(item.cost) || 0);
  const materials = Object.entries(item.materials || {}).filter(([, qty]) => Number(qty) > 0);
  if (cost <= 0 && materials.length === 0) return null;

  const credits = Math.max(0, Number(player.credits) || 0);
  const remaining = Math.max(0, credits - cost);
  const danger = cost > 0 && (
    (credits > 0 && cost >= credits * 0.5)
    || (remaining <= 500 && credits >= cost)
  );
  const materialLine = materials.length
    ? ' Uses ' + materials.map(([id, qty]) => (
      Math.max(0, Number(qty) || 0) + ' ' + pretty(id.replace(/^cmdty_/, ''))
    )).join(', ') + ' from your hold.'
    : '';
  const targetName = body.name || 'this claim';
  const specialization = options.kind === 'specialization';
  const currentSpec = specialization && body.spec && BODY_SPECIALIZATION_BY_ID.get(body.spec.id);
  const consequence = specialization
    ? (currentSpec && currentSpec.id !== item.id
      ? ` Replaces ${currentSpec.name} on ${targetName}.`
      : ` Sets ${targetName} to ${item.name}.`)
    : ` Adds ${item.name} to ${targetName}.`;
  const riskLine = danger
    ? (credits > 0 && cost >= credits * 0.5
      ? ' This spends at least half your credits.'
      : ` Remaining balance after construction is operationally thin (${fmtCr(remaining)} CR).`)
    : '';

  return {
    title: (specialization ? 'Commission ' : 'Build ') + item.name + '?',
    body: `Cost: ${fmtCr(cost)} CR.${materialLine}${consequence}${riskLine}`,
    confirmLabel: specialization ? 'Commission' : 'Build',
    cancelLabel: 'Cancel',
    danger,
  };
}

/** Keep the claims owner entirely behind the player's confirmation decision. */
export async function applyConfirmedBaseInvestment(confirmOptions, apply, requestConfirm = confirm) {
  if (confirmOptions && !(await requestConfirm(confirmOptions))) return false;
  return typeof apply === 'function' && apply() === true;
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
  const materials = player.cargo && player.cargo.items || {};
  const missingMaterial = Object.entries(mod.materials || {}).find(([id, need]) => (
    Math.max(0, Number(materials[id]) || 0) < Math.max(0, Number(need) || 0)
  ));

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
  if (mod.requiresSpec && (!body.spec || body.spec.id !== mod.requiresSpec || body.spec.status !== 'active')) {
    const spec = BODY_SPECIALIZATION_BY_ID.get(mod.requiresSpec);
    return {
      state: 'requires',
      disabled: true,
      label: 'Commission ' + ((spec && spec.short) || pretty(mod.requiresSpec)),
      title: mod.name + ' can only be aligned from an active ' + ((spec && spec.name) || pretty(mod.requiresSpec)) + ' claim.',
    };
  }
  if (missingMaterial) {
    const [id, needRaw] = missingMaterial;
    const need = Math.max(0, Number(needRaw) || 0);
    const have = Math.max(0, Number(materials[id]) || 0);
    return {
      state: 'materials',
      disabled: true,
      label: 'Need ' + (need - have) + ' ' + pretty(id.replace(/^cmdty_/, '')),
      title: mod.name + ' requires ' + need + ' ' + pretty(id.replace(/^cmdty_/, '')) + '; the hold carries ' + have + '.',
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
    title: 'Build ' + mod.name + ' on ' + (body.name || 'this base') + ' for ' + fmtCr(cost) + ' cr'
      + (Object.keys(mod.materials || {}).length ? ' plus the listed carried materials.' : '.'),
  };
}

function storedSpecUnits(spec) {
  if (!spec || !spec.store) return 0;
  const sum = (bucket) => Object.values(bucket || {}).reduce((total, qty) => total + (Number(qty) || 0), 0);
  return sum(spec.store.input) + sum(spec.store.output);
}

export function describeSpecializationAction(spec, player = {}, body = {}) {
  if (!spec) {
    return { state: 'missing', disabled: true, label: 'Unavailable', title: 'Select an operating identity.' };
  }
  const modules = Array.isArray(body.modules) ? body.modules : [];
  const current = body.spec || null;
  if (current && current.id === spec.id) {
    return {
      state: 'active', disabled: true, label: 'Active',
      title: spec.name + ' is the current operating identity for ' + (body.name || 'this claim') + '.',
    };
  }
  if (current && (storedSpecUnits(current) > 0 || current.convoy)) {
    return {
      state: 'occupied', disabled: true, label: 'Clear site storage',
      title: 'Empty stored goods and finish the active convoy before re-commissioning this claim.',
    };
  }
  if (!modules.includes(spec.requiresModule)) {
    const required = BODY_MODULE_BY_ID.get(spec.requiresModule);
    return {
      state: 'requires', disabled: true, label: 'Build ' + ((required && required.name) || pretty(spec.requiresModule)),
      title: spec.name + ' requires ' + ((required && required.name) || pretty(spec.requiresModule)) + ' on this claim.',
    };
  }
  const credits = Math.max(0, Number(player.credits) || 0);
  const cost = Math.max(0, Number(spec.cost) || 0);
  if (credits < cost) {
    const missing = cost - credits;
    return {
      state: 'funding', disabled: true, label: 'Need ' + fmtCr(missing) + ' cr',
      title: spec.name + ' costs ' + fmtCr(cost) + ' cr. You need ' + fmtCr(missing) + ' more credits.',
    };
  }
  return {
    state: 'available', disabled: false,
    label: current ? 'Re-commission · ' + fmtCr(cost) + ' cr' : 'Commission · ' + fmtCr(cost) + ' cr',
    title: 'Commission ' + (body.name || 'this claim') + ' as ' + spec.name + ' for ' + fmtCr(cost) + ' cr.',
  };
}

function ledgerValue(value, suffix = '') {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 1 }) + suffix : '—';
}

function appendLedgerCell(parent, label, value) {
  const cell = document.createElement('div');
  cell.className = 'base-ledger-cell';
  const key = document.createElement('div');
  key.className = 'base-ledger-k';
  key.textContent = label;
  const val = document.createElement('div');
  val.className = 'base-ledger-v';
  val.textContent = value;
  cell.append(key, val);
  parent.appendChild(cell);
}

function orderedBaseModules() {
  const byId = new Map(BODY_MODULES.map((mod) => [mod.id, mod]));
  const ordered = BASE_BUILD_PRIORITY.map((id) => byId.get(id)).filter(Boolean);
  for (const mod of BODY_MODULES) {
    if (!BASE_BUILD_PRIORITY.includes(mod.id)) ordered.push(mod);
  }
  return ordered;
}

export function recommendBaseBuildPlan(player = {}, body = {}) {
  const modules = Array.isArray(body.modules) ? body.modules : [];
  const slots = Math.max(0, Number(body.slots) || 0);
  const usedSlots = modules.length;
  const baseName = body.name || 'This base';
  if (!(slots > 0)) {
    return {
      kind: 'bad',
      state: 'missing',
      label: 'BUILD PLAN',
      title: 'No module slots detected',
      body: 'Open this panel from a claimed body with module slots to plan construction.',
    };
  }
  if (usedSlots >= slots) {
    return {
      kind: 'warn',
      state: 'filled',
      label: 'BASE FILLED',
      title: baseName + ' has no free module slots',
      body: usedSlots + '/' + slots + ' slots are committed. Claim a larger body for more infrastructure, or use this base as a finished outpost.',
    };
  }

  for (const mod of orderedBaseModules()) {
    if (modules.includes(mod.id)) continue;
    const action = describeBaseBuildAction(mod, player, body);
    if (action.state === 'available') {
      return {
        kind: 'ok',
        state: 'available',
        label: 'NEXT BUILD',
        title: 'Build ' + mod.name + ' next',
        body: action.title + ' ' + (mod.desc || ''),
        moduleId: mod.id,
      };
    }
  }

  const blocked = orderedBaseModules()
    .filter((mod) => !modules.includes(mod.id))
    .map((mod) => ({ mod, action: describeBaseBuildAction(mod, player, body) }))
    .find((entry) => entry.action && entry.action.state !== 'built');
  if (blocked) {
    return {
      kind: blocked.action.state === 'locked' ? 'warn' : 'bad',
      state: blocked.action.state,
      label: blocked.action.state === 'locked' ? 'RESEARCH NEXT' : 'PREP NEXT',
      title: blocked.mod.name,
      body: blocked.action.title,
      moduleId: blocked.mod.id,
    };
  }

  return {
    kind: 'ok',
    state: 'complete',
    label: 'BASE COMPLETE',
    title: baseName + ' has every available module',
    body: 'This claim is fully built for the current module catalog.',
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
    // Fascia classes live on the screen root, not on the #sf-base child _render() rebuilds:
    // rootEl.innerHTML = '' clears children, never classes, so this survives every re-render.
    // styles/menu.css scopes its tokens to .screen.sf-menu and custom properties inherit, so
    // #sf-base picks the whole palette up as a descendant.
    rootEl.classList.add('panel', 'sf-menu');
    // Diegetic fascia stamp (styles/menu.css .sf-menu::before reads it).
    rootEl.dataset.stamp = 'CLAIM REGISTRY / OPERATIONS';
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
    const player = state.player || {};
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

    const plan = recommendBaseBuildPlan(player, body);
    const planEl = document.createElement('div');
    planEl.className = 'base-plan base-plan--' + plan.kind;
    planEl.setAttribute('aria-label', [plan.label, plan.title, plan.body].filter(Boolean).join(': '));
    planEl.innerHTML =
      '<div class="base-plan-k">' + escapeHtml(plan.label) + '</div>' +
      '<div class="base-plan-title">' + escapeHtml(plan.title) + '</div>' +
      '<div class="base-plan-body">' + escapeHtml(plan.body) + '</div>';
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

    // ---- operating identity (M5 / SPEC3-F6): one claim, one visible job ----
    const specHead = document.createElement('div');
    specHead.style.cssText = 'font-family:var(--mono);letter-spacing:.1em;font-size:12px;color:var(--ink-dim);text-transform:uppercase;margin-top:6px;';
    specHead.textContent = 'Operating identity';
    wrap.appendChild(specHead);

    const specGrid = document.createElement('div');
    specGrid.className = 'base-specializations';
    for (const spec of BODY_SPECIALIZATIONS) {
      const specAction = describeSpecializationAction(spec, player, body);
      const card = document.createElement('section');
      card.className = 'base-spec' + (body.spec && body.spec.id === spec.id ? ' active' : '');
      card.setAttribute('aria-label', spec.name + ': ' + spec.desc);

      const name = document.createElement('div');
      name.className = 'nm';
      name.textContent = spec.name + (specAction.state === 'active' ? ' · ACTIVE' : '');
      const verb = document.createElement('div');
      verb.className = 'verb';
      verb.textContent = '▶ YOUR VERB · ' + spec.playerVerb;
      const effect = document.createElement('div');
      effect.className = 'effect';
      effect.textContent = '✓ CONSEQUENCE · ' + spec.consequence;
      const risk = document.createElement('div');
      risk.className = 'risk';
      risk.textContent = '△ TRADEOFF · ' + spec.riskLine;
      const btn = document.createElement('button');
      btn.className = 'sf-btn sf-btn--primary';
      btn.textContent = specAction.label;
      btn.disabled = specAction.disabled;
      btn.title = specAction.title;
      btn.setAttribute('aria-label', specAction.title);
      btn.addEventListener('click', async () => {
        if (isConfirmOpen()) return;
        try { btn.focus({ preventScroll: true }); } catch (_) {
          try { btn.focus(); } catch (__) {}
        }
        const didCommit = await applyConfirmedBaseInvestment(
          describeBaseInvestmentConfirm(spec, player, body, { kind: 'specialization' }),
          () => claims.specialize(body.id, spec.id),
        );
        if (didCommit) this._render();
        else if (ctx.bus) ctx.bus.emit('audio:cue', { id: 'ui_deny' });
      });
      card.append(name, verb, effect, risk, btn);
      specGrid.appendChild(card);
    }
    wrap.appendChild(specGrid);

    const ledger = claims.ledger(body.id);
    if (ledger && ledger.specId) {
      const ledgerEl = document.createElement('section');
      ledgerEl.className = 'base-ledger';
      ledgerEl.setAttribute('aria-label', ledger.specName + ' operations ledger');
      const ledgerTitle = document.createElement('div');
      ledgerTitle.className = 'base-plan-k';
      ledgerTitle.textContent = ledger.specName + ' · ' + String(ledger.status || 'offline').toUpperCase();
      ledgerEl.appendChild(ledgerTitle);

      const grid = document.createElement('div');
      grid.className = 'base-ledger-grid';
      appendLedgerCell(grid, 'Upkeep', ledgerValue(ledger.upkeepPerMin, ' cr/min'));
      appendLedgerCell(grid, 'Input', ledgerValue(ledger.stores && ledger.stores.inputU, 'u') + ' / ' + ledgerValue(ledger.stores && ledger.stores.inputCapU, 'u'));
      appendLedgerCell(grid, 'Output', ledgerValue(ledger.stores && ledger.stores.outputU, 'u') + ' / ' + ledgerValue(ledger.stores && ledger.stores.outputCapU, 'u'));
      appendLedgerCell(grid, 'Defense', ledgerValue(ledger.defense && ledger.defense.rating));
      if (ledger.throughput && ledger.specId === 'spec_refinery') {
        appendLedgerCell(grid, 'Throughput', ledgerValue(ledger.throughput.refineRatePerS, ' ore/s'));
      } else if (ledger.throughput && ledger.specId === 'spec_relay') {
        appendLedgerCell(grid, 'Convoy load', ledgerValue(ledger.throughput.convoyLoadU, 'u'));
      } else if (ledger.readiness) {
        appendLedgerCell(grid, 'Claims covered', ledgerValue(ledger.readiness.coveredBodies));
      }
      appendLedgerCell(grid, 'Raid chance', ledger.risk && ledger.risk.raidEligible
        ? ledgerValue((ledger.risk.tripChance || 0) * 100, '%') : 'Lawful volume');
      appendLedgerCell(grid, 'Lifetime output', ledgerValue(ledger.flows && ledger.flows.refinedTotalU, 'u'));
      appendLedgerCell(grid, 'Relay revenue', ledgerValue(ledger.flows && ledger.flows.soldTotalCr, ' cr'));
      if (ledger.infrastructure) {
        const infra = ledger.infrastructure;
        const stage = infra.operational
          ? 'ONLINE'
          : infra.stage === 'aligning'
            ? 'ALIGNING · ' + ledgerValue(infra.alignRemainingS, 's')
            : 'OFFLINE';
        appendLedgerCell(grid, 'Throughline', stage);
        appendLedgerCell(grid, 'Sling route', (infra.stationName || infra.stationId || '—')
          + ' · ×' + ledgerValue(infra.ceilingMult));
      }
      ledgerEl.appendChild(grid);

      const freight = document.createElement('div');
      freight.className = 'base-freight';
      const cargoItems = (player.cargo && player.cargo.items) || {};
      if (ledger.specId !== 'spec_bastion') {
        for (const [goodId, qty] of Object.entries(cargoItems)) {
          const available = Math.max(0, Math.floor(Number(qty) || 0));
          if (!available) continue;
          const deliver = document.createElement('button');
          const amount = Math.min(10, available);
          deliver.className = 'sf-btn';
          deliver.textContent = 'Deliver ' + amount + 'u · ' + pretty(goodId.replace(/^cmdty_/, ''));
          deliver.setAttribute('aria-label', 'Deliver ' + amount + ' units of ' + pretty(goodId.replace(/^cmdty_/, '')) + ' to ' + body.name);
          deliver.addEventListener('click', () => {
            claims.deliverToClaim(body.id, goodId, amount);
            this._render();
          });
          freight.appendChild(deliver);
        }
      }
      if (ledger.stores && ledger.stores.outputU > 0) {
        const collect = document.createElement('button');
        collect.className = 'sf-btn sf-btn--primary';
        collect.textContent = 'Collect output · ' + ledgerValue(ledger.stores.outputU, 'u');
        collect.setAttribute('aria-label', 'Collect stored output from ' + body.name);
        collect.addEventListener('click', () => {
          claims.collectFromClaim(body.id);
          this._render();
        });
        freight.appendChild(collect);
      }
      if (freight.childNodes.length) ledgerEl.appendChild(freight);

      if (ledger.lastEvent) {
        const receipt = document.createElement('div');
        receipt.className = 'base-receipt';
        receipt.textContent = 'LAST · ' + (ledger.lastEvent.text || pretty(ledger.lastEvent.kind));
        ledgerEl.appendChild(receipt);
      }
      wrap.appendChild(ledgerEl);
    }

    // teleport button if a teleporter is built
    if (body.modules.includes('mod_teleporter')) {
      const tp = document.createElement('button');
      tp.className = 'sf-btn sf-btn--primary';
      tp.style.width = 'auto';
      tp.style.alignSelf = 'flex-start';
      // Drawn bolt from the shared icon set instead of the ⚡ emoji, which renders as a color
      // emoji glyph on emoji-font platforms and clashes with the menu button material.
      tp.innerHTML = '<span class="sf-btn-ico">' + icon('energy', 14) + '</span>';
      tp.appendChild(document.createTextNode(
        'Teleport to ' + (claims._stationName ? claims._stationName(body.linkedStationId) : 'linked station')
      ));
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
    for (const mod of BODY_MODULES) {
      const card = document.createElement('div');
      card.className = 'base-mod';
      const built = body.modules.includes(mod.id);
      const buildAction = describeBaseBuildAction(mod, player, body);
      const techLabel = mod.techReq ? ' · ' + techName(mod.techReq) : '';
      const materialLabel = Object.entries(mod.materials || {})
        .map(([id, qty]) => qty + ' ' + pretty(id.replace(/^cmdty_/, '')))
        .join(' · ');
      card.innerHTML =
        '<div class="nm">' + escapeHtml(mod.name) + (built ? ' <span style="color:var(--good)">✓ built</span>' : '') + '</div>' +
        '<div class="desc">' + escapeHtml(mod.desc || '') + '</div>' +
        '<div class="meta"><span>' + mod.cost.toLocaleString() + ' cr' + escapeHtml(techLabel)
          + (materialLabel ? ' · ' + escapeHtml(materialLabel) : '') + '</span></div>';
      if (!built) {
        const btn = document.createElement('button');
        btn.className = 'sf-btn sf-btn--primary';
        btn.style.cssText = 'width:100%;margin-top:8px;padding:6px;';
        btn.textContent = buildAction.label;
        btn.disabled = buildAction.disabled;
        btn.title = buildAction.title;
        btn.setAttribute('aria-label', buildAction.title);
        btn.addEventListener('click', async () => {
          if (isConfirmOpen()) return;
          try { btn.focus({ preventScroll: true }); } catch (_) {
            try { btn.focus(); } catch (__) {}
          }
          const didCommit = await applyConfirmedBaseInvestment(
            describeBaseInvestmentConfirm(mod, player, body),
            () => claims.buildModule(body.id, mod.id),
          );
          if (didCommit) this._render();
          else if (ctx.bus) ctx.bus.emit('audio:cue', { id: 'ui_deny' });
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
