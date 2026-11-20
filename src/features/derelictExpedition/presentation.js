// Read-only presentation for BLACKBOX RUNS. These descriptors compose existing
// authored hardware and existing comms/caption/toast surfaces. They own no rules.

const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const point = value => value && Number.isFinite(value.x) && Number.isFinite(value.z)
  ? { x: value.x, z: value.z } : null;
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

const PRESSURE_LABELS = Object.freeze(['QUIET', 'WARMING', 'VENTING', 'SHEARING']);
const PRESSURE_COPY = Object.freeze([
  'The hull is quiet. Scout the holds; the recorder is physically clamped in place.',
  'The reactor is warming. The outer service breaches stay open.',
  'Pressure jets are cycling. Watch the warning, then tow through the quiet interval.',
  'Loose plates are moving across the shortcut. Take the longer outer tow lane if the load catches.',
]);
const OBSTACLE_COPY = Object.freeze({
  shutter: Object.freeze({ title: '01 / COUNTERWEIGHT GALLERY', shape: 'split_bar',
    instruction: 'Tow or Pull the counterweight out of its cradle. Guns can cut the shutter instead.',
    alternate: 'A physical clamp also holds the recorder. A clean breakaway is a valid recovery.',
    target: 'counterweight' }),
  vent: Object.freeze({ title: '02 / PRESSURE HOLD', shape: 'three_chevrons',
    instruction: 'Tow or Shove the pressure baffle clear, or destroy it. Pin loose fragments while crossing the jet.',
    alternate: 'The warning precedes every jet. The side breach remains a route back outside.',
    target: 'vent_baffle' }),
  relay: Object.freeze({ title: '03 / OPTIONAL RELAY VAULT', shape: 'broken_link',
    instruction: 'Pull the relay off its socket, or shoot it. The vault plate and its core are physical tow targets.',
    alternate: 'The core is heavier and raises reactor pressure. Returning with the recorder alone is a success.',
    target: 'relay' }),
});

/**
 * Concrete live asset seam. Payload overrides use visualOverrides.packagedPropSpec
 * (packagedPropFile, slot, radius); fx hulls use partsLibrary's existing aftermath
 * place map. Never stamp authoredPayloadAssetId alongside packagedPropFile: the
 * renderer deliberately gives the former priority and would display a cargo pod.
 */
export function authoredExpeditionBodyData(body, siteId = 'blackbox_vesta') {
  if (!body || typeof body.key !== 'string' || !(body.radius > 0)) {
    throw new TypeError('A physical expedition body descriptor is required');
  }
  const data = {
    scanLabel: body.scanLabel || body.key.replaceAll('_', ' '),
    authoredScanLabel: body.scanLabel || body.key.replaceAll('_', ' '),
    // An expedition's cargo and rewards must never be minted again by a generic
    // wreck scanner. Runtime owns these empty pools; this only supplies defaults.
    authoredSalvagePool: {}, salvagePool: {}, loot: [],
    masslineTetherable: body.anchored !== true,
  };
  if (body.proportions) data.proportions = { ...body.proportions };
  if (body.anchored) {
    data.placeId = body.placeId;
    data.wreckAftermath = true;
    data.poi = true;
    data.isLandmark = true;
    // poi:true makes this declared draw footprint outrank census scale, so the
    // chosen GLB fits the collision envelope checked by the layout certificate.
    data.placeTargetRadius = body.radius;
    data.landmarkId = `${siteId}:${body.key}`;
  } else if (body.assetId === 'pod_cargo_container') {
    data.authoredPayloadAssetId = 'pod_cargo_container';
    data.payloadStableId = `${siteId}:${body.key}`;
  } else {
    if (typeof body.assetId !== 'string' || !/^places\/[a-z0-9_]+\.glb$/.test(body.assetId)) {
      throw new TypeError(`Missing authored package for expedition body ${body.key}`);
    }
    data.packagedPropFile = body.assetId;
    data.packagedPropSlot = 'place';
    data.packagedPropRadius = body.radius;
  }
  return data;
}

