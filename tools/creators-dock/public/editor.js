import { commit, createHistory, redo, undo } from '/lib/history.mjs';
import { inspectValue } from '/lib/security.mjs';
import {
  addObject,
  cloneObject,
  deleteObjects,
  emptyProject,
  expandIds,
  groupObjects,
  hitTest,
  nudgeObjects,
  objectById,
  projectIssues,
  screenToWorld,
  setCamera,
  ungroupObjects,
  worldToScreen,
} from '/lib/scene.mjs';

const canvas = document.querySelector('#stage');
const ctx = canvas.getContext('2d');
const report = document.querySelector('#report');
const status = document.querySelector('#status');
const examples = document.querySelector('#examples');
const objectList = document.querySelector('#objects');
const inspector = document.querySelector('#inspector');
const chips = document.querySelector('#chips');
const snapButton = document.querySelector('#btn-snap');

let history = createHistory(emptyProject({ id: 'dock.untitled', title: 'Untitled dock', seed: 1 }));
let selected = [];
let dialect = { draw: {}, profiles: [] };
let spaceDown = false;
let drag = null;

function project() {
  return history.present;
}

function view() {
  const rect = canvas.getBoundingClientRect();
  return { width: canvas.width, height: canvas.height, cssWidth: rect.width, cssHeight: rect.height };
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.floor(rect.width));
  canvas.height = Math.max(1, Math.floor(rect.height));
  draw();
}

function commitProject(next) {
  history = commit(history, next);
  render();
}

function replacePresent(next) {
  history = { ...history, present: next };
  draw();
  paintInspector();
  paintObjects();
  paintStatus();
}

async function boot() {
  const listed = await fetch('/api/examples').then((res) => res.json());
  dialect = await fetch('/api/dialect').then((res) => res.json());
  examples.replaceChildren();
  for (const row of listed.examples || []) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = row.title;
    button.addEventListener('click', () => loadExample(row.id));
    item.append(button);
    examples.append(item);
  }
  if (listed.examples && listed.examples[0]) await loadExample(listed.examples[0].id);
  else render();
}

async function loadExample(id) {
  const body = await fetch(`/api/examples/${encodeURIComponent(id)}`).then((res) => res.json());
  if (!body.ok) return showReport(body);
  history = createHistory(body.project);
  selected = ['player'];
  render();
  showReport({ ok: true, note: `Opened ${id}. Lab-only marks are on the inspector. Run lab for numbers.` });
}

function render() {
  snapButton.setAttribute('aria-pressed', project().grid && project().grid.snap ? 'true' : 'false');
  paintObjects();
  paintInspector();
  paintStatus();
  draw();
}

function paintObjects() {
  objectList.replaceChildren();
  for (const object of project().objects || []) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `${object.kind}  ${object.label || object.id}`;
    if (selected.includes(object.id)) button.setAttribute('aria-current', 'true');
    button.addEventListener('click', (event) => {
      if (event.shiftKey) toggleSelect(object.id);
      else selected = [object.id];
      render();
    });
    item.append(button);
    objectList.append(item);
  }
}

function paintInspector() {
  const object = objectById(project(), selected[selected.length - 1]);
  chips.replaceChildren();
  inspector.replaceChildren();
  if (!object) {
    chips.append(chip('no selection', 'edit'));
    return;
  }
  if (object.kind === 'trigger' || object.kind === 'objective' || object.kind === 'attachment') chips.append(chip('lab-only', 'lab'));
  if (object.kind === 'actor') chips.append(chip('velocity and heading are lab-only', 'lab'));
  if (object.kind === 'field' && object.fieldKind === 'place') chips.append(chip('user-content place, not a sim force', 'user'));
  if (object.kind === 'field' && object.fieldKind === 'force') chips.append(chip('refused on export', 'lab'));
  if (object.kind === 'route') chips.append(chip('editor route', 'edit'));
  if (object.groupId) chips.append(chip(`group ${object.groupId}`, 'edit'));

  const fields = fieldsFor(object);
  for (const field of fields) {
    const label = document.createElement('label');
    label.textContent = field.label;
    const input = document.createElement(field.kind === 'select' ? 'select' : 'input');
    if (field.kind === 'select') {
      for (const option of field.options) {
        const node = document.createElement('option');
        node.value = option;
        node.textContent = option;
        if (String(object[field.key] ?? '') === option) node.selected = true;
        input.append(node);
      }
    } else {
      input.type = field.kind;
      if (field.kind === 'number') input.step = '0.1';
      if (field.kind === 'checkbox') input.checked = !!object[field.key];
      else input.value = object[field.key] ?? '';
    }
    input.addEventListener('change', () => {
      const next = structuredClone(project());
      const target = next.objects.find((row) => row.id === object.id);
      if (!target) return;
      if (field.kind === 'checkbox') target[field.key] = input.checked;
      else if (field.kind === 'number') target[field.key] = Number(input.value);
      else target[field.key] = input.value;
      commitProject(next);
    });
    label.append(input);
    inspector.append(label);
  }
  const hint = document.createElement('p');
  hint.textContent = colliderText(object);
  inspector.append(hint);
}

