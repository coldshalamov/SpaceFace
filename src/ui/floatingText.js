// Floating combat text — pooled DOM numbers that pop off entities when they take damage (and a few
// other beats: ore yield, credits, "SHIELD DOWN", bounty, pickups). Pure presentation: subscribes
// to bus events, reads entity transforms via helpers.worldToScreen, never touches sim state. Gated
// on state.settings.showDamageNumbers. Driven each frame by hud.frame() -> update().
import { COMMODITIES } from '../data/commodities.js';
import { FACTION_META } from '../data/factions.js';
import { SECTORS } from '../data/sectors.js';

const POOL = 56;

// Lookup tables built once at module load
const CMDTY_BY_ID = Object.create(null);
for (const c of COMMODITIES) CMDTY_BY_ID[c.id] = c;
const FACTION_BY_ID = Object.create(null);
for (const f of FACTION_META) FACTION_BY_ID[f.id] = f;
const STATION_BY_ID = Object.create(null);
for (const sec of SECTORS) {
  if (sec.stations) for (const st of sec.stations) STATION_BY_ID[st.id] = st;
}
const STYLE_ID = 'sf-floattext-style';

export function createFloatingText(ctx) {
  const { state, helpers, bus } = ctx;
  injectStyle();
  const layer = document.createElement('div');
  layer.id = 'sf-floattext';
  const root = document.getElementById('hud') || document.getElementById('ui-root') || document.body;
  root.appendChild(layer);

  // pooled nodes
  const nodes = [];
  for (let i = 0; i < POOL; i++) {
    const el = document.createElement('div');
    el.className = 'sf-ft';
    el.style.display = 'none';
    layer.appendChild(el);
    nodes.push({ el, alive: false, age: 0, life: 1, x: 0, y: 0, vy: 0, vx: 0, targetId: null, wx: 0, wz: 0 });
  }
  let head = 0;

  function spawn(text, cls, wx, wz, targetId, opts) {
    if (!state.settings || state.settings.showDamageNumbers === false) return;
    opts = opts || {};
    let n = null;
    for (let k = 0; k < POOL; k++) { const idx = (head + k) % POOL; if (!nodes[idx].alive) { n = nodes[idx]; head = (idx + 1) % POOL; break; } }
    if (!n) { n = nodes[head]; head = (head + 1) % POOL; }   // steal oldest-ish
    n.alive = true; n.age = 0; n.life = opts.life || 0.95;
    n.targetId = targetId != null ? targetId : null;
    n.wx = wx; n.wz = wz;
    n.vy = -(opts.vy != null ? opts.vy : 48);      // px/s rise
    n.vx = (Math.random() - 0.5) * 26;
    n.el.className = 'sf-ft ' + cls;
    n.el.textContent = text;
    n.el.style.display = 'block';
    n.el.style.opacity = '1';
    n.el.style.transform = 'translate3d(0,0,0) translate(-50%,-50%)';
    n.x = 0; n.y = 0;
  }

  // ---- event hooks ----------------------------------------------------------------------------
  function dmgColor(p) {
    if (p.isPlayer) return 'sf-ft--player';
    if (p.brokeShield || p.kind === 'shield') return 'sf-ft--shield';
    return 'sf-ft--hull';
  }
  bus.on('combat:damage', (p) => {
    if (!p || (p.amount || 0) <= 0) return;
    const e = p.targetId != null ? state.entities.get(p.targetId) : null;
    const wx = e ? e.pos.x : (p.pos && p.pos.x); const wz = e ? e.pos.z : (p.pos && p.pos.z);
    if (wx == null) return;
    const big = (p.amount >= 25) || p.killing;
    spawn(Math.round(p.amount) + '', dmgColor(p) + (big ? ' sf-ft--big' : ''), wx, wz, p.targetId, { life: big ? 1.2 : 0.9, vy: big ? 62 : 46 });
  });
  bus.on('combat:damage', (p) => { if (p && p.brokeShield) { const e = state.entities.get(p.targetId); if (e) spawn('SHIELD DOWN', 'sf-ft--shielddown', e.pos.x, e.pos.z, null, { life: 1.0, vy: 30 }); } });
  bus.on('entity:killed', (p) => { if (p && p.pos) spawn('DESTROYED', 'sf-ft--kill', p.pos.x, p.pos.z, null, { life: 1.3, vy: 26 }); });
  bus.on('mining:yield', (p) => { if (p && p.pos && p.qty) spawn('+' + p.qty, 'sf-ft--ore', p.pos.x, p.pos.z, null, { life: 1.0, vy: 40 }); });
  bus.on('loot:drop', (p) => { if (p && p.pos && p.credits > 0) spawn('+' + p.credits + ' cr', 'sf-ft--credits', p.pos.x, p.pos.z, null, { life: 1.4, vy: 36 }); });
  // Phase 3/6: confirm a dash fired (violet, matches the boost bar) — only the player's, so a fleet
  // of dashing NPCs doesn't spam text.
  bus.on('ship:dash', (p) => { if (p && p.shipId === state.playerId) { const e = state.entities.get(p.shipId); if (e) spawn('DASH', 'sf-ft--dash', e.pos.x, e.pos.z, null, { life: 0.7, vy: 50 }); } });

  // ---- bounty / kill credits ----------------------------------------------------------------
  bus.on('entity:killed', (p) => {
    if (!p || !p.pos || !p.bountyCr || p.killerId !== state.playerId) return;
    // Gold "+800 CR" floating text at the kill site
    spawn('+' + p.bountyCr + ' CR', 'sf-ft--bounty', p.pos.x, p.pos.z, null, { life: 1.6, vy: 30 });
    // Toast: "Enemy Destroyed · +800 CR"
    const label = (p.victimClass === 'capital' || p.victimClass === 'large') ? 'Capital Destroyed' : 'Enemy Destroyed';
    bus.emit('toast', { text: label + ' · +' + p.bountyCr + ' CR', kind: 'credits', ttl: 3.5 });
  });

  // ---- pickup collected (ore / cargo / module) ----------------------------------------------
  bus.on('pickup:collected', (p) => {
    if (!p || p.collectorId !== state.playerId) return;
    const qty = p.amount || 0;
    if (qty <= 0 && p.kind !== 'module') return;
    const def = CMDTY_BY_ID[p.commodityId];
    const name = def ? def.name : (p.commodityId || 'Item');
    const cat = def ? def.category : '';
    // Pick a color class based on category
    const cls = cat === 'raw ore' || cat === 'crystal' ? 'sf-ft--ore'
      : cat === 'exotic' ? 'sf-ft--exotic'
      : p.kind === 'module' ? 'sf-ft--module'
      : 'sf-ft--pickup';
    const text = p.kind === 'module' ? ('+1 ' + name) : ('+' + qty + ' ' + name);
    spawn(text, cls, p.pos.x, p.pos.z, null, { life: 1.2, vy: 38 });
  });

  // ---- faction rep changes ------------------------------------------------------------------
  bus.on('faction:repChanged', (p) => {
    if (!p || !p.delta) return;
    const fac = FACTION_BY_ID[p.factionId];
    const name = fac ? fac.short : (p.factionId || 'Unknown');
    const sign = p.delta > 0 ? '+' : '';
    const kind = p.delta > 0 ? 'good' : 'danger';
    bus.emit('toast', { text: sign + Math.round(p.delta) + ' REP · ' + name, kind, ttl: 3.5 });
  });

  // ---- cargo full ---------------------------------------------------------------------------
  bus.on('cargo:full', (p) => {
    bus.emit('toast', { text: 'CARGO FULL', kind: 'warn', ttl: 3.5 });
  });

  // ---- economy events (market alerts) -------------------------------------------------------
  bus.on('economy:eventStarted', (p) => {
    if (!p) return;
    const cmdty = CMDTY_BY_ID[p.commodityId];
    const station = STATION_BY_ID[p.stationId];
    const cmdtyName = cmdty ? cmdty.name : (p.commodityId || 'Unknown');
    const stationName = station ? station.name : (p.stationId || 'Unknown');
    const typeLabel = p.type ? p.type.toUpperCase() : 'EVENT';
    const kind = (p.type === 'shortage' || p.type === 'blockade' || p.type === 'piracy') ? 'warn' : 'info';
    bus.emit('toast', { text: 'MARKET ALERT: ' + cmdtyName + ' ' + typeLabel + ' at ' + stationName, kind, ttl: 5 });
  });

  bus.on('economy:eventEnded', (p) => {
    bus.emit('toast', { text: 'Market event ended', kind: 'info', ttl: 3 });
  });

  function update(dt) {
    if (!helpers.worldToScreen) return;
    for (let i = 0; i < POOL; i++) {
      const n = nodes[i];
      if (!n.alive) continue;
      n.age += dt;
      if (n.age >= n.life) { n.alive = false; n.el.style.display = 'none'; continue; }
      // follow the entity if it still exists, else stay at the world point
      let wx = n.wx, wz = n.wz;
      if (n.targetId != null) { const e = state.entities.get(n.targetId); if (e) { wx = e.pos.x; wz = e.pos.z; } }
      const s = helpers.worldToScreen({ x: wx, y: 0, z: wz });
      const t = n.age / n.life;
      const rise = n.vy * n.age;            // integrated rise (px)
      const drift = n.vx * n.age;
      n.el.style.transform = `translate3d(${s.x + drift}px,${s.y + rise}px,0) translate(-50%,-50%)`;
      n.el.style.opacity = String(s.onScreen ? (1 - t * t) : 0);
    }
  }

  return { update };
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
  #sf-floattext { position:absolute; inset:0; pointer-events:none; z-index:40; overflow:hidden; }
  .sf-ft { position:absolute; left:0; top:0; transform:translate3d(0,0,0) translate(-50%,-50%); font-family:var(--mono,Consolas,monospace);
    font-weight:700; font-size:16px; letter-spacing:.02em; white-space:nowrap; will-change:transform,opacity;
    text-shadow:0 0 6px rgba(0,0,0,.9), 0 1px 2px rgba(0,0,0,.9); }
  .sf-ft--hull { color:#ffd24a; }
  .sf-ft--shield { color:#7fe0ff; font-size:14px; }
  .sf-ft--player { color:#ff5470; font-size:18px; }
  .sf-ft--big { font-size:24px; }
  .sf-ft--shielddown { color:#9fe8ff; font-size:12px; letter-spacing:.18em; }
  .sf-ft--kill { color:#ff8a4a; font-size:15px; letter-spacing:.16em; text-shadow:0 0 10px rgba(255,120,40,.7),0 0 4px #000; }
  .sf-ft--ore { color:#7af7d0; }
  .sf-ft--credits { color:#ffd84a; font-size:15px; }
  .sf-ft--dash { color:#c98cff; font-size:14px; letter-spacing:.18em; text-shadow:0 0 10px rgba(170,90,255,.8),0 0 4px #000; }
  .sf-ft--bounty { color:#ffd84a; font-size:18px; font-weight:900; letter-spacing:.06em;
    text-shadow:0 0 12px rgba(255,216,74,.7),0 0 4px #000; }
  .sf-ft--exotic { color:#c98cff; font-size:15px; text-shadow:0 0 8px rgba(170,90,255,.6),0 0 4px #000; }
  .sf-ft--module { color:#39d0ff; font-size:15px; text-shadow:0 0 8px rgba(57,208,255,.6),0 0 4px #000; }
  .sf-ft--pickup { color:#d3e6ff; font-size:14px; }
  `;
  document.head.appendChild(s);
}
