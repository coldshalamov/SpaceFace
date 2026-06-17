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
import { SHIPS } from '../data/ships.js';

// Ship role → friendly archetype label (Phase 3 HUD class indicator).
const SHIP_BY_ID = new Map(SHIPS.map((s) => [s.id, s]));
const ROLE_LABEL = {
  starter: 'Starter', mining: 'Miner', fighter: 'Fighter', freighter: 'Freighter',
  multirole: 'Multirole', interceptor: 'Interceptor', mining_barge: 'Mining Barge',
  corvette: 'Corvette', heavy_hauler: 'Heavy Hauler', explorer: 'Explorer',
  gunship: 'Gunship', battlecruiser: 'Battlecruiser', flagship: 'Flagship',
};

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

function injectDeathStyle() {
  if (document.getElementById('sf-death-style')) return;
  const s = document.createElement('style');
  s.id = 'sf-death-style';
  s.textContent = `
  .sf-death { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center;
    gap:8px; z-index:1500; pointer-events:none; opacity:0; }
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

  // ---- bottom-center: throttle / speed / cargo / credits / weapons ----
  const center = document.createElement('div');
  center.className = 'sf-cluster';
  center.innerHTML = `
    <div class="sf-stat"><span class="sf-stat__k">SPD</span><span class="sf-stat__v mono" data-k="speed">0</span></div>
    <div class="sf-stat"><span class="sf-stat__k">THR</span><span class="sf-stat__v mono" data-k="throttle">0%</span></div>
    <div class="sf-stat sf-stat--wide"><span class="sf-stat__k">CARGO</span><span class="sf-stat__v mono" data-k="cargo">0 / 40 u</span></div>
    <div class="sf-stat sf-stat--wide"><span class="sf-stat__k">CR</span><span class="sf-stat__v mono sf-credits" data-k="credits">0</span></div>
    <div class="sf-stat" id="sf-wpnstat"><span class="sf-stat__k">WPN</span><span class="sf-stat__v mono" data-k="weapons">—</span></div>
    <div class="sf-stat sf-stat--wide" id="sf-rolestat"><span class="sf-stat__k">CLASS</span><span class="sf-stat__v mono" data-k="role">—</span></div>`;
  root.appendChild(center);
  const elSpeed = center.querySelector('[data-k=speed]');
  const elThrottle = center.querySelector('[data-k=throttle]');
  const elCargo = center.querySelector('[data-k=cargo]');
  const elCredits = center.querySelector('[data-k=credits]');
  const elWeapons = center.querySelector('[data-k=weapons]');
  const elRole = center.querySelector('[data-k=role]');

  // ---- bottom-right: target panel + radar ----
  const rightDock = document.createElement('div');
  rightDock.className = 'sf-rightdock';
  const targetPanel = createTargetPanel(ctx);
  const radar = createRadar(ctx);
  rightDock.append(targetPanel.el, radar.el);
  root.appendChild(rightDock);

  // floating combat text (damage numbers, ore yield, credits, kills)
  const floatingText = createFloatingText(ctx);

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

  // ---- death / respawn feedback banner ----
  injectDeathStyle();
  const deathBanner = document.createElement('div');
  deathBanner.className = 'sf-death';
  deathBanner.innerHTML = '<div class="sf-death__big">SHIP DESTROYED</div><div class="sf-death__sub">Emergency recovery online…</div>';
  root.appendChild(deathBanner);
  ctx.bus.on('player:death', () => {
    deathBanner.classList.remove('show'); void deathBanner.offsetWidth; // restart animation
    deathBanner.classList.add('show');
    document.body.classList.add('sf-deathflash');
    setTimeout(() => document.body.classList.remove('sf-deathflash'), 700);
  });
  ctx.bus.on('player:respawn', () => {
    ctx.bus.emit('toast', { text: 'Hull rebuilt — fly safe, pilot. (3s shields online)', kind: 'good', ttl: 4 });
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

  function refreshCredits() {
    creditsDirty = false;
    elCredits.textContent = Math.round(state.player.credits || 0).toLocaleString();
  }
  function refreshCargo() {
    cargoDirty = false;
    const c = state.player.cargo || {};
    const used = Math.round(c.usedVolume || 0);
    const cap = Math.round(c.capVolume || 40);
    elCargo.textContent = `${used} / ${cap} u`;
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
  // 60Hz cheap path
  // ---------------------------------------------------------------------------
  let tickN = 0;
  let lowShieldActive = false, lowHullActive = false;

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
      const heat = (p.data && p.data.heat != null) ? p.data.heat : (state.player.miningBeam ? state.player.miningBeam.heat : 0);
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
        if (slow) numEls.boost.textContent = Math.round(bf * 100) + (dashReady ? ' ▸' : '%');
      } else if (boostRow) {
        boostRow.style.display = 'none';   // no boost capacity (e.g. a stripped hull) — hide the row
      }

      fillEls.hull.parentElement.classList.toggle('sf-bar--low', hullFrac < 0.25);
      fillEls.shield.parentElement.classList.toggle('sf-bar--low', shieldFrac < 0.25 && shieldFrac > 0);

      // contextual low alerts via alerts module
      if (alerts) {
        const lowShield = shieldFrac > 0 && shieldFrac < 0.2;
        if (lowShield && !lowShieldActive) alerts.raise({ key: 'low-shield', sev: 'warn', text: 'SHIELDS LOW', ttl: Infinity });
        if (!lowShield && lowShieldActive) alerts.clear('low-shield');
        lowShieldActive = lowShield;
        const lowHull = hullFrac > 0 && hullFrac < 0.25;
        if (lowHull && !lowHullActive) alerts.raise({ key: 'low-hull', sev: 'danger', text: 'HULL CRITICAL', ttl: Infinity });
        if (!lowHull && lowHullActive) alerts.clear('low-hull');
        lowHullActive = lowHull;
      }

      if (slow) {
        numEls.hull.textContent = Math.max(0, Math.round(p.hull)) + '';
        numEls.shield.textContent = Math.max(0, Math.round(p.shield)) + '';
        numEls.energy.textContent = Math.max(0, Math.round(p.cap)) + '';
        numEls.heat.textContent = Math.round(heatFrac * 100) + '%';
        // Phase 4 fuel gauge: low fuel flashes a warning.
        const fuel = state.fuel || { current: 100, max: 100 };
        const fuelFrac = fuel.max > 0 ? clamp01(fuel.current / fuel.max) : 1;
        elFuelFill.style.transform = `scaleX(${fuelFrac})`;
        elFuelNum.textContent = Math.round(fuelFrac * 100) + '%';
        elFuel.classList.toggle('sf-fuel--low', fuelFrac < 0.25);
      }
    }

    // --- speed / throttle (numerics @10Hz) ---
    if (slow && p) {
      const sp = Math.hypot(p.vel.x, p.vel.z);
      elSpeed.textContent = Math.round(sp) + '';
      const maxSp = p.maxSpeed || 1;
      elThrottle.textContent = Math.round(clamp01(sp / maxSp) * 100) + '%';
      // Weapon status: count of guns + auto-fire state. Shows the strategic loadout at a glance
      // and whether the guns will auto-engage aggressive enemies while you fly.
      const ws = p.data && p.data.weapons;
      const nGuns = ws ? ws.length : 0;
      const auto = !!(state.input && state.input.autoFire);
      elWeapons.textContent = nGuns + ' gun' + (nGuns === 1 ? '' : 's') + (auto ? ' · AUTO' : '');
      elWeapons.classList.toggle('sf-warn', auto);
      // Reticle reflects fire mode: amber ring when auto-fire is engaged (guns auto-target hostiles),
      // cyan when you're aiming/firing manually. Purely a visual cue.
      const reticle = document.getElementById('aim-reticle');
      if (reticle) reticle.classList.toggle('autofire', auto);
      // Class/archetype label: surfaces the ship's role so the player feels the archetype switch
      // when they buy a new hull (Phase 3). Updates cheaply each slow tick.
      const defId = p.data && p.data.defId;
      if (defId !== this._lastDefId) {
        this._lastDefId = defId;
        const def = SHIP_BY_ID.get(defId);
        elRole.textContent = def ? (def.name + ' · ' + ROLE_LABEL[def.role] || def.role) : '—';
      }
    }

    // --- credits / cargo / objectives (event-driven, applied lazily) ---
    if (creditsDirty) refreshCredits();
    if (cargoDirty) refreshCargo();
    if (objDirty) refreshObjectives();

    // --- target panel (every frame, cheap) ---
    targetPanel.update();

    // --- floating combat text ---
    floatingText.update(dt || 0.016);

    // --- radar @20Hz ---
    if (radarTick) radar.draw();

    // --- off-screen objective arrow ---
    updateObjectiveArrow(p);

    // --- toasts/alerts expiry sweep ---
    if (alerts && alerts.tick) alerts.tick();
  }

  function updateObjectiveArrow(p) {
    // Priority: a tracked mission waypoint, else a player-set trade nav waypoint (Phase 4).
    const tracked = state.ui.trackedMissionId;
    const active = (state.missions && state.missions.active) || [];
    const m = tracked ? active.find((x) => x.id === tracked) : active[0];
    let wp = null, wpLabel = null;
    if (m) wp = m.waypoint || m.targetPos || (m.objectives && m.objectives[0] && m.objectives[0].pos) || null;
    if (!wp && state.nav && state.nav.waypoint) {
      // nav waypoint is a station; re-resolve its live world position each frame so it tracks
      // moving entities and clears when the station is gone (e.g. after jumping away).
      const nw = state.nav.waypoint;
      if (nw.pos) { wp = nw.pos; wpLabel = nw.label; }
    }
    if (!wp || !p || !helpers.worldToScreen) { arrow.style.display = 'none'; elNavReadout.style.display = 'none'; return; }
    const proj = helpers.worldToScreen({ x: wp.x, y: 0, z: wp.z });
    // distance + ETA readout (always shown while a nav target is set)
    const dist = Math.hypot(wp.x - p.pos.x, wp.z - p.pos.z);
    const speed = Math.hypot(p.vel.x, p.vel.z);
    const etaS = speed > 5 ? dist / speed : Infinity;
    elNavReadout.style.display = 'block';
    elNavReadout.querySelector('.sf-nav-dist').textContent = Math.round(dist) + ' u';
    elNavReadout.querySelector('.sf-nav-eta').textContent = isFinite(etaS) ? (etaS < 60 ? Math.round(etaS) + 's' : Math.round(etaS / 60) + 'm') : '—';
    if (wpLabel) elNavReadout.querySelector('.sf-nav-label').textContent = wpLabel;
    if (proj.onScreen) { arrow.style.display = 'none'; return; }
    // clamp to a screen-edge ellipse around center, pointing toward target
    const w = window.innerWidth, h = window.innerHeight;
    let dx = proj.x - w / 2, dy = proj.y - h / 2;
    // worldToScreen returns mirrored coords for behind-camera points; normalize direction
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    const mx = w * 0.42, my = h * 0.42;
    const ex = w / 2 + dx * mx, ey = h / 2 + dy * my;
    arrow.style.display = 'block';
    arrow.style.left = ex + 'px';
    arrow.style.top = ey + 'px';
    arrow.style.transform = `translate(-50%,-50%) rotate(${Math.atan2(dy, dx)}rad)`;
  }

  function setVisible(v) { root.style.display = v ? 'block' : 'none'; }

  return { frame, setVisible, refreshCredits, refreshCargo, refreshObjectives };
}
