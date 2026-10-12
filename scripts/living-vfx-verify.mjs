/** Focused living-material gate. The unrelated baseline failures are recorded in the receipt. */
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LIVING_VFX_FAMILIES } from '../src/render/vfx/livingVfxCatalog.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const tests=[
  'living-vfx','vfx-particle-transport','vfx-radiance-upgrade','vfx-radiance-materials',
  'vfx-force-language','vfx-field-lifecycle','flow-environment','field-force-quiet-empty-latch',
  'quarks-vfx-system','explosion-rupture','plasma-stream-thruster','weapon-vfx-techniques',
].map(n=>`test/${n}.test.mjs`);
const run=spawnSync(process.execPath,['--test',...tests],{cwd:root,stdio:'inherit'});
if(run.status!==0)process.exit(run.status||1);
const walk=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
const files=walk(path.join(root,'src/render'));
for(const [family,definition]of Object.entries(LIVING_VFX_FAMILIES)) {
  for(const owner of definition.owners)if(!files.some(f=>f.endsWith('/'+owner+'.js')))throw new Error(`Unresolved ${family} owner: ${owner}`);
}
const bundle=await build({absWorkingDir:root,entryPoints:['src/render/vfx.js','src/render/thruster/systems/plasmaStream.js'],
  bundle:true,write:false,outdir:'.living-vfx-check',format:'esm',platform:'browser',logLevel:'warning',external:['/vendor/*']});
console.log(JSON.stringify({gate:'living-vfx-v1',testFiles:tests.length,reviewFamilies:Object.keys(LIVING_VFX_FAMILIES).length,
  bundles:bundle.outputFiles.map(f=>({path:path.basename(f.path),bytes:f.contents.length,sha256:createHash('sha256').update(f.contents).digest('hex')}))},null,2));
