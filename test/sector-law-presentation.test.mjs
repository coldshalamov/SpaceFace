import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { sectorLawProfile, securityTierFor } from '../src/ui/securityReadout.js';
import {
  authorityIncidentReadout,
  authorityTargetText,
  directLawReceiptText,
} from '../src/ui/sectorLawPresenter.js';

function state() {
  const raider = { id:'raider-7', type:'ship', data:{ callsign:'CUTLASS-7' } };
  return {
    mode:'flight', simTime:20, playerId:'player',
    player:{ cargo:{ items:{} } }, ui:{ docked:false },
    world:{ currentSectorId:'sector_helios_prime', sectors:{} },
    entities:new Map([['raider-7',raider]]), entityList:[raider],
  };
}

test('security tiers and jurisdiction rules stay truthful across the authored sector range', () => {
  assert.equal(securityTierFor(.98).label, 'HIGH SECURITY');
  assert.equal(securityTierFor(.65).label, 'MEDIUM SECURITY');
  assert.equal(securityTierFor(.35).label, 'LOW SECURITY');
  assert.equal(securityTierFor(.08).label, 'LAWLESS');

  const s = state();
  const high = sectorLawProfile(s, 'sector_helios_prime');
  assert.equal(high.authority, 'Solar Concord Navy');
  assert.match(high.illegal, /civilians, patrols, or stations/i);
  assert.match(high.response, /Rapid patrol response/i);

  const medium = sectorLawProfile(s, 'sector_tethys_junction');
  assert.equal(medium.level, 'MEDIUM SECURITY');
  assert.equal(medium.recognized, true);
  assert.match(medium.response, /protected station rings/i);

  const low = sectorLawProfile(s, 'sector_io_reach');
  assert.equal(low.level, 'LOW SECURITY');
  assert.match(low.illegal, /Station-ring aggression/i);
  assert.match(low.response, /no open-space guarantee/i);

  for (const id of ['sector_sker_haven','sector_veil_nebula','sector_ashfall_reach']) {
    const lawless = sectorLawProfile(s, id);
    assert.equal(lawless.level, 'LAWLESS');
    assert.equal(lawless.authority, 'No recognized authority');
    assert.match(lawless.response, /^No patrol dispatch\.$/);
  }
});

test('incident readout exposes truthful ETA, aggressor, dispatch strength and resolution', () => {
  const s = state();
  const base = {
    id:'law:1', stationId:'station_helios', factionId:'faction_scn',
    attackerId:'raider-7', victimId:'player', cause:'hostile_fire',
    status:'distress', dispatchAt:23.5, responderIds:[],
  };
  const distress = authorityIncidentReadout(base, s, 20);
  assert.equal(distress.statusText, 'ETA 3.5 S');
  assert.equal(distress.target, 'CUTLASS-7');
  assert.match(distress.detail, /Hostile fire/i);

  const responding = authorityIncidentReadout({ ...base, status:'responding', responderIds:['p1','p2'] }, s, 24);
  assert.equal(responding.headline, '2 PATROL UNITS INTERCEPTING');
  assert.equal(responding.statusText, 'WEAPONS AUTHORIZED');

  const monitoring = authorityIncidentReadout({ ...base, status:'monitoring' }, s, 24);
  assert.equal(monitoring.headline, 'NO PATROL IN RANGE');
  assert.equal(monitoring.statusText, 'NO ETA');

  const resolved = authorityIncidentReadout({ ...base, status:'resolved', outcome:'disengaged' }, s, 30);
  assert.match(resolved.headline, /PATROL STOOD DOWN/);
});

test('player is never invented as a police target without a canonical player-aggression cause', () => {
  const s = state();
  const forgedNeutral = {
    id:'law:bad', stationId:'station_helios', factionId:'faction_scn',
    attackerId:'player', victimId:'raider-7', cause:'hostile_fire', status:'distress', dispatchAt:24, responderIds:[],
  };
  assert.equal(authorityIncidentReadout(forgedNeutral, s, 20), null);
  const proven = { ...forgedNeutral, cause:'player_assault' };
  assert.equal(authorityTargetText(proven, s), 'YOU · AGGRESSOR');
  assert.equal(authorityIncidentReadout(proven, s, 20).target, 'YOU · AGGRESSOR');
});

test('direct receipts explain protected withdrawal and self-defense without law-state writes', () => {
  assert.match(directLawReceiptText({ outcome:'protected_withdrawal' }), /prevented return fire/i);
  assert.match(directLawReceiptText({ outcome:'retaliation_authorized' }), /you fired first/i);
  assert.equal(directLawReceiptText({ incidentId:'law:1', outcome:'distress_received' }), null);
});

test('unified map inspector consumes the same law profile and exposes lawless response truth', () => {
  const source = readFileSync(new URL('../src/ui/galaxyMap.js', import.meta.url), 'utf8');
  assert.match(source, /import \{ sectorLawProfile \} from '\.\/securityReadout\.js'/);
  assert.match(source, /Security & Jurisdiction/);
  assert.match(source, /<b[^>]*>ILLEGAL:<\/b> \$\{law\.illegal\}/);
  assert.match(source, /<b[^>]*>RESPONSE:<\/b> \$\{law\.response\}/);
});

test('law lifecycle keeps telemetry/audio data without duplicating the visible presenter', () => {
  const source = readFileSync(new URL('../src/systems/lawSecurity.js', import.meta.url), 'utf8');
  const sayBody = source.match(/_say\(channel, text, id, factionId\) \{([\s\S]*?)\n  \},/);
  assert.ok(sayBody, 'lawSecurity _say seam exists');
  assert.match(sayBody[1], /this\._emit\('law:voice'/);
  assert.doesNotMatch(sayBody[1], /voice\.say|this\._emit\('toast'/,
    'sector-law presenter is the sole visible text owner');
});