function fieldsFor(object) {
  const common = [
    { key: 'label', label: 'Label', kind: 'text' },
    { key: 'x', label: 'X', kind: 'number' },
    { key: 'z', label: 'Z', kind: 'number' },
  ];
  if (object.kind === 'actor') {
    return [
      ...common,
      { key: 'role', label: 'Role', kind: 'text' },
      { key: 'profile', label: 'Profile', kind: 'select', options: profileOptions(object.profile) },
      { key: 'heading', label: 'Heading (radians)', kind: 'number' },
      { key: 'velX', label: 'Velocity X (lab-only)', kind: 'number' },
      { key: 'velZ', label: 'Velocity Z (lab-only)', kind: 'number' },
      { key: 'team', label: 'Team', kind: 'number' },
      { key: 'factionId', label: 'Faction', kind: 'text' },
    ];
  }
  if (object.kind === 'trigger' || object.kind === 'field') {
    return [...common, { key: 'radius', label: 'Radius', kind: 'number' }];
  }
  if (object.kind === 'route') {
    return [
      { key: 'from', label: 'From', kind: 'text' },
      { key: 'to', label: 'To', kind: 'text' },
      { key: 'label', label: 'Label', kind: 'text' },
    ];
  }
  return common;
}

function profileOptions(current) {
  const ids = new Set(dialect.profiles || []);
  if (current) ids.add(current);
  const curated = ['ship.starter', 'ship.kestrel', 'ship_hawser', 'ship_mule', 'asteroid.light', 'asteroid.mid', 'asteroid.heavy', 'quiet_ghost', 'mule_trader', 'pd_screen_escort'];
  const rest = [...ids].filter((id) => !curated.includes(id)).sort();
  return [...curated.filter((id) => ids.has(id) || id === current), ...rest];
}

function colliderText(object) {
  if (object.kind !== 'actor') return 'Colliders draw for actors. Mass and radius come from overrides or the live profile.';
  const radius = object.overrides && object.overrides.radius;
  const mass = object.overrides && object.overrides.mass;
  const hint = dialect.draw && dialect.draw[object.profile];
  const r = radius ?? (hint && hint.radius) ?? 'profile';
  const m = mass ?? (hint && hint.mass) ?? 'profile';
  return `Collider radius ${r}. Mass ${m}.`;
}

function chip(text, kind) {
  const node = document.createElement('span');
  node.className = `chip ${kind}`;
  node.textContent = text;
  return node;
}

function paintStatus() {
  const grid = project().grid || {};
  const cam = project().camera || {};
  status.textContent = `${project().title}  seed ${project().seed}  ticks ${project().ticks}  snap ${grid.snap ? grid.size : 'off'}  zoom ${Number(cam.zoom || 1).toFixed(2)}`;
}

function draw() {
  const { width, height } = view();
  ctx.clearRect(0, 0, width, height);
  drawGrid();
  for (const object of project().objects || []) {
    if (object.kind === 'field') drawField(object);
  }
  for (const object of project().objects || []) {
    if (object.kind === 'trigger' || object.kind === 'objective') drawMarker(object);
  }
  for (const object of project().objects || []) {
    if (object.kind === 'route' || object.kind === 'attachment') drawLink(object);
  }
  for (const object of project().objects || []) {
    if (object.kind === 'actor') drawActor(object);
  }
}

