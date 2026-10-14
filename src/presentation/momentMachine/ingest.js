// Adapters from the live Adventure tape, Chronicle facts, kill-cam tape, and clip list.
// They copy logged fields. They do not invent a rescue, a chain, or a recovery.

import {
  MOMENT_STREAM_SCHEMA,
  TICK_RATE,
  LOGGED_SOURCES,
  cleanId,
  finiteNumber,
  sanitizeEvent,
  sanitizeSample,
  compareEventOrder,
} from './contract.js';

const KILLCAM_SCHEMA = 'spaceface.killcamTape.v1';

function emptyStream(seed) {
  return {
    schema: MOMENT_STREAM_SCHEMA,
    seed: Number.isFinite(Number(seed)) ? Number(seed) : 0,
    tickRate: TICK_RATE,
    tone: 'feat',
    window: { baseTick: 0, ticks: 0, seconds: 0 },
    events: [],
    samples: [],
    dropped: [],
    positionSource: 'none',
  };
}

function pushEvent(stream, raw) {
  const event = sanitizeEvent(raw, stream.dropped);
  if (!event) return;
  if (stream.events.some((existing) => existing.id === event.id)) {
    stream.dropped.push({ id: event.id, reason: 'rejected:duplicate-id' });
    return;
  }
  stream.events.push(event);
}

function pushSample(stream, raw) {
  const sample = sanitizeSample(raw);
  if (!sample) return;
  const base = stream.window.baseTick;
  const end = stream.window.ticks > 0 ? base + stream.window.ticks - 1 : null;
  if (end != null && (sample.tick < base || sample.tick > end)) return;
  stream.samples.push(sample);
}

function finish(stream) {
  stream.events.sort(compareEventOrder);
  stream.samples.sort((a, b) => a.tick - b.tick || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) || a.generation - b.generation);
  if (stream.dropped.length > 64) stream.dropped.length = 64;
  return stream;
}

function identityActor(identity, role, generation) {
  if (!identity || typeof identity !== 'object') return null;
  const id = cleanId(identity.id) || (identity.player === true ? 'player' : null);
  if (!id) return null;
  const gen = finiteNumber(identity.generation);
  return {
    id,
    generation: gen != null && Number.isInteger(gen) && gen >= 0 ? gen : generation,
    role,
  };
}

function factCausality(fact) {
  return cleanId(fact.group) || cleanId(fact.externalId) || cleanId(fact.dedupe) || null;
}

/**
 * Map one Chronicle fact. Headlines and story prose are not causality.
 * `distress:rescued` is dropped: the fact does not carry the threat it answered,
 * so it is not logged as kind `rescue`.
 */
