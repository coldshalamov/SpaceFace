// Reviewed exception to the common 14-bit POSITION grid: the Second Measure
// shell has native clear-volume boundaries exactly on authored vertex planes.
// Lossless meshopt compression is retained; texture/normal/UV policies are unchanged.
import { EXTMeshoptCompression } from '@gltf-transform/extensions';
import { meshopt, quantize, reorder } from '@gltf-transform/functions';
import { RELEASE_MESHOPT_OPTIONS } from './releaseMeshoptProfile.mjs';

export function strictClearancePrecisionPolicy(assetId, certificate) {
  if (assetId !== 'place_ceres_second_measure') return 'standard';
  const expectedPassages = [{id:'aft',x:[-112,-48],z:[-70,70]},{id:'fore',x:[48,112],z:[-70,70]}];
  const expectedExits = [{x:[-112,-48],z:[-200,200]},{x:[48,112],z:[-200,200]},{x:[-35,35],z:[60,200]}];
  if (certificate?.schema !== 'spaceface.ceresSecondMeasure.v1' || certificate.part !== 'shell'
    || certificate.sourceScale !== 2 || !/^[a-f0-9]{64}$/.test(certificate.sourceSha256 || '')
    || certificate.collision?.neverUseConvexHull !== true
    || JSON.stringify(certificate.collision.passages) !== JSON.stringify(expectedPassages)
    || JSON.stringify(certificate.collision.clearExitRaysWU) !== JSON.stringify(expectedExits)) {
    throw new Error('Second Measure lossless POSITION policy requires its reviewed strict-clearance certificate');
  }
  return 'lossless-position';
}

export function releasePlaceGeometryCompression({ assetId, certificate, encoder }) {
  if (strictClearancePrecisionPolicy(assetId, certificate) === 'standard') {
    return meshopt({ encoder, ...RELEASE_MESHOPT_OPTIONS });
  }
  // Equivalent to meshopt(level: high), except POSITION and morph POSITION keep
  // their original Float32 values. Merely raising bit depth cannot promise that
  // a boundary at X=35 will not round into the open keel passage.
  return async document => {
    await document.transform(reorder({ encoder, target: 'size' }), quantize({
      ...RELEASE_MESHOPT_OPTIONS,
      pattern: /^(TEXCOORD|JOINTS|WEIGHTS|COLOR)(_\d+)?$/,
      patternTargets: /^(TEXCOORD|JOINTS|WEIGHTS|COLOR|NORMAL|TANGENT)(_\d+)?$/,
      quantizeNormal: Math.min(RELEASE_MESHOPT_OPTIONS.quantizeNormal, 8),
    }));
    document.createExtension(EXTMeshoptCompression).setRequired(true)
      .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
  };
}
