// Cut counts goods; this never identifies recipients or claims clinical outcomes.
// The shared readout is immutable across PR531/532, not another receipt owner.
import {clinicFreightReadout} from './clinicFreightReadout.js';
import {COMMODITIES} from './commodities.js';
const CUT='station_hyperion_cut', SECTOR='sector_hyperion_cut';
const number=n=>new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(n);
export function clinicReceivingBroadcast(state, station) {
  const data=station?.data;
  if (!station || state?.entities?.get?.(station.id)!==station || station.alive===false || station?.type!=='station' || data?.dockless===true
    || data?.stationId!==CUT || data?.factionId!=='faction_dmc' || data?.stationTypeId!=='refinery'
    || state?.world?.currentSectorId!==SECTOR) return null;
  const fact=clinicFreightReadout(state);
  if (fact.status!=='verified' || fact.stationId!==CUT) return null;
  const commodity=COMMODITIES.find(c=>c.id===fact.commodityId)?.name;
  if (!commodity) return null;
  const stock=Object.hasOwn(fact,'stock')?fact.stock:null;
  const count=stock===null?'Current market count unavailable.'
    :`Market count: ${number(stock)}. `+(stock===0
      ?'Do not send a carrier for stock we do not have.'
      :'Count it before you promise it.');
  return {id:'clinic:intake:'+JSON.stringify([fact.missionId,CUT,fact.commodityId,fact.acceptedQty,stock]),
    text:`Cut intake: Nyx shipment accepted, ${number(fact.acceptedQty)} ${fact.acceptedQty===1?'unit':'units'} of ${commodity}. ${count}`};
}
