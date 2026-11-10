// 700 — THE WEIGHING (E-04, Concord signature). A Scale Barge draws its sweep ring across a
// lawful lane and weighs your hull against your manifest. The scale is honest: it reads mass
// and heat, never the lie on the papers. Playable three ways —
//
//   * MASS SHADOW: park the extra mass behind the dense fragment's silhouette — a pod in a
//     big body's mass shadow never existed;
//   * HAND-OFF: push the mass onto a decoy pod (its spoofed signature is its own manifest)
//     or hold it under a Hush Head;
//   * PAY: take the fine — or bluff and risk the doubled fine plus the flag.
//
// Reads the shared row-513 model in src/data/massSignature.js. No UI gate stands between the
// pilot and the ring: entering it IS submitting, and the verdict offer only appears once the
// scale has spoken over-mass.
import { deepFreeze, defineEncounter } from './catalog.js';
import {
  SWEEP_SCANNER_PROFILES, weighingRead, weighingVerdict, castsMassShadow,
} from '../massSignature.js';

export const encounterOrder = 700;
export const trigger = deepFreeze({
  id: 'the_weighing',
  tier: 'minor',
  deck: 'patrol',
  weight: 0.9,
  zoneTypes: ['border_checkpoint', 'patrol_corridor', 'trade_lane'],
  script: 'selfRegistered',
  fallbackScript: 'patrolScan',
  pressureCost: 30,
  cooldownS: 700,
  proximity: true,
  fireWithinWu: 560,
  gates: { minSecurity: 0.25 },
});

const BARGE_PROFILE = SWEEP_SCANNER_PROFILES.scale_barge;
const FINE_PER_T_CR = 38;          // the fine is priced per unmanifested tonne
const VERDICT_DWELL_S = 2.0;       // the edge must dwell on you this long before the scale speaks
const CARGO_NEAR_WU = 260;         // a loose pod this close to your hull reads as YOUR mass
const VERDICT_CHOICE_S = 22;       // seconds to answer an over-mass before it logs as evasion
const WEIGH_DEADLINE_S = 200;
const BLUFF_ODDS = 0.35;

function releaseCast(live) {
  if (!live) return;
  if (Array.isArray(live.ids)) live.ids.length = 0;
  if (live.roles && typeof live.roles === 'object') {
    for (const id of Object.keys(live.roles)) delete live.roles[id];
  }
}

function entitiesNear(state, pos, radius, filter) {
  const out = [];
  const list = state.entityList || (state.entities ? [...state.entities.values()] : []);
  for (const e of list) {
    if (!e || e.alive === false || !e.pos) continue;
    if (filter && !filter(e)) continue;
    const dx = e.pos.x - pos.x, dz = e.pos.z - pos.z;
    if (dx * dx + dz * dz <= radius * radius) out.push(e);
  }
  return out;
}

function isCargoBody(e) {
  const d = e.data || {};
  return e.type === 'pickup' || d.kind === 'cargo' || !!d.commodityId
    || !!d.freightCustodyPod || d.parentType === 'debris' || d.cargoBody === true;
}

