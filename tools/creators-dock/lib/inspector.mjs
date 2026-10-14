// Inspector paths for the dock authoring surface. The editor paints these fields.

export const TRIGGER_ASSERTION_FIELDS = Object.freeze([
  { key: 'assertion.signal', label: 'Signal', kind: 'text' },
  { key: 'assertion.op', label: 'Op', kind: 'text' },
  { key: 'assertion.value', label: 'Value', kind: 'number' },
  { key: 'assertion.byTick', label: 'By tick', kind: 'number' },
]);

export const ACTOR_OVERRIDE_FIELDS = Object.freeze([
  { key: 'overrides.radius', label: 'Collider radius', kind: 'number' },
  { key: 'overrides.mass', label: 'Mass', kind: 'number' },
]);

export const OBJECTIVE_REACH = 8;

export function discRadius(object) {
  if (!object || typeof object.radius !== 'number' || !Number.isFinite(object.radius)) return null;
  return object.radius;
}

function zoomScale(zoom) {
  return Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
}

export function markerStroke(object, zoom = 1) {
  return discRadius(object) * zoomScale(zoom);
}

export function fieldStroke(object, zoom = 1) {
  return discRadius(object) * zoomScale(zoom) * 0.35;
}

export function colliderRadius(object, draw) {
  const overrides = object && object.overrides;
  if (overrides && typeof overrides.radius === 'number' && Number.isFinite(overrides.radius)) return overrides.radius;
  const hint = draw && object && draw[object.profile];
  if (hint && typeof hint.radius === 'number' && Number.isFinite(hint.radius)) return hint.radius;
  return 8;
}

export function actorStroke(object, zoom = 1, draw) {
  return colliderRadius(object, draw) * zoomScale(zoom);
}

export function fieldsFor(object, profileChoices) {
  const common = [
    { key: 'label', label: 'Label', kind: 'text' },
    { key: 'x', label: 'X', kind: 'number' },
    { key: 'z', label: 'Z', kind: 'number' },
  ];
  const choices = typeof profileChoices === 'function' ? profileChoices(object && object.profile) : [];
  if (object && object.kind === 'actor') {
    return [
      ...common,
      { key: 'role', label: 'Role', kind: 'text' },
      { key: 'profile', label: 'Profile', kind: 'select', options: choices },
      { key: 'isPlayer', label: 'Player', kind: 'checkbox' },
      { key: 'y', label: 'Y', kind: 'number' },
      { key: 'heading', label: 'Heading (radians)', kind: 'number' },
      { key: 'velX', label: 'Velocity X (lab-only)', kind: 'number' },
      { key: 'velY', label: 'Velocity Y (lab-only)', kind: 'number' },
      { key: 'velZ', label: 'Velocity Z (lab-only)', kind: 'number' },
      { key: 'team', label: 'Team', kind: 'number' },
      { key: 'factionId', label: 'Faction', kind: 'text' },
      ...ACTOR_OVERRIDE_FIELDS,
    ];
  }
  if (object && object.kind === 'objective') {
    return [
      ...common,
      { key: 'metric', label: 'Metric', kind: 'text' },
      { key: 'signal', label: 'Signal', kind: 'text' },
      { key: 'op', label: 'Op', kind: 'text' },
      { key: 'value', label: 'Value', kind: 'number' },
      { key: 'radius', label: 'Radius', kind: 'number' },
    ];
  }
  if (object && object.kind === 'trigger') {
    return [
      ...common,
      { key: 'radius', label: 'Radius', kind: 'number' },
      ...TRIGGER_ASSERTION_FIELDS,
    ];
  }
  if (object && object.kind === 'field') {
    return [...common, { key: 'radius', label: 'Radius', kind: 'number' }];
  }
  if (object && object.kind === 'route') {
    return [
      { key: 'from', label: 'From', kind: 'text' },
      { key: 'to', label: 'To', kind: 'text' },
      { key: 'label', label: 'Label', kind: 'text' },
    ];
  }
  return common;
}

export const FRAME_INPUT_FIELDS = Object.freeze([
  { key: 'moveX', label: 'Move X', kind: 'number' },
  { key: 'moveZ', label: 'Move Z', kind: 'number' },
  { key: 'turnIntent', label: 'Turn', kind: 'number' },
  { key: 'boost', label: 'Boost', kind: 'checkbox' },
  { key: 'fire', label: 'Fire', kind: 'checkbox' },
]);

export function readPath(object, key) {
  if (!object || typeof key !== 'string') return undefined;
  if (key.startsWith('assertion.')) {
    const leaf = key.slice('assertion.'.length);
    return object.assertion ? object.assertion[leaf] : undefined;
  }
  if (key.startsWith('overrides.')) {
    const leaf = key.slice('overrides.'.length);
    return object.overrides ? object.overrides[leaf] : undefined;
  }
  return object[key];
}

export function writePath(object, key, value) {
  if (!object || typeof key !== 'string') return object;
  if (key.startsWith('assertion.')) {
    const leaf = key.slice('assertion.'.length);
    if (!object.assertion || typeof object.assertion !== 'object' || Array.isArray(object.assertion)) {
      object.assertion = {};
    }
    object.assertion[leaf] = value;
    return object;
  }
  if (key.startsWith('overrides.')) {
    const leaf = key.slice('overrides.'.length);
    if (!object.overrides || typeof object.overrides !== 'object' || Array.isArray(object.overrides)) {
      object.overrides = {};
    }
    object.overrides[leaf] = value;
    return object;
  }
  object[key] = value;
  return object;
}

export function numberFieldValue(text) {
  const trimmed = text == null ? '' : String(text).trim();
  if (trimmed === '') return null;
  const number = Number(trimmed);
  return Number.isFinite(number) ? number : null;
}

export function deletePath(object, key) {
  if (!object || typeof key !== 'string') return object;
  if (key.startsWith('assertion.')) {
    const leaf = key.slice('assertion.'.length);
    if (object.assertion && typeof object.assertion === 'object') delete object.assertion[leaf];
    return object;
  }
  if (key.startsWith('overrides.')) {
    const leaf = key.slice('overrides.'.length);
    if (object.overrides && typeof object.overrides === 'object') delete object.overrides[leaf];
    return object;
  }
  delete object[key];
  return object;
}

export function writeFrameInput(project, index, key, value) {
  if (!project || !Number.isInteger(index) || index < 0) return project;
  if (!Array.isArray(project.frames)) project.frames = [];
  const frame = project.frames[index] || { tick: index, input: {} };
  if (!frame.input || typeof frame.input !== 'object' || Array.isArray(frame.input)) frame.input = {};
  if (value == null) delete frame.input[key];
  else frame.input[key] = value;
  project.frames[index] = frame;
  return project;
}
