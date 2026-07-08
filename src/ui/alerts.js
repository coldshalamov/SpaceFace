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
//      mirror so the voice is not duplicated bottom-right.
//
import { BINDINGS, promptLabel } from './bindings.js';

// The dock prompt is special: `dock:range {stationId,inRange}` shows/clears a persistent
// binding-sourced dock alert (no ttl). The dock key handling lives in input.js.

const SEV_RANK = { danger: 3, dock: 2.5, warn: 2, info: 1 };

export function createAlerts(ctx) {
  const { bus } = ctx;
  const root = document.getElementById('alerts');
  const map = new Map(); // key -> { key, sev, text, ttl(ms)|Infinity, born, el }
  const expiredKeys = [];
  let nextExpiryAt = Infinity;

  function ensureEl(rec) {
    if (rec.el) return rec.el;
    const el = document.createElement('div');
    el.className = `sf-alert sf-alert--${rec.sev}`;
    // Announce these to assistive tech. danger pulses visually; it must also be spoken. We use
    // role="status" + a polite/assertive live region keyed to severity so screen readers read combat
    // alerts ("SHIELDS DOWN", "MISSILE LOCK") as they appear.
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', rec.sev === 'danger' ? 'assertive' : 'polite');
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
      rec._txt.textContent = rec.text;
      if (shownSet.has(rec)) {
        if (el.parentNode !== root) root.appendChild(el);
      } else if (el.parentNode) {
        el.parentNode.removeChild(el);
      }
    }
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
  let floorEl = null;
  let floorId = null;

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
      floorEl.setAttribute('role', 'status');
      floorEl.setAttribute('aria-atomic', 'true');
      const txt = document.createElement('span');
      txt.className = 'sf-alert__text';
      floorEl.appendChild(txt);
      floorEl._txt = txt;
    }
    floorEl.className = `sf-alert sf-alert--floor sf-alert--${sev}`;
    // Danger is announced assertively (mirrors the prior danger-pill a11y behavior); every other
    // voice is polite so it never interrupts a screen reader mid-sentence.
    floorEl.setAttribute('aria-live', sev === 'danger' ? 'assertive' : 'polite');
    floorEl._txt.textContent = p.text;
    if (floorEl.parentNode !== root) root.appendChild(floorEl);
  }

  function clearFloor(p) {
    if (!floorEl) return;
    // Ignore a stale clear for a floor already replaced by a newer surface.
    if (p && p.id != null && String(p.id) !== floorId) return;
    if (floorEl.parentNode) floorEl.parentNode.removeChild(floorEl);
    floorId = null;
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

  // incoming fire on the player — transient one-shots → the one-voice floor.
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
  bus.on('cargo:full', () => announce({ key: 'cargo-full', sev: 'warn', text: 'CARGO HOLD FULL', ttl: 2.5 }));
  bus.on('fuel:empty', () => announce({ key: 'fuel', sev: 'danger', text: 'OUT OF FUEL', ttl: 4 }));

  // low-shield/hull driven from the HUD per-frame check via these helpers (status pills):
  return { raise, clear, tick };
}
