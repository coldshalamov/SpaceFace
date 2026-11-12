// Cinderglass Job — authored operation definition.
// All stable IDs, authored geometry (Tethys sector-local), quotes, and release rules
// live here. Pure data + pure helpers only; no RNG, no time, no DOM.

import { sectorLocalToGlobalForSector } from '../../data/sectorCoordinates.js';
import { interpolate } from '../../localization/runtime.js';

export const CINDERGLASS_JOB_FEATURE_ID = 'cinderglassJob';
export const CINDERGLASS_JOB_SECTOR_ID = 'sector_tethys_junction';
export const CINDERGLASS_JOB_STATION_ID = 'station_tethys';

/* ── Stable durable identities (world record ids, never numeric entity ids) ── */
export const CINDERGLASS_JOB_POD_ID = 'pro:cinderglassJob:pod';
export const CINDERGLASS_JOB_CARRIER_ID = 'pro:cinderglassJob:carrier';
export const CINDERGLASS_JOB_ESCORT_A_ID = 'pro:cinderglassJob:escort-a';
export const CINDERGLASS_JOB_ESCORT_B_ID = 'pro:cinderglassJob:escort-b';
export const CINDERGLASS_JOB_CRADLE_ID = 'pro:cinderglassJob:cradle';
export const CINDERGLASS_JOB_BROKER_ID = 'pro:cinderglassJob:broker';
export const CINDERGLASS_JOB_LAYBY_ID = 'pro:cinderglassJob:layby';
export const CINDERGLASS_JOB_LATCH_ID = 'pro:cinderglassJob:latch';

/* ── Named actors ── */
export const CINDERGLASS_JOB_TALA_NAME = 'Tala Rook';
export const CINDERGLASS_JOB_DASK_NAME = 'Capt. Oren Dask';
export const CINDERGLASS_JOB_BROKER_NAME = 'Vesi Khand';
export const CINDERGLASS_JOB_TALA_CONTACT_ID = 'contact_tala_rook_cinderglass';

/* ── Authored local geometry (Tethys sector frame, converted once) ──
   Pull-off: the commission's fixed quiet freight pull-off at sector-local (-1600, 800).
   Clearances vs authored landmarks (all > 400 WU):
     Tally rack (-800,-1200): ~2189   Customs nine (-1600,-1200): 2000
     Marshal nine (1500,1400): ~3158  Black-market POI (-1000,550): ~640
     Refiled hull (-1500,1450): ~656  Split station (-800,1600): ~1131 */
const LOCAL = {
  pullOff: [-1600, 800],
  marshal: [1350, 1450],
  bend: [-620, -240],
  // Outer perimeter: escorts guard the approach lanes while the Mule works the layby.
  // Real travel and sightlines remain active; the original pod supplies close blind-side cover.
  escortBuoyA: [-2050, 1100],
  escortBuoyB: [-1200, 650],
  cradle: [-430, 1540],
  broker: [-1790, 260],
};

export const CINDERGLASS_JOB_POINTS = Object.freeze(
  Object.fromEntries(Object.entries(LOCAL).map(([key, local]) => [
    key,
    Object.freeze(sectorLocalToGlobalForSector({ x: local[0], z: local[1] }, CINDERGLASS_JOB_SECTOR_ID)),
  ])),
);

/* ── Route: four authored legs, ~2.5–3.5 min at working speed ──
   leg 0 freight approach: marshal formup -> pull-off
   leg 1 inspection layby: hold at the pull-off (real pause; escorts cover separated outer-perimeter buoys)
   leg 2 outbound bend: pull-off -> bend by the weigh-slip line
   leg 3 return: bend -> marshal (run ends; consignment delivered to buyer) */
