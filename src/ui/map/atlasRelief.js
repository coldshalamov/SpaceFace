// The atlas terrain sits behind the Canvas2D navigation marks and DOM controls.
// Only authored zones and ore fields shape the relief. The sky texture carries no map data.
const MAX_FEATURES = 20;
export const ATLAS_ART_URL = new URL('../../../assets/ui/generated/chart/atlas/atlas-relief.webp', import.meta.url).href;
const ATLAS_ENGRAVING_URL = new URL('../../../assets/ui/generated/chart/atlas/atlas-engravings.webp', import.meta.url).href;

const VERTEX = `#version 300 es
out vec2 vUv;
void main() {
  vUv = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(vUv * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 ink;
uniform vec2 uSize, uOrigin;
uniform float uTile;
uniform sampler2D uArt, uEngraving;
uniform bool uHasEngraving;
uniform int uCount;
uniform vec4 uFeature[${MAX_FEATURES}];

float grain(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * .1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

float inkNoise(vec2 p) {
  vec2 f = fract(p);
  vec2 i = floor(p);
  f = f * f * (3. - 2. * f);
  return mix(mix(grain(i), grain(i + vec2(1, 0)), f.x),
             mix(grain(i + vec2(0, 1)), grain(i + vec2(1)), f.x), f.y);
}

float engravedInk(vec2 offset, float radius, float kind) {
  float tile = kind - 1.;
  vec2 quadrant = vec2(mod(tile, 2.), floor(tile * .5));
  vec2 uv = (quadrant + offset * .43 + .5) * .5;
  float lod = clamp(log2(230. / max(1., radius)), 0., 5.);
  return textureLod(uEngraving, uv, lod).r;
}

void main() {
  vec2 px = vec2(vUv.x, 1. - vUv.y) * uSize;
  vec2 sky = (px - uOrigin) / uTile + vec2(.49, .54);
  vec3 texel = texture(uArt, sky).rgb;
  float fibre = grain(gl_FragCoord.xy);
  float broad = inkNoise(sky * 7. + vec2(2.1, .7));
  vec3 plate = mix(vec3(.045, .066, .080), vec3(.087, .118, .141), broad);
  plate += texel * .64 + (fibre - .5) * .017;

  vec3 wash = vec3(0.);
  float relief = 0.;
  for (int i = 0; i < uCount; ++i) {
    vec4 feature = uFeature[i];
    vec2 offset = (px - feature.xy) / feature.z;
    float distance = length(offset);
    if (distance > 1.05) continue;
    float shade = inkNoise(offset * 7. + float(i) * 13.);
    float rim = 1. - smoothstep(.76 + .14 * shade, 1., distance);
    float engraving = uHasEngraving ? engravedInk(offset, feature.z, feature.w) : shade * .24;
    vec3 tint = vec3(.21, .34, .38);
    if (feature.w == 2.) tint = vec3(.54, .29, .25);
    if (feature.w == 3.) tint = vec3(.56, .42, .25);
    if (feature.w == 4.) tint = vec3(.36, .34, .49);
    float deposit = rim * (.06 + max(0., engraving - .075) * 1.95 + shade * .08);
    if (feature.w != 1.) deposit *= 1.37;
    if (deposit > relief) { wash = mix(wash, tint * deposit, .80); relief = deposit; }
  }
  ink = vec4(plate + wash, 1.);
}`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  gl.deleteShader(shader);
  return null;
}

function createProgram(gl) {
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
  let program = null;
  if (vertex && fragment) {
    program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      program = null;
    }
  }
  if (vertex) gl.deleteShader(vertex);
  if (fragment) gl.deleteShader(fragment);
  return program;
}

export function createAtlasRelief(canvas, invalidate) {
  const gl = canvas?.getContext?.('webgl2', { alpha: false, depth: false, antialias: false, powerPreference: 'low-power' });
  if (!gl || typeof gl.createShader !== 'function') return null;

  const featureData = new Float32Array(MAX_FEATURES * 4);
  let resources = null;
  let art = null;
  let engraving = null;
  let lastKey = '';
  const artImage = new Image();
  const engravingImage = new Image();

  function upload(unit, texture, image) {
    gl.activeTexture(unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    lastKey = '';
  }

  function allocateTexture(unit, wrap) {
    const texture = gl.createTexture();
    gl.activeTexture(unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    return texture;
  }

  function init() {
    const program = createProgram(gl);
    if (!program) return false;
    const texture = allocateTexture(gl.TEXTURE0, gl.MIRRORED_REPEAT);
    const engravedTexture = allocateTexture(gl.TEXTURE1, gl.CLAMP_TO_EDGE);
    gl.useProgram(program);
    const location = (name) => gl.getUniformLocation(program, name);
    resources = { program, texture, engravedTexture, size: location('uSize'), origin: location('uOrigin'), tile: location('uTile'),
      count: location('uCount'), features: location('uFeature[0]'), hasEngraving: location('uHasEngraving') };
    gl.uniform1i(location('uArt'), 0);
    gl.uniform1i(location('uEngraving'), 1);
    if (art) upload(gl.TEXTURE0, texture, art);
    if (engraving) upload(gl.TEXTURE1, engravedTexture, engraving);
    return true;
  }

  if (!init()) return null;
  artImage.onload = () => {
    art = artImage;
    if (resources) upload(gl.TEXTURE0, resources.texture, art);
    invalidate();
  };
  engravingImage.onload = () => {
    engraving = engravingImage;
    if (resources) upload(gl.TEXTURE1, resources.engravedTexture, engraving);
    invalidate();
  };
  artImage.src = ATLAS_ART_URL;
  engravingImage.src = ATLAS_ENGRAVING_URL;

  function onLost(event) {
    event.preventDefault();
    resources = null;
    canvas.hidden = true;
    lastKey = '';
    invalidate();
  }
  function onRestored() {
    if (init()) invalidate();
  }
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);

  return {
    paint(width, height, originX, originY, tile, features) {
      if (!resources || !(width > 0 && height > 0)) return false;
      const count = Math.min(MAX_FEATURES, features.length);
      const key = `${width},${height},${originX.toFixed(1)},${originY.toFixed(1)},${tile.toFixed(1)}|${features.slice(0, count).join('|')}`;
      if (key === lastKey) return true;
      lastKey = key;
      const scale = Math.min(1, 1440 / width, 960 / height);
      const w = Math.max(1, Math.round(scale * width));
      const h = Math.max(1, Math.round(scale * height));
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(resources.size, width, height);
      gl.uniform2f(resources.origin, originX, originY);
      gl.uniform1f(resources.tile, tile);
      gl.uniform1i(resources.hasEngraving, engraving ? 1 : 0);
      gl.uniform1i(resources.count, count);
      for (let i = 0; i < count; i += 1) featureData.set(features[i], i * 4);
      if (count) gl.uniform4fv(resources.features, featureData);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      canvas.hidden = false;
      return true;
    },
    dispose() {
      artImage.onload = null;
      engravingImage.onload = null;
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      if (resources) {
        gl.deleteTexture(resources.texture);
        gl.deleteTexture(resources.engravedTexture);
        gl.deleteProgram(resources.program);
      }
    },
  };
}
