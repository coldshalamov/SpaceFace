import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';

import {
  AUTHORITATIVE_SIMULATION_DOMAINS,
  AUTHORITATIVE_SIMULATION_RECORD_SCHEMA,
  PERFORMANCE_EQUIVALENCE_LIMITS,
  PERFORMANCE_VERDICT_SCHEMA,
  PRESENTATION_SEMANTIC_COMPARISON_SCHEMA,
  PRESENTATION_SEMANTIC_DOMAINS,
  PRESENTATION_SEMANTIC_PROJECTION_SCHEMA,
  PRESENTATION_SEMANTIC_RECORD_SCHEMA,
  SIMULATION_EQUIVALENCE_SCHEMA,
  compareAuthoritativeSimulationRecords,
  comparePresentationSemanticRecords,
  composePerformanceVerdict,
  projectRenderEntityFramePresentation,
} from '../scripts/lib/performanceEquivalence.mjs';

function authoritativeTick(tick, overrides = {}) {
  return {
    schema: AUTHORITATIVE_SIMULATION_RECORD_SCHEMA,
    tick,
    authoritative: {
      player: {
        id: 1,
        transform: { x: tick, z: tick * 2, rotation: 0.25 },
        velocity: { x: 1, z: 2 },
        hull: 100,
        shields: 50,
        energy: 25,
        heat: 2,
        ammo: 8,
        cooldowns: { primary: 0 },
        activeEffects: [],
      },
      npcs: [{
        id: 2,
        transform: { x: 5, z: 8, rotation: 0.5 },
        velocity: { x: 0, z: 1 },
        hull: 40,
        shields: 10,
        aiState: 'pursue',
        selectedTargetId: 1,
        jobState: 'active',
        intents: ['turn'],
      }],
      activeEntities: [
        { id: 1, archetype: 'ship_kestrel' },
        { id: 2, archetype: 'ship_wasp' },
      ],
      economy: {
        credits: 500,
        cargo: { ore_iron: 2 },
        reputation: { faction_scn: 4 },
      },
      missions: [{ id: 'mission:1', state: 'active' }],
      factions: { faction_scn: { state: 'hostile' } },
      sectorOwnership: { sector_ceres: 'faction_scn' },
      rng: {
        core: { state: 123, draws: tick + 10 },
        weapons: { state: 456, draws: tick },
      },
      ...overrides.authoritative,
    },
    events: overrides.events ?? [{
      sequence: 0,
      type: 'simulation:tick',
      payload: { tick },
    }],
    input: overrides.input ?? { moveZ: 1, fire: false },
    checkpoint: overrides.checkpoint ?? {
      hashKind: 'deterministic-covered',
      hash: 'same-coverage-bounded-hash',
      coverageVersion: 'lab-checkpoint-v1',
    },
  };
}

function presentationRecord(overrides = {}) {
  return {
    schema: PRESENTATION_SEMANTIC_RECORD_SCHEMA,
    stableObjectId: 'entity:ship:1',
    parentStableObjectId: 'scene:world',
    identity: {
      kind: 'entity',
      gameplayEntityId: 1,
      entityType: 'ship',
      definitionId: 'ship_kestrel',
      rootName: 'KestrelRoot',
      assetId: 'SF_K0_KESTREL_BORROWED_TIME',
      authoredCompositionId: 'SF_K0_KESTREL_BORROWED_TIME',
    },
    transform: {
      world: {
        position: [1, 2, 3],
        quaternion: [0, 0, 0, 1],
        scale: [1, 1, 1],
      },
      interpolation: {
        mode: 'fixed-tick-linear',
        alpha: 0.5,
        previous: { position: [0, 0, 1], rotation: 0 },
        current: { position: [1, 0, 3], rotation: 0.25 },
      },
      nodes: [],
    },
    visibility: {
      visible: true,
      viewCulled: false,
      lodLevel: 'lod0',
      nodes: [],
    },
    geometry: {
      nodes: [{
        nodeId: 'entity:ship:1/name:Hull',
        identity: 'geometry:kestrel:hull',
        type: 'BufferGeometry',
        indexCount: 36,
        vertexCount: 24,
        drawRange: { start: 0, count: 36 },
        bounds: {
          box: [-1, -1, -1, 1, 1, 1],
          sphere: [0, 0, 0, 1.75],
        },
      }],
    },
    material: {
      nodes: [{
        nodeId: 'entity:ship:1/name:Hull',
        identity: 'material:kestrel:hull',
        pipelineKey: 'MeshStandardMaterial:opaque',
        color: [0.1, 0.2, 0.3],
        textures: [{
          slot: 'map',
          identity: 'texture:kestrel:hull',
          colorSpace: 'srgb',
        }],
      }],
    },
    attachments: [{
      kind: 'socket',
      stableId: 'entity:ship:1/socket:SOCKET_MUZZLE',
      parentStableObjectId: 'entity:ship:1',
      role: 'weapon',
      transform: {
        position: [0, 0, 2],
        quaternion: [0, 0, 0, 1],
        scale: [1, 1, 1],
      },
      forward: [1, 0, 0],
    }],
    ordering: {
      nodes: [{
        nodeId: 'entity:ship:1/name:Hull',
        renderOrder: 2,
        blend: { mode: 1, premultipliedAlpha: false, transparent: false },
        depth: { test: true, write: true, function: 3 },
      }],
    },
    animation: {
      mode: 'state-driven-hooks',
      hooks: [],
    },
    hud: null,
    ...overrides,
  };
}

