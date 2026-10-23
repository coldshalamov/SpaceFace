// AL-SET-1 stages existing places and physical encounters. No new set-piece content.
import { WORLD_ONE_OFFS } from './worldOneOffs.js';
import { BOLUS_FORCES } from './bolusForces.js';
import { sectorLocalToGlobalForSector } from './sectorCoordinates.js';

const oneoff = (id, zoom, cue) => {
  const source = WORLD_ONE_OFFS.find(row => row.id === id);
  return Object.freeze({
    id, title: source.name, sectorId: source.sectorId, source: Object.freeze({ oneOffId: id, name: source.name }),
    camera: Object.freeze({ zoom, seconds: 2.8 }), music: Object.freeze({ cue, gain: 0.35 }),
    clip: Object.freeze({ seconds: 30, hideUI: true }), approachWu: Math.max(100, source.radius * 2.5),
  });
};
const moment = (id, title, sectorId, source, zoom, cue, approachWu = 200) => Object.freeze({
  id, title, sectorId, source: Object.freeze(source), camera: Object.freeze({ zoom, seconds: 3.2 }),
  music: Object.freeze({ cue, gain: 0.42 }), clip: Object.freeze({ seconds: 30, hideUI: true }), approachWu,
});

export const TRAILER_MOMENTS = Object.freeze([
  moment('wreck_cathedral', 'Wreck Cathedral', 'sector_ceres_belt', { siteId: 'world_site_wreck_cathedral' }, 0.18, 'sfx_discovery_plate_note', 500),
  moment('runaway_kiln', 'The Runaway Kiln', 'sector_vesta_forge', { storyPropKind: 'runaway_kiln' }, 0.12, 'moment.stinger'),
  moment('eighth_bell', 'The Eighth Bell', 'sector_vesta_forge', { storyPropKind: 'eighth_bell' }, 0.1, 'sfx_eighth_bell_toll'),
  moment('bolus_throat', 'The Bolus Throat', 'sector_the_bolus', { position: Object.freeze(sectorLocalToGlobalForSector({ x: 0, z: BOLUS_FORCES.irisAt }, 'sector_the_bolus')) }, 0.16, 'sfx_discovery_plate_note', 260),
  oneoff('oneoff_great_tanker', 0.16, 'sfx_discovery_plate_note'),
  oneoff('oneoff_abandoned_tug', 0.06, 'sfx_travel_settle'),
  oneoff('oneoff_old_pod_field', 0.09, 'sfx_discovery_plate_note'),
  oneoff('oneoff_strut_shrine', 0.06, 'sfx_travel_settle'),
  oneoff('oneoff_runaway_ladle', 0.08, 'moment.stinger'),
  oneoff('oneoff_toll_saint_box', 0.05, 'sfx_discovery_plate_note'),
]);

export function trailerMomentMatches(moment, entity) {
  const d = entity?.data;
  if (!d) return false;
  const source = moment.source;
  return source.siteId ? d.worldSiteId === source.siteId
    : source.storyPropKind ? d.storyPropKind === source.storyPropKind
      : source.bolusRole ? d.bolus?.role === source.bolusRole
        : d.oneOffId === source.oneOffId || (d.worldOneOff && d.name === source.name);
}

export const EARLY_TRAILER_ENCOUNTERS = Object.freeze(['the_eighth_bell', 'the_runaway_kiln']);
