// Field Fabricator — pause-accessible short-chain crafting for Plan 43.
//
// This screen is only a decision surface. It reads the crafting owner and asks it to build/use;
// cargo, fuel, fields, combat hull, module inventory, and wallets remain with their authorities.
import { COMMODITIES } from '../../data/commodities.js';
import { MODULES } from '../../data/modules.js';
import { WEAPONS } from '../../data/weapons.js';
import { escapeHtml } from '../comms.js';

const STYLE_ID = 'sf-field-crafting-style';
const NAME = new Map([
  ...COMMODITIES.map((item) => [item.id, item.name]),
  ...MODULES.map((item) => [item.id, item.name]),
  ...WEAPONS.map((item) => [item.id, item.name]),
]);
const CHAIN_LABEL = Object.freeze({
  ordnance: 'Ordnance',
  fuel: 'Fuel',
  tether: 'Tether kit',
  field_tech: 'Field tech',
  repairs: 'Repairs',
});
const CHAIN_ORDER = Object.freeze(['ordnance', 'fuel', 'tether', 'field_tech', 'repairs']);

let mounted = null;

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .sf-field-craft{width:min(1080px,94vw);height:min(780px,90vh);margin:auto;padding:24px;display:grid;grid-template-rows:auto auto 1fr;gap:14px;background:linear-gradient(145deg,#12191c,#080c0e 72%);border:1px solid rgba(104,210,190,.34);box-shadow:0 28px 90px rgba(0,0,0,.56);color:var(--text,#dce9e8)}
    .sf-field-craft__head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;border-bottom:1px solid rgba(104,210,190,.22);padding-bottom:14px}
    .sf-field-craft__head h1{margin:0;font-size:clamp(1.35rem,2.8vw,2.2rem);letter-spacing:.08em;text-transform:uppercase}
    .sf-field-craft__head p{max-width:720px;margin:6px 0 0;color:#9db2b0;line-height:1.45}
    .sf-field-craft__supplies{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;padding:10px;background:#0b1113;border:1px solid rgba(255,255,255,.08)}
    .sf-field-craft__supply{display:grid;grid-template-columns:1fr auto;gap:4px 10px;align-items:center;padding:9px 11px;border-left:2px solid #72cdbd;background:rgba(114,205,189,.045)}
    .sf-field-craft__supply small{grid-column:1/-1;color:#849997}
    .sf-field-craft__body{overflow:auto;padding-right:5px}
    .sf-field-craft__chain{margin:0 0 18px}
    .sf-field-craft__chain h2{margin:0 0 8px;font-size:.78rem;letter-spacing:.19em;text-transform:uppercase;color:#78ddca}
    .sf-field-craft__grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:8px}
    .sf-field-craft__card{padding:13px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.025);display:grid;gap:8px}
    .sf-field-craft__card.is-locked{opacity:.68;border-style:dashed}
    .sf-field-craft__title{display:flex;justify-content:space-between;gap:12px;align-items:start}
    .sf-field-craft__title b{font-size:.96rem}
    .sf-field-craft__flow{font-size:.82rem;color:#b8cac8;line-height:1.45}
    .sf-field-craft__flow strong{color:#eff8f6}
    .sf-field-craft__desc{font-size:.76rem;color:#849997;line-height:1.4}
    .sf-field-craft__unlock{font-size:.74rem;color:#efbd74}
    .sf-field-craft .sf-btn[disabled]{opacity:.48;cursor:not-allowed}
    @media(max-width:720px){.sf-field-craft{padding:15px}.sf-field-craft__supplies{grid-template-columns:1fr}.sf-field-craft__head{align-items:stretch}.sf-field-craft__head>.sf-btn{min-width:74px}}
  `;
  document.head.appendChild(style);
}

function craftingOwner(ctx) {
  return ctx.crafting || (ctx.registry && ctx.registry.get && ctx.registry.get('crafting')) || null;
}

function cargoCount(state, id) {
  return Math.max(0, Math.floor(Number(state?.player?.cargo?.items?.[id]) || 0));
}

function nameOf(id) {
  return NAME.get(id) || String(id || '').replace(/^(cmdty|mod|wpn)_/, '').replace(/_/g, ' ');
}

function materialLine(bp, state) {
  return Object.entries(bp.inputs || {}).map(([id, need]) => {
    const have = cargoCount(state, id);
    return `${escapeHtml(nameOf(id))} <strong>${have}/${need}</strong>`;
  }).join(' + ');
}

function buildLabel(entry) {
  if (!entry.blueprintOk) return 'Blueprint locked';
  if (!entry.techOk) return 'Research required';
  if (!entry.sourceOk) return 'Source module required';
  if (!entry.matsOk) {
    const miss = entry.materials.find((item) => item.have < item.need);
    return miss ? `Need ${miss.need - miss.have} ${nameOf(miss.id)}` : 'Materials missing';
  }
  return 'Fabricate';
}

function denialText(result) {
  const reason = result && result.reason;
  const copy = {
    missing_supply: 'No crafted supply in cargo',
    tank_full: 'Fuel tank already full',
    hull_intact: 'Hull already intact',
    hostiles_nearby: 'Hostiles too close for a field patch',
    already_ready: 'Emitter already ready',
    fields_disabled: 'Field emitters unavailable on this route',
    docked: 'Use station services while docked',
  };
  return copy[reason] || 'Field use unavailable right now';
}

function supplyCard(label, id, action, detail, state) {
  const count = cargoCount(state, id);
  return `<div class="sf-field-craft__supply"><b>${escapeHtml(label)} ×${count}</b>` +
    `<button class="sf-btn" type="button" data-use="${escapeHtml(action)}" ${count > 0 ? '' : 'disabled'}>Use</button>` +
    `<small>${escapeHtml(detail)}</small></div>`;
}

function render(ctx) {
  if (!mounted || mounted.ctx !== ctx) return;
  const owner = craftingOwner(ctx);
  const state = ctx.state || {};
  const entries = owner && typeof owner.listField === 'function' ? owner.listField() : [];
  mounted.supplies.innerHTML =
    supplyCard('Jump canister', 'cmdty_jump_fuel_canister', 'fuel', 'Load 25u; a station still fills the whole tank.', state) +
    supplyCard('Patch kit', 'cmdty_patch_kit', 'patch', 'Restore up to 18 hull outside hostile contact; armor stays damaged.', state) +
    `<div class="sf-field-craft__supply"><b>Emitter charge ×${cargoCount(state, 'cmdty_field_emitter_charge')}</b>` +
      `<span><button class="sf-btn" type="button" data-use="well" ${cargoCount(state, 'cmdty_field_emitter_charge') > 0 ? '' : 'disabled'}>Well</button> ` +
      `<button class="sf-btn" type="button" data-use="repulsor" ${cargoCount(state, 'cmdty_field_emitter_charge') > 0 ? '' : 'disabled'}>Repulsor</button></span>` +
      `<small>Clear one live emitter cooldown; a ready emitter consumes nothing.</small></div>`;

  mounted.body.innerHTML = CHAIN_ORDER.map((chain) => {
    const rows = entries.filter((entry) => entry.bp.fieldChain === chain);
    if (!rows.length) return '';
    return `<section class="sf-field-craft__chain"><h2>${escapeHtml(CHAIN_LABEL[chain] || chain)}</h2>` +
      `<div class="sf-field-craft__grid">${rows.map((entry) => {
        const bp = entry.bp;
        const outputQty = Math.max(1, Number(bp.outputs.qty) || 1);
        const locked = entry.blueprintOk ? '' : ' is-locked';
        return `<article class="sf-field-craft__card${locked}">` +
          `<div class="sf-field-craft__title"><b>${escapeHtml(bp.name)}</b>` +
            `<button class="sf-btn${entry.canBuild ? ' sf-btn--primary' : ''}" type="button" data-build="${escapeHtml(bp.id)}" ${entry.canBuild ? '' : 'disabled'}>${escapeHtml(buildLabel(entry))}</button></div>` +
          `<div class="sf-field-craft__flow">${materialLine(bp, state)} → <strong>${escapeHtml(nameOf(bp.outputs.id))} ×${outputQty}</strong></div>` +
          `<div class="sf-field-craft__desc">${escapeHtml(bp.desc || '')}</div>` +
          (!entry.blueprintOk ? `<div class="sf-field-craft__unlock">Learn through play: ${escapeHtml(entry.blueprintHint)}</div>` : '') +
        `</article>`;
      }).join('')}</div></section>`;
  }).join('');
}

export const fieldCraftingScreen = {
  id: 'fieldCrafting',
  data: { title: 'Field Fabricator', ariaLabel: 'Field Fabricator' },

  mount(root, ctx) {
    injectStyle();
    root.innerHTML = `<div class="sf-field-craft">` +
      `<header class="sf-field-craft__head"><div><h1>Field Fabricator</h1>` +
      `<p>Short chains only. Mine, salvage, or win the blueprint; convert what is already in the hold. ` +
      `For the first combat loop: mine iron → mill compound → pack charges, then throw with Y and detonate with R.</p></div>` +
      `<button class="sf-btn" type="button" data-close>Back</button></header>` +
      `<div class="sf-field-craft__supplies" aria-label="Usable field supplies"></div>` +
      `<div class="sf-field-craft__body" data-sf-scroll="recipes"></div></div>`;
    const frame = root.querySelector('.sf-field-craft');
    const supplies = root.querySelector('.sf-field-craft__supplies');
    const body = root.querySelector('.sf-field-craft__body');
    for (const off of mounted && mounted.unsubs || []) { try { off(); } catch (_) {} }
    const unsubs = [];
    const listen = (event) => {
      if (!ctx.bus || typeof ctx.bus.on !== 'function') return;
      const off = ctx.bus.on(event, () => render(ctx));
      if (typeof off === 'function') unsubs.push(off);
    };
    for (const event of ['cargo:changed', 'craft:complete', 'craft:blueprintsUnlocked', 'craft:fieldSupplyUsed', 'fuel:changed', 'fields:reloaded', 'combat:fieldRepaired']) listen(event);
    mounted = { ctx, root, frame, supplies, body, unsubs };
    frame.addEventListener('click', (event) => {
      const close = event.target.closest('[data-close]');
      if (close) {
        const manager = ctx.screenManager || ctx.registry?.get?.('ui')?.screenManager;
        if (manager && typeof manager.popScreen === 'function') manager.popScreen();
        return;
      }
      const build = event.target.closest('[data-build]');
      const owner = craftingOwner(ctx);
      if (build && owner && typeof owner.buildField === 'function') {
        owner.buildField(build.getAttribute('data-build'));
        render(ctx);
        return;
      }
      const use = event.target.closest('[data-use]');
      if (!use || !owner || typeof owner.useFieldSupply !== 'function') return;
      const action = use.getAttribute('data-use');
      const result = action === 'fuel'
        ? owner.useFieldSupply('cmdty_jump_fuel_canister')
        : action === 'patch'
          ? owner.useFieldSupply('cmdty_patch_kit')
          : owner.useFieldSupply('cmdty_field_emitter_charge', { kind: action });
      if (!result || result.ok !== true) ctx.bus.emit('toast', { text: denialText(result), kind: 'warn', ttl: 2 });
      render(ctx);
    });
    render(ctx);
  },

  onShow(ctx) { render(ctx); },
  refresh(ctx) { render(ctx); },
  onHide() {},
};
