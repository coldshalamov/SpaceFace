// 1101 — THE SALVAGE DISPUTE (SFQ-M M09). A post-battle drift: one rich wreck under a Pitborn
// salvage beacon, a Pitborn tender holding the claim on one side of the field, and an escape pod
// with failing air on the other. The claim is a real `salvorClaimedBy` stamp, so the existing
// mining/law path judges any stripping — the tender is a real witness and the law owner decides.
//
//   * lawful: tow the pod across the field to the tender; the crew pays for the life and releases
//     the claim, so the wreck becomes yours to beam honestly;
//   * extraction: strip the wreck under the claim (draw the tender off first, or don't) and live
//     with the protest, the law and a crew that will not forget.
//
// After the offer window the tender burns to the original pod. Only a real, slow hull-side
// handoff closes recovery; the unworked wreck keeps its finite pool and lawful claim.
import { deepFreeze, defineEncounter } from './catalog.js';
import { ensurePhysicsBodySpec } from '../../core/physicsAuthority.js';
import { attachmentBindsOccupant } from '../../combat/attachments.js';

export const encounterOrder = 1101;
export const trigger = deepFreeze({
  id: 'salvage_dispute',
  tier: 'minor',
  deck: 'civilian',
  weight: 1.1,
  zoneTypes: ['derelict_field'],
  script: 'selfRegistered',
  pressureCost: 18,
  cooldownS: 1200,
  proximity: true,
  gates: {
    sectorIds: ['sector_ceres_belt', 'sector_io_reach', 'sector_vesta_forge'],
  },
});

const AIR_S = 180;
const POD_DIST_WU = 650;
const TENDER_DIST_WU = 600;
const POD_RADIUS = 5;
const POD_MASS = 10;
const STRIPPED_FRACTION = 0.5;      // the wreck has really been worked when half the pool is gone
const CLEAR_WU = 60;
const LAYOUT_TRIES = 30;
const LAYOUT_STEP_WU = 150;
const RESCUE_PAY = 260;
const CLAIM_FACTION = 'faction_pitborn';
const WRECK_POOL = Object.freeze({ cmdty_electronics: 4, cmdty_alloys: 3, cmdty_scrap_metal: 6 });

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function blockersNear(state, center, radius) {
  const out = [];
  for (const e of state.entityList || []) {
    if (!e || e.alive === false || !e.pos || e.id === state.playerId) continue;
    if (!(Number(e.radius) > 0) || e.type === 'projectile' || e.type === 'fx' || e.type === 'pickup') continue;
    if (dist(e.pos, center) <= radius) out.push(e);
  }
  return out;
}

function findLayout(state, center, rng) {
  const blockers = blockersNear(state, center, POD_DIST_WU + TENDER_DIST_WU + 400);
  const dir0 = rng() * Math.PI * 2;
  let best = null;
  for (let i = 0; i < LAYOUT_TRIES; i++) {
    const ring = Math.floor(i / 6);
    const wreck = i === 0 ? { x: center.x, z: center.z } : {
      x: center.x + Math.cos(dir0 + i * 1.047) * ring * LAYOUT_STEP_WU,
      z: center.z + Math.sin(dir0 + i * 1.047) * ring * LAYOUT_STEP_WU,
    };
    const ang = dir0 + i * 0.83;
    const dx = Math.cos(ang), dz = Math.sin(ang);
    const layout = {
      wreck,
      pod: { x: wreck.x + dx * POD_DIST_WU + dz * 120, z: wreck.z + dz * POD_DIST_WU - dx * 120 },
      tender: { x: wreck.x - dx * TENDER_DIST_WU, z: wreck.z - dz * TENDER_DIST_WU },
    };
    let blocked = 0;
    for (const p of [layout.wreck, layout.pod, layout.tender]) {
      for (const r of blockers) if (dist(r.pos, p) < (r.radius || 0) + CLEAR_WU) blocked++;
    }
    if (blocked === 0) return layout;
    if (!best || blocked < best.blocked) best = { layout, blocked };
  }
  return best.layout;
}

function alive(e) { return !!e && e.alive !== false; }