export const CINDERGLASS_JOB_ROUTE = Object.freeze([
  Object.freeze({ id: 'cg-leg-approach', pos: CINDERGLASS_JOB_POINTS.marshal }),
  Object.freeze({ id: 'cg-leg-layby', pos: CINDERGLASS_JOB_POINTS.pullOff }),
  Object.freeze({ id: 'cg-leg-outbound', pos: CINDERGLASS_JOB_POINTS.bend }),
  Object.freeze({ id: 'cg-leg-return', pos: CINDERGLASS_JOB_POINTS.marshal }),
]);
// Escorts retain separate physical lanes: three ships cannot all occupy the same stop.
export const CINDERGLASS_JOB_ESCORT_ROUTE = Object.freeze([
  Object.freeze({ id: 'cg-escort-a-marshal', pos: Object.freeze({ x: CINDERGLASS_JOB_POINTS.marshal.x + 60, z: CINDERGLASS_JOB_POINTS.marshal.z - 80 }) }),
  Object.freeze({ id: 'cg-escort-a-layby', pos: CINDERGLASS_JOB_POINTS.escortBuoyA }),
  Object.freeze({ id: 'cg-escort-a-bend', pos: Object.freeze({ x: CINDERGLASS_JOB_POINTS.bend.x - 100, z: CINDERGLASS_JOB_POINTS.bend.z + 100 }) }),
  Object.freeze({ id: 'cg-escort-a-return', pos: Object.freeze({ x: CINDERGLASS_JOB_POINTS.marshal.x + 60, z: CINDERGLASS_JOB_POINTS.marshal.z - 80 }) }),
]);
export const CINDERGLASS_JOB_ESCORT_B_ROUTE = Object.freeze([
  Object.freeze({ id: 'cg-escort-b-marshal', pos: Object.freeze({ x: CINDERGLASS_JOB_POINTS.marshal.x - 60, z: CINDERGLASS_JOB_POINTS.marshal.z + 80 }) }),
  Object.freeze({ id: 'cg-escort-b-layby', pos: CINDERGLASS_JOB_POINTS.escortBuoyB }),
  Object.freeze({ id: 'cg-escort-b-bend', pos: Object.freeze({ x: CINDERGLASS_JOB_POINTS.bend.x + 100, z: CINDERGLASS_JOB_POINTS.bend.z - 100 }) }),
  Object.freeze({ id: 'cg-escort-b-return', pos: Object.freeze({ x: CINDERGLASS_JOB_POINTS.marshal.x - 60, z: CINDERGLASS_JOB_POINTS.marshal.z + 80 }) }),
]);
export const CINDERGLASS_JOB_LAYBY_LEG = 1;

export const CINDERGLASS_JOB_SPEED_WU = 60;
export const CINDERGLASS_JOB_LAYBY_HOLD_S = 34;

/* ── Pod ── */
export const CINDERGLASS_JOB_POD_MASS = 18;             // ARCHITECTURE: native mass units are tonnes
export const CINDERGLASS_JOB_POD_RADIUS = 5;            // released pod reference; Line T0 <= 9 WU
export const CINDERGLASS_JOB_POD_HULL = 130;
export const CINDERGLASS_JOB_POD_ASSET = 'pod_cargo_container';
export const CINDERGLASS_JOB_POD_MARKING = 'CG-7';
export const CINDERGLASS_JOB_POD_NAME = 'Sealed freight pod CG-7';
export const CINDERGLASS_JOB_POD_LEGAL_OWNER = 'faction_mts';

