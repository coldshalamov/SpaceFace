import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, unlink, rmdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Document } from '@gltf-transform/core';
import { PNG } from 'pngjs';
import { cachedKtx2, textureEncodingKey } from '../../../scripts/lib/cachedKtx2.mjs';
import { CACHE, context, assetMatches, eligibleImage, seedEntry, sha } from './texture_cache_seed.mjs';

const ctx=context();
const asset=assetMatches(ctx,'ashline_rig');
const match=asset.matches.find(m=>m.options.slots.test('baseColorTexture'));
assert.ok(match,'a real committed Ashline source/release pair must supply an exact eligible color image');

test('actual unchanged image reuses the previous compressed payload through the real cache consumer',async()=>{
  assert.ok(match.original.equals(match.candidate));
  assert.equal(eligibleImage(match.candidate,match.original,match.bytes,match.options,ctx.current.decodeImage).ok,true);
  assert.equal(textureEncodingKey(match.candidate,match.options),match.key);
  const status=await seedEntry(match.key,match.bytes);
  assert.ok(['seeded','already-cached','concurrent-cache-entry'].includes(status),status);
  const document=new Document();
  const texture=document.createTexture('real unchanged Ashline paint').setImage(match.candidate).setMimeType('image/png');
  document.createMaterial('paint').setBaseColorTexture(texture);
  await document.transform(cachedKtx2(match.options));
  const stored=await readFile(resolve(CACHE,`${match.key}.ktx2`));
  assert.equal(texture.getMimeType(),'image/ktx2');
  assert.ok(Buffer.from(texture.getImage()).equals(stored),'actual transform returns the validated cache bytes');
  assert.equal(await readFile(resolve(CACHE,`${match.key}.ktx2.sha256`),'utf8'),sha(stored));
  if(status==='seeded')assert.ok(stored.equals(match.bytes),'fresh cache is byte-identical to the old release image');
});

test('one changed pixel and a different color-space contract both reject donor reuse',()=>{
  const pixels=PNG.sync.read(match.original);
  pixels.data[0]^=255;
  const changed=PNG.sync.write(pixels);
  assert.deepEqual(eligibleImage(changed,match.original,match.bytes,match.options,ctx.current.decodeImage),
    {ok:false,reason:'source image bytes changed'});
  const linear={...match.options,isSetKTX2SRGBTransferFunc:false,isPerceptual:false};
  assert.equal(eligibleImage(match.candidate,match.original,match.bytes,linear,ctx.current.decodeImage).ok,false);
  assert.notEqual(textureEncodingKey(changed,match.options),match.key);
  assert.notEqual(textureEncodingKey(match.candidate,linear),match.key);
});

test('seeding never replaces an existing cache entry or checksum',async()=>{
  const directory=await mkdtemp(resolve(CACHE,'seed-test-'));
  const file=resolve(directory,`${match.key}.ktx2`);
  try{
    assert.equal(await seedEntry(match.key,match.bytes,directory),'seeded');
    const other=Buffer.from(match.bytes);other[other.length-1]^=1;
    assert.equal(await seedEntry(match.key,other,directory),'already-cached');
    assert.ok((await readFile(file)).equals(match.bytes));
    assert.equal(await readFile(`${file}.sha256`,'utf8'),sha(match.bytes));
  }finally{
    await unlink(file);await unlink(`${file}.sha256`);await rmdir(directory);
  }
});
