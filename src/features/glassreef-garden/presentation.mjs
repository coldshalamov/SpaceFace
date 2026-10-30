import { SITE, PARTS, LINKS, ZONES, MISSION } from './data.mjs';
import { objectives } from './runtime.mjs';

const pct = v => `${Math.round(v * 100)}%`;
export function gardenReadout(snapshot, selected = 'collar') {
  const g = snapshot.garden, n = g.nodes[selected], o = objectives(g);
  const p = PARTS.find(p => p.id === selected);
  const warning = n?.stress >= 0.8 ? 'DANGER — neck failure imminent. Stop pulling; unload the line.'
    : n?.stress > 0.45 ? 'WARNING — growth is carrying load. Vent or brace, then wait for relief.'
    : 'RELIEF — controlled separation window. Inspect before detaching.';
  let next = !g.nodes.collar.inspected ? 'Inspect the collar: it carries both boughs.'
    : g.links[0] ? 'Vent the drive, or brace manually; detach the relieved collar. Force can also break it.'
    : !o.rescued ? 'Approach Iona’s cradle and rescue her.'
    : !o.wasteSafe ? 'Inspect and detach amber waste. Tow it into the isolation cage below 2 wu/s.'
    : !g.choice ? 'Choose commercial harvest or nursery restoration with Iona.'
    : o.ready ? 'Return to Iona to sign the recovery receipt.'
    : g.choice === 'restore' ? 'Return two viable pods to the nursery bed below 2 wu/s.'
    : 'Deliver every surviving viable pod to the sale cradle below 2 wu/s.';
  if (g.choice === 'restore' && o.viable < 2) next = 'Too few seeds for a nursery. Ask Iona for emergency closeout.';
  if (g.worker === 'lost') next = 'Iona’s cradle was destroyed. No signed recovery receipt is possible.';
  if (g.retired) next = g.settlement?.status === 'paid'
    ? `${g.choice === 'restore' ? 'NURSERY RESTORED' : 'RECOVERY CLOSED'} — ${g.settlement.amount} cr paid once.`
    : 'Transfer unconfirmed. Receipt retained; automatic retry is disabled.';
  return { title: 'GLASSREEF GARDEN', mission: MISSION.title, next, warning,
    selected: p ? `${p.id.replaceAll('_', ' ')} — ${n.status}; load ${pct(n.stress)}; growth ${pct(n.maturity)}` : 'Select a nursery piece',
    classification: !n?.inspected ? 'UNCLASSIFIED — inspect the piece; appearance alone is not a cargo assay.'
      : p.kind === 'pod' ? `VIABLE SEED ${pct(n.viability)}${n.viability < 0.5 ? ' — damaged; no sale or planting' : ''}`
      : p.kind === 'waste' ? 'HAZARDOUS WASTE — isolate; bursting it costs nearby seed viability.'
      : p.kind === 'machine' ? 'NURSERY DRIVE — destruction leaves manual bracing and hand pollination.'
      : p.kind === 'worker' ? 'IONA VALE — nursery rigger; recovery receipt authority.'
      : 'LOAD-BEARING GROWTH — follows the connected nursery joints.',
    progress: `${o.stored}/3 sold · ${o.planted}/2 planted · ${o.viable} viable · waste ${o.wasteSafe ? 'safe' : 'uncontained'}`,
    voice: g.worker === 'lost' ? 'The cradle radio is silent.'
      : g.nodes.machine.status === 'destroyed' ? 'Iona: “Drive’s gone. Brace the collar. My hand pollinator still works.”'
      : !o.rescued ? 'Iona: “White ribs carry load. Amber is waste. Ease the collar before my cradle.”'
      : !o.wasteSafe ? 'Iona: “Don’t sell the amber. Cage it. Breaking it bruises the seed lines.”'
      : g.choice === 'restore' ? 'Iona: “Two living pods make a nursery. The third is insurance, not another payday.”'
      : 'Iona: “I’ll buy the separated living pods. One receipt; the garden isn’t a money printer.”',
  };
}

