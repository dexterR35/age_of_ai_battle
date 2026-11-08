import test from 'node:test';
import assert from 'node:assert/strict';
import {createMatch,applyDecision,observation,snapshot,step,home,army,forfeit,water,demoPlan,dist,footprint} from '../src/engine.mjs';
import {damage,collectionRate,UNITS,BUILDINGS,constructionSeconds} from '../src/rules.mjs';
const rich=p=>{p.level=10;for(const k in p.resources)p.resources[k]=100000;};
const fixture=(p,type,level=1)=>{const spec=BUILDINGS[type];const b={id:`fixture-${p.buildings.length}`,type,x:home(p).x+2,y:home(p).y,level,hp:spec.hp,maxHp:spec.hp,remaining:0,total:spec.time,queue:[]};p.buildings.push(b);return b;};
const build=(s,p,type,x=home(p).x+2,y=home(p).y)=>{for(const [k,n]of Object.entries(BUILDINGS[type].requires||{}))if(!p.buildings.some(b=>b.type===k&&b.level>=n&&b.remaining===0))fixture(p,k,n);const result=applyDecision(s,p,{actions:[{type:'build',building:type}]});assert.equal(result[0].ok,true);const b=p.buildings.at(-1);b.remaining=0;b.hp=b.maxHp;b.x=x;b.y=y;return b;};
test('API observations contain no rival stock, decisions, hidden town or technology',()=>{
  const s=createMatch({players:[{},{}]});const [p,q]=s.players;q.resources.gold=987654;q.reason='secret surprise attack';q.tech.weapons=5;
  const obs=JSON.stringify(observation(s,p));assert.ok(!obs.includes('987654'));assert.ok(!obs.includes('secret surprise'));assert.ok(!obs.includes(home(q).id));
  const view=snapshot(s,p.id),rival=view.players[1];assert.equal(rival.resources,null);assert.equal(rival.tech,null);assert.equal(rival.units.length,0);assert.equal(rival.buildings.length,0);assert.equal(rival.level,null);
});
test('rejects insufficient resources and unmet prerequisites without spending',()=>{
  const s=createMatch({});const p=s.players[0];const before=structuredClone(p.resources);
  const result=applyDecision(s,p,{actions:[{type:'build',building:'workshop'},{type:'research',tech:'weapons'},{type:'train',unit:'knight'}]});assert.equal(result.every(r=>!r.ok),true);assert.deepEqual(p.resources,before);
});
test('queued population respects housing and the 100 worker cap',()=>{
  const s=createMatch({});const p=s.players[0];rich(p);build(s,p,'house');
  p.units=Array.from({length:99},(_,i)=>({...p.units[0],id:'worker'+i,type:'worker'}));
  for(let i=0;i<10;i++)build(s,p,'house');
  applyDecision(s,p,{actions:[{type:'train',unit:'worker',count:5},{type:'train',unit:'worker',count:5}]});assert.equal(home(p).queue.length,1);
});
test('counts queued soldiers against the army cap',()=>{
  const s=createMatch({});const p=s.players[0];rich(p);for(let i=0;i<20;i++)build(s,p,'house');const b=build(s,p,'barracks');
  p.units=Array.from({length:199},(_,i)=>({...p.units[0],id:'s'+i,type:'spearman',hp:45,maxHp:45}));
  applyDecision(s,p,{actions:[{type:'train',unit:'spearman',count:5}]});assert.equal(b.queue.length,1);
});
test('trade settlement is atomic and cannot be accepted twice',()=>{
  const s=createMatch({players:[{},{}]});const [p,q]=s.players;rich(p);build(s,p,'market');p.resources.wood=100;q.resources.gold=100;
  applyDecision(s,p,{actions:[{type:'trade',to:q.id,give:{wood:50},receive:{gold:25}}]});const id=s.trades[0].id;
  const result=applyDecision(s,q,{actions:[{type:'accept_trade',id},{type:'accept_trade',id}]});assert.equal(result[0].ok,true);assert.equal(result[1].ok,false);assert.equal(p.resources.wood,50);assert.equal(q.resources.gold,75);
});
test('attack requires opening peace, scouted building and five soldiers',()=>{
  const s=createMatch({players:[{},{}]});const [p,q]=s.players;p.units=Array.from({length:5},(_,i)=>({...p.units[0],id:'s'+i,type:'spearman',hp:45,maxHp:45}));
  let result=applyDecision(s,p,{actions:[{type:'attack',target:home(q).id}]});assert.equal(result[0].ok,false);s.elapsed=200;
  result=applyDecision(s,p,{actions:[{type:'attack',target:home(q).id}]});assert.equal(result[0].ok,false);p.intel[home(q).id]={...home(q),owner:q.id};
  result=applyDecision(s,p,{actions:[{type:'attack',target:home(q).id}]});assert.equal(result[0].ok,true);
});
test('same-team players cannot attack; mutually accepted truce blocks attack',()=>{
  const s=createMatch({mode:'teams'}),[p,q]=s.players;s.elapsed=300;p.units=Array.from({length:6},(_,i)=>({...p.units[0],id:'s'+i,type:'spearman'}));p.intel[home(q).id]={...home(q),owner:q.id};
  assert.equal(applyDecision(s,p,{actions:[{type:'attack',target:home(q).id}]} )[0].ok,false);
  const enemy=s.players[2];p.intel[home(enemy).id]={...home(enemy),owner:enemy.id};
  applyDecision(s,enemy,{actions:[{type:'truce',to:p.id,text:'Three minute truce.'}]});
  applyDecision(s,p,{actions:[{type:'accept_truce',to:enemy.id,text:'Accepted.'}]});assert.equal(s.treaties.length,1);
  assert.equal(applyDecision(s,p,{actions:[{type:'attack',target:home(enemy).id}]} )[0].ok,false);
});
test('conquest awards only the surviving team and there is no respawn',()=>{
  const s=createMatch({mode:'teams'});forfeit(s,s.players[2],'test');forfeit(s,s.players[3],'test');step(s,1);
  assert.equal(s.status,'finished');assert.deepEqual(s.winner,['p1','p2']);step(s,500);assert.equal(s.players[2].alive,false);
});
test('elapsed time and economic score cannot end a conquest match',()=>{
  const s=createMatch({players:[{},{}],duration:60});assert.equal(s.duration,null);s.elapsed=3599;s.players[0].resources.gold=99999;step(s,1);assert.equal(s.status,'running');assert.deepEqual(s.winner,[]);
});
test('combat uses counters, minimum damage and gathering penalizes distance',()=>{
  assert.equal(damage(3,3,0,2,0),7);assert.equal(damage(1,1,0,20,5),1);assert.ok(collectionRate(10,1,1,20,2)<collectionRate(10,1,1,2,2));
  assert.equal(water(32,20),true);assert.equal(water(32,16),false);
});
test('simultaneous hits allow mutual kills instead of order-dependent first strike',()=>{
  const s=createMatch({players:[{},{}]}),[p,q]=s.players;s.elapsed=400;
  p.units=[{...p.units[0],id:'a',type:'spearman',x:28,y:16,hp:1,maxHp:45}];q.units=[{...q.units[0],id:'b',type:'spearman',x:28.5,y:16,hp:1,maxHp:45}];step(s,2);assert.equal(p.units.length,0);assert.equal(q.units.length,0);assert.equal(p.stats.kills,1);assert.equal(q.stats.kills,1);
});
test('all match formats start with equal deposits and valid starts',()=>{
  for(const n of [2,4,6,8])for(const mapId of ['riverlands','highlands','crossroads','frontier','desert']){const s=createMatch({mapId,players:Array.from({length:n},()=>({}))});assert.equal(s.players.length,n);assert.equal(s.size,n===2?256:n===4?384:512);for(const p of s.players){assert.equal(p.units.length,13);assert.equal(water(home(p).x,home(p).y,s),false);}assert.equal(s.nodes.filter(node=>node.zone!=='forest').length/n,34);assert.ok(s.roads.length>0);assert.ok(s.nodes.every(node=>!water(node.x,node.y,s)));}
});
test('new matches do not have a time limit and cannot end at the former 90-minute boundary',()=>{const s=createMatch({players:[{},{}]});assert.equal(s.duration,null);s.elapsed=5399;step(s,2);assert.equal(s.status,'running');assert.equal(s.elapsed,5401);});
test('construction does not progress without villagers physically building',()=>{
  const s=createMatch({players:[{},{}]}),p=s.players[0];rich(p);applyDecision(s,p,{actions:[{type:'build',building:'depot'}]});const b=p.buildings.at(-1),remaining=b.remaining;p.units=p.units.filter(u=>u.type==='scout');step(s,20);assert.equal(b.remaining,remaining);
});
test('prerequisite building levels and town upgrade gates are enforced',()=>{
  const s=createMatch({players:[{},{}]}),p=s.players[0];rich(p);const barracks=fixture(p,'barracks',1);let result=applyDecision(s,p,{actions:[{type:'build',building:'range'}]});assert.equal(result[0].ok,false);barracks.level=2;result=applyDecision(s,p,{actions:[{type:'build',building:'range'}]});assert.equal(result[0].ok,true);
  p.level=1;const stock=structuredClone(p.resources);assert.equal(applyDecision(s,p,{actions:[{type:'upgrade_town'}]})[0].ok,false);assert.deepEqual(p.resources,stock);assert.ok(constructionSeconds('barracks',3)>constructionSeconds('barracks',2));
});
test('staffed refinery consumes ore and timber to produce metal; soldiers cannot staff it',()=>{
  const s=createMatch({players:[{},{}]}),p=s.players[0];rich(p);const b=fixture(p,'refinery');p.resources.metal=0;for(const u of p.units){u.x=b.x;u.y=b.y;}const ore=p.resources.ore;step(s,2);assert.ok(p.resources.metal>0);assert.ok(p.resources.ore<ore);
  const metal=p.resources.metal;p.units=p.units.map(u=>({...u,type:'spearman'}));step(s,2);assert.equal(p.resources.metal,metal);
});
test('armies and scouts cross a bridge and reach the far river bank on a continental map',()=>{
  const s=createMatch({size:256,players:[{},{}]}),p=s.players[0],u=p.units.find(u=>u.type==='scout');u.x=118;u.y=148;u.goal={x:150,y:148};step(s,50);assert.ok(u.x>131,`scout stalled at ${u.x},${u.y}`);assert.equal(water(u.x,u.y,s),false);
});
test('invalid construction locations and unknown government names cannot spend or corrupt state',()=>{
  const s=createMatch({}),p=s.players[0];rich(p);build(s,p,'government');const before=structuredClone(p.resources);
  const r=applyDecision(s,p,{actions:[{type:'build',building:'farm',x:-1,y:-1},{type:'government',form:'__proto__'}]});assert.equal(r.every(x=>!x.ok),true);assert.deepEqual(p.resources,before);assert.equal(p.government,'monarchy');
});
test('squad orders preserve the main army directive',()=>{
  const s=createMatch({players:[{},{}]}),[p,q]=s.players;s.elapsed=300;p.units=Array.from({length:8},(_,i)=>({...p.units[0],id:'knight'+i,type:'knight'}));p.intel[home(q).id]={...home(q),owner:q.id};
  const result=applyDecision(s,p,{actions:[{type:'raid',squad:'cavalry',target:home(q).id}]});assert.equal(result[0].ok,true);assert.equal(p.stance,'defend');assert.equal(p.squadOrders.cavalry.stance,'raid');assert.equal(observation(s,p).self.squadOrders.cavalry.target,home(q).id);
});


