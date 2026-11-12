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
  CLAIMABLE_BODY_SITES,
} from '../../data/claimableBodies.js';
import { TECH_NODES } from '../../data/tech.js';
import { commodityDisplayName } from '../commodityNames.js';
import { formatDistance } from '../units.js';
import { escapeHtml } from '../comms.js';
import { icon } from '../station/icons.js';
import { openGalaxyMap } from '../mapAuthority.js';
import { BINDINGS } from '../bindings.js';
import { confirm, isConfirmOpen } from '../confirm.js';
import { dressLampKey } from '../orrery/lampKey.js';

import { injectBaseLayout } from '../orrery/baseLayouts.js';

const SPEC_ICON = { spec_refinery: 'industry', spec_relay: 'route', spec_bastion: 'shield' };
const TECH_BY_ID = new Map(TECH_NODES.map((t) => [t.id, t]));
const BASE_BUILD_PRIORITY = ['mod_depot', 'mod_refinery', 'mod_sensor_post', 'mod_throughline_sling', 'mod_defense', 'mod_teleporter'];

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
      Math.max(0, Number(qty) || 0) + ' ' + commodityDisplayName(id)
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
  const committed = typeof apply === 'function' && (await Promise.resolve(apply())) === true;
  return committed ? true : 'denied';
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
      label: 'Need ' + (need - have) + ' ' + commodityDisplayName(id),
      title: mod.name + ' requires ' + need + ' ' + commodityDisplayName(id) + '; the hold carries ' + have + '.',
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

/** Dress a button as the screen's ONE Lamp Key; a host without SVG keeps a ghost word. */
function safeDressLamp(button, opts) {
  try {
    if (!button || typeof button.querySelector !== 'function' || !button.childNodes) return button;
    return dressLampKey(button, opts);
  } catch (_) {
    return button;
  }
}

/** A convoy leg's progress as a whole percent, or null when the leg has no clock. Capped
 *  at 99: a convoy still in flight never reads complete. */
function convoyProgress(state, convoy) {
  const t = Number(state && state.simTime);
  const dep = Number(convoy && convoy.departedAt);
  const arr = Number(convoy && convoy.arriveAt);
  if (!Number.isFinite(t) || !Number.isFinite(dep) || !Number.isFinite(arr) || !(arr > dep)) return null;
  return Math.max(0, Math.min(99, Math.round(((t - dep) / (arr - dep)) * 100)));
}

