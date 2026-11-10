import { buildRenderPackagePilots } from './build-render-package-pilots.mjs';

buildRenderPackagePilots({ check: true }).then((bindings) => {
  console.log(`render-package-pilots: fresh ${bindings.length} production packages`);
}).catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