function clone(value) {
  return structuredClone(value);
}

function vector3(x, y, z) {
  return { x, y, z };
}

function quaternion(x = 0, y = 0, z = 0, w = 1) {
  return { _x: x, _y: y, _z: z, _w: w };
}

function geometry(uuid = 'geometry-uuid') {
  return {
    uuid,
    name: 'HullGeometry',
    type: 'BufferGeometry',
    userData: { spacefaceBatchKey: 'geometry:kestrel:hull' },
    index: { count: 36 },
    attributes: {
      position: { count: 24, itemSize: 3, normalized: false },
      normal: { count: 24, itemSize: 3, normalized: false },
    },
    drawRange: { start: 0, count: 36 },
    boundingBox: {
      min: vector3(-1, -1, -1),
      max: vector3(1, 1, 1),
    },
    boundingSphere: {
      center: vector3(0, 0, 0),
      radius: 1.75,
    },
  };
}

function texture(uuid = 'texture-uuid') {
  return {
    uuid,
    userData: { spacefaceSourceKey: 'texture:kestrel:hull' },
    colorSpace: 'srgb',
    mapping: 300,
    wrapS: 1000,
    wrapT: 1000,
    minFilter: 1008,
    magFilter: 1006,
    flipY: false,
    premultiplyAlpha: false,
  };
}

function material(uuid = 'material-uuid', textureUuid = 'texture-uuid') {
  return {
    uuid,
    name: 'HullMaterial',
    type: 'MeshStandardMaterial',
    userData: { spacefaceBatchKey: 'material:kestrel:hull' },
    transparent: false,
    blending: 1,
    premultipliedAlpha: false,
    side: 0,
    depthTest: true,
    depthWrite: true,
    depthFunc: 3,
    alphaTest: 0,
    vertexColors: false,
    wireframe: false,
    toneMapped: true,
    opacity: 1,
    color: { r: 0.1, g: 0.2, b: 0.3 },
    emissive: { r: 0, g: 0, b: 0 },
    emissiveIntensity: 0,
    map: texture(textureUuid),
  };
}

function renderNode({
  name,
  userData = {},
  childGeometry = null,
  childMaterial = null,
  position = vector3(0, 0, 0),
  children = [],
  calls,
} = {}) {
  return {
    name: name ?? '',
    visible: true,
    children,
    userData,
    position,
    quaternion: quaternion(),
    scale: vector3(1, 1, 1),
    matrixWorld: {
      elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, position.x, position.y, position.z, 1],
    },
    renderOrder: 0,
    geometry: childGeometry,
    material: childMaterial,
    morphTargetInfluences: null,
    traverse() {
      calls.traverse += 1;
      throw new Error('projection must not invoke Object3D.traverse');
    },
    updateWorldMatrix() {
      calls.updateWorldMatrix += 1;
      throw new Error('projection must not update world matrices');
    },
  };
}

