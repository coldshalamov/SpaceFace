// S1 Phase-B stage 9 — event-surface census.
//
// Computes the sim-bus event boundary the same way stage-5 drew the write
// census: worker import membership is the default, refined by the actual
// presentation registry's factories and manifest capabilities. Importing a
// node-safe prompt factory in the worker does not make its UI callbacks sim.
//
// Emits a table (JSON + markdown) classifying every literal-string event type:
//   subscribers : files with bus.on/bus.once('type') inside the worker set
//   mainEmitters: files OUTSIDE the worker set with bus.emit/bus.queue('type')
//   simEmitters : files inside the worker set with bus.emit/bus.queue('type')
//
// A type is "main→sim required" when subscribers non-empty AND mainEmitters
// non-empty. Dynamic-type call sites (template/variable first arg) land in
// `dynamic` for human review — the census is explicit over literals and lists
// every dynamic site it could not bind.

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve, relative, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';
import { PRODUCTION_INIT_ORDER, getSystemCapability, isNodeSafeSystemId } from '../../src/runtime/authoritativeSystemManifest.js';

const traverse = traverseModule.default || traverseModule;
const isCLI = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const ENTRY = resolve(ROOT, 'scripts/lib/simWorkerHost.mjs');

function visit(node, fn) {
  if (!node || typeof node !== 'object') return;
  if (node.type) fn(node);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'loc' || key === 'comments' || key === 'tokens') continue;
    if (Array.isArray(value)) { for (const child of value) visit(child, fn); }
    else if (value && typeof value === 'object') visit(value, fn);
  }
}

// Read the registration owner, not a feature-directory/name convention. Follow
// the registered export through factory/local-object indirection, retaining
// ranges so a module may still contain a separate simulation factory.
export function registeredPresentationRanges(registryFile, {
  readSource = srcOf, resolveModule = resolveSpecifier,
  isPresentationId = id => PRODUCTION_INIT_ORDER.includes(id) && (!isNodeSafeSystemId(id)
    || getSystemCapability(id).phase === 'platform' || getSystemCapability(id).domGuarded === true),
} = {}) {
  const modules = new Map(), ranges = new Map(), seen = new Set();
  function moduleOf(file) {
    if (modules.has(file)) return modules.get(file);
    const ast = parse(readSource(file), { sourceType: 'module' });
    const imports = new Map(), defs = new Map();
    for (const statement of ast.program.body) {
      if (statement.type === 'ImportDeclaration') {
        for (const spec of statement.specifiers) {
          if (spec.type === 'ImportSpecifier') imports.set(spec.local.name,
            { file: resolveModule(statement.source.value, file), name: spec.imported.name });
        }
      }
      const node = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
      if (node?.type === 'FunctionDeclaration') defs.set(node.id.name, node);
      if (node?.type === 'VariableDeclaration') {
        for (const decl of node.declarations) if (decl.id.type === 'Identifier') defs.set(decl.id.name, decl.init);
      }
    }
    const references = new Map();
    traverse(ast, { ReferencedIdentifier(path) {
      const binding = path.scope.getBinding(path.node.name);
      if (binding?.scope.path.isProgram() && defs.has(path.node.name)) references.set(path.node, path.node.name);
    } });
    const result = { ast, imports, defs, references };
    modules.set(file, result);
    return result;
  }
  function include(file, name, followImport = false) {
    const key = `${file}:${name}`;
    if (seen.has(key)) return;
    seen.add(key);
    const mod = moduleOf(file), imported = mod.imports.get(name), node = mod.defs.get(name);
    if (followImport && imported?.file) return include(imported.file, imported.name, true);
    if (!node) return;
    if (!ranges.has(file)) ranges.set(file, []);
    ranges.get(file).push([node.start, node.end]);
    // Local helper functions/objects share this registered owner. Imported
    // utilities remain shared; their entire module is never reclassified.
    visit(node, child => { if (mod.references.has(child)) include(file, mod.references.get(child)); });
  }
  const registry = moduleOf(registryFile);
  visit(registry.ast.program, node => {
    if (node.type !== 'ArrayExpression' || node.elements.length !== 2) return;
    const [id, value] = node.elements;
    if (id?.type !== 'StringLiteral' || !isPresentationId(id.value)) return;
    visit(value, child => { if (child.type === 'Identifier') include(registryFile, child.name, true); });
  });
  return ranges;
}

const busReceiver = recv => /(^|[._])bus$/i.test(recv) || /(^|\.)(eventBus|events)$/i.test(recv);

