const TENDER_VISUAL = Object.freeze({
  file: 'wholeships/repair_tender.glb',
  assetId: 'SF_WHOLESHIP_REPAIR_TENDER',
  roleId: 'personal_salvage_tender',
  required: true,
});

/** Stable render identity for the authored tender hull; this reader never consults game systems. */
export function salvageTenderWholeShipVisual(entity) {
  return entity?.type === 'ship'
    && entity.data?.persistenceOwner === 'salvageTender'
    && entity.data?.salvageTenderBody === 'tender' ? TENDER_VISUAL : null;
}

export function salvageTenderRequiresAuthoredHull(entity) {
  return salvageTenderWholeShipVisual(entity) !== null;
}
