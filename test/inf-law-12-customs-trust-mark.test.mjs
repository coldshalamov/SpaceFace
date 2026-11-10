import test from 'node:test';
import assert from 'node:assert/strict';
import { STATION, lawScenario } from './helpers/infLawScenario.mjs';

test('LAW-12 [4242] a compliant clean scan stamps one station/day mark and waives the next offer', () => {
  const { state, bus, law, patrol, events } = lawScenario();
  const marked = events('customs:trustMarked');
  const waived = events('customs:scanWaived');
  const offered = events('lawfulInspection:offered');
  const scans = events('patrol:proximity');
  const toasts = events('toast');
  state.player.customsHotUntil = { faction_scn: 1000 };
  patrol('world:law12:first');
  law._updateLawfulInspection(state);
  const active = state.player.lawfulInspection.active;
  assert.ok(active);
  bus.emit('lawfulInspection:choose', { caseId: active.id, choice: 'comply', source: 'ui' });
  assert.equal(state.player.lawfulInspection.last.outcome, 'cleared');
  assert.deepEqual(state.lawSecurity.customsTrust, { [STATION]: { day: state.days } });
  assert.equal(marked.length, 1);
  assert.equal(toasts.at(-1).text, 'CUSTOMS CLEAR — trust mark recorded at Helios Station for today.');

  patrol('world:law12:second');
  state.tick += 120;
  law._updateLawfulInspection(state);
  assert.equal(offered.length, 1, 'the next patrol never opens a decision');
  assert.equal(scans.length, 1, 'the waiver does not launch another scan');
  assert.equal(waived.length, 1);
  assert.equal(toasts.at(-1).text, "CUSTOMS WAIVED — Helios Station remembers today's clean pass.");
  assert.equal(marked.length, 1, 'no second trust stamp');
  state.tick += 120;
  law._updateLawfulInspection(state);
  assert.equal(waived.length, 1, 'polling the same waived patrol stays quiet');

  const saved = structuredClone(law.serialize());
  law.deserialize(saved);
  assert.deepEqual(state.lawSecurity.customsTrust, { [STATION]: { day: state.days } });
  state.tick += 120;
  law._updateLawfulInspection(state);
  assert.equal(offered.length, 1, 'Continue retains the same-day waiver');
  assert.equal(marked.length, 1);
  state.days += 1;
  state.tick += 120;
  law._updateLawfulInspection(state);
  assert.equal(offered.length, 2, 'the next day needs a fresh clean pass');
});

test('LAW-12 [4242] another station, new contraband, and submit alone never inherit clearance', () => {
  const { state, bus, law, econ, patrol, events } = lawScenario();
  const marked = events('customs:trustMarked');
  const waived = events('customs:scanWaived');
  bus.emit('customs:submit', { stationId: STATION });
  assert.equal(marked.length, 0, 'acknowledgment is not a clean scan');
  econ.runScan({ stationId: STATION, source: 'dock' });
  econ.runScan({ stationId: STATION, source: 'dock' });
  assert.equal(marked.length, 1);
  assert.equal(waived.length, 1, 'the generic station scan route also remembers the pass');
  econ.runScan({ stationId: 'station_ceres', source: 'dock' });
  assert.equal(marked.length, 2, 'a different station must earn its own mark');
  assert.equal(waived.length, 1);

  state.player.cargo.items.cmdty_narcotics = 2;
  patrol('world:law12:contraband');
  law._updateLawfulInspection(state);
  assert.ok(state.player.lawfulInspection.active, 'new contraband still receives an inspection offer');
  econ._rng = () => 0;
  const caught = econ.runScan({ stationId: STATION, security: 1, scannerCloak: 0 });
  assert.equal(caught.found, true, 'the trust mark never bypasses the engine fine/seizure path');
  assert.equal(waived.length, 1);
  assert.equal(marked.length, 2);
});
