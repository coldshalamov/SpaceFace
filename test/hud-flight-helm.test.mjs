// HUD-2 items 12-13: one flight-mode chip names whatever steers the ship that is not the pilot,
// and "[E] Fly to berth" names exactly the station E flies to (berthOffer.js is the one pick).
import test from 'node:test';
import assert from 'node:assert/strict';
import { berthOfferStation, berthAutopilotStation, isDockableStation, nearestDockableStation } from '../src/ui/berthOffer.js';
import { resolveFlightSteerer, resolveBerthOffer, createFlightHelm } from '../src/ui/flightHelm.js';
import { berthAnchorFor } from '../src/data/collisionProxyManifests.js';
import { formatDistance } from '../src/ui/units.js';
import { installDom } from './helpers/mini-dom.mjs';

function world({ stations = [], targetId = null, autopilot = null, berthRun = null, extra = {} } = {}) {
  const player = { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, _flightFrame: extra.frame || null };
  const entities = new Map([[1, player]]);
  for (const s of stations) entities.set(s.id, s);
  return {
    mode: 'flight', playerId: 1, simTime: 10, tick: 600,
    entities, entityList: [...entities.values()],
    player: { targetId },
    nav: { autopilot, waypoint: null },
    ui: { berthAutopilotStationId: berthRun },
    ...extra.state,
  };
}
const station = (id, x, z, data = {}) => ({ id, type: 'station', alive: true, name: `Station ${id}`, pos: { x, z }, data });

test('E flies to the selected station first, else the tracked objective, else the nearest dockable one', () => {
  const near = station(10, 6600, 0);
  const far = station(11, 20000, 0, { name: 'Helios Station', stationId: 'station_helios' });
  const hostile = station(12, 100, 0, { hostile: true });
  assert.equal(isDockableStation(hostile), false, 'a hostile station is never offered');
  assert.equal(berthOfferStation(world({ stations: [near, far, hostile] })).station, near, '6.6 km is in reach');
  const picked = berthOfferStation(world({ stations: [near, far], targetId: 11 }));
  assert.equal(picked.station, far);
  assert.equal(picked.chosen, true);
  const trackedObjective = berthOfferStation(world({
    stations: [near, far],
    extra: { state: { nav: { autopilot: null, waypoint: { stationId: 'station_helios', pos: { x: 20000, z: 0 }, reason: 'Dock at Helios Station.' } } } },
  }));
  assert.equal(trackedObjective.station, far, 'a tracked berth objective is chosen when the pilot has selected nothing');
  assert.equal(trackedObjective.chosen, true);
  const pilotPickWins = berthOfferStation(world({
    stations: [near, far],
    targetId: 10,
    extra: { state: { nav: { autopilot: null, waypoint: { stationId: 'station_helios', pos: { x: 20000, z: 0 } } } } },
  }));
  assert.equal(pilotPickWins.station, near, 'the pilot\'s own selection outranks a tracked objective, so E flies where they looked');
});

test('a mission that sends the pilot to Customs Gate still offers that berth', () => {
  const hub = station(10, 900, 0, { name: 'Helios Station', stationId: 'station_helios' });
  hub.homeSectorId = 'sector_helios_prime';
  const customs = station(13, 50, 0, { stationId: 'station_customs', name: 'Customs Gate', services: ['toll', 'scan', 'refuel'] });
  customs.homeSectorId = 'sector_helios_prime';
  const state = world({
    stations: [hub, customs],
    extra: { state: {
      world: { currentSectorId: 'sector_helios_prime' },
      missions: { active: [{ id: 'inspection-1', status: 'active', destStationId: 'station_customs' }] },
    } },
  });
  assert.equal(isDockableStation(customs), true, 'a Customs Gate is a dockable body with real doors');
  const offer = berthOfferStation(state);
  assert.equal(offer.station, customs, 'the tracked mission\'s own destination is the berth, not a different station');
  assert.equal(offer.chosen, false,
    'a job\'s destination outranks a nearer station but is a suggestion, not the pilot\'s pick');
});

test('a fight hides the berth chip even while the tracked job ends at a local station', () => {
  // The 47-A contract names Helios for the whole opening. Counting that as "chosen" kept
  // '[E] Fly to berth Helios Station' on the glass through the raid fight.
  const helios = station(10, 900, 0, { stationId: 'station_helios', name: 'Helios Station' });
  helios.homeSectorId = 'sector_helios_prime';
  const raider = { id: 20, type: 'ship', alive: true, pos: { x: 200, z: 0 }, data: { hostile: true } };
  const state = world({
    stations: [helios, raider],
    targetId: 20,
    extra: { state: {
      world: { currentSectorId: 'sector_helios_prime' },
      nav: { autopilot: null, waypoint: { kind: 'mission', label: 'Drive off the raider', pos: { x: 200, z: 0 }, targetEntityId: 20 } },
      missions: { active: [{ id: 'contract_47a', status: 'active', destStationId: 'station_helios' }] },
    } },
  });
  assert.equal(resolveBerthOffer(state, { fight: true }), null, 'a fight is not the moment to suggest leaving');
  const calm = resolveBerthOffer(state, { fight: false });
  assert.equal(calm && calm.station, helios, 'out of the fight the job\'s station is the berth E flies to');
});

