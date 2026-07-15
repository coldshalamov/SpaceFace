// src/ui/station/screens/contracts.js — "Contracts" ops board.
// Board list · briefing dossier (centerpiece) · active operations. Progressive disclosure:
// the list is scannable, the dossier is the full brief, no wall of text. Emits
// ui:acceptMission / ui:trackMission / ui:abandonMission {missionId}.
import { COMMODITIES } from '../../../data/commodities.js';
import { FACTION_META } from '../../../data/factions.js';
import { MISSION_TUNING, missionMinRepForRisk } from '../../../data/missions.js';
import { escapeHtml } from '../../comms.js';
import { icon } from '../icons.js';

const CMDTY = new Map(COMMODITIES.map((c) => [c.id, c]));
const FAC = new Map(FACTION_META.map((f) => [f.id, f]));

const TYPE_ICON = {
  cargo_delivery: 'cargo', bulk_trade: 'cargo', passenger_transport: 'cargo', smuggling_run: 'cargo',
  mining_quota: 'industry', salvage_retrieval: 'industry',
  bounty_hunt: 'target', patrol_clear: 'target', escort: 'target',
  recon_scan: 'spark',
};
const RISK_LABEL = ['Routine', 'Low', 'Elevated', 'High', 'Severe', 'Severe'];
const FAC_TINT = { faction_scn: '#5b8dd6', faction_mts: '#d8b25a', faction_dmc: '#d17a4b', faction_reach: '#c1543f', faction_quiet: '#9b8bd0', faction_vael: '#cf5d86', faction_free: '#46b4a4', faction_choir: '#78c6d8' };

const mid = (m) => (m && (m.id != null ? m.id : m.missionId));
const num = (v) => Math.max(0, Math.round(Number(v) || 0));
const reward = (m) => num(m.reward != null ? m.reward : (m.reward_cr != null ? m.reward_cr : (m.rewardCr != null ? m.rewardCr : m.payout)));
const risk = (m) => num(m.riskTier != null ? m.riskTier : m.risk);
const collateral = (m) => num(m.collateral_cr != null ? m.collateral_cr : (m.collateralCr != null ? m.collateralCr : m.collateral));
const upfront = (m) => num(m.upfrontCostCr);
const typeLabel = (t) => String(t || 'contract').replace(/_/g, ' ');
const facName = (m) => { const f = FAC.get(m.factionId); return (f && f.name) || (m.factionName) || 'Open contract'; };
const facTint = (m) => FAC_TINT[m.factionId] || '#4aa8ff';
function riskColor(r) { return r <= 1 ? 'var(--gain)' : r === 2 ? 'var(--warn)' : 'var(--loss)'; }
function destName(m) {
  const params = (m && m.params) || {};
  return m.destinationName || m.destName || params.destinationName || params.destName
    || (m.local ? 'Local sector' : (m.destSectorId || params.destSectorId || 'Destination'));
}

function missionRepPreview(m) {
  const base = MISSION_TUNING.BASE_REP[m && m.type] != null ? MISSION_TUNING.BASE_REP[m.type] : 3;
  const gain = Math.round(base * (1 + risk(m) * 0.4));
  return { gain, loss: -Math.ceil(gain * 0.6) };
}

function cargoRequirement(m) {
  if (m && m.cargo) return m.cargo;
  if (m && m.cargoCommodityId) return { commodityId: m.cargoCommodityId, qty: m.cargoQty };
  if (m && m.params && m.params.cmdtyId) return { commodityId: m.params.cmdtyId, qty: m.params.qty };
  return null;
}

function riskPips(r, size) {
  let s = '';
  for (let i = 0; i < 5; i++) s += `<i class="${i < r ? 'on' : ''}" style="${i < r ? 'background:' + riskColor(r) : ''}"></i>`;
  return `<span class="sx-pips${size ? ' sx-pips--' + size : ''}">${s}</span>`;
}