function presentationSource({
  geometryUuid = 'geometry-uuid',
  materialUuid = 'material-uuid',
  textureUuid = 'texture-uuid',
} = {}) {
  const calls = { traverse: 0, updateWorldMatrix: 0 };
  const socket = renderNode({
    name: 'SOCKET_MUZZLE',
    userData: {
      spacefaceSocket: true,
      role: 'weapon',
      forward: [1, 0, 0],
    },
    position: vector3(0, 0, 2),
    calls,
  });
  const hull = renderNode({
    name: 'Hull',
    userData: {
      spacefacePartUrl: 'ships/kestrel/hull.glb',
      spacefaceTags: { damageRole: 'armor', lod: 'lod0' },
    },
    childGeometry: geometry(geometryUuid),
    childMaterial: material(materialUuid, textureUuid),
    children: [socket],
    calls,
  });
  const socketCache = new Map([['preexisting', socket]]);
  const root = renderNode({
    name: 'KestrelRoot',
    userData: {
      assetId: 'SF_K0_KESTREL_BORROWED_TIME',
      authoredCompositionId: 'SF_K0_KESTREL_BORROWED_TIME',
      __socketCache: socketCache,
    },
    children: [hull],
    calls,
  });
  const entity = {
    id: 1,
    type: 'ship',
    flags: { noInterp: false },
    prevPos: { x: 0, z: 1 },
    pos: { x: 1, z: 3 },
    prevRot: 0,
    rot: 0.25,
    data: { defId: 'ship_kestrel' },
  };
  const record = {
    id: 1,
    entity,
    mesh: root,
    seenFrame: 7,
    initialized: true,
    visible: true,
    viewCulled: false,
    transformDirty: false,
    visibilityDirty: false,
    detailDirty: false,
    renderDirty: false,
    lodLevel: 'lod0',
    contactShadow: true,
    shipAuxiliary: true,
    authored: true,
    asteroidInstance: false,
    x: 1,
    y: 0,
    z: 2,
    rx: 0,
    ry: -0.125,
    rz: 0,
    sx: 1,
    sy: 1,
    sz: 1,
  };
  return {
    source: {
      entityFrame: {
        frameId: 7,
        traversals: 1,
        entitiesVisited: 1,
        records: [record],
      },
      interpolationAlpha: 0.5,
      hud: {
        semanticTree: {
          role: 'group',
          name: 'Flight HUD',
          children: [{ role: 'status', name: 'Hull 100 percent' }],
        },
        accessibility: {
          hidden: false,
          motionPreference: 'system',
          motionReduced: false,
          flashReduced: false,
          forcedColorsActive: false,
          colorblindMode: 'none',
          highContrast: false,
          captions: true,
          captionSize: 'medium',
          captionBackground: true,
          dyslexiaFont: false,
          uiScale: 1,
        },
      },
    },
    calls,
    socketCache,
    root,
    hull,
    socket,
    record,
  };
}

test('exact authoritative comparison reports the first raw divergence with bounded ordered context', () => {
  const baseline = [authoritativeTick(3), authoritativeTick(4), authoritativeTick(5)];
  const candidate = clone(baseline);
  candidate[2].authoritative.player.hull = 99.999999999;
  candidate[2].events.push({
    sequence: 2,
    type: 'combat:damage',
    payload: { targetId: 1 },
  });

  const result = compareAuthoritativeSimulationRecords(baseline, candidate, {
    contextTicks: 1,
    inputTape: {
      events: [
        { tick: 5, sequence: 2, code: 'KeyJ', pressed: true },
        { tick: 4, sequence: 1, code: 'KeyW', pressed: true },
        { tick: 5, sequence: 1, code: 'KeyF', pressed: true },
      ],
      frames: [
        { tick: 5, sequence: 2, input: { moveZ: 1, fire: true } },
        { tick: 4, sequence: 1, input: { moveZ: 1, fire: false } },
      ],
    },
  });

  assert.equal(result.schema, SIMULATION_EQUIVALENCE_SCHEMA);
  assert.equal(result.valid, true, result.failures.join('\n'));
  assert.equal(result.equivalent, false);
  assert.equal(result.authority, 'exact-authoritative-records');
  assert.deepEqual(result.authoritativeDomains, AUTHORITATIVE_SIMULATION_DOMAINS);
  assert.equal(result.checkpointEvidence.promotedToExact, false);
  assert.equal(result.firstDivergence.tick, 5);
  assert.equal(result.firstDivergence.lastMatchingTick, 4);
  assert.equal(result.firstDivergence.field, 'authoritative.player.hull');
  assert.equal(result.firstDivergence.baselineValue, 100);
  assert.equal(result.firstDivergence.candidateValue, 99.999999999);
  assert.deepEqual(
    result.firstDivergence.context.input.events.map((entry) => [entry.tick, entry.sequence, entry.code]),
    [[4, 1, 'KeyW'], [5, 1, 'KeyF'], [5, 2, 'KeyJ']],
  );
  assert.deepEqual(
    result.firstDivergence.context.events.candidate.atTick.map((entry) => entry.type),
    ['simulation:tick', 'combat:damage'],
  );
  assert.equal(result.firstDivergence.context.truncated, false);
});

