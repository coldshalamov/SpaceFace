const vm=require('node:vm'), path=require('node:path'), crypto=require('node:crypto');
const sources=Object.fromEntries(["src/ui/captions.js","src/audio/recipeCaptions.js","src/localization/runtime.js","test/caption-format-bridge-contract.test.mjs","test/inf50-al-pr-13.test.mjs","test/inf50-al-pr-15.test.mjs","src/data/audioRecipes.js","src/data/morrow.js","src/data/vesper.js","src/data/bracket.js","src/data/ravel.js","src/data/solstice.js","src/data/rubric.js","src/data/ruckus.js","src/data/ruud.js","src/data/docket.js","src/data/bolusAudio.js","src/data/secondRinseAudio.js","src/data/discoveryAudio.js"].map(p=>[p,require('node:fs').readFileSync(p,'utf8')]));
const modules=new Map(); for(const [id,source] of Object.entries(sources))modules.set(id,new vm.SourceTextModule(source,{identifier:id}));
const synth=(id,exports)=>new vm.SyntheticModule(Object.keys(exports),function(){for(const [key,value] of Object.entries(exports)) this.setExport(key,value);},{identifier:id});
const stubs={
'src/data/barks.js':synth('stub:barks',{BARKS:{},BARK_FACTIONS:[],BARK_SITUATIONS:[],barkFor(){}}),
'src/audio/barkVoice.js':synth('stub:barkVoice',{enumerateBarkPipeline(){return [];},resolveBarkVoice(){}}),
'src/audio/masslineInstrument.js':synth('stub:massline',{masslineInstrumentCaption(){},resolveMasslineInstrument(){}}),
'node:assert/strict':synth('node:assert/strict',{default:require('node:assert/strict')}),
'node:test':synth('node:test',{default:require('node:test'),test:require('node:test')}),
'src/data/sectorCoordinates.js':synth('boundary:sectorCoordinates',{sectorLocalToGlobalForSector(...args){return {x:0,z:0};}}),
};
(async()=>{
const runtime=modules.get('src/localization/runtime.js');await runtime.link(()=>{throw Error('unexpected runtime dependency')});await runtime.evaluate();
const localization=runtime.namespace.createLocalizationRuntime({locale:'en-US'});
stubs['src/localization/gameLocalization.js']=synth('boundary:gameLocalization',{gameLocalization:localization,localizeText:(source,values={})=>localization.t(source,values,()=>source)});
const link=async(s,m)=>{const id=s.startsWith('.')?path.posix.normalize(path.posix.join(path.posix.dirname(m.identifier),s)):s;const mod=modules.get(id)||stubs[id];if(!mod)throw Error('unapproved dependency '+id);return mod;};
for(const p of ['test/caption-format-bridge-contract.test.mjs','test/inf50-al-pr-13.test.mjs','test/inf50-al-pr-15.test.mjs']){const t=modules.get(p);await t.link(link);await t.evaluate();}
console.log('PINS '+JSON.stringify(Object.fromEntries(Object.entries(sources).map(([p,s])=>[p,{bytes:Buffer.byteLength(s),gitBlob:crypto.createHash('sha1').update('blob '+Buffer.byteLength(s)+'\0').update(s).digest('hex'),sha256:crypto.createHash('sha256').update(s).digest('hex')}]))));
console.log('BOUNDARY: actual captions, bridge, localization runtime; bark/massline data and full gameLocalization catalog pipeline doubled; Ruud non-audio placement coordinates doubled; real full audio recipe table + 12 recipe modules; no audioSystem, WebAudio, browser or game initialization.');
console.log('UTC '+new Date().toISOString());
})().catch(e=>{console.error(e);process.exitCode=1});