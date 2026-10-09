// Gyre Snare HUD (DOM-guarded, fieldHud sibling).
//
// The pill reports the held-verb lash's one-voice state: SEARCHING while the basin pulls,
// the katamari's live mass/count while it holds, STRAIN when the tethered ball nears the
// break distance, and BALL AWAY for the thrown bowling ball's short flight. Shares the
// bottom-center lane contract (src/ui/hudLayout.js); writes only its own DOM subtree.

import {
  FIELD_LANE_BASE,
  LANE_PRIORITY,
  claimBottomLaneSeat,
  releaseBottomLaneClaim,
} from './hudLayout.js';
import { GYRE_SNARE } from '../data/gyreSnare.js';

// DMG× telegraph: the stamped scale clamps at launchImpactScaleMax, which a
// ~576 t clump already pegs — the yield arc would flat-line for the last ~75%
// of the mass range and a capped moon would read the same "8.0" as a pebble.
// Say the ceiling honestly once a katamari hits it.
function dmgText(mass) {
  const s = GYRE_SNARE.launchImpactScaleBase + mass / GYRE_SNARE.launchImpactScalePerMass;
  return s >= GYRE_SNARE.launchImpactScaleMax ? 'MAX' : s.toFixed(1);
}

export const GYRE_HUD_CSS = `
.sf-gyre-pill {
  position: absolute; left: 50%; bottom: ${FIELD_LANE_BASE}px; transform: translateX(-50%);
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
  transition: transform .18s ease-out;
}
.sf-gyre-pill.gyre-eat { transform: translateX(-50%) scale(1.1); } /* a meal just landed — the counter gulps (keep the seat's translate) */
.sf-gyre-pill.gyre-holding { color: var(--dp-lamp-hot, #ffd98c); text-shadow: var(--dp-emit-lamp, none); }
.sf-gyre-pill.gyre-search { color: var(--dp-lamp-dim, #8a6b3a); } /* beam live, nothing gripped yet */
.sf-gyre-pill.gyre-heavy { color: var(--dp-lamp, #f2b950); text-shadow: var(--dp-emit-lamp, none); } /* a body it can never eat — warm like held, not hot */
.sf-gyre-pill.gyre-strain { color: var(--dp-danger-hot, #ff8a70); border-left-color: var(--dp-danger, #ff5038); text-shadow: 0 0 10px var(--dp-danger-bloom, rgb(255 80 56 / .38)); }
.sf-gyre-pill.gyre-launched { color: var(--dp-lamp-hot, #ffd98c); text-shadow: var(--dp-emit-lamp, none); }
.sf-gyre-pill.gyre-ball { border-left-color: var(--dp-lamp-dim, #8a6b3a); }
.sf-gyre-pill.gyre-full { color: var(--dp-lamp-hot, #ffd98c); border-left-color: var(--dp-lamp-hot, #ffd98c); text-shadow: var(--dp-emit-lamp, none); }
.sf-gyre-fill {
  position: absolute; left: 2px; bottom: 0; height: 2px; width: 0;
  background: linear-gradient(90deg, var(--dp-lamp, #f2b950), var(--dp-danger, #ff5038));
  border-radius: 1px; opacity: .85; pointer-events: none;
}
.sf-gyre-fuse {
  position: absolute; left: 2px; top: 0; height: 2px; width: 0;
  background: linear-gradient(90deg, var(--dp-lamp-dim, #8a6b3a), var(--dp-lamp, #f2b950));
  border-radius: 1px; opacity: .7; pointer-events: none;
}
@media (forced-colors: active) { .sf-gyre-fill { background: CanvasText; } .sf-gyre-fuse { background: CanvasText; } }
@media (forced-colors: active) {
  .sf-gyre-pill { background: Canvas; color: CanvasText; border: 1px solid CanvasText; box-shadow: none; text-shadow: none; forced-color-adjust: none; }
}
`;

