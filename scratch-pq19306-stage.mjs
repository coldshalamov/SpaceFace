import { execFileSync } from 'node:child_process';
import { copyFileSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';

const file = 'src/render/partsLibrary.js';
const backup = 'src/render/partsLibrary.js.pq19306.bak';
copyFileSync(file, backup);
let head = execFileSync('git', ['show', `HEAD:${file}`], { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
const reps = [
  [
    "  'wholeships/ashline_rig.glb',\n  'wholeships/helios_lark.glb',\n  'wholeships/helios_cradle.glb',\n  'wholeships/helios_span.glb',\n  'wholeships/ore_barge.glb',",
    "  'wholeships/ashline_rig.glb',\n  'wholeships/ashline_rig_corsair_blade.glb',\n  'wholeships/helios_lark.glb',\n  'wholeships/helios_cradle.glb',\n  'wholeships/helios_span.glb',\n  'wholeships/ore_barge.glb',",
  ],
  [
    "  corsair_raider: 'wholeships/ashline_rig.glb',",
    "  corsair_raider: 'wholeships/ashline_rig_corsair_blade.glb',",
  ],
  [
    "  corsair_raider: 'SF_WHOLESHIP_ASHLINE_RIG',",
    "  corsair_raider: 'SF_WHOLESHIP_ASHLINE_RIG_CORSAIR_BLADE',",
  ],
  [
    "  corsair_blade: 'wholeships/ashline_rig.glb',",
    "  corsair_blade: 'wholeships/ashline_rig_corsair_blade.glb',",
  ],
  [
    "  corsair_blade: 'SF_WHOLESHIP_ASHLINE_RIG',",
    "  corsair_blade: 'SF_WHOLESHIP_ASHLINE_RIG_CORSAIR_BLADE',",
  ],
];
for (const [from, to] of reps) {
  const n = head.split(from).length - 1;
  if (n !== 1) throw new Error(`expected 1 match for ${JSON.stringify(from.slice(0, 80))} got ${n}`);
  head = head.replace(from, to);
}
writeFileSync(file, head);
execFileSync('git', ['add', '--', file], { stdio: 'inherit' });
copyFileSync(backup, file);
unlinkSync(backup);
const staged = execFileSync('git', ['diff', '--cached', '-U1', '--', file], { encoding: 'utf8' });
if (!staged.includes('ashline_rig_corsair_blade.glb')) throw new Error('staged diff missing corsair file');
if (staged.includes('waitForOpeningCompositionSettled') || staged.includes('stampSharedMaterialRole')) {
  throw new Error('staged foreign first-flight hunks');
}
console.log('staged partsLibrary corsair hunks only');
console.log(staged);
