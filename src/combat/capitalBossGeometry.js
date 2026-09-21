// Authoritative 2D warning/hit geometry. Presentation consumes these SAME world-space shapes.
// No Three.js objects, world clock, random state, or global scratch.
const TAU = Math.PI * 2;
const EPS = 1e-8;
export const wrapAngle = a => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
const sq = x => x*x;
const clamp = (x,a,b) => Math.max(a, Math.min(b,x));
export function pointSegmentDistanceSquared(p, a, b) {
  const dx=b.x-a.x, dz=b.z-a.z;
  const t=clamp(((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz || 1),0,1);
  return sq(p.x-a.x-t*dx)+sq(p.z-a.z-t*dz);
}
function cross(a,b,c) { return (b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x); }
function segmentsCross(a,b,c,d) {
  const x=cross(a,b,c), y=cross(a,b,d), z=cross(c,d,a), w=cross(c,d,b);
  if (((x>EPS && y < -EPS)||(x < -EPS && y>EPS)) &&
      ((z>EPS && w < -EPS)||(z < -EPS && w>EPS))) return true;
  return pointSegmentDistanceSquared(a,c,d)<EPS || pointSegmentDistanceSquared(b,c,d)<EPS ||
    pointSegmentDistanceSquared(c,a,b)<EPS || pointSegmentDistanceSquared(d,a,b)<EPS;
}
function segmentDistanceSquared(a,b,c,d) {
  return segmentsCross(a,b,c,d) ? 0 : Math.min(pointSegmentDistanceSquared(a,c,d),
    pointSegmentDistanceSquared(b,c,d),pointSegmentDistanceSquared(c,a,b),pointSegmentDistanceSquared(d,a,b));
}
export function resolveBossShapes(beat, boss, target, mirror=1) {
  const facing=Number.isFinite(boss.rot) ? boss.rot : 0;
  const sensor=boss.disabled?.includes('subsystem_sensor') !== true &&
    boss.disabled?.includes('subsystem_power') !== true;
  return beat.shapes.map(s => {
    const aim=s.aim === 'target' && sensor && target
      ? Math.atan2(target.pos.z-boss.pos.z,target.pos.x-boss.pos.x) : facing;
    const heading=wrapAngle(aim+s.heading*mirror);
    if(s.kind === 'sector') return { kind:'sector', x:boss.pos.x,z:boss.pos.z,
      heading,halfAngle:s.halfAngle,inner:s.inner,outer:s.outer };
    const dx=Math.cos(heading),dz=Math.sin(heading),lateral=s.lateral*mirror;
    return { kind:'lane', a:{x:boss.pos.x+dx*s.start-dz*lateral,z:boss.pos.z+dz*s.start+dx*lateral},
      b:{x:boss.pos.x+dx*s.end-dz*lateral,z:boss.pos.z+dz*s.end+dx*lateral}, radius:s.width/2 };
  });
}
export function circleIntersectsBossShape(pos, radius, s) {
  radius=Math.max(0,radius);
  if(s.kind === 'lane') return pointSegmentDistanceSquared(pos,s.a,s.b)<=sq(radius+s.radius)+EPS;
  const dx=pos.x-s.x,dz=pos.z-s.z,r=Math.hypot(dx,dz);
  if(r+radius < s.inner-EPS || r-radius > s.outer+EPS) return false;
  if(s.halfAngle>=Math.PI-EPS || Math.abs(wrapAngle(Math.atan2(dz,dx)-s.heading))<=s.halfAngle+EPS)
    return true;
  for(const sign of [-1,1]) {
    const a=s.heading+sign*s.halfAngle, c=Math.cos(a),d=Math.sin(a);
    if(pointSegmentDistanceSquared(pos,{x:s.x+c*s.inner,z:s.z+d*s.inner},
      {x:s.x+c*s.outer,z:s.z+d*s.outer})<=radius*radius+EPS) return true;
  }
  return false;
}
// Swept disk vs an annular sector. Circle-crossing candidates plus the radial-edge capsules
// cover contact with every boundary, including the inner hole; no high-speed sampling cap.
export function sweptCircleIntersectsBossShape(previous, current, radius, s) {
  if(circleIntersectsBossShape(previous,radius,s)||circleIntersectsBossShape(current,radius,s)) return true;
  if(s.kind==='lane') return segmentDistanceSquared(previous,current,s.a,s.b)<=sq(radius+s.radius)+EPS;
  const dx=current.x-previous.x,dz=current.z-previous.z,A=dx*dx+dz*dz;
  if(A<EPS) return false;
  if(s.halfAngle<Math.PI-EPS) for(const sign of [-1,1]) {
    const a=s.heading+sign*s.halfAngle,c=Math.cos(a),d=Math.sin(a);
    if(segmentDistanceSquared(previous,current,{x:s.x+c*s.inner,z:s.z+d*s.inner},
      {x:s.x+c*s.outer,z:s.z+d*s.outer})<=radius*radius+EPS) return true;
  }
  const px=previous.x-s.x,pz=previous.z-s.z,B=2*(px*dx+pz*dz);
  const candidates=[clamp(-B/(2*A),0,1)];
  for(const r of [Math.max(0,s.inner-radius),s.inner+radius,Math.max(0,s.outer-radius),s.outer+radius]) {
    const C=px*px+pz*pz-r*r,D=B*B-4*A*C;
    if(D < -EPS) continue;
    const root=Math.sqrt(Math.max(0,D));
    for(const t of [(-B-root)/(2*A),(-B+root)/(2*A)]) if(t>=0 && t<=1) candidates.push(t);
  }
  return candidates.some(t=>circleIntersectsBossShape({x:previous.x+t*dx,z:previous.z+t*dz},radius,s));
}
export function bodyIntersectsBossShapes(body, shapes, useSweep=true) {
  const r=Number.isFinite(body.radius) ? Math.max(0,body.radius) : 0;
  return shapes.some(s=> useSweep && body.previousPos
    ? sweptCircleIntersectsBossShape(body.previousPos,body.pos,r,s)
    : circleIntersectsBossShape(body.pos,r,s));
}
