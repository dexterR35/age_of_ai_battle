import {ASSETS} from './assets.generated.mjs';
export function serveStatic(request){
  const url=new URL(request.url),pathname=url.pathname==='/'?'/index.html':url.pathname;
  const asset=ASSETS[pathname]||(!pathname.includes('.')?ASSETS['/index.html']:null);
  if(!asset||!['GET','HEAD'].includes(request.method))return new Response('Not found',{status:404});
  const body=asset.binary?Uint8Array.from(atob(asset.body),c=>c.charCodeAt(0)):asset.body;
  return new Response(request.method==='HEAD'?null:body,{headers:{'Content-Type':asset.type,'X-Content-Type-Options':'nosniff','Cache-Control':pathname.startsWith('/assets/')?'public, max-age=31536000, immutable':'no-cache'}});
}
