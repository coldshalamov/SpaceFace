import { createMorphLabel } from './morphLabel.js';
import { factionIcon } from '../station/icons.js';

export const CUE = Object.freeze({
  effect: 'commsTrace',
  screens: ['hud', 'comms'],
  triggers: ['comms:popup', 'audio:priorityEnvelope', 'audio:commsVoices'],
  maxMs: 180,
  loop: false,
});

const DEFAULT_FACTION = 'faction_scn';
const TRACE_BINS = 16;
const TRACE_GLYPHS = ['.', ':', '-', '=', '+', '*', '#', '%', '@'];

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp01(value) {
  const n = finite(value, 0);
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function buildTraceText(amplitude, density, phase) {
  const amp = clamp01(amplitude);
  const den = clamp01(density);
  const gate = Math.max(0.18, den);
  let out = '';
  for (let i = 0; i < TRACE_BINS; i++) {
    const wave = (Math.sin(phase + i * 0.67) + Math.sin(phase * 0.53 + i * 0.29) + 2) * 0.25;
    const lvl = clamp01(amp * (0.28 + 0.72 * wave) * gate);
    const idx = Math.min(TRACE_GLYPHS.length - 1, Math.floor(lvl * TRACE_GLYPHS.length));
    out += TRACE_GLYPHS[idx];
  }
  return out;
}

export function createCommsTrace(mountEl, opts = {}) {
  const root = document.createElement('div');
  root.className = 'sf-fx-comms-trace';
  root.setAttribute('aria-hidden', 'true');
  root.hidden = true;

  const crest = document.createElement('span');
  crest.className = 'sf-fx-comms-trace__crest';
  crest.setAttribute('aria-hidden', 'true');

  const wave = document.createElement('span');
  wave.className = 'sf-fx-comms-trace__wave';

  root.append(crest, wave);
  mountEl.appendChild(root);

  const morph = createMorphLabel(wave, { text: '', numeric: false });
  let active = false;
  let phase = 0;
  let lastAmplitude = 0;
  let lastFaction = '';
  let lastText = '';

  function setFaction(factionId) {
    const next = String(factionId || DEFAULT_FACTION);
    if (next === lastFaction) return;
    lastFaction = next;
    crest.innerHTML = factionIcon(next, 14) || factionIcon(DEFAULT_FACTION, 14) || '';
  }

  function setActive(on) {
    const next = !!on;
    if (active === next) return;
    active = next;
    root.hidden = !active;
    if (!active) {
      lastText = '';
      lastAmplitude = 0;
      morph.set('');
    }
  }

  function update(state = {}) {
    const live = !!state.live;
    if (!live) {
      setActive(false);
      return;
    }
    setActive(true);
    setFaction(state.factionId || opts.factionId || DEFAULT_FACTION);
    const amplitude = clamp01(state.amplitude);
    const density = clamp01(state.density);
    phase += Math.max(0.12, finite(state.phaseStep, 0.42)) + density * 0.31;
    const text = buildTraceText(amplitude, density, phase);
    if (text !== lastText) {
      morph.set(text, { dir: amplitude >= lastAmplitude ? 'up' : 'down' });
      lastText = text;
    }
    lastAmplitude = amplitude;
    root.style.setProperty('--sf-comms-amp', String(Math.round(amplitude * 1000) / 1000));
    root.style.setProperty('--sf-comms-density', String(Math.round(density * 1000) / 1000));
  }

  function dispose() {
    morph.dispose();
    if (root.parentNode) root.parentNode.removeChild(root);
  }

  return { update, setActive, dispose, root, cue: CUE };
}
