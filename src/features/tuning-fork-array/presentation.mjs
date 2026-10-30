import { COPY } from './definition.mjs';

/** Compact text projection; essential information never depends on a hue or animated line. */
export function readoutModel(view) {
  const p = view.state, signal = view.signal;
  const rows = [0, 1, 2].map(i => {
    const r = signal?.rows?.[i];
    if (!r?.present) return `Fork ${'ABC'[i]}: OUT OF CONTACT. ${COPY.lost}`;
    if (!p.readSlots[i]) return `Fork ${'ABC'[i]}: unclassified — scan within ${p.definition.scanRange} wu.`;
    const turn = Math.abs(r.headingError) < .15 ? 'mouth aligned' : `${r.headingError > 0 ? '+yaw' : '−yaw'} ${Math.round(Math.abs(r.headingError) * 180 / Math.PI)}°`;
    return `Fork ${'ABC'[i]}: ${Math.round(r.amplitude * 100)}% reception; ${Math.round(r.range)} / ${p.definition.buoys[i].radius} wu; ${turn}; jumper ${p.polarities[i] < 0 ? 'REVERSED' : 'normal'}.`;
  });
  const hint = p.missing.some(Boolean) ? COPY.lost : signal?.rows?.some(r => r.backwards) ? COPY.backwards
    : p.polarities.some(n => n < 0) ? COPY.inverted : signal?.squall ? COPY.squall
      : signal?.area <= 900 ? 'Spread the three forks into a triangle; a line cannot isolate the carrier.' : COPY.clue;
  return { title: COPY.title, stage: p.stage, rows, hint,
    summary: p.stage === 'complete' ? `${p.receipt.choice === 'publish' ? 'Civilian chart published' : 'Exclusive chart sold'}; ${p.receipt.credits} cr paid. Survey: ${p.consequence?.status}.`
      : `Carrier coherence ${Math.round((signal?.quality || 0) * 100)}%. ${view.objective?.action || ''}`,
    choices: p.stage === 'record' ? [{ id: 'sell', text: COPY.sell }, { id: 'publish', text: COPY.publish }] : [],
    canTrack: ['fixed', 'record', 'complete'].includes(p.stage),
  };
}

/** Mount inside the existing scanner/interaction panel, never as a second flight prompt deck.
 * Host supplies document for node-safe import. Buttons call public simulation methods.
 */
export function mountReadout(container, controller, document = container.ownerDocument) {
  const root = document.createElement('section');
  root.setAttribute('aria-label', COPY.title);
  const heading = document.createElement('h3'), summary = document.createElement('p'), hint = document.createElement('p');
  const list = document.createElement('ul'), rowNodes = [0, 1, 2].map(() => document.createElement('li'));
  rowNodes.forEach(n => list.append(n));
  const actions = document.createElement('div');
  root.append(heading, summary, list, hint, actions); container.append(root);
  let stamp = '';
  const buttons = [];
  function button(text, fn) { const b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.addEventListener('click', fn); actions.append(b); buttons.push(b); }
  function update() {
    const model = readoutModel(controller.readout());
    heading.textContent = model.title; summary.textContent = model.summary; hint.textContent = model.hint;
    rowNodes.forEach((n, i) => { n.textContent = model.rows[i]; });
    const next = `${model.stage}:${model.canTrack}`;
    if (next === stamp) return;
    stamp = next; actions.replaceChildren(); buttons.length = 0;
    if (model.canTrack) button('Track wreck recorder', () => controller.trackFix());
    if (model.stage === 'tuning') for (let i = 0; i < 3; i++) {
      button(`Reverse fork ${'ABC'[i]} jumper (within 65 wu)`, () => { controller.reverse(i); update(); });
      button(`Replace lost fork ${'ABC'[i]} (at cradle, once)`, () => { controller.replace(i); update(); });
    }
    for (const c of model.choices) button(c.text, () => { controller.choose(c.id); update(); });
  }
  update();
  return { update, destroy() { root.remove(); } };
}

/** Presentation-only overlay geometry. Pass authored buoy meshes from the existing art owner;
 * this module decorates rather than replacing the visual identity. THREE is dependency-injected.
 * Four fixed axis lines + three range rings: no allocation or simulation writes per update.
 */
export function createSignalOverlay(THREE, parent, { reducedMotion = true } = {}) {
  const group = new THREE.Group(); group.name = 'TuningForkSignalOverlay';
  const material = new THREE.LineBasicMaterial({ color: 0xe0b65a, transparent: true, opacity: .55 });
  const axes = [0, 1, 2].map(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geometry, material); line.frustumCulled = false; group.add(line); return line;
  });
  const ringMaterial = new THREE.LineBasicMaterial({ color: 0x69bfc6, transparent: true, opacity: .4 });
  const rings = [0, 1, 2].map(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(65 * 3), 3));
    const line = new THREE.Line(geometry, ringMaterial); line.frustumCulled = false; group.add(line); return line;
  });
  parent.add(group);
  return {
    update(view) {
      const p = view.state; group.visible = p.active && p.stage !== 'retired';
      for (let i = 0; i < 3; i++) {
        const pose = p.poses[i], line = axes[i], a = line.geometry.attributes.position;
        line.visible = !p.missing[i] && p.readSlots[i];
        a.setXYZ(0, pose.x, 3, pose.z); a.setXYZ(1, pose.x + Math.cos(pose.rot) * 100, 3, pose.z + Math.sin(pose.rot) * 100); a.needsUpdate = true;
        const ring = rings[i], b = ring.geometry.attributes.position;
        ring.visible = line.visible;
        // Range bands center on the scanned carrier direction estimate. Before a fix,
        // a ring is centered on its own buoy (receiving aperture), never an omniscient marker.
        for (let j = 0; j <= 64; j++) {
          const angle = j / 64 * Math.PI * 2, radius = p.definition.buoys[i].radius;
          b.setXYZ(j, pose.x + Math.cos(angle) * radius, 2, pose.z + Math.sin(angle) * radius);
        }
        b.needsUpdate = true;
      }
      // No flashing/pulsing even when motion is enabled; host may add authored cosmetic motion.
      group.userData.reducedMotion = reducedMotion;
    },
    dispose() { parent.remove(group); for (const l of [...axes, ...rings]) l.geometry.dispose(); material.dispose(); ringMaterial.dispose(); },
  };
}
