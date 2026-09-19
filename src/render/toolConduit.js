// A tool transfers energy or matter through three folded, helical filaments. The two existing
// beam draws share this fixed mesh; endpoints and power are uniform writes, never vertex uploads.
import { BufferGeometry, Float32BufferAttribute } from 'three';

export function createToolConduitGeometry() {
  const positions = [], uvs = [], strands = [], index = [];
  const stations = 32, across = 7;
  for (let strand = 0; strand < 3; strand++) {
    const base = positions.length / 3;
    for (let s = 0; s <= stations; s++) {
      for (let k = 0; k < across; k++) {
        positions.push(0, 0, 0); uvs.push(s / stations, k / (across - 1)); strands.push(strand);
      }
      if (s < stations) for (let k = 0; k < across - 1; k++) {
        const a = base + s * across + k;
        index.push(a, a + 1, a + across, a + 1, a + across + 1, a + across);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('aConduitStrand', new Float32BufferAttribute(strands, 1));
  geometry.setIndex(index);
  return geometry;
}

export function installToolConduitShader(material, shared, role) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uSfBeamTime: shared.time, uSfBeamFlow: shared.flow, uSfBeamPower: shared.power,
      uSfBeamStart: shared.start, uSfBeamEnd: shared.end,
      uSfBeamRadius: role === 'core' ? shared.coreRadius : shared.sheathRadius,
      uSfBeamMotion: shared.motion,
      uSfBeamVerb: shared.verb,
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aConduitStrand;
        varying vec2 vSfBeam;
        varying float vSfConduitFold;
        uniform vec3 uSfBeamStart, uSfBeamEnd;
        uniform float uSfBeamTime, uSfBeamFlow, uSfBeamRadius, uSfBeamMotion, uSfBeamVerb;
      `)
      .replace('#include <begin_vertex>', `
        float along = uv.x, side = uv.y * 2.0 - 1.0;
        vec3 axis = normalize(uSfBeamEnd - uSfBeamStart + vec3(0.00001));
        vec3 across = normalize(cross(axis, vec3(0.0, 1.0, 0.0)) + vec3(0.00001));
        vec3 up = cross(across, axis);
        float envelope = sin(along * 3.14159265);
        float phase = along * 18.849556 - uSfBeamTime * uSfBeamFlow * 3.0 * uSfBeamMotion + aConduitStrand * 2.094395;
        if (uSfBeamVerb > 0.5 && uSfBeamVerb < 1.5) {
          // Cutter: a coherent, straight column meeting one hot work face.
          phase = aConduitStrand * 2.094395;
          envelope = 0.12;
        } else if (uSfBeamVerb > 1.5 && uSfBeamVerb < 2.5) {
          // Repair: spreading applicator fans with a slower weave near the surface.
          phase = along * 6.283185 + aConduitStrand * 2.094395 - uSfBeamTime * 1.3 * uSfBeamMotion;
          envelope *= 0.4 + along * 1.4;
        } else if (uSfBeamVerb > 2.5) {
          phase = along * 12.56637 + aConduitStrand * 2.094395 - uSfBeamTime * 3.0 * uSfBeamMotion;
        }
        vec3 radial = across * cos(phase) + up * sin(phase);
        vec3 folded = across * -sin(phase) + up * cos(phase);
        vec3 transformed = mix(uSfBeamStart, uSfBeamEnd, along)
          + radial * uSfBeamRadius * envelope * 0.78
          + folded * side * uSfBeamRadius * (0.20 + envelope * 0.18)
          + radial * (1.0 - side * side) * uSfBeamRadius * 0.14;
        vSfBeam = uv;
        vSfConduitFold = abs(dot(radial, normalize(cameraPosition - transformed)));
      `);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec2 vSfBeam;
        varying float vSfConduitFold;
        uniform float uSfBeamTime, uSfBeamFlow, uSfBeamPower, uSfBeamMotion, uSfBeamVerb;
      `)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float across = abs(vSfBeam.y * 2.0 - 1.0);
        float work = smoothstep(0.91, 0.99, vSfBeam.x);
        float transport = vSfBeam.x * uSfBeamFlow * 31.4159 - uSfBeamTime * 16.0 * uSfBeamMotion;
        float packet = pow(0.5 + 0.5 * sin(transport), 6.0);
        float crease = exp(-pow((across - 0.32) * 5.0, 2.0));
        float energy = (0.48 + packet * 1.2 + work * 1.4) * (0.35 + vSfConduitFold * 0.65);
        if (uSfBeamVerb < 0.5) energy *= 0.40 + packet * 2.4;
        else if (uSfBeamVerb < 1.5) energy = 0.85 + work * 2.5;
        else if (uSfBeamVerb < 2.5) energy *= 0.65 + work * 0.65;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.88, 0.61), crease * (work + packet * 0.35));
        float inkyBack = smoothstep(0.60, 0.90, across);
        diffuseColor.rgb *= mix(vec3(1.0), vec3(0.22, 0.18, 0.52), inkyBack * 0.75);
        diffuseColor.rgb *= (0.28 + crease * ${role === 'core' ? '1.6' : '0.7'}) * energy * uSfBeamPower;
        diffuseColor.a *= (1.0 - smoothstep(0.65, 1.0, across)) * uSfBeamPower;
      `);
  };
  material.customProgramCacheKey = () => `sf-tool-conduit-v2-${role}`;
}
