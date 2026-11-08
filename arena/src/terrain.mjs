// Shared by simulation and renderer: a visible tree is an actual finite deposit.
export const terrainHash=(x,y,seed=1)=>{let n=Math.imul(x+Math.imul(y,137)+seed,374761393);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;};
export function river(x,y,s){const c=s.size/2;return (!s.mapId||s.mapId==='riverlands')&&Math.abs(x-c)<1.5&&[s.size*.25,c,s.size*.75].every(b=>Math.abs(y-b)>2.4);}
const grids=new WeakMap();
export function groundGrid(s){
  const key=s.landforms||s;let cached=grids.get(key);if(cached)return cached;
  const n=s.size,grid=new Uint8Array(n*n),roads=new Set((s.terrainRoads||s.roads).map(r=>r.y*n+r.x));
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    let height=0;
    for(const f of s.landforms||[]){const d=Math.hypot((x-f.x)/f.rx,(y-f.y)/f.ry);if(d<1)height=Math.max(height,(1-d)*f.height);}
    // Main supply corridors and starting estates are guaranteed accessible.
    if(s.players.some(p=>Math.hypot(x-p.buildings[0].x,y-p.buildings[0].y)<22))height=0;
    if(roads.has(y*n+x)||roads.has(y*n+x+1)||roads.has(y*n+x-1)||roads.has((y+1)*n+x)||roads.has((y-1)*n+x))height=0;
    grid[y*n+x]=river(x+.5,y+.5,s)?4:Math.min(2,Math.floor(height));
  }
  grids.set(key,grid);return grid;
}
export const groundAt=(s,x,y)=>groundGrid(s)[Math.max(0,Math.min(s.size-1,Math.floor(y)))*s.size+Math.max(0,Math.min(s.size-1,Math.floor(x)))];
export function biomeAt(s,x,y){
  if(s.players.some(p=>Math.hypot(x-p.buildings[0].x,y-p.buildings[0].y)<(s.mapId==='desert'?32:18)))return 'grass';
  const a=Math.sin(x*.019+s.seed%11)*Math.cos(y*.023)+.55*Math.sin((x+y)*.014);
  if(s.mapId==='desert')return a<-.85?'grass':'desert';
  return a>.65?'desert':'grass';
}
export function generateLandscape(s){
  const n=s.size,c=n/2;s.landforms=[];s.terrainRoads=s.roads.map(r=>({x:r.x,y:r.y}));s.navRevision=0;
  for(let i=0;i<s.players.length;i++)for(const ring of [.20,.44]){const a=-Math.PI*.75+(i+.5)*Math.PI*2/s.players.length;s.landforms.push({x:c+Math.cos(a)*n*ring,y:c+Math.sin(a)*n*ring,rx:Math.max(8,n*.075),ry:Math.max(6,n*.04),height:s.mapId==='highlands'?2.8:2.3});}
  for(const tree of s.nodes.filter(n=>n.type==='wood')){tree.amount=Math.min(tree.amount,180);tree.max=tree.amount;}
  const grid=groundGrid(s),road=new Set(s.roads.map(r=>r.y*n+r.x)),occupied=new Set(s.nodes.map(p=>Math.floor(p.y)*n+Math.floor(p.x)));
  for(let y=2;y<n-2;y++)for(let x=2;x<n-2;x++){
    const id=y*n+x,noise=terrainHash(x,y,s.seed),biome=Math.sin(x*.085+s.seed%17)*Math.cos(y*.093)+Math.cos(x*.041+y*.071);
    if(grid[id]>=3||occupied.has(id)||road.has(id)||road.has(id-1)||road.has(id+1)||road.has(id-n)||road.has(id+n))continue;
    if(s.players.some(p=>Math.hypot(x-p.buildings[0].x,y-p.buildings[0].y)<22))continue;
    if((biome>.55||(s.mapId==='desert'&&noise>.65))&&noise>.12&&biomeAt(s,x,y)!=='desert'){const amount=80+Math.floor(noise*80);s.nodes.push({id:`tree-${id}`,type:'wood',x:x+.5,y:y+.5,amount,max:amount,zone:'forest',species:noise>.55?'pine':'oak'});}
  }
  s.ruins=[];
  for(const [i,f]of s.landforms.entries()){
    for(let j=0;j<24;j++){const a=j*Math.PI/12,x=Math.floor(f.x+Math.cos(a)*(f.rx+5))+.5,y=Math.floor(f.y+Math.sin(a)*(f.ry+5))+.5;
      if(x>3&&y>3&&x<n-4&&y<n-4&&groundAt(s,x,y)<2&&!s.nodes.some(t=>t.amount>0&&Math.hypot(t.x-x,t.y-y)<3)){s.ruins.push({id:`ruin-${i}`,x,y,kind:i%2?'watchtower':'sanctuary',claimedBy:null,stone:80,gold:40});break;}
    }
  }
  // Resource hubs must remain reachable and outside water.
  for(const node of s.nodes)if(node.zone!=='forest'&&groundAt(s,node.x,node.y)>=3){for(let r=1;r<30;r++){let found=false;for(let i=0;i<16;i++){const x=node.x+Math.cos(i*Math.PI/8)*r,y=node.y+Math.sin(i*Math.PI/8)*r;if(x>1&&y>1&&x<n-2&&y<n-2&&groundAt(s,x,y)<3){node.x=x;node.y=y;found=true;break;}}if(found)break;}}
}
const navigation=new WeakMap();
export function navigationGrid(s){
  let c=navigation.get(s);if(c&&c.revision===(s.navRevision||0)&&c.length===s.nodes.length)return c.grid;
  const grid=groundGrid(s).slice();for(const node of s.nodes)if(node.type==='wood'&&node.amount>0)grid[Math.floor(node.y)*s.size+Math.floor(node.x)]=5;
  navigation.set(s,{grid,revision:s.navRevision||0,length:s.nodes.length});return grid;
}
export const passable=(s,x,y)=>x>=1&&y>=1&&x<s.size-1&&y<s.size-1&&navigationGrid(s)[Math.floor(y)*s.size+Math.floor(x)]<3;
class Heap{
  constructor(){this.a=[];}
  push(v){const a=this.a;a.push(v);let i=a.length-1;while(i){const p=(i-1)>>1;if(a[p].f<=v.f)break;a[i]=a[p];i=p;}a[i]=v;}
  pop(){const a=this.a,first=a[0],v=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let j=i*2+1;if(j+1<a.length&&a[j+1].f<a[j].f)j++;if(a[j].f>=v.f)break;a[i]=a[j];i=j;}a[i]=v;}return first;}
}
// Eight-way A*, no diagonal corner cutting. Goals on trees resolve to a working edge.
export function findRoute(s,start,goal){
  const n=s.size,grid=navigationGrid(s),sx=Math.floor(start.x),sy=Math.floor(start.y);
  let gx=Math.max(1,Math.min(n-2,Math.floor(goal.x))),gy=Math.max(1,Math.min(n-2,Math.floor(goal.y)));
  if(grid[gy*n+gx]>=3){let best=null;for(let r=1;r<=8&&!best;r++)for(let y=gy-r;y<=gy+r;y++)for(let x=gx-r;x<=gx+r;x++)if(x>0&&y>0&&x<n-1&&y<n-1&&grid[y*n+x]<3){const score=Math.hypot(x+.5-goal.x,y+.5-goal.y)*10+Math.hypot(x-sx,y-sy);if(!best||score<best.score)best={x,y,score};}if(!best)return [];gx=best.x;gy=best.y;}
  // Most village trips have clear sight lines; avoid a full search for each delivery.
  const direct=[],steps=Math.max(Math.abs(gx-sx),Math.abs(gy-sy));let px=sx,py=sy,clear=true;
  for(let i=1;i<=steps;i++){const x=Math.round(sx+(gx-sx)*i/steps),y=Math.round(sy+(gy-sy)*i/steps);if(grid[y*n+x]>=3||(x!==px&&y!==py&&(grid[py*n+x]>=3||grid[y*n+px]>=3))){clear=false;break;}direct.push({x:x+.5,y:y+.5});px=x;py=y;}
  if(clear)return direct;
  const target=gy*n+gx,origin=sy*n+sx,open=new Heap(),cost=new Map([[origin,0]]),parent=new Map(),closed=new Set();
  const heuristic=(x,y)=>{const dx=Math.abs(x-gx),dy=Math.abs(y-gy);return Math.max(dx,dy)+.41421356*Math.min(dx,dy);};
  open.push({id:origin,f:heuristic(sx,sy)});
  while(open.a.length&&closed.size<n*n){const {id}=open.pop();if(closed.has(id))continue;if(id===target){const path=[];let k=id;while(k!==origin){path.push({x:k%n+.5,y:Math.floor(k/n)+.5});k=parent.get(k);}return path.reverse();}closed.add(id);const x=id%n,y=Math.floor(id/n);
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;const nx=x+dx,ny=y+dy,k=ny*n+nx;if(nx<1||ny<1||nx>=n-1||ny>=n-1||grid[k]>=3||closed.has(k))continue;if(dx&&dy&&(grid[y*n+nx]>=3||grid[ny*n+x]>=3))continue;const score=cost.get(id)+(dx&&dy?Math.SQRT2:1)*(1+grid[k]*.3);if(score<(cost.get(k)??Infinity)){cost.set(k,score);parent.set(k,id);open.push({id:k,f:score+heuristic(nx,ny)});}}
  }
  return [];
}
const paths=new WeakMap();
export function moveOnTerrain(u,goal,speed,dt,s){
  if(!goal)return;const target=`${Math.floor(goal.x)},${Math.floor(goal.y)}`;let route=paths.get(u);
  if(!route||route.target!==target||(!route.points.length&&route.revision!==(s.navRevision||0))){route={target,revision:s.navRevision||0,points:findRoute(s,u,goal),i:0};paths.set(u,route);}
  let distance=speed*dt;
  while(distance>0&&route.i<route.points.length){const next=route.points[route.i];if(!passable(s,next.x,next.y)){paths.delete(u);return;}const d=Math.hypot(next.x-u.x,next.y-u.y),slow=1+groundAt(s,next.x,next.y)*.3,step=Math.min(d,distance/slow);if(d<.001){route.i++;continue;}u.x+=(next.x-u.x)*step/d;u.y+=(next.y-u.y)*step/d;distance-=step*slow;if(step>=d-.001)route.i++;}
}
