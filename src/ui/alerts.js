// Contextual alerts (ARCHITECTURE §5, spec "Contextual alerts") — center-top HUD pills.
// Deduped by `key`, severity-sorted (danger > warn > info), auto-expire by ttl.
//
// Driven by:
//   - `alert` events {key,sev,text,ttl} from any system,
//   - contextual conditions we own here: low-shield, incoming-fire, and the dock prompt.
//
// The dock prompt is special: `dock:range {stationId,inRange}` shows/clears a persistent
// "Press Enter to dock" alert (no ttl). The dock key handling lives in input.js.

const SEV_RANK = { danger: 3, dock: 2.5, warn: 2, info: 1 };

export function createAlerts(ctx) {
  const { bus } = ctx;
  const root = document.getElementById('alerts');
  const map = new Map(); // key -> { key, sev, text, ttl(ms)|Infinity, born, el }

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
    if (rec.el) rec.el.className = `sf-alert sf-alert--${sev}`;
    render();
  }

  function clear(key) {
    const rec = map.get(key);
    if (!rec) return;
    if (rec.el && rec.el.parentNode) rec.el.parentNode.removeChild(rec.el);
    map.delete(key);
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

  // expiry sweep — called each frame from hud frame()
  function tick() {
    if (!map.size) return;
    const now = performance.now();
    let dirty = false;
    for (const rec of [...map.values()]) {
      if (rec.ttl !== Infinity && now - rec.born > rec.ttl) { clear(rec.key); dirty = true; }
    }
    if (dirty) render();
  }

  // --- event wiring ---
  bus.on('alert', raise);

  // dock prompt (persistent while in range) — large and unmissable
  bus.on('dock:range', ({ inRange }) => {
    if (inRange) raise({ key: 'dock', sev: 'dock', text: '[ ENTER ] DOCK AT STATION', ttl: Infinity });
    else clear('dock');
  });
  bus.on('dock:docked', () => clear('dock'));

  bus.on('gate:range', ({ inRange, name }) => {
    if (inRange) raise({ key: 'gate', sev: 'info', text: `${name || 'JUMP GATE'} · OPEN STARMAP (M) TO JUMP`, ttl: Infinity });
    else clear('gate');
  });

  // incoming fire on the player
  bus.on('combat:damage', (p) => {
    if (!p || !p.isPlayer) return;
    if (p.brokeShield) raise({ key: 'shield-down', sev: 'danger', text: 'SHIELDS DOWN', ttl: 3 });
    else raise({ key: 'incoming', sev: 'warn', text: 'TAKING FIRE', ttl: 1.5 });
  });
  bus.on('combat:lockChanged', ({ locked }) => {
    if (locked) raise({ key: 'lock', sev: 'danger', text: 'MISSILE LOCK', ttl: 2 });
    else clear('lock');
  });
  bus.on('cargo:full', () => raise({ key: 'cargo-full', sev: 'warn', text: 'CARGO HOLD FULL', ttl: 2.5 }));
  bus.on('beam:overheated', () => raise({ key: 'overheat', sev: 'warn', text: 'MINING BEAM OVERHEATED', ttl: 2 }));
  bus.on('beam:ready', () => clear('overheat'));
  bus.on('fuel:empty', () => raise({ key: 'fuel', sev: 'danger', text: 'OUT OF FUEL', ttl: 4 }));

  // low-shield/hull driven from the HUD per-frame check via these helpers:
  return { raise, clear, tick };
}
