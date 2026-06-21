// Flight HUD (ARCHITECTURE §5.5, design spec "HUD LAYOUT") — always-mounted flight overlay.
//
// Layout:
//   bottom-left   : hull / shield / energy / heat vertical bars + numerics
//   bottom-center : throttle + speed + cargo (used/cap) + credits
//   bottom-right  : radar (radar.js) with target panel (targetPanel.js) above it
//   top-center    : alert queue (alerts.js renders into #alerts directly)
//   top-right     : active objective line + off-screen objective arrow
//
// Update split (§5.5):
//   - 60Hz cheap path (frame): bar widths via transform:scaleX, radar @20Hz, arrows via worldToScreen.
//   - numerics via textContent @10Hz (every 6th tick).
//   - lists/credits/cargo rebuilt only on data events (credits:changed, cargo:changed, ship:statsChanged).
//
// The HUD READS state for display and never mutates sim state (§5, §0.6).

import { createRadar } from './radar.js';
import { createTargetPanel } from './targetPanel.js';
import { createFloatingText } from './floatingText.js';
import { createDamageIndicators } from './damageIndicators.js';
import { createHudMeta, HUD_META_CSS } from './hudMeta.js';
import { SHIPS } from '../data/ships.js';
import { COMMODITIES } from '../data/commodities.js';
import { SECTORS } from '../data/sectors.js';

// Ship role → friendly archetype label (Phase 3 HUD class indicator).
const SHIP_BY_ID = new Map(SHIPS.map((s) => [s.id, s]));
const ROLE_LABEL = {
  starter: 'Starter', mining: 'Miner', fighter: 'Fighter', freighter: 'Freighter',
  multirole: 'Multirole', interceptor: 'Interceptor', mining_barge: 'Mining Barge',
  corvette: 'Corvette', heavy_hauler: 'Heavy Hauler', explorer: 'Explorer',
  gunship: 'Gunship', battlecruiser: 'Battlecruiser', flagship: 'Flagship',
};

// ── Mission tracker helpers ──────────────────────────────────────────────────────────────────
const MT_STATION_BY_ID = new Map();
for (const sec of SECTORS) {
  for (const st of sec.stations || []) {
    MT_STATION_BY_ID.set(st.id, st.name);
  }
}
const MT_CMDTY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));

function mtCmdtyName(id) {
  const c = MT_CMDTY_BY_ID.get(id);
  return c ? c.name : (id || 'cargo').replace('cmdty_', '').replace(/_/g, ' ');
}

function mtStationName(id) {
  return MT_STATION_BY_ID.get(id) || 'destination';
}

function mtObjectiveText(m) {
  const p = m.params || {};
  const prog = m.objectiveProgress || 0;
  const tgt = m.objectiveTarget || 1;
  const dest = mtStationName(m.destStationId);
  switch (m.type) {
    case 'cargo_delivery':
    case 'salvage_retrieval':
    case 'passenger_transport':
      return `Deliver to ${dest}`;
    case 'bulk_trade':
      return `Sell ${prog}/${tgt} ${mtCmdtyName(p.cmdtyId)}`;
    case 'mining_quota':
      return `Mine ${prog}/${tgt} ${mtCmdtyName(p.cmdtyId)}`;
    case 'bounty_hunt':
      return 'Eliminate target';
    case 'patrol_clear':
      return `Clear ${prog}/${tgt} hostiles`;
    case 'escort':
      return `Escort to ${dest}`;
    case 'recon_scan':
      return `Scan ${prog}/${tgt} targets`;
    case 'smuggling_run':
      return `Deliver contraband to ${dest}`;
    default:
      return `${prog}/${tgt}`;
  }
}

