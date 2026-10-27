import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const root=new URL('../',import.meta.url);
test('Phoebe connection helper has one canonical low-priority preload',()=>{
 const html=fs.readFileSync(new URL('index.html',root),'utf8');
 const target='./src/data/phoebePracticeConnection.js';
 assert.equal(html.split(target).length-1,1);
 assert.ok(html.includes('<link rel="modulepreload" fetchpriority="low" href="'+target+'" />'));
 assert.ok(html.indexOf('./src/data/phaseBlink.js')<html.indexOf(target));
 assert.ok(html.indexOf(target)<html.indexOf('./src/data/physicsMaterials.js'));
});
test('both connection leaves remain reachable without absorbing other scene gates',()=>{
 const scripts=JSON.parse(fs.readFileSync(new URL('package.json',root),'utf8')).scripts;
 assert.equal(scripts['check:phoebe-practice-connection'],'node --test test/bellhop.test.mjs test/phoebe-practice-connection.test.mjs test/phoebe-practice-connection-integration.test.mjs');
 assert.equal(scripts['check:phoebe-practice-connection:native'],'node --max-old-space-size=512 --test --test-concurrency=1 test/phoebe-practice-connection-native.test.mjs');
 const seen=new Set(); const visit=k=>{if(seen.has(k))return;seen.add(k);for(const m of (scripts[k]||'').matchAll(/npm run ([\w:.-]+)/g))visit(m[1]);};visit('check');
 for(const k of ['check:phoebe-practice-connection','check:phoebe-practice-connection:native','check:struck-bell','check:struck-bell-generation','check:gate-reachability'])assert.ok(seen.has(k),k);
});