/** A survey candidate's range: live distance in-sector, else its sector short name. */
function candidateRange(state, site) {
  const cur = state && state.world && state.world.currentSectorId;
  const p = (state && state.player) || {};
  if (cur && site && site.sectorId === cur && Number.isFinite(p.x) && Number.isFinite(p.z)
    && site.pos && Number.isFinite(site.pos.x) && Number.isFinite(site.pos.z)) {
    const d = Math.hypot(site.pos.x - p.x, site.pos.z - p.z);
    return formatDistance(d);
  }
  return String((site && site.sectorId) || '').replace(/^sector_/, '').replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** The foot lamp's state: dispatch is real only for a laden relay with no leg flying. */
function describeDispatchAction(body = {}) {
  const spec = body.spec || null;
  if (!spec) return { enabled: false, reason: 'commission an operating identity first' };
  if (spec.convoy) {
    const qty = Math.max(0, Number(spec.convoy.qty) || 0);
    const dest = pretty(String(spec.convoy.destStationId || '').replace(/^station_/, ''));
    return { enabled: false, reason: 'convoy away — ' + qty + 'u to ' + (dest || 'its station') };
  }
  if (spec.id !== 'spec_relay') return { enabled: false, reason: 'needs the Trade Relay identity' };
  const def = BODY_SPECIALIZATION_BY_ID.get('spec_relay') || {};
  const need = Math.max(0, Number(def.minLoadU) || 0);
  const have = spec.store && spec.store.input
    ? Object.values(spec.store.input).reduce((total, qty) => total + (Number(qty) || 0), 0)
    : 0;
  if (have < need) return { enabled: false, reason: 'needs ' + Math.ceil(need - have) + 'u more freight at the site' };
  return { enabled: true, reason: '' };
}

/** Paint the empty state's full-frame field: lattice at half the glass alpha + one dim arc. */
function paintBaseField(canvas) {
  let g = null;
  try {
    g = canvas.getContext('2d');
  } catch (_) {
    g = null;
  }
  if (!g) return;
  try {
    const vw = (typeof window !== 'undefined' && Number.isFinite(window.innerWidth) && window.innerWidth > 0)
      ? Math.floor(window.innerWidth) : 1920;
    const vh = (typeof window !== 'undefined' && Number.isFinite(window.innerHeight) && window.innerHeight > 0)
      ? Math.floor(window.innerHeight) : 1080;
    if (canvas.width !== vw || canvas.height !== vh) {
      canvas.width = vw;
      canvas.height = vh;
    }
    g.clearRect(0, 0, vw, vh);
    const pitch = 36;
    g.fillStyle = 'rgba(236, 230, 216, 0.15)';
    for (let y = (vh % pitch) / 2; y < vh; y += pitch) {
      for (let x = (vw % pitch) / 2; x < vw; x += pitch) {
        g.fillRect(x - 1, y - 1, 2, 2);
      }
    }
    const cx = vw * 0.8125;
    const cy = vh * 0.1852;
    const r = vh * 0.2778;
    const a0 = (160 * Math.PI) / 180;
    const a1 = (110 * Math.PI) / 180;
    g.lineWidth = 6;
    g.strokeStyle = 'rgba(236, 230, 216, 0.10)';
    g.beginPath();
    g.arc(cx, cy, r, a0, a1);
    g.stroke();
    g.lineWidth = 1.5;
    g.strokeStyle = 'rgba(236, 230, 216, 0.32)';
    g.beginPath();
    g.arc(cx, cy, r, a0, a1);
    g.stroke();
  } catch (_) {
    /* the glass stands without its field */
  }
}

function removeBaseField(screen) {
  try {
    const canvas = screen && screen._fieldCanvas;
    if (screen) screen._fieldCanvas = null;
    if (canvas && canvas.parentNode && typeof canvas.parentNode.removeChild === 'function') {
      canvas.parentNode.removeChild(canvas);
    }
  } catch (_) {
    /* decor never breaks the screen */
  }
}

/** The field rides beside the glass (a sibling fixed canvas), never inside its mask. */
function ensureBaseField(screen) {
  try {
    const rootEl = screen && screen._rootEl;
    const doc = typeof document !== 'undefined' ? document : null;
    const parent = rootEl && rootEl.parentNode;
    if (!rootEl || !doc || !parent || typeof doc.createElement !== 'function') return;
    let canvas = screen._fieldCanvas;
    if (!canvas || canvas.parentNode !== parent || typeof canvas.getContext !== 'function') {
      removeBaseField(screen);
      canvas = doc.createElement('canvas');
      if (!canvas || typeof canvas.getContext !== 'function') return;
      canvas.className = 'orr-base__field';
      if (typeof canvas.setAttribute === 'function') canvas.setAttribute('aria-hidden', 'true');
      if (canvas.style) {
        canvas.style.position = 'fixed';
        canvas.style.left = '0';
        canvas.style.top = '0';
        canvas.style.width = '100vw';
        canvas.style.height = '100vh';
        canvas.style.zIndex = '95';
        canvas.style.pointerEvents = 'none';
      }
      if (typeof parent.insertBefore === 'function') parent.insertBefore(canvas, rootEl);
      else if (typeof parent.appendChild === 'function') parent.appendChild(canvas);
      else return;
      screen._fieldCanvas = canvas;
    }
    paintBaseField(canvas);
  } catch (_) {
    /* the glass stands without its field */
  }
}

export const baseScreen = {
  id: 'base',
  _rootEl: null,
  _ctx: null,
  _bodyId: null,
  _candidateIdx: 0,
  _fieldCanvas: null,
  _buildTop: null,
  _lastEmpty: null,
  _dispatchArmed: null,

  // Build the shell ONCE and cache refs. Screens are mounted once by screenManager (build()), so the
  // per-open render — which depends on the just-set state.ui.pendingClaimBodyId — must live in
  // onShow()/_render(), NOT here. Doing it in mount() would freeze the screen on the FIRST body
  // opened and show its stale data on every subsequent open (the bug this file is fixing).
  mount(rootEl, ctx) {
    injectBaseLayout();
    // Fascia classes live on the screen root, not on the #sf-base child _render() rebuilds:
    // rootEl.innerHTML = '' clears children, never classes, so this survives every re-render.
    // styles/menu.css scopes its tokens to .screen.sf-menu and custom properties inherit, so
    // #sf-base picks the whole palette up as a descendant.
    rootEl.classList.add('panel', 'sf-menu', 'orr-base');
    this._rootEl = rootEl;
    this._ctx = ctx;
    // Doctrine keys + the build key, answered at the root so a re-render never drops them:
    // 1/2/3 arm a survey candidate (empty) or commission a doctrine (claimed), B builds.
    if (!rootEl._orrBaseKeys && typeof rootEl.addEventListener === 'function') {
      rootEl._orrBaseKeys = true;
      rootEl.addEventListener('keydown', (ev) => {
        if (!ev || ev.defaultPrevented || ev.altKey || ev.ctrlKey || ev.metaKey) return;
        const key = typeof ev.key === 'string' ? ev.key : '';
        const idx = key.length === 1 ? '123'.indexOf(key) : -1;
        if (idx >= 0) {
          if (this._lastEmpty === true) {
            ev.preventDefault();
            this._armCandidate(idx);
            return;
          }
          if (this._lastEmpty === false && this._rootEl
            && typeof this._rootEl.querySelectorAll === 'function') {
            let btns = null;
            try {
              btns = this._rootEl.querySelectorAll('.base-specializations .base-spec .k-word');
            } catch (_) {
              btns = null;
            }
            const btn = btns && btns[idx];
            if (btn && !btn.disabled && typeof btn.click === 'function') {
              ev.preventDefault();
              btn.click();
            }
          }
          return;
        }
        if ((key === 'b' || key === 'B') && this._lastEmpty === false
          && typeof this._buildTop === 'function') {
          ev.preventDefault();
          this._buildTop();
        }
      });
    }
    if (!rootEl._orrBaseFieldResize && typeof window !== 'undefined'
      && window && typeof window.addEventListener === 'function') {
      rootEl._orrBaseFieldResize = true;
      window.addEventListener('resize', () => {
        try {
          const live = this._fieldCanvas;
          if (live && live.isConnected) paintBaseField(live);
        } catch (_) {
          /* decor never breaks the screen */
        }
      });
    }
  },

  // Arm one survey tick without rebuilding the glass (keys, pointer, walk all land here).
  _armCandidate(i) {
    const rootEl = this._rootEl;
    if (!rootEl || typeof rootEl.querySelectorAll !== 'function') return;
    let ticks = null;
    try {
      ticks = rootEl.querySelectorAll('.orr-base__cand');
    } catch (_) {
      return;
    }
    if (!ticks || !ticks.length) return;
    const n = Math.max(0, Math.min(ticks.length - 1, Number(i) || 0));
    this._candidateIdx = n;
    try {
      ticks.forEach((tick, k) => {
        const armed = k === n;
        if (tick.classList && typeof tick.classList.toggle === 'function') {
          tick.classList.toggle('is-armed', armed);
        }
        if (typeof tick.setAttribute === 'function') {
          tick.setAttribute('aria-pressed', armed ? 'true' : 'false');
        }
      });
      const chart = typeof rootEl.querySelector === 'function'
        ? rootEl.querySelector('.orr-base__chartkey')
        : null;
      const name = ticks[n] && ticks[n].dataset ? ticks[n].dataset.site : '';
      if (chart && name && typeof chart.setAttribute === 'function') {
        chart.setAttribute('aria-label', 'Open the star chart to find a claimable body — ' + name + ' armed');
        if ('title' in chart) chart.title = 'Open chart — ' + name + ' armed';
      }
    } catch (_) {
      /* the rail stands as rendered */
    }
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

    // The one confirmed-build flow, shared by the plan's Lamp Key and the shop ladder.
    const commitBuild = async (btn, mod) => {
      if (isConfirmOpen()) return;
      try { btn.focus({ preventScroll: true }); } catch (_) {
        try { btn.focus(); } catch (__) {}
      }
      const didCommit = await applyConfirmedBaseInvestment(
        describeBaseInvestmentConfirm(mod, player, body),
        () => claims.buildModule(body.id, mod.id),
      );
      if (didCommit === true) this._refreshAfterAction(btn);
      else if (didCommit === 'denied' && ctx.bus) ctx.bus.emit('audio:cue', { id: 'ui_deny' });
    };

    rootEl.classList.remove('is-claimed');
    rootEl.classList.add('is-empty');
    for (const node of Array.from(rootEl.childNodes)) node.remove();
    const wrap = document.createElement('div');
    wrap.id = 'sf-base';
    const header = document.createElement('header');
    header.className = 'base-hero';
    const kicker = document.createElement('div');
    kicker.className = 'base-kicker';
    kicker.textContent = body ? 'Base operations' : 'Claim registry';
    header.appendChild(kicker);
    wrap.appendChild(header);

    if (!body) {
      const title = document.createElement('h2');
      title.className = 'base-title';
      title.textContent = 'Surveyed claims';
      const sub = document.createElement('div');
      sub.className = 'base-sub';
      sub.textContent = 'Select a prospect to locate it on the chart. Press ' + BINDINGS.claimBase.label + ' near a claimed body to manage the site.';
      header.append(title, sub);
      // The registry dreaming: the first three unclaimed survey ticks ride the glass; the
      // chart key arms the chosen one.
      let cands = [];
      try {
        const listed = claims && typeof claims.list === 'function' ? claims.list() : [];
        const owned = new Set((listed || []).map((b) => b && b.poiId));
        cands = CLAIMABLE_BODY_SITES.filter((s) => !owned.has(s.id)).slice(0, 3);
      } catch (_) {
        cands = [];
      }
      if (!cands.length) {
        title.textContent = 'All prospects claimed';
        sub.textContent = 'Open the chart to find an owned site, then press ' + BINDINGS.claimBase.label + ' near it.';
      }
      if (cands.length) {
        this._candidateIdx = Math.max(0, Math.min(cands.length - 1, Number(this._candidateIdx) || 0));
        const rail = document.createElement('div');
        rail.className = 'orr-base__cands';
        rail.setAttribute('role', 'group');
        rail.setAttribute('aria-label', 'Surveyed candidates');
        cands.forEach((site, i) => {
          const tick = document.createElement('button');
          tick.type = 'button';
          tick.className = 'orr-base__cand' + (i === this._candidateIdx ? ' is-armed' : '');
          tick.setAttribute('aria-pressed', i === this._candidateIdx ? 'true' : 'false');
          tick.setAttribute('aria-label', 'Arm ' + site.name + ', ' + candidateRange(state, site)
            + ' (key ' + (i + 1) + ')');
          if (tick.dataset) tick.dataset.site = site.name;
          const num = document.createElement('span');
          num.className = 'orr-base__cand-num';
          num.textContent = String(i + 1);
          num.setAttribute('aria-hidden', 'true');
          const nm = document.createElement('div');
          nm.className = 'orr-base__cand-name';
          nm.textContent = site.name;
          const rg = document.createElement('div');
          rg.className = 'orr-base__cand-range';
          rg.textContent = candidateRange(state, site);
          tick.append(num, nm, rg);
          tick.addEventListener('click', () => this._armCandidate(i));
          rail.appendChild(tick);
        });
        wrap.appendChild(rail);
      }
      const foot = document.createElement('div');
      foot.className = 'base-foot';
      if (ctx.bus || ctx.screenManager?.pushScreen) {
        const chart = document.createElement('button');
        chart.type = 'button';
        chart.className = 'orr-base__chartkey orr-base__lamp';
        chart.textContent = 'Open chart';
        chart.setAttribute('aria-label', 'Open the star chart to find a claimable body'
          + (cands[this._candidateIdx] ? ' — ' + cands[this._candidateIdx].name + ' armed' : ''));
        if (cands[this._candidateIdx]) chart.title = 'Open chart — ' + cands[this._candidateIdx].name + ' armed';
        chart.addEventListener('click', () => {
          const site = cands[this._candidateIdx];
          openGalaxyMap(ctx, {
            focus: site && site.sectorId === state.world?.currentSectorId ? 'system' : 'galaxy',
            sectorId: site?.sectorId, pos: site?.pos, label: site?.name, source: 'base:chart',
          });
        });
        safeDressLamp(chart);
        foot.appendChild(chart);
      }
      const esc = document.createElement('span');
      esc.className = 'orr-base__esc';
      esc.setAttribute('aria-hidden', 'true');
      esc.textContent = 'Esc';
      foot.appendChild(esc);
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'k-word';
      close.textContent = 'Return';
      close.setAttribute('aria-label', 'Return (Escape)');
      close.addEventListener('click', () => { if (ctx.screenManager) ctx.screenManager.popScreen(); });
      foot.appendChild(close);
      rootEl.appendChild(wrap);
      // The foot is a plate child outside the #sf-base scroller: Esc/Return stay visible at
      // every scroll position and the band never overlays the column's text.
      rootEl.appendChild(foot);
      this._lastEmpty = true;
      ensureBaseField(this);
      return;
    }
    rootEl.classList.remove('is-empty');
    rootEl.classList.add('is-claimed');
    this._lastEmpty = false;
    removeBaseField(this);

    const title = document.createElement('h2');
    title.className = 'base-title';
    title.textContent = body.name || 'Claimed body';
    header.appendChild(title);

    const sub = document.createElement('div');
    sub.className = 'base-sub';
    const usedSlots = body.modules.length;
    sub.textContent = body.size + '-class body · ' + usedSlots + '/' + body.slots + ' module slots · '
      + String(body.sectorId || '?').replace(/^sector_/, '').replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
    header.appendChild(sub);

    // Keep the authored survey history with the site's name when the claim is reopened.
    const site = body.poiId && CLAIMABLE_BODY_SITES.find((s) => s.id === body.poiId);
    if (site && site.why) {
      const why = document.createElement('div');
      why.className = 'base-sub';
      why.textContent = site.why;
      header.appendChild(why);
    }

    const ledger = claims.ledger(body.id);
    const plan = recommendBaseBuildPlan(player, body);
    // The screen's ONE Lamp Key is the foot's Dispatch verb; the plan's build, the stored
    // output and the teleporter all speak as words.
    const planMod = plan.state === 'available' && plan.moduleId ? BODY_MODULE_BY_ID.get(plan.moduleId) : null;
    const planBuild = planMod ? describeBaseBuildAction(planMod, player, body) : null;
    const planEl = document.createElement('div');
    planEl.dataset.baseSection = 'plan';
    planEl.className = 'base-plan base-plan--' + plan.kind;
    planEl.setAttribute('aria-label', [plan.label, plan.title, plan.body].filter(Boolean).join(': '));
    planEl.innerHTML =
      '<div class="base-plan-k">' + escapeHtml(plan.label) + '</div>' +
      '<div class="base-plan-title">' + escapeHtml(plan.title) + '</div>' +
      '<div class="base-plan-body">' + escapeHtml(plan.body) + '</div>';
    if (planMod && planBuild && !planBuild.disabled) {
      const cta = document.createElement('button');
      cta.type = 'button';
      cta.dataset.baseAction = 'plan-build';
      cta.className = 'k-word k-word--emph k-word--primary';
      cta.textContent = 'Build ' + planMod.name;
      cta.title = planBuild.title;
      cta.setAttribute('aria-label', planBuild.title);
      cta.addEventListener('click', () => { commitBuild(cta, planMod); });
      planEl.appendChild(cta);
    }
    wrap.appendChild(planEl);

    // ---- installed modules (slot grid) ----
    const slotHead = document.createElement('h3');
    slotHead.className = 'base-sec-h';
    slotHead.textContent = 'Installed modules';
    wrap.appendChild(slotHead);
    const slotsWrap = document.createElement('div');
    slotsWrap.className = 'base-slots';
    for (let i = 0; i < body.slots; i++) {
      const slot = document.createElement('div');
      const modId = body.modules[i];
      if (modId) {
        const mod = BODY_MODULE_BY_ID.get(modId);
        slot.className = 'base-slot';
        slot.innerHTML = '<div class="nm">' + escapeHtml(mod ? mod.name : pretty(modId)) + '</div>' +
          '<div class="eff">Installed</div>';
      } else {
        slot.className = 'base-slot empty';
        // a vacant well reads as opportunity: a ghost plus-bead and the build verb
        const well = document.createElement('div');
        well.className = 'base-well';
        const wb = document.createElement('button');
        wb.type = 'button';
        wb.className = 'k-word k-word--emph';
        wb.textContent = '+ Build module';
        wb.setAttribute('aria-label', 'Build a module in this empty slot (key B)');
        wb.addEventListener('click', () => {
          if (typeof this._buildTop === 'function') this._buildTop();
        });
        well.appendChild(wb);
        slot.appendChild(well);
      }
      slotsWrap.appendChild(slot);
    }
    wrap.appendChild(slotsWrap);

    // ---- operating identity (M5 / SPEC3-F6): one claim, one visible job ----
    const specHead = document.createElement('h3');
    specHead.className = 'base-sec-h';
    specHead.textContent = 'Operating identity';
    wrap.appendChild(specHead);

    const specGrid = document.createElement('div');
    specGrid.className = 'base-specializations';
    BODY_SPECIALIZATIONS.forEach((spec, specIdx) => {
      const specAction = describeSpecializationAction(spec, player, body);
      const card = document.createElement('section');
      card.dataset.baseSection = spec.id;
      card.className = 'base-spec' + (body.spec && body.spec.id === spec.id ? ' active' : '');
      card.setAttribute('aria-label', spec.name + ': ' + spec.desc);

      const name = document.createElement('div');
      name.className = 'nm';
      name.textContent = spec.name;
      const specHead = document.createElement('div');
      specHead.className = 'base-spec-head';
      specHead.innerHTML = icon(SPEC_ICON[spec.id] || 'info', 24);
      specHead.appendChild(name);
      const verb = document.createElement('div');
      verb.className = 'verb';
      verb.textContent = spec.playerVerb;
      const effect = document.createElement('div');
      effect.className = 'effect';
      effect.textContent = spec.consequence;
      const risk = document.createElement('div');
      risk.className = 'risk';
      risk.textContent = spec.riskLine;
      const btn = document.createElement('button');
      btn.className = 'k-word k-word--emph k-word--primary' + (specAction.disabled ? ' orr-base__chip' : '');
      btn.textContent = specAction.label;
      btn.disabled = specAction.disabled;
      btn.title = specAction.title + ' (key ' + (specIdx + 1) + ')';
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
        if (didCommit === true) this._refreshAfterAction(btn);
        else if (didCommit === 'denied' && ctx.bus) ctx.bus.emit('audio:cue', { id: 'ui_deny' });
      });
      card.append(specHead, verb, effect, risk, btn);
      specGrid.appendChild(card);
    });
    wrap.appendChild(specGrid);

    let ledgerHeading = null;
    if (ledger && ledger.specId) {
      const ledgerEl = document.createElement('section');
      ledgerEl.className = 'base-ledger';
      ledgerEl.dataset.baseSection = 'ledger';
      ledgerEl.setAttribute('aria-label', ledger.specName + ' operations ledger');
      const ledgerTitle = document.createElement('h3');
      ledgerHeading = ledgerTitle;
      ledgerTitle.className = 'base-plan-k';
      ledgerTitle.textContent = ledger.specName + ' · ' + String(ledger.status || 'offline').toUpperCase();
      ledgerEl.appendChild(ledgerTitle);

      if (ledger.stores) {
        const hero = document.createElement('div');
        hero.className = 'base-ledger-hero';
        const heroNum = document.createElement('div');
        heroNum.className = 'base-ledger-heronum';
        heroNum.textContent = ledgerValue(ledger.stores.outputU, 'u');
        const heroK = document.createElement('div');
        heroK.className = 'base-ledger-herok';
        heroK.textContent = 'Stored output · capacity ' + ledgerValue(ledger.stores.outputCapU, 'u');
        hero.append(heroNum, heroK);
        ledgerEl.appendChild(hero);
      }

      const grid = document.createElement('div');
      grid.className = 'base-ledger-grid';
      appendLedgerCell(grid, 'Upkeep', ledgerValue(ledger.upkeepPerMin, ' cr/min'));
      appendLedgerCell(grid, 'Input', ledgerValue(ledger.stores && ledger.stores.inputU, 'u') + ' / ' + ledgerValue(ledger.stores && ledger.stores.inputCapU, 'u'));
      appendLedgerCell(grid, 'Output', ledgerValue(ledger.stores && ledger.stores.outputU, 'u') + ' / ' + ledgerValue(ledger.stores && ledger.stores.outputCapU, 'u'));
      appendLedgerCell(grid, 'Defense', ledgerValue(ledger.defense && ledger.defense.rating));
      if (body.spec && body.spec.convoy) {
        const convoy = body.spec.convoy;
        const convoyCell = document.createElement('div');
        convoyCell.className = 'base-ledger-cell';
        const convoyK = document.createElement('div');
        convoyK.className = 'base-ledger-k';
        convoyK.textContent = 'Convoy';
        const convoyV = document.createElement('div');
        convoyV.className = 'base-ledger-v';
        convoyV.textContent = 'In flight';
        const convoySub = document.createElement('div');
        convoySub.className = 'base-ledger-v base-ledger-v--sub';
        const legQty = Math.max(0, Number(convoy.qty) || 0);
        const legDest = pretty(String(convoy.destStationId || '').replace(/^station_/, '')).toUpperCase() || '—';
        const legPct = convoyProgress(state, convoy);
        convoySub.textContent = legQty + 'u ▸ ' + legDest + (legPct === null ? '' : ' · ' + legPct + '%');
        convoyCell.append(convoyK, convoyV, convoySub);
        grid.appendChild(convoyCell);
      }
      if (ledger.throughput && ledger.specId === 'spec_refinery') {
        appendLedgerCell(grid, 'Throughput', ledgerValue(ledger.throughput.refineRatePerS, ' ore/s'));
      } else if (ledger.throughput && ledger.specId === 'spec_relay') {
        appendLedgerCell(grid, 'Convoy load', ledgerValue(ledger.throughput.convoyLoadU, 'u'));
      } else if (ledger.readiness) {
        appendLedgerCell(grid, 'Claims covered', ledgerValue(ledger.readiness.coveredBodies));
      }
      appendLedgerCell(grid, 'Raid chance', ledger.risk && ledger.risk.raidEligible
        ? ledgerValue((ledger.risk.tripChance || 0) * 100, '%') : 'Lawful volume');
      if (ledger.risk && ledger.risk.raidEligible) {
        const raidCell = grid.children[grid.children.length - 1];
        const raidVal = raidCell && raidCell.children && raidCell.children[1];
        if (raidVal) raidVal.className = 'base-ledger-v is-threat';
      }
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
          deliver.dataset.baseAction = 'deliver-' + goodId;
          deliver.className = 'k-word k-word--emph';
          deliver.textContent = 'Deliver ' + amount + 'u · ' + commodityDisplayName(goodId);
          deliver.setAttribute('aria-label', 'Deliver ' + amount + ' units of ' + commodityDisplayName(goodId) + ' to ' + body.name);
          deliver.addEventListener('click', () => {
            claims.deliverToClaim(body.id, goodId, amount);
            this._refreshAfterAction(deliver);
          });
          freight.appendChild(deliver);
        }
      }
      const storedOutputU = (ledger.stores && ledger.stores.outputU) || 0;
      const strandedInputU = (ledger.stores && ledger.stores.strandedInputU) || 0;
      if (storedOutputU > 0 || strandedInputU > 0) {
        const collect = document.createElement('button');
        collect.type = 'button';
        collect.dataset.baseAction = 'collect';
        collect.className = 'k-word k-word--emph k-word--primary';
        collect.textContent = storedOutputU > 0 && strandedInputU > 0
          ? 'Collect output · ' + ledgerValue(storedOutputU, 'u') + ' + ' + ledgerValue(strandedInputU, 'u') + ' stranded'
          : storedOutputU > 0
            ? 'Collect output · ' + ledgerValue(storedOutputU, 'u')
            : 'Collect stranded goods · ' + ledgerValue(strandedInputU, 'u');
        collect.setAttribute('aria-label', 'Collect stored goods from ' + body.name);
        collect.addEventListener('click', () => {
          claims.collectFromClaim(body.id);
          this._refreshAfterAction(collect);
        });
        freight.appendChild(collect);
      }
      if (freight.children.length) ledgerEl.appendChild(freight);

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
      tp.type = 'button';
      tp.className = 'k-word k-word--emph k-word--primary';
      tp.style.width = 'auto';
      tp.style.alignSelf = 'flex-start';
      // Drawn bolt from the shared icon set instead of the ⚡ emoji, which renders as a color
      // emoji glyph on emoji-font platforms and clashes with the menu button material.
      tp.innerHTML = '<span class="base-ico">' + icon('energy', 14) + '</span>';
      const tpWord = document.createElement('span');
      tpWord.textContent = 'Teleport to ' + (claims._stationName ? claims._stationName(body.linkedStationId) : 'linked station');
      tp.appendChild(tpWord);
      tp.addEventListener('click', () => {
        claims.teleportFrom(body.id);
        if (ctx.screenManager) ctx.screenManager.popScreen();
      });
      wrap.appendChild(tp);
    }

    // ---- build shop ----
    const shopHead = document.createElement('h3');
    shopHead.className = 'base-sec-h';
    shopHead.textContent = 'Build module';
    wrap.appendChild(shopHead);

    const shop = document.createElement('div');
    shop.className = 'base-shop';
    for (const mod of BODY_MODULES) {
      const card = document.createElement('div');
      card.className = 'base-mod';
      card.dataset.baseSection = mod.id;
      const built = body.modules.includes(mod.id);
      const buildAction = describeBaseBuildAction(mod, player, body);
      const techLabel = mod.techReq ? ' · ' + techName(mod.techReq) : '';
      const materialLabel = Object.entries(mod.materials || {})
        .map(([id, qty]) => qty + ' ' + commodityDisplayName(id))
        .join(' · ');
      card.innerHTML =
        '<div class="nm">' + escapeHtml(mod.name) + (built ? ' <span class="orr-base__built">✓ Built</span>' : '') + '</div>' +
        '<div class="desc">' + escapeHtml(mod.desc || '') + '</div>' +
        '<div class="meta"><span>' + mod.cost.toLocaleString() + ' cr' + escapeHtml(techLabel)
          + (materialLabel ? ' · ' + escapeHtml(materialLabel) : '') + '</span></div>';
      if (!built) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'k-word k-word--emph k-word--primary' + (buildAction.disabled ? ' orr-base__chip' : '');
        btn.textContent = buildAction.label;
        btn.disabled = buildAction.disabled;
        btn.title = buildAction.title;
        btn.setAttribute('aria-label', buildAction.title);
        btn.addEventListener('click', () => { commitBuild(btn, mod); });
        card.appendChild(btn);
      }
      shop.appendChild(card);
    }
    wrap.appendChild(shop);

    // The wells and the B key build through the shop's own top verb — one action, three doors.
    this._buildTop = () => {
      try {
        const scope = this._rootEl && typeof this._rootEl.querySelectorAll === 'function'
          ? [...this._rootEl.querySelectorAll('.base-shop .base-mod .k-word')]
          : [];
        const live = scope.find((b) => b && !b.disabled);
        if (live && typeof live.click === 'function') {
          live.click();
          return;
        }
        const shop = this._rootEl && typeof this._rootEl.querySelector === 'function'
          ? this._rootEl.querySelector('.base-shop')
          : null;
        if (shop && typeof shop.scrollIntoView === 'function') shop.scrollIntoView({ block: 'nearest' });
      } catch (_) {
        /* the shop stands as rendered */
      }
    };

    // close + the screen's ONE Lamp Key: dispatch the convoy.
    const foot = document.createElement('div');
    foot.className = 'base-foot';
    const jump = document.createElement('nav');
    jump.className = 'base-jump';
    jump.setAttribute('aria-label', 'Base sections');
    for (const [label, heading] of [['Overview', title], ['Ledger', ledgerHeading], ['Construction', shopHead]]) {
      if (!heading) continue;
      heading.tabIndex = -1;
      const link = document.createElement('button');
      link.type = 'button';
      link.textContent = label;
      link.addEventListener('click', () => {
        heading.focus({ preventScroll: true });
        (heading === title ? header : heading).scrollIntoView({ block: 'start' });
      });
      jump.appendChild(link);
    }
    foot.appendChild(jump);
    const esc = document.createElement('span');
    esc.className = 'orr-base__esc';
    esc.setAttribute('aria-hidden', 'true');
    esc.textContent = 'Esc';
    foot.appendChild(esc);
    const close = document.createElement('button');
    close.className = 'k-word k-word--emph';
    close.dataset.baseAction = 'close';
    close.textContent = 'Close';
    close.setAttribute('aria-label', 'Return (Escape)');
    close.addEventListener('click', () => { if (ctx.screenManager) ctx.screenManager.popScreen(); });
    foot.appendChild(close);
    const dispatch = describeDispatchAction(body);
    const armKey = body.id + ':' + ((body.spec && body.spec.convoySeq) || 0);
    if (dispatch.enabled && this._dispatchArmed === armKey) {
      dispatch.enabled = false;
      dispatch.reason = 'dispatch armed — the relay flies on the next tick';
    }
    if (dispatch.enabled) {
      const fire = document.createElement('button');
      fire.type = 'button';
      fire.className = 'orr-base__lamp';
      fire.textContent = 'Dispatch convoy';
      fire.setAttribute('aria-label', 'Dispatch a convoy now from ' + (body.name || 'this claim'));
      fire.addEventListener('click', () => {
        // Arm the owner's own schedule: the next claims tick dispatches (its destination,
        // market and minimum-load checks all still apply). The UI arms; the owner decides.
        try {
          body.spec.nextDispatchAt = (state && Number.isFinite(state.simTime)) ? state.simTime : 0;
        } catch (_) {
          /* the relay keeps its clock */
        }
        this._dispatchArmed = armKey;
        if (ctx.bus) ctx.bus.emit('toast', { text: 'Convoy dispatch armed — the relay flies on the next tick', kind: 'info', ttl: 3 });
        this._refreshAfterAction(close);
      });
      safeDressLamp(fire);
      foot.appendChild(fire);
    } else {
      const status = document.createElement('span');
      status.className = 'base-dispatch-state';
      status.textContent = body.spec?.convoy
        ? dispatch.reason.charAt(0).toUpperCase() + dispatch.reason.slice(1)
        : 'Dispatch: ' + dispatch.reason;
      foot.appendChild(status);
    }
    rootEl.appendChild(wrap);
    // The foot is a plate child outside the #sf-base scroller (see the empty path): the band
    // never overlays the ledger, so nothing reads buried under Esc / Close / Dispatch.
    rootEl.appendChild(foot);
  },

  // Transactions can remove their own button (last delivery or newly installed module).
  // Keep the operator at that site section, with a useful next Tab stop.
  _refreshAfterAction(button) {
    const root = this._rootEl;
    const oldPage = root.querySelector('#sf-base');
    const scroll = oldPage.scrollTop;
    const action = button.dataset.baseAction;
    const section = button.closest('[data-base-section]')?.dataset.baseSection;
    this._render();
    const currentPage = root.querySelector('#sf-base');
    currentPage.scrollTop = scroll;
    const nextButton = action && [...root.querySelectorAll('[data-base-action]')].find(el => el.dataset.baseAction === action && !el.disabled);
    const nextSection = section && [...root.querySelectorAll('[data-base-section]')].find(el => el.dataset.baseSection === section);
    const target = nextButton || nextSection;
    if (target) {
      if (!nextButton) target.tabIndex = -1;
      target.focus({ preventScroll: true });
    }
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

  onHide() {
    removeBaseField(this);
  },

  // IMPORTANT: must be a no-op (mirrors settings.js / drill.js). uiRoot.frame() calls
  // screenManager.refreshTop() ~3x/sec for any open screen; since _render() does a full
  // rootEl.innerHTML rebuild, running it here would flicker the panel and could drop a click on a
  // Build button. The screen needs no periodic refresh: base pauses the sim (timeScale 0) so nothing
  // mutates underneath it, and the only change (build) re-renders directly from its own handler.
  refresh() {},
};