export function fromChronicleFact(fact) {
  if (!fact || typeof fact !== 'object' || fact.invalid === true) return null;
  const eventName = typeof fact.event === 'string' ? fact.event : '';
  if (!eventName) return null;
  if (eventName === 'news:headline' || eventName.startsWith('story:')) {
    return { dropped: true, reason: 'chronicle:prose-not-causality', id: cleanId(fact.id) };
  }
  const tickRaw = finiteNumber(fact.tick);
  if (tickRaw == null || !Number.isInteger(tickRaw) || tickRaw < 0) return null;
  const actors = [];
  const actor = identityActor(fact.actor, 'actor', 0);
  const subject = identityActor(fact.subject, 'subject', 0);
  if (actor) actors.push(actor);
  if (subject) actors.push(subject);
  const details = fact.details && typeof fact.details === 'object' ? fact.details : {};
  const causalityId = factCausality(fact);
  const position = details.pos && finiteNumber(details.pos.x) != null && finiteNumber(details.pos.z) != null
    ? { x: details.pos.x, z: details.pos.z }
    : null;
  const base = {
    id: cleanId(fact.id) || cleanId(fact.dedupe) || `ch-${tickRaw}-${eventName}`,
    causalityId,
    tick: tickRaw,
    simTime: finiteNumber(fact.t) != null ? Math.max(0, fact.t) : tickRaw / TICK_RATE,
    actors,
    position,
    source: 'chronicle',
  };

  if (eventName === 'distress:rescued' || fact.stage === 'rescue') {
    // The rescue fact does not carry the threat it answered. Emitting kind `rescue`
    // here would let a caption claim a save the log never paired with a threat.
    return {
      dropped: true,
      reason: 'chronicle:rescue-without-logged-threat',
      id: base.id,
    };
  }
  if (fact.stage === 'law' || (eventName === 'chronicler:provenance' && details.kind === 'law')) {
    const authority = typeof details.kind === 'string' && details.kind ? details.kind : 'law';
    return { ...base, kind: 'lawful_intervention', payload: { authority } };
  }
  if (eventName === 'entity:killed' || eventName === 'player:death') {
    const cause = typeof details.cause === 'string' ? details.cause : 'generic';
    if (cause === 'ship_collision' || cause === 'terrain_collision') {
      return {
        ...base,
        kind: 'collision',
        payload: { impact: true, cause, playerCaused: details.playerCaused === true },
      };
    }
    return {
      ...base,
      kind: 'kill',
      payload: { cause, playerCaused: details.playerCaused === true },
    };
  }
  if (eventName === 'salvage:reactorBurst') {
    return { ...base, kind: 'cargo_catastrophe', payload: { volatile: true, burst: true } };
  }
  if (eventName === 'freight:cargoSpilled' || fact.stage === 'spill') {
    return {
      ...base,
      kind: 'spill',
      payload: {
        volatile: false,
        cause: typeof details.cause === 'string' ? details.cause : 'jettison',
        qty: finiteNumber(details.qty) != null ? details.qty : 0,
      },
    };
  }
  if (eventName === 'salvage:completed' || fact.stage === 'recovered' || fact.stage === 'salvage') {
    return { ...base, kind: 'recovery', payload: { planned: null } };
  }
  if (eventName === 'heat:changed' || fact.stage === 'wanted') {
    return {
      ...base,
      kind: 'wanted',
      payload: {
        level: finiteNumber(details.level) != null ? details.level : 0,
        previousLevel: finiteNumber(details.previousLevel) != null ? details.previousLevel : 0,
      },
    };
  }
  if (eventName === 'contraband:scanned' || fact.stage === 'scan') {
    return { ...base, kind: 'scan', payload: { found: details.found === true } };
  }
  if (eventName === 'stunt:trickDetected') {
    return {
      ...base,
      kind: 'stunt',
      payload: { trickId: typeof details.trickId === 'string' ? details.trickId : '' },
    };
  }
  if (eventName === 'gate:verdict' || fact.stage === 'gate') {
    return {
      ...base,
      kind: 'gate',
      payload: { wanted: details.wanted === true },
    };
  }
  return null;
}

export function fromChronicleMemory(memory) {
  const out = [];
  const stories = memory && Array.isArray(memory.stories) ? memory.stories : [];
  for (let s = 0; s < stories.length; s += 1) {
    const nodes = stories[s] && Array.isArray(stories[s].nodes) ? stories[s].nodes : [];
    for (let n = 0; n < nodes.length; n += 1) {
      const mapped = fromChronicleFact(nodes[n]);
      if (mapped && !mapped.dropped) out.push(mapped);
    }
  }
  return out;
}

function tapeKind(type) {
  if (type === 'kill') return 'kill';
  if (type === 'stunt') return 'stunt';
  if (type === 'damage' || type === 'death') return 'damage';
  if (type === 'boost') return 'boost';
  return null;
}

