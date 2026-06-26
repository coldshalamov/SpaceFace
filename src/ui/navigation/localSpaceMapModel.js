// SpaceFace navigation V3 — local/system-map and market-intelligence model.
//
// The current galaxy graph is not enough. This model provides a separate local
// spatial layer: your ship, stations, gates, lanes, hazards, remembered contacts,
// mission geometry, docking queues and player-deployed market beacons. It contains
// no DOM code and can feed canvas, WebGL or accessibility views.

export const LOCAL_INTEL_SCHEMA_VERSION = 1;

const DEFAULTS = Object.freeze({
  contactHalfLifeS: 35,
  hostileHalfLifeS: 18,
  staticHalfLifeS: 3600,
  minimumConfidence: 0.04,
  positionQuantum: 0.1,
  velocityQuantum: 0.05,
});

export class LocalSpaceIntel {
  constructor(options = {}) {
    this.options = { ...DEFAULTS, ...options };
    this.tracks = new Map();
    this.marketBeacons = new Map();
    this.landmarks = new Map();
    this.timeS = 0;
    this.revision = 0;
  }

  advance(timeS) {
    this.timeS = Math.max(this.timeS, finite(timeS, this.timeS));
    this._decayTracks();
  }

  observeContact(contact, observation = {}) {
    if (!contact || contact.id == null) return null;
    const id = String(contact.id);
    const timeS = finite(observation.timeS, this.timeS);
    this.timeS = Math.max(this.timeS, timeS);
    const previous = this.tracks.get(id);
    const confidence = clamp(finite(observation.confidence, 1), 0, 1);
    const track = {
      id,
      kind: classify(contact),
      name: String(contact.name || previous && previous.name || id),
      factionId: contact.factionId ?? contact.faction ?? (previous ? previous.factionId : null),
      hostile: !!(contact.hostile || observation.hostile || previous && previous.hostile),
      position: quantizeVec(contact.pos || contact.position, this.options.positionQuantum),
      velocity: quantizeVec(contact.vel || contact.velocity, this.options.velocityQuantum),
      radius: Math.max(0, finite(contact.radius, previous && previous.radius || 0)),
      heading: finite(contact.rot ?? contact.heading, previous && previous.heading || 0),
      confidence: Math.max(confidence, previous ? previous.confidence * 0.85 : 0),
      lastSeenS: timeS,
      firstSeenS: previous ? previous.firstSeenS : timeS,
      source: String(observation.source || 'active-sensor'),
      signature: Math.max(0, finite(observation.signature, contact.signature || 1)),
      threat: clamp(finite(observation.threat, contact.threat || 0), 0, 1),
      targetable: contact.targetable !== false,
      dockable: !!contact.dockable,
      static: isStaticKind(classify(contact)),
      metadata: { ...(previous && previous.metadata || {}), ...(contact.metadata || {}), ...(observation.metadata || {}) },
    };
    this.tracks.set(id, track);
    this.revision++;
    return track;
  }

  observeMany(contacts, observation = {}) {
    const out = [];
    for (const contact of contacts || []) {
      const track = this.observeContact(contact, observation);
      if (track) out.push(track);
    }
    return out;
  }

  markLandmark(landmark) {
    if (!landmark || landmark.id == null) return null;
    const id = String(landmark.id);
    const value = {
      id,
      kind: String(landmark.kind || 'poi'),
      name: String(landmark.name || id),
      position: quantizeVec(landmark.pos || landmark.position, this.options.positionQuantum),
      discovered: landmark.discovered !== false,
      factionId: landmark.factionId ?? null,
      icon: landmark.icon || null,
      metadata: { ...(landmark.metadata || {}) },
    };
    this.landmarks.set(id, value);
    this.revision++;
    return value;
  }

  /**
   * Store a delayed, imperfect station quote. A beacon is a player investment, not
   * omniscience: every quote carries age, latency, confidence and source.
   */
  recordMarketBeacon(stationId, market, observation = {}) {
    const id = String(stationId);
    const capturedAtS = finite(observation.capturedAtS, this.timeS);
    const receivedAtS = finite(observation.receivedAtS, this.timeS);
    const quotes = {};
    for (const [commodityId, quote] of Object.entries(market || {})) {
      quotes[commodityId] = {
        buy: nonNegative(quote && quote.buy, null),
        sell: nonNegative(quote && quote.sell, null),
        stock: nonNegative(quote && quote.stock, null),
        demand: nonNegative(quote && quote.demand, null),
        trend: finite(quote && quote.trend, 0),
      };
    }
    const beacon = {
      stationId: id,
      capturedAtS,
      receivedAtS,
      latencyS: Math.max(0, receivedAtS - capturedAtS),
      reliability: clamp(finite(observation.reliability, 0.92), 0, 1),
      source: String(observation.source || 'player-beacon'),
      compromised: !!observation.compromised,
      quotes,
    };
    this.marketBeacons.set(id, beacon);
    this.revision++;
    return beacon;
  }