// Bind only local, lexically resolved parameter relays into a bus emit/queue.
// This covers renamed/nested UI helpers without declaring every string passed
// to an arbitrary method to be a transport interface.
export function scanLocalEventHelpers(src) {
  const ast = parse(src, { sourceType: 'module' });
  const calls = [], functions = new Map();
  traverse(ast, {
    Function(path) { functions.set(path.node, { path, roles: new Map() }); },
    'CallExpression|OptionalCallExpression'(path) { calls.push(path); },
  });
  const memberName = node => !node.computed && node.property?.name;
  function target(path) {
    const callee = path.node.callee;
    let binding;
    if (callee.type === 'Identifier') {
      const resolved = path.scope.getBinding(callee.name);
      if (!resolved?.constant) return null;
      binding = resolved.path;
    }
    else if (callee.type === 'MemberExpression' || callee.type === 'OptionalMemberExpression') {
      let object;
      if (callee.object.type === 'ThisExpression') {
        // A normal nested function has its own `this`; arrows inherit it.
        const owner = path.findParent(p => p.isFunction() && !p.isArrowFunctionExpression());
        if (owner?.isObjectMethod() || owner?.parentPath?.isObjectProperty()) object = owner.parentPath;
        if (object?.isObjectProperty()) object = object.parentPath;
      } else if (callee.object.type === 'Identifier') {
        const decl = path.scope.getBinding(callee.object.name)?.path;
        if (decl?.isVariableDeclarator()) object = decl.get('init');
      }
      if (!object?.isObjectExpression()) return null;
      const prop = object.get('properties').find(p => !p.node.computed && p.node.key?.name === memberName(callee));
      if (prop?.isObjectMethod()) return functions.get(prop.node);
      if (prop?.isObjectProperty()) return functions.get(prop.node.value);
      return null;
    }
    if (binding?.isVariableDeclarator()) binding = binding.get('init');
    return binding && functions.get(binding.node);
  }
  function parameter(path, arg) {
    if (arg?.type !== 'Identifier') return null;
    const binding = path.scope.getBinding(arg.name);
    if (binding?.kind !== 'param' || !binding.constant) return null;
    const owner = binding.path.findParent(p => p.isFunction());
    const index = owner?.node.params.indexOf(binding.path.node);
    return index >= 0 ? { owner: functions.get(owner.node), index } : null;
  }
  const addRole = (fn, index, verbs) => {
    if (!fn.roles.has(index)) fn.roles.set(index, new Set());
    const role = fn.roles.get(index), before = role.size;
    for (const verb of verbs) role.add(verb);
    return role.size !== before;
  };
  for (const path of calls) {
    const callee = path.node.callee, verb = memberName(callee);
    if (!['emit', 'queue'].includes(verb) || !busReceiver(src.slice(callee.object.start, callee.object.end))) continue;
    const param = parameter(path, path.node.arguments[0]);
    if (param) addRole(param.owner, param.index, [verb]);
  }
  let changed;
  do {
    changed = false;
    for (const path of calls) {
      const fn = target(path);
      for (const [index, verbs] of fn?.roles || []) {
        const param = parameter(path, path.node.arguments[index]);
        if (param) changed = addRole(param.owner, param.index, verbs) || changed;
      }
    }
  } while (changed);
  const hits = [];
  for (const path of calls) {
    const fn = target(path);
    for (const [index, verbs] of fn?.roles || []) {
      const node = path.node.arguments[index];
      if (!node) continue;
      if (node.type === 'Identifier' && path.scope.getBinding(node.name)?.kind === 'param') continue;
      const arg = classifyArg(src.slice(node.start, node.end));
      if (arg.kind !== 'literal') continue;
      for (const verb of verbs) for (const type of arg.types) hits.push({
        recv: 'bus', verb, type, kind: 'literal', line: path.node.loc.start.line, offset: path.node.start,
      });
    }
  }
  return hits;
}

// ---- worker import set -----------------------------------------------------
const IMPORT_RE = /(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g;
const DYN_IMPORT_RE = /import\(\s*['"]([^'"]+)['"]\s*\)/g;

function resolveSpecifier(spec, fromFile) {
  if (!spec.startsWith('.')) return null;
  let base = resolve(dirname(fromFile), spec);
  const candidates = extname(base) ? [base] : [`${base}.js`, `${base}.mjs`, `${base}/index.js`, `${base}/index.mjs`];
  for (const c of candidates) {
    try { if (statSync(c).isFile()) return c; } catch (_) {}
  }
  return null;
}

function walkImports(entry) {
  const seen = new Set();
  const stack = [entry];
  while (stack.length) {
    const file = stack.pop();
    if (!file || seen.has(file)) continue;
    seen.add(file);
    let src;
    try { src = readFileSync(file, 'utf8'); } catch (_) { continue; }
    for (const re of [IMPORT_RE, DYN_IMPORT_RE]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(src))) {
        const r = resolveSpecifier(m[1], file);
        if (r && r.startsWith(ROOT) && !seen.has(r)) stack.push(r);
      }
    }
  }
  return seen;
}

// ---- source scan -----------------------------------------------------------
function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = resolve(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name.startsWith('.')) continue;
      yield* walk(p);
    } else if (/\.(js|mjs)$/.test(name)) {
      yield p;
    }
  }
}