export const gyreHud = {
  id: 'gyreHud',
  name: 'gyreHud',

  init(ctx) {
    this.state = ctx.state;
    this.helpers = ctx.helpers || {};
    this._dom = null;
    this._lastText = '';
    this._lastClass = '';
    this._visible = false;
    this._laneSeat = '';
    this._strainOn = false; // hysteresis: enter at 0.40, exit at 0.25 — no boundary flapping
    this._bowlUntil = -1;   // simTime deadline — the BOWL read holds ~0.8 s past the 5-tick burst
    this._bowlMass = null;  // null until a launch edge arms it — the mid-coil-attach
    this._bowlN = null;     //   fallback must be able to tell armed from absent
    this._lastAbsorbs = 0;  // absorb ledger delta → the counter's ~150 ms gulp
    this._eatUntil = -1;
    this._lastHudPhase = null; // edge-true BOWL arming needs last frame's phase
  },

  destroy() {
    if (this._dom && this._dom.root && this._dom.root.parentNode) this._dom.root.parentNode.removeChild(this._dom.root);
    releaseBottomLaneClaim('gyre');
    this._dom = null;
    this._visible = false;
    this._laneSeat = '';
  },

  update(dt, state) {
    if (typeof document === 'undefined') return;
    const dom = this._ensureDom();
    if (!dom) return;
    if (state.mode !== 'flight' || (state.ui && state.ui.docked)) { this._hide(dom); return; }
    const g = state.gyreSnare || null;
    const { text, cls, strain, fuse } = this._resolve(g, Number.isFinite(state.simTime) ? state.simTime : 0);
    if (!text) { this._hide(dom); return; }
    const now = Number.isFinite(state.simTime) ? state.simTime : 0;
    const seat = claimBottomLaneSeat('gyre', LANE_PRIORITY.active, FIELD_LANE_BASE, now);
    if (!seat.visible) { this._hide(dom); return; }
    // The counter gulps too: maw/lumps/glints/audio/pad all celebrate a meal but
    // the ×N·Mt read used to swap silently — a ~150 ms scale-pop on each absorb.
    const ab = g && Number.isFinite(g.absorbs) ? g.absorbs : 0;
    if (g && g.phase === 'holding' && ab > this._lastAbsorbs) this._eatUntil = now + 0.15;
    this._lastAbsorbs = ab;
    this._apply(dom, text, cls, strain, fuse);
    dom.pill.classList.toggle('gyre-eat', now < this._eatUntil);
    this._applyLaneSeat(dom.pill, seat.bottom);
  },

  _resolve(g, now) {
    // The phase latch resets on a null mirror too — a mirror vanishing
    // mid-launch would otherwise strand 'launching' and the next launch's
    // launchEdge could never re-arm the BOWL window.
    if (!g) { this._lastHudPhase = null; return { text: '', cls: '' }; }
    // BOWL arming is edge-true: the ~0.8 s grave window starts on the OFF->LAUNCH
    // flip, not re-armed every launching tick (which would stretch it to ~1.0 s).
    const launchEdge = g.phase === 'launching' && this._lastHudPhase !== 'launching';
    this._lastHudPhase = g.phase;
    // The armed ledger dies with its grave window: a later mid-coil attach (or a
    // second throw after the first expired) falls back to the live clump read
    // instead of replaying the previous bowl's mass.
    if (g.phase !== 'launching' && now >= this._bowlUntil) {
      this._bowlMass = null; this._bowlN = null;
    }
    // A live ball's quiet grave telegraphs on EVERY phase, not just OFF — a re-beamed
    // lash would otherwise swallow the countdown exactly while a second lash winds.
    // "+N" names the OTHER live balls still flying — the pill only mirrors the freshest,
    // but a second bowl mid-flight shouldn't make the first one's grave invisible.
    const bttl = g.ballTtlLeftS || 0;
    const extraBalls = Math.max(0, (g.liveBalls || 0) - 1);
    // floor keeps the countdown honest: ceil overstates the remaining flight by up
    // to ~0.9 s (3.05 → "4s" flashes the gate value itself), and the max() floor of
    // 1 keeps the last tick reading "ball 1s" not "ball 0s".
    let ballTxt = bttl > 0 && bttl < GYRE_SNARE.ballTtlWarnS
      ? ` · ball ${Math.max(1, Math.min(GYRE_SNARE.ballTtlWarnS - 1, Math.floor(bttl)))}s` : '';
    // Other live balls still flying read even when the primary's countdown isn't
    // running — a second bowl mid-flight shouldn't make the first one's grave silent.
    // When the soonest secondary is inside its warn window its countdown rides too:
    // ". +2 balls 4s" — the pile's own quiet grave telegraphed like the primary's.
    if (extraBalls > 0) {
      const soonest = Array.isArray(g.balls) && g.balls.length
        && Number.isFinite(g.balls[0].ttlS) ? g.balls[0].ttlS : 0;
      ballTxt += ` · +${extraBalls} ball${extraBalls > 1 ? 's' : ''}`;
      if (soonest > 0 && soonest < GYRE_SNARE.ballTtlWarnS) {
        ballTxt += ` ${Math.max(1, Math.min(GYRE_SNARE.ballTtlWarnS - 1, Math.floor(soonest)))}s`;
      }
    }
    // Fuse speaks during BEAM too — a lashing <8 s from dry shouldn't announce itself
    // only through the after-the-fact dry toast.
    const fuseS = g.fuseS || 0;
    const fuseTxt = fuseS > 0 && fuseS < GYRE_SNARE.fuseWarnVisS
      ? ` · ${Math.max(1, Math.min(GYRE_SNARE.fuseWarnVisS - 1, Math.floor(fuseS)))}s` : '';
    const tow = g.towCount || 0;
    const heavy = g.tooHeavyCount || 0;
    const handlingTxt = (tow > 0 ? ` · TOWING ×${tow}` : '')
      + (heavy > 0 ? ` · TOO HEAVY ×${heavy}` : '');
    if (!g.phase || g.phase === 'off') {
      // A thrown clump still on the map deserves a quiet "it's yours" dot for its short flight.
      if (g && g.launchedId != null) {
        // The launch beat lands first: BOWL survives ~0.8 s past the burst ticks before
        // the pill flips to BALL AWAY — the verb's biggest beat stays readable.
        if (now < this._bowlUntil) {
          // ballTxt rides the BOWL-hold window too — the countdown belongs on EVERY
          // phase while a ball flies; a phase flip inside the 0.8s window shouldn't
          // swallow the freshly-thrown ball's own ·Ns.
          // The payoff beat keeps the destructive-yield telegraph too — HOLD and
          // BALL AWAY both carry DMG×; BOWL shouldn't drop the arc's climax.
          // DMG× reads ballMass — the mass the stamped impact scale was frozen on
          // at launch. An adopted-ball edge can leave _bowlMass (clumpMass ledger)
          // divergent from the payload; the yield tier must track the ball.
          const bowlDmg = dmgText(g.ballMass != null ? g.ballMass : (this._bowlMass || 0));
          return { text: `GYRE — BOWL ×${this._bowlN} · ${this._bowlMass}t · DMG×${bowlDmg}${fuseTxt}${ballTxt}`, cls: 'gyre-launched' };
        }
        const mass = Math.round(g.ballMass || 0);
        // A sweep-adopted ball has no member ledger (ballMembers never serialized) —
        // "×1" would claim it ate nothing. Show mass only until the ledger exists.
        const count = g.members == null ? null : (g.absorbs || 0) + 1;
        // The thrown ball's 9 s flight is otherwise silent — ballTxt carries the
        // primary's ·Ns countdown plus any secondaries still flying (· +N balls Ns).
        // DMG× names the destructive yield while it flies — the "growth → weapon"
        // arc stays legible instead of revealing itself only on impact.
        const dmg = dmgText(g.ballMass || 0);
        const label = mass > 0 ? (count != null ? `GYRE — BALL AWAY ×${count} · ${mass}t · DMG×${dmg}` : `GYRE — BALL AWAY · ${mass}t · DMG×${dmg}`) : 'GYRE — BALL AWAY';
        return { text: label + ballTxt, cls: 'gyre-ball' };
      }
      // No primary, but secondaries are still streaking (one retires before the rest) —
      // the pill shouldn't go dark while balls fly. balls[] is ttlS-sorted: [0] dies first.
      const bs = g && g.balls;
      if (bs && bs.length) {
        const warnS = GYRE_SNARE.ballTtlWarnS;
        const sTxt = bs[0].ttlS > 0 && bs[0].ttlS < warnS
          // floors like the primary countdown — never overstates the flight left
          ? ` · ${Math.min(warnS - 1, Math.max(1, Math.floor(bs[0].ttlS || 0)))}s`
          : '';
        // A flying pile is still a live kill instrument — total payload mass plus
        // the STRONGEST striker's yield keeps the "growth → weapon" arc legible
        // for secondaries too (primary and BOWL rows already carry DMG×).
        let sMass = 0, sMassMax = 0;
        for (const b of bs) {
          const bm = Number.isFinite(b.mass) ? b.mass : 0;
          sMass += bm; if (bm > sMassMax) sMassMax = bm;
        }
        const sDmg = dmgText(sMassMax);
        const sMassTxt = sMass > 0 ? ` · ${Math.round(sMass)}t · DMG×${sDmg}` : '';
        return { text: `GYRE — ${bs.length > 1 ? `${bs.length} BALLS` : 'BALL'} AWAY${sMassTxt}${sTxt}`, cls: 'gyre-ball' };
      }
      return { text: '', cls: '' };
    }
    if (g.phase === 'launching') {
      // The whole ~11-tick coil+burst rides the BOWL read — arming edge-true
      // covered only tick 1 and falling through to the beaming tail flashed
      // SEARCHING ×~10 ticks mid-throw (basin/tow zeroed by _launch) before
      // BALL AWAY took over. The flight's own ~0.8 s window still applies.
      if (launchEdge) {
        this._bowlUntil = now + 0.8;
        this._bowlMass = Math.round(g.clumpMass || 0);
        // HOLD showed ×N a tick earlier and BALL AWAY will show it again — the
        // biggest beat keeps the member count too (same +1 core convention).
        this._bowlN = (g.absorbs || 0) + 1;
      }
      // Fallbacks cover a HUD attaching mid-coil (reload/host swap) — the
      // frozen ledger still publishes during launching.
      const bowlMass = this._bowlMass != null ? this._bowlMass : Math.round(g.clumpMass || 0);
      const bowlN = this._bowlN != null ? this._bowlN : (g.absorbs || 0) + 1;
      // Same DMG× the HOLD/AWAY reads carry — the throw's yield telegraph
      // doesn't drop for the payoff's own beat. ballMass is the payload the
      // stamped scale froze on; bowlMass (clumpMass ledger) can diverge on an
      // adopted-ball edge, so the tier reads the ball.
      const bowlDmg = dmgText(g.ballMass != null ? g.ballMass : bowlMass);
      return { text: `GYRE — BOWL ×${bowlN} · ${bowlMass}t · DMG×${bowlDmg}${fuseTxt}${ballTxt}`, cls: 'gyre-launched' };
    }
    if (g.phase === 'holding') {
      const count = (g.absorbs || 0) + 1;
      const mass = Math.round(g.clumpMass || 0);
      const s = g.strain01 || 0;
      if (s > 0.4) this._strainOn = true;
      else if (s < 0.25) this._strainOn = false;
      // Funnel still feeding while held: "+N" keeps katamari anticipation legible —
      // basinCount publishes through HOLD, so the ball's next meal is named.
      const net = g.basinCount || 0;
      const tail = (net > 0 ? ` +${net}` : '') + handlingTxt;
      // The katamari's destructive yield is telegraphed while it grows — DMG× tracks
      // the same launch-impact formula the throw will stamp, so "bigger = hits harder"
      // is a visible arc, not a surprise on impact.
      const dmg = ` · DMG×${dmgText(g.clumpMass || 0)}`;
      // Mass-scaled cap drain makes the fuse legible BEFORE the dry auto-bowl: under ~8 s
      // of burn the readout appends the countdown and the top fuse bar drains with it.
      const fuse = fuseS;
      if (this._strainOn) {
        return { text: `GYRE — STRAIN ×${count} · ${mass}t${dmg}${tail}${fuseTxt}${ballTxt}`, cls: 'gyre-strain', strain: s, fuse };
      }
      // Saturation reads: the cap is a hard ceiling, so "why isn't it eating?" gets a flag.
      const full = g.maxClumpMass != null && (g.clumpMass || 0) >= g.maxClumpMass;
      if (full) {
        return { text: `GYRE — ×${count} · ${mass}t${dmg} FULL${tail}${fuseTxt}${ballTxt}`, cls: 'gyre-full', strain: s, fuse };
      }
      return { text: `GYRE — ×${count} · ${mass}t${dmg}${tail}${fuseTxt}${ballTxt}`, cls: 'gyre-holding', strain: s, fuse };
    }
    // Net anticipation: material already inside the cone names the catch before it
    // lands — "×N IN NET" instead of a bare SEARCHING sweep. A beam towing only
    // non-absorbables (loot it drags but never eats) gets its own word: TOWING ×N —
    // the "why won't it snag?" read instead of silence.
    const net = g.basinCount || 0;
    if (net > 0) {
      // A mixed net carries the warm face + the refusal count too — an uneatable
      // body inside is the actionable read, same as the tow branch's own rule.
      // handlingTxt already ends in `· TOO HEAVY ×N` — the suffix comes once.
      return { text: `GYRE — ×${net} IN NET${handlingTxt}${fuseTxt}${ballTxt}`, cls: heavy > 0 ? 'gyre-heavy' : 'gyre-search', fuse: fuseS };
    }
    if (tow > 0) {
      // The too-heavy read is the actionable half of the line — carry the warm
      // face whenever a body it can never eat is inside, not only when tow==0.
      return { text: `GYRE — TOWING ×${tow}${heavy > 0 ? ` · TOO HEAVY ×${heavy}` : ''}${fuseTxt}${ballTxt}`, cls: heavy > 0 ? 'gyre-heavy' : 'gyre-search', fuse: fuseS };
    }
    if (heavy > 0) {
      return { text: `GYRE — TOO HEAVY ×${heavy}${fuseTxt}${ballTxt}`, cls: 'gyre-heavy', fuse: fuseS };
    }
    return { text: `GYRE — SEARCHING${fuseTxt}${ballTxt}`, cls: 'gyre-search', fuse: fuseS };
  },

  _apply(dom, text, cls, strain, fuse) {
    if (!text) { this._hide(dom); return; }
    if (text !== this._lastText) {
      this._lastText = text;
      dom.pillText.textContent = text;
      dom.pill.setAttribute('aria-label', text);
    }
    // The continuous strain01 rides a thin fill bar under the pill — the eye gets
    // the slip building long before the binary STRAIN flag flips at 0.40.
    const s = Math.max(0, Math.min(1, Number.isFinite(strain) ? strain : 0));
    dom.fill.style.width = `${Math.round(s * 100)}%`;
    dom.fill.style.display = s > 0.02 ? 'block' : 'none';
    // Fuse bar (top edge): cap ÷ current drain, clamped to an 8 s window — a shrinking
    // countdown. Only the hold family carries it; a beaming-empty fuse is long and the
    // constant bar would be noise.
    const f = Number.isFinite(fuse) ? Math.max(0, Math.min(1, fuse / GYRE_SNARE.fuseWarnVisS)) : 0;
    dom.fuse.style.width = `${Math.round(f * 100)}%`;
    // Only the last fuseWarnVisS s draw: a healthy burn pinning the bar at 100% is
    // noise, not signal — the countdown language is the same gate the ·Ns text uses.
    dom.fuse.style.display = f > 0.02 && fuse < GYRE_SNARE.fuseWarnVisS ? 'block' : 'none';
    if (cls !== this._lastClass) {
      this._lastClass = cls;
      dom.pill.classList.toggle('gyre-holding', cls === 'gyre-holding');
      dom.pill.classList.toggle('gyre-strain', cls === 'gyre-strain');
      dom.pill.classList.toggle('gyre-launched', cls === 'gyre-launched');
      dom.pill.classList.toggle('gyre-ball', cls === 'gyre-ball');
      dom.pill.classList.toggle('gyre-full', cls === 'gyre-full');
      dom.pill.classList.toggle('gyre-search', cls === 'gyre-search');
      dom.pill.classList.toggle('gyre-heavy', cls === 'gyre-heavy');
    }
    if (!this._visible) {
      dom.pill.style.display = 'flex';
      this._visible = true;
    }
  },

  _applyLaneSeat(pill, bottom) {
    const next = bottom === FIELD_LANE_BASE ? '' : `${bottom}px`;
    if (next === this._laneSeat) return;
    this._laneSeat = next;
    pill.style.bottom = next;
  },

  _hide(dom) {
    // The strain latch is per-hold hysteresis — a hidden pill (or a new hold
    // starting inside the 0.25-0.4 dead band) must not inherit the previous
    // excursion's STRAIN face for its first few ticks.
    this._strainOn = false;
    releaseBottomLaneClaim('gyre');
    if (dom && this._visible) {
      dom.pill.style.display = 'none';
      if (this._laneSeat) { dom.pill.style.bottom = ''; this._laneSeat = ''; }
    }
    this._visible = false;
    this._lastText = '';
  },

  _ensureDom() {
    if (this._dom && this._dom.root.isConnected !== false) return this._dom;
    const host = document.getElementById('hud') || document.body;
    if (!host) return null;
    if (!document.getElementById('sf-gyre-css')) {
      const style = document.createElement('style');
      style.id = 'sf-gyre-css';
      style.textContent = GYRE_HUD_CSS;
      (document.head || host).appendChild(style);
    }
    const root = document.createElement('div');
    root.className = 'sf-gyre-root';
    const pill = document.createElement('div');
    pill.className = 'sf-gyre-pill';
    pill.setAttribute('role', 'status');
    pill.setAttribute('aria-live', 'polite');
    pill.setAttribute('aria-atomic', 'true');
    const pillText = document.createElement('span');
    pill.appendChild(pillText);
    const fill = document.createElement('span');
    fill.className = 'sf-gyre-fill';
    fill.style.display = 'none';
    pill.appendChild(fill);
    const fuse = document.createElement('span');
    fuse.className = 'sf-gyre-fuse';
    fuse.style.display = 'none';
    pill.appendChild(fuse);
    root.appendChild(pill);
    host.appendChild(root);
    this._dom = { root, pill, pillText, fill, fuse };
    this._lastText = '';
    this._lastClass = '';
    this._visible = false;
    this._laneSeat = '';
    return this._dom;
  },
};
