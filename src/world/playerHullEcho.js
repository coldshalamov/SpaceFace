// M11: an existing ecology site can carry a real, permanently recorded player hull.
// World owns these calls; navigation, scanning and pickup custody keep their normal owners.
import { ensureWorldRecords } from './worldRecords.js';
import { successfulPickupAmount } from '../core/pickupAcceptance.js';

const liveEchoes = new WeakMap();
const RECORDER = 'cmdty_dmc_black_box';

function boundLoss(state, site) {
  if (!site.playerHullEcho) return null;
  const losses = ensureWorldRecords(state.world).hullLosses;
  const bound = losses.find(loss => loss.echo?.siteId === site.siteId);
  if (bound) return bound;
  const loss = losses[losses.length - 1];
  if (!loss) return null;
  loss.echo = { siteId: site.siteId, observed: false, leg: 0, aligned: false, recovered: false };
  return loss;
}

export function playerHullEchoReadout(loss) {
  if (!loss) return null;
  return `${loss.name} — ${loss.shipClass} class. Your hull, lost in ${loss.sectorName} `
    + `at flight time ${loss.lostAt.toFixed(1)}s. `
    + (loss.echo?.recovered ? `Flight recorder recovered. Final approach heading: ${(loss.rot * 180 / Math.PI).toFixed(0)}°.`
      : 'Observe with the scanner; follow the two recorded bearings; align with the final heading, then scoop the recorder. Requires 0.4 u of free cargo space. You can leave and return.');
}

function position(world, site, loss, distance = 0) {
  const rot = Number.isFinite(loss.rot) ? loss.rot : 0;
  return world._toGlobal({
    x: site.center.x - Math.cos(rot) * distance,
    z: site.center.z - Math.sin(rot) * distance,
  }, site.sectorId);
}

function range(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }

function bearingDistance(site, leg) {
  return leg === 0 ? site.arrivalBands.mid : site.arrivalBands.close;
}

function publishReadout(world, site, loss, active) {
  const live = liveEchoes.get(world);
  const wreck = world.state.entities.get(live?.wreckId);
  if (wreck?.data?.hullEchoLossId === loss.lossId) wreck.data.scanDescription = playerHullEchoReadout(loss);
  if (!active) return;
  const readout = playerHullEchoReadout(loss);
  const poi = active.pois?.find(row => row.poiId === site.poiId);
  if (poi) { poi.name = `${site.name}: ${loss.name}`; poi.scanDescription = readout; }
  if (!Array.isArray(active.pois)) active.pois = [];
  const poiId = `hull_echo_${loss.lossId}`;
  const bearing = active.pois.find(row => row.poiId === poiId);
  const leg = Math.min(2, loss.echo.leg || 0);
  const row = {
    poiId, type: 'anomaly', name: `${loss.name}: ${leg < 2 ? `bearing ${leg + 1}/2` : 'final heading'}`,
    pos: position(world, site, loss, leg < 2 ? bearingDistance(site, leg) : 0),
    hidden: !loss.echo.observed || loss.echo.recovered, claimable: false,
    scannerSignalKind: 'anomaly', runtimeOwned: true, scanDescription: readout,
  };
  if (bearing) Object.assign(bearing, row);
  else active.pois.push(row);
}

export function materializePlayerHullEcho(world, site, active) {
  const loss = boundLoss(world.state, site);
  if (!loss) return null;
  const state = world.state;
  let wreck = state.entityList.find(e => e.alive !== false && e.data?.hullEchoLossId === loss.lossId
    && e.type === 'wreck');
  if (!wreck && !loss.echo.wreckDestroyed) wreck = world.helpers.spawnEntity({
    type: 'wreck', pos: loss.echo.wreckPos || position(world, site, loss), vel: { x: 0, z: 0 },
    rot: loss.rot || 0, radius: loss.radius || 14, mass: 100, ttl: Infinity,
    hull: 100, hullMax: 100, collides: true, homeSectorId: site.sectorId,
    data: { name: loss.name, defId: loss.shipDefId, parentType: 'ship',
      parentDefId: loss.shipDefId, hullEchoLossId: loss.lossId, siteId: site.siteId,
      persistenceOwner: 'alienEcology', scanLabel: `${loss.name} — ${loss.shipClass}`,
      scanDescription: playerHullEchoReadout(loss), salvagePool: {} },
  });
  liveEchoes.set(world, { lossId: loss.lossId, wreckId: wreck?.id });
  publishReadout(world, site, loss, active);
  return loss;
}

