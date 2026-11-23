// HUD-2 items 12-13: one flight-mode chip names whatever steers the ship that is not the pilot,
// and "[E] Fly to berth" names exactly the station E flies to (berthOffer.js is the one pick).
import test from 'node:test';
import assert from 'node:assert/strict';
import { berthAnchorFor, berthOfferStation, berthAutopilotStation, isDockableStation } from '../src/ui/berthOffer.js';
import { resolveFlightSteerer, resolveBerthOffer } from '../src/ui/flightHelm.js';

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

test('E flies to the selected station first, else the nearest dockable one, at any distance', () => {
  const near = station(10, 6600, 0);
  const far = station(11, 20000, 0);
  const hostile = station(12, 100, 0, { hostile: true });
  assert.equal(isDockableStation(hostile), false, 'a hostile station is never offered');
  assert.equal(berthOfferStation(world({ stations: [near, far, hostile] })).station, near, '6.6 km is in reach');
  const picked = berthOfferStation(world({ stations: [near, far], targetId: 11 }));
  assert.equal(picked.station, far);
  assert.equal(picked.chosen, true);
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

test('the nearest-station offer steps aside in a fight; a station the pilot picked stays offered', () => {  const st = station(10, 3000, 0);
  assert.equal(resolveBerthOffer(world({ stations: [st] }), { fight: true }), null);
  assert.ok(resolveBerthOffer(world({ stations: [st] }), { fight: false }));
  assert.ok(resolveBerthOffer(world({ stations: [st], targetId: 10 }), { fight: true }));
  assert.equal(resolveBerthOffer(world({ stations: [st] }), { dockInRange: true }), null, 'in range the Dock prompt owns E');
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