test('a mission waypoint in another sector never offers a berth here', () => {
  // The trade job's tracker says to jump to Tethys; Tethys Trade Hub is a station body in the
  // tree (a resident neighbour), so a stationId/name match alone offered 'Fly to berth Tethys'.
  const helios = station(10, 900, 0, { stationId: 'station_helios', name: 'Helios Station', sectorId: 'sector_helios_prime' });
  helios.homeSectorId = 'sector_helios_prime';
  const tethys = station(11, 40000, 0, { stationId: 'station_tethys', name: 'Tethys Trade Hub' });
  tethys.homeSectorId = 'sector_tethys_junction';
  const state = world({
    stations: [helios, tethys],
    extra: { state: {
      world: { currentSectorId: 'sector_helios_prime' },
      missions: { active: [{ id: 'job-1', status: 'active', destStationId: 'station_tethys' }] },
      nav: { autopilot: null, waypoint: null },
    } },
  });
  const offer = berthOfferStation(state);
  assert.equal(offer.station, helios, 'the local berth is offered, not the jump target');
  assert.equal(offer.chosen, false, 'the far station is no longer an objective pick here');
});

test('with no dockable station in this sector, E offers no berth rather than a jump target', () => {
  // The chip must never promise a berth run the autopilot cannot make: a body another sector owns
  // is a jump destination. Before this rule the nearest-station pick fell back to it anyway.
  const tethys = station(11, 40000, 0, { stationId: 'station_tethys', name: 'Tethys Trade Hub' });
  tethys.homeSectorId = 'sector_tethys_junction';
  const state = world({
    stations: [tethys],
    extra: { state: {
      world: { currentSectorId: 'sector_helios_prime' },
      missions: { active: [{ id: 'job-1', status: 'active', destStationId: 'station_tethys' }] },
    } },
  });
  assert.equal(nearestDockableStation(state), null);
  assert.equal(berthOfferStation(state), null);
  assert.equal(resolveBerthOffer(state), null);
});

test('the berth chip measures to the same berth anchor the objective does', () => {
  // A size-L hub berthed from 456 m out: the tracker quotes the distance to the berth anchor,
  // so the chip must quote that fix too, not the shorter station-centre one.
  const hub = station(10, 0, 0, { stationId: 'station_helios', dockRadius: 90, collisionProxy: 'station_ring_hub', corridorBearingDeg: 135 });
  hub.radius = 90;
  hub.rot = 0;
  const hull = { id: 1, type: 'ship', alive: true, pos: { x: -456, z: 0 }, radius: 14 };
  const anchor = berthAnchorFor(hub, hull);
  assert.ok(anchor, 'the berth anchor resolves');
  const toAnchor = Math.hypot(anchor.x - hull.pos.x, anchor.z - hull.pos.z);
  const toCentre = Math.hypot(hub.pos.x - hull.pos.x, hub.pos.z - hull.pos.z);
  assert.notEqual(Math.round(toAnchor), Math.round(toCentre),
    'the berth sits off the station centre, so the two measurements differ');
  assert.ok(toAnchor > 0);

  const plain = station(11, 500, 0, {});
  const plainAnchor = berthAnchorFor(plain, hull);
  assert.deepEqual(plainAnchor, { x: 500, z: 0 },
    'a station with no proxy anchor is measured to its centre');
  assert.equal(berthAnchorFor(null, hull), null);
});

test('the [E] chip prints the distance to the berth anchor, not to the station centre', () => {
  // The wiring, not just the helper: mount the real helm over a minimal document and read the
  // distance it paints. The tracker and the chip must quote one distance to one berth.
  const dom = installDom();
  try {
    const hub = station(10, 0, 0, { stationId: 'station_helios', dockRadius: 90, collisionProxy: 'station_ring_hub', corridorBearingDeg: 135 });
    hub.radius = 90;
    hub.rot = 0;
    const state = world({ stations: [hub] });
    const player = state.entities.get(state.playerId);
    player.pos = { x: -456, z: 0 };
    player.radius = 14;
    const root = dom.document.createElement('div');
    const helm = createFlightHelm(root, state, {
      worldToScreen: () => ({ x: 640, y: 300, onScreen: true }),
    });
    helm.frame(1 / 60, 1280, 720);
    const distEl = root.querySelector('.sf-helm-offer__dist');
    assert.ok(distEl, 'the chip is on the glass');
    const anchor = berthAnchorFor(hub, player);
    const toAnchor = Math.hypot(anchor.x - player.pos.x, anchor.z - player.pos.z);
    const toCentre = Math.hypot(hub.pos.x - player.pos.x, hub.pos.z - player.pos.z);
    assert.notEqual(formatDistance(toAnchor), formatDistance(toCentre),
      'the two readings differ, so this proves which one the chip paints');
    assert.equal(distEl.textContent, formatDistance(toAnchor),
      'the chip quotes the berth-berth distance the tracker quotes');
    helm.destroy();
  } finally {
    dom.restore();
  }
});

