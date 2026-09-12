import { barFrameHtml } from '../../views/stationFrames.js';
// src/ui/station/screens/bar.js — "Bar": the conversation as a kit panel (Frontend Task C §1.8).
// Left: who is here tonight as a column of words, then the leads as rows (survey data and board
// jobs with a priced / named verb). Right: the contact's role, name and portrait (the one image
// allowed, 240 px, no frame), what they remember of you, what they just said as the emphasised
// sentence, what you can ask as words, and any offer their reply produced as sentences and a word.
// Reuses the existing contact engine in ../barContacts.js — no gameplay reinvented.
// Emits ui:talkContact / ui:purchaseSurveyData / ui:acceptMission / ui:pushScreen.
// Field Hardware chrome (kit plates, keys, quiet type) is pinned from this module. Ask, accept,
// buy rumor, inspect, and map verbs stay the same.
// `.sx-bar`, `.sx-bar-row[data-contact]`, `.sx-bar-row__role`, `.sx-talk`, `.sx-talk__reply`,
// `.sx-choice[data-choice]`, `.sx-bar-offer*`, `[data-inspect]`, `[data-bigpic]` are hooks.
import {
  generateContacts,
  getChoices,
  buildReply,
  emitBarContactChoice,
  openDossArchiveMap,
  openVonnFreightLossMap,
  availableSurveyOffer,
  surveyOfferLabel,
  missionBoardSlots,
  barContactIntelTags,
} from '../barContacts.js';
import { stationContactMemoryFor, stationContactMemoryLine } from '../../../data/stationContacts.js';
import { mountContactPortrait } from '../../portraitArt.js';
import { escapeHtml } from '../../comms.js';
import { BINDINGS } from '../../bindings.js';
import { missionConsequenceSummary, missionPreflight } from '../../missionPreflight.js';
import {
  frontierRumorOffer,
  frontierRumorOwned,
  TETHYS_BLACK_MARKET_DISCOVERY,
} from '../../../data/frontierRumors.js';
import { DOSS_ARCHIVE_CONTACT_ID, dossArchiveMapOffer } from '../../../data/dossArchive.js';
import { VONN_FREIGHT_CONTACT_ID, vonnFreightLossMapOffer } from '../../../data/vonnFreightLoss.js';
import { MAP_FOCUS, openGalaxyMap } from '../../mapAuthority.js';
import { dressComms, watchComms } from './comms.js';
import { dressEvents, watchEvents } from './events.js';
import {
  ensureInteriorStyle,
  paintCap,
  paintKey,
  paintLegend,
  paintMarking,
  paintPlate,
  paintRow,
  pin,
  pinKeyrack,
  syncKeys,
} from './fhChrome.js';

const STYLE_ID = 'sf-station-bar-fh';
function ensureBarStyle() {
  ensureInteriorStyle();
  if (typeof document === 'undefined' || !document.head) return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent =
    '.sx-bar .k-word.fh-key::after{display:none!important}' +
    '.sx-bar .fh-keyrack{gap:6px!important;align-items:center!important;flex-wrap:wrap!important}' +
    '.sx-bar .sx-lead.fh-row,.sx-bar .sx-intel.fh-row,.sx-bar .sx-bar-offer__stake.fh-row{box-shadow:none!important;background-color:transparent!important}';
  document.head.appendChild(style);
}

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');
const roleLabel = (r) => String(r || 'contact').replace(/_/g, ' ');
const mid = (m) => (m && (m.id != null ? m.id : m.missionId));
const rewardOf = (m) => Math.max(0, Math.round(Number(
  m && (m.reward != null ? m.reward : (m.reward_cr != null ? m.reward_cr : (m.rewardCr != null ? m.rewardCr : m.payout))),
) || 0));

/** Durable, optional station handoff for the authored first purchased Tethys rumor. */
export function tethysRumorGuidance(state, stationId) {
  const discovery = TETHYS_BLACK_MARKET_DISCOVERY;
  if (stationId !== discovery.stationId) return null;
  const record = state && state.world && state.world.frontierRumors && state.world.frontierRumors.byId
    && state.world.frontierRumors.byId[discovery.rumorId];
  if (!record || record.phase !== 'rumored') return null;
  return {
    rumorId: discovery.rumorId,
    sectorId: discovery.sectorId,
    label: 'Quiet Traffic Lead',
  };
}

