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
//   - frame path: cheap local transforms/classes only.
//   - numerics via textContent @10Hz.
//   - compositor-heavy overlays use explicit time cadences instead of implicit per-frame work.
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
import { STORY_BEATS } from '../data/missions.js';
import { estimateBrakingSolution } from '../core/flight/flightTelemetry.js';
import { resolvePropulsionProfile } from '../core/flight/propulsionCatalog.js';
import { BINDINGS } from './bindings.js';

// Ship role → friendly archetype label (Phase 3 HUD class indicator).
const SHIP_BY_ID = new Map(SHIPS.map((s) => [s.id, s]));
const ROLE_LABEL = {
  starter: 'Starter', mining: 'Miner', fighter: 'Fighter', freighter: 'Freighter',
  multirole: 'Multirole', interceptor: 'Interceptor', mining_barge: 'Mining Barge',
  corvette: 'Corvette', heavy_hauler: 'Heavy Hauler', explorer: 'Explorer',
  gunship: 'Gunship', battlecruiser: 'Battlecruiser', flagship: 'Flagship',
};
// Drive-family short label for the CLASS readout. Resolved from the hull's driveId so the player
// feels the propulsion family (spec §6) without opening a stat screen.
const DRIVE_FAMILY_LABEL = {
  reaction: 'Reaction', gravimetric: 'Gravimetric', pulse_plate: 'Pulse Plate',
  torch: 'Torch', field_sail: 'Field Sail',
};
function driveFamilyFor(def) {
  const driveId = def && def.driveId;
  if (!driveId) return '';
  if (driveId.startsWith('drive_gravimetric')) return DRIVE_FAMILY_LABEL.gravimetric;
  if (driveId.startsWith('drive_pulse_plate')) return DRIVE_FAMILY_LABEL.pulse_plate;
  if (driveId.startsWith('drive_torch')) return DRIVE_FAMILY_LABEL.torch;
  if (driveId.startsWith('drive_field_sail')) return DRIVE_FAMILY_LABEL.field_sail;
  if (driveId.startsWith('drive_reaction')) return DRIVE_FAMILY_LABEL.reaction;
  return '';
}

// ── Mission tracker helpers ──────────────────────────────────────────────────────────────────
const MT_STATION_BY_ID = new Map();
const MT_SECTOR_BY_ID = new Map(SECTORS.map((s) => [s.id, s.name]));
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

function mtSectorName(id) {
  return MT_SECTOR_BY_ID.get(id) || id || 'target sector';
}

function respawnStationName(id) {
  return MT_STATION_BY_ID.get(id) || String(id || 'safe station').replace(/^station_/, '').replace(/_/g, ' ');
}

export function respawnToastText(payload = {}) {
  const parts = ['Recovered at ' + respawnStationName(payload.stationId)];
  const refund = Math.max(0, Math.round(Number(payload.refundCr) || 0));
  if (refund > 0) parts.push('insurance +' + refund.toLocaleString('en-US') + ' cr');
  const cargoLostQty = Math.max(0, Math.round(Number(payload.cargoLostQty) || 0));
  if (cargoLostQty > 0) parts.push('cargo lost ' + cargoLostQty + 'u');
  else if (payload.cargoLost) parts.push('cargo lost');
  parts.push('3s shields online');
  return parts.join(' - ');
}

function mtRouteGuidance(state, waypoint) {
  if (!state || !waypoint || !waypoint.sectorId) return null;
  const currentSectorId = state.world && state.world.currentSectorId;
  if (!currentSectorId || currentSectorId === waypoint.sectorId) return null;
  const route = state.nav && state.nav.route;
  const legs = route && Array.isArray(route.legs) ? route.legs : [];
  const first = legs[0];
  const last = legs[legs.length - 1];
  if (first && last && first.from === currentSectorId && last.to === waypoint.sectorId) {
    const hops = route.totalHops || legs.length;
    const fuel = Math.round(route.totalFuel || legs.reduce((sum, leg) => sum + (leg.fuel || 0), 0));
    return {
      next: `Next jump: ${mtSectorName(first.to)}`,
      summary: `${hops} hop${hops === 1 ? '' : 's'} / ${fuel}F`,
    };
  }
  return {
    next: `Plot route to ${mtSectorName(waypoint.sectorId)}`,
    summary: `${BINDINGS.starmap.label} Star Map`,
  };
}

