import {
  CONTACT_HAIL_ACTION_ABANDON,
  CONTACT_HAIL_ACTION_ASSIST,
  CONTACT_HAIL_ACTION_ESCORT,
  CONTACT_HAIL_ACTION_HEAVE_TO,
  CONTACT_HAIL_ACTION_HELP,
  CONTACT_HAIL_ACTION_RECOVER,
  CONTACT_HAIL_ACTION_STEAL,
  CONTACT_HAIL_RANGE,
  CONTACT_HAIL_RECEIPT_TTL_S,
  CONTACT_HAIL_REQUEST_TTL_S,
  contactHailAvailability,
  createContactHailOffer,
} from '../data/contactHail.js';
import { MODULES } from '../data/modules.js';
import { SHIPS } from '../data/ships.js';
import { NEW_GAME } from '../data/newGameDefaults.js';
import { buildSlotList, fits } from '../systems/ships.js';
import { isUiInteractionFenced, spatialFocusTarget } from './input.js';
import { createMorphLabel } from './effects/morphLabel.js';
import { factionIcon, icon as stationIcon } from './station/icons.js';
import { FACTION_META } from '../data/factions.js';
import { tierFor, factionStandingGuidance } from './screens/factions.js';
import { resolveEntity } from './entityResolver.js';

const MODULE_BY_ID = new Map(MODULES.map((row) => [row.id, row]));
const SHIP_BY_ID = new Map(SHIPS.map((row) => [row.id, row]));
const FACTION_META_BY_ID = new Map(FACTION_META.map((row) => [row.id, row]));
const HEAVE_TO_ROLES = new Set([
  'hauler',
  'courier',
  'miner',
  'smuggler',
  'express',
  'trader',
  'surveyor',
  'salvor',
  'tender',
  'ore_carrier',
  'patrol',
  'escort',
]);

const ACTION_ICON = Object.freeze({
  status: '<path d="M6 6h12M6 12h12M6 18h12"/><circle cx="4" cy="6" r="1.2"/><circle cx="4" cy="12" r="1.2"/><circle cx="4" cy="18" r="1.2"/>',
  identify: '<circle cx="12" cy="8" r="3.2"/><path d="M5.8 18.2c1.8-2.8 3.9-4.2 6.2-4.2 2.3 0 4.4 1.4 6.2 4.2"/>',
  route: '<circle cx="5.4" cy="17.6" r="2.1"/><circle cx="18.6" cy="6.4" r="2.1"/><path d="M7.1 16.2l9.6-8.4" stroke-dasharray="2.2 2.8"/>',
  manifest: '<path d="M7 3h8l4 4v14H7z"/><path d="M15 3v4h4M10 12h6M10 15h6"/>',
  heave_to: '<path d="M12 3.2v17.6M4.8 7.4l7.2 5.2 7.2-5.2"/><path d="M5.6 20.8h12.8"/>',
  help: '<path d="M12 4.2v15.6M4.2 12h15.6"/><circle cx="12" cy="12" r="7.8"/>',
  escort: '<path d="M4 16.5l5.4-5.3 3.4 3.4 7.2-7.1"/><path d="M14.8 7.5h5.2v5.2"/>',
  recover: '<path d="M5 11.2l7-7 7 7"/><path d="M12 4.2v11.2"/><path d="M6.2 17.2h11.6"/>',
  steal: '<path d="M8.2 11.2V8.8a3.8 3.8 0 1 1 7.6 0v2.4"/><rect x="6.2" y="11.2" width="11.6" height="8.2" rx="1.2"/><circle cx="12" cy="15.2" r="1.1"/>',
  abandon: '<path d="M4.2 6.4h15.6M8 6.4v12.8M16 6.4v12.8"/><path d="M5.8 19.2h12.4"/>',
  assist: '<path d="M12 4.2c4.1 0 7.4 3.3 7.4 7.4S16.1 19 12 19s-7.4-3.3-7.4-7.4S7.9 4.2 12 4.2Z"/><path d="M8.8 12h6.4M12 8.8v6.4"/>',
});

const KNOWN_ACTION_IDS = new Set(Object.keys(ACTION_ICON));
const CLOSE_GLYPH = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>';

function entityById(state, id) {
  if (!state || id == null) return null;
  if (state.entities && typeof state.entities.get === 'function') return state.entities.get(id) || null;
  return (state.entityList || []).find((row) => row && row.id === id) || null;
}

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

function hashSeed(value) {
  const text = String(value || '');
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash || 1;
}

function seededRandom(seed) {
  let state = seed >>> 0 || 1;
  return () => {
    state = Math.imul(state, 1664525) + 1013904223;
    state >>>= 0;
    return state / 4294967295;
  };
}

