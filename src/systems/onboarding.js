// Onboarding / objective system. Gives a brand-new pilot a premise and a staged "learn the ropes"
// chain so the game makes sense instead of dropping them into space with no explanation. Entirely
// optional and non-blocking: it never freezes the sim, never steals movement, and respects
// state.settings.gameplay.tutorialHints. Self-contained — it builds its own DOM (an objective
// tracker panel + a dismissible intro card) and drives progress off real gameplay events.
//
// CONTEXTUAL FIRST-TIME HINTS (Phase 2): on top of the staged tutorial, the system fires one-shot
// toast hints the first time the player encounters a new mechanic (combat, shield break, stations,
// gates, cargo full). Tracked in state.player.hints so they persist across saves and never repeat.
// These are independent of the tutorial chain — they fire even if the tutorial was skipped.
//
// CONTEXTUAL CONTROL BAR (Phase 2): the static bottom-center hint strip is updated each frame to
// show controls relevant to the player's current activity (mining, combat, near station, open flight).
//
// System contract: { name, init(ctx), update(dt, state) }. Wired into registry SYSTEMS + UPDATE_ORDER.

const PANEL_ID = 'sf-onboarding';
const STYLE_ID = 'sf-onboarding-style';

// Objective chain. The first-session contract is intentionally concrete:
// fly to the nearby claim -> mine cargo -> dock -> sell -> choose the next risk.
// Steps may complete out of order; the panel always shows the first incomplete one.
const STEPS = [
  { key: 'claim', title: 'Reach the starter claim', target: 'asteroid', range: 420,
    hint: 'Follow the yellow nav arrow to the nearby gray asteroid cluster. W / Up thrusts, A D / arrows steer, and the mouse aims.' },
  { key: 'mine', title: 'Mine and collect 3 units of ore', target: 'asteroid', qty: 3,
    hint: 'Point the reticle at a gray rock and hold Right Mouse Button. Fly through the yellow ore gems if they drift away; your CARGO readout should climb.' },
  { key: 'dock', title: 'Dock at Helios Station', target: 'station',
    hint: 'Follow the cyan station arrow. When the dock prompt appears, press Enter. Donut rings are jump gates for later, not shops.' },
  { key: 'sell', title: 'Sell your ore in the Market',
    hint: 'In the Market tab, sell the ore you mined. That closes the basic loop: rocks become credits, credits become better ships and tools.' },
  { key: 'next', title: 'Choose the next risk',
    hint: 'Use the station Missions tab for a contract, or browse Shipyard/Outfitting for an upgrade goal. Leave when you know what you want next.' },
];

const ORE_PREFIXES = [
  'cmdty_ore', 'cmdty_silicate', 'cmdty_ice', 'cmdty_volatiles',
  'cmdty_crystal', 'cmdty_gas', 'cmdty_scrap', 'cmdty_salvage',
];