// call sites: receiver.bus.(on|once|emit|queue)('type' | `tpl` | expr)
const CALL_RE = /([A-Za-z_$][\w$.[\]]*)\s*(?:\?\.|\.)\s*(on|once|emit|queue)\s*(?:\?\.)?\s*\(\s*([^,)\n]+)/g;
// per-system wrapper subscriptions: receiver._listen('type' | IDENT.PROP | expr).
// Stage-9 remediation: systems subscribe through a `this._listen(event, fn)`
// helper that delegates to this.bus.on — the literal scan above sees the
// wrapper, never the subscription. A `._listen(` call counts as a subscription
// only when the file either defines a `_listen` whose body window references
// the bus, or does not define `_listen` at all (inherited helper — same bus
// convention across the codebase).
const LISTEN_RE = /([A-Za-z_$][\w$.[\]]*)\s*\.\s*_listen\s*\(\s*([^,)\n]+)/g;
const LISTEN_DEF_RE = /_listen\s*\(\s*[^)]*\)\s*\{/;
// bare alias calls: on('type' / emit('type' — counted only when the file
// defines a local alias for that verb whose body touches a bus
// (`const on = (e,f) => bus.on(e,f)` / `function on(e,f){ ...bus.on... }`).
const ALIAS_RE = /(?:const|let|var)\s+(on|once|emit|queue)\s*=|function\s+(on|once|emit|queue)\s*\([^)]*\)\s*\{/g;
const BARE_CALL_RE = /(^|[^\w$.])(on|once|emit|queue)\s*\(\s*([^,)\n]+)/g;

// ---------------------------------------------------------------------------
// Const-resolution prepass. Enum-argged call sites
// (`_listen(CAREER_LADDER_EVENTS.ACCEPT, ...)`,
// `emit(bus, SOME_EVENT, ...)`) carry `IDENT.PROP` or `IDENT` expressions whose
// literal lives in a const declaration anywhere under src/. Two maps:
//   const NAME = 'type'                       → constString(NAME)
//   const NAME = { KEY: 'type', ... }         → constObject(NAME.KEY)
//   const NAME = Object.freeze({ KEY: ... })  → same
// Prepass runs over every src file before any call-site scan so import edges
// are not needed (enum maps are resolved globally by name).
// ---------------------------------------------------------------------------
const CONST_STR_RE = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*['"]([^'"]+)['"]\s*;/g;
const CONST_OBJ_RE = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:Object\.freeze\s*\(\s*)?\{/g;
const OBJ_ENTRY_RE = /([A-Za-z_$][\w$]*)\s*:\s*['"]([^'"]+)['"]/g;

const constStrings = new Map(); // NAME -> 'type'
const constObjects = new Map(); // NAME -> Map(KEY -> 'type')

function collectConsts(src) {
  CONST_STR_RE.lastIndex = 0;
  let m;
  while ((m = CONST_STR_RE.exec(src))) {
    if (!constStrings.has(m[1])) constStrings.set(m[1], m[2]);
  }
  CONST_OBJ_RE.lastIndex = 0;
  while ((m = CONST_OBJ_RE.exec(src))) {
    // The object body runs to the first closing brace at column-start-ish
    // depth 0 — enum maps are flat KEY:'value' tables, so a nested '{' or '}'
    // inside the slice marks a non-enum decl and the whole decl is skipped.
    const open = CONST_OBJ_RE.lastIndex;
    const close = src.indexOf('}', open);
    if (close < 0) continue;
    const body = src.slice(open, close);
    if (/[{}]/.test(body)) continue;
    let table = constObjects.get(m[1]);
    if (!table) { table = new Map(); constObjects.set(m[1], table); }
    OBJ_ENTRY_RE.lastIndex = 0;
    let e;
    while ((e = OBJ_ENTRY_RE.exec(body))) {
      if (!table.has(e[1])) table.set(e[1], e[2]);
    }
  }
}

const fileSrcCache = new Map();
function srcOf(file) {
  let src = fileSrcCache.get(file);
  if (src === undefined) { try { src = readFileSync(file, 'utf8'); } catch (_) { src = ''; } fileSrcCache.set(file, src); }
  return src;
}

// Prepass: pull const declarations out of every src file BEFORE any call site
// is classified (resolution is global — enum maps import across modules).
const SRC_ALL = resolve(ROOT, 'src');
for (const file of walk(SRC_ALL)) collectConsts(srcOf(file));

function resolveExprArg(a) {
  // IDENT.PROP — enum map member access.
  let m = /^([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)$/.exec(a);
  if (m) {
    const table = constObjects.get(m[1]);
    const v = table && table.get(m[2]);
    if (typeof v === 'string' && v.length) return { kind: 'literal', types: [v] };
  }
  // IDENT — whole-const string. Only counts when the resolved value is
  // event-shaped (contains ':'): a bare identifier arg is usually a runtime
  // variable, not an event-name const (`emit(name)` must not bind to
  // `let name = 'UNKNOWN STRATA'`). Enum-member access above stays liberal —
  // `IDENT.PROP` reads are deliberate enum lookups and may hold colon-less
  // event names.
  m = /^([A-Za-z_$][\w$]*)$/.exec(a);
  if (m) {
    const v = constStrings.get(m[1]);
    if (typeof v === 'string' && v.includes(':')) return { kind: 'literal', types: [v] };
  }
  // Multi-literal expr — ternary/switch emits:
  //   emit(act === 'x' ? 'a:b' : 'a:c')  →  both literals are emit candidates.
  // Require >=2 event-shaped (colon-containing) literals so a lone string
  // fragment inside an expression is never promoted to a type.
  const lits = [];
  const litRe = /'([^'\n]{2,})'|"([^"\n]{2,})"/g;
  while ((m = litRe.exec(a))) {
    const v = m[1] !== undefined ? m[1] : m[2];
    if (v.includes(':')) lits.push(v);
  }
  if (lits.length >= 2) return { kind: 'literal', types: [...new Set(lits)] };
  return { kind: 'expr', types: [a] };
}

function classifyArg(arg) {
  const a = arg.trim();
  if (/^['"][A-Za-z0-9_:.*-]+['"]$/.test(a)) return { kind: 'literal', types: [a.slice(1, -1)] };
  if (/^`[^`]*`$/.test(a)) return { kind: 'template', types: [a] };
  return resolveExprArg(a);
}

function scanFile(file) {
  const src = srcOf(file);
  const hits = [];
  const pushArgHits = (recv, verb, argSrc, line, offset) => {
    const arg = classifyArg(argSrc);
    for (const type of arg.types) {
      hits.push({ recv, verb, kind: arg.kind === 'template' ? 'template' : (arg.kind === 'expr' ? 'expr' : 'literal'), type, line, offset });
    }
  };
  CALL_RE.lastIndex = 0;
  let m;
  while ((m = CALL_RE.exec(src))) {
    const recv = m[1];
    const verb = m[2];
    const line = src.slice(0, m.index).split('\n').length;
    pushArgHits(recv, verb, m[3], line, m.index);
  }
  // `X._listen('type' | IDENT.PROP, fn)` — the per-system bus.on wrapper.
  LISTEN_DEF_RE.lastIndex = 0;
  const defMatch = LISTEN_DEF_RE.exec(src);
  const listenIsBus = !defMatch || /\bbus\b/.test(src.slice(defMatch.index, defMatch.index + 320));
  if (listenIsBus) {
    LISTEN_RE.lastIndex = 0;
    while ((m = LISTEN_RE.exec(src))) {
      const line = src.slice(0, m.index).split('\n').length;
      pushArgHits(`${m[1]}._listen`, 'on', m[2], line, m.index);
    }
  }
  // Bus-alias verbs defined in this file. An arrow assignment counts when its
  // rhs slice references `.bus` / `bus.`; a function declaration counts when a
  // window after the opening brace does.
  const aliases = new Set();
  ALIAS_RE.lastIndex = 0;
  while ((m = ALIAS_RE.exec(src))) {
    const verb = m[1] || m[2];
    const window = src.slice(m.index, m.index + 320);
    if (/\bbus\b/.test(window)) aliases.add(verb);
  }
  if (aliases.size) {
    BARE_CALL_RE.lastIndex = 0;
    while ((m = BARE_CALL_RE.exec(src))) {
      const verb = m[2];
      if (!aliases.has(verb)) continue;
      const line = src.slice(0, m.index).split('\n').length;
      pushArgHits(`alias:${verb}`, verb, m[3], line, m.index);
    }
  }
  if (hits.some(hit => hit.kind === 'expr' && ['emit', 'queue'].includes(hit.verb) && busReceiver(hit.recv))) {
    hits.push(...scanLocalEventHelpers(src));
  }
  return hits;
}

const workerSet = walkImports(ENTRY);
const workerRel = new Set([...workerSet].map((p) => relative(ROOT, p).replace(/\\/g, '/')));
// The browser worker entry + the lane twin are main-side transport, not sim.
workerRel.delete('src/core/wholeSimBrowserWorker.js');

const types = new Map(); // type -> {subscribers:Set, mainEmitters:Set, simEmitters:Set}
const dynamicSites = [];
const nonBusOn = new Map(); // suspicious .on receivers for eyeball review

function typeRec(t) {
  let r = types.get(t);
  if (!r) { r = { subscribers: new Set(), mainSubscribers: new Set(), mainEmitters: new Set(), simEmitters: new Set() }; types.set(t, r); }
  return r;
}

// Presentation-layer paths: transitively imported by the worker (shared
// helpers/constants) but their emit/on call sites only ever execute main-side.
// Per the stage-9 brief these are main-side regardless of import membership.
const PRESENTATION_RE = /^(src\/(ui|render|audio|presentation)\/|src\/main\.js$)/;
const isPresentationPath = (rel) => PRESENTATION_RE.test(rel);

// Harness code: drives its own in-process sim on its own bus — emits never
// touch the lane boundary. src/balance/** and src/testing/** are dev harnesses;
// haulerOriginSystem.js is a never-registered candidate module (dead code).
const HARNESS_RE = /^src\/(balance|testing)\//;
const HARNESS_FILES = new Set(['src/careers/origins/haulerOriginSystem.js']);
const isHarnessPath = (rel) => HARNESS_RE.test(rel) || HARNESS_FILES.has(rel);

const presentationRanges = registeredPresentationRanges(resolve(ROOT, 'src/runtime/presentationRegistry.js'));

const SRC = resolve(ROOT, 'src');
for (const file of walk(SRC)) {
  const rel = relative(ROOT, file).replace(/\\/g, '/');
  for (const hit of scanFile(file)) {
    const inPresentationFactory = presentationRanges.get(file)?.some(([start, end]) => start <= hit.offset && hit.offset < end);
    const inWorker = workerRel.has(rel) && !isPresentationPath(rel) && !inPresentationFactory;
    const busish = busReceiver(hit.recv)
      // `X._listen('type', fn)` hits carry recv '<X>._listen' — the per-system
      // bus.on wrapper verified by scanFile's LISTEN_DEF_RE check.
      || /\._listen$/.test(hit.recv);
    if (hit.kind === 'literal') {
      if (hit.verb === 'on' || hit.verb === 'once') {
        if (hit.recv.startsWith('alias:') || busish) {
          if (isHarnessPath(rel)) continue;
          (inWorker ? typeRec(hit.type).subscribers : typeRec(hit.type).mainSubscribers).add(rel);
        } else if (!nonBusOn.has(hit.recv)) nonBusOn.set(hit.recv, `${rel}:${hit.line}`);
      } else { // emit | queue
        if (isHarnessPath(rel)) continue;
        const rec = typeRec(hit.type);
        if (inWorker) rec.simEmitters.add(rel);
        else rec.mainEmitters.add(rel);
      }
    } else if (hit.kind === 'template' || hit.kind === 'expr') {
      dynamicSites.push({ file: rel, line: hit.line, recv: hit.recv, verb: hit.verb, arg: hit.type, side: inWorker ? 'sim' : 'main' });
    }
  }
}

// ---- output ----------------------------------------------------------------
export const rows = [];
for (const [t, r] of types) {
  rows.push({
    type: t,
    simSubscribers: [...r.subscribers].sort(),
    mainSubscribers: [...r.mainSubscribers].sort(),
    mainEmitters: [...r.mainEmitters].sort(),
    simEmitters: [...r.simEmitters].sort(),
    needsForward: r.subscribers.size > 0 && r.mainEmitters.size > 0,
  });
}
rows.sort((a, b) => a.type.localeCompare(b.type));

const out = {
  generatedAt: new Date().toISOString(),
  workerModuleCount: workerRel.size,
  rows,
  dynamicSites: dynamicSites.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line),
  nonBusOnReceivers: [...nonBusOn.entries()].sort(),
};
if (isCLI && !process.argv.includes('--forward-set') && !process.argv.includes('--markdown')) {
  console.log(JSON.stringify(out, null, 1));
}

// ============================================================================
// Stage-9 forward-set emission.
//
// `--forward-set <path>`   writes src/core/mainToSimEventSurface.js (generated)
// `--markdown <path>`      writes design/perf/S1-EVENT-SURFACE.md
// Neither flag:            JSON census to stdout (scratch/analysis).
// ============================================================================

// Dynamic-type call sites the literal scan cannot bind, resolved by hand at
// stage 9. Each entry: the resolved event type, where the emit comes from, and
// why a literal scan missed it. Sim-side subscription was verified at the same
// sites the literal census lists.
const DYNAMIC_FORWARD = [
  { type: 'achievement:unlocked', emitters: ['src/systems/achievements.js'], note: 'main achievement ledger emits via ACHIEVEMENT_UNLOCKED_EVENT; sim chronicler subscribes through FACT_EVENTS' },
  { type: 'rigWorkshop:choose', emitters: ['src/features/rigWorkshop/presentation.js'], note: 'dual-realm public physical workshop choice adapter' },
  { type: 'shipbreakingYard:action', emitters: ['src/features/shipbreakingYard/browser.js'], note: 'dual-realm public yard choice adapter' },
  ...['salvageTender:action', 'salvageTender:inspect'].map(type => ({
    type, emitters: ['src/features/salvageTender/integration.js'], note: 'dual-realm public tender prompt adapter',
  })),
  { type: 'salvageOutfits:choose', emitters: ['src/features/salvageOutfits/integration.js'], note: 'dual-realm public salvage outfit terms adapter' },
  ...['industrialDisasters:command', 'industrialDisasters:requirePresentation', 'industrialDisasters:presentationReady'].map(type => ({
    type, emitters: ['src/features/industrialDisasters/workerAdapter.js'], note: 'validated industrial request port; normally uses direct laneBusEmit, bus fallback remains lane-safe',
  })),
  ...['ilexArk:accept', 'ilexArk:deliver', 'ilexArk:finish', 'ilexArk:course'].map(type => ({
    type, emitters: ['src/ui/ilexArkPrompt.js'], note: 'finite Ilex voyage decision adapter dynamic dispatch; subscribed by ilexArk',
  })),
  ...['towlineTable:take', 'towlineTable:deliver', 'towlineTable:assist', 'towlineTable:release', 'towlineTable:course'].map(type => ({
    type, emitters: ['src/ui/towlineTablePrompt.js'], note: 'finite Towline decision adapter dynamic dispatch; subscribed by towlineTable',
  })),
  ...['orbital-gallery:retry', 'orbital-gallery:next', 'orbital-gallery:leave',
    'kinetic-league:retry', 'kinetic-league:next', 'kinetic-league:leave'].map(type => ({
    type, emitters: ['src/ui/physicsVenues.js'], note: 'public venue instrument dynamic dispatch',
  })),
  ...['mercyService:order', 'mercyService:tool', 'wreckCourt:action', 'spectrum:focus'].map(type => ({
    type, emitters: ['src/ui/physicalJobsPrompt.js'], note: 'public field-work decision adapter',
  })),
  { type: 'ui:buy', emitters: ['src/systems/pirates.js'], note: 'ternary emit: trade ? "ui:buy" : ...' },
  { type: 'ui:sell', emitters: ['src/systems/pirates.js'], note: 'ternary emit: trade ? ... : "ui:sell"' },
  { type: 'ui:talkContact', emitters: ['src/systems/barContacts.js'], note: 'emit via resolved event const' },
  { type: 'orrinWitness:submitEvidence', emitters: ['src/systems/barContacts.js'], note: 'emit via ORRIN_WITNESS_SUBMISSION_EVENT const; story.js:240 subscribes via the same const' },
  { type: 'claim:defenseIgnore', emitters: ['src/ui/galaxyMap.js'], note: 'verb.event / action.event.name emit' },
  { type: 'nav:engageRoute', emitters: ['src/ui/galaxyMap.js'], note: 'action.event emit' },
  { type: 'nav:abortRoute', emitters: ['src/ui/galaxyMap.js'], note: 'action.event emit' },
  { type: 'ui:endgameUnfiledJumpConfirm', emitters: ['src/systems/comms.js'], note: 'intentEvent emit' },
  { type: 'signal:track', emitters: ['src/ui/signalInvestigationPrompt.js'], note: 'resolved event const' },
  { type: 'signal:investigate', emitters: ['src/ui/signalInvestigationPrompt.js'], note: 'resolved event const' },
  // shipworks.js emits through a local `emitFitIntent(eventName, payload)`
  // helper (`ctx.bus.emit(eventName, ...)` inside a refusal-probe wrapper) —
  // the verb is not a bus method name so no scan pattern binds the site.
  // Sim subscribers: onboarding.js + ships.js (literal bus.on).
  { type: 'ui:buyModule', emitters: ['src/ui/station/screens/shipworks.js'], note: 'emitFitIntent helper emit (shipworks fit intents)' },
  { type: 'ui:fitModule', emitters: ['src/ui/station/screens/shipworks.js'], note: 'emitFitIntent helper emit (shipworks fit intents)' },
];

// Stage-8's hand-maintained forward set carried these on purpose: replayed
// worker→main types that are also emitted main-side during boot/restore, or
// kept for symmetric coverage. Unioned in so closing the hand-maintained list
// does not regress them.
const LEGACY_FORWARD = [
  // Preserve these existing public bridge contracts while current literal scanning
  // does not rediscover their dynamic or symmetric call sites. No new actions.
  'encounter:resolved', 'industrialDisasters:command',
  'industrialDisasters:presentationReady', 'industrialDisasters:requirePresentation',
  'ledger:evidenceLinked', 'race:restart', 'rigWorkshop:choose',
  'salvageOutfits:choose', 'salvageTender:action', 'salvageTender:inspect',
  'shipbreakingYard:action',
  'world:playerRelocated', 'ship:appearanceChanged', 'entity:kill',
  'entity:spawnRequest', 'save:restoring', 'save:loaded', 'scenario:branchChoice',
];

// Payload adapter classification: every forwarded type goes through the generic
// canonicalClone + entityRef-flatten adapter except these bespoke ones.
const BESPOKE_ADAPTERS = {
  'game:load': '__laneStorage: ships the whole sf.* keyspace into the worker storage shim',
  'game:save': '__laneStorage: ships the whole sf.* keyspace into the worker storage shim',
};

// Census hits that must NOT cross the lane anyway. game:started is a main-side
// lifecycle RECEIPT: the worker sim initiates its own game lifecycle (newGame
// rpc / save cascade), and replaying the receipt double-fires ~30 sim-side
// new-game subscribers — sectorSim._seedCurrentSector, factions/missions
// newGame, ships — spawning into an already-seeded world. Verified stage-9:
// forwarded game:started leaves duplicate ship ids in entityList, which the
// post-restore presentation-journal rebuild rejects (rebuild-publication-
// failed) → CONTINUE regression in check-game-playable. game:new is forwarded
// and verified safe; only the receipt is excluded.
// Stage-9 remediation: the receipt now reaches the sim through the worker's own
// lifecycle — the newGameBoot rpc stages a pending payload and the first
// post-boot 'flight' mode application emits game:started once on the worker
// bus, whose bridge receipt fires main-side subscribers exactly once. Main's
// emit is suppressed on the worker lane, so nothing needs forwarding here.
const FORWARD_EXCLUDE = {
  'mission:updated': 'main-side domain-mirror receipt refreshes UI after worker mission rows land; it is never a gameplay intent and must not echo back to the worker',
  'game:started': 'lifecycle receipt — worker emits its own once post-boot (pendingGameStarted consumed at the first flight-mode apply); forwarding a main emit would double-fire sim subscribers',
  // Dead subscriptions verified stage-9 remediation: sim-side `bus.on` subs
  // exist but NOTHING emits these types anywhere in src/. needsForward already
  // fails (mainEmitters is empty), so these rows never forward — they are
  // listed so the generated surface documents them as reviewed dead ends, not
  // census gaps.
  'ui:restockBombRack': 'dead subscription — sim-side subscriber exists but no emitters anywhere; nothing would ever ship',
  'ui:endgameConfirm': 'dead subscription — sim-side subscriber exists but no emitters anywhere; nothing would ever ship',
  'ui:endingArchiveOpen': 'dead subscription — sim-side subscriber exists but no emitters anywhere; nothing would ever ship',
  'ui:heliosBay7Scan': 'dead subscription — sim-side subscriber exists but no emitters anywhere; nothing would ever ship',
};

// Existing committed main-only contracts, retained without enabling forwarding.
const COMPAT_KNOWN_UNFORWARDED = ['comms:log', 'encounter:choiceOffered'];

export function computeForwardSet() {
  const censusTypes = new Set();
  for (const r of rows) if (r.needsForward) censusTypes.add(r.type);
  const dynamic = new Set(DYNAMIC_FORWARD.map((d) => d.type));
  const legacy = new Set(LEGACY_FORWARD);
  const excluded = new Set(Object.keys(FORWARD_EXCLUDE));
  const all = new Set([...censusTypes, ...dynamic, ...legacy]);
  for (const t of excluded) all.delete(t);
  // KNOWN_UNFORWARDED — every type the census can prove does not need the lane:
  // main-emitted types with zero sim-side subscribers (main-only by
  // construction) plus everything FORWARD_EXCLUDE documents (excluded
  // lifecycle receipts and verified dead subscriptions). The lane-forward shim
  // counts emits absent from BOTH sets as genuinely uncovered — stage-9's
  // `unforwardedEmitCount === 0` gate then fails loudly when a new emit type
  // escapes the census instead of dead-ending silently.
  const knownUnforwarded = new Set([...excluded, ...COMPAT_KNOWN_UNFORWARDED]);
  // game:started stays OUT: on the worker lane any main-side emit of it is the
  // stage-9 double-fire bug class — the LANE-FWD gate must count it loudly,
  // not file it under "known". Dead-subscription excludes (ui:restockBombRack
  // et al.) stay in: an emit of those is reviewed dead-end traffic.
  knownUnforwarded.delete('game:started');
  for (const r of rows) {
    if (r.mainEmitters.length > 0 && r.simSubscribers.length === 0 && !all.has(r.type)) knownUnforwarded.add(r.type);
  }
  return { censusTypes, dynamic, legacy, excluded, all, knownUnforwarded };
}

function emitForwardSetModule(path) {
  const { censusTypes, dynamic, legacy, excluded, all, knownUnforwarded } = computeForwardSet();
  const lines = [];
  lines.push('// GENERATED by scripts/lib/eventSurfaceCensus.mjs --forward-set.');
  lines.push('// Do not hand-edit: regenerate with `node scripts/lib/eventSurfaceCensus.mjs --forward-set`.');
  lines.push('//');
  lines.push('// Every event type a main-side emitter can raise that a sim-side system');
  lines.push('// subscribes to. installBusForward gates the main\u2192worker bus bridge on this');
  lines.push('// set; an emit whose type is absent bumps the unforwardedEmitTypes');
  lines.push('// diagnostic instead of crossing the lane.');
  lines.push('');
  lines.push('export const MAIN_TO_SIM_BUS_EVENTS = new Set([');
  for (const t of [...all].sort()) lines.push(`  '${t}',`);
  lines.push(']);');
  lines.push('');
  lines.push('// Census hits deliberately NOT forwarded — see FORWARD_EXCLUDE in the');
  lines.push('// generator for the full reasons.');
  for (const [t, reason] of Object.entries(FORWARD_EXCLUDE)) {
    lines.push(`//   ${t} — ${reason}`);
  }
  lines.push('');
  lines.push('// Types covered by bespoke payload adapters rather than the generic');
  lines.push('// canonicalClone+entityRef-flatten pass.');
  lines.push('export const BESPOKE_FORWARD_ADAPTERS = new Set([');
  for (const t of Object.keys(BESPOKE_ADAPTERS)) lines.push(`  '${t}',`);
  lines.push(']);');
  lines.push('');
  lines.push('// Every type the census proves does not cross the lane: main-emitted');
  lines.push('// types with zero sim-side subscribers, plus the FORWARD_EXCLUDE rows');
  lines.push('// above. installBusForward counts emits absent from BOTH sets — the');
  lines.push('// LANE-FWD gate asserts unforwardedEmitCount === 0, so a main emit of');
  lines.push('// a type on neither list fails the contract loudly instead of dead-ending.');
  lines.push('export const KNOWN_UNFORWARDED_BUS_EVENTS = new Set([');
  for (const t of [...knownUnforwarded].sort()) lines.push(`  '${t}',`);
  lines.push(']);');
  lines.push('');
  lines.push(`// provenance: census=${censusTypes.size} dynamic=${dynamic.size} legacy=${legacy.size} excluded=${excluded.size} total=${all.size} knownUnforwarded=${knownUnforwarded.size}`);
  lines.push('');
  writeFileSync(path, lines.join('\n'), 'utf8');
  console.log(`wrote ${path}: ${all.size} forwarded types (census=${censusTypes.size} dynamic=${dynamic.size} legacy=${legacy.size} excluded=${excluded.size})`);
}

function emitMarkdown(path) {
  const { dynamic, legacy, all, excluded } = computeForwardSet();
  const L = [];
  L.push('# S1 event-surface census');
  L.push('');
  L.push('Generated by `node scripts/lib/eventSurfaceCensus.mjs --markdown`. Do not hand-edit.');
  L.push('');
  L.push('Sim side defaults to the import closure of `scripts/lib/simWorkerHost.mjs`, excluding');
  L.push('presentation paths (`src/ui/`, `src/render/`, `src/audio/`, `src/presentation/`,');
  L.push('`src/main.js`) and harness paths (`src/balance/**`, `src/testing/**`,');
  L.push('`src/careers/origins/haulerOriginSystem.js`). Registered presentation factories');
  L.push('are main-side according to the current manifest capability, even when node-safe.');
  L.push('Local event-parameter helpers are resolved by lexical binding. Main side = everything else.');
  L.push('');
  L.push(`**Forwarded main\u2192sim types: ${all.size}** (census-resolved + hand-resolved dynamic + legacy).`);
  L.push('');
  L.push('## Forwarded types (main-emitted, sim-subscribed)');
  L.push('');
  L.push('| event type | main emitters | sim subscribers | adapter |');
  L.push('|---|---|---|---|');
  for (const r of rows) {
    if (!r.needsForward || excluded.has(r.type)) continue;
    const adapter = BESPOKE_ADAPTERS[r.type] || 'generic (canonicalClone + entityRef flatten)';
    L.push(`| \`${r.type}\` | ${r.mainEmitters.map((f) => `\`${f}\``).join('<br>')} | ${r.simSubscribers.map((f) => `\`${f}\``).join('<br>')} | ${adapter} |`);
  }
  L.push('');
  L.push('## Census types deliberately NOT forwarded');
  L.push('');
  L.push('| event type | reason |');
  L.push('|---|---|');
  for (const [t, reason] of Object.entries(FORWARD_EXCLUDE)) {
    L.push(`| \`${t}\` | ${reason} |`);
  }
  L.push('');
  L.push('## Forwarded types (dynamic-resolved)');
  L.push('');
  L.push('Literal-arg scanning could not bind these sites; each was resolved by hand.');
  L.push('');
  L.push('| event type | main emitter | resolution |');
  L.push('|---|---|---|');
  for (const d of DYNAMIC_FORWARD) {
    L.push(`| \`${d.type}\` | ${d.emitters.map((f) => `\`${f}\``).join('<br>')} | ${d.note} |`);
  }
  L.push('');
  L.push('## Forwarded types (legacy, preserved from stage-8 set)');
  L.push('');
  L.push('Replayed or symmetric-coverage types kept so closing the hand-maintained');
  L.push('allowlist cannot regress them:');
  L.push('');
  for (const t of legacy) L.push(`- \`${t}\``);
  L.push('');
  L.push('## Deliberately main-only (emitted main-side, no sim subscribers)');
  L.push('');
  L.push('| event type | main emitters | reason |');
  L.push('|---|---|---|');
  for (const r of rows) {
    if (r.needsForward || r.mainEmitters.length === 0 || r.simSubscribers.length > 0) continue;
    L.push(`| \`${r.type}\` | ${r.mainEmitters.map((f) => `\`${f}\``).join('<br>')} | no sim-side subscribers |`);
  }
  L.push('');
  L.push('## Worker-emitted, main-subscribed (bridge adapters)');
  L.push('');
  L.push('Worker\u2192main projection types shipped by `scripts/lib/simEventBridge.mjs`');
  L.push('adapters:');
  L.push('');
  for (const r of rows) {
    if (r.simEmitters.size === 0 || r.mainSubscribers.size === 0) continue;
    L.push(`- \`${r.type}\``);
  }
  L.push('');
  L.push('## Dynamic call sites (unresolved by scan — reviewed, none needing forward missed)');
  L.push('');
  L.push('| file:line | recv.verb | arg | side |');
  L.push('|---|---|---|---|');
  for (const d of dynamicSites) {
    L.push(`| \`${d.file}:${d.line}\` | \`${d.recv}.${d.verb}\` | \`${d.arg}\` | ${d.side} |`);
  }
  L.push('');
  writeFileSync(path, L.join('\n'), 'utf8');
  console.log(`wrote ${path}: ${all.size} forwarded, ${rows.length} types total`);
}

const fwdFlag = process.argv.indexOf('--forward-set');
const mdFlag = process.argv.indexOf('--markdown');
if (isCLI && fwdFlag !== -1) emitForwardSetModule(resolve(ROOT, process.argv[fwdFlag + 1] || 'src/core/mainToSimEventSurface.js'));
if (isCLI && mdFlag !== -1) emitMarkdown(resolve(ROOT, process.argv[mdFlag + 1] || 'design/perf/S1-EVENT-SURFACE.md'));
