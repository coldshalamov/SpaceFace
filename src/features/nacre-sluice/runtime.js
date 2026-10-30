import { queuePhysicsImpulse, physicsBodyNativeReady } from '../../core/physicsAuthority.js';
import { getCombatKernel } from '../../combat/kernel.js';
import { refreshEntityPhysicsIndex } from '../../core/coreSystem.js';
import { refreshPhysicsPartition, requestActivityReclassify } from '../../world/activityRuntime.js';
import { createAdapter } from './adapter.mjs';
/** Construct one instance per authoritative state. Central registration is controller-owned. */
export function createNacreSluice(ctx) {
  if(typeof ctx.helpers?.queryRadius!=='function') throw new TypeError('Nacre requires canonical spatial query');
  return createAdapter(ctx,{
    impulse:queuePhysicsImpulse,
    attachments:()=>getCombatKernel(ctx).attachments,
    nativeReady(e){
      if(!physicsBodyNativeReady(e)) return false;
      if(ctx.state.settings?.gameplay?.physicsBackend!=='rapier-dynamic') return false;
      const host=ctx.registry?.get?.('physics'),row=host?._sg02?.records?.get(e.id);
      return !!row?.body && row.entity===e && !host._nativeRestorePending && !host._nativeRestoreDeferred;
    },
    refresh(e){if(refreshEntityPhysicsIndex(ctx.state,e,e.occupantGeneration)) {
      refreshPhysicsPartition(e);requestActivityReclassify(ctx.state,e);
    }},
  });
}
