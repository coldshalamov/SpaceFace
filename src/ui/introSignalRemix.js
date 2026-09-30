/**
 * SIGNAL / OVERPRINT. An optical layer, not another replacement intro.
 * The shipped six-shot movie remains the negative. CONTINUUM's existing solid
 * sculptures and the terminal's curl/character-screen vocabulary are overprinted
 * onto it. One bounded WebGL2 pass + blit, one low-cadence sculpture texture.
 * No new asset, second video decoder, audio, gameplay dependency or input owner.
 */
import { createSignalTableaux } from './loadingSignalTableaux.js';

export const SIGNAL_REMIX = Object.freeze({
  loopSeconds: 18, sourceSeconds: 32, maxWidth: 1280, maxHeight: 720,
  fps: 30, sculptureHz: 12, glyphs: ' .,:;-+=*xX#%@MW',
});
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const smooth = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const finiteTime = t => Number.isFinite(t) ? Math.max(0, t) : 0;
const cuts = [0, 4, 10.4, 16.6, 22.4, 28.8];

/** Pure edit score. The major cuts follow the EXISTING negative, not six new scenes. */
export function sampleSignalRemix(seconds, sourceSeconds = 0, flashReduced = false) {
  const t = finiteTime(seconds), s = finiteTime(sourceSeconds) % 32;
  let splice = 0;
  for (const cut of cuts) {
    const d = Math.min(Math.abs(s - cut), 32 - Math.abs(s - cut));
    splice = Math.max(splice, 1 - smooth(d / 1.05));
  }
  // Cover the baked fade-out with live imagery, never a dead black restart.
  const bridge = Math.max(smooth((s - 29.1) / 1.6), 1 - smooth(s / 1.1));
  const accent = Math.pow(.5 + .5 * Math.sin(t * 1.41 + .9), 8);
  return {
    splice: flashReduced ? 0 : splice,
    bridge: flashReduced ? .25 : bridge,
    zoom: flashReduced ? 1.09 : 1.10 + .07 * Math.sin(t * .39) + .13 * accent,
    panX: (flashReduced ? .006 : .027) * Math.sin(t * .27 + .6),
    panY: (flashReduced ? .005 : .019) * Math.cos(t * .33),
    roll: (flashReduced ? .002 : .013) * Math.sin(t * .37 + 1.2),
    glyph: flashReduced ? .24 : .22 + .38 * splice + .29 * bridge,
    sculpture: flashReduced ? .24 : .17 + .29 * splice + .65 * bridge,
    echo: flashReduced ? .10 : .14 + .30 * splice,
  };
}

