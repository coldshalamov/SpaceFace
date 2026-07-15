import { defineFlavorPack } from './catalog.js';

export const flavorOrder = 60;
export const flavorId = 'quiessence';
export const flavorKind = 'black_box_facts';

export default defineFlavorPack({
  id: flavorId,
  kind: flavorKind,
  description: 'Seventeen checksum-valid censuses for one instant; every living-crew total disagrees.',
  entries: [
    { id: 'quiessence_01', shipIndex: 1, snapshotId: 'formation_census_final', livingCrewCount: 0, text: 'Formation census: zero living crew. Every bunk remains warm.' },
    { id: 'quiessence_02', shipIndex: 2, snapshotId: 'formation_census_final', livingCrewCount: 1, text: 'Formation census: one living crew. Every bridge accepts their voice.' },
    { id: 'quiessence_03', shipIndex: 3, snapshotId: 'formation_census_final', livingCrewCount: 2, text: 'Formation census: two living crew. Both names were erased.' },
    { id: 'quiessence_04', shipIndex: 4, snapshotId: 'formation_census_final', livingCrewCount: 3, text: 'Formation census: three living crew. Hollow logs them ashore.' },
    { id: 'quiessence_05', shipIndex: 5, snapshotId: 'formation_census_final', livingCrewCount: 4, text: 'Formation census: four living crew. All answer one name.' },
    { id: 'quiessence_06', shipIndex: 6, snapshotId: 'formation_census_final', livingCrewCount: 5, text: 'Formation census: five living crew. Their suits remain sealed.' },
    { id: 'quiessence_07', shipIndex: 7, snapshotId: 'formation_census_final', livingCrewCount: 6, text: 'Formation census: six living crew. No camera shows them.' },
    { id: 'quiessence_08', shipIndex: 8, snapshotId: 'formation_census_final', livingCrewCount: 7, text: 'Formation census: seven living crew. None boarded before departure.' },
    { id: 'quiessence_09', shipIndex: 9, snapshotId: 'formation_census_final', livingCrewCount: 8, text: 'Formation census: eight living crew. Each occupies two bridges.' },
    { id: 'quiessence_10', shipIndex: 10, snapshotId: 'formation_census_final', livingCrewCount: 9, text: 'Formation census: nine living crew. No manifest lists them.' },
    { id: 'quiessence_11', shipIndex: 11, snapshotId: 'formation_census_final', livingCrewCount: 10, text: 'Formation census: ten living crew. All voiceprints match the captain.' },
    { id: 'quiessence_12', shipIndex: 12, snapshotId: 'formation_census_final', livingCrewCount: 11, text: 'Formation census: eleven living crew. Their clocks run backward.' },
    { id: 'quiessence_13', shipIndex: 13, snapshotId: 'formation_census_final', livingCrewCount: 12, text: 'Formation census: twelve living crew. The air remains unbreathed.' },
    { id: 'quiessence_14', shipIndex: 14, snapshotId: 'formation_census_final', livingCrewCount: 13, text: 'Formation census: thirteen living crew. Every airlock remains sealed.' },
    { id: 'quiessence_15', shipIndex: 15, snapshotId: 'formation_census_final', livingCrewCount: 14, text: 'Formation census: fourteen living crew. The formation reports empty.' },
    { id: 'quiessence_16', shipIndex: 16, snapshotId: 'formation_census_final', livingCrewCount: 15, text: 'Formation census: fifteen living crew. Navigation reports everyone docked.' },
    { id: 'quiessence_17', shipIndex: 17, snapshotId: 'formation_census_final', livingCrewCount: 16, text: 'Formation census: sixteen living crew. The buoy counts seventeen.' },
  ],
});
