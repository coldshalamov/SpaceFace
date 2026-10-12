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
// Late is not free: when the pod's air runs out the tender takes the pod and works the wreck
// itself, in the open. The survivor is never deleted and never shot by the script.
import { deepFreeze, defineEncounter } from './catalog.js';

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
const RETURN_WU = 170;
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

function entityById(state, id) {
  return id != null && state.entities ? state.entities.get(id) || null : null;
}

function alive(e) { return !!e && e.alive !== false; }

function poolTotal(wreck) {
  const pool = wreck && wreck.data && wreck.data.salvagePool;
  if (!pool || typeof pool !== 'object') return 0;
  let n = 0;
  for (const v of Object.values(pool)) n += Math.max(0, Number(v) || 0);
  return n;
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
      type: 'beacon', pos: layout.pod, radius: POD_RADIUS, mass: POD_MASS, tetherable: true,
      scanLabel: 'ESCAPE POD — LIFE SIGNS, AIR FAILING', storyPropKind: 'm09_escape_pod',
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
    live.deadlineAt = now + AIR_S;
    live.phase = 'contested';
    live.approach = { signal: 'claim_beacon_and_survivor', contacts: ids.length + 2, t: now };
    d.say(live, 'alert',
      'PITBORN TENDER: That wreck is under our beacon. There\'s a pod on the far side with air running out and we can\'t reach it from here. Bring the pod to us and the wreck is yours. Touch the wreck first and we file on you.',
      null, { primary: true, literal: true });
  },

  event(d, live, state, name, payload) {
    const m = live.data && live.data.dispute;
    if (!m || live.phase === 'done' || m.settled) return;
    if (name === 'tetherAttached' && payload && payload.targetId === m.podId && !m.podLatched) {
      m.podLatched = true;
      d.say(live, 'alert', 'POD: ...someone\'s on the line. Please don\'t swing me hard.', null, { literal: true });
    }
  },

  tick(d, live, state, now) {
    const m = live.data && live.data.dispute;
    if (!m || live.phase === 'done' || m.settled) return;
    const player = d.player();
    if (!alive(player)) return this._settle(d, live, m, 'lost');
    const pod = entityById(state, m.podId);
    const wreck = entityById(state, m.wreckId);
    const tender = entityById(state, m.tenderId);
    if (!alive(pod)) return this._settle(d, live, m, 'pod_lost');
    const claimHeld = alive(wreck) && wreck.data && wreck.data.salvorClaimedBy === m.claimId;
    if (claimHeld && m.poolStart > 0 && poolTotal(wreck) <= m.poolStart * (1 - STRIPPED_FRACTION)) {
      return this._settle(d, live, m, 'stripped');
    }
    if (alive(tender) && dist(pod.pos, tender.pos) <= RETURN_WU) return this._settle(d, live, m, 'rescued');
    if (!alive(tender)) return this._settle(d, live, m, 'lost');
    if (now >= m.airEndsAt) return this._settle(d, live, m, 'claimed');
  },

  _settle(d, live, m, outcome) {
    if (m.settled) return;
    m.settled = true;
    m.outcome = outcome;
    const wreck = entityById(d.state, m.wreckId);
    const pod = entityById(d.state, m.podId);
    if (outcome === 'rescued') {
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
      // The crew does the job you didn't: the claim stands, the wreck is theirs in the open.
      if (alive(wreck) && wreck.data) {
        wreck.data.scanLabel = 'WORKED BY PITBORN — CLAIM ENFORCED';
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
  primaryLine: 'PITBORN TENDER: That wreck is under our beacon. There\'s a pod on the far side with air running out and we can\'t reach it from here. Bring the pod to us and the wreck is yours. Touch the wreck first and we file on you.',
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
    claimed: 'Air ran out on your watch. The Pitborn took the pod and the wreck themselves.',
    pod_lost: 'The pod is gone. Nobody pays for that, and the Pitborn saw who was closest.',
    lost: 'The dispute ended without you.',
  },
});