function bodySnapshot(record, key, bodyByKey) {
  const live = typeof bodyByKey === 'function' ? bodyByKey(key)
    : bodyByKey instanceof Map ? bodyByKey.get(key) : bodyByKey?.[key];
  if (live && live.alive !== false) return live;
  const saved = record?.bodies?.[key];
  if (saved && saved.lifecycle !== 'lost' && saved.lifecycle !== 'delivered') return saved;
  return null;
}

function bodyPosition(record, layout, key, bodyByKey) {
  const saved = record?.bodies?.[key];
  if (saved && (saved.lifecycle === 'lost' || saved.lifecycle === 'delivered')) return null;
  const found = bodySnapshot(record, key, bodyByKey);
  return point(found?.pos || found?.position) || point(layout?.bodies?.find(row => row.key === key)?.position);
}

function cargoLabel(value, name) {
  const status = value?.status;
  const states = { locked: 'clamped', available: 'released', recovered: 'under tow', delivered: 'delivered', lost: 'lost' };
  return `${name}: ${states[status] || 'not surveyed'}`;
}

function objectiveFor(record) {
  const cargo = record?.cargo || {}, obstacles = record?.obstacles || {};
  const main = cargo.blackbox?.status, core = cargo.core?.status;
  if (main === 'lost' && core === 'recovered') return {
    id: 'core_return', title: 'RECORDER LOST / RETURN THE CORE', detail: 'The recorder is gone. The surviving core still has value: tow it into the receiver and brake the load.', target: 'receiver',
  };
  if (main === 'lost' && (core === 'locked' || core === 'available')) return {
    id: 'core_salvage', title: 'RECORDER LOST / CORE OPTIONAL', detail: 'The recorder will not respawn. You may still recover the surviving core, or leave the wreck safely.', target: core === 'available' ? 'core' : 'relay',
  };
  if (record?.phase === 'failed' || main === 'lost') return {
    id: 'lost', title: 'RECORDER LOST', detail: 'The source is spent. Leave the field safely; reentry will not replace the missing cargo.', target: 'receiver',
  };
  if (record?.phase === 'complete') return {
    id: 'complete', title: 'BLACKBOX RUN CLOSED', detail: 'Recovered hardware is settled. The field remembers what was delivered and what was lost.', target: 'receiver',
  };
  if (record?.abandoned || record?.phase === 'abandoned') return {
    id: 'reenter', title: 'RETURN TO THE DERELICT', detail: 'The same cargo, broken fittings and reactor pressure are waiting where you left them.', target: 'entry',
  };
  if (!record?.accepted || record?.phase === 'offered') return {
    id: 'offer', title: 'BLACKBOX RUNS', detail: 'Enter the broken freighter, release its flight recorder, then physically tow it home. The deeper core is optional.', target: 'entry',
  };
  if (main === 'delivered') {
    if (core === 'recovered') return { id: 'core_return', title: 'TOW THE CORE HOME', detail: 'Brake the core inside the receiver. Keep the tow out of the moving shortcut.', target: 'receiver' };
    return { id: 'primary_success', title: 'RECORDER DELIVERED', detail: 'The run is already a success. You can leave, or return for the heavier core while its source survives.', target: 'relay' };
  }
  if (main === 'recovered') return {
    id: 'return', title: 'TOW THE RECORDER HOME', detail: 'Bring the physical recorder into the receiver and slow the load. The core remains an optional detour.', target: 'receiver',
  };
  if (main === 'available') return {
    id: 'recover', title: 'RECOVER THE FLIGHT RECORDER', detail: 'Latch the recorder with the Massline, or move it with Pull/Shove. Bring the whole load outside its cradle.', target: 'blackbox',
  };
  if (!obstacles.shutter?.opened) return { id: 'shutter', title: OBSTACLE_COPY.shutter.title, detail: OBSTACLE_COPY.shutter.instruction, target: 'counterweight' };
  if (!obstacles.vent?.opened) return { id: 'vent', title: OBSTACLE_COPY.vent.title, detail: OBSTACLE_COPY.vent.instruction, target: 'vent_baffle' };
  return { id: 'recover', title: 'RECOVER THE FLIGHT RECORDER', detail: 'Access is open. Free the physical recorder and carry its momentum back to the receiver.', target: 'blackbox' };
}