/** Adventure tape (`state.replay.recording`). Marks only, unless plain samples were supplied. */
export function fromAdventureTape(recording) {
  const stream = emptyStream(recording && recording.seed);
  if (!recording || typeof recording !== 'object') {
    stream.dropped.push({ id: null, reason: 'tape-missing' });
    return finish(stream);
  }
  const tickRate = finiteNumber(recording.tickRate);
  stream.tickRate = tickRate != null && tickRate > 0 ? tickRate : TICK_RATE;
  const ticks = finiteNumber(recording.ticks);
  const base = finiteNumber(recording.absoluteBaseTick ?? recording.base);
  const count = ticks != null && ticks >= 0 ? Math.floor(ticks) : 0;
  const baseTick = base != null && base >= 0 ? Math.floor(base) : 0;
  stream.window = { baseTick, ticks: count, seconds: count / stream.tickRate };
  const marks = Array.isArray(recording.events) ? recording.events : [];
  for (let i = 0; i < marks.length && i < 64; i += 1) {
    const mark = marks[i];
    if (!mark || typeof mark !== 'object') continue;
    const kind = tapeKind(typeof mark.type === 'string' ? mark.type : mark.kind);
    if (!kind) continue;
    const relative = finiteNumber(mark.tick);
    if (relative == null || relative < 0) continue;
    const absolute = Number.isFinite(mark.absoluteTick) ? mark.absoluteTick : baseTick + Math.floor(relative);
    pushEvent(stream, {
      id: `tape-${kind}-${absolute}`,
      causalityId: null,
      tick: absolute,
      simTime: absolute / stream.tickRate,
      kind,
      actors: [],
      position: null,
      payload: { label: typeof mark.label === 'string' ? mark.label.slice(0, 80) : '' },
      source: 'tape',
    });
  }
  const plain = Array.isArray(recording.samples) ? recording.samples
    : Array.isArray(recording.poseFrames) ? recording.poseFrames.flatMap((frame) => (
      frame && Array.isArray(frame.poses) ? frame.poses : []
    )) : null;
  if (plain) {
    for (let i = 0; i < plain.length; i += 1) pushSample(stream, plain[i]);
  }
  // An empty pose list is not a position log. Claim tape samples only after one survives.
  if (stream.samples.length) stream.positionSource = 'tape-samples';
  else {
    stream.positionSource = 'none';
    stream.dropped.push({ id: null, reason: 'tape-positions-unrecorded' });
  }
  return finish(stream);
}

/**
 * Kill-cam poses are positions, not motives. Flashes are death marks without a killer causality,
 * so they cannot satisfy rescue, chain, or collateral grammar.
 */
export function fromKillcamTape(tape, meta = {}) {
  const stream = emptyStream(meta.seed != null ? meta.seed : tape && tape.seed);
  if (!tape || tape.schema !== KILLCAM_SCHEMA) {
    stream.dropped.push({ id: null, reason: 'killcam-schema' });
    return finish(stream);
  }
  const sampleRate = finiteNumber(tape.sampleRate) && tape.sampleRate > 0 ? tape.sampleRate : 30;
  const stride = Math.max(1, Math.round(TICK_RATE / sampleRate));
  const baseTick = finiteNumber(meta.baseTick) != null ? Math.floor(meta.baseTick) : 0;
  const sampleCount = finiteNumber(tape.samples) != null ? Math.max(0, Math.floor(tape.samples)) : 0;
  const ticks = sampleCount > 0 ? (sampleCount - 1) * stride + 1 : 0;
  stream.window = { baseTick, ticks, seconds: ticks / TICK_RATE };
  stream.positionSource = 'killcam';
  const ships = Array.isArray(tape.ships) ? tape.ships : [];
  for (let s = 0; s < ships.length; s += 1) {
    const ship = ships[s];
    if (!ship || !ship.x || !ship.z) continue;
    const id = ship.player === true ? 'player' : `killcam:${s}`;
    const n = Math.min(ship.n | 0, ship.x.length | 0, ship.z.length | 0);
    const origin = ship.b | 0;
    for (let i = 0; i < n; i += 1) {
      const tick = baseTick + (origin + i) * stride;
      const heading = ship.r && ship.r.length > i ? ship.r[i] : 0;
      pushSample(stream, { tick, id, generation: 0, x: ship.x[i], z: ship.z[i], heading });
    }
  }
  const flashes = Array.isArray(tape.flashes) ? tape.flashes : [];
  for (let i = 0; i < flashes.length && i < 96; i += 1) {
    const flash = flashes[i];
    if (!flash) continue;
    const tick = baseTick + Math.floor(finiteNumber(flash.s) || 0) * stride;
    pushEvent(stream, {
      id: `killcam-flash-${i}`,
      causalityId: null,
      tick,
      simTime: tick / TICK_RATE,
      kind: 'death_flash',
      actors: [],
      position: finiteNumber(flash.x) != null && finiteNumber(flash.z) != null
        ? { x: flash.x, z: flash.z }
        : null,
      payload: { size: finiteNumber(flash.size) != null ? flash.size : 0 },
      source: 'killcam',
    });
  }
  return finish(stream);
}