test('the nearest-station offer steps aside in a fight; a station the pilot picked stays offered', () => {
  const st = station(10, 3000, 0);
  assert.equal(resolveBerthOffer(world({ stations: [st] }), { fight: true }), null);
  assert.ok(resolveBerthOffer(world({ stations: [st] }), { fight: false }));
  assert.ok(resolveBerthOffer(world({ stations: [st], targetId: 10 }), { fight: true }));
  assert.equal(resolveBerthOffer(world({ stations: [st] }), { dockInRange: true }), null, 'in range the Dock prompt owns E');
});

test('an unrelated objective marker near a station does not make that berth "chosen" in a fight', () => {
  // A "Mine the seam" marker can sit within a few hundred metres of a station without being a
  // berth order. It must not defeat the rule that a fight does not suggest leaving.
  const st = station(10, 3000, 0);
  const state = world({
    stations: [st],
    extra: { state: { nav: { autopilot: null, waypoint: { pos: { x: 3000, z: 100 }, label: 'Mine the seam' } } } },
  });
  assert.equal(resolveBerthOffer(state, { fight: true }), null);
  assert.ok(resolveBerthOffer(state, { fight: false }), 'out of a fight the nearest berth is still suggested');
});

test('the opening asks one thing at a time: no berth chip until the loose rock is latched and thrown', () => {
  const st = station(10, 340, 0);
  const opening = (beatDoneAt, rescue = null) => world({ stations: [st],
    extra: { state: { onboarding: { active: true, finished: false, beatDoneAt, rescue } } } });
  assert.equal(resolveBerthOffer(opening({})), null, 'the rock is the first instruction');
  assert.equal(resolveBerthOffer(opening({ tether: 5 }, { current: 'swing' })), null, 'and the throw is still owed');
  assert.ok(resolveBerthOffer(opening({ tether: 5 }, { current: null })), 'the throw landed: the berth is next');
  assert.ok(resolveBerthOffer(opening({ berth: 3 })), 'a pilot who already docked keeps the offer');
  const picked = world({ stations: [st], targetId: 10,
    extra: { state: { onboarding: { active: true, finished: false, beatDoneAt: {} } } } });
  assert.ok(resolveBerthOffer(picked), 'a station the pilot picked is always offered');
});

test('the berth run is live only while the autopilot flies that station; a stale marker never counts', () => {
  const st = station(10, 3000, 0);
  const flying = world({ stations: [st], berthRun: 10, autopilot: { active: true, targetEntityId: 10, label: 'Station 10' } });
  assert.equal(berthAutopilotStation(flying), st);
  const stale = world({ stations: [st], berthRun: 10, autopilot: { active: false, targetEntityId: 10 } });
  assert.equal(berthAutopilotStation(stale), null);
  assert.equal(resolveBerthOffer(flying), null, 'no offer while the run flies');
});

test('one chip, one answer: the berth autopilot outranks every other assist', () => {
  const st = station(10, 3000, 0);
  const s = world({
    stations: [st], berthRun: 10, autopilot: { active: true, targetEntityId: 10, label: 'Station 10' },
    extra: { frame: { orbitAssist: { active: true } } },
  });
  const who = resolveFlightSteerer(s);
  assert.equal(who.id, 'berth');
  assert.equal(who.title, 'Autopilot');
  assert.match(who.detail, /Station 10 berth/);
  assert.match(who.takeover, /steer/);
});

test('each assist that steers is named in plain words, and the pilot flying alone shows nothing', () => {
  assert.equal(resolveFlightSteerer(world()), null);
  assert.equal(resolveFlightSteerer(world({ autopilot: { active: true, label: 'Ceres Gate' } })).detail, 'to Ceres Gate');
  assert.equal(resolveFlightSteerer(world({ extra: { frame: { orbitAssist: { active: true } } } })).title, 'Orbit assist');
  assert.equal(resolveFlightSteerer(world({ extra: { state: { heroManeuverReadModel: { mode: 'boomerang', phase: 'bank' } } } })).title, 'Boomerang run');
  assert.equal(resolveFlightSteerer(world({ extra: { state: { heroManeuverReadModel: { mode: 'boomerang', phase: 'ready' } } } })), null,
    'a manoeuvre that is only ready is not steering');
  assert.equal(resolveFlightSteerer(world({ extra: { state: { dockingCorridor: { inCapture: true, assist: { ax: 0.4, az: 0 } } } } })).title, 'Docking guide');
  assert.equal(resolveFlightSteerer(world({ extra: { state: { dockingCorridor: { inCapture: true, assist: null } } } })), null,
    'sitting in the capture volume with no tug applied is the pilot flying');
  const docked = world({ autopilot: { active: true, label: 'x' } });
  docked.ui.docked = true;
  assert.equal(resolveFlightSteerer(docked), null);
});