function drawGrid() {
  const grid = project().grid || { size: 10 };
  const size = grid.size || 10;
  const cam = project().camera;
  ctx.save();
  ctx.strokeStyle = '#243044';
  ctx.lineWidth = 1;
  const topLeft = screenToWorld(0, 0, cam, view());
  const bottomRight = screenToWorld(canvas.width, canvas.height, cam, view());
  const minX = Math.min(topLeft.x, bottomRight.x);
  const maxX = Math.max(topLeft.x, bottomRight.x);
  const minZ = Math.min(topLeft.z, bottomRight.z);
  const maxZ = Math.max(topLeft.z, bottomRight.z);
  const startX = Math.floor(minX / size) * size;
  const startZ = Math.floor(minZ / size) * size;
  for (let x = startX; x <= maxX; x += size) {
    const a = worldToScreen(x, minZ, cam, view());
    const b = worldToScreen(x, maxZ, cam, view());
    line(a.sx, a.sy, b.sx, b.sy);
  }
  for (let z = startZ; z <= maxZ; z += size) {
    const a = worldToScreen(minX, z, cam, view());
    const b = worldToScreen(maxX, z, cam, view());
    line(a.sx, a.sy, b.sx, b.sy);
  }
  ctx.restore();
}

function drawActor(object) {
  const cam = project().camera;
  const point = worldToScreen(object.x || 0, object.z || 0, cam, view());
  const radius = colliderRadius(object) * (cam.zoom || 1);
  const color = object.isPlayer ? '#e2b15a' : object.role === 'hazard' || object.role === 'ghost' ? '#e07a6a' : '#7ec8c3';
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.globalAlpha = selected.includes(object.id) ? 1 : 0.9;
  ctx.beginPath();
  ctx.arc(point.sx, point.sy, Math.max(8, radius), 0, Math.PI * 2);
  ctx.globalAlpha = 0.18;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.stroke();
  const heading = object.heading || 0;
  const nose = Math.max(18, radius) + 16;
  const hx = Math.cos(heading) * nose;
  const hz = Math.sin(heading) * nose;
  line(point.sx, point.sy, point.sx + hx, point.sy - hz);
  const vx = (object.velX || 0) * 2;
  const vz = (object.velZ || 0) * 2;
  if (vx || vz) {
    ctx.strokeStyle = '#f0d78c';
    arrow(point.sx, point.sy, point.sx + vx, point.sy - vz);
  }
  ctx.fillStyle = '#e7eef6';
  ctx.font = '12px Segoe UI, sans-serif';
  ctx.fillText(object.label || object.id, point.sx + 8, point.sy - Math.max(18, radius) - 6);
  ctx.restore();
}

function colliderRadius(object) {
  if (object.overrides && Number.isFinite(object.overrides.radius)) return object.overrides.radius;
  const hint = dialect.draw && dialect.draw[object.profile];
  if (hint && Number.isFinite(hint.radius)) return hint.radius;
  return 8;
}