/**
 * Small UI projection, intended for a 4–10 Hz presentation adapter, never a sim
 * writer. Each marker has text AND a distinct shape; warning is not color-only.
 */
export function buildExpeditionPresentation(record, layout, { settings = {}, bodyByKey = null, playerPosition = null } = {}) {
  if (!layout) return null;
  const objective = objectiveFor(record);
  const stage = Math.max(0, Math.min(3, Math.trunc(finite(record?.pressureStage))));
  const pressure = Math.max(0, Math.min(100, finite(record?.pressure)));
  const reducedMotion = settings.video?.motionReduce === true;
  const reducedFlash = settings.accessibility?.flashReduce === true;
  const markers = [];
  const addMarker = (id, position, label, shape, optional = false, entityKey = null) => {
    if (!position) return;
    markers.push({ id, position, label, shape, optional, entityKey,
      emphasis: objective.target === id || objective.target === entityKey ? 'primary' : 'secondary',
      distance: point(playerPosition) ? distance(playerPosition, position) : null });
  };
  addMarker('entry', point(layout.entry), 'ENTRY / 3 connected holds', 'open_bracket');
  addMarker('receiver', point(layout.receiver?.position), 'RECEIVER / tow and brake', 'double_bracket');
  for (const room of layout.compartments || []) {
    const copy = OBSTACLE_COPY[room.id];
    if (!copy) continue;
    const open = record?.obstacles?.[room.id]?.opened === true;
    const position = open ? point(room.center) : bodyPosition(record, layout, copy.target, bodyByKey);
    addMarker(room.id, position, `${copy.title}${open ? ' / OPEN' : ''}`, open ? 'open_bracket' : copy.shape,
      room.id === 'relay', open ? null : copy.target);
  }
  for (const cargo of layout.loot || []) {
    const row = record?.cargo?.[cargo.id];
    if (row?.status === 'delivered' || row?.status === 'lost') continue;
    addMarker(cargo.id, bodyPosition(record, layout, cargo.bodyKey, bodyByKey),
      `${cargo.label.toUpperCase()}${cargo.optional ? ' / OPTIONAL' : ''}`, cargo.optional ? 'double_diamond' : 'diamond', cargo.optional, cargo.bodyKey);
  }
  let nearestRoom = null;
  const player = point(playerPosition);
  if (player) {
    for (const room of layout.compartments || []) {
      const d = distance(player, room.center);
      if (d <= room.radius + 45 && (!nearestRoom || d < nearestRoom.distance)) nearestRoom = { room, distance: d };
    }
  }
  const localCopy = nearestRoom && OBSTACLE_COPY[nearestRoom.room.id];
  const obstacleOpen = nearestRoom && record?.obstacles?.[nearestRoom.room.id]?.opened;
  const hint = localCopy && !obstacleOpen ? localCopy.instruction : objective.detail;
  const optional = ['recovered', 'lost'].includes(record?.cargo?.blackbox?.status) || record?.primaryComplete === true;
  return {
    schemaVersion: 1, siteId: layout.id, title: 'BLACKBOX RUNS', siteName: layout.name,
    objective, hint, alternateHint: localCopy?.alternate || 'The exterior service lane stays open. You may abandon and reenter the same field.',
    status: [cargoLabel(record?.cargo?.blackbox, 'Recorder'), cargoLabel(record?.cargo?.core, 'Core')].join(' / '),
    pressure: { value: pressure, stage, label: PRESSURE_LABELS[stage], text: PRESSURE_COPY[stage],
      shape: ['one_bar', 'two_bars', 'three_bars', 'split_bars'][stage],
      pulseHz: reducedMotion || reducedFlash ? 0 : stage > 1 ? 0.5 : 0,
      flash: false, cameraShake: 0 },
    optionalChoice: optional && record?.cargo?.core?.status !== 'delivered' && record?.cargo?.core?.status !== 'lost'
      ? 'Extract now, or take the deeper core: twice the load, more reactor pressure.' : null,
    markers, route: (layout.safeExterior || []).map(p => ({ ...p })),
    receiverInstruction: `Tow cargo inside ${Math.round(layout.receiver.radius)} wu; brake below ${Math.round(layout.receiver.maxSpeed)} wu/s.`,
    accessibility: { reducedMotion, reducedFlash, highContrast: settings.accessibility?.highContrast === true,
      caption: `${objective.title}. ${hint} Reactor ${PRESSURE_LABELS[stage].toLowerCase()}.` },
  };
}

