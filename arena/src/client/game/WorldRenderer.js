import {groundAt,groundGrid,biomeAt} from '../../terrain.mjs';
import {UNITS} from '../../rules.mjs';
import {water,dist} from '../../engine.mjs';
import {Sprites} from './Sprites.js';
const iso=(x,y)=>({x:(x-y)*8,y:(x+y)*4});
const uniso=(x,y)=>({x:(x/8+y/4)/2,y:(y/4-x/8)/2});
const hash=(x,y,seed=1)=>{let n=Math.imul(Math.round(x*31)+Math.round(y*137)+seed,374761393);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export class BattleMap extends Sprites {
  constructor(canvas,mini,onSelect,onCamera=()=>{}){
    super();Object.assign(this,{canvas,mini,onSelect,onCamera,ctx:canvas.getContext('2d'),zoom:1.6,pan:{x:0,y:0},pov:'all',state:null,selected:null,lastFrame:0,sprites:[],keys:new Set(),drag:null,events:new AbortController(),disposed:false,navigatorVisible:false});
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(canvas);this.resize();
    this.listen(canvas,'wheel',e=>{e.preventDefault();const r=canvas.getBoundingClientRect();this.setZoom(this.zoom*(e.deltaY>0?.9:1.1),{x:e.clientX-r.left,y:e.clientY-r.top});},{passive:false});
    this.listen(canvas,'pointerdown',e=>{canvas.setPointerCapture(e.pointerId);canvas.focus({preventScroll:true});this.drag={x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY};canvas.style.cursor='grabbing';});
    this.listen(canvas,'pointermove',e=>{const rect=canvas.getBoundingClientRect();this.pointer=e.pointerType==='mouse'?{x:e.clientX-rect.left,y:e.clientY-rect.top}:null;if(!this.drag)return;this.pan.x+=e.clientX-this.drag.x;this.pan.y+=e.clientY-this.drag.y;this.drag.x=e.clientX;this.drag.y=e.clientY;this.limitPan();});
    this.listen(canvas,'pointerleave',()=>{this.pointer=null;});
    this.listen(canvas,'pointerup',e=>{if(this.drag&&Math.hypot(e.clientX-this.drag.startX,e.clientY-this.drag.startY)<5)this.pick(e);this.drag=null;canvas.style.cursor='grab';});
    this.listen(canvas,'pointercancel',()=>{this.drag=null;canvas.style.cursor='grab';});
    this.listen(document,'keydown',e=>{if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName)||document.querySelector('dialog[open]'))return;const key=e.key.toLowerCase();if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(key)){e.preventDefault();this.keys.add(key);}if(key==='+'||key==='=')this.setZoom(this.zoom*1.1);if(key==='-')this.setZoom(this.zoom/1.1);});
    this.listen(document,'keyup',e=>this.keys.delete(e.key.toLowerCase()));this.listen(window,'blur',()=>this.keys.clear());
    this.listen(mini,'pointerdown',e=>{mini.setPointerCapture(e.pointerId);this.miniNavigate(e);});this.listen(mini,'pointermove',e=>{if(e.buttons)this.miniNavigate(e);});
    this.raf=requestAnimationFrame(t=>this.frame(t));
  }
  listen(target,type,handler,options={}){target.addEventListener(type,handler,{...options,signal:this.events.signal});}
  destroy(){this.disposed=true;cancelAnimationFrame(this.raf);this.events.abort();this.resizeObserver.disconnect();this.keys.clear();if(this.terrain)this.terrain.width=this.terrain.height=0;if(this.roadsLayer)this.roadsLayer.width=this.roadsLayer.height=0;}
  resize(){const r=this.canvas.getBoundingClientRect();this.w=r.width;this.h=r.height;this.dpr=Math.min(devicePixelRatio||1,2);this.canvas.width=Math.round(this.w*this.dpr);this.canvas.height=Math.round(this.h*this.dpr);this.updateScale();}
  updateScale(){this.baseScale=1;this.scale=this.zoom;}
  setState(state,pov='all'){
    this.state=state;this.pov=pov;const signature=`${state.id}:${state.seed}:${state.size}:${state.mapId}:${state.players.length}`;
    if(this.terrainSignature!==signature){this.makeTerrain(state);this.terrainSignature=signature;this.roadCount=-1;}
    if(this.roadCount!==state.roads.length){this.makeRoads();this.roadCount=state.roads.length;}
    this.updateScale();this.visibleSeen=new Set(state.players.find(p=>p.id===pov)?.seen||[]);this.drawMini();
  }
  setZoom(z,at){const before=this.scale;this.zoom=clamp(z,.12,5);this.updateScale();if(at&&before){const r=this.scale/before;this.pan.x=at.x-this.w/2-(at.x-this.w/2-this.pan.x)*r;this.pan.y=at.y-this.h/2-(at.y-this.h/2-this.pan.y)*r;}this.limitPan();this.onCamera(this.zoom);}
  limitPan(){if(!this.state)return;const limit=this.state.size*8*this.scale;this.pan.x=clamp(this.pan.x,-limit,limit);this.pan.y=clamp(this.pan.y,-limit*.65,limit*.65);}
  reset(){if(!this.state)return;this.pan={x:0,y:-15};this.setZoom(Math.min(this.w/(this.state.size*16+100),this.h/(this.state.size*8+110))*.93);}
  focusPlayer(id){if(!this.state)return;const p=this.state.players.find(p=>p.id===id),town=p?.buildings.find(b=>b.type==='town');if(!town)return;this.setZoom(Math.max(1.6,this.zoom));const pt=iso(town.x,town.y),center=iso(this.state.size/2,this.state.size/2);this.pan={x:-pt.x*this.scale,y:-(pt.y-center.y)*this.scale};this.limitPan();}
  setPerspective(pov){this.pov=pov;this.visibleSeen=new Set(this.state?.players.find(p=>p.id===pov)?.seen||[]);this.drawMini();}
  miniNavigate(e){if(!this.state||!this.miniTransform)return;const r=this.mini.getBoundingClientRect(),t=this.miniTransform;const sx=(e.clientX-r.left)/r.width*this.mini.width,sy=(e.clientY-r.top)/r.height*this.mini.height;const tile=uniso((sx-t.x)/t.scale,(sy-t.y)/t.scale);const n=this.state.size;const q=iso(clamp(tile.x,0,n),clamp(tile.y,0,n)),center=iso(n/2,n/2);this.pan={x:-q.x*this.scale,y:-(q.y-center.y)*this.scale-25};this.limitPan();}
  makeTerrain(s){
    const n=s.size;const c=document.createElement('canvas');c.width=n*16+100;c.height=n*8+120;const g=c.getContext('2d');this.terrainOrigin={x:c.width/2,y:50};g.translate(this.terrainOrigin.x,this.terrainOrigin.y);
    this.polygon(g,[iso(0,n),iso(n,n),{x:0,y:n*8+15},{x:-n*8,y:n*4+15}],'#334c29');this.polygon(g,[iso(n,0),iso(n,n),{x:0,y:n*8+15},{x:n*8,y:n*4+15}],'#253e28');
    const palette=s.mapId==='highlands'?['#807649','#8c8050','#756e46','#897c4b']:s.mapId==='crossroads'?['#56893b','#60983f','#518436','#649540']:['#5f8f3e','#6a9a45','#57863a','#649440'];
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      const elevation=groundAt(s,x,y);const noise=hash(Math.floor(x/3),Math.floor(y/3),s.seed),w=water(x+.5,y+.5,s),q=iso(x,y),nearRiver=s.mapId==='riverlands'&&Math.abs(x-n/2)<3;
      let fill=w?['#285d88','#316a94','#326b94','#2d628d'][Math.floor(noise*4)]:nearRiver?['#789b50','#7da353','#729a49'][Math.floor(noise*3)]:palette[Math.floor(noise*palette.length)];
      if(elevation===1)fill=['#839055','#8a965d','#7b884f'][Math.floor(noise*3)];
      if(elevation===2)fill=['#89945a','#959d63','#7f8b50'][Math.floor(noise*3)];
      const desert=!w&&biomeAt(s,x,y)==='desert';if(desert)fill=['#c4a66b','#cfb578','#d7be82','#c9ae73'][Math.floor(noise*4)];
      const rise=w?0:elevation*5,points=[q,iso(x+1,y),iso(x+1,y+1),iso(x,y+1)].map(p=>({x:p.x,y:p.y-rise}));
      if(rise){this.polygon(g,[points[2],points[3],iso(x,y+1),iso(x+1,y+1)],'#586856');this.polygon(g,[points[1],points[2],iso(x+1,y+1),iso(x+1,y)],'#4a5953');}
      this.polygon(g,points,fill);
      if(w&&noise>.74){g.strokeStyle='#74a0ad60';g.lineWidth=.6;g.beginPath();g.moveTo(q.x-3,q.y+2.8);g.lineTo(q.x+3,q.y+2.8);g.stroke();}
      if(desert&&hash(x,y,s.seed)>.9){g.strokeStyle='#a38b5544';g.lineWidth=.6;g.beginPath();g.moveTo(q.x-3,q.y+2);g.quadraticCurveTo(q.x,q.y,q.x+3,q.y+2);g.stroke();}
      if(!w&&!desert&&noise>.82){g.fillStyle='#a6bf6930';g.fillRect(q.x+noise*4-2,q.y+3,.8,1);}
    }
    // Trees are drawn exclusively from simulation deposits, never decorative forests.
    this.terrain=c;
  }
  makeRoads(){
    const s=this.state,n=s.size,c=document.createElement('canvas');c.width=n*16+100;c.height=n*8+120;const g=c.getContext('2d');g.translate(c.width/2,50);
    const roads=new Set(s.roads.map(r=>r.y*n+r.x));
    g.lineCap='round';g.lineJoin='round';
    for(const r of s.roads){const p=iso(r.x+.5,r.y+.5);
      for(const [dx,dy]of [[1,0],[0,1],[1,1],[-1,1]])if(roads.has((r.y+dy)*n+r.x+dx)){
        const q=iso(r.x+dx+.5,r.y+dy+.5);g.strokeStyle='#5d5d3370';g.lineWidth=5;g.beginPath();g.moveTo(p.x,p.y+1);g.lineTo(q.x,q.y+1);g.stroke();g.strokeStyle='#b39b62';g.lineWidth=3.6;g.beginPath();g.moveTo(p.x,p.y);g.lineTo(q.x,q.y);g.stroke();g.strokeStyle='#cfbb7f70';g.lineWidth=.6;g.stroke();
      }
      this.polygon(g,[{x:p.x-3,y:p.y},{x:p.x,y:p.y-1.5},{x:p.x+3,y:p.y},{x:p.x,y:p.y+1.5}],'#b49e68');
    }
    if(s.mapId==='riverlands')for(const y of [n*.25,n/2,n*.75]){
      const q=iso(n/2,y);g.save();g.translate(q.x,q.y);this.polygon(g,[{x:-23,y:1},{x:9,y:-15},{x:24,y:-7},{x:-8,y:9}],'#9a8050');
      for(let j=-3;j<=4;j++){g.strokeStyle='#c4ab75';g.lineWidth=1.3;g.beginPath();g.moveTo(j*5-7,j*-2.5-3);g.lineTo(j*5+5,j*-2.5+3);g.stroke();}
      g.strokeStyle='#594d32';g.lineWidth=1;g.beginPath();g.moveTo(-23,-3);g.lineTo(9,-19);g.moveTo(-8,5);g.lineTo(24,-11);g.stroke();g.restore();
    }
    this.roadsLayer=c;
  }
  isVisible(p,o){return !p||p.id===o.owner||p.buildings.some(b=>b.hp>0&&dist(b,o)<(b.type==='tower'?12:9))||p.units.some(u=>dist(u,o)<UNITS[u.type].sight);}
  resource(g,node,time){const q=iso(node.x,node.y),noise=hash(node.x,node.y);if(node.type==='wood'){
      if(node.amount<=0){g.fillStyle='#927247';g.fillRect(q.x-1.4,q.y-2,2.8,3);g.fillStyle='#ceae70';g.beginPath();g.ellipse(q.x,q.y-2,1.7,.9,0,0,Math.PI*2);g.fill();return;}
      this.tree(g,q,node.zone==='forest'?3.4+noise:4.5,node.species==='oak'?.25:.75);
      if(node.amount<node.max){g.fillStyle='#c6a366';g.fillRect(q.x-.7,q.y-2,1.4,1.5);}
      return;
    }
    if(node.type==='food'){g.fillStyle='#2f7837';g.beginPath();g.ellipse(q.x,q.y-1,4,3,0,0,Math.PI*2);g.fill();for(let i=0;i<4;i++){g.fillStyle='#ce5a38';g.fillRect(q.x-2+i*1.4,q.y-3+(i%2),1.2,1.2);}return;}
    const stone=node.type==='stone';this.rock(g,q.x-3,q.y,5.5,stone?'#9fa8aa':'#777e76');this.rock(g,q.x+4,q.y+1,4.5,stone?'#b0b7b7':'#878981');this.rock(g,q.x,q.y-4,4,stone?'#b7bfc0':'#737e74');
    if(!stone){const ore=node.type==='ore';g.fillStyle=ore?'#e38443':'#f1ce43';for(let i=0;i<5;i++)g.fillRect(q.x-5+(i*2.4),q.y-5+(i%3)*2,2.2,1.8);if(!ore&&Math.sin(time/500+noise*10)>.9){g.fillStyle='#fff0a0';g.fillRect(q.x+2,q.y-6,1,4);g.fillRect(q.x+.5,q.y-4.5,4,1);}}
  }
  frame(time){
    if(this.disposed)return;this.raf=requestAnimationFrame(t=>this.frame(t));if(!this.state||!this.w||time-this.lastFrame<30)return;const dt=Math.min(50,time-this.lastFrame||33);this.lastFrame=time;
    const shift=.45*dt;for(const key of this.keys){if(['a','arrowleft'].includes(key))this.pan.x+=shift;if(['d','arrowright'].includes(key))this.pan.x-=shift;if(['w','arrowup'].includes(key))this.pan.y+=shift;if(['s','arrowdown'].includes(key))this.pan.y-=shift;}if(this.keys.size)this.limitPan();
    if(this.pointer&&!this.drag&&!document.querySelector('dialog[open]')){if(this.pointer.x<16)this.pan.x+=shift;if(this.pointer.x>this.w-16)this.pan.x-=shift;if(this.pointer.y<16)this.pan.y+=shift;if(this.pointer.y>this.h-16)this.pan.y-=shift;this.limitPan();}
    const s=this.state,n=s.size,g=this.ctx;g.setTransform(this.dpr,0,0,this.dpr,0,0);g.fillStyle='#0b1219';g.fillRect(0,0,this.w,this.h);this.updateScale();
    const center=iso(n/2,n/2);g.save();g.translate(this.w/2+this.pan.x,this.h/2+this.pan.y);g.scale(this.scale,this.scale);g.translate(0,-center.y);
    if(this.terrain)g.drawImage(this.terrain,-this.terrainOrigin.x,-this.terrainOrigin.y);if(this.roadsLayer)g.drawImage(this.roadsLayer,-this.terrainOrigin.x,-this.terrainOrigin.y);
    const p=s.players.find(p=>p.id===this.pov),seen=this.visibleSeen;
    const viewport={left:(-this.w/2-this.pan.x)/this.scale-80,right:(this.w/2-this.pan.x)/this.scale+80,top:(-this.h/2-this.pan.y)/this.scale+center.y-80,bottom:(this.h/2-this.pan.y)/this.scale+center.y+80};
    const inView=entity=>{const pt=iso(entity.x,entity.y);return pt.x>=viewport.left&&pt.x<=viewport.right&&pt.y>=viewport.top&&pt.y<=viewport.bottom;};
    this.sprites=[];
    for(const node of s.nodes)if(inView(node)&&(node.amount>0||node.felledAt!==undefined)&&(!p||seen.has(Math.floor(node.y)*n+Math.floor(node.x))))this.sprites.push({entity:node,p:null,kind:'resource',depth:node.x+node.y});
    for(const ruin of s.ruins||[])if(inView(ruin)&&(!p||seen.has(Math.floor(ruin.y)*n+Math.floor(ruin.x))))this.sprites.push({entity:ruin,p:null,kind:'ruin',depth:ruin.x+ruin.y});
    for(const q of s.players){for(const b of q.buildings.filter(b=>b.hp>0))if(inView(b)&&this.isVisible(p,{...b,owner:q.id}))this.sprites.push({entity:b,p:q,kind:'building',depth:b.x+b.y});for(const u of q.units)if(inView(u)&&this.isVisible(p,{...u,owner:q.id}))this.sprites.push({entity:u,p:q,kind:'unit',depth:u.x+u.y});}
    this.sprites.sort((a,b)=>a.depth-b.depth);
    for(const spr of this.sprites){g.save();g.translate(0,-Math.min(3,groundAt(s,spr.entity.x,spr.entity.y))*5);if(spr.kind==='building'){g.save();const pos=iso(spr.entity.x,spr.entity.y);g.translate(pos.x,pos.y);g.scale(1.45,1.45);g.translate(-pos.x,-pos.y);this.building(g,spr.entity,spr.p.color,time);g.restore();}else if(spr.kind==='unit'){g.save();const pos=iso(spr.entity.x,spr.entity.y);g.translate(pos.x,pos.y);g.scale(1.5,1.5);g.translate(-pos.x,-pos.y);this.unit(g,spr.entity,spr.p,time);g.restore();}else if(spr.kind==='ruin'){const q=iso(spr.entity.x,spr.entity.y);g.save();g.translate(q.x,q.y);g.globalAlpha=spr.entity.claimedBy?.5:1;for(let i=0;i<4;i++){g.fillStyle=i%2?'#8c9787':'#a8ac90';g.fillRect(-12+i*7,-8-(i%3)*5,4,10+(i%3)*5);this.rock(g,-9+i*6,5,3,'#a0a58a');}g.restore();}else this.resource(g,spr.entity,time);g.restore();}
    // Only spectator vision draws an enemy directive; models never receive this layer.
    for(const q of s.players){
      const b=q.buildings.find(b=>b.type==='town');if(!b||b.hp<=0||!this.isVisible(p,{...b,owner:q.id}))continue;const pt=iso(b.x,b.y);
      g.save();g.strokeStyle=q.color+'a0';g.lineWidth=.8;g.setLineDash([4,3]);g.beginPath();g.ellipse(pt.x,pt.y,43,22,0,0,Math.PI*2);g.stroke();g.setLineDash([]);
      g.font='600 11px "DM Sans",sans-serif';g.textAlign='center';const text=q.name.toUpperCase(),width=g.measureText(text).width;g.fillStyle='#101c24ed';g.fillRect(pt.x-width/2-9,pt.y+23,width+18,19);g.fillStyle=q.color;g.fillRect(pt.x-width/2-9,pt.y+23,2,19);g.fillStyle='#e1e4ce';g.fillText(text,pt.x+1,pt.y+36);g.restore();
    }
    if(p){const corners=[uniso(viewport.left,viewport.top),uniso(viewport.right,viewport.top),uniso(viewport.left,viewport.bottom),uniso(viewport.right,viewport.bottom)];const x0=clamp(Math.floor(Math.min(...corners.map(q=>q.x))),0,n),x1=clamp(Math.ceil(Math.max(...corners.map(q=>q.x))),0,n),y0=clamp(Math.floor(Math.min(...corners.map(q=>q.y))),0,n),y1=clamp(Math.ceil(Math.max(...corners.map(q=>q.y))),0,n);for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)if(!seen.has(y*n+x)){const pt=iso(x,y);this.polygon(g,[pt,iso(x+1,y),iso(x+1,y+1),iso(x,y+1)],'#07131ce8');}}
    if(this.selected){const spr=this.sprites.find(z=>z.entity.id===this.selected);if(spr){const pt=iso(spr.entity.x,spr.entity.y);g.strokeStyle='#f0d57d';g.lineWidth=1.5;g.beginPath();g.ellipse(pt.x,pt.y+2,spr.kind==='building'?25:spr.kind==='resource'?9:6,spr.kind==='building'?13:4,0,0,Math.PI*2);g.stroke();}}
    g.restore();if(this.navigatorVisible&&time-(this.miniTime||0)>250){this.drawMini();this.miniTime=time;}
  }
  pick(e){if(!this.state)return;const r=this.canvas.getBoundingClientRect(),center=iso(this.state.size/2,this.state.size/2),x=(e.clientX-r.left-this.w/2-this.pan.x)/this.scale,y=(e.clientY-r.top-this.h/2-this.pan.y)/this.scale+center.y;
    const spr=[...this.sprites].reverse().find(s=>{const q=iso(s.entity.x,s.entity.y);return Math.abs(q.x-x)<(s.kind==='building'?23:s.kind==='resource'?9:6)&&Math.abs(q.y-Math.min(3,groundAt(this.state,s.entity.x,s.entity.y))*5-y-(s.kind==='building'?12:5))<(s.kind==='building'?35:12);});this.selected=spr?.entity.id||null;this.onSelect(spr||null);
  }
  drawMini(){
    if(!this.state)return;const s=this.state,n=s.size,g=this.mini.getContext('2d'),w=this.mini.width,h=this.mini.height;g.clearRect(0,0,w,h);const scale=Math.min((w-8)/(n*16),(h-10)/(n*8)),tx=w/2,ty=3;this.miniTransform={x:tx,y:ty,scale};
    g.save();g.translate(tx,ty);g.scale(scale,scale);if(this.terrain)g.drawImage(this.terrain,-this.terrainOrigin.x,-this.terrainOrigin.y);if(this.roadsLayer)g.drawImage(this.roadsLayer,-this.terrainOrigin.x,-this.terrainOrigin.y);
    const p=s.players.find(p=>p.id===this.pov),seen=this.visibleSeen;
    for(const tree of s.nodes)if(tree.type==='wood'&&tree.amount>0&&(!p||seen.has(Math.floor(tree.y)*n+Math.floor(tree.x)))){const q=iso(tree.x,tree.y);g.fillStyle='#244f32';g.fillRect(q.x-4,q.y-2,8,4);}
    for(const node of s.nodes)if(['gold','ore','stone'].includes(node.type)&&(node.amount>0||node.felledAt!==undefined)&&(!p||seen.has(Math.floor(node.y)*n+Math.floor(node.x)))){const pt=iso(node.x,node.y);g.fillStyle=node.type==='gold'?'#ebca43':node.type==='ore'?'#dd8a46':'#c3c8c5';g.fillRect(pt.x-4,pt.y-3,8,6);}
    for(const q of s.players){g.fillStyle=q.color;for(const b of q.buildings.filter(b=>b.hp>0))if(this.isVisible(p,{...b,owner:q.id})){const pt=iso(b.x,b.y);const r=b.type==='town'?12:5;g.fillRect(pt.x-r,pt.y-r*.5,r*2,r);}}
    if(p){for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(!seen.has(y*n+x)){const pt=iso(x,y);this.polygon(g,[pt,iso(x+1,y),iso(x+1,y+1),iso(x,y+1)],'#08121be8');}}
    // The white viewport frame tracks actual pan and zoom, including the full-screen view.
    if(this.scale){const center=iso(n/2,n/2),x=(-this.w/2-this.pan.x)/this.scale,y=(-this.h/2-this.pan.y)/this.scale+center.y;g.strokeStyle='#e8e6ccdd';g.lineWidth=1/scale;g.strokeRect(x,y,this.w/this.scale,this.h/this.scale);}
    g.restore();
  }
}
