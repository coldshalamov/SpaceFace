// 357 — THE HANDOFF (CR-HOLLOW braid: ships that should not be together, docked anyway).
// A Quiet runner and an MTS mule sit nose-to-nose in a lawless pocket — sixty world-units
// of empty deck between them, contraband pods drifting the gap one slow crawl at a time.
// The pods ARE the deal: stolen goods riding an unlogged manifest from seller to buyer.
// Nothing is scripted to complete — pods physically drift onto the buyer's hull, get
// restamped paid, and stack there. Come in hot and both crews scatter and the freight
// is free for whoever takes it; walk up slow and the seller will deal with you too —
// a Quiet contact is worth more than one stolen pod.
import { deepFreeze, defineEncounter } from './catalog.js';
import { setEntityDoctrine } from '../../ai/doctrine.js';

export const encounterOrder = 357;
export const trigger = deepFreeze({
  id: 'off_book_handoff',
  tier: 'minor',
  deck: 'civilian',
  weight: 1.0,
  // Deals like this happen where law is thin: outlaw pockets, fog, dead fields, the lanes
  // between them. maxSecurity keeps it out of policed cores; the zoneTypes keep it in the
  // pockets that are already hollow.
  zoneTypes: ['outlaw_zone', 'nebula_fog', 'derelict_field', 'ambush_lane'],
  script: 'selfRegistered',
  fallbackScript: 'whisper',
  pressureCost: 10,
  cooldownS: 800,
  proximity: true,
  gates: {
    maxSecurity: 0.75,
    minSectorTier: 1,
    storyBeatMin: 1,
  },
});

const DEAL_GAP_WU = 64;             // nose-to-nose: close enough to read docked, far enough to cut
const POD_COUNT = 4;
const POD_SPEED = 3.2;              // the conveyor crawl — a real drift, not a teleported stack
const DELIVER_REACH_WU = 26;        // a pod this close to the buyer counts as received
const PARLEY_WU = 210;              // walking up slow inside this ring opens the quiet offer
const PARLEY_S = 6;
const DEAL_DEADLINE_S = 110;
const SELLER_COMMODITY = 'cmdty_stolen_goods';
const BUYER_COMMODITY = 'cmdty_narcotics';

function releaseCast(live) {
  if (!live) return;
  if (Array.isArray(live.ids)) live.ids.length = 0;
  if (live.roles && typeof live.roles === 'object') {
    for (const id of Object.keys(live.roles)) delete live.roles[id];
  }
}

function scatter(entity) {
  if (!entity || entity.alive === false) return;
  const d = entity.data || (entity.data = {});
  const ai = d.ai || (d.ai = {});
  ai.forceFlee = true;
  ai.moraleImmune = false;
}

