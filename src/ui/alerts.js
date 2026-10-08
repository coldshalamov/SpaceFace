// Contextual alerts (ARCHITECTURE §5, spec "Contextual alerts") — the top-center #alerts slot.
//
// Two honest classes live here (spec2/06 three-anchor / SPEC3-F10 §40 one-voice):
//   1. PERSISTENT STATUS PILLS — condition- or affordance-bound readouts that must stay visible
//      while their condition holds: the dock/gate prompts (ttl:Infinity), the missile-lock warning,
//      and the HUD-driven low-shield/low-hull pills. Deduped by `key`, severity-sorted, ttl-expired.
//      These are NOT "voices"; they are status lights and are exempt from the one-voice queue.
//   2. THE ONE-VOICE FLOOR — a single transient attention line, owned by voiceArbiter.js. Every
//      transient one-shot alert we raise (SHIELDS DOWN, TAKING FIRE, CARGO FULL, OUT OF FUEL) and
//      every finite-ttl `alert` event from other systems is ROUTED through the arbiter (voice.say,
//      channel 'alert') instead of stacking its own pill, so nothing ever talks over anything else.
//      This module also PRESENTS that floor (voice:surface / voice:clear) as the top pill in #alerts
//      — the single top-center transient surface. Toasts.js suppresses the arbiter's _fromVoice
//      mirror AND any parallel short-status toast that matches VOICE_OWNED_ALERT_TEXTS, so the
//      voice is not duplicated bottom-right or via a second live region.
//
import { BINDINGS, promptLabel } from './bindings.js';
import { stationName } from './sectorLawPresenter.js';
import { hazardLanguageFor } from '../data/hazardLanguage.js';
import {
  WORLD_FEEL_SEAM_IDS,
  admitWorldFeelSeam,
  copySweptHullFeel,
  worldFeelTick,
  worldFeelVoice,
} from '../audio/worldFeelSeams.js';

// The dock prompt is special: `dock:range {stationId,inRange}` shows/clears a persistent
// binding-sourced dock alert (no ttl). The dock key handling lives in input.js.

const SEV_RANK = { danger: 3, dock: 2.5, warn: 2, info: 1 };

// ── Mechanical one-voice ownership (ONEVOICE-ALERT-DEDUPE) ─────────────────────────────────────
// Short status lines that THIS module always routes through the arbiter (announce → voice:say).
// Parallel emitters (e.g. floatingText cargo:full toast, legacy alert→toast bridges) must not also
// push them into #toasts / #toast-live — that would double-speak tutorial/danger semantics.
// Long tutorial copy ("Cargo hold full! Dock at…") is NOT listed: onboarding owns that via the
// tutorial channel; transaction ACKs and numeric/loot floaters are never in this set.
export const VOICE_OWNED_ALERT_TEXTS = Object.freeze([
  'CARGO FULL',
  'CARGO HOLD FULL',
  'SHIELDS DOWN',
  'SHIELD DOWN',
  'TAKING FIRE',
  'OUT OF FUEL',
]);

const BLOCKED_OUTPUT_STATES = new Set(['starved', 'no-power', 'backlogged']);

// STORY-02 — short grant names for `research:pointsChanged`. The writer carries `scope`
// (first-grant kind) or a `source` slug; an unknown slug still reads as fieldwork.
function researchGrantKey(p) {
  if (typeof p.scope === 'string' && p.scope) return `first-${p.scope}`;
  const s = typeof p.source === 'string' && p.source ? p.source : 'unknown';
  return s.replace(/[^a-z0-9_-]/gi, '_');
}

function researchGrantLabel(p) {
  if (typeof p.scope === 'string' && p.scope) return `first ${p.scope}`;
  const s = typeof p.source === 'string' ? p.source : '';
  if (s === 'scan_rp_bonus') return 'scan bonus';
  if (s === 'clause_honor') return 'honored clause';
  if (s.startsWith('mission:')) {
    const t = s.slice(8);
    if (t === 'recon_scan') return 'recon contract';
    if (t === 'salvage_retrieval') return 'salvage contract';
    return 'contract';
  }
  if (s.startsWith('story:')) return 'story fieldwork';
  if (s.startsWith('first:')) return 'first fieldwork';
  return 'fieldwork';
}