export function createContractsScreen(ctx) {
  const el = document.createElement('div');
  el.className = 'sx-ct';
  el.innerHTML =
    `<nav class="sx-ct__board" aria-label="Available contracts"></nav>` +
    `<section class="sx-ct__dossier" aria-live="polite"></section>` +
    `<aside class="sx-ct__active" aria-label="Active operations"></aside>`;
  const boardEl = el.querySelector('.sx-ct__board');
  const dossierEl = el.querySelector('.sx-ct__dossier');
  const activeEl = el.querySelector('.sx-ct__active');

  let selectedId = null;
  boardEl.setAttribute('role', 'tablist');

  function offers(state) {
    const sid = state && state.ui && state.ui.dockedStationId;
    const boards = state && state.missions && state.missions.boards;
    const board = boards && sid && boards[sid];
    return (board && Array.isArray(board.slots) ? board.slots : []).filter(Boolean);
  }
  function activeJobs(state) {
    const a = state && state.missions && state.missions.active;
    return (Array.isArray(a) ? a : []).filter((m) => m && (m.status == null || m.status === 'active'));
  }

  function renderBoard(state) {
    const list = offers(state);
    if (!selectedId && list.length) selectedId = String(mid(list[0]));
    if (!list.length) { boardEl.innerHTML = `<div class="sx-empty">${icon('contracts', 30)}<h4>Board is quiet</h4><p>No contracts posted at this berth. Try a station with a mission desk or a black-market contact.</p></div>`; return; }
    boardEl.innerHTML = list.map((m) => {
      const id = String(mid(m));
      const active = id === selectedId ? ' is-active' : '';
      const r = risk(m);
      return (
        `<button type="button" class="sx-ct-row${active}" data-mid="${escapeHtml(id)}" role="tab" aria-selected="${id === selectedId}">` +
          `<span class="sx-ct-row__ic" style="--tint:${facTint(m)}">${icon(TYPE_ICON[m.type] || 'contracts', 18)}</span>` +
          `<span class="sx-ct-row__mid">` +
            `<span class="sx-ct-row__title">${escapeHtml(m.title || typeLabel(m.type))}</span>` +
            `<span class="sx-ct-row__meta">${escapeHtml(facName(m))} · ${riskPips(r, 'xs')}</span>` +
          `</span>` +
          `<span class="sx-ct-row__rew">${reward(m).toLocaleString('en-US')}<i>cr</i></span>` +
        `</button>`
      );
    }).join('');
  }

  function renderDossier(state) {
    const list = offers(state);
    const m = list.find((x) => String(mid(x)) === selectedId) || list[0];
    if (!m) { dossierEl.innerHTML = `<div class="sx-empty">${icon('contracts', 34)}<h4>No contract selected</h4><p>Pick a job from the board to open its briefing.</p></div>`; return; }
    const r = risk(m);
    const tint = facTint(m);
    const cargo = cargoRequirement(m);
    const cargoName = cargo ? ((CMDTY.get(cargo.commodityId) || {}).name || cargo.commodityId) : null;
    const jumps = m.jumps != null ? m.jumps : (m.routeJumps != null ? m.routeJumps : 0);
    const origin = (ctx.station && ctx.station.name) || 'This station';
    const clauses = Array.isArray(m.clauses) ? m.clauses : [];
    const requiredRep = Number.isFinite(Number(m.minRep)) ? Number(m.minRep) : missionMinRepForRisk(r);
    const factionRep = m.factionId && state.factions && state.factions[m.factionId]
      ? Number(state.factions[m.factionId].rep) || 0 : 0;
    const standingOk = !m.factionId || factionRep >= requiredRep;
    const playerCredits = Number(state.player && state.player.credits) || 0;
    const acceptCost = collateral(m) + upfront(m);
    const fundsOk = playerCredits >= acceptCost;
    const cargoDef = cargo && CMDTY.get(cargo.commodityId);
    const cargoVolume = cargo ? Math.max(0, Number(cargo.qty) || 0) * Math.max(.01, Number(cargoDef && cargoDef.volume) || 1) : 0;
    const hold = (state.player && state.player.cargo) || {};
    const holdFree = Math.max(0, (Number(hold.capVolume) || 0) - (Number(hold.usedVolume) || 0));
    const cargoOk = !(m.preloadedCargo && cargoVolume > holdFree);
    const ready = standingOk && fundsOk && cargoOk;
    const repPreview = missionRepPreview(m);
    const readiness = !standingOk ? `${facName(m)} ${requiredRep > 0 ? '+' : ''}${requiredRep} standing required`
      : !fundsOk ? `${acceptCost.toLocaleString('en-US')} cr required to bind`
        : !cargoOk ? `${Math.ceil(cargoVolume)}u free hold required` : 'Ship and account ready';

    dossierEl.innerHTML =
      `<div class="sx-dossier">` +
        `<header class="sx-dossier__head">` +
          `<span class="sx-dossier__crest" style="--tint:${tint}">${icon(TYPE_ICON[m.type] || 'contracts', 26)}</span>` +
          `<div class="sx-dossier__id">` +
            `<span class="sx-dossier__client">${escapeHtml(facName(m))} · ${escapeHtml(typeLabel(m.type))}</span>` +
            `<h2>${escapeHtml(m.title || typeLabel(m.type))}</h2>` +
          `</div>` +
        `</header>` +

        `<div class="sx-dossier__topline">` +
          `<div class="sx-dossier__reward"><span>Reward</span><b>${reward(m).toLocaleString('en-US')}<i>cr</i></b></div>` +
          `<div class="sx-dossier__risk"><span>Risk assessment</span><div class="sx-dossier__riskrow">${riskPips(r, 'lg')}<em style="color:${riskColor(r)}">${RISK_LABEL[Math.min(r, 5)]}</em></div></div>` +
        `</div>` +

        `<div class="sx-dossier__route" aria-label="Contract operation route">` +
          `<div class="sx-route">` +
            `<span class="sx-route__node"><i></i>${escapeHtml(origin)}</span>` +
            `<span class="sx-route__line"><span class="sx-route__jumps">${jumps > 0 ? jumps + ' jump' + (jumps > 1 ? 's' : '') : 'in-sector'}</span></span>` +
            `<span class="sx-route__stage"><i></i><b>PREP</b><em>${cargoName ? `${num(cargo.qty)}u payload` : 'fit + fuel'}</em></span>` +
            `<span class="sx-route__line sx-route__line--short"></span>` +
            `<span class="sx-route__node sx-route__node--dest"><i></i>${escapeHtml(destName(m))}</span>` +
          `</div>` +
        `</div>` +

        `<div class="sx-dossier__grid">` +
          (cargoName ? briefCell('cargo', 'Payload', escapeHtml(cargoName), (cargo.qty ? cargo.qty + ' u' : '')) : '') +
          briefCell('clock', 'Time', m.timeLabel || (m.timeLimitMin ? m.timeLimitMin + ' min' : 'Flexible'), '') +
          (collateral(m) ? briefCell('info', 'Collateral', collateral(m).toLocaleString('en-US') + ' cr', 'on failure') : '') +
          (upfront(m) ? briefCell('credits', 'Upfront', upfront(m).toLocaleString('en-US') + ' cr', 'to accept') : '') +
          (!standingOk ? `<p class="sx-dossier__gate">${icon('factions', 14)}<span>${escapeHtml(readiness)}</span></p>` : '') +
          (clauses.length ? `<div class="sx-dossier__clauses">${clauses.map((c) => `<span class="sx-tag" title="${escapeHtml(c.prose || '')}">${escapeHtml(c.label || c.id || 'clause')}</span>`).join('')}</div>` : '') +
        `</div>` +

        `<div class="sx-contract-sim" aria-label="Previewed contract consequences">` +
          `<span class="sx-contract-sim__label">OUTCOME PREVIEW</span>` +
          `<div><span>SUCCESS</span><b>+${reward(m).toLocaleString('en-US')} cr</b><em>+${repPreview.gain} ${escapeHtml((FAC.get(m.factionId) || {}).short || 'faction')} rep</em></div>` +
          `<div><span>FAILURE</span><b>${collateral(m) ? `−${collateral(m).toLocaleString('en-US')} cr collateral` : 'No collateral loss'}</b><em>${repPreview.loss} faction rep</em></div>` +
          `<div class="${ready ? 'is-ready' : 'is-blocked'}"><span>READINESS</span><b>${ready ? 'ROUTE CLEAR' : 'BLOCKED'}</b><em>${escapeHtml(readiness)}</em></div>` +
        `</div>` +
        `<div class="sx-dossier__foot">` +
          `<button type="button" class="sx-btn-primary sx-ct-commit" data-accept="${escapeHtml(String(mid(m)))}"${ready ? '' : ' disabled'}>` +
            `<span>${ready ? 'Accept + Bind Route' : 'Resolve Readiness'}</span><em>${escapeHtml(readiness)}</em>` +
          `</button>` +
        `</div>` +
      `</div>`;
  }

  function briefCell(ic, k, v, sub) {
    return `<div class="sx-brief"><span class="sx-brief__ic">${icon(ic, 16)}</span><span class="sx-brief__k">${k}</span><span class="sx-brief__v">${v}</span>${sub ? `<span class="sx-brief__sub">${sub}</span>` : ''}</div>`;
  }

  function renderActive(state) {
    const jobs = activeJobs(state);
    const trackedId = state && state.ui && state.ui.trackedMissionId;
    activeEl.innerHTML =
      `<div class="sx-panel__head">${icon('spark', 15)}<span>Active Operations</span><em class="sx-ct__count">${jobs.length}</em></div>` +
      (jobs.length
        ? jobs.map((m) => {
            const id = String(mid(m));
            const tracked = trackedId != null && String(trackedId) === id;
            return (
              `<div class="sx-job${tracked ? ' is-tracked' : ''}">` +
                `<span class="sx-job__ic">${icon(TYPE_ICON[m.type] || 'contracts', 16)}</span>` +
                `<span class="sx-job__body"><span class="sx-job__title">${escapeHtml(m.title || typeLabel(m.type))}</span>` +
                  `<span class="sx-job__meta">${reward(m).toLocaleString('en-US')} cr · ${escapeHtml(destName(m))}</span></span>` +
                `<button type="button" class="sx-job__track" data-track="${escapeHtml(id)}" title="${tracked ? 'Tracked' : 'Track this job'}">${tracked ? '◆' : '◇'}</button>` +
              `</div>`
            );
          }).join('')
        : `<p class="sx-muted" style="padding:10px 4px">No active operations. Accept a contract to begin.</p>`);
  }

  function renderAll(state) { renderBoard(state); renderDossier(state); renderActive(state); }

  boardEl.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-mid]');
    if (!btn) return;
    selectedId = btn.getAttribute('data-mid');
    const state = ctx.state || {};
    renderBoard(state); renderDossier(state);
    if (ctx.bus) ctx.bus.emit('audio:cue', { id: 'ui_tab' });
  });

  el.addEventListener('click', (ev) => {
    const acc = ev.target.closest('[data-accept]');
    if (acc && !acc.disabled) { if (ctx.bus) { ctx.bus.emit('ui:acceptMission', { missionId: acc.getAttribute('data-accept') }); ctx.bus.emit('audio:cue', { id: 'ui_accept' }); } setTimeout(() => renderAll(ctx.state || {}), 60); return; }
    const trk = ev.target.closest('[data-track]');
    if (trk) {
      const id = trk.getAttribute('data-track');
      if (ctx.bus) { ctx.bus.emit('ui:trackMission', { missionId: id }); ctx.bus.emit('audio:cue', { id: 'ui_accept' }); }
      setTimeout(() => renderAll(ctx.state || {}), 60);
    }
  });

  const onMissionChanged = () => renderAll(ctx.state || {});
  if (ctx.bus && ctx.bus.on) ctx.bus.on('mission:updated', onMissionChanged);

  return {
    el,
    onShow(c) {
      const next = c || ctx;
      if (next.missionId != null) selectedId = String(next.missionId);
      renderAll(next.state || {});
    },
    refresh(c) { renderAll((c || ctx).state || {}); },
    dispose() {
      if (ctx.bus && ctx.bus.off) ctx.bus.off('mission:updated', onMissionChanged);
    },
  };
}
