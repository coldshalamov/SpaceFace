// An optional fitting bench in Vesta's existing Dead Freighter Drift. The director
// owns its offer/lifetime, ships owns the fitting, and the catalyst adapter owns
// the measured physical receipts. No currency, cargo or module arrays are written here.
import { sectorLocalToGlobalForSector } from '../../data/sectorCoordinates.js';
import { WRECK_COLLIDER_PROPORTIONS } from '../../data/wreckClasses.js';
import {
  claimCatalystTrial, readCatalystTrialReceipt, completeCatalystTrial,
} from './fitting.js';

export const TRIAL_CONFIG = Object.freeze({
  id: 'kinetic_catalysts_trial',
  receiptId: 'kinetic_catalysts_field_trial_v1',
  sectorId: 'sector_vesta_forge',
  zoneId: 'zone_vesta_derelict',
  localAnchor: Object.freeze({ x: 920, z: -1260 }),
  offerS: 75,
  trialS: 240,
  leaveRadius: 850,
  maxBodies: 4,
});

const CATALYSTS = Object.freeze(['orbital_magazine', 'aftershock_core', 'load_bridge']);
const EFFECT_KIND = Object.freeze({
  orbital_magazine: 'orbit_release',
  aftershock_core: 'echo_hit',
  load_bridge: 'bridge_transfer',
});
const DIRECTIONS = Object.freeze({
  orbital_magazine: 'Pull a loose test piece, let it acquire tangential speed, then Shove. '
    + 'Up to three pieces orbit. The drag is real; the capacitor pays while you hold them. '
    + 'Pin drops a held piece into its ordinary anchor; Rig closes intake and brakes the magazine at half drain.',
  aftershock_core: 'Shove the test pieces and move clear of the broken warning ring. '
    + 'One weaker echo follows at the original cast point. The ring stays there when you move. '
    + 'The capacitor and recovery window pay for it. Pin narrows a pending echo; Rig vents a much weaker pulse early.',
  load_bridge: 'Place Pin, then tow a test piece into the seed ring so it hitches. '
    + 'Lock a second nearby piece and Pull to form the bridge. '
    + 'Shove or Bomb one end and watch the other end answer. '
    + 'The heavy end gains less speed from the same impulse. Rig braces the bridge; no impulse returns around the pair.',
});
const SPECS = Object.freeze([
  Object.freeze({ role: 'light_a', x: -30, z: -14, mass: 6, radius: 3, label: 'Test mass I · 6 t' }),
  Object.freeze({ role: 'light_b', x: -6, z: 8, mass: 10, radius: 3.5, label: 'Test mass II · 10 t' }),
  Object.freeze({ role: 'medium', x: 22, z: -6, mass: 18, radius: 4.5, label: 'Test mass III · 18 t' }),
  Object.freeze({ role: 'heavy', x: 48, z: 25, mass: 60, radius: 6, label: 'Test mass IV · 60 t' }),
]);
const finite = (v, fallback = 0) => Number.isFinite(v) ? v : fallback;
const point = p => p && Number.isFinite(p.x) && Number.isFinite(p.z);

function service(d, id) {
  return d && d.registry && typeof d.registry.get === 'function' ? d.registry.get(id) : null;
}
function runtime(d) { return service(d, 'kineticCatalysts'); }
function existingReceipt(state) { return readCatalystTrialReceipt(state, TRIAL_CONFIG.receiptId); }
function say(d, live, text) { d.say(live, 'info', text, null, { literal: true }); }
function noLongerHere(state, live, player) {
  return !player || player.alive === false || !point(player.pos)
    || state.world?.currentSectorId !== live.sectorId;
}
function latestSequence(receipts) {
  let sequence = 0;
  for (const row of (Array.isArray(receipts) ? receipts.slice(-64) : [])) {
    sequence = Math.max(sequence, finite(row?.sequence));
  }
  return sequence;
}
function ownBodyIds(live) {
  return Array.isArray(live.vars?.bodyIds) ? live.vars.bodyIds : [];
}
function generationOf(body) { return Number.isFinite(body?.occupantGeneration) ? body.occupantGeneration : null; }

