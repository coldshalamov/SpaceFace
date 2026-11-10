// src/data/mop.js — MOP / CL-5, the clean-up drone that erases evidence (W-SHIFT row 506,
// 03 §4.3). Nyx March is a quiet frontier march; its clean-up drone sweeps the sector for
// unmarked wreck hulls and tidies them — physically removing the evidence of every fight
// before anyone asks questions. The play is a race: it starts at the march station and
// travels, so the wreck you want is the wreck you reach first. It is Quiet by canon — no
// broadcasts, no warnings; it only speaks when it tidies something you were standing on.
export const MOP = Object.freeze({
  sectorId: 'sector_nyx_march',
  // The drone posts up off the Nyx March station berth (station anchor -880,540).
  post: Object.freeze({ x: -820, z: 480 }),
  leashRadius: 80,
  sweepSpeed: 70,
  consumeRadius: 35,
  // It only remarks on a tidy when the client is standing close enough to notice the loss.
  noticeRadius: 400,
  tidyFlag: 'mop_tidied',
  sender: 'MOP / CL-5',
  callsign: 'CL-5',
  tidyLine: 'Tidy. Nothing happened here.',
});
