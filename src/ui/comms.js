// src/ui/comms.js — the narrative overlay layer.
//
// Three always-on surfaces driven by events the story system (src/systems/story.js) emits:
//
//   1. COMMS LOG  — listens to `comms:popup`. A left-edge feed of channel noise. Most lines are
//                   ambient (not for the player). The ones that ARE for the player don't name them.
//                   Mirrors the alerts.js pattern (queue, raise, fade). Closable entries; a 'C' key
//                   opens a scrollable backlog so the player can re-read what they missed.
//   2. GRAFFITI   — listens to `graffiti:show{ line, where }`. 'bulkhead' = a line that appears on
//                   the player's own HUD (their ship's interior). airlock/shipyard/etc. = lines the
//                   station hub surfaces (rendered there via a DOM hook the hub queries).
//   3. ENDGAME    — listens to `endgame:offer` / `endgame:promptChoiceC`. A modal that presents the
//                   five choices (A–E). Emits `ui:endgameChoose{ choice }`.
//
// Pure DOM + event listeners. Reads ctx.state only for the backlog; never mutates sim state (§0.6).
// CSS is injected once (injectCommsCss) so this module is self-contained.

const COMMS_STYLE_ID = 'sf-comms-style';

// category → accent color + label prefix. Most are NOT addressed to the player.
const CATEGORY_STYLE = {
  ambient:  { color: 'var(--ink-mute)',  tag: 'CHN',  glow: 'none' },
  trap:     { color: 'var(--warn)',      tag: 'ALERT', glow: '0 0 8px rgba(255,179,71,.4)' },
  personal: { color: 'var(--accent-3)',  tag: 'MSG',  glow: '0 0 8px rgba(192,139,255,.4)' },
  late:     { color: 'var(--danger)',    tag: 'LOG',  glow: '0 0 8px rgba(255,84,112,.4)' },
  story:    { color: 'var(--accent)',    tag: 'LOG',  glow: '0 0 10px rgba(57,208,255,.5)' },
};

const MAX_LIVE = 4;          // max simultaneous live comms entries on the feed
const MAX_BACKLOG = 80;      // retained history for the 'C' backlog view

export function branchLifecycleCommsPayload(payload) {
  const lifecycle = payload && payload.lifecycle && typeof payload.lifecycle === 'object' ? payload.lifecycle : {};
  const complete = cleanLifecycleText(lifecycle.complete || (payload && payload.summary));
  const aftermath = cleanLifecycleText(lifecycle.aftermath);
  if (!complete && !aftermath) return null;
  return {
    sender: 'CONTRACT 47-A',
    category: 'story',
    text: complete || aftermath,
    note: aftermath && aftermath !== complete ? aftermath : null,
    persist: true,
  };
}

