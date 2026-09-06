// src/ui/station/screens/bar.js — "Bar": the conversation instrument.
// Contact rail · a real conversation centrepiece (portrait, what they remember of you, what they
// just said, what you can ask) · leads column (survey data + mission leads).
// Reuses the existing contact engine in screens/bar.js — no gameplay reinvented.
// Emits ui:talkContact / ui:purchaseSurveyData / ui:acceptMission / ui:pushScreen.
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
import { icon } from '../icons.js';
import {
  frontierRumorOffer,
  frontierRumorOwned,
  TETHYS_BLACK_MARKET_DISCOVERY,
} from '../../../data/frontierRumors.js';
import { DOSS_ARCHIVE_CONTACT_ID, dossArchiveMapOffer } from '../../../data/dossArchive.js';
import { VONN_FREIGHT_CONTACT_ID, vonnFreightLossMapOffer } from '../../../data/vonnFreightLoss.js';
import { MAP_FOCUS, openGalaxyMap } from '../../mapAuthority.js';

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');
const roleLabel = (r) => String(r || 'contact').replace(/_/g, ' ');
const mid = (m) => (m && (m.id != null ? m.id : m.missionId));
const rewardOf = (m) => Math.max(0, Math.round(Number(
  m && (m.reward != null ? m.reward : (m.reward_cr != null ? m.reward_cr : (m.rewardCr != null ? m.rewardCr : m.payout))),
) || 0));

// Bar corrections that belong to this screen (scoped under .sx-bar; no other host reuses these
// classes inside the station): contact tabs size to their name instead of shearing it mid-word,
// the leads panels get a visible slim scrollbar for their overflow, procedural placeholder
// portraits are neutralized (one hashes to bright purple), and an untouched transcript collapses
// to its content instead of holding one prompt line in a tall dark panel.
// Named BAR_CSS, not CSS — this module calls the global CSS.escape, and a module binding named
// CSS would shadow it (that threw "CSS.escape is not a function" and blanked the stage).
const STYLE_ID = 'sf-bar-style';
function injectStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = BAR_CSS;
  document.head.appendChild(s);
}

const BAR_CSS = `
.sx-bar .sx-bar-row { flex: 0 1 auto; min-width: 178px; max-width: 264px; }
.sx-bar .sx-bar__leads > .sx-panel {
  position: relative;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: none;
}
.sx-bar .sx-bar__leads > .sx-panel::-webkit-scrollbar { display: none; width: 0; height: 0; }
/* This Chromium answers overflow with an auto-hiding overlay scrollbar — nothing visible at
   rest — so each leads panel carries the same always-visible slim progress track as the
   shipworks chooser list. */
.sx-bar .sx-leadtrack {
  position: absolute; right: 4px; top: 8px; bottom: 5px; width: 3px; border-radius: 2px;
  background: color-mix(in srgb, var(--sf-edge, #2c343f) 60%, transparent);
  pointer-events: none;
}
.sx-bar .sx-leadtrack i {
  display: block; width: 100%; height: 100%; border-radius: inherit;
  background: color-mix(in srgb, var(--accent, #4f8fdd) 55%, transparent);
}
.sx-bar canvas.sx-portrait { filter: grayscale(1) contrast(1.05) brightness(.94); }
/* Idle stage keeps the live layout (tall reply area, prompts anchored below): the old
   auto/1fr swap shrank the reply to its content, overlapping the kicker and leaving a
   dead band under the prompts. */
.sx-bar .sx-talk__reply.is-idle { padding: 40px clamp(30px, 5vw, 78px) 18px; align-content: center; }
.sx-bar .sx-talk__reply.is-idle::before { content: "TRANSCRIPT / NO LINES YET"; }
.sx-bar .sx-talk__reply.is-idle .sx-talk__quote { font-size: 44px; opacity: .2; }
.sx-bar .sx-talk__reply.is-idle p { color: var(--sf-calm, #9aa4b0); font-size: clamp(16px, 1.35vw, 19px); }
`;

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