export const runtime = Object.freeze({
  fire(d, live, state) {
    live.deadlineAt = d.now() + WEIGH_DEADLINE_S;
    const center = (live.plan && live.plan.zoneCenter) || live.anchor;
    if (!center || !Number.isFinite(center.x) || !Number.isFinite(center.z)) {
      return d.abort(live, 'no_anchor');
    }
    const ships = (live.plan && live.plan.ships) || [];
    const rng = d.stream(live, 'weighing_layout');

    // The Scale Barge anchors the ring at the zone heart; two customs escorts stand off its
    // gantry arms. Squad specs arrive already positioned near the zone center — pin them.
    const bargeSpec = ships.find((s) => s && s.role === 'squad');
    const escortSpecs = ships.filter((s) => s && s.role === 'escort');
    if (bargeSpec) { bargeSpec.pos = { x: center.x, z: center.z }; }
    escortSpecs.forEach((s, i) => {
      const a = (i === 0 ? 1 : -1) * 0.9;
      s.pos = { x: center.x + Math.cos(a) * 140, z: center.z + Math.sin(a) * 140 };
    });
    const ids = d.spawnShips(live, ships.filter(Boolean));
    if (!ids.length) return d.abort(live, 'no_budget');

    const barges = d.entsOf(live, 'squad');
    const escorts = d.entsOf(live, 'escort');
    const barge = barges[0] || null;
    if (!barge) return d.abort(live, 'no_barge');
    {
      const ai = barge.data && (barge.data.ai || (barge.data.ai = {}));
      if (ai) { ai.passive = true; ai.holdPosition = true; }
      if (barge.data) {
        barge.data.massScanner = 'scale_barge';
        barge.data.scanLabel = 'SCALE BARGE — WEIGHING';
      }
    }
    for (const e of escorts) {
      const ai = e.data && (e.data.ai || (e.data.ai = {}));
      if (ai) { ai.passive = true; ai.holdPosition = true; }
      if (e.data) e.data.scanLabel = 'SCN ESCORT — WEIGH DETAIL';
    }

    // The big rock: the honest hiding place this encounter teaches. It sits inside the ring,
    // close enough that a pilot who reads the situation can put cargo in its mass shadow
    // before the edge dwells on them.
    const rockAngle = rng() * Math.PI * 2;
    const rockDist = 300 + rng() * 120;
    const rock = d.spawnProp(live, {
      pos: { x: center.x + Math.cos(rockAngle) * rockDist, z: center.z + Math.sin(rockAngle) * rockDist },
      radius: 58,
      mass: 5200,
      scanLabel: 'DENSE FRAGMENT — MASS SHADOW',
      storyPropKind: 'weighing_rock',
    });
    if (rock && rock.data) rock.data.massShadow = true;

    const player = d.player();
    live.data.weigh = {
      bargeId: barge.id,
      escortIds: escorts.map((e) => e.id),
      rockId: rock ? rock.id : null,
      manifestMassT: Math.max(1, Math.round((player && player.mass) || 20)),
      entered: false,           // evasion only exists once the ring has had you
      litS: 0,
      cleanS: 0,
      lastNow: null,
      verdictOpen: false,
      verdictDeadlineAt: null,
      fineCr: 0,
      lastReadT: 0,
    };
    live.phase = 'conflict';
    d.say(live, 'alert',
      'SCALE BARGE: hold your vector inside the ring. Your hull is being weighed.',
      null, { primary: true, literal: true });
    d.emit('comms:log', {
      from: 'SCN SCALE BARGE',
      text: 'Your manifest says one mass. The scale will say what it says. The scale is correct.',
      kind: 'encounter',
    });
  },

  tick(d, live, state, now) {
    if (live.phase === 'done') return;
    const weigh = live.data.weigh;
    if (!weigh) return;
    const barge = state.entities.get(weigh.bargeId);
    const player = d.player();

    // The barge is gone — the law lost the scale. Anything unresolved is a withdrawal.
    if (!barge || barge.alive === false) {
      releaseCast(live);
      return d.resolve(live, 'barge_destroyed', { speak: true });
    }
    if (!player || player.alive === false || !player.pos) {
      releaseCast(live);
      return d.resolve(live, 'subject_gone', { speak: false });
    }

    const dt = weigh.lastNow == null ? 0 : Math.max(0, Math.min(0.5, now - weigh.lastNow));
    weigh.lastNow = now;

    const casters = entitiesNear(state, barge.pos, BARGE_PROFILE.ringRadius + 220, castsMassShadow);
    const dx = player.pos.x - barge.pos.x, dz = player.pos.z - barge.pos.z;
    const inRing = dx * dx + dz * dz <= BARGE_PROFILE.ringRadius * BARGE_PROFILE.ringRadius;

    if (!inRing) {
      if (weigh.verdictOpen) {
        weigh.verdictOpen = false;
        return resolveEvasion(d, live, weigh);
      }
      if (weigh.entered) {
        // It had you, then you left before it spoke. Logged as a bolt.
        return resolveEvasion(d, live, weigh);
      }
      // Never entered: the barge keeps the ring lit until its schedule ends.
      if (now >= live.deadlineAt) {
        releaseCast(live);
        return d.resolve(live, 'barge_departed', { speak: false });
      }
      return;
    }

    weigh.entered = true;

    // The live read: hull mass + every loose mass body near you that resolves against it.
    const bodies = entitiesNear(state, player.pos, CARGO_NEAR_WU, (e) => e !== player && isCargoBody(e));
    const read = weighingRead(BARGE_PROFILE, barge.pos, player, bodies, casters);
    weigh.lastReadT = read.readMassT;
    weigh.counted = read.counted;
    weigh.hidden = read.hidden;
    weigh.decoys = read.decoys;
    const verdict = weighingVerdict(read.readMassT, weigh.manifestMassT);
    weigh.overByT = verdict.overByT;

    // Verdict open means the scale has already spoken over-mass: the pilot is inside the
    // answer window now — hide it, pay it, bluff it, or run.
    if (weigh.verdictOpen) {
      if (verdict.outcome === 'clean') {
        // Hid or handed it off in time — the second reading is the one that counts.
        weigh.verdictOpen = false;
        d.say(live, 'bark',
          'SCALE BARGE: correction — the scale reads clean. Clearance logged.',
          null, { literal: true });
        releaseCast(live);
        return d.resolve(live, 'weighed_clean', { speak: true });
      }
      if (now >= weigh.verdictDeadlineAt) return resolveEvasion(d, live, weigh);
      return;
    }

    if (verdict.outcome === 'over_mass') {
      weigh.cleanS = 0;
      weigh.litS += dt;
      if (weigh.litS >= VERDICT_DWELL_S) {
        weigh.verdictOpen = true;
        weigh.verdictDeadlineAt = now + VERDICT_CHOICE_S;
        const fine = Math.max(60, Math.round(verdict.overByT * FINE_PER_T_CR));
        weigh.fineCr = fine;
        live.vars.amount = fine;
        d.emit('comms:log', {
          from: 'SCN SCALE BARGE',
          text: `OVER MASS: the scale reads ${Math.round(verdict.overByT)} t your manifest does not. Fine ${fine} cr — pay it, or explain it.`,
          kind: 'encounter',
        });
        d.emit('weighing:overMass', {
          encounterId: live.id, overByT: Math.round(verdict.overByT * 10) / 10,
          fineCr: fine, t: now,
        });
        d.offerChoices(live, ['pay', 'bluff', 'run'], 'run', weigh.verdictDeadlineAt);
      }
      return;
    }

    weigh.litS = 0;
    weigh.cleanS += dt;
    // A clean read that holds through the dwell logs the hull and lets it go.
    if (weigh.cleanS >= VERDICT_DWELL_S) {
      releaseCast(live);
      return d.resolve(live, 'weighed_clean', { speak: true });
    }
    if (now >= live.deadlineAt) {
      releaseCast(live);
      return d.resolve(live, 'barge_departed', { speak: false });
    }
  },

  choose(d, live, state, choiceId) {
    const weigh = live.data.weigh;
    if (!weigh || live.phase === 'done') return;
    const fine = Math.max(0, Math.round(weigh.fineCr || (weigh.overByT || 0) * FINE_PER_T_CR));
    if (choiceId === 'pay') {
      if (!weigh.verdictOpen) return;   // there is nothing to pay for yet
      d.charge(fine, 'weighing_fine');
      d.rep('faction_scn', 1, 'weighing_paid');
      releaseCast(live);
      return d.resolve(live, 'fined_paid', { speak: true });
    }
    if (choiceId === 'bluff') {
      if (!weigh.verdictOpen) return;   // the bluff needs a spoken over-mass to answer
      // The bluff is a paperwork gamble: the manifest "corrects" about a third of the time,
      // and a caught bluff doubles the fine and the transponder flag.
      const roll = d.stream(live, 'weighing_bluff')();
      if (roll < BLUFF_ODDS) {
        releaseCast(live);
        return d.resolve(live, 'bluffed', { speak: true });
      }
      d.charge(fine * 2, 'weighing_bluff_fine');
      d.rep('faction_scn', -3, 'weighing_bluff_failed');
      releaseCast(live);
      return d.resolve(live, 'bluff_failed', { speak: true });
    }
    if (choiceId === 'run') return resolveEvasion(d, live, weigh);
  },
});

