// spaceface.simScenario.v1 — declarative deterministic gameplay lab scenarios.
// SEPARATE from spaceface.scenarioContract.v1 (narrative 47-A schema).
// No arbitrary JavaScript expressions; closed-loop policies are registered IDs only.

export const SIM_SCENARIO_SCHEMA = 'spaceface.simScenario.v1';
export const SIM_SCENARIO_VALIDATION_RESULT_SCHEMA = 'spaceface.simScenarioValidationResult.v1';
export const SIM_SCENARIO_CANONICAL_SCHEMA = 'spaceface.simScenarioCanonical.v1';

export const EVIDENCE_CLASSES = Object.freeze([
  'kernel',
  'focused-fixture',
  'production-fixture',
  'public-input',
  'browser-parity',
  'public-route',
  'presentation',
  'performance',
  'human-review',
]);

const ID_PATTERN = /^[a-z][a-z0-9_.:-]*$/i;
const METRIC_NAME_PATTERN = /^[a-z][a-z0-9_.-]*$/i;

const TOP_KEYS = new Set([
  'schema',
  'id',
  'version',
  'title',
  'description',
  'evidenceClass',
  'runtimeProfile',
  'seed',
  'ticks',
  'dt',
  'world',
  'entities',
  'relations',
  'attachments',
  'inputEvents',
  'frames',
  'policies',
  'checkpoints',
  'trace',
  'metrics',
  'assertions',
  'parameterOverlay',
  'fixtureExceptions',
  'systems',
  'observer',
  'notes',
  // H12/H13: comparison policy is part of the validated canonical surface (hashed).
  'saveLoadEquivalence',
]);

const WORLD_KEYS = new Set([
  'fixtureProfile',
  'sectorId',
  'mode',
  'physicsBackend',
  'flightBackend',
  'aiBackend',
  'credits',
]);

const ENTITY_KEYS = new Set([
  'alias',
  'profile',
  'role',
  'team',
  'factionId',
  'isPlayer',
  'pos',
  'vel',
  'heading',
  'angularVelocity',
  'overrides',
  'loadout',
  'persistent',
]);

const ATTACHMENT_KEYS = new Set([
  'defId',
  'ownerAlias',
  'targetAlias',
  'restLength',
]);

const INPUT_EVENT_KEYS = new Set([
  'tick',
  'device',
  'code',
  'pressed',
  'sequence',
  'keys',
  'pointer',
  'buttons',
  'gamepad',
  'touch',
]);

const FRAME_KEYS = new Set(['tick', 'input', 'commands']);
/** Closed schema for nested frame.input — unknown keys rejected (H14). */
const FRAME_INPUT_KEYS = new Set([
  'moveX',
  'moveZ',
  'turnIntent',
  'boost',
  'fire',
  'fireGroup',
  'aimAngle',
  'reelDelta',
  'brake',
  'masslineHeld',
  'lineLength',
  'orbitDirection',
  'massline',
]);
const POLICY_KEYS = new Set(['id', 'version', 'params']);
const CHECKPOINT_KEYS = new Set(['tick', 'kind', 'label']);
const TRACE_KEYS = new Set(['signals', 'sampleEvery']);
const METRIC_KEYS = new Set(['name', 'version', 'params', 'threshold']);
const ASSERTION_KEYS = new Set([
  'kind',
  'metric',
  'op',
  'value',
  'byTick',
  'fromTick',
  'toTick',
  'signal',
  'holdsTicks',
  'never',
  'equivalence',
  'expected',
  'delta',
  'absolute',
]);
const OVERLAY_KEYS = new Set(['schema', 'version', 'values']);
const POS_KEYS = new Set(['x', 'y', 'z']);

