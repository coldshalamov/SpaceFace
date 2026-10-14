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

export function discRadius(object) {
  return object && Number.isFinite(object.radius) ? object.radius : 0;
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

export function writeFrameInput(project, index, key, value) {
  if (!project || !Number.isInteger(index) || index < 0) return project;
  if (!Array.isArray(project.frames)) project.frames = [];
  const frame = project.frames[index] || { tick: index, input: {} };
  frame.input = { ...(frame.input || {}), [key]: value };
  project.frames[index] = frame;
  return project;
}
