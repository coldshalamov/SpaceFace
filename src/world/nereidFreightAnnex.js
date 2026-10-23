// Earned Nereid structure, projected into the existing world dressing owner.
// Claims owns the sole durable receipt. These fixed, non-destructible scenery rows have
// no hull, combat identity or world-record tombstone; they are rebuilt like other dressing.
import { SECTORS } from '../data/sectors.js';
import { sectorGlobalOrigin } from '../data/sectorCoordinates.js';
import { modelTruthPlanarRadius } from '../data/modelTruth.js';
import { solidDressingPlanFor } from './solidDressing.js';
import { dropDressingRow } from './dressingTable.js';

export const NEREID_ANNEX = Object.freeze({
  sectorId: 'sector_nereid_shoal', stationId: 'station_nereid',
  moduleId: 'growth_bonded_annex', receiptId: 'station-growth:station_nereid:growth_bonded_annex',
  stationLocal: Object.freeze({ x: 960, z: -380 }), apronRadius: 165, margin: 12,
  parts: Object.freeze([
    Object.freeze({ id: 'platform', placeId: 'place_freight_platform', x: 1048, z: -160, rot: 0, radius: 28 }),
    Object.freeze({ id: 'rack', placeId: 'place_container_rack', x: 1098, z: -180, rot: 0, radius: 16 }),
  ]),
});
const finitePos = p => p && Number.isFinite(p.x) && Number.isFinite(p.z);
const distance = (a,b) => Math.hypot(a.x-b.x,a.z-b.z);
const owned = row => row?.data?.nereidFreightAnnex?.receiptId === NEREID_ANNEX.receiptId;
function segmentDistance(p,a,b) {
  const dx=b.x-a.x,dz=b.z-a.z,d=dx*dx+dz*dz;
  const t=d>0?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/d)):0;
  return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);
}

/** Fixed authored geometry; no random relocation and no inferred earnings from a rung number. */
export function nereidAnnexLayout(rec, station, sector) {
  if (!rec || rec.stationId !== NEREID_ANNEX.stationId || rec.sectorId !== NEREID_ANNEX.sectorId
    || !Array.isArray(rec.modules) || !rec.modules.some(m => m?.id === NEREID_ANNEX.moduleId
      && m.receiptId === NEREID_ANNEX.receiptId) || sector?.id !== NEREID_ANNEX.sectorId
    || station?.alive === false || station?.data?.stationId !== NEREID_ANNEX.stationId || !finitePos(station.pos)) return null;
  const origin=sectorGlobalOrigin(sector.id);
  if (!finitePos(origin) || distance(station.pos,{x:origin.x+960,z:origin.z-380})>0.01) return null;
  return NEREID_ANNEX.parts.map(part=>{
    const solid=solidDressingPlanFor(part.placeId,{radius:part.radius});
    return solid ? {...part,pos:{x:origin.x+part.x,z:origin.z+part.z},solid} : null;
  }).filter(Boolean);
}

/** Called only by the existing claims stamp/restore/entry seam, never a new update loop. */
export function reconcileNereidFreightAnnex(ctx, rec, station) {
  const state=ctx?.state,world=ctx?.registry?.get?.('world'),active=state?.world?.activeSector;
  if (!world || typeof world._spawnPlaceProp!=='function' || state.world.currentSectorId!==NEREID_ANNEX.sectorId
    || !active?.stations?.some(s=>s.id===station?.id && s.stationId===NEREID_ANNEX.stationId)) return false;
  const definition=SECTORS.find(s=>s.id===NEREID_ANNEX.sectorId);
  // The caller passes the live claims-owned record, never a synthetic growth notification.
  if(rec!==state.claims?.stationGrowth?.[NEREID_ANNEX.stationId])return false;
  const layout=nereidAnnexLayout(rec,station,definition);
  const rows=state.world.dressing?.rows||[];
  if(!layout || layout.length!==NEREID_ANNEX.parts.length){
    // Same-sector Continue may retain scenery while restoring an older, unearned ledger.
    // Remove only this non-destructible projection; no world tombstone is being undone.
    for(const row of rows.slice())if(owned(row)&&row.homeSectorId===NEREID_ANNEX.sectorId){
      dropDressingRow(state,row.id);active.dressing=active.dressing.filter(d=>d.id!==row.id);
    }
    return false;
  }
  const existing=rows.filter(r=>r.alive!==false&&owned(r));
  // Never adopt a foreign object or silently move an existing physical body.
  if (existing.some(r=>!layout.some(p=>p.id===r.data.nereidFreightAnnex.partId&&p.placeId===r.data.placeId
    && distance(p.pos,r.pos)<0.01&&r.homeSectorId===NEREID_ANNEX.sectorId))) return false;
  if (new Set(existing.map(r=>r.data.nereidFreightAnnex.partId)).size!==existing.length) return false;
  if(existing.length===layout.length)return true;
  const missing=layout.filter(p=>!existing.some(r=>r.data.nereidFreightAnnex.partId===p.id));
  const obstacles=[...(state.entityList||[]),...rows];
  for(const p of missing){
    const clearance=p.solid.silhouetteWu+NEREID_ANNEX.margin;
    if(distance(p.pos,station.pos)<Math.max(NEREID_ANNEX.apronRadius,Number(station.data.dockRadius)||0)+clearance)return false;
    const angle=Number(station.data.corridorBearingDeg)*Math.PI/180;
    if(!Number.isFinite(angle))return false;
    const mouth={x:station.pos.x+Math.cos(angle)*500,z:station.pos.z+Math.sin(angle)*500};
    if(segmentDistance(p.pos,station.pos,mouth)<72+clearance)return false;
    for(const body of obstacles){
      if(body?.alive===false||body?.collides!==true||!finitePos(body.pos)||owned(body))continue;
      if(distance(body.pos,p.pos)<Math.max(Number(body.radius)||0,modelTruthPlanarRadius(body))+clearance)return false;
    }
  }
  const spawned=[];
  for(const p of missing){
    const row=world._spawnPlaceProp(active,definition,p.placeId,p.pos,{rot:p.rot,radius:p.radius,
      name:`Nereid Bonded Freight Annex · ${p.id}`,everydaySpaceKit:true});
    if(!row){
      for(const r of spawned){dropDressingRow(state,r.id);active.dressing=active.dressing.filter(d=>d.id!==r.id);}
      return false;
    }
    row.data.nereidFreightAnnex={receiptId:NEREID_ANNEX.receiptId,partId:p.id};
    spawned.push(row);
  }
  return true;
}