function roleWord(entity) {
  const data = entity && entity.data || {};
  return String(data.trafficRole || data.role || entity && entity.role || '').trim().toLowerCase();
}

function callsign(entity) {
  const data = entity && entity.data || {};
  return String(data.callsign || data.trafficLabel || data.scanLabel || data.name || 'UNIDENTIFIED')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function resolveFactionId(entity) {
  const data = entity && entity.data || {};
  const factionId = typeof data.factionId === 'string' && data.factionId
    ? data.factionId
    : typeof data.faction === 'string' && data.faction
      ? data.faction
      : '';
  return factionId || null;
}

function classWordFromOffer(payload, availability, entity) {
  const lines = Array.isArray(payload && payload.lines) ? payload.lines : [];
  const line = String(lines[0] || '').trim();
  const split = line.split('·');
  if (split.length >= 2) {
    const word = split[split.length - 1].trim().toUpperCase();
    if (word) return word;
  }
  const role = roleWord(entity);
  if (role) return role.replace(/_/g, ' ').toUpperCase();
  const kind = String(availability && availability.kind || payload && payload.kind || '').trim();
  if (!kind) return 'CONTACT';
  return kind.replace(/_/g, ' ').toUpperCase();
}

function densityForContact(kind, role) {
  if (kind === 'patrol') return 0.92;
  if (kind === 'worker') return role === 'miner' || role === 'ore_carrier' ? 0.74 : 0.66;
  if (kind === 'toll') return 0.82;
  if (kind === 'trader') return role === 'courier' ? 0.62 : 0.48;
  if (role === 'escort' || role === 'patrol') return 0.86;
  return 0.56;
}

export function resolveHailVisual(state, payload, availability = null) {
  if (!payload && !availability) return null;
  const targetId = payload && payload.targetId != null ? payload.targetId : availability && availability.targetId;
  const entity = entityById(state, targetId);
  const kind = String(availability && availability.kind || payload && payload.kind || '').trim();
  const role = roleWord(entity);
  const density = densityForContact(kind, role);
  const pilot = callsign(entity);
  const classWord = classWordFromOffer(payload, availability, entity);
  const factionId = resolveFactionId(entity);
  return {
    targetId,
    pilot,
    classWord,
    factionId,
    density,
    seed: hashSeed(`${String(targetId)}:${pilot}:${classWord}`),
  };
}

export function buildHailRibbonPath(seed, amplitude, density, width = 152, height = 24) {
  const amp = clamp01(amplitude);
  const dense = clamp01(density);
  const random = seededRandom((seed >>> 0) ^ 0xa81d3f25);
  const count = 14 + Math.round(dense * 12);
  const baseline = height / 2;
  const peak = Math.max(2, (height * 0.43) * (0.22 + amp * 0.78));
  const points = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const x = t * width;
    const wave = Math.sin(t * Math.PI * (1.25 + dense * 2.4));
    const jitter = (random() * 2 - 1) * peak * 0.26;
    const y = baseline - (wave * peak + jitter);
    points.push([x, y]);
  }
  let d = '';
  for (let i = 0; i < points.length; i++) {
    const [x, y] = points[i];
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return d;
}

export function hailFrequencyText(amplitude, density) {
  const amp = clamp01(amplitude);
  const dense = clamp01(density);
  const khz = (1.7 + dense * 2.7 + amp * 0.9).toFixed(2);
  return `FREQ ${khz}k`;
}

function playerHasFittedCargoScanner(state) {
  const player = state && state.player;
  if (!player || !Array.isArray(player.ownedShips)) return false;
  const index = Number.isInteger(player.activeShipIndex) ? player.activeShipIndex : 0;
  const owned = player.ownedShips[index];
  const shipDef = owned && SHIP_BY_ID.get(owned.defId);
  if (!shipDef || !Array.isArray(owned.fittings)) return false;
  const slots = buildSlotList(shipDef);
  return slots.some((slot, slotIndex) => {
    const moduleDef = MODULE_BY_ID.get(owned.fittings[slotIndex]);
    return !!(moduleDef && moduleDef.mods && moduleDef.mods.revealCargo === true && fits(slot, moduleDef));
  });
}

function traderRecord(state, targetId) {
  return (state && state.traffic && state.traffic.freighters || []).find((row) => row && row.id === targetId) || null;
}

function actionReason(actionId, availability, state, target) {
  if (!availability || !availability.enabled) return '';
  if (actionId === 'manifest' && availability.manifestAvailable !== true) {
    if (availability.kind !== 'trader') return 'NOT A TRADER';
    if (!playerHasFittedCargoScanner(state)) return 'NEEDS A CARGO SCANNER';
    return 'NO MANIFEST ON RECORD';
  }
  if (actionId === CONTACT_HAIL_ACTION_HEAVE_TO && availability.heaveToAvailable !== true) {
    const role = roleWord(target);
    if (role && !HEAVE_TO_ROLES.has(role)) return 'ROLE WILL NOT HEAVE';
    const record = traderRecord(state, availability.targetId);
    if (record && record.heaveTo === false) return 'NO HOLD WINDOW';
    return '';
  }
  if (actionId === CONTACT_HAIL_ACTION_HELP && availability.richSeamHelpAvailable !== true) {
    if (availability.kind !== 'worker') return 'WORK TRAFFIC ONLY';
    return 'NO OPEN RICH SEAM';
  }
  if (actionId === CONTACT_HAIL_ACTION_ESCORT && availability.priorityCourierEscortAvailable !== true) {
    return 'ESCORT WINDOW CLOSED';
  }
  if (actionId === CONTACT_HAIL_ACTION_ASSIST && availability.passengerLinerAssistAvailable !== true) {
    return 'BOARDING WINDOW CLOSED';
  }
  if ((actionId === CONTACT_HAIL_ACTION_RECOVER
      || actionId === CONTACT_HAIL_ACTION_STEAL
      || actionId === CONTACT_HAIL_ACTION_ABANDON)
      && !availability.disabledHauler) {
    return 'RECOVERY WINDOW CLOSED';
  }
  return '';
}

function wedgeIconSvg(actionId) {
  const icon = ACTION_ICON[actionId];
  if (!icon) return stationIcon('info', 24);
  return `<svg class="sf-commsfan__glyph" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${icon}</svg>`;
}

function nearestHailAvailability(state) {
  const playerEntity = entityById(state, state && state.playerId);
  if (!playerEntity || !playerEntity.pos || !state || !state.player) return null;
  let bestId = null;
  let bestAvailability = null;
  let bestDistance = Infinity;
  const candidates = Array.isArray(state.entityList) ? state.entityList : [];
  const now = Number(state.simTime) || 0;
  for (const candidate of candidates) {
    if (!candidate || candidate.alive === false || (candidate.type !== 'ship' && candidate.type !== 'drone')) continue;
    const dx = (Number(candidate.pos && candidate.pos.x) || 0) - (Number(playerEntity.pos.x) || 0);
    const dz = (Number(candidate.pos && candidate.pos.z) || 0) - (Number(playerEntity.pos.z) || 0);
    const distance = Math.hypot(dx, dz);
    if (!(distance <= CONTACT_HAIL_RANGE)) continue;
    const probeState = { ...state, player: { ...state.player, targetId: candidate.id } };
    const availability = contactHailAvailability(probeState);
    if (!availability.enabled) continue;
    const offer = createContactHailOffer(probeState, availability, '__probe__', now + CONTACT_HAIL_REQUEST_TTL_S);
    if (!offer || !Array.isArray(offer.actions) || offer.actions.length === 0) continue;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestId = candidate.id;
      bestAvailability = availability;
    }
  }
  if (bestId == null || !bestAvailability) return null;
  state.player.targetId = bestId;
  return contactHailAvailability(state);
}

