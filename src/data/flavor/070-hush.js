import { defineFlavorPack } from './catalog.js';

export const flavorOrder = 70;
export const flavorId = 'hush';
export const flavorKind = 'scanner_absence';

export default defineFlavorPack({
  id: flavorId,
  kind: flavorKind,
  description: 'Scanner copy for a world whose missing signal is the signal.',
  entries: [
    { id: 'hush_passive_01', phase: 'passive', signalKind: 'absence', text: 'Expected planetary return: absent.' },
    { id: 'hush_passive_02', phase: 'passive', signalKind: 'absence', text: 'No carrier. No leakage. No weather noise.' },
    { id: 'hush_focused_01', phase: 'focused', signalKind: 'absence', text: 'City grid visible. Power signature absent.' },
    { id: 'hush_focused_02', phase: 'focused', signalKind: 'absence', text: 'Cloud pattern unchanged across the scan interval.' },
    { id: 'hush_focused_03', phase: 'focused', signalKind: 'absence', text: 'No orbital carrier. Dark satellites mark where the constellation was.' },
    { id: 'hush_focused_04', phase: 'focused', signalKind: 'absence', text: 'Every transmitter stopped inside the same sample.' },
    { id: 'hush_focused_05', phase: 'focused', signalKind: 'absence', text: 'Population return indeterminate. The silence is total.' },
    { id: 'hush_repeat_01', phase: 'repeat', signalKind: 'absence', text: 'Scanner gain rises. The absence holds.' },
    { id: 'hush_repeat_02', phase: 'repeat', signalKind: 'absence', text: 'Ambient RF remains absent across the planetary disc.' },
    { id: 'hush_repeat_03', phase: 'repeat', signalKind: 'absence', text: 'A world occupies the image, not the receiver.' },
    { id: 'hush_complete_01', phase: 'complete', signalKind: 'absence', text: 'Scan complete. Nothing answered.' },
    { id: 'hush_exit_01', phase: 'exit', signalKind: 'absence', text: 'Background noise returns only after the planet leaves scope.' },
  ],
});