/** Clip-director rows are kill/stunt marks. They do not carry a physics cause. */
export function fromClipList(clips, meta = {}) {
  const stream = emptyStream(meta.seed);
  stream.positionSource = 'none';
  const list = Array.isArray(clips) ? clips : [];
  let maxTick = 0;
  for (let i = 0; i < list.length && i < 32; i += 1) {
    const clip = list[i];
    if (!clip || typeof clip !== 'object') continue;
    const tick = finiteNumber(clip.momentTick);
    if (tick == null || tick < 0) continue;
    const absolute = Math.floor(tick);
    if (absolute > maxTick) maxTick = absolute;
    const kind = clip.kind === 'kill' ? 'kill' : 'stunt';
    const actors = [];
    const actorId = cleanId(clip.actorId);
    const targetId = cleanId(clip.targetId);
    if (actorId) actors.push({ id: actorId, generation: 0, role: 'actor' });
    if (targetId) actors.push({ id: targetId, generation: 0, role: 'subject' });
    pushEvent(stream, {
      id: cleanId(clip.id) || `clip-${i}`,
      causalityId: null,
      tick: absolute,
      simTime: absolute / TICK_RATE,
      kind,
      actors,
      position: null,
      payload: { label: typeof clip.label === 'string' ? clip.label.slice(0, 80) : '' },
      source: 'clip',
    });
  }
  stream.window = { baseTick: 0, ticks: maxTick + 1, seconds: (maxTick + 1) / TICK_RATE };
  stream.dropped.push({ id: null, reason: 'clip-positions-unrecorded' });
  return finish(stream);
}

function looksLikeTape(input) {
  return !!input && typeof input === 'object'
    && Array.isArray(input.events)
    && finiteNumber(input.ticks) != null
    && finiteNumber(input.tickRate) != null
    && input.schema !== MOMENT_STREAM_SCHEMA;
}

function adoptTone(raw) {
  if (raw === 'side-effect' || raw === 'reject-case') return raw;
  return 'feat';
}

function adoptWindow(raw, stream) {
  if (!raw || typeof raw !== 'object') return;
  const base = finiteNumber(raw.baseTick);
  const ticks = finiteNumber(raw.ticks);
  if (base == null || ticks == null || ticks < 0) return;
  stream.window = {
    baseTick: Math.max(0, Math.floor(base)),
    ticks: Math.floor(ticks),
    seconds: Math.floor(ticks) / (stream.tickRate || TICK_RATE),
  };
}

/**
 * Accept a moment stream, an Adventure tape, a bundle of live sources, a Chronicle fact,
 * or a kill-cam tape. The returned stream is a new object.
 */
