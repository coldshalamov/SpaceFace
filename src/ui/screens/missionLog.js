// src/ui/screens/missionLog.js — In-flight mission log (J key).
// Shows all active + recently completed missions with progress, timer, reward, and a TRACK button.
// READ-ONLY on state; emits ui:trackMission + ui:abandonMission intents only (§5, §0.6).
//
// Export: missionLogScreen  (id 'missionLog').

import { SECTORS } from '../../data/sectors.js';
import { COMMODITIES } from '../../data/commodities.js';
import { confirm } from '../confirm.js';
import { FACTION_META } from '../../data/factions.js';
import { STORY_BEATS } from '../../data/missions.js';
import { escapeHtml } from '../comms.js';

const FACTION_BY_ID = new Map(FACTION_META.map((f) => [f.id, f]));
const CMDTY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));

// Build a station lookup from the static SECTORS graph.
const STATION_INFO = new Map();
const SECTOR_BY_ID = new Map();
for (const sec of SECTORS) {
  SECTOR_BY_ID.set(sec.id, sec);
  for (const st of sec.stations || []) {
    STATION_INFO.set(st.id, { name: st.name, sectorId: sec.id, sectorName: sec.name });
  }
}

const STYLE_ID = 'sf-missionlog-style';

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = CSS;
  document.head.appendChild(s);
}