test('exact comparison never promotes coverage hashes and preserves ordered events and IEEE-754 identity', () => {
  const baseline = [authoritativeTick(9, {
    events: [
      { sequence: 1, type: 'combat:fire' },
      { sequence: 2, type: 'projectile:hit' },
    ],
  })];
  const reordered = clone(baseline);
  reordered[0].events.reverse();
  const eventResult = compareAuthoritativeSimulationRecords(baseline, reordered);
  assert.equal(eventResult.equivalent, false);
  assert.equal(eventResult.firstDivergence.field, 'events[0].sequence');

  const hashOnly = compareAuthoritativeSimulationRecords(
    [{ tick: 0, hash: 'same' }],
    [{ tick: 0, hash: 'same' }],
  );
  assert.equal(hashOnly.valid, false);
  assert.equal(hashOnly.equivalent, false);
  assert.match(hashOnly.failures.join(' | '), /exact authoritative|record schema/i);

  const signedZeroBaseline = [authoritativeTick(10)];
  const signedZeroCandidate = clone(signedZeroBaseline);
  signedZeroBaseline[0].authoritative.player.velocity.x = -0;
  signedZeroCandidate[0].authoritative.player.velocity.x = 0;
  const signedZero = compareAuthoritativeSimulationRecords(
    signedZeroBaseline,
    signedZeroCandidate,
  );
  assert.equal(signedZero.valid, true, signedZero.failures.join('\n'));
  assert.equal(signedZero.equivalent, false);
  assert.equal(signedZero.firstDivergence.field, 'authoritative.player.velocity.x');
  assert.equal(Object.is(signedZero.firstDivergence.baselineValue, -0), true);
  assert.equal(Object.is(signedZero.firstDivergence.candidateValue, 0), true);
});

test('authoritative evidence rejects proxies, accessors, cycles, aliases, and bounded-resource overflow', () => {
  let trapCalls = 0;
  const proxy = new Proxy(authoritativeTick(0), {
    ownKeys() {
      trapCalls += 1;
      return [];
    },
    get() {
      trapCalls += 1;
      return undefined;
    },
  });
  const proxyResult = compareAuthoritativeSimulationRecords([proxy], [authoritativeTick(0)]);
  assert.equal(proxyResult.valid, false);
  assert.match(proxyResult.failures.join(' | '), /Proxy/);
  assert.equal(trapCalls, 0);

  let getterCalls = 0;
  const accessor = authoritativeTick(0);
  Object.defineProperty(accessor, 'authoritative', {
    configurable: true,
    enumerable: true,
    get() {
      getterCalls += 1;
      return {};
    },
  });
  const accessorResult = compareAuthoritativeSimulationRecords([accessor], [authoritativeTick(0)]);
  assert.equal(accessorResult.valid, false);
  assert.match(accessorResult.failures.join(' | '), /accessor|data propert/i);
  assert.equal(getterCalls, 0);

  const cyclic = authoritativeTick(0);
  cyclic.authoritative.self = cyclic.authoritative;
  const cycleResult = compareAuthoritativeSimulationRecords([cyclic], [authoritativeTick(0)]);
  assert.equal(cycleResult.valid, false);
  assert.match(cycleResult.failures.join(' | '), /acyclic|cycle/i);

  const aliased = authoritativeTick(0);
  const shared = { state: 7 };
  aliased.authoritative.player.shared = shared;
  aliased.authoritative.rng.shared = shared;
  const aliasResult = compareAuthoritativeSimulationRecords([aliased], [authoritativeTick(0)]);
  assert.equal(aliasResult.valid, false);
  assert.match(aliasResult.failures.join(' | '), /alias|tree/i);

  const tooDeep = authoritativeTick(0);
  tooDeep.authoritative.player.nested = { a: { b: { c: 1 } } };
  const bounded = compareAuthoritativeSimulationRecords([tooDeep], [authoritativeTick(0)], {
    limits: {
      maxTreeDepth: 3,
      maxDiagnosticBytes: 256,
      maxDiagnosticMessageBytes: 96,
    },
  });
  assert.equal(bounded.valid, false);
  assert.match(bounded.failures.join(' | '), /depth limit/);
  assert.ok(bounded.diagnostics.utf8Bytes <= 256);
  assert.equal(bounded.diagnostics.limits.maxTreeDepth, 3);
});

