// Floating combat text — pooled DOM numbers that pop off entities when they take damage (and a few
// other beats: ore yield, credits, bounty, pickups). Pure presentation: subscribes
// to bus events, reads entity transforms via helpers.worldToScreen, never touches sim state. Gated
// on state.settings.showDamageNumbers. Driven each frame by hud.frame() -> update().
import { COMMODITIES } from '../data/commodities.js';
import { MODULES } from '../data/modules.js';
import { WEAPONS } from '../data/weapons.js';
import { BODY_MODULES } from '../data/claimableBodies.js';
import { FACTION_META } from '../data/factions.js';
import { SALVAGE_RIGHTS_KIND, salvageRightsItemsOf, isCreditChipPickup } from '../data/killRewards.js';
import { SECTORS } from '../data/sectors.js';
import { successfulPickupAmount } from '../core/pickupAcceptance.js';
import { damageLayer, admitLayerVoice } from '../audio/hitVoice.js';
import { shouldHideOwnRepDelta } from '../story/endings/publicIdentity.js';

const POOL = 56;

// Retained worldToScreen scratch — projection results are consumed synchronously.
const _ftWorld = { x: 0, y: 0, z: 0 };
const _ftScreen = { x: 0, y: 0, onScreen: false };

// Lookup tables built once at module load
const CMDTY_BY_ID = Object.create(null);
for (const c of COMMODITIES) CMDTY_BY_ID[c.id] = c;
// A 'module'-kind pickup carries its def id in `commodityId`, not a commodity — resolve it
// against the same catalogues entityResolver.js:44 merges so a drop names the def, never the id.
const MODULE_BY_ID = Object.create(null);
for (const m of MODULES.concat(WEAPONS, BODY_MODULES)) if (m && m.id) MODULE_BY_ID[m.id] = m;
const FACTION_BY_ID = Object.create(null);
for (const f of FACTION_META) FACTION_BY_ID[f.id] = f;
const STATION_BY_ID = Object.create(null);
for (const sec of SECTORS) {
  if (sec.stations) for (const st of sec.stations) STATION_BY_ID[st.id] = st;
}
const STYLE_ID = 'sf-floattext-style';

// Kit geometry, ported inline from src/ui/damageIndicators.js so the floating pips and the
// screen-edge damage indicators are the SAME shapes (ring=shield, diamond outline=armor, solid
// square=hull) and the crit callout wears the indicator's alert ring — the two systems agree at
// a glance. One shared svg per pooled node; CSS reveals exactly the shape the spawn class names,
// so a pooled node swaps meaning by class alone (no per-hit DOM mutation). Drawn marks replace
// the old '○'/'❯'/'✕'/'◈' unicode stand-ins.
const FT_MARK_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">'
  + '<circle class="sf-ft-shape sf-ft-shape-shield" cx="12" cy="12" r="6.4" stroke="currentColor" stroke-width="2.6"/>'
  + '<path class="sf-ft-shape sf-ft-shape-armor" stroke="currentColor" stroke-width="2.6" d="M12 3.9 L20.1 12 L12 20.1 L3.9 12 Z"/>'
  + '<rect class="sf-ft-shape sf-ft-shape-hull" x="4.9" y="4.9" width="14.2" height="14.2" fill="currentColor"/>'
  + '<circle class="sf-ft-shape sf-ft-shape-crit" cx="12" cy="12" r="10.9" stroke="currentColor" stroke-width="2.2"/>'
  + '</svg>';

/** Direct-to-cargo yield names what the hold took. Loose ore keeps the released quantity. */
export function miningYieldReportedAmount(payload) {
  if (!payload || typeof payload !== 'object') return 0;
  if (Object.prototype.hasOwnProperty.call(payload, 'acceptedAmount')) {
    const requested = Math.max(Number(payload.qty) || 0, Number(payload.acceptedAmount) || 0);
    return successfulPickupAmount(payload, requested);
  }
  const qty = Number(payload.qty);
  return Number.isFinite(qty) && qty > 0 ? Math.floor(qty) : 0;
}

