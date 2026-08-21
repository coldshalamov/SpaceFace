// The earned build palette — design law §6.3 (anatomy + the three key states), §6.7 (build mode),
// §9 ("First Core: the build palette mounts with a small settle animation"), §2.5 (word budget).
//
// THIS IS NOT A COMMAND CARD. The StarCraft 3x3 grid that used to live here — always present,
// nine keys, a name printed under every cap — is exactly what the playfield brief calls a FAIL
// ("restyling the current always-visible 3x3 grey grid", "keys for locked machines"). What ships
// instead:
//
//   • The palette has NO DOM until the player owns a Core. Not hidden, not dimmed, not a row of
//     gray placeholders — absent. Before a Core there is exactly one thing you can build on a
//     rock, so build mode arms it implicitly and needs no chrome to choose with. `selected`
//     therefore answers the Core even while unmounted, which is what makes the first install
//     reachable with B + arrows + Enter and nothing else.
//   • On the first Core it mounts with a ~300ms settle (8px rise + fade) and then carries one key
//     per machine that is actually buildable on THIS rock. A unique machine that already exists is
//     absent again — a key you can never press is a lie about the game's size.
//   • A key is a plate, not a label: 46x46, r8, --aw-raised, soft shadow, a 22px filled silhouette
//     that matches the board sprite (same plinth under every machine, exactly as makeMachine
//     bolts one under every real object), and the hotkey numeral in the corner. The NAME is not on
//     the glass — it lives in the hover tip, so the default drive view keeps its 15-word budget.
//     Digits are free to the word counter; letters are not.
import { SITE_MACHINES } from '../../data/sites.js';
import { commodityName, sentenceCase } from './inspector.js';

export const PALETTE_ITEMS = [
  ...SITE_MACHINES.map((def) => ({
    kind: 'machine',
    id: def.id,
    name: def.name,
    verb: def.verb,
    cost: def.cost,
    unique: !!def.unique,
  })),
  { kind: 'overlay', id: 'power', name: 'Power Cable', verb: 'route', cost: null },
  { kind: 'overlay', id: 'lane', name: 'Material Lane', verb: 'route', cost: null },
  { kind: 'remove', id: 'remove', name: 'Dismantle', verb: 'remove', cost: null },
];

const ITEM_BY_ID = new Map(PALETTE_ITEMS.map((item) => [item.id, item]));

/** The Core is the palette's own precondition, so it is also its pre-mount default selection. */
export const CORE_ID = 'sm_massline_core';

// ---------------------------------------------------------------- silhouette glyphs
//
// FILLED masses, not 1.6px line icons: at 22px a hairline drawing reads as a smudge and loses the
// recognition transfer the law asks for. Each machine sits on the same chamfered plinth bar that
// makeMachine() bolts under every installed object in the world, so the family reads as "equipment
// you install" before you can tell which one it is. The three VERBS (cable, lane, dismantle) have
// no plinth on purpose — they are actions, not objects.
const svg = (inner) =>
  `<svg class="aw-build-glyph" viewBox="0 0 24 24" fill="currentColor" `
  + `aria-hidden="true" focusable="false">${inner}</svg>`;

const PLINTH = '<rect x="3.4" y="19.5" width="17.2" height="2.5" rx="0.9"/>';

