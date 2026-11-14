// Surveyor Prism geometry. Shared buffers keep the faceted shell and scanner cheap to reuse.
// THREE is injected so every geometry belongs to the active renderer module.
const shared = new WeakMap();
const add = (a,b) => a.map((v,i)=>v+b[i]);
const sub = (a,b) => a.map((v,i)=>v-b[i]);
const mul = (a,s) => a.map(v=>v*s);
const dot = (a,b) => a.reduce((s,v,i)=>s+v*b[i],0);
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit = a => mul(a,1/Math.hypot(...a));
const mix = (a,b,t) => add(mul(a,1-t),mul(b,t));
const mean = pts => mul(pts.reduce(add,[0,0,0]),1/pts.length);

function writer(THREE, name, uvDensity=0.5) {
  const p=[],n=[],uv=[];
  function face(points, normalHint) {
    let pts=points;
    let normal=unit(cross(sub(pts[1],pts[0]),sub(pts[2],pts[0])));
    if (normalHint && dot(normal,normalHint)<0) { pts=[...pts].reverse(); normal=mul(normal,-1); }
    const u=unit(sub(pts[1],pts[0]));
    const v=cross(normal,u);
    // Orthogonal, equal-density planar projection, including thin bevel faces.
    for(let i=1;i<pts.length-1;i++) {
      const triangleNormal=unit(cross(sub(pts[i],pts[0]),sub(pts[i+1],pts[0])));
      for(const pt of [pts[0],pts[i],pts[i+1]]) {
        p.push(...pt); n.push(...triangleNormal);
        const local=sub(pt,pts[0]); uv.push(dot(local,u)*uvDensity+0.1,dot(local,v)*uvDensity+0.1);
      }
    }
  }
  function finish() {
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
    g.setAttribute('normal',new THREE.Float32BufferAttribute(n,3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    g.name=name;
    g.userData.spacefaceSharedAsset=true;
    g.computeBoundingBox(); g.computeBoundingSphere();
    return g;
  }
  return {face,finish};
}

function createSurveyorBodyGeometry(THREE) {
  const w=writer(THREE,'surveyor-astra-v1-body');
  const axes=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
  const cut=0.12;
  const panels=[];
  for(const x of [-1,1]) for(const y of [-1,1]) for(const z of [-1,1]) {
    const a=[x,0,0], b=[0,y,0], c=[0,0,z];
    panels.push({pts:[mix(a,b,cut),mix(b,a,cut),mix(b,c,cut),mix(c,b,cut),mix(c,a,cut),mix(a,c,cut)],normal:unit([x,y,z]),inset:0.016});
  }
  for(const a of axes) {
    const pts=axes.filter(b=>dot(a,b)===0).map(b=>mix(a,b,cut));
    const center=mean(pts), u=unit(sub(pts[0],center)), v=cross(a,u);
    pts.sort((p,q)=>Math.atan2(dot(sub(p,center),v),dot(sub(p,center),u))-Math.atan2(dot(sub(q,center),v),dot(sub(q,center),u)));
    panels.push({pts,normal:a,inset:0.006});
  }
  for(const {pts,normal,inset} of panels) {
    const center=mean(pts);
    const inner=pts.map(p=>sub(mix(center,p,0.91),mul(normal,inset)));
    w.face(inner,normal);
    for(let i=0;i<pts.length;i++) { const j=(i+1)%pts.length; w.face([pts[i],pts[j],inner[j],inner[i]],normal); }
  }
  return w.finish();
}

function ring(z,rx,ry=rx) {
  return Array.from({length:8},(_,i)=>{const a=(i+0.5)*Math.PI/4;return [Math.cos(a)*rx,Math.sin(a)*ry,z];});
}
function skin(w,a,b,inward=false) {
  for(let i=0;i<8;i++) { const j=(i+1)%8; const hint=mul([a[i][0]+a[j][0],a[i][1]+a[j][1],0],inward?-1:1); w.face([a[i],a[j],b[j],b[i]],hint); }
}
function annulus(w,a,b,normal) { for(let i=0;i<8;i++){const j=(i+1)%8;w.face([a[i],a[j],b[j],b[i]],normal);} }

function createSurveyorArmGeometry(THREE) {
  const w=writer(THREE,'surveyor-astra-v1-arm',4);
  // One connected faceted stem; the optical housing flares only at its distal end.
  const sections=[ring(0,0.075,0.055),ring(-0.13,0.075,0.055),ring(-0.22,0.052,0.042),ring(-1.25,0.043,0.035),ring(-1.43,0.15,0.12),ring(-1.58,0.15,0.12),ring(-1.64,0.13,0.105)];
  w.face(sections[0],[0,0,1]);
  for(let i=1;i<sections.length;i++) skin(w,sections[i-1],sections[i]);
  const mouth=ring(-1.64,0.105,0.085), bottom=ring(-1.49,0.105,0.085);
  annulus(w,sections.at(-1),mouth,[0,0,-1]);
  skin(w,mouth,bottom,true);
  w.face(bottom,[0,0,-1]);
  return w.finish();
}

function createSurveyorTipGeometry(THREE) {
  const w=writer(THREE,'surveyor-astra-v1-tip',4);
  // Hollow optical rim, not a filled luminous disc. Existing glow stays animated.
  const back=ring(0.015,0.145,0.115), shoulder=ring(-0.055,0.16,0.13), front=ring(-0.105,0.145,0.115);
  const innerFront=ring(-0.105,0.1,0.07),innerBack=ring(0.015,0.1,0.07);
  skin(w,back,shoulder);skin(w,shoulder,front);
  annulus(w,front,innerFront,[0,0,-1]);skin(w,innerFront,innerBack,true);
  annulus(w,innerBack,back,[0,0,1]);
  return w.finish();
}

export function getSurveyorGeometries(THREE) {
  if(!shared.has(THREE)) shared.set(THREE,Object.freeze({body:createSurveyorBodyGeometry(THREE),arm:createSurveyorArmGeometry(THREE),tip:createSurveyorTipGeometry(THREE)}));
  return shared.get(THREE);
}