function drawMarker(object) {
  const cam = project().camera;
  const point = worldToScreen(object.x || 0, object.z || 0, cam, view());
  ctx.save();
  ctx.strokeStyle = object.kind === 'trigger' ? '#c9a6ff' : '#e2b15a';
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  if (object.kind === 'objective') {
    ctx.moveTo(point.sx, point.sy - 8);
    ctx.lineTo(point.sx + 8, point.sy);
    ctx.lineTo(point.sx, point.sy + 8);
    ctx.lineTo(point.sx - 8, point.sy);
    ctx.closePath();
  } else {
    ctx.arc(point.sx, point.sy, Math.max(8, (object.radius || 10) * (cam.zoom || 1)), 0, Math.PI * 2);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = object.kind === 'trigger' ? '#c9a6ff' : '#e2b15a';
  ctx.font = '11px Segoe UI, sans-serif';
  const mark = Math.max(12, (object.radius || 10) * (cam.zoom || 1));
  if (object.kind === 'trigger') {
    ctx.textAlign = 'right';
    ctx.fillText(object.label || object.id, point.sx - mark - 8, point.sy);
    ctx.textAlign = 'left';
  } else {
    ctx.fillText(object.label || object.id, point.sx + 12, point.sy + mark + 14);
  }
  ctx.restore();
}

function drawField(object) {
  const cam = project().camera;
  const point = worldToScreen(object.x || 0, object.z || 0, cam, view());
  ctx.save();
  ctx.strokeStyle = '#6ea8ff';
  ctx.setLineDash([2, 6]);
  ctx.beginPath();
  ctx.arc(point.sx, point.sy, Math.max(12, (object.radius || 20) * (cam.zoom || 1) * 0.35), 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#6ea8ff';
  ctx.font = '11px Segoe UI, sans-serif';
  ctx.fillText(object.fieldKind === 'place' ? 'PLACE' : 'FIELD', point.sx - 18, point.sy);
  ctx.restore();
}

function drawLink(object) {
  const from = objectById(project(), object.from || object.ownerAlias);
  const to = objectById(project(), object.to || object.targetAlias);
  if (!from || !to) return;
  const cam = project().camera;
  const a = worldToScreen(from.x || 0, from.z || 0, cam, view());
  const b = worldToScreen(to.x || 0, to.z || 0, cam, view());
  ctx.save();
  ctx.strokeStyle = object.kind === 'attachment' ? '#e2b15a' : '#8b97a8';
  ctx.setLineDash(object.kind === 'route' ? [6, 4] : []);
  line(a.sx, a.sy, b.sx, b.sy);
  ctx.fillStyle = ctx.strokeStyle;
  ctx.font = '11px Segoe UI, sans-serif';
  ctx.fillText(object.label || object.kind, (a.sx + b.sx) / 2, (a.sy + b.sy) / 2);
  ctx.restore();
}

function line(x0, y0, x1, y1) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

function arrow(x0, y0, x1, y1) {
  line(x0, y0, x1, y1);
  const angle = Math.atan2(y1 - y0, x1 - x0);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - 8 * Math.cos(angle - 0.4), y1 - 8 * Math.sin(angle - 0.4));
  ctx.lineTo(x1 - 8 * Math.cos(angle + 0.4), y1 - 8 * Math.sin(angle + 0.4));
  ctx.closePath();
  ctx.fill();
}

function pointerWorld(event) {
  const rect = canvas.getBoundingClientRect();
  const sx = (event.clientX - rect.left) * (canvas.width / rect.width);
  const sy = (event.clientY - rect.top) * (canvas.height / rect.height);
  return { sx, sy, ...screenToWorld(sx, sy, project().camera, view()) };
}

canvas.addEventListener('pointerdown', (event) => {
  canvas.focus();
  const point = pointerWorld(event);
  const hit = hitTest(project(), point.sx, point.sy, project().camera, view());
  const before = history.present;
  if (event.button === 1 || spaceDown || !hit) {
    drag = { mode: 'pan', x: point.sx, y: point.sy, camera: { ...project().camera }, before };
    return;
  }
  if (event.shiftKey) toggleSelect(hit);
  else if (!selected.includes(hit)) selected = [hit];
  drag = { mode: 'move', id: hit, originX: point.x, originZ: point.z, before };
  render();
});

canvas.addEventListener('pointermove', (event) => {
  if (!drag) return;
  const point = pointerWorld(event);
  if (drag.mode === 'pan') {
    const zoom = drag.camera.zoom || 1;
    const dx = (point.sx - drag.x) / zoom;
    const dz = -(point.sy - drag.y) / zoom;
    replacePresent(setCamera(project(), {
      x: drag.camera.x - dx,
      z: drag.camera.z - dz,
    }));
    return;
  }
  const dx = point.x - drag.originX;
  const dz = point.z - drag.originZ;
  const ids = expandIds(drag.before, selected.includes(drag.id) ? selected : [drag.id]);
  const moved = nudgeObjects(drag.before, ids, dx, dz);
  if (moved.ok) replacePresent(moved.project);
});

canvas.addEventListener('pointerup', () => {
  if (drag && drag.before) {
    history = commit({ past: history.past, present: drag.before, future: [] }, project());
  }
  drag = null;
  render();
});

canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  const cam = project().camera;
  const zoom = Math.min(24, Math.max(0.4, (cam.zoom || 1) * (event.deltaY < 0 ? 1.1 : 0.9)));
  commitProject(setCamera(project(), { zoom }));
}, { passive: false });