/** Flight-HUD status line for a mill that cannot produce. Not a one-voice bark: it stays up
 *  while the machine is blocked so reduce-motion still has a word when shake/zoom are off. */
export function blockedOutputAlertText(payload) {
  if (!payload) return null;
  const s = String(payload.state || payload.status || '');
  return BLOCKED_OUTPUT_STATES.has(s) ? 'OUTPUT BLOCKED' : null;
}

const HAZARD_ALERT_TEXT = Object.freeze({
  radiation: 'RADIATION',
  nebula: 'NEBULA',
});

/** The authored language says what the field burns — the pill carried only the type name until
 *  now, so "radiation cooks cargo too" never reached the player. Suffix the damage tag. */
function hazardDamageSuffix(type) {
  const entry = hazardLanguageFor(type);
  const damages = entry && entry.damages;
  return Array.isArray(damages) && damages.length ? ' · ' + damages.join('+').toUpperCase() : '';
}

/** WORLD-25: one persistent HUD alert on hazard entry, cleared on exit.
 *  Radiation and nebula only. Boss intensity changes are not an entry. */
export function hazardAlertCommand(payload) {
  if (!payload || payload.reason === 'boss_defeated') return null;
  const type = payload.zoneType || payload.type;
  if (type !== 'radiation' && type !== 'nebula') return null;
  const phase = payload.phase === 'enter' || payload.phase === 'exit'
    ? payload.phase
    : (payload.entered === true ? 'enter' : payload.entered === false ? 'exit' : null);
  if (!phase) return null;
  const key = `hazard:${type}`;
  if (phase === 'exit') return { action: 'clear', key };
  return {
    action: 'raise',
    key,
    sev: type === 'radiation' ? 'danger' : 'warn',
    text: HAZARD_ALERT_TEXT[type] + hazardDamageSuffix(type),
    ttl: Infinity,
  };
}

/** Per-machine blocked set so a running mill cannot hide a starved neighbour. */
export function applyBlockedOutputMachine(blocked, payload) {
  const next = blocked instanceof Set ? new Set(blocked) : new Set();
  if (!payload || payload.machineId == null) return next;
  const key = `${payload.siteId != null ? payload.siteId : '_'}::${payload.machineId}`;
  if (blockedOutputAlertText(payload)) next.add(key);
  else next.delete(key);
  return next;
}

/** Normalize a status line for ownership compare (case/punct-insensitive exact short match). */
export function normalizeAlertToastText(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[!.,…:]+$/g, '')
    .trim();
}

/**
 * True when `text` is a short alert semantic owned by the one-voice floor.
 * Used by toasts.js to drop parallel announcements; safe for long tutorial/ACK strings (false).
 */
export function isVoiceOwnedAlertToast(text) {
  if (text == null || text === '') return false;
  const n = normalizeAlertToastText(text);
  if (!n) return false;
  for (let i = 0; i < VOICE_OWNED_ALERT_TEXTS.length; i++) {
    if (normalizeAlertToastText(VOICE_OWNED_ALERT_TEXTS[i]) === n) return true;
  }
  return false;
}

