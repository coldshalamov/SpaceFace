// One persistent rival, flown by traffic through ordinary V3 intents. The bid is a real
// supplied-load contract; its first-arrival bonus is settled only by the missions owner.
import { SECTORS } from '../data/sectors.js';
import { makeShipEntitySpec } from './ships.js';
export const REY_CAPTAIN_ID = 'captain:coldburn-rey';
const SPEED = 44;
const ARRIVE_RANGE = 140;
const BONUS_CR = 180;
const copy = value => JSON.parse(JSON.stringify(value));

export function normalizeColdburnRey(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return { ...copy(raw), nextBidAtS: Math.max(0, Number(raw.nextBidAtS) || 0),
    races: Array.isArray(raw.races) ? raw.races.filter(row => row?.missionId).slice(-12) : [] };
}

export function syncColdburnBid(host, info, board) {
  const state = host.state;
  if (!host.registry?.get?.('traffic') || !board?.slots || !info?.id || (state.simTime || 0) < (state.traffic?.coldburnRey?.nextBidAtS || 0)
    || state.missions.active?.some(mission => mission?.cause?.reyBid)) return false;
  const captain = state.traffic?.captainRoster?.find(row => row.id === REY_CAPTAIN_ID);
  if (captain?.alive === false) return false;
  const priorRace = state.traffic?.coldburnRey?.races?.at(-1);
  if (priorRace?.winner && !priorRace.reyDelivered && !priorRace.destroyed) return false;
  if (priorRace?.winner && priorRace.destStationId !== info.id) return false;
  const sector = SECTORS.find(row => row.id === info.sectorId);
  const destination = sector?.stations?.find(row => row.id !== info.id);
  if (!destination || board.slots.some(offer => offer?.cause?.reyBid)) return false;
  const epoch = Math.floor((state.simTime || 0) / 600);
  const id = `coldburn-bid:${info.id}:${epoch}`;
  if (state.missions.receipts?.some(receipt => receipt?.sourceOfferId === id)) return false;
  const robbed = Number(captain?.outcomes?.robbed) || 0;
  const rescued = Number(captain?.outcomes?.rescued) || 0;
  const rivalBidCr = Math.max(220, 300 - Math.min(4, robbed) * 15);
  const memoryLine = robbed ? 'Rey remembers the stolen hold and will take the outer approach.'
    : rescued ? 'Rey remembers the tow that brought him home. He still intends to win.' : 'Two carriers, two supplied relief loads.';
  board.slots.push({ id, source: 'coldburnBid', giverId: `relay-desk:${info.id}`,
    type: 'cargo_delivery', stationId: info.id, factionId: info.factionId,
    destStationId: destination.id, destSectorId: info.sectorId, minRep: -149,
    reward_cr: 360, collateral_cr: 0, preloadedCargo: true, riskTier: 1,
    time_limit_s: 1800, duration_s: 1800,
    params: { cmdtyId: 'cmdty_food', qty: 2, taskTime: 20, fValue: 1 },
    title: `Relay relief — Coldburn Rey bids ${rivalBidCr} cr`,
    summary: `${memoryLine} Deliver two units of provisions to ${destination.name} for 360 cr. First carrier earns ${BONUS_CR} cr extra. Robbing or killing Rey forfeits the race bonus.`,
    cause: { tag: 'coldburn_bid', reyBid: { captainId: REY_CAPTAIN_ID, rivalBidCr,
      bonusCr: BONUS_CR, originStationId: info.id, destStationId: destination.id, sectorId: info.sectorId } },
  });
  return true;
}

export function coldburnDeliveryBonus(state, mission) {
  if (!mission?.cause?.reyBid) return 0;
  const race = state.traffic?.coldburnRey?.races?.find(row => row.missionId === mission.id);
  return race?.winner === 'player' && !race.sabotaged ? BONUS_CR : 0;
}

