// src/ui/screens/shipyard.js — STATION "Shipyard" tab panel.
// Premium 3D engineering view: hull carousel, central 3D stage with power-flow beams,
// circular stat gauges, role/mass/cargo/combat identity chips, and purchase guidance.
// Buy/Sell emit intents; ships system owns ownership + credit charge (§0.6, §4.4).
//
// Catalog source: static SHIPS data plus the ships system for unlock checks / sell.
import { SHIPS } from '../../data/ships.js';
import { TECH_NODES } from '../../data/tech.js';
import { confirm } from '../confirm.js';
import { createListControls, buildSortHeader, sortHeaderAria } from '../listControls.js';
import { SECTORS } from '../../data/sectors.js';
import { dockInteriorIdForArchetype } from '../shipPreviewMount.js';
import { escapeHtml } from '../comms.js';
import { createShipEngineeringStage } from '../shipEngineeringStage.js';
import { createMorphLabel } from '../effects/index.js';
import { buildSlotList, getDerivedStats } from '../../systems/ships.js';

const SHIP_BY_ID = new Map(SHIPS.map((s) => [s.id, s]));
const TECH_BY_ID = new Map(TECH_NODES.map((t) => [t.id, t]));

const DRIVE_FAMILY_LABEL = {
  reaction: 'Reaction',
  gravimetric: 'Gravimetric',
  pulse_plate: 'Pulse Plate',
  torch: 'Torch',
  field_sail: 'Field Sail',
};
function driveLabelFor(def) {
  const driveId = def && def.driveId;
  if (!driveId) return '';
  if (driveId.startsWith('drive_gravimetric')) return DRIVE_FAMILY_LABEL.gravimetric;
  if (driveId.startsWith('drive_pulse_plate')) return DRIVE_FAMILY_LABEL.pulse_plate;
  if (driveId.startsWith('drive_torch')) return DRIVE_FAMILY_LABEL.torch;
  if (driveId.startsWith('drive_field_sail')) return DRIVE_FAMILY_LABEL.field_sail;
  if (driveId.startsWith('drive_reaction')) return DRIVE_FAMILY_LABEL.reaction;
  return '';
}

function fmtCr(n) { return (Math.round(n) || 0).toLocaleString('en-US'); }

function archetypeGlbForStation(stationId) {
  if (!stationId) return null;
  for (const sec of SECTORS) {
    for (const st of sec.stations || []) {
      if (st.id === stationId) return st.archetypeGlb || null;
    }
  }
  return null;
}
function techName(id) {
  const node = TECH_BY_ID.get(id);
  return (node && node.name) || String(id || 'required tech').replace(/^tech_/, '').replace(/_/g, ' ');
}

export function describeShipyardPurchase(def, player = {}, unlocked = true) {
  if (!def) {
    return {
      state: 'missing',
      disabled: true,
      label: 'Unavailable',
      title: 'Select a hull to inspect purchase options.',
    };
  }
  const credits = Math.max(0, Number(player.credits) || 0);
  const price = Math.max(0, Number(def.price) || 0);
  if (!unlocked) {
    const req = techName(def.requiresTech);
    return {
      state: 'locked',
      disabled: true,
      label: 'Research ' + req,
      title: def.name + ' requires ' + req + ' before purchase.',
    };
  }
  if (credits < price) {
    const missing = Math.max(0, price - credits);
    return {
      state: 'funding',
      disabled: true,
      label: 'Need ' + fmtCr(missing) + ' cr',
      title: def.name + ' costs ' + fmtCr(price) + ' cr. You need ' + fmtCr(missing) + ' more credits.',
    };
  }
  return {
    state: price > 0 ? 'available' : 'free',
    disabled: false,
    label: price > 0 ? 'Buy' : 'Claim',
    title: (price > 0 ? 'Buy ' : 'Claim ') + def.name + ': ' + hullPurpose(def) + ' ' + hullNextStep(def),
  };
}

function slotSummary(def) {
  const order = ['weapon', 'shield', 'engine', 'cargo', 'mining', 'utility'];
  const parts = [];
  const sizeOf = (e) => (typeof e === 'string') ? e : ((e && e.size) || '?');
  for (const t of order) {
    const arr = (def.slots && def.slots[t]) || [];
    if (arr.length) parts.push(t[0].toUpperCase() + ':' + arr.map(sizeOf).join(''));
  }
  return parts.join('  ');
}

