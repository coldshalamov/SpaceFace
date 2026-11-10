/**
 * SPACEFACE / CONTINUUM — an inhabited current, never a sequence of cards.
 *
 * Drop-in source for loadingTerminalArt's two existing feedback renderers.
 * Factory is serialized VERBATIM into a Worker: no imports, DOM requirement,
 * assets, timers, randomness, or game-state access. All authoring is local.
 *
 * Five independently travelling sculptures share one light/material language.
 * The camera, solid surfaces, mechanisms, ink contours, phase echoes and fluid
 * all move on distinct continuous clocks. Legacy `act` is accepted but cannot
 * select a scene or reset motion. `reduced` is the deliberate still exception.
 *
 * Projection is a bounded CPU 3-D illustration renderer, not a physics scene.
 * Persistent typed storage + cached materials + a 30 Hz source-upload budget;
 * the existing GPU compositor interpolates the impression through advection.
 */
export function createSignalTableaux(host) {
  'use strict';
  host = host || {};
  const TAU = Math.PI * 2;
  const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
  const mix = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => { const t = clamp((x-a)/(b-a),0,1); return t*t*(3-2*t); };
  const hash = x => { const y = Math.sin(x*127.1+311.7)*43758.5453123; return y-Math.floor(y); };
  // Every long-clock frequency is quantized onto one common frame grid (qf),
  // so the whole composition returns to its exact opening pose at LOOP_S and
  // the host can wrap the source clock invisibly. `quick` mode (loading lasts
  // seconds, not minutes) traverses the same field ~2.5x faster.
  const LOOP_S=480,QW=TAU/LOOP_S,QK=2.55;
  const qf=f=>Math.round(f*(host&&host.quick?QK:1)/QW)*QW;
  const qt=(t,f)=>t*qf(f);
  const ids = ['witness','courier','anchorage','massline','singularity'];
  const names = ['THE WITNESS','DEAD RECKONING','THE ANCHORAGE','BORROWED MOMENTUM','EVENT HORIZON'];
  // Obsidian / graphite / worn titanium / copper / cold glass. One palette,
  // never a per-act rainbow. Lighting shades are compiled once into 48 bins.
  const materialRGB = [[27,40,43],[56,75,76],[133,161,155],[167,118,79],[97,165,164],[6,12,15],[0,0,0],[96,87,79]];
  const shades = materialRGB.map((rgb,m) => Array.from({length:48},(_,i) => {
    // Steeper than a linear ramp so shadowed facets stay dark and lit metal separates.
    const q = i/47, k = m===6 ? 0 : .20+Math.pow(q,.85)*1.35;
    return `rgb(${Math.round(clamp(rgb[0]*k,0,255))},${Math.round(clamp(rgb[1]*k,0,255))},${Math.round(clamp(rgb[2]*k,0,255))})`;
  }));
  const tracks=[];
  let object=0,group=0,totalPoints=0;
  // Authoring helpers are SETUP ONLY. Units are illustration units in a 1280
  // wide world; meshes keep actual depth, normals and local articulated groups.
  function primitive(points,opt={}) {
    const p={object,group,material:1,face:false,closed:false,width:.7,alpha:1,
      emission:false,doubleSided:true,motion:0,priority:0,...opt};
    p.points=new Float32Array(points);p.count=p.points.length/3;p.offset=totalPoints*2;
    p.seed=hash(tracks.length+object*71);p.layer=object===5?0:object===4?1:2;
    p.normal=new Float32Array(3);p.center=new Float32Array(3);
    for(let i=0;i<p.points.length;i+=3){p.center[0]+=p.points[i]/p.count;p.center[1]+=p.points[i+1]/p.count;p.center[2]+=p.points[i+2]/p.count;}
    if(p.face&&p.count>=3){const a=p.points,bx=a[3]-a[0],by=a[4]-a[1],bz=a[5]-a[2],cx=a[6]-a[0],cy=a[7]-a[1],cz=a[8]-a[2];
      const nx=by*cz-bz*cy,ny=bz*cx-bx*cz,nz=bx*cy-by*cx,n=Math.hypot(nx,ny,nz)||1;
      p.normal[0]=nx/n;p.normal[1]=ny/n;p.normal[2]=nz/n;}
    tracks.push(p);totalPoints+=p.count;return p;
  }
  function line(a,opt={}) { return primitive(a,opt); }
  function face(a,opt={}) {return primitive(a,{face:true,closed:true,width:.28,material:1,...opt});}
  function edge(a,b,opt={}) { return line([...a,...b],opt); }
  function ring(cx,cy,cz,rx,ry,opt={},a0=0,a1=TAU,n=64){const p=[];for(let i=0;i<=n;i++){const a=mix(a0,a1,i/n);p.push(cx+Math.cos(a)*rx,cy+Math.sin(a)*ry,cz);}return primitive(p,{closed:a1-a0>=TAU-.001,...opt});}
  function box(x,y,z,w,h,d,opt={}) {
    const v=[[x,y,z],[x+w,y,z],[x+w,y+h,z],[x,y+h,z],[x,y,z+d],[x+w,y,z+d],[x+w,y+h,z+d],[x,y+h,z+d]];
    for(const indices of [[4,5,6,7],[1,0,3,2],[0,4,7,3],[5,1,2,6],[3,7,6,2],[0,1,5,4]])face(indices.flatMap(i=>v[i]),{doubleSided:false,...opt});
  }
  function bevelHull(profile,z0,z1,opt={}) {
    const upper=profile.map(([x,y])=>[x*.96,y*.81,z1]);
    face(upper.flat(),{material:1,doubleSided:true,...opt});
    face(profile.map(([x,y])=>[x,y,z0]).reverse().flat(),{material:0,doubleSided:true,...opt});
    for(let i=0;i<profile.length;i++){const j=(i+1)%profile.length;face([...upper[i],...upper[j],profile[j][0],profile[j][1],z0,profile[i][0],profile[i][1],z0],{material:i%3===0?2:0,...opt});}
  }
  function ship(scale=1,ox=0,oy=0,oz=0,opt={}) {
    const start=tracks.length;
    // Long, faceted recon hull. No cockpit bubble, rocket fins or toy outline.
    bevelHull([[-174,-37],[-110,-55],[-12,-43],[80,-29],[238,-4],[140,20],[22,39],[-121,41],[-183,14]],-14,23,opt);
    bevelHull([[-158,-72],[-40,-69],[32,-54],[-42,-51],[-156,-48]],-4,15,{...opt,material:0});
    bevelHull([[-136,50],[-5,47],[56,67],[-75,74],[-155,63]],-8,7,{...opt,material:0});
    // Recessed obsidian navigation slit / raised structural keel.
    face([-86,-13,24,32,-16,24,143,-4,24,34,4,24,-98,5,24],{...opt,material:5,width:.55});
    face([-72,-11,24.6,42,-11,24.6,99,-5,24.6,17,-2,24.6,-80,-3,24.6],{...opt,material:5,width:0});
    edge([-63,-13,25],[79,-6,25],{...opt,material:4,emission:true,width:1.2,alpha:.74});
    bevelHull([[-164,-22],[-58,-20],[64,-2],[-82,13],[-162,8]],25,31,{...opt,material:0});
    for(let k=0;k<15;k++){
      const x=-146+k*10.4;
      face([x,-46,17,x+5,-45,17,x+5,-27,24,x,-28,24],{...opt,material:k%5===0?3:0,width:.24});
      edge([x,19,21],[x+17,34,19],{...opt,material:2,alpha:.28,width:.5});
    }
    for(let k=0;k<9;k++){
      box(-146+k*12,53,-1,6,12,3,{...opt,material:k%4===0?3:0,width:.22});
      edge([-133+k*14,-60,16],[-128+k*14,-52,17],{...opt,material:2,width:.52,alpha:.43});
    }
    for(const y of [-27,25]){
      box(-198,y-8,-10,29,16,22,{...opt,material:0});
      face([-199,y-6,-7,-199,y+6,-7,-199,y+6,8,-199,y-6,8],{...opt,material:4,emission:true,width:.5});
      for(let k=0;k<3;k++)edge([-167,y-6+k*5,13],[-130,y-5+k*4,20],{...opt,material:3,width:.55,alpha:.6});
    }
    edge([85,-26,22],[225,-4,1],{...opt,material:2,width:1.1,alpha:.8});
    edge([21,36,15],[155,15,1],{...opt,material:4,width:.7,alpha:.45});
    for(let k=0;k<3;k++)edge([-38+k*6,34,19],[-34+k*6,28,21],{...opt,material:3,emission:true,width:1.4});
    // Recessed service panels, titanium scribe lines and heat-tile combs.
    // Coplanar highlights are assigned small positive depth; the former
    // implementation buried several of these beneath its own main hull.
    for(let k=0;k<12;k++){
      const x=-144+k*16;
      face([x,-37,25.2,x+10,-35,25.2,x+17,-24,25.2,x+3,-25,25.2],{...opt,material:k%5===0?7:0,width:.3});
      edge([x+2,-34,25.7],[x+8,-33,25.7],{...opt,material:2,width:.7,alpha:.51});
      edge([x+1,20,25],[x+14,17,25],{...opt,material:2,width:.55,alpha:.58});
      if(k<7)edge([-136+k*12,1,32],[-131+k*12,-13,32],{...opt,material:2,width:.65,alpha:.52});
    }
    for(let k=0;k<4;k++)edge([-130,-4+k*2,33],[26,-2+k*.8,33],{...opt,material:k===0?3:1,width:.5,alpha:.68});
    for(let k=0;k<6;k++)face([-43+k*12,27,24,-34+k*12,25,24,-27+k*12,32,22,-39+k*12,35,22],{...opt,material:0,width:.5});
    // Transform authored geometry once for the small tethered craft.
    if(scale!==1||ox||oy||oz)for(let k=start;k<tracks.length;k++){
      const p=tracks[k];for(let i=0;i<p.points.length;i+=3){p.points[i]=p.points[i]*scale+ox;p.points[i+1]=p.points[i+1]*scale+oy;p.points[i+2]=p.points[i+2]*scale+oz;}
      p.center[0]=p.center[0]*scale+ox;p.center[1]=p.center[1]*scale+oy;p.center[2]=p.center[2]*scale+oz;p.width*=Math.sqrt(scale);
    }
  }
  // 01 / THE WITNESS. A pressure shell as a dark sculptural presence, not a
  // children's-book astronaut. Facets and an unoccupied visor carry the face.
  object=0;group=0;
  const shellPoint=(u,v)=>{
    const sv=Math.sin(v),lower=smooth(0,.85,Math.cos(v));
    return [Math.cos(u)*sv*(88-20*lower)+7*Math.sin(v*2),Math.cos(v)*132,Math.sin(u)*sv*(81-13*lower)];
  };
  for(let j=0;j<14;j++)for(let k=0;k<32;k++){
    const a=k*TAU/32,b=(k+1)*TAU/32,v=.02+j*(Math.PI-.04)/14,w=.02+(j+1)*(Math.PI-.04)/14;
    const pts=[shellPoint(a,v),shellPoint(b,v),shellPoint(b,w),shellPoint(a,w)];
    const cy=pts.reduce((n,p)=>n+p[1],0)/4,cz=pts.reduce((n,p)=>n+p[2],0)/4;
    const visor=cy>-76&&cy<18&&cz>28;
    face(pts.flat(),{material:visor?5:(k%7===0?0:1),width:visor?0:.15,doubleSided:false,group:visor?1:0});
  }
  for(let j=0;j<5;j++){
    const pts=[];for(let k=0;k<=70;k++){const a=.28+k/70*(Math.PI-.56);pts.push(83*Math.cos(a),-79+j*2.2+5*Math.sin(a),74*Math.sin(a));}
    line(pts,{material:j===0?2:0,width:j===0?1.1:.75,alpha:.8});
  }
  for(let side=-1;side<=1;side+=2){
    box(side<0?-97:77,-64,-16,20,73,37,{material:0,width:.3});
    for(let k=0;k<11;k++)edge([side*95,-54+k*5,23],[side*85,-52+k*5,28],{material:k===2?3:2,width:.6,alpha:.55});
    edge([side*69,30,54],[side*38,97,47],{material:2,width:.9,alpha:.76});
    edge([side*64,33,59],[side*29,105,40],{material:0,width:2});
  }
  for(let k=0;k<7;k++)ring(0,116+k*2,0,42-k*1.8,9,{material:k===1?3:1,group:2,width:.7},0,TAU,40);
  // The visor highlight physically scans across the curved surface.
  for(let k=0;k<4;k++){const p=[];for(let j=0;j<=40;j++){const u=j/40;p.push(-62+u*125,-28+k*2,58+22*Math.sin(u*Math.PI));}line(p,{group:1,motion:1,material:k===0?4:1,width:k===0?1:.45,alpha:k===0?.86:.6});}
  // 02 / COURIER. Projected surfaces bank in three dimensions; the nozzle
  // filaments deform from the same attachment coordinates as the ship.
  object=1;group=0;ship();
  for(let side=0;side<2;side++)for(let k=0;k<5;k++){
    const p=[];for(let j=0;j<=64;j++){const q=j/64;p.push(-199-q*(340+k*18),side?25:-27,-1+k*.75);}
    line(p,{group:0,motion:2,material:k===0?3:k%2?4:2,width:k===0?1.2:.55,alpha:.35/(1+k*.28),emission:true});
  }
  // 03 / ANCHORAGE. Solid toroidal habitat, counter-rotating service spine,
  // broken copper seam, asymmetric antennae. No wireframe bicycle wheel.
  object=2;group=1;
  for(let k=0;k<72;k++)for(let j=0;j<6;j++){
    const p=[];for(const [u,v] of [[k,j],[k+1,j],[k+1,j+1],[k,j+1]]){
      const a=u*TAU/72,b=v*TAU/6,r=181+24*Math.cos(b);p.push(Math.cos(a)*r,Math.sin(a)*r,24*Math.sin(b));
    }
    face(p,{material:j===1?1:k%9===0?7:0,width:.32,doubleSided:false});
  }
  for(let k=0;k<72;k++){
    const a=k*TAU/72;
    const p=[];for(let j=0;j<5;j++){const ang=a+j*.008;p.push(207*Math.cos(ang),207*Math.sin(ang),1);}
    line(p,{material:k%6===0?3:2,width:k%6===0?2:1.1,alpha:k%6===0?.94:.46,emission:k%6===0});
    if(k%3===0)edge([156*Math.cos(a),156*Math.sin(a),3],[177*Math.cos(a),177*Math.sin(a),24],{material:2,width:.65,alpha:.68});
  }
  for(let k=0;k<72;k++){
    const a=k*TAU/72+.012;
    for(let band=0;band<2;band++){
      const rr=band?189:171,p=[];
      for(let j=0;j<=6;j++){const u=a+j*.009;p.push(rr*Math.cos(u),rr*Math.sin(u),24.8);}
      line(p,{material:k%12===0?3:2,width:band?.65:.45,alpha:band?.49:.36});
    }
    if(k%2===0){const r=178,p=[];for(const [da,dr] of [[0,0],[.023,0],[.023,8],[0,8]])p.push((r+dr)*Math.cos(a+da),(r+dr)*Math.sin(a+da),25.2);
      face(p,{material:k%10===0?7:0,width:.5});}
  }
  group=0;
  for(let k=0;k<3;k++){
    const a=.23+k*TAU/3,c=Math.cos(a),s=Math.sin(a),p=[];
    for(const [r,o,z] of [[31,-5,-7],[158,-5,-7],[158,5,-7],[31,5,-7],[31,-5,8],[158,-5,8],[158,5,8],[31,5,8]])p.push([r*c-o*s,r*s+o*c,z]);
    for(const idx of [[4,5,6,7],[0,4,7,3],[5,1,2,6]])face(idx.flatMap(i=>p[i]),{material:1,width:.35});
    for(let n=0;n<8;n++)edge([(42+n*13)*c-5*s,(42+n*13)*s+5*c,8],[(53+n*13)*c+5*s,(53+n*13)*s-5*c,8],{material:2,width:.5,alpha:.45});
  }
  box(-13,-263,-10,26,535,31,{material:0,width:.6});
  box(-27,-60,5,54,108,26,{material:1,width:.4});
  for(let k=0;k<20;k++){
    const y=-246+k*25;
    box(-19,y,-4,38,8,20,{material:k%5===0?7:1,width:.3});
    if(k%3===0)box(k%2?20:-65,y,0,45,17,3,{material:0,width:.35});
  }
  for(let side=-1;side<=1;side+=2){
    edge([side*18,-183,10],[side*77,-231,10],{material:2,width:1.1});
    edge([side*77,-231,10],[side*77,-290,10],{material:2,width:.7});
    for(let k=0;k<7;k++)edge([side*(60+k*4),-239,10],[side*(60+k*4),-265,10],{material:1,width:.5});
  }
  for(let k=0;k<25;k++){
    const y=-244+k*20;
    edge([-7,y,23],[8,y+1,23],{material:2,width:.6,alpha:.66});
    edge([-9,y+4,23],[-3,y+4,23],{material:k%6===0?3:1,width:1.1,alpha:.7});
  }
  ring(0,0,39,29,29,{material:4,width:1.2,group:2},0,TAU,48);
  ring(0,0,43,18,18,{material:3,width:2,group:2},.2,4.3,40);
  // 04 / BORROWED MOMENTUM. Faceted iron, an orbiting craft and a single
  // endpoint-constrained filament. Rock rotation is independent of the orbit.
  object=3;group=1;
  function rock(r,seed,ox=0,oy=0,oz=0){
    const rows=r<30?4:9,cols=r<30?7:15,pts=[];
    for(let j=0;j<=rows;j++)for(let k=0;k<=cols;k++){
      const a=(k%cols)*TAU/cols,v=j*Math.PI/rows,q=r*(.78+hash(seed+j*3.4+(k%cols)*7.7)*.24);
      pts.push([ox+q*Math.sin(v)*Math.cos(a),oy+q*Math.cos(v)*.83,oz+q*Math.sin(v)*Math.sin(a)*.73]);
    }
    for(let j=0;j<rows;j++)for(let k=0;k<cols;k++){
      const a=j*(cols+1)+k,b=a+1,c=a+cols+2,d=a+cols+1;
      face([...pts[a],...pts[b],...pts[c]],{material:hash(a+seed)>.8?3:7,width:.22,doubleSided:false});
      face([...pts[a],...pts[c],...pts[d]],{material:hash(a+seed+1)>.72?0:7,width:.22,doubleSided:false});
    }
  }
  rock(100,32);group=2;ship(.29);
  group=3;const tether=[];for(let k=0;k<=70;k++)tether.push(k/70,0,0);
  line(tether,{motion:3,material:3,width:1.05,emission:true,alpha:.85});
  for(let k=0;k<3;k++)line(tether,{motion:3,material:4,width:.45,alpha:.14,priority:k*.01});
  group=4;rock(20,192,113,-148,-40);rock(12,16,-145,63,8);
  // 05 / HORIZON. Asymmetric accretion, a lensed far hemisphere and a true
  // absorbing core. Animated strata, not a static ring over a moving texture.
  object=4;group=0;
  for(let k=0;k<31;k++){
    const r=91+k*4.35,p=[];
    for(let j=0;j<=128;j++){const a=j*TAU/128,s=Math.sin(a);const lens=s<0?Math.pow(-s,2)*Math.max(0,133-r*.22):0;
      p.push(Math.cos(a)*r,s*r*.29-lens,0);}
    line(p,{material:k<7?2:k%4===0?3:7,width:k<4?1.85:.65,alpha:(1-k/40)*.94,motion:4,emission:true,priority:-20});
  }
  for(let k=0;k<22;k++){
    const p=[];for(let j=0;j<=36;j++)p.push(j/36,k/22,0);
    line(p,{material:k%3?3:2,width:k%4===0?1.35:.6,alpha:.59,motion:5,emission:true,priority:-19});
  }
  // Filamentary gravitational shear outside the disk, deliberately incomplete.
  for(let k=0;k<10;k++)ring(0,0,0,228+k*19,147+k*13,{material:4,width:.5,alpha:.065+k*.006,motion:6,priority:-30},.1+k*.21,2.45+k*.3,84);
  ring(0,0,0,72,72,{material:6,face:true,width:0,priority:80},0,TAU,112);
  ring(0,0,0,74.5,74.5,{material:2,width:1.7,alpha:.94,emission:true,priority:82},.1,TAU-.1,112);
  ring(0,0,0,77,77,{material:3,width:.6,alpha:.49,priority:83},.5,4.4,78);
  // Shared substrate: stratified current with moving highlights, not an
  // elementary-school star map. Wide arcs enter from beyond the viewport.
  object=5;group=0;
  for(let k=0;k<58;k++){
    const p=[];for(let j=0;j<=72;j++)p.push(-1060+j/72*2120,(k-28)*18,0);
    line(p,{material:k%11===0?3:k%4===0?4:1,width:k%11===0?1.15:.6,alpha:k%11===0?.22:.11,motion:7,priority:-900});
  }
  for(let k=0;k<12;k++)ring(-620,60,0,230+k*13,250+k*12,{material:k%4===0?3:2,width:.6,alpha:.11,motion:8,priority:900},-.9,1.16,65);

  // Compiled buffers. Sampling/painting does not build a new scene graph.
  const positions=new Float32Array(totalPoints*2),alphas=new Float32Array(tracks.length),widths=new Float32Array(tracks.length);
  const tones=new Uint8Array(tracks.length),lights=new Uint8Array(tracks.length),depths=new Float32Array(tracks.length);
  const order=new Uint32Array(tracks.length),matrices=new Float64Array(6*5*12),objectMatrices=new Float64Array(6*12);
  const bodyState=Array.from({length:6},(_,i)=>({id:ids[i]||'current',x:0,y:0,depth:0,scale:1,alpha:1,rotation:0}));
  const frameState={time:0,act:0,next:0,u:0,morph:0,reduced:false,positions,alphas,widths,tones,lights,tracks,bodies:bodyState,order,strokeCount:tracks.length};
  const local=new Float64Array(3),temp=new Float64Array(12),cable=new Float64Array(6);
  let lastTime=-1,lastReduced=null,revision=0,lastRevision=-1,aspect=16/9,lastAspect=-1,disposed=false;
  const flow={scale:.9,dx:.037,dy:.021,amp:.004,swirl:.0014,gx:0,gy:0};
  function matrix(dst,off,rx,ry,rz,scale,tx,ty,tz){
    const a=Math.cos(rx),b=Math.sin(rx),c=Math.cos(ry),d=Math.sin(ry),e=Math.cos(rz),f=Math.sin(rz);
    // Rz * Ry * Rx, row major.
    dst[off]=(e*c)*scale;dst[off+1]=(e*d*b-f*a)*scale;dst[off+2]=(e*d*a+f*b)*scale;dst[off+3]=tx;
    dst[off+4]=(f*c)*scale;dst[off+5]=(f*d*b+e*a)*scale;dst[off+6]=(f*d*a-e*b)*scale;dst[off+7]=ty;
    dst[off+8]=-d*scale;dst[off+9]=c*b*scale;dst[off+10]=c*a*scale;dst[off+11]=tz;
  }
  function combine(o,g,rx=0,ry=0,rz=0,s=1,x=0,y=0,z=0){
    matrix(temp,0,rx,ry,rz,s,x,y,z);const a=o*12,b=(o*5+g)*12;
    for(let r=0;r<3;r++){const q=a+r*4;for(let c=0;c<3;c++)matrices[b+r*4+c]=objectMatrices[q]*temp[c]+objectMatrices[q+1]*temp[4+c]+objectMatrices[q+2]*temp[8+c];
      matrices[b+r*4+3]=objectMatrices[q]*x+objectMatrices[q+1]*y+objectMatrices[q+2]*z+objectMatrices[q+3];}
  }
  function transform(o,g,x,y,z,out=local){const i=(o*5+g)*12;out[0]=x*matrices[i]+y*matrices[i+1]+z*matrices[i+2]+matrices[i+3];out[1]=x*matrices[i+4]+y*matrices[i+5]+z*matrices[i+6]+matrices[i+7];out[2]=x*matrices[i+8]+y*matrices[i+9]+z*matrices[i+10]+matrices[i+11];return out;}
  function prepare(t,reduced){
    // Independent, non-commensurate orbital clocks. No act index, hold window,
    // screen-centered layout, hidden time modulo, or finite geometry loop.
    const portrait=clamp((16/9-aspect)/1.1,0,1),wx=1-.47*portrait,hy=1+.45*portrait;
    
    for(let o=0;o<5;o++){
      const b=bodyState[o];let x,y,d,rx,ry,rz,s;
      if(o===0){x=-190+510*Math.sin(qt(t,.043)-.62);y=35+215*Math.sin(qt(t,.073)+.45);d=.5+.47*Math.sin(qt(t,.043)+.1);rx=.13*Math.sin(qt(t,.11));ry=.48+.43*Math.sin(qt(t,.087));rz=-.17+.14*Math.sin(qt(t,.078));s=1.05;}
      else if(o===1){x=45+510*Math.sin(qt(t,.089)+.63);y=-25+218*Math.sin(qt(t,.113)-1.3);d=.5+.47*Math.cos(qt(t,.071)+.65);rx=.44+.19*Math.sin(qt(t,.14));ry=-.16+.27*Math.sin(qt(t,.099));rz=-.22+.36*Math.sin(qt(t,.097)+.7);s=.86;}
      else if(o===2){x=-145+354*Math.sin(qt(t,.061)-.55);y=-18+170*Math.sin(qt(t,.091)-.52);d=.5+.47*Math.cos(qt(t,.047)-.15);rx=.96+.27*Math.sin(qt(t,.058));ry=-.18+.24*Math.sin(qt(t,.079));rz=-.47+.11*Math.sin(qt(t,.074));s=.91;}
      else if(o===3){x=25+488*Math.sin(qt(t,.076)+4.75);y=25+227*Math.sin(qt(t,.062)+1.7);d=.5+.47*Math.sin(qt(t,.083)+3.7);rx=.12*Math.cos(qt(t,.053));ry=.14*Math.sin(qt(t,.07));rz=.17*Math.sin(qt(t,.085));s=.83;}
      else{x=120+440*Math.sin(qt(t,.053)+.53);y=60+154*Math.sin(qt(t,.079)+.63);d=.5+.47*Math.sin(qt(t,.057)+.6);rx=0;ry=0;rz=-.24+.21*Math.sin(qt(t,.06));s=1.12;}
      const scale=(.43+.74*d)*s;
      b.x=x*wx;b.y=y*hy;b.depth=d;b.scale=scale;b.alpha=.08+.89*smooth(.08,.91,d);b.rotation=rz;
      matrix(objectMatrices,o*12,rx,ry,rz,scale,b.x,b.y,0);
      for(let g=0;g<5;g++)combine(o,g);
    }
    // Internal motions remain live even when a body crosses a trajectory apex.
    combine(0,1,0,.03*Math.sin(qt(t,.37)),0,1,0,0,1.7*Math.sin(qt(t,.51)));
    combine(0,2,0,0,.12*Math.sin(qt(t,.29)),1,0,1.6*Math.sin(qt(t,.8)),0);
    combine(2,1,0,0,qt(t,.087));combine(2,2,0,0,-qt(t,.23));
    combine(3,1,qt(t,.12),qt(t,.17),-qt(t,.09));
    const a=qt(t,.27)+.8,shipX=238*Math.cos(a),shipY=174*Math.sin(a),heading=Math.atan2(174*Math.cos(a),-238*Math.sin(a));
    combine(3,2,.2,0,heading,1,shipX,shipY,10);
    combine(3,4,.1,qt(t,.13),qt(t,.04));
    transform(3,2,-18,0,0);cable[0]=local[0];cable[1]=local[1];cable[2]=local[2];
    transform(3,1,58,-19,40);cable[3]=local[0];cable[4]=local[1];cable[5]=local[2];
    bodyState[5].depth=-2;bodyState[5].alpha=1;bodyState[5].scale=1;
    matrix(objectMatrices,60,0,0,0,1,0,0,0);for(let g=0;g<5;g++)combine(5,g);
  }
  function deform(p,x,y,z,t){
    const q=p.count>1?(x+199)/-480:0;
    if(p.motion===1){y+=18*Math.sin(qt(t,.39))+3*Math.sin(x*.021-qt(t,.64));}
    else if(p.motion===2){const u=clamp(q,0,1.3);y+=u*(12*Math.sin(u*10-qt(t,1.4)+p.seed*2)+17*Math.sin(u*3-qt(t,.61)));z+=u*7*Math.sin(u*8-qt(t,1.1));}
    else if(p.motion===4){const r=Math.hypot(x,y),a=Math.atan2(y,x);y+=1.3*Math.sin(x*.04-qt(t,.94)+p.seed*3);x+=1.4*Math.sin(qt(t,.53)+a*3)*(r/220);}
    else if(p.motion===5){const a=x*1.3+y*TAU+qt(t,.22),r=95+112*(.5+.5*Math.sin(y*41+qt(t,.37))),sn=Math.sin(a);x=Math.cos(a)*r;y=sn*r*.29-(sn<0?Math.pow(-sn,2)*Math.max(0,133-r*.22):0);}
    else if(p.motion===6){const a=.075*Math.sin(qt(t,.24)+Math.hypot(x,y)*.007),c=Math.cos(a),s=Math.sin(a),ox=x;x=ox*c-y*s;y=ox*s+y*c;}
    else if(p.motion===7){
      const yy=y,x0=x,phase=qt(t,.091);
      y+=65*Math.sin(x*.003+phase)+38*Math.sin(x*.0057-qt(t,.127)+yy*.003);
      x+=34*Math.sin(yy*.007+qt(t,.0664));
      const cx=160*Math.sin(qt(t,.047))+60,cy=75*Math.sin(qt(t,.061)),dx=x-cx,dy=y-cy,r=Math.hypot(dx,dy);
      const a=.96*Math.exp(-r*r/260000)+.16*Math.sin(qt(t,.08)+yy*.002),c=Math.cos(a),s=Math.sin(a);
      x=cx+dx*c-dy*s;y=cy+dx*s+dy*c;
      // Laminar streams stay continuous; no particle respawn in the viewport.
      z=-200; y+=4*Math.sin(x0*.016-qt(t,.27)+yy*.03);
    }else if(p.motion===8){x+=78*Math.sin(qt(t,.07));y+=96*Math.cos(qt(t,.052));const a=.12*Math.sin(qt(t,.11)),c=Math.cos(a),s=Math.sin(a),ox=x;x=ox*c-y*s;y=ox*s+y*c;}
    local[0]=x;local[1]=y;local[2]=z;
  }
  const depthCompare=(a,b)=>depths[a]-depths[b]||a-b;
  function sample(time=0,_legacyAct=-1,reduced=false){
    const t=reduced?12:Number.isFinite(time)?clamp(time,0,1e9):0;
    if(t===lastTime&&reduced===lastReduced&&revision===lastRevision&&aspect===lastAspect)return frameState;
    lastTime=t;lastReduced=reduced;lastRevision=revision;lastAspect=aspect;
    frameState.time=t;frameState.reduced=reduced;frameState.act=0;frameState.morph=0;frameState.u=0;
    prepare(t,reduced);
    
    const lightX=-.36+.13*Math.sin(qt(t,.077)),lightY=-.48,lightZ=.79;
    for(let k=0;k<tracks.length;k++){
      const p=tracks[k],o=p.object,g=p.group,b=bodyState[o],m=(o*5+g)*12;
      let nx=p.normal[0]*matrices[m]+p.normal[1]*matrices[m+1]+p.normal[2]*matrices[m+2];
      let ny=p.normal[0]*matrices[m+4]+p.normal[1]*matrices[m+5]+p.normal[2]*matrices[m+6];
      let nz=p.normal[0]*matrices[m+8]+p.normal[1]*matrices[m+9]+p.normal[2]*matrices[m+10];
      const n=Math.hypot(nx,ny,nz)||1;nx/=n;ny/=n;nz/=n;
      // Smooth front/back visibility suppresses one-frame contour popping.
      let alpha=p.alpha*b.alpha*(p.face&&!p.doubleSided?smooth(-.08,.04,nz):1);
      const slowPhase=.91+.09*Math.sin(qt(t,.67)+p.seed*12);
      if(!p.face)alpha*=slowPhase;
      if(o===5&&p.motion===7)alpha*=.66+.34*Math.sin(qt(t,.16)+p.seed*16)**2;
      alphas[k]=p.material===6?1:clamp(alpha,0,1);widths[k]=p.width*Math.max(.7,Math.sqrt(b.scale));tones[k]=p.material;
      const diffuse=p.doubleSided?Math.abs(nx*lightX+ny*lightY+nz*lightZ):Math.max(0,nx*lightX+ny*lightY+nz*lightZ);
      // Soft-quantized light bands suggest ink/rotoscope without freezing pose.
      const raw=p.emission?.83:p.face?.16+.63*diffuse+.1*Math.pow(1-Math.abs(nz),2):.69;
      lights[k]=clamp(Math.round(raw*47),0,47);
      let depth=0;
      for(let j=0;j<p.count;j++){
        let x=p.points[j*3],y=p.points[j*3+1],z=p.points[j*3+2];
        if(p.motion===3){const u=x,dx=cable[3]-cable[0],dy=cable[4]-cable[1],len=Math.hypot(dx,dy)||1;
          const wave=Math.sin(u*Math.PI)*(2.1*Math.sin(u*18-qt(t,1.9))+p.priority*80);
          x=mix(cable[0],cable[3],u)-dy/len*wave;y=mix(cable[1],cable[4],u)+dx/len*wave;z=mix(cable[2],cable[5],u);
        }else{deform(p,x,y,z,t);x=local[0];y=local[1];z=local[2];transform(o,g,x,y,z);x=local[0];y=local[1];z=local[2];}
        // Orthographic-ish perspective, bounded and free of near-plane cliffs.
        const perspective=o<4?720/(720-z):1;
        if(o<4){x=b.x+(x-b.x)*perspective;y=b.y+(y-b.y)*perspective;}
        if(!reduced){
          // Coherent subpixel ink boil and a travelling refractive phase sheet.
          // No per-frame randomness, strobe, stepped pose or whole-screen flash.
          const phase=.32*Math.sin(qt(t,.82)+y*.012)+.16*Math.sin(qt(t,1.31)+x*.019);
          const bend=(o===5?2.7:.9)*(1+.3*Math.sin(x*.003+qt(t,.11)));
          x+=phase*bend+flow.amp*110*Math.sin(y*.005*flow.scale+qt(t,flow.dx*4))+flow.gx*.3;
          y+=.28*bend*Math.sin(qt(t,.77)+x*.011)+flow.amp*90*Math.cos(x*.004*flow.scale-qt(t,flow.dy*4))+flow.gy*.3;
        }
        const at=p.offset+j*2;positions[at]=x;positions[at+1]=y;depth+=z/p.count;
      }
      depths[k]=o===5?p.priority:b.depth*2000+depth*.5+p.priority;order[k]=k;
    }
    order.sort(depthCompare);return frameState;
  }
  function setFlow(scale,dx,dy,amp,swirl,gx=0,gy=0){
    if(!Number.isFinite(scale+dx+dy+amp+swirl+gx+gy))return;
    scale=clamp(scale,.01,10);dx=clamp(dx,-1,1);dy=clamp(dy,-1,1);amp=clamp(amp,-.1,.1);swirl=clamp(swirl,-1,1);gx=clamp(gx,-1,1);gy=clamp(gy,-1,1);
    if(flow.scale!==scale||flow.dx!==dx||flow.dy!==dy||flow.amp!==amp||flow.swirl!==swirl||flow.gx!==gx||flow.gy!==gy){revision++;flow.scale=scale;flow.dx=dx;flow.dy=dy;flow.amp=amp;flow.swirl=swirl;flow.gx=gx;flow.gy=gy;}
  }
  // RASTER + GPU HOST ADAPTERS. Projection scales from viewport height on
  // portrait, while trajectories compress horizontally and open vertically.
  // The camera is part of the artwork: it drifts, breathes and banks through
  // the field on its own slow, loopable clock — not a fixed tripod.
  let canvas=null,ctx=null,canvasW=0,canvasH=0;
  const layoutValues=new Float64Array(4);
  const cam={x:0,y:0,zoom:1,roll:0};
  function layout(w,h,a=w/h){
    const s=Math.min(w/1280,h/720)*(a<1.1?1.48:1)*cam.zoom;
    layoutValues[0]=s;layoutValues[1]=s;
    layoutValues[2]=w*.5-cam.x*s;layoutValues[3]=h*.49-cam.y*s;
    return layoutValues;
  }
  function makeCanvas(w,h){if(typeof OffscreenCanvas==='function')return new OffscreenCanvas(w,h);if(host.document?.createElement){const c=host.document.createElement('canvas');c.width=w;c.height=h;return c;}return null;}
  function getCanvas(w,h){if(disposed)return null;if(!canvas){canvas=makeCanvas(w,h);if(!canvas)return null;ctx=canvas.getContext('2d');if(!ctx){canvas=null;return null;}}
    if(canvasW!==w||canvasH!==h){canvas.width=w;canvas.height=h;canvasW=w;canvasH=h;}return canvas;}
  function trace(target,p){const off=p.offset;target.beginPath();target.moveTo(positions[off],positions[off+1]);for(let j=1;j<p.count;j++)target.lineTo(positions[off+j*2],positions[off+j*2+1]);if(p.closed)target.closePath();}
  function evalCamera(t,reduced){
    if(reduced){cam.x=0;cam.y=0;cam.zoom=1;cam.roll=0;return;}
    
    cam.x=64*Math.sin(qt(t,.021)+1.3)+30*Math.sin(qt(t,.047));
    cam.y=38*Math.sin(qt(t,.027)+.6)+18*Math.cos(qt(t,.041));
    cam.zoom=1.02+.075*Math.sin(qt(t,.017)+2.2);
    cam.roll=.016*Math.sin(qt(t,.013)+.9);
  }
  function paint(target,w,h,a,state,emitter){
    evalCamera(state.time,state.reduced);
    const l=layout(w,h,a);
    target.setTransform(1,0,0,1,0,0);
    target.globalAlpha=1;target.globalCompositeOperation='source-over';
    // The GPU path wants an emitter: ink where the sculptures are, alpha 0
    // everywhere else, so the feedback field can live in the gaps. An opaque
    // plate made the history matte the whole frame and wiped the trail.
    if(emitter)target.clearRect(0,0,w,h);
    else{target.fillStyle='#04080b';target.fillRect(0,0,w,h);}
    target.setTransform(l[0],0,0,l[1],l[2],l[3]);
    if(cam.roll)target.rotate(cam.roll);
    target.lineJoin='bevel';target.lineCap='round';
    for(let n=0;n<order.length;n++){
      const k=order[n],p=tracks[k],alpha=alphas[k];if(alpha<.012)continue;
      target.globalAlpha=alpha;trace(target,p);
      if(p.face){target.fillStyle=shades[p.material][lights[k]];target.fill();}
      if(widths[k]>0){target.lineWidth=widths[k];target.strokeStyle=shades[p.face?(p.material===5?0:1):p.material][p.face?23:lights[k]];target.stroke();}
    }
    target.setTransform(1,0,0,1,0,0);target.globalAlpha=1;
    if(state.reduced)return;
    const t=state.time;
    // Selective split-registration echoes: only emissive contour paths, not a
    // displaced copy of every filled object. Continuous motion in two axes.
    const dx=1.1+1.3*Math.sin(qt(t,.49)),dy=.8*Math.cos(qt(t,.61));
    target.setTransform(l[0],0,0,l[1],l[2]+dx,layoutValues[3]+dy);
    if(cam.roll)target.rotate(cam.roll);
    target.globalCompositeOperation='screen';
    for(let n=0;n<order.length;n++){const k=order[n],p=tracks[k];if(p.face||p.object===4||!p.emission||alphas[k]<.1||k%3)continue;target.globalAlpha=alphas[k]*.14;target.strokeStyle=shades[3][28];target.lineWidth=widths[k]*.74;trace(target,p);target.stroke();}
    target.setTransform(1,0,0,1,0,0);target.globalAlpha=1;target.globalCompositeOperation='source-over';
    // Glow, grain and the vignette belong to the display pass. Baking two
    // full-frame blurs into the 30 Hz upload both smeared the sculptures and
    // stalled the worker that is also driving WebGL.
    if(state.reduced||emitter)return;
    // Vignette, rebuilt on size change only.
    if(!paint._vig&&paint._vigTried!==w*4096+h){paint._vigTried=w*4096+h;
      const v=makeCanvas(Math.max(2,w),Math.max(2,h));
      const c2=v&&v.getContext&&v.getContext('2d');
      if(c2&&typeof c2.createRadialGradient==='function'){
        const g=c2.createRadialGradient(w*.5,h*.46,Math.min(w,h)*.30,w*.5,h*.5,Math.max(w,h)*.74);
        if(g&&typeof g.addColorStop==='function'){
          g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(0,2,4,0.56)');
          c2.fillStyle=g;c2.fillRect(0,0,w,h);paint._vig=v;}
      }
    }
    if(paint._vig)target.drawImage(paint._vig,0,0,w,h);
    // A wide, faint cold sheen crossing the frame — the light is in the room,
    // not only on the objects.
    if(typeof target.createLinearGradient==='function'){
      const sheenX=w*(.5+.62*Math.sin(qt(t,.031)+1.1));
      const sheen=target.createLinearGradient(sheenX-w*.34,0,sheenX+w*.34,h);
      if(sheen&&typeof sheen.addColorStop==='function'){
        sheen.addColorStop(0,'rgba(120,170,175,0)');sheen.addColorStop(.5,'rgba(150,200,200,0.05)');sheen.addColorStop(1,'rgba(120,170,175,0)');
        target.fillStyle=sheen;target.fillRect(0,0,w,h);
      }
    }
    // Animated film grain (sparse; defeats banding in the near-black floor).
    if(paint._gw!==w&&typeof target.createImageData==='function'){
      paint._gw=w;
      const g=makeCanvas(128,128);
      const c2=g&&g.getContext&&g.getContext('2d');
      const id=c2&&typeof c2.createImageData==='function'?c2.createImageData(128,128):null;
      if(id&&id.data){
        for(let i=0;i<id.data.length;i+=4){const v=hash(i*.917)>.5?255:0;id.data[i]=id.data[i+1]=id.data[i+2]=v;id.data[i+3]=Math.floor(14*hash(i*.311));}
        c2.putImageData(id,0,0);paint._grainTile=g;}
    }
    if(paint._grainTile&&typeof target.createPattern==='function'){
      target.save();target.globalAlpha=.5;target.globalCompositeOperation='overlay';
      const ox=(hash(Math.floor(t*24)*.77)*128)|0,oy=(hash(Math.floor(t*24)*.37)*128)|0;
      target.translate(-ox,-oy);
      const pat=target.createPattern(paint._grainTile,'repeat');
      if(pat){target.fillStyle=pat;target.fillRect(0,0,w+128,h+128);}
      target.restore();
    }
  }
  const renderOptions={time:0,act:-1,width:960,height:540,aspect:16/9,reduced:false};
  function render(options=renderOptions){
    const w=clamp(Math.round(Number(options.width)||960),2,1440),h=clamp(Math.round(Number(options.height)||540),2,900);
    const a=Number.isFinite(options.aspect)&&options.aspect>0?options.aspect:w/h;
    const c=getCanvas(w,h);if(!c)return null;aspect=a;paint(ctx,w,h,a,sample(options.time,options.act,!!options.reduced),!!options.emitter);return c;
  }
  function emit(time,act,reduced,draw){const f=sample(time,act,reduced);for(let n=0;n<order.length;n++){const k=order[n],p=tracks[k];draw.begin(p,shades,alphas[k]);for(let j=0;j<p.count;j++)draw.point(positions[p.offset+j*2],positions[p.offset+j*2+1],j===0);draw.end(p,shades,alphas[k]);}return f;}
  function injectFallback(lum,tint,sw,sh,a,time,act,reduced){
    if(disposed||lum.length<sw*sh||tint.length<sw*sh)return false;
    aspect=a;sample(time,act,reduced);const l=layout(sw,sh,a);for(let i=0;i<sw*sh;i++)lum[i]*=.12;
    // Only the sparse luminous filaments need to feed the host ASCII buffer;
    // the solid surfaces are drawn once by the high-resolution 2D compositor.
    for(let k=0;k<tracks.length;k++){
      const p=tracks[k];if(p.face||!p.emission||alphas[k]<.08)continue;const v=alphas[k]*.7;
      for(let j=1;j<p.count;j++){const off=p.offset+j*2,x0=positions[off-2]*l[0]+l[2],y0=positions[off-1]*l[1]+l[3],x1=positions[off]*l[0]+l[2],y1=positions[off+1]*l[1]+l[3],n=Math.max(1,Math.ceil(Math.hypot(x1-x0,y1-y0)));
        for(let q=0;q<n;q++){const x=Math.round(mix(x0,x1,q/n)),y=Math.round(mix(y0,y1,q/n));if(x<0||y<0||x>=sw||y>=sh)continue;const at=y*sw+x;lum[at]=Math.max(lum[at],v);tint[at]=p.material===3?1:0;}
      }
    }return true;
  }
  let historyA=null,historyB=null,ha=null,hb=null,historyW=0,historyH=0,historyTime=-1,historyReduced=null;
  function composeFallback(target,w,h,time,act,reduced,dt=1/60){
    if(disposed)return false;
    const scale=Math.min(1,1100/w,720/h),rw=Math.max(2,Math.round(w*scale)),rh=Math.max(2,Math.round(h*scale));
    if(!historyA){historyA=makeCanvas(rw,rh);historyB=makeCanvas(rw,rh);if(!historyA||!historyB)return false;ha=historyA.getContext('2d');hb=historyB.getContext('2d');if(!ha||!hb)return false;}
    const reset=rw!==historyW||rh!==historyH||time<historyTime||reduced!==historyReduced;
    if(rw!==historyW||rh!==historyH){historyA.width=historyB.width=rw;historyA.height=historyB.height=rh;historyW=rw;historyH=rh;}
    Object.assign(renderOptions,{width:rw,height:rh,aspect:w/h,time,act,reduced,emitter:false});const source=render(renderOptions);if(!source)return false;
    hb.setTransform(1,0,0,1,0,0);hb.clearRect(0,0,rw,rh);
    if(!reset&&!reduced){
      const step=clamp(dt*60,0,3),angle=.0015*step*Math.sin(time*.09),s=1+.0007*step,c=Math.cos(angle)*s,sn=Math.sin(angle)*s;
      hb.globalAlpha=Math.exp(-Math.max(dt,0)*3.6);hb.setTransform(c,sn,-sn,c,rw*.5*(1-c)+rh*.5*sn+.4*step,rh*.5*(1-c)-rw*.5*sn-.25*step);hb.drawImage(historyA,0,0);hb.setTransform(1,0,0,1,0,0);
    }
    hb.globalAlpha=1;hb.globalCompositeOperation='source-over';hb.drawImage(source,0,0);hb.globalAlpha=1;
    target.save();target.setTransform(1,0,0,1,0,0);target.fillStyle='#04080b';target.fillRect(0,0,w,h);target.globalAlpha=.27;target.globalCompositeOperation='screen';
    if('filter' in target)target.filter='blur(2.2px)';target.drawImage(historyB,0,0,w,h);if('filter' in target)target.filter='none';target.globalAlpha=1;target.globalCompositeOperation='source-over';target.drawImage(historyB,0,0,w,h);target.restore();
    // The source-over resolve keeps exact optical masks and depth occlusion:
    // a foreground craft crossing the horizon must NOT be cut out by a second
    // unconditional black-circle overlay after the painter has resolved it.
    const c=historyA;historyA=historyB;historyB=c;const x=ha;ha=hb;hb=x;historyTime=time;historyReduced=reduced;return true;
  }
  let gpu=null,texture=null,textureW=0,textureH=0,programRef=null,samplerLoc=null,activeLoc=null,lastUpload=-Infinity,lastGpuReduced=null,uploads=0;
  const emptyPixel=new Uint8Array(4);
  function bindGL(gl,program,w,h,time,act,reduced){
    if(disposed){gl.uniform1f(gl.getUniformLocation(program,'uTableauActive'),0);return false;}
    if(!texture){gpu=gl;texture=gl.createTexture();gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,emptyPixel);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);}
    if(programRef!==program){programRef=program;samplerLoc=gl.getUniformLocation(program,'uTableau');activeLoc=gl.getUniformLocation(program,'uTableauActive');}
    gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,texture);
    const scale=Math.min(1,1280/Math.max(2,w),800/Math.max(2,h)),tw=Math.max(2,Math.round(w*scale)),th=Math.max(2,Math.round(h*scale));
    const resized=tw!==textureW||th!==textureH,due=resized||reduced!==lastGpuReduced||(!reduced&&(time<lastUpload||time-lastUpload>=1/30-1e-6));let enabled=textureW>0;
    try{if(due){Object.assign(renderOptions,{time,act,width:tw,height:th,aspect:w/h,reduced,emitter:true});const image=render(renderOptions);if(image){
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
      if(resized)gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);else gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,image);
      textureW=tw;textureH=th;lastUpload=time;lastGpuReduced=reduced;uploads++;enabled=true;
    }else enabled=false;}}catch{enabled=false;}
    gl.uniform1i(samplerLoc,2);gl.uniform1f(activeLoc,enabled?1:0);return enabled;
  }
  function svg(options={}){
    const w=clamp(Math.round(Number(options.width)||1440),2,4096),h=clamp(Math.round(Number(options.height)||810),2,4096);aspect=w/h;const state=sample(options.time??12,-1,!!options.reduced),l=layout(w,h,w/h),parts=[];
    for(let n=0;n<order.length;n++){const k=order[n],p=tracks[k];if(alphas[k]<.012)continue;let d='';for(let j=0;j<p.count;j++)d+=(j?'L':'M')+positions[p.offset+j*2].toFixed(2)+' '+positions[p.offset+j*2+1].toFixed(2);
      parts.push(`<path d="${d}${p.closed?'Z':''}" fill="${p.face?shades[p.material][lights[k]]:'none'}" stroke="${widths[k]>0?shades[p.face?1:p.material][p.face?23:lights[k]]:'none'}" stroke-width="${widths[k].toFixed(2)}" opacity="${alphas[k].toFixed(3)}"/>`);}
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="title desc"><title id="title">SPACEFACE / CONTINUUM</title><desc id="desc">Live-pose export at ${state.time.toFixed(3)} seconds. Five coexisting, independently articulated sculptures. This exported still is never a runtime dependency.</desc><rect width="100%" height="100%" fill="#04080b"/><g transform="translate(${l[2]} ${l[3]}) scale(${l[0]} ${l[1]})" stroke-linecap="round" stroke-linejoin="bevel">${parts.join('')}</g></svg>`;
  }
  function inspect(){return ids.map((id,o)=>{const ps=tracks.filter(p=>p.object===o);return {id,name:names[o],objects:['projected solid sculpture','independent internal articulation','depth / phase / continuous drift'],strokes:ps.length,points:ps.reduce((n,p)=>n+p.count,0),finite:ps.every(p=>p.points.every(Number.isFinite)),faces:ps.filter(p=>p.face).length,continuous:true};});}
  function stats(){return {version:'CONTINUUM-1',continuous:true,uploads,textureWidth:textureW,textureHeight:textureH,strokeCount:tracks.length,pointCount:totalPoints,bodyCount:5,sourceHz:30,disposed};}
  function resetHistory(){historyTime=-1;lastUpload=-Infinity;lastTime=-1;if(ha)ha.clearRect(0,0,historyW,historyH);if(hb)hb.clearRect(0,0,historyW,historyH);}
  function dispose(){if(disposed)return;disposed=true;try{if(gpu&&texture)gpu.deleteTexture(texture);}catch{}gpu=null;texture=null;canvas=null;ctx=null;historyA=historyB=ha=hb=null;}
  return {continuous:true,render,emit,svg,inspect,injectFallback,composeFallback,bindGL,setFlow,sample,resetHistory,stats,dispose};
}
