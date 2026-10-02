// Authored-motion driver (ANI-00): connects a bound motion bank to sim time and gameplay events.
//
// The contracts layer (motionBank.js) stays simulation-free; this module is the ship-side glue:
//   • attachAuthoredMotionDriver mounts per-frame + per-event surfaces on the ship root, beside
//     the damage/drive drivers the renderer already calls.
//   • installAuthoredMotionBus subscribes to gameplay events once per renderer and dispatches them
//     to the owning entity's controllers. Acceptance is strict: a scan pulse must carry the
//     scanner-owned source field and a monotonically increasing sequence, so a replayed or
//     foreign 'scan:pulse' cannot retrigger the dish.
//
// LOD rebind needs no code path of its own: bindAuthoredMotion holds every same-named pivot in
// the instance (one per mounted LOD file) and parks invisible subtrees at rest, so a level swap
// is just a visibility flip on an already-bound node.

import { bindAuthoredMotion } from '../contracts/motionBank.js';

const ACCEPTED_SCAN_SOURCE = 'player-scanner';

// entityId -> Set<controller>. entity.id is the durable join key the scanner payload carries.
const registry = new Map();

export function registerAuthoredMotionController(entityId, controller) {
  if (entityId == null || !controller) return;
  let set = registry.get(entityId);
  if (!set) {
    set = new Set();
    registry.set(entityId, set);
  }
  set.add(controller);
}

export function unregisterAuthoredMotionController(entityId, controller) {
  const set = registry.get(entityId);
  if (!set) return;
  set.delete(controller);
  if (!set.size) registry.delete(entityId);
}

export function authoredMotionControllersFor(entityId) {
  const set = registry.get(entityId);
  return set ? [...set] : [];
}

export function authoredMotionRegistrySize() {
  return registry.size;
}

/**
 * The authored-motion clock. It tracks sim time while the sim advances — clips paired with
 * sim quantities (payout, damage windows) stay locked to it — and falls back to wall-clock
 * delta while the sim is frozen. Docked work lives on the keepalive's wall dt (the yard's
 * jobs tick while ui.docked pins simTime at zero), so their clips must follow the same clock
 * or a docked deploy renders its rest key for the whole job.
 */
export function createAuthoredClock({ simNow, wallNow } = {}) {
  const readSim = typeof simNow === 'function' ? simNow : () => 0;
  const readWall = typeof wallNow === 'function' ? wallNow : () => 0;
  let clockS = null;
  let lastSim = 0;
  let lastWall = 0;
  return function authoredClock() {
    const sim = Number(readSim()) || 0;
    const wall = Number(readWall()) || 0;
    if (clockS == null) {
      clockS = sim;
    } else {
      const simDelta = sim - lastSim;
      const wallDelta = wall - lastWall;
      // Monotonic forward: a sim reset (new game/sector) never runs clips backwards — the
      // frozen branch also covers backwards jumps by taking the wall delta instead.
      clockS += simDelta > 0 ? simDelta : Math.min(Math.max(wallDelta, 0), 0.5);
    }
    lastSim = sim;
    lastWall = wall;
    return clockS;
  };
}

/**
 * Bind one bank per bound pivot root and attach the composite driver to the ship root.
 *
 * Returns a detach callback for the render-package dispose path (a package generation swap or a
 * ship rebuild must not leak entity-keyed controller registrations).
 */