/* ── Carrier / escorts / statics ── */
export const CINDERGLASS_JOB_CARRIER_SHIP_ID = 'ship_mule';
export const CINDERGLASS_JOB_ESCORT_SHIP_ID = 'ship_wasp';
export const CINDERGLASS_JOB_CARRIER_FACTION = 'faction_mts';
export const CINDERGLASS_JOB_LATCH_SUBSYSTEM = 'subsystem_transport_clamp';
export const CINDERGLASS_JOB_LATCH_HULL = 60;           // authored bolt, heavier than stock 34
export const CINDERGLASS_JOB_LATCH_SOCKET_ID = 'socket_transport_clamp';
export const CINDERGLASS_JOB_LATCH_PROFILE = 'combat_profile_cinderglass_latch';
export const CINDERGLASS_JOB_LATCH_MOUNT_DEF = 'attachment_cinderglass_latch_mount';
export const CINDERGLASS_JOB_LATCH_LOCAL = Object.freeze({ x: -18, z: 14 });
export const CINDERGLASS_JOB_LATCH_ASSET = 'place_salvage_clamp';
export const CINDERGLASS_JOB_LATCH_ACCESS = Object.freeze({ x: 0.9, z: 0 }); // released SOCKET_Jaw
export const CINDERGLASS_JOB_ROLES = Object.freeze({
  carrierId: { role: 'carrier', worldRecordId: CINDERGLASS_JOB_CARRIER_ID },
  escortAId: { role: 'escort', worldRecordId: CINDERGLASS_JOB_ESCORT_A_ID },
  escortBId: { role: 'escort', worldRecordId: CINDERGLASS_JOB_ESCORT_B_ID },
  podId: { role: 'pod', worldRecordId: CINDERGLASS_JOB_POD_ID },
  latchId: { role: 'latch', worldRecordId: CINDERGLASS_JOB_LATCH_ID },
  cradleId: { role: 'cradle', worldRecordId: CINDERGLASS_JOB_CRADLE_ID },
  brokerId: { role: 'broker', worldRecordId: CINDERGLASS_JOB_BROKER_ID },
  laybyId: { role: 'layby', worldRecordId: CINDERGLASS_JOB_LAYBY_ID },
});

/* ── Quotes / terms (canonical transaction amounts) ── */
export const CINDERGLASS_JOB_TALA_BASE_CR = 450;
export const CINDERGLASS_JOB_TALA_DAMAGED_CR = 300;
export const CINDERGLASS_JOB_DEPOSIT_CR = 150;
export const CINDERGLASS_JOB_BROKER_CR = 300;
export const CINDERGLASS_JOB_DAMAGED_FRACTION = 0.9;    // pod hull fraction below which Tala quotes damaged

/* ── Spatial rules ── */
export const CINDERGLASS_JOB_LATCH_REACH_WU = 62;
export const CINDERGLASS_JOB_LATCH_REL_SPEED = 4;
export const CINDERGLASS_JOB_SIGHT_RANGE_WU = 300;
export const CINDERGLASS_JOB_SERVICE_SECONDS = 5;
export const CINDERGLASS_JOB_RECEIVE_RADIUS_WU = 70;
export const CINDERGLASS_JOB_RECEIVE_SPEED = 8;
// Recovery radio is explicitly tuned by the player. Each answer is one last-received
// native fix, never a continuous projection of unseen freight motion.
export const CINDERGLASS_JOB_BEACON_SOURCE = 'cg7-cargo-beacon';
export function cinderglassJobBeaconFixValid(fix, operationId) {
  return typeof operationId === 'string' && operationId.length > 0
    && !!fix && fix.source === CINDERGLASS_JOB_BEACON_SOURCE && fix.operationId === operationId
    && fix.worldRecordId === CINDERGLASS_JOB_POD_ID
    && Number.isSafeInteger(fix.podId) && fix.podId > 0
    && Number.isSafeInteger(fix.generation) && fix.generation > 0
    && Number.isSafeInteger(fix.seq) && fix.seq > 0
    && Number.isFinite(fix.atS) && fix.atS >= 0
    && Number.isFinite(fix.pos?.x) && Number.isFinite(fix.pos?.z);
}
export const CINDERGLASS_JOB_MARK_RANGE_WU = 150;
export const CINDERGLASS_JOB_SCAN_RADIUS_WU = 950;
export const CINDERGLASS_JOB_NEGOTIATE_RANGE_WU = 220;

