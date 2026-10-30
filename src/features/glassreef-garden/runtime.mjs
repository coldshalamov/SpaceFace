import { SITE, PARTS, LINKS } from './data.mjs';
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ids = PARTS.map(p => p.id);
const podIds = PARTS.filter(p => p.kind === 'pod').map(p => p.id);
const wasteIds = PARTS.filter(p => p.kind === 'waste').map(p => p.id);
const finite = v => typeof v === 'number' && Number.isFinite(v);
const clone = v => JSON.parse(JSON.stringify(v));
const states = new Set(['attached', 'loose', 'stored', 'planted', 'quarantined', 'destroyed']);
const plain = v => v && typeof v === 'object' && !Array.isArray(v)
  && [Object.prototype, null].includes(Object.getPrototypeOf(v));

export function createGarden(state) {
  if (typeof state?.rng !== 'function' || !finite(state.simTime) || state.simTime < 0)
    throw new TypeError('Glassreef requires state.rng and nonnegative state.simTime');
  const nodes = {};
  for (const p of PARTS) {
    const r = p.kind === 'pod' ? state.rng() : 0;
    if (!finite(r) || r < 0 || r >= 1) throw new TypeError('Invalid seeded RNG sample');
    nodes[p.id] = { status: 'attached', inspected: false, stress: 0,
      viability: p.kind === 'pod' ? 0.84 + r * 0.12 : 0,
      cleaned: false, peak: 0 };
  }
  return { version: SITE.version, id: SITE.id, lastTime: state.simTime,
    nodes, links: LINKS.map(() => true), worker: 'trapped', choice: null,
    vented: false, manualBrace: false, retired: false, settlement: null,
    revision: 0 };
}

// Reject incompatible/corrupt saves as a whole. Never turn a bad receipt into an unpaid one.
export function restoreGarden(raw, simTime) {
  if (!plain(raw) || raw.version !== SITE.version || raw.id !== SITE.id
    || !finite(simTime) || simTime < 0 || !finite(raw.lastTime) || raw.lastTime < 0
    || raw.lastTime > simTime || !plain(raw.nodes)
    || Object.keys(raw.nodes).length !== PARTS.length
    || !Array.isArray(raw.links) || raw.links.length !== LINKS.length
    || raw.links.some(v => typeof v !== 'boolean')
    || !['trapped', 'rescued', 'lost'].includes(raw.worker)
    || ![null, 'harvest', 'restore', 'emergency'].includes(raw.choice)
    || !Number.isSafeInteger(raw.revision) || raw.revision < 0
    || ['vented', 'manualBrace', 'retired'].some(k => typeof raw[k] !== 'boolean'))
    throw new TypeError('Invalid Glassreef save');
  for (const p of PARTS) {
    const n = raw.nodes[p.id];
    if (!plain(n) || !states.has(n.status)
      || ['inspected', 'cleaned'].some(k => typeof n[k] !== 'boolean')
      || ['stress', 'viability', 'peak'].some(k => !finite(n[k]) || n[k] < 0 || n[k] > 1)
      || (p.kind !== 'pod' && n.viability !== 0)
      || (n.status === 'stored' && (p.kind !== 'pod' || raw.choice !== 'harvest'))
      || (n.status === 'planted' && (p.kind !== 'pod' || raw.choice !== 'restore'))
      || (n.status === 'quarantined' && p.kind !== 'waste')) throw new TypeError('Invalid Glassreef node');
  }
  LINKS.forEach((e, i) => {
    if (raw.links[i] && (raw.nodes[e.child].status !== 'attached'
      || raw.nodes[e.parent].status === 'destroyed')) throw new TypeError('Invalid Glassreef link');
  });
  if ((raw.worker === 'lost') !== (raw.nodes.worker.status === 'destroyed'))
    throw new TypeError('Invalid worker state');
  if (raw.settlement !== null) {
    const s = raw.settlement;
    if (!plain(s) || s.id !== `${SITE.id}:settlement:v1` || s.choice !== raw.choice
      || !['harvest', 'restore', 'emergency'].includes(s.choice)
      || !Number.isSafeInteger(s.amount) || s.amount < 0 || s.amount > 630
      || !['prepared', 'consumed', 'paid'].includes(s.status) || s.amount !== quoteGarden(raw))
      throw new TypeError('Invalid Glassreef receipt');
  }
  if (raw.retired !== ['consumed', 'paid'].includes(raw.settlement?.status)) throw new TypeError('Invalid retirement');
  if (raw.settlement && !objectives(raw).ready) throw new TypeError('Invalid settlement objectives');
  const out = clone(raw);
  // Away time never ages the site or silently destroys a partly detached pod.
  out.lastTime = simTime;
  return out;
}
export function saveGarden(g) { return clone(g); }
export function linkFor(id) { return LINKS.findIndex(e => e.child === id); }
export function releaseLink(g, index) {
  if (g.retired || g.settlement || !g.links[index]) return false;
  g.links[index] = false;
  const n = g.nodes[LINKS[index].child];
  if (n.status === 'attached') n.status = 'loose';
  g.revision++;
  return true;
}

