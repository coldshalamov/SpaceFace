import assert from 'node:assert/strict';
import test from 'node:test';
import { contractSealHtml, fabricationArtworkHtml, fabricationProgress } from '../src/ui/art/operationArtwork.js';

test('operation seals carry distinct authored mission symbols and no unsafe content', () => {
  const variants = ['cargo_delivery','courier','bounty_hunt','escort','survey','passenger','smuggling','salvage'].map(contractSealHtml);
  assert.equal(new Set(variants).size, 8);
  for (const svg of variants) {
    assert.match(svg, /viewBox="0 0 96 104"/);
    assert.match(svg, /aria-hidden="true"/);
    assert.ok(svg.length < 1800);
    assert.doesNotMatch(svg, /<script|<foreignObject|filter=/);
  }
  assert.equal(contractSealHtml('<img src=x onerror=1>'), contractSealHtml('unknown'));
  assert.equal(contractSealHtml('__proto__'), contractSealHtml('unknown'));
  assert.equal(contractSealHtml('constructor'), contractSealHtml('unknown'));
  assert.equal(contractSealHtml('escort_convoy'), contractSealHtml('escort'));
});
test('four fabrication methods use separate bounded engravings', () => {
  const art = ['refine','assemble','augment','ship'].map(fabricationArtworkHtml);
  assert.equal(new Set(art).size, 4);
  assert.equal(fabricationArtworkHtml('constructor'), fabricationArtworkHtml('assemble'));
  for (const svg of art) {
    assert.match(svg, /viewBox="0 0 440 138"/);
    assert.ok(svg.length < 2400);
    assert.doesNotMatch(svg, /<script|<foreignObject|filter=/);
  }
});
test('fabrication progress uses finite real queue values and clamps overflow', () => {
  assert.deepEqual(fabricationProgress({ total: 25, elapsed: 12 }), { percent: 48, remaining: 13 });
  assert.deepEqual(fabricationProgress({ total: 25, elapsed: 99 }), { percent: 100, remaining: 0 });
  assert.deepEqual(fabricationProgress({ total: 25, elapsed: -9 }), { percent: 0, remaining: 25 });
  for (const queue of [null, {}, {total:0,elapsed:0}, {total:Infinity,elapsed:2}, {total:5,elapsed:NaN}, {total:'5',elapsed:2}]) assert.equal(fabricationProgress(queue), null);
});
