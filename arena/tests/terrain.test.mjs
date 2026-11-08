import test from 'node:test';
import assert from 'node:assert/strict';
import {createMatch,step,applyDecision,home,observation,departmentStatus} from '../src/engine.mjs';
import {findRoute,passable,moveOnTerrain,groundAt,groundGrid,biomeAt} from '../src/terrain.mjs';
import {BUILDINGS} from '../src/rules.mjs';
const small=()=>({id:crypto.randomUUID(),size:32,mapId:'frontier',seed:42,roads:[],landforms:[],nodes:[],players:[],navRevision:0});
const tree=(s,x,y,amount=10)=>s.nodes.push({id:`tree-${x}-${y}`,type:'wood',x:x+.5,y:y+.5,amount,max:amount});

test('forest walls block movement until a real tree is cut; large time steps cannot tunnel',()=>{
 const s=small();for(let y=1;y<31;y++)tree(s,15,y);const unit={x:5.5,y:15.5};
 assert.equal(findRoute(s,unit,{x:25.5,y:15.5}).length,0);moveOnTerrain(unit,{x:25.5,y:15.5},10,100,s);assert.equal(unit.x,5.5);
 s.nodes.find(n=>n.y===15.5).amount=0;s.navRevision++;
 const route=findRoute(s,unit,{x:25.5,y:15.5});assert.ok(route.length>0);assert.ok(route.every(p=>passable(s,p.x,p.y)));
 moveOnTerrain(unit,{x:25.5,y:15.5},10,100,s);assert.equal(unit.x,25.5);
});
test('diagonal corner cutting through two trees is rejected',()=>{
 const s=small();tree(s,11,10);tree(s,10,11);const route=findRoute(s,{x:10.5,y:10.5},{x:12.5,y:12.5});
 assert.ok(route.length>0);assert.notDeepEqual(route[0],{x:11.5,y:11.5});
});
test('legacy peaks become passable hills while hill movement stays slower',()=>{
 const s=small();s.landforms=[{x:16,y:16,rx:8,ry:8,height:5}];assert.equal(groundAt(s,16,16),2);assert.equal(passable(s,16,16),true);
 const route=findRoute(s,{x:3.5,y:16.5},{x:28.5,y:16.5});assert.ok(route.length);assert.ok(route.every(p=>groundAt(s,p.x,p.y)<3));
 const flat=small(),a={x:9.5,y:16.5},b={...a};moveOnTerrain(a,{x:11.5,y:16.5},1,1,s);moveOnTerrain(b,{x:11.5,y:16.5},1,1,flat);assert.ok(a.x<b.x);
});
test('gatherers remove finite timber, open its tile and credit only delivered wood',()=>{
 const s=createMatch({size:64,mapId:'frontier',players:[{},{}]}),p=s.players[0],h=home(p);p.units=[p.units[0]];p.units[0].x=h.x+4;p.units[0].y=h.y;p.weights={wood:1};
 const n={id:'cut-test',type:'wood',x:Math.floor(h.x+5)+.5,y:Math.floor(h.y)+.5,amount:1,max:1};s.nodes=[n];s.navRevision++;p.seen.push(Math.floor(n.y)*s.size+Math.floor(n.x));const initial=p.resources.wood;
 step(s,1);assert.equal(n.amount,0);assert.ok(passable(s,n.x,n.y));assert.equal(p.resources.wood,initial);step(s,10);assert.ok(p.resources.wood>initial);assert.equal(p.gathered.wood,1);
});
test('research pauses without real scholars and resumes when villagers staff the institution',()=>{
 const s=createMatch({size:64,mapId:'frontier',players:[{},{}]}),p=s.players[0],h=home(p);p.level=6;p.resources.wood=p.resources.ore=p.resources.coins=1000;
 p.buildings.push({id:'forge-test',type:'forge',x:h.x,y:h.y,level:1,hp:450,maxHp:450,remaining:0,total:0,queue:[]});
 assert.equal(applyDecision(s,p,{actions:[{type:'research',tech:'tools'}]})[0].ok,true);const remaining=p.research.remaining;
 const villagers=p.units.filter(u=>u.type==='worker');p.units=[];step(s,3);assert.equal(p.research.remaining,remaining);
 p.units=villagers;for(const u of p.units){u.x=h.x;u.y=h.y;}step(s,3);assert.ok(p.research.remaining<remaining);assert.ok(departmentStatus(p).find(d=>d.id==='research').active>0);
});
test('department allocation needs government, the institution and valid bounded staffing',()=>{
 const s=createMatch({size:64,mapId:'frontier',players:[{},{}]}),p=s.players[0],h=home(p);
 const action={type:'department',department:'treasury',staff:2};assert.equal(applyDecision(s,p,{actions:[action]})[0].ok,false);
 for(const type of ['government','treasury'])p.buildings.push({id:type,type,x:h.x,y:h.y,level:1,hp:500,maxHp:500,remaining:0,total:0,queue:[]});
 assert.equal(applyDecision(s,p,{actions:[action]})[0].ok,true);assert.equal(applyDecision(s,p,{actions:[{...action,staff:4}]})[0].ok,false);
 assert.equal(observation(s,p).self.departments.find(d=>d.id==='treasury').requested,2);
});

test('ruins require a present villager and pay out once',()=>{
 const s=createMatch({size:64,mapId:'frontier',players:[{},{}]}),p=s.players[0],h=home(p);const ruin={id:'known-ruin',x:h.x,y:h.y,stone:80,gold:40,claimedBy:null};s.ruins=[ruin];p.seen.push(Math.floor(h.y)*s.size+Math.floor(h.x));
 assert.equal(applyDecision(s,p,{actions:[{type:'salvage',id:ruin.id}]})[0].ok,true);const saved=p.units;p.units=[];step(s,10);assert.equal(p.salvage.remaining,30);
 p.units=[saved[0]];p.units[0].x=h.x;p.units[0].y=h.y;const before=p.resources.gold;step(s,31);assert.equal(ruin.claimedBy,p.id);assert.equal(p.resources.gold,before+40);assert.equal(applyDecision(s,p,{actions:[{type:'salvage',id:ruin.id}]})[0].ok,false);
});

test('new maps have desert regions, extensive forests and only local owned roads',()=>{
 const s=createMatch({size:256,mapId:'frontier',players:[{},{}]});
 assert.ok(s.nodes.filter(n=>n.zone==='forest').length>s.size*s.size*.08);
 const regions=new Set();for(let y=0;y<s.size;y+=8)for(let x=0;x<s.size;x+=8)regions.add(biomeAt(s,x,y));assert.ok(regions.has('grass'));assert.ok(regions.has('desert'));
 assert.ok([...groundGrid(s)].every(v=>v!==3));assert.ok(s.roads.length>0);assert.ok(s.roads.every(r=>r.owner&&s.players.some(p=>Math.hypot(r.x-home(p).x,r.y-home(p).y)<9)));
 const desert=createMatch({size:128,mapId:'desert',players:[{},{}]});assert.equal(desert.mapId,'desert');assert.ok(desert.nodes.some(n=>n.zone==='forest'));
});
