import {serveStatic} from './assets.mjs';
export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname.startsWith('/api/')){
      if(!env.BATTLE_RUNNER_URL){
        if(url.pathname==='/api/health')return Response.json({ok:true,runner:'preview',encryptionReady:false});
        return Response.json({error:'Connect the cloud runner to start API matches. The demo is available now.'},{status:503});
      }
      const target=new URL(env.BATTLE_RUNNER_URL);
      if(target.protocol!=='https:')return Response.json({error:'Cloud runner must use HTTPS'},{status:503});
      target.pathname=url.pathname;target.search=url.search;
      const headers=new Headers({'Content-Type':'application/json'});
      if(request.method!=='GET'&&env.BATTLE_RUNNER_TOKEN)headers.set('x-admin-key',env.BATTLE_RUNNER_TOKEN);
      return fetch(target,{method:request.method,headers,...(request.method!=='GET'?{body:request.body,duplex:'half'}:{}),redirect:'error'});
    }
    return serveStatic(request);
  }
};
