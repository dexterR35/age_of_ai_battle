import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Arena,emptyStore,safeEqual} from './arena.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const runtime=process.env.DATA_DIR||path.join(root,'runtime');
await fs.mkdir(runtime,{recursive:true});
const filename=path.join(runtime,'arena.json');
let data;try{data=JSON.parse(await fs.readFile(filename,'utf8'));}catch(e){if(e.code!=='ENOENT')throw Error('Saved state is unreadable; refusing to overwrite it');data=emptyStore();}
const host=process.env.HOST||'127.0.0.1',port=Number(process.env.PORT||8787);
const token=process.env.BATTLE_ADMIN_TOKEN||'';
if(host!=='127.0.0.1'&&(!token||token.length<24))throw Error('Cloud hosting requires BATTLE_ADMIN_TOKEN (24+ characters)');
const arena=new Arena(data,process.env.KEY_ENCRYPTION_SECRET||'');
let chain=Promise.resolve();
const serial=fn=>{const next=chain.then(fn);chain=next.catch(e=>console.error('Arena operation failed:',e.message));return next;};
async function persist(){await fs.writeFile(filename+'.tmp',JSON.stringify(arena.data));await fs.rename(filename+'.tmp',filename);}
arena.checkpoint=persist;
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{
  try{
    if(req.url.startsWith('/api/')){
      const requiresAuth=req.method!=='GET';
      if(requiresAuth&&token&&!safeEqual(req.headers['x-admin-key'],token)){res.writeHead(401,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Enter the runner admin token in Connection settings.'}));return;}
      const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>65536){res.writeHead(413);res.end();return;}chunks.push(c);}
      const request=new Request(`http://localhost:${port}${req.url}`,{method:req.method,headers:req.headers,...(req.method!=='GET'?{body:Buffer.concat(chunks)}:{})});
      const result=requiresAuth?await serial(async()=>{const r=await arena.api(request);await persist();return r;}):await arena.api(request);
      res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));return;
    }
    const pathname=new URL(req.url,'http://localhost').pathname;
    const staticRoot=path.join(root,'dist/client');
    const filepath=path.join(staticRoot,pathname==='/'?'index.html':decodeURIComponent(pathname));
    const resolved=path.resolve(filepath);
    if(!resolved.startsWith(staticRoot+path.sep)){res.writeHead(404);res.end();return;}
    const body=await fs.readFile(resolved);res.writeHead(200,{'Content-Type':mime[path.extname(resolved)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'no-cache'});res.end(body);
  }catch(e){res.writeHead(e.code==='ENOENT'?404:400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e.code==='ENOENT'?'Not found':e.message}));}
});
let ticking=false;
const timer=setInterval(()=>{if(ticking)return;ticking=true;serial(async()=>{await arena.tick(2);await persist();}).finally(()=>ticking=false);},2000);
server.listen(port,host,()=>console.log(`Age of AI Battle Arena: http://${host}:${port}`));
async function close(){clearInterval(timer);server.close();await chain;await persist();process.exit(0);}
process.on('SIGINT',close);process.on('SIGTERM',close);
