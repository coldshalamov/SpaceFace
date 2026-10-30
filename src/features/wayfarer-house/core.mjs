import { VERSION, ROLES, PODS, ROUTE, DESTINATIONS, LIMITS, at } from './data.mjs';

const phases = new Set(['preparing', 'moving', 'recovery', 'choosing', 'berthing', 'settled', 'lost', 'retired']);
const terminal = s => ['settled', 'lost', 'retired'].includes(s.phase);
const finite = n => Number.isFinite(n) && Math.abs(n) <= 1e9;
export const distance = (a, b) => a && b ? Math.hypot(a.x - b.x, a.z - b.z) : Infinity;
export const relativeSpeed = (a, b) => a && b ? Math.hypot(a.x - b.x, a.z - b.z) : Infinity;
export const clone = o => JSON.parse(JSON.stringify(o));

export function createJourney({ origin, sectorId, id = 'wayfarer_house_1' }, simTime = 0) {
  if (!origin || !finite(origin.x) || !finite(origin.z) || !finite(simTime) || simTime < 0
    || !/^[a-z0-9_]{1,64}$/.test(id) || typeof sectorId !== 'string' || sectorId.length > 96) {
    throw new TypeError('Wayfarer House needs a stable id, sector and finite global origin');
  }
  return { version: VERSION, id, origin: { x: origin.x, z: origin.z }, sectorId,
    phase: 'preparing', revision: 0, lastSimTime: simTime, elapsed: 0, legTime: 0,
    leg: 0, destination: null, separation: 'pending', captureTime: 0, berthTime: 0,
    participation: 0, rewardClaimed: false, reputationClaimed: false, consequence: null, departureConfirmed: false,
    pods: Object.fromEntries(PODS.map(p => [p.id, { disposition: 'aboard', supplied: false }])),
    civilians: { mara: 'alive', ivo: 'alive', sen: 'alive' },
    threat: 'pending', retiredReason: null };
}

// Restore only a closed schema. Unknown versions/corrupt records fail without partial adoption.
export function restoreJourney(input) {
  if (!input || input.version !== VERSION) throw new TypeError('Unsupported Wayfarer save version');
  const s = createJourney(input, input.lastSimTime);
  if (!phases.has(input.phase) || !Number.isSafeInteger(input.revision) || input.revision < 0
    || !Number.isInteger(input.leg) || input.leg < 0 || input.leg > ROUTE.length
    || !['pending', 'requested', 'separated', 'recovered', 'lost', 'abandoned'].includes(input.separation)
    || !['pending', 'active', 'cleared'].includes(input.threat)
    || (input.destination !== null && !Object.hasOwn(DESTINATIONS, input.destination))) {
    throw new TypeError('Invalid Wayfarer save state');
  }
  for (const k of ['elapsed', 'legTime', 'captureTime', 'berthTime', 'participation']) {
    if (!finite(input[k]) || input[k] < 0 || input[k] > 1e7) throw new TypeError('Invalid Wayfarer timer');
    s[k] = input[k];
  }
  for (const k of ['rewardClaimed', 'reputationClaimed', 'departureConfirmed']) {
    if (typeof input[k] !== 'boolean') throw new TypeError('Invalid Wayfarer latch');
    s[k] = input[k];
  }
  for (const p of PODS) {
    const v = input.pods?.[p.id];
    if (!v || !['aboard', 'separated', 'lost', 'abandoned'].includes(v.disposition)
      || typeof v.supplied !== 'boolean') throw new TypeError('Invalid Wayfarer pod');
    s.pods[p.id] = { disposition: v.disposition, supplied: v.supplied };
    if (!['alive', 'lost'].includes(input.civilians?.[p.civilian])) throw new TypeError('Invalid civilian');
    s.civilians[p.civilian] = input.civilians[p.civilian];
  }
  for (const k of ['phase', 'revision', 'leg', 'destination', 'separation', 'threat']) s[k] = input[k];
  if (input.phase !== 'settled' && (s.rewardClaimed || s.reputationClaimed)) throw new TypeError('Premature settlement latch');
  if (input.phase === 'settled') {
    if (!input.destination || input.leg !== ROUTE.length) throw new TypeError('Invalid settlement');
    s.consequence = consequenceFor(s); // derive; never trust imported services or reward amounts
  } else if (input.consequence != null) throw new TypeError('Premature consequence');
  s.retiredReason = input.phase === 'retired' ? String(input.retiredReason || 'retired').slice(0,96) : null;
  return s;
}