/** Positive physical evidence, not a cast button or catalog row, earns calibration. */
export function catalystTrialEvidence(live, receipts) {
  if (!live?.vars || !CATALYSTS.includes(live.vars.catalystId)) return null;
  const expected = EFFECT_KIND[live.vars.catalystId];
  const ids = new Set(ownBodyIds(live));
  for (const row of (Array.isArray(receipts) ? receipts.slice(-64) : [])) {
    if (!row || row.kind !== expected || row.catalystId !== live.vars.catalystId
        || !(row.sequence > live.vars.startSequence) || !Array.isArray(row.bodyIds)) continue;
    const touched = row.bodyIds.filter(id => ids.has(id)
      && row.bodyGenerations?.[id] === live.vars.bodyGenerations?.[id]);
    if (!touched.length) continue;
    if (expected === 'orbit_release' && !(finite(row.energyBefore) > 0 || finite(row.energyAfter) > 0)) continue;
    if (expected === 'echo_hit' && !(finite(row.totalImpulse) > 0)) continue;
    if (expected === 'bridge_transfer') {
      if (new Set(touched).size < 2) continue;
      const magnitude = typeof row.impulse === 'number' ? row.impulse
        : Math.hypot(finite(row.impulse?.x), finite(row.impulse?.z));
      if (!(magnitude > 0)) continue;
    }
    return row;
  }
  return null;
}

function settle(d, live, state, outcome, proof = null) {
  if (live.phase === 'done' || live.vars?.settled) return;
  live.vars.settled = true;
  if (outcome === 'calibrated') {
    if (!completeCatalystTrial(state, TRIAL_CONFIG.receiptId, {
      kind: proof.kind, sequence: proof.sequence, at: d.now(),
    })) {
      d.resolve(live, 'retained');
      return;
    }
    say(d, live, 'Calibration logged. Keep the relic. Its work and its cost are both yours now. '
      + 'The other two remain incompatible fittings, not extra powers.');
  }
  // The director resolves and retires only the four ids it owns. No replacement
  // salvage, pickup or end-of-trial reward exists to duplicate on a reload.
  d.resolve(live, outcome);
}

function spawnTrialMasses(d, live, state) {
  if (typeof d.helpers?.spawnEntity !== 'function') return false;
  const anchor = sectorLocalToGlobalForSector(TRIAL_CONFIG.localAnchor, TRIAL_CONFIG.sectorId);
  if (!point(anchor)) return false;
  live.vars.anchor = { x: anchor.x, z: anchor.z };
  live.vars.bodyIds = [];
  live.vars.bodyGenerations = {};
  live.ids ||= [];
  live.roles ||= {};
  for (const spec of SPECS) {
    const entity = d.helpers.spawnEntity({
      type: 'wreck', alive: true, team: 2,
      pos: { x: anchor.x + spec.x, y: 0, z: anchor.z + spec.z },
      vel: { x: 0, y: 0, z: 0 },
      rot: Math.atan2(spec.z, spec.x),
      mass: spec.mass, radius: spec.radius, hull: 200, hullMax: 200,
      collides: true,
      physicsBody: { shape: 'capsule', mass: spec.mass, radius: spec.radius, dynamic: true, ccd: true },
      data: {
        parentType: 'debris', proportions: WRECK_COLLIDER_PROPORTIONS,
        wreckClass: 'debris', scanLabel: spec.label, encounterId: live.id,
        kineticCatalystTrial: true, masslineTetherable: true,
        loot: [], salvagePool: {}, authoredSalvagePool: {}, salvageTimeLeft: 0,
        // Generic deep scans can roll a cache even for an empty salvage pool.
        // This is certified empty test hardware, not another cache lottery.
        debrisCache: 'empty',
        isCommunicator: false, wreckMissionId: null,
        despawnAt: d.now() + TRIAL_CONFIG.trialS + 45,
      },
    });
    if (!entity || entity.id == null) return false;
    live.ids.push(entity.id);
    live.roles[entity.id] = spec.role;
    live.vars.bodyIds.push(entity.id);
    live.vars.bodyGenerations[entity.id] = generationOf(entity);
  }
  return true;
}