const VERTEX = `#version 300 es
precision highp float;
out vec2 uv;
void main(){
  vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));
  uv=p;gl_Position=vec4(p*2.-1.,0.,1.);
}`;
export const SIGNAL_FRAGMENT = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 frag;
uniform sampler2D movie, previous, sculpture, glyphs;
uniform vec2 resolution, cover;
uniform vec4 camera; // zoom, pan x/y, roll
uniform vec4 edit;   // splice, bridge, glyph, sculpture
uniform vec4 timing; // continuous time, normalized dt, echo, reduced flash
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){
  vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);
}
// Analytical curl derivative from loadingTerminalArt's GLSL_SCENE, retained
// rather than starting a third unrelated visual vocabulary / feedback engine.
vec2 curl(vec2 p){
  vec2 grad=vec2(0);float amp=.5,freq=1.;
  for(int k=0;k<3;k++){
    vec2 i=floor(p),f=fract(p),u=f*f*(3.-2.*f),du=6.*f*(1.-f);
    float a=hash(i),b=hash(i+vec2(1,0)),c=hash(i+vec2(0,1)),d=hash(i+1.);
    grad+=amp*freq*du*vec2(mix(b-a,d-c,u.y),mix(c-a,d-b,u.x));
    p=p*2.03+7.31;amp*=.5;freq*=2.03;
  }return vec2(grad.y,-grad.x);
}
mat2 rotate(float a){return mat2(cos(a),-sin(a),sin(a),cos(a));}
float luma(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
vec3 grade(vec3 c){
  float l=luma(c);c=mix(vec3(l),c,.51);
  // Dirty titanium highlights; oxidised copper and cold green in the negative.
  c=pow(max(c,vec3(0)),vec3(.87));
  return c*mix(vec3(.68,.91,.90),vec3(1.12,.98,.83),smoothstep(.08,.65,l));
}
void main(){
  float t=timing.x,quiet=timing.w,splice=edit.x,bridge=edit.y;
  float aspect=resolution.x/resolution.y;
  vec2 p=uv-.5;p.x*=aspect;p=rotate(camera.w)*p;p.x/=aspect;
  p=p/camera.x+camera.yz;
  vec2 drift=curl(vec2(uv.x*aspect,uv.y)*2.7+vec2(t*.031,-t*.022));
  float band=1.-smoothstep(.018,.052,abs(uv.y-(.5+.34*sin(t*.41))));
  float tear=band*splice*(1.-quiet);
  vec2 v=(p+.5-.5)*cover+.5;
  v.x+=tear*.012*sin(uv.y*38.+t*2.);
  v=clamp(v,.002,.998);
  vec2 split=vec2((.7+splice*2.4)*(1.-quiet)/resolution.x,0.);
  vec3 c=texture(movie,v).rgb;
  c.r=texture(movie,clamp(v+split,.001,.999)).r;
  c.b=texture(movie,clamp(v-split,.001,.999)).b;
  float l=luma(c);
  float edge=abs(l-luma(texture(movie,clamp(v+vec2(2.)/resolution,.001,.999)).rgb));
  c=grade(c);

  // One continuous undercurrent: long filaments, not a centered mandala/card.
  vec2 q=vec2(uv.x*aspect,uv.y)*3.+drift*.16;
  float field=noise(q+vec2(t*.05,-t*.03))+.48*noise(q*2.1+drift*.2-t*.023);
  float veins=pow(.5+.5*sin(field*31.+q.x*1.5-t*.38),12.);
  float dark=1.-smoothstep(.025,.20,l);
  float fringe=smoothstep(.09,.44,abs(uv.x-.5));
  vec3 cold=vec3(.22,.60,.56),copper=vec3(.73,.33,.16);
  vec3 ink=mix(cold,copper,.5+.5*sin(t*.17+uv.y*3.));
  c+=ink*veins*(.055+.16*bridge)*dark*(.45+.55*fringe);

  // Reuse the finished solid sculptures as drifting double exposures. The
  // original camera/geometry/light articulation lives in loadingSignalTableaux.
  vec2 su=(uv-.5)/(1.22+.12*sin(t*.09))+vec2(.5+.035*sin(t*.13),.5);
  vec4 body=texture(sculpture,clamp(su,.001,.999));
  float wipe=smoothstep(-.26,.22,uv.x-uv.y*.32-(.25+.44*sin(t*.19)));
  float bodyAmount=edit.w*(.3+.7*wipe);
  c=mix(c,c*(1.-body.a*.32)+grade(body.rgb)*1.15,bodyAmount);

  // Character screen is a second exposure of the actual light/geometry, not
  // random scrolling text. The original terminal ramp is kept as a glyph atlas.
  vec2 cells=vec2(112.,max(24.,112./aspect*.57));
  vec2 cell=floor(uv*cells),local=fract(uv*cells),center=(cell+.5)/cells;
  vec2 cv=(center-.5)/camera.x*cover+.5+camera.yz*cover;
  float density=luma(texture(movie,clamp(cv,.001,.999)).rgb)*1.4;
  density+=veins*.11+dark*field*.055+luma(body.rgb)*.38;
  float gi=floor(clamp(density*15.,0.,15.));
  float glyph=texture(glyphs,vec2((gi+local.x)/16.,1.-local.y)).r;
  float letterMask=smoothstep(.34,.67,noise(center*4.3+drift*.13+t*.027));
  letterMask*=.35+.65*fringe;
  c=mix(c,c*.74+ink*glyph*(.24+.46*density),edit.z*letterMask);
  c+=ink*edge*(.12+splice*.25);

  // Slit-scan / phosphor remanence from the existing feedback vocabulary.
  // Never feed the current render target back into itself (ping-pong below).
  vec2 hp=(uv-.5)/(1.+.002*timing.y)+.5;
  hp+=drift*.0014*timing.y+vec2(tear*.026,0.);
  vec3 old=texture(previous,clamp(hp,.002,.998)).rgb;
  float persistence=pow(timing.z,max(.1,timing.y));
  c=mix(c,old*.97,persistence);
  c=mix(c,mix(c,old,band*.35),splice);
  // Small halation along a luminous edge, never a whole-screen white flash.
  c+=vec3(.36,.16,.06)*edge*edge*.45*(1.-quiet);
  float grain=(hash(floor(uv*resolution)+floor(t*(quiet>.5?0.:12.)))-.5)*.022;
  c+=grain*(1.-quiet);
  float scan=1.-.035*(.5+.5*sin(uv.y*resolution.y*3.14159265));
  c*=scan*(1.-.34*pow(length((uv-.5)*vec2(1.,.86)),1.7));
  frag=vec4(clamp(c,0.,.96),1.);
}`;

/** Aspect-correct cover; never stretch footage or expose an edge during a pan. */
export function signalCover(width, height, videoWidth, videoHeight) {
  const target = Math.max(1, width) / Math.max(1, height);
  const source = Math.max(1, videoWidth) / Math.max(1, videoHeight);
  return target > source ? [1, source / target] : [target / source, 1];
}

/** Returns null on unsupported hosts. Failure is always the original movie. */
export function attachIntroSignalRemix(video, { document = video?.ownerDocument, env = globalThis, onError = () => {} } = {}) {
  if (!video?.parentNode || !document?.createElement) return null;
  const existing = video.__sfSignalRemix;
  if (existing) return existing;
  const canvas = document.createElement('canvas');
  canvas.className = 'intro-signal-remix';
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {
    position: 'absolute', inset: '0', width: '100%', height: '100%',
    display: 'none', pointerEvents: 'none',
  });
  let gl;
  try { gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false }); }
  catch (error) { try { onError(error); } catch {} return null; }
  if (!gl) { try { onError(new Error('WebGL2 unavailable')); } catch {} return null; }
  let disposed = false, failed = false, running = false, reducedMotion = false, reducedFlash = false;
  let raf = null, vf = null, startTime = null, elapsed = 0, lastPaint = 0, nextPaint = 0, lastSculpture = -Infinity;
  let width = 0, height = 0, index = 0, frameCount = 0, sculptureCount = 0;
  const savedRate = video.playbackRate;
  const textures = [], fbos = [], shaders = [];
  let program = null, vao = null, tableaux = null;
  const rafCall = fn => env.requestAnimationFrame(fn);
  const cancel = () => {
    if (raf != null) env.cancelAnimationFrame?.(raf);
    if (vf != null) video.cancelVideoFrameCallback?.(vf);
    raf = vf = null;
  };
  function release() {
    if (tableaux) tableaux.dispose();
    tableaux = null;
    for (const f of fbos) gl.deleteFramebuffer(f);
    for (const t of textures) gl.deleteTexture(t);
    for (const s of shaders) gl.deleteShader(s);
    if (program) gl.deleteProgram(program);
    if (vao) gl.deleteVertexArray(vao);
    fbos.length = textures.length = shaders.length = 0;
  }
  function fail(error) {
    if (failed || disposed) return;
    failed = true; running = false; cancel(); canvas.style.display = 'none';
    try { onError(error || new Error('Signal context lost')); } catch {}
    try { video.playbackRate = savedRate; } catch {}
    try { release(); } catch {}
  }
  function texture(unit) {
    const tex = gl.createTexture(); textures.push(tex);
    gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    return tex;
  }
  let movieTexture, bodyTexture, glyphTexture, history, uniforms;
  try {
    program = gl.createProgram();
    for (const [type, source] of [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, SIGNAL_FRAGMENT]]) {
      const shader = gl.createShader(type); shaders.push(shader);
      gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program); vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    uniforms = Object.fromEntries(['movie','previous','sculpture','glyphs','resolution','cover','camera','edit','timing']
      .map(key => [key, gl.getUniformLocation(program, key)]));
    movieTexture = texture(0); bodyTexture = texture(2); glyphTexture = texture(3);
    const atlas = document.createElement('canvas'); atlas.width = 256; atlas.height = 24;
    const ink = atlas.getContext('2d');
    if (!ink) throw new Error('No glyph atlas context');
    ink.fillStyle = '#000'; ink.fillRect(0, 0, 256, 24); ink.fillStyle = '#fff';
    ink.font = '18px monospace'; ink.textAlign = 'center'; ink.textBaseline = 'middle';
    for (let i = 0; i < 16; i++) ink.fillText(SIGNAL_REMIX.glyphs[i], i * 16 + 8, 12);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
    history = [texture(1), texture(1)];
    for (const tex of history) {
      const fbo = gl.createFramebuffer(); fbos.push(fbo); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    tableaux = createSignalTableaux({ document, quick: true });
    gl.uniform1i(uniforms.movie, 0); gl.uniform1i(uniforms.previous, 1);
    gl.uniform1i(uniforms.sculpture, 2); gl.uniform1i(uniforms.glyphs, 3);
    video.parentNode.insertBefore(canvas, video.nextSibling);
  } catch (error) { try { onError(error); } catch {} try { release(); } catch {} return null; }

  function resize() {
    const box = video.parentNode?.getBoundingClientRect?.();
    const w = box?.width || video.clientWidth || 1280, h = box?.height || video.clientHeight || 720;
    const scale = Math.min(1, SIGNAL_REMIX.maxWidth / w, SIGNAL_REMIX.maxHeight / h);
    const rw = Math.max(2, Math.round(w * scale)), rh = Math.max(2, Math.round(h * scale));
    if (rw === width && rh === height) return;
    canvas.width = width = rw; canvas.height = height = rh;
    gl.viewport(0, 0, width, height);
    for (let i = 0; i < history.length; i++) {
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, history[i]);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbos[i]);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Incomplete signal buffer');
      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    lastSculpture = -Infinity; index = 0;
  }
  function draw(time, sourceTime = video.currentTime || 0, dt = 1 / 30) {
    if (disposed || failed || video.readyState < 2 || !video.videoWidth) return false;
    try {
      resize();
      const t = reducedMotion ? 12 : finiteTime(time);
      const score = sampleSignalRemix(t, sourceTime, reducedFlash);
      gl.useProgram(program); gl.bindVertexArray(vao);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, movieTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
      if (t < lastSculpture || t - lastSculpture >= 1 / SIGNAL_REMIX.sculptureHz || reducedMotion) {
        const sw = Math.min(720, width), sh = Math.max(2, Math.round(sw * height / width));
        const image = tableaux.render({ width: sw, height: sh, aspect: width / height,
          time: t * (reducedFlash ? .32 : 1.12) + 41, act: -1, reduced: reducedMotion, emitter: true });
        if (image) {
          gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, bodyTexture);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
          sculptureCount++;
        }
        lastSculpture = t;
      }
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, history[index]);
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, glyphTexture);
      gl.uniform2f(uniforms.resolution, width, height);
      gl.uniform2fv(uniforms.cover, signalCover(width, height, video.videoWidth, video.videoHeight));
      gl.uniform4f(uniforms.camera, score.zoom, score.panX, score.panY, score.roll);
      gl.uniform4f(uniforms.edit, score.splice, score.bridge, score.glyph, score.sculpture);
      gl.uniform4f(uniforms.timing, t, clamp(dt * 30, .1, 3), frameCount ? score.echo : 0, reducedFlash || reducedMotion ? 1 : 0);
      const next = 1 - index;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbos[next]); gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fbos[next]); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
      gl.blitFramebuffer(0, 0, width, height, 0, 0, width, height, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      index = next; frameCount++; canvas.style.display = 'block'; return true;
    } catch (error) { fail(error); return false; }
  }
  function schedule() {
    if (!running || disposed || failed || reducedMotion) return;
    if (!reducedFlash && typeof video.requestVideoFrameCallback === 'function') vf = video.requestVideoFrameCallback(tick);
    else raf = rafCall(tick);
  }
  function tick(timestamp) {
    raf = vf = null;
    if (!running || disposed || failed) return;
    if (startTime == null) startTime = timestamp - elapsed * 1000;
    elapsed = Math.max(0, (timestamp - startTime) / 1000);
    if (timestamp + .1 >= nextPaint) {
      const dt = lastPaint ? Math.min(.1, Math.max(.001, (timestamp - lastPaint) / 1000)) : 1 / 30;
      draw(elapsed, video.currentTime, dt); lastPaint = timestamp;
      nextPaint = Math.max(nextPaint + 1000 / SIGNAL_REMIX.fps, timestamp);
    }
    schedule();
  }
  function setRate() {
    if (disposed || failed) return;
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : SIGNAL_REMIX.sourceSeconds;
    try { video.playbackRate = clamp(duration / SIGNAL_REMIX.loopSeconds, 1, 2); } catch {}
  }
  const onContextLost = event => { event.preventDefault(); fail(); };
  canvas.addEventListener('webglcontextlost', onContextLost);
  video.addEventListener('loadedmetadata', setRate);
  const ctl = {
    canvas,
    resume() {
      if (disposed || failed || running) return;
      setRate(); running = !reducedMotion; startTime = null; lastPaint = nextPaint = 0;
      if (reducedMotion) draw(12); else schedule();
    },
    pause() { running = false; cancel(); startTime = null; },
    preferences({ motion = false, flash = false } = {}) {
      const changed = motion !== reducedMotion || flash !== reducedFlash;
      reducedMotion = motion; reducedFlash = flash;
      if (!changed || disposed || failed) return;
      const wasRunning = running;
      ctl.pause(); lastSculpture = -Infinity;
      if (wasRunning && motion) draw(12); else if (wasRunning) ctl.resume();
    },
    renderAt(time, sourceTime = video.currentTime, dt = 1 / 30) { return draw(time, sourceTime, dt); },
    inspect() { return { running, disposed, failed, frameCount, sculptureCount, width, height, reducedMotion, reducedFlash }; },
    destroy() {
      if (disposed) return;
      ctl.pause(); disposed = true;
      canvas.removeEventListener('webglcontextlost', onContextLost);
      video.removeEventListener('loadedmetadata', setRate);
      try { release(); } catch {}
      try { video.playbackRate = savedRate; } catch {}
      canvas.remove();
      if (video.__sfSignalRemix === ctl) delete video.__sfSignalRemix;
    },
  };
  video.__sfSignalRemix = ctl;
  return ctl;
}
