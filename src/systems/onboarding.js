// Onboarding / objective system. Gives a brand-new pilot a premise and a staged "learn the ropes"
// chain so the game makes sense instead of dropping them into space with no explanation. Entirely
// optional and non-blocking: it never freezes the sim, never steals movement, and respects
// state.settings.gameplay.tutorialHints. Self-contained — it builds its own DOM (an objective
// tracker panel + a dismissible intro card) and drives progress off real gameplay events.
//
// System contract: { name, init(ctx), update(dt, state) }. Wired into registry SYSTEMS + UPDATE_ORDER.

const PANEL_ID = 'sf-onboarding';
const STYLE_ID = 'sf-onboarding-style';

// Objective chain. Each step completes when one of its `events` fires (or, for proximity, when the
// system emits its own synthetic event from update()). Steps may complete out of order; the panel
// always shows the first incomplete one.
const STEPS = [
  { key: 'fly',     title: 'Reach Helios Station',     hint: 'Thrust with W A S D or the Arrow keys — the mouse aims your ship. Fly to the large station structure (shown on your radar).' },
  { key: 'dock',    title: 'Dock at the station',      hint: 'Glide into the station’s ring and press Enter when the dock prompt appears.' },
  { key: 'trade',   title: 'Trade at the Market',      hint: 'Open the Market tab. Buy a commodity low here, sell it high elsewhere — that spread is your first income.' },
  { key: 'mine',    title: 'Mine an asteroid',         hint: 'Undock and fly to the asteroid cluster in this system. Aim at a rock and hold the Right Mouse Button to mine ore.' },
  { key: 'mission', title: 'Take on a contract',       hint: 'At any station open the Mission board (J) and accept a job for credits and reputation.' },
];

const ORE_PREFIXES = ['cmdty_ore', 'cmdty_metal', 'cmdty_ice', 'cmdty_crystal', 'cmdty_volatile'];

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
    bus.on('dock:docked', () => { this._complete('fly'); this._complete('dock'); });
    bus.on('economy:tradeCompleted', (p) => {
      this._complete('trade');
      if (p && p.side === 'sell' && this._isOre(p.commodityId)) this._complete('mine'); // selling ore also implies you mined
    });
    bus.on('mining:tick', () => this._complete('mine'));
    bus.on('mining:start', () => this._complete('mine'));
    bus.on('mission:accepted', () => this._complete('mission'));
  },

  _isOre(id) { return !!id && ORE_PREFIXES.some((p) => String(id).startsWith(p)); },

  _begin() {
    const st = this.state;
    const hintsOn = !st.settings || !st.settings.gameplay || st.settings.gameplay.tutorialHints !== false;
    st.onboarding = { active: hintsOn, stepIndex: 0, done: {}, finished: false };
    if (!hintsOn) return;             // player opted out — stay silent, no panel
    this._injectStyle();
    this._buildPanel();
    this._showIntro();
    this._refresh();
  },

  _teardown() {
    const ob = this.state.onboarding; if (ob) ob.active = false;
    if (this._panel) { this._panel.remove(); this._panel = null; }
    if (this._intro) { this._intro.remove(); this._intro = null; }
  },

  _complete(key) {
    const ob = this.state.onboarding;
    if (!ob || !ob.active || ob.finished) return;
    if (ob.done[key]) return;
    ob.done[key] = true;
    // toast only when it was the objective currently being shown
    const curr = this._currentStep();
    if (curr && curr.key === key) {
      this.bus.emit('toast', { text: '✓ Objective complete: ' + curr.title, kind: 'good', ttl: 3.5 });
    }
    if (STEPS.every((s) => ob.done[s.key])) this._finish();
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
    if (this._panel) {
      const body = this._panel.querySelector('.sf-ob-body');
      if (body) body.innerHTML = '<div class="sf-ob-title">You’re ready, pilot.</div><div class="sf-ob-hint">Mine, trade, fight, and grow your fleet. Press H for help anytime.</div>';
      this._fadeT = 6; // seconds until the panel fades out (handled in update)
    }
  },

  // per-frame: proximity check for the "fly to station" step + panel fade-out. Throttled to ~5Hz.
  update(dt, state) {
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
      // proximity: complete "fly" when the player nears any real (non-gate) station
      if (!ob.done.fly) {
        const p = state.entities.get(state.playerId);
        if (p) {
          for (const e of state.entityList) {
            if (e.type !== 'station' || (e.data && e.data.isGate)) continue;
            const dr = (e.data && e.data.dockRadius) || e.radius || 80;
            const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z;
            if (dx * dx + dz * dz <= (dr * 2.2) * (dr * 2.2)) { this._complete('fly'); break; }
          }
        }
      }
    } catch (_) { /* never let onboarding break the loop */ }
  },

  // ---- DOM ------------------------------------------------------------------------------------
  _injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
    #${PANEL_ID} { position:absolute; left:16px; top:96px; width:268px; z-index:60; pointer-events:none;
      font-family:var(--font, "Segoe UI", system-ui, sans-serif); }
    #${PANEL_ID} .sf-ob-card { background:linear-gradient(180deg, rgba(17,29,48,.92), rgba(11,18,32,.92));
      border:1px solid var(--panel-edge,#1d3350); border-left:3px solid var(--accent,#39d0ff);
      border-radius:9px; padding:11px 13px; box-shadow:0 8px 30px rgba(0,0,0,.55), 0 0 0 1px rgba(57,208,255,.06) inset;
      backdrop-filter:blur(6px); }
    #${PANEL_ID} .sf-ob-kicker { font-family:var(--mono,monospace); font-size:10px; letter-spacing:.22em;
      text-transform:uppercase; color:var(--accent,#39d0ff); margin-bottom:5px; display:flex; justify-content:space-between; }
    #${PANEL_ID} .sf-ob-title { font-size:14px; color:#eaf4ff; font-weight:600; margin-bottom:5px; }
    #${PANEL_ID} .sf-ob-hint { font-size:12px; line-height:1.45; color:var(--ink-dim,#84a0c8); }
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
    if (body && curr) body.innerHTML = '<div class="sf-ob-title">' + curr.title + '</div><div class="sf-ob-hint">' + curr.hint + '</div>';
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
      + '<h1>Welcome to SpaceFace</h1>'
      + '<p>You arrive in Helios Prime with a battered <b>Kestrel</b> and a handful of credits. No employer, no orders — just open space and a galaxy that rewards the bold.</p>'
      + '<p>Mine ore, run trade routes, take contracts, and win fights. Every credit buys better guns, hulls, and crew until a lone scrapper becomes a fleet. The system is safe — the danger (and the profit) is out there.</p>'
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