function poolTotal(wreck) {
  const pool = wreck && wreck.data && wreck.data.salvagePool;
  if (!pool || typeof pool !== 'object') return 0;
  let n = 0;
  for (const v of Object.values(pool)) n += Math.max(0, Number(v) || 0);
  return n;
}


const recoveries = new WeakMap();
const RECOVERY_LIMIT_S = 240;
// Holding a line while the crew does the entire crossing is not a paid rescue.
const PLAYER_TOW_MIN_WU = 100;
const HANDOFF_GAP_MIN = 8, HANDOFF_GAP_MAX = 45, HANDOFF_SPEED = 5;

function stopRecovery(live, detach = false) {
  const own = recoveries.get(live);
  if (!own || own.stopped) return;
  own.stopped = true;
  if (own.intent && own.tender.data?.intent === own.intent) {
    own.intent.moveX = own.intent.moveZ = own.intent.turnIntent = 0;
    if (detach || own.previous === undefined) delete own.tender.data.intent;
    else own.tender.data.intent = own.previous;
  }
  // A captured/reassigned hull is no longer the director's disposable cast.
  if (detach) {
    live.ids = live.ids.filter(id => id !== own.tender.id);
    delete live.roles[own.tender.id];
  }
  for (const off of own.off) if (typeof off === 'function') off();
  own.off.length = 0;
}

function bindRecovery(d, live, tender, wreck, pod) {
  for (const actor of [tender, wreck, pod]) ensurePhysicsBodySpec(actor);
  const own = { tender, wreck, pod, podStart: { ...pod.pos }, actors: [tender, wreck, pod],
    generations: [tender, wreck, pod].map(e => e.occupantGeneration),
    bodies: [tender, wreck, pod].map(e => e.physicsBody),
    previous: tender.data.intent, intent: null, stopped: false, off: [] };
  recoveries.set(live, own);
  if (!d.bus?.on) return;
  own.off.push(d.bus.on('encounter:resolved', p => {
    if (p?.encounterId === live.id) stopRecovery(live);
  }));
  for (const event of ['save:restoring', 'sector:exit', 'game:exitToMenu', 'game:new']) {
    own.off.push(d.bus.on(event, () => stopRecovery(live)));
  }
  own.off.push(d.bus.on('ship:captured', p => {
    if (d.state.entities.get(tender.id) === tender && tender.occupantGeneration === own.generations[0]
      && p?.targetId === tender.id && tender.flags?.persistent
      && p.vesselId === tender.data?.vesselId) stopRecovery(live, true);
  }));
  own.off.push(d.bus.on('ship:controlChanging', p => {
    if (d.state.entities.get(tender.id) === tender && tender.occupantGeneration === own.generations[0]
      && (p?.toId === tender.id || p?.fromId === tender.id)) stopRecovery(live, true);
  }));
}

function originalRecovery(state, live, own) {
  if (!own || own.stopped || state.world.currentSectorId !== live.sectorId) return false;
  for (let i = 0; i < own.actors.length; i++) {
    const actor = own.actors[i];
    if (state.entities.get(actor.id) !== actor || actor.occupantGeneration !== own.generations[i]) return false;
    if (own.bodies[i] == null && actor.physicsBody != null) own.bodies[i] = actor.physicsBody;
    if (actor.physicsBody !== own.bodies[i]) return false;
  }
  const t = own.tender;
  return state.playerId !== t.id && !t.flags?.persistent && t.data?.salvorClaimId === live.data.dispute.claimId
    && t.data?.ai?.encounterId === live.id && t.data.ai.encounterRole === 'claimant'
    && live.ids.includes(t.id) && live.roles[t.id] === 'claimant'
    && t.data.despawnAt == null && t.data.intent === (own.intent || own.previous);
}

function playerLine(state, pod) {
  return Object.values(state.combat?.attachments?.byId || {}).some(a =>
    a?.state === 'active' && (a.targetId === pod.id || a.ownerId === pod.id)
    && (a.ownerId === state.playerId || a.controllerId === state.playerId)
    && [a.ownerId, a.targetId, ...(a.controllerId == null ? [] : [a.controllerId])].every(id => {
      const endpoint = state.entities.get(id);
      return alive(endpoint) && attachmentBindsOccupant(a, id, endpoint.occupantGeneration);
    }));
}