/** Real encounterDirector contract, also exported for focused fixture execution. */
export const KINETIC_CATALYST_TRIAL_RUNTIME = Object.freeze({
  fire(d, live, state) {
    const kind = state.run?.kind;
    if ((kind && kind !== 'adventure' && kind !== 'campaign')
        || state.world?.currentSectorId !== TRIAL_CONFIG.sectorId
        || live.sectorId !== TRIAL_CONFIG.sectorId || live.zoneId !== TRIAL_CONFIG.zoneId) {
      d.abort(live, 'wrong_location');
      return;
    }
    const rt = runtime(d);
    if (!rt || typeof rt.getEvidence !== 'function' || typeof rt.getSnapshot !== 'function'
        || !service(d, 'ships')) {
      d.abort(live, 'fitting_unavailable');
      return;
    }
    const receipt = existingReceipt(state);
    if (receipt?.completed === true) {
      d.abort(live, 'already_calibrated');
      return;
    }
    live.vars ||= {};
    live.vars.settled = false;
    live.phase = 'offer';
    live.deadlineAt = d.now() + TRIAL_CONFIG.offerS;
    d.say(live, 'info', receipt
      ? 'Your retained catalyst is still on the manifest. You can run its calibration again; no second relic is issued.'
      : live.shape.primaryLine, null, { literal: true, primary: true });
    const choices = receipt && CATALYSTS.includes(receipt.catalystId)
      ? [receipt.catalystId, 'decline'] : [...CATALYSTS, 'decline'];
    d.offerChoices(live, choices, 'decline', live.deadlineAt);
  },

  choose(d, live, state, choiceId) {
    if (live.phase !== 'offer') return;
    if (choiceId === 'decline') { d.resolve(live, 'declined'); return; }
    if (!CATALYSTS.includes(choiceId)) return;
    const prior = existingReceipt(state);
    if (prior && prior.catalystId !== choiceId) { d.resolve(live, 'retained'); return; }
    const player = d.player();
    if (noLongerHere(state, live, player)) { d.abort(live, 'left_before_fitting'); return; }
    // The owner emits synchronously while granting/fitting. Consume the local
    // phase before invoking it, so a listener cannot reenter this offer.
    live.phase = 'fitting';
    const result = claimCatalystTrial(state, {
      catalystId: choiceId, receiptId: TRIAL_CONFIG.receiptId, ships: service(d, 'ships'),
    });
    if (live.phase !== 'fitting') return;
    if (!result?.ok) {
      say(d, live, 'The fitting bench could not issue that relic. Your existing equipment stays with you.');
      d.resolve(live, 'fit_refused');
      return;
    }
    if (result.fitted !== true) {
      d.resolve(live, result.reason === 'retained_instance_unavailable' ? 'retained_unavailable'
        : result.reason === 'retained_on_other_ship' ? 'retained_elsewhere' : 'inventory');
      return;
    }
    const rt = runtime(d);
    live.vars.catalystId = choiceId;
    live.vars.startSequence = latestSequence(rt?.getEvidence?.());
    live.vars.startedAt = d.now();
    live.vars.settled = false;
    if (!spawnTrialMasses(d, live, state)) {
      say(d, live, 'The calibration masses are unavailable. Your relic stays fitted; no new pieces will be manufactured on a reload.');
      d.abort(live, 'field_unavailable');
      return;
    }
    live.phase = 'trial';
    live.deadlineAt = d.now() + TRIAL_CONFIG.trialS;
    say(d, live, DIRECTIONS[choiceId] + ' The four marked masses are at the Dead Freighter Drift bench. '
      + 'Leave whenever you want; the relic remains yours.');
  },

  tick(d, live, state, now) {
    if (live.phase === 'offer') {
      if (now >= live.deadlineAt) d.resolve(live, 'declined');
      return;
    }
    if (live.phase !== 'trial' || live.vars?.settled) return;
    const player = d.player();
    if (noLongerHere(state, live, player)) { settle(d, live, state, 'retained'); return; }
    const rt = runtime(d);
    const snapshot = rt?.getSnapshot?.();
    if (snapshot?.catalystId !== live.vars.catalystId) {
      settle(d, live, state, 'unfitted');
      return;
    }
    const proof = catalystTrialEvidence(live, rt.getEvidence());
    if (proof) { settle(d, live, state, 'calibrated', proof); return; }
    const remaining = ownBodyIds(live).some(id => {
      const body = state.entities?.get?.(id);
      return body && body.alive !== false
        && generationOf(body) === live.vars.bodyGenerations?.[id];
    });
    if (!remaining) { settle(d, live, state, 'spent'); return; }
    const anchor = live.vars.anchor;
    if (point(anchor) && Math.hypot(player.pos.x - anchor.x, player.pos.z - anchor.z) > TRIAL_CONFIG.leaveRadius) {
      settle(d, live, state, 'retained');
      return;
    }
    if (now >= live.deadlineAt) settle(d, live, state, 'retained');
  },
});

export default KINETIC_CATALYST_TRIAL_RUNTIME;
