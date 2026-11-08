import {Arena,emptyStore,safeEqual} from '../src/arena.mjs';
import {serveStatic} from './assets.mjs';
export class BattleArena {
  constructor(ctx,env){this.ctx=ctx;this.env=env;this.queue=Promise.resolve();ctx.blockConcurrencyWhile(async()=>{
    const count=await ctx.storage.get('chunkCount');let data;
    if(count){let json='';for(let i=0;i<count;i++)json+=await ctx.storage.get('chunk:'+i);data=JSON.parse(json);}
    else data=await ctx.storage.get('state')||emptyStore();
    this.chunkCount=count||0;this.arena=new Arena(data,env.KEY_ENCRYPTION_SECRET||'');this.arena.checkpoint=()=>this.save();
  });}
  serial(fn){const task=this.queue.then(fn);this.queue=task.catch(()=>{});return task;}
  async save(){
    const data=JSON.stringify(this.arena.data),chunks=[];for(let i=0;i<data.length;i+=20000)chunks.push(data.slice(i,i+20000));
    // Atomic chunks remain below Durable Object's per-value size limit, including Unicode.
    await this.ctx.storage.transaction(async tx=>{for(let i=0;i<chunks.length;i++)await tx.put('chunk:'+i,chunks[i]);for(let i=chunks.length;i<this.chunkCount;i++)await tx.delete('chunk:'+i);await tx.put('chunkCount',chunks.length);});this.chunkCount=chunks.length;
    if(Object.values(this.arena.data.matches).some(s=>s.status==='running'))await this.ctx.storage.setAlarm(Date.now()+2000);else await this.ctx.storage.deleteAlarm();
  }
  async alarm(){return this.serial(async()=>{try{await this.arena.tick(2);}finally{await this.save();}});}
  async fetch(req){
    try{return await this.serial(async()=>{const r=await this.arena.api(req);if(req.method!=='GET')await this.save();return r;});}
    catch(e){return Response.json({error:e.message},{status:400});}
  }
}
export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname.startsWith('/api/')){
      if(!env.ARENA)return Response.json({ok:true,runner:'preview',encryptionReady:false});
      if(request.method!=='GET'&&(!env.BATTLE_ADMIN_TOKEN||!safeEqual(request.headers.get('x-admin-key'),env.BATTLE_ADMIN_TOKEN)))return Response.json({error:'A valid runner admin token is required.'},{status:401});
      if(Number(request.headers.get('content-length')||0)>65536)return new Response('Request too large',{status:413});
      // Deployment is same-origin. No arbitrary proxy or custom provider URL is accepted.
      return env.ARENA.get(env.ARENA.idFromName('arena-v1')).fetch(request);
    }
    return serveStatic(request);
  }
};
