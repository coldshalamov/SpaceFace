// Multi-layer parallax starfield. Each layer follows the camera at a fraction of its motion
// (parallax) so the world reads as deep space. Replaceable/extendable by the art-vfx pass.
import * as THREE from 'three';

export function createStarfield(scene) {
  const layers = [];
  const specs = [
    { count: 1400, spread: 4200, size: 2.0, color: 0x9fb6e0, par: 0.9 },
    { count: 900, spread: 3400, size: 3.2, color: 0xcfe0ff, par: 0.78 },
    { count: 380, spread: 2600, size: 5.5, color: 0x8af0d6, par: 0.62 },
  ];
  for (const s of specs) {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(s.count * 3);
    for (let i = 0; i < s.count; i++) {
      pos[i * 3] = (Math.random() * 2 - 1) * s.spread;
      pos[i * 3 + 1] = -60 - Math.random() * 120;       // below the play plane
      pos[i * 3 + 2] = (Math.random() * 2 - 1) * s.spread;
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({
      color: s.color, size: s.size, sizeAttenuation: true,
      transparent: true, opacity: 0.92, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false; pts.renderOrder = -10;
    scene.add(pts);
    layers.push({ pts, par: s.par });
  }
  return {
    recenter(camPos) {
      for (const L of layers) {
        L.pts.position.x = camPos.x * (1 - L.par);
        L.pts.position.z = camPos.z * (1 - L.par);
      }
    },
    setWarp() { /* extended by vfx during jump */ },
  };
}