export const PALETTE_GLYPHS = {
  // Hex pressure column in a machined collar under a cone cap, counterweight arm off the head.
  sm_massline_core: svg(
    '<path d="M12 2.1 15.2 6.3H8.8z"/>'
    + '<rect x="12" y="6.6" width="6.4" height="1.25" rx="0.62"/>'
    + '<circle cx="19.1" cy="7.22" r="1.55"/>'
    + '<path d="M12 8.2l3.9 1.7v6.9L12 18.5l-3.9-1.7V9.9z"/>'
    + '<rect x="6.6" y="10.6" width="10.8" height="1.9" rx="0.95"/>'
    + PLINTH,
  ),
  // Boxed gearcase, finned heat sink on the crown, reciprocating bore rod out the flank.
  sm_extractor: svg(
    '<rect x="7.4" y="2.6" width="9.2" height="1.15" rx="0.5"/>'
    + '<rect x="7.4" y="4.5" width="9.2" height="1.15" rx="0.5"/>'
    + '<rect x="7.4" y="6.4" width="9.2" height="1.15" rx="0.5"/>'
    + '<rect x="6.8" y="8.6" width="10.4" height="9" rx="1.1"/>'
    + '<path d="M7.4 11.5v3.1H4.2l-2.6-1.55z"/>'
    + PLINTH,
  ),
  // Pressure vessel in a strap cradle with a real intake turbine on the neck.
  sm_gas_tap: svg(
    '<circle cx="12" cy="4.4" r="1.55"/>'
    + '<rect x="10.95" y="0.6" width="2.1" height="3.7" rx="1.05"/>'
    + '<rect x="10.95" y="0.6" width="2.1" height="3.7" rx="1.05" transform="rotate(120 12 4.4)"/>'
    + '<rect x="10.95" y="0.6" width="2.1" height="3.7" rx="1.05" transform="rotate(240 12 4.4)"/>'
    + '<rect x="10.3" y="6.2" width="3.4" height="2.6" rx="0.8"/>'
    + '<ellipse cx="12" cy="13.9" rx="5.3" ry="5.1"/>'
    + PLINTH,
  ),
  // Furnace housing with a hopper on the shoulder and the tall cowled stack.
  sm_refinery: svg(
    '<rect x="14.6" y="2.1" width="4.4" height="1.9" rx="0.75"/>'
    + '<rect x="15.5" y="3.8" width="2.6" height="13.4" rx="0.8"/>'
    + '<path d="M5.4 5.2h6.6l-2.3 3.6H7.7z"/>'
    + '<rect x="4.3" y="9.2" width="9.6" height="8" rx="1.1"/>'
    + PLINTH,
  ),
  // Sealed bay with a real viewport (a knockout, never a glowing panel) over a gantry rail.
  sm_fabricator: svg(
    '<path fill-rule="evenodd" d="M3.5 4.1h17v10.3H3.5z M6.9 6.9h10.2v2.7H6.9z"/>'
    + '<rect x="4.9" y="16.2" width="14.2" height="1.7" rx="0.85"/>'
    + '<rect x="13.2" y="14.7" width="4.4" height="4.1" rx="0.9"/>'
    + PLINTH,
  ),
  // Launch collar with guide rails and a berthed pod in the bore.
  sm_cargo_port: svg(
    '<path fill-rule="evenodd" d="M12 3.5a5.9 5.9 0 1 1 0 11.8 5.9 5.9 0 0 1 0-11.8z'
    + ' M12 6.4a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/>'
    + '<path d="M12 6.9c1.05 0 1.9 1.15 1.9 2.55S13.05 12 12 12s-1.9-1.15-1.9-2.55S10.95 6.9 12 6.9z"/>'
    + '<rect x="5.5" y="13.4" width="1.8" height="5.4" rx="0.8"/>'
    + '<rect x="16.7" y="13.4" width="1.8" height="5.4" rx="0.8"/>'
    + PLINTH,
  ),
  // Verbs: no plinth. Nothing is installed by these.
  power: svg('<path d="M13.9 1.9 5.9 13.6h4.9l-1.4 8.5 8-12h-4.9z"/>'),
  lane: svg(
    '<rect x="2.6" y="5.6" width="18.8" height="2.8" rx="1.4"/>'
    + '<rect x="2.6" y="15.6" width="18.8" height="2.8" rx="1.4"/>'
    + '<path d="M8.8 9.1 16 12l-7.2 2.9z"/>',
  ),
  remove: svg(
    '<path fill-rule="evenodd" d="M3.4 3.4h17.2v17.2H3.4z'
    + ' M8.4 6.3 6.3 8.4 9.9 12l-3.6 3.6 2.1 2.1L12 14.1l3.6 3.6 2.1-2.1L14.1 12l3.6-3.6-2.1-2.1'
    + 'L12 9.9z"/>',
  ),
};

// NOTE: the old `costText` full-cost formatter is deleted, not kept "just in case". Law §6.3 puts a
// cost on a key only when you cannot pay it, so the affordable case has no consumer — and an
// exported helper nothing calls is the kind of quiet lie this file's header argues against.

