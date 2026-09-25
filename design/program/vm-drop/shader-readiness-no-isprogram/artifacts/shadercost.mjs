// Shader-admission cost split for the pre-flight window (profile start .. flight entry):
// native GL waits vs native GL submits vs three's JS program build vs SpaceFace readiness JS.
import fs from 'fs';
const [dir] = process.argv.slice(2);
const p = JSON.parse(fs.readFileSync(dir + '/profile.cpuprofile'));
const rep = fs.readFileSync(dir + '/report.md', 'utf8');
const end = +(/New Game screen \(to Launch click\) \| ([\d.]+)/.exec(rep) || [0, 0])[1] + +(/Launch click to flight: ([\d.]+) s/.exec(rep) || [0, 0])[1];
const byId = new Map(); for (const n of p.nodes) byId.set(n.id, n);
const parent = new Map(); for (const n of p.nodes) for (const c of (n.children || [])) parent.set(c, n.id);
const cat = { glWait: 0, glSubmit: 0, threeProgramJs: 0, readinessJs: 0, busy: 0 };
const WAIT = /^(getProgramParameter|isProgram|getShaderParameter|getProgramInfoLog|getShaderInfoLog|getUniformLocation|getActiveUniform|getActiveAttrib|getAttribLocation)$/;
const SUBMIT = /^(linkProgram|compileShader|shaderSource|attachShader|createProgram|createShader|deleteShader|detachShader|bindAttribLocation)$/;
const READY = /^(checkProgramsReady|drain|programHandleInvalid|programReadiness|getUniformsAfterLinkCheck|getAttributesAfterLinkCheck|beforeFirstUse|programSettled|checkLinkStatus|compilePipelinesContextSafe)$/;
const PROG = /^(WebGLProgram|acquireProgram|getProgram|getParameters|getProgramCacheKey|replaceLightNums|resolveIncludes|unrollLoops|includeReplacer|generatePrecision|getProgramCode|WebGLShader|fetchAttributeLocations|WebGLUniforms|parseUniform|addUniform)$/;
let t = p.startTime;
for (let i = 0; i < p.samples.length; i++) {
  t += p.timeDeltas[i]; const rel = (t - p.startTime) / 1e6; if (rel > end) break;
  const dt = (p.timeDeltas[i + 1] || p.timeDeltas[i]) / 1000;
  const leaf = byId.get(p.samples[i]).callFrame; const fn = leaf.functionName;
  if (fn === '(idle)') continue; cat.busy += dt;
  if (WAIT.test(fn)) { cat.glWait += dt; continue; }
  if (SUBMIT.test(fn)) { cat.glSubmit += dt; continue; }
  if (READY.test(fn) && leaf.url.includes('/src/')) { cat.readinessJs += dt; continue; }
  // JS self under three's program build
  let id = p.samples[i]; let inProg = false;
  while (id != null) { const cf = byId.get(id).callFrame; if (PROG.test(cf.functionName) && cf.url.includes('three.module')) { inProg = true; break; } id = parent.get(id); }
  if (inProg && leaf.url) cat.threeProgramJs += dt;
}
for (const k in cat) cat[k] = +cat[k].toFixed(0);
cat.preFlightS = end;
console.log(JSON.stringify(cat));