export function createBarScreen(ctx) {
  injectStyle();
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

  function tethysRumorGuidanceHtml(state) {
    const guidance = tethysRumorGuidance(state, sid());
    if (!guidance) return '';
    return `<section class="sx-bar-offer" aria-label="Quiet Traffic Lead guidance">` +
      `<div class="sx-bar-offer__state"><b>QUIET TRAFFIC LEAD ADDED</b><span>Tethys holds a broad amber search area. Select the ring, fly it manually, and pulse the scanner.</span></div>` +
      `<button type="button" class="sx-btn-primary" data-open-tethys-rumor-map aria-label="Open Tethys search map for the Quiet Traffic Lead">OPEN TETHYS SEARCH MAP</button>` +
    `</section>`;
  }

  function dossArchiveMapOfferHtml(state, contact) {
    if (!contact || contact.id !== DOSS_ARCHIVE_CONTACT_ID || !dossArchiveMapOffer(state)) return '';
    return `<section class="sx-bar-offer" aria-label="Doss archive cross-reference">` +
      `<div class="sx-bar-offer__state"><b>ARCHIVE CROSS-REFERENCE</b><span>The Candle Fleet is a map reference only. It does not set a course or create a mission.</span></div>` +
      `<button type="button" class="sx-btn-primary" data-open-doss-archive-map aria-label="Open the system map at The Candle Fleet archive cross-reference">OPEN CANDLE FLEET MAP</button>` +
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
    const stateLine = document.createElement('div');
    stateLine.className = 'sx-bar-offer__state';
    const heading = document.createElement('b');
    heading.textContent = 'VERIFIED WRECK MARKER';
    const copy = document.createElement('span');
    copy.textContent = 'Evidence marker only — opens the system map and does not set a course or create a mission.';
    stateLine.append(heading, copy);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sx-btn-primary';
    button.setAttribute('data-open-vonn-freight-loss-map', '');
    button.textContent = 'OPEN SKER-RUN WRECK MAP';
    button.setAttribute('aria-label', 'Open the system map at the verified Sker-Run freight wreck.');
    offer.append(stateLine, button);
    mount.appendChild(offer);
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
        `<div class="sx-talk__reply${saidText ? ' is-said' : ' is-idle'}">` +
          `<span class="sx-talk__quote">&ldquo;</span>` +
          `<p>${escapeHtml(saidText || 'They look up as you approach. Ask them something.')}</p>` +
        `</div>` +
        `<div class="sx-talk__choices">` +
          (choices.length
            ? choices.map((ch) => `<button type="button" class="sx-choice" data-choice="${escapeHtml(ch.id)}">${escapeHtml(ch.label)}</button>`).join('')
            : `<p class="sx-muted">They have nothing to say.</p>`) +
        `</div>` + missionOfferHtml(state) + frontierRumorOfferHtml() + tethysRumorGuidanceHtml(state) + dossArchiveMapOfferHtml(state, c) +
      `</div>`;

    appendVonnFreightLossMapOffer(state, c);

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
      `<div class="sx-panel"><div class="sx-panel__head">${icon('spark', 15)}<span>Intel</span></div>${intelHtml}<span class="sx-leadtrack" aria-hidden="true"><i></i></span></div>` +
      `<div class="sx-panel"><div class="sx-panel__head">${icon('route', 15)}<span>Survey Data</span></div>${surveyHtml}<span class="sx-leadtrack" aria-hidden="true"><i></i></span></div>` +
      `<div class="sx-panel"><div class="sx-panel__head">${icon('contracts', 15)}<span>Leads</span></div>${leadsHtml}` +
        `<button type="button" class="sx-btn-ghost sx-bar__log" data-log>Open Mission Log</button><span class="sx-leadtrack" aria-hidden="true"><i></i></span></div>`;
    syncLeadTracks();
  }

  // The platform scrollbar is an auto-hiding overlay here (nothing visible at rest), so each
  // leads panel carries a slim always-visible progress track mirroring its scrollTop.
  function syncLeadTracks() {
    for (const panel of leadsEl.querySelectorAll(':scope > .sx-panel')) {
      const track = panel.querySelector('.sx-leadtrack');
      if (!track) continue;
      const overflow = panel.scrollHeight - panel.clientHeight;
      if (overflow <= 1) { track.hidden = true; continue; }
      track.hidden = false;
      const ratio = Math.max(.15, Math.min(1, panel.clientHeight / panel.scrollHeight));
      const progress = Math.max(0, Math.min(1, panel.scrollTop / overflow));
      const thumb = track.firstElementChild;
      thumb.style.height = `${(ratio * 100).toFixed(2)}%`;
      thumb.style.transform = `translateY(${(progress * (100 / ratio - 100)).toFixed(2)}%)`;
    }
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

  // scroll does not bubble, but a capture listener on the leads root still sees any panel scroll
  leadsEl.addEventListener('scroll', syncLeadTracks, { capture: true, passive: true });
  leadsEl.addEventListener('click', (ev) => {    const st = ctx.state || {};
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