/** The SHORT amount law §6.3 puts in coral on an unaffordable key: what you are actually missing. */
export function shortfallText(missing) {
  const goods = Object.keys(missing || {}).sort();
  if (!goods.length) return '';
  return goods.map((g) => `${missing[g]} ${sentenceCase(commodityName(g)).toLowerCase()}`).join(' + ');
}

const SETTLE_MS = 300;

/**
 * @param {HTMLElement} host      a positioned element (the stage) — the palette places itself.
 * @param {object} opts
 *   onSelect(item, index)        the armed key changed (any cause).
 *   onUserSelect(item, index)    a human pressed a key — the shell arms BUILD from DRIVE.
 *   motionReduce                 skip the §9 settle.
 */
export function createBuildPalette(host, { onSelect, onUserSelect, motionReduce = false } = {}) {
  const root = document.createElement('div');
  root.className = 'aw-palette';
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Build palette');

  /** @type {Map<string, HTMLButtonElement>} */
  const keys = new Map();
  let visible = [];              // ids with a key on the glass, in catalog order
  let selectedId = CORE_ID;      // answers even while unmounted — the pre-Core implicit arm
  let mounted = false;
  let reduce = !!motionReduce;
  let settleTimer = 0;

  function makeKey(item) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'aw-build-key';
    b.dataset.itemId = item.id;
    b.dataset.keyKind = item.kind;
    b.dataset.keyState = 'ready';
    b.setAttribute('aria-pressed', 'false');
    b.innerHTML = PALETTE_GLYPHS[item.id] || PALETTE_GLYPHS.remove;

    const hk = document.createElement('span');
    hk.className = 'aw-build-hotkey';
    b.appendChild(hk);

    // The name lives here and nowhere else (law §2.5). Hidden — not merely transparent — so the
    // word-budget walker never counts it, and revealed on hover/focus only.
    const tip = document.createElement('span');
    tip.className = 'aw-build-tip';
    tip.setAttribute('aria-hidden', 'true');
    const tipName = document.createElement('span');
    tipName.className = 'aw-build-tip-name';
    tipName.textContent = sentenceCase(item.name);
    const tipCost = document.createElement('span');
    tipCost.className = 'aw-build-tip-cost';
    tip.append(tipName, tipCost);
    b.appendChild(tip);

    b.addEventListener('click', () => {
      const i = visible.indexOf(item.id);
      if (i < 0) return;
      select(i);
      if (onUserSelect) onUserSelect(item, i);
    });
    return { button: b, tipCost };
  }

  const tipCosts = new Map();
  /** id -> short "4 regocrete + 1 control unit", '' when the key is affordable. */
  let shortfalls = Object.create(null);

  function ensureKey(id) {
    let b = keys.get(id);
    if (b) return b;
    const item = ITEM_BY_ID.get(id);
    if (!item) return null;
    const made = makeKey(item);
    keys.set(id, made.button);
    tipCosts.set(id, made.tipCost);
    return made.button;
  }

  // The three states of law §6.3, mutually exclusive and published on one attribute so a headless
  // check reads what the eye reads: armed (gold ring + gold glyph) beats unaffordable (flat
  // surface, ink-3 glyph, coral shortfall on hover) beats ready (raised, ink-2 glyph).
  function paint() {
    visible.forEach((id, i) => {
      const b = keys.get(id);
      if (!b) return;
      const armed = id === selectedId;
      const short = shortfalls[id] || '';
      b.dataset.keyState = armed ? 'armed' : (short ? 'unaffordable' : 'ready');
      b.classList.toggle('armed', armed);
      b.classList.toggle('poor', !!short);
      b.setAttribute('aria-pressed', String(armed));
      const hk = b.querySelector('.aw-build-hotkey');
      if (hk) hk.textContent = i < 9 ? String(i + 1) : '';
      const costEl = tipCosts.get(id);
      if (costEl && costEl.textContent !== short) costEl.textContent = short;
      const item = ITEM_BY_ID.get(id);
      const label = sentenceCase(item ? item.name : id);
      b.setAttribute('aria-label', i < 9 ? `${label}, key ${i + 1}` : label);
    });
  }

  /**
   * Reconcile the row with the world.
   * @param {object} view
   *   present   {string[]} ids that have earned a key, in any order (catalog order is imposed here)
   *   shortfall {Record<string, Record<string, number>>} id -> missing goods (unaffordable state)
   *   settle    {boolean} allow the §9 mount animation (false while a session is booting)
   */
  function sync({ present = [], shortfall = {}, settle = true } = {}) {
    const want = PALETTE_ITEMS.map((it) => it.id).filter((id) => present.includes(id));
    const changed = want.length !== visible.length || want.some((id, i) => visible[i] !== id);

    if (changed) {
      visible = want;
      root.replaceChildren(...want.map((id) => ensureKey(id)).filter(Boolean));
    }

    // Affordability is a per-key STATE, not a per-key existence rule: you can see what you cannot
    // yet pay for (law §6.3 unaffordable). Only a machine you could never build here is absent.
    shortfalls = Object.create(null);
    for (const id of visible) {
      const miss = shortfall[id];
      shortfalls[id] = miss && Object.keys(miss).length ? shortfallText(miss) : '';
    }

    if (!visible.length) { unmount(); return { mounted: false, changed }; }
    // A unique machine that just got built loses its key; the arm has to land somewhere real.
    if (!visible.includes(selectedId)) selectTo(visible[0]);
    paint();

    if (!mounted) {
      host.appendChild(root);
      mounted = true;
      // Law §9: the interface visibly grows because the site grew. One beat, once, and never on a
      // cold session start (re-entering a producing site must not replay the birth of the palette).
      if (settle && !reduce) {
        root.classList.add('settle');
        clearTimeout(settleTimer);
        settleTimer = setTimeout(() => root.classList.remove('settle'), SETTLE_MS + 80);
      }
      return { mounted: true, changed: true };
    }
    return { mounted: true, changed };
  }

  function selectTo(id) {
    if (!ITEM_BY_ID.has(id) || selectedId === id) return false;
    selectedId = id;
    paint();
    if (onSelect) onSelect(ITEM_BY_ID.get(selectedId), visible.indexOf(selectedId));
    return true;
  }

  /**
   * Index into the VISIBLE row — exactly what the hotkey numerals print. Out of range answers
   * FALSE rather than wrapping: pressing 9 on an eight-key row must leave the digit to whatever
   * else on the page wants it, not quietly arm key 1.
   */
  function select(index) {
    const i = Math.trunc(index);
    if (!(i >= 0 && i < visible.length)) return false;
    if (visible[i] !== selectedId) selectTo(visible[i]);
    return true;
  }

  function unmount() {
    // The arm goes back to the Core whether or not a row was on the glass: a rock with no Core has
    // exactly one legal build, and `selected` is what BUILD mode places. Leaving a stale extractor
    // armed here would make Enter refuse forever on a rock that has lost its Core.
    selectedId = CORE_ID;
    if (!mounted) return;
    clearTimeout(settleTimer);
    root.classList.remove('settle');
    root.remove();
    mounted = false;
  }

  return {
    root,
    get mounted() { return mounted; },
    get keyCount() { return visible.length; },
    get selected() { return ITEM_BY_ID.get(selectedId) || ITEM_BY_ID.get(CORE_ID); },
    get selectedIndex() { return visible.indexOf(selectedId); },
    select,
    selectId: selectTo,
    cycle(dir) {
      const n = visible.length;
      if (!n) return false;
      const at = visible.indexOf(selectedId);
      const next = ((((at < 0 ? 0 : at) + (dir > 0 ? 1 : -1)) % n) + n) % n;
      return select(next);
    },
    sync,
    /** BUILD engaged: the row goes live (armed ring reads, keys accept the pointer). */
    setBuildActive(active) { root.classList.toggle('live', !!active); },
    setMotionReduce(v) { reduce = !!v; },
    unmount,
    destroy() {
      clearTimeout(settleTimer);
      unmount();
      keys.clear();
      tipCosts.clear();
      visible = [];
    },
  };
}
