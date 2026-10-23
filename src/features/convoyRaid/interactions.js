import { SWITCHBACK } from './catalog.js';
import { getCouplerGeometry } from './train.js';

const NONE = Object.freeze([]);
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const alive = body => !!body && body.lost !== true && body.alive !== false && (!(Number.isFinite(body.hp)) || body.hp > 0);
const textId = id => typeof id === 'string' || Number.isSafeInteger(id) ? String(id).slice(0, 120) : '';

/** Reused, DOM-free description of the ONE physically nearest service coupling. */
export function createSwitchbackInteractionFrame() {
  return { visible: false, runId: '', couplerId: '', targetBoundary: false,
    x: 0, z: 0, distance: Infinity, relativeSpeed: Infinity, tension: 0,
    braced: false, servicing: false, progress: 0, eligible: false, reason: '',
    // Geometry scratch is view-owned and must never be serialized with gameplay.
    geometry: { a: { x: 0, z: 0 }, b: { x: 0, z: 0 }, mid: { x: 0, z: 0 } },
  };
}

/**
 * Reads real solver geometry. This hint never authorizes an action: the runtime
 * and controller must revalidate run identity, proximity, velocity and strain.
 */
export function describeSwitchbackInteraction(input, out = createSwitchbackInteractionFrame()) {
  out.visible = false; out.eligible = false; out.servicing = false; out.progress = 0;
  out.couplerId = ''; out.distance = Infinity; out.reason = '';
  const raid = input?.raid, train = input?.train, player = input?.player;
  if (!raid || raid.phase !== 'running' || !train || !alive(player)
    || (input.mode && input.mode !== 'flight')) return out;
  const now = finite(input.simTime, finite(raid.lastSimTime));
  const bodies = Array.isArray(train.bodies) ? train.bodies : NONE;
  const couplers = Array.isArray(train.couplers) ? train.couplers : NONE;
  let chosen = null, a = null, b = null;
  for (let i = 0; i < Math.min(couplers.length, 5); i++) {
    const c = couplers[i];
    if (c.severed) continue;
    let ca = null, cb = null;
    for (let j = 0; j < Math.min(bodies.length, 6); j++) {
      if (bodies[j].id === c.aId) ca = bodies[j];
      if (bodies[j].id === c.bId) cb = bodies[j];
    }
    if (!alive(ca) || !alive(cb)) continue;
    const g = getCouplerGeometry(train, c.id, out.geometry);
    if (!g?.mid || !Number.isFinite(g.mid.x) || !Number.isFinite(g.mid.z)) continue;
    const distance = Math.hypot(finite(player.x) - g.mid.x, finite(player.z) - g.mid.z);
    // The armed coupling keeps focus during service; another crossing carriage
    // cannot steal a printed action while the player is holding station.
    const armed = textId(c.id) === textId(raid.quietLatch?.couplerId);
    if (distance <= SWITCHBACK.latchRange && (armed || distance < out.distance)) {
      chosen = c; a = ca; b = cb; out.distance = distance;
      out.x = g.mid.x; out.z = g.mid.z; out.tension = Math.max(0, finite(g.tension));
      if (armed) break;
    }
  }
  if (!chosen) return out;
  out.visible = true; out.runId = textId(raid.runId); out.couplerId = textId(chosen.id);
  out.targetBoundary = chosen.aId === raid.targetId || chosen.bId === raid.targetId;
  out.relativeSpeed = Math.hypot(finite(player.vx) - (finite(a.vx) + finite(b.vx)) * .5,
    finite(player.vz) - (finite(a.vz) + finite(b.vz)) * .5);
  out.braced = finite(chosen.braceUntil) > now;
  out.servicing = textId(raid.quietLatch?.couplerId) === out.couplerId;
  out.progress = out.servicing ? Math.max(0, Math.min(1,
    finite(raid.quietLatch.heldS) / Math.max(.01, finite(raid.quietLatch.requiredS, SWITCHBACK.latchHoldS)))) : 0;
  out.eligible = !out.braced && out.relativeSpeed <= SWITCHBACK.latchSpeed && out.tension <= SWITCHBACK.latchTension;
  out.reason = out.braced ? 'Cross brace locked. Wait for the service window.'
    : out.relativeSpeed > SWITCHBACK.latchSpeed ? 'Match the carriage velocity before releasing its latch.'
      : out.tension > SWITCHBACK.latchTension ? 'Coupling under load. Ease the tension to operate the service latch.'
        : out.servicing ? 'Keep matching velocity. Leaving the latch cancels the operation.'
          : 'A service release preserves the moving freight’s velocity.';
  return out;
}

/**
 * Production prompt-deck adapter, using the existing deck's exact public API.
 * Construct in the UI/render owner:
 *   createSwitchbackInteractions({ bus, getDeck: getPromptDeck })
 * then update({ raid, train, player: flatPhysicsObservation, simTime, mode }).
 *
 * No custom DOM, listeners, key bindings, pointer capture or gameplay writes.
 * Deck Digit1–9, pointer, gamepad and cancel routing remain single-owned.
 * The namespaced command event is declared here and consumed by runtime.js.
 */