test('presentation semantic comparison is identity-keyed and detects every required domain', async (t) => {
  const hud = presentationRecord({
    stableObjectId: 'hud:root',
    parentStableObjectId: null,
    identity: { kind: 'hud', rootId: 'hud' },
    transform: null,
    visibility: null,
    geometry: null,
    material: null,
    attachments: [],
    ordering: null,
    animation: null,
    hud: {
      semanticTree: {
        role: 'group',
        name: 'Flight HUD',
        children: [{ role: 'status', name: 'Hull 100 percent' }],
      },
      accessibility: {
        hidden: false,
        motionReduced: false,
        flashReduced: false,
        contrastMode: 'default',
      },
    },
  });
  const baseline = [presentationRecord(), hud];
  const reordered = [clone(hud), clone(baseline[0])];
  const same = comparePresentationSemanticRecords(baseline, reordered);

  assert.equal(same.schema, PRESENTATION_SEMANTIC_COMPARISON_SCHEMA);
  assert.equal(same.valid, true, same.failures.join('\n'));
  assert.equal(same.equivalent, true);
  assert.deepEqual(Object.keys(same.coverage), PRESENTATION_SEMANTIC_DOMAINS);
  assert.equal(Object.values(same.coverage).every(Boolean), true);

  const mutations = [
    ['identity', (record) => { record.identity.assetId = 'SF_K0_DIFFERENT_SHIP'; }],
    ['transform', (record) => { record.transform.world.position[0] = 7; }],
    ['visibilityCullLod', (record) => { record.visibility.lodLevel = 'lod1'; }],
    ['geometryDrawBounds', (record) => { record.geometry.nodes[0].drawRange.count = 30; }],
    ['materialTextureColorSpace', (record) => { record.material.nodes[0].textures[0].colorSpace = 'linear-srgb'; }],
    ['attachmentSocket', (record) => { record.attachments[0].transform.position[2] = 3; }],
    ['orderingBlendDepth', (record) => { record.ordering.nodes[0].depth.write = false; }],
    ['animation', (record) => { record.animation.mode = 'paused'; }],
    ['hudAccessibility', (record) => {
      record.hud = {
        semanticTree: { role: 'status', name: 'Player ship' },
        accessibility: { hidden: false, motionReduced: true },
      };
    }],
  ];

  for (const [domain, mutate] of mutations) {
    await t.test(domain, () => {
      const candidate = clone(baseline);
      mutate(candidate[0]);
      const comparison = comparePresentationSemanticRecords(baseline, candidate);
      assert.equal(comparison.valid, true, comparison.failures.join('\n'));
      assert.equal(comparison.equivalent, false);
      assert.equal(comparison.firstDivergence.objectId, 'entity:ship:1');
      assert.equal(comparison.firstDivergence.domain, domain);
    });
  }
});

test('presentation inputs fail closed on omitted domains and bounded structural hazards', () => {
  const incomplete = presentationRecord();
  delete incomplete.ordering;
  const missing = comparePresentationSemanticRecords([incomplete], [clone(incomplete)]);
  assert.equal(missing.valid, false);
  assert.equal(missing.equivalent, false);
  assert.equal(missing.coverage.orderingBlendDepth, false);
  assert.match(missing.failures.join(' | '), /ordering/i);

  const cyclic = presentationRecord();
  cyclic.transform.self = cyclic.transform;
  const cycle = comparePresentationSemanticRecords([cyclic], [presentationRecord()]);
  assert.equal(cycle.valid, false);
  assert.match(cycle.failures.join(' | '), /acyclic|cycle/i);

  const huge = presentationRecord({
    stableObjectId: `ship:${'x'.repeat(PERFORMANCE_EQUIVALENCE_LIMITS.maxStringLength + 1)}`,
  });
  const bounded = comparePresentationSemanticRecords([huge], [presentationRecord()], {
    limits: {
      maxDiagnosticBytes: 128,
      maxDiagnosticMessageBytes: 64,
    },
  });
  assert.equal(bounded.valid, false);
  assert.ok(bounded.diagnostics.utf8Bytes <= 128);
  assert.equal(bounded.diagnostics.truncated, true);
});

test('production projection reads the renderEntityFrame seam without renderer mutation or UUID identity', () => {
  const baselineSource = presentationSource({
    geometryUuid: 'baseline-geometry-uuid',
    materialUuid: 'baseline-material-uuid',
    textureUuid: 'baseline-texture-uuid',
  });
  const candidateSource = presentationSource({
    geometryUuid: 'candidate-geometry-uuid',
    materialUuid: 'candidate-material-uuid',
    textureUuid: 'candidate-texture-uuid',
  });

  const baseline = projectRenderEntityFramePresentation(baselineSource.source);
  const candidate = projectRenderEntityFramePresentation(candidateSource.source);

  assert.equal(baseline.schema, PRESENTATION_SEMANTIC_PROJECTION_SCHEMA);
  assert.equal(baseline.valid, true, baseline.failures.join('\n'));
  assert.equal(candidate.valid, true, candidate.failures.join('\n'));
  assert.equal(Object.isFrozen(baseline), true);
  assert.equal(Object.isFrozen(baseline.records), true);
  assert.deepEqual(baselineSource.calls, { traverse: 0, updateWorldMatrix: 0 });
  assert.deepEqual(candidateSource.calls, { traverse: 0, updateWorldMatrix: 0 });
  assert.equal(baselineSource.root.userData.__socketCache, baselineSource.socketCache);
  assert.equal(baselineSource.socketCache.size, 1);

  const root = baseline.records.find((record) => record.stableObjectId === 'entity:ship:1');
  const hud = baseline.records.find((record) => record.stableObjectId === 'hud:root');
  assert.ok(root);
  assert.ok(hud);
  assert.equal(root.identity.assetId, 'SF_K0_KESTREL_BORROWED_TIME');
  assert.equal(root.identity.authoredCompositionId, 'SF_K0_KESTREL_BORROWED_TIME');
  assert.deepEqual(root.transform.world.position, [1, 0, 2]);
  assert.equal(root.visibility.lodLevel, 'lod0');
  assert.equal(root.geometry.nodes[0].identity, 'geometry:kestrel:hull');
  assert.equal(root.material.nodes[0].identity, 'material:kestrel:hull');
  assert.equal(root.material.nodes[0].textures[0].identity, 'texture:kestrel:hull');
  assert.equal(root.attachments[0].stableId, 'entity:ship:1/socket:SOCKET_MUZZLE');
  assert.equal(hud.hud.semanticTree.name, 'Flight HUD');
  assert.equal(hud.hud.accessibility.uiScale, 1);

  const comparison = comparePresentationSemanticRecords(
    baseline.records,
    candidate.records,
  );
  assert.equal(comparison.valid, true, comparison.failures.join('\n'));
  assert.equal(comparison.equivalent, true, comparison.failures.join('\n'));
});