export function ingestStream(input) {
  if (!input || typeof input !== 'object') {
    const stream = emptyStream(0);
    stream.ok = false;
    stream.errors = ['missing-stream'];
    return stream;
  }
  if (input.schema === KILLCAM_SCHEMA) return markOk(fromKillcamTape(input));
  if (looksLikeTape(input) && input.schema == null) return markOk(fromAdventureTape(input));
  if (typeof input.event === 'string' && input.schema == null && !Array.isArray(input.events)) {
    const stream = emptyStream(0);
    const mapped = fromChronicleFact(input);
    if (mapped && mapped.dropped) stream.dropped.push({ id: mapped.id, reason: mapped.reason });
    else if (mapped) pushEvent(stream, mapped);
    else stream.dropped.push({ id: null, reason: 'chronicle-unmapped' });
    const tick = stream.events.length ? stream.events[0].tick : 0;
    stream.window = { baseTick: 0, ticks: tick + 1, seconds: (tick + 1) / TICK_RATE };
    return markOk(finish(stream));
  }

  const bundled = input.adventureTape || input.chronicle || input.killcam || input.clips;
  if (bundled && input.schema !== MOMENT_STREAM_SCHEMA) {
    const stream = emptyStream(input.seed);
    if (input.adventureTape) mergeFrom(stream, fromAdventureTape(input.adventureTape));
    if (Array.isArray(input.chronicle)) {
      for (let i = 0; i < input.chronicle.length; i += 1) {
        const mapped = fromChronicleFact(input.chronicle[i]);
        if (mapped && mapped.dropped) stream.dropped.push({ id: mapped.id, reason: mapped.reason });
        else if (mapped) pushEvent(stream, mapped);
      }
    } else if (input.chronicle && Array.isArray(input.chronicle.stories)) {
      const facts = fromChronicleMemory(input.chronicle);
      for (let i = 0; i < facts.length; i += 1) pushEvent(stream, facts[i]);
    }
    if (input.killcam) mergeFrom(stream, fromKillcamTape(input.killcam, { seed: input.seed, baseTick: input.baseTick }));
    if (input.clips) mergeFrom(stream, fromClipList(input.clips, { seed: input.seed }));
    if (Array.isArray(input.events)) {
      for (let i = 0; i < input.events.length; i += 1) pushEvent(stream, input.events[i]);
    }
    if (Array.isArray(input.samples)) {
      stream.positionSource = stream.samples.length ? stream.positionSource : 'stream';
      for (let i = 0; i < input.samples.length; i += 1) pushSample(stream, input.samples[i]);
    }
    return markOk(finish(stream));
  }

  const stream = emptyStream(input.seed);
  stream.tickRate = finiteNumber(input.tickRate) != null && input.tickRate > 0 ? input.tickRate : TICK_RATE;
  stream.tone = adoptTone(input.tone);
  adoptWindow(input.window, stream);
  if (input.schema !== MOMENT_STREAM_SCHEMA) {
    stream.dropped.push({ id: null, reason: 'schema-mismatch' });
  }
  const events = Array.isArray(input.events) ? input.events : [];
  for (let i = 0; i < events.length; i += 1) pushEvent(stream, events[i]);
  const samples = Array.isArray(input.samples) ? input.samples : [];
  if (samples.length) stream.positionSource = 'stream';
  for (let i = 0; i < samples.length; i += 1) pushSample(stream, samples[i]);
  return markOk(finish(stream));
}

function mergeFrom(target, source) {
  for (let i = 0; i < source.events.length; i += 1) pushEvent(target, source.events[i]);
  for (let i = 0; i < source.samples.length; i += 1) pushSample(target, source.samples[i]);
  for (let i = 0; i < source.dropped.length; i += 1) target.dropped.push(source.dropped[i]);
  if (source.positionSource !== 'none') target.positionSource = source.positionSource;
  if (source.window.ticks > target.window.ticks) target.window = source.window;
}

function markOk(stream) {
  stream.ok = true;
  stream.errors = [];
  stream.sources = LOGGED_SOURCES;
  return stream;
}
