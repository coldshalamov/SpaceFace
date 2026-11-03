import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCadenceDetailsPlacement } from '../src/ui/masslineCadenceReadout.js';

function overlap(a,b){return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;}
function box(left,top,width,height){return {left,top,right:left+width,bottom:top+height,width,height};}

test('short flight keeps open diagnostics inside the viewport and away from the objective, comms and instruments', () => {
  const blocks=[box(20,20,280,125),box(20,145,260,90),box(16,315,410,400),box(1000,360,260,340),box(1170,20,95,35),box(575,50,310,80)];
  const p=resolveCadenceDetailsPlacement({width:1280,height:720,obstacles:blocks,desiredHeight:210});
  assert.ok(p); assert.ok(p.left>=0 && p.top>=0 && p.right<=1280 && p.bottom<=720);
  assert.ok(blocks.every(b=>!overlap(p,b))); assert.ok(p.left>=900, 'the edge lane avoids the central playfield');
  assert.ok(p.height>=100);
});

test('viewport resize and crowded narrow flight leave a scrollable safe strip', () => {
  for(const [width,height,blocks] of [
    [1440,900,[box(20,20,280,125),box(20,350,260,100),box(10,470,450,420),box(1160,500,260,380)]],
    [390,844,[box(8,8,176,155),box(8,170,170,110),box(0,440,180,404),box(235,420,150,420)]]
  ]){
    const p=resolveCadenceDetailsPlacement({width,height,obstacles:blocks,desiredHeight:300});
    assert.ok(p);assert.ok(p.left>=0 && p.top>=0 && p.right<=width && p.bottom<=height);
    assert.ok(blocks.every(b=>!overlap(p,b)));assert.ok(p.height>=40);
  }
});