export function createSwitchbackInteractions({ bus, getDeck } = {}) {
  if (!bus || typeof bus.emit !== 'function' || typeof getDeck !== 'function') {
    throw new TypeError('SWITCHBACK interactions require the event bus and getPromptDeck function.');
  }
  const frame = createSwitchbackInteractionFrame();
  let disposed = false, deck = null, activeId = null, shownKey = '', runId = '';
  let dismissed = '', pending = '', pendingUntil = 0, lastNow = -Infinity, lastRefresh = -Infinity;
  let currentInput = null, revision = 0;
  function hide() {
    if (activeId && deck) deck.resolveDecision(activeId);
    activeId = null; shownKey = ''; revision++;
  }
  function send(type, couplerId) {
    bus.emit('convoyRaid:command', { runId: frame.runId, type, ...(couplerId ? { couplerId } : {}) });
  }
  return {
    update(input) {
      if (disposed) return false;
      currentInput = input;
      const now = finite(input?.simTime, finite(input?.raid?.lastSimTime));
      const currentDeck = getDeck();
      if (currentDeck !== deck) { hide(); deck = currentDeck; dismissed = ''; }
      if (!deck) return false;
      if (now < lastNow || textId(input?.raid?.runId) !== runId) {
        hide(); pending = dismissed = ''; pendingUntil = 0; lastRefresh = -Infinity;
        runId = textId(input?.raid?.runId);
      }
      lastNow = now;
      describeSwitchbackInteraction(input, frame);
      if (!frame.visible) { hide(); dismissed = pending = ''; return false; }
      if (pending && (now >= pendingUntil || frame.servicing || pending !== frame.couplerId)) pending = '';
      if (dismissed && dismissed !== frame.couplerId) dismissed = '';
      if (dismissed === frame.couplerId || pending === frame.couplerId) { hide(); return false; }
      // Physics is sampled every update; only textual changes are cadenced.
      if (now - lastRefresh < .1 && activeId && deck.hasDecision(activeId)) return true;
      lastRefresh = now;
      const percent = Math.floor(frame.progress * 10) * 10;
      const nextKey = `${runId}|${frame.couplerId}|${frame.eligible}|${frame.braced}|${frame.servicing}|${percent}|${frame.reason}`;
      if (nextKey === shownKey && activeId && deck.hasDecision(activeId)) return true;
      shownKey = nextKey;
      const id = `switchback:coupler:${runId}`;
      const chosenCoupler = frame.couplerId, chosenRun = frame.runId;
      const serial = typeof input.raid.targetSerial === 'string' ? input.raid.targetSerial.slice(0, 96) : 'Marked freight';
      const servicing = frame.servicing;
      const detail = servicing ? `${percent}% · ${frame.reason}`
        : `${frame.reason} Stay within ${SWITCHBACK.latchRange} and match speed for ${SWITCHBACK.latchHoldS}s. `
          + (input.raid.mode === 'escort' ? 'Releasing freight breaks your lawful escort contract.' : 'The crew reports a released coupling as theft.');
      const thisRevision = ++revision;
      const spec = {
        id, sender: `SWITCHBACK · ${serial}`, kind: servicing ? 'warn' : frame.eligible ? 'info' : 'warn',
        headline: servicing ? 'Service latch armed' : frame.targetBoundary ? 'Target carriage coupling' : 'Freight coupling',
        detail,
        statusFlag: servicing ? 'Hold station; move away to cancel.' : 'Flight remains active.',
        choices: servicing ? [
          { id: 'cancel', label: 'Cancel service latch', cancel: true },
        ] : [
          { id: 'release', label: 'Release coupling', disabled: !frame.eligible, danger: true,
            reason: frame.eligible ? undefined : frame.reason },
          { id: 'leave', label: 'Leave coupling', cancel: true },
        ],
        onChoose(choiceId) {
          if (disposed || revision !== thisRevision || frame.runId !== chosenRun
            || frame.couplerId !== chosenCoupler) return;
          // Fresh projection prevents a stale click from arming a different
          // coupling between the render prompt and the next fixed simulation.
          describeSwitchbackInteraction(currentInput, frame);
          if (!frame.visible || frame.runId !== chosenRun || frame.couplerId !== chosenCoupler) { hide(); return; }
          const commandTime = finite(currentInput?.simTime, now);
          if (choiceId === 'cancel' && frame.servicing) {
            send('cancelLatch'); pending = chosenCoupler; pendingUntil = commandTime + .3; hide();
          } else if (choiceId === 'release' && frame.eligible && !frame.servicing) {
            pending = chosenCoupler; pendingUntil = commandTime + .3; hide(); send('releaseCoupler', chosenCoupler);
          } else if (choiceId === 'leave') { dismissed = chosenCoupler; hide(); }
        },
      };
      if (activeId && activeId !== id) hide();
      activeId = id;
      if (!deck.updateDecision(id, spec)) deck.offerDecision(spec);
      return true;
    },
    inspect() {
      return { disposed, activeId, runId, couplerId: frame.couplerId, eligible: frame.eligible,
        servicing: frame.servicing, progress: frame.progress, visible: frame.visible };
    },
    dispose() {
      if (disposed) return;
      disposed = true; hide(); currentInput = null; deck = null;
    },
  };
}
