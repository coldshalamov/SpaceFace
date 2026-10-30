import test from 'node:test';
import assert from 'node:assert/strict';
import { revealMarketRowInRail } from '../src/ui/station/screens/market.js';
const rig=(top,bottom,scrollTop=50,scale=1)=>{const outer={scrollTop:13};const rail={outer,scrollTop,scrollHeight:500,clientHeight:100,offsetHeight:100,clientTop:0,getBoundingClientRect:()=>({top:100,bottom:100+100*scale,height:100*scale})};return {outer,rail,row:{getBoundingClientRect:()=>({top,bottom})}}};
test('reveals rows only inside the commodity rail while preserving the surrounding body',()=>{for(const [top,bottom,start,want] of [[110,130,50,50],[80,95,50,30],[190,220,50,70],[80,95,5,0],[190,250,390,400]]){const {rail,row,outer}=rig(top,bottom,start);revealMarketRowInRail(rail,row);assert.equal(rail.scrollTop,want);assert.equal(outer.scrollTop,13)}});
test('converts scaled geometry to scroll units and skips unmeasurable rails',()=>{const x=rig(80,90,50,2); revealMarketRowInRail(x.rail,x.row); assert.equal(x.rail.scrollTop,40);x.rail.clientHeight=0;revealMarketRowInRail(x.rail,x.row);assert.equal(x.rail.scrollTop,40)});
