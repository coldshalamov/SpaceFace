// Capture the two faction procedural candidates using the live fleet-look renderer.
// Usage: node scripts/fleet/game-lock.mjs run -- node scripts/fleet/looks/procedural-ship-review.mjs
// Outputs: .devshots/fleet/looks/procedural-ships/<candidate>/ and report.json per candidate.
// Diagnostic staging only: the synthetic entity's lootTableId selects the faction override;
// this does not prove that ordinary gameplay admits that override. Inspect the images yourself.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const candidates = [
  ['concord-interdictor', 'patrol_lawman', 'SF_SCN_CONCORD_INTERDICTOR'],
  ['quiet-raider', 'corsair_raider', 'SF_QUIET_RAIDER'],
];
let failed = false;
for (const [name, selector, assetId] of candidates) {
  // Wait for the real fleet-look object; intercept only its own preview build, and check the
  // selected root remains attached and visible after authored admission and the final draw.
  const init = `(() => {
    const timer = setInterval(() => {
      const look = window.SF_fleetLook;
      if (!look || typeof look.shoot !== 'function') return;
      clearInterval(timer);
      const shoot = look.shoot.bind(look);
      look.shoot = async (opts) => {
        const vf = window.SF?.state?.render?.vf;
        if (!vf || typeof vf.build !== 'function') throw Error('live visual factory unavailable');
        const original = vf.build;
        let selected = null;
        vf.build = function(entity) {
          if (entity?.id >= 900000 && entity?.type === 'ship') {
            entity.isPlayer = false;
            entity.data.lootTableId = ${JSON.stringify(selector)};
            selected = original.call(this, entity);
            return selected;
          }
          return original.call(this, entity);
        };
        try {
          const result = await shoot(opts);
          let found = false;
          selected?.traverse(node => {
            if (node.userData?.assetId !== ${JSON.stringify(assetId)}) return;
            let visible = true, current = node;
            while (current) { if (!current.visible) visible = false; current = current.parent; }
            if (visible && node.parent && selected.parent) found = true;
          });
          if (!found) throw Error('expected procedural asset absent, hidden, or replaced: ' + ${JSON.stringify(assetId)});
          return result;
        } finally { vf.build = original; }
      };
    }, 20);
  })();`;
  const out = `.devshots/fleet/looks/procedural-ships/${name}`;
  const result = spawnSync(process.execPath, ['scripts/fleet-look.mjs', '--def=ship_kestrel', `--name=${name}`,
    '--views=chase,close,inspect', `--out=${out}`, `--init=${init}`], { stdio: 'inherit' });
  if (result.status !== 0) { failed = true; continue; }
  try {
    const report = JSON.parse(readFileSync(`${out}/report.json`, 'utf8'));
    if (report.report?.length !== 3 || report.report.some(row => row.error || !row.ok)) failed = true;
  } catch { failed = true; }
}
if (failed) { console.error('Procedural ship capture incomplete; inspect individual reports.'); process.exitCode = 1; }