export function pickupFloatingTextSpec(payload) {
  const qty = successfulPickupAmount(payload);
  if (qty <= 0) return null;
  if (payload && payload.kind === SALVAGE_RIGHTS_KIND) {
    return { qty, text: '+' + qty + ' SALVAGE RIGHTS', cls: 'sf-ft--rights' };
  }
  if (isCreditChipPickup(payload)) {
    return { qty, text: '+' + qty + ' cr', cls: 'sf-ft--credits' };
  }
  const def = CMDTY_BY_ID[payload && payload.commodityId];
  if (!def) {
    // RC-04 — not a cargo commodity. The run's own pods stamp their worth into `amount` as RUN
    // credits (the swarmEvents 'swarm_supply_pod' drop and the asteroid-mill 'mill_ore' both pay
    // exactly it through run:awardRequested), so they read like the credit chips they are. A
    // module drop names its real def. Anything else — the 'swarm_repair' cell, a custody body,
    // an unrecognised id — floats nothing: its owner already writes the real receipt, and
    // 'Item' or a leaked raw id is a receipt bug, not a label.
    if (payload && (payload.kind === 'swarm_supply_pod' || payload.kind === 'mill_ore')) {
      return { qty, text: '+' + qty + ' cr', cls: 'sf-ft--credits' };
    }
    const mod = MODULE_BY_ID[payload && payload.commodityId];
    if (mod) return { qty, text: '+' + qty + ' ' + (mod.name || 'Module'), cls: 'sf-ft--module' };
    return null;
  }
  const cat = def.category;
  const cls = cat === 'raw ore' || cat === 'crystal' ? 'sf-ft--ore'
    : cat === 'exotic' ? 'sf-ft--exotic'
    : payload && payload.kind === 'module' ? 'sf-ft--module'
    : 'sf-ft--pickup';
  return { qty, text: '+' + qty + ' ' + def.name, cls };
}

export function factionRepToastText(state, payload = {}) {
  const fac = FACTION_BY_ID[payload.factionId];
  const name = fac ? fac.short : (payload.factionId || 'Unknown');
  if (shouldHideOwnRepDelta(state)) return 'STANDING UPDATE ROUTED · ' + name;
  const delta = Math.round(Number(payload.delta) || 0);
  return (delta > 0 ? '+' : '') + delta + ' REP · ' + name;
}

// comms:log had emitters (barks, encounter acks, survey/rumor lines) and zero
// consumers — every line evaporated. Map it onto the receipt lane so comms
// actually read. Kinds whose emitter already toasts the same beat stay out.
const COMMS_SELF_TOASTED_KINDS = new Set(['salvage', 'machine', 'ecology']);
const COMMS_TOAST_TTL = 5;

export function commsToastSpec(payload = {}) {
  if (!payload || typeof payload.text !== 'string' || !payload.text.trim()) return null;
  if (COMMS_SELF_TOASTED_KINDS.has(payload.kind)) return null;
  const from = String(payload.from || '').trim().toUpperCase();
  const text = (from ? from + ': ' : '') + payload.text.trim();
  return { text: text.length > 140 ? text.slice(0, 137) + '...' : text, kind: 'info', ttl: COMMS_TOAST_TTL };
}

export function bindCommsLogToasts(bus) {
  if (!bus || typeof bus.on !== 'function') return null;
  return bus.on('comms:log', (p) => {
    const spec = commsToastSpec(p);
    if (spec) bus.emit('toast', spec);
  });
}

// Computed once per receipt, never during the pooled frame update. Keep legacy weak-point copy.
// The old '◈ ' text prefix is gone: the drawn crit ring (see FT_MARK_SVG) is revealed by the
// sf-ft--critical class itself, so the callout reads [ring] CRIT · LABEL with no unicode glyph.
export function weakPointFloatingTextSpec(payload) {
  if (!payload?.pos) return null;
  const critical = payload.critical === true;
  const label = payload.label || 'WEAK POINT';
  return {
    text: (critical ? (payload.criticalLabel || 'CRIT') + ' · ' : '') + label,
    cls: critical ? 'sf-ft--weak sf-ft--critical' : 'sf-ft--weak',
  };
}