export const onboarding = {
  name: 'onboarding',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this._panel = null;
    this._intro = null;
    this._accum = 0;
    this._fadeT = 0;

    const bus = this.bus;
    // Start only for a fresh game. Loaded saves emit save:loaded (no tutorial for a returning pilot).
    bus.on('game:started', () => this._begin());
    bus.on('save:loaded', () => this._teardown());

    // Objective completion hooks (real events verified against the systems).
    bus.on('dock:docked', () => this._complete('dock'));
    bus.on('economy:tradeCompleted', (p) => {
      if (p && p.side === 'sell' && this._isOre(p.commodityId)) {
        this._complete('mine'); // selling ore also implies you mined
        this._complete('sell');
      }
    });
    bus.on('mining:start', () => this._complete('claim'));
    bus.on('pickup:collected', (p) => this._recordOreCollected(p || {}));
    bus.on('mission:accepted', () => this._complete('next'));
    bus.on('ship:purchased', () => this._complete('next'));

    // ── Contextual first-time hints (fire once per hint, persist across saves) ───────────────
    // These are independent of the tutorial chain: they fire for all players whose
    // settings.gameplay.tutorialHints is not explicitly false, including players who
    // skipped the staged tutorial.

    // First enemy encounter: triggered when the player first takes damage from a hostile.
    bus.on('combat:damage', (p) => {
      if (!p || !p.isPlayer) return;
      this._showHint('firstCombat',
        'Hostile detected! LMB or SPACE to fire. Hold aim on a target to lock on. F toggles auto-fire.');
    });

    // First shield break: triggered when shields drop to zero.
    bus.on('combat:damage', (p) => {
      if (!p || !p.isPlayer || !p.brokeShield) return;
      this._showHint('firstShieldDrop',
        'Shields down! Disengage and stay clear of fire — shields recharge automatically after a few seconds.');
    });

    // First station approach: enriches the existing dock prompt with what stations offer.
    bus.on('dock:range', ({ inRange }) => {
      if (!inRange) return;
      this._showHint('firstStation',
        'Stations offer repairs, trading, upgrades, and mission boards. Press ENTER to dock.');
    });

    // First jump gate approach: teach the player how gates work.
    bus.on('gate:range', ({ inRange }) => {
      if (!inRange) return;
      this._showHint('firstGate',
        'Jump gates connect star systems. Open the Star Map (M) to plot a jump route.');
    });

    // First cargo full: teach the player to sell.
    bus.on('cargo:full', () => {
      this._showHint('firstCargoFull',
        'Cargo hold full! Dock at a station to sell your ore and free up space.');
    });

    // First flight: triggered a few seconds after the game starts (handled in update via a timer).
    this._firstFlightTimer = 0;
    this._firstFlightPending = false;
    bus.on('game:started', () => { this._firstFlightPending = true; this._firstFlightTimer = 0; });

    // ── Contextual control bar state ─────────────────────────────────────────────────────────
    this._lastControlMode = null;
  },

  // Show a one-time contextual hint via the toast system. The hint key corresponds to a flag in
  // state.player.hints. If the flag is already true (hint was shown before, even in a prior save),
  // this is a no-op. Respects the tutorialHints setting.
  _showHint(key, text) {
    const st = this.state;
    if (st.settings && st.settings.gameplay && st.settings.gameplay.tutorialHints === false) return;
    if (!st.player.hints) st.player.hints = {};
    if (st.player.hints[key]) return;
    st.player.hints[key] = true;
    this.bus.emit('toast', { text, kind: 'info', ttl: 7 });
  },

  _isOre(id) { return !!id && ORE_PREFIXES.some((p) => String(id).startsWith(p)); },

  _begin() {
    const st = this.state;
    const hintsOn = !st.settings || !st.settings.gameplay || st.settings.gameplay.tutorialHints !== false;
    st.onboarding = { active: hintsOn, stepIndex: 0, done: {}, finished: false, minedUnits: 0 };
    if (!hintsOn) return;             // player opted out — stay silent, no panel
    this._injectStyle();
    this._buildPanel();
    this._showIntro();
    this._refresh();
    this._setObjectiveWaypoint(true);
  },

  _teardown() {
    const ob = this.state.onboarding; if (ob) ob.active = false;
    if (this._panel) { this._panel.remove(); this._panel = null; }
    if (this._intro) { this._intro.remove(); this._intro = null; }
    this._clearObjectiveWaypoint();
  },

  _complete(key) {
    const ob = this.state.onboarding;
    if (!ob || !ob.active || ob.finished) return;
    if (ob.done[key]) return;
    const shown = this._currentStep();
    ob.done[key] = true;
    // toast only when it was the objective currently being shown
    if (shown && shown.key === key) {
      this.bus.emit('toast', { text: '✓ Objective complete: ' + shown.title, kind: 'good', ttl: 3.5 });
    }
    if (STEPS.every((s) => ob.done[s.key])) this._finish();
    else {
      this._refresh();
      this._setObjectiveWaypoint(true);
    }
  },

  _recordOreCollected(p) {
    const ob = this.state.onboarding;
    if (!ob || !ob.active || ob.finished || !this._isOre(p.commodityId)) return;
    if (p.collectorId != null && p.collectorId !== this.state.playerId) return;
    ob.minedUnits = (ob.minedUnits || 0) + Math.max(1, p.qty || p.amount || 1);
    this._complete('claim');
    const mineStep = STEPS.find((s) => s.key === 'mine');
    if (ob.minedUnits >= ((mineStep && mineStep.qty) || 3)) this._complete('mine');
    else this._refresh();
  },

  _currentStep() {
    const ob = this.state.onboarding; if (!ob) return null;
    return STEPS.find((s) => !ob.done[s.key]) || null;
  },

  _finish() {
    const ob = this.state.onboarding; if (!ob) return;
    ob.finished = true;
    this.bus.emit('toast', { text: 'Tutorial complete — the galaxy is yours, pilot.', kind: 'good', ttl: 5 });
    this._clearObjectiveWaypoint();
    if (this._panel) {
      const body = this._panel.querySelector('.sf-ob-body');
      if (body) body.innerHTML = '<div class="sf-ob-title">You’re ready, pilot.</div><div class="sf-ob-hint">Mine, trade, fight, and grow your fleet. Press H for help anytime.</div>';
      this._fadeT = 6; // seconds until the panel fades out (handled in update)
    }
  },

  // per-frame: proximity check for the starter claim + panel fade-out + contextual hints + control bar.
  update(dt, state) {
    // ── First-flight hint (runs independently of the tutorial chain) ──────────────────────
    if (this._firstFlightPending && state.mode === 'flight') {
      this._firstFlightTimer += dt;
      if (this._firstFlightTimer > 3.0) {
        this._firstFlightPending = false;
        this._showHint('firstFlight',
          'W/Up to thrust, A D/arrows to steer, Mouse to aim, LMB/SPACE to fire, RMB to mine, SHIFT to boost, M for map, ENTER at stations.');
      }
    }

    // ── Contextual control bar ───────────────────────────────────────────────────────────
    try { this._updateControlBar(state); } catch (_) { /* non-critical */ }

    // ── Tutorial chain (only while active) ───────────────────────────────────────────────
    const ob = state.onboarding;
    if (!ob || !ob.active) return;
    try {
      if (this._fadeT > 0) {
        this._fadeT -= dt;
        if (this._fadeT <= 0 && this._panel) { this._panel.style.transition = 'opacity 1.2s ease'; this._panel.style.opacity = '0'; setTimeout(() => this._teardown(), 1300); }
      }
      this._accum += dt;
      if (this._accum < 0.2) return;
      this._accum = 0;
      this._setObjectiveWaypoint(false);
      const curr = this._currentStep();
      if (curr && curr.key === 'claim' && !ob.done.claim) this._completeClaimIfNear(curr);
    } catch (_) { /* never let onboarding break the loop */ }
  },

  // Determine the player's current activity and update the bottom control hint bar to show
  // relevant keys. Modes: 'mining' (beam active), 'combat' (hostile targeted or taking fire),
  // 'station' (near a station), 'gate' (near a gate), 'flight' (default open-space cruising).
  _updateControlBar(state) {
    if (state.mode !== 'flight') return;
    const el = document.getElementById('control-hints');
    if (!el) return;

    let mode = 'flight';

    // Check for mining beam active.
    const beam = state.player.miningBeam;
    if (beam && beam.heat > 0) mode = 'mining';

    // Check for hostile target or incoming fire (combat takes priority over mining).
    const tid = state.player.targetId;
    if (tid != null) {
      const target = state.entities.get(tid);
      if (target && target.alive && target.team != null) {
        const player = state.entities.get(state.playerId);
        if (player && target.team !== player.team) mode = 'combat';
      }
    }

    // Check for station/gate proximity (overrides flight, not combat/mining).
    if (mode === 'flight') {
      const alerts = state.ui.alerts || [];
      // Use the alert system's dock/gate range events as a proxy — they set keys in the DOM.
      const dockEl = document.querySelector('.sf-alert--dock');
      const gateEl = document.querySelector('.sf-alert--info');
      if (dockEl) mode = 'station';
      else if (gateEl && gateEl.textContent && gateEl.textContent.includes('JUMP GATE')) mode = 'gate';
    }

    if (mode === this._lastControlMode) return;
    this._lastControlMode = mode;

    const HINTS = {
      flight:  'W/Up thrust  •  A D steer  •  Mouse aim  •  LMB/Space fire  •  RMB mine  •  Shift boost  •  Tab target  •  M map',
      mining:  'RMB hold to mine  •  Release to cool  •  Fly through ore to collect  •  B drill view  •  Tab next rock',
      combat:  'LMB/Space fire  •  Mouse aim at target  •  Tab cycle targets  •  F auto-fire  •  Shift boost to dodge',
      station: 'Enter to dock  •  Market: sell ore  •  Shipyard: buy ships  •  Missions: take contracts',
      gate:    'M open Star Map  •  Select destination  •  Jump to travel between systems',
    };
    el.textContent = HINTS[mode] || HINTS.flight;
  },

  _completeClaimIfNear(step) {
    const p = this.state.entities.get(this.state.playerId);
    const t = this._findObjectiveTarget(step);
    if (!p || !t || !t.pos) return;
    const dx = t.pos.x - p.pos.x, dz = t.pos.z - p.pos.z;
    const r = step.range || 420;
    if (dx * dx + dz * dz <= r * r) this._complete('claim');
  },

  _setObjectiveWaypoint(force) {
    const st = this.state;
    const ob = st.onboarding;
    if (!ob || !ob.active || ob.finished || !st.nav) return;
    const curr = this._currentStep();
    const existing = st.nav.waypoint;
    if (existing && !existing.onboarding && !force) return;
    if (!curr || !curr.target) {
      if (existing && existing.onboarding) st.nav.waypoint = null;
      return;
    }
    const t = this._findObjectiveTarget(curr);
    if (!t || !t.pos) return;
    st.nav.waypoint = {
      onboarding: true,
      pos: { x: t.pos.x, z: t.pos.z },
      label: t.label || curr.title,
    };
  },

  _clearObjectiveWaypoint() {
    const nav = this.state && this.state.nav;
    if (nav && nav.waypoint && nav.waypoint.onboarding) nav.waypoint = null;
  },

  _findObjectiveTarget(step) {
    const p = this.state.entities.get(this.state.playerId);
    if (!step || !step.target || !p) return null;
    let best = null, bestD = Infinity;
    for (const e of this.state.entityList) {
      if (!e.alive) continue;
      if (step.target === 'asteroid') {
        if (e.type !== 'asteroid' || (e.data && e.data.respawnAt != null)) continue;
      } else if (step.target === 'station') {
        if (e.type !== 'station' || (e.data && e.data.isGate)) continue;
      } else {
        continue;
      }
      const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z;
      let d = dx * dx + dz * dz;
      if (step.target === 'station' && e.data && e.data.stationId === 'station_helios') d -= 1000000;
      if (d < bestD) { bestD = d; best = e; }
    }
    if (!best) return null;
    if (step.target === 'station') {
      const name = best.data && (best.data.name || best.data.stationName || best.data.stationId);
      return { pos: best.pos, label: name || 'Station' };
    }
    return { pos: best.pos, label: 'Starter Claim - mineable rocks' };
  },

  // ---- DOM ------------------------------------------------------------------------------------
  _injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
    #${PANEL_ID} { position:absolute; left:16px; top:96px; width:306px; z-index:60; pointer-events:none;
      font-family:var(--font, "Segoe UI", system-ui, sans-serif); }
    #${PANEL_ID} .sf-ob-card { background:linear-gradient(180deg, rgba(17,29,48,.92), rgba(11,18,32,.92));
      border:1px solid var(--panel-edge,#1d3350); border-left:3px solid var(--accent,#39d0ff);
      border-radius:8px; padding:11px 13px; box-shadow:0 8px 30px rgba(0,0,0,.55), 0 0 0 1px rgba(57,208,255,.06) inset;
      backdrop-filter:blur(6px); }
    #${PANEL_ID} .sf-ob-kicker { font-family:var(--mono,monospace); font-size:10px; letter-spacing:.22em;
      text-transform:uppercase; color:var(--accent,#39d0ff); margin-bottom:5px; display:flex; justify-content:space-between; }
    #${PANEL_ID} .sf-ob-title { font-size:14px; color:#eaf4ff; font-weight:600; margin-bottom:5px; }
    #${PANEL_ID} .sf-ob-hint { font-size:12px; line-height:1.45; color:var(--ink-dim,#84a0c8); }
    #${PANEL_ID} .sf-ob-progress { margin-top:7px; font-family:var(--mono,monospace); font-size:11px; color:var(--accent-2,#7af7d0); }
    #${PANEL_ID} .sf-ob-steps { display:flex; gap:5px; margin-top:9px; }
    #${PANEL_ID} .sf-ob-dot { flex:1; height:3px; border-radius:2px; background:rgba(132,160,200,.25); }
    #${PANEL_ID} .sf-ob-dot.done { background:var(--accent-2,#7af7d0); box-shadow:0 0 6px rgba(122,247,208,.5); }
    #${PANEL_ID} .sf-ob-dot.curr { background:var(--accent,#39d0ff); box-shadow:0 0 6px rgba(57,208,255,.6); }

    .sf-ob-intro { position:absolute; left:50%; top:18%; transform:translateX(-50%); z-index:120; width:min(560px,86vw);
      pointer-events:auto; font-family:var(--font, "Segoe UI", system-ui, sans-serif);
      background:linear-gradient(180deg, rgba(17,29,48,.96), rgba(8,13,24,.96)); border:1px solid var(--panel-edge-2,#2b4a72);
      border-radius:12px; padding:22px 26px; box-shadow:0 18px 60px rgba(0,0,0,.7), 0 0 0 1px rgba(57,208,255,.1) inset;
      backdrop-filter:blur(8px); animation:sf-ob-in .4s ease; }
    @keyframes sf-ob-in { from { opacity:0; } to { opacity:1; } }
    .sf-ob-intro h2 { margin:0 0 4px; font-family:var(--mono,monospace); letter-spacing:.3em; text-transform:uppercase;
      font-size:13px; color:var(--accent,#39d0ff); }
    .sf-ob-intro h1 { margin:0 0 12px; font-size:24px; color:#eaf4ff; letter-spacing:.02em; }
    .sf-ob-intro p { margin:0 0 10px; font-size:14px; line-height:1.55; color:var(--ink,#d3e6ff); }
    .sf-ob-intro .sf-ob-row { display:flex; justify-content:space-between; align-items:center; margin-top:16px; }
    .sf-ob-intro button.sf-ob-go { background:linear-gradient(180deg,#1b66a8,#124a86); border:1px solid var(--accent,#39d0ff);
      color:#fff; font-size:14px; letter-spacing:.06em; text-transform:uppercase; padding:9px 22px; border-radius:7px; cursor:pointer;
      box-shadow:0 0 14px rgba(57,208,255,.35); }
    .sf-ob-intro button.sf-ob-go:hover { background:linear-gradient(180deg,#2080cc,#155aa0); }
    .sf-ob-intro a.sf-ob-skip { color:var(--ink-mute,#4d6a90); font-size:12px; cursor:pointer; text-decoration:underline; }
    .sf-ob-intro a.sf-ob-skip:hover { color:var(--ink-dim,#84a0c8); }
    `;
    document.head.appendChild(s);
  },

  _buildPanel() {
    if (this._panel) this._panel.remove();
    const root = document.getElementById('ui-root') || document.body;
    const el = document.createElement('div');
    el.id = PANEL_ID;
    el.innerHTML = '<div class="sf-ob-card"><div class="sf-ob-kicker"><span>Objective</span><span class="sf-ob-count"></span></div>'
      + '<div class="sf-ob-body"></div><div class="sf-ob-steps"></div></div>';
    root.appendChild(el);
    this._panel = el;
  },

  _refresh() {
    if (!this._panel) return;
    const ob = this.state.onboarding; if (!ob) return;
    const curr = this._currentStep();
    const idx = curr ? STEPS.indexOf(curr) : STEPS.length;
    const body = this._panel.querySelector('.sf-ob-body');
    const count = this._panel.querySelector('.sf-ob-count');
    const steps = this._panel.querySelector('.sf-ob-steps');
    if (count) count.textContent = Math.min(idx + 1, STEPS.length) + ' / ' + STEPS.length;
    if (body && curr) {
      const progress = curr.key === 'mine'
        ? '<div class="sf-ob-progress">ORE: ' + Math.min((ob.minedUnits || 0), curr.qty || 3) + ' / ' + (curr.qty || 3) + ' u</div>'
        : '';
      body.innerHTML = '<div class="sf-ob-title">' + curr.title + '</div><div class="sf-ob-hint">' + curr.hint + '</div>' + progress;
    }
    if (steps) {
      steps.innerHTML = '';
      STEPS.forEach((s, i) => {
        const d = document.createElement('div');
        d.className = 'sf-ob-dot' + (ob.done[s.key] ? ' done' : (i === idx ? ' curr' : ''));
        steps.appendChild(d);
      });
    }
  },

  _showIntro() {
    if (this._intro) this._intro.remove();
    const root = document.getElementById('ui-root') || document.body;
    const el = document.createElement('div');
    el.className = 'sf-ob-intro';
    el.innerHTML = ''
      + '<h2>Helios System · Free Pilot</h2>'
      + '<h1>Your first job: turn rocks into credits.</h1>'
      + '<p>Follow the yellow nav arrow to the starter claim, mine a few units of ore, then dock at Helios Station and sell it. That is the first loop.</p>'
      + '<p>Radar basics: gray dots are asteroids, cyan/green squares are stations, purple rings are jump gates, red triangles are trouble, and yellow diamonds are pickups or objectives.</p>'
      + '<div class="sf-ob-row"><a class="sf-ob-skip">Skip tutorial</a><button class="sf-ob-go">Begin →</button></div>';
    root.appendChild(el);
    this._intro = el;
    const close = () => { if (this._intro) { this._intro.remove(); this._intro = null; } };
    el.querySelector('.sf-ob-go').addEventListener('click', close);
    el.querySelector('.sf-ob-skip').addEventListener('click', () => {
      close();
      const ob = this.state.onboarding; if (ob) { ob.active = false; }
      if (this.state.settings && this.state.settings.gameplay) this.state.settings.gameplay.tutorialHints = false;
      this._teardown();
      this.bus.emit('toast', { text: 'Tutorial hints off (re-enable in Settings).', kind: 'info', ttl: 3 });
    });
  },
};