export function createComms(ctx) {
  const { bus, state } = ctx;
  injectCommsCss();

  // ── 1. Comms feed (left edge) ────────────────────────────────────────────────────────────
  const feed = document.createElement('div');
  feed.id = 'sf-comms';
  feed.setAttribute('aria-live', 'polite');
  feed.setAttribute('aria-label', 'Comms channel');
  document.getElementById('ui-root').appendChild(feed);
  const live = [];        // { el, rec, born, ttl, persist }
  const backlog = [];     // full history for the backlog view

  function pushComms(p) {
    if (!p || !p.text) return;
    const cat = CATEGORY_STYLE[p.category] || CATEGORY_STYLE.ambient;
    const entry = document.createElement('div');
    entry.className = `sf-comm sf-comm--${p.category || 'ambient'}`;
    entry.style.setProperty('--comm-color', cat.color);
    entry.style.setProperty('--comm-glow', cat.glow);

    const head = document.createElement('div');
    head.className = 'sf-comm__head';
    const tag = document.createElement('span');
    tag.className = 'sf-comm__tag mono';
    tag.textContent = cat.tag;
    const sender = document.createElement('span');
    sender.className = 'sf-comm__sender mono';
    sender.textContent = p.sender || 'UNKNOWN';
    head.append(tag, sender);

    const body = document.createElement('div');
    body.className = 'sf-comm__body';
    body.textContent = p.text;

    entry.append(head, body);
    // dismiss on click (the player learns to clear the migraine)
    entry.addEventListener('click', () => dismissLive(rec));
    feed.prepend(entry);

    const rec = {
      el: entry,
      sender: p.sender || 'UNKNOWN', text: p.text, category: p.category || 'ambient',
      note: p.note || null, born: performance.now(),
      ttl: p.persist ? Infinity : normalizeTtlMs(p.ttl), persist: !!p.persist,
    };
    live.unshift(rec);
    backlog.unshift({ sender: rec.sender, text: rec.text, category: rec.category, note: rec.note, at: Date.now() });
    while (backlog.length > MAX_BACKLOG) backlog.pop();

    requestAnimationFrame(() => entry.classList.add('sf-comm--in'));
    while (live.length > MAX_LIVE) dismissLive(live[live.length - 1]);
    // pulse the backlog button when new content arrives while it's closed
    if (!backlogOpen) backlogBtn.classList.add('sf-comm-backlog-btn--pulse');
  }

  function dismissLive(rec) {
    if (!rec) return;
    const i = live.indexOf(rec);
    if (i >= 0) live.splice(i, 1);
    rec.el.classList.remove('sf-comm--in');
    rec.el.classList.add('sf-comm--out');
    setTimeout(() => { if (rec.el.parentNode) rec.el.parentNode.removeChild(rec.el); }, 220);
  }

  // per-frame fade sweep (called from tick())
  function sweep() {
    if (!live.length) return;
    const now = performance.now();
    for (let i = live.length - 1; i >= 0; i--) {
      const rec = live[i];
      if (rec.persist) continue;
      const age = now - rec.born;
      if (age > rec.ttl) { dismissLive(rec); continue; }
      const left = rec.ttl - age;
      if (left < 400) rec.el.style.opacity = String(Math.max(0, left / 400));
    }
  }

  bus.on('comms:popup', pushComms);
  bus.on('scenario:branchResolved', (payload) => {
    const comms = branchLifecycleCommsPayload(payload || {});
    if (comms) pushComms(comms);
  });

  // ── 2. Backlog view (toggle with 'C') ────────────────────────────────────────────────────
  const backlogBtn = document.createElement('button');
  backlogBtn.className = 'sf-comm-backlog-btn';
  backlogBtn.id = 'sf-comm-backlog-btn';
  backlogBtn.title = 'Comms log (C)';
  backlogBtn.setAttribute('aria-label', 'Open comms log');
  backlogBtn.textContent = '\u2261';  // trigram — "the channel"
  document.getElementById('ui-root').appendChild(backlogBtn);

  const backlogView = document.createElement('div');
  backlogView.className = 'sf-comm-backlog';
  backlogView.id = 'sf-comm-backlog';
  backlogView.innerHTML =
    '<div class="sf-comm-backlog__head"><span class="sf-comm-backlog__title">COMMS LOG</span>' +
    '<button class="sf-comm-backlog__close">ESC</button></div>' +
    '<div class="sf-comm-backlog__hint">Most of these are not for you. The ones that are don\u2019t name you.</div>' +
    '<div class="sf-comm-backlog__list"></div>';
  document.getElementById('ui-root').appendChild(backlogView);
  const backlogList = backlogView.querySelector('.sf-comm-backlog__list');

  let backlogOpen = false;
  function openBacklog() {
    backlogOpen = true;
    backlogBtn.classList.remove('sf-comm-backlog-btn--pulse');
    rebuildBacklog();
    backlogView.classList.add('open');
    backlogView.setAttribute('aria-hidden', 'false');
  }
  function closeBacklog() {
    backlogOpen = false;
    backlogView.classList.remove('open');
    backlogView.setAttribute('aria-hidden', 'true');
  }
  function toggleBacklog() { backlogOpen ? closeBacklog() : openBacklog(); }

  function rebuildBacklog() {
    backlogList.innerHTML = '';
    if (!backlog.length) {
      backlogList.innerHTML = '<div class="sf-comm-backlog__empty">Channel is quiet. For now.</div>';
      return;
    }
    const frag = document.createDocumentFragment();
    for (const e of backlog) {
      const cat = CATEGORY_STYLE[e.category] || CATEGORY_STYLE.ambient;
      const row = document.createElement('div');
      row.className = `sf-comm-backlog__row sf-comm-backlog__row--${e.category}`;
      row.style.setProperty('--comm-color', cat.color);
      row.innerHTML =
        `<span class="sf-comm-backlog__sender mono">${escapeHtml(e.sender)}</span>` +
        `<span class="sf-comm-backlog__text">${escapeHtml(e.text)}</span>`;
      if (e.note) {
        const note = document.createElement('div');
        note.className = 'sf-comm-backlog__note';
        note.textContent = e.note;
        row.appendChild(note);
      }
      frag.appendChild(row);
    }
    backlogList.appendChild(frag);
  }

  backlogBtn.addEventListener('click', toggleBacklog);
  backlogView.querySelector('.sf-comm-backlog__close').addEventListener('click', closeBacklog);
  // route the 'C' key + close-on-ESC through the UI input bus
  bus.on('ui:toggleComms', toggleBacklog);
  bus.on('ui:closeComms', closeBacklog);

  // ── 3. Bulkhead graffiti (player's own ship interior — shown on the HUD) ─────────────────
  // Appended to #ui-root (NOT #hud): createHud() does `root.innerHTML = ''` on #hud which would
  // wipe anything appended there before it runs. ui-root is stable. The bulkhead is a full-overlay
  // narrative element positioned over the ship interior, not a HUD gauge, so ui-root is the right parent.
  const bulkhead = document.createElement('div');
  bulkhead.className = 'sf-bulkhead';
  bulkhead.id = 'sf-bulkhead';
  bulkhead.setAttribute('aria-hidden', 'true');
  bulkhead.innerHTML = '<div class="sf-bulkhead__line"></div>';
  document.getElementById('ui-root').appendChild(bulkhead);
  const bulkheadLine = bulkhead.querySelector('.sf-bulkhead__line');
  let bulkheadHideT = 0;

  bus.on('graffiti:show', (p) => {
    if (!p || !p.line) return;
    if (p.where === 'bulkhead') {
      // bulkhead graffiti is persistent (it's on the player's ship); it stays until replaced.
      bulkheadLine.textContent = p.line;
      bulkhead.classList.add('sf-bulkhead--visible');
      bulkhead.setAttribute('aria-label', 'Bulkhead graffiti: ' + p.line);
      bulkheadHideT = 0; // never auto-hide; the player lives with it
    } else {
      // airlock/shipyard/clearing/chain_dest: surfaced at the dock hub. We stash the latest on
      // state so the station hub can read it (it mounts after dock). Also briefly flash it as a
      // toast-style graffiti readout so the player sees it even mid-flight (e.g. on a docked hub).
      stashAirlockGraffiti(p);
    }
  });

  function stashAirlockGraffiti(p) {
    if (!state.ui) state.ui = {};
    if (!state.ui.graffiti) state.ui.graffiti = [];
    // dedupe by line+where within the current stash
    const key = p.where + ':' + p.line;
    if (state.ui.graffiti.some((g) => (g.where + ':' + g.line) === key)) return;
    state.ui.graffiti.push({ line: p.line, where: p.where, beat: p.beat, author: p.author });
    // keep the stash short
    while (state.ui.graffiti.length > 8) state.ui.graffiti.shift();
  }

  // expose a reader for the station hub (it imports nothing from here; it reads state.ui.graffiti)

  // ── 4. Endgame choice modal ──────────────────────────────────────────────────────────────
  const endgameModal = document.createElement('div');
  endgameModal.className = 'sf-endgame';
  endgameModal.id = 'sf-endgame';
  endgameModal.setAttribute('role', 'dialog');
  endgameModal.setAttribute('aria-modal', 'true');
  endgameModal.setAttribute('aria-labelledby', 'sf-endgame-title');
  endgameModal.innerHTML =
    '<div class="sf-endgame__panel">' +
      '<div class="sf-endgame__head"><h2 id="sf-endgame-title" class="sf-endgame__title">CONTRACT 47-A \u2014 FINAL DISPOSITION</h2>' +
      '<div class="sf-endgame__sub">One contract. One disposition. The others expire the moment you choose.</div></div>' +
      '<div class="sf-endgame__choices"></div>' +
      '<div class="sf-endgame__footer">None of these is the good ending. The game ends the way it began.</div>' +
    '</div>';
  document.getElementById('ui-root').appendChild(endgameModal);
  const endgameChoicesEl = endgameModal.querySelector('.sf-endgame__choices');

  function presentEndgame({ choices }) {
    if (!choices || !choices.length) return;
    endgameChoicesEl.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (const c of choices) {
      const card = document.createElement('div');
      card.className = `sf-endgame__choice sf-endgame__choice--${c.id}`;
      const reqNote = c.requires ? '' : '';
      card.innerHTML =
        `<div class="sf-endgame__choice-head"><span class="sf-endgame__choice-id mono">${c.id}</span>` +
        `<span class="sf-endgame__choice-title">${escapeHtml(c.title)}</span></div>` +
        `<div class="sf-endgame__choice-board mono">${c.boardText ? escapeHtml(c.boardText) : '<span class="sf-endgame__choice-noboard">(no board entry \u2014 this one is not a contract)</span>'}</div>` +
        `<div class="sf-endgame__choice-summary">${escapeHtml(c.summary)}</div>` +
        `<div class="sf-endgame__choice-cost">${escapeHtml(c.hiddenCost)}</div>` +
        `<div class="sf-endgame__choice-actions"><button class="sf-endgame__accept" data-choice="${c.id}">ACCEPT</button></div>`;
      frag.appendChild(card);
    }
    endgameChoicesEl.appendChild(frag);
    endgameModal.classList.add('open');
    endgameModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('ui-modal-open');
  }

  endgameChoicesEl.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.sf-endgame__accept');
    if (!btn) return;
    const choice = btn.dataset.choice;
    if (!choice) return;
    bus.emit('ui:endgameChoose', { choice });
    closeEndgame();
  });

  function closeEndgame() {
    endgameModal.classList.remove('open');
    endgameModal.setAttribute('aria-hidden', 'true');
    // only release the modal-open lock if no screen is up
    if (!(ctx.screenManager && ctx.screenManager.isOpen && ctx.screenManager.isOpen())) {
      document.body.classList.remove('ui-modal-open');
    }
  }

  bus.on('endgame:offer', presentEndgame);
  // Choice C is a separate Yes/No prompt (not the 5-card modal) — present it inline.
  bus.on('endgame:promptChoiceC', ({ promptText }) => {
    const wrap = document.createElement('div');
    wrap.className = 'sf-endgame sf-endgame--c';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.innerHTML =
      '<div class="sf-endgame__panel sf-endgame__panel--c">' +
      '<div class="sf-endgame__c-prompt">' + escapeHtml(promptText || 'JUMP WITHOUT DESTINATION?') + '</div>' +
      '<div class="sf-endgame__c-hint">The wormhole is not an exit. It is the system telling you that you are already in the only place you were ever going to be.</div>' +
      '<div class="sf-endgame__c-actions"><button class="sf-endgame__c-yes">YES</button><button class="sf-endgame__c-no">NO</button></div>' +
      '</div>';
    document.getElementById('ui-root').appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add('open'));
    const cleanup = () => { wrap.classList.remove('open'); setTimeout(() => wrap.remove(), 220); };
    wrap.querySelector('.sf-endgame__c-yes').addEventListener('click', () => { bus.emit('ui:endgameChoose', { choice: 'C' }); cleanup(); });
    wrap.querySelector('.sf-endgame__c-no').addEventListener('click', () => {
      // declining C records it for Choice E eligibility
      const s = state.story || (state.story = {});
      if (!Array.isArray(s.endgameDeclined)) s.endgameDeclined = [];
      if (!s.endgameDeclined.includes('C')) s.endgameDeclined.push('C');
      bus.emit('jump:chargeAbort', { reason: 'choice_c_declined' });
      cleanup();
    });
  });

  // ── tick: fade sweep (called by uiRoot.frame via the returned api) ────────────────────────
  function tick() {
    sweep();
  }

  // hide comms surfaces when not in flight (menu/dock keeps the backlog accessible)
  function setFlightVisibility(visible) {
    feed.style.display = visible ? 'flex' : 'none';
    bulkhead.style.display = visible ? 'block' : 'none';
    if (!visible) closeBacklog();
  }
  bus.on('mode:changed', () => {
    const flight = state.mode === 'flight' && !(state.ui && state.ui.docked);
    setFlightVisibility(flight);
  });
  // initial
  setTimeout(() => {
    const flight = state.mode === 'flight' && !(state.ui && state.ui.docked);
    setFlightVisibility(flight);
  }, 60);

  return { tick, pushComms, openBacklog, closeBacklog };
}