// Strings that look like executable expressions — reject at validation.
const JS_EXPRESSION_RE = /=>|function\s*\(|\$\{|eval\s*\(|new\s+Function|__proto__|constructor\s*\[/;

/**
 * @param {unknown} doc
 * @param {{ file?: string }} [options]
 */
export function validateSimScenario(doc, options = {}) {
  const issues = [];
  const file = options.file || null;

  function issue(path, rule, message) {
    issues.push({ file, path, rule, message });
  }

  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    issue('$', 'type', 'scenario document must be a plain object');
    return result(false, issues);
  }

  rejectUnknownKeys(doc, TOP_KEYS, '$', issue);
  rejectJsExpressions(doc, '$', issue);

  if (doc.schema !== SIM_SCENARIO_SCHEMA) {
    issue('$.schema', 'schema', `expected ${SIM_SCENARIO_SCHEMA}`);
  }
  if (typeof doc.id !== 'string' || !ID_PATTERN.test(doc.id)) {
    issue('$.id', 'id', 'id must match [a-z][a-z0-9_.:-]*');
  }
  if (doc.version != null && (typeof doc.version !== 'number' || !Number.isFinite(doc.version))) {
    issue('$.version', 'type', 'version must be a finite number when present');
  }
  if (typeof doc.evidenceClass !== 'string' || !EVIDENCE_CLASSES.includes(doc.evidenceClass)) {
    issue('$.evidenceClass', 'enum', `evidenceClass must be one of: ${EVIDENCE_CLASSES.join(', ')}`);
  }
  if (typeof doc.seed !== 'number' || !Number.isFinite(doc.seed)) {
    issue('$.seed', 'type', 'seed must be a finite number');
  }
  if (!Number.isInteger(doc.ticks) || doc.ticks < 1) {
    issue('$.ticks', 'type', 'ticks must be a positive integer');
  }
  if (doc.dt != null && (!(typeof doc.dt === 'number') || !(doc.dt > 0))) {
    issue('$.dt', 'type', 'dt must be a positive number when present');
  }
  if (doc.runtimeProfile != null && typeof doc.runtimeProfile !== 'string') {
    issue('$.runtimeProfile', 'type', 'runtimeProfile must be a string when present');
  }

  if (doc.world != null) {
    if (typeof doc.world !== 'object' || Array.isArray(doc.world)) {
      issue('$.world', 'type', 'world must be an object');
    } else {
      rejectUnknownKeys(doc.world, WORLD_KEYS, '$.world', issue);
    }
  }

  if (doc.entities != null) {
    if (!Array.isArray(doc.entities)) {
      issue('$.entities', 'type', 'entities must be an array');
    } else {
      const aliases = new Set();
      doc.entities.forEach((ent, i) => {
        const p = `$.entities[${i}]`;
        if (!ent || typeof ent !== 'object' || Array.isArray(ent)) {
          issue(p, 'type', 'entity must be an object');
          return;
        }
        rejectUnknownKeys(ent, ENTITY_KEYS, p, issue);
        if (typeof ent.alias !== 'string' || !ent.alias) {
          issue(`${p}.alias`, 'required', 'entity.alias is required');
        } else if (aliases.has(ent.alias)) {
          issue(`${p}.alias`, 'unique', `duplicate alias ${ent.alias}`);
        } else {
          aliases.add(ent.alias);
        }
        if (typeof ent.profile !== 'string' || !ent.profile) {
          issue(`${p}.profile`, 'required', 'entity.profile is required');
        }
        if (ent.pos != null) validateVec(ent.pos, `${p}.pos`, issue);
        if (ent.vel != null) validateVec(ent.vel, `${p}.vel`, issue);
        if (ent.heading != null && typeof ent.heading !== 'number') {
          issue(`${p}.heading`, 'type', 'heading must be a number');
        }
        if (ent.angularVelocity != null && typeof ent.angularVelocity !== 'number') {
          issue(`${p}.angularVelocity`, 'type', 'angularVelocity must be a number');
        }
        if (ent.overrides != null && (typeof ent.overrides !== 'object' || Array.isArray(ent.overrides))) {
          issue(`${p}.overrides`, 'type', 'overrides must be an object');
        }
        if (ent.loadout != null && !Array.isArray(ent.loadout) && typeof ent.loadout !== 'object') {
          issue(`${p}.loadout`, 'type', 'loadout must be an array or object');
        }
      });
    }
  }

  if (doc.attachments != null) {
    if (!Array.isArray(doc.attachments)) {
      issue('$.attachments', 'type', 'attachments must be an array');
    } else {
      doc.attachments.forEach((att, i) => {
        const p = `$.attachments[${i}]`;
        if (!att || typeof att !== 'object') {
          issue(p, 'type', 'attachment must be an object');
          return;
        }
        rejectUnknownKeys(att, ATTACHMENT_KEYS, p, issue);
        if (!att.defId || !att.ownerAlias || !att.targetAlias) {
          issue(p, 'required', 'attachment requires defId, ownerAlias, targetAlias');
        }
      });
      if (doc.attachments.length > 0) {
        const cls = doc.evidenceClass;
        if (cls === 'kernel' || cls === 'public-route' || cls === 'presentation') {
          issue('$.attachments', 'evidence', `pre-existing attachments not permitted for evidenceClass=${cls}`);
        }
      }
    }
  }

  if (doc.inputEvents != null) {
    if (!Array.isArray(doc.inputEvents)) {
      issue('$.inputEvents', 'type', 'inputEvents must be an array');
    } else {
      doc.inputEvents.forEach((ev, i) => {
        const p = `$.inputEvents[${i}]`;
        if (!ev || typeof ev !== 'object') {
          issue(p, 'type', 'input event must be an object');
          return;
        }
        rejectUnknownKeys(ev, INPUT_EVENT_KEYS, p, issue);
        if (!Number.isInteger(ev.tick) || ev.tick < 0) {
          issue(`${p}.tick`, 'type', 'tick must be a non-negative integer');
        }
        if (ev.device != null && typeof ev.device !== 'string') {
          issue(`${p}.device`, 'type', 'device must be a string');
        }
        // H14: only keyboard is driven today — reject ignored device classes.
        if (ev.device != null && ev.device !== 'keyboard') {
          issue(`${p}.device`, 'unsupported-field',
            `input device "${ev.device}" is not implemented (keyboard only in V1)`);
        }
        if (ev.pointer != null) {
          issue(`${p}.pointer`, 'unsupported-field', 'pointer input events are not implemented in V1');
        }
        if (ev.gamepad != null) {
          issue(`${p}.gamepad`, 'unsupported-field', 'gamepad input events are not implemented in V1');
        }
        if (ev.touch != null) {
          issue(`${p}.touch`, 'unsupported-field', 'touch input events are not implemented in V1');
        }
        if (ev.code != null && typeof ev.code !== 'string') {
          issue(`${p}.code`, 'type', 'code must be a string');
        }
        if (ev.pressed != null && typeof ev.pressed !== 'boolean') {
          issue(`${p}.pressed`, 'type', 'pressed must be boolean');
        }
      });
    }
  }

  // H14: relations compile but are never applied — reject if present and non-empty.
  if (doc.relations != null) {
    if (!Array.isArray(doc.relations)) {
      issue('$.relations', 'type', 'relations must be an array');
    } else if (doc.relations.length > 0) {
      issue('$.relations', 'unsupported-field',
        'relations are not applied by the lab runner in V1 — omit or leave empty');
    }
  }

  // H14: trace.signals must name known sample fields (runner always records the full sample
  // surface which is a superset; unknown names would be silently ignored — reject those).
  if (doc.trace && Array.isArray(doc.trace.signals)) {
    const KNOWN_SAMPLE_SIGNALS = new Set([
      'default', 'tick', 'playerX', 'playerZ', 'playerVelX', 'playerVelZ', 'playerRot',
      'playerAlive', 'hull', 'cap', 'credits', 'tetherActive', 'distance', 'restLength',
      'radiusError', 'radialSpeed', 'tangentialSpeed', 'tangentFraction', 'tension',
      'angularSpeed', 'attachmentActive', 'loadBand', 'mtActive', 'mtPhase', 'mtStrain',
      'orbitAssistActive', 'orbitAssistReason',
    ]);
    doc.trace.signals.forEach((sig, i) => {
      if (typeof sig !== 'string' || !KNOWN_SAMPLE_SIGNALS.has(sig)) {
        issue(`$.trace.signals[${i}]`, 'unsupported-field',
          `trace signal "${sig}" is not a known lab sample field`);
      }
    });
  }

  if (doc.frames != null) {
    if (!Array.isArray(doc.frames)) {
      issue('$.frames', 'type', 'frames must be an array');
    } else {
      doc.frames.forEach((frame, i) => {
        const p = `$.frames[${i}]`;
        if (!frame || typeof frame !== 'object') {
          issue(p, 'type', 'frame must be an object');
          return;
        }
        rejectUnknownKeys(frame, FRAME_KEYS, p, issue);
        if (!Number.isInteger(frame.tick) || frame.tick < 0) {
          issue(`${p}.tick`, 'type', 'tick must be a non-negative integer');
        }
        if (frame.input != null) {
          if (typeof frame.input !== 'object' || Array.isArray(frame.input)) {
            issue(`${p}.input`, 'type', 'input must be an object');
          } else {
            // H14: closed schema — silent ignore of nested unknown keys is forbidden.
            rejectUnknownKeys(frame.input, FRAME_INPUT_KEYS, `${p}.input`, issue);
          }
        }
      });
    }
  }

  if (doc.saveLoadEquivalence != null) {
    const allowed = new Set(['deterministic-covered', 'trace-hash', 'semantic', 'any-weaker']);
    if (typeof doc.saveLoadEquivalence !== 'string' || !allowed.has(doc.saveLoadEquivalence)) {
      issue('$.saveLoadEquivalence', 'enum',
        'saveLoadEquivalence must be deterministic-covered|trace-hash|semantic|any-weaker');
    }
  }

  if (doc.policies != null) {
    if (!Array.isArray(doc.policies)) {
      issue('$.policies', 'type', 'policies must be an array');
    } else {
      doc.policies.forEach((pol, i) => {
        const p = `$.policies[${i}]`;
        if (!pol || typeof pol !== 'object') {
          issue(p, 'type', 'policy ref must be an object');
          return;
        }
        rejectUnknownKeys(pol, POLICY_KEYS, p, issue);
        if (typeof pol.id !== 'string' || !pol.id) {
          issue(`${p}.id`, 'required', 'policy id is required (registered ID, not executable code)');
        }
        if (pol.version != null && typeof pol.version !== 'string' && typeof pol.version !== 'number') {
          issue(`${p}.version`, 'type', 'policy version must be string or number');
        }
        if (typeof pol.id === 'string' && (pol.id.includes('(') || JS_EXPRESSION_RE.test(pol.id))) {
          issue(`${p}.id`, 'no-js', 'policy id must not contain executable expressions');
        }
      });
    }
  }

  if (doc.metrics != null) {
    if (!Array.isArray(doc.metrics)) {
      issue('$.metrics', 'type', 'metrics must be an array');
    } else {
      doc.metrics.forEach((m, i) => {
        const p = `$.metrics[${i}]`;
        if (!m || typeof m !== 'object') {
          issue(p, 'type', 'metric must be an object');
          return;
        }
        rejectUnknownKeys(m, METRIC_KEYS, p, issue);
        if (typeof m.name !== 'string' || !METRIC_NAME_PATTERN.test(m.name)) {
          issue(`${p}.name`, 'id', 'metric name must be a stable registered name');
        }
      });
    }
  }

  if (doc.assertions != null) {
    if (!Array.isArray(doc.assertions)) {
      issue('$.assertions', 'type', 'assertions must be an array');
    } else {
      // Implemented assertion kinds only. Unimplemented temporal kinds are rejected
      // so scenarios cannot certify untested behavior via silent pass (FIX 6).
      const SUPPORTED_ASSERTION_KINDS = new Set([
        'metric',
        'quantitative',
        'equivalence',
        'settles',
        'never',
        'holds',
        'eventByTick',
        'temporal',
      ]);
      const UNIMPLEMENTED_ASSERTION_KINDS = new Set([
        'precedes',
        'eventInInterval',
        'inputReleaseNextTick',
      ]);
      doc.assertions.forEach((a, i) => {
        const p = `$.assertions[${i}]`;
        if (!a || typeof a !== 'object') {
          issue(p, 'type', 'assertion must be an object');
          return;
        }
        rejectUnknownKeys(a, ASSERTION_KEYS, p, issue);
        if (typeof a.kind !== 'string' || !a.kind) {
          issue(`${p}.kind`, 'required', 'assertion.kind is required');
        } else if (UNIMPLEMENTED_ASSERTION_KINDS.has(a.kind)) {
          issue(`${p}.kind`, 'unsupported-assertion',
            `assertion kind "${a.kind}" is declared but not implemented — refuse silent pass`);
        } else if (!SUPPORTED_ASSERTION_KINDS.has(a.kind)) {
          issue(`${p}.kind`, 'unsupported-assertion',
            `unknown assertion kind "${a.kind}"`);
        } else {
          // H11: closed per-kind required fields — refuse schema-valid vacuous assertions.
          validateAssertionFields(a, p, issue);
        }
      });
    }
  }

  if (doc.parameterOverlay != null) {
    if (typeof doc.parameterOverlay !== 'object' || Array.isArray(doc.parameterOverlay)) {
      issue('$.parameterOverlay', 'type', 'parameterOverlay must be an object');
    } else {
      rejectUnknownKeys(doc.parameterOverlay, OVERLAY_KEYS, '$.parameterOverlay', issue);
      // FIX 16 / FIX 17: anchorMass resolution is shared with validateCanonicalScenario
      // so raw docs, compile, and precompiled-canonical run all reject orphans.
      for (const extra of collectAnchorMassResolutionIssues(doc, options)) {
        issues.push(extra);
      }
    }
  }

  if (doc.checkpoints != null && !Array.isArray(doc.checkpoints)) {
    issue('$.checkpoints', 'type', 'checkpoints must be an array');
  } else if (Array.isArray(doc.checkpoints)) {
    doc.checkpoints.forEach((c, i) => {
      const p = `$.checkpoints[${i}]`;
      if (!c || typeof c !== 'object') {
        issue(p, 'type', 'checkpoint must be an object');
        return;
      }
      rejectUnknownKeys(c, CHECKPOINT_KEYS, p, issue);
    });
  }

  if (doc.trace != null) {
    if (typeof doc.trace !== 'object' || Array.isArray(doc.trace)) {
      issue('$.trace', 'type', 'trace must be an object');
    } else {
      rejectUnknownKeys(doc.trace, TRACE_KEYS, '$.trace', issue);
    }
  }

  if (doc.systems != null && !Array.isArray(doc.systems)) {
    issue('$.systems', 'type', 'systems must be an array of system ids when present');
  }

  if (doc.observer != null && typeof doc.observer !== 'object') {
    issue('$.observer', 'type', 'observer must be an object when present');
  }

  if (doc.fixtureExceptions != null && !Array.isArray(doc.fixtureExceptions)) {
    issue('$.fixtureExceptions', 'type', 'fixtureExceptions must be an array of strings');
  }

  return result(issues.length === 0, issues);
}

/**
 * Validate then compile to a canonical initial-setup + input tape artifact.
 * @param {object} doc
 * @param {{ file?: string }} [options]
 */
export function compileSimScenario(doc, options = {}) {
  const validation = validateSimScenario(doc, options);
  if (!validation.ok) {
    return {
      ok: false,
      validation,
      canonical: null,
    };
  }

  const inputEvents = Array.isArray(doc.inputEvents)
    ? doc.inputEvents
      .map((ev, i) => ({
        tick: ev.tick | 0,
        device: ev.device || 'keyboard',
        code: ev.code || '',
        pressed: !!ev.pressed,
        sequence: Number.isInteger(ev.sequence) ? ev.sequence : i,
        keys: ev.keys || null,
        pointer: ev.pointer || null,
        buttons: ev.buttons || null,
        gamepad: ev.gamepad || null,
        touch: ev.touch || null,
      }))
      .sort((a, b) => (a.tick - b.tick) || (a.sequence - b.sequence))
    : [];

  const frames = Array.isArray(doc.frames)
    ? doc.frames
      .map((f) => ({
        tick: f.tick | 0,
        input: f.input ? { ...f.input } : {},
        commands: Array.isArray(f.commands) ? f.commands.map((c) => ({ ...c })) : [],
      }))
      .sort((a, b) => a.tick - b.tick)
    : [];

  const canonical = {
    schema: SIM_SCENARIO_CANONICAL_SCHEMA,
    id: doc.id,
    version: doc.version ?? 1,
    evidenceClass: doc.evidenceClass,
    runtimeProfile: doc.runtimeProfile || 'focused-lab',
    seed: doc.seed >>> 0 || doc.seed,
    ticks: doc.ticks | 0,
    dt: typeof doc.dt === 'number' && doc.dt > 0 ? doc.dt : 1 / 60,
    world: {
      fixtureProfile: (doc.world && doc.world.fixtureProfile) || 'empty-flight',
      sectorId: (doc.world && doc.world.sectorId) || 'sector_helios_prime',
      mode: (doc.world && doc.world.mode) || 'flight',
      physicsBackend: (doc.world && doc.world.physicsBackend) || 'rapier-dynamic',
      flightBackend: (doc.world && doc.world.flightBackend) || 'v3',
      aiBackend: (doc.world && doc.world.aiBackend) || 'legacy',
      credits: (doc.world && Number.isFinite(doc.world.credits)) ? doc.world.credits : 5000,
    },
    entities: Array.isArray(doc.entities)
      ? doc.entities.map((e) => ({
        alias: e.alias,
        profile: e.profile,
        role: e.role || null,
        team: e.team ?? 0,
        factionId: e.factionId || null,
        isPlayer: !!e.isPlayer,
        pos: e.pos ? { x: e.pos.x || 0, y: e.pos.y || 0, z: e.pos.z || 0 } : { x: 0, y: 0, z: 0 },
        vel: e.vel ? { x: e.vel.x || 0, y: e.vel.y || 0, z: e.vel.z || 0 } : { x: 0, y: 0, z: 0 },
        heading: Number.isFinite(e.heading) ? e.heading : 0,
        angularVelocity: Number.isFinite(e.angularVelocity) ? e.angularVelocity : 0,
        overrides: e.overrides ? { ...e.overrides } : {},
        loadout: e.loadout ? (Array.isArray(e.loadout) ? e.loadout.slice() : { ...e.loadout }) : null,
        persistent: e.persistent !== false,
      }))
      : [],
    relations: Array.isArray(doc.relations) ? doc.relations.map((r) => ({ ...r })) : [],
    attachments: Array.isArray(doc.attachments)
      ? doc.attachments.map((a) => ({
        defId: a.defId,
        ownerAlias: a.ownerAlias,
        targetAlias: a.targetAlias,
        restLength: a.restLength ?? null,
      }))
      : [],
    inputTape: { events: inputEvents, frames },
    policies: Array.isArray(doc.policies)
      ? doc.policies.map((p) => ({
        id: p.id,
        version: p.version ?? 1,
        params: p.params ? { ...p.params } : {},
      }))
      : [],
    checkpoints: Array.isArray(doc.checkpoints)
      ? doc.checkpoints.map((c) => ({
        tick: c.tick | 0,
        kind: c.kind || 'deterministic-covered',
        label: c.label || null,
      }))
      : [],
    trace: {
      signals: (doc.trace && Array.isArray(doc.trace.signals)) ? doc.trace.signals.slice() : ['default'],
      sampleEvery: (doc.trace && Number.isInteger(doc.trace.sampleEvery) && doc.trace.sampleEvery > 0)
        ? doc.trace.sampleEvery
        : 1,
    },
    metrics: Array.isArray(doc.metrics)
      ? doc.metrics.map((m) => ({
        name: m.name,
        version: m.version ?? 1,
        params: m.params ? { ...m.params } : {},
        threshold: m.threshold != null ? cloneJson(m.threshold) : null,
      }))
      : [],
    assertions: Array.isArray(doc.assertions)
      ? doc.assertions.map((a) => ({ ...a }))
      : [],
    parameterOverlay: doc.parameterOverlay
      ? {
        schema: doc.parameterOverlay.schema || null,
        version: doc.parameterOverlay.version ?? 1,
        values: doc.parameterOverlay.values ? { ...doc.parameterOverlay.values } : {},
      }
      : null,
    systems: Array.isArray(doc.systems) ? doc.systems.slice() : null,
    observer: doc.observer ? { ...doc.observer } : { enabled: false },
    fixtureExceptions: Array.isArray(doc.fixtureExceptions) ? doc.fixtureExceptions.slice() : [],
    rendering: { detached: true },
    // H12/H13: comparison-affecting policy is part of the hashed canonical artifact.
    // Prefer top-level; lift from notes when only notes carries it (legacy authoring).
    saveLoadEquivalence: resolveSaveLoadEquivalenceForCanonical(doc),
  };

  return { ok: true, validation, canonical };
}

function resolveSaveLoadEquivalenceForCanonical(doc) {
  if (doc && typeof doc.saveLoadEquivalence === 'string' && doc.saveLoadEquivalence) {
    return doc.saveLoadEquivalence;
  }
  if (doc && doc.notes && typeof doc.notes === 'object' && !Array.isArray(doc.notes)
    && typeof doc.notes.saveLoadEquivalence === 'string' && doc.notes.saveLoadEquivalence) {
    return doc.notes.saveLoadEquivalence;
  }
  return 'deterministic-covered';
}

export function formatSimScenarioIssue(issue) {
  const loc = issue.file ? `${issue.file} ` : '';
  return `${loc}${issue.path}: [${issue.rule}] ${issue.message}`;
}

/**
 * Semantic checks that apply to both raw documents and precompiled canonicals.
 * FIX 17: runLabScenario's options.canonical path skips compileSimScenario (and thus
 * validateSimScenario). Call this after canonical selection so orphan lab.anchorMass
 * is rejected on both the raw-document and precompiled-canonical paths.
 *
 * @param {object} doc raw scenario or precompiled canonical
 * @param {{ file?: string }} [options]
 */
export function validateCanonicalScenario(doc, options = {}) {
  const issues = collectAnchorMassResolutionIssues(doc, options);
  return result(issues.length === 0, issues);
}

// ── helpers ──────────────────────────────────────────────────────────────────

function result(ok, issues) {
  return {
    schema: SIM_SCENARIO_VALIDATION_RESULT_SCHEMA,
    ok,
    documentSchema: SIM_SCENARIO_SCHEMA,
    issueCount: issues.length,
    issues,
  };
}

/** H11: per-kind required fields so assertions cannot pass vacuously. */
function validateAssertionFields(a, p, issue) {
  const kind = a.kind;
  if (kind === 'metric' || kind === 'quantitative') {
    if (typeof a.metric !== 'string' || !a.metric) {
      issue(`${p}.metric`, 'required', `${kind} assertion requires metric`);
    }
    const hasThreshold = a.threshold != null
      || a.op != null
      || a.value != null
      || a.expected != null;
    if (!hasThreshold) {
      issue(`${p}`, 'required', `${kind} assertion requires threshold/op/value/expected`);
    }
  } else if (kind === 'never') {
    if (!a.signal && !a.never && !a.event) {
      issue(`${p}.signal`, 'required', 'never assertion requires signal (or never/event)');
    }
  } else if (kind === 'holds' || kind === 'eventByTick' || kind === 'settles') {
    if (kind !== 'settles' && !a.signal) {
      issue(`${p}.signal`, 'required', `${kind} assertion requires signal`);
    }
  } else if (kind === 'equivalence') {
    if (!a.equivalence && !a.expected && !a.signal) {
      issue(`${p}.equivalence`, 'required',
        'equivalence assertion requires equivalence/expected comparison target');
    }
  }
}

/**
 * Collect orphan lab.anchorMass issues (empty when resolvable or not set).
 * Shared by validateSimScenario and validateCanonicalScenario.
 */
function collectAnchorMassResolutionIssues(doc, options = {}) {
  const issues = [];
  if (!doc || typeof doc !== 'object') return issues;
  const overlay = doc.parameterOverlay;
  if (!overlay || typeof overlay !== 'object' || Array.isArray(overlay)) return issues;
  const values = overlay.values;
  if (!values || typeof values !== 'object' || Array.isArray(values)) return issues;
  if (values['lab.anchorMass'] == null) return issues;
  if (docHasResolvableAnchorMassTarget(doc)) return issues;
  issues.push({
    path: '$.parameterOverlay.values["lab.anchorMass"]',
    rule: 'anchor-mass-target',
    message: 'lab.anchorMass requires a resolvable target (attachment targetAlias or entity alias "anchor")',
    file: options.file || null,
  });
  return issues;
}

/**
 * Structural check: can lab.anchorMass resolve a target from the scenario document?
 * Requires attachment.targetAlias present among entities, or an entity alias "anchor".
 * Shared by validate + run (via compileSimScenario → validateSimScenario / validateCanonicalScenario).
 */
function docHasResolvableAnchorMassTarget(doc) {
  if (!doc || !Array.isArray(doc.entities)) return false;
  const aliases = new Set(doc.entities.map((e) => e && e.alias).filter(Boolean));
  const atts = Array.isArray(doc.attachments) ? doc.attachments : [];
  for (const att of atts) {
    if (att && typeof att.targetAlias === 'string' && att.targetAlias && aliases.has(att.targetAlias)) {
      return true;
    }
  }
  return aliases.has('anchor');
}

function rejectUnknownKeys(obj, allowed, path, issue) {
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) {
      issue(`${path}.${key}`, 'unknown-field', `unknown field "${key}"`);
    }
  }
}

function rejectJsExpressions(value, path, issue, depth = 0) {
  if (depth > 24 || value == null) return;
  if (typeof value === 'function') {
    issue(path, 'no-js', 'functions are not allowed in scenario JSON');
    return;
  }
  if (typeof value === 'string') {
    if (JS_EXPRESSION_RE.test(value)) {
      issue(path, 'no-js', 'arbitrary JavaScript expressions are not allowed in scenario documents');
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => rejectJsExpressions(v, `${path}[${i}]`, issue, depth + 1));
    return;
  }
  if (typeof value === 'object') {
    // Explicit expression fields are always rejected.
    for (const banned of ['expr', 'expression', 'js', 'javascript', 'eval', 'fn', 'callback']) {
      if (Object.prototype.hasOwnProperty.call(value, banned)) {
        issue(`${path}.${banned}`, 'no-js', `field "${banned}" is not allowed (no executable expressions)`);
      }
    }
    for (const [k, v] of Object.entries(value)) {
      rejectJsExpressions(v, `${path}.${k}`, issue, depth + 1);
    }
  }
}

function validateVec(v, path, issue) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) {
    issue(path, 'type', 'vector must be an object');
    return;
  }
  rejectUnknownKeys(v, POS_KEYS, path, issue);
  for (const k of ['x', 'y', 'z']) {
    if (v[k] != null && typeof v[k] !== 'number') {
      issue(`${path}.${k}`, 'type', `${k} must be a number`);
    }
  }
}

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}