export function resolveHudNavStation(state, stationId) {
  if (!state || !stationId) return null;
  const index = state.entityIndex;
  if (index && index.__spacefaceEntityIndexV1) {
    const byStationId = index.byStationId;
    const indexed = byStationId && byStationId.get(stationId);
    if (indexed && indexed.alive !== false && indexed.type === 'station') return indexed;
    const buckets = [index.stations, index.dockStations];
    for (const stations of buckets) {
      if (!stations || !stations.length) continue;
      for (const e of stations) {
        if (e && e.alive !== false && e.type === 'station' && e.data && e.data.stationId === stationId) return e;
      }
    }
    return null;
  }
  for (const e of state.entityList || []) {
    if (e && e.type === 'station' && e.alive !== false && e.data && e.data.stationId === stationId) return e;
  }
  return null;
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

function mtStoryTitle(beat) {
  if (!beat) return 'Story Objective';
  const id = String(beat.id || `Beat ${beat.beat}`);
  return id.replace(/^b\d+_?/i, '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function setText(el, text) { if (el && el.textContent !== text) el.textContent = text; }
function setScaleX(el, value) {
  if (!el) return;
  const next = Math.round(clamp01(value) * 1000) / 1000;
  if (el._sfScaleX === next) return;
  el._sfScaleX = next;
  el.style.transform = `scaleX(${next})`;
}
function setStyle(el, prop, value) {
  if (el && el.style[prop] !== value) el.style[prop] = value;
}
function setClass(el, cls, active) {
  if (el && el.classList.contains(cls) !== !!active) el.classList.toggle(cls, !!active);
}
function setDisplay(el, visible, mode = 'block') {
  if (!el) return;
  const next = visible ? mode : 'none';
  if (el.style.display !== next) el.style.display = next;
}

function createHudClock(hz, startReady = true) {
  return { step: 1 / Math.max(1, hz || 1), elapsed: startReady ? Infinity : 0, lastDt: 1 / Math.max(1, hz || 1) };
}
function consumeHudClock(clock, dt) {
  clock.elapsed += dt;
  if (clock.elapsed < clock.step) return 0;
  const runDt = Number.isFinite(clock.elapsed) ? clock.elapsed : clock.step;
  clock.elapsed = 0;
  clock.lastDt = runDt;
  return runDt;
}
function forceHudClock(clock) {
  clock.elapsed = Infinity;
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

  // ---- bottom-left: ship schematic (hull + shield) + thin micro-bars (energy/heat/boost) ----
  // Tactical-Visor §3C: the clunky stacked bars become a top-down structural schematic. Hull is the
  // tint + centered numeric; shield is the glowing ring (stroke-dashoffset). Energy/heat/boost — which
  // the arcs/schematic don't cover — live on as thin 2px glowing micro-lines below it.
  const bars = document.createElement('div');
  bars.className = 'sf-bars';

  const schematic = document.createElement('div');
  schematic.className = 'sf-schematic';
  schematic.innerHTML =
    '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">' +
      '<circle class="sf-sch-shield" cx="50" cy="50" r="44" transform="rotate(-90 50 50)"/>' +
      '<path class="sf-sch-ship" d="M50 14 L68 62 L56 58 L57 80 L50 73 L43 80 L44 58 L32 62 Z"/>' +
    '</svg>' +
    '<div class="sf-sch-hull">0</div>';
  bars.appendChild(schematic);
  const schShield = schematic.querySelector('.sf-sch-shield');
  const schHull = schematic.querySelector('.sf-sch-hull');

  // Thin micro-bars. Hull + shield are now in the schematic, so only energy/boost/heat remain here.
  const barDefs = [
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
  // Shield ring: dasharray = full circumference, dashoffset grows as shields drop (erasing the ring).
  // Measured after mount so getTotalLength() reads the live geometry (the fallback equals 2πr anyway).
  const SHIELD_RING_LEN = (() => { try { return schShield.getTotalLength() || 2 * Math.PI * 44; } catch (e) { return 2 * Math.PI * 44; } })();
  schShield.style.strokeDasharray = String(SHIELD_RING_LEN);
  schShield.style.strokeDashoffset = '0';

  // (The center framing arcs were removed — a wide "visor projection" around the crosshair reads as a
  //  first-person cockpit/windshield motif, which is wrong for this third-person chase-cam game.
  //  Shield now lives on the schematic ring; energy on the ENGY micro-bar.)

  // ---- bottom-center: action bar (key → ability map) (§3B) ----
  const ACTION_ICONS = {
    'pulse-laser': '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>',
    'mass-sample': '<svg viewBox="0 0 24 24"><path d="M12 3l5 6-5 12-5-12z"/><path d="M7 9h10"/></svg>',
    'boost': '<svg viewBox="0 0 24 24"><path d="M5 19l7-13 7 13"/><path d="M5 13l7-7 7 7"/></svg>',
    'dock': '<svg viewBox="0 0 24 24"><path d="M12 3v13M7 11l5 5 5-5"/><path d="M5 20h14"/></svg>',
  };
  const ACTION_SLOTS = [
    ['LMB', 'pulse-laser'],
    ['RMB', 'mass-sample'],
    ['SHIFT', 'boost'],
    [BINDINGS.dock.label, 'dock'],
  ];
  const actionBar = document.createElement('div');
  actionBar.id = 'action-bar';
  const actionBoxes = {};
  for (const [bind, icon] of ACTION_SLOTS) {
    const slot = document.createElement('div');
    slot.className = 'action-slot';
    slot.innerHTML = `<span class="bind">${bind}</span><div class="icon-box ${icon}">${ACTION_ICONS[icon]}</div>`;
    actionBar.appendChild(slot);
    actionBoxes[icon] = slot.querySelector('.icon-box');
  }
  root.appendChild(actionBar);
  // Dock availability (physics emits dock:range as the player nears a station) → highlight the dock slot.
  let dockInRange = false;
  ctx.bus.on('dock:range', (p) => { dockInRange = !!(p && p.inRange); });

  // Hit-flash helper: briefly pulse the ship schematic when the player takes damage.
  // Re-triggering a CSS animation needs remove + reflow + re-add; we do it once per damage event.
  let _schFlashTimer = 0;
  function flashSchematic() {
    schematic.classList.remove('sf-sch-hit');
    void schematic.offsetWidth;   // force reflow so the animation restarts
    schematic.classList.add('sf-sch-hit');
    clearTimeout(_schFlashTimer);
    _schFlashTimer = setTimeout(() => schematic.classList.remove('sf-sch-hit'), 340);
  }
  ctx.bus.on('combat:damage', (p) => {
    if (!p || p.targetId !== state.playerId) return;
    flashSchematic();
  });

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
    <div class="sf-stat sf-stat--info"><span class="sf-stat__k">STOP</span><span class="sf-stat__v mono" data-k="stop">—</span><div class="sf-tip" data-tip="stop"></div></div>
    <div class="sf-stat sf-stat--wide sf-stat--info"><span class="sf-stat__k">CARGO</span><span class="sf-stat__v mono" data-k="cargo">0 / 40 u</span><div class="sf-tip" data-tip="cargo"></div></div>
    <div class="sf-stat sf-stat--wide sf-stat--info"><span class="sf-stat__k">CR</span><span class="sf-stat__v mono sf-credits" data-k="credits">0</span><div class="sf-tip" data-tip="credits"></div></div>
    <div class="sf-stat sf-stat--info" id="sf-wpnstat"><span class="sf-stat__k">WPN</span><span class="sf-stat__v mono" data-k="weapons">—</span><div class="sf-tip" data-tip="weapons"></div></div>
    <div class="sf-stat sf-stat--wide sf-stat--info" id="sf-rolestat"><span class="sf-stat__k">CLASS</span><span class="sf-stat__v mono" data-k="role">—</span><div class="sf-tip" data-tip="class"></div></div>`;
  root.appendChild(center);
  const elSpeed = center.querySelector('[data-k=speed]');
  const elThrottle = center.querySelector('[data-k=throttle]');
  const elStop = center.querySelector('[data-k=stop]');
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
    const drive = driveFamilyFor(SHIP_BY_ID.get(p.data && p.data.defId)) || 'Reaction';
    let lines = [
      `Speed: ${Math.round(sp)} / ${Math.round(maxSp)} wu/s (${pct}%)`,
      `Velocity X: ${p.vel.x.toFixed(1)}, Z: ${p.vel.z.toFixed(1)}`,
      `Drive: ${drive}`,
    ];
    // Braking solution (spec §15.3): turn physics from confusion into skill by showing the
    // projected stop point, fastest stop mode, and stop time/distance.
    if (sp > 0.5) {
      const brake = estimateBrakingSolution(p, resolvePropulsionProfile(p));
      lines.push(`Best stop: ${brake.bestMode.replace('-', ' ')}`);
      lines.push(`Direct: ${brake.directDistance.toFixed(0)} wu / ${brake.directTimeS.toFixed(1)} s`);
      lines.push(`Flip-and-burn: ${brake.flipBurnDistance.toFixed(0)} wu / ${brake.flipBurnTimeS.toFixed(1)} s`);
    }
    return lines.join('\n');
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
    const c = (state.player || {}).cargo || {};
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
    const player = state.player || {};
    const cr = Math.round(player.credits || 0);
    const st = player.stats || {};
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
  objWrap.style.display = 'none';
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
  let _wasLocked = false;   // rising-edge tracker for the lock-acquired audio cue

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
      const labelSpan = document.createElement('span');
      labelSpan.className = 'sf-wpn-heat__label';
      labelSpan.textContent = name;
      const bar = document.createElement('div');
      bar.className = 'sf-wpn-heat__bar';
      const fill = document.createElement('div');
      fill.className = 'sf-wpn-heat__fill';
      bar.appendChild(fill);
      row.appendChild(labelSpan);
      row.appendChild(bar);
      wpnHeatsWrap.appendChild(row);
      wpnHeatEls.push({ fill, row, lastHeat: -1 });
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
  ctx.bus.on('player:respawn', (payload) => {
    ctx.bus.emit('toast', {
      text: respawnToastText(payload || {}),
      kind: payload && payload.cargoLost ? 'warn' : 'good',
      ttl: 5,
    });
  });

  // ---- presentation captions (accessibility: subtitles for audio/gameplay cues) ----
  // presentationAdapters emits presentation:caption { text, assertive, shape, ... } for important
  // cues, but nothing subscribed — the events were emitted into the void. This mounts a visible
  // caption box (bottom-center, like subtitles) + an aria-live region so screen readers announce
  // the same text. The hook already carries text + an assertive flag for high-priority cues, so
  // wiring it closes the audio-caption accessibility gap for free.
  if (!document.getElementById('sf-caption-style')) {
    const cs = document.createElement('style');
    cs.id = 'sf-caption-style';
    cs.textContent = `
    .sf-caption { position:absolute; left:50%; bottom:14%; transform:translate(-50%, 8px);
      max-width:min(80vw, 640px); padding:9px 16px; border-radius:8px;
      background:rgba(6,10,20,.82); border:1px solid var(--panel-edge, rgba(120,160,200,.25));
      color:var(--ink, #d7e6ff); font-size:15px; line-height:1.35; text-align:center;
      pointer-events:none; opacity:0; transition:opacity .18s ease, transform .18s ease;
      backdrop-filter:blur(3px); text-shadow:0 1px 6px rgba(0,0,0,.7); z-index:40;
      letter-spacing:.01em; }
    .sf-caption.show { opacity:1; transform:translate(-50%, 0); }
    .sf-caption.assertive { border-color:var(--accent, #39d0ff); box-shadow:0 0 16px rgba(57,208,255,.35); }
    @media (prefers-reduced-motion: reduce) { .sf-caption { transition:opacity .18s ease; transform:translate(-50%,0); } }
    `;
    document.head.appendChild(cs);
  }
  const caption = document.createElement('div');
  caption.className = 'sf-caption';
  caption.hidden = true;
  caption.setAttribute('aria-hidden', 'true');
  root.appendChild(caption);
  // Two dedicated live regions so we never mutate aria-live on a single element.
  const livePolite = document.createElement('div');
  livePolite.className = 'sr-only';
  livePolite.setAttribute('aria-live', 'polite');
  livePolite.setAttribute('role', 'status');
  livePolite.setAttribute('aria-atomic', 'true');
  root.appendChild(livePolite);
  const liveAssertive = document.createElement('div');
  liveAssertive.className = 'sr-only';
  liveAssertive.setAttribute('aria-live', 'assertive');
  liveAssertive.setAttribute('role', 'alert');
  liveAssertive.setAttribute('aria-atomic', 'true');
  root.appendChild(liveAssertive);
  let captionHideTimer = 0;
  let captionFadeTimer = 0;
  ctx.bus.on('presentation:caption', (p) => {
    if (!p || !p.text) return;
    clearTimeout(captionHideTimer);
    clearTimeout(captionFadeTimer);
    caption.textContent = p.text;
    caption.hidden = false;
    caption.classList.toggle('assertive', !!p.assertive);
    caption.classList.remove('show'); void caption.offsetWidth; // restart fade-in
    caption.classList.add('show');
    // Route to the appropriate live region so screen readers get the right politeness without
    // mutating aria-live on a single element (which confuses some ATs).
    const live = p.assertive ? liveAssertive : livePolite;
    live.textContent = '';
    live.textContent = p.text;
    const ttl = p.assertive ? 3200 : 2400;
    captionHideTimer = setTimeout(() => {
      caption.classList.remove('show');
      captionFadeTimer = setTimeout(() => {
        caption.hidden = true;
      }, 220); // let the fade-out finish before hiding
    }, ttl);
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
      '<button class="sf-cargo-panel__close" type="button">ESC</button>' +
    '</div>' +
    '<div class="sf-cargo-panel__summary">' +
      '<span class="sf-cargo-summary-used">0 / 40 u</span>' +
      '<span class="sf-cargo-summary-mass">0 t</span>' +
      '<span class="sf-cargo-summary-val">~0 CR</span>' +
    '</div>' +
    '<div class="sf-cargo-panel__list"></div>';
  root.appendChild(cargoPanel);

  let cargoPanelOpen = false;
  if (state.ui) state.ui.cargoPanelOpen = false;
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
    const c = (state.player || {}).cargo || {};
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
      const nameSpan = document.createElement('span');
      nameSpan.className = 'sf-cargo-row__name';
      nameSpan.title = name;
      nameSpan.textContent = name;
      const qtySpan = document.createElement('span');
      qtySpan.className = 'sf-cargo-row__qty';
      qtySpan.textContent = String(qty);
      const volSpan = document.createElement('span');
      volSpan.className = 'sf-cargo-row__vol';
      volSpan.textContent = `${vol}u`;
      const valSpan = document.createElement('span');
      valSpan.className = 'sf-cargo-row__val';
      valSpan.textContent = val > 0 ? val.toLocaleString() : '—';
      const jetBtn = document.createElement('button');
      jetBtn.className = 'sf-cargo-row__jet';
      jetBtn.dataset.id = id;
      jetBtn.title = 'Jettison 1 unit';
      jetBtn.textContent = 'JET';
      row.append(nameSpan, qtySpan, volSpan, valSpan, jetBtn);
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
    if (state.ui) state.ui.cargoPanelOpen = cargoPanelOpen;
    cargoPanel.classList.toggle('open', cargoPanelOpen);
    if (cargoPanelOpen) refreshCargoPanel();
    ctx.bus.emit('audio:cue', { id: cargoPanelOpen ? 'ui_open' : 'ui_back' });
  }

  function closeCargoPanel() {
    if (!cargoPanelOpen) return;
    cargoPanelOpen = false;
    if (state.ui) state.ui.cargoPanelOpen = false;
    cargoPanel.classList.remove('open');
    ctx.bus.emit('audio:cue', { id: 'ui_back' });
  }

  // Close button
  const cargoCloseBtn = cargoPanel.querySelector('.sf-cargo-panel__close');
  cargoCloseBtn.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    closeCargoPanel();
  });

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

  // Close on ESC when panel focus is inside it; ui/input.js handles the global flight case.
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

  // Reticle accuracy bloom: the crosshair expands with sustained fire and contracts when cool — a
  // classic combat-readability cue. Driven by the player's own combat:fire events; _recoilBloom
  // spikes on each shot and decays each frame. Applied as a scale on the reticle's inner SVG (not
  // the reticle div, whose transform centers it — scaling the div would recenter awkwardly).
  let _recoilBloom = 0;   // 0 = rested (scale 1), up to ~1 (scale ~1.25) under sustained fire
  ctx.bus.on('combat:fire', (p) => {
    if (!p || p.ownerId !== state.playerId) return;
    _recoilBloom = Math.min(1, _recoilBloom + 0.35);
  });

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

  // Credit count-up tween. Instead of snapping the digits to the new value on a credits:changed
  // event, we ease the displayed number from the previously-shown value toward the target over
  // CRED_TWEEN seconds. This makes a bounty / sale land as a fast count-up rather than an instant
  // digit jump — the classic "numbers feel alive" polish. Retargets smoothly if credits change
  // again mid-tween (animates from whatever is currently displayed).
  let _credFrom = 0, _credTo = 0, _credT = 1;   // _credT in [0,1]; 1 = at rest at target
  const CRED_TWEEN = 0.4;                        // seconds
  function _credCurrent() {
    // value currently shown (eases _credFrom -> _credTo)
    if (_credT >= 1) return _credTo;
    const e = 1 - (1 - _credT) * (1 - _credT);   // ease-out quad
    return _credFrom + (_credTo - _credFrom) * e;
  }
  function refreshCredits() {
    const target = Math.round((state.player || {}).credits || 0);
    // Retarget from the value currently displayed (not the old target) so chained changes stay smooth
    _credFrom = _credCurrent();
    _credTo = target;
    _credT = 0;
    creditsDirty = false;
    setText(elCredits, Math.round(_credFrom).toLocaleString());
  }
  // Advance the tween on the 10Hz slow tick while a tween is in flight. When at rest this is a no-op.
  function tickCreditsTween(dt) {
    if (_credT >= 1) return;
    _credT = Math.min(1, _credT + (dt || 0.016) / CRED_TWEEN);
    setText(elCredits, Math.round(_credCurrent()).toLocaleString());
  }
  function refreshCargo() {
    cargoDirty = false;
    const c = (state.player || {}).cargo || {};
    const used = Math.round(c.usedVolume || 0);
    const cap = Math.round(c.capVolume || 40);
    setText(elCargo, `${used} / ${cap} u`);
    setClass(elCargo, 'sf-warn', cap > 0 && used >= cap);
  }
  let lastObjectivesSig = '';
  function refreshObjectives() {
    objDirty = false;
    const active = (state.missions && state.missions.active) || [];
    const items = [];
    for (const m of active.slice(0, 4)) {
      const title = (m.title || m.name || m.type || 'Mission');
      let prog = '';
      let label = '';
      const objs = m.objectives || [];
      if (objs.length) {
        const o = objs.find((x) => !x.done) || objs[0];
        const cur = o.progress != null ? o.progress : (o.current != null ? o.current : 0);
        const need = o.target != null ? o.target : (o.required != null ? o.required : (o.count != null ? o.count : 0));
        prog = need ? ` ${cur}/${need}` : '';
        label = o.label || o.text || '';
      }
      items.push({ title, prog, label });
    }
    const sig = items.map((item) => `${item.title}\u0001${item.prog}\u0001${item.label}`).join('\u0002');
    if (sig === lastObjectivesSig) return;
    lastObjectivesSig = sig;
    objWrap.innerHTML = '';
    if (!items.length) {
      setDisplay(objWrap, false);
      return;
    }
    setDisplay(objWrap, true, 'flex');
    const frag = document.createDocumentFragment();
    for (const item of items) {
      const line = document.createElement('div');
      line.className = 'sf-obj';
      line.dataset.label = item.label;
      const dot = document.createElement('span');
      dot.className = 'sf-obj__dot';
      const text = document.createElement('span');
      text.className = 'sf-obj__t';
      text.textContent = `${item.title}${item.prog}`;
      line.append(dot, text);
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
      setClass(lockRing, 'locked', isLocked);
      const offset = LOCK_C * (1 - lockProgress);
      const offsetText = offset.toFixed(2);
      if (lockFill.getAttribute('stroke-dashoffset') !== offsetText) lockFill.setAttribute('stroke-dashoffset', offsetText);
      setText(lockLabel, isLocked ? 'LOCKED' : Math.round(lockProgress * 100) + '%');
    } else {
      lockRing.classList.remove('active', 'locked');
    }
    // Lock-acquired tone: fire a two-note ascending cue on the rising edge (not-locked → locked).
    // Locking a missile target was visually indicated but sonically silent — a clear cue closes that.
    if (isLocked && !_wasLocked) ctx.bus.emit('audio:cue', { id: 'lock_acquired' });
    _wasLocked = isLocked;

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
        setScaleX(el.fill, frac);
        const overheated = hCur >= hMax && hMax > 0;
        setClass(el.row, 'overheated', overheated);
      }
      // Position above the status bars panel (recalc on slow ticks to track layout changes).
      if (slow) {
        const barsRect = bars.getBoundingClientRect();
        setStyle(wpnHeatsWrap, 'bottom', (window.innerHeight - barsRect.top + 6) + 'px');
      }
      setStyle(wpnHeatsWrap, 'display', 'flex');
    } else {
      setStyle(wpnHeatsWrap, 'display', 'none');
    }

    // ---- Target lock diamond (world-space overlay on locked/selected target) ----
    const tid = (state.player || {}).targetId;
    const tgt = tid != null ? state.entities.get(tid) : null;
    if (tgt && tgt.alive && helpers.worldToScreen) {
      const proj = helpers.worldToScreen({ x: tgt.pos.x, y: 0, z: tgt.pos.z });
      if (proj.onScreen) {
        lockDiamond.classList.add('visible');
        setStyle(lockDiamond, 'left', proj.x.toFixed(1) + 'px');
        setStyle(lockDiamond, 'top', proj.y.toFixed(1) + 'px');
        // Tint: red when missile-locked, cyan when just selected/tracking.
        const tgtLocked = isLocked && combat && combat.lockTarget === tid;
        setClass(lockDiamond, 'locked-tgt', tgtLocked);
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
  let lowShieldActive = false, lowHullActive = false;
  let lastDefId = null;
  let elReticle = null;
  let cachedNavStationId = null;
  let cachedNavEntity = null;
  let cachedNavListLength = -1;
  let cachedNavIndexVersion = -1;
  let lastNavLabel = '';
  let lastNavDist = '';
  let lastNavEta = '';
  const numericClock = createHudClock(10);
  const targetClock = createHudClock(20);
  const overlayClock = createHudClock(30);
  const radarClock = createHudClock(15);

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
    const frameDt = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.25) : 1 / 60;
    const numericDt = consumeHudClock(numericClock, frameDt);
    const targetDt = consumeHudClock(targetClock, frameDt);
    const overlayDt = consumeHudClock(overlayClock, frameDt);
    const radarDt = consumeHudClock(radarClock, frameDt);
    const slow = numericDt > 0;
    const targetTick = targetDt > 0;
    const overlayTick = overlayDt > 0;
    const radarTick = radarDt > 0;

    const p = state.entities.get(state.playerId);

    // --- schematic + arcs + micro-bars (every frame, transform/stroke only) ---
    if (p) {
      const hullFrac = p.hullMax ? clamp01(p.hull / p.hullMax) : 0;
      const shieldFrac = p.shieldMax ? clamp01(p.shield / p.shieldMax) : 0;
      const capFrac = p.capMax ? clamp01(p.cap / p.capMax) : 0;
      // Mining beam heat is the primary heat source; fall back to entity.data.heat only if beam has none.
      const player = state.player || {};
      const beamHeat = (player.miningBeam && player.miningBeam.heat != null) ? player.miningBeam.heat : 0;
      const heat = beamHeat > 0 ? beamHeat : ((p.data && p.data.heat != null) ? p.data.heat : 0);
      const heatMax = (p.data && p.data.heatMax) || 100;
      const heatFrac = clamp01(heat / heatMax);

      // Ship schematic (hull tint + centered numeric; shield ring via stroke-dashoffset).
      setStyle(schShield, 'strokeDashoffset', (SHIELD_RING_LEN * (1 - shieldFrac)).toFixed(1));
      setClass(schematic, 'sf-sch-critical', hullFrac < 0.25);

      setScaleX(fillEls.energy, capFrac);
      setScaleX(fillEls.heat, heatFrac);

      // Phase 3 boost micro-bar: energy fraction; the row is hidden entirely if the ship can't boost.
      // When a dash is ready (cooldown elapsed + enough energy) the bar gets a 'ready' glow.
      const boost = p.boost;
      const boostRow = rowEls.boost;
      if (boost && boost.max > 0 && boostRow) {
        setStyle(boostRow, 'display', '');
        const bf = clamp01(boost.energy / boost.max);
        setScaleX(fillEls.boost, bf);
        const dashReady = boost.dashImpulse > 0 && boost.dashCdT <= 0 && boost.energy >= boost.dashImpulse * 0.6;
        setClass(fillEls.boost && fillEls.boost.parentElement, 'sf-bar--ready', dashReady);
        if (slow) setText(numEls.boost, Math.round(bf * 100) + (dashReady ? ' ▸' : '%'));
      } else if (boostRow) {
        setStyle(boostRow, 'display', 'none');   // no boost capacity (e.g. a stripped hull) — hide the row
      }

      // Heat micro-bar only matters while it's actually hot (mostly mining) — hide it when cold.
      const heatRow = rowEls.heat;
      if (heatRow) setStyle(heatRow, 'display', heatFrac > 0.01 ? '' : 'none');
      setClass(fillEls.energy && fillEls.energy.parentElement, 'sf-bar--low', capFrac < 0.2 && capFrac > 0);

      // contextual low alerts via alerts module
      syncSafetyAlerts(p, hullFrac, shieldFrac);

      if (slow) {
        setText(schHull, Math.max(0, Math.round(p.hull)) + '');
        setText(numEls.energy, Math.max(0, Math.round(p.cap)) + '');
        setText(numEls.heat, Math.round(heatFrac * 100) + '%');
        // Phase 4 fuel gauge: low fuel flashes a warning.
        const fuel = state.fuel || { current: 100, max: 100 };
        const fuelFrac = fuel.max > 0 ? clamp01(fuel.current / fuel.max) : 1;
        setScaleX(elFuelFill, fuelFrac);
        setText(elFuelNum, Math.round(fuelFrac * 100) + '%');
        setClass(elFuel, 'sf-fuel--low', fuelFrac < 0.25);
      }

      // Action-bar highlights: light a slot while its ability is active.
      const inp = state.input || {};
      setClass(actionBoxes['pulse-laser'], 'sf-act-active', !!inp.fire && inp.fireGroup !== 2);
      setClass(actionBoxes['mass-sample'], 'sf-act-active', inp.fireGroup === 2);
      setClass(actionBoxes['boost'], 'sf-act-active', !!inp.boost);
      setClass(actionBoxes['dock'], 'sf-act-active', dockInRange);
    }

    // --- speed / throttle (numerics @10Hz) ---
    if (slow && p) {
      const sp = Math.hypot(p.vel.x, p.vel.z);
      setText(elSpeed, Math.round(sp) + '');
      const maxSp = p.maxSpeed || 1;
      setText(elThrottle, Math.round(clamp01(sp / maxSp) * 100) + '%');
      // STOP readout (spec §15.2/§15.3): the shortest projected stop distance/time from the live
      // braking solution. Hidden when effectively stopped so it never reads "0 wu" noise.
      if (sp > 0.5) {
        const brake = estimateBrakingSolution(p, resolvePropulsionProfile(p));
        const bestDist = Math.min(brake.directDistance, brake.flipBurnDistance);
        setText(elStop, Math.round(bestDist) + ' wu');
        setClass(elStop, 'sf-warn', bestDist > 600);
      } else {
        setText(elStop, '—');
        elStop.classList.remove('sf-warn');
      }
      // Weapon status: count of guns + auto-fire state. Shows the strategic loadout at a glance
      // and whether the guns will auto-engage aggressive enemies while you fly.
      const ws = p.data && p.data.weapons;
      const nGuns = ws ? ws.length : 0;
      const auto = !!(state.input && state.input.autoFire);
      const primary = nGuns === 1 ? (ws[0].name || ws[0].defId || '1 gun') : (nGuns + ' guns');
      setText(elWeapons, primary + (auto ? ' · AUTO' : ''));
      setClass(elWeapons, 'sf-warn', auto);
      // Reticle reflects fire mode: amber ring when auto-fire is engaged (guns auto-target hostiles),
      // cyan when you're aiming/firing manually. Purely a visual cue.
      if (!elReticle) elReticle = document.getElementById('aim-reticle');
      if (elReticle) setClass(elReticle, 'autofire', auto);
      // Reticle accuracy bloom: decay _recoilBloom toward 0 and scale the inner SVG. Sustained fire
      // expands the crosshair (1 -> 1.25); it contracts as you stop. Purely cosmetic readability.
      _recoilBloom = Math.max(0, _recoilBloom - frameDt * 2.2);
      if (elReticle) {
        const inner = elReticle.firstElementChild;
        if (inner) setStyle(inner, 'transform', `scale(${(1 + _recoilBloom * 0.25).toFixed(3)})`);
      }
      // Class/archetype label: surfaces the ship's role + drive family so the player feels the
      // archetype and propulsion switch when they buy a new hull. Updates cheaply each slow tick.
      const defId = p.data && p.data.defId;
      if (defId !== lastDefId) {
        lastDefId = defId;
        const def = SHIP_BY_ID.get(defId);
        if (def) {
          const drive = driveFamilyFor(def);
          setText(elRole, def.name + ' · ' + (ROLE_LABEL[def.role] || def.role || 'Ship') + (drive ? ' · ' + drive : ''));
        } else {
          setText(elRole, '—');
        }
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
      } else if (state.nav && state.nav.waypoint && state.nav.waypoint.onboarding) {
        const wp = state.nav.waypoint;
        setText(mtTitle, 'Tutorial Objective');
        setText(mtObj, wp.reason || wp.label || 'Follow the yellow signal');
        setText(mtTime, `${BINDINGS.localmap.label} Local Map`);
        mtTime.classList.remove('sf-mt-urgent');
        setDisplay(missionTracker, true);
      } else if (state.story && STORY_BEATS[state.story.beatIndex]) {
        const beat = STORY_BEATS[state.story.beatIndex];
        setText(mtTitle, `Story: ${mtStoryTitle(beat)}`);
        setText(mtObj, beat.objective || 'Open the mission log for your next objective');
        setText(mtTime, `${BINDINGS.missionLog.label} Mission Log · ${BINDINGS.localmap.label} Local Map`);
        mtTime.classList.remove('sf-mt-urgent');
        setDisplay(missionTracker, true);
      } else {
        setDisplay(missionTracker, false);
      }
    }

    // --- credits / cargo / objectives (event-driven, applied lazily) ---
    if (creditsDirty) refreshCredits();
    if (cargoDirty) refreshCargo();
    if (objDirty) refreshObjectives();
    // advance the credit count-up tween (no-op when at rest)
    if (slow) tickCreditsTween(numericDt || frameDt);

    // --- target panel: DOM/compositor surface; update on a fixed HUD cadence ---
    if (targetTick) targetPanel.update({ slow });

    // --- combat HUD: lock ring, weapon heat bars, target diamond ---
    if (targetTick) updateCombatHud(p, slow);

    // --- world-space DOM overlays: batch transform/opacity writes ---
    if (overlayTick) floatingText.update(overlayDt || frameDt);

    // --- radar: canvas redraws are explicit, not tied to every render frame ---
    if (radarTick) radar.draw();

    // directional damage indicators advance + reposition on the overlay cadence.
    if (overlayTick) dmgInd.tick(overlayDt || frameDt, helpers);

    // --- off-screen objective arrow ---
    if (overlayTick || slow) updateObjectiveArrow(p, slow);

    // --- toasts/alerts expiry sweep ---
    if (alerts && alerts.tick) alerts.tick();
    // --- HUD meta-arc (STABLE LOAD line, tag flicker, manifest ghost) ---
    if (overlayTick && hudMeta && hudMeta.tick) hudMeta.tick(overlayDt || frameDt);
  }

  function tickHidden(dt) {
    const p = state.entities.get(state.playerId);
    syncSafetyAlerts(p);
    if (alerts && alerts.tick) alerts.tick();
  }

  function resolveNavStation(nw) {
    if (!nw || !nw.stationId) return null;
    const index = state.entityIndex;
    const indexVersion = index && index.__spacefaceEntityIndexV1 ? (index.version || 0) : -1;
    const listLength = indexVersion >= 0 ? -1 : state.entityList.length;
    if (
      cachedNavStationId === nw.stationId &&
      cachedNavIndexVersion === indexVersion &&
      cachedNavListLength === listLength &&
      cachedNavEntity &&
      cachedNavEntity.alive !== false &&
      cachedNavEntity.type === 'station'
    ) {
      return cachedNavEntity;
    }
    cachedNavStationId = nw.stationId;
    cachedNavIndexVersion = indexVersion;
    cachedNavListLength = listLength;
    cachedNavEntity = resolveHudNavStation(state, nw.stationId);
    return cachedNavEntity;
  }

  function updateObjectiveArrow(p, slow) {
    // Priority: durable nav waypoint (mission/trade/story), else legacy mission-local waypoint.
    const tracked = state.ui.trackedMissionId;
    const active = (state.missions && state.missions.active) || [];
    const m = tracked ? active.find((x) => x.id === tracked) : active[0];
    let wp = null, wpLabel = null, navMeta = null;
    if (state.nav && state.nav.waypoint) {
      const nw = state.nav.waypoint;
      let livePos = null;
      if (nw.stationId) {
        const station = resolveNavStation(nw);
        if (station) livePos = station.pos;
      }
      const pos = livePos || nw.pos;
      wpLabel = nw.reason || nw.label || nw.sectorName || 'Waypoint';
      navMeta = nw;
      if (pos) wp = pos;
    }
    if (!wp && m) {
      wp = m.waypoint || m.targetPos || (m.objectives && m.objectives[0] && m.objectives[0].pos) || null;
      wpLabel = wpLabel || m.title || m.name || 'Mission';
    }
    if (!wp && navMeta) {
      setDisplay(arrow, false);
      setDisplay(elNavReadout, true);
      // Route/cross-sector guidance — not a live target with a distance, so render plain text
      // (no "[ TARGET LOCK ]" / distance brackets, which only fit an in-range fix).
      setClass(elNavReadout, 'sf-nav--lock', false);
      const label = wpLabel || navMeta.label || 'Waypoint';
      const route = mtRouteGuidance(state, navMeta);
      const distText = route ? route.next : (navMeta.sectorName || (navMeta.sectorId ? 'Off-sector' : 'No local fix'));
      if (label !== lastNavLabel) { setText(elNavLabel, label); lastNavLabel = label; }
      if (distText !== lastNavDist) { setText(elNavDist, distText); lastNavDist = distText; }
      const etaText = route ? route.summary : `${BINDINGS.starmap.label} Star Map`;
      if (etaText !== lastNavEta) { setText(elNavEta, etaText); lastNavEta = etaText; }
      return;
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
    // Live in-range fix: this is the real "[ TARGET LOCK: <label> ]" + "[ NNN u ]" case (§3E).
    setClass(elNavReadout, 'sf-nav--lock', true);
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
    forceHudClock(numericClock);
    forceHudClock(targetClock);
    forceHudClock(overlayClock);
    forceHudClock(radarClock);
    lastDefId = null;
    lastNavDist = '';
    lastNavEta = '';
    if (radar.invalidate) radar.invalidate();
    if (targetPanel.forceRefresh) targetPanel.forceRefresh();
  }

  return { frame, tickHidden, forceRefresh, setVisible, refreshCredits, refreshCargo, refreshObjectives };
}
