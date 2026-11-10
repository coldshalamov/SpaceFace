import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

/** Contract isolation, NOT a substitute game. Missing engine dependencies fail if touched.
 * Only explicitly supplied authority seams are mocked. Real replacement methods are imported
 * unmodified other than their import locations; the physics/runtime package is not in the packet.
 */
export async function isolate(relativePath, overrides = {}) {
  const file = fileURLToPath(new URL('../../' + relativePath, import.meta.url));
  let source = readFileSync(file, 'utf8');
  const key = `__cadence_contract_${isolate.serial++}`;
  globalThis[key] = overrides;
  source = source.replace(/import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"];?/g, (whole, names, spec) => {
    const absolute = resolve(dirname(file), spec);
    if (existsSync(absolute) && !overrides[spec]) return `import {${names}} from ${JSON.stringify(pathToFileURL(absolute).href)};`;
    const list = names.replace(/\/\/[^\n]*/g, '').split(',').map(x => x.trim()).filter(Boolean);
    return list.map(name => {
      const [exported, local = exported] = name.split(/\s+as\s+/);
      return `const ${local} = globalThis[${JSON.stringify(key)}][${JSON.stringify(spec)}]?.[${JSON.stringify(exported)}] ?? function(){ throw Error(${JSON.stringify('Unwired test dependency: ' + spec + ':' + exported)}); };`;
    }).join('\n');
  });
  try { return await import(`data:text/javascript;base64,${Buffer.from(source + '\n// ' + key).toString('base64')}`); }
  finally { delete globalThis[key]; }
}
isolate.serial = 0;

export function createBus() {
  const events = [], listeners = new Map();
  return { events,
    on(name, cb) { const set = listeners.get(name) || new Set(); listeners.set(name, set); set.add(cb); return () => set.delete(cb); },
    emit(name, payload) { events.push({ name, payload: structuredClone(payload) }); for (const cb of listeners.get(name) || []) cb(payload); },
    count(name) { return events.filter(e => e.name === name).length; },
  };
}
export function body(id, x, z, vx = 0, vz = 0, mass = 100, radius = 5) {
  return { id, alive: true, type: 'ship', pos: { x, z }, vel: { x: vx, z: vz }, mass, radius, team: id === 'pilot' ? 'player' : 'enemy' };
}
export function fixture() {
  const player = body('pilot', -50, 0, 0, -50);
  const payload = body('rock', 50, 0, 0, 50); payload.type = 'asteroid';
  const victim = body('victim', 50, 140, 0, 0, 100, 12);
  const attachment = { id: 'line', ownerId: player.id, targetId: payload.id, defId: 'tether_standard', state: 'active', restLength: 100, lastTension: 1000 };
  const def = { id: 'tether_standard', minLength: 10, maxLength: 240, reelRate: 60, break: { maxTension: 10000 }, automaticBreak: false };
  let rejectReel = false, rejectCut = false;
  const calls = [];
  const attachments = {
    calls, get: id => id === 'line' ? attachment : null,
    reelPolicy: () => ({ reelRate: def.reelRate, maxLength: def.maxLength, break: def.break }),
    breakPolicy: () => def.break,
    reel(id, delta, min) { calls.push({ type: 'reel', id, delta });
      if (rejectReel) return { ok: false, reason: 'test_rejected' };
      attachment.restLength = Math.max(min, Math.min(def.maxLength, attachment.restLength + delta));
      return { ok: true, attachment }; },
    cut(id) { calls.push({ type: 'cut', id }); if (rejectCut || attachment.state !== 'active') return { ok: false, reason: 'test_rejected' };
      attachment.state = 'broken'; return { ok: true, attachment }; },
    rejectReel(v) { rejectReel = v; }, rejectCut(v) { rejectCut = v; },
  };
  const state = { tick: 100, simTime: 100 / 60, mode: 'flight', playerId: player.id,
    entities: new Map([[player.id, player], [payload.id, payload], [victim.id, victim]]), entityList: [player, payload, victim],
    player: { targetId: victim.id, tether: { active: true, targetId: payload.id, attachmentId: 'line', restLength: 100, phase: 'loaded', load: 0.7, strain: 0.0001 } },
    input: { actions: { massline: { lineControl: true, orbitDirection: 1, pump: false }, throwArm: false } },
    settings: { gameplay: { masslineReleaseAssist: 'snap' } } };
  const bus = createBus(), kernel = { attachments, catalog: { attachments: new Map([[def.id, def]]) } };
  const registry = { get: id => id === 'actions' ? { kernel } : null };
  return { state, bus, kernel, registry, attachments, attachment, def, player, payload, victim, helpers: {} };
}
export const featureStub = { massline2Flag: () => true, combatFlag: () => true };
export function tick(f, n = 1) { f.state.tick += n; f.state.simTime = f.state.tick / 60; }