test('epic map gives eight towns separate estates and three expansion rings',()=>{
  const s=createMatch({mapId:'frontier',players:Array.from({length:8},()=>({}))});
  assert.equal(s.size,512);
  for(const p of s.players){const h=home(p);assert.ok(h.x>38&&h.y>38&&h.x<474&&h.y<474);for(const q of s.players)if(q!==p)assert.ok(Math.hypot(h.x-home(q).x,h.y-home(q).y)>130);}
  assert.equal(s.nodes.filter(n=>n.zone==='frontier').length,8*3*4);
});


test('growing settlements reserve physical space for farms and military buildings',()=>{
  const s=createMatch({mapId:'frontier',players:[{},{}]});
  for(let t=0;t<900;t+=5){for(const p of s.players)if(p.nextDecision<=s.elapsed){applyDecision(s,p,demoPlan(s,p));p.nextDecision=s.elapsed+60;}step(s,5);}
  for(const p of s.players){
    for(const type of ['house','farm','barracks','forge'])assert.ok(p.buildings.some(b=>b.type===type),`Missing ${type}`);
    const bs=p.buildings.filter(b=>b.hp>0);
    for(let i=0;i<bs.length;i++)for(let j=i+1;j<bs.length;j++)assert.ok(dist(bs[i],bs[j])>=footprint(bs[i].type)+footprint(bs[j].type)+1.2-1e-6,`${bs[i].type} overlaps ${bs[j].type}`);
  }
});
