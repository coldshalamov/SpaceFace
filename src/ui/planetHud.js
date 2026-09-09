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

const PLANET_HUD_CSS = `
.sf-planet-pill {
  position: absolute; left: 50%; bottom: 142px; transform: translateX(-50%);
  display: none; align-items: center; gap: 8px; padding: 4px 12px;
  font: 600 12px/1.2 "Segoe UI", system-ui, sans-serif; letter-spacing: .06em;
  color: #cfe8ff; background: rgba(10, 18, 28, 0.72); border: 1px solid rgba(120, 190, 235, 0.4);
  border-radius: 3px; pointer-events: none; white-space: nowrap;
}
.sf-planet-pill .planet-heat { font-weight: 700; color: #9fd8e8; }
.sf-planet-pill.planet-storm { color: #ffd9a0; border-color: rgba(255, 179, 92, 0.6); }
.sf-planet-pill.planet-storm .planet-heat { color: #ffb35c; }
.sf-planet-pill.planet-reentry { color: #ffb9a8; border-color: rgba(255, 92, 92, 0.7); }
.sf-planet-pill.planet-reentry .planet-heat { color: #ff5c5c; }
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