export const runtime = Object.freeze({
  fire(d, live, state) {
    live.deadlineAt = d.now() + (live.shape.deadlineS || DEAL_DEADLINE_S);
    const anchor = live.plan && live.plan.zoneCenter;
    if (!anchor || !Number.isFinite(anchor.x)) return d.abort(live, 'no_zone_anchor');

    const ships = live.plan.ships || [];
    const sellerSpec = ships.find((sh) => sh && sh.role === 'hauler');
    const buyerSpec = ships.find((sh) => sh && sh.role === 'raider');
    if (!sellerSpec || !buyerSpec) return d.abort(live, 'no_cast');

    // The pair sits on one seeded bearing; pods string the gap between the two bows.
    const rng = d.stream(live, 'handoff_layout');
    const ang = rng() * Math.PI * 2;
    const axis = { x: Math.cos(ang), z: Math.sin(ang) };
    sellerSpec.pos.x = anchor.x - axis.x * DEAL_GAP_WU * 0.5;
    sellerSpec.pos.z = anchor.z - axis.z * DEAL_GAP_WU * 0.5;
    buyerSpec.pos.x = anchor.x + axis.x * DEAL_GAP_WU * 0.5;
    buyerSpec.pos.z = anchor.z + axis.z * DEAL_GAP_WU * 0.5;

    const ids = d.spawnShips(live, ships);
    if (!ids.length || d.aliveCount(live, 'hauler') < 1 || d.aliveCount(live, 'raider') < 1) {
      return d.abort(live, 'no_budget');
    }

    const seller = d.entsOf(live, 'hauler')[0];
    const buyer = d.entsOf(live, 'raider')[0];
    for (const [ship, label] of [[seller, 'QUIET RUNNER — SELLING'], [buyer, 'MTS MULE — BUYING']]) {
      ship.vel = { x: 0, z: 0 };
      const sd = ship.data || (ship.data = {});
      sd.scanLabel = label;
      setEntityDoctrine(ship, {
        activity: {
          kind: 'loiter',
          anchor: { x: ship.pos.x, z: ship.pos.z },
          preferredRange: 22,
          reason: 'off_book_handoff:parked',
          encounterId: live.id || null,
        },
        roe: 'hold_fire',
      });
    }

    // The manifest mid-transfer: contraband pods crawling the gap toward the buyer.
    // Alternating commodities so the line reads as two manifests, not one spill.
    live.data.pods = [];
    for (let i = 0; i < POD_COUNT; i++) {
      // Spread along the seller's half of the gap — pods start clear of the buyer's
      // receive reach and arrive over the next stretch of seconds, one crawl at a time.
      const t = 0.10 + (i / Math.max(1, POD_COUNT - 1)) * 0.45;
      const pod = d.spawnCargoPod(live, {
        commodityId: i % 2 === 0 ? SELLER_COMMODITY : BUYER_COMMODITY,
        amount: 2,
        pos: {
          x: seller.pos.x + (buyer.pos.x - seller.pos.x) * t + (rng() - 0.5) * 8,
          z: seller.pos.z + (buyer.pos.z - seller.pos.z) * t + (rng() - 0.5) * 8,
        },
        vel: { x: axis.x * POD_SPEED, z: axis.z * POD_SPEED },
        ownerId: seller.id,
        ownerName: 'QUIET MANIFEST',
        factionId: 'faction_quiet',
      });
      if (pod && pod.id != null) live.data.pods.push(pod.id);
    }

    live.data.sellerId = seller.id;
    live.data.buyerId = buyer.id;
    live.data.axis = axis;
    live.data.parleySince = null;
    live.data.parleyOffered = false;
    live.data.delivered = 0;
    live.phase = 'offer';
    d.say(live, 'alert',
      'LANE WATCH: two hulls parked nose-to-nose off the lane — cargo crawling the gap.',
      null, { primary: true, literal: true });
  },

  tick(d, live, state, now) {
    if (live.phase === 'done') return;
    const seller = state.entities.get(live.data.sellerId) || null;
    const buyer = state.entities.get(live.data.buyerId) || null;
    const sellerAlive = seller && seller.alive !== false;
    const buyerAlive = buyer && buyer.alive !== false;

    // A dead party ends the deal: the survivor scatters with the manifest.
    if (!sellerAlive || !buyerAlive) {
      if (sellerAlive) { scatter(seller); live.data.survivorId = seller.id; }
      if (buyerAlive) { scatter(buyer); live.data.survivorId = buyer.id; }
      releaseCast(live);
      return d.resolve(live, 'deal_burned', { speak: true });
    }

    // Pods physically arrive: close to the buyer, they are restamped paid and park.
    const podIds = new Set(live.data.pods || []);
    let stolen = false, destroyed = false;
    const found = new Set();
    for (const e of state.entityList || []) {
      if (!e || !podIds.has(e.id)) continue;
      found.add(e.id);
      if (e.alive === false) { destroyed = true; continue; }
      if (!e.pos) continue;
      const dx = e.pos.x - buyer.pos.x, dz = e.pos.z - buyer.pos.z;
      if (dx * dx + dz * dz <= DELIVER_REACH_WU * DELIVER_REACH_WU) {
        if (!e.data || e.data.deliveredBy !== live.id) {
          e.data = e.data || {};
          e.data.deliveredBy = live.id;
          e.data.ownerId = buyer.id;
          e.data.ownerName = 'BOUGHT — OFF-BOOK MANIFEST';
          e.vel = { x: 0, z: 0 };
          live.data.delivered++;
        }
      }
    }
    const missing = podIds.size - found.size;
    if (missing > 0) stolen = true; // a pod that vanishes without delivery was taken

    // Taking freight mid-line is a robbery; burning one is louder.
    if (destroyed || stolen) {
      scatter(seller); scatter(buyer);
      d.rep('faction_quiet', -2, 'handoff_robbed');
      d.emit('comms:log', {
        from: 'QUIET RUNNER',
        text: destroyed
          ? 'You just shot paid freight. We are done here.'
          : 'That manifest was spoken for. Walk it off fast.',
        kind: 'encounter',
      });
      releaseCast(live);
      return d.resolve(live, destroyed ? 'take_burned' : 'take_taken', { speak: true });
    }

    // Every pod delivered: the deal completes, both crews ease off the pocket.
    if (live.data.delivered >= podIds.size && podIds.size > 0) {
      scatter(seller); scatter(buyer);
      d.emit('comms:log', {
        from: 'MTS MULE',
        text: 'Manifest moved. No record, no lag \u2014 good doing nothing with you.',
        kind: 'encounter',
      });
      releaseCast(live);
      return d.resolve(live, 'deal_done', { speak: true });
    }

    // The join read: stand inside the ring unarmed for a stretch and the seller treats you
    // as market, not threat. A Quiet contact in the ledger is the payoff.
    const player = d.player();
    if (player && player.pos && !live.data.parleyOffered) {
      const pdx = player.pos.x - seller.pos.x, pdz = player.pos.z - seller.pos.z;
      const inRing = pdx * pdx + pdz * pdz <= PARLEY_WU * PARLEY_WU;
      if (inRing) {
        if (live.data.parleySince == null) live.data.parleySince = now;
        else if (now - live.data.parleySince >= PARLEY_S) {
          live.data.parleyOffered = true;
          d.rep('faction_quiet', 2, 'handoff_contact');
          d.grant(60, 'handoff:quiet_lay');
          d.emit('comms:log', {
            from: 'QUIET RUNNER',
            text: 'You fly quiet enough. There\u2019s a cut for the careful \u2014 the Den remembers faces.',
            kind: 'encounter',
          });
          // The deal finishes around the new contact; nothing forces an exit.
          scatter(seller); scatter(buyer);
          releaseCast(live);
          return d.resolve(live, 'contact_made', { speak: true });
        }
      } else if (live.data.parleySince != null) {
        live.data.parleySince = null; // stepped out of the ring — the window resets
      }
    }

    if (now >= live.deadlineAt) {
      scatter(seller); scatter(buyer);
      releaseCast(live);
      return d.resolve(live, 'deal_done', { speak: false });
    }
  },
});