const ROLE_DESC = {
  starter: 'Balanced beginner hull — a bit of everything.',
  mining: 'Built to extract ores with extra mining slots.',
  fighter: 'Fast and agile; trades cargo for firepower.',
  freighter: 'Maximum cargo capacity; slow but tough.',
  multirole: 'Jack-of-all-trades with flexible loadout.',
  interceptor: 'Lightning-fast pursuit craft with heavy weapons.',
  mining_barge: 'Industrial-grade extraction platform — slow, massive hold.',
  corvette: 'Armored warship with broadside batteries.',
  heavy_hauler: 'Enormous hold for bulk cargo runs.',
  explorer: 'Long-range scout with utility and sensor slots.',
  gunship: 'A wall of guns — overwhelming forward firepower.',
  battlecruiser: 'Capital-class combatant, broadside duel monster.',
  flagship: 'The ultimate command ship — unmatched in every way.',
};

function hullPurpose(def) {
  const role = def && def.role;
  switch (role) {
    case 'mining':
    case 'mining_barge':
      return 'Enables bigger mining runs by combining ore capacity with mining hardpoints.';
    case 'fighter':
    case 'interceptor':
    case 'gunship':
      return 'Enables combat contracts by trading cargo space for speed, shields, and weapons.';
    case 'freighter':
    case 'heavy_hauler':
      return 'Enables larger trade and delivery loops with more cargo space per trip.';
    case 'explorer':
      return 'Enables safer scouting and recon work with utility capacity and long-range handling.';
    case 'corvette':
    case 'battlecruiser':
    case 'flagship':
      return 'Enables harder combat and faction work with heavier hull, shields, and broad weapon slots.';
    case 'multirole':
      return 'Enables flexible play: haul, fight, mine, or scan after outfitting the right modules.';
    default:
      return 'Changes what the ship can do through cargo capacity, survivability, handling, and module slots.';
  }
}

function hullNextStep(def) {
  const slots = slotSummary(def);
  return 'After purchase: make it active, then use Outfitting to fill' + (slots ? ' ' + slots : ' its slots') + '.';
}

function slotCount(def, type) {
  return (def.slots && def.slots[type]) ? def.slots[type].length : 0;
}

function missionId(m) {
  return m && (m.id != null ? m.id : m.missionId);
}