function isFlightBlocked(state) {
  if (!state || state.mode !== 'flight') return true;
  if (state.ui && state.ui.docked) return true;
  if (isUiInteractionFenced(state)) return true;
  if (typeof document !== 'undefined' && document.body && document.body.classList) {
    if (document.body.classList.contains('ui-modal-open')) return true;
    if (document.body.classList.contains('ui-live-screen')) return true;
  }
  return false;
}

function targetRefsForDeck(entity) {
  const refs = [];
  const data = entity && entity.data || {};
  if (typeof data.factionId === 'string' && data.factionId) refs.push(`faction:${data.factionId}`);
  if (typeof data.sectorId === 'string' && data.sectorId) refs.push(`sector:${data.sectorId}`);
  if (data.itinerary && typeof data.itinerary.destinationStationId === 'string') {
    refs.push(`station:${data.itinerary.destinationStationId}`);
  }
  return [...new Set(refs)];
}

function focusSafely(el) {
  if (!el || typeof el.focus !== 'function') return false;
  try { el.focus({ preventScroll: true }); }
  catch (_) { try { el.focus(); } catch (__) { return false; } }
  return document.activeElement === el;
}

export function createCommsRadial(ctx) {
  const { state, bus } = ctx;
  const root = typeof document !== 'undefined' ? document.getElementById('ui-root') : null;
  if (!root) return { tick() {}, destroy() {} };

  const fan = document.createElement('div');
  fan.id = 'sf-commsfan';
  fan.className = 'sf-commsfan';
  fan.hidden = true;
  fan.innerHTML = `
    <div class="sf-commsfan__fan" role="region" aria-label="Quick comms fan">
      <button type="button" class="sf-commsfan__hub" data-k="hub" aria-label="Open tactical hail deck">
        <span class="sf-commsfan__crest" data-k="crest"></span>
        <span class="sf-commsfan__pilot" data-k="pilot">NO CONTACT</span>
        <span class="sf-commsfan__class" data-k="classword">HOLD ALT</span>
        <span class="sf-commsfan__freq" data-k="freq"></span>
        <svg class="sf-commsfan__ribbon" viewBox="0 0 152 24" aria-hidden="true" focusable="false">
          <path data-k="ribbon"></path>
        </svg>
      </button>
      <div class="sf-commsfan__wedgehost" data-k="wedgehost"></div>
    </div>
  `;
  root.appendChild(fan);

  const deck = document.createElement('aside');
  deck.className = 'sf-drawer sf-drawer--haildeck';
  deck.hidden = true;
  deck.setAttribute('role', 'region');
  deck.setAttribute('aria-label', 'Tactical hail deck');
  deck.innerHTML = `
    <button type="button" class="sf-drawer__x sf-haildeck__x" data-k="close-x" aria-label="Close tactical hail deck">${CLOSE_GLYPH}</button>
    <div class="sf-drawer__deck sf-haildeck__deck">
      <div class="sf-drawer__crest sf-haildeck__crest">
        <span class="sf-haildeck__crestmark" data-k="deck-crest"></span>
        <span class="sf-haildeck__header">
          <span class="sf-drawer__kicker" data-k="deck-kicker">TACTICAL HAIL</span>
          <h2 class="sf-drawer__title" data-k="deck-title">NO CONTACT</h2>
          <span class="sf-haildeck__sub" data-k="deck-sub">Channel idle</span>
        </span>
      </div>
      <svg class="sf-haildeck__ribbon" viewBox="0 0 152 24" aria-hidden="true" focusable="false">
        <path data-k="deck-ribbon"></path>
      </svg>
      <div class="sf-drawer__facts sf-haildeck__facts" data-k="deck-facts"></div>
      <div class="sf-deck">
        <div class="sf-deck__label">Offer Terms</div>
        <p class="sf-drawer__prose" data-k="deck-terms">No active offer.</p>
      </div>
      <div class="sf-deck">
        <div class="sf-deck__label">Parley State</div>
        <p class="sf-drawer__prose" data-k="deck-parley">No active parley.</p>
      </div>
      <div class="sf-deck">
        <div class="sf-deck__label">Recent Hail Receipts</div>
        <div class="sf-haildeck__receipts" data-k="deck-receipts"></div>
      </div>
      <div class="sf-deck">
        <div class="sf-deck__label">Linked Nouns</div>
        <div class="sf-haildeck__links" data-k="deck-links"></div>
      </div>
      <div class="sf-drawer__apron">
        <button type="button" class="sf-drawer__verb sf-drawer__verb--quiet" data-k="close-btn">Close</button>
      </div>
    </div>
  `;
  root.appendChild(deck);

  const hubBtn = fan.querySelector('[data-k="hub"]');
  const crestEl = fan.querySelector('[data-k="crest"]');
  const pilotEl = fan.querySelector('[data-k="pilot"]');
  const classEl = fan.querySelector('[data-k="classword"]');
  const wedgeHost = fan.querySelector('[data-k="wedgehost"]');
  const ribbonPath = fan.querySelector('[data-k="ribbon"]');
  const freqHost = fan.querySelector('[data-k="freq"]');
  const freqMorph = createMorphLabel(freqHost, { text: 'FREQ IDLE' });

  const deckCrestEl = deck.querySelector('[data-k="deck-crest"]');
  const deckTitleEl = deck.querySelector('[data-k="deck-title"]');
  const deckKickerEl = deck.querySelector('[data-k="deck-kicker"]');
  const deckSubEl = deck.querySelector('[data-k="deck-sub"]');
  const deckFactsEl = deck.querySelector('[data-k="deck-facts"]');
  const deckTermsEl = deck.querySelector('[data-k="deck-terms"]');
  const deckParleyEl = deck.querySelector('[data-k="deck-parley"]');
  const deckReceiptsEl = deck.querySelector('[data-k="deck-receipts"]');
  const deckLinksEl = deck.querySelector('[data-k="deck-links"]');
  const deckRibbonPath = deck.querySelector('[data-k="deck-ribbon"]');
  const closeXBtn = deck.querySelector('[data-k="close-x"]');
  const closeDeckBtn = deck.querySelector('[data-k="close-btn"]');

  let destroyed = false;
  let open = false;
  let deckOpen = false;
  let altHeld = false;
  let escLatchedOnHold = false;
  let currentTargetId = null;
  let currentAvailability = null;
  let activeOffer = null;
  let activePayload = null;
  let previousFreq = '';
  let nextUiUpdateAt = 0;
  let wedgeButtons = [];
  let lastWedgeSig = '';
  const responseLog = new Map();
  const gamepadNavPrev = { up: false, down: false, left: false, right: false };
  const unsubs = [];

  function recordReceipt(payload) {
    const targetId = payload && payload.targetId;
    const lines = Array.isArray(payload && payload.lines) ? payload.lines : [];
    if (targetId == null || !lines.length) return;
    const list = responseLog.get(targetId) || [];
    list.unshift({
      at: Number(state.simTime) || 0,
      text: lines.join(' · '),
      choice: String(payload.choice || '').toUpperCase(),
    });
    while (list.length > 6) list.pop();
    responseLog.set(targetId, list);
  }

  function updateHubVisual(payload = activePayload) {
    const visual = resolveHailVisual(state, payload, currentAvailability);
    if (!visual) return;
    crestEl.innerHTML = visual.factionId ? factionIcon(visual.factionId, 22) : stationIcon('target', 22);
    pilotEl.textContent = visual.pilot;
    classEl.textContent = visual.classWord;
    const now = Number(state.simTime) || 0;
    const ttl = payload && payload.choice ? CONTACT_HAIL_RECEIPT_TTL_S : CONTACT_HAIL_REQUEST_TTL_S;
    const amplitude = payload ? clamp01((Number(payload.expiresAt) - now) / Math.max(1, ttl)) : 0.22;
    const d = buildHailRibbonPath(visual.seed, amplitude, visual.density);
    ribbonPath.setAttribute('d', d);
    const freq = hailFrequencyText(amplitude, visual.density);
    const dir = previousFreq && freq > previousFreq ? 'up' : previousFreq && freq < previousFreq ? 'down' : 'flat';
    freqMorph.set(freq, { dir });
    previousFreq = freq;
    if (deckOpen) {
      deckRibbonPath.setAttribute('d', d);
    }
  }

  function renderFanWedges() {
    const offer = activeOffer;
    if (!offer || !Array.isArray(offer.actions)) return;
    const target = entityById(state, offer.targetId);
    const actions = offer.actions
      .map((row) => ({ id: String(row && row.id || '').toLowerCase(), label: String(row && row.label || '').toUpperCase() }))
      .filter((row) => KNOWN_ACTION_IDS.has(row.id));
    if (!actions.length) return;
    const reasons = actions.map((row) => actionReason(row.id, currentAvailability, state, target));
    // The fan used to rebuild its buttons on every 0.12 s UI tick, which deleted and recreated
    // the card under the cursor ~8x per second — the reported hover flicker. Rebuild only when
    // the action set, labels, or availability (dim state) actually change.
    const sig = `${offer.targetId}|${actions.map((row, i) => `${row.id}:${row.label}:${reasons[i] ? 'd' : 'u'}`).join(',')}`;
    if (sig === lastWedgeSig) return;
    lastWedgeSig = sig;
    wedgeHost.replaceChildren();
    wedgeButtons = [];
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      const reason = reasons[i];
      const why = reason || '';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'sf-commsfan__wedge';
      button.dataset.choice = action.id;
      button.dataset.why = why;
      button.setAttribute('aria-label', `${action.label}${why ? `. ${why}` : ''}`);
      button.innerHTML = `
        ${wedgeIconSvg(action.id)}
        <span class="sf-commsfan__verb">${action.label}</span>
        ${why ? `<span class="sf-commsfan__why">${why}</span>` : ''}
      `;
      if (reason) {
        button.classList.add('is-dim');
        button.setAttribute('aria-disabled', 'true');
      }
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (button.classList.contains('is-dim')) return;
        choose(action.id, 'pointer');
      });
      wedgeHost.appendChild(button);
      wedgeButtons.push(button);
    }
    focusSafely(wedgeButtons.find((el) => !el.classList.contains('is-dim')) || wedgeButtons[0]);
  }

  function choose(choice, source = 'pointer') {
    if (!activeOffer || !choice) return false;
    const action = String(choice).toLowerCase();
    if (!activeOffer.actions || !activeOffer.actions.some((row) => String(row && row.id || '').toLowerCase() === action)) return false;
    const blocked = wedgeButtons.find((el) => el.dataset.choice === action && el.classList.contains('is-dim'));
    if (blocked) return false;
    bus.emit('contactHail:choice', {
      requestId: activeOffer.requestId,
      targetId: activeOffer.targetId,
      choice: action,
      source,
    });
    bus.emit('audio:cue', { id: 'ui_confirm' });
    closeFan();
    return true;
  }

  function refreshAvailabilityForTarget() {
    if (!currentTargetId) return null;
    const availability = contactHailAvailability(state);
    if (!availability.enabled || availability.targetId !== currentTargetId) {
      currentAvailability = availability;
      return availability;
    }
    currentAvailability = availability;
    return availability;
  }

  function buildTargetAvailability() {
    let availability = contactHailAvailability(state);
    if (!availability.enabled && (!state.player || state.player.targetId == null)) {
      availability = nearestHailAvailability(state) || availability;
    }
    if (!availability || !availability.enabled) return null;
    const probe = createContactHailOffer(
      state,
      availability,
      '__quickfan_probe__',
      (Number(state.simTime) || 0) + CONTACT_HAIL_REQUEST_TTL_S,
    );
    if (!probe || !Array.isArray(probe.actions) || probe.actions.length === 0) return null;
    return availability;
  }

  function openFan() {
    if (open || isFlightBlocked(state)) return false;
    const availability = buildTargetAvailability();
    if (!availability) return false;
    open = true;
    currentTargetId = availability.targetId;
    currentAvailability = availability;
    activeOffer = null;
    activePayload = null;
    fan.hidden = false;
    fan.classList.add('is-open');
    if (!state.ui) state.ui = {};
    state.ui.commsRadialOpen = true;
    bus.emit('audio:cue', { id: 'ui_open' });
    bus.emit('contactHail:request', { targetId: currentTargetId, source: 'radial' });
    updateHubVisual({
      targetId: currentTargetId,
      kind: availability.kind,
      lines: [availability.label || 'CONTACT'],
      expiresAt: (Number(state.simTime) || 0) + CONTACT_HAIL_REQUEST_TTL_S,
    });
    renderFanWedges();
    nextUiUpdateAt = Number(state.simTime) || 0;
    return true;
  }

  function closeFan() {
    if (!open) return;
    open = false;
    activeOffer = null;
    lastWedgeSig = '';
    fan.classList.remove('is-open');
    fan.hidden = true;
    wedgeHost.replaceChildren();
    wedgeButtons = [];
    if (state.ui) state.ui.commsRadialOpen = false;
  }

  function refText(ref) {
    const resolved = resolveEntity(state, ref);
    return resolved ? `${resolved.label} · ${resolved.kicker}` : '';
  }

  function setDeckFacts(rows) {
    deckFactsEl.replaceChildren();
    for (const row of rows) {
      const tile = document.createElement('div');
      tile.className = `sf-tile sf-tile--${row.tone || 'calm'}${row.num ? ' sf-tile--data' : ''}`;
      const k = document.createElement('span');
      k.className = 'sf-tile__k';
      k.textContent = row.k;
      const v = document.createElement('span');
      v.className = 'sf-tile__v';
      v.textContent = row.v;
      tile.append(k, v);
      deckFactsEl.appendChild(tile);
    }
  }

  function renderDeck(targetId) {
    const payload = activePayload && activePayload.targetId === targetId
      ? activePayload
      : activeOffer && activeOffer.targetId === targetId
        ? activeOffer
        : null;
    const availability = contactHailAvailability({ ...state, player: { ...state.player, targetId } });
    const visual = resolveHailVisual(state, payload, availability);
    if (!visual) return false;
    const entity = entityById(state, targetId);
    const factionId = visual.factionId;
    const repRecord = factionId && state.factions ? state.factions[factionId] : null;
    const repValue = Number.isFinite(repRecord && repRecord.rep)
      ? repRecord.rep
      : Number(NEW_GAME && NEW_GAME.factionRep && factionId ? NEW_GAME.factionRep[factionId] : 0) || 0;
    const tier = tierFor(repValue);
    const guidance = factionStandingGuidance(
      repValue,
      FACTION_META_BY_ID.get(factionId) || {},
      repRecord && repRecord.lastDelta || null,
      { hideLastDelta: false },
    );
    deckCrestEl.innerHTML = factionId ? factionIcon(factionId, 22) : stationIcon('target', 22);
    deckTitleEl.textContent = visual.pilot;
    deckKickerEl.textContent = `TACTICAL HAIL · ${visual.classWord}`;
    deckSubEl.textContent = payload && payload.lines && payload.lines[0] ? payload.lines[0] : 'Channel active';
    const rows = [
      { k: 'Standing', v: `${tier.name} (${Math.round(repValue)})`, tone: repValue < -149 ? 'foe' : repValue > 149 ? 'you' : 'calm', num: true },
      { k: 'Next Tier', v: guidance.next, tone: 'goal' },
      { k: 'Risk', v: guidance.risk, tone: repValue < 0 ? 'foe' : 'calm' },
      { k: 'Range', v: availability && Number.isFinite(availability.distance) ? `${Math.round(availability.distance)} m` : '—', tone: 'calm', num: true },
    ];
    setDeckFacts(rows);
    if (payload && Array.isArray(payload.actions) && payload.actions.length) {
      const labels = payload.actions.map((row) => String(row && row.label || '').trim()).filter(Boolean);
      const lines = Array.isArray(payload.lines) ? payload.lines.filter(Boolean) : [];
      deckTermsEl.textContent = `${lines.join(' · ')} · ACTIONS: ${labels.join(' / ')}`;
    } else {
      deckTermsEl.textContent = 'No active offer.';
    }
    if (availability && availability.parley) {
      const parley = availability.parley;
      deckParleyEl.textContent = `PARLEY ${String(parley.phase || 'DEMAND').toUpperCase()} · DEADLINE ${Math.max(0, Math.round((Number(parley.deadlineAt) || 0) - (Number(state.simTime) || 0)))}s`;
    } else {
      deckParleyEl.textContent = 'No active parley.';
    }
    deckReceiptsEl.replaceChildren();
    const receipts = responseLog.get(targetId) || [];
    if (!receipts.length) {
      const empty = document.createElement('p');
      empty.className = 'sf-drawer__prose';
      empty.textContent = 'No recent receipts.';
      deckReceiptsEl.appendChild(empty);
    } else {
      for (const receipt of receipts) {
        const row = document.createElement('div');
        row.className = 'sf-haildeck__receipt';
        row.textContent = `${receipt.choice ? `${receipt.choice} · ` : ''}${receipt.text}`;
        deckReceiptsEl.appendChild(row);
      }
    }
    deckLinksEl.replaceChildren();
    const refs = targetRefsForDeck(entity);
    if (!refs.length) {
      const none = document.createElement('p');
      none.className = 'sf-drawer__prose';
      none.textContent = 'No linked nouns.';
      deckLinksEl.appendChild(none);
    } else {
      for (const ref of refs) {
        const label = refText(ref);
        if (!label) continue;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'sf-haildeck__link sf-entity-link';
        button.setAttribute('data-entity', ref);
        button.textContent = label;
        button.addEventListener('click', () => {
          if (!ctx.entityLinks || typeof ctx.entityLinks.open !== 'function') return;
          ctx.entityLinks.open(ref, button);
        });
        deckLinksEl.appendChild(button);
      }
    }
    const now = Number(state.simTime) || 0;
    const ttl = payload && payload.choice ? CONTACT_HAIL_RECEIPT_TTL_S : CONTACT_HAIL_REQUEST_TTL_S;
    const amplitude = payload ? clamp01((Number(payload.expiresAt) - now) / Math.max(1, ttl)) : 0.2;
    deckRibbonPath.setAttribute('d', buildHailRibbonPath(visual.seed, amplitude, visual.density));
    return true;
  }

  function openDeck(targetId = null) {
    const resolvedId = targetId != null
      ? targetId
      : currentTargetId != null
        ? currentTargetId
        : state && state.player
          ? state.player.targetId
          : null;
    if (resolvedId == null || isFlightBlocked(state)) return false;
    currentTargetId = resolvedId;
    currentAvailability = contactHailAvailability({ ...state, player: { ...state.player, targetId: resolvedId } });
    if (!renderDeck(resolvedId)) return false;
    deckOpen = true;
    deck.hidden = false;
    deck.classList.add('is-open');
    nextUiUpdateAt = Number(state.simTime) || 0;
    focusSafely(closeDeckBtn);
    return true;
  }

  function closeDeck() {
    if (!deckOpen) return;
    deckOpen = false;
    deck.classList.remove('is-open');
    deck.hidden = true;
    focusSafely(hubBtn);
  }

  function onKeyDown(event) {
    if (destroyed) return;
    if (event.key === 'Alt') {
      if (altHeld) return;
      altHeld = true;
      if (escLatchedOnHold) return;
      openFan();
      return;
    }
    if (event.key === 'Escape') {
      if (deckOpen) {
        event.preventDefault();
        event.stopPropagation();
        closeDeck();
        return;
      }
      if (open) {
        event.preventDefault();
        event.stopPropagation();
        escLatchedOnHold = altHeld;
        bus.emit('audio:cue', { id: 'ui_back' });
        closeFan();
      }
    }
  }

  function onKeyUp(event) {
    if (event.key !== 'Alt') return;
    altHeld = false;
    escLatchedOnHold = false;
    closeFan();
  }

  function handleGamepadNav() {
    if (!open || !ctx.gamepad || !ctx.gamepad.isConnected || !ctx.gamepad.isConnected()) return;
    const gp = ctx.gamepad;
    const actions = gp.actions || {};
    const axis = gp.axes || {};
    const held = {
      left: !!(actions.tabPrev && actions.tabPrev.held) || Number(axis.leftX) < -0.55,
      right: !!(actions.tabNext && actions.tabNext.held) || Number(axis.leftX) > 0.55,
      up: Number(axis.leftY) < -0.55,
      down: Number(axis.leftY) > 0.55,
    };
    const nodes = [hubBtn, ...wedgeButtons].filter((el) => el && el.isConnected && !el.classList.contains('is-dim'));
    if (!nodes.length) return;
    if (!nodes.includes(document.activeElement)) focusSafely(nodes[0]);
    for (const dir of ['left', 'right', 'up', 'down']) {
      if (held[dir] && !gamepadNavPrev[dir]) {
        const next = spatialFocusTarget(nodes, document.activeElement, dir) || nodes[0];
        focusSafely(next);
        bus.emit('audio:cue', { id: 'ui_hover' });
      }
      gamepadNavPrev[dir] = held[dir];
    }
    if (actions.accept && actions.accept.pressed) {
      const active = document.activeElement;
      if (active === hubBtn) openDeck(currentTargetId);
      else if (active && active.dataset && active.dataset.choice) choose(active.dataset.choice, 'gamepad');
    }
    if (actions.cancel && actions.cancel.pressed) {
      if (deckOpen) closeDeck();
      else closeFan();
    }
  }

  function attachBus(event, handler) {
    const off = bus.on(event, handler);
    if (typeof off === 'function') unsubs.push(off);
    else if (bus && typeof bus.off === 'function') unsubs.push(() => bus.off(event, handler));
  }

  hubBtn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    openDeck(currentTargetId);
  });
  closeXBtn.addEventListener('click', (event) => {
    event.preventDefault();
    closeDeck();
  });
  closeDeckBtn.addEventListener('click', (event) => {
    event.preventDefault();
    closeDeck();
  });
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('keyup', onKeyUp, true);

  attachBus('contactHail:offer', (payload) => {
    if (!payload || payload.targetId == null) return;
    activePayload = payload;
    if (!open || payload.targetId !== currentTargetId) return;
    activeOffer = payload;
    refreshAvailabilityForTarget();
    updateHubVisual(payload);
    renderFanWedges();
  });
  attachBus('contactHail:response', (payload) => {
    if (!payload || payload.targetId == null) return;
    activePayload = payload;
    recordReceipt(payload);
    if (open && payload.targetId === currentTargetId) updateHubVisual(payload);
    if (deckOpen && payload.targetId === currentTargetId) renderDeck(currentTargetId);
  });
  attachBus('contactHail:clear', (payload) => {
    if (open && payload && payload.targetId === currentTargetId) closeFan();
  });
  attachBus('contactHail:handoff', (payload) => {
    if (open && payload && payload.targetId === currentTargetId) closeFan();
  });
  attachBus('contactHail:deck:open', (payload) => {
    const targetId = payload && payload.targetId != null ? payload.targetId : null;
    openDeck(targetId);
  });
  for (const event of ['mode:changed', 'dock:docked', 'game:new', 'game:load']) {
    attachBus(event, () => {
      closeFan();
      closeDeck();
    });
  }

  function tick() {
    if (destroyed) return;
    const now = Number(state.simTime) || 0;
    if (open) {
      if (isFlightBlocked(state) || !altHeld) closeFan();
      else {
        const availability = refreshAvailabilityForTarget();
        if (!availability || !availability.enabled || availability.targetId !== currentTargetId) {
          closeFan();
        } else if (now >= nextUiUpdateAt) {
          updateHubVisual(activePayload);
          renderFanWedges();
          nextUiUpdateAt = now + 0.12;
        }
      }
      handleGamepadNav();
    }
    if (deckOpen) {
      if (isFlightBlocked(state)) closeDeck();
      else if (now >= nextUiUpdateAt && currentTargetId != null) {
        renderDeck(currentTargetId);
        nextUiUpdateAt = now + 0.12;
      }
    }
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('keyup', onKeyUp, true);
    for (const off of unsubs.splice(0)) {
      try { off(); } catch (_) {}
    }
    try { freqMorph.dispose(); } catch (_) {}
    fan.remove();
    deck.remove();
  }

  return { tick, destroy, openDeck };
}

export default createCommsRadial;
