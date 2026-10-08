// RACE-01 flight tape. Buttons only — V is cruise, C is scan, R is detonate.
// Mounts on #ui-root so flight keys ignore it. Hidden in menus and when the player
// is on the overhead camera with no live race.

import { raceGateGlobals } from '../data/raceLevels.js';
import {
  STEERING_VIEWS,
  activeAuthoredRace,
  activeRaceMission,
  normalizeSteeringView,
  readRaceTape,
  resolveSteeringView,
} from '../systems/racingSteer.js';

function writeSteeringView(state, bus, value) {
  const next = normalizeSteeringView(value);
  if (!state.settings) state.settings = {};
  if (!state.settings.gameplay || typeof state.settings.gameplay !== 'object') {
    state.settings.gameplay = {};
  }
  state.settings.gameplay.steeringView = next;
  if (bus && typeof bus.emit === 'function') {
    bus.emit('settings:changed', { section: 'gameplay', key: 'steeringView', value: next });
  }
  return next;
}

function fmtTime(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const rem = s - m * 60;
  if (m <= 0) return rem.toFixed(1);
  return `${m}:${rem.toFixed(1).padStart(4, '0')}`;
}

export function mountRacingHud({ root, bus, state, screens }) {
  if (!root || typeof document === 'undefined') return null;
  const panel = document.createElement('div');
  panel.id = 'race-tape';
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-label', 'Racing');
  panel.style.cssText = [
    'position:fixed',
    'top:64px',
    'left:50%',
    'transform:translateX(-50%)',
    'z-index:24',
    'display:none',
    'min-width:280px',
    'max-width:440px',
    'padding:8px 10px 10px',
    'color:#d7e6f5',
    'background:rgba(6,10,16,0.78)',
    'border:1px solid rgba(180,210,230,0.38)',
    'font:12px/1.35 ui-monospace,monospace',
    'pointer-events:auto',
    'text-align:center',
  ].join(';');

  const line = document.createElement('div');
  line.style.letterSpacing = '0.04em';
  const sub = document.createElement('div');
  sub.style.opacity = '0.8';
  sub.style.marginTop = '2px';
  const row = document.createElement('div');
  row.style.marginTop = '8px';
  row.style.display = 'flex';
  row.style.gap = '6px';
  row.style.justifyContent = 'center';

  function button(label) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.style.cssText = [
      'font:inherit',
      'color:#d7e6f5',
      'background:transparent',
      'border:1px solid rgba(180,210,230,0.45)',
      'padding:3px 8px',
      'cursor:pointer',
    ].join(';');
    return b;
  }

  const viewBtn = button('View');
  const resetBtn = button('Reset');
  const boardBtn = button('Circuits');
  viewBtn.addEventListener('click', () => {
    const cur = normalizeSteeringView(state.settings && state.settings.gameplay
      && state.settings.gameplay.steeringView);
    const i = STEERING_VIEWS.indexOf(cur);
    writeSteeringView(state, bus, STEERING_VIEWS[(i + 1) % STEERING_VIEWS.length]);
  });
  resetBtn.addEventListener('click', () => {
    if (bus && typeof bus.emit === 'function') bus.emit('race:reset', {});
  });
  boardBtn.addEventListener('click', () => {
    if (screens && typeof screens.pushScreen === 'function') screens.pushScreen('raceBoard');
  });
  row.append(viewBtn, resetBtn, boardBtn);
  panel.append(line, sub, row);
  root.appendChild(panel);

  function frame(live) {
    const st = live || state;
    const inFlight = !!(st && st.mode === 'flight' && !(st.ui && st.ui.docked));
    const race = activeRaceMission(st);
    const authored = activeAuthoredRace(st);
    const view = resolveSteeringView(st, { photo: false, death: false });
    const show = inFlight && (view === 'racing' || !!race);
    panel.style.display = show ? 'block' : 'none';
    if (!show) return;
    const pref = normalizeSteeringView(st.settings && st.settings.gameplay && st.settings.gameplay.steeringView);
    viewBtn.textContent = `View ${pref}`;
    resetBtn.disabled = !authored;
    resetBtn.style.opacity = authored ? '1' : '0.4';
    if (!race || !race.params) {
      line.textContent = view === 'racing' ? 'STERN CAMERA' : 'RACING';
      sub.textContent = 'No circuit on the book.';
      return;
    }
    const globals = race.params.racingContractId ? raceGateGlobals(race.params) : [];
    const player = st.entities && st.playerId != null ? st.entities.get(st.playerId) : null;
    const tape = readRaceTape(race.params, player, globals, st.simTime || 0);
    if (tape.holding) {
      line.textContent = `GRID ${tape.gridLeft.toFixed(1)}`;
      sub.textContent = tape.gridLine || tape.courseName || race.title || 'Hold.';
      return;
    }
    const delta = tape.delta == null ? '' : `  ${tape.delta >= 0 ? '+' : ''}${tape.delta.toFixed(1)}`;
    const name = tape.courseName || race.title || 'RACE';
    line.textContent = `${name}   L${tape.lap}/${tape.laps}   G${tape.nextGate}/${tape.gateCount}`;
    const flags = [
      tape.steerHint ? tape.steerHint.toUpperCase() : '',
      fmtTime(tape.elapsed) + (tape.recordS ? ` / ${Math.round(tape.recordS)}s` : '') + delta,
      tape.wrongWay ? 'WRONG WAY' : '',
      tape.offRibbon ? 'OFF RIBBON' : '',
      tape.drafting ? 'DRAFT' : '',
      tape.locked ? 'LOCK' : '',
    ].filter(Boolean);
    sub.textContent = flags.join('   ');
  }

  return {
    frame,
    dispose() {
      if (panel.parentNode) panel.parentNode.removeChild(panel);
    },
  };
}