test('production projection consumes actual Three.js objects without matrix mutation', () => {
  const fixture = presentationSource();
  const geometry = new THREE.BufferGeometry();
  geometry.name = 'HullGeometry';
  geometry.userData.spacefaceBatchKey = 'geometry:kestrel:hull';
  geometry.setIndex([0, 1, 2]);
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([
      -1, -1, 0,
      1, -1, 0,
      0, 1, 0,
    ], 3),
  );
  geometry.setDrawRange(0, 3);
  geometry.boundingBox = new THREE.Box3(
    new THREE.Vector3(-1, -1, 0),
    new THREE.Vector3(1, 1, 0),
  );
  geometry.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(0, 0, 0),
    Math.sqrt(2),
  );

  const texture = new THREE.Texture();
  texture.userData.spacefaceSourceKey = 'texture:kestrel:hull';
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0.1, 0.2, 0.3),
    map: texture,
  });
  material.name = 'HullMaterial';
  material.userData.spacefaceBatchKey = 'material:kestrel:hull';

  const hull = new THREE.Mesh(geometry, material);
  hull.name = 'Hull';
  hull.userData.spacefacePartUrl = 'ships/kestrel/hull.glb';
  hull.userData.spacefaceTags = { damageRole: 'armor', lod: 'lod0' };
  const socket = new THREE.Object3D();
  socket.name = 'SOCKET_MUZZLE';
  socket.position.set(0, 0, 2);
  socket.userData.spacefaceSocket = true;
  socket.userData.role = 'weapon';
  socket.userData.forward = [1, 0, 0];
  hull.add(socket);

  const root = new THREE.Group();
  root.name = 'KestrelRoot';
  root.userData.assetId = 'SF_K0_KESTREL_BORROWED_TIME';
  root.userData.authoredCompositionId = 'SF_K0_KESTREL_BORROWED_TIME';
  root.add(hull);
  fixture.record.mesh = root;
  const matrixBefore = Array.from(root.matrixWorld.elements);

  const projection = projectRenderEntityFramePresentation(fixture.source);

  assert.equal(projection.valid, true, projection.failures.join('\n'));
  assert.deepEqual(Array.from(root.matrixWorld.elements), matrixBefore);
  const entity = projection.records.find(
    (record) => record.stableObjectId === 'entity:ship:1',
  );
  assert.equal(entity.identity.assetId, 'SF_K0_KESTREL_BORROWED_TIME');
  assert.equal(entity.geometry.nodes[0].identity, 'geometry:kestrel:hull');
  assert.equal(entity.material.nodes[0].identity, 'material:kestrel:hull');
  assert.equal(
    entity.material.nodes[0].textures[0].identity,
    'texture:kestrel:hull',
  );
  assert.equal(
    entity.attachments[0].stableId,
    'entity:ship:1/socket:SOCKET_MUZZLE',
  );
});

