// 363 — THE WRONG CONVOY (SF-144: a bounded verification problem, not a shoot puzzle).
//
// A customs wire flags that ONE of two freight columns on this lane filed a false
// bill. Both run the same hull class on the same lane. The mark is fixed at spawn
// and never re-dealt: her manifest declares honest bulk freight while her hold
// carries restricted salvage — and her crew knows it. Two honest ways to be sure
// before anyone fires:
//
//   SCAN   — a resolving read (or a fitted cargo scanner's hold read) reports the
//            manifest mismatch on the mark's hulls. The honest column reads clean.
//   WATCH  — the mark's lead jettisons a nervous pod at her mid-lane dodge; the
//            pod on the field is stamped with her own misdeclared ownership.
//
// Interdiction on the verified column pays the wire and the picket faction.
// Killing the honest column is a real wrong: her cargo is real freight with real
// owners, the law sees the kill like any other, and the receipt says which column
// you hit. No role swap, no hidden tell — every fact that convicts her was on the
// field before the first shot.
import { deepFreeze, defineEncounter } from './catalog.js';
import { ActivityKind, RulesOfEngagement, setEntityDoctrine } from '../../ai/doctrine.js';

export const encounterOrder = 363;
export const trigger = deepFreeze({
  id: 'wrong_convoy',
  tier: 'minor',
  deck: 'civilian',
  weight: 1.2,
  zoneTypes: ['trade_lane', 'border_checkpoint', 'refinery_approach'],
  script: 'selfRegistered',
  fallbackScript: 'convoy',
  pressureCost: 24,
  cooldownS: 720,
  proximity: true,
  gates: {
    maxSecurity: 0.85,
  },
});

const WINDOW_S = 200;
const LANE_RUN_WU = 1500;          // convoys transit from -LANE_RUN to +LANE_RUN of the anchor
const MARK_JOG_WU = 260;           // the mark's mid-route lateral dodge — the observable tell
const COLUMN_SPACING_WU = 120;
const BETWEEN_COLUMNS_WU = 420;    // lateral separation — close enough to confuse, far enough to choose
const SPILL_PER_HULL = 2;
const SPILL_QTY = 3;
const SCAN_CONFIRM_WU2 = 800 * 800;

const dist2 = (ax, az, bx, bz) => {
  const dx = ax - bx, dz = az - bz;
  return dx * dx + dz * dz;
};

function transitTo(ent, live, now, anchor, reason) {
  setEntityDoctrine(ent, {
    activity: {
      kind: ActivityKind.TRANSIT,
      reason,
      anchor: { x: anchor.x, z: anchor.z },
      leashRadius: 5000,
      startedTick: Math.round(now * 60),
      encounterId: live.id,
    },
    roe: RulesOfEngagement.HOLD_FIRE,
  });
}

/** Spill a killed hauler's REAL hold as provenance-stamped pods — the cargo that
 * was in her bay lands on the field under her name, not a loot table's. */
function spillHold(d, live, ent, commodityId, ownerName, cargoIdentity) {
  for (let i = 0; i < SPILL_PER_HULL; i++) {
    d.spawnCargoPod(live, {
      pos: { x: ent.pos.x + (i ? 26 : -26), z: ent.pos.z + (i ? -20 : 20) },
      vel: { x: (ent.vel ? ent.vel.x : 0) * 0.4, z: (ent.vel ? ent.vel.z : 0) * 0.4 },
      commodityId,
      amount: SPILL_QTY,
      ownerName,
      originId: ent.data && ent.data.cargoIdentity && ent.data.cargoIdentity.originId || null,
      destinationId: ent.data && ent.data.cargoIdentity && ent.data.cargoIdentity.destinationId || null,
      cargoIdentity,
      radius: 8,
    });
  }
}

