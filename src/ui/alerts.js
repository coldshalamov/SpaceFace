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

/** Flight-HUD status line for a mill that cannot produce. Not a one-voice bark: it stays up
 *  while the machine is blocked so reduce-motion still has a word when shake/zoom are off. */
export function blockedOutputAlertText(payload) {
  if (!payload) return null;
  const s = String(payload.state || payload.status || '');
  return BLOCKED_OUTPUT_STATES.has(s) ? 'OUTPUT BLOCKED' : null;
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
  const map = new Map(); // key -> { key, sev, text, ttl(ms)|Infinity, born, el }
  const expiredKeys = [];
  let nextExpiryAt = Infinity;
  let blockedMills = new Set();

  function ensureEl(rec) {
    if (rec.el) return rec.el;
    const el = document.createElement('div');
    el.className = `sf-alert sf-alert--${rec.sev}`;
    // Persistent condition chips are discoverable status text, never a second automatic voice.
    // Transient/danger speech belongs to the single arbiter floor below.
    el.setAttribute('role', 'group');
    el.setAttribute('aria-live', 'off');
    el.setAttribute('aria-atomic', 'true');
    const txt = document.createElement('span');
    txt.className = 'sf-alert__text';
    el.appendChild(txt);
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
    if (rec.el) rec.el.className = `sf-alert sf-alert--${sev}`;
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
        if (el.parentNode !== root) root.appendChild(el);
      } else if (el.parentNode) {
        el.parentNode.removeChild(el);
      }
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
      const txt = document.createElement('span');
      txt.className = 'sf-alert__text';
      floorEl.appendChild(txt);
      floorEl._txt = txt;
    }
    floorEl.className = `sf-alert sf-alert--floor sf-alert--${sev}`;
    // Danger is announced assertively (mirrors the prior danger-pill a11y behavior); every other
    // voice is polite so it never interrupts a screen reader mid-sentence.
    // Identical line already on the floor (same-id coalesce / re-surface) — keep DOM, no re-speak.
    if (floorEl.parentNode === root && floorSpokenText === p.text) return;
    floorEl._txt.textContent = p.text;
    floorSpokenText = p.text;
    if (floorEl.parentNode !== root) root.appendChild(floorEl);
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
    if (floorEl.parentNode) floorEl.parentNode.removeChild(floorEl);
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

  // incoming fire on the player — transient one-shots → the one-voice floor ONLY (no parallel pill
  // or toast). shield-down is listed in VOICE_OWNED_ALERT_TEXTS so toasts.js drops any mirror.
  bus.on('combat:damage', (p) => {
    if (!p || !p.isPlayer) return;
    if (p.brokeShield) announce({ key: 'shield-down', sev: 'danger', text: 'SHIELDS DOWN', ttl: 3 });
    else announce({ key: 'incoming', sev: 'warn', text: 'TAKING FIRE', ttl: 1.5 });
  });
  // Missile lock is a condition-bound STATUS light (raised on lock, cleared on unlock) — it must
  // stay visible while the lock holds, so it stays a pill, not a one-shot voice.
  bus.on('combat:lockChanged', ({ locked }) => {
    if (locked) raise({ key: 'lock', sev: 'danger', text: 'MISSILE LOCK', ttl: 2 });
    else clear('lock');
  });
  // cargo-full: arbiter owns the short status line. floatingText may still emit a parallel
  // toast('CARGO FULL') — toasts.js drops it via isVoiceOwnedAlertToast. Numeric/loot floaters
  // are untouched. Tutorial longform ("Cargo hold full! Dock…") stays on the tutorial channel.
  bus.on('cargo:full', () => announce({ key: 'cargo-full', sev: 'warn', text: 'CARGO HOLD FULL', ttl: 2.5 }));
  bus.on('fuel:empty', () => announce({ key: 'fuel', sev: 'danger', text: 'OUT OF FUEL', ttl: 4 }));

  // low-shield/hull driven from the HUD per-frame check via these helpers (status pills):
  return { raise, clear, tick };
}