export default defineEncounter(trigger, {
  // Jettisoned cargo pods resolve pods/pod_cargo_container.glb at spawn — declare it so the
  // pending-item decode runway warms the pod body before telegraph resolves (the menu
  // crucible cohort only covers sessions that ran it).
  warmAssets: ['pods/pod_cargo_container.glb'],
  shape: {
    situation: 'trade',
    place: trigger.zoneTypes,
    twist: 'none',
    actor: 'faction_quiet',
  },
  motive: 'off_book_manifest',
  engagementTrigger: 'authorized_hostile_spawn',
  factionId: 'faction_mts',
  context: 'civilian',
  title: 'THE HANDOFF',
  primaryLine: 'LANE WATCH: two hulls parked nose-to-nose off the lane — cargo crawling the gap.',
  squad: {
    // The buyer: an MTS mule where an MTS mule should not be — passive, parked, on the
    // civilian team; the squad block is only the second-half casting slot.
    archetypes: ['mule_trader'],
    size: [1, 1],
    doctrine: 'scavenger',
    formation: 'loose',
    passive: true,
    team: 2,
  },
  civilian: {
    // The seller: a Quiet runner parked on the manifest.
    archetypes: ['mule_trader'],
    size: [1, 1],
    factionId: 'faction_quiet',
    context: 'civilian',
    team: 2,
    passive: true,
  },
  bark: null,
  telegraph: 'Two hulls sit nose-to-nose in the dark — a manifest crawling between them.',
  deadlineS: DEAL_DEADLINE_S,
  aftermath: {
    flee: 'The pair scatter off the pocket. Whatever pods remain are finders\u2019 freight.',
    kill: 'The deal ends the loud way. The Quiet keep better ledgers than grudges.',
  },
  receipts: {
    deal_done: 'DEAL DONE — manifest moved, no record. The pocket is empty again.',
    deal_burned: 'DEAL BURNED — a body dropped; the survivor ran with the record.',
    take_taken: 'TAKEN — the pods are yours; the Quiet ledger remembers it.',
    take_burned: 'BURNED — shot freight buys nothing but a story.',
    contact_made: 'A QUIET CONTACT — you walked up slow; the Den knows your hull now.',
  },
});