export const runtime = Object.freeze({
  fire(d, live, state) {
    live.deadlineAt = d.now() + WINDOW_S;
    const ships = (live.plan && live.plan.ships) || [];
    const markSpecs = ships.filter((sh) => sh && sh.role === 'mark');
    const cleanSpecs = ships.filter((sh) => sh && sh.role === 'clean');
    if (!markSpecs.length || !cleanSpecs.length) return d.abort(live, 'no_cast');

    // One lane axis for both columns — the confusion is the point. The mark
    // column draws the seeded side; which column runs which side is the only
    // randomized fact, and it is fixed here, once.
    const center = live.plan && live.plan.zoneCenter
      ? { x: live.plan.zoneCenter.x, z: live.plan.zoneCenter.z }
      : (live.anchor ? { x: live.anchor.x, z: live.anchor.z } : { x: 0, z: 0 });
    const rng = d.stream(live, 'wrong_convoy_layout');
    const p = d.player();
    let ux = center.x - (p && p.pos ? p.pos.x : center.x - 1);
    let uz = center.z - (p && p.pos ? p.pos.z : center.z);
    let ul = Math.hypot(ux, uz);
    if (!(ul > 1)) { const a = rng() * Math.PI * 2; ux = Math.cos(a); uz = Math.sin(a); ul = 1; }
    const u = { x: ux / ul, z: uz / ul };
    const n = { x: -u.z, z: u.x };
    const markSide = rng() < 0.5 ? -1 : 1;
    const jogSide = rng() < 0.5 ? -1 : 1;

    const lane = {
      u, n, center, markSide, jogSide,
      exitAlong: LANE_RUN_WU,
      markPodDropped: false,
      markPodIds: [],
      warnedOffClean: false,
    };
    live.data.wrongConvoy = lane;

    // Columns enter together from up-lane of the anchor, offset laterally.
    const placeColumn = (specs, side) => {
      specs.forEach((spec, i) => {
        const back = i * COLUMN_SPACING_WU;
        spec.pos = {
          x: center.x - u.x * (LANE_RUN_WU - 200 + back) + n.x * BETWEEN_COLUMNS_WU * side + (rng() - 0.5) * 30,
          z: center.z - u.z * (LANE_RUN_WU - 200 + back) + n.z * BETWEEN_COLUMNS_WU * side + (rng() - 0.5) * 30,
        };
      });
    };
    placeColumn(markSpecs, markSide);
    placeColumn(cleanSpecs, -markSide);

    const ids = d.spawnShips(live, [...markSpecs, ...cleanSpecs]);
    if (!ids.length || d.aliveCount(live, 'mark') < 1 || d.aliveCount(live, 'clean') < 1) {
      return d.abort(live, 'no_budget');
    }

    // Facts, stamped once: the mark files a false bill and carries restricted
    // salvage in the hold; the clean column's manifest matches its bay. These
    // stamps are never touched again — verification reads what was always true.
    const now = d.now();
    const markCargo = { cmdty_classified_salvage: SPILL_PER_HULL * SPILL_QTY };
    d.entsOf(live, 'mark').forEach((ent, i) => {
      const data = ent.data || (ent.data = {});
      data.scanLabel = 'MTS AGRI-RUN — DECLARED BULK FREIGHT';
      data.cargoManifest = {
        manifestId: `manifest:${live.id}:mark:${i}`,
        freighterKey: `${live.id}:mark:${i}`,
        role: 'hauler',
        declaredBy: 'AGRI-RUN FREIGHT',
        lines: [{ commodityId: 'cmdty_silicate', qty: 6 }],
        totalQty: 6,
      };
      data.falseManifest = { cargoHint: 'declared bulk ore freight' };
      data.hiddenCargo = { ...markCargo };
      data.cargo = { items: { ...markCargo } };
      data.cargoIdentity = {
        ownerName: 'AGRI-RUN — MISDECLARED MANIFEST',
        originId: 'station_tethys',
        destinationId: 'station_nyx_march',
      };
    });
    d.entsOf(live, 'clean').forEach((ent, i) => {
      const data = ent.data || (ent.data = {});
      data.scanLabel = 'CIVILIAN BULK HAULER — MANIFEST FILED';
      data.cargoHint = 'bulk ore freight';
      data.cargoManifest = {
        manifestId: `manifest:${live.id}:clean:${i}`,
        freighterKey: `${live.id}:clean:${i}`,
        role: 'hauler',
        declaredBy: 'HELIOS BULK CARRIERS',
        lines: [{ commodityId: 'cmdty_ore_iron', qty: 6 }],
        totalQty: 6,
      };
      data.cargo = { items: { cmdty_ore_iron: 6 } };
      data.cargoIdentity = {
        ownerName: 'HELIOS BULK CARRIERS',
        originId: 'station_ceres',
        destinationId: 'station_helios_prime',
      };
    });

    // Both columns run the same transit — the mark's route bends at the dodge.
    d.entsOf(live, 'clean').forEach((ent) => {
      transitTo(ent, live, now, {
        x: center.x + u.x * LANE_RUN_WU + n.x * BETWEEN_COLUMNS_WU * -markSide,
        z: center.z + u.z * LANE_RUN_WU + n.z * BETWEEN_COLUMNS_WU * -markSide,
      }, 'wrong_convoy:clean_transit');
    });
    lane.markJog = {
      x: center.x + u.x * 120 + n.x * (BETWEEN_COLUMNS_WU * markSide + MARK_JOG_WU * jogSide),
      z: center.z + u.z * 120 + n.z * (BETWEEN_COLUMNS_WU * markSide + MARK_JOG_WU * jogSide),
    };
    lane.markExit = {
      x: center.x + u.x * LANE_RUN_WU + n.x * BETWEEN_COLUMNS_WU * markSide,
      z: center.z + u.z * LANE_RUN_WU + n.z * BETWEEN_COLUMNS_WU * markSide,
    };
    d.entsOf(live, 'mark').forEach((ent) => {
      transitTo(ent, live, now, lane.markJog, 'wrong_convoy:mark_jog');
    });

    live.phase = 'run';
    live.approach = { signal: 'twin_freight_columns', contacts: ids.length, t: now };
    d.say(live, 'alert',
      'CUSTOMS WIRE: one of the columns on this lane filed a false bill — the manifest recovery pays. Verify before you fire.',
      null, { primary: true, literal: true });
  },

  tick(d, live, state, now) {
    if (live.phase === 'done') return;
    const lane = live.data.wrongConvoy;
    const marks = d.entsOf(live, 'mark');
    const cleans = d.entsOf(live, 'clean');

    // The observable tell: at the jog the mark's lead sheds a nervous pod — real
    // cargo on the field, stamped with her own misdeclared ownership.
    if (!lane.markPodDropped && marks.length) {
      const lead = marks[0];
      if (dist2(lead.pos.x, lead.pos.z, lane.markJog.x, lane.markJog.z) <= 90 * 90) {
        lane.markPodDropped = true;
        const pod = d.spawnCargoPod(live, {
          pos: { x: lead.pos.x, z: lead.pos.z },
          vel: { x: (lead.vel ? lead.vel.x : 0) * 0.3, z: (lead.vel ? lead.vel.z : 0) * 0.3 },
          commodityId: 'cmdty_classified_salvage',
          amount: 2,
          ownerName: 'AGRI-RUN — MISDECLARED MANIFEST',
          originId: 'station_tethys',
          destinationId: 'station_nyx_march',
          cargoIdentity: lead.data && lead.data.cargoIdentity,
          radius: 8,
        });
        if (pod && pod.id != null) lane.markPodIds.push(pod.id);
        // …and the column bends back to the lane for the exit.
        for (const ent of marks) {
          transitTo(ent, live, now, lane.markExit, 'wrong_convoy:mark_exit');
        }
        d.say(live, 'bark', 'TRAFFIC WATCH: the far column just shed a pod at the dodge. That is not freight discipline.', null, { literal: true });
      }
    }

    // Resolution by attrition is handled in event(); here the columns exit.
    const allGone = !marks.length && !cleans.length;
    const pastExit = (ent) => ((ent.pos.x - lane.center.x) * lane.u.x + (ent.pos.z - lane.center.z) * lane.u.z) > lane.exitAlong;
    if (marks.some(pastExit)) {
      // The mark made the lane exit with the bill still riding.
      return this._endByExit(d, live, 'mark_escaped');
    }
    if (allGone || now >= live.deadlineAt) {
      return this._endByExit(d, live, 'convoys_cleared');
    }
  },

  _endByExit(d, live, outcome) {
    for (const id of (live.data.wrongConvoy && live.data.wrongConvoy.markPodIds) || []) {
      const pod = d.state && d.state.entities ? d.state.entities.get(id) : null;
      if (pod && pod.alive !== false) {
        pod.data = pod.data || {};
        pod.data.despawnAt = d.now() + 90;
      }
    }
    d.despawnAll(live, 25);
    return d.resolve(live, outcome, { speak: true });
  },

  event(d, live, state, name, p) {
    if (live.phase === 'done') return;
    const lane = live.data.wrongConvoy;

    if (name === 'scanPulse' && p && p.pos) {
      // A pulse that covers the mark is the verification beat: the scanner's own
      // reveal reads the mismatch; the wire confirms which column once, plainly.
      if (lane.scanConfirmed) return;
      const r2 = Number(p.radius) > 0 ? p.radius * p.radius : SCAN_CONFIRM_WU2;
      const hit = d.entsOf(live, 'mark').some((ent) => dist2(ent.pos.x, ent.pos.z, p.pos.x, p.pos.z) <= r2);
      if (hit) {
        lane.scanConfirmed = true;
        d.say(live, 'bark', 'SCAN READ: manifest mismatch on the AGRI-RUN column — hold does not match the bill.', null, { literal: true });
      }
      return;
    }

    if (name === 'playerHitSquad' && p && p.targetId != null
      && live.roles && live.roles[p.targetId] === 'clean' && !lane.warnedOffClean) {
      lane.warnedOffClean = true;
      d.say(live, 'alert', 'TRAFFIC WATCH: that is the honest column — check your target.', null, { literal: true });
      return;
    }

    if (name !== 'squadKill' || !p) return;
    const ent = state.entities && state.entities.get ? state.entities.get(p.id) : null;

    if (p.role === 'clean') {
      // The wrong convoy. Her freight spills under HER name — honest cargo with a
      // real owner — and the wire's receipt names exactly which column you hit.
      if (ent && ent.pos) {
        spillHold(d, live, ent, 'cmdty_ore_iron',
          'HELIOS BULK CARRIERS — VERIFIED MANIFEST',
          ent.data && ent.data.cargoIdentity);
      }
      if (p.byPlayer) d.rep(live.plan && live.plan.factionId || 'faction_scn', -6, 'wrong_convoy_honest_column');
      // entsOf may still count the just-killed hull — exclude the casualty id itself.
      if (!d.entsOf(live, 'clean').some((e) => e.id !== p.id)) {
        return this._endByExit(d, live, 'wrong_mark');
      }
      return;
    }

    if (p.role === 'mark') {
      // Verified or not, the interdiction is physical: her hold spills the real
      // load — restricted salvage under the misdeclared ownership that convicted her.
      if (ent && ent.pos) {
        spillHold(d, live, ent, 'cmdty_classified_salvage',
          'AGRI-RUN — MISDECLARED MANIFEST',
          ent.data && ent.data.cargoIdentity);
      }
      if (!d.entsOf(live, 'mark').some((e) => e.id !== p.id)) {
        d.grant(320, 'wire:manifest_recovery');
        d.rep(live.plan && live.plan.factionId || 'faction_scn', 4, 'wrong_convoy_mark_down');
        return this._endByExit(d, live, 'mark_down');
      }
    }
  },
});

