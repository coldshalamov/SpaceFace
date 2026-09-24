// PQ-013 / SF-14 — planetary skim HUD (DOM-guarded "own module" pattern, massSeedHud sibling).
//
// Bible §8.3: ONE band pill that names the CURRENT BAND in words, carries the exact heat number
// (the same scalar the world-space sheath shows — gauges must not lie), the collector state, and
// the plunge-stage escalation words. Appears with band occupancy / residual heat, fades completely
// otherwise (the D5 contextual-instrument ruling: reveal while load-bearing, never stay). The
// "BURN NOW OR BREAK UP" commit cue is NOT here — it routes through the one-voice arbiter from
// planetRuntime, exactly once per commit.
//
// Reads only: state.planet, state.settings. Writes only: its own DOM subtree. Headless-guarded.
//
// INST-01: the skim tell is an instrument on the deck, not a cyan web pill. The injected sheet
// paints only with the tokens that already live on #hud / :root (deckplate register,
// src/ui/deckplate/): the flight glass face, the etched legend voice, and the warm lamp as the
// one accent (storm is the lamp lit; reentry is the lamp driven red; the heat reading stays ink).

export const PLANET_HUD_CSS = `
.sf-planet-pill {
  position: absolute; left: 50%; bottom: 142px; transform: translateX(-50%);
  display: none; align-items: center; gap: var(--dp-gap, 8px); padding: 5px 14px 6px;
  font-family: var(--dp-face-etch, var(--hud-data, system-ui));
  font-size: var(--dp-fs-etch, 12px); font-weight: 700; line-height: 1.2;
  font-variation-settings: "wght" 720, "wdth" 68; letter-spacing: .14em; text-transform: uppercase;
  color: var(--hud-paper, var(--dp-ink, #e8e2d4));
  background: var(--dp-glass-flight, rgb(18 23 29 / .82));
  border: 1px solid var(--hud-line, var(--dp-metal-4, #2f3542));
  border-left: 2px solid var(--dp-lamp, #f2b950);
  border-radius: var(--dp-r-instrument, 3px);
  box-shadow: none;
  text-shadow: var(--dp-emit, none);
  pointer-events: none; white-space: nowrap;
}
.sf-planet-pill .planet-heat { font-weight: inherit; font-variant-numeric: tabular-nums; color: var(--hud-paper, var(--dp-ink, #e8e2d4)); }
.sf-planet-pill.planet-storm { color: var(--dp-lamp-hot, #ffd98c); text-shadow: var(--dp-emit-lamp, none); }
.sf-planet-pill.planet-storm .planet-heat { color: var(--dp-lamp-hot, #ffd98c); }
.sf-planet-pill.planet-reentry { color: var(--dp-danger-hot, #ff8a70); border-left-color: var(--dp-danger, #ff5038); text-shadow: 0 0 10px var(--dp-danger-bloom, rgb(255 80 56 / .38)); }
.sf-planet-pill.planet-reentry .planet-heat { color: var(--dp-danger-hot, #ff8a70); }
@media (forced-colors: active) {
  .sf-planet-pill { background: Canvas; color: CanvasText; border: 1px solid CanvasText; box-shadow: none; text-shadow: none; forced-color-adjust: none; }
}
`;

const REGION_WORDS = {
  skim: 'WORKING BAND',
  danger: 'STORM BAND',
  reentry: 'REENTRY BAND',
};
const STAGE_WORDS = {
  commit: 'COMMIT WINDOW',
  breakup: 'BREAKING UP',
  descent: 'DESCENT',
};

export const planetHud = {
  id: 'planetHud',
  name: 'planetHud',

  init(ctx) {
    this.state = ctx.state;
    this._dom = null;
    this._lastText = '';
    this._lastClass = '';
    this._visible = false;
  },

  destroy() {
    if (this._dom && this._dom.root && this._dom.root.parentNode) {
      this._dom.root.parentNode.removeChild(this._dom.root);
    }
    this._dom = null;
    this._visible = false;
  },

  update(dt, state) {
    if (typeof document === 'undefined') return;
    const dom = this._ensureDom();
    if (!dom) return;
    if (state.mode !== 'flight' || (state.ui && state.ui.docked)) { this._hide(); return; }

    const rt = state.planet;
    const p = rt && rt.active ? rt.player : null;
    // Reveal while the information is load-bearing: in the atmosphere bands, or still hot.
    const inBands = !!(p && (p.region === 'skim' || p.region === 'danger' || p.region === 'reentry'));
    if (!p || (!inBands && p.heat < 0.05)) { this._hide(); return; }

    const heatPct = Math.round(p.heat * 100);
    let text;
    let cls = '';
    if (inBands) {
      const bandWord = REGION_WORDS[p.region] || 'BAND';
      const stageWord = STAGE_WORDS[p.stage] || null;
      text = stageWord ? `${bandWord} — ${stageWord}` : bandWord;
      text += ` · HEAT ${heatPct}%`;
      if (p.collectorOn && (p.region === 'skim' || p.region === 'danger')) text += ' · SCOOP';
      cls = p.region === 'reentry' || p.stage === 'breakup' || p.stage === 'descent'
        ? 'planet-reentry' : p.region === 'danger' || p.stage === 'commit' ? 'planet-storm' : '';
    } else {
      text = `HULL COOLING · HEAT ${heatPct}%`;
    }

    if (text !== this._lastText) {
      this._lastText = text;
      dom.pillHeat.textContent = '';
      dom.pillText.textContent = text;
      dom.pill.setAttribute('aria-label', text);
    }
    if (cls !== this._lastClass) {
      this._lastClass = cls;
      dom.pill.classList.toggle('planet-storm', cls === 'planet-storm');
      dom.pill.classList.toggle('planet-reentry', cls === 'planet-reentry');
    }
    if (!this._visible) {
      dom.pill.style.display = 'flex';
      this._visible = true;
    }
  },

  _hide() {
    const dom = this._dom;
    if (!dom) return;
    if (this._visible) dom.pill.style.display = 'none';
    this._visible = false;
    this._lastText = '';
  },

  _ensureDom() {
    if (this._dom && this._dom.root.isConnected !== false) return this._dom;
    const host = document.getElementById('hud') || document.body;
    if (!host) return null;
    if (!document.getElementById('sf-planet-css')) {
      const style = document.createElement('style');
      style.id = 'sf-planet-css';
      style.textContent = PLANET_HUD_CSS;
      (document.head || host).appendChild(style);
    }
    const root = document.createElement('div');
    root.className = 'sf-planet-root';
    const pill = document.createElement('div');
    pill.className = 'sf-planet-pill';
    pill.setAttribute('role', 'status');
    pill.setAttribute('aria-live', 'polite');
    pill.setAttribute('aria-atomic', 'true');
    const pillText = document.createElement('span');
    pillText.className = 'planet-tag';
    const pillHeat = document.createElement('span');
    pillHeat.className = 'planet-heat';
    pill.appendChild(pillText);
    pill.appendChild(pillHeat);
    root.appendChild(pill);
    host.appendChild(root);
    this._dom = { root, pill, pillText, pillHeat };
    this._lastText = '';
    this._lastClass = '';
    this._visible = false;
    return this._dom;
  },
};
