// Native Surveyor instrument: formed prism cladding, supported receivers and an articulated scanner.
// Final shared geometry only; no external asset or original triangle-order dependency.
const cache=new WeakMap();
const sub=(a,b)=>a.map((x,i)=>x-b[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
function writer(THREE,name) {
  const positions=[],normals=[],colors=[];
  function face(points,hint,color=0xffffff,vertexNormals=null) {
    let pts=points,ns=vertexNormals,n=cross(sub(pts[1],pts[0]),sub(pts[2],pts[0]));
    if(dot(n,hint)<0) {pts=[...pts].reverse();if(ns)ns=[...ns].reverse();n=n.map(x=>-x);}
    const length=Math.hypot(...n);n=n.map(x=>x/length);
    const c=new THREE.Color(color);
    for(let i=1;i<pts.length-1;i++) {
      const raw=cross(sub(pts[i],pts[0]),sub(pts[i+1],pts[0])),length=Math.hypot(...raw),normal=raw.map(x=>x/length);
      for(const k of [0,i,i+1]) {positions.push(...pts[k]);normals.push(...(ns?ns[k]:normal));colors.push(c.r,c.g,c.b);}
    }
  }
  function pack() {
    // Exact float-bit deduplication shares coplanar corners while retaining every hard edge/tone.
    const data=[positions,normals,colors].map(a=>new Float32Array(a));
    const bits=data.map(a=>new Uint32Array(a.buffer)),packed=[[],[],[]],indices=[],seen=new Map();
    for(let i=0;i<data[0].length;i+=3){
      const key=bits.map(a=>`${a[i]},${a[i+1]},${a[i+2]}`).join('|');
      let index=seen.get(key);
      if(index===undefined){index=packed[0].length/3;seen.set(key,index);data.forEach((a,k)=>packed[k].push(a[i],a[i+1],a[i+2]));}
      indices.push(index);
    }

    const uv=[];
    for(let i=0;i<packed[0].length;i+=3){
      const [x,y,z]=packed[0].slice(i,i+3),[nx,ny,nz]=packed[1].slice(i,i+3).map(Math.abs);
      // Stable planar UVs on formed upper cladding: smooth normal tilt must not switch projection planes.
      const pair=name.endsWith('panels')?[x,z]:ny>=nx&&ny>=nz?[x,z]:nx>=nz?[z,y]:[x,y];
      uv.push(pair[0]*1.05+.5,pair[1]*1.05+.5);
    }
    return {packed,uv,indices};
  }
  return {face,pack};
}
const rotate=(p,angle)=>[p[0]*Math.cos(angle)-p[2]*Math.sin(angle),p[1],p[0]*Math.sin(angle)+p[2]*Math.cos(angle)];
function panel(w,poly,bottom,top,bevel,angle=0,tint=0xc4d0c9,grade=0) {
  const cx=poly.reduce((s,p)=>s+p[0],0)/poly.length,cz=poly.reduce((s,p)=>s+p[1],0)/poly.length;
  const outer=y=>poly.map(p=>rotate([p[0],y-grade*p[0],p[1]],angle));
  const inner=y=>poly.map(p=>{const d=Math.hypot(p[0]-cx,p[1]-cz),x=p[0]+(cx-p[0])*bevel/d;return rotate([x,y-grade*x,p[1]+(cz-p[1])*bevel/d],angle);});
  const rings=[inner(bottom),outer(bottom+bevel),outer(top-bevel),inner(top)];
  w.face(rings[0],[0,-1,0],0x778980);w.face(rings[3],[0,1,0],tint);
  const center=rotate([cx,0,cz],angle);
  for(let k=0;k<3;k++) for(let i=0;i<poly.length;i++) {
    const j=(i+1)%poly.length,hint=sub(rings[k][i],center);hint[1]=k===0?-1:k===2?1:0;
    w.face([rings[k][i],rings[k][j],rings[k+1][j],rings[k+1][i]],hint,k===2?0xe4ebe2:k===0?0x7c8b82:0x9caea4);
  }
}
function annularHousing(w,rOuter,rInner,bottom,top,sides=12,rTop=rOuter) {
  const ring=(r,y)=>Array.from({length:sides},(_,i)=>[Math.cos(i*2*Math.PI/sides)*r,y,Math.sin(i*2*Math.PI/sides)*r]);
  const ob=ring(rOuter,bottom),ot=ring(rTop,top),ib=ring(rInner,bottom),it=ring(rInner,top);
  for(let i=0;i<sides;i++) {
    const j=(i+1)%sides,out=[ot[i][0],0,ot[i][2]];
    w.face([ob[i],ob[j],ot[j],ot[i]],out);
    w.face([ib[i],ib[j],it[j],it[i]],out.map(v=>-v),0x788b84);
    w.face([ot[i],ot[j],it[j],it[i]],[0,1,0]);
    w.face([ob[i],ob[j],ib[j],ib[i]],[0,-1,0]);
  }
}
export function getSurveyorGeometries(THREE) {
  if(cache.has(THREE)) return cache.get(THREE);
  const b=writer(THREE,'surveyor-prism-panels'),f=writer(THREE,'surveyor-prism-frame');
  drawPrismCore(f);
  // Three broad service plates on each upper facet. Channels expose the darker recessed substrate.
  // Their barycentric layout follows the prism's face planes instead of projecting arbitrary stripes.
  const plateWeights=[[.83,.135,.035],[.49,.475,.035],[.34,.33,.33],[.49,.035,.475],[.83,.035,.135]];
  for(const sx of [-1,1])for(const sz of [-1,1]){
    const axes=[[sx,0,0],[0,1,0],[0,0,sz]],normal=[sx/.85,1/.6,sz/.85],length=Math.hypot(...normal);
    const unit=normal.map(x=>x/length),originalNormal=[sx,1,sz].map(x=>x/Math.sqrt(3));
    for(let corner=0;corner<3;corner++){
      const base=plateWeights.map(weights=>{
        const raw=[0,0,0];
        for(let k=0;k<3;k++)for(let axis=0;axis<3;axis++)raw[axis]+=weights[k]*axes[(corner+k)%3][axis];
        for(let axis=0;axis<3;axis++)raw[axis]-=originalNormal[axis]*.016;
        return[raw[0]*.85,raw[1]*.6-.40,raw[2]*.85];
      });
      const center=[0,1,2].map(k=>base.reduce((s,p)=>s+p[k],0)/base.length);
      const inner=base.map(p=>p.map((v,k)=>center[k]+(v-center[k])*.96+unit[k]*.008));
      // A slight smooth crown gives each formed plate a broad manufactured highlight, not foil noise.
      const crown=.014,peak=center.map((v,k)=>v+unit[k]*(.008+crown));
      const middle=base.map(p=>p.map((v,k)=>center[k]+(v-center[k])*.48+unit[k]*(.008+crown*.75)));
      const normals=(fraction)=>base.map(p=>{
        const radial=p.map((v,k)=>(v-center[k])*.96),r2=dot(radial,radial);
        const raw=unit.map((v,k)=>v-radial[k]*2*crown*fraction/r2),length=Math.hypot(...raw);
        return raw.map(v=>v/length);
      });
      const edgeNormals=normals(1),midNormals=normals(.5);
      for(let i=0;i<base.length;i++){
        const j=(i+1)%base.length;
        b.face([peak,middle[i],middle[j]],unit,0xe0e5db,[unit,midNormals[i],midNormals[j]]);
        b.face([middle[i],inner[i],inner[j],middle[j]],unit,0xe0e5db,[midNormals[i],edgeNormals[i],edgeNormals[j],midNormals[j]]);
      }
      for(let i=0;i<base.length;i++){const j=(i+1)%base.length;b.face([base[i],base[j],inner[j],inner[i]],unit,0xb7c5ba);}
      // One cooling cassette per upper face: visible dark cavity, machined flange and tilted fins.
      // This is physical surface structure above the crown, not another albedo noise layer.
      if(corner===0){
        const tangent=sub(base[1],base[0]),tl=Math.hypot(...tangent),u=tangent.map(v=>v/tl),v=cross(unit,u);
        const point=(x,y,h)=>center.map((c,k)=>c+u[k]*x+v[k]*y+unit[k]*h);
        const ring=(x,y,h)=>[[-x,-y],[x,-y],[x,y],[-x,y]].map(([a,d])=>point(a,d,h));
        const outer=ring(.115,.057,.041),inner=ring(.096,.041,.041),floor=ring(.096,.041,.026);
        f.face(floor,unit,0x27382f);
        for(let i=0;i<4;i++){
          const j=(i+1)%4;
          b.face([outer[i],outer[j],inner[j],inner[i]],unit,0x9bada3);
          f.face([inner[i],inner[j],floor[j],floor[i]],unit,0x839c8d);
        }
        // Four separate canted plates expose a dark gap beneath their free edges.
        for(let index=0;index<4;index++){
          const x=-.072+index*.048;
          b.face([point(x-.014,-.034,.030),point(x+.014,-.034,.040),point(x+.014,.034,.040),point(x-.014,.034,.030)],unit,0x9fb2a7);
        }
      }

    }
  }
  for(const angle of [0,Math.PI]){
    // Paired closed beams physically enter the prism's equatorial structure.
    panel(f,[[.46,-.065],[.72,-.065],[.98,-.18],[1.10,-.14],[1.10,.085],[.98,.13],[.72,.065],[.46,.065]],-.34,-.20,.025,angle,0x9caea7);
    // Inclined hollow receiver pods sink into the support beams; rolled lips protect recessed optics.
    const axis=[-.57,.821644692,0],u=[0,0,1],v=[.821644692,.57,0],center=[.96,-.10,-.025];
    const point=(a,c,d)=>rotate(center.map((x,k)=>x+u[k]*a+v[k]*c+axis[k]*d),angle);
    const ring=(d,rx,ry)=>[[rx*.72,ry],[-rx*.72,ry],[-rx,ry*.65],[-rx,-ry*.65],[-rx*.72,-ry],[rx*.72,-ry],[rx,-ry*.65],[rx,ry*.65]].map(([a,c])=>point(a,c,d));
    const levels=[ring(-.18,.125,.105),ring(-.09,.17,.14),ring(.035,.17,.14),ring(.085,.14,.115)];
    const forward=rotate(axis,angle),back=forward.map(x=>-x);
    f.face(levels[0],back,0x9caea7);
    for(let k=0;k<levels.length-1;k++)for(let i=0;i<8;i++){
      const j=(i+1)%8,mid=levels[k][i].map((x,a)=>(x+levels[k][j][a])/2),hint=sub(mid,rotate(center,angle));
      f.face([levels[k][i],levels[k][j],levels[k+1][j],levels[k+1][i]],hint,0xb0beb5);
    }
    const mouth=ring(.085,.123,.098),well=ring(.005,.123,.098);
    for(let i=0;i<8;i++){
      const j=(i+1)%8;
      b.face([levels[3][i],levels[3][j],mouth[j],mouth[i]],forward,0xa5b7ad);
      f.face([mouth[i],mouth[j],well[j],well[i]],sub(rotate(center,angle),mouth[i]),0x718c7d);
    }
    f.face(well,forward,0x233c39);
    // A shaded, non-emissive recessed optic protected behind the chamfered lip.
    // Three protected optical cells give each compact receiver a readable instrument face.
    for(const x of [-.062,0,.062]){
      const corners=[[-.025,-.055],[.025,-.055],[.025,.055],[-.025,.055]].map(([a,c])=>point(a+x,c,.018));
      const peak=point(x,0,.025);
      for(let i=0;i<4;i++)b.face([peak,corners[i],corners[(i+1)%4]],forward,i<2?0xa9b7bd:0x738f99);
    }
    // Small segmented plate at the root reveals the load path without creating another broad vane.
    panel(b,[[.60,-.095],[.82,-.08],[.88,-.025],[.82,.08],[.60,.095]],-.19,-.105,.014,angle,0xc8d3c9);
  }
  // Narrow scanner bearing, seated in the structural chassis. Original pivot remains at world y=4.
  annularHousing(f,.20,.055,-.03,.34,12,.125);
  const arm=writer(THREE,'surveyor-prism-scanner');
  // Closed telescopic instrument mast, with a compact shrouded distal head.
  // Visual optical endpoint shortened to 6.65 world units; original scan transforms/cadence remain unchanged.
  const rect=(z,rx,ry,cx=0)=>[[rx*.72,ry],[-rx*.72,ry],[-rx,ry*.65],[-rx,-ry*.65],[-rx*.72,-ry],[rx*.72,-ry],[rx,-ry*.65],[rx,ry*.65]].map(([x,y])=>[x+cx,y,z]);
  const sections=[rect(.02,.14,.085),rect(-.14,.14,.085),rect(-.24,.085,.050),rect(-.43,.072,.043),rect(-.48,.060,.037),rect(-.52,.052,.033),rect(-.57,.16,.105,.055),rect(-.70,.16,.105,.055),rect(-.80,.15,.095,.055)];
  arm.face(sections[0],[0,0,1],0x879f92);
  for(let k=0;k<sections.length-1;k++)for(let i=0;i<8;i++){
    const j=(i+1)%8,a=sections[k],b=sections[k+1],hint=[a[i][0]+a[j][0],a[i][1]+a[j][1],0];
    arm.face([a[i],a[j],b[j],b[i]],hint,k===3||k===5?0x657f72:0xb0beb5);
  }
  const mouth=rect(-.80,.091,.067),bottom=rect(-.65,.091,.067);
  for(let i=0;i<8;i++){
    const j=(i+1)%8;
    arm.face([sections.at(-1)[i],sections.at(-1)[j],mouth[j],mouth[i]],[0,0,-1],0xc1ccc3);
    arm.face([mouth[i],mouth[j],bottom[j],bottom[i]],[-mouth[i][0],-mouth[i][1],0],0x3e574b);
  }
  arm.face(bottom,[0,0,-1],0x203c33);
  // Two narrow service collars explain the nested mast without bare fork rails.
  for(const z of [-.28,-.49]){
    const rx=z<-.4?.067:.091,ry=z<-.4?.044:.058,a=rect(z,rx,ry),b=rect(z-.035,rx,ry);
    const ai=rect(z,rx-.008,ry-.008),bi=rect(z-.035,rx-.008,ry-.008);
    for(let i=0;i<8;i++){const j=(i+1)%8;
      arm.face([a[i],a[j],b[j],b[i]],[a[i][0],a[i][1],0],0x7f988b);
      arm.face([a[i],a[j],ai[j],ai[i]],[0,0,1],0xa4b7aa);
      arm.face([b[i],b[j],bi[j],bi[i]],[0,0,-1],0x657e71);
    }
  }
  // Offset passive reference aperture makes this a dual-channel instrument head, not a gun muzzle.
  const port=(r,z)=>Array.from({length:8},(_,i)=>{const a=(i+.5)*Math.PI/4;return[.134+Math.cos(a)*r,Math.sin(a)*r,z];});
  const lip=port(.031,-.806),lens=port(.022,-.810);
  for(let i=0;i<8;i++){const j=(i+1)%8;arm.face([lip[i],lip[j],lens[j],lens[i]],[0,0,-1],0x506e65);}
  arm.face(lens,[0,0,-1],0x83a09a);
  // Bevelled side pivot caps make the actuator/socket connection legible without emissive rings.
  for(const side of [-1,1]){
    const ring=(x,r)=>Array.from({length:8},(_,i)=>{const a=(i+.5)*Math.PI/4;return[x,Math.sin(a)*r,-.03+Math.cos(a)*r];});
    const back=ring(side*.127,.067),rim=ring(side*.155,.067),cap=ring(side*.163,.054);
    arm.face(cap,[side,0,0],0xaabcb0);
    for(let i=0;i<8;i++){const j=(i+1)%8;const hint=[0,rim[i][1],rim[i][2]+.03];
      arm.face([back[i],back[j],rim[j],rim[i]],hint,0x718b7d);
      arm.face([rim[i],rim[j],cap[j],cap[i]],[side,0,0],0x94aa9c);
    }
  }
  const panels=b.pack(),frame=f.pack(),scanner=arm.pack();
  // Constant neutral albedo sample keeps the chassis dark under the shared cladding material.
  // Calibration belongs to the shipped 256px surface; regenerate together if the map changes.
  const sample=new THREE.Color().setRGB(158/255,156/255,154/255,THREE.SRGBColorSpace);
  const tint=new THREE.Color(0x34453e),channels=['r','g','b'];
  frame.packed[2]=frame.packed[2].map((v,i)=>v*tint[channels[i%3]]/sample[channels[i%3]]);
  frame.uv=frame.uv.map((_,i)=>i%2?.349609375:.873046875);
  const offset=panels.packed[0].length/3;
  const body=finish(THREE,'surveyor-prism-body',{
    packed:panels.packed.map((a,i)=>a.concat(frame.packed[i])),uv:panels.uv.concat(frame.uv),
    indices:panels.indices.concat(frame.indices.map(i=>i+offset)),
  });
  const armGeometry=finish(THREE,'surveyor-prism-scanner',scanner);
  // buildToolArm scales by length/1.6. Preserve reviewed dimensions and UVs at the shorter endpoint.
  armGeometry.scale(14/6.65,14/6.65,14/6.65);
  const result=Object.freeze({body,arm:armGeometry,tip:createSurveyorTipGeometry(THREE)});
  cache.set(THREE,result);return result;
}
const add = (a,b) => a.map((v,i)=>v+b[i]);
const mul = (a,s) => a.map(v=>v*s);
const unit = a => mul(a,1/Math.hypot(...a));
const mix = (a,b,t) => add(mul(a,1-t),mul(b,t));
const mean = pts => mul(pts.reduce(add,[0,0,0]),1/pts.length);

function drawPrismCore(frame) {
  const w={face(points,hint,inset=false){
    let pts=points;
    if(dot(unit(cross(sub(pts[1],pts[0]),sub(pts[2],pts[0]))),hint)<0)pts=[...pts].reverse();
    for(let i=1;i<pts.length-1;i++){
      const tri=[pts[0],pts[i],pts[i+1]],normal=unit(cross(sub(tri[1],tri[0]),sub(tri[2],tri[0]))).map(Math.fround);
      const tint=normal[1]>=0?(inset?0x81958b:0xb7c5ba):(inset?0x839b92:0xaebfb2);
      const transformed=tri.map(p=>[Math.fround(p[0])*.85,Math.fround(p[1])*.6-.40,Math.fround(p[2])*.85]);
      frame.face(transformed,[normal[0]/.85,normal[1]/.6,normal[2]/.85],tint);
    }
  }};
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
    w.face(inner,normal,true);
    for(let i=0;i<pts.length;i++) { const j=(i+1)%pts.length; w.face([pts[i],pts[j],inner[j],inner[i]],normal); }
  }

}


function finish(THREE,name,{packed,uv,indices}) {
  const g=new THREE.BufferGeometry();
  ['position','normal','color'].forEach((name,k)=>g.setAttribute(name,new THREE.Float32BufferAttribute(packed[k],3)));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);
  g.name=name;g.userData.spacefaceSharedAsset=true;g.computeBoundingBox();g.computeBoundingSphere();return g;
}
function tipWriter(THREE, name, uvDensity=0.5) {
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

function ring(z,rx,ry=rx) {
  return Array.from({length:8},(_,i)=>{const a=(i+0.5)*Math.PI/4;return [Math.cos(a)*rx,Math.sin(a)*ry,z];});
}
function skin(w,a,b,inward=false) {
  for(let i=0;i<8;i++) { const j=(i+1)%8; const hint=mul([a[i][0]+a[j][0],a[i][1]+a[j][1],0],inward?-1:1); w.face([a[i],a[j],b[j],b[i]],hint); }
}
function annulus(w,a,b,normal) { for(let i=0;i<8;i++){const j=(i+1)%8;w.face([a[i],a[j],b[j],b[i]],normal);} }

function createSurveyorTipGeometry(THREE) {
  const w=tipWriter(THREE,'surveyor-prism-optic',4);
  // Hollow optical rim, not a filled luminous disc. Existing glow stays animated.
  const back=ring(0.015,0.145,0.115), shoulder=ring(-0.055,0.16,0.13), front=ring(-0.105,0.145,0.115);
  const innerFront=ring(-0.105,0.1,0.07),innerBack=ring(0.015,0.1,0.07);
  skin(w,back,shoulder);skin(w,shoulder,front);
  annulus(w,front,innerFront,[0,0,-1]);skin(w,innerFront,innerBack,true);
  annulus(w,innerBack,back,[0,0,1]);
  return w.finish();
}