function handoffReady(tender, pod) {
  const values = [tender.pos?.x, tender.pos?.z, pod.pos?.x, pod.pos?.z,
    tender.vel?.x, tender.vel?.z, pod.vel?.x, pod.vel?.z, tender.radius, pod.radius];
  if (!values.every(Number.isFinite)) return false;
  const gap = dist(tender.pos, pod.pos) - tender.radius - pod.radius;
  return gap >= HANDOFF_GAP_MIN && gap <= HANDOFF_GAP_MAX
    && Math.hypot(tender.vel.x - pod.vel.x, tender.vel.z - pod.vel.z) <= HANDOFF_SPEED;
}

function approachPod(own) {
  const t = own.tender, p = own.pod;
  const dx0 = t.pos.x - p.pos.x, dz0 = t.pos.z - p.pos.z;
  const distance = Math.hypot(dx0, dz0);
  const berth = t.radius + p.radius + 25;
  const dx = p.pos.x + (distance > 0 ? dx0 / distance : 1) * berth - t.pos.x;
  const dz = p.pos.z + (distance > 0 ? dz0 / distance : 0) * berth - t.pos.z;
  const range = Math.hypot(dx, dz), scale = range > 0 ? Math.min(40, range * .3) / range : 0;
  const ax = (p.vel.x + dx * scale - t.vel.x) * .04;
  const az = (p.vel.z + dz * scale - t.vel.z) * .04;
  const c = Math.cos(t.rot), sn = Math.sin(t.rot);
  own.intent.moveZ = Math.max(-1, Math.min(1, ax * c + az * sn));
  own.intent.moveX = Math.max(-1, Math.min(1, -ax * sn + az * c));
}

