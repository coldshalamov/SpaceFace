// Hypothesis support. Reads the player's notebook and the visible scene.
// Never reads flavor, rumors, event logs, or a "correct" flag.

function getPath(obj, path) {
  if (!path) return obj;
  let cur = obj;
  for (const part of path.split('.')) {
    if (cur == null) return undefined;
    cur = cur[part];
  }
  return cur;
}

function compareValue(actual, req) {
  if (req.finite) return Number.isFinite(actual);
  if (req.eq !== undefined) return actual === req.eq;
  if (!Number.isFinite(actual)) return false;
  if (req.gt !== undefined && !(actual > req.gt)) return false;
  if (req.gte !== undefined && !(actual >= req.gte)) return false;
  if (req.lt !== undefined && !(actual < req.lt)) return false;
  if (req.lte !== undefined && !(actual <= req.lte)) return false;
  return req.gt !== undefined || req.lt !== undefined || req.gte !== undefined || req.lte !== undefined;
}

function measurementList(notebook) {
  return Object.values(notebook.measurements || {});
}

function findScan(notebook, target, mode) {
  return notebook.measurements[`scan:${target}:${mode}`] || null;
}

function findCompare(notebook, a, b) {
  const id = a < b ? `compare:${a}:${b}` : `compare:${b}:${a}`;
  return notebook.measurements[id] || null;
}

function reconList(notebook, model) {
  return measurementList(notebook).filter((m) => m.kind === 'reconstruct' && m.data && m.data.model === model && !m.spoiled);
}

export function checkRequirement(req, notebook, scene) {
  if (!req || !req.op) return false;
  if (req.op === 'all') return (req.of || []).every((inner) => checkRequirement(inner, notebook, scene));
  if (req.op === 'scan') {
    const found = findScan(notebook, req.target, req.mode);
    if (!found || found.spoiled) return false;
    return compareValue(getPath(found.data, req.field), req);
  }
  if (req.op === 'compare') {
    const found = findCompare(notebook, req.a, req.b);
    if (!found || found.spoiled) return false;
    return compareValue(found.data[req.field], req);
  }
  if (req.op === 'recon') {
    return reconList(notebook, req.model).some((m) => {
      if (req.group && m.data.group !== req.group) return false;
      if (req.minBodies && !(m.data.bodies >= req.minBodies)) return false;
      return compareValue(getPath(m.data, req.field || 'residual'), req);
    });
  }
  if (req.op === 'gap') {
    const list = reconList(notebook, req.model || 'ballistic');
    const a = list.find((m) => m.data.group === req.groupA);
    const b = list.find((m) => m.data.group === req.groupB);
    if (!a || !b) return false;
    const delta = Math.abs((a.data.originT || 0) - (b.data.originT || 0));
    return compareValue(delta, req);
  }
  if (req.op === 'assay') {
    const found = measurementList(notebook).find((m) => m.kind === 'assay' && m.targetId === req.target && !m.spoiled);
    if (!found) return false;
    return compareValue(getPath(found.data, req.field), req);
  }
  if (req.op === 'near') {
    const a = (scene.bodies || []).find((b) => b.id === req.a && !b.destroyed);
    const b = (scene.bodies || []).find((bdy) => bdy.id === req.b && !bdy.destroyed);
    if (!a || !b) return false;
    return compareValue(Math.hypot(a.x - b.x, a.z - b.z), req);
  }
  if (req.op === 'headingSplit') {
    const scans = measurementList(notebook).filter((m) => m.kind === 'scan' && m.mode === 'visual' && m.data && m.data.group === req.group);
    if (scans.length < 2) return false;
    let max = 0;
    for (let i = 0; i < scans.length; i += 1) {
      for (let k = i + 1; k < scans.length; k += 1) {
        let d = Math.abs(scans[i].data.heading - scans[k].data.heading) % (Math.PI * 2);
        if (d > Math.PI) d = Math.PI * 2 - d;
        if (d > max) max = d;
      }
    }
    return compareValue(max, req);
  }
  if (req.op === 'noseAway') {
    const scan = findScan(notebook, req.target, 'visual');
    const from = (scene.bodies || []).find((b) => b.id === req.target && !b.destroyed);
    const to = (scene.bodies || []).find((b) => b.id === req.awayFrom && !b.destroyed);
    if (!scan || !from || !to) return false;
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const bearing = Math.atan2(dz, dx);
    let d = Math.abs(scan.data.heading - bearing) % (Math.PI * 2);
    if (d > Math.PI) d = Math.PI * 2 - d;
    return compareValue(d, req);
  }
  if (req.op === 'count') {
    const n = measurementList(notebook).filter((m) => {
      if (m.kind !== 'scan' || m.mode !== 'visual' || !m.data) return false;
      if (req.group && m.data.group !== req.group) return false;
      if (req.variant && m.data.variant !== req.variant) return false;
      if (req.damaged && !m.data.damaged) return false;
      return true;
    }).length;
    return compareValue(n, req);
  }
  if (req.op === 'tangent') {
    const scan = findScan(notebook, req.target, 'trajectory');
    if (!scan || scan.spoiled) return false;
    return compareValue(scan.data.tangent, req);
  }
  return false;
}

export function evaluateHypothesis(hypothesis, notebook, scene) {
  const missing = [];
  for (const req of hypothesis.requires || []) {
    if (!checkRequirement(req, notebook, scene)) missing.push(describeReq(req));
  }
  const contradicted = (hypothesis.falsifiedBy || []).some((req) => checkRequirement(req, notebook, scene));
  return {
    id: hypothesis.id,
    supported: missing.length === 0 && !contradicted,
    contradicted,
    missing,
  };
}

function describeReq(req) {
  if (!req) return 'evidence';
  if (req.op === 'all') return 'a combined measurement';
  if (req.op === 'scan') return `${req.mode} scan of ${req.target}`;
  if (req.op === 'compare') return `trajectory comparison of ${req.a} and ${req.b}`;
  if (req.op === 'recon') return `${req.model} reconstruction`;
  if (req.op === 'gap') return `age gap between ${req.groupA} and ${req.groupB}`;
  if (req.op === 'assay') return `assay of ${req.target}`;
  if (req.op === 'headingSplit') return `visible heading split in ${req.group}`;
  if (req.op === 'noseAway') return `nose heading of ${req.target}`;
  if (req.op === 'count') return `count of ${req.group || req.variant || 'bodies'}`;
  if (req.op === 'tangent') return `tangent heading of ${req.target}`;
  if (req.op === 'near') return `distance from ${req.a} to ${req.b}`;
  return req.op;
}

export function publicHypothesis(hypothesis) {
  return { id: hypothesis.id, statement: hypothesis.statement };
}