// Host mounts this inside its owned screen/prompt surface. No global hotkeys or input writes.
// Every essential state has text; color, flashing and camera motion carry no unique information.
export function createGardenPanel(document, host, adapter) {
  const panel = document.createElement('section');
  panel.setAttribute('aria-label', 'Glassreef Garden recovery');
  Object.assign(panel.style, { color: '#edfff9', background: '#081b25', padding: '12px',
    maxWidth: '440px', maxHeight: '70vh', overflow: 'auto', pointerEvents: 'auto',
    font: 'inherit', border: '1px solid #63d5c3', borderRadius: '8px' });
  const heading = document.createElement('h2'); heading.textContent = 'Glassreef Garden'; panel.append(heading);
  const select = document.createElement('select'); select.setAttribute('aria-label', 'Nursery part');
  for (const p of PARTS) {
    const opt = document.createElement('option'); opt.value = p.id; opt.textContent = p.id.replaceAll('_', ' ');
    if (p.id === 'collar') opt.selected = true;
    select.append(opt);
  }
  panel.append(select);
  const fields = {};
  for (const key of ['selected', 'classification', 'warning', 'progress', 'voice', 'next']) {
    fields[key] = document.createElement('p'); panel.append(fields[key]);
  }
  const status = document.createElement('p'); status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const controls = document.createElement('div');
  Object.assign(controls.style, { display: 'flex', flexWrap: 'wrap', gap: '8px' });
  const buttons = [];
  for (const [action, label] of [ ['inspect', 'Inspect'], ['vent', 'Vent drive'], ['brace', 'Brace collar'],
    ['detach', 'Separate neck'], ['rescue', 'Rescue Iona'], ['clean', 'Clean separated seed'],
    ['harvest', 'Choose sale'], ['restore', 'Choose restoration'], ['emergency', 'Emergency closeout'],
    ['settle', 'Sign receipt'] ]) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
    button.style.minHeight = '40px'; button.dataset.action = action; controls.append(button); buttons.push(button);
  }
  const onClick = e => {
    const button = e.target.closest?.('button[data-action]'); if (!button || !controls.contains(button)) return;
    const result = adapter.request(button.dataset.action, select.value);
    status.textContent = result.ok ? 'Action confirmed.' : `Action unavailable: ${(result.reason || 'inspect_failed').replaceAll('_', ' ')}.`;
    update();
  };
  const onChange = () => update(); controls.addEventListener('click', onClick); select.addEventListener('change', onChange);
  panel.append(controls, status); host.append(panel);
  let previous = '';
  function update() {
    const snapshot = adapter.read(), readout = gardenReadout(snapshot, select.value);
    for (const key of Object.keys(fields)) if (fields[key].textContent !== readout[key]) fields[key].textContent = readout[key];
    const signature = `${snapshot.active}:${snapshot.ready}:${snapshot.garden.retired}`;
    if (signature !== previous) { for (const b of buttons) b.disabled = !snapshot.active || !snapshot.ready || snapshot.garden.retired; previous = signature; }
  }
  update();
  return { update, dispose() { controls.removeEventListener('click', onClick); select.removeEventListener('change', onChange); panel.remove(); } };
}

/** Render-only bounded view. THREE is injected by the existing render owner.
 * Optional authoredModels are borrowed templates, cloned without disposing their resources.
 * Root should admit either this view or the ordinary entity visual, never both.
 */