export const runtime = Object.freeze({
  fire(d, live, state) {
    const ships = (live.plan && live.plan.ships) || [];
    const tenderSpec = ships.find((sh) => sh && (sh.role === 'squad' || sh.role === 'claimant'));
    if (!tenderSpec) return d.abort(live, 'no_cast');
    const center = (live.plan && live.plan.zoneCenter) || live.anchor;
    if (!center || !Number.isFinite(center.x)) return d.abort(live, 'no_zone_anchor');

    const layout = findLayout(state, center, d.stream(live, 'm09_layout'));
    const claimId = `salvage_dispute:${live.id}`;
    Object.assign(tenderSpec, {
      role: 'claimant', pos: { ...layout.tender }, factionId: CLAIM_FACTION, team: 2, context: 'civilian', passive: true,
    });
    const ids = d.spawnShips(live, [tenderSpec]);
    if (!ids.length || d.aliveCount(live, 'claimant') < 1) return d.abort(live, 'no_budget');
    const tender = d.entsOf(live, 'claimant')[0];
    tender.data.scanLabel = 'PITBORN TENDER — HOLDS THE CLAIM';
    tender.data.salvorClaimId = claimId;
    tender.data.callsign = tender.data.callsign || 'Pitborn tender';

    const wreck = d.spawnWreck(live, {
      pos: layout.wreck, pool: { ...WRECK_POOL },
      scanLabel: 'CLAIMED WRECK — PITBORN SALVAGE BEACON', storyPropKind: 'm09_claimed_wreck',
    });
    const pod = d.spawnProp(live, {
      type: 'payload', pos: layout.pod, radius: POD_RADIUS, mass: POD_MASS, tetherable: true,
      scanLabel: 'ESCAPE POD — LIFE SIGNS, AIR FAILING', storyPropKind: 'm09_escape_pod',
      // Bind the existing lifeboat before spawn publication; no gameplay rescue flags.
      assetRef: 'asset.slice.civilian_pod',
    });
    if (!wreck || !pod) return d.abort(live, 'no_bodies');
    wreck.data.salvorClaimedBy = claimId;
    pod.physicsBody = { shape: 'ball', mass: POD_MASS, dynamic: true };
    pod.data.masslineTetherable = true;

    const now = d.now();
    live.data.dispute = {
      claimId,
      tenderId: tender.id,
      wreckId: wreck.id,
      podId: pod.id,
      poolStart: poolTotal(wreck),
      airEndsAt: now + AIR_S,
      podLatched: false,
      settled: false,
      outcome: null,
    };
    bindRecovery(d, live, tender, wreck, pod);
    live.deadlineAt = now + AIR_S + RECOVERY_LIMIT_S;
    live.phase = 'contested';
    live.approach = { signal: 'claim_beacon_and_survivor', contacts: ids.length + 2, t: now };
    d.say(live, 'alert',
      'PITBORN TENDER: That wreck is under our beacon. There\'s a pod on the far side with air running out while we hold the claim. You have three minutes before we break station to recover it. Bring the pod to us and the wreck is yours. Touch the wreck first and we file on you.',
      null, { primary: true, literal: true });
  },

  event(d, live, state, name, payload) {
    const m = live.data && live.data.dispute;
    if (!m || live.phase === 'done' || m.settled || m.settling) return;
    if (name === 'tetherAttached' && payload && payload.targetId === m.podId && !m.podLatched) {
      m.podLatched = true;
      d.say(live, 'alert', 'POD: ...someone\'s on the line. Please don\'t swing me hard.', null, { literal: true });
    }
  },

  tick(d, live, state, now) {
    const m = live.data && live.data.dispute;
    if (!m || live.phase === 'done' || m.settled || m.settling) return;
    const own = recoveries.get(live);
    if (!originalRecovery(state, live, own)) {
      const t = own?.tender;
      const newOwner = t && state.entities.get(t.id) === t && t.occupantGeneration === own.generations[0]
        && (t.flags?.persistent || state.playerId === t.id
          || t.data.intent !== (own.intent || own.previous)
          || t.data.ai?.encounterId !== live.id || t.data.ai?.encounterRole !== 'claimant'
          || live.roles[t.id] !== 'claimant');
      stopRecovery(live, !!newOwner);
      return this._settle(d, live, m, 'lost');
    }
    const player = d.player(), { pod, wreck, tender } = own;
    if (!alive(player) || !alive(tender) || tender.hull <= 0) return this._settle(d, live, m, 'lost');
    if (!alive(pod)) return this._settle(d, live, m, 'pod_lost');
    const claimHeld = alive(wreck) && wreck.data?.salvorClaimedBy === m.claimId;
    if (claimHeld && m.poolStart > 0 && poolTotal(wreck) <= m.poolStart * (1 - STRIPPED_FRACTION)) {
      return this._settle(d, live, m, 'stripped');
    }
    const towing = playerLine(state, pod);
    if (handoffReady(tender, pod) && towing
      && (!own.intent || dist(pod.pos, own.podStart) >= PLAYER_TOW_MIN_WU)) {
      return this._settle(d, live, m, 'rescued');
    }
    if (now >= m.airEndsAt && !own.intent) {
      own.intent = { moveX: 0, moveZ: 0, turnIntent: 0, assistMode: 'assisted' };
      tender.data.intent = own.intent;
      live.phase = 'recovering';
      tender.data.scanLabel = 'PITBORN TENDER — APPROACHING SURVIVOR';
      d.say(live, 'alert', 'PITBORN TENDER: We are breaking station for the pod. Bring it alongside before we recover it and the offer still stands.', null, { literal: true });
    }
    if (own.intent) {
      if (now >= m.airEndsAt + RECOVERY_LIMIT_S) return this._settle(d, live, m, 'lost');
      approachPod(own);
      if (!towing && handoffReady(tender, pod)) return this._settle(d, live, m, 'claimed');
    }
  },

  _settle(d, live, m, outcome) {
    if (m.settled || m.settling) return;
    const own = recoveries.get(live);
    const wreck = own?.wreck, pod = own?.pod;
    if (outcome === 'rescued' || outcome === 'claimed') {
      // Removal is custody, not destruction: no damage, loot or kill attribution.
      if (d.state.entities.get(pod?.id) !== pod || !alive(pod) || !d.helpers?.removeEntity) return;
      m.settling = true;
      try { d.helpers.removeEntity(pod.id, { immediate: true, reason: 'salvage_dispute_recovered' }); }
      catch (error) {
        // A callback can throw after removal. Presence, not the return/throw, owns custody.
        if (d.state.entities.get(pod.id) === pod) { m.settling = false; return; }
      }
      if (d.state.entities.get(pod.id) === pod) { m.settling = false; return; }
      // A synchronous restore or committed custody change supersedes this scene.
      if (own.stopped) {
        m.settled = true; m.settling = false; m.outcome = 'lost';
        if (d.state.encounterDirector?.live?.[live.id] === live) return d.resolve(live, 'lost', { speak: true });
        return;
      }
    }
    stopRecovery(live);
    m.settled = true;
    m.settling = false;
    m.outcome = outcome;
    if (outcome === 'rescued') {
      own.tender.data.scanLabel = 'PITBORN TENDER — SURVIVOR ABOARD';
      d.grant(RESCUE_PAY, 'salvage_dispute:rescued');
      d.rep(CLAIM_FACTION, 4, 'salvage_dispute_rescued');
      if (alive(wreck) && wreck.data) {
        delete wreck.data.salvorClaimedBy;
        wreck.data.scanLabel = 'RELEASED WRECK — PITBORN SIGNED IT OVER';
      }
      if (alive(pod) && pod.data) { pod.data.scanLabel = 'ESCAPE POD — SURVIVOR ABOARD THE TENDER'; pod.data.masslineTetherable = false; }
      d.despawnAll(live, 45, 'claimant');
    } else if (outcome === 'stripped') {
      d.rep(CLAIM_FACTION, -5, 'salvage_dispute_stripped');
      if (alive(wreck) && wreck.data) wreck.data.scanLabel = 'CLAIM-JUMPED WRECK — PITBORN FILED';
      if (alive(pod) && pod.data) pod.data.scanLabel = 'ESCAPE POD — STILL WAITING';
    } else if (outcome === 'claimed') {
      own.tender.data.scanLabel = 'PITBORN TENDER — SURVIVOR ABOARD';
      // The survivor is aboard; the finite wreck has NOT been worked.
      if (alive(wreck) && wreck.data) {
        wreck.data.scanLabel = 'CLAIMED WRECK — PITBORN CLAIM RETAINED';
      }
      if (alive(pod) && pod.data) { pod.data.scanLabel = 'ESCAPE POD — PITBORN TENDER RECOVERING'; pod.data.masslineTetherable = false; }
    } else if (outcome === 'pod_lost') {
      d.rep(CLAIM_FACTION, -6, 'salvage_dispute_pod_lost');
      d.despawnAll(live, 30, 'claimant');
    }
    return d.resolve(live, outcome, { speak: true });
  },
});