function mtFmtTime(s) {
  s = Math.max(0, Math.floor(s));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}m ${sec < 10 ? '0' : ''}${sec}s`;
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function setText(el, text) { if (el && el.textContent !== text) el.textContent = text; }
function setDisplay(el, visible, mode = 'block') {
  if (!el) return;
  const next = visible ? mode : 'none';
  if (el.style.display !== next) el.style.display = next;
}

function injectDeathStyle() {
  if (document.getElementById('sf-death-style')) return;
  const s = document.createElement('style');
  s.id = 'sf-death-style';
  s.textContent = `
  .sf-death { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center;
    gap:8px; z-index:1500; pointer-events:none; opacity:0; }
  .sf-death[hidden] { display:none !important; }
  .sf-death.show { animation:sf-death-seq 2.4s ease forwards; }
  @keyframes sf-death-seq { 0%{opacity:0;} 8%{opacity:1;} 70%{opacity:1;} 100%{opacity:0;} }
  .sf-death__big { font-family:var(--mono,Consolas,monospace); font-size:46px; letter-spacing:.22em; color:#ff5470;
    text-shadow:0 0 30px rgba(255,84,112,.7), 0 2px 4px #000; }
  .sf-death__sub { font-family:var(--mono,Consolas,monospace); font-size:14px; letter-spacing:.3em; color:#ffd2da; text-transform:uppercase; }
  body.sf-deathflash::after { content:''; position:fixed; inset:0; z-index:1400; pointer-events:none;
    background:radial-gradient(circle at 50% 50%, rgba(255,40,70,0) 30%, rgba(255,30,60,.55) 100%); animation:sf-deathflash .7s ease forwards; }
  @keyframes sf-deathflash { 0%{opacity:0;} 15%{opacity:1;} 100%{opacity:0;} }
  `;
  document.head.appendChild(s);
}

export function createHud(ctx, alerts) {
  const { state, helpers } = ctx;
  const root = document.getElementById('hud');
  root.innerHTML = '';

  // ---- bottom-left: status bars ----
  const bars = document.createElement('div');
  bars.className = 'sf-bars';
  const barDefs = [
    ['hull', 'HULL', 'hull'],
    ['shield', 'SHLD', 'shield'],
    ['energy', 'ENGY', 'energy'],
    ['boost', 'BOOST', 'boost'],   // Phase 3: boost/dash energy (hidden if the ship can't boost)
    ['heat', 'HEAT', 'heat'],
  ];
  const fillEls = {}, numEls = {}, rowEls = {};
  for (const [key, label, mod] of barDefs) {
    const row = document.createElement('div');
    row.className = 'sf-barrow';
    row.innerHTML = `
      <span class="sf-barrow__label">${label}</span>
      <div class="sf-bar sf-bar--${mod}"><div class="sf-bar__fill"></div></div>
      <span class="sf-barrow__num mono">0</span>`;
    bars.appendChild(row);
    fillEls[key] = row.querySelector('.sf-bar__fill');
    numEls[key] = row.querySelector('.sf-barrow__num');
    rowEls[key] = row;
  }
  root.appendChild(bars);

  // ---- top-left: mission tracker (shows the tracked mission objective + timer) ----
  const missionTracker = document.createElement('div');
  missionTracker.className = 'sf-mission-tracker';
  missionTracker.style.display = 'none';
  missionTracker.innerHTML =
    '<div class="sf-mt-title mono"></div>' +
    '<div class="sf-mt-obj mono"></div>' +
    '<div class="sf-mt-time mono"></div>';
  root.appendChild(missionTracker);
  const mtTitle = missionTracker.querySelector('.sf-mt-title');
  const mtObj = missionTracker.querySelector('.sf-mt-obj');
  const mtTime = missionTracker.querySelector('.sf-mt-time');

  // ---- bottom-center: throttle / speed / cargo / credits / weapons ----
  const center = document.createElement('div');
  center.className = 'sf-cluster';
  center.innerHTML = `
    <div class="sf-stat sf-stat--info"><span class="sf-stat__k">SPD</span><span class="sf-stat__v mono" data-k="speed">0</span><div class="sf-tip" data-tip="speed"></div></div>
    <div class="sf-stat sf-stat--info"><span class="sf-stat__k">THR</span><span class="sf-stat__v mono" data-k="throttle">0%</span><div class="sf-tip" data-tip="throttle"></div></div>
    <div class="sf-stat sf-stat--wide sf-stat--info"><span class="sf-stat__k">CARGO</span><span class="sf-stat__v mono" data-k="cargo">0 / 40 u</span><div class="sf-tip" data-tip="cargo"></div></div>
    <div class="sf-stat sf-stat--wide sf-stat--info"><span class="sf-stat__k">CR</span><span class="sf-stat__v mono sf-credits" data-k="credits">0</span><div class="sf-tip" data-tip="credits"></div></div>
    <div class="sf-stat sf-stat--info" id="sf-wpnstat"><span class="sf-stat__k">WPN</span><span class="sf-stat__v mono" data-k="weapons">—</span><div class="sf-tip" data-tip="weapons"></div></div>
    <div class="sf-stat sf-stat--wide sf-stat--info" id="sf-rolestat"><span class="sf-stat__k">CLASS</span><span class="sf-stat__v mono" data-k="role">—</span><div class="sf-tip" data-tip="class"></div></div>`;
  root.appendChild(center);
  const elSpeed = center.querySelector('[data-k=speed]');
  const elThrottle = center.querySelector('[data-k=throttle]');
  const elCargo = center.querySelector('[data-k=cargo]');
  const elCredits = center.querySelector('[data-k=credits]');
  const elWeapons = center.querySelector('[data-k=weapons]');
  const elRole = center.querySelector('[data-k=role]');

  // ---- HUD stat tooltips: populate on hover to show detailed info ----
  const tipEls = {};
  for (const tip of center.querySelectorAll('.sf-tip')) tipEls[tip.dataset.tip] = tip;

  function buildSpeedTip(p) {
    if (!p) return 'No ship data';
    const sp = Math.hypot(p.vel.x, p.vel.z);
    const maxSp = p.maxSpeed || 1;
    const pct = Math.round(clamp01(sp / maxSp) * 100);
    return `Speed: ${Math.round(sp)} / ${Math.round(maxSp)} wu/s (${pct}%)\nVelocity X: ${p.vel.x.toFixed(1)}, Z: ${p.vel.z.toFixed(1)}`;
  }
  function buildThrottleTip(p) {
    if (!p) return 'No ship data';
    const sp = Math.hypot(p.vel.x, p.vel.z);
    const maxSp = p.maxSpeed || 1;
    const pct = Math.round(clamp01(sp / maxSp) * 100);
    const mass = p.mass || 0;
    const handling = p.handling != null ? p.handling.toFixed(2) : '—';
    return `Throttle: ${pct}%\nMax speed: ${Math.round(maxSp)} wu/s\nMass: ${Math.round(mass)}\nHandling: ${handling}`;
  }
  function buildCargoTip() {
    const c = state.player.cargo || {};
    const items = c.items || {};
    const used = Math.round(c.usedVolume || 0);
    const cap = Math.round(c.capVolume || 40);
    const keys = Object.keys(items);
    if (!keys.length) return `Cargo: ${used} / ${cap} u\nHold is empty`;
    const lines = [`Cargo: ${used} / ${cap} u`];
    for (const id of keys.slice(0, 8)) {
      const qty = items[id];
      if (qty > 0) lines.push(`  ${id.replace('cmdty_', '').replace(/_/g, ' ')}: ${qty}`);
    }
    if (keys.length > 8) lines.push(`  ... +${keys.length - 8} more`);
    return lines.join('\n');
  }
  function buildCreditsTip() {
    const cr = Math.round(state.player.credits || 0);
    const st = state.player.stats || {};
    return `Credits: ${cr.toLocaleString()} CR\nLifetime profit: ${Math.round(st.lifetimeProfit || 0).toLocaleString()}\nTrades: ${st.tradesCount || 0}\nBest single trade: ${Math.round(st.biggestSingleProfit || 0).toLocaleString()}`;
  }
  function buildWeaponsTip(p) {
    if (!p || !p.data || !p.data.weapons || !p.data.weapons.length) return 'No weapons fitted';
    const ws = p.data.weapons;
    const auto = !!(state.input && state.input.autoFire);
    const lines = [`Weapons: ${ws.length} fitted${auto ? ' [AUTO-FIRE]' : ''}`];
    for (const w of ws) {
      const name = w.name || w.id || 'Unknown';
      const dps = w.dps != null ? ` ${w.dps} dps` : '';
      const rng = w.range ? ` ${w.range}m` : '';
      lines.push(`  ${name}${dps}${rng}`);
    }
    return lines.join('\n');
  }
  function buildClassTip(p) {
    if (!p || !p.data) return 'No ship data';
    const defId = p.data.defId;
    const def = SHIP_BY_ID.get(defId);
    if (!def) return 'Unknown hull';
    const role = ROLE_LABEL[def.role] || def.role || '—';
    return `${def.name} — ${role}\nTier: ${def.tier}  Hull: ${def.hull}  Shield: ${def.shield}\nCargo cap: ${def.cargo} u  Mass: ${def.mass}\nSlots: ${Object.entries(def.slots || {}).map(([k, v]) => k[0].toUpperCase() + ':' + v.length).join(' ')}`;
  }

  // Update tooltip content on mouseenter; the CSS handles show/hide.
  for (const stat of center.querySelectorAll('.sf-stat--info')) {
    stat.addEventListener('mouseenter', () => {
      const tip = stat.querySelector('.sf-tip');
      if (!tip) return;
      const k = tip.dataset.tip;
      const p = state.entities.get(state.playerId);
      let text = '';
      if (k === 'speed') text = buildSpeedTip(p);
      else if (k === 'throttle') text = buildThrottleTip(p);
      else if (k === 'cargo') text = buildCargoTip();
      else if (k === 'credits') text = buildCreditsTip();
      else if (k === 'weapons') text = buildWeaponsTip(p);
      else if (k === 'class') text = buildClassTip(p);
      tip.textContent = text;
    });
  }

  // ---- bottom-right: target panel + radar ----
  const rightDock = document.createElement('div');
  rightDock.className = 'sf-rightdock';
  const targetPanel = createTargetPanel(ctx);
  const radar = createRadar(ctx);
  rightDock.append(targetPanel.el, radar.el);
  root.appendChild(rightDock);

  // floating combat text (damage numbers, ore yield, credits, kills)
  const floatingText = createFloatingText(ctx);

  // directional damage indicators (red arcs at screen edge showing where hits came from)
  const dmgInd = createDamageIndicators().bind(
    () => state.entities.get(state.playerId),
    state.playerId,
  );
  root.appendChild(dmgInd.el);
  ctx.bus.on('combat:damage', (p) => dmgInd.onDamage(p));

  // ---- top-right: objective tracker + arrow ----
  const objWrap = document.createElement('div');
  objWrap.className = 'sf-objectives';
  root.appendChild(objWrap);

  // ---- Phase 4: nav readout (destination / distance / ETA) + fuel gauge (top-left) ----
  const elNavReadout = document.createElement('div');
  elNavReadout.className = 'sf-nav-readout';
  elNavReadout.style.display = 'none';
  elNavReadout.innerHTML =
    '<div class="sf-nav-label mono">—</div>' +
    '<div class="sf-nav-meta"><span class="sf-nav-dist">0 u</span> · ETA <span class="sf-nav-eta">—</span></div>';
  root.appendChild(elNavReadout);
  const elNavLabel = elNavReadout.querySelector('.sf-nav-label');
  const elNavDist = elNavReadout.querySelector('.sf-nav-dist');
  const elNavEta = elNavReadout.querySelector('.sf-nav-eta');

  const elFuel = document.createElement('div');
  elFuel.className = 'sf-fuel';
  elFuel.innerHTML =
    '<span class="sf-fuel-label mono">FUEL</span>' +
    '<div class="sf-bar sf-bar--fuel"><div class="sf-bar__fill"></div></div>' +
    '<span class="sf-fuel-num mono">0%</span>';
  root.appendChild(elFuel);
  const elFuelFill = elFuel.querySelector('.sf-bar__fill');
  const elFuelNum = elFuel.querySelector('.sf-fuel-num');

  const arrow = document.createElement('div');
  arrow.className = 'sf-objarrow';
  arrow.style.display = 'none';
  root.appendChild(arrow);

  // ---- combat HUD: lock-on ring, weapon heat bars, target lock diamond ----

  // Lock-on progress ring (SVG arc near reticle). Shows when a homing weapon is acquiring a lock.
  const lockRing = document.createElement('div');
  lockRing.className = 'sf-lockring';
  const LOCK_R = 30, LOCK_C = Math.PI * 2 * LOCK_R;
  lockRing.innerHTML =
    `<svg viewBox="0 0 72 72" xmlns="http://www.w3.org/2000/svg">` +
    `<circle cx="36" cy="36" r="${LOCK_R}" class="sf-lockring__track"/>` +
    `<circle cx="36" cy="36" r="${LOCK_R}" class="sf-lockring__fill" ` +
    `stroke-dasharray="${LOCK_C}" stroke-dashoffset="${LOCK_C}" ` +
    `transform="rotate(-90 36 36)"/>` +
    `</svg><div class="sf-lockring__label"></div>`;
  root.appendChild(lockRing);
  const lockFill = lockRing.querySelector('.sf-lockring__fill');
  const lockLabel = lockRing.querySelector('.sf-lockring__label');

  // Per-weapon heat bars. Built once per ship load, updated per frame.
  const wpnHeatsWrap = document.createElement('div');
  wpnHeatsWrap.className = 'sf-wpn-heats';
  wpnHeatsWrap.style.display = 'none';
  root.appendChild(wpnHeatsWrap);
  let wpnHeatEls = []; // [{fill, row, lastHeat}]
  let wpnHeatShipId = null;

  function rebuildWeaponHeatBars(weapons) {
    wpnHeatsWrap.innerHTML = '';
    wpnHeatEls = [];
    if (!weapons || !weapons.length) { wpnHeatsWrap.style.display = 'none'; return; }
    for (const w of weapons) {
      const name = (w.name || w.defId || '').replace(/^wpn_/, '').replace(/_/g, ' ').slice(0, 8);
      const row = document.createElement('div');
      row.className = 'sf-wpn-heat';
      row.innerHTML =
        `<span class="sf-wpn-heat__label">${name}</span>` +
        `<div class="sf-wpn-heat__bar"><div class="sf-wpn-heat__fill"></div></div>`;
      wpnHeatsWrap.appendChild(row);
      wpnHeatEls.push({ fill: row.querySelector('.sf-wpn-heat__fill'), row, lastHeat: -1 });
    }
    wpnHeatsWrap.style.display = 'flex';
  }

  // Target lock diamond — follows the locked target's screen position.
  const lockDiamond = document.createElement('div');
  lockDiamond.className = 'sf-lockdiamond';
  lockDiamond.innerHTML = '<div class="sf-lockdiamond__inner"></div>';
  root.appendChild(lockDiamond);

  // ---- death / respawn feedback banner ----
  injectDeathStyle();
  const deathBanner = document.createElement('div');
  deathBanner.className = 'sf-death';
  deathBanner.hidden = true;
  deathBanner.setAttribute('aria-hidden', 'true');
  deathBanner.setAttribute('role', 'alert');
  deathBanner.innerHTML = '<div class="sf-death__big">SHIP DESTROYED</div><div class="sf-death__sub">Emergency recovery online…</div>';
  root.appendChild(deathBanner);
  let deathHideTimer = 0;
  ctx.bus.on('player:death', () => {
    clearTimeout(deathHideTimer);
    deathBanner.hidden = false;
    deathBanner.removeAttribute('aria-hidden');
    deathBanner.classList.remove('show'); void deathBanner.offsetWidth; // restart animation
    deathBanner.classList.add('show');
    document.body.classList.add('sf-deathflash');
    setTimeout(() => document.body.classList.remove('sf-deathflash'), 700);
    deathHideTimer = setTimeout(() => {
      deathBanner.classList.remove('show');
      deathBanner.hidden = true;
      deathBanner.setAttribute('aria-hidden', 'true');
    }, 2500);
  });
  ctx.bus.on('player:respawn', () => {
    ctx.bus.emit('toast', { text: 'Hull rebuilt — fly safe, pilot. (3s shields online)', kind: 'good', ttl: 4 });
  });

  // ---- HUD meta-arc: the three phases of complicity (STABLE LOAD, tag flicker, manifest ghost) ----
  // Mounted as a HUD sub-component (like the death banner). Driven by hud:phase / hud:tagFlicker
  // events the story system emits. Inject its CSS once, then create + tick it.
  if (!document.getElementById('sf-hudmeta-style')) {
    const ms = document.createElement('style');
    ms.id = 'sf-hudmeta-style';
    ms.textContent = HUD_META_CSS;
    document.head.appendChild(ms);
  }
  const hudMeta = createHudMeta(ctx);

  // ---- cargo panel overlay (toggled by I key or clicking CARGO stat) ----
  const cargoPanel = document.createElement('div');
  cargoPanel.className = 'sf-cargo-panel';
  cargoPanel.innerHTML =
    '<div class="sf-cargo-panel__head">' +
      '<span class="sf-cargo-panel__title">CARGO HOLD</span>' +
      '<button class="sf-cargo-panel__close">ESC</button>' +
    '</div>' +
    '<div class="sf-cargo-panel__summary">' +
      '<span class="sf-cargo-summary-used">0 / 40 u</span>' +
      '<span class="sf-cargo-summary-mass">0 t</span>' +
      '<span class="sf-cargo-summary-val">~0 CR</span>' +
    '</div>' +
    '<div class="sf-cargo-panel__list"></div>';
  root.appendChild(cargoPanel);

  let cargoPanelOpen = false;
  const cargoListEl = cargoPanel.querySelector('.sf-cargo-panel__list');
  const cargoSummaryUsed = cargoPanel.querySelector('.sf-cargo-summary-used');
  const cargoSummaryMass = cargoPanel.querySelector('.sf-cargo-summary-mass');
  const cargoSummaryVal = cargoPanel.querySelector('.sf-cargo-summary-val');

  const CMDTY_MAP = new Map();

  function buildCmdtyMap() {
    if (CMDTY_MAP.size > 0) return;
    for (const c of COMMODITIES) CMDTY_MAP.set(c.id, c);
  }

  function refreshCargoPanel() {
    if (!cargoPanelOpen) return;
    buildCmdtyMap();
    const c = state.player.cargo || {};
    const items = c.items || {};
    const used = Math.round(c.usedVolume || 0);
    const cap = Math.round(c.capVolume || 40);
    const mass = (c.usedMass || 0).toFixed(1);

    cargoSummaryUsed.textContent = `${used} / ${cap} u`;
    cargoSummaryMass.textContent = `${mass} t`;

    const keys = Object.keys(items).filter(id => items[id] > 0);
    cargoListEl.innerHTML = '';

    if (!keys.length) {
      cargoListEl.innerHTML = '<div class="sf-cargo-empty">Cargo hold is empty</div>';
      cargoSummaryVal.textContent = '~0 CR';
      return;
    }

    let totalVal = 0;
    const frag = document.createDocumentFragment();

    // Header row
    const header = document.createElement('div');
    header.className = 'sf-cargo-row';
    header.style.color = 'var(--ink-mute)';
    header.style.fontSize = '9px';
    header.style.letterSpacing = '.1em';
    header.innerHTML = '<span>ITEM</span><span style="text-align:right">QTY</span><span style="text-align:right">VOL</span><span style="text-align:right">~VALUE</span><span></span>';
    frag.appendChild(header);

    for (const id of keys) {
      const qty = items[id];
      const def = CMDTY_MAP.get(id);
      const name = def ? def.name : id.replace('cmdty_', '').replace(/_/g, ' ');
      const volPerU = def ? (def.volPerU || 1) : 1;
      const price = def ? (def.basePrice || 0) : 0;
      const vol = Math.round(qty * volPerU);
      const val = qty * price;
      totalVal += val;

      const row = document.createElement('div');
      row.className = 'sf-cargo-row';
      row.innerHTML =
        `<span class="sf-cargo-row__name" title="${name}">${name}</span>` +
        `<span class="sf-cargo-row__qty">${qty}</span>` +
        `<span class="sf-cargo-row__vol">${vol}u</span>` +
        `<span class="sf-cargo-row__val">${val > 0 ? val.toLocaleString() : '—'}</span>` +
        `<button class="sf-cargo-row__jet" data-id="${id}" title="Jettison 1 unit">JET</button>`;
      frag.appendChild(row);
    }

    cargoListEl.appendChild(frag);
    cargoSummaryVal.textContent = `~${totalVal.toLocaleString()} CR`;
  }

  // Jettison click handler (event delegation)
  cargoListEl.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.sf-cargo-row__jet');
    if (!btn) return;
    const id = btn.dataset.id;
    if (!id) return;
    ctx.bus.emit('cargo:jettison', { commodityId: id, qty: 1 });
  });

  // Listen for the jettison event in case the cargo system doesn't handle it natively
  ctx.bus.on('cargo:jettison', ({ commodityId, qty }) => {
    const cargoSys = ctx.registry && ctx.registry.get('cargo');
    if (cargoSys && cargoSys.jettison) {
      const dumped = cargoSys.jettison(commodityId, qty || 1);
      if (dumped > 0) {
        ctx.bus.emit('toast', { text: `Jettisoned ${dumped}x ${commodityId.replace('cmdty_', '').replace(/_/g, ' ')}`, kind: 'warn', ttl: 2 });
      }
    }
  });

  // Toggle function
  function toggleCargoPanel() {
    cargoPanelOpen = !cargoPanelOpen;
    cargoPanel.classList.toggle('open', cargoPanelOpen);
    if (cargoPanelOpen) refreshCargoPanel();
    ctx.bus.emit('audio:cue', { id: cargoPanelOpen ? 'ui_open' : 'ui_back' });
  }

  function closeCargoPanel() {
    if (!cargoPanelOpen) return;
    cargoPanelOpen = false;
    cargoPanel.classList.remove('open');
    ctx.bus.emit('audio:cue', { id: 'ui_back' });
  }

  // Close button
  cargoPanel.querySelector('.sf-cargo-panel__close').addEventListener('click', closeCargoPanel);

  // Refresh when cargo changes
  ctx.bus.on('cargo:changed', () => { if (cargoPanelOpen) refreshCargoPanel(); });

  // Expose toggle/close for the input system
  ctx.bus.on('ui:toggleCargo', toggleCargoPanel);
  ctx.bus.on('ui:closeCargo', closeCargoPanel);

  // Make the CARGO stat tile clickable to open the panel
  const cargoStat = center.querySelector('[data-k=cargo]');
  if (cargoStat) {
    const statTile = cargoStat.closest('.sf-stat');
    if (statTile) {
      statTile.style.cursor = 'pointer';
      statTile.addEventListener('click', (ev) => {
        ev.stopPropagation();
        toggleCargoPanel();
      });
    }
  }

  // Close on ESC when panel is open (handled via keydown on the panel)
  cargoPanel.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') { ev.stopPropagation(); closeCargoPanel(); }
  });

  // ---------------------------------------------------------------------------
  // Event-driven (rebuild) path — credits / cargo / objectives marked dirty.
  // ---------------------------------------------------------------------------
  let creditsDirty = true, cargoDirty = true, objDirty = true;
  ctx.bus.on('credits:changed', () => { creditsDirty = true; });
  ctx.bus.on('cargo:changed', () => { cargoDirty = true; });
  ctx.bus.on('ship:statsChanged', () => { cargoDirty = true; });
  ctx.bus.on('mission:updated', () => { objDirty = true; });
  ctx.bus.on('mission:accepted', () => { objDirty = true; });
  ctx.bus.on('mission:completed', () => { objDirty = true; });
  ctx.bus.on('mission:abandoned', () => { objDirty = true; });

  // WANTED indicator (V2 §20b / cut-list #15): a persistent red alert when the player's heat is
  // above the lawful-engagement threshold. Event-driven from the heat system's heat:changed.
  let wantedActive = false;
  if (alerts) {
    ctx.bus.on('heat:changed', (p) => {
      const v = p && typeof p.value === 'number' ? p.value : (state.player && state.player.heat) || 0;
      const wanted = v >= 0.15;
      const tier = v >= 0.6 ? 'HIGH' : v >= 0.35 ? 'MODERATE' : 'LOW';
      if (wanted && !wantedActive) {
        alerts.raise({ key: 'wanted', sev: 'danger', text: 'WANTED · LAW ENFORCEMENT ACTIVE', ttl: Infinity });
        wantedActive = true;
      } else if (wanted && wantedActive) {
        // refresh the text to show the new tier (raise dedups by key but updates text/sev)
        alerts.raise({ key: 'wanted', sev: 'danger', text: 'WANTED (' + tier + ') · HUNTERS INBOUND', ttl: Infinity });
      } else if (!wanted && wantedActive) {
        alerts.clear('wanted');
        wantedActive = false;
      }
    });
  }

  function refreshCredits() {
    creditsDirty = false;
    setText(elCredits, Math.round(state.player.credits || 0).toLocaleString());
  }
  function refreshCargo() {
    cargoDirty = false;
    const c = state.player.cargo || {};
    const used = Math.round(c.usedVolume || 0);
    const cap = Math.round(c.capVolume || 40);
    setText(elCargo, `${used} / ${cap} u`);
    elCargo.classList.toggle('sf-warn', cap > 0 && used >= cap);
  }
  function refreshObjectives() {
    objDirty = false;
    const active = (state.missions && state.missions.active) || [];
    objWrap.innerHTML = '';
    if (!active.length) return;
    const frag = document.createDocumentFragment();
    for (const m of active.slice(0, 4)) {
      const line = document.createElement('div');
      line.className = 'sf-obj';
      const title = (m.title || m.name || m.type || 'Mission');
      let prog = '';
      const objs = m.objectives || [];
      if (objs.length) {
        const o = objs.find((x) => !x.done) || objs[0];
        const cur = o.progress != null ? o.progress : (o.current != null ? o.current : 0);
        const need = o.target != null ? o.target : (o.required != null ? o.required : (o.count != null ? o.count : 0));
        prog = need ? ` ${cur}/${need}` : '';
        line.dataset.label = o.label || o.text || '';
      }
      line.innerHTML = `<span class="sf-obj__dot"></span><span class="sf-obj__t">${title}${prog}</span>`;
      frag.appendChild(line);
    }
    objWrap.appendChild(frag);
  }

  // ---------------------------------------------------------------------------
  // Combat HUD update — lock ring + weapon heat bars + target lock diamond
  // ---------------------------------------------------------------------------
  function updateCombatHud(p, slow) {
    if (!p) {
      lockRing.classList.remove('active', 'locked');
      lockDiamond.classList.remove('visible');
      wpnHeatsWrap.style.display = 'none';
      return;
    }

    const combat = p.data && p.data.combat;
    const weapons = p.data && p.data.weapons;
    const hasWeapons = weapons && weapons.length > 0;

    // ---- Lock-on progress ring ----
    // Show when the player has a lock-requiring weapon and is building/holding a lock.
    const lockProgress = combat ? (combat.lockProgress || 0) : 0;
    const isLocking = lockProgress > 0 && lockProgress < 1;
    const isLocked = lockProgress >= 1;
    if (isLocking || isLocked) {
      lockRing.classList.add('active');
      lockRing.classList.toggle('locked', isLocked);
      const offset = LOCK_C * (1 - lockProgress);
      lockFill.setAttribute('stroke-dashoffset', String(offset));
      lockLabel.textContent = isLocked ? 'LOCKED' : Math.round(lockProgress * 100) + '%';
    } else {
      lockRing.classList.remove('active', 'locked');
    }

    // ---- Per-weapon heat bars ----
    // Rebuild the weapon heat bar DOM when the ship or weapon loadout changes.
    if (hasWeapons) {
      const shipEntityId = p.id;
      if (wpnHeatShipId !== shipEntityId || wpnHeatEls.length !== weapons.length) {
        wpnHeatShipId = shipEntityId;
        rebuildWeaponHeatBars(weapons);
      }
      // Update fills every frame (cheap transforms only).
      for (let i = 0; i < weapons.length; i++) {
        const w = weapons[i];
        const el = wpnHeatEls[i];
        if (!el) continue;
        const hMax = w.heatMax != null ? w.heatMax : 100;
        const hCur = w._heat || 0;
        const frac = hMax > 0 ? clamp01(hCur / hMax) : 0;
        el.fill.style.transform = `scaleX(${frac})`;
        const overheated = hCur >= hMax && hMax > 0;
        el.row.classList.toggle('overheated', overheated);
      }
      // Position above the status bars panel (recalc on slow ticks to track layout changes).
      if (slow) {
        const barsRect = bars.getBoundingClientRect();
        wpnHeatsWrap.style.bottom = (window.innerHeight - barsRect.top + 6) + 'px';
      }
      wpnHeatsWrap.style.display = 'flex';
    } else {
      wpnHeatsWrap.style.display = 'none';
    }

    // ---- Target lock diamond (world-space overlay on locked/selected target) ----
    const tid = state.player.targetId;
    const tgt = tid != null ? state.entities.get(tid) : null;
    if (tgt && tgt.alive && helpers.worldToScreen) {
      const proj = helpers.worldToScreen({ x: tgt.pos.x, y: 0, z: tgt.pos.z });
      if (proj.onScreen) {
        lockDiamond.classList.add('visible');
        lockDiamond.style.left = proj.x + 'px';
        lockDiamond.style.top = proj.y + 'px';
        // Tint: red when missile-locked, cyan when just selected/tracking.
        const tgtLocked = isLocked && combat && combat.lockTarget === tid;
        lockDiamond.classList.toggle('locked-tgt', tgtLocked);
      } else {
        lockDiamond.classList.remove('visible');
      }
    } else {
      lockDiamond.classList.remove('visible');
    }
  }

  // ---------------------------------------------------------------------------
  // 60Hz cheap path
  // ---------------------------------------------------------------------------
  let tickN = 0;
  let lowShieldActive = false, lowHullActive = false;
  let lastDefId = null;
  let elReticle = null;
  let cachedNavStationId = null;
  let cachedNavEntity = null;
  let cachedNavListLength = -1;
  let lastNavLabel = '';
  let lastNavDist = '';
  let lastNavEta = '';

  function syncSafetyAlerts(p, hullFrac, shieldFrac) {
    if (!alerts || !p) return;
    if (hullFrac == null) hullFrac = p.hullMax ? clamp01(p.hull / p.hullMax) : 0;
    if (shieldFrac == null) shieldFrac = p.shieldMax ? clamp01(p.shield / p.shieldMax) : 0;
    const lowShield = shieldFrac > 0 && shieldFrac < 0.2;
    if (lowShield && !lowShieldActive) alerts.raise({ key: 'low-shield', sev: 'warn', text: 'SHIELDS LOW', ttl: Infinity });
    if (!lowShield && lowShieldActive) alerts.clear('low-shield');
    lowShieldActive = lowShield;
    const lowHull = hullFrac > 0 && hullFrac < 0.25;
    if (lowHull && !lowHullActive) alerts.raise({ key: 'low-hull', sev: 'danger', text: 'HULL CRITICAL', ttl: Infinity });
    if (!lowHull && lowHullActive) alerts.clear('low-hull');
    lowHullActive = lowHull;
  }

  function frame(dt) {
    tickN++;
    const slow = (tickN % 6) === 0;   // 10Hz numerics
    const radarTick = (tickN % 3) === 0; // 20Hz radar

    const p = state.entities.get(state.playerId);

    // --- bars (every frame, transform only) ---
    if (p) {
      const hullFrac = p.hullMax ? clamp01(p.hull / p.hullMax) : 0;
      const shieldFrac = p.shieldMax ? clamp01(p.shield / p.shieldMax) : 0;
      const capFrac = p.capMax ? clamp01(p.cap / p.capMax) : 0;
      // Mining beam heat is the primary heat source; fall back to entity.data.heat only if beam has none.
      const beamHeat = (state.player.miningBeam && state.player.miningBeam.heat != null) ? state.player.miningBeam.heat : 0;
      const heat = beamHeat > 0 ? beamHeat : ((p.data && p.data.heat != null) ? p.data.heat : 0);
      const heatMax = (p.data && p.data.heatMax) || 100;
      const heatFrac = clamp01(heat / heatMax);

      fillEls.hull.style.transform = `scaleX(${hullFrac})`;
      fillEls.shield.style.transform = `scaleX(${shieldFrac})`;
      fillEls.energy.style.transform = `scaleX(${capFrac})`;
      fillEls.heat.style.transform = `scaleX(${heatFrac})`;

      // Phase 3 boost bar: energy fraction; the row is hidden entirely if the ship can't boost.
      // When a dash is ready (cooldown elapsed + enough energy) the bar gets a 'ready' glow.
      const boost = p.boost;
      const boostRow = rowEls.boost;
      if (boost && boost.max > 0 && boostRow) {
        boostRow.style.display = '';
        const bf = clamp01(boost.energy / boost.max);
        fillEls.boost.style.transform = `scaleX(${bf})`;
        const dashReady = boost.dashImpulse > 0 && boost.dashCdT <= 0 && boost.energy >= boost.dashImpulse * 0.6;
        fillEls.boost.parentElement.classList.toggle('sf-bar--ready', dashReady);
        if (slow) setText(numEls.boost, Math.round(bf * 100) + (dashReady ? ' ▸' : '%'));
      } else if (boostRow) {
        boostRow.style.display = 'none';   // no boost capacity (e.g. a stripped hull) — hide the row
      }

      fillEls.hull.parentElement.classList.toggle('sf-bar--low', hullFrac < 0.25);
      fillEls.shield.parentElement.classList.toggle('sf-bar--low', shieldFrac < 0.25 && shieldFrac > 0);

      // contextual low alerts via alerts module
      syncSafetyAlerts(p, hullFrac, shieldFrac);

      if (slow) {
        setText(numEls.hull, Math.max(0, Math.round(p.hull)) + '');
        setText(numEls.shield, Math.max(0, Math.round(p.shield)) + '');
        setText(numEls.energy, Math.max(0, Math.round(p.cap)) + '');
        setText(numEls.heat, Math.round(heatFrac * 100) + '%');
        // Phase 4 fuel gauge: low fuel flashes a warning.
        const fuel = state.fuel || { current: 100, max: 100 };
        const fuelFrac = fuel.max > 0 ? clamp01(fuel.current / fuel.max) : 1;
        elFuelFill.style.transform = `scaleX(${fuelFrac})`;
        setText(elFuelNum, Math.round(fuelFrac * 100) + '%');
        elFuel.classList.toggle('sf-fuel--low', fuelFrac < 0.25);
      }
    }

    // --- speed / throttle (numerics @10Hz) ---
    if (slow && p) {
      const sp = Math.hypot(p.vel.x, p.vel.z);
      setText(elSpeed, Math.round(sp) + '');
      const maxSp = p.maxSpeed || 1;
      setText(elThrottle, Math.round(clamp01(sp / maxSp) * 100) + '%');
      // Weapon status: count of guns + auto-fire state. Shows the strategic loadout at a glance
      // and whether the guns will auto-engage aggressive enemies while you fly.
      const ws = p.data && p.data.weapons;
      const nGuns = ws ? ws.length : 0;
      const auto = !!(state.input && state.input.autoFire);
      setText(elWeapons, nGuns + ' gun' + (nGuns === 1 ? '' : 's') + (auto ? ' · AUTO' : ''));
      elWeapons.classList.toggle('sf-warn', auto);
      // Reticle reflects fire mode: amber ring when auto-fire is engaged (guns auto-target hostiles),
      // cyan when you're aiming/firing manually. Purely a visual cue.
      if (!elReticle) elReticle = document.getElementById('aim-reticle');
      if (elReticle) elReticle.classList.toggle('autofire', auto);
      // Class/archetype label: surfaces the ship's role so the player feels the archetype switch
      // when they buy a new hull (Phase 3). Updates cheaply each slow tick.
      const defId = p.data && p.data.defId;
      if (defId !== lastDefId) {
        lastDefId = defId;
        const def = SHIP_BY_ID.get(defId);
        setText(elRole, def ? (def.name + ' · ' + (ROLE_LABEL[def.role] || def.role || 'Ship')) : '—');
      }
    }

    // --- mission tracker @10Hz ---
    if (slow) {
      const trackedId = state.ui && state.ui.trackedMissionId;
      const active = (state.missions && state.missions.active) || [];
      const tracked = trackedId ? active.find((m) => m.id === trackedId && m.status === 'active') : null;
      if (tracked) {
        const remaining = Math.max(0, (tracked.deadline_s || 0) - (state.simTime || 0));
        setText(mtTitle, tracked.title || 'Mission');
        setText(mtObj, mtObjectiveText(tracked));
        setText(mtTime, mtFmtTime(remaining));
        mtTime.classList.toggle('sf-mt-urgent', remaining < 120);
        setDisplay(missionTracker, true);
      } else {
        setDisplay(missionTracker, false);
      }
    }

    // --- credits / cargo / objectives (event-driven, applied lazily) ---
    if (creditsDirty) refreshCredits();
    if (cargoDirty) refreshCargo();
    if (objDirty) refreshObjectives();

    // --- target panel (every frame, cheap) ---
    targetPanel.update();

    // --- combat HUD: lock ring, weapon heat bars, target diamond (every frame) ---
    updateCombatHud(p, slow);

    // --- floating combat text ---
    floatingText.update(dt || 0.016);

    // --- radar @20Hz ---
    if (radarTick) radar.draw();

    // directional damage indicators advance + reposition every frame (they track camera roll)
    dmgInd.tick(dt, helpers);

    // --- off-screen objective arrow ---
    updateObjectiveArrow(p, slow);

    // --- toasts/alerts expiry sweep ---
    if (alerts && alerts.tick) alerts.tick();
    // --- HUD meta-arc (STABLE LOAD line, tag flicker, manifest ghost) ---
    if (hudMeta && hudMeta.tick) hudMeta.tick(dt || 0.016);
  }

  function tickHidden(dt) {
    const p = state.entities.get(state.playerId);
    syncSafetyAlerts(p);
    if (alerts && alerts.tick) alerts.tick();
  }

  function resolveNavStation(nw) {
    if (!nw || !nw.stationId) return null;
    if (
      cachedNavStationId === nw.stationId &&
      cachedNavListLength === state.entityList.length &&
      cachedNavEntity &&
      cachedNavEntity.alive &&
      cachedNavEntity.type === 'station'
    ) {
      return cachedNavEntity;
    }
    cachedNavStationId = nw.stationId;
    cachedNavListLength = state.entityList.length;
    cachedNavEntity = null;
    for (const e of state.entityList) {
      if (e.type === 'station' && e.data && e.data.stationId === nw.stationId) {
        cachedNavEntity = e;
        break;
      }
    }
    return cachedNavEntity;
  }

  function updateObjectiveArrow(p, slow) {
    // Priority: a tracked mission waypoint, else a player-set trade nav waypoint (Phase 4).
    const tracked = state.ui.trackedMissionId;
    const active = (state.missions && state.missions.active) || [];
    const m = tracked ? active.find((x) => x.id === tracked) : active[0];
    let wp = null, wpLabel = null;
    if (m) wp = m.waypoint || m.targetPos || (m.objectives && m.objectives[0] && m.objectives[0].pos) || null;
    if (!wp && state.nav && state.nav.waypoint) {
      // nav waypoint is a station; re-resolve its live world position each frame so it tracks
      // moving entities, and clear it if the station is no longer in this sector (e.g. after a jump).
      const nw = state.nav.waypoint;
      let livePos = null;
      if (nw.stationId) {
        const station = resolveNavStation(nw);
        if (station) livePos = station.pos;
        if (!livePos) { state.nav.waypoint = null; }   // station gone (jumped away) — drop the stale arrow
      }
      const pos = livePos || nw.pos;
      if (pos) { wp = pos; wpLabel = nw.label; }
    }
    if (!wp || !p || !helpers.worldToScreen) {
      setDisplay(arrow, false);
      setDisplay(elNavReadout, false);
      lastNavLabel = '';
      return;
    }
    const proj = helpers.worldToScreen({ x: wp.x, y: 0, z: wp.z });
    // distance + ETA readout (always shown while a nav target is set)
    const dist = Math.hypot(wp.x - p.pos.x, wp.z - p.pos.z);
    const speed = Math.hypot(p.vel.x, p.vel.z);
    const etaS = speed > 5 ? dist / speed : Infinity;
    setDisplay(elNavReadout, true);
    const label = wpLabel || '—';
    if (label !== lastNavLabel) { setText(elNavLabel, label); lastNavLabel = label; }
    if (slow || !lastNavDist) {
      const distText = Math.round(dist) + ' u';
      const etaText = isFinite(etaS) ? (etaS < 60 ? Math.round(etaS) + 's' : Math.round(etaS / 60) + 'm') : '—';
      if (distText !== lastNavDist) { setText(elNavDist, distText); lastNavDist = distText; }
      if (etaText !== lastNavEta) { setText(elNavEta, etaText); lastNavEta = etaText; }
    }
    if (proj.onScreen) { setDisplay(arrow, false); return; }
    // clamp to a screen-edge ellipse around center, pointing toward target
    const w = window.innerWidth, h = window.innerHeight;
    let dx = proj.x - w / 2, dy = proj.y - h / 2;
    // worldToScreen returns mirrored coords for behind-camera points; normalize direction
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    const mx = w * 0.42, my = h * 0.42;
    const ex = w / 2 + dx * mx, ey = h / 2 + dy * my;
    setDisplay(arrow, true);
    arrow.style.transform = `translate3d(${ex}px,${ey}px,0) translate(-50%,-50%) rotate(${Math.atan2(dy, dx)}rad)`;
  }

  function setVisible(v) {
    root.style.display = v ? 'block' : 'none';
    if (hudMeta && hudMeta.setVisible) hudMeta.setVisible(v);
  }

  function forceRefresh() {
    creditsDirty = true;
    cargoDirty = true;
    objDirty = true;
    tickN = 5;
    lastDefId = null;
    lastNavDist = '';
    lastNavEta = '';
    if (radar.invalidate) radar.invalidate();
    if (targetPanel.forceRefresh) targetPanel.forceRefresh();
  }

  return { frame, tickHidden, forceRefresh, setVisible, refreshCredits, refreshCargo, refreshObjectives };
}
