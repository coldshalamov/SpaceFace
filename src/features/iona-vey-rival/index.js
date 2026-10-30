import { makeShipEntitySpec } from '../../systems/ships.js';
import { getCombatKernel } from '../../combat/kernel.js';
import { attachmentBindsOccupant } from '../../combat/attachments.js';
import { physicsBodyNativeReady } from '../../core/physicsAuthority.js';
import { createIonaAdapter } from './adapter.js';

export function createIonaVeyRivalSystem() {
  let runtime;
  return {
    name: 'ionaVeyRival',
    init(ctx) {
      runtime?.destroy();
      runtime = createIonaAdapter(ctx, {
        shipSpec: makeShipEntitySpec,
        lineBetween(a, b) {
          if (!physicsBodyNativeReady(a) || !physicsBodyNativeReady(b)
            || ctx.state.entities.get(a.id) !== a || ctx.state.entities.get(b.id) !== b) return null;
          const line = getCombatKernel(ctx).attachments.listForEntity(b.id, true).find(l =>
            l.state === 'active' && ((l.ownerId === a.id && l.targetId === b.id)
              || (l.ownerId === b.id && l.targetId === a.id))
            && attachmentBindsOccupant(l, a.id, a.occupantGeneration)
            && attachmentBindsOccupant(l, b.id, b.occupantGeneration));
          if (!line) return null;
          if (ctx.state.settings?.gameplay?.physicsBackend === 'rapier-dynamic'
            && !ctx.helpers.combatPhysics?.getAttachmentTelemetry?.({ attachmentId: line.id, physicsHandle: line.physicsHandle })) return null;
          return line;
        },
      });
      // Direct service API: central input routing calls action(); no invented bus events.
      ctx.helpers.ionaVeyRival = runtime;
    },
    update() { runtime?.update(); },
    newGame() { runtime?.newGame(); },
    serialize() { return runtime?.serialize(); },
    deserialize(raw) { if (raw != null) runtime.deserialize(raw); },
    destroy() { runtime?.destroy(); runtime = null; },
  };
}
