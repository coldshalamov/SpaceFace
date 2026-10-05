/** Scoped, idempotent adapter for the current SpaceFace registry/save/world architecture.
 * Fails on missing anchors instead of guessing and rewriting another agent's work.
 * Read every target and validate every insertion before writing anything.
 */
import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('../../', import.meta.url), pending = new Map();
async function change(file, anchor, text, marker) {
  let s = pending.has(file) ? pending.get(file) : await readFile(new URL(file, root), 'utf8');
  if (s.includes(marker)) return;
  if (!s.includes(anchor)) throw Error(`RUCKUS integration drift: ${file} lacks ${anchor.slice(0,80)}`);
  s = s.replace(anchor, text); pending.set(file, s);
}
for (const f of ['src/core/registry.js','src/runtime/nodeSystemFactoryTable.js']) {
  await change(f,"import { rubric } from '../systems/rubric.js';","import { rubric } from '../systems/rubric.js';\nimport { ruckus } from '../systems/ruckus.js';","import { ruckus }");
  await change(f,"['rubric', rubric],","['rubric', rubric],\n    ['ruckus', ruckus],","['ruckus', ruckus]");
}
const manifest='src/runtime/authoritativeSystemManifest.js';
// Occurs in production init, production update and table-clock roster. Never legacy47A.
let s=await readFile(new URL(manifest,root),'utf8');
if (!s.includes("'ruckus'")) {
  const hits=(s.match(/'rubric'/g)||[]).length;
  if(hits!==3)throw Error(`RUCKUS manifest drift: expected 3 sibling entries, found ${hits}`);
  pending.set(manifest,s.replaceAll("'rubric'","'rubric', 'ruckus'"));
}
await change('src/render/visualFactory.js',"import { buildRubricVisual } from './characters/rubricModel.js';", "import { buildRubricVisual } from './characters/rubricModel.js';\nimport { buildRuckusVisual } from './characters/ruckusModel.js';",'import { buildRuckusVisual }');
await change('src/render/visualFactory.js','if (e.data?.ravelPart) return stampBuiltVisual(buildRavelVisual(e));', 'if (e.data?.ruckusPart) return stampBuiltVisual(buildRuckusVisual(e));\n        if (e.data?.ravelPart) return stampBuiltVisual(buildRavelVisual(e));','if (e.data?.ruckusPart)');
await change('src/data/audioRecipes.js',"import { RUBRIC_AUDIO_RECIPES } from './rubric.js';","import { RUBRIC_AUDIO_RECIPES } from './rubric.js';\nimport { RUCKUS_AUDIO_RECIPES } from './ruckus.js';",'import { RUCKUS_AUDIO_RECIPES }');
await change('src/data/audioRecipes.js','...RUBRIC_AUDIO_RECIPES,','...RUBRIC_AUDIO_RECIPES,\n  ...RUCKUS_AUDIO_RECIPES,','...RUCKUS_AUDIO_RECIPES,');
const save='src/save/saveSystem.js';
await change(save,"['rubric', () => this._callSerialize('rubric') || {}],", "['rubric', () => this._callSerialize('rubric') || {}],\n      ['ruckus', () => this._callSerialize('ruckus') || {}],","['ruckus', ()");
await change(save,"data.rubric = this._callSerialize('rubric') || {};", "data.rubric = this._callSerialize('rubric') || {};\n    data.ruckus = this._callSerialize('ruckus') || {};",'data.ruckus =');
await change(save,"this._callDeserialize('rubric', data.rubric);", "this._callDeserialize('rubric', data.rubric);\n    this._callDeserialize('ruckus', data.ruckus);","this._callDeserialize('ruckus'");
const anchor="      // The Kettle Line drift trail";
await change('src/data/sectors.js',anchor,`      // RU-7's empty work yard: actual encounter owns its two physical bodies.
      { id: 'poi_ruckus_work_yard', type: 'anomaly', name: 'RUCKUS · Open Work Order',
        pos: { x: 680, z: 640 }, runtimeOwner: 'ruckus', scannerSignalKind: 'anomaly', dressingExclusionRadius: 480,
        chartNote: 'An old demolition retriever is keeping one pressure core. Scan to hail. Massline the core and throw it.',
        discoveryPlate: { title: 'RU-7 / Open Work Order',
          body: 'The crew clocks stopped. The retrieval service did not. Scan to wake RUCKUS; throw his caged core with the Massline. Three returns earn a pressure present. A held line pauses its countdown. Keep clear of the amber ring.' } },
${anchor}`,'poi_ruckus_work_yard');
// The only baseline-count change is this new owner, even if other work joined master.
const before=await import(new URL('src/runtime/authoritativeSystemManifest.js',root));
const increment=before.PRODUCTION_INIT_ORDER.includes('ruckus')?0:1;
let contract=await readFile(new URL('test/authoritative-manifest.test.mjs',root),'utf8');
for(const key of ['PRODUCTION_INIT_ORDER','PRODUCTION_UPDATE_ORDER']){
 const re=new RegExp(`assert\\.equal\\(${key}\\.length, (\\d+)\\);`),match=contract.match(re);
 const expected=before[key].length+increment;
 if(!match)throw Error(`Missing ${key} count assertion`);
 if(Number(match[1])!==before[key].length&&Number(match[1])!==expected)throw Error(`Existing ${key} baseline mismatch`);
 contract=contract.replace(re,`assert.equal(${key}.length, ${expected});`);
}
// The browser materialization test has its own literal count as well.
const materialized=/assert\.equal\(registry\.systems\.length, (\d+)\);/;
const match=contract.match(materialized),expected=before.PRODUCTION_INIT_ORDER.length+increment;
if(!match)throw Error('Missing browser materialized count assertion');
if(Number(match[1])!==before.PRODUCTION_INIT_ORDER.length&&Number(match[1])!==expected&&!(increment===0&&Number(match[1])===expected-1))throw Error('Existing browser materialized baseline mismatch');
contract=contract.replace(materialized,`assert.equal(registry.systems.length, ${expected});`);
if(contract!==await readFile(new URL('test/authoritative-manifest.test.mjs',root),'utf8'))pending.set('test/authoritative-manifest.test.mjs',contract);
for(const [file,text] of pending)await writeFile(new URL(file,root),text);
console.log(`RUCKUS integrated: ${pending.size} scoped files changed.`);
