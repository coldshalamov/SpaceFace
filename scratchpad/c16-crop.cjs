const sharp = require('C:/Users/93rob/Documents/GitHub/SpaceFace/node_modules/sharp');
const V = 'C:/Users/93rob/Documents/GitHub/SpaceFace/.devshots/ui-review/view/';
const O = 'C:/Users/93rob/Documents/GitHub/SpaceFace/.devshots/ui-review/crops/';
const jobs = [
  ['c16-arr1920.png', 'c16-arc-arr.png', 1000, 340, 260, 480, 2],
  ['c16-focus1920.png', 'c16-arc-focus.png', 1000, 340, 260, 480, 2],
  ['c16-arr1920.png', 'c16-dialcur-arr.png', 1015, 560, 100, 90, 4],
  ['c16-focus1920.png', 'c16-dialcur-focus.png', 1030, 660, 100, 90, 4],
  ['c16-focus1920.png', 'c16-replylist.png', 595, 475, 320, 160, 2],
  ['c16-focus1920.png', 'c16-replyspine.png', 630, 470, 45, 165, 4],
  ['c16-arr1920.png', 'c16-ladder.png', 15, 340, 50, 140, 5],
  ['c16-arr1280.png', 'c16-leads1280.png', 40, 445, 420, 140, 2],
  ['c16-focus1920.png', 'c16-tick2.png', 1020, 680, 90, 60, 5],
  ['c16-arr1920.png', 'c16-dialtick1.png', 1010, 590, 60, 40, 6],
];
(async () => {
  for (const [src, out, left, top, width, height, k] of jobs) {
    await sharp(V + src).extract({ left, top, width, height })
      .resize(width * k, height * k, { kernel: 'nearest' }).png().toFile(O + out);
    console.log('wrote', out);
  }
})();