export function attachAuthoredMotionDriver(root, entity, controllers) {
  const entityId = entity && entity.id;
  const live = (controllers || []).filter(Boolean);
  if (!root || !live.length) return null;

  // Replace, don't accumulate: an entity rebuild rebinds fresh controllers on the same key, and
  // the stale set must release with its old root rather than keep updating detached pivots.
  registry.set(entityId, new Set(live));

  const detach = function detachAuthoredMotionDriver() {
    const set = registry.get(entityId);
    if (set) {
      for (const controller of live) set.delete(controller);
      if (!set.size) registry.delete(entityId);
    }
    if (root.userData.authoredMotionControllers === live) {
      delete root.userData.authoredMotionControllers;
      delete root.userData.updateAuthoredMotion;
      delete root.userData.authoredMotionEvent;
      delete root.userData.authoredMotionPadSpec;
      delete root.userData.__authoredMotionPad;
    }
    if (root.userData.detachAuthoredMotion === detach) {
      delete root.userData.detachAuthoredMotion;
    }
  };

  root.userData.authoredMotionControllers = live;
  // Max authored travel each bound pivot can impart, per binding — the cull envelope folds
  // this in lazily (world-space subtree radius at first query, post-fit) so an animated arm
  // can't draw beyond the committed bounds it was measured at rest.
  const motionPadSpec = [];
  for (const controller of live) {
    const spec = controller.motionPadSpec;
    if (Array.isArray(spec)) motionPadSpec.push(...spec);
  }
  if (motionPadSpec.length) root.userData.authoredMotionPadSpec = motionPadSpec;
  else delete root.userData.authoredMotionPadSpec;
  delete root.userData.__authoredMotionPad;
  root.userData.updateAuthoredMotion = function updateAuthoredMotion(liveEntity, simNow) {
    for (const controller of live) controller.update(simNow);
  };
  root.userData.authoredMotionEvent = function authoredMotionEvent(type, payload, simNow) {
    for (const controller of live) controller.handleEvent?.(type, payload, simNow);
  };
  // Named after the same userData-callback convention disposeObject already dispatches
  // (disposeWorldSitePresentation, releaseAuthoredAssetResidency, ...).
  root.userData.detachAuthoredMotion = detach;

  return detach;
}

/**
 * Wire gameplay events to bound controllers. Called once with the session bus, next to the other
 * motion-system bindEvents calls. `clock` supplies the authored-motion clock second for event
 * payloads that carry no simTime of their own (mining events don't); `simClock` supplies raw
 * simTime so simTime-carrying payloads can be translated onto the authored clock — the two run
 * in the same units while the sim advances but diverge whenever the dock freeze pins simTime.
 * Returns an unbind function.
 */
