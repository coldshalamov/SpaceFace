// Compact sector-law + authority response presenter.
//
// Read-only over simulation state. The lawSecurity system remains the sole incident/AI authority;
// this module renders its public events and the shared sectorLawProfile contract using sim time.
import { FACTION_META } from '../data/factions.js';
import { SECTORS } from '../data/sectors.js';
import { sectorLawProfile } from './securityReadout.js';

const STYLE_ID = 'sf-sector-law-style';
const ENTRY_TTL_S = 5;
const RECEIPT_TTL_S = 4;
const FACTION_BY_ID = new Map(FACTION_META.map((f) => [f.id, f]));

function entityById(state, id) {
  if (!state || id == null) return null;
  if (state.entities && typeof state.entities.get === 'function') return state.entities.get(id) || null;
  return (state.entityList || []).find((entity) => entity && entity.id === id) || null;
}

function entityName(entity) {
  const data = entity && entity.data || {};
  return String(data.callsign || data.displayName || data.name || entity && entity.name || '').trim();
}

function factionName(id) {
  const faction = FACTION_BY_ID.get(id);
  return String(faction && faction.name || id || 'Unknown authority').replace(/^faction_/, '');
}

function stationName(state, stationId) {
  for (const sector of SECTORS) {
    const station = (sector.stations || []).find((row) => row.id === stationId);
    if (station) return station.name;
  }
  const entity = (state && state.entityList || []).find((row) => row && (row.data && row.data.stationId || row.stationId || row.id) === stationId);
  return entityName(entity) || String(stationId || 'protected station').replace(/^station_/, '').replace(/_/g, ' ');
}

export function authorityTargetText(payload, state) {
  if (!payload || payload.attackerId == null) return 'UNKNOWN AGGRESSOR';
  if (payload.attackerId === state.playerId) {
    return /^player_(assault|piracy)$/.test(String(payload.cause || '')) ? 'YOU · AGGRESSOR' : 'YOU · INCIDENT SUBJECT';
  }
  return entityName(entityById(state, payload.attackerId)) || `CONTACT ${String(payload.attackerId).toUpperCase()}`;
}

function causeText(cause) {
  switch (String(cause || '')) {
    case 'player_assault': return 'Patrol assault inside protected jurisdiction';
    case 'player_piracy': return 'Attack on a protected civilian';
    case 'npc_piracy': return 'Civilian distress inside protected jurisdiction';
    case 'hostile_fire': return 'Hostile fire inside protected jurisdiction';
    case 'self_defense': return 'Self-defense response';
    default: return 'Verified aggression inside protected jurisdiction';
  }
}

export function authorityIncidentReadout(payload, state, simTime = state && state.simTime || 0) {
  if (!payload || !payload.id) return null;
  // A player may only be presented as an enforcement target when the incident's canonical cause
  // proves player aggression. Never turn a neutral-player payload into an invented police pursuit.
  if (payload.attackerId === state.playerId
    && !/^player_(assault|piracy)$/.test(String(payload.cause || ''))) return null;
  const target = authorityTargetText(payload, state || {});
  const authority = factionName(payload.factionId);
  const station = stationName(state, payload.stationId);
  const status = String(payload.status || 'distress');
  const eta = payload.dispatchAt == null ? null : Math.max(0, Number(payload.dispatchAt) - Number(simTime || 0));
  const units = Array.isArray(payload.responderIds) ? payload.responderIds.length : 0;
  if (status === 'resolved') {
    const disengaged = payload.outcome === 'disengaged';
    return Object.freeze({
      mode: 'receipt', danger: false,
      flag: 'AUTHORITY RECEIPT', authority, station, target,
      headline: disengaged ? 'CONTACT BROKEN · PATROL STOOD DOWN' : 'THREAT CLEARED · APPROACH SECURE',
      detail: disengaged ? 'Aggressor cleared the station ring.' : 'Incident target is no longer active.',
      statusText: 'RESOLVED', eta: null,
    });
  }
  if (status === 'responding') {
    return Object.freeze({
      mode: 'incident', danger: true,
      flag: 'INTERCEPT ACTIVE', authority, station, target,
      headline: `${units} PATROL UNIT${units === 1 ? '' : 'S'} INTERCEPTING`,
      detail: causeText(payload.cause), statusText: 'WEAPONS AUTHORIZED', eta: null,
    });
  }
  if (status === 'monitoring') {
    return Object.freeze({
      mode: 'incident', danger: true,
      flag: 'DISTRESS ACTIVE', authority, station, target,
      headline: 'NO PATROL IN RANGE',
      detail: `${causeText(payload.cause)} · distress remains active.`, statusText: 'NO ETA', eta: null,
    });
  }
  return Object.freeze({
    mode: 'incident', danger: true,
    flag: 'DISTRESS LOGGED', authority, station, target,
    headline: 'PATROL DISPATCH PENDING',
    detail: causeText(payload.cause), statusText: eta == null ? 'ETA —' : `ETA ${eta.toFixed(1)} S`, eta,
  });
}

