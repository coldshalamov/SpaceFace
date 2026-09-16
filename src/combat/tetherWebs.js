// Snarl projectiles stitch enemy hulls into short physical chains. The attachment service owns
// sockets, spring forces, breakage and rendering receipts; this owner only chooses endpoints.
export const WEB_WEAPON_ID = 'wpn_snarl_s';
export const WEB_DEF_ID = 'attachment_snarl';
export const WEB_LIMITS = Object.freeze({ reach: 120, linksPerHit: 3, activeLinks: 12, lifetimeS: 9 });
const WEB_REACH2 = WEB_LIMITS.reach * WEB_LIMITS.reach;

export function createTetherWebs({ state, bus, registry }) {
  const pending = [];
  const links = new Map();
  const authority = () => registry?.get('actions')?.kernel?.attachments
    || registry?.get('combat')?.kernel?.attachments;
  const clear = () => {
    const service = authority();
    // Restored attachment records must not become permanent webs after their transient timer
    // ledger is gone. Save/load releases this temporary weapon effect through its real owner.
    for (const attachment of Object.values(state.combat?.attachments?.byId || {})) {
      if (attachment.defId === WEB_DEF_ID && attachment.state === 'active') {
        service?.cut(attachment.id, attachment.controllerId ?? attachment.ownerId, 'web_released');
      }
    }
    links.clear();
    pending.length = 0;
  };
  const unsubs = [];
  if (bus?.on) {
    unsubs.push(bus.on('projectile:hit', hit => {
      if (hit?.weaponId !== WEB_WEAPON_ID || pending.length >= WEB_LIMITS.linksPerHit) return;
      const target = state.entities.get(hit.targetId);
      const owner = state.entities.get(hit.ownerId);
      if (target && owner && !pending.some(p => p.target === target)) pending.push({ target, owner });
    }));
    for (const event of ['game:new', 'sector:exit', 'run:ended', 'save:loaded']) {
      unsubs.push(bus.on(event, clear));
    }
  }
  return {
    clear,
    destroy() { clear(); for (const off of unsubs) off(); },
    update() {
      const service = authority();
      if (!service) { pending.length = 0; return; }
      const now = state.simTime || 0;
      for (const [id, record] of links) {
        const attachment = service.get(id);
        if (!attachment || attachment.state !== 'active') { links.delete(id); continue; }
        if (now >= record.until) {
          service.cut(id, record.controllerId, 'web_expired');
          links.delete(id);
        }
      }
      for (const { target, owner } of pending) {
        if (!owner.alive || !target.alive || state.entities.get(target.id) !== target) continue;
        if (!['ship', 'drone'].includes(target.type) || target.team === owner.team) continue;
        // Score each candidate's distance once: the old filter+sort chain paid a hypot per
        // entity plus two more per sort comparison. Order stays nearest-first, id tiebreak.
        const scored = [];
        for (const e of state.entityList) {
          if (!e || !e.alive || e === target || e === owner) continue;
          if (e.type !== 'ship' && e.type !== 'drone') continue;
          if (e.team === owner.team) continue;
          const dx = e.pos.x - target.pos.x;
          const dz = e.pos.z - target.pos.z;
          const d2 = dx * dx + dz * dz;
          if (d2 > WEB_REACH2) continue;
          scored.push({ e, d2 });
        }
        scored.sort((a, b) => (a.d2 - b.d2) || (a.e.id - b.e.id));
        let source = target;
        let created = 0;
        for (const { e: next } of scored) {
          if (created >= WEB_LIMITS.linksPerHit || links.size >= WEB_LIMITS.activeLinks) break;
          const pairExists = [...links.keys()].some(id => {
            const a = service.get(id);
            return a && ((a.ownerId === source.id && a.targetId === next.id)
              || (a.ownerId === next.id && a.targetId === source.id));
          });
          if (pairExists) { source = next; continue; }
          const result = service.create({ defId: WEB_DEF_ID, ownerId: source.id, targetId: next.id,
            controllerId: owner.id, controlMode: 'snarl', sourceWorld: source.pos, targetWorld: next.pos });
          if (!result?.ok) continue;
          links.set(result.attachment.id, { controllerId: owner.id, until: now + WEB_LIMITS.lifetimeS });
          // A slight take-up makes the catch visible. This changes real spring rest length;
          // thrust, momentum, collisions and mass still determine where the linked hulls go.
          service.reel(result.attachment.id, -result.attachment.restLength * 0.16,
            (source.radius || 0) + (next.radius || 0) + 5);
          source = next;
          created++;
        }
        if (created) bus.emit('web:linked', { ownerId: owner.id, targetId: target.id, links: created });
      }
      pending.length = 0;
    },
  };
}