  getTrack(id) { return this.tracks.get(String(id)) || null; }
  getMarketBeacon(id) { return this.marketBeacons.get(String(id)) || null; }

  buildLocalMap({ player, mode = 'system', range = null, route = [], missionGeometry = [], hazards = [], lanes = [], docking = [] } = {}) {
    const now = this.timeS;
    const center = quantizeVec(player && player.pos, this.options.positionQuantum);
    const speed = Math.hypot(finite(player && player.vel && player.vel.x), finite(player && player.vel && player.vel.z));
    const inferredRange = range || (mode === 'tactical' ? Math.max(700, speed * 10) : mode === 'system' ? null : 2500);
    const contacts = [];

    for (const track of this.tracks.values()) {
      const projected = projectTrack(track, now);
      if (inferredRange != null && distance(projected.position, center) > inferredRange) continue;
      contacts.push(projected);
    }

    const landmarks = Array.from(this.landmarks.values()).filter((x) => x.discovered);
    const normalizedHazards = normalizeGeometry(hazards);
    const normalizedLanes = normalizeGeometry(lanes);
    const normalizedDocking = normalizeGeometry(docking);
    const normalizedRoute = normalizeGeometry(route);
    const normalizedMissionGeometry = normalizeGeometry(missionGeometry);
    return Object.freeze({
      schemaVersion: LOCAL_INTEL_SCHEMA_VERSION,
      revision: this.revision,
      timeS: now,
      mode,
      center,
      range: inferredRange,
      player: player ? {
        id: player.id,
        position: center,
        velocity: quantizeVec(player.vel, this.options.velocityQuantum),
        heading: finite(player.rot),
        speed,
      } : null,
      contacts: sortContacts(contacts, center),
      landmarks,
      hazards: normalizedHazards,
      lanes: normalizedLanes,
      docking: normalizedDocking,
      route: normalizedRoute,
      missionGeometry: normalizedMissionGeometry,
      bounds: computeMapBounds(center, contacts, landmarks, inferredRange, [
        ...normalizedHazards,
        ...normalizedLanes,
        ...normalizedDocking,
        ...normalizedRoute,
        ...normalizedMissionGeometry,
      ]),
      legend: buildLegend(contacts, landmarks),
    });
  }

  snapshot() {
    return {
      schemaVersion: LOCAL_INTEL_SCHEMA_VERSION,
      timeS: this.timeS,
      revision: this.revision,
      tracks: Array.from(this.tracks.values()).map(copyTrack),
      marketBeacons: Array.from(this.marketBeacons.values()).map((x) => ({ ...x, quotes: structuredCloneSafe(x.quotes) })),
      landmarks: Array.from(this.landmarks.values()).map((x) => ({ ...x, metadata: { ...x.metadata } })),
    };
  }

  restore(snapshot = {}) {
    this.timeS = Math.max(0, finite(snapshot.timeS));
    this.revision = Math.max(0, Math.trunc(finite(snapshot.revision)));
    this.tracks.clear();
    this.marketBeacons.clear();
    this.landmarks.clear();
    for (const track of snapshot.tracks || []) this.tracks.set(String(track.id), copyTrack(track));
    for (const beacon of snapshot.marketBeacons || []) this.marketBeacons.set(String(beacon.stationId), { ...beacon, quotes: structuredCloneSafe(beacon.quotes) });
    for (const landmark of snapshot.landmarks || []) this.landmarks.set(String(landmark.id), { ...landmark, metadata: { ...(landmark.metadata || {}) } });
  }

  _decayTracks() {
    for (const [id, track] of this.tracks) {
      const age = Math.max(0, this.timeS - track.lastSeenS);
      const halfLife = track.static
        ? this.options.staticHalfLifeS
        : track.hostile ? this.options.hostileHalfLifeS : this.options.contactHalfLifeS;
      const confidence = track.confidence * Math.pow(0.5, age / Math.max(halfLife, 0.001));
      if (confidence < this.options.minimumConfidence && !track.static) {
        this.tracks.delete(id);
        this.revision++;
      }
    }
  }
}

