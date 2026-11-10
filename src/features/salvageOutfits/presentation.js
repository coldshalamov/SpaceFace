// Concrete main-thread adapters: the existing prompt deck owns decisions and input, the existing
// voice floor owns radio, and the renderer invokes draw(). None of these adapters writes the sim.
import { getPromptDeck } from '../../ui/promptDeck.js';
import { createSalvageOutfitsReadModel, writeSalvageOutfitsReadModel } from './readModel.js';

export const SALVAGE_OUTFITS_MAIN_TO_SIM_EVENTS = Object.freeze(['salvageOutfits:choose']);
export const SALVAGE_OUTFITS_PRESENTATION_EVENTS = Object.freeze([
  'salvageOutfits:offer', 'salvageOutfits:offerClosed', 'salvageOutfits:radio',
]);

function listen(bus, name, handler, off) {
  const remove = bus.on(name, handler);
  off.push(typeof remove === 'function' ? remove : () => bus.off?.(name, handler));
}

export function createSalvageOutfitsPresentation({ state, bus, deck = getPromptDeck,
  voice = null, radioEnabled = true } = {}) {
  if (!bus?.on || !bus?.emit) throw new TypeError('Salvage outfit presentation needs the event bus');
  const off = [], offers = new Map(), radios = new Map();
  const currentDeck = () => typeof deck === 'function' ? deck() : deck;
  const currentState = () => typeof state === 'function' ? state() : state;
  let sequence = 0, destroyed = false;
  const promptId = (p) => `salvage-outfits:${p.meetingId}:${p.offerId}`;

  function hide(payload) {
    if (!payload?.meetingId) return false;
    let changed = false;
    for (const [id, item] of offers) {
      if (item.meetingId !== payload.meetingId || (payload.offerId && item.offerId !== payload.offerId)) continue;
      currentDeck()?.resolveDecision(id);
      offers.delete(id); changed = true;
    }
    return changed;
  }

  function show(payload) {
    if (destroyed || !payload?.meetingId || !payload.offerId || !Array.isArray(payload.choices)) return false;
    const host = currentDeck();
    if (!host?.offerDecision) return false;
    const id = promptId(payload);
    // A replacement offer retracts the old contract. A late callback cannot accept old terms.
    for (const [oldId, old] of offers) {
      if (old.meetingId === payload.meetingId && oldId !== id) {
        host.resolveDecision(oldId); offers.delete(oldId);
      }
    }
    const choices = payload.choices.filter((c) => c && typeof c.id === 'string').map((c) => ({
      id: c.id, label: String(c.label || c.id), disabled: c.disabled === true || c.available === false,
      cancel: c.cancel === true || c.id === 'cancel', danger: c.danger === true,
      reason: c.title || c.reason || undefined,
    }));
    const record = { meetingId: payload.meetingId, offerId: payload.offerId };
    offers.set(id, record);
    const accepted = host.offerDecision({
      id, kind: payload.kind === 'warn' ? 'warn' : 'info',
      sender: payload.crewId === 'latch' ? 'LATCHKEY' : 'KEEL UNION',
      headline: String(payload.title || 'Salvage terms'),
      detail: String(payload.detail || ''),
      statusFlag: 'Flight stays live. Terms settle only after physical recovery.',
      deadlineAt: Number.isFinite(payload.deadlineAt) ? payload.deadlineAt : null,
      choices,
      onChoose(choiceId, source) {
        if (destroyed || offers.get(id) !== record || !choices.some((c) => c.id === choiceId && !c.disabled)) return;
        offers.delete(id); host.resolveDecision(id);
        bus.emit('salvageOutfits:choose', {
          meetingId: record.meetingId, offerId: record.offerId, choiceId, source,
        });
      },
    });
    if (accepted === false) offers.delete(id);
    return accepted;
  }

  function radio(payload) {
    if (destroyed || !radioEnabled || !payload?.text) return;
    // Text enters the one-voice arbiter; audio waits for the same entry to actually take the floor.
    // A bounded private map is presentation state, never a saved gameplay latch.
    const id = `salvage-outfits:radio:${payload.id || ++sequence}`;
    if (radios.has(id)) return;
    if (radios.size >= 24) radios.delete(radios.keys().next().value);
    const record = { ...payload, played: false };
    const sectorId = currentState()?.world?.currentSectorId;
    radios.set(id, record);
    const warning = payload.kind === 'warn' || payload.kind === 'warning';
    const message = {
      id, channel: warning ? 'alert' : 'bark', kind: 'encounter', ttl: warning ? 6 : 5,
      text: `${payload.sender || (payload.crewId === 'latch' ? 'Latchkey' : 'Keel Union')}: ${payload.text}`,
      resume: false,
      valid: () => !destroyed && radios.get(id) === record
        && (sectorId == null || currentState()?.world?.currentSectorId === sectorId),
    };
    // The worker owns voiceArbiter. Calling its installed port keeps valid() inside that
    // realm instead of sending a callback through the flat event bridge. The event fallback
    // supports the ordinary same-realm bus and the isolated presentation fixture.
    if (typeof voice?.say === 'function') voice.say(message);
    else bus.emit('voice:say', message);
  }

  function surfaced(payload) {
    const record = radios.get(payload?.id);
    if (!record || record.played) return;
    record.played = true;
    bus.emit('barkDirector:voice', {
      factionId: record.factionId || (record.crewId === 'latch' ? 'faction_free' : 'faction_pitborn'),
      situation: record.kind === 'warn' ? 'warn' : 'patrol-greeting',
      text: record.text, importance: record.kind === 'warn' ? 0.85 : 0.35,
    });
  }

  function clear() {
    for (const id of offers.keys()) currentDeck()?.resolveDecision(id);
    offers.clear(); radios.clear();
  }
  listen(bus, 'salvageOutfits:offer', show, off);
  listen(bus, 'salvageOutfits:offerClosed', hide, off);
  listen(bus, 'salvageOutfits:radio', radio, off);
  listen(bus, 'voice:surface', surfaced, off);
  for (const event of ['sector:exit', 'game:new', 'save:restoring']) listen(bus, event, clear, off);
  return {
    show, hide, radio, clear,
    inspect: () => ({ offers: offers.size, queuedRadio: radios.size }),
    destroy() { if (destroyed) return; clear(); destroyed = true; off.splice(0).forEach((remove) => remove()); },
  };
}

