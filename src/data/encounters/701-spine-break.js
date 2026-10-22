// 701 — SPINE BREAK (E-05, Meridian signature). The Reach cut a cargo spine in a rock field.
// The tug still holds its head containers; the tail is already past the stretch — the
// meridian system's own coupler law spills it on the first tick, and every loose box's hull
// ticker counts its value down while it drifts. Three honest answers:
//
//   * RE-COUPLE: drag the loose containers back to the spine's tail — the fee is per box;
//   * STEAL: collect them as salvage and leave;
//   * SELL: feed them to the Pitborn buyer skiff standing off the lane for a cut of ticker.
//
// The re-link is physical (faction_meridian's recouple radius), never a menu.
import { deepFreeze, defineEncounter } from './catalog.js';
import { faction as MTS } from '../factions/mts.js';

export const encounterOrder = 701;
export const trigger = deepFreeze({
  id: 'spine_break',
  tier: 'minor',
  deck: 'civilian',
  weight: 1.0,
  zoneTypes: ['trade_lane', 'patrol_corridor', 'derelict_field'],
  script: 'selfRegistered',
  fallbackScript: 'traderRun',
  pressureCost: 26,
  cooldownS: 900,
  proximity: true,
  fireWithinWu: 700,
  gates: {},
});

const CFG = (MTS.custom && MTS.custom.spineBreak) || {};
const SPINE = (MTS.custom && MTS.custom.cargoSpine) || {};
const FEE_PER_BOX = Math.max(0, Number(CFG.recoupleFeePerContainerCr) || 120);
const RECOUPLE_GOAL = Math.max(1, Math.round(Number(CFG.recoupleGoal) || 3));
const PITBORN_FRAC = Math.min(1, Math.max(0, Number(CFG.pitbornPriceFrac) || 0.35));
const LINK_GAP = Math.max(20, Number(SPINE.linkGapWu) || 46);
const STRETCH = Math.max(40, Number(SPINE.couplerStretchWu) || 90);
const CONTAINER_VALUE_CR = 4200;
const HEAD_LINKED = 2;           // containers still on the tug when we arrive
const TAIL_LOOSE = 4;            // the spill the Reach left behind
const SELL_RADIUS_WU = 120;      // buyer skiff's catch volume
const LEAVE_RADIUS_WU = 1900;
const DEADLINE_S = 300;

function releaseCast(live) {
  if (!live) return;
  if (Array.isArray(live.ids)) live.ids.length = 0;
  if (live.roles && typeof live.roles === 'object') {
    for (const id of Object.keys(live.roles)) delete live.roles[id];
  }
}