const MILESTONE_COPY = Object.freeze({
  started: ['BLACKBOX RUNS', 'Three connected holds. Recover the recorder and tow it back here. The deeper core is optional.'],
  shutter_open: ['SHUTTER OPEN', 'The counterweight gallery is open. The pressure hold lies along the broken spine.'],
  vent_open: ['PRESSURE HOLD OPEN', 'The baffle is clear. Recover the physical recorder; watch the loose deck fragments.'],
  relay_open: ['VAULT OPEN', 'Relay power is gone. The heavier core is available if you want the extra tow.'],
  blackbox_recovered: ['RECORDER FREE', 'Extraction is open. Tow the recorder to the receiver, or risk the optional core.'],
  core_recovered: ['CORE FREE', 'The reactor has lost its ballast. Loose plates are shifting; keep the load clear of the shortcut.'],
  blackbox_delivered: ['RECORDER DELIVERED', 'The recorder is in receiver custody. This run is a success; the core remains optional.'],
  core_delivered: ['CORE DELIVERED', 'The receiver has the reactor core. Both physical loads are accounted for.'],
  blackbox_lost: ['RECORDER LOST', 'No replacement will spawn. Get clear through the outer service lane.'],
  core_lost: ['CORE LOST', 'The optional core is gone. The recorder and its payment remain independent.'],
  abandoned: ['RUN SUSPENDED', 'The field keeps its cargo, damage and pressure. Return to the same site to resume.'],
  reentered: ['BACK IN THE FIELD', 'The same hardware is still here. Follow the receiver markers to finish the tow.'],
  pressure_1: ['REACTOR WARMING', PRESSURE_COPY[1]],
  pressure_2: ['VENTS CYCLING', PRESSURE_COPY[2]],
  pressure_3: ['HULL SHEARING', PRESSURE_COPY[3]],
  settlement_wait: ['CARGO IN CUSTODY', 'The receiver has the load. Settlement is pending; do not recover a replacement.'],
});

/** Known production events only. The caller owns once-per-transition delivery. */
export function expeditionMilestoneEvents(kind, record, layout, { settings = {} } = {}) {
  const copy = MILESTONE_COPY[kind];
  if (!copy || !layout) return [];
  const warning = kind.startsWith('pressure_') || kind.endsWith('_lost');
  const text = `${copy[0]}. ${copy[1]}`;
  const cueId = `blackbox.${kind.replaceAll('_', '.')}`;
  return [
    { event: 'toast', payload: { text, kind: warning ? 'warning' : 'info', ttl: warning ? 6 : 5 } },
    { event: 'comms:log', payload: { from: 'RECOVERY RECEIVER', text, kind: 'salvage', sectorId: record?.sectorId || null,
      source: 'derelictExpedition', siteId: layout.id } },
    { event: 'presentation:caption', payload: { id: cueId, text, assertive: warning, shape: warning ? 'split_bars' : 'open_bracket',
      highContrast: settings.accessibility?.highContrast === true,
      reducedMotion: settings.video?.motionReduce === true, flashReduced: settings.accessibility?.flashReduce === true } },
  ];
}