function normalizeTtlMs(ttl) {
  const n = Number(ttl);
  if (!Number.isFinite(n) || n <= 0) return 7000;
  return n > 60 ? n : n * 1000;
}

function cleanLifecycleText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── CSS (injected once; matches the HUD's industrial cyan/purple language) ──────────────────
function injectCommsCss() {
  if (document.getElementById(COMMS_STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = COMMS_STYLE_ID;
  s.textContent = `
  /* ===== comms feed (left edge) ===== */
  #sf-comms { position:absolute; left:16px; top:96px; bottom:120px; width:300px; display:flex;
    flex-direction:column-reverse; gap:8px; pointer-events:none; z-index:1050; overflow:hidden; }
  #sf-comms .sf-comm { pointer-events:auto; }
  body.ui-modal-open #sf-comms { opacity:.25; }
  .sf-comm { --comm-color:var(--ink-dim); --comm-glow:none; position:relative; padding:8px 11px;
    background:rgba(8,14,24,.78); border:1px solid var(--panel-edge); border-left:2px solid var(--comm-color);
    border-radius:5px; color:var(--ink); font-size:12px; box-shadow:0 3px 14px rgba(0,0,0,.45);
    cursor:pointer; transform:translateX(-130%); opacity:0; transition:transform .18s ease, opacity .18s ease;
    backdrop-filter:blur(3px); }
  .sf-comm--in { transform:translateX(0); opacity:1; }
  .sf-comm--out { transform:translateX(-130%); opacity:0; }
  .sf-comm__head { display:flex; align-items:baseline; gap:7px; margin-bottom:3px; }
  .sf-comm__tag { font-size:9px; letter-spacing:.14em; color:var(--comm-color); text-shadow:var(--comm-glow); }
  .sf-comm__sender { font-size:9px; letter-spacing:.06em; color:var(--ink-mute); text-transform:uppercase;
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .sf-comm__body { line-height:1.4; color:var(--ink); }
  .sf-comm--personal .sf-comm__body, .sf-comm--late .sf-comm__body, .sf-comm--story .sf-comm__body { color:#eaf4ff; }

  /* comms backlog button + view */
  .sf-comm-backlog-btn { position:absolute; left:16px; top:54px; width:34px; height:34px; z-index:1060;
    background:rgba(8,14,24,.7); border:1px solid var(--panel-edge); border-radius:6px; color:var(--ink-dim);
    font-family:var(--mono); font-size:18px; cursor:pointer; pointer-events:auto; transition:color .12s, border-color .12s;
    backdrop-filter:blur(3px); }
  .sf-comm-backlog-btn:hover { border-color:var(--accent); color:var(--accent); }
  .sf-comm-backlog-btn--pulse { color:var(--accent-3); border-color:var(--accent-3);
    animation:sf-commpulse 1.3s ease-in-out infinite alternate; }
  @keyframes sf-commpulse { from { box-shadow:0 0 0 0 rgba(192,139,255,0); } to { box-shadow:0 0 10px 1px rgba(192,139,255,.5); } }
  .sf-comm-backlog { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%) scale(.97);
    width:min(620px, 92vw); max-height:78vh; display:none; flex-direction:column; z-index:2400;
    background:rgba(4,9,18,.96); border:1px solid var(--accent); border-radius:9px; box-shadow:0 10px 50px rgba(0,0,0,.7);
    backdrop-filter:blur(10px); pointer-events:auto; opacity:0; transition:opacity .18s ease, transform .18s ease; }
  .sf-comm-backlog.open { display:flex; opacity:1; transform:translate(-50%,-50%) scale(1); }
  .sf-comm-backlog__head { display:flex; align-items:center; justify-content:space-between; padding:12px 16px;
    border-bottom:1px solid var(--panel-edge); }
  .sf-comm-backlog__title { font-family:var(--mono); font-size:13px; letter-spacing:.18em; color:var(--accent); text-transform:uppercase; }
  .sf-comm-backlog__close { background:none; border:1px solid var(--ink-mute); border-radius:4px; color:var(--ink-dim);
    font-size:10px; padding:2px 9px; cursor:pointer; font-family:var(--mono); }
  .sf-comm-backlog__close:hover { border-color:var(--accent); color:var(--accent); }
  .sf-comm-backlog__hint { padding:7px 16px; font-size:11px; color:var(--ink-mute); font-style:italic;
    border-bottom:1px solid rgba(57,208,255,.07); }
  .sf-comm-backlog__list { overflow-y:auto; padding:4px 0; }
  .sf-comm-backlog__list::-webkit-scrollbar { width:5px; }
  .sf-comm-backlog__list::-webkit-scrollbar-thumb { background:var(--accent); border-radius:3px; }
  .sf-comm-backlog__row { --comm-color:var(--ink-dim); padding:8px 16px; border-bottom:1px solid rgba(57,208,255,.05);
    display:flex; flex-direction:column; gap:2px; }
  .sf-comm-backlog__row:hover { background:rgba(57,208,255,.04); }
  .sf-comm-backlog__sender { font-size:9px; letter-spacing:.08em; color:var(--comm-color); text-transform:uppercase; }
  .sf-comm-backlog__text { font-size:12px; color:var(--ink); line-height:1.4; }
  .sf-comm-backlog__note { margin-top:4px; font-size:10.5px; color:var(--ink-mute); font-style:italic; line-height:1.4;
    border-left:2px solid var(--comm-color); padding-left:8px; }
  .sf-comm-backlog__empty { padding:30px 16px; text-align:center; color:var(--ink-mute); font-style:italic; }

  /* ===== bulkhead graffiti (player's own ship) ===== */
  .sf-bulkhead { position:absolute; left:50%; bottom:30%; transform:translateX(-50%); z-index:9;
    pointer-events:none; opacity:0; transition:opacity 1.2s ease; max-width:60vw; text-align:center; }
  .sf-bulkhead--visible { opacity:.55; }
  .sf-bulkhead__line { font-family:var(--mono); font-size:clamp(14px, 2.4vw, 22px); letter-spacing:.18em;
    color:#b9c4d6; text-transform:uppercase; text-shadow:0 0 18px rgba(0,0,0,.9), 0 2px 3px #000;
    transform:rotate(-1.5deg); }
  @media (max-width: 760px) { .sf-bulkhead { bottom:38%; } .sf-bulkhead__line { font-size:13px; letter-spacing:.1em; }
    #sf-comms { width:220px; top:88px; bottom:140px; } .sf-comm { font-size:11px; padding:6px 9px; } }

  /* ===== endgame choice modal ===== */
  .sf-endgame { position:fixed; inset:0; z-index:2600; display:none; align-items:center; justify-content:center;
    background:rgba(3,5,10,.94); backdrop-filter:blur(8px); opacity:0; transition:opacity .3s ease; }
  .sf-endgame.open { display:flex; opacity:1; }
  .sf-endgame__panel { width:min(880px, 94vw); max-height:90vh; overflow-y:auto; padding:24px 28px;
    background:linear-gradient(180deg, var(--panel-2), var(--panel)); border:1px solid var(--accent); border-radius:10px;
    box-shadow:0 0 60px rgba(57,208,255,.15), 0 20px 60px rgba(0,0,0,.6); }
  .sf-endgame__head { text-align:center; margin-bottom:18px; }
  .sf-endgame__title { margin:0; font-family:var(--mono); font-size:18px; letter-spacing:.2em; color:var(--accent);
    text-transform:uppercase; text-shadow:0 0 14px rgba(57,208,255,.4); }
  .sf-endgame__sub { margin-top:6px; font-size:12px; color:var(--ink-mute); font-style:italic; }
  .sf-endgame__choices { display:flex; flex-direction:column; gap:14px; }
  .sf-endgame__choice { padding:14px 16px; background:rgba(4,9,18,.6); border:1px solid var(--panel-edge); border-radius:7px;
    transition:border-color .15s, background .15s; }
  .sf-endgame__choice:hover { border-color:var(--accent-3); background:rgba(192,139,255,.05); }
  .sf-endgame__choice-head { display:flex; align-items:baseline; gap:10px; margin-bottom:6px; }
  .sf-endgame__choice-id { font-size:20px; color:var(--accent-3); letter-spacing:.1em; }
  .sf-endgame__choice-title { font-size:15px; color:var(--ink); letter-spacing:.04em; }
  .sf-endgame__choice-board { font-size:11px; color:var(--accent); margin-bottom:6px; }
  .sf-endgame__choice-noboard { color:var(--ink-mute); font-style:italic; }
  .sf-endgame__choice-summary { font-size:12.5px; color:var(--ink); line-height:1.5; margin-bottom:6px; }
  .sf-endgame__choice-cost { font-size:11px; color:var(--ink-mute); font-style:italic; line-height:1.5;
    border-left:2px solid var(--danger); padding-left:9px; }
  .sf-endgame__choice-actions { margin-top:10px; display:flex; justify-content:flex-end; }
  .sf-endgame__accept { background:rgba(192,139,255,.12); border:1px solid var(--accent-3); color:var(--accent-3);
    font-family:var(--mono); font-size:11px; letter-spacing:.16em; padding:6px 18px; border-radius:5px; cursor:pointer; }
  .sf-endgame__accept:hover { background:rgba(192,139,255,.25); color:#fff; }
  .sf-endgame__footer { margin-top:18px; text-align:center; font-size:11px; color:var(--ink-mute); font-style:italic; }
  /* Choice C inline prompt */
  .sf-endgame--c .sf-endgame__panel--c { width:min(480px, 90vw); padding:28px; text-align:center; }
  .sf-endgame__c-prompt { font-family:var(--mono); font-size:18px; letter-spacing:.12em; color:var(--danger);
    text-transform:uppercase; margin-bottom:12px; text-shadow:0 0 14px rgba(255,84,112,.4); }
  .sf-endgame__c-hint { font-size:12px; color:var(--ink-mute); font-style:italic; line-height:1.5; margin-bottom:18px; }
  .sf-endgame__c-actions { display:flex; gap:14px; justify-content:center; }
  .sf-endgame__c-yes { background:rgba(255,84,112,.15); border:1px solid var(--danger); color:var(--danger);
    font-family:var(--mono); letter-spacing:.16em; padding:8px 24px; border-radius:5px; cursor:pointer; }
  .sf-endgame__c-no { background:rgba(84,160,200,.12); border:1px solid var(--panel-edge-2); color:var(--ink-dim);
    font-family:var(--mono); letter-spacing:.16em; padding:8px 24px; border-radius:5px; cursor:pointer; }
  .sf-endgame__c-yes:hover { background:rgba(255,84,112,.3); color:#fff; }
  .sf-endgame__c-no:hover { border-color:var(--accent); color:var(--accent); }
  `;
  document.head.appendChild(s);
}