export function rankTradeRoutes({ beacons, cargoCapacity, currentStationId = null, travelEstimator, riskEstimator, nowS = 0 } = {}) {
  const list = beacons instanceof Map ? Array.from(beacons.values()) : Array.from(beacons || []);
  const routes = [];
  for (const origin of list) {
    if (currentStationId && String(origin.stationId) !== String(currentStationId)) continue;
    for (const destination of list) {
      if (origin === destination || origin.stationId === destination.stationId) continue;
      for (const [commodityId, sourceQuote] of Object.entries(origin.quotes || {})) {
        const destQuote = destination.quotes && destination.quotes[commodityId];
        if (!destQuote || !Number.isFinite(sourceQuote.buy) || !Number.isFinite(destQuote.sell)) continue;
        const unitProfit = destQuote.sell - sourceQuote.buy;
        if (!(unitProfit > 0)) continue;
        const stockLimit = Number.isFinite(sourceQuote.stock) ? sourceQuote.stock : cargoCapacity;
        const demandLimit = Number.isFinite(destQuote.demand) ? destQuote.demand : cargoCapacity;
        const units = Math.max(0, Math.min(cargoCapacity, stockLimit, demandLimit));
        if (!(units > 0)) continue;
        const travel = typeof travelEstimator === 'function' ? travelEstimator(origin.stationId, destination.stationId) : { timeS: 1, fuel: 0 };
        const risk = typeof riskEstimator === 'function' ? clamp(riskEstimator(origin.stationId, destination.stationId), 0, 1) : 0;
        const ageS = Math.max(nowS - origin.capturedAtS, nowS - destination.capturedAtS, 0);
        const reliability = Math.min(origin.reliability ?? 1, destination.reliability ?? 1) * Math.exp(-ageS / 1800);
        const gross = unitProfit * units;
        const expected = gross * reliability * (1 - risk * 0.65);
        routes.push({
          originId: origin.stationId,
          destinationId: destination.stationId,
          commodityId,
          units,
          unitProfit,
          grossProfit: gross,
          expectedProfit: expected,
          profitPerMinute: expected / Math.max(1, finite(travel.timeS, 1)) * 60,
          fuel: Math.max(0, finite(travel.fuel)),
          risk,
          ageS,
          reliability,
        });
      }
    }
  }
  routes.sort((a,b) => b.profitPerMinute - a.profitPerMinute || b.expectedProfit - a.expectedProfit);
  return routes;
}

export function computeMapBounds(center, contacts = [], landmarks = [], fixedRange = null, geometry = []) {
  if (fixedRange != null) return { minX:center.x-fixedRange, maxX:center.x+fixedRange, minZ:center.z-fixedRange, maxZ:center.z+fixedRange };
  let minX=center.x, maxX=center.x, minZ=center.z, maxZ=center.z;
  for (const item of [...contacts, ...landmarks, ...geometry]) {
    const p = item.position || item.pos;
    if (!p) continue;
    minX=Math.min(minX,p.x); maxX=Math.max(maxX,p.x); minZ=Math.min(minZ,p.z); maxZ=Math.max(maxZ,p.z);
  }
  const span = Math.max(500, maxX-minX, maxZ-minZ);
  const pad = span*0.12;
  return { minX:minX-pad,maxX:maxX+pad,minZ:minZ-pad,maxZ:maxZ+pad };
}

function projectTrack(track, now) {
  const dt = Math.max(0, now - track.lastSeenS);
  return {
    ...copyTrack(track),
    position: { x:track.position.x+track.velocity.x*dt, z:track.position.z+track.velocity.z*dt },
    ageS:dt,
    confidence:clamp(track.confidence*Math.pow(0.5,dt/(track.static?3600:track.hostile?18:35)),0,1),
    stale:dt>(track.static?180:12),
  };
}

function sortContacts(contacts, center) {
  return contacts.sort((a,b) => Number(b.hostile)-Number(a.hostile) || b.threat-a.threat || distance(a.position,center)-distance(b.position,center) || a.id.localeCompare(b.id));
}

function buildLegend(contacts, landmarks) {
  const kinds = new Set();
  for (const x of contacts) kinds.add(x.hostile?'hostile':x.kind);
  for (const x of landmarks) kinds.add(x.kind);
  return Array.from(kinds).sort();
}

function classify(contact) {
  const t=String(contact.type||contact.kind||'unknown');
  if(t==='ship'||t==='drone') return contact.hostile?'hostile':'ship';
  if(t==='station'||t==='gate'||t==='asteroid'||t==='wreck'||t==='pickup'||t==='hazard') return t;
  return t;
}
function isStaticKind(kind){return kind==='station'||kind==='gate'||kind==='asteroid'||kind==='hazard'||kind==='poi';}
function normalizeGeometry(list){return Array.from(list||[]).map((x)=>({...x,position:quantizeVec(x.position||x.pos,0.1)}));}
function copyTrack(t){return {...t,position:{...t.position},velocity:{...t.velocity},metadata:{...(t.metadata||{})}};}
function quantizeVec(v,q){return {x:quantize(finite(v&&v.x),q),z:quantize(finite(v&&v.z),q)};}
function quantize(v,q){return q>0?Math.round(v/q)*q:v;}
function distance(a,b){return Math.hypot(finite(a&&a.x)-finite(b&&b.x),finite(a&&a.z)-finite(b&&b.z));}
function structuredCloneSafe(value){return value==null?value:JSON.parse(JSON.stringify(value));}
function nonNegative(v,fallback){return Number.isFinite(v)?Math.max(0,v):fallback;}
function clamp(v,lo,hi){return Math.max(lo,Math.min(hi,v));}
function finite(v,fallback=0){return Number.isFinite(v)?v:fallback;}
