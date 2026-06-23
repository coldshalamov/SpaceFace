// Codex / Journal screen (P1-9). Surfaces the ~30KB of authored narrative that was previously
// locked behind ephemeral comms popups (last 80 only, press C). A player can now BROWSE the story
// they've encountered — beats, comms, graffiti, figures, the ship's history — and re-read it any
// time. Discover-as-you-play: entries unlock as the player reaches them (state.story.beatIndex,
// seenComms, graffitiShown), so nothing is spoiled ahead of its beat. Unseen entries show a locked
// placeholder ("— not yet encountered —") rather than the content.
//
// Mirrors the Help screen's shell (sf-menu / tabbar / search) for visual + a11y consistency. Reads
// state.story + the pure-data narrative tables; never mutates sim state.

import { SHIP, COLD_START, REFS, FIGURES, COMMS, GRAFFITI, BEAT_CONTENT, ENDGAME_CHOICES, KURTZ, PERSISTENT_CARGO } from '../../data/narrative.js';

const STYLE_ID = 'sf-codex-style';

function getManager(ctx) {
  if (ctx && ctx.screenManager) return ctx.screenManager;
  if (ctx && ctx.screens && ctx.screens.pushScreen) return ctx.screens;
  const ui = ctx && ctx.registry && ctx.registry.get && ctx.registry.get('ui');
  if (ui && ui.screenManager) return ui.screenManager;
  if (ui && ui.manager) return ui.manager;
  return null;
}
function nav(ctx, method, arg) {
  const mgr = getManager(ctx);
  if (mgr && typeof mgr[method] === 'function') { mgr[method](arg); return; }
  ctx.bus.emit('ui:' + method, { id: arg });
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
  .sf-codex-entry { padding:12px 14px; border:1px solid var(--panel-edge, rgba(120,160,200,.22));
    border-radius:7px; background:rgba(8,14,24,.55); margin-bottom:10px; }
  .sf-codex-entry h3 { margin:0 0 4px; font-size:14px; color:var(--accent, #39d0ff); letter-spacing:.04em; }
  .sf-codex-entry .sf-codex-meta { font-size:11px; color:var(--ink-mute, #6b7d99);
    font-family:var(--mono, monospace); letter-spacing:.06em; margin-bottom:6px; text-transform:uppercase; }
  .sf-codex-entry .sf-codex-body { font-size:13.5px; line-height:1.5; color:var(--ink, #d7e6ff); }
  .sf-codex-entry .sf-codex-note { font-size:11.5px; line-height:1.45; color:var(--ink-dim, #8fa3c0);
    font-style:italic; margin-top:8px; border-top:1px dashed rgba(120,160,200,.18); padding-top:6px; }
  .sf-codex-locked { opacity:.45; font-style:italic; color:var(--ink-mute, #6b7d99); }
  .sf-codex-graffiti { font-family:var(--mono, monospace); letter-spacing:.08em; text-transform:uppercase;
    font-size:13px; color:var(--ink, #d7e6ff); }
  .sf-codex-empty { color:var(--ink-mute, #6b7d99); font-style:italic; padding:24px; text-align:center; }
  .sf-codex-beat { border-left:3px solid var(--accent, #39d0ff); }
  .sf-codex-beat.current { box-shadow:0 0 12px rgba(57,208,255,.2); border-color:#fff; }
  .sf-codex-section-h { font-size:11px; letter-spacing:.16em; text-transform:uppercase;
    color:var(--ink-dim, #8fa3c0); margin:14px 0 6px; }
  `;
  document.head.appendChild(s);
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function shell(rootEl, title, extraClass) {
  rootEl.innerHTML = '';
  rootEl.classList.add('panel', 'sf-menu');
  if (extraClass) rootEl.classList.add(extraClass);
  const h = document.createElement('h1');
  h.textContent = title;
  rootEl.appendChild(h);
  const body = document.createElement('div');
  body.className = 'sf-col';
  rootEl.appendChild(body);
  return { panel: rootEl, body };
}

const TABS = ['Story', 'Comms', 'Graffiti', 'Figures', 'Ship'];

// Beat titles (kept here, not in narrative data, because BEAT_CONTENT[].hint is the in-world
// "Captain's Log" voice — this is the neutral chapter label for the codex index).
const BEAT_TITLES = [
  'B0 — Cold Start',
  'B1 — Honest Work',
  'B2 — First Blood',
  'B3 — Bigger Boat',
  'B4 — Pick a Side',
  'B5 — Proving Ground',
  'B6 — Empire Seed',
  'B7 — The Deep Reach',
];

function safeStory(ctx) {
  return (ctx.state && ctx.state.story) || { beatIndex: 0, seenComms: {}, graffitiShown: {}, endgameChoice: null, flags: {} };
}

export const codexScreen = {
  id: 'codex',
  _activeTab: 'Story',

  mount(rootEl, ctx) {
    injectStyle();
    shell(rootEl, 'Codex', 'sf-menu-wide');

    const bar = el('div', 'sf-tabbar');
    this._tabBtns = {};
    TABS.forEach((t) => {
      const b = el('button', 'sf-tab', t);
      b.addEventListener('click', () => { this._activeTab = t; this._render(ctx); });
      bar.appendChild(b);
      this._tabBtns[t] = b;
    });
    rootEl.appendChild(bar);

    const body = el('div', 'sf-col');
    body.style.overflowY = 'auto';
    body.style.flex = '1';
    body.style.minHeight = '0';
    rootEl.appendChild(body);
    this._body = body;

    const foot = el('div', 'sf-foot');
    const close = el('button', 'sf-btn', 'Close'); close.style.width = 'auto';
    close.addEventListener('click', () => nav(ctx, 'popScreen'));
    foot.appendChild(close);
    rootEl.appendChild(foot);

    this._ctx = ctx;
    this._visible = false;
    this._unsubs = [];
    const refreshIfVisible = () => { if (this._visible && this._body) this._render(this._ctx); };
    this._unsubs.push(ctx.bus.on('story:beatAdvanced', refreshIfVisible));
    this._unsubs.push(ctx.bus.on('comms:popup', refreshIfVisible));
    this._unsubs.push(ctx.bus.on('graffiti:show', refreshIfVisible));

    this._render(ctx);
  },

  refresh(ctx) { this._ctx = ctx; if (this._body) this._render(ctx); },
  onShow(ctx) { this._ctx = ctx; this._visible = true; },
  onHide() { this._visible = false; },

  _render(ctx) {
    if (!this._body) return;
    this._body.innerHTML = '';
    for (const t of TABS) {
      if (this._tabBtns[t]) this._tabBtns[t].classList.toggle('active', t === this._activeTab);
    }
    switch (this._activeTab) {
      case 'Story':    this._renderStory(ctx); break;
      case 'Comms':    this._renderComms(ctx); break;
      case 'Graffiti': this._renderGraffiti(ctx); break;
      case 'Figures':  this._renderFigures(ctx); break;
      case 'Ship':     this._renderShip(ctx); break;
    }
  },

  // The 8-beat spine. Beats up to the player's current beatIndex are readable; future beats show
  // only their title with a locked hint (no spoiler of the in-world voice).
  _renderStory(ctx) {
    const s = safeStory(ctx);
    const beat = s.beatIndex || 0;
    this._body.appendChild(el('div', 'sf-codex-section-h', 'The Eight Beats'));
    BEAT_CONTENT.forEach((content, i) => {
      const reached = i <= beat;
      const entry = el('div', 'sf-codex-entry sf-codex-beat' + (i === beat ? ' current' : ''));
      entry.appendChild(el('h3', null, BEAT_TITLES[i] || ('Beat ' + i)));
      entry.appendChild(el('div', 'sf-codex-meta', reached ? ('Phase ' + content.phase) : 'Locked'));
      if (reached) {
        entry.appendChild(el('div', 'sf-codex-body', content.hint));
      } else {
        entry.appendChild(el('div', 'sf-codex-body sf-codex-locked', '— not yet encountered —'));
      }
      this._body.appendChild(entry);
    });

    // Endgame: the 5 choices. Unlock only after the player has chosen (state.story.endgameChoice),
    // OR reached B7 (so they can see what's on offer). Before B7: locked entirely.
    this._body.appendChild(el('div', 'sf-codex-section-h', 'Endgame'));
    if (beat >= 7) {
      ENDGAME_CHOICES.forEach((c) => {
        const chosen = s.endgameChoice === c.id;
        const entry = el('div', 'sf-codex-entry');
        entry.appendChild(el('h3', null, (chosen ? '✓ ' : '') + 'Choice ' + c.id + ' — ' + c.title));
        entry.appendChild(el('div', 'sf-codex-meta', c.kind + (chosen ? ' · YOUR CHOICE' : '')));
        entry.appendChild(el('div', 'sf-codex-body', c.summary));
        if (c.hiddenCost) entry.appendChild(el('div', 'sf-codex-note', 'Hidden cost: ' + c.hiddenCost));
        this._body.appendChild(entry);
      });
    } else {
      this._body.appendChild(el('div', 'sf-codex-empty', 'The endgame has not revealed itself yet.'));
    }
  },

  // Comms catalog. COMMS is { ambient:[...], traps:[...], personal:[...], late:[...], story:[...] }
  // — category-keyed arrays. An entry is readable if it's in seenComms (fired once and stuck) OR
  // it's an ambient line from a beat the player has reached (ambient cycles in normal play, so a
  // reached-beat ambient line has effectively been seen). Author notes are included — they enrich a
  // re-read without spoiling future beats (a future-beat note references a beat the player hasn't
  // hit, but the entry itself is gated out, so the note never shows early).
  _renderComms(ctx) {
    const s = safeStory(ctx);
    const beat = s.beatIndex || 0;
    const seen = s.seenComms || {};

    // Cold start lines (B0 — always seen once a new game has begun).
    this._body.appendChild(el('div', 'sf-codex-section-h', 'Cold Start'));
    COLD_START.forEach((c) => {
      const entry = el('div', 'sf-codex-entry');
      entry.appendChild(el('h3', null, c.sender));
      entry.appendChild(el('div', 'sf-codex-meta', c.category));
      entry.appendChild(el('div', 'sf-codex-body', c.text));
      if (c.note) entry.appendChild(el('div', 'sf-codex-note', c.note));
      this._body.appendChild(entry);
    });

    // The full COMMS catalog, gated by seen-or-beat-reached. COMMS category keys → display labels.
    const cats = [
      ['Ambient', 'ambient'], ['Traps', 'traps'], ['Personal', 'personal'],
      ['Late Game', 'late'], ['Story', 'story'],
    ];
    for (const [label, key] of cats) {
      const entries = Array.isArray(COMMS[key]) ? COMMS[key] : [];
      if (!entries.length) continue;
      const visible = entries.filter((c) => {
        if (seen[c.id]) return true;
        // Ambient lines from a reached beat are fair game (they cycle in normal play); beat-gated
        // personal/late/story lines unlock at their beat even if the once-flag hasn't stuck yet.
        const b = c.beat != null ? c.beat : 0;
        return b <= beat;
      });
      this._body.appendChild(el('div', 'sf-codex-section-h', label + ' (' + visible.length + '/' + entries.length + ')'));
      if (!visible.length) {
        this._body.appendChild(el('div', 'sf-codex-empty', '— nothing encountered yet —'));
        continue;
      }
      for (const c of visible) {
        const entry = el('div', 'sf-codex-entry');
        entry.appendChild(el('h3', null, c.sender || c.id));
        entry.appendChild(el('div', 'sf-codex-meta', key.replace(/s$/, '')));
        entry.appendChild(el('div', 'sf-codex-body', c.text));
        if (c.note) entry.appendChild(el('div', 'sf-codex-note', c.note));
        this._body.appendChild(entry);
      }
    }
  },

  // Graffiti the player has seen (state.story.graffitiShown is keyed by where:line). Plus the
  // ever-present gang markings on the bulkhead (there from B0).
  _renderGraffiti(ctx) {
    const s = safeStory(ctx);
    const shown = s.graffitiShown || {};
    const beat = s.beatIndex || 0;

    this._body.appendChild(el('div', 'sf-codex-section-h', 'Bulkhead — The Previous Crew'));
    this._body.appendChild(el('div', 'sf-codex-entry', null)).appendChild(
      el('div', 'sf-codex-graffiti', GRAFFITI.GANG_DIDNT_MAKE_IT)
    );
    this._body.lastElementChild.appendChild(el('div', 'sf-codex-note',
      "The gang left their mark when they took the Tessera. It's still there. Never coming off."));

    this._body.appendChild(el('div', 'sf-codex-section-h', 'Encountered'));
    let any = false;
    for (const [key, _seen] of Object.entries(shown)) {
      // key is "where:line" — pull the line text after the first colon.
      const line = key.includes(':') ? key.slice(key.indexOf(':') + 1) : key;
      if (!line) continue;
      any = true;
      const where = key.includes(':') ? key.slice(0, key.indexOf(':')) : '?';
      const entry = el('div', 'sf-codex-entry');
      entry.appendChild(el('div', 'sf-codex-meta', where));
      entry.appendChild(el('div', 'sf-codex-graffiti', line));
      this._body.appendChild(entry);
    }
    if (!any) {
      this._body.appendChild(el('div', 'sf-codex-empty',
        beat > 0 ? 'No location graffiti encountered yet.' : '— nothing encountered yet —'));
    }
  },

  // Named figures. The protagonist + figures whose org/role is public lore are always shown; others
  // unlock when the player has reached the beat where they appear.
  _renderFigures(ctx) {
    const s = safeStory(ctx);
    const beat = s.beatIndex || 0;
    this._body.appendChild(el('div', 'sf-codex-section-h', 'Named Figures'));
    // Always-visible: protagonist + the cold-start figures (KAEL is met at B0).
    const always = ['protagonist', 'kessler', 'hale', 'slate', 'quinn', 'voss'];
    // Unlock by beat: Elroy at B2, Mira around B4, Rook B4, Vale B3+, Kurtz B6+.
    const gated = { elroy: 2, mira: 4, rook: 4, vale: 3, kurtz: 6 };
    const renderFig = (key) => {
      const f = FIGURES[key];
      if (!f) return;
      const entry = el('div', 'sf-codex-entry');
      entry.appendChild(el('h3', null, f.name + (key === 'kurtz' ? '' : '')));
      entry.appendChild(el('div', 'sf-codex-meta', [f.org, f.role].filter(Boolean).join(' · ')));
      this._body.appendChild(entry);
    };
    for (const k of always) renderFig(k);
    for (const [k, unlockBeat] of Object.entries(gated)) {
      if (beat >= unlockBeat) renderFig(k);
      else {
        const entry = el('div', 'sf-codex-entry sf-codex-locked');
        entry.appendChild(el('h3', null, '???'));
        entry.appendChild(el('div', 'sf-codex-meta', 'Not yet encountered'));
        this._body.appendChild(entry);
      }
    }
  },

  // The Tessera's sealed history + persistent cargo (the "personal effects" that travel with you).
  // Always visible — it's the player's own ship.
  _renderShip(ctx) {
    this._body.appendChild(el('div', 'sf-codex-section-h', 'The Tessera'));
    const entry = el('div', 'sf-codex-entry');
    entry.appendChild(el('h3', null, SHIP.name + ' / ' + SHIP.registration));
    const grid = el('div', 'sf-grid2');
    const rows = [
      ['Incident', SHIP.incident + ' (' + SHIP.incidentRef + ')'],
      ['Previous operator', SHIP.previousOperator],
      ['Crew status', SHIP.crewStatus],
      ['Impounded', SHIP.impoundMonths + ' months'],
      ['Acquired via', SHIP.friend.callsign + ' — ' + SHIP.friend.debt],
    ];
    for (const [k, v] of rows) {
      grid.appendChild(el('div', 'k', k));
      grid.appendChild(el('div', 'v', v));
    }
    entry.appendChild(grid);
    this._body.appendChild(entry);

    this._body.appendChild(el('div', 'sf-codex-section-h', 'Reference Codes'));
    const refs = el('div', 'sf-codex-entry');
    refs.appendChild(el('div', 'sf-codex-body',
      REFS.CONTRACT_47A + ' — your first contract. Payment withheld forever.\n' +
      REFS.REF_44C + ' — the administrative code that governs everything inconvenient.'));
    this._body.appendChild(refs);

    this._body.appendChild(el('div', 'sf-codex-section-h', 'Personal Effects'));
    PERSISTENT_CARGO.forEach((p) => {
      const entry = el('div', 'sf-codex-entry');
      entry.appendChild(el('h3', null, p.name));
      entry.appendChild(el('div', 'sf-codex-meta', p.mass + ' t · unsellable'));
      entry.appendChild(el('div', 'sf-codex-note', p.note));
      this._body.appendChild(entry);
    });
  },
};