export function installColdburnRey(host) {
  const state = host.state, bus = host.bus;
  const own = () => state.traffic.coldburnRey || (state.traffic.coldburnRey = { races: [], nextBidAtS: 0 });
  const latest = () => state.traffic?.coldburnRey?.races?.at(-1) || null;
  const actor = () => state.entityList?.find(entity => entity?.alive !== false && entity.data?.coldburnRey === true);
  const station = stationId => state.entityList?.find(entity => entity?.alive !== false && entity.type === 'station'
    && entity.data?.stationId === stationId);
  const say = text => bus.emit('comms:popup', { id: `rey:${state.tick || 0}`, sender: 'Coldburn Rey',
    text, category: 'traffic', ttl: 6, persist: true });
  const materialize = () => {
    const race = latest();
    if (!race || race.sectorId !== state.world?.currentSectorId || race.reyDelivered || race.destroyed) return null;
    const existing = actor();
    if (existing) { if (!host._active.includes(existing.id)) host._active.push(existing.id); return existing; }
    if (!host.helpers?.spawnEntity || !race.pos) return null;
    const spec = makeShipEntitySpec('ship_mule', { team: 2, factionId: 'faction_mts', pos: race.pos,
      ai: { archetype: 'fleeing_trader', passive: true, spawnContext: 'convoy_civilian' } });
    spec.homeSectorId = race.sectorId;
    spec.data = { ...spec.data, coldburnRey: true, captainId: REY_CAPTAIN_ID, captainName: 'Coldburn Rey',
      name: 'Coldburn Rey', scanLabel: 'Coldburn Rey · competing relief carrier', trafficLabel: 'Relief hauler',
      trafficRole: 'hauler', worldRecordId: `coldburn-rey:${state.meta?.seed || 1}`, durable: true,
      homeSectorId: race.sectorId, sectorId: race.sectorId,
      cargoManifest: { manifestId: `rey-load:${race.missionId}`, freighterKey: REY_CAPTAIN_ID,
        role: 'hauler', originStationId: race.originStationId, destStationId: race.destStationId,
        lines: [{ commodityId: 'cmdty_food', qty: 2 }], totalQty: 2 },
    };
    const entity = host.helpers.spawnEntity(spec);
    if (entity) host._active.push(entity.id);
    return entity;
  };
  const finish = (race, winner) => {
    if (!race || race.winner) return;
    race.winner = winner; race.finishedAtS = Number(state.simTime) || 0;
    own().nextBidAtS = race.finishedAtS + 600;
    bus.emit('coldburnRey:raceSettled', { missionId: race.missionId, winner,
      captainId: REY_CAPTAIN_ID, sabotaged: race.sabotaged === true, t: race.finishedAtS });
    say(winner === 'rey' ? 'My load is on the scales. You still owe yours.'
      : winner === 'player' ? 'You got the first receipt. I saw it.' : 'That was not a delivery race. I will remember it.');
  };
  const off = [], on = (name, fn) => { const unsub = bus.on(name, fn); if (typeof unsub === 'function') off.push(unsub); };
  on('mission:accepted', payload => {
    const mission = state.missions.active?.find(row => row.id === payload?.missionId);
    const bid = mission?.cause?.reyBid;
    if (!bid) return;
    const origin = station(bid.originStationId), destination = station(bid.destStationId);
    if (!origin?.pos || !destination?.pos || own().races.some(row => row.missionId === mission.id)) return;
    const captain = state.traffic.captainRoster?.find(row => row.id === REY_CAPTAIN_ID);
    const detour = captain?.outcomes?.robbed > 0 ? {
      x: (origin.pos.x + destination.pos.x) / 2 + 550, z: (origin.pos.z + destination.pos.z) / 2 - 550,
    } : null;
    const race = { missionId: mission.id, originStationId: bid.originStationId, destStationId: bid.destStationId,
      sectorId: bid.sectorId, startedAtS: Number(state.simTime) || 0, winner: null,
      pos: { x: origin.pos.x + (origin.radius || 60) + 180, z: origin.pos.z + 100 }, destination: { ...destination.pos },
      arriveRange: Math.max(ARRIVE_RANGE, (destination.radius || 0) + 140),
      detour, sabotaged: false };
    own().races.push(race); own().races = own().races.slice(-12);
    materialize(); say(`My bid was ${bid.rivalBidCr} credits. First receipt takes the extra ${BONUS_CR}.`);
  });
  on('coldburnRey:playerDelivered', payload => { const race = latest();
    if (race?.missionId === payload?.missionId) finish(race, 'player'); });
  on('captain:remembered', payload => {
    if (payload?.captainId !== REY_CAPTAIN_ID) return;
    const race = latest();
    own().lastOutcome = payload.outcome;
    if (payload.outcome === 'robbed' && race) { race.sabotaged = true; say('You took the load. Next time I take the long way.'); }
    if (payload.outcome === 'killed' && race) { race.destroyed = true; race.sabotaged = true; finish(race, 'void'); }
    if (payload.outcome === 'rescued') say('You brought me back. The debt is real. So is my next bid.');
  });
  on('mission:failed', payload => { const race = latest(); if (race?.missionId === payload?.missionId) finish(race, 'rey'); });
  on('mission:expired', payload => { const race = latest(); if (race?.missionId === payload?.missionId) finish(race, 'rey'); });
  on('save:loaded', materialize);
  return { materialize,
    update(dt) {
      const race = latest();
      if (!race || race.reyDelivered || race.destroyed || state.mode !== 'flight') return;
      const local = race.sectorId === state.world?.currentSectorId;
      const entity = local ? materialize() : null;
      if (entity?.pos) race.pos = { x: entity.pos.x, z: entity.pos.z };
      const target = race.detour || race.destination;
      const dx = target.x - race.pos.x, dz = target.z - race.pos.z, distance = Math.hypot(dx, dz);
      if (distance <= (race.detour ? ARRIVE_RANGE : (race.arriveRange || ARRIVE_RANGE))) {
        if (race.detour) { race.detour = null; return; }
        race.reyDelivered = true;
        if (entity) {
          entity.data.intent = { moveX: 0, moveZ: 0, boost: false, brake: true, fire: false, aimAngle: entity.rot || 0 };
          entity.data.cargoManifest = { ...entity.data.cargoManifest, lines: [], totalQty: 0 };
        }
        finish(race, 'rey'); return;
      }
      if (entity) {
        const speed = Math.hypot(entity.vel?.x || 0, entity.vel?.z || 0);
        entity.data.intent = { moveX: 0, moveZ: speed < SPEED ? 1 : 0,
          boost: false, fire: false, fireGroup: null, aimAngle: Math.atan2(dz, dx) };
      } else if (!local) {
        const step = Math.min(distance, SPEED * Math.max(0, Number(dt) || 0));
        race.pos.x += dx / distance * step; race.pos.z += dz / distance * step;
      }
    },
    destroy() { for (const unsub of off) unsub(); },
  };
}