function prettyMissionType(t) {
  if (!t) return 'Contract';
  return String(t).split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export function missionPickForShipyard(state) {
  const active = state && state.missions && Array.isArray(state.missions.active) ? state.missions.active : [];
  const trackedId = state && state.ui && state.ui.trackedMissionId;
  if (trackedId != null) {
    const tracked = active.find((m) => m && m.status === 'active' && String(missionId(m)) === String(trackedId));
    if (tracked) return { mission: tracked, tracked: true };
  }
  const fallback = active.find((m) => m && m.status === 'active') || null;
  return { mission: fallback, tracked: false };
}

export function missionHullGuide(mission) {
  if (!mission) {
    return {
      label: 'Hull Fit',
      text: 'Track a contract before buying a hull to highlight ships that match the job.',
      wants: ['cargo', 'weapon', 'utility'],
      roles: ['multirole'],
    };
  }
  switch (mission.type) {
    case 'cargo_delivery':
    case 'bulk_trade':
    case 'passenger_transport':
      return {
        label: 'Haulage Hull',
        text: 'Cargo space makes the payout clean; shields and engines keep the route from becoming an emergency.',
        wants: ['cargo', 'shield', 'engine'],
        roles: ['freighter', 'heavy_hauler', 'multirole'],
      };
    case 'mining_quota':
      return {
        label: 'Mining Hull',
        text: 'Mining slots and cargo space shorten the loop; shields keep the ore run intact.',
        wants: ['mining', 'cargo', 'shield'],
        roles: ['mining', 'mining_barge', 'multirole'],
      };
    case 'salvage_retrieval':
      return {
        label: 'Recovery Hull',
        text: 'Cargo and utility capacity matter at the wreck, with shields covering dirty approach vectors.',
        wants: ['cargo', 'utility', 'shield'],
        roles: ['explorer', 'multirole', 'freighter'],
      };
    case 'smuggling_run':
      return {
        label: 'Smuggling Hull',
        text: 'Speed, cargo, and enough shielding beat fair fights when patrols get curious.',
        wants: ['engine', 'cargo', 'shield'],
        roles: ['interceptor', 'explorer', 'multirole'],
      };
    case 'bounty_hunt':
    case 'patrol_clear':
    case 'escort':
      return {
        label: 'Combat Hull',
        text: 'Weapons make the clock honest; shields and engines decide whether the contract pays out.',
        wants: ['weapon', 'shield', 'engine'],
        roles: ['fighter', 'interceptor', 'gunship', 'corvette', 'battlecruiser', 'flagship'],
      };
    case 'recon_scan':
      return {
        label: 'Scout Hull',
        text: 'Utility capacity and engines make the sweep fast, while shields forgive hostile lanes.',
        wants: ['utility', 'engine', 'shield'],
        roles: ['explorer', 'multirole', 'interceptor'],
      };
    default:
      return {
        label: 'Mission Hull',
        text: 'Buy toward the tracked job instead of buying anonymous numbers in a vacuum.',
        wants: ['weapon', 'shield', 'cargo'],
        roles: ['multirole'],
      };
  }
}

export function describeShipyardMissionFit(def, mission) {
  if (!def || !mission) return null;
  const guide = missionHullGuide(mission);
  const hits = guide.wants.filter((slotType) => slotCount(def, slotType) > 0);
  const missing = guide.wants.filter((slotType) => slotCount(def, slotType) <= 0);
  const roleMatch = guide.roles.includes(def.role);
  const score = hits.length * 2 + (roleMatch ? 3 : 0);
  const kind = roleMatch && hits.length === guide.wants.length ? 'ok' : (hits.length >= 2 ? 'warn' : 'bad');
  const label = kind === 'ok' ? 'JOB FIT' : (kind === 'warn' ? 'WORKABLE' : 'OFF ROLE');
  const hitText = hits.length ? 'matches ' + hits.join(', ') : 'misses the requested slot families';
  const missText = missing.length ? '; missing ' + missing.join(', ') : '';
  const roleText = roleMatch ? '; role match' : '; role is ' + (def.role || 'unknown');
  return {
    kind,
    label,
    score,
    title: def.name + ' for ' + guide.label,
    body: hitText + missText + roleText + '.',
    missionType: mission.type || '',
  };
}

export function bestShipyardMissionFit(mission, ships = SHIPS) {
  if (!mission) return null;
  let best = null;
  for (const def of ships) {
    const fit = describeShipyardMissionFit(def, mission);
    if (!fit) continue;
    if (!best || fit.score > best.fit.score || (fit.score === best.fit.score && (def.tier || 0) < (best.def.tier || 0))) {
      best = { def, fit };
    }
  }
  return best;
}

// Comparison tooltip CSS (injected once)
const CMP_STYLE_ID = 'sf-sy-cmp-style';
function injectCmpStyle() {
  if (document.getElementById(CMP_STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = CMP_STYLE_ID;
  s.textContent = `
  .st-sy-cmp { position: absolute; right: 0; top: 0; width: 296px; z-index: 20;
    background: linear-gradient(180deg, rgba(11,18,32,.97), rgba(8,14,26,.97));
    border: 1px solid var(--panel-edge-2); border-radius: 8px; padding: 14px 16px;
    box-shadow: 0 8px 32px rgba(0,0,0,.6); pointer-events: none; animation: sf-fadein .15s ease both; }
  .st-sy-cmp-h { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 10px; }
  .st-sy-cmp-name { font-size: .92rem; color: #fff; font-weight: 600; }
  .st-sy-cmp-role { font-size: .62rem; letter-spacing: .1em; text-transform: uppercase; color: var(--accent); }
  .st-sy-cmp-desc { font-size: .74rem; color: var(--ink-dim); margin-bottom: 10px; line-height: 1.35; }
  .st-sy-cmp-grid { display: grid; grid-template-columns: 1.1fr 1fr .3fr 1fr; gap: 3px 8px; font-size: .8rem;
    font-family: var(--mono); }
  .st-sy-cmp-lbl { color: var(--ink-mute); font-size: .7rem; letter-spacing: .06em; text-transform: uppercase; }
  .st-sy-cmp-cur { text-align: right; color: var(--ink-dim); }
  .st-sy-cmp-arr { text-align: center; color: var(--ink-mute); font-size: .7rem; }
  .st-sy-cmp-new { text-align: right; }
  .st-sy-cmp-better { color: var(--good); }
  .st-sy-cmp-worse { color: var(--danger); }
  .st-sy-cmp-same { color: var(--ink-dim); }
  .st-sy-cmp-delta { font-size: .68rem; margin-left: 4px; }
  .st-sy-cmp-sep { grid-column: 1 / -1; height: 1px; background: var(--panel-edge); margin: 4px 0; }
  .st-sy-cmp-slots { font-size: .72rem; color: var(--ink-dim); margin-top: 8px; line-height: 1.5; }
  .st-sy-cmp-slots b { color: var(--ink); font-weight: 600; }
  .st-sy-buy { position: relative; }
  `;
  document.head.appendChild(s);
}

function roleIdentityChips(def) {
  if (!def) return [];
  const chips = [];
  chips.push({ key: 'role', label: (def.role || 'ship').replace(/_/g, ' '), title: ROLE_DESC[def.role] || '' });
  chips.push({ key: 'mass', label: def.mass + 't hull', title: 'Base hull mass before modules or cargo.' });
  chips.push({ key: 'cargo', label: def.cargo + 'u cargo', title: 'Base cargo capacity before modules.' });
  const weapons = slotCount(def, 'weapon');
  if (weapons) chips.push({ key: 'combat', label: weapons + ' weapon' + (weapons > 1 ? 's' : ''), title: 'Weapon hardpoints determine combat potential.' });
  return chips;
}

export function createShipyardPanel(ctx) {
  const root = document.createElement('div');
  root.className = 'st-panel st-shipyard';

  // ---- owned-ships strip (with Sell / Make Active) ----
  const ownedWrap = document.createElement('div');
  ownedWrap.className = 'st-sy-owned';
  ownedWrap.innerHTML = '<div class="st-sub-h">Your Hangar</div><div class="st-sy-owned-list"></div>';
  root.appendChild(ownedWrap);
  const ownedList = ownedWrap.querySelector('.st-sy-owned-list');

  // ---- job guide (preserved class for checks) ----
  const jobGuide = document.createElement('div');
  jobGuide.className = 'st-sy-guide st-sy-job-guide';
  root.appendChild(jobGuide);

  // ---- premium engineering layout ----
  const engineering = document.createElement('div');
  engineering.className = 'st-sy-engineering';
  root.appendChild(engineering);

  // Hull carousel rail
  const railWrap = document.createElement('div');
  railWrap.className = 'st-sy-rail';
  railWrap.innerHTML =
    '<div class="st-sy-rail-head">' +
      '<span class="st-sub-h">Hulls For Sale</span>' +
      '<span class="st-sy-rail-credits mono"></span>' +
    '</div>' +
    '<div class="st-sy-rail-controls"></div>' +
    '<div class="st-sy-rail-list"></div>';
  engineering.appendChild(railWrap);
  const railList = railWrap.querySelector('.st-sy-rail-list');
  const railCredits = railWrap.querySelector('.st-sy-rail-credits');
  const railControls = railWrap.querySelector('.st-sy-rail-controls');

  // Center: 3D stage + identity
  const centerWrap = document.createElement('div');
  centerWrap.className = 'st-sy-center';
  engineering.appendChild(centerWrap);

  const stageContainer = document.createElement('div');
  stageContainer.className = 'st-sy-stage-wrap';
  centerWrap.appendChild(stageContainer);

  let stage = null;
  function ensureStage() {
    if (stage) return stage;
    stage = createShipEngineeringStage(stageContainer, {
      envMap: ctx.state && ctx.state.render && ctx.state.render.envMap,
      dockId: dockInteriorIdForArchetype(archetypeGlbForStation(activeStationId)),
    });
    return stage;
  }

  const identity = document.createElement('div');
  identity.className = 'st-sy-identity';
  centerWrap.appendChild(identity);
  // Role identity morphLabel: the hull's role (FIGHTER / FREIGHTER / MINER …) morphs on selection
  // change so the eye is drawn to the new identity. One morph = one selection change (never at rest).
  const roleMount = document.createElement('span');
  roleMount.className = 'st-sy-identity-role-mount';
  const roleLabel = createMorphLabel(roleMount, { numeric: false });

  // Side: gauges + requirements
  const sideWrap = document.createElement('div');
  sideWrap.className = 'st-sy-side';
  engineering.appendChild(sideWrap);

  const requirements = document.createElement('div');
  requirements.className = 'st-sy-requirements';
  sideWrap.appendChild(requirements);

  // Comparison tooltip
  injectCmpStyle();
  const cmpPanel = document.createElement('div');
  cmpPanel.className = 'st-sy-cmp';
  cmpPanel.style.display = 'none';
  sideWrap.appendChild(cmpPanel);

  // State
  let activeStationId = null;
  let selectedDefId = null;
  let previewDefId = null;

  // Morph label for credits
  const creditsMount = document.createElement('span');
  railCredits.appendChild(creditsMount);
  const creditsLabel = createMorphLabel(creditsMount, { numeric: true });

  // Sort/filter state
  const _sort = { key: 'tier', dir: 'asc' };
  const _filter = { q: '', affordable: false };

  function applySort(key) {
    if (_sort.key === key) _sort.dir = _sort.dir === 'asc' ? 'desc' : 'asc';
    else { _sort.key = key; _sort.dir = 'asc'; }
    rebuildBuyable();
  }

  const ctrls = createListControls({
    search: true, placeholder: 'Search hulls…',
    onSearch: (q) => { _filter.q = q; rebuildBuyable(); },
    chips: [{ key: 'affordable', label: 'Affordable', active: false }],
    onChip: (key, active) => { _filter.affordable = active; rebuildBuyable(); },
  });
  railControls.appendChild(ctrls.el);

  const head = document.createElement('div');
  head.className = 'st-sy-rail-header st-row st-row-head';
  const hHull = buildSortHeader({ key: 'name', label: 'Hull', activeKey: _sort.key, dir: _sort.dir, onSort: applySort });
  hHull.className += ' c-name';
  head.appendChild(hHull);
  [['tier', 'Tier'], ['price', 'Price']].forEach(([k, label]) => {
    const h = buildSortHeader({ key: k, label, activeKey: _sort.key, dir: _sort.dir, onSort: applySort });
    h.className += ' c-num';
    head.appendChild(h);
  });
  railList.parentNode.insertBefore(head, railList);

  function isUnlocked(def) {
    const ships = ctx.registry && ctx.registry.get && ctx.registry.get('ships');
    if (ships && typeof ships.isUnlocked === 'function') return ships.isUnlocked(def);
    if (!def.requiresTech) return true;
    return (ctx.state.player.researchedNodes || []).includes(def.requiresTech);
  }

  function defaultPreviewDefId() {
    const p = ctx.state && ctx.state.player || {};
    const activeOwned = (p.ownedShips || [])[p.activeShipIndex || 0];
    if (activeOwned && SHIP_BY_ID.has(activeOwned.defId)) return activeOwned.defId;
    const unlocked = SHIPS.find((def) => isUnlocked(def));
    return (unlocked && unlocked.id) || (SHIPS[0] && SHIPS[0].id) || 'ship_kestrel';
  }

  function selectHull(defId, options = {}) {
    selectedDefId = defId;
    ensureStage();
    stage.setShip(defId);
    renderIdentity();
    renderRequirements();
    // Power flow beams: reactor -> weapon/engine/shield systems.
    const shipDef = SHIP_BY_ID.get(defId);
    const slots = shipDef ? buildSlotList(shipDef) : [];
    const beamSpecs = [];
    slots.forEach((slot, i) => {
      if (slot.type === 'weapon' || slot.type === 'shield' || slot.type === 'engine') {
        beamSpecs.push({ slotIndex: i, kind: slot.type === 'weapon' ? 'danger' : slot.type === 'shield' ? 'shield' : 'warn', active: true });
      }
    });
    stage.setPowerFlow(beamSpecs);
    if (!options.suppressPing && stage) stage.setHighlightSlot(0);
    rebuildBuyable();
  }

  function renderIdentity() {
    const def = SHIP_BY_ID.get(selectedDefId);
    if (!def) { identity.innerHTML = ''; return; }
    const chips = roleIdentityChips(def);
    const drive = driveLabelFor(def);
    // Role identity morphs on selection change (the morphLabel drives roleMount); the rest is static.
    roleLabel.set(escapeHtml(def.role || '').toUpperCase() || '—');
    identity.innerHTML =
      '<div class="st-sy-identity-role"></div>' +
      '<div class="st-sy-identity-name">' + escapeHtml(def.name) + '</div>' +
      '<div class="st-sy-identity-slots mono">' + escapeHtml(slotSummary(def)) + '</div>' +
      '<div class="st-sy-identity-purpose">' + escapeHtml(hullPurpose(def)) + '</div>' +
      '<div class="st-sy-identity-chips">' +
        chips.map((c) => '<span class="st-sy-id-chip st-sy-id-chip--' + c.key + '" title="' + escapeHtml(c.title) + '">' + escapeHtml(c.label) + '</span>').join('') +
        (drive ? '<span class="st-sy-id-chip st-sy-id-chip--drive" title="Propulsion family">' + escapeHtml(drive) + '</span>' : '') +
      '</div>';
    // Move the role morph mount into the freshly-rendered role line so it persists across rebuilds.
    const roleLine = identity.querySelector('.st-sy-identity-role');
    if (roleLine) roleLine.appendChild(roleMount);
  }

  function renderRequirements() {
    const def = SHIP_BY_ID.get(selectedDefId);
    if (!def) { requirements.innerHTML = ''; return; }
    const p = ctx.state.player;
    const unlocked = isUnlocked(def);
    const purchase = describeShipyardPurchase(def, p, unlocked);
    const mission = missionPickForShipyard(ctx.state).mission;
    const fit = describeShipyardMissionFit(def, mission);
    const owned = (p.ownedShips || []).some((o) => o.defId === def.id);

    let stateClass = 'available';
    if (purchase.disabled) stateClass = purchase.state === 'locked' ? 'locked' : (purchase.state === 'funding' ? 'funding' : 'disabled');
    if (owned) stateClass = 'owned';

    requirements.innerHTML =
      '<div class="st-sy-req-head">Purchase Requirements</div>' +
      '<div class="st-sy-req-price mono ' + (purchase.disabled && purchase.state === 'funding' ? 'st-sy-req-price--short' : '') + '">' +
        (def.price ? fmtCr(def.price) + ' CR' : 'Free hull') +
      '</div>' +
      '<div class="st-sy-req-credits mono">Credits: ' + fmtCr(p.credits || 0) + '</div>' +
      '<div class="st-sy-req-state st-sy-req-state--' + stateClass + '">' + escapeHtml(purchase.label) + '</div>' +
      '<div class="st-sy-req-title">' + escapeHtml(purchase.title) + '</div>' +
      (fit ? '<div class="st-sy-fitline st-sy-fitline--' + fit.kind + '" title="' + escapeHtml(fit.title) + '">' + escapeHtml(fit.body) + '</div>' : '') +
      '<button class="st-sy-buy-btn" data-act="buy" ' + (purchase.disabled || owned ? 'disabled' : '') + ' aria-label="' + escapeHtml(purchase.title) + '">' +
        escapeHtml(owned ? 'Owned' : purchase.label) +
      '</button>';
  }

  function renderJobGuide() {
    const pick = missionPickForShipyard(ctx.state);
    const mission = pick.mission;
    const guide = missionHullGuide(mission);
    if (!mission) {
      jobGuide.innerHTML =
        '<div><span class="st-mission-preflight-chip st-mission-preflight-chip--info">HULL FIT ADVISOR</span></div>' +
        '<div class="st-sy-job-title">No tracked contract</div>' +
        '<div class="st-sy-job-body">' + escapeHtml(guide.text) + '</div>';
      return;
    }
    const unlockedCatalog = SHIPS.filter((def) => isUnlocked(def));
    const best = bestShipyardMissionFit(mission, unlockedCatalog.length ? unlockedCatalog : SHIPS);
    const status = pick.tracked ? 'TRACKED JOB' : 'ACTIVE JOB';
    const bestText = best ? 'Best catalog fit: ' + best.def.name + ' (' + best.fit.label.toLowerCase() + ', score ' + best.fit.score + ').' : '';
    jobGuide.innerHTML =
      '<div class="st-mission-preflight">' +
        '<span class="st-mission-preflight-chip st-mission-preflight-chip--info">HULL FIT ADVISOR</span>' +
        '<span class="st-mission-preflight-chip st-mission-preflight-chip--ok">' + escapeHtml(status) + '</span>' +
        '<span class="st-mission-preflight-chip st-mission-preflight-chip--info">' + escapeHtml(guide.label.toUpperCase()) + '</span>' +
      '</div>' +
      '<div class="st-sy-job-title">' + escapeHtml(mission.title || prettyMissionType(mission.type)) + '</div>' +
      '<div class="st-sy-job-body">' + escapeHtml(guide.text + (bestText ? ' ' + bestText : '')) + '</div>';
  }

  function rebuildOwned() {
    const p = ctx.state.player;
    const frag = document.createDocumentFragment();
    (p.ownedShips || []).forEach((owned, i) => {
      const def = SHIP_BY_ID.get(owned.defId) || { name: owned.defId };
      const card = document.createElement('div');
      card.className = 'st-sy-card' + (i === p.activeShipIndex ? ' active' : '');
      card.setAttribute('data-idx', String(i));
      const refund = def.price != null ? Math.floor(((def.buyback != null ? def.buyback : def.price)) * 0.5) : 0;
      card.innerHTML =
        '<div class="st-sy-name">' + escapeHtml(owned.customName || def.name) + (i === p.activeShipIndex ? ' <span class="st-tag st-tag-active">ACTIVE</span>' : '') + '</div>' +
        '<div class="st-sy-meta mono">T' + (def.tier != null ? def.tier : '?') + ' · ' + escapeHtml(def.role || '') + '</div>' +
        '<div class="st-sy-card-purpose">' + escapeHtml(hullPurpose(def)) + '</div>' +
        '<div class="st-sy-btns">' +
          (i === p.activeShipIndex ? '' : '<button data-act="active">Make Active</button>') +
          (i === p.activeShipIndex ? '' : '<button data-act="sell">Sell (' + fmtCr(refund) + ')</button>') +
        '</div>';
      frag.appendChild(card);
    });
    ownedList.textContent = '';
    ownedList.appendChild(frag);
  }

  function rebuildBuyable() {
    const p = ctx.state.player;
    const ownedDefIds = new Set((p.ownedShips || []).map((o) => o.defId));
    const mission = missionPickForShipyard(ctx.state).mission;

    head.querySelectorAll('.sf-sort').forEach((el) => {
      const isActive = el.getAttribute('data-sk') === _sort.key;
      el.classList.toggle('active', isActive);
      el.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      el.setAttribute('aria-label', sortHeaderAria(el.getAttribute('data-label') || '', isActive, _sort.dir));
      const arrow = el.querySelector('.sf-sort__arrow');
      if (arrow) arrow.textContent = isActive ? (_sort.dir === 'asc' ? '▲' : '▼') : '↕';
    });

    const q = (_filter.q || '').trim().toLowerCase();
    let rows = SHIPS.filter((def) => {
      if (q) {
        const hay = (def.name + ' ' + (def.role || '') + ' ' + (def.id || '')).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (_filter.affordable && p.credits < (def.price || 0)) return false;
      return true;
    });
    const dir = _sort.dir === 'desc' ? -1 : 1;
    const byName = (a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    rows.sort((a, b) => {
      let v = 0;
      switch (_sort.key) {
        case 'name': v = byName(a, b); break;
        case 'tier': v = (a.tier || 0) - (b.tier || 0); break;
        case 'price': v = (a.price || 0) - (b.price || 0); break;
        default: v = (a.tier || 0) - (b.tier || 0) || byName(a, b);
      }
      return dir * v || byName(a, b);
    });

    railList.textContent = '';
    const frag = document.createDocumentFragment();
    for (const def of rows) {
      const unlocked = isUnlocked(def);
      const owned = ownedDefIds.has(def.id);
      const purchase = describeShipyardPurchase(def, p, unlocked);
      const fit = describeShipyardMissionFit(def, mission);
      const card = document.createElement('div');
      card.className = 'st-sy-rail-card' + (selectedDefId === def.id ? ' selected' : '') +
        (fit ? ' mission-fit mission-fit-' + fit.kind : '') +
        (owned ? ' owned' : '');
      card.setAttribute('data-ship', def.id);
      card.setAttribute('tabindex', '0');
      card.setAttribute('role', 'button');
      const purchaseTitle = purchase.title + (fit ? ' ' + fit.title + ': ' + fit.body : '');
      card.setAttribute('aria-label', purchaseTitle);
      card.innerHTML =
        '<div class="st-sy-rail-name">' + escapeHtml(def.name) + '</div>' +
        '<div class="st-sy-rail-meta mono">T' + def.tier + ' · ' + escapeHtml(def.role || '') + '</div>' +
        '<div class="st-sy-rail-slots mono">' + escapeHtml(slotSummary(def)) + '</div>' +
        '<div class="st-sy-rail-price mono">' + (def.price ? fmtCr(def.price) + ' CR' : 'Free') + '</div>' +
        (fit ? '<span class="st-tag st-tag-active">' + escapeHtml(fit.label.toLowerCase()) + '</span>' : '') +
        (owned ? '<span class="st-tag st-tag-owned">owned</span>' : '');
      frag.appendChild(card);
    }
    if (!frag.childElementCount) {
      const empty = document.createElement('div');
      empty.className = 'st-empty';
      empty.textContent = q ? 'No hulls match "' + q + '".' : 'No hulls available.';
      railList.appendChild(empty);
    } else {
      railList.appendChild(frag);
    }
  }

  function updateStageStats() {
    if (!stage) return;
    const p = ctx.state.player;
    const def = SHIP_BY_ID.get(selectedDefId);
    if (!def) return;
    // Candidate hull baseline stats (no modules fitted).
    const stats = getDerivedStats(selectedDefId, [], p);
    stage.setGauges({
      mass: stats.mass,
      capMax: stats.capMax,
      capRegen: stats.capRegen,
      shieldMax: stats.shieldMax,
      cargoCap: stats.cargoCap,
      maxSpeed: stats.maxSpeed,
      continuousDrain: stats.continuousDrain,
    });
    stage.setLabel('<span class="mono">T' + def.tier + '</span> · ' + escapeHtml(def.name));
  }

  // ---- event listeners ----
  ownedList.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-act]');
    if (!btn) return;
    const idx = Number(btn.closest('[data-idx]').getAttribute('data-idx'));
    const ships = ctx.registry && ctx.registry.get && ctx.registry.get('ships');
    if (btn.getAttribute('data-act') === 'sell') {
      const owned = (ctx.state.player.ownedShips || [])[idx];
      const def = owned ? SHIP_BY_ID.get(owned.defId) : null;
      const refund = def && def.price != null ? Math.floor(((def.buyback != null ? def.buyback : def.price)) * 0.5) : 0;
      const name = (owned && owned.customName) || (def && def.name) || 'this ship';
      const ok = await confirm({
        title: 'Sell ' + name + '?',
        body: 'Refund: ' + fmtCr(refund) + ' (50% of hull value). Equipped modules stay in your inventory. This cannot be undone.',
        confirmLabel: 'Sell', danger: true,
      });
      if (!ok) return;
      if (ships && typeof ships.sellShip === 'function') ships.sellShip(idx);
      else ctx.bus.emit('ui:sellShip', { index: idx });
      ctx.bus.emit('audio:cue', { id: 'ui_click' });
      refresh();
    } else if (btn.getAttribute('data-act') === 'active') {
      if (ships && typeof ships.setActiveShip === 'function') ships.setActiveShip(idx);
      else ctx.bus.emit('ui:setActiveShip', { index: idx });
      ctx.bus.emit('audio:cue', { id: 'ui_click' });
      refresh();
    }
  });

  railList.addEventListener('click', async (ev) => {
    const card = ev.target.closest('[data-ship]');
    if (!card) return;
    const btn = ev.target.closest('[data-act="buy"]');
    if (btn) {
      const defId = card.getAttribute('data-ship');
      const def = SHIP_BY_ID.get(defId);
      if (def && (def.price || 0) > 0) {
        const ok = await confirm({
          title: 'Buy ' + def.name + '?',
          body: hullPurpose(def) + '\n\nCost: ' + fmtCr(def.price || 0) + ' CR. ' + hullNextStep(def),
          confirmLabel: 'Buy',
          danger: (ctx.state.player.credits || 0) > 0 && (def.price || 0) >= (ctx.state.player.credits || 0) * 0.5,
        });
        if (!ok) return;
      }
      ctx.bus.emit('ui:buyShip', { defId });
      ctx.bus.emit('audio:cue', { id: 'ui_click' });
      return;
    }
    selectHull(card.getAttribute('data-ship'));
    ctx.bus.emit('audio:cue', { id: 'ui_click' });
  });

  requirements.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-act="buy"]');
    if (!btn || btn.disabled) return;
    const def = SHIP_BY_ID.get(selectedDefId);
    if (!def) return;
    if (def.price > 0) {
      const ok = await confirm({
        title: 'Buy ' + def.name + '?',
        body: hullPurpose(def) + '\n\nCost: ' + fmtCr(def.price || 0) + ' CR. ' + hullNextStep(def),
        confirmLabel: 'Buy',
        danger: (ctx.state.player.credits || 0) > 0 && (def.price || 0) >= (ctx.state.player.credits || 0) * 0.5,
      });
      if (!ok) return;
    }
    ctx.bus.emit('ui:buyShip', { defId: selectedDefId });
    ctx.bus.emit('audio:cue', { id: 'ui_click' });
    refresh();
  });

  railList.addEventListener('mouseover', (ev) => {
    const card = ev.target.closest('[data-ship]');
    if (!card) return;
    previewDefId = card.getAttribute('data-ship');
    if (stage && previewDefId !== selectedDefId) {
      stage.setShip(previewDefId);
      stage.setLabel('Preview: ' + escapeHtml(SHIP_BY_ID.get(previewDefId).name));
    }
  });

  railList.addEventListener('mouseleave', () => {
    if (previewDefId && previewDefId !== selectedDefId) {
      if (stage) stage.setShip(selectedDefId);
      previewDefId = null;
    }
  });

  function refresh() {
    renderJobGuide();
    rebuildOwned();
    rebuildBuyable();
    renderRequirements();
    updateStageStats();
    const p = ctx.state.player;
    creditsLabel.set(fmtCr(p.credits || 0));
    cmpPanel.style.display = 'none';
  }

  return {
    el: root,
    stationId: null,
    onShow(c) {
      if (c && c.stationId) { activeStationId = c.stationId; this.stationId = c.stationId; }
      if (!selectedDefId) selectHull(defaultPreviewDefId(), { suppressPing: true });
      refresh();
      const stg = ensureStage();
      stg.setActive(true);
      updateStageStats();
      // The stage canvas may have initialized before the tab panel had its final laid-out size;
      // re-fit on the next frame so the 3D preview + beams/gauges match the visible area.
      requestAnimationFrame(() => { try { stg.resize(); } catch (_) {} });
    },
    onHide() {
      if (stage) stage.setActive(false);
      cmpPanel.style.display = 'none';
    },
    refresh,
    dispose() { if (stage) { try { stage.dispose(); } catch (e) {} stage = null; } },
  };
}
