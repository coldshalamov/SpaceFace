// src/ui/station/screens/bar.js — "Bar": the conversation instrument.
// Contact rail · a real conversation centrepiece (portrait, what they remember of you, what they
// just said, what you can ask) · leads column (survey data + mission leads).
// Reuses the existing contact engine in screens/bar.js — no gameplay reinvented.
// Emits ui:talkContact / ui:purchaseSurveyData / ui:acceptMission / ui:pushScreen.
import {
  generateContacts,
  getChoices,
  buildReply,
  availableSurveyOffer,
  surveyOfferLabel,
  missionBoardSlots,
  barContactIntelTags,
} from '../../screens/bar.js';
import { stationContactMemoryFor, stationContactMemoryLine } from '../../../data/stationContacts.js';
import { mountContactPortrait } from '../../portraitArt.js';
import { escapeHtml } from '../../comms.js';
import { icon } from '../icons.js';

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');
const roleLabel = (r) => String(r || 'contact').replace(/_/g, ' ');
const mid = (m) => (m && (m.id != null ? m.id : m.missionId));
const rewardOf = (m) => Math.max(0, Math.round(Number(
  m && (m.reward != null ? m.reward : (m.reward_cr != null ? m.reward_cr : (m.rewardCr != null ? m.rewardCr : m.payout))),
) || 0));

