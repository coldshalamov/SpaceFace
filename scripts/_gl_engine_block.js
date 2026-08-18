function createEngineGL(host) {
  'use strict';
  const ACTS = 5, ACT_LEN = 6.5, LOOP_LEN = ACTS * ACT_LEN;
  const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
  const lerp = (a, b, t) => a + (b - a) * t;

  function fallback2D(reason) {
    try { if (host.post) host.post({ type: 'glFallback', reason: String(reason) }); } catch {}
    if (host.engine2D) return host.engine2D(host);
    return { receive() {} };
  }

  // ── validate the whole GL stack on a THROWAWAY canvas first ─────────────
  // Programs are not shareable across contexts, so this compiles everything
  // once on a scratch context; only a fully passing pipeline ever touches
  // the real canvas's context slot.
  let validated = false;
  try {
    if (typeof OffscreenCanvas !== 'function') return fallback2D('no-offscreen');
    const scratch = new OffscreenCanvas(8, 8);
    const sgl = scratch.getContext('webgl2', { antialias: false });
    if (!sgl) return fallback2D('no-webgl2');
    const cShader = (gl2, type, src) => {
      const sh = gl2.createShader(type);
      gl2.shaderSource(sh, src);
      gl2.compileShader(sh);
      if (!gl2.getShaderParameter(sh, gl2.COMPILE_STATUS)) throw new Error(gl2.getShaderInfoLog(sh));
      return sh;
    };
    const sv = cShader(sgl, sgl.VERTEX_SHADER, GLSL_VERT);
    for (let a = 0; a < ACTS; a++) {
      const p = sgl.createProgram();
      sgl.attachShader(p, sv);
      sgl.attachShader(p, cShader(sgl, sgl.FRAGMENT_SHADER, glslSceneSrc(a)));
      sgl.linkProgram(p);
      if (!sgl.getProgramParameter(p, sgl.LINK_STATUS)) throw new Error(sgl.getProgramInfoLog(p));
    }
    const pp = sgl.createProgram();
    sgl.attachShader(pp, sv);
    sgl.attachShader(pp, cShader(sgl, sgl.FRAGMENT_SHADER, GLSL_POST));
    sgl.linkProgram(pp);
    if (!sgl.getProgramParameter(pp, sgl.LINK_STATUS)) throw new Error(sgl.getProgramInfoLog(pp));
    validated = true;
  } catch (e) {
    return fallback2D('validate:' + e.message);
  }
  if (!validated) return fallback2D('validate-false');

  // ── live state ──────────────────────────────────────────────────────────
  let gl = null, canvas = null, ctx2dWave = null;
  let W = 640, H = 380, WW = 200, WH = 48;
  let progScene = [], progPost = null, quadBuf = null;
  let sceneTex = null, sceneFb = null, atlasTex = null;
  let renderScale = 1.0;
  let hdrOK = false;
  let dead = false;
  let running = false, rafId = null;
  let T = 0, lastNow = 0;
  let progress = 0.05, progressShown = 0.05;
  let gx = 0, gy = 0, gxT = 0, gyT = 0, lastPointerAt = -10;
  let reduced = false;
  let labAct = -1, labFreeze = false;
  let frameCounter = 0, frameCostAvg = 10;
  let energy = 0.3;
  const energyHist = new Float32Array(64).fill(0.1);
  let energyIdx = 0;
  let uLocalCache = 0;

  // uniform array scratch (allocated once)
  const segData = new Float32Array(70 * 4);
  const cabData = new Float32Array(7 * 4);
  const avData = new Float32Array(10 * 4);
  const boxData = new Float32Array(26 * 4);
  const boxDim = new Float32Array(26 * 4);
  const boxCol = new Float32Array(26 * 4);
  const beam0 = new Float32Array(3 * 4);
  const beam1 = new Float32Array(3 * 4);
  const expData = new Float32Array(4);
  const debData = new Float32Array(16 * 4);
  const debCol = new Float32Array(16 * 4);
  const arcData = new Float32Array(20 * 4);
  const arcCol = new Float32Array(20 * 4);
  let boxCount = 0;

  function compile(gl2, type, src) {
    const sh = gl2.createShader(type);
    gl2.shaderSource(sh, src);
    gl2.compileShader(sh);
    if (!gl2.getShaderParameter(sh, gl2.COMPILE_STATUS)) {
      throw new Error('shader: ' + gl2.getShaderInfoLog(sh));
    }
    return sh;
  }
  function link(gl2, vsSrc, fsSrc) {
    const p = gl2.createProgram();
    gl2.attachShader(p, compile(gl2, gl2.VERTEX_SHADER, vsSrc));
    gl2.attachShader(p, compile(gl2, gl2.FRAGMENT_SHADER, fsSrc));
    gl2.linkProgram(p);
    if (!gl2.getProgramParameter(p, gl2.LINK_STATUS)) {
      throw new Error('link: ' + gl2.getProgramInfoLog(p));
    }
    return p;
  }

  function buildAtlasTex(gl2) {
    let ac;
    if (typeof OffscreenCanvas === 'function') ac = new OffscreenCanvas(16 * 16, 16);
    else if (host.document && host.document.createElement) {
      ac = host.document.createElement('canvas');
      ac.width = 16 * 16; ac.height = 16;
    } else return null;
    const c2 = ac.getContext('2d');
    c2.fillStyle = '#000';
    c2.fillRect(0, 0, ac.width, ac.height);
    c2.fillStyle = '#fff';
    c2.font = 'bold 14px "IBM Plex Mono","Consolas",monospace';
    c2.textAlign = 'center';
    c2.textBaseline = 'middle';
    const ramp = ' .:;=+*xX#%@MB8';
    for (let i = 0; i < 16; i++) c2.fillText(ramp[i], i * 16 + 8, 9);
    const tex = gl2.createTexture();
    gl2.bindTexture(gl2.TEXTURE_2D, tex);
    gl2.texImage2D(gl2.TEXTURE_2D, 0, gl2.RGBA, gl2.RGBA, gl2.UNSIGNED_BYTE, ac);
    gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_MIN_FILTER, gl2.LINEAR);
    gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_MAG_FILTER, gl2.LINEAR);
    gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_WRAP_S, gl2.CLAMP_TO_EDGE);
    gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_WRAP_T, gl2.CLAMP_TO_EDGE);
    return tex;
  }

  function makeFBO(gl2, w, h) {
    const tex = gl2.createTexture();
    gl2.bindTexture(gl2.TEXTURE_2D, tex);
    gl2.texImage2D(gl2.TEXTURE_2D, 0, hdrOK ? gl2.RGBA16F : gl2.RGBA8, w, h, 0, gl2.RGBA, hdrOK ? gl2.HALF_FLOAT : gl2.UNSIGNED_BYTE, null);
    gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_MIN_FILTER, gl2.LINEAR_MIPMAP_LINEAR);
    gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_MAG_FILTER, gl2.LINEAR);
    gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_WRAP_S, gl2.CLAMP_TO_EDGE);
    gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_WRAP_T, gl2.CLAMP_TO_EDGE);
    gl2.generateMipmap(gl2.TEXTURE_2D);
    const fb = gl2.createFramebuffer();
    gl2.bindFramebuffer(gl2.FRAMEBUFFER, fb);
    gl2.framebufferTexture2D(gl2.FRAMEBUFFER, gl2.COLOR_ATTACHMENT0, gl2.TEXTURE_2D, tex, 0);
    const ok = gl2.checkFramebufferStatus(gl2.FRAMEBUFFER) === gl2.FRAMEBUFFER_COMPLETE;
    gl2.bindFramebuffer(gl2.FRAMEBUFFER, null);
    return ok ? { tex, fb } : null;
  }

  function init(msg) {
    canvas = msg.canvas;
    try {
      gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, powerPreference: 'high-performance' });
    } catch { gl = null; }
    if (!gl) throw new Error('real-context-failed');
    try { hdrOK = !!gl.getExtension('EXT_color_buffer_float'); } catch { hdrOK = false; }
    W = msg.width || 640; H = msg.height || 380;
    if (msg.waveformCanvas) {
      ctx2dWave = msg.waveformCanvas.getContext('2d');
      WW = msg.waveWidth || 200; WH = msg.waveHeight || 48;
    }
    reduced = !!msg.reducedMotion;
    for (let a = 0; a < ACTS; a++) progScene.push(link(gl, GLSL_VERT, glslSceneSrc(a)));
    progPost = link(gl, GLSL_VERT, GLSL_POST);
    quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    atlasTex = buildAtlasTex(gl);
    if (!atlasTex) throw new Error('no-atlas');
    const f = makeFBO(gl, Math.max(2, Math.round(W * renderScale)), Math.max(2, Math.round(H * renderScale)));
    if (!f) throw new Error('no-fbo');
    sceneTex = f.tex; sceneFb = f.fb;
    gl.viewport(0, 0, W, H);
    running = true;
    rafId = host.raf(frame);
  }

  function resizeFBO() {
    try {
      const f = makeFBO(gl, Math.max(2, Math.round(W * renderScale)), Math.max(2, Math.round(H * renderScale)));
      if (f) {
        if (sceneTex) gl.deleteTexture(sceneTex);
        if (sceneFb) gl.deleteFramebuffer(sceneFb);
        sceneTex = f.tex; sceneFb = f.fb;
      }
    } catch {}
  }

  // ── choreography (JS side; feeds uniform arrays) ────────────────────────
  function choreograph(act, u) {
    boxCount = 0;
    if (act === 0) {
      const turn = clamp(gx * 0.45 + Math.sin(T * 0.35) * 0.12, -0.5, 0.5);
      const breath = Math.sin(T * 1.1) * 0.7;
      const pulse = (T * 0.55) % 1;
      const SEG = 10;
      for (let c = 0; c < 7; c++) {
        const side = c % 2 === 0 ? -1 : 1;
        const rootX = turn * 8 + side * (17 + (c % 3) * 2.4);
        const rootY = -24 + ((c / 2) | 0) * 7 + breath;
        const endX = turn * 8 + side * (46 + hash01(c * 9.1) * 12);
        const endY = 56 - hash01(c * 5.1) * 8;
        const pf = (pulse + c * 0.143) % 1;
        for (let s = 0; s < SEG; s++) {
          const f0 = s / SEG, f1 = (s + 1) / SEG;
          const sag = (ff) => Math.sin(ff * Math.PI) * (10 + hash01(c * 3.1) * 8) * (1 - ff * 0.3);
          const wob = (ff) => Math.sin(T * 1.3 + c * 2 + ff * 5) * 1.4 * ff;
          const o = (c * SEG + s) * 4;
          segData[o] = lerp(rootX, endX, f0) + wob(f0) * 0.4;
          segData[o + 1] = lerp(rootY, endY, f0) + sag(f0) + wob(f0);
          segData[o + 2] = lerp(rootX, endX, f1) + wob(f1) * 0.4;
          segData[o + 3] = lerp(rootY, endY, f1) + sag(f1) + wob(f1);
        }
        const co = c * 4;
        cabData[co] = Math.abs(pf - 0.5) < 0.09 ? 1.0 : 0.15;
        cabData[co + 1] = 0;
        cabData[co + 2] = 0.3;
        cabData[co + 3] = 0.5;
      }
      energy = 0.25 + Math.max(0, Math.sin(T * 2.4)) * 0.1;
    } else if (act === 1) {
      const aspect = W / H;
      const camX = Math.sin(T * 0.2) * 2, camY = 4 + u * 6, camZ = T * 24 + 20;
      for (let lane = 0; lane < 3; lane++) {
        const ly = 2 + lane * 4, dir = lane % 2 === 0 ? 1 : -1, speed = 26 + lane * 9;
        for (let vi = 0; vi < 3; vi++) {
          const idx = lane * 3 + vi;
          const wx = dir > 0 ? -30 + ((T * speed + vi * 26 + lane * 11) % 64) : 30 - ((T * speed + vi * 26 + lane * 11) % 64);
          const wz = camZ + 30 + lane * 12;
          const cz = wz - camZ;
          if (cz <= 1) { avData[idx * 4 + 2] = 0; continue; }
          avData[idx * 4] = 0.5 + ((wx - camX) / (cz * 1.15 * aspect)) * 0.5;
          avData[idx * 4 + 1] = 0.5 - ((ly - camY) / (cz * 1.15)) * 0.5;
          avData[idx * 4 + 2] = clamp(1 - cz / 120, 0.05, 1) * 900;
          avData[idx * 4 + 3] = lane === 1 ? 1 : 0;
        }
      }
      const bolt = Math.max(0, 1 - Math.abs(u - 0.5) / 0.012) + Math.max(0, 1 - Math.abs(u - 0.82) / 0.008);
      expData[0] = clamp(bolt, 0, 1);
      energy = 0.35 + expData[0] * 0.6;
    } else if (act === 2) {
      const pushBox = (x, y, z, hx, hy, hz, yaw, roll, shade, tint, glow) => {
        if (boxCount >= 26) return;
        const o = boxCount * 4;
        boxData[o] = x; boxData[o + 1] = y; boxData[o + 2] = z; boxData[o + 3] = yaw;
        boxDim[o] = hx; boxDim[o + 1] = hy; boxDim[o + 2] = hz; boxDim[o + 3] = roll;
        boxCol[o] = shade; boxCol[o + 1] = tint; boxCol[o + 2] = glow; boxCol[o + 3] = 0;
        boxCount++;
      };
      const destroyed = u > 0.55;
      const fYaw = 0.35 + Math.sin(T * 0.3) * 0.06;
      const fRoll = Math.sin(T * 0.5) * 0.05;
      const fBX = Math.sin(T * 0.4) * 2, fBY = Math.sin(T * 0.7) * 1.2;
      const FRIG = [[0, 0, 0, 16, 3.2, 6], [2, 4.2, -3, 5, 2.6, 3.4], [0, 0, -8.5, 7, 2.4, 3], [0, -4.6, 2, 10, 0.8, 4], [-13, 1, -1, 3.4, 3.4, 3.4], [13, 1, -1, 3.4, 3.4, 3.4]];
      if (!destroyed) {
        for (let i = 0; i < FRIG.length; i++) {
          const b = FRIG[i];
          pushBox(b[0] + fBX, b[1] + fBY, b[2], b[3], b[4], b[5], fYaw, fRoll, 0.55, 0, 0);
        }
        for (let e = -1; e <= 1; e++)
          pushBox(e * 3.4 * Math.cos(fYaw) - 11.4 * Math.sin(fYaw) + fBX, fBY + 0.1, -e * 3.4 * Math.sin(fYaw) - 11.4 * Math.cos(fYaw), 0.7, 0.7, 0.7, 0, 0, 0.2, 1, 1.4);
      } else {
        const dT = (u - 0.55) / 0.45;
        for (let i = 0; i < 16; i++) {
          const ang = hash01(i * 4.4) * Math.PI * 2;
          const spd = 10 + hash01(i * 8.8) * 26;
          const dd = Math.pow(dT, 3) * spd * 2.2;
          pushBox(fBX + Math.cos(ang) * dd, fBY + Math.sin(ang) * dd * 0.6 + dT * dT * -6, Math.sin(ang) * dd * 0.4,
            0.8 + hash01(i * 2.2) * 1.4, 0.7, 0.9, ang, dT * 9, 0.4, i % 3 === 0 ? 1 : 0,
            Math.max(0, 0.9 - dT) * (Math.cos(dT * 20 + i * 2.4) > 0.4 ? 1.0 : 0.3));
        }
        if (u > 0.62) {
          const eT = (u - 0.62) / 0.38;
          pushBox(lerp(40, 66, eT), 10 - eT * 6, -8 - eT * 14, 4.4, 0.9, 1.6, 1.4, 0.4, 0.8, 0, 0.4);
        }
        expData[0] = dT;
        expData[1] = fBX; expData[2] = fBY; expData[3] = 0;
      }
      if (!destroyed || u < 0.62) {
        const runT = clamp(u / 0.55, 0, 1);
        const ix = lerp(-52, 40, runT) + Math.sin(runT * Math.PI) * -6;
        const iy = 10 + Math.sin(runT * Math.PI * 1.6) * 7;
        const iz = lerp(18, -8, runT);
        const iYaw = 1.2 + Math.sin(u * 6) * 0.15;
        pushBox(ix, iy, iz, 4.4, 0.9, 1.6, iYaw, Math.sin(T * 3) * 0.3, 0.8, 0, 0);
        pushBox(ix, iy, iz + 2.6, 1.1, 0.4, 2.4, iYaw, 0, 0.9, 0, 0);
        const volley = Math.floor(u / 0.14);
        const vPhase = (u % 0.14) / 0.14;
        for (let bi = 0; bi < 3; bi++) {
          const on = (!destroyed && volley === bi && vPhase < 0.42) ? Math.max(0, 1 - vPhase * 1.8) : 0;
          beam0[bi * 4] = ix + 5; beam0[bi * 4 + 1] = iy; beam0[bi * 4 + 2] = iz + 2; beam0[bi * 4 + 3] = on;
          beam1[bi * 4] = fBX - 4 + volley * 5; beam1[bi * 4 + 1] = 2 + fBY; beam1[bi * 4 + 2] = 6; beam1[bi * 4 + 3] = 0;
        }
        energy = 0.75;
      } else {
        energy = 0.5;
      }
    } else if (act === 3) {
      const arcPhase = (T % 1.4) / 1.4;
      arcCol.fill(0);
      if (arcPhase < 0.06 && !reduced) {
        const seed = Math.floor(T / 1.4);
        const hR = 8 + (0.5 + Math.sin(T * 1.15) * 0.28) * 3;
        for (let aI = 0; aI < 2; aI++) {
          const a0x = Math.sin(seed * 3.1 + aI * 2.7) * hR;
          const a0y = -2 + Math.sin(seed * 5.3 + aI * 1.3) * hR * 0.88;
          const a1x = Math.cos(seed * 7.1 + aI) * 46;
          const a1y = -2 + Math.sin(seed * 11.2 + aI) * 40;
          let px0 = a0x, py0 = a0y;
          for (let s = 1; s <= 10; s++) {
            const f = s / 10;
            const jx = (hash01(seed + s * 3.1 + aI * 7) - 0.5) * 9 * (1 - f);
            const jy = (hash01(seed + s * 7.7 + aI * 3) - 0.5) * 9 * (1 - f);
            const px1 = lerp(a0x, a1x, f) + jx;
            const py1 = lerp(a0y, a1y, f) + jy;
            const o = (aI * 10 + s - 1) * 4;
            arcData[o] = px0; arcData[o + 1] = py0; arcData[o + 2] = px1; arcData[o + 3] = py1;
            arcCol[o] = 1.2;
            arcCol[o + 1] = aI;
            px0 = px1; py0 = py1;
          }
        }
        energy = 0.9;
      }
    } else if (act === 4) {
      energy = 0.45 + Math.abs(Math.sin(T * 13)) * 0.1;
    }
  }
  function hash01(n) {
    const x = Math.sin(n) * 43758.5453123;
    return x - Math.floor(x);
  }

  function drawWaveform() {
    if (!ctx2dWave) return;
    ctx2dWave.fillStyle = '#02070a';
    ctx2dWave.fillRect(0, 0, WW, WH);
    ctx2dWave.strokeStyle = 'rgba(90,220,242,0.9)';
    ctx2dWave.lineWidth = 1.2;
    ctx2dWave.beginPath();
    for (let i = 0; i < 64; i++) {
      const v = energyHist[(energyIdx + i) % 64];
      const x = (i / 63) * WW;
      const y = WH * 0.62 - v * WH * 0.52 + Math.sin(i * 0.7 + T * 9) * v * 2.4;
      if (i === 0) ctx2dWave.moveTo(x, y); else ctx2dWave.lineTo(x, y);
    }
    ctx2dWave.stroke();
    ctx2dWave.fillStyle = 'rgba(90,220,242,0.25)';
    for (let i = 0; i < 16; i++) ctx2dWave.fillRect((i / 16) * WW, WH - 2, 1, 2);
  }

  function bindQuad(prog) {
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  }

  function uploadActUniforms(act, prog) {
    const loc4 = (name, data, cnt) => {
      const l = gl.getUniformLocation(prog, name);
      if (l) gl.uniform4fv(l, cnt ? data.subarray(0, cnt * 4) : data);
    };
    if (act === 0) { loc4('uSeg', segData, 70); loc4('uCab', cabData, 7); }
    else if (act === 1) {
      loc4('uAV', avData, 10);
      gl.uniform1f(gl.getUniformLocation(prog, 'uFlash'), expData[0] * (reduced ? 0.2 : 1.0));
    } else if (act === 2) {
      loc4('uB', boxData, 26); loc4('uBD', boxDim, 26); loc4('uBC', boxCol, 26);
      gl.uniform1f(gl.getUniformLocation(prog, 'uBNf'), boxCount);
      loc4('uBeam0', beam0, 3); loc4('uBeam1', beam1, 3);
      loc4('uExp', expData, 1);
      loc4('uDeb', debData, 16); loc4('uDebC', debCol, 16);
    } else if (act === 3) { loc4('uArc', arcData, 20); loc4('uArcC', arcCol, 20); }
  }

  function frame(now) {
    if (!running || dead) return;
    const t0 = Date.now();
    let dt = lastNow ? (now - lastNow) / 1000 : 1 / 60;
    lastNow = now;
    dt = clamp(dt, 0.001, 0.05);
    if (!labFreeze) T += dt;
    progressShown += (progress - progressShown) * Math.min(1, dt * 3);
    if (T - lastPointerAt > 4) {
      gxT = Math.sin(T * 0.3) * 0.4;
      gyT = Math.cos(T * 0.23) * 0.3;
    }
    gx += (gxT - gx) * Math.min(1, dt * 4);
    gy += (gyT - gy) * Math.min(1, dt * 4);

    const tt = T % LOOP_LEN;
    const act = labAct >= 0 ? labAct : Math.floor(tt / ACT_LEN) % ACTS;
    const uLocal = (tt % ACT_LEN) / ACT_LEN;
    uLocalCache = uLocal;
    let glitch = 0;
    if (labAct < 0) {
      if (uLocal > 0.925) glitch = (uLocal - 0.925) / 0.075;
      else if (uLocal < 0.055) glitch = 1 - uLocal / 0.055;
      if (reduced) glitch *= 0.35;
    }
    const powerOn = (labAct === 0 || (labAct < 0 && act === 0 && tt < ACT_LEN)) ? (tt < 0.9 ? tt / 0.9 : -1) : -1;

    if (frameCounter > 0 && frameCounter % 120 === 0) {
      if (frameCostAvg > 22 && renderScale > 0.5) { renderScale = Math.max(0.5, renderScale - 0.25); resizeFBO(); }
      else if (frameCostAvg < 9 && renderScale < 1.0) { renderScale = Math.min(1.0, renderScale + 0.25); resizeFBO(); }
    }

    choreograph(act, uLocal);
    const flash = (act === 1 ? expData[0] : (act === 2 && uLocal > 0.55 && uLocal < 0.62 ? 1 - (uLocal - 0.55) / 0.07 : 0));

    const rw = Math.max(2, Math.round(W * renderScale));
    const rh = Math.max(2, Math.round(H * renderScale));
    try {
      gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFb);
      gl.viewport(0, 0, rw, rh);
      const ps = progScene[act];
      gl.useProgram(ps);
      gl.uniform2f(gl.getUniformLocation(ps, 'uRes'), rw, rh);
      gl.uniform1f(gl.getUniformLocation(ps, 'uT'), T);
      gl.uniform1f(gl.getUniformLocation(ps, 'uU'), uLocal);
      gl.uniform2f(gl.getUniformLocation(ps, 'uGyro'), gx, gy);
      gl.uniform1f(gl.getUniformLocation(ps, 'uProg'), progressShown);
      bindQuad(ps);
      uploadActUniforms(act, ps);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindTexture(gl.TEXTURE_2D, sceneTex);
      gl.generateMipmap(gl.TEXTURE_2D);

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, W, H);
      gl.useProgram(progPost);
      bindQuad(progPost);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sceneTex);
      gl.uniform1i(gl.getUniformLocation(progPost, 'uScene'), 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, atlasTex);
      gl.uniform1i(gl.getUniformLocation(progPost, 'uAtlas'), 1);
      gl.uniform2f(gl.getUniformLocation(progPost, 'uRes'), W, H);
      const cellPx = Math.max(3.5, W / 220.0);
      gl.uniform2f(gl.getUniformLocation(progPost, 'uCellPx'), cellPx, cellPx * 1.9);
      gl.uniform1f(gl.getUniformLocation(progPost, 'uTime'), T);
      gl.uniform1f(gl.getUniformLocation(progPost, 'uGlitch'), glitch);
      gl.uniform1f(gl.getUniformLocation(progPost, 'uPowerOn'), powerOn);
      gl.uniform1f(gl.getUniformLocation(progPost, 'uFlash'), flash * (reduced ? 0.15 : 1.0) * 0.22);
      gl.uniform1f(gl.getUniformLocation(progPost, 'uGrille'), 1.0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    } catch (e) {
      // A mid-run GL failure kills only the animation, never the game.
      running = false;
      dead = true;
      try { if (host.post) host.post({ type: 'glRuntimeError', message: String(e) }); } catch {}
      return;
    }

    drawWaveform();
    energyHist[energyIdx] = energy;
    energyIdx = (energyIdx + 1) % 64;
    energy *= 0.96;

    frameCostAvg = frameCostAvg * 0.92 + (Date.now() - t0) * 0.08;
    frameCounter++;
    rafId = host.raf(frame);
  }

  return {
    receive(msg) {
      if (!msg || dead) return;
      switch (msg.type) {
        case 'init':
          try {
            init(msg);
          } catch (e) {
            dead = true;
            try { if (host.post) host.post({ type: 'glInitError', message: String(e) }); } catch {}
          }
          break;
        case 'progress': progress = clamp(Number(msg.progress) || 0, 0, 1); break;
        case 'pointer':
          gxT = clamp(Number(msg.x) || 0, -1, 1);
          gyT = clamp(Number(msg.y) || 0, -1, 1);
          lastPointerAt = T;
          break;
        case 'stop':
          running = false;
          if (rafId != null) host.cancel(rafId);
          rafId = null;
          break;
        case 'start':
          if (!running && gl && !dead) { running = true; lastNow = 0; rafId = host.raf(frame); }
          break;
        case 'lab':
          if (msg.act !== undefined) labAct = Number(msg.act);
          labFreeze = !!msg.freeze;
          if (msg.t !== undefined) T = Number(msg.t);
          if (msg.reduced !== undefined) reduced = !!msg.reduced;
          break;
      }
    },
  };
}
