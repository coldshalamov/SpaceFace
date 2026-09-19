import test from 'node:test';
import assert from 'node:assert/strict';
import {averageBoundedPrice as average,averageLivePrice,clamp,recoverStock,settleCredits,normalizedTradeQuantity} from '../../src/economy/economyMath.js';
const close=(a,b,t=1e-7)=>assert.ok(Math.abs(a-b)<=t*Math.max(1,Math.abs(b)),`${a} != ${b}`);
function numerical(fn,a,b,n=120000) {let sum=0;const step=(b-a)/n;for(let i=0;i<n;i++)sum+=fn(a+(i+.5)*step);return sum/n;}
for(const el of [0,.344535,.8,1,1.0000001,1.4]) {
 test(`clamped integral agrees with quadrature: elasticity ${el}`,()=>{
  for(const [a,b] of [[0,.5],[0,50],[1,2000],[990,1000],[3,7]]) {
   close(average(50,182,el,a,b),numerical(s=>50*clamp((Math.max(1,s)/182)**(-el),.4,2.6),a,b),2e-6);
  }
 });
}
test('nested demand / cycle / price caps are integrated before averaging',()=>{
 for(const demand of [.72,1,1.45]) for(const cycle of [.88,1,1.12]) {
  const result=averageLivePrice({basePrice:20,baseEq:100,elasticity:.8,stockLo:0,stockHi:900,demand,cycle});
  const expected=numerical(s=>20*clamp(demand*cycle*clamp((Math.max(s,1)/100)**(-.8),.4,2.6),.35,2.8),0,900);
  close(result,expected,2e-6);
 }
});
test('splitting across both knees conserves unrounded consideration',()=>{
 const a=0,m=50,b=2000;
 close(average(100,100,1,a,b)*(b-a),average(100,100,1,a,m)*(m-a)+average(100,100,1,m,b)*(b-m));
});
test('tiny lot on a deep book remains numerically stable',()=>{
 close(average(95,1e12,.45,1e12,1e12+.01),95,1e-8);
});
test('integer settlement cannot improve by splitting a lot',()=>{
 for(let i=1;i<2000;i++) {
  const a=i*.3727,b=(2000-i)*.8167;
  assert.ok(settleCredits(a,'buy')+settleCredits(b,'buy')>=settleCredits(a+b,'buy'));
  assert.ok(settleCredits(a,'sell')+settleCredits(b,'sell')<=settleCredits(a+b,'sell'));
 }
});
test('finite, positive quantity and side requirements',()=>{
 for(const q of [NaN,Infinity,-Infinity,0,-3,'12',null,{},1e20,.2])assert.equal(normalizedTradeQuantity(q),null);
 assert.equal(normalizedTradeQuantity(12.9),12);
 assert.equal(settleCredits(Infinity,'buy'),null);assert.equal(settleCredits(12,'barter'),null);
});
test('closed-form recovery: monotonic, bounded and partition invariant',()=>{
 for(const [stock,target] of [[0,100],[150,100]]) {
  const direct=recoverStock(stock,target,10000,900);
  let split=stock;for(let i=0;i<1000;i++)split=recoverStock(split,target,10,900);
  close(direct,split);assert.ok(direct>=Math.min(stock,target)&&direct<=Math.max(stock,target));
 }
 close(recoverStock(0,100,900,900),50);
 assert.equal(recoverStock(10,100,10000,900,0),10);
});
