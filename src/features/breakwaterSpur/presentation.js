// presentation.js — Breakwater Spur browser adapters. Three leaves, all routed
// through existing owners: the prompt deck (decisions), the toast/voice lanes
// (facts and the dispatcher's lines), authored packaged props (world visuals)
// plus a tiny lamp rig for the staged dead→lit restoration. No new DOM, no new
// keys, no second decision surface.

import {
  BREAKWATER_OWNER, BREAKWATER_SITE_ID, BREAKWATER_CUES, BREAKWATER_PHASE, BREAKWATER_SECTOR_ID,
} from './definition.js';
import { getBreakwaterSpurStatus } from './readModel.js';
import { getPromptDeck } from '../../ui/promptDeck.js';

const PH = BREAKWATER_PHASE;

// ---------------------------------------------------------------------------
// Prompt adapter — registered system 'breakwaterSpurPrompt'. Event-only, HUD
// capability, nodeSafe (deck calls are null-safe headless).
// ---------------------------------------------------------------------------
export function createBreakwaterSpurPromptSystem() {
  return {
    name: 'breakwaterSpurPrompt',

    init(ctx) {
      this.ctx = ctx;
      this.bus = ctx.bus;
      this._activeId = null;
      this._revision = null;
      const bus = this.bus;
      this._subs = [
        bus.on('breakwaterSpur:offer', (p) => this._onOffer(p)),
        bus.on('breakwaterSpur:receipt', (p) => this._onReceipt(p)),
        bus.on('breakwaterSpur:close', () => this._close()),
        bus.on('save:restoring', () => this._close()),
        bus.on('sector:exit', () => this._close()),
        bus.on('game:new', () => this._close()),
      ];
    },

    _deck() {
      try {
        const deck = getPromptDeck();
        return typeof deck?.offerDecision === 'function' ? deck : null;
      } catch { return null; }
    },

    _onOffer(payload) {
      const deck = this._deck();
      if (!deck || !payload) return;
      this._close();
      const id = `breakwater:${payload.kind || 'offer'}`;
      this._activeId = id;
      this._revision = payload.revision || null;
      const actions = (payload.actions || []).slice(0, 9);
      deck.offerDecision({
        id,
        kind: payload.kind === 'failed' ? 'warn' : 'info',
        sender: payload.sender || 'BREAKWATER DISPATCH',
        headline: payload.title || 'Breakwater Spur',
        detail: payload.detail || '',
        choices: actions.map(a => ({ id: a.id, label: a.label })),
        deadlineAt: payload.expiresAt != null ? payload.expiresAt : undefined,
        onChoose: (choiceId, source) => {
          const revision = this._revision;
          this._close();
          this.bus.emit('breakwaterSpur:action', { actionId:choiceId, source, revision });
        },
        onExpire: () => { this._activeId = null; },
      });
    },

    _onReceipt(payload) {
      if (!payload?.text) return;
      this.bus.emit('toast', { text: payload.text, kind: payload.kind || 'info', ttl: 5 });
    },

    _close() {
      const deck = this._deck();
      if (deck && this._activeId) {
        try { deck.resolveDecision(this._activeId); } catch { /* already resolved */ }
      }
      this._activeId = null;
      this._revision = null;
    },

    offer(payload) { this._onOffer(payload); },
    close() { this._close(); },
    newGame() { this._close(); },
    destroy() {
      for (const off of this._subs || []) { try { off && off(); } catch { /* idempotent */ } }
      this._subs = [];
      this._close();
    },
  };
}

// ---------------------------------------------------------------------------
// Audio — one semantic cue channel onto the canonical audio:cue recipe route.
// ---------------------------------------------------------------------------
export function bindBreakwaterSpurAudio(bus, getState) {
  const cueLast = new Map();
  const off = bus.on('breakwaterSpur:cue', (payload) => {
    const cue = payload?.cue;
    const recipe = BREAKWATER_CUES[cue];
    if (!recipe) return;
    const state = getState?.();
    const now = state?.simTime ?? 0;
    const last = cueLast.get(cue) ?? -Infinity;
    if (now - last < 0.5) return;             // cue de-bounce on sim time
    // Range gate: site cues are quiet past the work envelope.
    const pos = payload?.pos;
    const p = state?.player;
    if (pos && p?.pos) {
      const d = Math.hypot(pos.x - p.pos.x, pos.z - p.pos.z);
      if (d > 240) return;
    }
    cueLast.set(cue, now);
    bus.emit('audio:cue', { id: recipe, gain: 1, cueId: `breakwater:${cue}` });
    bus.emit('presentation:caption', { text: captionFor(cue), kind: 'env', ttl: 2.5 });
  });
  return () => { try { off && off(); } catch { /* idempotent */ } };
}