export const runtime = Object.freeze({
  fire(d, live, state) {
    live.deadlineAt = d.now() + DEADLINE_S;
    const center = (live.plan && live.plan.zoneCenter) || live.anchor;
    if (!center || !Number.isFinite(center.x) || !Number.isFinite(center.z)) {
      return d.abort(live, 'no_anchor');
    }
    const ships = (live.plan && live.plan.ships) || [];
    const rng = d.stream(live, 'spine_layout');

    // The crippled train: tug + broker yacht holding station, plus a Pitborn buyer skiff
    // parked off the lane — the dishonorable answer is already on the field.
    const tugSpec = ships.find((s) => s && s.role === 'squad');
    const yachtSpec = ships.find((s) => s && s.role === 'escort');
    if (tugSpec) tugSpec.pos = { x: center.x, z: center.z };
    if (yachtSpec) yachtSpec.pos = { x: center.x + 160, z: center.z - 120 };
    const buyerSpec = {
      archetype: 'reaver_pirate', level: 1, role: 'buyer', factionId: 'faction_pitborn',
      context: 'civilian', passive: true,
      pos: { x: center.x + 420, z: center.z + 380 },
      scanLabel: 'PITBORN BUYER — CASH FOR LOOSE MTS BOXES',
    };
    const ids = d.spawnShips(live, [tugSpec, yachtSpec, buyerSpec].filter(Boolean));
    if (!ids.length) return d.abort(live, 'no_budget');

    const tugs = d.entsOf(live, 'squad');
    const buyer = d.entsOf(live, 'buyer')[0] || null;
    const tug = tugs[0] || null;
    if (!tug || !buyer) return d.abort(live, 'no_cast');
    {
      const ai = tug.data && (tug.data.ai || (tug.data.ai = {}));
      if (ai) { ai.passive = true; ai.holdPosition = true; }
      if (tug.data) tug.data.scanLabel = 'MTS SPINE TUG — COUPLER 3 GONE';
      const bd = buyer.data || (buyer.data = {});
      bd.scanLabel = 'PITBORN BUYER — CASH FOR LOOSE MTS BOXES';
      const bai = bd.ai || (bd.ai = {});
      bai.passive = true; bai.holdPosition = true;
    }

    // The spine. Head containers ride behind the tug still linked. The tail is authored
    // already out past the stretch — the coupler law cuts it loose on the first update,
    // so the spill is the real mechanic, not a scripted stamp.
    const spineId = `spine_${live.id}`;
    const dir = { x: -1, z: 0 }; // the train points back down-lane
    const all = [];
    for (let i = 0; i < HEAD_LINKED + TAIL_LOOSE; i++) {
      const linked = i < HEAD_LINKED;
      // Linked boxes ride at link spacing; the tail starts past the stretch limit so the
      // coupler law itself cuts it loose — the break is authored, the spill is real.
      const gap = linked
        ? LINK_GAP * (i + 1)
        : LINK_GAP * HEAD_LINKED + STRETCH * 1.4 + LINK_GAP * (i - HEAD_LINKED);
      const jitter = linked ? 0 : (rng() - 0.5) * 90; // z-scatter only: x must stay past the stretch
      const pod = d.spawnCargoPod(live, {
        pos: { x: center.x + dir.x * gap, z: center.z + dir.z * gap + jitter },
        vel: { x: linked ? 0 : (rng() - 0.5) * 8, z: linked ? 0 : (rng() - 0.5) * 8 },
        commodityId: 'cmdty_electronics', amount: 6, unitMass: 6,
        ownerName: 'Meridian Trade Syndicate', factionId: 'faction_mts',
      });
      if (!pod) continue;
      pod.data = pod.data || {};
      pod.data.spineId = spineId;
      pod.data.spineIndex = i + 1;
      pod.data.cargoValueCr = CONTAINER_VALUE_CR - i * 150;
      pod.data.authoredLoose = !linked;
      pod.data.encounterId = live.id;
      all.push(pod);
    }
    if (!all.length) return d.abort(live, 'no_bodies');
    // The tug itself is index 0 of the same train.
    if (tug.data) { tug.data.spineId = spineId; tug.data.spineIndex = 0; }

    live.data.spineBreak = {
      spineId,
      tugId: tug.id,
      buyerId: buyer.id,
      containerIds: all.map((p) => p.id),
      looseIds: all.filter((p) => p.data.authoredLoose).map((p) => p.id),
      stolenIds: [],
      soldIds: [],
      soldCr: 0,
      recoupledIds: [],
    };
    live.phase = 'conflict';
    d.say(live, 'alert',
      'MTS BROKER: The Reach cut my couplers. Three boxes back on the tail earns the fee — or feed them to that Pitborn carrion and see what it pays.',
      null, { primary: true, literal: true });
    d.emit('comms:log', {
      from: 'MTS BROKER',
      text: 'Every drifting box is losing money on its own ticker. Move.',
      kind: 'encounter',
    });
  },

  event(d, live, state, name, payload) {
    const rec = live.data && live.data.spineBreak;
    if (!rec || live.phase === 'done') return;
    // Cargo pods the player pulls aboard are stolen freight, whoever's name is on them.
    if ((name === 'pickup:collected' || name === 'cargo:collected' || name === 'freight:collected')
      && payload && rec.containerIds.includes(payload.entityId || payload.id)) {
      const id = payload.entityId || payload.id;
      if (!rec.stolenIds.includes(id)) {
        rec.stolenIds.push(id);
        d.emit('comms:log', {
          from: 'MTS BROKER',
          text: 'That box is on a manifest. The manifest knows.',
          kind: 'encounter',
        });
      }
    }
  },

  tick(d, live, state, now) {
    if (live.phase === 'done') return;
    const rec = live.data.spineBreak;
    if (!rec) return;
    const player = d.player();
    if (!player || player.alive === false) {
      releaseCast(live);
      return d.resolve(live, 'subject_gone', { speak: false });
    }

    // The Pitborn buyer's catch volume: a loose box drifted into it is sold at the cut.
    const buyer = state.entities.get(rec.buyerId);
    if (buyer && buyer.alive !== false) {
      for (const id of rec.looseIds) {
        if (rec.soldIds.includes(id) || rec.stolenIds.includes(id)) continue;
        const box = state.entities.get(id);
        if (!box || box.alive === false || !box.pos) continue;
        if (box.data && box.data.spineLoose !== true) continue; // re-coupled boxes aren't loose freight
        const dx = box.pos.x - buyer.pos.x, dz = box.pos.z - buyer.pos.z;
        if (dx * dx + dz * dz <= SELL_RADIUS_WU * SELL_RADIUS_WU) {
          const value = Math.max(0, Math.round((box.data && box.data.cargoValueCr) || 0));
          const cut = Math.round(value * PITBORN_FRAC);
          rec.soldIds.push(id);
          rec.soldCr += cut;
          box.alive = false;
          if (box.data) box.data.soldToPitborn = true;
          d.grant(cut, 'spine_break_pitborn_sale');
          d.emit('meridian:containerSold', { encounterId: live.id, id, cutCr: cut, t: now });
          d.emit('comms:log', {
            from: 'PITBORN BUYER',
            text: `${cut} cr. Cash. No manifest.`,
            kind: 'encounter',
          });
        }
      }
    }

    // Re-coupled: an authored-loose box riding linked on the train again.
    for (const id of rec.looseIds) {
      if (rec.recoupledIds.includes(id) || rec.soldIds.includes(id) || rec.stolenIds.includes(id)) continue;
      const box = state.entities.get(id);
      if (!box || box.alive === false) continue;
      if (box.data && box.data.spineLoose === false && box.data.spineId === rec.spineId) {
        rec.recoupledIds.push(id);
        d.emit('comms:log', {
          from: 'MTS SPINE TUG',
          text: `Coupler closed. ${rec.recoupledIds.length} back on the train.`,
          kind: 'encounter',
        });
      }
    }
    if (rec.recoupledIds.length >= RECOUPLE_GOAL) {
      const fee = rec.recoupledIds.length * FEE_PER_BOX;
      d.grant(fee, 'spine_break_recouple_fee');
      d.rep('faction_mts', 3, 'spine_break_recoupled');
      releaseCast(live);
      return d.resolve(live, 'spine_recoupled', { speak: true });
    }

    // Every loose box accounted for — the field decides which way it went.
    const pending = rec.looseIds.filter((id) => {
      if (rec.soldIds.includes(id) || rec.stolenIds.includes(id) || rec.recoupledIds.includes(id)) return false;
      const box = state.entities.get(id);
      return box && box.alive !== false;
    });
    if (!pending.length) {
      releaseCast(live);
      if (rec.soldIds.length >= rec.stolenIds.length && rec.soldIds.length > 0) {
        d.rep('faction_mts', -2, 'spine_break_sold_to_pitborn');
        d.rep('faction_pitborn', 1, 'spine_break_sold_to_pitborn');
        return d.resolve(live, 'sold_to_pitborn', { speak: true });
      }
      if (rec.stolenIds.length > 0) {
        d.rep('faction_mts', -3, 'spine_break_containers_stolen');
        return d.resolve(live, 'containers_stolen', { speak: true });
      }
      return d.resolve(live, 'spine_recoupled', { speak: true });
    }

    // The pilot leaves with freight aboard — or leaves, period.
    if (player.pos) {
      const barge = state.entities.get(rec.tugId);
      const anchor = (barge && barge.pos) || (live.plan && live.plan.zoneCenter) || live.anchor;
      if (anchor) {
        const dx = player.pos.x - anchor.x, dz = player.pos.z - anchor.z;
        if (dx * dx + dz * dz > LEAVE_RADIUS_WU * LEAVE_RADIUS_WU) {
          releaseCast(live);
          if (rec.stolenIds.length > 0) {
            d.rep('faction_mts', -3, 'spine_break_containers_stolen');
            return d.resolve(live, 'containers_stolen', { speak: true });
          }
          return d.resolve(live, 'walked_away', { speak: false });
        }
      }
    }

    if (now >= live.deadlineAt) {
      // The Pitborn take what's left — the market prices what it is told.
      releaseCast(live);
      return d.resolve(live, 'spine_lost', { speak: true });
    }
  },
});