export function survivors(s) { return PODS.filter(p => s.pods[p.id].disposition === 'aboard'); }
export function consequenceFor(s) {
  const destination = DESTINATIONS[s.destination];
  if (!destination) return null;
  return { destination: s.destination, factionId: destination.factionId,
    reputation: survivors(s).length ? destination.rep : 0,
    services: survivors(s).filter(p => s.pods[p.id].supplied && s.civilians[p.civilian] === 'alive').map(p => p.service),
    lostPods: PODS.filter(p => s.pods[p.id].disposition !== 'aboard').map(p => p.id),
    rewardCr: s.participation >= LIMITS.participationS ? survivors(s).length * LIMITS.rewardPerPod : 0 };
}

export function targetFor(s) {
  if (s.phase === 'moving') return at(s.origin, ROUTE[s.leg]);
  if (s.phase === 'berthing' && s.destination) return at(s.origin, DESTINATIONS[s.destination]);
  return null;
}

// Commands are revision-guarded by the adapter. This kernel accepts only already-authorized
// owner receipts (supply, separation, reconnect); it does not infer success from a button press.
export function command(s, kind, value = null) {
  if (terminal(s)) return false;
  if (kind === 'depart' && s.phase === 'preparing') {
    s.departureConfirmed = true; s.phase = 'moving';
  } else if (kind === 'supplied' && PODS.some(p => p.id === value)
    && s.pods[value].disposition === 'aboard' && !s.pods[value].supplied) {
    s.pods[value].supplied = true;
  } else if (kind === 'separated' && s.separation === 'requested') {
    s.separation = 'separated'; s.pods.garden.disposition = 'separated'; s.phase = 'recovery';
  } else if (kind === 'reconnected' && s.phase === 'recovery' && s.captureTime >= LIMITS.recoverS) {
    s.pods.garden.disposition = 'aboard'; s.separation = 'recovered'; s.phase = 'moving'; s.captureTime = 0;
  } else if (kind === 'abandon' && s.phase === 'recovery') {
    s.pods.garden.disposition = 'abandoned'; s.separation = 'abandoned'; s.phase = 'moving';
  } else if (kind === 'choose' && s.phase === 'choosing' && Object.hasOwn(DESTINATIONS, value)) {
    s.destination = value; s.phase = 'berthing'; s.berthTime = 0;
  } else if (kind === 'retire') {
    s.phase = 'retired'; s.retiredReason = 'player_withdrew';
  } else return false;
  s.revision++; return true;
}