export function installAuthoredMotionBus(bus, { clock, simClock, playerEntityId, entityForStationId } = {}) {
  if (!bus || typeof bus.on !== 'function') return null;
  const playerId = () => (typeof playerEntityId === 'function' ? playerEntityId() : null);
  const simNow = () => (typeof clock === 'function' ? Number(clock()) || 0 : 0);
  const rawSimNow = () => (typeof simClock === 'function' ? Number(simClock()) : null);
  // Clip anchors live on the clock the evaluators run. While the dock freeze pins simTime the
  // authored clock keeps advancing on wall dt, so a payload's simTime is translated onto that
  // domain — anchoring on raw simTime would leave the anchor permanently behind the eval clock
  // after any freeze and every later sim-anchored clip would evaluate past its end and park.
  const anchorS = (payload) => {
    const raw = rawSimNow();
    return payload && Number.isFinite(payload.simTime) && raw != null
      ? simNow() + (payload.simTime - raw)
      : simNow();
  };
  const dispatch = (type, entityId, payload, accept) => {
    if (entityId == null) return;
    const anchor = anchorS(payload);
    for (const controller of authoredMotionControllersFor(entityId)) {
      if (!accept(controller)) continue;
      try {
        controller.handleEvent?.(type, payload, anchor);
      } catch (error) {
        console.warn(`[authoredMotion] ${type} rejected by controller`, error);
      }
    }
  };
  const onScanPulse = (payload) => {
    if (!payload || payload.source !== ACCEPTED_SCAN_SOURCE) return;
    dispatch('scan:pulse', payload.scannerId, payload, () => true);
  };
  // ANI-02: the mining head only deploys for cutter verbs — repair/transfer locks use other
  // tools, and salvage-pickup yields must never jab a parked head.
  const CUTTER_VERBS = new Set(['extract', 'cut']);
  const isCutterVerb = (payload) => CUTTER_VERBS.has(payload && payload.verb);
  const deployed = (controller) => controller.clipActive?.('deploy') || controller.clipActive?.('bite')
    || controllerJawOpen(controller);
  const onMiningStart = (payload) => {
    if (!isCutterVerb(payload)) return;
    dispatch('mining:start', payload.minerId, payload, (c) => !deployed(c));
  };
  const onMiningYield = (payload) => {
    dispatch('mining:yield', payload.minerId, payload, deployed);
  };
  const onMiningStop = (payload) => {
    dispatch('mining:stop', payload.minerId, payload, deployed);
  };
  const onBeamDenied = (payload) => {
    if (!isCutterVerb(payload)) return;
    dispatch('beam:denied', payload.minerId, payload, deployed);
  };
  // ANI-03: the massline winch pays out when its owner attaches a tether or deploys a snare,
  // reacts on snap catch, winds on reel pumps, and slack-releases on release/denial. Events
  // that name the winch owner route by actorId/sourceId; player-side telemetry events carry
  // only targetId (the tug actor is implicit — the player ship is entity 0), so they route to
  // PLAYER_ENTITY_ID and no-op on entities that never bound a winch bank.
  const PLAYER_ENTITY_ID = 0;
  const lineDeployed = (controller) =>
    controller.clipActive?.('payout') || controller.clipActive?.('catch') || controller.clipActive?.('reel');
  const onTetherAttached = (payload) => {
    dispatch('tether:attached', payload && payload.actorId, payload, (c) => !lineDeployed(c));
  };
  const onSnareDeployed = (payload) => {
    dispatch('massline:snareDeployed', payload && payload.sourceId, payload, (c) => !lineDeployed(c));
  };
  const onSnapCatch = (payload) => {
    dispatch('tether:snapCatch', PLAYER_ENTITY_ID, payload, lineDeployed);
  };
  const onReelPump = (payload) => {
    dispatch('tether:reelPump', PLAYER_ENTITY_ID, payload, lineDeployed);
  };
  const onTetherReleased = (payload) => {
    dispatch('tether:released', PLAYER_ENTITY_ID, payload, lineDeployed);
  };
  const onSnareEnded = (payload) => {
    dispatch('massline:snareEnded', PLAYER_ENTITY_ID, payload, lineDeployed);
  };
  const onLatchDenied = (payload) => {
    dispatch('tether:latchDenied', PLAYER_ENTITY_ID, payload, lineDeployed);
  };
  // ANI-05: drive iris on the boost lifecycle. stow is gated so a stray boostStop (or a ship that
  // never opened) doesn't replay the retract against an already-parked iris.
  const irisOpen = (controller) => controller.clipActive?.('irisPrime')
    || controller.clipActive?.('irisIgnite');
  const onBoostPreKick = (payload) => {
    dispatch('ship:boostPreKick', payload.shipId, payload, () => true);
  };
  const onBoostStart = (payload) => {
    dispatch('ship:boostStart', payload.shipId, payload, () => true);
  };
  const onBoostStop = (payload) => {
    dispatch('ship:boostStop', payload.shipId, payload, irisOpen);
  };
  // ANI-06: the repair-pod service arm only unfolds for repair jobs — a refuel never cracks
  // the hatch, and the stow is gated on a deployed arm so a stray completion can't replay it.
  // Service payloads carry no entity id (yard jobs are always the player's) — the renderer
  // supplies the player id via playerEntityId.
  // Arm/cap logical state is tracked in these sets, never on controller.state: both rigs share
  // one bank whose hold-ended clips never leave state.clips, so 'latest' cannot tell arm truth
  // from cap truth and dispatch order on service:completed would make the two gates mutually
  // exclusive. A flag flips on dispatch and clears only when that rig's own stow/settle runs.
  // Flag records carry the job id + the dispatch clock-second the deploy started: a
  // completion/abort for another job must not consume the flag, and a completion landing
  // before the deploy finishes must blend home rather than snap to serviceStow's deployed
  // first key (repairs complete by missing HP — short jobs finish inside the deploy).
  const armJobs = new Map(); // entityId -> { jobId, at }
  const capPeeledAt = new Map(); // entityId -> sim second the peel started
  const SERVICE_GROUPS = ['kestrel_pod_hatch', 'kestrel_pod_arm_shoulder', 'kestrel_pod_arm_elbow'];
  const CAP_GROUPS = ['kestrel_armor_cap'];
  const PEEL_S = 2.6; // armorPeel clip duration — a fix landing mid-peel settles instead.
  const DEPLOY_S = 3.6; // serviceArm clip duration — a completion inside it settles instead.
  const anyActiveClips = (id, groupIds) => authoredMotionControllersFor(id)
    .some((c) => typeof c.hasActiveClipsIn === 'function' && c.hasActiveClipsIn(groupIds));
  const pruneStaleFlags = () => {
    // A flag whose rig runs no clip in its groups is dead — an entity rebuild replaced the
    // controllers under it, and a late completion must not dispatch a stow whose first keys
    // assume a pose that isn't there. A held clip keeps its flag at any age: a peel left
    // unrepaired is still physically up, so pruning by age would re-dispatch it and snap the
    // plate to its rest first key.
    for (const id of [...armJobs.keys()]) if (!anyActiveClips(id, SERVICE_GROUPS)) armJobs.delete(id);
    for (const id of [...capPeeledAt.keys()]) if (!anyActiveClips(id, CAP_GROUPS)) capPeeledAt.delete(id);
  };
  const isRepairJob = (payload) => payload && payload.type === 'repair';
  // Only a completion/abort for the job that started the deploy may consume its flag: the
  // yard emits jobId on all three service events, so a foreign repair-typed emit (instant
  // repairs have no jobId) can no longer fold a live deploy.
  const matchesJob = (rec, payload) => rec.jobId == null
    || (payload != null && payload.jobId === rec.jobId);
  const settleServiceRig = (id, durationS) => {
    // An interrupted deploy mid-flight must not snap to serviceStow's first keys — they
    // assume full extension. Blend the service rig home from its live pose instead.
    for (const controller of authoredMotionControllersFor(id)) {
      try {
        controller.settleGroups?.(durationS, simNow(), SERVICE_GROUPS);
      } catch (error) {
        console.warn('[authoredMotion] service-rig settle rejected', error);
      }
    }
  };
  const onServiceStarted = (payload) => {
    if (!isRepairJob(payload)) return;
    pruneStaleFlags();
    const id = playerId();
    if (id == null || armJobs.has(id)) return;
    armJobs.set(id, { jobId: payload.jobId ?? null, at: simNow() });
    dispatch('kestrel:serviceArm', id, payload, () => true);
  };
  const onServiceDone = (payload) => {
    if (!isRepairJob(payload)) return;
    pruneStaleFlags();
    const id = playerId();
    const rec = id != null ? armJobs.get(id) : null;
    if (!rec || !matchesJob(rec, payload)) return;
    armJobs.delete(id);
    if (simNow() - rec.at < DEPLOY_S) {
      settleServiceRig(id, 0.9);
      return;
    }
    dispatch('kestrel:serviceDone', id, payload, () => true);
  };
  const onServiceAborted = (payload) => {
    if (payload && payload.type && payload.type !== 'repair') return;
    pruneStaleFlags();
    const id = playerId();
    const rec = id != null ? armJobs.get(id) : null;
    if (!rec || !matchesJob(rec, payload)) return;
    armJobs.delete(id);
    settleServiceRig(id, 0.9);
  };
  // ANI-07: the port shoulder cap peels on the first hull hit that reaches it and stays up as
  // the damage state; a finished repair re-seats it. Re-peeling needs the plate seated again
  // (a fresh hull hit while the plate is already loose does nothing new).
  const onCombatDamage = (payload) => {
    if (!payload || payload.hullHit !== true) return;
    pruneStaleFlags();
    const id = payload.targetId;
    if (id == null || capPeeledAt.has(id) || !authoredMotionControllersFor(id).length) return;
    capPeeledAt.set(id, simNow());
    dispatch('kestrel:armorPeel', id, payload, () => true);
  };
  const onRepairCompleted = (payload) => {
    if (!payload || payload.type !== 'repair') return;
    pruneStaleFlags();
    const id = playerId();
    const peelStart = capPeeledAt.get(id);
    if (peelStart === undefined) return;
    capPeeledAt.delete(id);
    if (simNow() - peelStart < PEEL_S) {
      // The peel is still animating — armorStow's first key assumes the settled angle and
      // would snap the cap; blend it home from its live pose instead.
      for (const controller of authoredMotionControllersFor(id)) {
        try {
          controller.settleGroups?.(0.7, simNow(), CAP_GROUPS);
        } catch (error) {
          console.warn('[authoredMotion] armorFix settle rejected', error);
        }
      }
      return;
    }
    dispatch('kestrel:armorFix', id, payload, () => true);
  };
  // ANI-08: every spawned fracture piece is its own entity with its own controller set —
  // the torn-edge clip fires per piece, not per victim.
  const onHullFractured = (payload) => {
    const pieceIds = payload && payload.pieceIds;
    if (!Array.isArray(pieceIds)) return;
    for (const pieceId of pieceIds) {
      dispatch('wreck:rupture', pieceId, payload, () => true);
    }
  };
  // ANI-09: the salvor's jaw works the wrecks it visits — npcExtraction carries the cutter's own
  // entity id. One cycle plays to completion (repeated extraction ticks must not restart it).
  const jawBusy = (controller) => controller.clipActive?.('jawCycle')
    || controller.clipActive?.('jawOpen') || controller.clipActive?.('jawBite');
  const onNpcExtraction = (payload) => {
    dispatch('salvage:npcExtraction', payload.salvorId, payload, (c) => !jawBusy(c));
  };
  // A player-flown cutter gets the same jaw verbs through the shared mining events; cutComplete
  // resolves on the cutting ship only while a jaw is actually open.
  const onCutComplete = (payload) => {
    dispatch('salvage:cutComplete', payload && payload.minerId, payload, (c) => controllerJawOpen(c));
  };
  const controllerJawOpen = (c) => c.clipActive?.('jawOpen') || c.clipActive?.('jawBite');
  // ANI-10: the drone's grind state is sim-owned; start replays the grind cycle only when one
  // isn't already running (the sim re-fires on the clip's cadence), stop parks the drum at rest.
  const onGrindStart = (payload) => {
    // Always accept: the sim refires on the clip's own cadence and a mid-flight restart is a
    // smaller visual cost than a swallowed refire leaving the drum parked while it still grinds.
    dispatch('drone:grindStart', payload.id, payload, () => true);
  };
  const onGrindStop = (payload) => {
    dispatch('drone:grindStop', payload.id, payload, () => true);
  };
  // ANI-11: the same starter beam accumulates split work against jettisoned cargo pods —
  // the beam pries the seals, so the pod's door rig answers to events addressed at the
  // POD (targetId), not the miner. mining:start verb 'split' fires the breach; an early
  // disengage re-seals it.
  const onPodMiningStart = (payload) => {
    if (!payload || payload.verb !== 'split') return;
    dispatch('mining:start', payload.targetId, payload, () => true);
  };
  const onPodBeamStop = (payload) => {
    if (!payload || payload.targetId == null) return;
    const simTime = payload?.simTime ?? simNow();
    for (const controller of authoredMotionControllersFor(payload.targetId)) {
      if (!controller.clipActive?.('breach')) continue;
      const elapsed = controller.clipElapsed?.('breach', simTime);
      const duration = controller.clipDuration?.('breach');
      try {
        if (elapsed != null && duration != null && elapsed < duration) {
          // Mid-flight interrupt: glide the partial pose home — the seal clip's first keys
          // assume the fully-open pose and would teleport the rig.
          controller.settle?.(1.4, simTime);
        } else {
          controller.handleEvent?.('mining:stop', payload, simTime);
        }
      } catch (error) {
        console.warn('[authoredMotion] pod seal rejected by controller', error);
      }
    }
  };
  // ANI-13/14: fab-yard work loops ride the craft queue — active jobs run the welder arms
  // and the crane cycle; a queue that empties settles the rig home from its live pose so a
  // mid-phase completion never teleports the yard to a park clip's first key.
  const onCraftQueue = (payload) => {
    if (!payload || typeof payload.stationId !== 'string' || payload.stationId === '__any__') return;
    const entityId = typeof entityForStationId === 'function'
      ? entityForStationId(payload.stationId)
      : null;
    if (entityId == null) return;
    const now = payload.simTime ?? simNow();
    for (const controller of authoredMotionControllersFor(entityId)) {
      try {
        if (payload.active === false) {
          controller.settle?.(1.2, now);
        } else if (payload.active && !controller.clipActive?.('workLoop')) {
          // handleEvent restarts the loop at t=0 — a repeated active receipt while the
          // loop is already running would teleport every pivot to the first key.
          controller.handleEvent?.('fab:workStart', payload, now);
        }
      } catch (error) {
        console.warn('[authoredMotion] fab queue receipt rejected by controller', error);
      }
    }
  };
  // ANI-15: emitter tips index inward while the ship is locked in the aperture charging a gate
  // jump, then reset. physics emits gate:range on nearest-gate transitions, so the gate id that
  // reported inRange most recently is the gate a 'gate'-via charge must be happening at.
  let indexedGateId = null;
  const onGateRange = (payload) => {
    if (!payload) return;
    if (payload.inRange) {
      indexedGateId = payload.gateId;
    } else if (payload.gateId === indexedGateId && !indexedClipHeld) {
      indexedGateId = null;
    }
  };
  let indexedClipHeld = false;
  const indexing = (controller) => controller.clipActive?.('index');
  const onJumpChargeStart = (payload) => {
    if (!payload || payload.via !== 'gate' || indexedGateId == null) return;
    indexedClipHeld = true;
    dispatch('gate:index', indexedGateId, payload, (c) => !indexing(c));
  };
  const onGateReset = (payload) => {
    indexedClipHeld = false;
    if (indexedGateId == null) return;
    dispatch('gate:reset', indexedGateId, payload, indexing);
  };
  const unsubs = [
    bus.on('scan:pulse', onScanPulse),
    bus.on('mining:start', onMiningStart),
    bus.on('mining:yield', onMiningYield),
    bus.on('mining:stop', onMiningStop),
    bus.on('beam:denied', onBeamDenied),
    bus.on('tether:attached', onTetherAttached),
    bus.on('massline:snareDeployed', onSnareDeployed),
    bus.on('tether:snapCatch', onSnapCatch),
    bus.on('tether:reelPump', onReelPump),
    bus.on('tether:released', onTetherReleased),
    bus.on('massline:snareEnded', onSnareEnded),
    bus.on('tether:latchDenied', onLatchDenied),
    bus.on('ship:boostPreKick', onBoostPreKick),
    bus.on('ship:boostStart', onBoostStart),
    bus.on('ship:boostStop', onBoostStop),
    bus.on('service:started', onServiceStarted),
    bus.on('service:completed', onServiceDone),
    bus.on('service:aborted', onServiceAborted),
    bus.on('combat:damage', onCombatDamage, { presentation: true }),
    bus.on('service:completed', onRepairCompleted),
    bus.on('hull:fractured', onHullFractured),
    bus.on('salvage:npcExtraction', onNpcExtraction),
    bus.on('salvage:cutComplete', onCutComplete),
    bus.on('drone:grindStart', onGrindStart),
    bus.on('drone:grindStop', onGrindStop),
    bus.on('mining:start', onPodMiningStart),
    bus.on('mining:stop', onPodBeamStop),
    bus.on('craft:queueChanged', onCraftQueue),
    bus.on('gate:range', onGateRange),
    bus.on('jump:chargeStart', onJumpChargeStart),
    bus.on('jump:start', onGateReset),
    bus.on('jump:arrive', onGateReset),
    bus.on('jump:chargeAbort', onGateReset),
  ];
  return function uninstallAuthoredMotionBus() {
    for (const unsub of unsubs) {
      if (typeof unsub === 'function') unsub();
    }
  };
}

