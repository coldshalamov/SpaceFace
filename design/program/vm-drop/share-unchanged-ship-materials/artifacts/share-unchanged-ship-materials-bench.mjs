// Re-run after applying the package patch on a checkout that can import partsLibrary.
import { writeFileSync } from 'node:fs';
import {
  runFlightInstanceMaterialShareAb,
  runFlightInstanceMaterialShareBench,
} from '../../../../src/render/partsLibrary.js';

if (!globalThis.document) {
  const context = {
    createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4), width, height }),
    putImageData() {}, fillRect() {}, strokeRect() {}, clearRect() {}, drawImage() {},
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, setTransform() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, rect() {}, fill() {}, stroke() {},
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
  };
  globalThis.document = { createElement: () => ({ width: 256, height: 256, getContext: () => context }) };
}

const ab = runFlightInstanceMaterialShareAb({ copies: 48, rounds: 11 });
const census = runFlightInstanceMaterialShareBench({ copies: 48, panelCount: 48 });
const out = { ab, census };
writeFileSync(new URL('./share-unchanged-ship-materials-bench.json', import.meta.url), `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify(out, null, 2));