function getManager(ctx) {
  if (ctx && ctx.screenManager) return ctx.screenManager;
  if (ctx && ctx.screens && ctx.screens.pushScreen) return ctx.screens;
  const ui = ctx && ctx.registry && ctx.registry.get && ctx.registry.get('ui');
  if (ui && ui.screenManager) return ui.screenManager;
  if (ui && ui.manager) return ui.manager;
  return null;
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function cmdtyName(id) {
  const c = CMDTY_BY_ID.get(id);
  return c ? c.name : (id || 'cargo').replace('cmdty_', '').replace(/_/g, ' ');
}

function prettyType(t) {
  if (!t) return 'Contract';
  return String(t).split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function fmtTime(s) {
  s = Math.max(0, Math.floor(s));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h >= 1) return h + 'h ' + m + 'm';
  if (m >= 1) return m + 'm ' + sec + 's';
  return sec + 's';
}

/** Build a human-readable objective description from the mission instance. */
function objectiveText(m) {
  const p = m.params || {};
  const prog = m.objectiveProgress || 0;
  const tgt = m.objectiveTarget || 1;
  const dest = m.destStationId ? destStationName(m.destStationId) : 'destination';
  switch (m.type) {
    case 'cargo_delivery':
    case 'salvage_retrieval':
    case 'passenger_transport':
      return `Deliver to ${dest}`;
    case 'bulk_trade':
      return `Sell ${prog}/${tgt} ${cmdtyName(p.cmdtyId)}`;
    case 'mining_quota':
      return `Mine ${prog}/${tgt} ${cmdtyName(p.cmdtyId)}`;
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

function destStationName(id) {
  const info = STATION_INFO.get(id);
  return info ? info.name : 'destination';
}

function destLabel(m) {
  const stnInfo = m.destStationId ? STATION_INFO.get(m.destStationId) : null;
  const secInfo = m.destSectorId ? SECTOR_BY_ID.get(m.destSectorId) : null;
  if (stnInfo) return stnInfo.name + (secInfo ? ' (' + secInfo.name + ')' : '');
  if (secInfo) return secInfo.name + ' sector';
  return '—';
}

export const missionLogScreen = {
  id: 'missionLog',
  _ctx: null,
  _listEl: null,
  _compListEl: null,
  _subbed: false,

  mount(rootEl, ctx) {
    this._ctx = ctx;
    injectStyle();

    rootEl.innerHTML = '';
    rootEl.classList.add('panel', 'sf-mlog');

    // Header
    const head = el('div', 'sf-mlog-head');
    head.innerHTML =
      '<span class="sf-mlog-title">MISSION LOG</span>' +
      '<span class="sf-mlog-hint mono">J to close</span>' +
      '<button class="sf-mlog-close">CLOSE</button>';
    rootEl.appendChild(head);

    head.querySelector('.sf-mlog-close').addEventListener('click', () => {
      const mgr = getManager(ctx);
      if (mgr) mgr.popScreen();
    });

    // Active missions section
    const activeH = el('div', 'sf-mlog-section-h', 'ACTIVE MISSIONS');
    rootEl.appendChild(activeH);

    const list = el('div', 'sf-mlog-list');
    rootEl.appendChild(list);
    this._listEl = list;

    // Story objective section (P2-14): the current beat's objective + direction hint, above the
    // active missions so the log is the canonical "what should I do now" home. Built in _render so
    // it tracks beatIndex live; _storyEl is the container.
    const storyH = el('div', 'sf-mlog-section-h sf-mlog-section-story', 'STORY OBJECTIVE');
    rootEl.insertBefore(storyH, activeH);
    const storyEl = el('div', 'sf-mlog-story');
    rootEl.insertBefore(storyEl, activeH);
    this._storyEl = storyEl;

    // Completed missions section
    const compH = el('div', 'sf-mlog-section-h sf-mlog-section-comp');
    compH.innerHTML = '<span>COMPLETED</span><button class="sf-mlog-toggle">Show</button>';
    rootEl.appendChild(compH);
    this._compHeader = compH;

    const compList = el('div', 'sf-mlog-comp-list');
    compList.style.display = 'none';
    rootEl.appendChild(compList);
    this._compListEl = compList;
    this._compVisible = false;

    compH.querySelector('.sf-mlog-toggle').addEventListener('click', () => {
      this._compVisible = !this._compVisible;
      compList.style.display = this._compVisible ? 'block' : 'none';
      compH.querySelector('.sf-mlog-toggle').textContent = this._compVisible ? 'Hide' : 'Show';
      if (this._compVisible) this._renderCompleted();
    });

    // Delegated click handler for buttons
    list.addEventListener('click', async (ev) => {
      const btn = ev.target.closest('[data-mid]');
      if (!btn) return;
      const missionId = btn.getAttribute('data-mid');
      const act = btn.getAttribute('data-act');
      if (act === 'track') {
        ctx.bus.emit('ui:trackMission', { missionId });
      } else if (act === 'abandon') {
        // Abandoning a mission forfeits progress + any standing/reputation gain — confirm (UX-2).
        const active = (ctx.state.missions && ctx.state.missions.active) || [];
        const m = active.find((x) => x.id === missionId);
        const title = (m && (m.title || m.name)) || 'this mission';
        const ok = await confirm({
          title: 'Abandon ' + title + '?',
          body: 'You will lose all progress on this contract. Any reputation or reward is forfeit.',
          confirmLabel: 'Abandon', danger: true,
        });
        if (!ok) return;
        ctx.bus.emit('ui:abandonMission', { missionId });
      }
      ctx.bus.emit('audio:cue', { id: 'ui_click' });
      this._render();
    });

    this._subscribe();
    this._render();
  },

  onShow(ctx) {
    if (ctx) this._ctx = ctx;
    this._render();
  },

  onHide() {},

  refresh(ctx) {
    if (ctx) this._ctx = ctx;
    this._render();
  },

  onKey(ev) {
    if (ev.key === 'j' || ev.key === 'J') {
      const mgr = getManager(this._ctx);
      if (mgr) mgr.popScreen();
      return true; // consumed
    }
    return false;
  },

  _subscribe() {
    if (this._subbed || !this._ctx) return;
    this._subbed = true;
    const bus = this._ctx.bus;
    const refresh = () => { if (this._visible()) this._render(); };
    bus.on('mission:updated', refresh);
    bus.on('mission:accepted', refresh);
    bus.on('mission:completed', refresh);
    bus.on('mission:failed', refresh);
    bus.on('mission:expired', refresh);
  },

  _visible() {
    const ui = this._ctx && this._ctx.state && this._ctx.state.ui;
    if (!ui || !ui.screenStack) return false;
    return ui.screenStack[ui.screenStack.length - 1] === 'missionLog';
  },

  _render() {
    const ctx = this._ctx;
    if (!ctx || !this._listEl) return;
    const state = ctx.state;
    const active = (state.missions && state.missions.active) || [];
    const tracked = state.ui && state.ui.trackedMissionId;
    const simTime = state.simTime || 0;

    // Story objective (P2-14): render the current beat first, before active missions, so the log is
    // always a valid "what should I do now" even with zero active contracts.
    this._renderStory(state);

    this._listEl.innerHTML = '';

    if (!active.length) {
      this._listEl.innerHTML = '<div class="sf-mlog-empty">No active missions. Accept contracts at station mission boards.</div>';
      return;
    }

    const frag = document.createDocumentFragment();
    for (const m of active) {
      if (m.status !== 'active') continue;
      const isTracked = tracked === m.id;
      const remaining = Math.max(0, (m.deadline_s || 0) - simTime);
      const urgent = remaining > 0 && remaining < 120;

      const card = el('div', 'sf-mlog-card' + (isTracked ? ' tracked' : '') + (urgent ? ' urgent' : ''));

      // Top row: title + type badge
      const top = el('div', 'sf-mlog-card-top');
      const risk = m.riskTier != null ? m.riskTier : 0;
      top.innerHTML =
        '<span class="sf-mlog-card-title">' + escapeHtml(m.title || prettyType(m.type)) + '</span>' +
        '<span class="sf-mlog-card-type">' + escapeHtml(prettyType(m.type)) + '</span>' +
        '<span class="sf-mlog-card-risk r' + risk + '">R' + risk + '</span>';
      card.appendChild(top);

      // Objective progress
      const objLine = el('div', 'sf-mlog-obj mono');
      const prog = m.objectiveProgress || 0;
      const tgt = m.objectiveTarget || 1;
      const pct = Math.min(100, Math.round((prog / tgt) * 100));
      objLine.innerHTML =
        '<span class="sf-mlog-obj-text">' + escapeHtml(objectiveText(m)) + '</span>' +
        '<span class="sf-mlog-obj-pct">' + pct + '%</span>';
      card.appendChild(objLine);

      // Progress bar
      const barWrap = el('div', 'sf-mlog-pbar');
      const barFill = el('div', 'sf-mlog-pbar-fill');
      barFill.style.width = pct + '%';
      barWrap.appendChild(barFill);
      card.appendChild(barWrap);

      // Meta row: destination, time, rewards
      const meta = el('div', 'sf-mlog-meta mono');
      const fac = m.factionId ? FACTION_BY_ID.get(m.factionId) : null;
      meta.innerHTML =
        '<span class="sf-mlog-dest">' + escapeHtml(destLabel(m)) + '</span>' +
        (remaining > 0 ? '<span class="sf-mlog-time' + (urgent ? ' urgent' : '') + '">' + fmtTime(remaining) + '</span>' : '') +
        '<span class="sf-mlog-cr">+' + (m.reward_cr || 0).toLocaleString() + ' cr</span>' +
        (fac ? '<span class="sf-mlog-fac" style="color:' + (fac.color || 'var(--accent-2)') + '">' + escapeHtml(fac.short || fac.name) + '</span>' : '');
      card.appendChild(meta);

      // Buttons: Track / Abandon
      const btns = el('div', 'sf-mlog-btns');
      btns.innerHTML =
        '<button class="sf-mlog-btn-track' + (isTracked ? ' active' : '') + '" data-act="track" data-mid="' + escapeHtml(m.id) + '">' +
          (isTracked ? 'TRACKING' : 'TRACK') +
        '</button>' +
        '<button class="sf-mlog-btn-abandon" data-act="abandon" data-mid="' + escapeHtml(m.id) + '">ABANDON</button>';
      card.appendChild(btns);

      frag.appendChild(card);
    }
    this._listEl.appendChild(frag);

    if (this._compVisible) this._renderCompleted();
  },

  // Story objective tracker (P2-14): the current beat's concrete objective + reward, so the mission
  // log answers "what should I do now" even with no active contracts. Reads state.story.beatIndex
  // (owned by missions.js) + the STORY_BEATS table (objective/reward/introduces per beat).
  _renderStory(state) {
    if (!this._storyEl) return;
    const beat = (state.story && state.story.beatIndex) || 0;
    const sb = STORY_BEATS[beat];
    if (!sb) { this._storyEl.innerHTML = ''; return; }
    const introduces = sb.introduces ? '<div class="sf-mlog-story-introduces">Introduces: ' + escapeHtml(sb.introduces.replace(/_/g, ' ')) + '</div>' : '';
    this._storyEl.innerHTML =
      '<div class="sf-mlog-story-card">' +
        '<div class="sf-mlog-story-beat">Beat ' + beat + ' / 7 · ' + escapeHtml((sb.id || '').replace(/_/g, ' ')) + '</div>' +
        '<div class="sf-mlog-story-objective">' + escapeHtml(sb.objective) + '</div>' +
        introduces +
      '</div>';
  },

  _renderCompleted() {
    if (!this._compListEl || !this._ctx) return;
    const log = (this._ctx.state.missions && this._ctx.state.missions.completedLog) || [];
    this._compListEl.innerHTML = '';
    if (!log.length) {
      this._compListEl.innerHTML = '<div class="sf-mlog-empty">No completed missions yet.</div>';
      return;
    }
    const frag = document.createDocumentFragment();
    for (const rec of log) {
      const row = el('div', 'sf-mlog-comp-row mono');
      row.innerHTML =
        '<span class="sf-mlog-comp-type">' + escapeHtml(prettyType(rec.type)) + '</span>' +
        '<span class="sf-mlog-comp-count">' + rec.success + '/' + rec.count + ' done</span>' +
        '<span class="sf-mlog-comp-cr">+' + (rec.totalCr || 0).toLocaleString() + ' cr</span>';
      frag.appendChild(row);
    }
    this._compListEl.appendChild(frag);
  },
};

// ---- CSS (injected once) ----
const CSS = `
.sf-mlog { width: min(92vw, 700px); max-height: min(88vh, 720px); display: flex; flex-direction: column;
  overflow: hidden; pointer-events: auto; animation: sf-fadein .3s var(--ease) both; }

.sf-mlog-head { display: flex; align-items: center; justify-content: space-between; gap: 14px;
  padding: 14px 20px; border-bottom: 1px solid var(--panel-edge);
  background: linear-gradient(180deg, rgba(14,24,42,.7), rgba(8,14,26,.5)); }
.sf-mlog-title { font-family: var(--mono); font-size: 1.15rem; letter-spacing: .22em; color: var(--accent);
  text-shadow: 0 0 18px rgba(57,208,255,.45); text-transform: uppercase; }
.sf-mlog-hint { font-size: .68rem; color: var(--ink-mute); letter-spacing: .12em; }
.sf-mlog-close { font-size: .78rem; padding: 5px 14px; }

.sf-mlog-section-h { font-family: var(--mono); font-size: .68rem; letter-spacing: .18em; text-transform: uppercase;
  color: var(--ink-mute); padding: 12px 20px 4px; }
.sf-mlog-section-comp { display: flex; align-items: center; justify-content: space-between;
  border-top: 1px solid var(--panel-edge); margin-top: 4px; padding-top: 10px; }
.sf-mlog-toggle { font-size: .68rem; padding: 3px 10px; }

/* Story objective section (P2-14) — always present so the log answers "what now". */
.sf-mlog-story { padding: 4px 16px 6px; }
.sf-mlog-story-card { border: 1px solid var(--accent); border-radius: 8px; padding: 11px 14px;
  background: linear-gradient(180deg, rgba(20,40,60,.55), rgba(10,18,32,.55));
  box-shadow: 0 0 12px rgba(57,208,255,.15); }
.sf-mlog-story-beat { font-family: var(--mono); font-size: .68rem; letter-spacing: .14em;
  text-transform: uppercase; color: var(--accent); margin-bottom: 5px; }
.sf-mlog-story-objective { font-size: .92rem; color: var(--ink); line-height: 1.4; font-weight: 600; }
.sf-mlog-story-introduces { font-size: .72rem; color: var(--ink-mute); margin-top: 6px; font-style: italic; }

.sf-mlog-list { flex: 1; overflow-y: auto; padding: 6px 16px 10px; display: flex; flex-direction: column; gap: 10px; }

.sf-mlog-empty { color: var(--ink-mute); font-size: .85rem; padding: 18px 4px; font-style: italic; }

.sf-mlog-card { border: 1px solid var(--panel-edge); border-radius: 8px; padding: 12px 14px;
  background: rgba(10,18,32,.55); transition: border-color .15s ease, box-shadow .15s ease; }
.sf-mlog-card.tracked { border-color: var(--accent); box-shadow: 0 0 12px rgba(57,208,255,.2); }
.sf-mlog-card.urgent { border-color: var(--warn); }

.sf-mlog-card-top { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
.sf-mlog-card-title { font-size: .95rem; flex: 1; color: var(--ink); }
.sf-mlog-card-type { font-size: .6rem; letter-spacing: .08em; text-transform: uppercase; padding: 1px 6px;
  border-radius: 4px; background: var(--panel-2); color: var(--ink-dim); }
.sf-mlog-card-risk { font-size: .58rem; letter-spacing: .06em; padding: 1px 5px; border-radius: 4px;
  background: var(--panel-2); color: var(--ink-dim); }
.sf-mlog-card-risk.r0 { color: var(--good); } .sf-mlog-card-risk.r1 { color: var(--accent-2); }
.sf-mlog-card-risk.r2 { color: var(--warn); } .sf-mlog-card-risk.r3, .sf-mlog-card-risk.r4 { color: var(--danger); }

.sf-mlog-obj { display: flex; align-items: center; justify-content: space-between; gap: 8px;
  font-size: .8rem; margin-bottom: 4px; }
.sf-mlog-obj-text { color: var(--ink-dim); }
.sf-mlog-obj-pct { color: var(--accent); font-weight: 600; min-width: 36px; text-align: right; }

.sf-mlog-pbar { height: 4px; border-radius: 2px; background: var(--panel-2); overflow: hidden; margin-bottom: 8px;
  border: 1px solid rgba(29,51,80,.5); }
.sf-mlog-pbar-fill { height: 100%; background: linear-gradient(90deg, var(--accent), var(--accent-2));
  border-radius: 2px; transition: width .3s ease; }

.sf-mlog-meta { display: flex; flex-wrap: wrap; gap: 12px; font-size: .74rem; margin-bottom: 8px; }
.sf-mlog-dest { color: var(--ink-dim); }
.sf-mlog-time { color: var(--ink-mute); }
.sf-mlog-time.urgent { color: var(--warn); font-weight: 600; }
.sf-mlog-cr { color: var(--energy); }
.sf-mlog-fac { font-size: .7rem; }

.sf-mlog-btns { display: flex; gap: 8px; }
.sf-mlog-btn-track { font-size: .72rem; padding: 4px 12px; border-color: var(--panel-edge-2); color: var(--ink-dim); }
.sf-mlog-btn-track:hover { border-color: var(--accent); color: var(--accent); }
.sf-mlog-btn-track.active { border-color: var(--accent); color: var(--accent);
  box-shadow: 0 0 8px rgba(57,208,255,.25); background: rgba(57,208,255,.1); }
.sf-mlog-btn-abandon { font-size: .72rem; padding: 4px 12px; border-color: var(--panel-edge); color: var(--ink-mute); }
.sf-mlog-btn-abandon:hover { border-color: var(--danger); color: var(--danger); }

.sf-mlog-comp-list { padding: 4px 16px 12px; }
.sf-mlog-comp-row { display: flex; gap: 16px; align-items: center; padding: 5px 8px;
  border-bottom: 1px solid rgba(29,51,80,.35); font-size: .76rem; color: var(--ink-mute); }
.sf-mlog-comp-type { flex: 1; }
.sf-mlog-comp-count { color: var(--ink-dim); }
.sf-mlog-comp-cr { color: var(--energy); opacity: .7; }
`;
