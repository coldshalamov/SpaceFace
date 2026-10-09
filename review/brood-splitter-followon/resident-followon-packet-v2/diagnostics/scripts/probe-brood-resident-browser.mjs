import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';
const root=resolve('.');
const types={'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.json':'application/json','.wasm':'application/wasm','.glb':'model/gltf-binary','.png':'image/png'};
const server=createServer(async(req,res)=>{try{const pathname=new URL(req.url,'http://localhost').pathname;const file=resolve(root,'.'+(pathname==='/'?'/browser-proof/index.html':pathname));if(!file.startsWith(root+'/'))throw new Error('outside root');const bytes=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream'});res.end(bytes);}catch{res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
const out=resolve('evidence');await mkdir(out,{recursive:true});
try{
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:768,height:548}});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'load',timeout:20000});
 await page.waitForFunction(()=>window.proofReady||window.proofError,{timeout:45000});
 const init=await page.evaluate(()=>({ready:window.proofReady,error:window.proofError}));if(init.error)throw new Error(JSON.stringify(init.error));
 await page.screenshot({path:resolve(out,'resident-before.png')});
 const result=await page.evaluate(()=>window.takeSplitFrame());
 await page.screenshot({path:resolve(out,'resident-first-child-frame.png')});
 result.browserErrors=errors;await writeFile(resolve(out,'resident-browser-result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}catch(error){await writeFile(resolve(out,'resident-browser-failure.json'),JSON.stringify({message:error.message,stack:error.stack},null,2)+'\n');console.error(error);process.exitCode=1;}
finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