window.addEventListener('keydown', (event) => {
  if (event.code === 'Space') spaceDown = true;
  if (event.target && (event.target.tagName === 'INPUT' || event.target.tagName === 'SELECT' || event.target.tagName === 'TEXTAREA')) return;
  const step = (project().grid && project().grid.snap && project().grid.size) || 1;
  const scale = event.shiftKey ? 5 : 1;
  if (event.key === 'ArrowLeft') nudgeSelected(-step * scale, 0, event);
  if (event.key === 'ArrowRight') nudgeSelected(step * scale, 0, event);
  if (event.key === 'ArrowUp') nudgeSelected(0, step * scale, event);
  if (event.key === 'ArrowDown') nudgeSelected(0, -step * scale, event);
  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault();
    const result = deleteObjects(project(), selected);
    if (result.ok) {
      selected = [];
      commitProject(result.project);
    }
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.shiftKey) {
    event.preventDefault();
    history = undo(history);
    render();
  }
  if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === 'y' || (event.key.toLowerCase() === 'z' && event.shiftKey))) {
    event.preventDefault();
    history = redo(history);
    render();
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
    event.preventDefault();
    cloneSelected();
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'g' && event.shiftKey) {
    event.preventDefault();
    const result = ungroupObjects(project(), selected);
    if (result.ok) commitProject(result.project);
  } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'g') {
    event.preventDefault();
    groupSelected();
  }
  if (event.key === 'g' && !event.ctrlKey && !event.metaKey) toggleSnap();
  if (event.key === '+' || event.key === '=') commitProject(setCamera(project(), { zoom: Math.min(24, (project().camera.zoom || 1) * 1.1) }));
  if (event.key === '-' || event.key === '_') commitProject(setCamera(project(), { zoom: Math.max(0.4, (project().camera.zoom || 1) / 1.1) }));
  if (event.key === 'f' || event.key === 'F') fit();
});

window.addEventListener('keyup', (event) => {
  if (event.code === 'Space') spaceDown = false;
});

function nudgeSelected(dx, dz, event) {
  event.preventDefault();
  const result = nudgeObjects(project(), selected, dx, dz);
  if (result.ok) commitProject(result.project);
}

function toggleSelect(id) {
  selected = selected.includes(id) ? selected.filter((row) => row !== id) : selected.concat([id]);
}

function uniqueId(base) {
  let id = base;
  let n = 2;
  while (objectById(project(), id)) {
    id = `${base}_${n}`;
    n += 1;
  }
  return id;
}

function cloneSelected() {
  const id = selected[selected.length - 1];
  if (!id) return;
  const result = cloneObject(project(), id, uniqueId(`${id}_copy`));
  if (!result.ok) return showReport(result);
  selected = [result.project.objects[result.project.objects.length - 1].id];
  commitProject(result.project);
}

function groupSelected() {
  if (selected.length < 2) return showReport({ ok: false, issues: ['Select at least two objects to group.'] });
  const result = groupObjects(project(), selected, uniqueId('group'));
  if (result.ok) commitProject(result.project);
  else showReport(result);
}

function toggleSnap() {
  const next = structuredClone(project());
  next.grid = { ...(next.grid || { size: 10 }), snap: !(next.grid && next.grid.snap) };
  commitProject(next);
}

function fit() {
  const actors = (project().objects || []).filter((object) => Number.isFinite(object.x));
  if (!actors.length) return;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const object of actors) {
    minX = Math.min(minX, object.x);
    maxX = Math.max(maxX, object.x);
    minZ = Math.min(minZ, object.z);
    maxZ = Math.max(maxZ, object.z);
  }
  const span = Math.max(40, maxX - minX, maxZ - minZ);
  commitProject(setCamera(project(), {
    x: (minX + maxX) / 2,
    z: (minZ + maxZ) / 2,
    zoom: Math.max(0.6, Math.min(8, (Math.min(canvas.width, canvas.height) * 0.7) / span)),
  }));
}