// These defaults are the existing Deckplate ink/lamp/danger tokens. A host with a customized
// theme can pass its resolved token values. Shape and line style convey ownership without color.
const COLORS = Object.freeze({ ink: '#e8e2d4', dim: '#b7b4a6', lamp: '#f2b950', danger: '#ff5038' });
const DASH = Object.freeze([5, 5]), SOLID = Object.freeze([]);

/** A sparse world annotation layer: intent line BEFORE attachment, solid relationship in tow.
 * worldToScreen(point,out) may return out or another point; null/visible:false hides a projection.
 * Host calls draw in its normal frame. No private loop, DOM, controls, pulses, flashes, or shake.
 */
export function createSalvageOutfitsOverlay({ canvas, state, worldToScreen, colors = COLORS,
  pixelRatio = 1 } = {}) {
  if (!canvas?.getContext || typeof worldToScreen !== 'function') throw new TypeError('Outfit overlay needs canvas and projection');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new TypeError('Outfit overlay needs a 2D drawing context');
  const model = createSalvageOutfitsReadModel(), a = { x: 0, y: 0 }, b = { x: 0, y: 0 };
  let blank = true, destroyed = false;
  const ratio = () => Math.max(1, Math.min(3, Number(typeof pixelRatio === 'function' ? pixelRatio() : pixelRatio) || 1));
  function project(pos, out) {
    const p = worldToScreen(pos, out);
    if (!p || p.visible === false || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
    out.x = p.x; out.y = p.y; return true;
  }
  function visible(p) { const r = ratio(); return p.x >= -24 && p.y >= -24
    && p.x <= canvas.width / r + 24 && p.y <= canvas.height / r + 24; }
  function clear() { if (!blank) ctx.clearRect(0, 0, canvas.width, canvas.height); blank = true; }
  function color(id) { return id === 'player' ? colors.lamp : id === 'keel' ? colors.ink : colors.dim; }
  return {
    draw() {
      if (destroyed) return model;
      clear();
      const live = typeof state === 'function' ? state() : state;
      if (live?.mode !== 'flight' || live?.ui?.docked) return model;
      writeSalvageOutfitsReadModel(live, model);
      // Nothing to annotate (the usual case: no salvage meeting in this sector) -> leave the canvas
      // alone. Assigning ctx.font every frame re-resolves the web font and measured ~13% of all
      // main-thread CPU in a Crucible run; the loops below would draw nothing anyway.
      if (model.meetingCount + model.crewCount + model.cargoCount === 0) return model;
      ctx.save(); const r = ratio(); ctx.setTransform?.(r, 0, 0, r, 0, 0);
      ctx.font = '12px "IBM Plex Mono", monospace'; ctx.lineWidth = 2;
      ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      for (let i = 0; i < model.meetingCount; i++) {
        const meeting = model.meetings[i];
        if (meeting.status !== 'working' || !project(meeting.pos, a) || !visible(a)) continue;
        blank = false; ctx.strokeStyle = colors.lamp; ctx.fillStyle = colors.lamp;
        // A fixed receiving apron is a physical destination, not a promised completion cue.
        ctx.beginPath(); ctx.moveTo(a.x - 16, a.y - 11); ctx.lineTo(a.x - 16, a.y + 11);
        ctx.lineTo(a.x - 8, a.y + 11); ctx.moveTo(a.x + 16, a.y - 11);
        ctx.lineTo(a.x + 16, a.y + 11); ctx.lineTo(a.x + 8, a.y + 11); ctx.stroke();
        ctx.fillText('Receiving apron', a.x + 22, a.y - 5);
        ctx.fillText('Bring both ends in slowly', a.x + 22, a.y + 10);
      }
      for (let i = 0; i < model.crewCount; i++) {
        const crew = model.crews[i];
        if (!crew.materialized || !project(crew.pos, a) || !visible(a)) continue;
        blank = false; ctx.strokeStyle = crew.status === 'stalled' ? colors.danger : color(crew.crewId);
        ctx.fillStyle = ctx.strokeStyle;
        // Keel's double bar is the heavy winch; Latchkey's twin chevrons are its quick approach.
        ctx.beginPath();
        if (crew.crewId === 'keel') {
          ctx.moveTo(a.x - 9, a.y - 13); ctx.lineTo(a.x + 9, a.y - 13);
          ctx.moveTo(a.x - 9, a.y - 9); ctx.lineTo(a.x + 9, a.y - 9);
        } else {
          ctx.moveTo(a.x - 8, a.y - 14); ctx.lineTo(a.x, a.y - 8); ctx.lineTo(a.x + 8, a.y - 14);
          ctx.moveTo(a.x - 8, a.y - 19); ctx.lineTo(a.x, a.y - 13); ctx.lineTo(a.x + 8, a.y - 19);
        }
        ctx.stroke();
        ctx.fillText(crew.name, a.x + 13, a.y - 10);
        ctx.fillText(crew.statusText, a.x + 13, a.y + 5);
        if (crew.hasTarget && crew.targetMaterialized && project(crew.targetPos, b) && visible(b)) {
          ctx.globalAlpha = crew.loaded ? 0.9 : 0.48;
          ctx.setLineDash(crew.loaded ? SOLID : DASH);
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          ctx.setLineDash(SOLID); ctx.globalAlpha = 1;
        }
      }
      for (let i = 0; i < model.cargoCount; i++) {
        const cargo = model.cargo[i];
        if (!cargo.materialized || cargo.status !== 'live' || !project(cargo.pos, a) || !visible(a)) continue;
        blank = false; ctx.strokeStyle = color(cargo.claim); ctx.fillStyle = ctx.strokeStyle;
        const r = cargo.selected ? 13 : 10;
        ctx.beginPath(); ctx.moveTo(a.x - r, a.y - r + 5); ctx.lineTo(a.x - r, a.y - r);
        ctx.lineTo(a.x - r + 5, a.y - r); ctx.moveTo(a.x + r - 5, a.y + r);
        ctx.lineTo(a.x + r, a.y + r); ctx.lineTo(a.x + r, a.y + r - 5); ctx.stroke();
        ctx.fillText(cargo.label || 'Salvage', a.x + r + 5, a.y - 5);
        ctx.fillText(cargo.claimLabel, a.x + r + 5, a.y + 10);
      }
      ctx.restore(); return model;
    },
    inspect: () => model,
    destroy() { clear(); destroyed = true; },
  };
}