// One fixed-step observation of exactly four bodies, two destinations, and two raiders.
// Missing/unmaterialized bodies pause rather than becoming fictional casualties.
export function stepJourney(s, simTime, view) {
  const effects = [];
  if (!finite(simTime) || simTime < s.lastSimTime) return effects;
  const dt = simTime - s.lastSimTime;
  s.lastSimTime = simTime;
  if (terminal(s)) return effects;
  // Integration must use the fixed-step clock. A load/sector gap is NOT offscreen progress.
  if (dt > LIMITS.maxStepS) return effects;
  if (view.bodies.tug?.alive === false) { s.phase = 'lost'; s.revision++; return effects; }
  for (const pod of PODS) {
    if (view.bodies[pod.id]?.alive === false && !['lost', 'abandoned'].includes(s.pods[pod.id].disposition)) {
      s.pods[pod.id].disposition = 'lost'; s.civilians[pod.civilian] = 'lost';
      if (pod.id === 'garden') { s.separation = 'lost'; if (s.phase === 'recovery') s.phase = 'moving'; }
      s.revision++; effects.push({ kind: 'loss', civilian: pod.civilian });
    }
  }
  if (PODS.every(p => s.pods[p.id].disposition === 'lost')) { s.phase = 'lost'; s.revision++; return effects; }
  if (dt === 0 || !view.present) return effects;
  const needed = ['tug', ...PODS.filter(p => !['lost', 'abandoned'].includes(s.pods[p.id].disposition)).map(p => p.id)];
  if (needed.some(id => !view.bodies[id])) return effects;
  s.elapsed = Math.min(1e7, s.elapsed + dt);
  if (s.phase !== 'preparing') s.participation = Math.min(1e7, s.participation + dt);
  if (s.phase === 'berthing' && view.available[s.destination] !== true) {
    s.phase = 'choosing'; s.destination = null; s.berthTime = 0; s.revision++;
    effects.push({ kind: 'destination_closed' }); return effects;
  }
  const tug = view.bodies.tug;
  if (s.phase === 'moving') {
    s.legTime = Math.min(1e7, s.legTime + dt);
    if (s.leg === 2 && s.separation === 'pending' && s.pods.garden.disposition === 'aboard') {
      s.separation = 'requested'; s.revision++; effects.push({ kind: 'separate' });
    }
    // Reissue an unacknowledged request after load; adapter verifies the exact attachment.
    if (s.separation === 'requested') {
      if (!effects.length) effects.push({ kind: 'separate' });
      return effects;
    }
    if (s.leg >= 1 && s.threat === 'pending') effects.push({ kind: 'defense' });
    if (view.threatCleared && s.threat === 'active') { s.threat = 'cleared'; s.revision++; }
    const lineReady = survivors(s).every(p => view.linked[p.id] === true);
    if (s.legTime >= ROUTE[s.leg].minS && distance(tug.pos, targetFor(s)) <= LIMITS.range
      && lineReady && (s.leg < 3 || s.threat === 'cleared')) {
      s.leg++; s.legTime = 0; s.revision++;
      if (s.leg === ROUTE.length) s.phase = 'choosing';
    }
  } else if (s.phase === 'recovery') {
    const pod = view.bodies.garden;
    const receiver = ['clinic','hearth'].map(id => view.bodies[id]).find(body => body?.alive) || tug;
    const stable = view.playerTowingGarden && distance(pod.pos, receiver.pos) <= LIMITS.captureRange
      && relativeSpeed(pod.vel, receiver.vel) <= LIMITS.relativeSpeed;
    s.captureTime = stable ? Math.min(LIMITS.recoverS, s.captureTime + dt) : 0;
    if (s.captureTime >= LIMITS.recoverS) effects.push({ kind: 'reconnect' });
  } else if (s.phase === 'berthing') {
    const target = targetFor(s);
    const moored = survivors(s).every(p => distance(view.bodies[p.id]?.pos, target) <= 360
      && relativeSpeed(view.bodies[p.id]?.vel, { x: 0, z: 0 }) <= LIMITS.relativeSpeed);
    const stable = distance(tug.pos, target) <= LIMITS.range && moored
      && relativeSpeed(tug.vel, { x: 0, z: 0 }) <= LIMITS.relativeSpeed && s.threat !== 'active';
    s.berthTime = stable ? Math.min(LIMITS.berthS, s.berthTime + dt) : 0;
    if (s.berthTime >= LIMITS.berthS) {
      s.phase = 'settled'; s.consequence = consequenceFor(s); s.revision++;
    }
  }
  return effects;
}

export function objective(s) {
  if (s.phase === 'preparing') return 'Supply the three pods, then confirm departure. Supplies are optional; services are not.';
  if (s.phase === 'recovery' || s.separation === 'requested') return 'Recover Last Orchard beside Blue Room: tow within 115 wu at less than 6 wu/s for eight seconds, or leave it behind.';
  if (s.phase === 'choosing') return 'Choose an available harbour. Both closed? Hold here or withdraw; no destination is silently substituted.';
  if (s.phase === 'berthing') return 'Defend and moor the surviving house at the chosen harbour.';
  if (s.phase === 'moving') return `Escort Wayfarer House: ${ROUTE[s.leg].label}. Keep every surviving pod attached.`;
  if (s.phase === 'settled') return 'Wayfarer House has a new address.';
  return s.phase === 'lost' ? 'The relocation was lost. No completion or payment was claimed.' : 'The house remembers your departure.';
}
