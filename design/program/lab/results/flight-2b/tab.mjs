import fs from 'node:fs';
const load = (f) => fs.readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const [a, b] = process.argv.slice(2).map(load);
const key = (r) => r.shipId + '|' + r.scenario;
const B = new Map(b.map((r) => [key(r), r]));
const f = (x, d = 2) => (x == null ? '-' : (+x).toFixed(d));
console.log('hull | maxYaw | cruise frac (r wu) | boost frac early/late (r wu) | uturn cruise s | uturn boost s | W+E+A turn sign (want -) | coast nose frac');
for (const ship of [...new Set(a.map((r) => r.shipId))]) {
  const g = (rs, sc) => rs.find((r) => r.shipId === ship && r.scenario === sc);
  const row = (rs) => {
    const c = g(rs, 'cruise-turn'), bo = g(rs, 'boost-turn'), uc = g(rs, 'uturn-cruise'), ub = g(rs, 'uturn-boost'), ea = g(rs, 'strafe-yaw-EA'), co = g(rs, 'coast-turn');
    const eaSign = Math.sign(ea.pathNet || 0);
    return `${f(c.early.pathFrac)} (${f(c.early.radius, 0)}) | ${f(bo.early.pathFrac)}/${f(bo.late.pathFrac)} (${f(bo.late.radius, 0)}) | ${f(uc.uturnS)} | ${f(ub.uturnS)} | ${eaSign} | ${f(co.early.noseFrac)}`;
  };
  console.log(ship.replace('ship_', '').padEnd(10), f(g(a, 'cruise-turn').maxYaw), '|', row(a), '  =>  ', row(b));
}