test('production projection detects transform, material, socket, and HUD semantic changes', async (t) => {
  const baselineSource = presentationSource();
  const baseline = projectRenderEntityFramePresentation(baselineSource.source);
  assert.equal(baseline.valid, true, baseline.failures.join('\n'));

  const mutations = [
    ['identity', (fixture) => { fixture.root.userData.assetId = 'SF_K0_DIFFERENT_SHIP'; }],
    ['transform', (fixture) => { fixture.record.x = 4; }],
    ['visibilityCullLod', (fixture) => { fixture.record.lodLevel = 'lod1'; }],
    ['geometryDrawBounds', (fixture) => { fixture.hull.geometry.drawRange.count = 30; }],
    ['materialTextureColorSpace', (fixture) => { fixture.hull.material.color.r = 0.8; }],
    ['attachmentSocket', (fixture) => { fixture.socket.position.z = 5; }],
    ['orderingBlendDepth', (fixture) => { fixture.hull.renderOrder = 7; }],
    ['animation', (fixture) => { fixture.hull.userData.spacefaceTags.damageRole = 'engine'; }],
    ['hudAccessibility', (fixture) => { fixture.source.hud.accessibility.motionReduced = true; }],
  ];

  for (const [domain, mutate] of mutations) {
    await t.test(domain, () => {
      const fixture = presentationSource();
      mutate(fixture);
      const candidate = projectRenderEntityFramePresentation(fixture.source);
      assert.equal(candidate.valid, true, candidate.failures.join('\n'));
      const comparison = comparePresentationSemanticRecords(
        baseline.records,
        candidate.records,
      );
      assert.equal(comparison.valid, true, comparison.failures.join('\n'));
      assert.equal(comparison.equivalent, false);
      assert.equal(comparison.firstDivergence.domain, domain);
    });
  }
});

test('production projection fails closed on UUID-only textures, accessors, and hierarchy cycles', () => {
  const uuidOnly = presentationSource();
  uuidOnly.hull.material.map.userData = {};
  const noTextureIdentity = projectRenderEntityFramePresentation(uuidOnly.source);
  assert.equal(noTextureIdentity.valid, false);
  assert.match(noTextureIdentity.failures.join(' | '), /texture.*stable semantic identity|UUID/i);

  const uuidOnlyGeometry = presentationSource();
  uuidOnlyGeometry.hull.userData.spacefacePartUrl = null;
  uuidOnlyGeometry.hull.geometry.userData = {};
  uuidOnlyGeometry.hull.geometry.name = '';
  const noGeometryIdentity = projectRenderEntityFramePresentation(
    uuidOnlyGeometry.source,
  );
  assert.equal(noGeometryIdentity.valid, false);
  assert.match(
    noGeometryIdentity.failures.join(' | '),
    /geometry.*stable semantic identity|UUID/i,
  );

  const uuidOnlyMaterial = presentationSource();
  uuidOnlyMaterial.hull.userData.spacefacePartUrl = null;
  uuidOnlyMaterial.hull.material.userData = {};
  uuidOnlyMaterial.hull.material.name = '';
  const noMaterialIdentity = projectRenderEntityFramePresentation(
    uuidOnlyMaterial.source,
  );
  assert.equal(noMaterialIdentity.valid, false);
  assert.match(
    noMaterialIdentity.failures.join(' | '),
    /material.*stable semantic identity|UUID/i,
  );

  const identityAccessor = presentationSource();
  identityAccessor.hull.userData.spacefacePartUrl = null;
  identityAccessor.hull.geometry.name = '';
  let identityGetterCalls = 0;
  Object.defineProperty(
    identityAccessor.hull.geometry.userData,
    'spacefaceBatchKey',
    {
      configurable: true,
      enumerable: true,
      get() {
        identityGetterCalls += 1;
        return 'geometry:kestrel:hull';
      },
    },
  );
  const identityAccessorResult = projectRenderEntityFramePresentation(
    identityAccessor.source,
  );
  assert.equal(identityAccessorResult.valid, false);
  assert.match(
    identityAccessorResult.failures.join(' | '),
    /spacefaceBatchKey.*data property|accessor/i,
  );
  assert.equal(identityGetterCalls, 0);

  const socketAccessor = presentationSource();
  let socketGetterCalls = 0;
  Object.defineProperty(socketAccessor.socket.userData, 'spacefaceSocket', {
    configurable: true,
    enumerable: true,
    get() {
      socketGetterCalls += 1;
      return true;
    },
  });
  const socketAccessorResult = projectRenderEntityFramePresentation(
    socketAccessor.source,
  );
  assert.equal(socketAccessorResult.valid, false);
  assert.match(
    socketAccessorResult.failures.join(' | '),
    /spacefaceSocket.*data property|accessor/i,
  );
  assert.equal(socketGetterCalls, 0);

  const accessor = presentationSource();
  let getterCalls = 0;
  Object.defineProperty(accessor.hull, 'geometry', {
    configurable: true,
    enumerable: true,
    get() {
      getterCalls += 1;
      return geometry();
    },
  });
  const accessorResult = projectRenderEntityFramePresentation(accessor.source);
  assert.equal(accessorResult.valid, false);
  assert.match(accessorResult.failures.join(' | '), /geometry.*data property|accessor/i);
  assert.equal(getterCalls, 0);

  const cyclic = presentationSource();
  cyclic.socket.children.push(cyclic.root);
  const cycleResult = projectRenderEntityFramePresentation(cyclic.source);
  assert.equal(cycleResult.valid, false);
  assert.match(cycleResult.failures.join(' | '), /cycle|acyclic/i);
});

