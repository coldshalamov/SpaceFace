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
import { BINDINGS } from '../../bindings.js';
import { missionConsequenceSummary, missionPreflight } from '../../missionPreflight.js';
import { icon } from '../icons.js';
import { frontierRumorOffer, frontierRumorOwned } from '../../../data/frontierRumors.js';

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
  let pendingMissionOffer = null;
  let pendingFrontierRumorOffer = null;
  let acceptedMissionId = null;
  let pinnedContact = null;

  const sid = () => (ctx.state && ctx.state.ui && ctx.state.ui.dockedStationId) || null;
  function contacts(state) {
    try {
      const generated = generateContacts(sid(), state) || [];
      if (pinnedContact && !generated.some((contact) => contact.id === pinnedContact.id)) {
        return [pinnedContact, ...generated];
      }
      return generated;
    } catch (_) { return pinnedContact ? [pinnedContact] : []; }
  }
  function selected(state) {
    const list = contacts(state);
    return list.find((c) => c.id === selectedId) || list[0] || null;
  }

  function missionOfferAvailable(state, missionId) {
    const boards = state && state.missions && state.missions.boards;
    if (!missionId || !boards) return false;
    for (const board of Object.values(boards)) {
      if (Array.isArray(board && board.slots)
        && board.slots.some((offer) => offer && String(offer.id) === String(missionId))) return true;
    }
    return false;
  }

  function missionOfferHtml(state) {
    if (acceptedMissionId) {
      const label = `Mission Log (${BINDINGS.missionLog.label})`;
      return `<section class="sx-bar-offer is-accepted" aria-label="Accepted mission handoff">` +
        `<div class="sx-bar-offer__state"><b>ACCEPTED + TRACKED</b><span>${escapeHtml(label)} carries the route, timer, and progress. Launch when Departure Check is green.</span></div>` +
        `<button type="button" class="sx-btn-primary" data-open-mission-log="${escapeHtml(String(acceptedMissionId))}">OPEN ${escapeHtml(label.toUpperCase())}</button>` +
      `</section>`;
    }
    const offer = pendingMissionOffer;
    if (!offer || !missionOfferAvailable(state, offer.id)) return '';
    const preflight = missionPreflight(offer, state);
    const consequences = missionConsequenceSummary(offer);
    const unmet = offer.requirementUnmet || offer.lockedReason || preflight.blocker || null;
    return `<section class="sx-bar-offer" aria-label="Mission readiness">` +
      `<div class="sx-bar-offer__chips">${preflight.chips.map((chip) =>
        `<span class="sx-bar-offer__chip is-${escapeHtml(chip.kind)}">${escapeHtml(chip.text)}</span>`).join('')}</div>` +
      `<div class="sx-bar-offer__stakes">${consequences.chips.map((chip) =>
        `<span class="sx-bar-offer__stake is-${escapeHtml(chip.kind)}"><b>${escapeHtml(chip.label)}</b>${escapeHtml(chip.text)}</span>`).join('')}</div>` +
      (preflight.warning ? `<p class="sx-bar-offer__warning">${escapeHtml(preflight.warning)}</p>` : '') +
      (unmet ? `<p class="sx-bar-offer__blocker">${escapeHtml(unmet)}</p>` : '') +
      `<button type="button" class="sx-btn-primary" data-accept-mission="${escapeHtml(String(offer.id))}"${unmet ? ' disabled' : ''}>ACCEPT + TRACK</button>` +
    `</section>`;
  }

  function frontierRumorOfferHtml() {
    const offer = pendingFrontierRumorOffer;
    if (!offer) return '';
    return `<section class="sx-bar-offer" aria-label="Frontier rumor card">` +
      `<div class="sx-bar-offer__chips">` +
        `<span class="sx-bar-offer__chip is-warn">${escapeHtml(offer.kindLabel)}</span>` +
        `<span class="sx-bar-offer__chip is-info">${escapeHtml(offer.sectorName)} search area</span>` +
        `<span class="sx-bar-offer__chip is-info">${fmt(offer.price)} cr</span>` +
      `</div>` +
      `<p class="sx-bar-offer__warning">Approximate bearing only — no waypoint or automatic discovery.</p>` +
      `<button type="button" class="sx-btn-primary" data-buy-frontier-rumor="${escapeHtml(offer.id)}">BUY RUMOR CARD · ${fmt(offer.price)} CR</button>` +
    `</section>`;
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
        `</div>` + missionOfferHtml(state) + frontierRumorOfferHtml() +
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
    selectedId = id; saidText = null; pendingMissionOffer = null; pendingFrontierRumorOffer = null; acceptedMissionId = null;
    const st = ctx.state || {};
    renderRail(st); renderStage(st); renderLeads(st);
    if (ctx.bus) ctx.bus.emit('audio:cue', { id: 'ui_tab' });
  });

  stageEl.addEventListener('click', (ev) => {
    const rumorButton = ev.target.closest('[data-buy-frontier-rumor]');
    if (rumorButton && !rumorButton.disabled) {
      const rumorId = rumorButton.getAttribute('data-buy-frontier-rumor');
      const offer = frontierRumorOffer(ctx.state || {}, sid());
      if (!offer || offer.id !== rumorId) {
        pendingFrontierRumorOffer = null;
        saidText = 'That rumor card is no longer available.';
        renderStage(ctx.state || {});
        return;
      }
      const credits = Math.max(0, Math.floor(Number(ctx.state && ctx.state.player && ctx.state.player.credits) || 0));
      if (credits < offer.price) {
        saidText = `You need ${fmt(offer.price)} cr for that rumor card.`;
        if (ctx.bus) ctx.bus.emit('toast', { text: 'Insufficient credits for rumor card', kind: 'warn', ttl: 3 });
        renderStage(ctx.state || {});
        return;
      }
      if (ctx.bus) {
        ctx.bus.emit('ui:purchaseFrontierRumor', { rumorId, stationId: sid() });
        ctx.bus.emit('audio:cue', { id: 'ui_click' });
      }
      if (frontierRumorOwned(ctx.state || {}, rumorId)) {
        pendingFrontierRumorOffer = null;
        saidText = `${offer.kindLabel} added as an approximate amber search area. You still have to find it.`;
      }
      renderStage(ctx.state || {});
      renderLeads(ctx.state || {});
      return;
    }
    const accept = ev.target.closest('[data-accept-mission]');
    if (accept && !accept.disabled) {
      const missionId = accept.getAttribute('data-accept-mission');
      const wasAvailable = missionOfferAvailable(ctx.state || {}, missionId);
      if (ctx.bus) {
        ctx.bus.emit('ui:acceptMission', { missionId });
        ctx.bus.emit('audio:cue', { id: 'ui_accept' });
      }
      if (wasAvailable && !missionOfferAvailable(ctx.state || {}, missionId)) {
        acceptedMissionId = missionId;
        pendingMissionOffer = null;
        saidText = `Accepted + tracked. Mission Log (${BINDINGS.missionLog.label}) now carries route, timer, and progress. Undock when Departure Check is green.`;
      } else {
        saidText = wasAvailable
          ? 'Mission still pending. Resolve the readiness blocker before accepting.'
          : 'That offer is no longer available.';
      }
      renderStage(ctx.state || {});
      renderLeads(ctx.state || {});
      return;
    }
    if (ev.target.closest('[data-open-mission-log]')) {
      if (ctx.bus) ctx.bus.emit('ui:pushScreen', { id: 'missionLog', source: 'station-bar' });
      return;
    }
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
    if (result && result.endgameResolved) {
      pinnedContact = {
        ...c,
        line: '47-A closed. 47-B pending.',
        choices: [{ id: 'closed', label: 'Safe flying.' }],
      };
    }
    saidText = (result && result.text) || 'They shrug.';
    pendingMissionOffer = result && result.missionOffer || null;
    pendingFrontierRumorOffer = result && result.frontierRumorOffer || null;
    acceptedMissionId = null;
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
    dispose() { pinnedContact = null; },
  };
}