document.querySelector('#btn-new').addEventListener('click', () => {
  history = createHistory(emptyProject({ id: 'dock.untitled', title: 'Untitled dock', seed: 1 }));
  selected = [];
  render();
});
document.querySelector('#btn-open').addEventListener('click', () => document.querySelector('#file-open').click());
document.querySelector('#file-open').addEventListener('change', async (event) => {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  const text = await file.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch (error) {
    showReport({ ok: false, issues: [error.message] });
    return;
  }
  const issues = [...inspectValue(parsed), ...projectIssues(parsed)];
  if (issues.length) {
    showReport({ ok: false, issues });
    return;
  }
  history = createHistory(parsed);
  selected = [];
  render();
});
document.querySelector('#btn-save').addEventListener('click', saveProject);
document.querySelector('#btn-undo').addEventListener('click', () => { history = undo(history); render(); });
document.querySelector('#btn-redo').addEventListener('click', () => { history = redo(history); render(); });
document.querySelector('#btn-clone').addEventListener('click', cloneSelected);
document.querySelector('#btn-group').addEventListener('click', groupSelected);
document.querySelector('#btn-ungroup').addEventListener('click', () => {
  const result = ungroupObjects(project(), selected);
  if (result.ok) commitProject(result.project);
});
document.querySelector('#btn-delete').addEventListener('click', () => {
  const result = deleteObjects(project(), selected);
  if (result.ok) {
    selected = [];
    commitProject(result.project);
  }
});
snapButton.addEventListener('click', toggleSnap);
document.querySelector('#btn-validate').addEventListener('click', () => post('/api/validate', { project: project() }));
document.querySelector('#btn-run').addEventListener('click', () => post('/api/run', { project: project() }));
document.querySelector('#btn-export').addEventListener('click', () => post('/api/export', { project: project(), out: `exports/${project().id}` }));
document.querySelector('#btn-help').addEventListener('click', () => document.querySelector('#help').showModal());
document.querySelector('#add-actor').addEventListener('click', () => addTemplate({
  id: uniqueId('actor'), kind: 'actor', role: 'prop', profile: 'asteroid.light', x: 20, z: 20,
  heading: 0, velX: 0, velZ: 0, angularVelocity: 0, team: 2, isPlayer: false, persistent: true, label: 'prop',
}));
document.querySelector('#add-trigger').addEventListener('click', () => addTemplate({
  id: uniqueId('trigger'), kind: 'trigger', shape: 'circle', x: 0, z: 20, radius: 16, labOnly: true, label: 'trigger',
  assertion: { kind: 'eventByTick', signal: 'playerX', op: '>', value: 0.5, byTick: Math.max(0, project().ticks - 1) },
}));
document.querySelector('#add-objective').addEventListener('click', () => addTemplate({
  id: uniqueId('objective'), kind: 'objective', x: 0, z: 0, metric: 'flight.finalSpeed', op: '>=', value: 0, labOnly: true, label: 'speed',
}));
document.querySelector('#add-field').addEventListener('click', () => addTemplate({
  id: uniqueId('field'), kind: 'field', fieldKind: 'place', gameplay: true, x: 40, z: 40, radius: 40, label: 'place field',
  note: 'Exports as a place record. Not a sim force.',
  place: {
    sectorId: 'sector_helios_prime', id: uniqueId('zone_dock_field'), name: 'Dock field', type: 'trade_lane',
    factionId: 'faction_scn', reason: 'A dock-authored lane marker.', center: { x: 40, z: 40 }, radius: 40, threat: 1,
  },
}));
document.querySelector('#add-route').addEventListener('click', () => {
  const actors = (project().objects || []).filter((object) => object.kind === 'actor');
  if (actors.length < 2) return showReport({ ok: false, issues: ['A route needs two actors.'] });
  addTemplate({
    id: uniqueId('route'), kind: 'route', from: actors[0].id, to: actors[1].id, label: 'route', gameplay: false,
  });
});

function addTemplate(object) {
  const result = addObject(project(), object);
  if (!result.ok) return showReport(result);
  selected = [object.id];
  commitProject(result.project);
}

async function saveProject() {
  const blob = new Blob([JSON.stringify(project(), null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${project().id}.dock.json`;
  link.click();
  const saved = await fetch('/api/save', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ project: project() }),
  }).then((res) => res.json());
  showReport(saved);
}

async function post(url, body) {
  showReport({ ok: true, note: `Calling ${url}. The lab run uses the real simulator and can take a moment.` });
  const result = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).then((res) => res.json());
  showReport(result);
}

function showReport(value) {
  report.textContent = JSON.stringify(value, null, 2);
}

new ResizeObserver(resize).observe(canvas);
boot().catch((error) => showReport({ ok: false, issues: [error.message] }));
