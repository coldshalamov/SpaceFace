// Gate the reference set on SCENE-TYPE VALIDITY before it is ever used to score a frame.
//
// WHY THIS EXISTS
// The parity loop scored our deep-space flight frame `background: 1/5` for 23 rounds. Two of the five
// `deep-flight` references turned out to be IN-ATMOSPHERE planetary scenes — an orange sunset fleet
// shot and a pink-sky low pass over terrain. A frame set in space cannot win a background comparison
// against a reference that has a sky and a ground, so part of that 1/5 was measuring the reference
// set, not the game.
//
// scripts/gfx-pull-references.mjs fetched whatever the research agent returned and only checked that
// each scene type had SOME usable image. Relevance was never verified. This adds that missing gate:
// each reference is classified against the scene type it was filed under, and anything off-brief is
// quarantined rather than deleted, so the call stays reviewable.
//
// Run: node scripts/gfx-validate-references.mjs [--scene deep-flight] [--apply]
// Without --apply this only reports; with --apply it moves failures to refs/_quarantine/<scene>/.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const argv = parseArgs(process.argv.slice(2));
const REFS = '.devshots/gfx/refs';
const APPLY = !!argv.apply;
const ONLY = argv.scene ? String(argv.scene) : null;

// What each scene type must actually depict for a comparison against our frame to be meaningful.
const SCENE_BRIEF = {
  'deep-flight': 'a spacecraft in OPEN SPACE (vacuum). The frame must NOT be inside a planetary atmosphere: no sky gradient, no clouds, no horizon line, no terrain/ground surface filling the lower frame.',
  'asteroid-field': 'a spacecraft among asteroids/rocks in OPEN SPACE. Not an atmospheric or ground scene.',
  combat: 'spacecraft combat in OPEN SPACE with weapons fire, shields or explosions. Not an atmospheric or ground scene.',
  'boost-travel': 'a spacecraft at high speed / boost / warp in OPEN SPACE, showing motion streaks or a travel tunnel. Not an atmospheric or ground scene.',
  'ui-overlay': 'a space-game HUD/UI over gameplay. Any environment is acceptable; it is the interface being compared.',
  'station-approach': 'a spacecraft approaching a large artificial structure or station in OPEN SPACE.',
};

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['onBrief', 'setting', 'reason'],
  properties: {
    onBrief: { type: 'boolean', description: 'true only if the image satisfies the brief' },
    setting: { type: 'string', enum: ['open-space', 'in-atmosphere', 'ground', 'interior', 'other'] },
    reason: { type: 'string', description: 'one sentence citing what is visible' },
  },
};

const scenes = readdirSync(REFS, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
  .map((d) => d.name)
  .filter((s) => (ONLY ? s === ONLY : true));

const schemaPath = '.devshots/gfx/ref-validity.schema.json';
writeFileSync(schemaPath, JSON.stringify(SCHEMA, null, 2));

const report = [];
for (const scene of scenes) {
  const brief = SCENE_BRIEF[scene];
  if (!brief) { console.log(`[refs] ${scene}: no brief defined — skipped`); continue; }
  const dir = join(REFS, scene);
  const imgs = readdirSync(dir).filter((f) => /\.(jpe?g|png)$/i.test(f));
  for (const img of imgs) {
    const path = join(dir, img);
    const outPath = `.devshots/gfx/ref-validity-${scene}-${img}.json`;
    const prompt = `You are validating a REFERENCE IMAGE for a graphics comparison.\n\n`
      + `The reference is filed under scene type "${scene}", which requires: ${brief}\n\n`
      + `Look at the attached image and decide whether it satisfies that brief. Judge only the SETTING, `
      + `not the art quality. If the image shows sky, clouds, a horizon, or ground terrain, it is `
      + `in-atmosphere or ground and is NOT open space.`;
    let verdict = null;
    try {
      execFileSync('codex', [
        'exec', '--skip-git-repo-check', '--ignore-user-config', '--sandbox', 'read-only',
        '--output-schema', schemaPath, '-o', outPath, '-i', path, '-',
      ], { input: prompt, stdio: ['pipe', 'pipe', 'pipe'], timeout: 180000 });
      verdict = JSON.parse(readFileSyncSafe(outPath) || 'null');
    } catch (e) {
      console.log(`[refs] ${scene}/${img}: classifier failed (${String(e.message).slice(0, 50)})`);
    }
    if (!verdict) { report.push({ scene, img, onBrief: null, setting: 'unknown', reason: 'classifier failed' }); continue; }
    report.push({ scene, img, ...verdict });
    const mark = verdict.onBrief ? 'OK ' : 'OFF';
    console.log(`[refs] ${mark} ${scene}/${img}  setting=${verdict.setting}  ${String(verdict.reason).slice(0, 90)}`);
  }
}

const bad = report.filter((r) => r.onBrief === false);
if (APPLY && bad.length) {
  for (const r of bad) {
    const qdir = join(REFS, '_quarantine', r.scene);
    mkdirSync(qdir, { recursive: true });
    renameSync(join(REFS, r.scene, r.img), join(qdir, r.img));
  }
  console.log(`[refs] quarantined ${bad.length} off-brief reference(s)`);
}

writeFileSync('design/graphics-sprints/REFERENCE_VALIDITY.json', JSON.stringify({
  schema: 'spaceface.gfxReferenceValidity.v1',
  applied: APPLY,
  total: report.length,
  offBrief: bad.length,
  note: 'Off-brief references are quarantined, not deleted. A frame set in space cannot win a background comparison against a reference with a sky and a ground.',
  report,
}, null, 2));

console.log('');
console.log(`[refs] ${report.length} reference(s) checked, ${bad.length} off-brief${APPLY ? ' (quarantined)' : ' (run with --apply to quarantine)'}`);

// Per-scene floor: a scene type that loses too many references can no longer support a verdict.
for (const scene of scenes) {
  const rows = report.filter((r) => r.scene === scene);
  const kept = rows.filter((r) => r.onBrief !== false).length;
  if (rows.length && kept < 3) {
    console.log(`[refs] WARNING ${scene}: only ${kept} on-brief reference(s) — too thin to score against`);
  }
}

function readFileSyncSafe(p) {
  try { return existsSync(p) ? readFileSync(p, 'utf8') : null; } catch { return null; }
}
function parseArgs(args) {
  const out = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const key = a.slice(2);
    const next = args[i + 1];
    if (next && !next.startsWith('--')) { out[key] = next; i++; } else out[key] = true;
  }
  return out;
}
