// Recent clinic knowledge, not a second ledger. All authoritative state is read-only.
import { SECTORS } from './sectors.js';
import { COMMODITIES } from './commodities.js';
const NYX = 'station_nyx_march';
const LEGS = ['station_hyperion_cut', 'station_ceres', 'station_tethys'];
const stations = new Map(SECTORS.flatMap(s => (s.stations || []).map(st => [st.id, st])));
const goods = new Map(COMMODITIES.map(c => [c.id, c]));
const unavailable = 'Nothing on my desk confirms that drop yet. Bring me a receipt and I will read it to you.';
const number = n => new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(n);
const object = x => !!x && typeof x === 'object' && !Array.isArray(x);
const positive = x => Number.isSafeInteger(x) && x > 0 && x <= 1000000;
const time = (x, now) => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= now;
function kind(r) {
  const id = r?.sourceOfferId;
  if (typeof id !== 'string') return null;
  if (id.startsWith('eco_station_nyx_march_') && id.endsWith('_deniable')) return 'ordinary';
  if (id.startsWith('fenceroute_fence_hesper_quill_')) return 'route';
  return null;
}
function provenance(r, k) {
  if (!object(r) || r.type !== 'cargo_delivery' || typeof r.missionId !== 'string' || !r.missionId
    || r.id !== `${r.missionId}:${r.outcome}` || !stations.has(r.destStationId)) return false;
  if (k === 'ordinary') return /^eco_station_nyx_march_(0|[1-9]\d*)_deniable$/.test(r.sourceOfferId)
    && Number.isSafeInteger(Number(r.sourceOfferId.slice('eco_station_nyx_march_'.length, -'_deniable'.length)))
    && r.source === 'economyContract' && r.stationId === NYX && r.destStationId !== NYX;
  const match = /^fenceroute_fence_hesper_quill_([123])$/.exec(r.sourceOfferId);
  if (!match) return false;
  const leg = Number(match[1]);
  return r.source === (leg === 1 ? 'economyContract' : 'encounterAftermath')
    && r.stationId === (leg === 1 ? NYX : LEGS[leg - 2]) && r.destStationId === LEGS[leg - 1];
}
/** A failed/newer/ambiguous clinic record never falls back to an older success. */
export function clinicFreightReadout(state) {
  // Match the mission owner's newest-first, ten-receipt history, even for malformed input.
  const rows = Array.isArray(state?.missions?.receipts) ? state.missions.receipts.slice(0, 10) : [];
  const candidates = rows.filter(r => kind(r));
  if (!candidates.length) return { status: 'unknown', text: 'I have no recent delivery receipt here. Ask me about the next run.' };
  const now = state?.simTime;
  if (!Number.isFinite(now) || now < 0 || candidates.some(r => !time(r.at_s, now)))
    return { status: 'unverified', text: unavailable };
  const latest = Math.max(...candidates.map(r => r.at_s));
  const top = candidates.filter(r => r.at_s === latest);
  if (top.length !== 1) return { status: 'unverified', text: unavailable };
  const r = top[0], k = kind(r);
  if (!provenance(r, k) || r.outcome !== 'completed'
    || rows.some(other => other !== r && other?.missionId === r.missionId))
    return { status: 'unverified', text: unavailable };
  const receiptId = `mission-delivery:${r.missionId}`;
  const committed = state?.economy?.committedIntents?.[`freight:${receiptId}`];
  const f = committed?.receipt;
  if (!object(f) || f.receiptId !== receiptId || f.stationId !== r.destStationId
    || f.source !== 'mission_delivery' || !positive(f.qty)
    || committed?.result?.ok !== true || committed.result.qty !== f.qty
    || !['cmdty_medical', 'cmdty_food'].includes(f.commodityId)
    || (k === 'route' && f.commodityId !== 'cmdty_medical'))
    return { status: 'unverified', text: unavailable };
  const destination = stations.get(f.stationId).name || f.stationId;
  const commodity = goods.get(f.commodityId)?.name;
  if (typeof commodity !== 'string' || !commodity) return { status: 'unverified', text: unavailable };
  const entry = state?.economy?.markets?.[f.stationId]?.[f.commodityId];
  const stockKnown = object(entry) && typeof entry.stock === 'number' && Number.isFinite(entry.stock) && entry.stock >= 0;
  const referenceKnown = stockKnown && typeof entry.baseEq === 'number' && Number.isFinite(entry.baseEq) && entry.baseEq > 0;
  let stockText = 'It arrived. I just do not have their shelf count.';
  let inventory = 'unknown';
  if (stockKnown) {
    inventory = referenceKnown ? entry.stock < entry.baseEq ? 'below_reference' : 'at_reference' : 'count_only';
    stockText = `Their market lists ${number(entry.stock)} units now.`;
    if (inventory === 'below_reference') stockText += f.commodityId === 'cmdty_food'
      ? ' Food does not stay delivered. People eat.'
      : ' I need regular carriers, not heroes.';
    else if (inventory === 'at_reference') stockText += ' Good. The names stay with me.';
  }
  return { status: 'verified', missionId: r.missionId, stationId: f.stationId, commodityId: f.commodityId,
    acceptedQty: f.qty, inventory, ...(stockKnown ? { stock: entry.stock } : {}),
    text: `The last receipt says ${destination} took ${number(f.qty)} units of ${commodity}. ${stockText}` };
}
