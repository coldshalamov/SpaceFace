/**
 * SpaceFace / SIGNAL TABLEAUX
 * Authored line-work for the EXISTING loadingTerminalArt feedback engine.
 * No renderer replacement, UI framework, asset fetch, timer, or simulation state.
 * This entire factory is serialized into the existing artwork worker: keep it
 * self-contained. Canvas, fallback sampling, and SVG export use ONE scene graph.
 */
export function createSignalTableaux(host) {
  'use strict';
  host = host || {};
  const TAU = Math.PI * 2;
  const ACT_SECONDS = 6.5;
  const names = ['THE PILOT', 'FREE VECTOR', 'THE ANCHORAGE', 'BORROWED MOMENTUM', 'EVENT HORIZON'];
  const ids = ['pilot', 'courier', 'anchorage', 'massline', 'singularity'];
  // Phosphor-over-blood-black grade (2026-09): the figures are ghosts in the
  // field, never slides. Brights sit ~35% below paper-white so linework melts
  // into the feedback swirl; fills are near-black with a faint dried-blood cast.
  const palettes = [
    ['#8fd8c8', '#c08d54', '#2e5b60', '#050f12'],
    ['#86cbc9', '#c78d4e', '#2a585f', '#060f13'],
    ['#c9c4ea', '#c99a58', '#62628e', '#0d0b16'],
    ['#c7a07a', '#62b3ba', '#5f4a44', '#140e0e'],
    ['#adaadd', '#c78f58', '#54548a', '#0a0a15'],
  ];
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const mix = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const hash = n => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
  const scenes = Array.from({ length: 5 }, () => []);
  let scene = scenes[0];

  // The little authoring language is compiled once, not parsed in the frame loop.
  // All command coordinates are absolute. C/Q curves are sampled at setup only.
  function path(d, opt = {}) {
    const subpaths = d.trim().split(/(?=M)/).filter(Boolean);
    if (subpaths.length > 1) { let result; for (const part of subpaths) result = path(part, opt); return result; }
    const tokens = d.match(/[MLCQZ]|[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi) || [];
    const pts = []; let x = 0, y = 0, firstX = 0, firstY = 0, i = 0;
    while (i < tokens.length) {
      const cmd = tokens[i++];
      if (cmd === 'M' || cmd === 'L') {
        x = Number(tokens[i++]); y = Number(tokens[i++]);
        if (cmd === 'M') { firstX = x; firstY = y; }
        pts.push(x, y);
      } else if (cmd === 'C') {
        const ax = Number(tokens[i++]), ay = Number(tokens[i++]);
        const bx = Number(tokens[i++]), by = Number(tokens[i++]);
        const ex = Number(tokens[i++]), ey = Number(tokens[i++]);
        const steps = Math.max(8, Math.ceil((Math.hypot(ax - x, ay - y) + Math.hypot(bx - ax, by - ay) + Math.hypot(ex - bx, ey - by)) / 9));
        for (let j = 1; j <= steps; j++) {
          const t = j / steps, q = 1 - t;
          pts.push(q*q*q*x + 3*q*q*t*ax + 3*q*t*t*bx + t*t*t*ex,
            q*q*q*y + 3*q*q*t*ay + 3*q*t*t*by + t*t*t*ey);
        }
        x = ex; y = ey;
      } else if (cmd === 'Q') {
        const ax = Number(tokens[i++]), ay = Number(tokens[i++]);
        const ex = Number(tokens[i++]), ey = Number(tokens[i++]);
        const steps = Math.max(8, Math.ceil((Math.hypot(ax - x, ay - y) + Math.hypot(ex - ax, ey - ay)) / 9));
        for (let j = 1; j <= steps; j++) {
          const t = j / steps, q = 1 - t;
          pts.push(q*q*x + 2*q*t*ax + t*t*ex, q*q*y + 2*q*t*ay + t*t*ey);
        }
        x = ex; y = ey;
      } else if (cmd === 'Z') {
        pts.push(firstX, firstY); x = firstX; y = firstY;
      } else throw new Error('Unsupported tableau path command: ' + cmd);
    }
    return line(pts, { closed: /Z\s*$/.test(d), ...opt });
  }
  function line(pts, opt = {}) {
    const p = { points: new Float32Array(pts), tone: 0, width: 1.3, alpha: 0.8,
      group: 0, fill: false, closed: false, glow: false, ...opt };
    // Stable per-stroke emergence; no ambient randomness and no re-seeding frames.
    p.seed = hash(scene.length + scenes.indexOf(scene) * 413.7);
    scene.push(p); return p;
  }
  function ellipse(cx, cy, rx, ry, opt = {}, a0 = 0, a1 = TAU, rotate = 0) {
    const steps = Math.max(12, Math.ceil(Math.abs(a1 - a0) * Math.max(rx, ry) / 7));
    const pts = [], c = Math.cos(rotate), s = Math.sin(rotate);
    for (let j = 0; j <= steps; j++) {
      const a = mix(a0, a1, j / steps), x = Math.cos(a) * rx, y = Math.sin(a) * ry;
      pts.push(cx + x*c - y*s, cy + x*s + y*c);
    }
    return line(pts, { closed: Math.abs(a1 - a0) >= TAU - 0.001, ...opt });
  }
  function segment(x1, y1, x2, y2, opt) { return line([x1, y1, x2, y2], opt); }
  function bolt(x, y, r = 2, opt = {}) { ellipse(x, y, r, r, { tone: 1, width: 1, ...opt }); }
  function hatch(x, y, count, dx, dy, length, opt = {}) {
    for (let j = 0; j < count; j++) segment(x + dx*j, y + dy*j, x + dx*j + length, y + dy*j - length*0.38, { tone: 2, alpha: 0.5, width: 0.8, ...opt });
  }

  // 01 / THE PILOT — pressure suit, asymmetric helmet, reflected orbital world.
  // Not a HUD portrait: this is the first full-screen signal reconstruction.
  scene = scenes[0];
  for (let k = 0; k < 9; k++) ellipse(0, -35, 275+k*10, 243+k*8, { tone: 2, width: 0.7, alpha: 0.14 }, 3.35, 5.86, -0.08);
  path('M -252 227 C -230 184 -185 158 -108 146 L -89 112 L 82 110 L 106 148 C 169 154 220 189 245 234 L 202 263 L -206 263 Z', { fill: true, width: 2.4 });
  path('M -155 163 L -142 228 L -179 261 M -122 178 L -100 249', { tone: 2 });
  path('M 141 169 L 132 226 L 166 263', { tone: 2 });
  // Neck bearing and pressure collar; layered ellipses read as machined hardware.
  for (let k = 0; k < 7; k++) ellipse(-2, 135+k*5, 101-k*2.1, 28, { tone: k===0 ? 1 : 2, width: k===0 ? 2 : 1, alpha: 0.8 }, 0, Math.PI);
  path('M -144 -91 C -136 -208 -32 -248 69 -221 C 146 -200 184 -144 176 -61 L 165 46 C 158 85 128 117 81 139 L -65 147 C -114 126 -146 87 -155 35 Z', { fill: true, width: 2.6, group: 1 });
  path('M -131 -109 C -113 -201 -19 -236 61 -211 C 123 -192 163 -149 164 -101', { tone: 2, width: 1.6, group: 1 });
  path('M -123 -156 C -47 -205 56 -199 126 -150', { tone: 2, group: 1 });
  path('M -92 -193 C -37 -227 34 -221 79 -199 L 84 -181 C 12 -204 -51 -199 -108 -168 Z', { fill: true, tone: 1, alpha: 0.55, group: 1 });
  path('M -123 -91 C -61 -147 79 -148 141 -102 L 139 23 C 89 73 -38 96 -111 46 C -129 15 -134 -56 -123 -91 Z', { fill: true, width: 2.1, tone: 1, group: 1 });
  path('M -111 -84 C -51 -132 66 -131 127 -96 L 125 17 C 73 59 -35 78 -99 40 C -114 5 -119 -53 -111 -84 Z', { fill: true, tone: 2, width: 1, group: 1 });
  // Layered visor etching; curvature, not a flat emoji face.
  for (let k = 0; k < 15; k++) {
    const y = -96+k*9;
    path(`M -105 ${y+14} C -31 ${y-17} 68 ${y-18} 123 ${y-3}`, { tone: 2, width: 0.65, alpha: 0.2+(k%3)*0.06, group: 1 });
  }
  ellipse(45, -30, 42, 42, { tone: 0, width: 1.15, alpha: 0.68, group: 2 });
  ellipse(45, -30, 74, 13, { tone: 1, width: 1.3, alpha: 0.76, group: 2 }, 0, TAU, -0.35);
  for (let k = 0; k < 5; k++) ellipse(45, -30, 40, 10+k*5, { tone: 2, width: 0.65, alpha: 0.4, group: 2 }, Math.PI, TAU);
  path('M -88 -61 C -65 -88 -24 -102 1 -98 M -91 -46 C -69 -73 -39 -83 -17 -84', { width: 2, alpha: 0.56, group: 2 });
  path('M -125 58 L -91 105 L -50 122 L 66 113 L 124 78 L 145 36', { tone: 2, width: 1.7, group: 1 });
  path('M -86 83 L -58 105 L 57 99 L 90 80 L 58 89 L -42 93 Z', { fill: true, tone: 1, width: 1, group: 1 });
  for (let k = 0; k < 11; k++) segment(-47+k*9, 101-k*0.38, -42+k*9, 111-k*0.38, { tone: 2, width: 1.2, group: 1 });
  ellipse(-151, -18, 27, 59, { fill: true, width: 2, group: 1 });
  ellipse(-154, -18, 15, 43, { tone: 1, width: 1.4, group: 1 });
  for (let k = 0; k < 7; k++) segment(-164, -44+k*8, -150, -44+k*8, { tone: 2, width: 1, group: 1 });
  path('M 168 -60 L 189 -46 L 185 12 L 167 29 Z', { fill: true, width: 1.4, group: 1 });
  for (const [x,y] of [[-135,-85],[-126,61],[139,-88],[133,55],[-98,113],[84,115]]) bolt(x,y,3,{group:1});
  path('M -155 40 C -224 81 -220 172 -186 206 L -161 207', { width: 10, tone: 3, alpha: 1 });
  path('M -155 40 C -224 81 -220 172 -186 206 L -161 207', { width: 3, tone: 1 });
  for (let k=0;k<13;k++) { const a=2.45+k*.12; segment(-178+29*Math.cos(a),114+73*Math.sin(a),-167+28*Math.cos(a),113+73*Math.sin(a),{tone:2,width:1}); }
  path('M -77 183 L 68 180 L 91 250 L -90 252 Z', { fill:true,tone:2,width:1.3 });
  path('M -55 198 L -9 197 L -2 222 L -60 225 Z', { tone:1,width:1.2 });
  hatch(18,198,5,0,7,41);
  for (let k=0;k<5;k++) bolt(-227+k*10,218-k*4,1.7);
  // Tiny reflected star marks, bound to visor motion rather than screen chrome.
  for (let k=0;k<13;k++) { const x=-80+hash(k+60)*174,y=-93+hash(k+70)*117; segment(x-1,y,x+1,y,{group:2,width:0.9,alpha:.55}); }

  // Common ship drafting, reused at two scales. Main hull is intentionally
  // asymmetric; no stock chevron / default triangular rocket silhouette.
  function courier(group = 1) {
    const o = { group };
    const hull = path('M -213 46 L -166 -8 L -30 -44 L 96 -113 L 269 -116 L 185 -63 L 122 -33 L 51 25 L -61 59 L -111 89 L -187 87 Z', { ...o, fill:true,width:2.4 });
    path('M -213 46 L -149 62 L -53 38 L 63 -2 L 185 -63', { ...o,width:1.7,tone:1 });
    path('M -30 -44 L 4 -8 L 116 -60 L 211 -99 L 269 -116', { ...o,tone:2,width:1.2 });
    path('M -163 -6 L -114 2 L -92 37 L -149 62 L -191 37 Z', { ...o,fill:true,tone:2 });
    path('M 20 -64 L 25 -119 L -42 -115 L -138 -29 L -99 -14 Z', { ...o,fill:true,tone:0,width:1.7 });
    path('M 27 26 L 82 90 L 3 100 L -112 67 L -53 38 Z', { ...o,fill:true,width:1.8 });
    path('M 21 36 L 56 78 L 4 85 L -78 62', { ...o,tone:2,width:1.2 });
    path('M 0 -61 L 3 -104 L -38 -103 L -103 -40', { ...o,tone:2 });
    path('M 100 -103 L 186 -107 L 132 -79 L 85 -64 L 66 -70 Z', { ...o,fill:true,tone:1,width:1.7 });
    path('M 115 -99 L 150 -101 L 116 -83 L 93 -76 Z', { ...o,fill:true,tone:0,width:1 });
    segment(144,-100,123,-83,{...o,tone:2});
    path('M 40 -7 L 115 -39 L 95 -18 L 50 1 Z', { ...o,tone:2,width:.85 });
    path('M -73 -9 L -18 -25 L -5 -7 L -59 11 Z', { ...o,tone:1,width:1 });
    for(let k=0;k<9;k++) segment(-120+k*10,8-k*2.6,-111+k*10,21-k*2.6,{...o,tone:2,width:.85});
    for(let k=0;k<6;k++) segment(-25+k*12,59+k*3.5,-20+k*12,73+k*1.6,{...o,tone:2,width:.8});
    path('M -163 16 L -227 20 L -242 49 L -204 65 L -163 54 Z', { ...o,fill:true,width:1.7 });
    ellipse(-229,41,13,23,{...o,tone:1,width:2},0,TAU,.36);
    ellipse(-231,41,7,15,{...o,tone:0,width:2},0,TAU,.36);
    path('M -88 58 L -137 92 L -169 89 L -177 67 L -124 45 Z', { ...o,fill:true,width:1.5 });
    ellipse(-157,85,10,16,{...o,tone:1,width:1.7},0,TAU,1.04);
    for (const [x,y] of [[-176,43],[-130,29],[-44,-26],[44,10],[92,-49],[176,-97],[42,73],[-14,-95]]) bolt(x,y,2,o);
    path('M -144 3 L -117 -14 L -26 -38 M 116 -54 L 177 -79', { ...o,tone:2,alpha:.5,width:.7 });
    segment(192,-86,236,-112,{...o,tone:0,width:2});
    return hull;
  }
  scene = scenes[1];
  // A distant limb and broken orbital trails give the vessel a world to cross.
  for(let k=0;k<8;k++) ellipse(87,244,352+k*11,100+k*7,{tone:2,alpha:.12,width:.6},3.25,5.6,-.16);
  courier();
  // Engine streams are individually deformed at run time in group 3.
  for(let k=0;k<15;k++) path(`M ${-237-k*.5} ${30+k*1.7} C -285 ${40+k*2} -336 ${50+k*.9} ${-397+(k%4)*10} ${70+k*1.2}`,{group:3,tone:k%4===0?1:0,width:k%4===0?1.6:.65,alpha:.75-k*.026});
  for(let k=0;k<8;k++) path(`M -166 ${87+k*.6} Q -218 ${119+k*1.2} -277 ${138+k*1.8}`,{group:3,tone:k%3===0?1:2,width:.8,alpha:.5});
  // Acceleration wake and subtle star tracks, not a second HUD.
  for(let k=0;k<24;k++) {const x=-400+hash(k+101)*800,y=-225+hash(k+209)*425;segment(x,y,x-12-hash(k)*29,y+5,{tone:2,width:.7,alpha:.25,group:4});}

  // 03 / THE ANCHORAGE — toroidal habitat, trussed axle, radiators and docks.
  scene = scenes[2];
  const tilt = -.23;
  const ringPoint = (a,r=239) => {const x=Math.cos(a)*r,y=Math.sin(a)*r*.54;return [x*Math.cos(tilt)-y*Math.sin(tilt),x*Math.sin(tilt)+y*Math.cos(tilt)-12];};
  for(let k=0;k<8;k++) ellipse(0,-12,239+k*3,129+k*1.6,{tone:k%3===0?0:2,width:k===0?2:0.7,alpha:.65},Math.PI,TAU,tilt);
  // Long pressure spine passes through the habitat aperture.
  path('M -64 -237 L -24 -248 L 85 218 L 47 231 Z',{fill:true,tone:2,width:1.7});
  path('M -44 -242 L 68 224 M -54 -222 L -18 -204 L -43 -172 L -4 -151 L -28 -114 L 15 -90 L -10 -56 L 31 -29 L 11 7 L 47 31 L 26 69 L 66 97 L 47 136 L 80 158 L 62 202',{tone:2,width:1.1});
  for(let k=0;k<9;k++){const y=-205+k*48,x=-44+(y+240)*.237;segment(x-12,y,x+20,y-7,{tone:1,width:1,alpha:.6});}
  // Twin radiator banks, visibly panelled rather than ornamental rectangles.
  for(const side of [-1,1]){
    const x=side<0?-217:30,y=side<0?-198:-252;
    path(`M ${x} ${y} L ${x+139} ${y-31} L ${x+157} ${y+40} L ${x+17} ${y+70} Z`,{fill:true,tone:2,width:1.5});
    for(let k=1;k<10;k++)segment(x+k*14,y-k*3.1,x+17+k*14,y+70-k*3.1,{tone:0,width:.65,alpha:.47});
    for(let k=1;k<4;k++)segment(x+k*4.25,y+k*17.5,x+139+k*4.5,y-31+k*17.75,{tone:2,width:.7});
  }
  // Internal spokes connect the axle to the actual ring attachment points.
  for(let k=0;k<6;k++){
    const a=k*TAU/6+.08,[x,y]=ringPoint(a,232);
    segment(-4,-10,x,y,{tone:2,width:9,alpha:.6});
    segment(-7,-10,x-3,y-2,{tone:0,width:1.2,alpha:.7});
    segment(1,-8,x+3,y+2,{tone:2,width:1.4});
    for(let j=1;j<6;j++){const f=j/6;segment(x*f-4,y*f-9*(1-f),x*f+4,y*f-4*(1-f),{tone:1,width:.8,alpha:.7});}
  }
  ellipse(0,-12,47,32,{fill:true,tone:0,width:2},0,TAU,tilt);
  ellipse(0,-12,33,22,{tone:1,width:1.2},0,TAU,tilt);
  ellipse(0,-12,17,11,{fill:true,tone:0,width:2},0,TAU,tilt);
  for(let k=0;k<48;k++){
    const a=k*TAU/48,[x,y]=ringPoint(a,238),[u,v]=ringPoint(a,262);
    segment(x,y,u,v,{tone:k%4===0?1:2,width:k%4===0?2:1,alpha:.8});
    if(k%2===0){const [p,q]=ringPoint(a+.027,250);segment(p,q,p+3,q-1,{tone:0,width:2,group:3});}
  }
  for(let k=0;k<8;k++) ellipse(0,-12,239+k*3,129+k*1.6,{tone:k%3===0?0:2,width:k===7?2:0.7,alpha:.85},0,Math.PI,tilt);
  // External docking forks.
  path('M 201 70 L 277 110 L 312 92 L 328 100 L 283 130 L 221 106 Z',{fill:true,width:1.5});
  path('M -229 29 L -317 53 L -332 38 L -339 52 L -319 71 L -222 47 Z',{fill:true,tone:2,width:1.3});
  for(let k=0;k<6;k++) bolt(239+k*8,101+k*4,1.5,{tone:1});
  // The station's scanner traces the ring; only this part turns, not the habitat.
  ellipse(0,-12,227,121,{tone:1,width:2,alpha:.9,group:2},.1,.6,tilt);
  path('M 344 138 L 371 124 L 403 132 L 380 140 L 370 151 Z',{fill:true,tone:1,width:1.2,group:4});
  segment(353,148,335,157,{tone:2,group:4,width:1.4});

  // 04 / BORROWED MOMENTUM — one taut massline, one heavy asteroid, one pilot.
  // Ship geometry is not duplicated; a scene-local transform reuses courier().
  scene=scenes[3];
  for(let k=0;k<9;k++) ellipse(-8,-2,380+k*4,143+k*2,{tone:2,width:.65,alpha:.16},.06,2.86,-.25);
  const masslineHull = courier(1);
  // The rock is an irregular, fractured solid with a lit rim and interior planes.
  const rock=[];for(let k=0;k<17;k++){const a=k*TAU/16,r=89+hash((k%16)+22)*26;rock.push(Math.cos(a)*r,Math.sin(a)*r*.84);}const masslineRock = line(rock,{group:5,fill:true,width:2.5});
  path('M -70 -55 L -28 -65 L -7 -35 L 31 -60 L 72 -20 L 42 9 L 73 47 L 11 59 L -15 31 L -61 61 L -72 12 L -39 -9 Z',{group:5,tone:2,width:1.6});
  path('M -28 -65 L -17 -91 M 31 -60 L 33 -92 M 72 -20 L 101 -30 M 73 47 L 87 61 M 11 59 L 8 86 M -61 61 L -81 72 M -72 12 L -101 21 M -7 -35 L -15 31 M -39 -9 L 42 9',{group:5,tone:2,width:1.1});
  ellipse(-35,-25,20,12,{group:5,tone:2,width:1.4},.4,5.4,-.35);
  ellipse(44,23,14,9,{group:5,tone:1,width:1.0},.2,4.9,.2);
  for(let k=0;k<30;k++){const x=-64+hash(k+20)*129,y=-47+hash(k+40)*102;segment(x,y,x+4+hash(k)*9,y-3,{group:5,tone:2,width:.7,alpha:.45});}
  // The tether itself is generated below from the moving attachment endpoints.
  for(let k=0;k<10;k++) ellipse(210,70,128+k*4,113+k*3,{tone:2,width:.65,alpha:.12},-.4,.84,-.2);

  // 05 / EVENT HORIZON — accretion ribbons lens above a genuinely dark core.
  scene=scenes[4];
  // Back-side disk is drawn first. Brightness is directional, never a filled orb.
  for(let k=0;k<29;k++){
    const rx=188+k*5.5,ry=37+k*1.82;
    ellipse(0,8,rx,ry,{tone:k%5===0?1:2,width:k%5===0?1.5:.65,alpha:.28+(k%4)*.11,group:2},Math.PI,TAU,-.10);
  }
  // A stack of vertically lensed far-side arcs curls over the shadow.
  for(let k=0;k<24;k++){
    const r=117+k*3.2,pts=[];
    for(let j=0;j<=76;j++){const a=Math.PI+j*Math.PI/76;pts.push(Math.cos(a)*r,Math.sin(a)*(r*1.01)+11);}
    line(pts,{tone:k%5===0?1:0,width:k%5===0?1.8:.7,alpha:.18+(1-k/26)*.46,group:3});
  }
  ellipse(0,5,112,112,{fill:true,fillColor:'#010207',tone:2,width:3.2,alpha:1});
  ellipse(0,5,113,113,{tone:1,width:1.5,alpha:.88});
  ellipse(0,5,118,118,{tone:0,width:1.1,alpha:.72},3.36,6.10);
  // The foreground disk crosses the black-hole silhouette: critical depth cue.
  for(let k=0;k<29;k++) ellipse(0,8,188+k*5.5,37+k*1.82,{tone:k%5===0?1:0,width:k%5===0?1.4:.6,alpha:.22+(k%4)*.13,group:2},0,Math.PI,-.10);
  // Sparse infalling filaments, not a flat bullseye.
  for(let k=0;k<12;k++){
    const pts=[],a0=k*TAU/12;
    for(let j=0;j<38;j++){const u=j/37,a=a0+u*.88,r=398-u*197;pts.push(Math.cos(a)*r,Math.sin(a)*r*.55);}
    line(pts,{tone:k%3===0?1:2,width:.8,alpha:.20,group:4});
  }
  ellipse(-173,47,8,4,{tone:1,width:1.2,group:2});
  path('M 269 -159 L 281 -162 L 278 -150 L 272 -147 Z',{fill:true,tone:0,width:1,group:4});

  // World transforms. Written into caller-owned arrays to avoid per-point GC.
  const matrix = new Float64Array(6);
  function groupMatrix(act, group, t) {
    let x=0,y=0,a=0,s=1;
    if(act===0){ if(group===1||group===2){a=Math.sin(t*.58)*.018;y=Math.sin(t*.95)*2.3;} if(group===2)x=Math.sin(t*.43)*2.5; }
    if(act===1){ if(group===1||group===3){a=Math.sin(t*.6)*.018;x=Math.sin(t*.45)*8;y=Math.cos(t*.66)*5;} if(group===4)x=-((t*11)%65); }
    if(act===2){ if(group===4){x=-Math.sin(t*.34)*15;y=-Math.sin(t*.34)*6;} }
    if(act===3){
      if(group===1){s=.51;a=-.13+Math.sin(t*.46)*.05;x=-233+Math.sin(t*.38)*13;y=-101+Math.cos(t*.48)*8;}
      if(group===5){s=1;a=t*.105;x=215+Math.sin(t*.55)*19;y=69+Math.cos(t*.55)*17;}
    }
    if(act===4){if(group===2)y=Math.sin(t*.8)*1.9; if(group===3)y=Math.sin(t*.8)*1.1; if(group===4)a=t*.027;}
    matrix[0]=Math.cos(a)*s;matrix[1]=Math.sin(a)*s;matrix[2]=-matrix[1];matrix[3]=matrix[0];matrix[4]=x;matrix[5]=y;
    return matrix;
  }
  const point = new Float64Array(2);
  function transform(x,y,p,index,act,t,u,reduced,mat) {
    const ox=x,oy=y;
    x=ox*mat[0]+oy*mat[2]+mat[4];y=ox*mat[1]+oy*mat[3]+mat[5];
    // Advance the station's scan arc in its tilted, foreshortened ring plane.
    // Rotating the ellipse in screen space would visibly leave the track.
    if(act===2&&p.group===2){
      const ct=Math.cos(-.23),st=Math.sin(-.23),a=t*.30,c=Math.cos(a),s=Math.sin(a);
      const bx=ox*ct+(oy+12)*st,by=(-ox*st+(oy+12)*ct)*(227/121);
      const xx=bx*c-by*s,yy=(bx*s+by*c)*(121/227);
      x=xx*ct-yy*st;y=xx*st+yy*ct-12;
    }
    // Animate the actual nozzle-attached plasma, not only a screen-space overlay.
    if(act===1&&p.group===3&&!reduced){const d=clamp((-ox-228)/178,0,1);y+=Math.sin(ox*.049+t*7.0+p.seed*8)*d*4.8;x+=Math.sin(t*4+p.seed*4)*d*9;}
    if(act===4&&(p.group===2||p.group===3)&&!reduced){const wave=Math.sin(ox*.019+t*1.5+p.seed*7);y+=wave*(p.group===3?1.4:2.2);}
    if(!reduced){
      const delay=p.seed*.065;
      const enter=smooth(.005+delay,.165+delay,u),leave=smooth(.77+delay*.4,.994,u);
      const chaos=(1-enter)+leave;
      const r=Math.hypot(x,y),angle=chaos*(1.6+r*.0026)*(leave>0?-1:1);
      const c=Math.cos(angle),s=Math.sin(angle),expand=1+chaos*.65;
      const xx=x*c-y*s,yy=x*s+y*c;
      x=xx*expand+Math.sin(y*.018+t*1.1+p.seed*4)*chaos*28;
      y=yy*expand+Math.cos(x*.011-t*.83+p.seed*3)*chaos*19;
    }
    point[0]=x;point[1]=y;return point;
  }

  let canvas=null,ctx=null,lastW=0,lastH=0;
  function getCanvas(w,h){
    if(!canvas){
      if(typeof OffscreenCanvas==='function')canvas=new OffscreenCanvas(w,h);
      else if(host.document&&typeof host.document.createElement==='function')canvas=host.document.createElement('canvas');
      else return null;
      ctx=canvas.getContext('2d',{willReadFrequently:!!host.readFrequently});
      if(!ctx){canvas=null;return null;}
    }
    if(w!==lastW||h!==lastH){canvas.width=w;canvas.height=h;lastW=w;lastH=h;}
    return canvas;
  }
  function layout(w,h,aspect){
    // The canvas may be a square 120x120 subpixel buffer; fit using DISPLAY
    // aspect, not texture aspect. This prevents stretched helmets in 2D.
    const screenH=1000/aspect,unit=Math.min(1,screenH/840);
    return [w/1000*unit,h/screenH*unit,w*.5,h*.405];
  }
  function resolve(time,act,reduced){
    const raw=Number.isFinite(time)?Math.max(0,time):0;
    const a=Number.isInteger(act)&&act>=0&&act<5?act:Math.floor(raw/ACT_SECONDS)%5;
    const t=reduced?a*ACT_SECONDS+ACT_SECONDS*.48:raw;
    return {act:a,t,u:reduced?.48:(raw%ACT_SECONDS)/ACT_SECONDS};
  }
  function emit(time,act,reduced,draw){
    const r=resolve(time,act,reduced),pal=palettes[r.act];
    for(let i=0;i<scenes[r.act].length;i++){
      const p=scenes[r.act][i],m=groupMatrix(r.act,p.group,r.t);
      const enter=reduced?1:smooth(0,.085+p.seed*.05,r.u);
      const exit=reduced?1:1-smooth(.86+p.seed*.025,1,r.u);
      let alpha=p.alpha*enter*exit;
      if(!reduced&&((r.act===2&&p.group===3)||(r.act===4&&p.group===2)))alpha*=.79+.21*Math.sin(r.t*1.7+p.seed*TAU);
      if(alpha<.006)continue;
      draw.begin(p,pal,alpha);
      for(let j=0;j<p.points.length;j+=2){const xy=transform(p.points[j],p.points[j+1],p,j,r.act,r.t,r.u,reduced,m);draw.point(xy[0],xy[1],j===0);}
      draw.end(p,pal,alpha);
    }
    // Dynamic massline is solved from the SAME transforms as the ship and rock.
    // It never detaches during their idle motion or during the transition warp.
    if(r.act===3){
      const sm=groupMatrix(3,1,r.t);
      const sp=transform(-89,38,masslineHull,0,3,r.t,r.u,reduced,sm),sx=sp[0],sy=sp[1];
      const rm=groupMatrix(3,5,r.t);
      const ep=transform(-87,0,masslineRock,0,3,r.t,r.u,reduced,rm),ex=ep[0],ey=ep[1];
      const p={tone:1,width:1.8,alpha:.94,group:0,seed:.5,fill:false,closed:false};
      const alpha=reduced?1:smooth(0,.12,r.u)*(1-smooth(.87,1,r.u));
      const sag=q=>Math.sin(q*Math.PI)*5*Math.sin(r.t*.9);
      draw.begin(p,pal,alpha);
      for(let j=0;j<=64;j++){const q=j/64;draw.point(mix(sx,ex,q),mix(sy,ey,q)+sag(q),j===0);}
      draw.end(p,pal,alpha);
      // Small travelling packets follow the same endpoint-constrained curve.
      for(let k=0;k<3;k++){
        const q=(r.t*.22+k/3)%1,mark={...p,width:3};draw.begin(mark,pal,alpha*.8);
        for(let j=0;j<2;j++){const f=Math.min(1,q+j*.009);draw.point(mix(sx,ex,f),mix(sy,ey,f)+sag(f),j===0);}
        draw.end(mark,pal,alpha*.8);
      }
    }
    return r;
  }
  function render({time=0,act=-1,width=720,height=450,aspect=width/height,reduced=false}={}){
    width=clamp(Math.round(width)||2,2,1024);height=clamp(Math.round(height)||2,2,768);
    aspect=Number.isFinite(aspect)&&aspect>0?aspect:width/height;
    const c=getCanvas(width,height);if(!c)return null;
    const l=layout(width,height,aspect);
    ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,width,height);
    ctx.setTransform(l[0],0,0,l[1],l[2],l[3]);ctx.lineJoin='round';ctx.lineCap='round';
    emit(time,act,reduced,{
      begin(){ctx.beginPath();},point(x,y,first){if(first)ctx.moveTo(x,y);else ctx.lineTo(x,y);},
      end(p,pal,alpha){
        if(p.closed)ctx.closePath();
        if(p.fill){ctx.globalAlpha=alpha;ctx.fillStyle=p.fillColor||pal[3];ctx.fill();}
        ctx.globalAlpha=alpha;ctx.strokeStyle=pal[p.tone];ctx.lineWidth=p.width;ctx.stroke();
      }
    });
    ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;
    return c;
  }
  function injectFallback(lum,tint,sw,sh,aspect,time,act,reduced){
    if(!render({width:sw,height:sh,aspect,time,act,reduced}))return false;
    const data=ctx.getImageData(0,0,sw,sh).data;
    for(let i=0;i<sw*sh;i++){
      const p=i*4,a=data[p+3]/255;
      // Field-dominant grade: the swirl survives at 60% and the figure adds a
      // ghost pass over it, so forms read as half-buried signals, not plates.
      const v=Math.max(data[p],data[p+1],data[p+2])/255;
      lum[i]=lum[i]*.60*(1-a*.55)+v*a*.85;
      if(a>.12)tint[i]=data[p]>data[p+1]*1.12?1:0;
    }
    return true;
  }
  function svg({act=0,time=act*ACT_SECONDS+3.1,width=1440,height=900,reduced=false}={}){
    const l=layout(width,height,width/height),parts=[];
    const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
    let d='';
    const r=emit(time,act,reduced,{
      begin(){d='';},point(x,y,first){d+=(first?'M':'L')+x.toFixed(2)+' '+y.toFixed(2);},
      end(p,pal,alpha){parts.push(`<path d="${d}${p.closed?'Z':''}" fill="${p.fill?(p.fillColor||pal[3]):'none'}" stroke="${pal[p.tone]}" stroke-width="${p.width}" opacity="${alpha.toFixed(3)}"/>`);}
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc"><title id="title">SpaceFace — ${esc(names[r.act])}</title><desc id="desc">Original signal-line artwork; the live game animates the same authored geometry through its existing phosphor feedback renderer.</desc><rect width="100%" height="100%" fill="#04090e"/><g transform="translate(${l[2]} ${l[3]}) scale(${l[0]} ${l[1]})" stroke-linejoin="round" stroke-linecap="round">${parts.join('')}</g></svg>`;
  }
  function inspect(){return scenes.map((s,i)=>({id:ids[i],name:names[i],strokes:s.length,points:s.reduce((n,p)=>n+p.points.length/2,0),finite:s.every(p=>p.points.every(Number.isFinite))}));}
  // One bounded texture feeds the existing ping-pong pass. Geometry is rastered
  // at 30 Hz; allocation/upload storage is reused, and there is NO extra rAF.
  let gpu=null,texture=null,textureW=0,textureH=0,programRef=null;
  let samplerLoc=null,activeLoc=null,lastUpload=-Infinity,lastGpuAct=-1,lastReduced=null;
  let uploads=0;
  function bindGL(gl,program,w,h,time,act,reduced){
    if(!texture){
      gpu=gl;texture=gl.createTexture();
      gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    }
    if(programRef!==program){programRef=program;samplerLoc=gl.getUniformLocation(program,'uTableau');activeLoc=gl.getUniformLocation(program,'uTableauActive');}
    gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,texture);
    const scale=Math.min(1,960/Math.max(2,w),600/Math.max(2,h));
    const tw=Math.max(2,Math.round(w*scale)),th=Math.max(2,Math.round(h*scale));
    const resized=tw!==textureW||th!==textureH;
    const due=resized||act!==lastGpuAct||reduced!==lastReduced||(!reduced&&(time<lastUpload||time-lastUpload>=1/30-1e-6));
    let enabled=textureW>0;
    try{
      if(due){
        const image=render({time,act,width:tw,height:th,aspect:w/h,reduced});
        if(image){
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
          gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
          if(resized)gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
          else gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,image);
          textureW=tw;textureH=th;lastUpload=time;lastGpuAct=act;lastReduced=reduced;uploads++;enabled=true;
        }else enabled=false;
      }
      gl.uniform1i(samplerLoc,2);gl.uniform1f(activeLoc,enabled?1:0);
    }finally{
      // The host immediately binds texB to generate its mip chain. Leaving unit
      // 2 active here would silently overwrite the figure sampler's binding.
      gl.activeTexture(gl.TEXTURE0);
    }
  }
  function dispose(){
    if(gpu&&texture){try{gpu.deleteTexture(texture);}catch{}}
    texture=null;gpu=null;programRef=null;textureW=textureH=0;
    lastUpload=-Infinity;lastGpuAct=-1;lastReduced=null;
    if(canvas){canvas.width=2;canvas.height=2;}canvas=null;ctx=null;lastW=lastH=0;
  }
  return {render,injectFallback,bindGL,svg,inspect,dispose,stats:()=>({uploads,textureW,textureH}),names: [...names],ids:[...ids],actSeconds:ACT_SECONDS};
}
