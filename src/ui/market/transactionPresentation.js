/** The market renders the economy owner's receipt. A click alone never means a trade succeeded. */
const FAILURES = Object.freeze({
  not_docked: 'Dock before trading.', credits: 'Insufficient credits.', cargo_full: 'Cargo hold full.',
  no_cargo: 'No cargo available to sell.', no_stock: 'This stock has sold out.',
  mission_cargo_locked: 'Sealed contract cargo cannot be sold.', invalid: 'Trade was not completed.',
});
export function matchingTradeReceipt(pending, receipt) {
  return !!(pending && receipt && pending.stationId === receipt.stationId
    && pending.commodityId === receipt.commodityId && pending.side === receipt.side);
}
export function tradeReceiptPresentation(receipt, commodityName) {
  const qty=Number(receipt?.qty), total=Number(receipt?.total);
  if(!receipt || !['buy','sell'].includes(receipt.side) || !Number.isFinite(qty) || qty<=0 || !Number.isFinite(total) || total<0) return null;
  const fmt=v=>Math.round(v).toLocaleString('en-US');
  return { kind:'success', title:receipt.side==='buy'?'Cargo secured':'Cargo transferred',
    text:`${fmt(qty)} u ${commodityName || 'cargo'} · ${receipt.side==='buy'?'−':'+'}${fmt(total)} CR`,
    receiptId:typeof receipt.receiptId==='string'?receipt.receiptId:null };
}
export function tradeFailurePresentation(reason) {
  return {kind:'error',title:'Trade declined',text:FAILURES[reason]||FAILURES.invalid};
}
