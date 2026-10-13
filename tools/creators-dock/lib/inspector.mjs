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