export function directLawReceiptText(receipt) {
  if (!receipt || receipt.incidentId) return null;
  switch (receipt.outcome) {
    case 'protected_withdrawal': return 'CONTACT WITHDREW · station protection prevented return fire';
    case 'retaliation_authorized': return 'SELF-DEFENSE AUTHORIZED · you fired first; break contact to disengage';
    default: return receipt.text ? String(receipt.text).replace(/\s+/g, ' ').trim() : null;
  }
}

export function createSectorLawPresenter(ctx) {
  const { state, bus } = ctx;
  injectStyle();
  const root = document.createElement('aside');
  root.id = 'sf-sector-law';
  root.hidden = true;
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');
  root.setAttribute('aria-atomic', 'true');
  root.innerHTML = `
    <div class="sf-law__head"><span data-k="flag">SECTOR LAW</span><span data-k="status">—</span></div>
    <div class="sf-law__headline" data-k="headline">—</div>
    <div class="sf-law__meta" data-k="meta">—</div>
    <div class="sf-law__detail" data-k="detail">—</div>`;
  document.getElementById('ui-root').appendChild(root);
  const els = Object.fromEntries(['flag', 'status', 'headline', 'meta', 'detail'].map((key) => [key, root.querySelector(`[data-k=${key}]`)]));
  let active = null;
  let lastEtaText = '';

  function text(el, value) {
    const next = String(value == null ? '' : value);
    if (el.textContent !== next) el.textContent = next;
  }

  function hide() {
    root.hidden = true;
    root.className = '';
    active = null;
    lastEtaText = '';
  }

  function showSector(sectorId) {
    const id = sectorId || state.world && state.world.currentSectorId;
    if (!id || state.mode !== 'flight' || state.ui && state.ui.docked) return false;
    const profile = sectorLawProfile(state, id);
    active = { mode: 'entry', hideAt: Number(state.simTime || 0) + ENTRY_TTL_S, profile };
    root.className = `sf-law--entry sf-law--${profile.levelKey}`;
    text(els.flag, 'SECTOR LAW');
    text(els.status, profile.level);
    text(els.headline, profile.sectorName.toUpperCase());
    text(els.meta, `JURISDICTION · ${profile.authority.toUpperCase()}`);
    text(els.detail, `${profile.illegal} ${profile.response}`);
    root.setAttribute('aria-label', `${profile.sectorName}. ${profile.level}. Jurisdiction: ${profile.authority}. ${profile.illegal} ${profile.response}`);
    root.hidden = false;
    return true;
  }

  function renderIncident(payload) {
    const view = authorityIncidentReadout(payload, state, state.simTime);
    if (!view) return false;
    active = { mode: view.mode, incident: { ...payload }, hideAt: view.mode === 'receipt' ? Number(state.simTime || 0) + RECEIPT_TTL_S : Infinity };
    root.className = view.danger ? 'sf-law--incident sf-law--danger' : 'sf-law--receipt';
    text(els.flag, view.flag);
    text(els.status, view.statusText);
    text(els.headline, view.headline);
    text(els.meta, `${view.authority.toUpperCase()} · ${view.station.toUpperCase()} · AGGRESSOR ${view.target}`);
    text(els.detail, view.detail);
    root.setAttribute('aria-label', `${view.flag}. ${view.headline}. Authority ${view.authority}. Aggressor ${view.target}. ${view.detail}. ${view.statusText}.`);
    lastEtaText = view.statusText;
    root.hidden = false;
    return true;
  }

  function showDirectReceipt(receipt) {
    const receiptText = directLawReceiptText(receipt);
    if (!receiptText) return false;
    active = { mode: 'receipt', hideAt: Number(state.simTime || 0) + RECEIPT_TTL_S };
    root.className = receipt.outcome === 'retaliation_authorized' ? 'sf-law--receipt sf-law--danger' : 'sf-law--receipt';
    text(els.flag, 'AUTHORITY RECEIPT');
    text(els.status, receipt.outcome === 'retaliation_authorized' ? 'SELF-DEFENSE' : 'STAND DOWN');
    text(els.headline, receiptText);
    text(els.meta, receipt.stationId ? stationName(state, receipt.stationId).toUpperCase() : 'OUTSIDE PROTECTED JURISDICTION');
    text(els.detail, receipt.cause === 'player_attack' ? 'Cause: player fired first.' : 'Incident closed.');
    root.setAttribute('aria-label', `${receiptText}. ${els.detail.textContent}`);
    root.hidden = false;
    return true;
  }

  function tick() {
    if (!active) return;
    if (state.mode !== 'flight' || state.ui && state.ui.docked) { hide(); return; }
    const now = Number(state.simTime || 0);
    if (active.hideAt <= now) { hide(); return; }
    if (active.mode === 'incident' && active.incident && active.incident.status === 'distress') {
      const view = authorityIncidentReadout(active.incident, state, now);
      if (view && view.statusText !== lastEtaText) {
        lastEtaText = view.statusText;
        text(els.status, view.statusText);
      }
    }
  }

  bus.on('sector:enter', (payload = {}) => showSector(payload.sectorId));
  bus.on('game:started', () => showSector(state.world && state.world.currentSectorId));
  bus.on('law:distressRaised', renderIncident);
  bus.on('law:dispatchStarted', renderIncident);
  bus.on('law:incidentResolved', renderIncident);
  bus.on('law:incidentReceipt', showDirectReceipt);
  bus.on('pirateParley:demand', () => { if (active && active.mode === 'entry') hide(); });
  bus.on('signal:scanResults', () => { if (active && active.mode === 'entry') hide(); });
  bus.on('game:new', hide);
  bus.on('game:load', hide);

  return { el: root, tick, hide, showSector, renderIncident, showDirectReceipt };
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
  #sf-sector-law { position:absolute; top:112px; right:16px; width:min(390px, calc(100vw - 32px)); z-index:1070;
    box-sizing:border-box; padding:9px 11px 10px; pointer-events:none; contain:layout paint style;
    background:rgba(5,9,18,.92); border:1px solid rgba(57,208,255,.34); border-left:3px solid #39d0ff;
    color:#d7e6ff; font-family:var(--mono,Consolas,monospace); transition:opacity .16s ease-out, transform .16s ease-out; }
  #sf-sector-law[hidden] { display:none !important; }
  .sf-law__head { display:flex; justify-content:space-between; gap:12px; font-size:9px; letter-spacing:.14em; color:#39d0ff; }
  .sf-law__headline { margin-top:5px; font-size:14px; line-height:1.25; letter-spacing:.04em; }
  .sf-law__meta { margin-top:3px; font-size:9px; line-height:1.35; letter-spacing:.08em; color:#84a0c8; }
  .sf-law__detail { margin-top:4px; font-size:10px; line-height:1.4; color:#b7c9e3; }
  #sf-sector-law.sf-law--medium, #sf-sector-law.sf-law--low { border-color:rgba(255,179,92,.44); border-left-color:#ffb35c; }
  #sf-sector-law.sf-law--medium .sf-law__head, #sf-sector-law.sf-law--low .sf-law__head { color:#ffb35c; }
  #sf-sector-law.sf-law--lawless, #sf-sector-law.sf-law--danger { border-color:rgba(255,92,92,.5); border-left-color:#ff5c5c; }
  #sf-sector-law.sf-law--lawless .sf-law__head, #sf-sector-law.sf-law--danger .sf-law__head { color:#ff5c5c; }
  #sf-sector-law.sf-law--receipt .sf-law__headline { color:#39d0ff; font-size:12px; }
  @media (max-width:900px), (max-height:620px) {
    #sf-sector-law { top:78px; left:12px; right:12px; width:auto; padding:8px 10px; }
    .sf-law__headline { font-size:12px; }
    .sf-law__detail { font-size:9px; }
  }
  @media (prefers-reduced-motion:reduce) { #sf-sector-law { transition:none; } }`;
  document.head.appendChild(style);
}

export default createSectorLawPresenter;
