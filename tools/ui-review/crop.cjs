const sharp = require('C:/Users/93rob/Documents/GitHub/SpaceFace/node_modules/sharp');
const R = 'C:/Users/93rob/Documents/GitHub/SpaceFace/.devshots/ui-bench/';
const O = 'C:/Users/93rob/AppData/Local/Temp/claude/C--Users-93rob-Documents-GitHub-SpaceFace/c2949bf0-fb5d-477c-95b8-4ec53b50300d/scratchpad/crops/';
const jobs = [
  ['station-contracts.png', 'a-orrery-top.png', 1480, 300, 260, 150, 4],
  ['station-contracts.png', 'a-foot-rail.png', 20, 980, 140, 90, 5],
  ['station-contracts.png', 'a-featured.png', 50, 390, 410, 45, 3],
  ['station-contracts.png', 'a-dest.png', 1600, 555, 60, 45, 8],
  ['1280/station-contracts.png', 'b-collide.png', 910, 355, 210, 30, 5],
  ['1280/station-contracts.png', 'b-scalelabels.png', 495, 405, 240, 45, 5],
  ['states/contracts-focus-1920.png', 'f-dash.png', 25, 352, 50, 24, 10],
  ['station-contracts.png', 'a-rail.png', 28, 250, 24, 120, 6],
  ['states/contracts-hold-1920.png', 'h-ring.png', 670, 885, 75, 80, 8],
  ['station-contracts.png', 'a-tracked.png', 360, 655, 110, 30, 6],
];
(async () => {
  for (const [src, out, left, top, width, height, k] of jobs) {
    await sharp(R + src).extract({ left, top, width, height }).resize(width * k, height * k, { kernel: 'nearest' }).png().toFile(O + out);
    console.log('wrote', out);
  }
})();