// Environmental stress only: no velocities, positions, forces, or private collision solver.
// One fixed pass over nine edges routes measured contact load; each edge is visited once.
// The native joints, not this model, transmit physical momentum between bodies.
export function updateGarden(g, simTime, samples = {}) {
  if (!finite(simTime) || simTime <= g.lastTime || g.retired || g.settlement)
    return { nodes: 0, edges: 0 };
  const dt = Math.min(SITE.maxStep, simTime - g.lastTime);
  g.lastTime = simTime;
  const loads = ids.map(id => clamp(finite(samples[id]?.impact) ? samples[id].impact / 200 : 0));
  const index = Object.fromEntries(ids.map((id, i) => [id, i]));
  const routed = [...loads];
  LINKS.forEach((e, i) => {
    if (!g.links[i]) return;
    const a = index[e.child], b = index[e.parent];
    const tension = clamp(finite(samples[e.child]?.tension) ? samples[e.child].tension / 120 : 0);
    routed[a] += loads[b] * 0.35 + tension * dt * 0.8;
    routed[b] += loads[a] * 0.35 + tension * dt * 0.4;
  });
  PARTS.forEach((p, i) => {
    const n = g.nodes[p.id];
    if (n.status === 'destroyed' || ['stored', 'planted', 'quarantined'].includes(n.status)) return;
    const baseline = n.status === 'attached' && !g.vented && !g.manualBrace ? 0.06 : 0;
    const relaxation = g.vented || g.manualBrace ? 0.32 : 0.12;
    n.stress = clamp(n.stress + routed[i] + (baseline - relaxation) * dt);
    n.peak = Math.max(n.peak, n.stress);
    if (p.kind === 'pod') n.viability = clamp(n.viability - Math.max(0, n.stress - 0.65) * dt * 0.18);
  });
  // Organic necks fail before the deliberately strong general-purpose Massline joint.
  // The adapter asks the joint owner to cut them; there is no private motion response.
  LINKS.forEach((e, i) => {
    if (g.links[i] && e.child !== 'worker' && g.nodes[e.child].stress >= 0.98) releaseLink(g, i);
  });
  g.revision++;
  return { nodes: PARTS.length, edges: LINKS.length };
}
export function inspect(g, id) {
  if (g.retired || g.settlement || !g.nodes[id] || g.nodes[id].status === 'destroyed') return false;
  g.nodes[id].inspected = true; g.revision++; return true;
}
export function destroy(g, id) {
  const n = g.nodes[id];
  if (g.retired || g.settlement || !n || n.status === 'destroyed'
    || ['stored', 'planted', 'quarantined'].includes(n.status)) return false;
  LINKS.forEach((e, i) => { if (e.child === id || e.parent === id) releaseLink(g, i); });
  n.status = 'destroyed'; n.viability = 0;
  if (id === 'worker') g.worker = 'lost';
  if (wasteIds.includes(id)) for (const key of podIds) {
    if (['attached', 'loose'].includes(g.nodes[key].status))
      g.nodes[key].viability = clamp(g.nodes[key].viability - 0.2);
  }
  g.revision++; return true;
}
export function act(g, action, id) {
  if (g.retired || g.settlement) return { ok: false, reason: 'receipt_closed' };
  const n = g.nodes[id];
  const fail = reason => ({ ok: false, reason });
  if (action === 'inspect') return { ok: inspect(g, id) };
  if (action === 'vent') {
    if (id !== 'machine' || g.nodes.machine.status === 'destroyed') return fail('machine_destroyed');
    if (!g.nodes.collar.inspected) return fail('inspect_collar');
    if (g.vented) return fail('already_vented');
    g.vented = true;
  } else if (action === 'brace') {
    if (id !== 'collar' || !g.nodes.collar.inspected || g.manualBrace) return fail('inspect_collar_or_already_braced');
    g.manualBrace = true;
  } else if (action === 'detach') {
    const i = linkFor(id);
    if (!n?.inspected || i < 0 || !g.links[i]) return fail('inspect_attached_piece');
    if (n.stress > 0.45) return fail('loaded_growth_wait_for_relief');
    releaseLink(g, i);
  } else if (action === 'rescue') {
    if (id !== 'worker' || g.worker !== 'trapped') return fail('worker_unavailable');
    if (g.links[0] || g.nodes.collar.stress > 0.45) return fail('unload_collar_first');
    releaseLink(g, linkFor('worker')); g.worker = 'rescued';
  } else if (action === 'clean') {
    if (!podIds.includes(id) || n.status !== 'loose' || !n.inspected || n.cleaned
      || g.worker !== 'rescued') return fail('rescue_rigger_and_separate_pod');
    n.cleaned = true; n.viability = clamp(n.viability + 0.15);
  } else if (action === 'harvest' || action === 'restore' || action === 'emergency') {
    if (id !== 'worker' || g.worker !== 'rescued') return fail('rescue_rigger_first');
    const viable = objectives(g).viable;
    const emergencyRecovery = action === 'emergency' && (viable === 0 || (g.choice === 'restore' && viable < 2));
    if (g.choice !== null && !emergencyRecovery) return fail('choice_committed');
    if (action === 'emergency' && !emergencyRecovery) return fail('viable_seed_remains');
    g.choice = action;
  } else return fail('unknown_action');
  g.revision++; return { ok: true };
}