export function createGardenView(THREE, scene, { authoredModels = {} } = {}) {
  const root = new THREE.Group(); root.name = 'Glassreef Garden'; scene.add(root);
  const ownedGeometry = [], ownedMaterials = [], meshes = new Map();
  const ownG = g => { ownedGeometry.push(g); return g; };
  const ownM = m => { ownedMaterials.push(m); return m; };
  const crystal = ownG(new THREE.IcosahedronGeometry(1, 0));
  const machinery = ownG(new THREE.CylinderGeometry(1, 1, 0.5, 12));
  for (const p of PARTS) {
    const group = new THREE.Group(); group.name = p.id;
    const template = authoredModels[p.kind];
    if (template) {
      const borrowed = template.clone(true);
      const box = new THREE.Box3().setFromObject(borrowed), size = new THREE.Vector3(), center = new THREE.Vector3();
      box.getSize(size); box.getCenter(center);
      const scale = p.radius * 2 / Math.max(1e-6, size.length());
      borrowed.position.sub(center); const wrapper = new THREE.Group(); wrapper.add(borrowed);
      wrapper.scale.setScalar(scale); group.add(wrapper);
    } else {
      const material = ownM(new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.42,
        metalness: p.kind === 'machine' || p.kind === 'worker' ? 0.8 : 0.25,
        emissive: p.color, emissiveIntensity: p.kind === 'pod' ? 0.3 : 0.12 }));
      const mesh = new THREE.Mesh(p.kind === 'machine' ? machinery : crystal, material);
      mesh.scale.setScalar(p.radius); group.add(mesh);
      if (p.kind === 'machine') {
        const ring = new THREE.Mesh(ownG(new THREE.TorusGeometry(p.radius * 0.8, 0.35, 5, 24)), material);
        ring.rotation.x = Math.PI / 2; ring.position.y = 2; group.add(ring);
      }
      group.userData.statusMaterial = material;
    }
    root.add(group); meshes.set(p.id, group);
  }
  const linePositions = new Float32Array(LINKS.length * 6);
  const lineGeometry = ownG(new THREE.BufferGeometry());
  lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
  const lines = new THREE.LineSegments(lineGeometry, ownM(new THREE.LineBasicMaterial({ color: '#b4fff2', transparent: true, opacity: 0.65 })));
  lines.frustumCulled = false; root.add(lines);
  const zones = [];
  for (const [id, z] of Object.entries(ZONES)) {
    const mesh = new THREE.Mesh(ownG(new THREE.RingGeometry(z.radius - 0.5, z.radius, 32)),
      ownM(new THREE.MeshBasicMaterial({ color: id === 'waste' ? '#efa74d' : id === 'nursery' ? '#84ffb0' : '#86c7ff', side: THREE.DoubleSide })));
    mesh.rotation.x = -Math.PI / 2; mesh.position.y = 0.1; root.add(mesh); zones.push([mesh, z]);
  }
  let disposed = false;
  function update(snapshot, { reducedMotion = true } = {}) {
    if (disposed) return;
    root.visible = snapshot.active;
    const bodies = new Map(snapshot.bodies.map(b => [b.partId, b]));
    for (const p of PARTS) {
      const mesh = meshes.get(p.id), n = snapshot.garden.nodes[p.id];
      let body = bodies.get(p.id);
      // Received specimens stay visible as finite display stock. They are no longer
      // physical cargo; the owner has taken custody and cannot pay for them twice.
      const zone = n.status === 'planted' ? ZONES.nursery : n.status === 'stored' ? ZONES.harvest
        : n.status === 'quarantined' ? ZONES.waste : null;
      if (!body && zone) {
        const slot = PARTS.filter(q => snapshot.garden.nodes[q.id].status === n.status).findIndex(q => q.id === p.id);
        body = { x: snapshot.origin.x + zone.x + (slot - 1) * 6,
          z: snapshot.origin.z + zone.z, rot: 0 };
      }
      mesh.visible = !!body;
      if (!body) continue;
      mesh.position.set(body.x, 0, body.z); mesh.rotation.y = -body.rot;
      if (p.kind === 'pod' || p.kind === 'growth') mesh.scale.setScalar(0.8 + 0.2 * n.maturity);
      const m = mesh.userData.statusMaterial;
      if (m) {
        m.color.set(n.stress > 0.8 ? '#ffbb76' : p.color);
        m.emissiveIntensity = 0.12 + n.stress * 0.2
          + (reducedMotion ? 0 : 0.015 * Math.sin(snapshot.garden.lastTime * 1.5));
      }
    }
    LINKS.forEach((link, i) => {
      const a = bodies.get(link.child), b = bodies.get(link.parent), visible = snapshot.garden.links[i] && a && b;
      linePositions.set(visible ? [a.x, 0, a.z, b.x, 0, b.z] : [0, 0, 0, 0, 0, 0], i * 6);
    });
    lineGeometry.attributes.position.needsUpdate = true;
    for (const [mesh, z] of zones) { mesh.position.x = snapshot.origin.x + z.x; mesh.position.z = snapshot.origin.z + z.z; }
  }
  return { root, update, dispose() {
    if (disposed) return; disposed = true; scene.remove(root);
    for (const g of ownedGeometry) g.dispose(); for (const m of ownedMaterials) m.dispose();
  } };
}