/* ── Phases ── */
export const CINDERGLASS_JOB_PHASES = Object.freeze({
  OFFER: 'offer',
  DISPATCH: 'dispatch',
  RECON: 'recon',
  DECIDE: 'decide',
  RECOVERY: 'recovery',
  HANDOFF: 'handoff',
  CLOSED: 'closed',
});

/* ── Custody states for the ONE original pod ── */
export const CINDERGLASS_JOB_CUSTODY = Object.freeze({
  CARRIED: 'carried',        // transport-clamped to the carrier
  RELEASED: 'released',      // loose body with real momentum
  TETHERED: 'tethered',      // on the player's (or anyone's) line
  RECEIVED: 'received',      // clamped into Tala's cradle — accepted handoff
  BROKERED: 'brokered',      // sold to the broker
  LOST: 'lost',              // body gone (despawned/recycled without destruction)
  DESTROYED: 'destroyed',    // hull reached 0 / entity died
});

/* ── Outcomes (terminal records) ── */
export const CINDERGLASS_JOB_OUTCOMES = Object.freeze({
  RETURNED_TALA: 'returned_tala',
  RETURNED_DAMAGED: 'returned_damaged',
  SOLD_BROKER: 'sold_broker',
  KEPT: 'kept',
  LOST: 'lost',
  DESTROYED: 'destroyed',
  CONSIGNMENT_DELIVERED: 'consignment_delivered',
  DECLINED: 'declined',
});

/* ── Release reasons (canonical cut reasons) ── */
export const CINDERGLASS_JOB_RELEASE_NEGOTIATED = 'negotiated_release';
export const CINDERGLASS_JOB_RELEASE_QUIET = 'service_release';

// The simulation publishes the same English terms as before. Presentation can use this
// source template and its values with the shared localization runtime at the DOM boundary.
export const CINDERGLASS_JOB_TERMS_COPY = Object.freeze({
  template: 'Convoy: one Mule, two escorts, four legs through the layby at the far pull-off. ' +
    'Once Dask completes the run with CG-7 aboard, this recovery closes for this campaign. ' +
    'Bring a scanner — you need a real read on the pod before anyone talks. A starter Massline tows the 18t pod home. Force is unlawful; this is no warrant. ' +
    'Intact controller: {intactCr}CR. Damaged but whole: {damagedCr}CR. ' +
    'Dask will hear {depositCr}CR against release; that comes back to you when I accept the pod.',
  values: Object.freeze({ intactCr: CINDERGLASS_JOB_TALA_BASE_CR,
    damagedCr: CINDERGLASS_JOB_TALA_DAMAGED_CR, depositCr: CINDERGLASS_JOB_DEPOSIT_CR }),
});