export function deliver(g, id, zone, slow) {
  const n = g.nodes[id];
  if (g.retired || g.settlement || !n || n.status !== 'loose' || !n.inspected || !slow) return false;
  if (wasteIds.includes(id) && zone === 'waste') n.status = 'quarantined';
  else if (podIds.includes(id) && n.viability >= 0.5 && g.worker === 'rescued') {
    if (g.choice === 'harvest' && zone === 'harvest') n.status = 'stored';
    else if (g.choice === 'restore' && zone === 'nursery') n.status = 'planted';
    else return false;
  } else return false;
  g.revision++; return true;
}
export function objectives(g) {
  const pods = podIds.map(k => g.nodes[k]);
  const viable = pods.filter(n => n.viability >= 0.5 && n.status !== 'destroyed').length;
  const stored = pods.filter(n => n.status === 'stored').length;
  const planted = pods.filter(n => n.status === 'planted').length;
  const wasteSafe = wasteIds.every(k => ['quarantined', 'destroyed'].includes(g.nodes[k].status));
  const ready = g.worker === 'rescued' && wasteSafe && (
    (g.choice === 'harvest' && stored >= 1 && pods.every(n => ['stored', 'destroyed'].includes(n.status) || n.viability < 0.5))
    || (g.choice === 'restore' && planted >= 2)
    || (g.choice === 'emergency' && viable < 2));
  return { viable, stored, planted, wasteSafe, rescued: g.worker === 'rescued', ready: !!ready };
}
export function quoteGarden(g) {
  const o = objectives(g);
  return g.choice === 'harvest' ? o.stored * SITE.harvestPerPod + SITE.rescueGrant
    : g.choice === 'restore' ? SITE.restoreGrant + SITE.rescueGrant
    : g.choice === 'emergency' ? SITE.emergencyGrant + SITE.rescueGrant : 0;
}
export function prepareSettlement(g) {
  if (g.retired || g.settlement || !objectives(g).ready) return null;
  g.settlement = { id: `${SITE.id}:settlement:v1`, choice: g.choice,
    amount: quoteGarden(g), status: 'prepared' };
  g.revision++; return clone(g.settlement);
}
export function consumeSettlement(g, receiptId) {
  if (g.settlement?.id !== receiptId || g.settlement.status !== 'prepared') return false;
  g.settlement.status = 'consumed'; g.retired = true; g.revision++; return true;
}
export function markPaid(g, receiptId) {
  if (g.settlement?.id !== receiptId || g.settlement.status !== 'consumed') return false;
  g.settlement.status = 'paid'; g.revision++; return true;
}
