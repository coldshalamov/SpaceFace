// A read-only projection of settled run facts. Missions owns the resulting bodies.
import { readSpine } from './storySpine.js';
import { ledgerSource } from '../endings/lifeLedger.js';

export function reckoningCallbacks(input) {
  const { story } = ledgerSource(input);
  const solved = readSpine({ story }).solved;
  const rows = [];
  const method = solved['1']?.method;
  if (method === 'cut_down') rows.push({ id: 'b1_cut', label: 'Your first cut leaves a loose shield plate', kind: 'plate', mass: 110 });
  if (method === 'wrecking_ball') rows.push({ id: 'b1_ram', label: 'Your first wreck returns as a swinging hammer', kind: 'hammer', mass: 180 });
  if (Number(story.flags?.reckoning_b2_saved_pods) >= 2) rows.push({ id: 'b2_crew', label: 'Two rescued crews hold a tug line for you', kind: 'crew', mass: 240 });
  const tow = solved['3']?.method;
  if (tow === 'tow_in' || tow === 'sling_in') rows.push({ id: `b3_${tow}`, label: tow === 'tow_in'
    ? 'Your recovered core waits beside the siege tower'
    : 'Your slung core returns as a heavy throwing mass', kind: 'core', mass: tow === 'tow_in' ? 48 : 96 });
  const asset = solved['6']?.asset;
  if (['drone', 'trader', 'outpost'].includes(asset)) rows.push({ id: `b6_${asset}`, label: {
    drone: 'Your drone seed delivers a movable cutter shield',
    trader: 'Your trader seed delivers a loaded ballast lighter',
    outpost: 'Your outpost seed delivers a braced cover module',
  }[asset], kind: asset, mass: { drone: 55, trader: 150, outpost: 350 }[asset] });
  return rows;
}