function resolveEvasion(d, live, weigh) {
  // A bolt inside lawful space becomes a warrant — the Evidence Locker hears about it.
  d.rep('faction_scn', -4, 'weighing_evaded');
  d.emit('law:warrantIssued', {
    reason: 'weighing_evasion', fineCr: Math.round(weigh.fineCr || 0), t: d.now(),
  });
  for (const id of weigh.escortIds || []) {
    const e = d.state.entities.get(id);
    if (!e || e.alive === false) continue;
    const ai = (e.data && (e.data.ai || (e.data.ai = {}))) || {};
    ai.passive = false;
    const player = d.player();
    if (player) {
      ai.targetId = player.id;
      (e.data.combat || (e.data.combat = {})).targetId = player.id;
    }
    if (e.data) e.data.scanLabel = 'SCN ESCORT — PURSUING';
  }
  releaseCast(live);
  return d.resolve(live, 'weighing_evaded', { speak: true });
}

export default defineEncounter(trigger, {
  shape: {
    situation: 'patrol',
    place: trigger.zoneTypes,
    twist: 'none',
    actor: 'faction_scn',
  },
  motive: 'lawful_weighing',
  engagementTrigger: 'authorized_hostile_spawn',
  factionId: 'faction_scn',
  context: 'patrol',
  title: 'THE WEIGHING',
  primaryLine: 'SCALE BARGE: hold your vector inside the ring. Your hull is being weighed.',
  squad: {
    archetypes: ['warden_escort'],
    size: [1, 1],
    doctrine: 'official',
    formation: 'line',
    passive: true,
  },
  escort: {
    archetypes: ['customs_cutter'],
    size: [2, 2],
    doctrine: 'official',
    formation: 'line',
    factionId: 'faction_scn',
    context: 'patrol',
    passive: true,
  },
  choices: [
    { id: 'pay', label: 'Pay the over-mass fine.', needs: 'credits', playerLine: 'Fine. Take it off my account.' },
    { id: 'bluff', label: 'Bluff — the manifest is correct.', playerLine: 'Your scale is wrong, not my papers.' },
    { id: 'run', label: 'Bolt — leave the ring.', playerLine: 'Not today.' },
  ],
  timeoutChoice: 'run',
  bark: null,
  telegraph: 'A Concord Scale Barge draws its sweep ring across the lane — you are being weighed.',
  deadlineS: WEIGH_DEADLINE_S,
  aftermath: {
    flee: 'The ring collapses behind you. The barge logs the bolt.',
    kill: 'The scale is wreckage. The lane weighs nothing today.',
  },
  receipts: {
    weighed_clean: 'WEIGHED — the scale reads clean. Clearance logged.',
    fined_paid: 'FINED — the over-mass is paid. The manifest corrects.',
    bluffed: 'BLUFFED — the manifest corrects itself. The barge waves you through.',
    bluff_failed: 'CAUGHT — the bluff doubles the fine. Your transponder is flagged.',
    weighing_evaded: 'EVADED — you left the ring under the scale. A warrant follows.',
    barge_departed: 'The Scale Barge shipped out on schedule. The lane is just a lane again.',
    barge_destroyed: 'The scale is wreckage. Concord will weigh the loss in warrants.',
    subject_gone: 'The subject is gone. The scale reads nothing.',
  },
});