test('comparison and verdict logic ignore mutable inherited collection and string hooks', () => {
  const baselineSimulation = [authoritativeTick(0)];
  const candidateSimulation = clone(baselineSimulation);
  const baselinePresentation = [presentationRecord()];
  const candidatePresentation = clone(baselinePresentation);
  const sortDescriptor = Object.getOwnPropertyDescriptor(Array.prototype, 'sort');
  const trimDescriptor = Object.getOwnPropertyDescriptor(String.prototype, 'trim');
  const setHasDescriptor = Object.getOwnPropertyDescriptor(Set.prototype, 'has');
  let hookCalls = 0;

  try {
    Object.defineProperty(Array.prototype, 'sort', {
      configurable: true,
      writable: true,
      value() {
        hookCalls += 1;
        throw new Error('mutable Array.prototype.sort invoked');
      },
    });
    Object.defineProperty(String.prototype, 'trim', {
      configurable: true,
      writable: true,
      value() {
        hookCalls += 1;
        return '';
      },
    });
    Object.defineProperty(Set.prototype, 'has', {
      configurable: true,
      writable: true,
      value() {
        hookCalls += 1;
        return false;
      },
    });

    assert.equal(
      compareAuthoritativeSimulationRecords(
        baselineSimulation,
        candidateSimulation,
      ).equivalent,
      true,
    );
    assert.equal(
      comparePresentationSemanticRecords(
        baselinePresentation,
        candidatePresentation,
      ).equivalent,
      true,
    );
    assert.equal(composePerformanceVerdict({
      equivalence: true,
      measurementValidity: true,
      improvement: true,
      absoluteBudget: true,
    }).pass, true);
  } finally {
    if (sortDescriptor) Object.defineProperty(Array.prototype, 'sort', sortDescriptor);
    else delete Array.prototype.sort;
    if (trimDescriptor) Object.defineProperty(String.prototype, 'trim', trimDescriptor);
    else delete String.prototype.trim;
    if (setHasDescriptor) Object.defineProperty(Set.prototype, 'has', setHasDescriptor);
    else delete Set.prototype.has;
  }

  assert.equal(hookCalls, 0);
});

test('machine verdict keeps equivalence, validity, improvement, and absolute budget independent and bounded', () => {
  const verdict = composePerformanceVerdict({
    equivalence: { pass: true, report: { equivalent: true } },
    measurementValidity: {
      pass: false,
      reasons: ['unrelated-high-cpu-process'],
    },
    improvement: {
      pass: true,
      metrics: { frameP95DeltaMs: -2.4 },
    },
    absoluteBudget: {
      pass: true,
      metrics: { frameP95Ms: 14.2, limitMs: 16.7 },
    },
  });

  assert.equal(verdict.schema, PERFORMANCE_VERDICT_SCHEMA);
  assert.equal(verdict.equivalence.pass, true);
  assert.equal(verdict.measurementValidity.pass, false);
  assert.deepEqual(
    verdict.measurementValidity.reasons,
    ['unrelated-high-cpu-process'],
  );
  assert.equal(verdict.improvement.pass, true);
  assert.equal(verdict.absoluteBudget.pass, true);
  assert.equal(verdict.pass, false);
  assert.equal(verdict.status, 'fail');

  let getterCalls = 0;
  const accessor = {};
  Object.defineProperty(accessor, 'pass', {
    enumerable: true,
    get() {
      getterCalls += 1;
      return true;
    },
  });
  const invalid = composePerformanceVerdict({
    equivalence: accessor,
    measurementValidity: true,
    improvement: true,
    absoluteBudget: true,
  });
  assert.equal(invalid.equivalence.pass, false);
  assert.equal(invalid.pass, false);
  assert.equal(getterCalls, 0);

  const missing = composePerformanceVerdict({ equivalence: true });
  assert.equal(missing.equivalence.pass, true);
  assert.equal(missing.measurementValidity.pass, false);
  assert.equal(missing.improvement.pass, false);
  assert.equal(missing.absoluteBudget.pass, false);
  assert.equal(missing.pass, false);
});

test('machine verdict reports valid equivalent within-noise evidence as neutral rather than failed equivalence', () => {
  const verdict = composePerformanceVerdict({
    equivalence: { pass: true, status: 'equivalent' },
    measurementValidity: { pass: true, status: 'valid' },
    improvement: {
      pass: false,
      status: 'neutral',
      reasons: ['improvement-does-not-exceed-noise'],
    },
    absoluteBudget: { pass: true, status: 'within-budget' },
  });

  assert.equal(verdict.equivalence.pass, true);
  assert.equal(verdict.measurementValidity.pass, true);
  assert.equal(verdict.improvement.pass, false);
  assert.equal(verdict.pass, false);
  assert.equal(verdict.status, 'neutral');
});