async function sha256Hex(bytes) {
  const subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (!subtle || typeof subtle.digest !== 'function') return null;
  const digest = await subtle.digest('SHA-256', bytes.slice().buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Fetch and pin a motion bank referenced by a render-package runtime table
 * (runtime.motionBank = {uri, sha256, bytes, rigId}). The reference is the package's attestation
 * of which bank bytes it was compiled against; byte length and — where the host exposes WebCrypto
 * — SHA-256 are both enforced, so a swapped file fails closed instead of binding foreign channels.
 */
export async function loadMotionBank(ref, fetchImpl) {
  const fetcher = fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
  if (!ref || !fetcher) return null;
  if (typeof ref.uri !== 'string' || !ref.uri) {
    throw new Error('motion bank reference requires a uri.');
  }
  const response = await fetcher(ref.uri, { cache: 'no-cache' });
  if (!response || !response.ok) {
    throw new Error(`motion bank fetch failed: HTTP ${response && response.status} ${ref.uri}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (Number.isFinite(ref.bytes) && bytes.byteLength !== ref.bytes) {
    throw new Error(`motion bank byte length mismatch for ${ref.uri}: ${bytes.byteLength} != ${ref.bytes}.`);
  }
  if (typeof ref.sha256 === 'string' && /^[0-9a-f]{64}$/.test(ref.sha256)) {
    const digest = await sha256Hex(bytes);
    if (digest && digest !== ref.sha256) {
      throw new Error(`motion bank SHA-256 mismatch for ${ref.uri}: ${digest} != ${ref.sha256}.`);
    }
  }
  const doc = JSON.parse(new TextDecoder().decode(bytes));
  if (doc.rigId && ref.rigId && doc.rigId !== ref.rigId) {
    throw new Error(`motion bank rigId mismatch for ${ref.uri}: ${doc.rigId} != ${ref.rigId}.`);
  }
  return { ref, bank: doc };
}

/**
 * Bind a bank document onto an instantiated root. Thin wrapper that keeps the caller holding
 * {ref, bank} documents rather than raw banks.
 */
export function bindInstanceMotion(root, motionBank, options = {}) {
  if (!motionBank || !motionBank.bank) return null;
  return bindAuthoredMotion(root, motionBank.bank, options);
}
