// HUD-2 items 12-13: one flight-mode chip names whatever steers the ship that is not the pilot,
// and "[E] Fly to berth" names exactly the station E flies to (berthOffer.js is the one pick).
import test from 'node:test';
import assert from 'node:assert/strict';
import { berthOfferStation, berthAutopilotStation, isDockableStation } from '../src/ui/berthOffer.js';
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

test('the nearest-station offer steps aside in a fight; a station the pilot picked stays offered', () => {
  const st = station(10, 3000, 0);
  assert.equal(resolveBerthOffer(world({ stations: [st] }), { fight: true }), null);
  assert.ok(resolveBerthOffer(world({ stations: [st] }), { fight: false }));
  assert.ok(resolveBerthOffer(world({ stations: [st], targetId: 10 }), { fight: true }));
  assert.equal(resolveBerthOffer(world({ stations: [st] }), { dockInRange: true }), null, 'in range the Dock prompt owns E');
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
  assert.equal(resolveFlightSteerer(world({ extra: { state: { dockingPresentation: { readout: { inCapture: true } } } } })).title, 'Docking guide');
  const docked = world({ autopilot: { active: true, label: 'x' } });
  docked.ui.docked = true;
  assert.equal(resolveFlightSteerer(docked), null);
});