function captionFor(cue) {
  switch (cue) {
    case 'signal': return 'a dead loading frame answers the scan';
    case 'seat': return 'a cartridge seats into its cradle';
    case 'commission': return 'the spur powers up';
    case 'handoff': return 'cargo changes hands';
    case 'depart': return 'a mule clears the berth';
    case 'work': return 'the berth machinery runs';
    default: return '';
  }
}

// ---------------------------------------------------------------------------
// World presentation — lamp rig on the authored structure, staged by the row.
// The structure/cartridge bodies render themselves through packagedPropFile;
// this layer only adds the dead→lit light state and returns diagnostics.
// ---------------------------------------------------------------------------
const _presentations = new WeakMap();

export function createBreakwaterSpurPresentation(ctx) {
  const state = ctx.state;
  const bus = ctx.bus;
  const render = state?.render;
  const scene = render?.scene || ctx.scene || null;
  const THREE_NS = ctx.THREE || render?.THREE || null;
  let group = null;
  let lights = [];
  let disposed = false;

  function mounted() { return !!scene && !!THREE_NS && !disposed; }

  function ensure() {
    if (!mounted() || group) return;
    group = new THREE_NS.Group();
    group.name = 'breakwaterSpur:lamps';
    scene.add(group);
    // One warm work lamp per stage anchor — cheap PointLight + emissive sprite.
    const anchors = lampAnchors();
    for (const a of anchors) {
      const light = new THREE_NS.PointLight(0xffd9a0, 0, 90, 1.8);
      light.position.set(a.x, a.y, a.z);
      const bulb = new THREE_NS.Mesh(
        new THREE_NS.SphereGeometry(0.9, 6, 6),
        new THREE_NS.MeshBasicMaterial({ color: 0xffe2b0 }),
      );
      bulb.position.copy(light.position);
      bulb.visible = false;
      group.add(light); group.add(bulb);
      lights.push({ light, bulb, stage: a.stage });
    }
  }

  function lampAnchors() {
    const site = siteGlobal();
    if (!site) return [];
    return [
      { x: site.x, y: 16, z: site.z + 14, stage: 1 },    // work light tower head
      { x: site.x - 30, y: 9, z: site.z + 4, stage: 1 }, // port arm lamp
      { x: site.x + 30, y: 9, z: site.z + 4, stage: 2 }, // stbd arm lamp
      { x: site.x, y: 7, z: site.z - 38, stage: 3 },     // berth floodlight
    ];
  }

  function siteGlobal() {
    try {
      return _readModel.breakwaterSiteGlobal();
    } catch { return null; }
  }

  function update() {
    if (!mounted()) return;
    const row = _readModel.readBreakwaterSpurPresentation(state);
    const stage = row?.stage ?? 0;
    const on = state?.world?.currentSectorId === BREAKWATER_SECTOR_ID
      && row && row.phase !== PH.DARK && row.phase !== PH.FAILED;
    // Inactive/off-sector lamps must not add lights to every world shader.
    if (!on) { if (group) group.visible = false; return; }
    ensure();
    group.visible = true;
    for (const entry of lights) {
      const lit = on && stage >= entry.stage;
      entry.light.visible = !!lit;
      const intensity = lit ? (stage >= 3 ? 1.35 : 0.9) : 0;
      if (entry.light.intensity !== intensity) entry.light.intensity = intensity;
      const vis = lit;
      if (entry.bulb.visible !== vis) entry.bulb.visible = vis;
    }
  }

  function dispose() {
    disposed = true;
    if (group && scene) {
      for (const entry of lights) {
        group.remove(entry.light); group.remove(entry.bulb);
        entry.bulb.geometry?.dispose?.();
        entry.bulb.material?.dispose?.();
      }
      scene.remove(group);
    }
    lights = []; group = null;
  }

  return { update, dispose, diagnostics: () => ({ lights: lights.length, mounted: mounted() }) };
}

import * as _readModel from './readModel.js';

export function mountBreakwaterSpurPresentation(ctx) {
  const existing = _presentations.get(ctx.state);
  if (existing) return existing;
  const p = createBreakwaterSpurPresentation(ctx);
  const audioOff = bindBreakwaterSpurAudio(ctx.bus, () => ctx.state);
  const owner = {
    update(alpha) { p.update(alpha); },
    diagnostics() { return p.diagnostics(); },
    release() { audioOff(); p.dispose(); },
    destroy() { owner.release(); _presentations.delete(ctx.state); },
  };
  _presentations.set(ctx.state, owner);
  const bus = ctx.bus;
  const offs = [
    bus.on('save:restoring', () => owner.release()),
    bus.on('sector:exit', () => owner.release()),
  ];
  const prevRelease = owner.release;
  owner.release = () => { prevRelease(); for (const off of offs) { try { off(); } catch { /* idempotent */ } } };
  return owner;
}