/* ── Player-facing lines ── */
export const CINDERGLASS_JOB_TEXT = Object.freeze({
  offerTitle: 'TALA ROOK · DISPUTED CONSIGNMENT',
  offerLine: 'A sealed industrial controller left Tethys inside a consignment I still hold papers on. ' +
    'Dask hauled it fair — title is contested, not stolen. I need the pod, not a firefight.',
  offerDetail: interpolate(CINDERGLASS_JOB_TERMS_COPY.template, CINDERGLASS_JOB_TERMS_COPY.values),
  accept: 'Take the recovery.',
  decline: 'Leave it.',
  declinedLine: 'Then it rides to the buyer. Door stays open while the convoy holds.',
  scanHint: 'Get a scanner read on the freight pod marked CG-7.',
  markedLine: 'Marked freight pod: CG-7. Sealed. Tally codes check out — this is the unit.',
  negotiateLine: 'Dask is on the layby. You could put the offer to him — clean title dispute, paid release.',
  serviceLine: 'The rack latch is aft. Unwatched, close aboard, under drift — five seconds of service cuts it free.',
  serviceInterrupted: 'Service broken off. The latch is untouched.',
  watchedLine: 'The rack is watched. Break sightlines before trying quiet service again.',
  tooFastLine: 'Too much speed. Match the Mule and drift in.',
  releasedNegotiated: 'Dask cut the pod loose under seal. Tow it to my cradle — slow, gentle.',
  releasedQuiet: 'Latch opened. The pod is adrift — same as it ever was.',
  releasedViolent: 'The latch is wrecked. The pod is loose. This is unlawful force; any surviving witnesses can report it.',
  cradleHint: 'Tala’s cradle is marked. Bring the pod in under 8 — she clamps it and pays.',
  brokerHint: 'Vesi Khand buys freight no-questions. 300CR, colder name.',
  paidTala: 'Controller checks out. Papers settled — 450CR payment and the paid 150CR inspection deposit returned.',
  paidTalaNoRefund: 'Controller checks out. Papers settled — 450CR paid.',
  paidDamaged: 'She’s scuffed, but the seal held. 300CR for a damaged original and the paid 150CR inspection deposit returned.',
  paidDamagedNoRefund: 'She’s scuffed, but the seal held. 300CR for the damaged original.',
  podDestroyed: 'The pod is gone. Whatever was inside is scrap now. We’re done here.',
  convoyLeftLine: 'The run reached the buyer. Consignment is out of reach — that’s closure.',
  brokerPaid: 'Khand pays and forgets the serial. So should you.',
  daskRefused: 'Dask shook his head. “Paid consignment. Not mine to sell.”',
  daskAccepted: 'Dask read the papers twice, then keyed the release himself.',
  depositTaken: '150CR posted to Dask against release.',
  depositRefunded: 'Deposit returned with Tala’s payment.',
  staleRefusal: 'That arrangement is already spent.',
});

// Receipt copy follows the committed financial result, including old saved paid facts.
// Whole source sentences stay localizable; no refund is inferred from the return alone.
export function cinderglassJobPaidText(st) {
  const paid = st?.settlement;
  if (!paid || paid.recipient !== 'tala' || ![300, 450].includes(paid.baseCr)
    || ![0, 150].includes(paid.refundCr) || paid.creditedCr !== paid.baseCr + paid.refundCr
    || paid.refundCr === 150 && (st.depositPaid !== true || st.depositRefunded !== true)) return null;
  return paid.baseCr === 450
    ? paid.refundCr === 150 ? CINDERGLASS_JOB_TEXT.paidTala : CINDERGLASS_JOB_TEXT.paidTalaNoRefund
    : paid.refundCr === 150 ? CINDERGLASS_JOB_TEXT.paidDamaged : CINDERGLASS_JOB_TEXT.paidDamagedNoRefund;
}

// Root installs these exact, bounded definitions through physical-owner.patch.
export const CINDERGLASS_JOB_COMBAT_PROFILE = Object.freeze({
  id: CINDERGLASS_JOB_LATCH_PROFILE, version: 1, entityTypes: ['drone'],
  heat: { max: 0, dissipationPerTick: 0 }, immunityTags: [], subsystemIds: [],
  sockets: [{ id: 'socket_hull', tags: ['tether'], localPos: [0, 0], maxAttachments: 2 }],
  capabilities: { drive: false, weapon: false, sensor: false, tether: false, power: false },
});
export const CINDERGLASS_JOB_MOUNT_DEFINITION = Object.freeze({
  id: CINDERGLASS_JOB_LATCH_MOUNT_DEF, version: 1,
  sourceSocketTags: ['tether'], targetSocketTags: ['tether'],
  ownership: { policy: 'initiator', transferable: false },
  break: { maxTension: 10500000, maxImpulse: 190000, maxYank: 150000, graceTicks: 4 },
  spring: { K: 640, zeta: 1.15, captureS: 0.15, maxStretchRatio: 0.35 },
  limits: { maxPerOwner: 1 },
  cues: { created: 'combat.attachment.created', broken: 'combat.attachment.broken' },
});
