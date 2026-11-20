// Station arrival concourse (SCREENS-1-STATION Part A).
// Calm landing view over the 3D berth: station identity + character line, one news line,
// one combined service bar with itemised Repair/Refuel/Rearm, and large numbered doors.

import { escapeHtml } from '../../comms.js';
import { entitySpanHtml } from '../../entityResolver.js';
import { stationTabGlyphSvg } from '../../icons/index.js';
import { stationControlAttrs, stationControlLabel } from '../stationBindingMap.js';
import {
  resolveStationIdentity,
  buildServiceBundle,
  buildConcourseNews,
  buildConcourseDoors,
} from '../concourseModel.js';
import { firstDockHandoffVisible, firstDockHandoffSteps } from '../stationDepartureModel.js';

function fmtCr(n) {
  return Math.max(0, Math.round(Number(n) || 0)).toLocaleString('en-US');
}

function playerEntity(state) {
  return state && state.entities && typeof state.entities.get === 'function' && state.playerId != null
    ? state.entities.get(state.playerId) : null;
}

function doorGlyphSvg(glyph, size = 16) {
  if (glyph === 'people') {
    const stroke = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" stroke-linejoin="miter"';
    return `<svg class="dust-tab-glyph" viewBox="0 0 24 24" width="${size}" height="${size}" ${stroke} style="vertical-align:-2.5px;margin-right:6px" aria-hidden="true" focusable="false" data-tab-glyph="people">` +
      `<circle cx="9.5" cy="8.5" r="3" ${stroke}/><path ${stroke} d="M4 19c.6-3.2 2.7-5 5.5-5s4.9 1.8 5.5 5"/>` +
      `<circle cx="16.8" cy="9.5" r="2.2" ${stroke} opacity="0.78"/><path ${stroke} d="M15.8 14.5c2 .3 3.6 1.8 4.2 4.5" opacity="0.78"/></svg>`;
  }
  return stationTabGlyphSvg(glyph, { size });
}