export function createAlerts(ctx) {
  const { bus } = ctx;
  const root = document.getElementById('alerts');
  const map = new Map(); // key -> { key, sev, text, ttl(ms)|Infinity, born, expiresAt, el, wasShown }
  const expiredKeys = [];
  let nextExpiryAt = Infinity;
  let blockedMills = new Set();

  function ensureEl(rec) {
    if (rec.el) return rec.el;
    const el = document.createElement('div');
    // dp-annunc: the annunciator is a machined strip with a lamp lens (deckplate components).
    // Persistent condition chips (ttl Infinity) are lit controls — --status, never a blinker.
    el.className = `sf-alert sf-alert--${rec.sev} dp-annunc`;
    // Persistent condition chips are discoverable status text, never a second automatic voice.
    // Transient/danger speech belongs to the single arbiter floor below.
    el.setAttribute('role', 'group');
    el.setAttribute('aria-live', 'off');
    el.setAttribute('aria-atomic', 'true');
    const lens = document.createElement('span');
    lens.className = 'dp-annunc__lens dp-lamp';
    lens.setAttribute('aria-hidden', 'true');
    const txt = document.createElement('span');
    txt.className = 'sf-alert__text';
    el.append(lens, txt);
    rec._txt = txt;
    rec.el = el;
    return el;
  }

  function raise({ key, sev = 'info', text = '', ttl = 2 } = {}) {
    if (!key) key = 'a' + (raise._n = (raise._n || 0) + 1);
    let rec = map.get(key);
    if (!rec) { rec = { key }; map.set(key, rec); }
    rec.sev = sev; rec.text = text;
    rec.ttl = ttl == null || ttl === Infinity ? Infinity : ttl * 1000;
    rec.born = performance.now();
    rec.expiresAt = rec.ttl === Infinity ? Infinity : rec.born + rec.ttl;
    if (rec.el) rec.el.className = `sf-alert sf-alert--${sev} dp-annunc`;
    recomputeNextExpiry();
    render();
  }

  function clear(key) {
    const rec = map.get(key);
    if (!rec) return;
    if (rec.el && rec.el.parentNode) rec.el.parentNode.removeChild(rec.el);
    map.delete(key);
    recomputeNextExpiry();
  }

  // Anti-flap law for the stack: a record's element is mounted for the record's LIFETIME and
  // hidden with [hidden] (ui.css: [hidden]{display:none !important}) while it sits outside the
  // top 3. Removing/re-appending pills on every re-sort is what made the top-center stack
  // flicker: each remove shifted the pills below, every re-add replayed the 160ms entrance,
  // and a pill that dropped out re-entered at the append point instead of its sorted slot.
  // Only clear()/tick() (end of life) and a genuine order change may move a node now.
  function suppressEntrance(el) {
    // A hidden→shown toggle restarts CSS animations, and the entrance fade lives on the base
    // .sf-alert class (not a class we can re-add selectively), so pin animation-name inline to
    // everything except sf-alert-in: the danger throb survives, and reduced-motion / skin
    // animation:none stays truthful because the list is read from the live computed style.
    // Suppression is sticky per element — only a record's FIRST show ever fades in.
    const names = String(getComputedStyle(el).animationName || '')
      .split(',').map((s) => s.trim())
      .filter((n) => n && n !== 'none' && n !== 'sf-alert-in');
    el.style.animationName = names.length ? names.join(', ') : 'none';
  }

  function render() {
    if (!root) return;
    // sort: severity desc, then most-recent first; show top 3
    const arr = [...map.values()].sort((a, b) => (SEV_RANK[b.sev] - SEV_RANK[a.sev]) || (b.born - a.born));
    const shown = arr.slice(0, 3);
    const shownSet = new Set(shown);
    for (const rec of arr) {
      const el = ensureEl(rec);
      if (rec._txt.textContent !== rec.text) rec._txt.textContent = rec.text;
      if (shownSet.has(rec)) {
        // A pill that has been on screen before must not replay its entrance on re-show.
        if (rec.wasShown && el.hidden) suppressEntrance(el);
        if (el.hidden) el.hidden = false;
        rec.wasShown = true;
      } else if (!el.hidden) {
        el.hidden = true;
      }
      if (el.parentNode !== root) root.appendChild(el);
    }
    // Sorted order, enforced only when it actually differs: appendChild moves restart
    // animations, so touch nothing while the shown pills already sit in sort order. Hidden
    // pills take no flex slot and the floor carries order:-1, so only the shown pills'
    // relative DOM order matters.
    const shownEls = new Set(shown.map((rec) => rec.el));
    let wrongAt = -1;
    let seen = 0;
    for (const child of root.children) {
      if (!shownEls.has(child)) continue;
      if (seen >= shown.length || shown[seen].el !== child) { wrongAt = seen; break; }
      seen++;
    }
    if (wrongAt !== -1) {
      for (let i = wrongAt; i < shown.length; i++) root.appendChild(shown[i].el);
    }
  }

  function syncBlockedOutputPill() {
    if (blockedMills.size > 0) {
      raise({ key: 'mill-blocked', sev: 'warn', text: 'OUTPUT BLOCKED', ttl: Infinity });
    } else {
      clear('mill-blocked');
    }
  }

  function refreshBlockedMillsFromSites() {
    const state = ctx && ctx.state;
    const sites = state && state.sites;
    const sys = ctx && ctx.registry && typeof ctx.registry.get === 'function'
      ? ctx.registry.get('asteroidSites')
      : null;
    const next = new Set();
    let scanned = false;
    if (sites && sys && typeof sys.projection === 'function') {
      scanned = true;
      const order = Array.isArray(sites.order) ? sites.order : [];
      for (const siteId of order) {
        const proj = sys.projection(siteId);
        const machines = proj && Array.isArray(proj.machines) ? proj.machines : [];
        for (const machine of machines) {
          const status = machine && machine.status;
          if (blockedOutputAlertText(status)) {
            next.add(`${siteId}::${machine.id}`);
          }
        }
      }
    }
    if (scanned) blockedMills = next;
    syncBlockedOutputPill();
  }

  // Expiry sweep — called from hud frame(), but wakes only when a finite alert can expire.
  function tick() {
    if (!map.size) return;
    const now = performance.now();
    if (now <= nextExpiryAt) return;
    let dirty = false;
    expiredKeys.length = 0;
    for (const rec of map.values()) {
      if (rec.expiresAt !== Infinity && now > rec.expiresAt) expiredKeys.push(rec.key);
    }
    for (let i = 0; i < expiredKeys.length; i++) {
      const rec = map.get(expiredKeys[i]);
      if (!rec) continue;
      if (rec.el && rec.el.parentNode) rec.el.parentNode.removeChild(rec.el);
      map.delete(rec.key);
      dirty = true;
    }
    expiredKeys.length = 0;
    if (dirty) recomputeNextExpiry();
    if (dirty) render();
  }

  function recomputeNextExpiry() {
    nextExpiryAt = Infinity;
    for (const rec of map.values()) {
      if (rec.expiresAt < nextExpiryAt) nextExpiryAt = rec.expiresAt;
    }
  }

  // Route a transient one-shot alert through the voiceArbiter so it takes the single top-center
  // one-voice floor rather than stacking a parallel pill. Danger is life-critical → explicit
  // priority 110 (above 'story'); warn = the 'alert' channel default (80); info = ambient (10).
  // A stable id ('alert:<key>') coalesces repeats so a per-frame condition (TAKING FIRE fires on
  // every hit) refreshes the floor in place instead of spamming the queue.
  function announce({ key, sev = 'info', text = '', ttl = 2 } = {}) {
    if (!text) return;
    const priority = sev === 'danger' ? 110 : sev === 'warn' ? 80 : 10;
    bus.emit('voice:say', {
      channel: 'alert',
      priority,
      kind: sev,
      text,
      ttl,
      id: key ? 'alert:' + key : undefined,
    });
  }

  // ── One-voice floor presenter (voice:surface / voice:clear) ───────────────────────────────────
  // The arbiter serializes every transient attention line to one floor and hands it here. We render
  // it as a pill flagged `--floor` (CSS order:-1 keeps it atop the status pills). Exactly one floor
  // exists at a time — the arbiter clears the old id before surfacing the next.
  // Live-region policy: write textContent only when the spoken line changes so cargo-full /
  // shield-down (and any other floor line) never fire a second AT utterance for the same text.
  let floorEl = null;
  let floorId = null;
  let floorSpokenText = null;
  let politeLive = null;
  let dangerLive = null;

  function ensureFloorAnnouncers() {
    if (politeLive && dangerLive) return;
    politeLive = document.createElement('div');
    politeLive.className = 'sr-only';
    politeLive.setAttribute('role', 'status');
    politeLive.setAttribute('aria-live', 'polite');
    politeLive.setAttribute('aria-atomic', 'true');
    dangerLive = document.createElement('div');
    dangerLive.className = 'sr-only';
    dangerLive.setAttribute('role', 'alert');
    dangerLive.setAttribute('aria-live', 'assertive');
    dangerLive.setAttribute('aria-atomic', 'true');
    root.appendChild(politeLive);
    root.appendChild(dangerLive);
  }

  function floorSeverity(p) {
    if (p.kind === 'danger' || (p.channel === 'alert' && (p.priority | 0) >= 100)) return 'danger';
    if (p.kind === 'warn' || p.channel === 'alert') return 'warn';
    return 'info';
  }

  function surfaceFloor(p) {
    if (!root || !p || !p.text) return;
    floorId = p.id != null ? String(p.id) : '_floor';
    const sev = floorSeverity(p);
    if (!floorEl) {
      floorEl = document.createElement('div');
      floorEl.setAttribute('role', 'group');
      floorEl.setAttribute('aria-live', 'off');
      floorEl.setAttribute('aria-atomic', 'true');
      const lens = document.createElement('span');
      lens.className = 'dp-annunc__lens dp-lamp';
      lens.setAttribute('aria-hidden', 'true');
      const txt = document.createElement('span');
      txt.className = 'sf-alert__text';
      floorEl.append(lens, txt);
      floorEl._txt = txt;
    }
    floorEl.className = `sf-alert sf-alert--floor sf-alert--${sev} dp-annunc dp-annunc--${sev}`;
    // Danger is announced assertively (mirrors the prior danger-pill a11y behavior); every other
    // voice is polite so it never interrupts a screen reader mid-sentence.
    // Identical line already on the floor (same-id coalesce / re-surface) — keep DOM, no re-speak.
    if (floorEl.parentNode === root && floorSpokenText === p.text) return;
    floorEl._txt.textContent = p.text;
    floorSpokenText = p.text;
    if (floorEl.parentNode !== root) root.appendChild(floorEl);
    // The floor slot is RESERVED: the element stays mounted for the session and only turns
    // visible between voices. Toggling visibility (not display, not append/remove) keeps its
    // layout box, so the persistent pills below never shift ~30-40px when a voice surfaces or
    // clears; `sf-alert--floor`'s order:-1 keeps it atop the stack wherever it sits.
    floorEl.style.visibility = 'visible';
    ensureFloorAnnouncers();
    if (sev === 'danger') {
      politeLive.textContent = '';
      dangerLive.textContent = p.text;
    } else {
      dangerLive.textContent = '';
      politeLive.textContent = p.text;
    }
  }

  function clearFloor(p) {
    if (!floorEl) return;
    // Ignore a stale clear for a floor already replaced by a newer surface.
    if (p && p.id != null && String(p.id) !== floorId) return;
    // Slot stays reserved: keep the element mounted and its layout box (text included, so the
    // height is exact) and only turn it invisible — the pills below never move. A hidden
    // visibility box is dropped from the accessibility tree, so the line truly goes silent.
    floorEl.style.visibility = 'hidden';
    if (politeLive) politeLive.textContent = '';
    if (dangerLive) dangerLive.textContent = '';
    floorId = null;
    floorSpokenText = null;
  }

  // --- event wiring ---
  // External alert events: persistent affordances (ttl:Infinity — dock/gate/etc.) stay as status
  // pills; every transient one-shot routes through the one-voice arbiter.
  bus.on('alert', (p) => {
    const rec = p || {};
    if (rec.ttl === Infinity || rec.ttl == null) raise(rec);
    else announce(rec);
  });

  // Present the arbiter's single floor as the top-center one-voice line.
  bus.on('voice:surface', surfaceFloor);
  bus.on('voice:clear', clearFloor);

  // dock prompt (persistent while in range) — large and unmissable, a status affordance not a voice.
  // The key label is sourced from the live binding registry (spec §15.4) so it can never drift.
  bus.on('dock:range', ({ inRange }) => {
    if (inRange) raise({ key: 'dock', sev: 'dock', text: `${promptLabel('dock')} DOCK AT STATION`, ttl: Infinity });
    else clear('dock');
  });
  bus.on('dock:docked', () => clear('dock'));

  bus.on('gate:range', ({ inRange, name }) => {
    if (inRange) raise({ key: 'gate', sev: 'info', text: `${name || 'JUMP GATE'} · OPEN STARMAP (${BINDINGS.starmap.label}) TO JUMP`, ttl: Infinity });
    else clear('gate');
  });

  bus.on('site:machineStatus', (p) => {
    blockedMills = applyBlockedOutputMachine(blockedMills, p);
    syncBlockedOutputPill();
  });
  bus.on('site:machineInstalled', () => refreshBlockedMillsFromSites());
  bus.on('site:lost', (p) => {
    const prefix = `${p && p.siteId != null ? p.siteId : '_'}::`;
    const next = new Set();
    for (const key of blockedMills) {
      if (!key.startsWith(prefix)) next.add(key);
    }
    blockedMills = next;
    syncBlockedOutputPill();
  });
  bus.on('game:started', () => refreshBlockedMillsFromSites());
  bus.on('save:loaded', () => refreshBlockedMillsFromSites());

  // STORY-02 — a research grant names itself: missions is the sole RP writer and every emit
  // carries source+granted; one alert line per grant, keyed by source so same-event grants
  // (mission pay + honored clause) each get their line while a repeated source coalesces.
  bus.on('research:pointsChanged', (p) => {
    const granted = Number(p && p.granted);
    if (!(granted > 0)) return;
    announce({ key: `research:${researchGrantKey(p)}`, sev: 'info', text: `+${granted} RP — ${researchGrantLabel(p)}`, ttl: 4 });
  });

  // ECON-04 — an NPC salvage lot the market absorbed posts one receipt line naming the yard and
  // the lot's nominal value. Keyed by intake id so a duplicate application refreshes in place.
  bus.on('economy:salvageIntakeApplied', (p) => {
    if (!p || p.ok !== true) return;
    const qty = Math.max(0, Math.round(Number(p.qty) || 0));
    const value = Math.max(0, Math.round(Number(p.valueCr) || 0));
    const yard = stationName(ctx.state, p.yardId);
    announce({
      key: `salvage-intake:${p.intakeId || p.lotId || 'x'}`,
      sev: 'info',
      text: `SALVAGE INTAKE — ${qty}t scrap taken in at ${yard} · ~${value} CR`,
      ttl: 4,
    });
  });

  // ECON-05 — a named sink charge posts one receipt line per ledger record, carrying its
  // SESSION_SINK_KINDS word and the charge. chargeCredits only emits when credits actually moved,
  // so zero-credit charges stay silent by construction; the record id keys the floor line.
  bus.on('economy:sinkCharged', (p) => {
    if (!p || p.id == null) return;
    const amount = Math.max(0, Math.round(Number(p.amount) || 0));
    const kind = String(p.kind || 'charge').toUpperCase();
    const causeWord = typeof p.causeWord === 'string' && p.causeWord ? p.causeWord : p.cause;
    const cause = typeof causeWord === 'string' && causeWord ? ` · ${causeWord}` : '';
    announce({ key: `sink:${p.id}`, sev: 'info', text: `${kind} −${amount} CR${cause}`, ttl: 4 });
  });

  // WORLD-25 — hazard-zone membership uses the persistent pill the HUD already owns: entry
  // raises the named field line, exit clears it. world.js emits hazard:enter/hazard:exit with
  // the player entity id; other entities' zone crossings never reach this surface.
  const HAZARD_SEV = { radiation: 'warn', nebula: 'info' };
  bus.on('hazard:enter', (p) => {
    if (!p || p.entityId !== (ctx.state && ctx.state.playerId)) return;
    const type = typeof p.zoneType === 'string' ? p.zoneType : '';
    if (!type) return;
    raise({
      key: `hazard:${type}`,
      sev: HAZARD_SEV[type] || 'info',
      text: `${type.replace(/_/g, ' ').toUpperCase()} FIELD${hazardDamageSuffix(type)}`,
      ttl: Infinity,
    });
  });
  bus.on('hazard:exit', (p) => {
    if (!p || p.entityId !== (ctx.state && ctx.state.playerId)) return;
    const type = typeof p.zoneType === 'string' ? p.zoneType : '';
    if (!type) return;
    // Disc-in-disc: leaving one zone may leave another same-type zone still holding the
    // player (a machine disc inside a sector-wide authored field). Clear the pill only
    // when no same-type zone still contains them.
    const state = ctx.state;
    const player = state && state.entities && state.entities.get(state.playerId);
    const zones = state && state.world && state.world.activeSector && state.world.activeSector.hazards;
    if (player && player.pos && Array.isArray(zones)) {
      for (const zone of zones) {
        if (!zone || zone.type !== type || !zone.center) continue;
        const r = Number(zone.radius);
        if (!Number.isFinite(r) || r <= 0) continue;
        const dx = player.pos.x - zone.center.x;
        const dz = player.pos.z - zone.center.z;
        if (dx * dx + dz * dz <= r * r) return;
      }
    }
    clear(`hazard:${type}`);
  });

  // incoming fire on the player — transient one-shots → the one-voice floor ONLY (no parallel pill
  // or toast). shield-down is listed in VOICE_OWNED_ALERT_TEXTS so toasts.js drops any mirror.
  bus.on('combat:damage', (p) => {
    if (!p || !p.isPlayer) return;
    if (p.brokeShield) announce({ key: 'shield-down', sev: 'danger', text: 'SHIELDS DOWN', ttl: 3 });
    else announce({ key: 'incoming', sev: 'warn', text: 'TAKING FIRE', ttl: 1.5 });
  }, { presentation: true });
  // Missile lock is a condition-bound STATUS light (raised on lock, cleared on unlock) — it must
  // stay visible while the lock holds, so it stays a pill, not a one-shot voice. The emitter
  // fires only on lock CHANGE, so the pill carries ttl:Infinity; clear('lock') on unlock is
  // the only exit (a finite ttl let it expire mid-lock and blink on jittery re-acquire).
  bus.on('combat:lockChanged', ({ locked }) => {
    if (locked) raise({ key: 'lock', sev: 'danger', text: 'MISSILE LOCK', ttl: Infinity });
    else clear('lock');
  });
  // cargo-full: arbiter owns the short status line. floatingText may still emit a parallel
  // toast('CARGO FULL') — toasts.js drops it via isVoiceOwnedAlertToast. Numeric/loot floaters
  // are untouched. Tutorial longform ("Cargo hold full! Dock…") stays on the tutorial channel.
  bus.on('cargo:full', () => announce({ key: 'cargo-full', sev: 'warn', text: 'CARGO HOLD FULL', ttl: 2.5 }));
  bus.on('fuel:empty', () => announce({ key: 'fuel', sev: 'danger', text: 'OUT OF FUEL', ttl: 4 }));

  // Worldfeel — developed rock, a hull skim, and a volatile stage. Each admits on sim tick
  // so a held beam does not refresh the floor every frame. Stable cargo is not a voice.
  const worldFeelVoiceBook = Object.create(null);
  for (const eventName of WORLD_FEEL_SEAM_IDS) {
    bus.on(eventName, (payload) => {
      const snap = eventName === 'flight:sweptHull' ? copySweptHullFeel(payload) : payload;
      if (!admitWorldFeelSeam(worldFeelVoiceBook, eventName, snap, worldFeelTick(ctx.state))) return;
      const voice = worldFeelVoice(eventName, snap);
      if (voice) announce(voice);
    });
  }

  // Hazard entry is a condition light, like missile lock: it stays while you are inside
  // and clears when you leave. Not a new bar, and not a one-shot voice.
  bus.on('hazard:changed', (payload) => {
    const command = hazardAlertCommand(payload);
    if (!command) return;
    if (command.action === 'clear') clear(command.key);
    else raise(command);
  });

  // ECON-04/ECON-05 receipt lines are announced ONCE, through the arbiter floor above
  // (economy:salvageIntakeApplied / economy:sinkCharged). Earlier parallel raise() bindings
  // here painted a second near-identical pill beside the floor line — removed; the module
  // header's routing rule stands: transient one-shots go through the arbiter only.

  // low-shield/hull driven from the HUD per-frame check via these helpers (status pills):
  return { raise, clear, tick };
}

/** ECON-05: Flight-HUD formatting contract for session sink charges (pinned by
 *  test/economy-sink-charged-alert.test.mjs). The live wiring announces through the arbiter
 *  floor above; this pure formatter stays the tested word/amount contract for the HUD lane. */
export function sinkChargeAlertText(payload) {
  if (!payload) return null;
  const amount = Math.floor(Number(payload.amount) || 0);
  if (amount <= 0) return null;
  const kind = String(payload.kind || '').toLowerCase();
  const word = kind ? kind.toUpperCase() : 'CHARGE';
  return `${word} · ${amount} CR`;
}

/** ECON-04: Flight-HUD formatting contract for absorbed salvage intake (pinned by
 *  test/economy-sink-charged-alert.test.mjs). The live wiring announces through the arbiter
 *  floor above; this pure formatter stays the tested value/qty contract for the HUD lane. */
export function salvageIntakeAlertText(payload) {
  if (!payload) return null;
  const qty = Math.floor(Number(payload.qty) || 0);
  const val = payload.value != null ? `${payload.value} CR` : (qty > 0 ? `${qty} U` : null);
  if (!val) return null;
  return `SALVAGE INTAKE · ${val}`;
}
