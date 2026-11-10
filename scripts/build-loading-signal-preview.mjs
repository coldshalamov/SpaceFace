// Bundle only our own source, verbatim, into a file://-friendly live witness.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const html=await readFile(new URL('scripts/loading-signal-tableaux-proof.html',root),'utf8');
let engine=await readFile(new URL('src/ui/loadingTerminalArt.js',root),'utf8');
engine=engine.replace(/^import .*;\s*$/mg,'').replace(/^export\s+(?=function)/mg,'').replace(/^export \{[^\n]+\};?\s*$/mg,'');
const source=(await readFile(new URL('src/ui/loadingSignalTableaux.js',root),'utf8')).replace(/^export\s+(?=function)/mg,'');
const lab=(await readFile(new URL('scripts/loading-signal-tableaux-proof.mjs',root),'utf8')).replace(/^import .*;\s*$/mg,'');
const script=`${source}\n${engine}\nconst createIntro2DEngine=createEngine,createIntroGLEngine=createEngineGL,INTRO_GL_SOURCES=GL_SOURCES;\n${lab}`.replace(/<\/script/gi,'<\\/script');
const output=html.replace('<script type="module" src="./loading-signal-tableaux-proof.mjs"></script>',`<script>\n${script}\n</script>`);
await mkdir(new URL('preview/',root),{recursive:true});await writeFile(new URL('preview/OPEN-ME.html',root),output);
console.log('Generated live offline preview from the production files.');
