// src/systems/crafting.js – Manufacturing system for the builder profession (Phase 7).
//
// Turns raw ore into refined materials, modules, and whole ships per src/data/blueprints.js. This is
// the loop that makes mining matter beyond selling: a miner-among-builders refines bulk ore into
// stock, assembles it into parts, augments their favourite modules up tiers, and ultimately
// manufactures ships from materials — the "build an empire" fantasy.
//
// The system is reactive (no per-frame update): the UI calls canBuild() / build() and this consumes
// materials from cargo, grants the product (cargo commodity / module inventory / owned ship), and
// emits events for audio + toast feedback. Tech gating uses the player's researchedNodes.
import { BLUEPRINTS, BLUEPRINT_BY_ID } from '../data/blueprints.js';
import { addCargo, removeCargo } from './cargo.js';

export const crafting = {
  name: 'crafting',
  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.ctx = ctx;
    // expose helpers for the UI to call without reaching through ctx
    ctx.crafting = this;
  },

  // Lazy refs to sibling systems (they init before crafting via registry order). Using getters keeps
  // us robust if init order ever shifts.
  get _ships() { return this.ctx.registry.get('ships'); },

  // No per-frame work: crafting is purely UI-driven. (Kept in the registry for ctx + sibling access.)
  update() {},

  /** All blueprints buildable at a given station type, with availability precomputed for the UI. */
  listFor(stationType) {
    const p = this.state.player;
    return BLUEPRINTS
      .filter((b) => b.stationType === stationType || stationType == null)
      .map((b) => ({ bp: b, ...this.status(b, p) }));
  },

  /** Per-blueprint availability: tech unlocked? materials present? source module owned (augment)? */
  status(bp, p) {
    p = p || this.state.player;
    const techOk = !bp.requiresTech || p.researchedNodes.includes(bp.requiresTech);
    const mats = this.haveMaterials(bp, p);
    const matsOk = mats.every((m) => m.have >= m.need);
    let sourceOk = true;
    if (bp.category === 'augment' && bp.fromModule) {
      // need at least one instance of the source module in inventory OR currently fitted
      sourceOk = this.countOwnedModule(p, bp.fromModule) > 0;
    }
    return { techOk, matsOk, sourceOk, canBuild: techOk && matsOk && sourceOk, materials: mats };
  },

  /** Material breakdown with have/need for display + gating. */
  haveMaterials(bp, p) {
    p = p || this.state.player;
    const items = p.cargo.items || {};
    return Object.keys(bp.inputs).map((id) => ({ id, need: bp.inputs[id], have: items[id] || 0 }));
  },

  /** Consume inputs + grant the output. Returns true on success (emits its own toasts on failure). */
  build(bpId) {
    const bp = BLUEPRINT_BY_ID.get(bpId);
    if (!bp) return false;
    const p = this.state.player;
    const st = this.status(bp, p);
    if (!st.techOk) {
      this.bus.emit('toast', { text: 'Research required: ' + (bp.requiresTech || 'unknown'), kind: 'error', ttl: 3 });
      return false;
    }
    if (bp.category === 'augment' && !st.sourceOk) {
      this.bus.emit('toast', { text: 'Need a ' + bp.fromModule + ' to augment', kind: 'error', ttl: 3 });
      return false;
    }
    if (!st.matsOk) {
      this.bus.emit('toast', { text: 'Not enough materials', kind: 'error', ttl: 3 });
      return false;
    }

    // 1) consume input materials from cargo
    for (const id in bp.inputs) {
      removeCargo(this.state, id, bp.inputs[id]);
    }
    // 2) for augments, consume one instance of the source module (prefer unfitted inventory)
    if (bp.category === 'augment' && bp.fromModule) {
      this.consumeOneModule(p, bp.fromModule);
    }

    // 3) grant the product
    const ships = this._ships;
    const out = bp.outputs;
    let grantMsg = '';
    if (out.kind === 'commodity') {
      addCargo(this.state, out.id, out.qty);
      grantMsg = '+' + out.qty + ' ' + out.id;
    } else if (out.kind === 'module' || out.kind === 'weapon') {
      for (let i = 0; i < (out.qty || 1); i++) {
        p.moduleInventory.push({ instanceId: ships.nextInstanceId(), defId: out.id });
      }
      grantMsg = '+' + (out.qty || 1) + ' ' + out.id;
    } else if (out.kind === 'ship') {
      ships.acquireShip(out.id, /*setActive*/ false);
      grantMsg = 'Ship: ' + out.id;
    }

    this.bus.emit('craft:complete', { bpId, productId: out.id, kind: out.kind, qty: out.qty });
    this.bus.emit('audio:cue', { id: 'confirm' });
    this.bus.emit('toast', { text: 'Manufactured: ' + bp.name, kind: 'info', ttl: 2.5 });
    return true;
  },

  /** Count instances of a module def in inventory + currently fitted across owned ships. */
  countOwnedModule(p, defId) {
    let n = 0;
    for (const m of (p.moduleInventory || [])) if (m.defId === defId) n++;
    for (const s of (p.ownedShips || [])) for (const fid of (s.fittings || [])) if (fid === defId) n++;
    return n;
  },

  /** Remove one instance of a module def: prefer loose inventory, else unfits it from a ship. */
  consumeOneModule(p, defId) {
    const inv = p.moduleInventory || [];
    const idx = inv.findIndex((m) => m.defId === defId);
    if (idx >= 0) { inv.splice(idx, 1); return; }
    // not in inventory — unfit from the first owned ship that has it fitted
    for (let si = 0; si < (p.ownedShips || []).length; si++) {
      const s = p.ownedShips[si];
      const slot = (s.fittings || []).indexOf(defId);
      if (slot >= 0) { s.fittings[slot] = null; this._ships.recomputeIfActive(si, s.fittings); return; }
    }
  },
};