export default defineEncounter(trigger, {
  shape: {
    situation: 'convoy',
    place: trigger.zoneTypes,
    twist: 'named',
    actor: 'mule_trader',
  },
  title: 'THE WRONG CONVOY',
  primaryLine: 'CUSTOMS WIRE: one of the columns on this lane filed a false bill — the manifest recovery pays. Verify before you fire.',
  verbs: ['scan', 'escort', 'fight'],
  civilian: {
    archetypes: ['mule_trader', 'mule_trader'],
    size: [2, 2],
    factionId: 'faction_mts',
    context: 'civilian',
    team: 2,
    passive: true,
  },
  squad: {
    archetypes: ['mule_trader', 'mule_trader'],
    size: [2, 2],
    clusterRadius: 90,
    minSeparation: 50,
    team: 2,
    passive: true,
    doctrine: 'civilian',
    formation: 'line',
  },
  // Role names only — the planner pairs civilian→'mark', squad→'clean' as ship
  // specs; plan.predation stays null so no custody/authority machinery binds.
  predation: {
    carrierRole: 'mark',
    raiderRole: 'clean',
  },
  bark: null,
  deadlineS: WINDOW_S,
  receipts: {
    mark_down: 'MARK DOWN — the misdeclared column is on the field. The wire pays the recovery.',
    wrong_mark: 'WRONG MARK — the honest column is wreckage and her manifest was true. The wire saw which one you hit.',
    mark_escaped: 'MARK AWAY — the false bill ran the lane. The verification was the contract.',
    convoys_cleared: 'COLUMNS CLEAR — both freight lines are gone and the wire stands down.',
  },
});