export function openTethysRumorGuidanceMap(ctx, stationId) {
  const guidance = tethysRumorGuidance(ctx && ctx.state, stationId);
  if (!guidance) return false;
  return openGalaxyMap(ctx, {
    focus: MAP_FOCUS.SYSTEM,
    sectorId: guidance.sectorId,
    label: guidance.label,
    source: 'station-bar:tethys-rumor-guidance',
  });
}

/** An offer's one verb as a primary word (the `sx-btn-primary` of old, in kit clothes). */
function offerWord(attrs, label) {
  return `<ul class="k-words k-words--row sx-bar-offer__foot"><li><button type="button" class="k-word k-word--emph k-word--primary sx-bar-offer__verb" ${attrs}>${label}</button></li></ul>`;
}

export function createBarScreen(ctx) {
  const el = document.createElement('div');
  el.className = 'k-panel sx-bar';
  el.innerHTML = barFrameHtml();
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

  function dressShell() {
    const shell = (el.closest && el.closest('.sx-berth, .sx-app, .k-screen'))
      || (typeof document !== 'undefined' ? document : el);
    dressEvents(shell);
    dressComms(shell);
  }

  function dressRail() {
    ensureBarStyle();
    paintLegend(railEl.querySelector('.k-caps'), true);
    pinKeyrack(railEl.querySelector('.sx-bar__rows'));
    for (const btn of railEl.querySelectorAll('[data-contact]')) {
      paintKey(btn, 'legend');
      pin(btn, {
        'min-height': '44px',
        'flex-direction': 'column',
        'align-items': 'flex-start',
        'justify-content': 'center',
        width: '100%',
      });
    }
    syncKeys(railEl);
  }

  function dressStage() {
    ensureBarStyle();
    if (stageEl.querySelector('.sx-empty')) {
      paintLegend(stageEl.querySelector('.sx-empty'), true);
      return;
    }
    const talk = stageEl.querySelector('.sx-talk') || stageEl;
    paintPlate(talk, 'sunk');
    paintLegend(stageEl.querySelector('.sx-talk__role'), true);
    paintMarking(stageEl.querySelector('.sx-talk__name'));
    pinKeyrack(stageEl.querySelector('.sx-talk__choices'));
    for (const btn of stageEl.querySelectorAll('[data-choice]')) paintKey(btn, 'legend');
    for (const offer of stageEl.querySelectorAll('.sx-bar-offer')) {
      paintPlate(offer, 'edge');
      pinKeyrack(offer.querySelector('.sx-bar-offer__chips'));
      pinKeyrack(offer.querySelector('.sx-bar-offer__foot'));
      for (const chip of offer.querySelectorAll('.sx-bar-offer__chip')) paintCap(chip);
      for (const row of offer.querySelectorAll('.sx-bar-offer__stake')) paintRow(row, false);
      const verb = offer.querySelector('.sx-bar-offer__verb');
      if (verb) paintKey(verb, 'primary');
    }
    syncKeys(stageEl);
  }

  function dressLeads() {
    ensureBarStyle();
    for (const cap of leadsEl.querySelectorAll('.k-caps')) paintLegend(cap, true);
    for (const row of leadsEl.querySelectorAll('.sx-lead, .sx-intel')) paintRow(row, false);
    pinKeyrack(leadsEl.querySelector('.sx-bar__foot'));
    pinKeyrack(leadsEl.querySelector('.sx-lead__rows'));
    for (const btn of leadsEl.querySelectorAll('[data-survey], [data-inspect], [data-log]')) {
      paintKey(btn, btn.hasAttribute('data-log') ? 'legend' : 'small');
    }
    syncKeys(leadsEl);
    dressShell();
  }

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
        `<p class="k-sentence sx-bar-offer__state"><span class="k-good">Accepted and tracked.</span> ${escapeHtml(label)} carries the route, timer, and progress. Launch when Departure Check is green.</p>` +
        offerWord(`data-open-mission-log="${escapeHtml(String(acceptedMissionId))}"`, `Open ${escapeHtml(label)}`) +
      `</section>`;
    }
    const offer = pendingMissionOffer;
    if (!offer || !missionOfferAvailable(state, offer.id)) return '';
    const preflight = missionPreflight(offer, state);
    const consequences = missionConsequenceSummary(offer);
    const unmet = offer.requirementUnmet || offer.lockedReason || preflight.blocker || null;
    return `<section class="sx-bar-offer" aria-label="Mission readiness">` +
      `<ul class="k-words k-words--row sx-bar-offer__chips">${preflight.chips.map((chip) =>
        `<li class="k-t-fine sx-bar-offer__chip is-${escapeHtml(chip.kind)} ${chip.kind === 'bad' || chip.kind === 'loss' ? 'k-bad' : (chip.kind === 'good' || chip.kind === 'gain' ? 'k-good' : 'k-62')}">${escapeHtml(chip.text)}</li>`).join('')}</ul>` +
      `<ul class="k-rows sx-bar-offer__stakes">${consequences.chips.map((chip) =>
        `<li class="k-row k-row--static sx-bar-offer__stake is-${escapeHtml(chip.kind)}"><span class="k-62">${escapeHtml(chip.label)}</span><span class="k-row__num ${chip.kind === 'loss' || chip.kind === 'bad' ? 'k-bad' : ''}">${escapeHtml(chip.text)}</span></li>`).join('')}</ul>` +
      (preflight.warning ? `<p class="k-sentence sx-bar-offer__warning">${escapeHtml(preflight.warning)}</p>` : '') +
      (unmet ? `<p class="k-sentence k-bad sx-bar-offer__blocker">${escapeHtml(unmet)}</p>` : '') +
      offerWord(`data-accept-mission="${escapeHtml(String(offer.id))}"${unmet ? ' disabled' : ''}`, 'Accept + track') +
    `</section>`;
  }

  function frontierRumorOfferHtml() {
    const offer = pendingFrontierRumorOffer;
    if (!offer) return '';
    return `<section class="sx-bar-offer" aria-label="Frontier rumor card">` +
      `<p class="k-sentence sx-bar-offer__state">${escapeHtml(offer.kindLabel)} · ${escapeHtml(offer.sectorName)} search area · ${fmt(offer.price)} cr.</p>` +
      `<p class="k-sentence sx-bar-offer__warning">Approximate bearing only — no waypoint or automatic discovery.</p>` +
      offerWord(`data-buy-frontier-rumor="${escapeHtml(offer.id)}"`, `Buy rumor card · ${fmt(offer.price)} cr`) +
    `</section>`;
  }

  function tethysRumorGuidanceHtml(state) {
    const guidance = tethysRumorGuidance(state, sid());
    if (!guidance) return '';
    return `<section class="sx-bar-offer" aria-label="Quiet Traffic Lead guidance">` +
      `<p class="k-sentence sx-bar-offer__state"><span class="k-good">Quiet Traffic Lead added.</span> Tethys holds a broad amber search area. Select the ring, fly it manually, and pulse the scanner.</p>` +
      offerWord('data-open-tethys-rumor-map aria-label="Open Tethys search map for the Quiet Traffic Lead"', 'Open Tethys search map') +
    `</section>`;
  }

  function dossArchiveMapOfferHtml(state, contact) {
    if (!contact || contact.id !== DOSS_ARCHIVE_CONTACT_ID || !dossArchiveMapOffer(state)) return '';
    return `<section class="sx-bar-offer" aria-label="Doss archive cross-reference">` +
      `<p class="k-sentence sx-bar-offer__state"><span class="k-good">Archive cross-reference.</span> The Candle Fleet is a map reference only. It does not set a course or create a mission.</p>` +
      offerWord('data-open-doss-archive-map aria-label="Open the system map at The Candle Fleet archive cross-reference"', 'Open Candle Fleet map') +
    `</section>`;
  }

  // Unlike the legacy Doss string template above, this new case surface is composed from semantic
  // nodes so all copy stays text and the map-only control has an explicit accessible name.
  function appendVonnFreightLossMapOffer(state, contact) {
    if (!contact || contact.id !== VONN_FREIGHT_CONTACT_ID || !vonnFreightLossMapOffer(state)) return;
    const mount = stageEl.querySelector('.sx-talk');
    if (!mount || mount.querySelector('[data-vonn-freight-loss-map-offer]')) return;
    const offer = document.createElement('section');
    offer.className = 'sx-bar-offer';
    offer.setAttribute('data-vonn-freight-loss-map-offer', '');
    offer.setAttribute('aria-label', 'Sker-Run freight wreck');
    const stateLine = document.createElement('p');
    stateLine.className = 'k-sentence sx-bar-offer__state';
    const heading = document.createElement('span');
    heading.className = 'k-good';
    heading.textContent = 'Verified wreck marker. ';
    const copy = document.createElement('span');
    copy.textContent = 'Evidence marker only — opens the system map and does not set a course or create a mission.';
    stateLine.append(heading, copy);
    const foot = document.createElement('ul');
    foot.className = 'k-words k-words--row sx-bar-offer__foot';
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'k-word k-word--emph k-word--primary sx-bar-offer__verb';
    button.setAttribute('data-open-vonn-freight-loss-map', '');
    button.textContent = 'Open Sker-Run wreck map';
    button.setAttribute('aria-label', 'Open the system map at the verified Sker-Run freight wreck.');
    item.append(button);
    foot.append(item);
    offer.append(stateLine, foot);
    mount.appendChild(offer);
  }

  // ---------- rail: who is here tonight ----------
  function renderRail(state) {
    const list = contacts(state);
    if (!list.length) {
      railEl.innerHTML = `<p class="k-caps">Here tonight</p><p class="k-empty sx-empty">Nobody here.</p>`;
      dressRail();
      return;
    }
    if (!selectedId) selectedId = list[0].id;
    railEl.innerHTML =
      `<p class="k-caps">Here tonight</p>` +
      `<ul class="k-words sx-bar__rows">` +
      list.map((c) => {
        const on = c.id === selectedId;
        return (
          `<li><button type="button" class="k-word k-word--emph sx-bar-row${on ? ' is-active' : ''}" data-contact="${escapeHtml(c.id)}" role="tab" aria-selected="${on}"${on ? ' aria-current="true"' : ''} tabindex="${on ? 0 : -1}">` +
            `${escapeHtml(c.name || 'Contact')}` +
            `<span class="k-word-sub sx-bar-row__role">${escapeHtml(roleLabel(c.role))}</span>` +
          `</button></li>`
        );
      }).join('') +
      `</ul>`;
    dressRail();
  }

  // ---------- stage: the conversation ----------
  function renderStage(state) {
    const c = selected(state);
    if (!c) {
      stageEl.innerHTML = `<p class="k-empty sx-empty">The bar is empty. Try a larger station.</p>`;
      dressStage();
      return;
    }
    const memory = stationContactMemoryFor(state, c.id);
    let memLine = '';
    try { memLine = stationContactMemoryLine(memory, c.line) || c.line || ''; } catch (_) { memLine = c.line || ''; }
    const choices = (() => { try { return getChoices(c.role, c) || []; } catch (_) { return []; } })();

    stageEl.innerHTML =
      `<div class="sx-talk">` +
        `<header class="sx-talk__head">` +
          `<div class="sx-talk__id">` +
            `<p class="k-caps sx-talk__role">${escapeHtml(roleLabel(c.role))}</p>` +
            `<h2 class="k-display k-t-title sx-talk__name">${escapeHtml(c.name || 'Contact')}</h2>` +
            (memLine ? `<p class="k-sentence sx-talk__memory">${escapeHtml(memLine)}</p>` : '') +
          `</div>` +
          `<span class="sx-talk__avatar" data-bigpic aria-hidden="true"></span>` +
        `</header>` +
        `<p class="k-sentence k-sentence--emph sx-talk__reply${saidText ? ' is-said' : ' is-idle'}">` +
          `${escapeHtml(saidText || 'They look up as you approach. Ask them something.')}` +
        `</p>` +
        `<ul class="k-words sx-talk__choices" aria-label="What you can ask">` +
          (choices.length
            ? choices.map((ch) => `<li><button type="button" class="k-word k-word--emph sx-choice" data-choice="${escapeHtml(ch.id)}">${escapeHtml(ch.label)}</button></li>`).join('')
            : `<li class="k-sentence sx-muted">They have nothing to say.</li>`) +
        `</ul>` + missionOfferHtml(state) + frontierRumorOfferHtml() + tethysRumorGuidanceHtml(state) + dossArchiveMapOfferHtml(state, c) +
      `</div>`;

    appendVonnFreightLossMapOffer(state, c);

    const big = stageEl.querySelector('[data-bigpic]');
    if (big) { try { mountContactPortrait(big, c, { className: 'sx-portrait sx-portrait--lg', size: 240 }); } catch (_) {} }
    dressStage();
  }

  // ---------- leads: intel + survey + board jobs ----------
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
      ? `<ul class="k-rows sx-intel__rows">${tags.map((t) =>
          `<li class="k-row k-row--static sx-intel sx-intel--${escapeHtml(t.kind || 'info')}"><span class="k-row__name">${escapeHtml(t.label)}</span><span class="k-row__sub">${escapeHtml(t.text)}</span></li>`).join('')}</ul>`
      : `<p class="k-sentence sx-muted">Nothing worth repeating yet.</p>`;

    const surveyRow = survey
      ? `<li class="k-row k-row--static sx-lead sx-lead--survey">` +
          `<span class="sx-lead__body"><span class="k-row__name sx-lead__t">${escapeHtml(survey.sectorName)}</span>` +
            `<span class="k-row__sub sx-lead__s">${escapeHtml(surveyOfferLabel ? (surveyOfferLabel(survey) || 'Nav data') : 'Nav data')}</span></span>` +
          `<button type="button" class="k-word k-word--fine sx-lead__go" data-survey="${escapeHtml(survey.sectorId)}"${credits >= survey.price ? '' : ' disabled'}>Buy · ${fmt(survey.price)} cr</button>` +
        `</li>`
      : '';

    const leadRows = leads.map((m) => `<li class="k-row k-row--static sx-lead">` +
        `<span class="sx-lead__body"><span class="k-row__name sx-lead__t">${escapeHtml(m.title || 'Contract')}</span>` +
          `<span class="k-row__sub sx-lead__s">${fmt(rewardOf(m))} cr</span></span>` +
        `<button type="button" class="k-word k-word--fine sx-lead__go" data-inspect="${escapeHtml(String(mid(m)))}">Inspect</button>` +
      `</li>`).join('');

    leadsEl.innerHTML =
      `<p class="k-caps">Leads</p>` +
      (surveyRow || leadRows
        ? `<ul class="k-rows sx-lead__rows">${surveyRow}${leadRows}</ul>`
        : `<p class="k-sentence sx-muted">No leads on the board${survey ? '' : ' and no survey data for sale here'}.</p>`) +
      `<ul class="k-words k-words--row sx-bar__foot"><li><button type="button" class="k-word k-word--fine sx-bar__log" data-log>Open the board</button></li></ul>` +
      `<p class="k-caps sx-intel__head">Intel</p>` +
      intelHtml;
    dressLeads();
  }

  function renderAll(state) { renderRail(state); renderStage(state); renderLeads(state); }

  // ---------- interactions ----------
  function selectContact(id, focus) {
    if (!id || id === selectedId) return;
    selectedId = id; saidText = null; pendingMissionOffer = null; pendingFrontierRumorOffer = null; acceptedMissionId = null;
    const st = ctx.state || {};
    renderRail(st); renderStage(st); renderLeads(st);
    if (focus) {
      const word = railEl.querySelector(`[data-contact="${CSS.escape(id)}"]`);
      if (word && typeof word.focus === 'function') word.focus();
    }
    if (ctx.bus) ctx.bus.emit('audio:cue', { id: 'ui_tab' });
  }

  railEl.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-contact]'); if (!b) return;
    selectContact(b.getAttribute('data-contact'), false);
  });
  railEl.addEventListener('keydown', (ev) => {
    const words = [...railEl.querySelectorAll('[data-contact]')];
    const cur = words.indexOf(ev.target.closest('[data-contact]'));
    if (cur < 0 || !words.length) return;
    let next = -1;
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowRight') next = (cur + 1) % words.length;
    else if (ev.key === 'ArrowUp' || ev.key === 'ArrowLeft') next = (cur - 1 + words.length) % words.length;
    else if (ev.key === 'Home') next = 0;
    else if (ev.key === 'End') next = words.length - 1;
    else return;
    ev.preventDefault();
    selectContact(words[next].getAttribute('data-contact'), true);
  });

  stageEl.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-open-vonn-freight-loss-map]')) {
      if (openVonnFreightLossMap(ctx) && ctx.bus) ctx.bus.emit('audio:cue', { id: 'ui_open' });
      return;
    }
    if (ev.target.closest('[data-open-doss-archive-map]')) {
      if (openDossArchiveMap(ctx) && ctx.bus) ctx.bus.emit('audio:cue', { id: 'ui_open' });
      return;
    }
    if (ev.target.closest('[data-open-tethys-rumor-map]')) {
      if (openTethysRumorGuidanceMap(ctx, sid()) && ctx.bus) ctx.bus.emit('audio:cue', { id: 'ui_open' });
      return;
    }
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
      emitBarContactChoice(ctx.bus, {
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

  watchEvents();
  watchComms();

  return {
    el,
    onShow(c) { renderAll((c || ctx).state || {}); },
    refresh(c) { renderAll((c || ctx).state || {}); },
    dispose() { pinnedContact = null; },
  };
}