export function createFloatingText(ctx) {
  const { state, helpers, bus } = ctx;
  const unsubscribers = [];
  const on = (event, listener, options = undefined) => {
    if (!bus || typeof bus.on !== 'function') return null;
    const unsubscribe = bus.on(event, listener, options);
    if (typeof unsubscribe === 'function') unsubscribers.push(unsubscribe);
    return unsubscribe;
  };
  injectStyle();
  const layer = document.createElement('div');
  layer.id = 'sf-floattext';
  // Pure presentation: numbers and pips are visuals over the world; the screen-reader channels
  // for the same facts are alerts.js and the receipt lane (the damageIndicators contract).
  layer.setAttribute('aria-hidden', 'true');
  const root = document.getElementById('hud') || document.getElementById('ui-root') || document.body;
  root.appendChild(layer);

  // pooled nodes — each carries a mark span (the shared drawn-shape svg, revealed by class) and
  // a label span (the words/numerals), so text writes never touch the mark subtree.
  const nodes = [];
  for (let i = 0; i < POOL; i++) {
    const el = document.createElement('div');
    el.className = 'sf-ft';
    el.style.display = 'none';
    const mark = document.createElement('span');
    mark.className = 'sf-ft-mark';
    mark.innerHTML = FT_MARK_SVG;
    const label = document.createElement('span');
    label.className = 'sf-ft-text';
    el.appendChild(mark);
    el.appendChild(label);
    layer.appendChild(el);
    nodes.push({ el, mark, label, alive: false, age: 0, life: 1, x: 0, y: 0, vy: 0, vx: 0, oy: 0,
      targetId: null, entity: null, wx: 0, wz: 0, damage: 0, damageClass: null });
  }
  let head = 0;
  let activeCount = 0;

  function retire(n) {
    if (!n || !n.alive) return;
    n.alive = false;
    if (activeCount > 0) activeCount--;
    n.el.style.display = 'none';
    n.label.textContent = '';
    n._sfHudTransform = '';
    n._sfOpacity = '';
  }

  function spawn(text, cls, wx, wz, targetId, opts) {
    opts = opts || {};
    // Damage numbers honor their toggle; control receipts (hit pips, counters) are feedback the
    // control itself owes the pilot and answer to their own keys.
    if (!opts.controlReceipt && (!state.settings || state.settings.showDamageNumbers === false
      || state.settings.gameplay?.damageNumbers === false)) return;
    if (opts.controlReceipt === 'pip' && state.settings?.gameplay?.hitPips === false) return;
    let n = null;
    for (let k = 0; k < POOL; k++) { const idx = (head + k) % POOL; if (!nodes[idx].alive) { n = nodes[idx]; head = (idx + 1) % POOL; break; } }
    if (!n) { n = nodes[head]; head = (head + 1) % POOL; retire(n); }   // steal oldest-ish
    activeCount++;
    n.alive = true; n.age = 0; n.life = opts.life || 0.95;
    n.targetId = targetId != null ? targetId : null;
    n.entity = targetId != null ? state.entities.get(targetId) : null;
    n.damage = opts.damage || 0;
    n.damageClass = opts.damageClass || null;
    n.wx = wx; n.wz = wz;
    n.vy = -(opts.vy != null ? opts.vy : 48);      // px/s rise
    n.vx = (Math.random() - 0.5) * 26;
    n.oy = opts.oy || 0;                            // birth offset — a callout can open clear of the hit number
    // Control receipts are flat marks — the rise animation belongs to damage numbers.
    n.el.className = 'sf-ft ' + cls;
    n.label.textContent = text;
    n.el.style.display = 'block';
    n.el.style.opacity = '1';
    n.el.style.transform = 'translate3d(0,0,0) translate(-50%,-50%)';
    n._sfHudTransform = 'translate3d(0,0,0) translate(-50%,-50%)';
    n._sfOpacity = '1';
    n.x = 0; n.y = 0;
    return n;
  }

  // ---- event hooks ----------------------------------------------------------------------------
  function dmgColor(p) {
    if (p.isPlayer) return 'sf-ft--player';
    if (p.brokeShield || p.kind === 'shield') return 'sf-ft--shield';
    return 'sf-ft--hull';
  }
  // FB-019: the hit pip is a control receipt, not a damage number — it paints a three-state
  // layer mark (ring = shield, diamond = armor, solid square = hull; the damageIndicators
  // geometry, ~10px, drawn via the pooled node's shared svg) at the impact for 120 ms, gated
  // by the same 40 ms per-target gap the layer voice uses so eye and ear agree. It answers its
  // own gameplay.hitPips key and stays lit when damage numbers are off. flashReduce holds the
  // mark longer at lower brightness instead of flashing it.
  const pipBook = Object.create(null);
  on('combat:damage', (p) => {
    if (!p) return;
    const amount = Number.isFinite(p?.applied) ? p.applied : Number(p?.amount) || 0;
    const playerCaused = p.attackerId === state.playerId
      || (p.provenance && p.provenance.actorId === state.playerId);
    const onPlayer = p.targetId === state.playerId;
    if (playerCaused && !onPlayer && p.targetId != null) {
      const layerWord = damageLayer(p) || (p.brokeShield ? 'shield' : null);
      if (layerWord && admitLayerVoice(pipBook, p.targetId, layerWord, (state.simTime || 0) * 1000)) {
        const e = state.entities.get(p.targetId);
        const wx = e ? e.pos.x : (p.pos && p.pos.x); const wz = e ? e.pos.z : (p.pos && p.pos.z);
        if (wx != null) {
          const calm = state.settings?.accessibility?.flashReduce === true;
          // The shape rides the class (sf-ft--pip-shield/armor/hull reveals the matching drawn
          // mark); the pip itself carries no words.
          spawn('', `sf-ft--pip sf-ft--pip-${layerWord}${calm ? ' sf-ft--pip-calm' : ''}`,
            wx, wz, p.targetId,
            { life: calm ? 0.18 : 0.12, vy: 0, controlReceipt: 'pip' });
        }
      }
    }
    if (amount <= 0 || state.settings?.gameplay?.damageNumbers === false
      || state.settings?.showDamageNumbers === false) return;
    const e = p.targetId != null ? state.entities.get(p.targetId) : null;
    const playerHit = p.targetId === state.playerId;
    if (state.run?.ruleset === 'swarm' && !playerHit && p.attackerId !== state.playerId
      && p.provenance?.actorId !== state.playerId) return;
    const wx = e ? e.pos.x : (p.pos && p.pos.x); const wz = e ? e.pos.z : (p.pos && p.pos.z);
    if (wx == null) return;
    const cls = playerHit ? 'sf-ft--player' : dmgColor(p);
    // Shotgun pellets and rapid hits share one short burst total per hull/layer. The
    // initial hit appears immediately; aggregation never delays damage acknowledgement.
    for (const n of nodes) {
      if (!e || !n.alive || n.entity !== e || n.damageClass !== cls || n.age > 0.14 || !n.damage) continue;
      n.damage += amount;
      n.label.textContent = String(Math.round(n.damage));
      n.el.className = 'sf-ft ' + cls + (n.damage >= 25 ? ' sf-ft--big' : '');
      return;
    }
    const big = amount >= 25 || p.killing;
    spawn(String(Math.round(amount)), cls + (big ? ' sf-ft--big' : ''), wx, wz, p.targetId,
      { life: big ? 0.95 : 0.72, vy: big ? 58 : 42, damage: amount, damageClass: cls });
  }, { presentation: true });
  // INST-14: "SHIELD DOWN" does not float over the fight; alerts/voice floor owns shield-break telemetry.
  on('entity:killed', (p) => { if (p && p.pos) spawn('DESTROYED', 'sf-ft--kill', p.pos.x, p.pos.z, null, { life: 1.3, vy: 26 }); }, { presentation: true });
  // Weak-point hit (BP-02): a player shot landed in the target's exposed subsystem arc. Callout at the
  // hit so the bonus reads as skill, not noise. targetId lets it ride the target's screen motion.
  // The callout rises faster than the damage numbers (42-58 px/s) so the two never stack on the
  // same hull — the skill read climbs clear of the arithmetic.
  on('combat:weakPointHit', (p) => {
    const spec = weakPointFloatingTextSpec(p);
    if (!spec) return;
    // Accent the existing callout; combat:damage remains the sole damage-number receipt.
    // The -16 px birth offset plus the faster rise keep the skill read clear of the number.
    spawn(spec.text, spec.cls, p.pos.x, p.pos.z, p.targetId, { life: 1.0, vy: 66, vx: 18, oy: -16 });
  });
  // Direct-to-cargo mining never fires pickup:collected, so this is the only on-screen yield
  // receipt — always name the commodity (bare "+1" is opaque; cargo hold is the real ledger).
  on('mining:yield', (p) => {
    const reported = miningYieldReportedAmount(p);
    if (!p || !p.pos || !(reported > 0)) return;
    if (p.minerId != null && p.minerId !== state.playerId) return;
    const def = CMDTY_BY_ID[p.commodityId];
    const name = def ? def.name : (p.commodityId || 'Ore');
    const cat = def ? def.category : '';
    const cls = (cat === 'raw ore' || cat === 'crystal') ? 'sf-ft--ore'
      : cat === 'exotic' ? 'sf-ft--exotic'
      : 'sf-ft--pickup';
    const rich = p.richCore ? ' sf-ft--big' : '';
    spawn('+' + reported + ' ' + name, cls + rich, p.pos.x, p.pos.z, null, {
      life: p.richCore ? 1.35 : 1.05,
      vy: p.richCore ? 48 : 40,
    });
  });
  on('loot:drop', (p) => { if (p && p.pos && p.credits > 0) spawn('+' + p.credits + ' cr', 'sf-ft--credits', p.pos.x, p.pos.z, null, { life: 1.4, vy: 36 }); });
  // Combat ore a full hold refused pays credits (combat.arcadeLoot): show the payout where it landed.
  on('loot:overflowConverted', (p) => {
    if (p && p.pos && p.credits > 0) spawn('+' + p.credits + ' cr', 'sf-ft--credits', p.pos.x, p.pos.z, null, { life: 1.2, vy: 38 });
  });
  // A rated trick mints its claim chit at the contact site — mark the mint so the payout reads
  // where it happened, not only when the chit is later scooped.
  on('loot:drop', (p) => {
    if (!p || !p.pos || !Array.isArray(p.items)) return;
    const rights = salvageRightsItemsOf(p.items).reduce((n, it) => n + (Number(it.salvageRights) || 0), 0);
    if (rights > 0) spawn('+' + rights + ' SALVAGE RIGHTS', 'sf-ft--rights', p.pos.x, p.pos.z, null, { life: 1.4, vy: 36 });
  });
  // Dash feedback is pure world VFX (violet afterburner burst in render/vfx.js) — no floating
  // "DASH" label; word-pop combat juice reads as arcade-corny for a thruster impulse.

  // ---- bounty / kill credits ----------------------------------------------------------------
  on('entity:killed', (p) => {
    if (!p || !p.pos || !p.bountyCr || p.killerId !== state.playerId) return;
    // Gold "+800 CR" floating text at the kill site
    spawn('+' + p.bountyCr + ' CR', 'sf-ft--bounty', p.pos.x, p.pos.z, null, { life: 1.6, vy: 30 });
    // Toast: "Enemy Destroyed · +800 CR"
    const label = (p.victimClass === 'capital' || p.victimClass === 'large') ? 'Capital Destroyed' : 'Enemy Destroyed';
    bus.emit('toast', { text: label + ' · +' + p.bountyCr + ' CR', kind: 'credits', ttl: 3.5 });
  }, { presentation: true });

  // ---- pickup collected (ore / cargo / module) ----------------------------------------------
  on('pickup:collected', (p) => {
    if (!p || p.collectorId !== state.playerId) return;
    const spec = pickupFloatingTextSpec(p);
    if (!spec || !p.pos) return;
    spawn(spec.text, spec.cls, p.pos.x, p.pos.z, null, { life: 1.2, vy: 38 });
  });

  // ---- faction rep changes ------------------------------------------------------------------
  on('faction:repChanged', (p) => {
    if (!p || !p.delta) return;
    const kind = p.delta > 0 ? 'good' : 'danger';
    bus.emit('toast', { text: factionRepToastText(state, p), kind, ttl: 3.5 });
  });

  // ---- comms log (was emit-only: rescue acks, survey/rumor lines, cargo barks) -----------------
  const commsLogUnsubscribe = bindCommsLogToasts(bus);
  if (typeof commsLogUnsubscribe === 'function') unsubscribers.push(commsLogUnsubscribe);

  // ---- cargo full ---------------------------------------------------------------------------
  on('cargo:full', (p) => {
    bus.emit('toast', { text: 'CARGO FULL', kind: 'warn', ttl: 3.5 });
  });

  // ---- economy events (market alerts) -------------------------------------------------------
  on('economy:eventStarted', (p) => {
    if (!p) return;
    const cmdty = CMDTY_BY_ID[p.commodityId];
    const station = STATION_BY_ID[p.stationId];
    const cmdtyName = cmdty ? cmdty.name : (p.commodityId || 'Unknown');
    const stationName = station ? station.name : (p.stationId || 'Unknown');
    const typeLabel = p.type ? p.type.toUpperCase() : 'EVENT';
    const kind = (p.type === 'shortage' || p.type === 'blockade' || p.type === 'piracy') ? 'warn' : 'info';
    bus.emit('toast', { text: 'MARKET ALERT: ' + cmdtyName + ' ' + typeLabel + ' at ' + stationName, kind, ttl: 5 });
  });

  // No receipt when a market event ends: the payload carries only an id, so the line could not say
  // which commodity or station it meant. The start alert above is the one that names them.

  // Session boundary (SF-283): pooled floats live when a save loads or a new run starts were
  // minted by the pre-save session — retire them rather than letting them finish their drift
  // over the restored scene at stale world anchors.
  for (const name of ['save:loaded', 'game:new', 'game:newGame']) {
    on(name, () => { for (const n of nodes) retire(n); });
  }

  // Spawn-pop: numbers arrive on the system's snap spring (ORRERY §3.5 — stiffness 420, damping
  // 38, mass 1), computed closed-form from the spring's step response so the per-frame transform
  // stays the single owner of motion: the numeral lands at 1.3, overshoots just under its rest
  // size once, and settles — one snap, never a bare ease. Driven here (not via a CSS keyframe)
  // because the per-frame transform update already owns the element's transform — folding the
  // scale in keeps a single source of truth and never fights the position transform.
  const SNAP_W = Math.sqrt(420);            // natural frequency ≈ 20.494
  const SNAP_ZETA = 38 / (2 * SNAP_W);      // ≈ 0.927 — the preset's one-overshoot damping
  const SNAP_WD = SNAP_W * Math.sqrt(1 - SNAP_ZETA * SNAP_ZETA);
  const SNAP_DECAY = SNAP_ZETA * SNAP_W;
  const SNAP_RATIO = SNAP_DECAY / SNAP_WD;
  function popScale(age) {
    if (age <= 0) return 1.3;
    const t = Math.min(age, 1.2);
    return 1 + 0.3 * Math.exp(-SNAP_DECAY * t)
      * (Math.cos(SNAP_WD * t) + SNAP_RATIO * Math.sin(SNAP_WD * t));
  }

  function update(dt) {
    if (activeCount <= 0) return;
    if (!helpers.worldToScreen) return;
    // Viewport for the edge-overshoot fade — the same measures worldToScreen maps NDC against.
    const vw = typeof window !== 'undefined' && Number.isFinite(window.innerWidth) ? window.innerWidth : 1280;
    const vh = typeof window !== 'undefined' && Number.isFinite(window.innerHeight) ? window.innerHeight : 720;
    for (let i = 0; i < POOL; i++) {
      const n = nodes[i];
      if (!n.alive) continue;
      n.age += dt;
      if (n.age >= n.life) { retire(n); continue; }
      // follow the entity if it still exists, else stay at the world point. A dead or
      // recycled entity must not carry the float — entities.get confirms it is still the
      // live occupant for its id, and a stripped pos falls back to the recorded anchor.
      let wx = n.wx, wz = n.wz;
      if (n.entity && n.entity.alive !== false && n.entity.pos
        && state.entities.get(n.targetId) === n.entity) { wx = n.entity.pos.x; wz = n.entity.pos.z; }
      _ftWorld.x = wx; _ftWorld.z = wz;
      const s = helpers.worldToScreen(_ftWorld, _ftScreen);
      const t = n.age / n.life;
      const rise = n.vy * n.age + n.oy;     // integrated rise (px), plus the birth offset
      const drift = n.vx * n.age;
      const reduced = state.settings?.video?.motionReduce;
      const sc = reduced ? 1 : popScale(n.age);
      const nextTransform = `translate3d(${s.x + drift}px,${s.y + rise}px,0) translate(-50%,-50%) scale(${sc})`;
      if (n._sfHudTransform !== nextTransform) {
        n._sfHudTransform = nextTransform;
        n.el.style.transform = nextTransform;
      }
      // Edge-overshoot fade (was a binary onScreen gate): a float straddling the frustum edge
      // strobed between its fade value and 0 every frame as onScreen flipped. It now dims over
      // ~12% of the viewport past each edge. A failed projection — non-finite coords or the
      // {0,0} sentinel — still paints nothing.
      let nextOpacity = '0';
      const ex = s.x + drift;
      const ey = s.y + rise;
      if (Number.isFinite(ex) && Number.isFinite(ey)
        && (s.onScreen !== false || s.x !== 0 || s.y !== 0)) {
        const overX = Math.max(0, Math.abs(ex - vw * 0.5) - vw * 0.5) / (vw * 0.12);
        const overY = Math.max(0, Math.abs(ey - vh * 0.5) - vh * 0.5) / (vh * 0.12);
        const over = Math.max(overX, overY);
        nextOpacity = String(over >= 1 ? 0 : (1 - t * t) * (1 - over));
      }
      if (n._sfOpacity !== nextOpacity) {
        n._sfOpacity = nextOpacity;
        n.el.style.opacity = nextOpacity;
      }
    }
  }

  return {
    update,
    _activeCount() { return activeCount; },
    destroy() {
      for (const unsubscribe of unsubscribers.splice(0)) {
        try { unsubscribe(); } catch (_) { /* bus teardown is best effort */ }
      }
      for (const n of nodes) retire(n);
      if (layer.parentNode) layer.parentNode.removeChild(layer);
    },
  };
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  // ORRERY lease (design/frontend/ORRERY.md §3): transient combat text speaks in the system's
  // voices only — numerals in the Archivo tabular face (--dp-face-numeral, never mono), colours
  // from the --dp-* root. The temperature grammar: cool ice = the shield reading (data in
  // motion), phosphor = the plain reading, warm lamp = money you earned and the skill callout,
  // danger red = damage taken (threat only). Legibility over the world is the one sanctioned
  // black keyline (--dp-text-legible), never a coloured glow.
  s.textContent = `
  /* Layering (ARCHITECTURE §1.2 via src/ui/AGENTS.md): floats are world-anchored transients, so
     they live in the z11–14 band with the lock diamond, lead pip and damage markers — never above
     the prompt deck (z20) or a decision ladder. */
  #sf-floattext { position:absolute; inset:0; pointer-events:none; z-index:14; overflow:hidden; }
  .sf-ft { position:absolute; left:0; top:0; transform:translate3d(0,0,0) translate(-50%,-50%);
    font-family:var(--dp-face-numeral, var(--dp-face-read, "Archivo", sans-serif));
    font-weight:620; font-variant-numeric:tabular-nums lining-nums;
    font-size:16px; letter-spacing:.01em; white-space:nowrap; will-change:transform,opacity;
    text-shadow:0 0 6px rgb(0 0 0 / .92), var(--dp-text-legible, 0 1px 0 rgb(0 0 0 / .5)); }
  .sf-ft--hull { color:var(--dp-phos, #dfeeff); }
  /* FB-019 hit pips — control receipts, not damage numbers. One drawn mark per layer at the
     impact: ring for shield work, diamond outline for armor bite, solid square for hull — the
     damageIndicators geometry, ~10px. Flat marks, no rise. The layer trio rides the same tokens
     damageIndicators resolves (--dp-ice / --dp-lamp / --dp-danger), so eye and ear agree. */
  .sf-ft--pip { position:absolute; left:0; top:0; line-height:1;
    pointer-events:none; text-shadow:0 0 6px rgb(0 0 0 / .85); will-change:transform,opacity; }
  .sf-ft--pip-shield { color:var(--dp-ice, var(--sf-shield, #39d0ff)); }
  .sf-ft--pip-armor { color:var(--dp-lamp, var(--sf-warn, #ffb35c)); }
  .sf-ft--pip-hull { color:var(--dp-danger, var(--sf-danger, #ff5c5c)); }
  .sf-ft--pip-calm { opacity:.6; }
  /* The shared drawn-shape svg every pooled node carries; the spawn class reveals one shape. */
  .sf-ft-mark { display:none; vertical-align:middle; }
  .sf-ft-mark > svg { display:block; width:100%; height:100%; }
  .sf-ft-shape { display:none; }
  .sf-ft--pip .sf-ft-mark { display:inline-block; width:10px; height:10px; }
  .sf-ft--pip-armor .sf-ft-mark { width:11px; height:11px; }
  .sf-ft--pip-shield .sf-ft-shape-shield,
  .sf-ft--pip-armor .sf-ft-shape-armor,
  .sf-ft--pip-hull .sf-ft-shape-hull { display:block; }
  /* Weak-point callout: the indicator's critical alert ring leads the CRIT word. */
  .sf-ft--critical .sf-ft-mark { display:inline-block; width:13px; height:13px; margin-right:5px; }
  .sf-ft--critical .sf-ft-shape-crit { display:block; }
  .sf-ft--shield { color:var(--dp-ice, #8fcbff); font-size:14px; }
  .sf-ft--player { color:var(--dp-danger, #ff5038); font-size:18px; }
  .sf-ft--big { font-size:24px; }
  .sf-ft--kill { color:var(--dp-lamp-hot, #ffd98c); font-size:15px; font-weight:700;
    letter-spacing:.08em; text-shadow:0 0 6px rgb(0 0 0 / .92), var(--dp-text-legible, 0 1px 0 rgb(0 0 0 / .5)); }
  .sf-ft--weak { color:var(--dp-lamp, #f2b950); font-size:13px; font-weight:800; letter-spacing:.08em;
    text-shadow:0 0 6px rgb(0 0 0 / .92), var(--dp-text-legible, 0 1px 0 rgb(0 0 0 / .5)); }
  .sf-ft--critical { color:var(--dp-lamp-hot, #ffd98c); font-size:15px; font-weight:900;
    text-shadow:0 0 6px rgb(0 0 0 / .92), var(--dp-text-legible, 0 1px 0 rgb(0 0 0 / .5)); }
  /* Mundane yields read warm bone-dim — the etched family at rest (ORRERY §3.3: rest light is warm
     bone, the cold note is for data in motion). The pick ladder: ore=bone-dim, pickup=ink,
     exotic=phos, credits/bounty=lamp. */
  .sf-ft--ore { color:var(--dp-ink-dim, #b7b4a6); }
  .sf-ft--credits { color:var(--dp-lamp, #f2b950); font-size:15px; }
  .sf-ft--bounty { color:var(--dp-lamp, #f2b950); font-size:18px; font-weight:800; letter-spacing:.06em;
    text-shadow:0 0 6px rgb(0 0 0 / .92), var(--dp-text-legible, 0 1px 0 rgb(0 0 0 / .5)); }
  .sf-ft--exotic { color:var(--dp-phos, #dfeeff); font-size:15px; font-weight:700; }
  .sf-ft--module { color:var(--dp-ink-dim, #b7b4a6); font-size:15px; }
  .sf-ft--rights { color:var(--dp-lamp, #f2b950); font-size:14px; letter-spacing:.05em; }
  .sf-ft--pickup { color:var(--dp-ink, #e8e2d4); font-size:14px; }
  `;
  document.head.appendChild(s);
}