export function createConcourseScreen(ctx, hooks = {}) {
  const el = document.createElement('section');
  el.className = 'sx-concourse';
  el.setAttribute('aria-label', 'Station concourse');

  let lastSignature = '';
  let currentDoors = [];

  function resolveHandoff(state, stationId) {
    let visible = false;
    try { visible = !!firstDockHandoffVisible(state, stationId); } catch (_) { visible = false; }
    const dismissed = !!(ctx?.screenMemory?.read?.('station', 'firstDockHandoffDismissed', false));
    if (!visible || dismissed) return null;
    let steps = [];
    try { steps = firstDockHandoffSteps(state) || []; } catch (_) { steps = []; }
    const next = steps.find((st) => st && !st.done) || null;
    if (!next) return null;
    const doneCount = steps.filter((st) => st && st.done).length;
    return {
      next,
      doneCount,
      total: steps.length,
      target: typeof hooks.resolveHandoffTarget === 'function' ? hooks.resolveHandoffTarget(next.targetTab) : null,
    };
  }

  function render() {
    const state = (ctx && ctx.state) || {};
    const stationId = state.ui?.dockedStationId || null;
    const identity = resolveStationIdentity(state, stationId, ctx?.station || null);
    const ship = playerEntity(state);
    const credits = Math.max(0, Math.round(Number(state.player?.credits) || 0));
    const cargo = state.player?.cargo || {};
    const usedHold = Math.round(Number(cargo.usedVolume) || 0);
    const capHold = Math.round(Number(cargo.capVolume) || 0);
    const fuel = state.fuel || {};
    const fuelPct = fuel.max > 0 ? Math.round(Math.max(0, Math.min(1, (fuel.current || 0) / fuel.max)) * 100) : 100;
    const hullPct = ship && ship.hullMax > 0 ? Math.round(Math.max(0, Math.min(1, (ship.hull || 0) / ship.hullMax)) * 100) : 100;

    const service = buildServiceBundle(state, ship, hooks.serviceQuote);
    const news = buildConcourseNews(state, stationId, identity);
    const handoff = resolveHandoff(state, stationId);
    const attention = typeof hooks.getAttention === 'function' ? hooks.getAttention() : null;
    const doors = buildConcourseDoors(state, stationId, identity, {
      attention,
      peopleTarget: hooks.peopleTarget || 'bar',
      handoffTarget: handoff?.target?.destination || null,
    });
    currentDoors = doors;

    const authorityHtml = identity.factionName
      ? (identity.factionId
        ? entitySpanHtml('faction:' + identity.factionId, escapeHtml(identity.factionName))
        : escapeHtml(identity.factionName))
      : '';
    const eyebrowParts = [identity.typeLabel ? escapeHtml(identity.typeLabel) : '', authorityHtml].filter(Boolean);
    const nameHtml = identity.id
      ? entitySpanHtml('station:' + identity.id, escapeHtml(identity.name))
      : escapeHtml(identity.name);

    const newsActionAttr = news.actionDoor
      ? ` data-news-door="${escapeHtml(news.actionDoor)}"${news.actionSub ? ` data-news-sub="${escapeHtml(news.actionSub)}"` : ''}`
      : '';
    const newsHtml = `<div class="sx-cc__news" data-priority="${escapeHtml(news.priority)}">` +
      `<span class="sx-cc__news-tag">${escapeHtml(news.tag)}</span>` +
      `<p class="sx-cc__news-text">${escapeHtml(news.text)}</p>` +
      (news.actionDoor
        ? `<button type="button" ${stationControlAttrs('concourse-news-link')} class="sx-cc__news-go"${newsActionAttr}>Open</button>`
        : '') +
      `</div>`;

    const handoffHtml = handoff && handoff.next
      ? (() => {
        const t = handoff.target || {};
        const targetAttr = t.destination
          ? ` data-cc-handoff="${escapeHtml(t.destination)}"`
          : (t.action ? ` data-cc-handoff-act="${escapeHtml(t.action)}"` : '');
        const modeAttr = (handoff.next.tradeMode === 'sell' || handoff.next.tradeMode === 'buy')
          ? ` data-cc-handoff-mode="${handoff.next.tradeMode}"`
          : '';
        return `<aside class="sx-cc__teach" aria-label="First-visit guide">` +
          `<button type="button" ${stationControlAttrs('handoff-step')} class="sx-cc__teach-go"${targetAttr}${modeAttr}>` +
            `<span class="sx-cc__teach-step">Step ${handoff.doneCount + 1} of ${handoff.total}</span>` +
            `<strong class="sx-cc__teach-title">${escapeHtml(handoff.next.title)}</strong>` +
            `<span class="sx-cc__teach-text">${escapeHtml(handoff.next.text)}</span>` +
          `</button>` +
          `<button type="button" ${stationControlAttrs('dismiss-handoff')} class="sx-cc__teach-x" data-cc-handoff-dismiss aria-label="${stationControlLabel('dismiss-handoff')} guide">${stationControlLabel('dismiss-handoff')}</button>` +
        `</aside>`;
      })()
      : '';

    const primaryDisabled = service.ready || service.blocked;
    const serviceItemsHtml = service.items.map((item) => {
      const stateCls = item.done ? ' is-done' : (item.disabled ? ' is-blocked' : ' is-needed');
      const ariaDisabled = item.disabled ? ' aria-disabled="true"' : '';
      const whyAttr = item.why ? ` data-why="${escapeHtml(item.why)}"` : '';
      const title = item.why
        ? `${item.label} unavailable: ${item.why}`
        : (item.done ? `${item.label}: ${item.priceText}` : `${item.label} for ${item.priceText}`);
      return `<button type="button" ${stationControlAttrs(item.id)} class="sx-cc-svc__item${stateCls}"` +
        ` data-cc-service="${escapeHtml(item.id)}"${ariaDisabled}${whyAttr} aria-label="${escapeHtml(title)}">` +
        `<span class="sx-cc-svc__item-label">${escapeHtml(item.label)}</span>` +
        `<span class="sx-cc-svc__item-price">${escapeHtml(item.priceText)}</span>` +
        `</button>`;
    }).join('');

    const decantBtnHtml = service.decant
      ? `<button type="button" ${stationControlAttrs('decant')} class="sx-cc-svc__item is-needed" data-cc-service="decant"` +
          ` aria-label="Decant carried fuel cells into tank (+${service.decant.units} fuel)">` +
          `<span class="sx-cc-svc__item-label">Decant</span>` +
          `<span class="sx-cc-svc__item-price">+${service.decant.units} fuel</span>` +
        `</button>`
      : '';

    const yardNoticeHtml = service.yard && service.yard.count > 0 && service.yard.head
      ? `<p class="sx-cc-svc__note">Yard working: ${escapeHtml(service.yard.head.type === 'refuel' ? 'Refuelling' : 'Repairing')} — stay docked until finished.</p>`
      : (service.blockedReason
        ? `<p class="sx-cc-svc__note is-warn">${escapeHtml(service.blockedReason)}</p>`
        : '');

    const serviceHtml = `<section class="sx-cc__service" aria-label="Ship service">` +
      `<div class="sx-cc-svc__top">` +
        `<button type="button" ${stationControlAttrs('service-all')} class="sx-cc-svc__primary${service.ready ? ' is-ready' : ''}${service.blocked ? ' is-blocked' : ''}"` +
          ` data-cc-service-all${primaryDisabled ? ' aria-disabled="true"' : ''}` +
          `${service.blockedReason ? ` data-why="${escapeHtml(service.blockedReason)}"` : ''}` +
          ` aria-label="${escapeHtml(service.primaryLabel + (service.blockedReason ? '. ' + service.blockedReason : ''))}">` +
          `<span class="sx-cc-svc__primary-label">${escapeHtml(service.primaryLabel)}</span>` +
        `</button>` +
        `<span class="sx-cc-svc__status">${escapeHtml(service.summaryLine)}</span>` +
      `</div>` +
      `<div class="sx-cc-svc__items" role="group" aria-label="Individual ship services">${serviceItemsHtml}${decantBtnHtml}</div>` +
      yardNoticeHtml +
    `</section>`;

    const doorsHtml = `<nav class="sx-cc__doors" data-count="${doors.length}" aria-label="Station doors">` +
      doors.map((door) => {
        const badgeHtml = door.badge
          ? `<span class="sx-cc-door__badge is-${escapeHtml(door.tone)}">${escapeHtml(door.badge)}</span>`
          : '';
        const subAttr = door.openOptions?.sub ? ` data-door-sub="${escapeHtml(door.openOptions.sub)}"` : '';
        return `<button type="button" ${stationControlAttrs(door.controlId)} class="sx-cc-door is-${escapeHtml(door.tone)}"` +
          ` data-cc-door="${escapeHtml(door.id)}" data-cc-door-key="${escapeHtml(door.key)}"${subAttr}` +
          ` aria-label="Door ${escapeHtml(door.key)}, ${escapeHtml(door.label)}. ${escapeHtml(door.summary)}">` +
          `<span class="sx-cc-door__head">` +
            `<kbd class="sx-cc-door__key" aria-hidden="true">${escapeHtml(door.key)}</kbd>` +
            `<span class="sx-cc-door__title">${doorGlyphSvg(door.glyph, 16)}<span>${escapeHtml(door.label)}</span></span>` +
            badgeHtml +
          `</span>` +
          `<span class="sx-cc-door__summary">${escapeHtml(door.summary)}</span>` +
        `</button>`;
      }).join('') +
    `</nav>`;

    const html =
      `<header class="sx-cc__hero">` +
        `<div class="sx-cc__identity">` +
          `<p class="sx-cc__eyebrow">${eyebrowParts.join(' · ')}</p>` +
          `<h1 class="sx-cc__name">${nameHtml}</h1>` +
          `<p class="sx-cc__note">${escapeHtml(identity.chartNote)}</p>` +
        `</div>` +
        `<div class="sx-cc__purse" aria-label="Ship account and vitals">` +
          `<div class="sx-cc__credits"><span class="sx-cc__credits-k">Credits</span><strong class="sx-cc__credits-v"><span class="sx-cc__credits-unit">CR</span>${fmtCr(credits)}</strong></div>` +
          `<div class="sx-cc__vitals">` +
            `<span class="sx-cc__vital${hullPct < 70 ? ' is-warn' : ''}">Hull <b>${hullPct}%</b></span>` +
            `<span class="sx-cc__vital${fuelPct < 45 ? ' is-warn' : ''}">Fuel <b>${fuelPct}%</b></span>` +
            `<span class="sx-cc__vital">Hold <b>${usedHold}/${capHold}</b></span>` +
          `</div>` +
        `</div>` +
      `</header>` +
      newsHtml +
      `<div class="sx-cc__spacer" aria-hidden="true"></div>` +
      `<div class="sx-cc__lower">` +
        handoffHtml +
        serviceHtml +
        doorsHtml +
      `</div>`;

    if (html !== lastSignature) {
      el.innerHTML = html;
      lastSignature = html;
    }
  }

  el.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-cc-handoff-dismiss]')) {
      hooks.onDismissHandoff?.();
      render();
      return;
    }
    const handoffAct = ev.target.closest('[data-cc-handoff-act]');
    if (handoffAct) {
      hooks.onHandoffAction?.(handoffAct.getAttribute('data-cc-handoff-act'));
      return;
    }
    const handoffDoor = ev.target.closest('[data-cc-handoff]');
    if (handoffDoor) {
      const dest = handoffDoor.getAttribute('data-cc-handoff');
      const tradeMode = handoffDoor.getAttribute('data-cc-handoff-mode') || undefined;
      hooks.onOpenDoor?.(dest, tradeMode ? { tradeMode } : {});
      return;
    }
    const newsLink = ev.target.closest('[data-news-door]');
    if (newsLink) {
      const dest = newsLink.getAttribute('data-news-door');
      const sub = newsLink.getAttribute('data-news-sub') || undefined;
      hooks.onOpenDoor?.(dest, sub ? { sub } : {});
      return;
    }
    const svcAll = ev.target.closest('[data-cc-service-all]');
    if (svcAll) {
      hooks.onServiceAll?.();
      return;
    }
    const svcOne = ev.target.closest('[data-cc-service]');
    if (svcOne) {
      hooks.onServiceOne?.(svcOne.getAttribute('data-cc-service'));
      return;
    }
    const doorBtn = ev.target.closest('[data-cc-door]');
    if (doorBtn) {
      const dest = doorBtn.getAttribute('data-cc-door');
      const sub = doorBtn.getAttribute('data-door-sub') || undefined;
      hooks.onOpenDoor?.(dest, sub ? { sub } : {});
    }
  });

  function openDoorByKey(num) {
    const door = currentDoors.find((d) => String(d.key) === String(num));
    if (!door) return false;
    hooks.onOpenDoor?.(door.id, door.openOptions || {});
    return true;
  }

  return {
    el,
    onShow() { lastSignature = ''; render(); },
    onHide() {},
    refresh() { render(); },
    openDoorByKey,
    getDoors() { return currentDoors.slice(); },
    dispose() { el.replaceChildren(); },
  };
}