export default defineEncounter(trigger, {
  shape: {
    situation: 'salvage',
    place: trigger.zoneTypes,
    twist: 'none',
    actor: 'faction_mts',
  },
  motive: 'salvage_the_spine',
  engagementTrigger: 'none',
  factionId: 'faction_mts',
  context: 'civilian',
  title: 'SPINE BREAK',
  primaryLine: 'MTS BROKER: The Reach cut my couplers. Three boxes back on the tail earns the fee.',
  squad: {
    archetypes: ['mule_trader'],
    size: [1, 1],
    doctrine: 'official',
    formation: 'line',
    passive: true,
  },
  escort: {
    archetypes: ['mule_trader'],
    size: [1, 1],
    doctrine: 'official',
    formation: 'none',
    factionId: 'faction_mts',
    context: 'civilian',
    passive: true,
  },
  choices: [],
  bark: null,
  telegraph: 'A Meridian cargo spine drifts cut — loose containers bleed value on their hull tickers.',
  deadlineS: DEADLINE_S,
  aftermath: {
    flee: 'The tickers keep counting down behind you.',
    kill: 'The manifest is scrap now. The market priced it anyway.',
  },
  receipts: {
    spine_recoupled: 'RE-COUPLED — the train rolls again. The fee is paid.',
    containers_stolen: 'STOLEN — Meridian boxes ride your manifest. The Syndicate prices that too.',
    sold_to_pitborn: 'SOLD — cash, no manifest. The Pitborn eat well tonight.',
    spine_lost: 'LOST — the Pitborn took what the tickers left. The market moved.',
    walked_away: 'The spill drifts on without you.',
    subject_gone: 'The field keeps only wreckage.',
  },
});
