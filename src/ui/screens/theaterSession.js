// UI-owned transport for a tape rendered by uiStage on the game's existing renderer.
// The renderer receives this plain request; neither side can advance GameState.
import { sealTheaterTape } from '../../sim/theaterTape.js';
import { analyzeMomentStream, planShot, createOfflineCameraLease } from '../../presentation/momentMachine/index.js';

export function createTheaterSession(recording, state, { startTick, endTick, moment } = {}) {
  const tape = sealTheaterTape(recording, { startTick, endTick });
  if (!tape || !state) return null;
  const analysis = analyzeMomentStream({ adventureTape: recording, chronicle: state.chronicler, locale: state.settings?.locale });
  const chosen = moment || analysis.selection?.ranked?.[0] || null;
  const plan = chosen && analysis.selection?.stream ? planShot(analysis.selection.stream, chosen) : null;
  const lease = plan ? createOfflineCameraLease(plan) : null;
  const ui = state.ui || (state.ui = {}), previous = ui.theater;
  let disposed = false, readyResolve;
  const ready = new Promise((resolve) => { readyResolve = resolve; });
  const session = {
    tape, recording, moment: chosen, plan, cameraLease: lease,
    elapsed: 0, revision: 0, exporting: false, ready: false, status: 'loading',
    photo: { enabled: false, yaw: 0, pitch: 0.75, distance: 1, panX: 0, panZ: 0 },
    renderAt: null,
    seek(seconds) {
      if (disposed) return;
      session.elapsed = Math.max(0, Math.min((tape.samples - 1) / tape.sampleRate, Number(seconds) || 0));
      session.revision++;
    },
    setPhoto(on) { session.photo.enabled = !!on; session.revision++; },
    orbit(dx, dy) {
      if (!session.photo.enabled) return;
      session.photo.yaw += dx * 0.008;
      session.photo.pitch = Math.max(0.15, Math.min(1.5, session.photo.pitch + dy * 0.008));
      session.revision++;
    },
    zoom(delta) {
      if (!session.photo.enabled) return;
      session.photo.distance = Math.max(0.2, Math.min(5, session.photo.distance * Math.exp(delta * 0.001)));
      session.revision++;
    },
    pan(x, z) {
      if (!session.photo.enabled) return;
      session.photo.panX += x; session.photo.panZ += z; session.revision++;
    },
    waitReady() { return ready; },
    onStatus(status) {
      session.status = status; session.ready = status === 'live';
      if (status === 'live' || status === 'unavailable') readyResolve(session.ready);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      session.renderAt = null;
      lease?.release(); readyResolve(false);
      if (ui.theater === session) ui.theater = previous || null;
    },
  };
  session.request = { scene: 'replay-theater', tape, control: session, onStatus: session.onStatus };
  ui.theater = session;
  return session;
}
