import { el } from './kit/index.js';
import { normalizeLedger } from '../gallery/orbital/score.js';
import { normalizeLeagueMemory } from '../sports/kineticLeague/memory.js';
import { isRacingCorridorSession } from '../world/racingCorridor.js';

const KEY = 'sf.physicsVenues.v1';
let pending = null;
let launchSerial = 0;
export function readPhysicsVenueRecords() {
  let raw = {};
  try { raw = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch {}
  return { gallery: normalizeLedger(raw.gallery), league: normalizeLeagueMemory(raw.league) };
}
/** RC-41 — a venue launch asks only when it can lose a real flight. A menu boot,
 *  an ephemeral venue/circuit flight, or a paused throwaway has nothing to lose. */
export function venueLaunchNeedsConfirm(state) {
  if (!state) return false;
  const live = state.mode === 'flight' || state.mode === 'paused';
  if (!live) return false;
  if (state.physicsVenueSession === true || state.physicsVenue?.active === true) return false;
  if (isRacingCorridorSession(state)) return false;
  return true;
}

export function stagePhysicsVenue(bus, kind, id) {
  if (!bus || !['gallery', 'league'].includes(kind) || typeof id !== 'string') return false;
  pending = { kind, id, token: ++launchSerial, ready: false };
  bus.emit('game:new', { seed: 1845, physicsVenueSession: true });
  return true;
}
export function installPhysicsVenueHooks(bus, getContext) {
  const offs = [];
  const on = (type, fn) => { const off = bus.on(type, fn); if (typeof off === 'function') offs.push(off); };
  const enterReadyVenue = () => {
    if (!pending?.ready || getContext?.()?.state?.mode !== 'flight') return;
    const launch = pending; pending = null;
    if (launch.token !== launchSerial) return;
    bus.emit('physics-venues:records', readPhysicsVenueRecords());
    bus.emit(launch.kind === 'gallery' ? 'orbital-gallery:enter' : 'kinetic-league:enter',
      launch.kind === 'gallery' ? { scenarioId: launch.id } : { eventId: launch.id });
  };
  // Derived intents must leave the worker receipt's echo-suppression scope. Boot can also
  // finish before the authored visual gate releases flight, so consume only after both.
  on('game:started', () => { if (pending) pending.ready = true; queueMicrotask(enterReadyVenue); });
  on('mode:changed', () => queueMicrotask(enterReadyVenue));
  const cancel = () => { pending = null; launchSerial += 1; };
  on('game:exitToMenu', cancel);
  on('game:load', cancel);
  on('game:new', opts => { if (opts?.physicsVenueSession !== true) cancel(); });
  const record = (kind, payload) => {
    const ctx = getContext?.();
    const records = readPhysicsVenueRecords();
    if (kind === 'gallery') records.gallery = normalizeLedger(payload?.ledger || ctx?.state?.orbitalGalleryLedger);
    else records.league = normalizeLeagueMemory(payload?.memory || ctx?.state?.kineticLeague);
    try { localStorage.setItem(KEY, JSON.stringify(records)); }
    catch { bus.emit('toast', { text: 'Result earned. This browser could not store your local record.', kind: 'info', ttl: 5 }); }
  };
  on('orbital-gallery:finished', payload => record('gallery', payload));
  on('kinetic-league:finished', payload => record('league', payload));
  return () => { for (const off of offs) off(); };
}
export function venueResultText(view) {
  if (view?.result) return `${view.result.won ? 'Challenge complete' : 'Try again'} · ${view.result.reason || ''}${view.result.score ? ` · ${view.result.score.total} points` : ''}`;
  const progress = view?.progress;
  if (progress && view.phase !== 'play') return `${progress.solved ? 'Event complete' : 'Try again'} · ${progress.points || progress.score || 0} points`;
  return `${Math.ceil(view?.remainingSeconds || 0)}s remaining${view?.target ? ` · ${view.shots || 0}/${view.target} deliveries` : ''}`;
}
export function mountPhysicsVenueHud({ root, state, bus, screens }) {
  if (!root || typeof document === 'undefined') return null;
  const panel = el('section', 'race-tape dp-glass');
  panel.id = 'physics-venue-instrument'; panel.hidden = true; panel.setAttribute('aria-label', 'Physics challenge');
  const readings = el('div', 'race-tape-readings'), title = el('div', 'race-tape-title');
  const result = el('div', 'race-tape-stats'), hint = el('div', 'race-tape-hint');
  const controls = el('div', 'race-tape-actions');
  const button = (label, fn) => { const b = el('button', 'k-word', label); b.type = 'button'; b.addEventListener('click', fn); controls.append(b); };
  const intent = verb => { const kind = state.physicsVenuePublic?.kind; if (kind) bus.emit(`${kind === 'gallery' ? 'orbital-gallery' : 'kinetic-league'}:${verb}`, {}); };
  button('Retry', () => intent('retry'));
  button('Challenges', () => screens?.pushScreen?.('physicsVenues'));
  button('Leave event', () => intent('leave'));
  readings.append(title, result, hint); panel.append(readings, controls); root.append(panel);
  let last = '';
  return { frame(st = state) {
    const view = st.physicsVenuePublic;
    const hide = st.mode !== 'flight' || !view?.active || !!screens?.isOpen?.();
    if (panel.hidden !== hide) panel.hidden = hide; // a same-value write still invalidates style
    if (hide) return;
    const signature = `${view.title}|${venueResultText(view)}|${view.instruction}`;
    if (signature === last) return; last = signature;
    title.textContent = view.title; result.textContent = venueResultText(view); hint.textContent = view.instruction;
  }, dispose() { panel.remove(); } };
}