export function createBarScreen(ctx) {
  const el = document.createElement('div');
  el.className = 'sx-bar';
  el.innerHTML =
    `<nav class="sx-bar__rail" aria-label="Contacts"></nav>` +
    `<section class="sx-bar__stage" aria-live="polite"></section>` +
    `<aside class="sx-bar__leads"></aside>`;
  const railEl = el.querySelector('.sx-bar__rail');
  const stageEl = el.querySelector('.sx-bar__stage');
  const leadsEl = el.querySelector('.sx-bar__leads');
  railEl.setAttribute('role', 'tablist');

  let selectedId = null;
  let saidText = null;   // what the selected contact just said

  const sid = () => (ctx.state && ctx.state.ui && ctx.state.ui.dockedStationId) || null;
  function contacts(state) {
    try { return generateContacts(sid(), state) || []; } catch (_) { return []; }
  }
  function selected(state) {
    const list = contacts(state);
    return list.find((c) => c.id === selectedId) || list[0] || null;
  }

  // ---------- rail ----------
  function renderRail(state) {
    const list = contacts(state);
    if (!list.length) {
      railEl.innerHTML = `<div class="sx-empty">${icon('bar', 28)}<h4>Nobody here</h4><p>No contacts at this berth right now.</p></div>`;
      return;
    }
    if (!selectedId) selectedId = list[0].id;
    railEl.innerHTML = list.map((c) => (
      `<button type="button" class="sx-bar-row${c.id === selectedId ? ' is-active' : ''}" data-contact="${escapeHtml(c.id)}" role="tab" aria-selected="${c.id === selectedId}">` +
        `<span class="sx-bar-row__pic" data-pic="${escapeHtml(c.id)}"></span>` +
        `<span class="sx-bar-row__body">` +
          `<span class="sx-bar-row__name">${escapeHtml(c.name || 'Contact')}</span>` +
          `<span class="sx-bar-row__role">${escapeHtml(roleLabel(c.role))}</span>` +
        `</span>` +
      `</button>`
    )).join('');
    // real portrait art (thumbnails)
    for (const c of list) {
      const host = railEl.querySelector(`[data-pic="${CSS.escape(c.id)}"]`);
      if (host) { try { mountContactPortrait(host, c, { className: 'sx-portrait', size: 38 }); } catch (_) {} }
    }
  }

  // ---------- stage: the conversation ----------
  function renderStage(state) {
    const c = selected(state);
    if (!c) { stageEl.innerHTML = `<div class="sx-empty">${icon('bar', 34)}<h4>The bar is empty</h4><p>Try a larger station.</p></div>`; return; }
    const memory = stationContactMemoryFor(state, c.id);
    let memLine = '';
    try { memLine = stationContactMemoryLine(memory, c.line) || c.line || ''; } catch (_) { memLine = c.line || ''; }
    const choices = (() => { try { return getChoices(c.role, c) || []; } catch (_) { return []; } })();

    stageEl.innerHTML =
      `<div class="sx-talk">` +
        `<header class="sx-talk__head">` +
          `<span class="sx-talk__avatar" data-bigpic></span>` +
          `<div class="sx-talk__id">` +
            `<span class="sx-talk__role">${escapeHtml(roleLabel(c.role))}</span>` +
            `<h2>${escapeHtml(c.name || 'Contact')}</h2>` +
            (memLine ? `<p class="sx-talk__memory">${escapeHtml(memLine)}</p>` : '') +
          `</div>` +
        `</header>` +
        `<div class="sx-talk__reply${saidText ? ' is-said' : ''}">` +
          `<span class="sx-talk__quote">&ldquo;</span>` +
          `<p>${escapeHtml(saidText || 'They look up as you approach. Ask them something.')}</p>` +
        `</div>` +
        `<div class="sx-talk__choices">` +
          (choices.length
            ? choices.map((ch) => `<button type="button" class="sx-choice" data-choice="${escapeHtml(ch.id)}">${escapeHtml(ch.label)}</button>`).join('')
            : `<p class="sx-muted">They have nothing to say.</p>`) +
        `</div>` +
      `</div>`;

    const big = stageEl.querySelector('[data-bigpic]');
    if (big) { try { mountContactPortrait(big, c, { className: 'sx-portrait sx-portrait--lg', size: 160 }); } catch (_) {} }
  }

  // ---------- leads: intel + survey + mission leads ----------
  function renderLeads(state) {
    const c = selected(state);
    const stationId = sid();
    let tags = [];
    try { tags = (c ? barContactIntelTags(c, state, stationId) : []) || []; } catch (_) { tags = []; }
    let survey = null;
    try { survey = availableSurveyOffer(state, stationId); } catch (_) { survey = null; }
    let leads = [];
    try { leads = (missionBoardSlots(state, stationId) || []).slice(0, 3); } catch (_) { leads = []; }
    const credits = Math.max(0, Math.floor(Number(state && state.player && state.player.credits) || 0));

    const intelHtml = tags.length
      ? tags.map((t) => `<span class="sx-intel sx-intel--${escapeHtml(t.kind || 'info')}"><b>${escapeHtml(t.label)}</b>${escapeHtml(t.text)}</span>`).join('')
      : `<p class="sx-muted">Nothing worth repeating yet.</p>`;

    const surveyHtml = survey
      ? `<div class="sx-lead">` +
          `<div class="sx-lead__body"><span class="sx-lead__t">${escapeHtml(survey.sectorName)}</span>` +
            `<span class="sx-lead__s">${escapeHtml(surveyOfferLabel ? (surveyOfferLabel(survey) || 'Nav data') : 'Nav data')}</span></div>` +
          `<button type="button" class="sx-lead__go" data-survey="${escapeHtml(survey.sectorId)}" ${credits >= survey.price ? '' : 'disabled'}>${fmt(survey.price)} cr</button>` +
        `</div>`
      : `<p class="sx-muted">No survey data for sale here.</p>`;

    const leadsHtml = leads.length
      ? leads.map((m) => `<div class="sx-lead">` +
          `<div class="sx-lead__body"><span class="sx-lead__t">${escapeHtml(m.title || 'Contract')}</span>` +
            `<span class="sx-lead__s">${fmt(rewardOf(m))} cr</span></div>` +
          `<button type="button" class="sx-lead__go" data-inspect="${escapeHtml(String(mid(m)))}">Inspect</button>` +
        `</div>`).join('')
      : `<p class="sx-muted">No leads on the board.</p>`;

    leadsEl.innerHTML =
      `<div class="sx-panel"><div class="sx-panel__head">${icon('spark', 15)}<span>Intel</span></div>${intelHtml}</div>` +
      `<div class="sx-panel"><div class="sx-panel__head">${icon('route', 15)}<span>Survey Data</span></div>${surveyHtml}</div>` +
      `<div class="sx-panel"><div class="sx-panel__head">${icon('contracts', 15)}<span>Leads</span></div>${leadsHtml}` +
        `<button type="button" class="sx-btn-ghost sx-bar__log" data-log>Open Mission Log</button></div>`;
  }

  function renderAll(state) { renderRail(state); renderStage(state); renderLeads(state); }

  // ---------- interactions ----------
  railEl.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-contact]'); if (!b) return;
    const id = b.getAttribute('data-contact');
    if (id === selectedId) return;
    selectedId = id; saidText = null;
    const st = ctx.state || {};
    renderRail(st); renderStage(st); renderLeads(st);
    if (ctx.bus) ctx.bus.emit('audio:cue', { id: 'ui_tab' });
  });

  stageEl.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-choice]'); if (!b) return;
    const st = ctx.state || {};
    const c = selected(st); if (!c) return;
    const choiceId = b.getAttribute('data-choice');
    if (ctx.bus) {
      ctx.bus.emit('ui:talkContact', {
        contactId: c.id, choiceId, stationId: sid(),
        canonicalKey: c.canonicalKey || null, trackerId: c.trackerId || null, name: c.name,
      });
      ctx.bus.emit('audio:cue', { id: 'ui_click' });
    }
    let result = null;
    try { result = buildReply(c.role, choiceId, ctx, sid(), c); } catch (_) { result = null; }
    if (result && result.uniqueWreckRumor && ctx.bus) ctx.bus.emit('uniqueWreck:rumorHeard', result.uniqueWreckRumor);
    saidText = (result && result.text) || 'They shrug.';
    renderStage(ctx.state || {});
    renderLeads(ctx.state || {});
  });

  leadsEl.addEventListener('click', (ev) => {
    const st = ctx.state || {};
    const sv = ev.target.closest('[data-survey]');
    if (sv && !sv.disabled) {
      if (ctx.bus) {
        ctx.bus.emit('ui:purchaseSurveyData', { sectorId: sv.getAttribute('data-survey'), stationId: sid() });
        ctx.bus.emit('audio:cue', { id: 'ui_click' });
      }
      setTimeout(() => renderAll(ctx.state || {}), 70);
      return;
    }
    const inspect = ev.target.closest('[data-inspect]');
    if (inspect) {
      if (ctx.bus) {
        ctx.bus.emit('station:navigate', { destination: 'contracts', options: { missionId: inspect.getAttribute('data-inspect') } });
        ctx.bus.emit('audio:cue', { id: 'ui_click' });
      }
      return;
    }
    if (ev.target.closest('[data-log]') && ctx.bus) ctx.bus.emit('station:navigate', { destination: 'contracts' });
  });

  return {
    el,
    onShow(c) { renderAll((c || ctx).state || {}); },
    refresh(c) { renderAll((c || ctx).state || {}); },
    dispose() {},
  };
}