export default defineEncounter(trigger, {
  shape: {
    situation: 'claim',
    place: trigger.zoneTypes,
    twist: 'none',
    actor: CLAIM_FACTION,
  },
  factionId: CLAIM_FACTION,
  title: 'THE SALVAGE DISPUTE',
  primaryLine: 'PITBORN TENDER: That wreck is under our beacon. There\'s a pod on the far side with air running out while we hold the claim. You have three minutes before we break station to recover it. Bring the pod to us and the wreck is yours. Touch the wreck first and we file on you.',
  verbs: ['inspect', 'latch', 'tow', 'salvage'],
  squad: {
    archetypes: ['mule_trader'],
    size: [1, 1],
    factionId: CLAIM_FACTION,
    context: 'civilian',
    team: 2,
    passive: true,
  },
  bark: null,
  deadlineS: AIR_S,
  receipts: {
    rescued: 'SURVIVOR DELIVERED — the Pitborn pay for the life and sign the wreck over to you.',
    stripped: 'You stripped a claimed wreck under their beacon. The Pitborn filed, and they will remember.',
    claimed: 'The Pitborn recovered the survivor themselves. Their claim remains on the unworked wreck.',
    pod_lost: 'The pod is gone. Nobody pays for that, and the Pitborn saw who was closest.',
    lost: 'Recovery was interrupted. No survivor handoff or salvage award was recorded.',
  },
});
