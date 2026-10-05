// The KTX2Loader class is replaced for the Node CPU fixture (parse, support detection, worker pool). No source/admission/package code is replaced.
export function resolve(specifier,context,nextResolve){
 if(specifier==='three/addons/loaders/KTX2Loader.js')return {url:new URL('./cpu-ktx2-loader.mjs',import.meta.url).href,shortCircuit:true};
 return nextResolve(specifier,context);
}
