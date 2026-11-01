import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const root=new URL('../',import.meta.url);
test('Phoebe connection helper stays load-reachable through its canonical consumers',()=>{
 // The deferred loader collapsed the eager modulepreload list (Oct-30 boot work); the
 // helper now rides its real consumers' static imports instead of an index.html pin.
 const html=fs.readFileSync(new URL('index.html',root),'utf8');
 assert.equal(html.includes('phoebePracticeConnection'),false,'the helper must not re-enter eager boot preload');
 const bellhop=fs.readFileSync(new URL('src/systems/bellhop.js',root),'utf8');
 const struckBell=fs.readFileSync(new URL('src/systems/struckBellRuntime.js',root),'utf8');
 assert.match(bellhop,/import \{[^}]*\} from '\.\.\/data\/phoebePracticeConnection\.js'/);
 assert.match(struckBell,/import \{[^}]*\} from '\.\.\/data\/phoebePracticeConnection\.js'/);
});
test('both connection leaves remain reachable without absorbing other scene gates',()=>{
 const scripts=JSON.parse(fs.readFileSync(new URL('package.json',root),'utf8')).scripts;
 assert.equal(scripts['check:phoebe-practice-connection'],'node --test test/bellhop.test.mjs test/phoebe-practice-connection.test.mjs test/phoebe-practice-connection-integration.test.mjs');
 assert.equal(scripts['check:phoebe-practice-connection:native'],'node --max-old-space-size=512 --test --test-concurrency=1 test/phoebe-practice-connection-native.test.mjs');
 const seen=new Set(); const visit=k=>{if(seen.has(k))return;seen.add(k);for(const m of (scripts[k]||'').matchAll(/npm run ([\w:.-]+)/g))visit(m[1]);};visit('check');
 for(const k of ['check:phoebe-practice-connection','check:phoebe-practice-connection:native','check:struck-bell','check:struck-bell-generation','check:gate-reachability'])assert.ok(seen.has(k),k);
});