export function handlePlayerHullEchoEvent(world, site, type, payload) {
  if (!site.playerHullEcho || world.state.world.currentSectorId !== site.sectorId) return;
  const losses = ensureWorldRecords(world.state.world).hullLosses;
  const loss = losses.find(row => row.echo?.siteId === site.siteId);
  if (!loss || loss.echo.recovered) return;
  const player = world.state.entities.get(world.state.playerId);
  if (!player || player.alive === false) return;
  if (type === 'entity:killed' && payload.id === liveEchoes.get(world)?.wreckId) {
    loss.echo.wreckDestroyed = true;
    loss.echo.wreckPos = payload.pos || position(world, site, loss);
  }
  if (type === 'scan:pulse' && !loss.echo.observed
      && range(player.pos, position(world, site, loss)) <= site.arrivalBands.long) {
    loss.echo.observed = true;
    world.bus.emit('comms:log', { from: 'Flight recorder', kind: 'ecology', text: playerHullEchoReadout(loss) });
    publishReadout(world, site, loss, world.active || world.state.world.activeSector);
  }
  const pod = type === 'pickup:collected' && world.state.entities.get(payload.pickupId);
  if (type === 'pickup:collected' && loss.echo.aligned && pod?.alive !== false
      && pod?.data?.worldSiteId === `hull_echo_${loss.lossId}`
      && payload.collectorId === world.state.playerId
      && payload.worldSiteId === `hull_echo_${loss.lossId}`
      && payload.worldSitePayloadId === 'flight_recorder'
      && payload.commodityId === RECORDER && successfulPickupAmount(payload) > 0) {
    loss.echo.recovered = true;
    world.bus.emit('comms:log', { from: loss.name, kind: 'ecology',
      text: `${playerHullEchoReadout(loss)} Its last approach remains on the cockpit readout.` });
    publishReadout(world, site, loss, world.active || world.state.world.activeSector);
  }
}

export function tickPlayerHullEcho(world, site) {
  const state = world.state;
  const player = state.entities.get(state.playerId);
  if (!site.playerHullEcho || !player || player.alive === false) return;
  const loss = boundLoss(state, site);
  if (!loss) return;
  let live = liveEchoes.get(world);
  if (live?.lossId !== loss.lossId || (!loss.echo.wreckDestroyed
      && state.entities.get(live.wreckId)?.data?.hullEchoLossId !== loss.lossId)) {
    materializePlayerHullEcho(world, site, world.active || state.world.activeSector);
    live = liveEchoes.get(world);
  }
  const echo = loss.echo;
  if (!echo.observed || echo.recovered) return;
  if (echo.leg < 2 && range(player.pos, position(world, site, loss, bearingDistance(site, echo.leg))) < 160) {
    echo.leg++;
    world.bus.emit('comms:log', { from: loss.name, kind: 'ecology',
      text: echo.leg < 2 ? 'First bearing matched. Follow the second return.'
        : `Both bearings match. Align to heading ${(loss.rot * 180 / Math.PI).toFixed(0)}° near the cockpit and slow below 24 WU/s. Scoop the released recorder; 0.4 u of free cargo space required.` });
    publishReadout(world, site, loss, world.active || state.world.activeSector);
  }
  const wreck = state.entities.get(live?.wreckId);
  if (wreck?.alive !== false && wreck?.data?.hullEchoLossId === loss.lossId) {
    echo.wreckPos = { x: wreck.pos.x, z: wreck.pos.z };
  }
  const wreckPos = echo.wreckPos || position(world, site, loss);
  const headingError = Math.abs(Math.atan2(Math.sin(player.rot - loss.rot), Math.cos(player.rot - loss.rot)));
  if (!echo.aligned && echo.leg === 2
      && range(player.pos, wreckPos) < Math.max(120, (loss.radius || 14) * 2)
      && headingError < 0.3 && Math.hypot(player.vel?.x || 0, player.vel?.z || 0) < 24) {
    echo.aligned = true;
  }
  if (!echo.aligned) return;
  // A destroyed or unloaded pod can be recovered again; accepted custody alone settles the beat.
  let pod = state.entities.get(live.podId);
  if (!pod || pod.alive === false || pod.data?.worldSiteId !== `hull_echo_${loss.lossId}`) {
    pod = state.entityList.find(e => e.alive !== false && e.type === 'pickup'
      && e.data?.worldSiteId === `hull_echo_${loss.lossId}`);
    if (!pod) pod = world.helpers.spawnEntity({
      type: 'pickup', pos: { x: wreckPos.x + Math.cos(loss.rot) * ((loss.radius || 14) + 35),
        z: wreckPos.z + Math.sin(loss.rot) * ((loss.radius || 14) + 35) },
      vel: { x: 0, z: 0 }, radius: 5, mass: 1, ttl: Infinity, homeSectorId: site.sectorId,
      data: { kind: 'cargo', commodityId: RECORDER, amount: 1, name: `${loss.name} flight recorder`,
        worldSiteId: `hull_echo_${loss.lossId}`, worldSitePayloadId: 'flight_recorder',
        persistenceOwner: 'alienEcology', playerCollectOnly: true },
    });
    live.podId = pod?.id;
  }
}
